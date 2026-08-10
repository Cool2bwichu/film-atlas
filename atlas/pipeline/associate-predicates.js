#!/usr/bin/env node
/**
 * associate-predicates.js — turn shared relational predicates into typed edges.
 *
 * WHY THIS EXISTS
 * The fingerprint places a film in a 5-D temperature space and finds its
 * nearest neighbours by distance. That works for "films that feel similarly
 * cold", and it is measurably the wrong instrument for "films about the same
 * thing happening between two people": run `--contrast` and watch it rank
 * Ex Machina as Banshees' closest film in the corpus.
 *
 * A predicate is a shared OBJECT, so films match by co-occurrence. Two films
 * can sit at opposite ends of the temperature space and still land on the same
 * predicament.
 *
 * === ORDER OF OPERATIONS — ENFORCED, NOT DOCUMENTED ===
 *
 *   1. the predicate SELECTS the family        (co-occurrence — hard filter)
 *   2. the fingerprint ORDERS it               (tonal distance — sort only)
 *
 * The prototype stated this rule in a comment and then computed strength eight
 * lines away from the tonal table. Three mechanisms now enforce it instead:
 *
 *   (a) STRENGTH LIVES IN ANOTHER FILE. `pipeline/predicate-strength.js`
 *       requires nothing and never sees a fingerprint. Letting distance into
 *       strength now costs a new require, a new parameter and a signature
 *       change — all visible in a diff — and the module rejects any input
 *       object carrying a tonal-looking key.
 *   (b) THE FIELD IS NON-WRITABLE. Phase 1 defines `strength` with
 *       `writable: false` before phase 2 has computed a single distance, so the
 *       ordering phase throws if it tries to adjust a score it is sorting.
 *   (c) A NEGATIVE CONTROL RUNS ON EVERY INVOCATION. The selftest rebuilds the
 *       whole graph against a SCRAMBLED fingerprint table and asserts every
 *       strength is bit-identical. If tonal information reaches strength by any
 *       path — here, in the scorer, in the claim builder — the run aborts.
 *       Each mechanism has its own negative control that has been watched
 *       firing — --prove-scorer-guard, --prove-nonwritable, --prove-leak — per
 *       AGENTS: a check you have not seen fail is not a check.
 *
 * === RARITY: surprise(), NOT idf ===
 *
 * Strength routes through the same scale-free Poisson tail `associate.js` uses
 * for TMDB keywords, computed in predicate-strength.js. A raw idf re-tunes
 * silently as the corpus grows; the tail does not, because its expectation is
 * computed from the same population it is scoring. `--compare-idf` prints what
 * changed and `--scale-check` prints how much each measure drifts when the
 * population is halved.
 *
 * === WHAT THE POPULATION IS, AND WHAT IT IS NOT ===
 *
 * Prevalence is counted over the 300-film Pass C cohort in
 * `pipeline/out/predicate-tags.json`. That cohort is a STRATIFIED sample of the
 * corpus (predicate-cohort-300.js balances region, era, fame, era x region and
 * tradition against the corpus's own shares), not a themed set, so counting on
 * it is not the rarity trap the proposal records — that trap was an 8-film
 * population *assembled around* one predicament. It is still not a corpus
 * prevalence, and this file never calls it one:
 *   - 300 of 2,204 films are tagged; the other 1,904 are unmeasured;
 *   - the cohort is 100% above plot-source.js's 1,500-char evidence floor, and
 *     657 corpus films (29.8%) are below it and can never be tagged at all, so
 *     even a completed pass measures the READABLE corpus;
 *   - the vocabulary was mined from these same 300 films, so a count here is a
 *     count on the population the categories were induced from.
 * Films supplied with `--extra` are scored against that table and never vote in
 * it. A benchmark set chosen because of the situation being measured is exactly
 * the population a rarity estimate must not come from.
 *
 * RUN
 *   node pipeline/associate-predicates.js
 *   node pipeline/associate-predicates.js --extra pipeline/out/predicate-tags-benchmark.json
 *   node pipeline/associate-predicates.js --film "Old Joy" --contrast
 *   node pipeline/associate-predicates.js --compare-idf --scale-check
 *   node pipeline/associate-predicates.js --prove-leak        # shows the control firing
 *   node pipeline/associate-predicates.js --out pipeline/out/predicate-edges.json
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { scoreFamily, assertLeverageOrder } = require("./predicate-strength.js");

const ROOT = path.resolve(__dirname, "..");
const AXES = ["dread", "cruelty", "irony", "ambiguity", "fracture"];

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = argv.indexOf(name);
  return i === -1 ? dflt : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true);
};
const has = (n) => argv.includes(n);
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

const TAGS_FILE = typeof flag("--tags") === "string" ? flag("--tags") : "pipeline/out/predicate-tags.json";
const EXTRA_FILE = typeof flag("--extra") === "string" ? flag("--extra") : null;

const tagFile = read(TAGS_FILE);
const vocabFile = read(tagFile.vocabularyFile || "pipeline/out/predicates-frozen.json");
const fingerprints = read("static/fingerprints.json");
const corpus = read("static/corpus.json");

const VOCAB = new Map(vocabFile.predicates.map((p) => [p.id, p]));
const BAND = [0.004, 0.08];

/* ---------- resolve titles against the real corpus ---------- */

