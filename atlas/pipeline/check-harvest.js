#!/usr/bin/env node
/* Harvest stability guard — did the new harvest keep every film the corpus has?
 *
 *   node pipeline/check-harvest.js                        # run immediately after harvest-sparql.js
 *   node pipeline/check-harvest.js --all                  # do not cap the printed lists
 *   node pipeline/check-harvest.js --allow-move earth=Q55188
 *   node pipeline/check-harvest.js <corpus.json> <harvest.json>
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * `sparql()` in harvest-sparql.js gives up after five attempts and returns
 * `null` (the `if (!retryable || n >= 4)` branch of its catch). `resolveTitles`
 * consumes that as `for (const r of rows || [])`. So a resolve chunk that fails
 * every retry does not throw, does not warn beyond one `  ! ` line on stderr,
 * and does not abort — it silently contributes zero films. `CHUNK` is 120,
 * which means ONE failed chunk can drop up to 120 seeds and still produce a
 * harvest.json that is complete, well-formed, and simply smaller than it
 * should be. There is no field in the file that records the difference.
 *
 * (Constructs are named rather than cited by line on purpose: those two lines
 * moved by 13 and 101 lines while this file was being written, and a comment
 * pointing at the wrong line is worse than one pointing at nothing.)
 *
 * The reason that is worth a dedicated script rather than a glance at the log
 * is what happens next. The loss is not merely invisible downstream — it is
 * laundered by every stage that follows:
 *
 *   - enrich.js carries measured palettes forward BY KEY. A key that is not in
 *     the harvest has nothing to carry forward into, so the film's measured
 *     colour is gone; if the film later returns it comes back with an era
 *     default. STATE.md already lists silent palette loss as a trap that has
 *     cost this project time.
 *   - merge-corpus.js drops any reading naming a film outside the spine. The
 *     hand-written argument disappears with a count, not a name.
 *   - validate-corpus.js cannot see it at all. A corpus of 2,080 films is
 *     exactly as valid as a corpus of 2,200. Schema passes, the graph is still
 *     one component, and the build is green.
 *
 * Three stages later you have a healthy-looking corpus that is quietly missing
 * films and readings, and no artefact left that remembers they were there. So
 * this check runs at the stage that caused the loss, against the one file that
 * still knows what used to exist: static/corpus.json.
 *
 * ── TWO QUESTIONS, DELIBERATELY SEPARATE ─────────────────────────────────────
 *
 *   PRESENCE — is the key still in the harvest?
 *   IDENTITY — does the key still name the same film?
 *
 * They are not the same failure and they do not have the same fix. A missing
 * key is a dropped chunk or a lost seed line. A key whose qid changed
 * underneath it is worse, because nothing looks wrong: the film count is
 * right, the build is green, and every hand-written reading attached to that
 * key now argues about a film it was not written about. That is an AGENTS rule
 * 8 failure — a reading wearing the authority of a record it no longer matches
 * — produced without anybody editing a reading.
 *
 * The identity half is not hypothetical. Two keys in the shipped corpus are
 * already the wrong film (`earth` holds a 1930 Macedonian film, not
 * Dovzhenko's; `the duel` holds Chang Cheh, not Spielberg's *Duel*), and the
 * fix for those is a deliberate qid override — which this guard will correctly
 * report as a move. See --allow-move below: an intended move is recorded, not
 * assumed.
 *
 * ── EXIT CODE IS THE CONTRACT ────────────────────────────────────────────────
 *
 *   0  every corpus film is present and still carries its own qid
 *   1  at least one film is missing, or changed identity under its key
 *   2  the check could not run at all (file unreadable, unparseable, or not
 *      shaped like a corpus/harvest). Distinct from 1 so "the guard found a
 *      problem" is never confused with "the guard never ran" — the second is
 *      the more dangerous state, because a guard that silently no-ops is worse
 *      than no guard.
 *
 * Deliberately NOT wired into `npm test`: it depends on pipeline/out/harvest.json,
 * which is generated, not committed. A test that cannot run on a fresh clone
 * either fails there or gets skipped, and a skipped guard is the failure mode
 * this file exists to prevent.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEFAULT_CORPUS = path.join(ROOT, "static", "corpus.json");
const DEFAULT_HARVEST = path.join(ROOT, "pipeline", "out", "harvest.json");

/* Capped because a catastrophic run — a whole failed resolve chunk, or a
   harvest pointed at the wrong seed file — would otherwise print one line per
   corpus film and push the verdict off the top of the terminal. The verdict is
   the thing that has to survive; the list is the diagnosis. 20 matches the
   error cap in validate-corpus.js, so the two checks read the same way. */
const MAX_LIST = 20;

function die(msg) {
  console.error("check-harvest: " + msg);
  process.exit(2);
}

