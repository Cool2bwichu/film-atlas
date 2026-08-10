#!/usr/bin/env node
/* consensus.js — the attributes a search can actually search.
 *
 *   node pipeline/consensus.js --dry                 # build batches, print one prompt, call nothing
 *   node pipeline/consensus.js --batches 4           # pilot: four batches, then write
 *   node pipeline/consensus.js                       # the whole corpus
 *   node pipeline/consensus.js --measure             # re-measure what is already written, call nothing
 *
 * Writes `pipeline/out/consensus.json` (the readable record, one entry per film,
 * carrying `filled`) and the three shards `pipeline/match.js` actually consumes.
 *
 * ── WHAT THIS LAYER IS, AND WHY IT IS NOT THE AXIS LAYER ─────────────────────
 *
 * `axes.js` scores five formal qualities FROM SUPPLIED PLOT TEXT and forbids
 * recall in as many words. That instrument exists because a claim about how a
 * film behaves has to be answerable to evidence. This file is the opposite
 * instrument and the difference is deliberate, not an oversight:
 *
 *   THESE ARE CONSENSUS ATTRIBUTES, NOT MEASUREMENTS. We are not asking "is this
 *   film cerebral" and pretending to derive it from a source. We are recording
 *   what most viewers would agree on. The owner put it exactly: the attributes
 *   do not have to be empirical, just what the consensus seems to be — if
 *   Whiplash is considered fast-paced, we can safely generalise that people
 *   looking for a fast-paced film will appreciate it.
 *
 * That makes RECALL the right faculty and the supplied plot text the wrong
 * input. Handing the model a Wikipedia plot section and asking it for consensus
 * would produce a reading of the summary — and the summary's length is the most
 * fame-shaped variable this project has measured (rho 0.856 against 60-day
 * pageviews, `atlas-fingerprint-DECISION.md`). So the prompt is given TITLE,
 * YEAR AND DIRECTOR AND NOTHING ELSE. Those three fields identify a film; they
 * do not describe it. Anything the model says beyond them it is saying because
 * it knows the film.
 *
 * `record` / `reading` / consensus stay three different kinds of claim, per
 * AGENTS rule 8. Nothing written here enters `corpus.json`, no edge is emitted
 * from it, and every consumer reads it out of its own file.
 *
 * ── THE ONE FAILURE MODE THIS FILE IS BUILT AROUND ───────────────────────────
 *
 * For a film the model does not know, the failure is not silence. It is
 * CONFIDENT INVENTION. Title, year and director are enough to confabulate a
 * plausible film — "1970s Hungarian drama, so: austere, contemplative, bleak" —
 * and the output is indistinguishable from recall unless something forces the
 * difference into the open.
 *
 * Three mechanisms do that, and they are the whole design:
 *
 *   1. A THREE-WAY KNOWN GATE, not a confidence number. `well` / `outline` /
 *      `no`. Recognising a NAME is not knowing a FILM, and the prompt says so.
 *
 *   2. A CONCRETE-RECALL TOLL. To claim `well` the model must name one specific
 *      thing from the film in under 100 characters — an image, a scene, a
 *      structural move. "A Japanese family drama" can be written from the title
 *      and is rejected by the prompt as evidence of nothing. This is cheap for a
 *      film you have seen and impossible to fake safely for one you have not.
 *
 *   3. THE THREE TIERS ARE WRITTEN TO DIFFERENT SHARDS, because match.js reads
 *      a declared `vocabulary` as making silence a VERDICT:
 *
 *        consensus.shard-known.json     declares the vocabulary. These are films
 *                                       the model was asked about across all 59
 *                                       terms and answered. Silence = a known no.
 *        consensus.shard-outline.json   declares NO vocabulary. Only the positive
 *                                       attributes survive; every unlisted term
 *                                       is UNKNOWN, not absent. A source that can
 *                                       only say "yes" must not declare a closed
 *                                       vocabulary — match.js's own rule.
 *        consensus.shard-unknown.json   `passed: true`. Unknown on everything.
 *
 * A HIGH ANSWER RATE IS A BUG. If a run comes back having rated all 2,204, it is
 * inventing rather than recalling. The measurement block at the end reports the
 * answer rate first and it is meant to be read as a claim that needs defending.
 *
 * ── WHY BATCHES OF TEN ───────────────────────────────────────────────────────
 *
 * Same reason as axes.js: an absolute judgement drifts, a relative one does not.
 * Ten films in front of you make "fast" mean something, because four of them are
 * not. Batches are formed by a deterministic hash shuffle, so each one mixes era,
 * country and fame — a batch of ten obscure films invites the model to conclude
 * it ought to know some of them, and a batch of ten famous ones sets the bar for
 * "known" far too low.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const nodeCrypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(__dirname, "out");
const CACHE = path.join(__dirname, ".cache-consensus");
const VOCAB_FILE = path.join(__dirname, "consensus-vocab.json");

const PROMPT_VERSION = "consensus-prompt-1";
const MODEL = "claude-opus-5";
const BATCH_SIZE = 10;
const CONCURRENCY = 6;
const CALL_TIMEOUT_MS = 12 * 60 * 1000;

/* Values the model is allowed to use. Discrete rungs rather than a continuum:
   the difference between 0.62 and 0.68 is not a thing a consensus can carry, and
   offering it invites false precision. match.js reads real numbers either way. */
