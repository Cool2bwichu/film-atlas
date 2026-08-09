#!/usr/bin/env node
/* axes.js — the scorer. Five axes, 0-100, read from a plot section and nothing else.
 *
 *   node pipeline/axes.js                      # stratified sample, score, write
 *   node pipeline/axes.js --sample 200
 *   node pipeline/axes.js --dry                # build the sample and one prompt, call nothing
 *   node pipeline/axes.js --batches 2          # score only the first N batches (smoke test)
 *   node pipeline/axes.js --replicate          # the two adversarial replications, see below
 *
 * WHAT IT READS AND WHAT IT REFUSES
 *
 * Input is pipeline/out/plots.json and nothing else: the PLOT SECTION of each
 * film's Wikipedia article, already floored and already gated by plot-source.js.
 * This file will not run if that file's GATE 1 did not pass, and it does not
 * re-open the article to get more text when a film is thin — a film below the
 * evidence floor arrives here with `plot: null` and leaves as five nulls.
 *
 * Output is static/fingerprints.json. Three things are true of it by
 * construction:
 *
 *   source is "reading", always, never "record". AGENTS rule 8: a shared
 *     cinematographer is checkable against credits and a claim about a film's
 *     dread is an argument. These are arguments. The file says so in every
 *     record, not once in a header, because a header gets dropped in a merge.
 *   an axis with no evidence is null. Never 50, never a guess. plot-source.js
 *     enforces this at the source for films with no admitted plot; this file
 *     enforces it per AXIS, because a film can carry a full plot summary that
 *     says nothing whatever about, say, irony.
 *   NO EDGES. Edge emission is a separate later stage. The spec's 0.72 emission
 *     threshold was measured to be biased toward ignorance — pairs the scorer
 *     knew nothing about clear it more easily than pairs it knew well — so
 *     nothing here decides which films connect.
 *
 * NO PAGEVIEW COUNT IS WRITTEN INTO THE OUTPUT. The gates need fame numbers and
 * read them from plot-source.js's cache at gate time. A pageview column sitting
 * inside the layer's own shipped file is popularity one careless join away from
 * edge weighting, which AGENTS rule 1 forbids.
 *
 * WHY BATCHES OF TEN
 *
 * A single-film call has nothing to be relative to and drifts to the middle of
 * every scale; the middle of a scale is where an axis stops carrying
 * information. Ten films in one call force a relative judgment, which is what an
 * axis measures. The anchors fix the scale ACROSS batches; the batch fixes the
 * middle WITHIN one.
 *
 * THE LADDER FILMS ARE SPREAD ACROSS BATCHES ON PURPOSE. No two rungs of the
 * same ladder share a batch. Putting a ladder's five films in one call would
 * make GATE 3 a within-call ranking exercise, which is easy and proves nothing;
 * spread out, reproducing the order is a test of whether the anchors hold the
 * scale steady from call to call, which is the property the layer actually needs.
 *
 * WHAT THE SCORER IS NOT ALLOWED TO USE
 *
 * The DECISION doc's sharpest finding is that the spec's own flagship example —
 * "both hold their dread in full daylight" — is not stated in either film's
 * article. It would have been scored from model recall while axisConfidence read
 * HIGH because the article was long. The prompt below forbids recall in as many
 * words, and `--replicate` MEASURES whether the prohibition held by re-scoring
 * one batch with every title and year removed. An instruction nobody has tested
 * is a comment, not a control.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const nodeCrypto = require("node:crypto");
const { spawn } = require("child_process");

const ps = require("./plot-source.js");
/* The sample is drawn through the same fame instrument the gates audit with, so
   it cannot be stratified by one definition of fame and checked against another. */
const gates = require("./axis-gates.js");

const ROOT = path.join(__dirname, "..");
const PLOTS = path.join(__dirname, "out", "plots.json");
const LADDERS = path.join(__dirname, "axis-ladders.json");
const OUT_FILE = path.join(ROOT, "static", "fingerprints.json");
const CACHE = path.join(__dirname, ".cache-axes");

const AXES = ["dread", "cruelty", "irony", "ambiguity", "fracture"];

const MODEL = "claude-opus-5";
const BATCH_SIZE = 10;
const PROMPT_VERSION = "axes-prompt-1";
const CONCURRENCY = 3;
const CALL_TIMEOUT_MS = 15 * 60 * 1000;