const byTitle = new Map();
for (const [key, film] of Object.entries(corpus.films)) byTitle.set(film.title, { key, ...film });

/* ---------- load tags ---------- */

const tags = new Map();          // title -> [tag]
const population = new Set();    // titles whose tags are allowed to set prevalence
const missing = [];

function ingest(rows, votesOnPrevalence) {
  for (const row of rows) {
    const title = row.title || row.film;
    if (!byTitle.has(title)) { missing.push(title); continue; }
    if (tags.has(title)) continue;
    tags.set(title, (row.tags || []).filter((t) => VOCAB.has(t.predicate)));
    if (votesOnPrevalence) population.add(title);
  }
}
ingest(tagFile.films.slice(0, tagFile.cohortFilms == null ? tagFile.films.length : tagFile.cohortFilms), true);
let extraTitles = [];
if (EXTRA_FILE) {
  const ex = read(EXTRA_FILE);
  const before = tags.size;
  ingest(ex.films, false);
  extraTitles = ex.films.map((f) => f.title || f.film).filter((t) => tags.has(t) && !population.has(t));
  if (tags.size === before) console.warn("  ! --extra added no new films");
}

/* ---------- prevalence: counts from the real pass, replacing estPrevalence ---------- */

const N_POP = population.size;
const counts = new Map();
for (const title of population) {
  for (const id of new Set(tags.get(title).map((t) => t.predicate))) counts.set(id, (counts.get(id) || 0) + 1);
}

/* The old prototype's rarity term, kept ONLY so --compare-idf can show what
   routing through surprise() changed. It is wired into no strength. */
const legacyIdf = (pid, n) => {
  const N = n == null ? N_POP : n;
  const c = counts.get(pid) || 1;
  return Math.min(1, Math.log((N + 1) / c) / Math.log(N + 1));
};

const OUTCOME_KIND = { restored: "held", transfigured: "held", unrestored: "broken", fatal: "broken", ambiguous: "open" };

/* ==========================================================================
   PHASE 1 — SELECT AND SCORE.
   The predicate is the hard filter. Nothing in this function reads a
   fingerprint, and the scorer it calls cannot: predicate-strength.js requires
   nothing. `strength` is defined non-writable here, before phase 2 exists.
   ========================================================================== */

/* Set only by --prove-leak. It makes phase 1 reach for the tonal table exactly
   the way a well-meaning "the tonally close ones should rank higher" edit would
   — the one path mechanisms (a) and (b) cannot block, because an author who has
   already decided to do it writes it here rather than fighting a frozen field.
   Catching THAT is what the selftest is for. */
let LEAK = null;