function parseArgs(argv) {
  const files = [];
  /* key -> null (accept any destination) | "Q123" (accept only that one) */
  const allow = new Map();
  let all = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") { all = true; continue; }
    if (a === "--allow-move") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) {
        die("--allow-move needs a value, e.g. --allow-move earth=Q55188");
      }
      const eq = v.indexOf("=");
      if (eq > -1) allow.set(v.slice(0, eq).trim(), v.slice(eq + 1).trim());
      else allow.set(v.trim(), null);
      continue;
    }
    if (a.startsWith("-")) {
      die("unknown flag " + a + "\n  usage: node pipeline/check-harvest.js " +
        "[--all] [--allow-move key[=QID]] [corpus.json] [harvest.json]");
    }
    files.push(a);
  }
  if (files.length > 2) die("expected at most two file arguments, got " + files.length);
  return { allow: allow, all: all, corpus: files[0] || DEFAULT_CORPUS, harvest: files[1] || DEFAULT_HARVEST };
}

function loadFilms(label, file, hint) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    die("cannot read " + label + " at " + file + "\n  " + e.message + (hint ? "\n  " + hint : ""));
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    /* A truncated write looks exactly like this. Say which file, because the
       operator is about to blame the wrong stage. */
    die(label + " at " + file + " is not valid JSON — a truncated or partially " +
      "written file looks like this.\n  " + e.message);
  }
  const films = doc && doc.films;
  if (!films || typeof films !== "object" || Array.isArray(films)) {
    die(label + " at " + file + " has no `films` object. Is this the right file?");
  }
  return films;
}

/* "Earth" (1930, Peter Stojchev) — enough for a human to recognise the film
   without looking it up. The key alone is not: half the point of this check is
   catching a key that no longer means what its name suggests. */
function describe(f) {
  if (!f) return "(no record)";
  const bits = [];
  if (f.year) bits.push(String(f.year));
  if (f.director) bits.push(f.director);
  return '"' + (f.title || f.label || "?") + '"' + (bits.length ? " (" + bits.join(", ") + ")" : "");
}