/* Plot sections above this are outliers (corpus p90 is ~4,400 chars) and are
   truncated at a paragraph boundary rather than mid-sentence. Recorded per film
   so a score built on a truncated read is auditable. */
const MAX_PLOT_CHARS = 8000;

/* Sample size. The brief's range is 150-250: large enough to run the gates,
   small enough that the full corpus run stays the owner's call after they have
   seen what the gates said. */
const DEFAULT_SAMPLE = 200;
/* Films with no admitted plot, carried into the sample scored-by-nobody so that
   GATE 4 has something to check. They cost no tokens: no call is made for them. */
const DEFAULT_NULL_CARRIERS = 25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------------- args */

function args() {
  const a = process.argv.slice(2);
  const o = {
    sample: DEFAULT_SAMPLE, nulls: DEFAULT_NULL_CARRIERS, dry: false,
    batches: 0, refresh: false, replicate: false, concurrency: CONCURRENCY,
  };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === "--dry") o.dry = true;
    else if (k === "--refresh") o.refresh = true;
    else if (k === "--replicate") o.replicate = true;
    else if (k === "--sample") o.sample = parseInt(a[++i], 10);
    else if (k === "--nulls") o.nulls = parseInt(a[++i], 10);
    else if (k === "--batches") o.batches = parseInt(a[++i], 10);
    else if (k === "--concurrency") o.concurrency = parseInt(a[++i], 10);
    else if (k === "--help" || k === "-h") { console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]); process.exit(0); }
    else { console.error("unknown flag: " + k); process.exit(2); }
  }
  if (o.sample < 150 || o.sample > 250) {
    console.error("--sample must be 150-250: below 150 the gates have no power, above 250 this stops being a sample and becomes the run the owner has not authorised yet.");
    process.exit(2);
  }
  return o;
}

/* ------------------------------------------------------------------ the input */

function loadPlots() {
  if (!fs.existsSync(PLOTS)) {
    console.error("missing " + path.relative(ROOT, PLOTS) + " — run `node pipeline/plot-source.js` first.");
    process.exit(2);
  }
  const p = JSON.parse(fs.readFileSync(PLOTS, "utf8"));

  /* THE HARD STOP. plot-source.js refuses to write when its gate fails, so a
     file existing at all is most of the argument — but a stale or
     hand-assembled one must not be able to walk past this. */
  if (!p.gate1 || p.gate1.pass !== true) {
    console.error("\nGATE 1 DID NOT PASS UPSTREAM. Refusing to score.");
    console.error("Scoring on a fame-graded source would put popularity into the graph");
    console.error("through the scorer, and AGENTS rule 1 forbids exactly that.");
    process.exit(1);
  }
  return p;
}

/* --------------------------------------------------------- sample construction
 *
 * Three requirements, in order:
 *   1. every ladder film must be in it, or GATE 3 cannot run at all. This is
 *      axis-ladders.json's own `sampleRequirement` and it is checked before
 *      scoring, not after.
 *   2. it must span fame, era and country, because a gate calibrated on
 *      canonical films passes on exactly the films where scoring is easiest.
 *   3. it must contain films with NO admitted plot, or GATE 4 has nothing to
 *      check and becomes a check that cannot fail.
 */

function hashOrder(key) {
  return nodeCrypto.createHash("sha1").update("axes:" + key).digest("hex");
}

function fameDecile(views, allViews) {
  if (views == null) return -1;
  const idx = allViews.filter((v) => v < views).length;
  return Math.min(9, Math.floor((idx / allViews.length) * 10));
}