function selectAndScore() {
  const edges = [];
  const titles = [...tags.keys()];
  const predsOf = new Map(titles.map((t) => [t, tags.get(t).map((x) => x.predicate)]));

  for (let i = 0; i < titles.length; i++) {
    const aTags = tags.get(titles[i]);
    if (!aTags.length) continue;
    for (let j = i + 1; j < titles.length; j++) {
      const A = titles[i], B = titles[j];
      const bByPred = new Map(tags.get(B).map((t) => [t.predicate, t]));
      const shared = [];
      for (const ta of aTags) {
        const tb = bByPred.get(ta.predicate);
        if (tb) shared.push({ predicate: ta.predicate, aTag: ta, bTag: tb });
      }
      if (!shared.length) continue;

      const score = scoreFamily(
        { aPredicates: predsOf.get(A), bPredicates: predsOf.get(B), shared },
        counts, N_POP
      );

      const lead = score.lead;
      const pred = VOCAB.get(lead.predicate);
      const kindA = OUTCOME_KIND[lead.aTag.outcome], kindB = OUTCOME_KIND[lead.bTag.outcome];
      const type = (kindA !== kindB && kindA !== "open" && kindB !== "open") ? "rebuttal" : "rhyme";

      const claim = type === "rebuttal"
        ? "Both turn on " + lower(pred.label) + ", and they disagree about it. " + lead.aTag.basis + " " + lead.bTag.basis
        : "Both turn on " + lower(pred.label) + ". " + lead.aTag.basis + " " + lead.bTag.basis;

      const e = {
        a: byTitle.get(A).key, b: byTitle.get(B).key,
        aTitle: A, bTitle: B,
        type: type, signal: "predicate",
        predicate: lead.predicate,
        axis: pred.sourceAxis || pred.axis || "other",
        surprise: score.surprise,
        lambda: score.lambda,
        centrality: score.centrality,
        complementary: score.complementary,
        confidence: 0.55,
        source: "reading",
        claim: claim,
        shared: shared.length,
        alsoShares: shared.filter((s) => s.predicate !== lead.predicate).map((s) => s.predicate),
        populationCount: counts.get(lead.predicate) || 0,
        /* filled in by PHASE 2. Declared here as null so the shape is stable and
           so it is plain that no value existed while strength was computed. */
        tonalDistance: null,
      };
      let strength = score.strength;
      if (LEAK) {
        const va = LEAK.get(A), vb = LEAK.get(B);
        strength = +(strength * (1 - (va && vb ? dist(va, vb) : 100) / 250)).toFixed(4);
      }
      /* (b) — the ordering phase cannot adjust what it is sorting. */
      Object.defineProperty(e, "strength", { value: strength, writable: false, enumerable: true });
      edges.push(e);
    }
  }
  return edges;
}

/* ==========================================================================
   PHASE 2 — ORDER.
   Tonal distance enters the program here for the first time, and only here.
   It sorts and it tiebreaks. It does not score: `strength` is already frozen.
   ========================================================================== */

function tonalTable(source) {
  const m = new Map();
  for (const f of Object.values(source.films)) {
    if (!f.axes) continue;
    const v = AXES.map((a) => (f.axes[a] || {}).score);
    if (v.some((x) => x == null)) continue;
    m.set(f.title, v);
  }
  return m;
}
const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) * (x - b[i]), 0));

function orderByFingerprint(edges, tonal) {
  for (const e of edges) {
    const va = tonal.get(e.aTitle), vb = tonal.get(e.bTitle);
    e.tonalDistance = va && vb ? +dist(va, vb).toFixed(1) : null;
  }
  /* strength first, ALWAYS. Tonal distance only separates equal strengths. */
  edges.sort((x, y) => y.strength - x.strength ||
    (x.tonalDistance == null ? 999 : x.tonalDistance) - (y.tonalDistance == null ? 999 : y.tonalDistance));
  return edges;
}

function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

/* ==========================================================================
   (c) THE NEGATIVE CONTROL.
   Rebuild the graph against a scrambled fingerprint table. Every strength must
   be bit-identical. This is the check that would have caught the prototype's
   comment turning into a lie.
   ========================================================================== */

function scrambledFingerprints() {
  let s = 20260810;                                     // deterministic LCG
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out = { films: {} };
  for (const [k, f] of Object.entries(fingerprints.films)) {
    out.films[k] = Object.assign({}, f, {
      axes: Object.fromEntries(AXES.map((a) => [a, { score: Math.round(rnd() * 100) }])),
    });
  }
  return out;
}