const RUNGS = [0.25, 0.5, 0.75, 1];

/* ------------------------------------------------------------------ arguments */

function parseArgs(argv) {
  const a = { batches: 0, concurrency: CONCURRENCY, refresh: false, dry: false, measure: false, model: MODEL };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--dry") a.dry = true;
    else if (k === "--measure") a.measure = true;
    else if (k === "--refresh") a.refresh = true;
    else if (k === "--batches") a.batches = Number(argv[++i]);
    else if (k === "--concurrency") a.concurrency = Number(argv[++i]);
    else if (k === "--model") a.model = argv[++i];
    else throw new Error("unknown argument " + k);
  }
  return a;
}

/* ---------------------------------------------------------------- the corpus */

function loadFilms() {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));
  const out = [];
  for (const [key, f] of Object.entries(c.films || {})) {
    out.push({
      key,
      title: f.title,
      year: f.year,
      director: f.director || null,
      wikipedia: f.wikipedia || null,
    });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/* Deterministic hash shuffle. Not `Math.random()`: the batching has to be the
   same on a re-run or the cache is worthless and the run is not reproducible. */
function shuffleByHash(films, salt) {
  return films
    .map((f) => ({ f, h: nodeCrypto.createHash("sha1").update(salt + "|" + f.key).digest("hex") }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0))
    .map((x) => x.f);
}

function makeBatches(films, size) {
  const shuffled = shuffleByHash(films, PROMPT_VERSION);
  const batches = [];
  for (let i = 0; i < shuffled.length; i += size) batches.push(shuffled.slice(i, i + size));
  return batches;
}

/* ----------------------------------------------------------------- the prompt */

function vocabBlock(vocab) {
  const byGroup = new Map();
  for (const a of vocab.attributes) {
    const g = a.id.split(":")[0];
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(a);
  }
  const lines = [];
  for (const [g, attrs] of byGroup) {
    lines.push("### " + g.toUpperCase() + " — " + (vocab.groups[g] || ""));
    for (const a of attrs) {
      lines.push("  " + a.id);
      lines.push("      " + a.gloss);
      lines.push("      NOT: " + a.not);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function buildPrompt(batch, vocab) {
  const films = batch.map((f, i) =>
    "[" + (i + 1) + "] " + f.title + " (" + f.year + ")" + (f.director ? " — dir. " + f.director : "")
  ).join("\n");

  return `You are building the searchable attribute layer for a film atlas. A reader types something like "a film with fast pacing, the mood of The Matrix, a hopeful tone, little dialogue, very spiritual" and the atlas has to arrange the whole corpus by how well each film answers that. Your job is to record, for the films below, what most viewers would agree is true of them.

WHAT KIND OF CLAIM THIS IS. These are CONSENSUS attributes, not measurements. You are not deriving anything from evidence in front of you and you should not pretend to. You are recording the settled shared impression: if Whiplash is considered fast-paced, a reader looking for a fast-paced film will be well served by finding it, and that is the whole test. Where the consensus is genuinely contested, score low or leave the attribute out.

WHAT YOU ARE GIVEN. Title, year and director. Nothing else, on purpose. Those three fields IDENTIFY a film; they do not DESCRIBE one. Everything you say beyond them, you are saying because you know the film.

═══════════════════════════════════════════════════════════════════════════
THE GATE — the one thing this pass exists to get right
═══════════════════════════════════════════════════════════════════════════

For each film answer "known" with exactly one of:

  "well"     You can recall specifics: what happens, how it feels to watch, images
             or scenes from it. You could describe it to someone who has not seen
             it and be right.

  "outline"  You know roughly what it is — subject, milieu, a director's habits,
             its reputation — but you cannot recall the film itself in detail.

  "no"       You do not know this film. You may recognise the title, the year, or
             the director and still belong here. RECOGNISING A NAME IS NOT KNOWING
             A FILM.

"no" IS A CORRECT, EXPECTED AND FREQUENT ANSWER. This corpus deliberately holds
films almost nobody has seen — regional programme pictures, unexported national
cinema, documentaries, films that never had an English release. A pass that comes
back knowing all of them has not recalled them, it has invented them, and
inventing is the single failure this whole layer is built to catch. Nobody is
counting your "no"s against you. A wrong "well" is far more expensive than a
right "no", because a confident wrong answer is indistinguishable from a right
one downstream and quietly poisons every search that touches it.

BE ESPECIALLY SUSPICIOUS OF YOURSELF WHEN a title is generic, when you can name
the director but not the film, when the year and country make a plausible guess
easy, or when you find yourself reasoning "a 1970s Hungarian drama, so probably
austere and contemplative". That reasoning produces exactly the output that looks
like knowledge and is not. It is the thing to refuse.

THE TOLL FOR "well". Supply "recall": ONE concrete, specific thing from the film,
under 100 characters — an image, a scene, a structural move, a sound, a line.
Something you could only write having seen it or read about it in detail.
  GOOD: "the drummer's hands bleeding onto the kit; the conductor throws a chair"
  GOOD: "shot entirely in one apartment; the daughter never speaks after reel two"
  BAD:  "a Japanese drama about a family" — writable from the title alone
If nothing specific comes, the honest answer is "outline" or "no". DO NOT
MANUFACTURE A DETAIL TO CLEAR THIS GATE. A detail you are not sure of is worse
than no detail at all, because the difference is the only thing this layer has.

═══════════════════════════════════════════════════════════════════════════
THE VOCABULARY — closed. Use these ids exactly. Invent nothing.
═══════════════════════════════════════════════════════════════════════════

${vocabBlock(vocab)}

═══════════════════════════════════════════════════════════════════════════
SCORING
═══════════════════════════════════════════════════════════════════════════

For every film you mark "well" or "outline", give an "attrs" object mapping
attribute ids to one of ${RUNGS.join(", ")}:

  0.25  present, faintly — a reader who wanted this would not be wrong to meet it
  0.5   clearly true of the film
  0.75  strongly true; one of the things it is known for
  1     definitive — this film is a reference point for the attribute

OMIT an attribute you do not think applies. Omission is a verdict: for a film you
marked "well" it will be read as "no, this film is not that". That is the correct
strength for a film you actually know. For a film you marked "outline" omission
is read as "no opinion" instead, so list only what you would defend.

RULES.
1. Do not score by reputation, importance, canon, awards or how much is written
   about a film. A film's stature is not an attribute here. Two films that play
   the same way get the same scores whether one is famous and one is forgotten.
2. JUDGE RELATIVE TO THE OTHER FILMS IN THIS BATCH as well as to cinema at large.
   If six of these ten come out "contemplative", you have stopped distinguishing.
3. A typical film earns a nonzero score on roughly 5 to 12 of these 59. Under 3
   and you are probably withholding; over 15 and you are describing cinema rather
   than this film.
4. Attributes are independent — no balancing, no quota. A film can be both comic
   and bleak, both fast and contemplative in different registers. Say so if so.
5. Score the film as it plays, not as its genre label implies. Many science
   fiction films are not set in space. Many crime films are not investigations.
6. A film marked "no" gets an empty attrs object. No exceptions.

═══════════════════════════════════════════════════════════════════════════
THE FILMS
═══════════════════════════════════════════════════════════════════════════

${films}

OUTPUT

Return ONLY a JSON object. No prose before or after, no markdown fence.

{"films":[
 {"n":1,"known":"well","recall":"...","attrs":{"pace:relentless":0.75,"tone:bleak":0.5}},
 {"n":2,"known":"no","recall":"","attrs":{}},
 {"n":3,"known":"outline","recall":"","attrs":{"subject:political":0.5}}
]}

Include every film, in order, numbered as given.`;
}

/* ------------------------------------------------------------- the model call */

function callModel(prompt, model) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", [
      "-p", "--model", model,
      "--disallowed-tools", "Bash", "Read", "Write", "Edit", "WebSearch", "WebFetch", "Glob", "Grep", "Task",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("model call timed out")); }, CALL_TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error("model exit " + code + ": " + err.slice(0, 400)));
      resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseReply(raw, expected) {
  let t = String(raw).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object in model output");
  const obj = JSON.parse(t.slice(a, b + 1));
  if (!obj || !Array.isArray(obj.films)) throw new Error("no films array");
  if (obj.films.length !== expected) throw new Error("expected " + expected + " films, got " + obj.films.length);
  return obj.films;
}

/* Normalising is where an invented answer gets demoted rather than repaired.
   A "well" with no usable recall string is NOT trusted as "well" — it is dropped
   to "outline", which moves the film to the shard where silence means unknown
   instead of no. That is the cheapest possible enforcement of the toll and it
   costs nothing when the model complied. */
const RECALL_MIN_CHARS = 12;

function normalise(entry, vocabSet) {
  const rec = { known: "no", recall: "", attrs: {}, dropped: [], demoted: null };
  const k = String((entry && entry.known) || "").toLowerCase().trim();
  rec.known = k === "well" || k === "outline" ? k : "no";
  rec.recall = typeof entry.recall === "string" ? entry.recall.trim().slice(0, 160) : "";

  if (rec.known === "well" && rec.recall.length < RECALL_MIN_CHARS) {
    rec.demoted = "well->outline: no concrete recall supplied";
    rec.known = "outline";
  }

  if (rec.known === "no") return rec;

  const attrs = (entry && entry.attrs) || {};
  for (const [id, v] of Object.entries(attrs)) {
    if (!vocabSet.has(id)) { rec.dropped.push(id); continue; }
    let n = Number(v);
    if (!Number.isFinite(n)) continue;
    n = Math.max(0, Math.min(1, n));
    if (n <= 0) continue;                       /* an explicit 0 is an omission */
    rec.attrs[id] = n;
  }
  return rec;
}

function cacheKey(batch, model) {
  const h = nodeCrypto.createHash("sha1");
  h.update(PROMPT_VERSION + "|" + model);
  for (const f of batch) h.update("|" + f.key);
  return h.digest("hex").slice(0, 16);
}

async function runBatch(batch, vocab, opt, idx) {
  fs.mkdirSync(CACHE, { recursive: true });
  const cp = path.join(CACHE, "b_" + cacheKey(batch, opt.model) + ".json");
  if (!opt.refresh && fs.existsSync(cp)) {
    try {
      const d = JSON.parse(fs.readFileSync(cp, "utf8"));
      if (d && Array.isArray(d.films) && d.films.length === batch.length) return { films: d.films, cached: true };
    } catch (e) { /* refetch */ }
  }
  const prompt = buildPrompt(batch, vocab);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callModel(
        attempt === 1 ? prompt
          : prompt + "\n\nYour previous reply could not be parsed (" + lastErr + "). Return ONLY the JSON object, starting with { and ending with }.",
        opt.model
      );
      const films = parseReply(raw, batch.length);
      fs.writeFileSync(cp, JSON.stringify({ films, model: opt.model, promptVersion: PROMPT_VERSION, at: new Date().toISOString() }));
      return { films, cached: false };
    } catch (e) {
      lastErr = e.message;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
  /* A batch that will not parse is NOT filled in with defaults. Its films stay
     absent from every shard, which reads as unknown — the honest state. */
  process.stderr.write("batch " + idx + " failed after 3 attempts: " + lastErr + "\n");
  return { films: null, cached: false, error: lastErr };
}

async function pool(items, worker, concurrency) {
  const out = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/* ------------------------------------------------------------------- writing */

function write(films, records, vocab, meta) {
  fs.mkdirSync(OUT, { recursive: true });
  const ids = vocab.attributes.map((a) => a.id);

  const known = {}, outline = {}, unknown = {};
  const entries = {};
  for (const f of films) {
    const r = records.get(f.key);
    if (!r) continue;                                  /* batch failed: absent = unknown */
    const filled = Object.keys(r.attrs).length;
    entries[f.key] = {
      title: f.title, year: f.year,
      known: r.known,
      recall: r.recall,
      filled,
      attrs: r.attrs,
    };
    if (r.demoted) entries[f.key].demoted = r.demoted;
    if (r.known === "well") known[f.key] = { attrs: r.attrs };
    else if (r.known === "outline") outline[f.key] = { attrs: r.attrs };
    else unknown[f.key] = { passed: true };
  }

  const stamp = { version: 1, vocabVersion: vocab.vocabVersion, model: meta.model, promptVersion: PROMPT_VERSION, generated: new Date().toISOString() };

  /* The vocabulary is declared HERE AND ONLY HERE. match.js reads a declared
     vocabulary as making silence a verdict, and it is one only for these films —
     the ones the model said it knows and proved with a concrete recall. */
  fs.writeFileSync(path.join(OUT, "consensus.shard-known.json"), JSON.stringify(
    Object.assign({}, stamp, { tier: "known", vocabulary: ids, films: known }), null, 1));

  /* No `vocabulary` key. An outline-tier film can only say yes; encoding its
     silence as a known-absent would be a lie the scorer faithfully amplifies. */
  fs.writeFileSync(path.join(OUT, "consensus.shard-outline.json"), JSON.stringify(
    Object.assign({}, stamp, { tier: "outline", note: "no vocabulary declared on purpose: silence here is ignorance, not absence", films: outline }), null, 1));

  fs.writeFileSync(path.join(OUT, "consensus.shard-unknown.json"), JSON.stringify(
    Object.assign({}, stamp, { tier: "unknown", note: "the model did not know these films. passed = unknown on every attribute", films: unknown }), null, 1));

  const doc = Object.assign({}, stamp, {
    note: "Consensus attributes: what most viewers would agree on, recorded from recall against title/year/director only. NOT measurements, NOT record, NOT reading. See the header of pipeline/consensus.js.",
    corpus: films.length,
    vocabulary: ids,
    counts: { known: Object.keys(known).length, outline: Object.keys(outline).length, unknown: Object.keys(unknown).length, missing: films.length - Object.keys(entries).length },
    films: entries,
  });
  fs.writeFileSync(path.join(OUT, "consensus.json"), JSON.stringify(doc, null, 1));
  return doc;
}

/* --------------------------------------------------------------------- main */

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const vocab = JSON.parse(fs.readFileSync(VOCAB_FILE, "utf8"));
  const vocabSet = new Set(vocab.attributes.map((a) => a.id));
  const films = loadFilms();
  let batches = makeBatches(films, BATCH_SIZE);

  if (opt.dry) {
    console.log("corpus " + films.length + "  batches " + batches.length + "  vocabulary " + vocabSet.size);
    console.log("\n--dry: first prompt follows, nothing called.\n");
    console.log(buildPrompt(batches[0], vocab));
    return;
  }

  if (opt.batches) batches = batches.slice(0, opt.batches);
  const inScope = [].concat(...batches);
  console.log("consensus: " + inScope.length + " films in " + batches.length + " batches of " + BATCH_SIZE +
    ", model " + opt.model + ", concurrency " + opt.concurrency);

  let done = 0;
  const results = await pool(batches, async (b, i) => {
    const r = await runBatch(b, vocab, opt, i);
    done++;
    if (done % 5 === 0 || done === batches.length) {
      process.stdout.write("  " + done + "/" + batches.length + " batches\n");
    }
    return r;
  }, opt.concurrency);

  const records = new Map();
  let droppedTerms = 0, demoted = 0, failedBatches = 0;
  for (let i = 0; i < batches.length; i++) {
    const res = results[i];
    if (!res || !res.films) { failedBatches++; continue; }
    for (let j = 0; j < batches[i].length; j++) {
      const entry = res.films.find((x) => Number(x && x.n) === j + 1) || res.films[j];
      if (!entry) continue;
      const rec = normalise(entry, vocabSet);
      droppedTerms += rec.dropped.length;
      if (rec.demoted) demoted++;
      records.set(batches[i][j].key, rec);
    }
  }

  const doc = write(inScope, records, vocab, { model: opt.model });
  console.log("\nwrote pipeline/out/consensus.json and three shards");
  console.log("  known " + doc.counts.known + "  outline " + doc.counts.outline +
    "  unknown " + doc.counts.unknown + "  missing " + doc.counts.missing);
  console.log("  off-vocabulary terms dropped " + droppedTerms +
    "   'well' demoted for no recall " + demoted + "   failed batches " + failedBatches);
}

if (require.main === module) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}

module.exports = { buildPrompt, makeBatches, normalise, loadFilms, RUNGS };