function buildSample(plots, ladders, opt) {
  const all = Object.entries(plots.films).map(([key, f]) => Object.assign({ key }, f));
  for (const f of all) {
    f.views = f.wikipedia ? gates.cachedViews(f.wikipedia) : null;
    f.era = ps.eraOf(f.year);
    f.h = hashOrder(f.key);
  }
  const known = all.filter((f) => f.views != null).map((f) => f.views).sort((a, b) => a - b);
  for (const f of all) f.fameDecile = fameDecile(f.views, known);

  const ladderKeys = new Set();
  const ladderAxes = new Map();
  for (const [ax, spec] of Object.entries(ladders.axes)) {
    for (const r of spec.rungs) {
      ladderKeys.add(r.corpusKey);
      if (!ladderAxes.has(r.corpusKey)) ladderAxes.set(r.corpusKey, []);
      ladderAxes.get(r.corpusKey).push({ axis: ax, rank: r.rank, withheld: !!r.withheldFromScorer });
    }
  }

  const byKey = new Map(all.map((f) => [f.key, f]));
  const missingLadder = [...ladderKeys].filter((k) => !byKey.has(k));

  const admitted = all.filter((f) => f.admitted && f.plot);
  const withheld = all.filter((f) => !f.admitted);

  /* Stratified over era x fame decile — the two dimensions the DECISION says a
     gate can be blind to. Region is carried and reported; it is not a stratum
     because plots.json is already an era x region stratified draw, and
     re-stratifying the same axis twice narrows nothing. */
  const forced = admitted.filter((f) => ladderKeys.has(f.key));
  const pool = admitted.filter((f) => !ladderKeys.has(f.key));
  const want = Math.max(0, opt.sample - forced.length - missingLadder.length);

  const cells = new Map();
  for (const f of pool) {
    const c = f.era + "|d" + f.fameDecile;
    if (!cells.has(c)) cells.set(c, []);
    cells.get(c).push(f);
  }
  for (const l of cells.values()) l.sort((a, b) => (a.h < b.h ? -1 : 1));
  const keys = [...cells.keys()].sort();
  const picked = [];
  let i = 0;
  /* Round-robin across cells rather than proportional allocation: with ~40
     cells and 180 slots, proportional allocation empties the small cells and a
     stratum present in the corpus and absent from the sample is a silent
     coverage hole. */
  while (picked.length < want) {
    let took = 0;
    for (const k of keys) {
      const l = cells.get(k);
      if (i < l.length) { picked.push(l[i]); took++; if (picked.length >= want) break; }
    }
    if (!took) break;
    i++;
  }

  const nulls = withheld.slice().sort((a, b) => (a.h < b.h ? -1 : 1)).slice(0, opt.nulls);

  return { forced, picked, nulls, missingLadder, ladderAxes, all };
}

/* Ladder films that plots.json's own draw happened to miss. Fetched HERE
   through plot-source.js's exported extractor and held to plots.json's own
   floor, so they are not a second, softer source: same code, same threshold,
   same cache directory. */
async function supplement(missingKeys, plots, corpus) {
  if (!missingKeys.length) return [];
  console.log("supplementing " + missingKeys.length + " ladder films absent from plots.json (same extractor, same floor)");
  const films = missingKeys.map((k) => {
    const f = corpus.films[k];
    if (!f) throw new Error("ladder film not in corpus: " + k);
    return { key: k, filmId: f.filmId, title: f.title, year: f.year, wikipedia: f.wikipedia };
  });
  const out = [];
  for (let i = 0; i < films.length; i += 20) {
    const batch = films.slice(i, i + 20);
    const d = await ps.wikitextBatch(batch.map((f) => f.wikipedia), false);
    const { byTitle, alias } = ps.indexWikitext(d);
    for (const f of batch) {
      const canonical = ps.resolveAlias(f.wikipedia, alias);
      const wt = byTitle[canonical] !== undefined ? byTitle[canonical] : (byTitle[f.wikipedia] || null);
      const ex = wt ? ps.extractPlot(wt) : { plot: null, plotHeading: null };
      const chars = ex.plot ? ex.plot.length : 0;
      const admitted = !!ex.plot && chars >= plots.floor;
      out.push({
        key: f.key, filmId: f.filmId, title: f.title, year: f.year, wikipedia: f.wikipedia,
        region: "Other", plotHeading: ex.plotHeading || null,
        plotChars: chars, plotWords: ex.plot ? ex.plot.split(/\s+/).length : 0,
        admitted, withheld: admitted ? null : (ex.plot ? "below-evidence-floor" : "no-plot-section"),
        plot: admitted ? ex.plot : null,
        supplemented: true,
      });
    }
    await sleep(400);
  }
  /* Pageviews too: the gates need a fame number for every scored film, and a
     film missing from the fame instrument is a film silently dropped from
     GATE 1 and GATE 5. */
  const win = ps.viewsWindow();
  for (const f of out) {
    try { await ps.pageviews(f.wikipedia, win, false); } catch (e) { /* gate reports the miss */ }
    await sleep(200);
  }
  return out;
}