function section(heading, rows, all) {
  console.log("\n" + heading + ":");
  const show = all ? rows : rows.slice(0, MAX_LIST);
  for (const r of show) console.log("  - " + r);
  if (rows.length > show.length) {
    console.log("  ... and " + (rows.length - show.length) +
      " more (re-run with --all to list every one)");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpusFilms = loadFilms("corpus", args.corpus,
    "This is the shipped corpus — run from the atlas/ directory, or pass the path.");
  const harvestFilms = loadFilms("harvest", args.harvest,
    "Run pipeline/harvest-sparql.js first; this check compares its output against the corpus.");

  const total = Object.keys(corpusFilms).length;
  console.log("check-harvest  corpus " + total + " films (" + args.corpus + ")" +
    "  vs  harvest " + Object.keys(harvestFilms).length + " films (" + args.harvest + ")");

  /* qid -> harvest keys. A film that vanished from its own key but is present
     under another one is a KEY problem (slug collision, disambiguation
     rename), not a lost chunk. Same symptom downstream — the readings and the
     palette are still lost, because everything downstream joins on the key —
     but a completely different cause and fix, and the operator should not have
     to go find that out by hand. */
  const byQid = new Map();
  for (const [k, f] of Object.entries(harvestFilms)) {
    if (!f || !f.qid) continue;
    if (!byQid.has(f.qid)) byQid.set(f.qid, []);
    byQid.get(f.qid).push(k);
  }

  /* Second index, for the case the qid index cannot see: harvest keys are
     slugged from the PICKED item's Wikidata label, not from the seed line, so
     re-resolving a seed to a different item can move BOTH the qid and the key
     at once. `the duel` is the live example — the seed reads "Duel (1971)",
     today's pick is labelled "The Duel", and a corrected pick labelled "Duel"
     lands on key `duel` instead. Neither the key nor the qid then matches, and
     without this the film reads as simply gone.

     Matching on normalised-title AND exact year keeps it tight enough to be
     worth printing. It is deliberately reported as a neighbouring record, not
     as the same film — in the `the duel` case the two really ARE different
     films — so the director is printed and the operator judges. */
  const norm = (t) => String(t || "").toLowerCase()
    .replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "");
  const byTitleYear = new Map();
  for (const [k, f] of Object.entries(harvestFilms)) {
    if (!f || !f.title || !f.year) continue;
    const tk = norm(f.title) + "|" + f.year;
    if (!byTitleYear.has(tk)) byTitleYear.set(tk, []);
    byTitleYear.get(tk).push(k);
  }

  const missing = [], moved = [], accepted = [], unchecked = [];
  let rekeyed = 0;

  for (const key of Object.keys(corpusFilms).sort()) {
    const f = corpusFilms[key];
    const h = harvestFilms[key];

    if (!h) {
      const elsewhere = f && f.qid ? (byQid.get(f.qid) || []).filter((k) => k !== key) : [];
      let where;
      if (elsewhere.length) {
        rekeyed++;
        where = "  -- same qid, still in the harvest under key " +
          elsewhere.slice(0, 2).map((k) => '"' + k + '"').join(" / ") +
          (elsewhere.length > 2 ? " (+" + (elsewhere.length - 2) + " more)" : "");
      } else {
        const near = f ? (byTitleYear.get(norm(f.title) + "|" + f.year) || []).filter((k) => k !== key) : [];
        where = near.length
          ? "  -- absent; but key \"" + near[0] + "\" holds a same-title/year record: " +
            describe(harvestFilms[near[0]]) + " -- check whether that is this film re-keyed"
          : "  -- absent from the harvest entirely";
      }
      missing.push(key + "  " + describe(f) + "  " + (f.qid || "(no qid)") + where);
      continue;
    }

    /* No qid on the corpus side means identity is unverifiable for this film,
       not that it passed. Reported separately so a corpus that drifts into
       qid-less records degrades loudly rather than turning the identity half
       of this guard into a no-op. All 803 films carry one today. */
    if (!f || !f.qid) { unchecked.push(key + "  " + describe(f) + "  -- no qid in the corpus"); continue; }
    if (h.qid === f.qid) continue;

    const line = key + "  " + describe(f) + "  " + f.qid + " -> " +
      (h.qid ? h.qid + "  now " + describe(h)
             : "(none)  -- the harvest record carries no qid, so this film's identity cannot be confirmed");

    /* A destination of "no qid at all" is never something anyone intends, so
       --allow-move cannot wave it through however it was spelled. */
    if (h.qid && args.allow.has(key)) {
      const want = args.allow.get(key);
      if (want === null || want === h.qid) { accepted.push(line); continue; }
      moved.push(line + "  [--allow-move expected " + want + "]");
      continue;
    }
    moved.push(line);
  }

  const present = total - missing.length;

  if (missing.length) section("MISSING FROM THE HARVEST (" + missing.length + " of " + total + ")", missing, args.all);
  if (moved.length) section("QID MOVED UNDER AN EXISTING KEY (" + moved.length + ")", moved, args.all);
  if (accepted.length) section("qid moved, accepted by --allow-move (" + accepted.length + ")", accepted, args.all);
  if (unchecked.length) section("identity not checked (" + unchecked.length + ")", unchecked, args.all);

  console.log("");
  if (missing.length || moved.length) {
    console.log("FAIL  corpus films present: " + present + "/" + total +
      ", qid moved: " + moved.length);
    if (missing.length) {
      console.log("      A missing film loses its measured palette, and merge-corpus.js will drop");
      console.log("      every authored reading that names it -- everything downstream joins on the key.");
    }
    /* Two different causes hide behind one symptom, and they have opposite
       fixes: a film that is simply gone means a chunk failed and the harvest
       should be re-run, while a film that reappeared under another key means
       the harvest worked and the KEYING changed. Telling an operator to re-run
       the harvest for a rename sends them to do ten minutes of network for a
       result that will come back identical. */
    if (missing.length > rekeyed) {
      console.log("      If a film is genuinely gone: check the harvest log for '  ! ' lines -- a resolve");
      console.log("      chunk that fails all 5 attempts drops up to 120 seeds with no error -- then re-run");
      console.log("      the harvest. The SPARQL cache makes the re-run cheap.");
    }
    if (rekeyed) {
      console.log("      Still in the harvest under a different key: " + rekeyed + ". That is a KEYING change,");
      console.log("      not a lost film, and re-running the harvest will reproduce it exactly.");
      console.log("      Fix the disambiguation so the existing corpus key wins, or the corpus loses the");
      console.log("      film anyway: readings and palettes are matched by key, not by qid.");
    }
    if (moved.length) {
      console.log("      A moved qid means the key now names a DIFFERENT FILM, so every hand-written");
      console.log("      reading on it now argues about a film it was not written about (AGENTS rule 8).");
      console.log("      If the move is intended -- a deliberate seed or qid-override correction --");
      console.log("      re-run with --allow-move <key>=<new qid> so the acceptance is recorded.");
    }
    console.log("      Do not run enrich.js until this is resolved: it is 29 minutes of network");
    console.log("      spent on a harvest that is already wrong.");
    process.exit(1);
  }

  console.log("OK  corpus films present: " + present + "/" + total + ", qid moved: 0" +
    (accepted.length ? "  (" + accepted.length + " accepted by --allow-move, listed above)" : ""));
}

main();