function selftest(realEdges) {
  const control = orderByFingerprint(selectAndScore(), tonalTable(scrambledFingerprints()));
  const key = (e) => e.aTitle + "\u001f" + e.bTitle;
  const realBy = new Map(realEdges.map((e) => [key(e), e]));
  let checked = 0, moved = 0, first = null;
  for (const c of control) {
    const r = realBy.get(key(c));
    if (!r) continue;
    checked++;
    if (r.strength !== c.strength) { moved++; if (!first) first = c.aTitle + " / " + c.bTitle + ": " + r.strength + " vs " + c.strength; }
  }
  return {
    checked: checked, moved: moved, first: first,
    controlEdges: control.length,
    distinctTonalValues: new Set(realEdges.map((e) => e.tonalDistance)).size,
  };
}

/* ---------- build ---------- */

/* ---- the three negative controls, each aimed at one mechanism ----
   AGENTS: "prove it can fail: break the thing deliberately, confirm the probe
   reports it, then fix it again." A guard nobody has watched fire is decoration.

     --prove-scorer-guard   (a) hand predicate-strength.js a tonal field
     --prove-nonwritable    (b) try to adjust a strength during the sort
     --prove-leak           (c) fold tonal proximity in during phase 1 itself
*/
const PROVE = has("--prove-scorer-guard") || has("--prove-nonwritable") || has("--prove-leak");

if (has("--prove-scorer-guard")) {
  console.log("\n  !! --prove-scorer-guard: passing a tonal field into scoreFamily().");
  try {
    scoreFamily({ aPredicates: ["x"], bPredicates: ["x"], tonalDistance: 12,
      shared: [{ predicate: "x", aTag: { centrality: 1, role: "a", outcome: "fatal", basis: "" },
                                  bTag: { centrality: 1, role: "b", outcome: "fatal", basis: "" } }] }, new Map(), 1);
    console.log("     CONTROL DID NOT FIRE — mechanism (a) is broken.");
    process.exit(4);
  } catch (err) {
    console.log("     CONTROL FIRED: " + err.message);
    process.exit(0);
  }
}

if (has("--prove-leak")) {
  console.log("\n  !! --prove-leak: phase 1 was made to fold tonal proximity into strength.");
  LEAK = tonalTable(fingerprints);
}

let edges = selectAndScore();
LEAK = null;   // the control is one build deep; the selftest rebuild must be clean

edges = orderByFingerprint(edges, tonalTable(fingerprints));

if (has("--prove-nonwritable")) {
  console.log("\n  !! --prove-nonwritable: the ordering phase will now try to adjust a strength.");
  try {
    edges[0].strength = 0.99;
    console.log("     value after assignment: " + edges[0].strength +
      (edges[0].strength === 0.99 ? "  — CONTROL DID NOT FIRE, mechanism (b) is broken." : "  — CONTROL FIRED: the write was refused."));
    process.exit(edges[0].strength === 0.99 ? 4 : 0);
  } catch (err) {
    console.log("     CONTROL FIRED: " + err.message);
    process.exit(0);
  }
}

const st = has("--no-selftest") ? null : selftest(edges);

/* ---------- report ---------- */

const line = (c) => console.log((c || "-").repeat(78));
const focus = typeof flag("--film") === "string" ? flag("--film") : "The Banshees of Inisherin";

console.log("");
line("=");
console.log("  PREDICATE LAYER — " + tags.size + " tagged films, " + edges.length + " edges");
console.log("  vocabulary " + vocabFile.version + " (" + VOCAB.size + " predicates, frozen)");
console.log("  prevalence population: " + N_POP + " films" +
  (extraTitles.length ? "; " + extraTitles.length + " --extra films scored against it, voting in nothing: " + extraTitles.join(", ") : ""));
if (missing.length) console.log("  not in corpus, skipped: " + missing.slice(0, 8).join(", ") + (missing.length > 8 ? " (+" + (missing.length - 8) + ")" : ""));
line("=");

const LEV = assertLeverageOrder();   // throws if a modifier out-levers the measurement