/* ------------------------------------------------------------------- batching */

function makeBatches(films, ladderAxes, size) {
  const ordered = films.slice().sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  const n = Math.ceil(ordered.length / size);
  const batches = Array.from({ length: n }, () => []);
  const axesInBatch = batches.map(() => new Set());

  const isLadder = (f) => ladderAxes.has(f.key);
  const ladderFilms = ordered.filter(isLadder);
  const rest = ordered.filter((f) => !isLadder(f));

  /* Ladder films first, each into a batch that holds no other rung of any ladder
     it belongs to. A ladder whose rungs share a call is scored by within-call
     ranking; spread out, the anchors have to hold the scale between calls. */
  for (const f of ladderFilms) {
    const mine = ladderAxes.get(f.key).map((x) => x.axis);
    let target = -1;
    for (let b = 0; b < n; b++) {
      if (batches[b].length >= size) continue;
      if (mine.some((ax) => axesInBatch[b].has(ax))) continue;
      target = b; break;
    }
    if (target < 0) target = batches.findIndex((b) => b.length < size);
    batches[target].push(f);
    for (const ax of mine) axesInBatch[target].add(ax);
  }
  for (const f of rest) {
    const b = batches.findIndex((x) => x.length < size);
    batches[b < 0 ? batches.length - 1 : b].push(f);
  }
  return batches.filter((b) => b.length);
}

/* --------------------------------------------------------------------- prompt */

function truncatePlot(text) {
  if (text.length <= MAX_PLOT_CHARS) return { text, truncated: false };
  const cut = text.lastIndexOf("\n\n", MAX_PLOT_CHARS);
  return { text: text.slice(0, cut > MAX_PLOT_CHARS * 0.6 ? cut : MAX_PLOT_CHARS), truncated: true };
}

function axisBlock(ax, spec) {
  const rungs = spec.rungs.slice().sort((a, b) => a.rank - b.rank);
  const low = rungs[0], high = rungs[rungs.length - 1];
  /* Ranks 2-4 are NOT in this prompt. They are the test. */
  return [
    ax + " — " + spec.poles.low + " (0)  <->  " + spec.poles.high + " (100)",
    "  MEASURES: " + spec.measures,
    "  DOES NOT MEASURE: " + spec.doesNotMeasure,
    "  scale point " + low.anchorScore + ":  " + low.title + " (" + low.year + ") — " + low.why,
    "  scale point " + high.anchorScore + ":  " + high.title + " (" + high.year + ") — " + high.why,
  ].join("\n");
}

function buildPrompt(batch, ladders, opt) {
  const blind = !!opt.blind;
  const axisText = AXES.map((ax) => axisBlock(ax, ladders.axes[ax])).join("\n\n");
  const films = batch.map((f, i) => {
    const { text } = truncatePlot(f.plot);
    const head = blind
      ? "[" + (i + 1) + "] (title and year withheld)"
      : "[" + (i + 1) + "] " + f.title + " (" + f.year + ")";
    return head + "\nPLOT SECTION:\n" + text;
  }).join("\n\n---\n\n");

  return `You are scoring films on five formal axes for a film-lineage atlas. For each film you are given the PLOT SECTION of its Wikipedia article and nothing else.

THE RULES, in order of importance.

1. SCORE ONLY FROM THE SUPPLIED PLOT TEXT. You will recognise some of these films. Your memory of them is NOT evidence here and must not move a score by a single point. If the text in front of you does not support a position on an axis, that axis is null. A null is a correct answer. A guessed 50 is a wrong answer, and it is the specific wrong answer this instrument exists to prevent.
2. NEVER score by reputation, canon, fame, awards, director or country. Two films with identical plot behaviour get identical scores whether one is famous and one is forgotten.
3. JUDGE RELATIVE TO THE OTHER FILMS IN THIS BATCH, and to the scale points below. The scale points fix the scale; the batch keeps you honest about the middle. Do not let everything drift to 50 — if six of these ten films land between 45 and 55 on an axis, you have stopped measuring.
4. The axes are independent. A film may be high on all five, or high on none. Do not balance them.
5. Score the film the plot describes, not the plot summary's own prose. A dry summary of a harrowing film is still a harrowing film; a lurid summary of a gentle one is still gentle.

THE FIVE AXES. Each runs 0-100. The two scale points named per axis are reference points, NOT the ends of the scale: scores above the high point and below the low point are legal and expected for films that go further.

${axisText}

THE FILMS

${films}

OUTPUT

Return ONLY a JSON object. No prose before or after it, no markdown fence.

{"films":[{"n":1,"dread":{"s":62,"b":"..."},"cruelty":{"s":null,"b":"..."},"irony":{"s":20,"b":"..."},"ambiguity":{"s":45,"b":"..."},"fracture":{"s":5,"b":"..."}}]}

For every film, all five axis keys must be present, and:
  "s" — an integer 0-100, or null when the supplied text gives no purchase on that axis.
  "b" — at most 130 characters naming the SPECIFIC thing in the supplied text that fixes the score. Not a restatement of the axis, not a general impression: the event, structure or absence you are reading. When "s" is null, "b" says what the text failed to supply.

Include every film, in order, numbered as given.`;
}