if (st) {
  const ok = st.moved === 0;
  console.log("\nSELFTEST — order of operations");
  console.log("  rebuilt " + st.controlEdges + " edges against a SCRAMBLED fingerprint table");
  console.log("  " + st.checked + " strengths compared, " + st.moved + " moved  ->  " +
    (ok ? "PASS — tonal distance does not reach strength" : "FAIL — tonal distance is in the strength score"));
  if (!ok) console.log("  first divergence: " + st.first);
  console.log("  (the control is live: the real run carries " + st.distinctTonalValues +
    " distinct tonal distances, so the scramble is a real perturbation)");
  console.log("  leverage — surprise " + LEV.surprise.toFixed(2) + "x, centrality " +
    LEV.centrality.toFixed(2) + "x, role " + LEV.role.toFixed(2) +
    "x  ->  PASS, no modifier out-levers the measurement");
  /* No PROVE exemption. --prove-leak must take the real abort path, or the
     control demonstrates the message and not the consequence. */
  if (!ok) { console.error("\n  aborting: the layer has been rebuilt as the thing it exists to replace.\n"); process.exit(3); }
}

/* prevalence, honestly labelled */
const overBand = [...counts.entries()].filter((kv) => kv[1] / N_POP > BAND[1]).sort((a, b) => b[1] - a[1]);
console.log("\nPREVALENCE — counted over " + N_POP + " tagged films, NOT over 2,204");
console.log("  " + counts.size + "/" + VOCAB.size + " predicates fired; band " + (BAND[0] * 100) + "%-" + (BAND[1] * 100) +
  "% is RECORDED, not cut (the cut belongs after full-corpus tagging)");
console.log("  above the band: " + overBand.length + "  " +
  overBand.map((kv) => kv[0] + " " + (100 * kv[1] / N_POP).toFixed(1) + "%").join(", "));

/* ---- REALISED leverage, not just the band's theoretical range ----
   assertLeverageOrder() compares the widths the constants ALLOW. That is a
   necessary check and not a sufficient one: if the observed surprises only ever
   use the bottom of the band, the measurement's real lever is far smaller than
   its nominal one and a modifier can still decide the ranking. Measure it on
   the edges that actually exist and print it either way. */
{
  const sv = edges.map((e) => e.surprise).sort((a, b) => a - b);
  const cv = edges.map((e) => e.centrality).sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const { BASE, RANGE, S_CAP, C_FLOOR } = require("./predicate-strength.js");
  const band = (s) => BASE + Math.min(1, s / S_CAP) * RANGE;
  const cf = (c) => C_FLOOR + (1 - C_FLOOR) * c;
  const realisedSurprise = band(q(sv, 0.99)) / band(q(sv, 0.01));
  const realisedCentrality = cf(q(cv, 0.99)) / cf(q(cv, 0.01));
  console.log("\nLEVERAGE, REALISED ON THESE " + edges.length + " EDGES (p1..p99)");
  console.log("  surprise   " + q(sv, 0.01).toFixed(2) + ".." + q(sv, 0.99).toFixed(2) +
    "  ->  strength " + band(q(sv, 0.01)).toFixed(3) + ".." + band(q(sv, 0.99)).toFixed(3) +
    "  = " + realisedSurprise.toFixed(2) + "x");
  console.log("  centrality " + q(cv, 0.01).toFixed(2) + ".." + q(cv, 0.99).toFixed(2) +
    "  ->  factor   " + cf(q(cv, 0.01)).toFixed(3) + ".." + cf(q(cv, 0.99)).toFixed(3) +
    "  = " + realisedCentrality.toFixed(2) + "x");
  console.log("  max surprise seen " + q(sv, 1).toFixed(2) + " against S_CAP " + S_CAP +
    " — the band above " + q(sv, 1).toFixed(2) + " is never reached");
  console.log("  " + (realisedSurprise >= realisedCentrality
    ? "PASS — the measurement out-levers the modifier on the real data"
    : "DEFECT — centrality still out-levers surprise on the real data by " +
      (realisedCentrality / realisedSurprise).toFixed(2) + "x. S_CAP is inherited from " +
      "associate.js's keyword edge and is NOT calibrated to the predicate surprise range. " +
      "Recalibrating it changes which films rank top, so it is a deliberate scoring " +
      "decision to be measured on sampled maps, not a side effect of this change."));
}

/* pair density — can the predicate alone cut a top six? */
const nT = tags.size;
const pairs = nT * (nT - 1) / 2;
const multi = edges.filter((e) => e.shared >= 2).length;
console.log("\nDENSITY — " + edges.length + "/" + pairs + " pairs (" + (100 * edges.length / pairs).toFixed(1) +
  "%) share at least one predicate; " + multi + " share two or more");