/* ------------------------------------------------------------- the model call */

function callModel(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", [
      "-p", "--model", MODEL,
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

function parseScores(raw, expected) {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object in model output");
  const obj = JSON.parse(t.slice(a, b + 1));
  if (!obj || !Array.isArray(obj.films)) throw new Error("no films array");
  if (obj.films.length !== expected) throw new Error("expected " + expected + " films, got " + obj.films.length);
  return obj.films;
}

function normaliseAxis(v) {
  if (!v || typeof v !== "object") return { score: null, basis: "model returned no entry for this axis" };
  let s = v.s;
  if (s === null || s === undefined || s === "null") s = null;
  else {
    s = Math.round(Number(s));
    if (!Number.isFinite(s)) s = null;
    /* Scores past the anchors are legal (axis-ladders.json: the anchors are not
       corpus ceilings). Scores outside 0-100 are not; clamp and record. */
    else if (s < 0) s = 0;
    else if (s > 100) s = 100;
  }
  const b = typeof v.b === "string" ? v.b.trim().slice(0, 200) : "";
  return { score: s, basis: b || (s === null ? "no basis given" : "") };
}

function cacheKey(batch, opt) {
  const h = nodeCrypto.createHash("sha1");
  h.update(PROMPT_VERSION + "|" + MODEL + "|" + (opt.blind ? "blind|" : "") + (opt.tag || ""));
  for (const f of batch) h.update("|" + f.key + ":" + f.plotChars);
  return h.digest("hex").slice(0, 16);
}

async function scoreBatch(batch, ladders, opt) {
  fs.mkdirSync(CACHE, { recursive: true });
  const key = cacheKey(batch, opt);
  const cp = path.join(CACHE, "batch_" + key + ".json");
  if (!opt.refresh && fs.existsSync(cp)) {
    try {
      const d = JSON.parse(fs.readFileSync(cp, "utf8"));
      if (d && Array.isArray(d.films) && d.films.length === batch.length) return { films: d.films, cached: true };
    } catch (e) { /* refetch */ }
  }
  const prompt = buildPrompt(batch, ladders, opt);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callModel(attempt === 1 ? prompt :
        prompt + "\n\nYour previous reply could not be parsed (" + lastErr + "). Return ONLY the JSON object, starting with { and ending with }.");
      const films = parseScores(raw, batch.length);
      const rec = { films, model: MODEL, promptVersion: PROMPT_VERSION, at: new Date().toISOString() };
      fs.writeFileSync(cp, JSON.stringify(rec));
      return { films, cached: false };
    } catch (e) {
      lastErr = e.message;
      if (attempt < 3) await sleep(3000 * attempt);
    }
  }
  /* A batch that will not parse is NOT filled in with defaults. It stays
     unscored and its films stay null, which is the whole contract of GATE 4. */
  throw new Error("batch failed after 3 attempts: " + lastErr);
}

async function runPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/* ------------------------------------------------------------- axisConfidence
 *
 * The plot-source measurement makes this the sharpest trap in the file: any
 * confidence that is a function of plot LENGTH inherits a fame correlation of up
 * to 0.325 even inside the admitted set, and the spec wires axisConfidence
 * straight into edge confidence. So several formulations are computed, all of
 * them are measured against pageviews by axis-gates.js, and the one that ships
 * is chosen by that measurement rather than by which one sounds most informative.
 *
 * They are all deliberately COARSE. A confidence with 200 distinct values is a
 * ranking of films by how much was written about them, whatever it is named.
 */