/* the map */
const mine = edges.filter((e) => e.aTitle === focus || e.bTitle === focus);
const rankOf = new Map(mine.map((e, i) => [e.aTitle === focus ? e.bTitle : e.aTitle, i + 1]));

console.log("\n\nMAP FOR: " + focus);
if (!tags.has(focus)) console.log("  !! " + focus + " carries no tags in " + TAGS_FILE + (EXTRA_FILE ? " or " + EXTRA_FILE : ""));
console.log("  its predicates: " + (tags.get(focus) || []).map((t) => t.predicate + " (c" + t.centrality + ", " + t.outcome + ")").join(", "));
console.log("  " + mine.length + " films share at least one predicate with it");
line();
const SHOW = parseInt(flag("--show", "12"), 10);
mine.slice(0, isNaN(SHOW) ? 12 : SHOW).forEach((e, i) => {
  const other = e.aTitle === focus ? e.bTitle : e.aTitle;
  console.log("\n " + String(i + 1).padStart(2) + ". " + other);
  console.log("     " + e.type.toUpperCase() + " - via " + e.predicate + " - axis:" + e.axis);
  console.log("     strength " + e.strength.toFixed(3) + "  surprise " + e.surprise.toFixed(2) +
    " (lambda " + e.lambda + ")  centrality " + e.centrality + "  shares " + e.shared +
    (e.complementary ? "  complementary roles" : ""));
  console.log("     predicate held by " + e.populationCount + "/" + N_POP + " of the tagged population");
  console.log("     tonal distance " + (e.tonalDistance == null ? "n/a" : e.tonalDistance) +
    (e.tonalDistance > 60 ? "   <- the fingerprint would never have found this" : ""));
  console.log(wrap('     "' + e.claim + '"', 76));
});

/* where the proposal's benchmark films land */
const BENCH = ["Old Joy", "Y tu mamá también", "Ex Machina"];
const tonalNow = tonalTable(fingerprints);
console.log("\n\nBENCHMARK — where the films the proposal names land on " + focus + "'s predicate map");
line();
const focusPreds = new Set((tags.get(focus) || []).map((t) => t.predicate));
for (const b of BENCH) {
  if (!tags.has(b)) { console.log("  " + b.padEnd(24) + " not tagged"); continue; }
  const r = rankOf.get(b);
  const va = tonalNow.get(focus), vb = tonalNow.get(b);
  const td = va && vb ? dist(va, vb).toFixed(1) : "n/a";
  const overlap = tags.get(b).map((t) => t.predicate).filter((p) => focusPreds.has(p));
  console.log("  " + b.padEnd(24) + (r ? "#" + r + " of " + mine.length : "ABSENT — shares no predicate") + "   tonal distance " + td);
  console.log("  " + "".padEnd(24) + "its predicates: " + (tags.get(b).map((t) => t.predicate).join(", ") || "(none)"));
  console.log("  " + "".padEnd(24) + "overlap with " + focus + ": " + (overlap.length ? overlap.join(", ") : "none"));
}

/* what the map would look like if the 0.4-8% band cut had been applied.
   A DIAGNOSTIC, not a cut: the frozen file puts the cut after full-corpus
   tagging, and these are 300-film shares, not corpus prevalence. */
if (has("--band-preview")) {
  const over = new Set([...counts.keys()].filter((id) => counts.get(id) / N_POP > BAND[1]));
  const kept = mine.filter((e) => !over.has(e.predicate));
  console.log("\n\nBAND PREVIEW — " + focus + "'s map with the " + over.size +
    " over-band predicates suppressed (DIAGNOSTIC, nothing was cut)");
  line();
  console.log("  suppressed: " + [...over].join(", "));
  console.log("  map goes from " + mine.length + " films to " + kept.length);
  kept.slice(0, 10).forEach((e, i) => {
    const other = e.aTitle === focus ? e.bTitle : e.aTitle;
    console.log("  " + String(i + 1).padStart(2) + ". " + other.padEnd(34) +
      " via " + e.predicate.padEnd(32) + " " + e.populationCount + "/" + N_POP +
      "  strength " + e.strength.toFixed(3) + "  tonal " + e.tonalDistance);
  });
}