function confidenceCandidates(film, axesOut) {
  const grounded = AXES.filter((ax) => axesOut[ax].score !== null).length;
  const c = {};
  /* Flat by construction among the scored: every admitted film cleared the same
     evidence floor, so among films that got a score there is nothing left to
     rank. The fame structure lives entirely in WHICH films are null, and a null
     does not enter the graph. This is the honest floor of the problem. */
  c["admitted-binary"] = 1;
  /* How many of the five axes the text actually grounded. Not a length measure:
     a long plot that is pure incident grounds fewer axes than a short one with a
     turn in it. Measured, not assumed. */
  c["grounded-fraction"] = grounded / AXES.length;
  /* The mean length of the model's own basis strings: a proxy for how much the
     text gave it to point at. Included mainly because it is the plausible
     alternative someone will reach for next, and it should be measured before
     it is adopted. */
  const bl = AXES.map((ax) => (axesOut[ax].basis || "").length).filter((x) => x > 0);
  c["basis-density"] = bl.length ? Math.min(1, (bl.reduce((a, b) => a + b, 0) / bl.length) / 130) : 0;
  /* The known-bad control: length, banded. If this is not the most fame-loaded
     column in the GATE 5 table, something is wrong with the measurement. */
  c["plot-length-banded"] = Math.min(1, Math.round((film.plotChars / 1000)) / 6);
  return c;
}

/* ----------------------------------------------------------------------- main */

async function main() {
  const opt = args();
  const plots = loadPlots();
  const ladders = JSON.parse(fs.readFileSync(LADDERS, "utf8"));
  const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));

  console.log("plots.json: floor " + plots.floor + " chars, GATE 1 " +
    (plots.gate1.pass ? "PASS" : "FAIL") + " (literal rho " + plots.gate1.literal.rho +
    ", operative " + plots.gate1.operative.rho + ")");
  if (!plots.gate1.literal.under) {
    console.log("  NOTE: the LITERAL gate — plot length against fame with no floor — did NOT");
    console.log("  pass. This run stands on the minimum-evidence floor, which turns a score");
    console.log("  gradient into a coverage gradient. That is a remedy, not a pass.");
  }

  let s = buildSample(plots, ladders, opt);
  if (s.missingLadder.length) {
    const extra = await supplement(s.missingLadder, plots, corpus);
    for (const f of extra) {
      f.era = ps.eraOf(f.year);
      f.h = hashOrder(f.key);
      f.views = gates.cachedViews(f.wikipedia);
      plots.films[f.key] = f;               // in memory only; plot-source owns the file
    }
    s = buildSample(plots, ladders, opt);
    if (s.missingLadder.length) {
      console.error("ladder films still missing after supplement: " + s.missingLadder.join(", "));
      process.exit(1);
    }
  }

  const notAdmitted = [...s.ladderAxes.keys()].filter((k) => {
    const f = plots.films[k];
    return !f || !f.admitted;
  });
  if (notAdmitted.length) {
    console.error("\nGATE 3 CANNOT RUN: ladder films below the evidence floor: " + notAdmitted.join(", "));
    process.exit(1);
  }

  const scoreSet = s.forced.concat(s.picked);
  const batches = makeBatches(scoreSet, s.ladderAxes, BATCH_SIZE);
  const runBatches = opt.batches ? batches.slice(0, opt.batches) : batches;

  console.log("\nsample: " + scoreSet.length + " films to score (" + s.forced.length + " ladder, " +
    s.picked.length + " drawn) + " + s.nulls.length + " with no admitted plot, carried for GATE 4");
  const deciles = new Array(10).fill(0);
  for (const f of scoreSet) if (f.fameDecile >= 0) deciles[f.fameDecile]++;
  console.log("  fame deciles (obscure->famous): " + deciles.join(", "));
  const eras = {};
  for (const f of scoreSet) eras[f.era] = (eras[f.era] || 0) + 1;
  console.log("  eras: " + Object.entries(eras).map(([k, v]) => k + " " + v).join(", "));
  const regions = {};
  for (const f of scoreSet) regions[f.region] = (regions[f.region] || 0) + 1;
  console.log("  regions: " + Object.entries(regions).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(", "));
  console.log("  batches: " + batches.length + " of up to " + BATCH_SIZE +
    (opt.batches ? "  (running only the first " + runBatches.length + ")" : ""));

  if (opt.dry) {
    console.log("\n--dry: first prompt follows, nothing called.\n");
    console.log(buildPrompt(runBatches[0], ladders, opt).slice(0, 4000));
    return;
  }

  /* ---- score ---- */
  let done = 0;
  const results = await runPool(runBatches, async (batch, i) => {
    const r = await scoreBatch(batch, ladders, opt);
    done++;
    process.stdout.write("  batch " + String(i + 1).padStart(2) + "/" + runBatches.length +
      "  " + batch.length + " films  " + (r.cached ? "cached" : "scored") + "   (" + done + " done)\n");
    return r;
  }, opt.concurrency);

  const scoredByKey = new Map();
  runBatches.forEach((batch, bi) => {
    const got = results[bi].films;
    batch.forEach((f, fi) => {
      const rec = got.find((x) => Number(x.n) === fi + 1) || got[fi];
      const axesOut = {};
      for (const ax of AXES) axesOut[ax] = normaliseAxis(rec ? rec[ax] : null);
      scoredByKey.set(f.key, { axesOut, batch: bi + 1 });
    });
  });

  /* ---- the two adversarial replications ---- */
  let replication = null;
  if (opt.replicate) replication = await replicate(runBatches, ladders, opt, scoredByKey);

  /* ---- write ---- */
  const out = {
    version: 1,
    axisVersion: ladders.axisVersion || "axes-1",
    generated: new Date().toISOString(),
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    /* AGENTS rule 8. Every one of these is an argument about a film, not a
       credit that can be checked against a record. It is stated at the top and
       again on every film, because a header gets lost in a merge. */
    source: "reading",
    note: "Scores are READINGS, never records. Each is a model's argument from a Wikipedia " +
      "plot section alone. No edges are emitted here. No pageview or popularity number is " +
      "written into this file. Not merged into corpus.json.",
    scale: { min: 0, max: 100, note: "anchors sit at 10 and 90 and are reference points, not ceilings" },
    axes: Object.fromEntries(AXES.map((ax) => [ax, {
      low: ladders.axes[ax].poles.low, high: ladders.axes[ax].poles.high,
      measures: ladders.axes[ax].measures,
    }])),
    input: {
      file: "pipeline/out/plots.json", floor: plots.floor,
      gate1: { literal: plots.gate1.literal.rho, operative: plots.gate1.operative.rho, threshold: plots.gate1.threshold },
    },
    sample: {
      scored: scoreSet.length, batchesRun: runBatches.length, batchSize: BATCH_SIZE,
      nullCarriers: s.nulls.length, fameDeciles: deciles, eras, regions,
      ladderFilms: [...s.ladderAxes.keys()].length,
    },
    axisConfidenceFormulation: "grounded-fraction (axes the text grounded / 5) — chosen against the GATE 5 table, not by taste",
    replication,
    films: {},
  };

  const put = (f, axesOut, batchNo) => {
    const conf = axesOut ? confidenceCandidates(f, axesOut) : null;
    out.films[f.key] = {
      filmId: f.filmId, title: f.title, year: f.year, wikipedia: f.wikipedia,
      region: f.region, source: "reading",
      scored: !!axesOut,
      withheld: f.admitted ? null : (f.withheld || "not-scored"),
      plotChars: f.plotChars,
      batch: batchNo || null,
      axes: axesOut || Object.fromEntries(AXES.map((ax) => [ax, {
        score: null,
        basis: "no admitted plot section (" + (f.withheld || "not scored") + ") — nothing was read, so nothing is claimed",
      }])),
      axisConfidence: conf ? conf["grounded-fraction"] : null,
      confidenceCandidates: conf,
    };
  };

  for (const f of scoreSet) {
    const r = scoredByKey.get(f.key);
    put(f, r ? r.axesOut : null, r ? r.batch : null);
  }
  for (const f of s.nulls) put(f, null, null);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1));
  console.log("\nwrote " + path.relative(ROOT, OUT_FILE) + " (" +
    (fs.statSync(OUT_FILE).size / 1024).toFixed(0) + " KB, " + Object.keys(out.films).length + " films)");

  const filled = Object.values(out.films).filter((f) => f.scored);
  for (const ax of AXES) {
    const v = filled.map((f) => f.axes[ax].score).filter((x) => x !== null);
    console.log("  " + ax.padEnd(10) + "scored " + String(v.length).padStart(3) + "/" + filled.length +
      "   null " + String(filled.length - v.length).padStart(3) +
      "   mean " + (v.reduce((a, b) => a + b, 0) / (v.length || 1)).toFixed(1) +
      "   sigma " + gates.sigma(v).toFixed(1));
  }
  console.log("\nnow run: node pipeline/axis-gates.js --break all");
}