/* what changed by routing through surprise() */
if (has("--compare-idf")) {
  const scoreLegacy = (e) => Math.min(0.95, legacyIdf(e.predicate) * e.centrality * (e.complementary ? 1.15 : 1.0));
  const mineNow = mine.map((e) => (e.aTitle === focus ? e.bTitle : e.aTitle));
  const mineLegacy = mine.slice().sort((a, b) => scoreLegacy(b) - scoreLegacy(a))
    .map((e) => (e.aTitle === focus ? e.bTitle : e.aTitle));
  let moved = 0;
  mineNow.forEach((t, i) => { if (mineLegacy[i] !== t) moved++; });
  const churn = (k) => {
    const A = new Set(mineNow.slice(0, k)), B = new Set(mineLegacy.slice(0, k));
    return [...A].filter((x) => !B.has(x)).length;
  };
  /* corpus-wide, not just the focus map */
  let allMoved = 0;
  const nowAll = edges.slice().sort((a, b) => b.strength - a.strength);
  const legAll = edges.slice().sort((a, b) => scoreLegacy(b) - scoreLegacy(a));
  for (let i = 0; i < nowAll.length; i++) if (nowAll[i] !== legAll[i]) allMoved++;
  console.log("\n\nWHAT ROUTING THROUGH surprise() CHANGED");
  line();
  console.log("  on " + focus + "'s map: " + moved + "/" + mineNow.length + " positions changed; top-6 members " +
    churn(6) + "/6 different, top-12 " + churn(12) + "/12");
  console.log("  legacy idf top 6:   " + mineLegacy.slice(0, 6).join(" | "));
  console.log("  surprise  top 6:    " + mineNow.slice(0, 6).join(" | "));
  console.log("  across all " + edges.length + " edges: " + allMoved + " changed rank position (" +
    (100 * allMoved / edges.length).toFixed(1) + "%)");
}

/* how much each measure moves when the population halves — the reason for the change */
if (has("--scale-check")) {
  const { expectedOverlap, poissonTailLog10 } = require("./predicate-strength.js");
  const half = [...population].filter((_, i) => i % 2 === 0);
  const halfCounts = new Map();
  for (const t of half) for (const id of new Set(tags.get(t).map((x) => x.predicate))) halfCounts.set(id, (halfCounts.get(id) || 0) + 1);
  const nH = half.length;
  const ids = [...counts.keys()].filter((id) => halfCounts.has(id));
  const sFull = [], sHalf = [], iFull = [], iHalf = [];
  for (const id of ids) {
    /* one shared predicate on a film carrying only that one — isolates the rarity term */
    sFull.push(poissonTailLog10(expectedOverlap([id], counts, N_POP), 1));
    sHalf.push(poissonTailLog10(expectedOverlap([id], halfCounts, nH), 1));
    iFull.push(Math.min(1, Math.log((N_POP + 1) / counts.get(id)) / Math.log(N_POP + 1)));
    iHalf.push(Math.min(1, Math.log((nH + 1) / halfCounts.get(id)) / Math.log(nH + 1)));
  }
  const drift = (a, b) => {
    const r = a.map((x, i) => (b[i] || 1e-9) / (x || 1e-9)).sort((x, y) => x - y);
    return { median: r[Math.floor(r.length / 2)], p10: r[Math.floor(r.length * 0.1)], p90: r[Math.floor(r.length * 0.9)] };
  };
  /* Singletons must be reported separately, not averaged in. expectedOverlap is
     (count - 1) / (N - 1), so a predicate held by exactly ONE film in the
     population has zero expected overlap and the tail returns the lambda<=0
     sentinel of 12 — the maximum. That is an artefact of the formula's edge,
     not a measurement, and it swamps the aggregate if left in. associate.js
     never meets it because MIN_SHARED_KEYWORDS = 3 puts it out of reach; here
     a single shared predicate is the common case, so it IS reachable, and this
     is the number to watch when the population is small or the tagging sparse. */
  const keep = ids.map((id, k) => (halfCounts.get(id) > 1 ? k : -1)).filter((k) => k >= 0);
  const pick = (a) => keep.map((k) => a[k]);
  const ds = drift(sFull, sHalf), di = drift(iFull, iHalf);
  const dsK = drift(pick(sFull), pick(sHalf)), diK = drift(pick(iFull), pick(iHalf));
  console.log("\n\nSCALE CHECK — population " + N_POP + " -> " + nH + " (every other film), " + ids.length + " predicates");
  line();
  console.log("  " + (ids.length - keep.length) + " predicates fall to a single film in the halved population and hit the");
  console.log("  lambda<=0 sentinel (surprise 12, the maximum). Reported apart, not averaged in.");
  console.log("");
  console.log("  ALL " + ids.length + "                surprise median " + ds.median.toFixed(3) + " spread(p90/p10) " + (ds.p90 / ds.p10).toFixed(2) +
    "x  |  legacy idf median " + di.median.toFixed(3) + " spread " + (di.p90 / di.p10).toFixed(2) + "x");
  console.log("  EXCLUDING singletons (" + keep.length + ")  surprise median " + dsK.median.toFixed(3) + " spread(p90/p10) " + (dsK.p90 / dsK.p10).toFixed(2) +
    "x  |  legacy idf median " + diK.median.toFixed(3) + " spread " + (diK.p90 / diK.p10).toFixed(2) + "x");
  console.log("");
  console.log("  1.000 = the measure means the same thing at both population sizes.");
  console.log("  On the " + keep.length + " predicates the formula is defined for, surprise is " + dsK.median.toFixed(3) +
    " and the idf is " + diK.median.toFixed(3) + " — the idf reads " +
    ((diK.median - 1) * 100).toFixed(1) + "% higher for the same predicate at half the population,");
  console.log("  which is the silent re-tuning the change was made to stop. Their SPREADS are");
  console.log("  comparable (" + (dsK.p90 / dsK.p10).toFixed(2) + "x vs " + (diK.p90 / diK.p10).toFixed(2) +
    "x), so the gain here is in the centre, not the tails.");
}

if (has("--contrast")) {
  const base = tonalNow.get(focus);
  const all = [];
  for (const [t, v] of tonalNow) if (t !== focus) all.push([dist(base, v), t]);
  all.sort((a, b) => a[0] - b[0]);
  console.log("\n\nCONTRAST — what the fingerprint alone returns for " + focus + " (" + all.length + " scored films)");
  line();
  all.slice(0, 8).forEach((row, i) => console.log("  " + String(i + 1).padStart(2) + ". " + row[0].toFixed(1).padStart(5) + "  " + row[1]));
  const rank = new Map(all.map((row, i) => [row[1], i + 1]));
  console.log("\n  and where the predicate layer's top " + Math.min(8, mine.length) + " sit in that same ranking:");
  mine.slice(0, 8).forEach((e) => {
    const other = e.aTitle === focus ? e.bTitle : e.aTitle;
    const r = rank.get(other);
    console.log("      " + (r ? "#" + String(r).padStart(4) + " of " + all.length : "  unscored") + "   " + other);
  });
  console.log("\n  and where the fingerprint puts the proposal's benchmark films:");
  for (const b of BENCH) console.log("      " + (rank.get(b) ? "#" + String(rank.get(b)).padStart(4) + " of " + all.length : "  unscored") + "   " + b);
}

function wrap(s, w) {
  const words = s.split(" "); const out = []; let cur = "";
  for (const word of words) {
    if ((cur + " " + word).trim().length > w) { out.push(cur); cur = "     " + word; }
    else cur = (cur ? cur + " " : "") + word;
  }
  if (cur.trim()) out.push(cur);
  return out.join("\n");
}

const out = flag("--out");
if (typeof out === "string") {
  fs.writeFileSync(path.join(ROOT, out), JSON.stringify({
    version: 2,
    vocabVersion: vocabFile.version,
    source: "reading",
    note: "Predicate edges. Readings, not records. Strength is a Poisson-tail surprise computed in predicate-strength.js, which has no access to a fingerprint; tonal distance sorts and never scores. NOT merged into corpus.json — proposal phase 5.",
    prevalencePopulation: {
      films: N_POP, from: TAGS_FILE,
      caveat: "300 of 2,204 films, all above the 1,500-char evidence floor; 657 corpus films (29.8%) are below it and can never be tagged. Not a corpus prevalence.",
    },
    extraScoredNotCounted: extraTitles,
    selftest: st,
    generated: new Date().toISOString(),
    edges: edges,
  }, null, 1));
  console.log("\n\nwrote " + edges.length + " edges -> " + out);
}
console.log("");