/* ---------------------------------------------------------------- replication
 *
 * Two things the prompt claims that nobody has checked:
 *
 *   TITLE-BLIND. Rule 1 forbids scoring from recall. Re-score two batches with
 *     every title and year removed. If the blind scores match the sighted ones,
 *     the plot text was doing the work. If they diverge, the scorer was reading
 *     its own memory of the film and the DECISION doc's central worry is live.
 *   RECOMPOSED. Batch context is supposed to sharpen the middle, not to define
 *     it. Re-score ten films inside a different set of neighbours. Large drift
 *     means a score is a statement about its batch and cross-batch comparison —
 *     which is what an axis IS — is not supported.
 */
async function replicate(batches, ladders, opt, scoredByKey) {
  const out = {};
  const diff = (a, b) => {
    const per = {}; let n = 0, sum = 0, flips = 0;
    for (const ax of AXES) {
      const d = [];
      for (const k of Object.keys(a)) {
        const x = a[k][ax], y = b[k] && b[k][ax];
        if (x == null || y == null) { if ((x == null) !== (y == null)) flips++; continue; }
        d.push(Math.abs(x - y));
      }
      per[ax] = d.length ? Math.round((d.reduce((p, q) => p + q, 0) / d.length) * 10) / 10 : null;
      n += d.length; sum += d.reduce((p, q) => p + q, 0);
    }
    return { perAxis: per, meanAbsDelta: n ? Math.round((sum / n) * 10) / 10 : null, nullFlips: flips, pairs: n };
  };
  const asMap = (batch, res) => {
    const m = {};
    batch.forEach((f, i) => {
      const rec = res.films.find((x) => Number(x.n) === i + 1) || res.films[i];
      m[f.key] = Object.fromEntries(AXES.map((ax) => [ax, normaliseAxis(rec ? rec[ax] : null).score]));
    });
    return m;
  };
  const sighted = (batch) => {
    const m = {};
    for (const f of batch) {
      const r = scoredByKey.get(f.key);
      m[f.key] = Object.fromEntries(AXES.map((ax) => [ax, r ? r.axesOut[ax].score : null]));
    }
    return m;
  };

  console.log("\nreplication 1/2: title-blind re-score of 2 batches");
  const blindBatches = batches.slice(0, 2);
  const blindRes = [];
  for (const b of blindBatches) blindRes.push(await scoreBatch(b, ladders, Object.assign({}, opt, { blind: true, tag: "blind" })));
  const bA = Object.assign({}, sighted(blindBatches[0]), sighted(blindBatches[1]));
  const bB = Object.assign({}, asMap(blindBatches[0], blindRes[0]), asMap(blindBatches[1], blindRes[1]));
  out.titleBlind = Object.assign({ films: Object.keys(bA).length }, diff(bA, bB));
  console.log("  mean |delta| " + out.titleBlind.meanAbsDelta + " points, null flips " + out.titleBlind.nullFlips);

  console.log("replication 2/2: recomposed batch (same 10 films, different neighbours)");
  const mixed = [batches[0][0], batches[1][1], batches[2][2], batches[3][3], batches[4][4],
    batches[0][5], batches[1][6], batches[2][7], batches[3][8], batches[4][0]].filter(Boolean);
  const mixRes = await scoreBatch(mixed, ladders, Object.assign({}, opt, { tag: "recomposed" }));
  out.recomposed = Object.assign({ films: mixed.length }, diff(sighted(mixed), asMap(mixed, mixRes)));
  console.log("  mean |delta| " + out.recomposed.meanAbsDelta + " points, null flips " + out.recomposed.nullFlips);
  return out;
}

module.exports = { AXES, buildPrompt, makeBatches, confidenceCandidates, normaliseAxis, parseScores };

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
