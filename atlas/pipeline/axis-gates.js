#!/usr/bin/env node
/* axis-gates.js — the five gates on the fingerprint layer, as a runnable check.
 *
 * WHY THIS FILE IS SEPARATE FROM THE SCORER
 *
 * atlas/AGENTS.md: "When you add a check, prove it can fail: break the thing
 * deliberately, confirm the probe reports it, then fix it again." A gate that
 * lives inside the thing it measures can only ever be run in the passing
 * configuration. This file takes the scorer's output as data and can perturb it
 * IN MEMORY — never on disk — so every gate can be watched to fail on demand:
 *
 *   node pipeline/axis-gates.js                       # the real verdict
 *   node pipeline/axis-gates.js --break gate1-full    # each of these MUST fail
 *   node pipeline/axis-gates.js --break gate2-constant
 *   node pipeline/axis-gates.js --break gate2-defaulted
 *   node pipeline/axis-gates.js --break gate3-shuffle
 *   node pipeline/axis-gates.js --break gate4-default
 *   node pipeline/axis-gates.js --break gate5-fullchars
 *   node pipeline/axis-gates.js --break all           # runs every break in turn
 *
 * TWO GATES FROM THE ORIGINAL SPEC ARE NOT IMPLEMENTED, DELIBERATELY.
 *
 *   sigma < 8 liveness. Cannot fail where it matters: the DECISION measured an
 *     85%-defaulted axis at sigma 11.2 and a pure horror flag at 11.5, and both
 *     pass. Replaced by GATE 2, pole prevalence. This file still PRINTS sigma
 *     next to every pole-prevalence verdict, precisely so that the
 *     `--break gate2-defaulted` run shows sigma passing while GATE 2 fails.
 *     That side-by-side is the evidence for the replacement, not an assertion
 *     about it.
 *   The 0.72 emission threshold. Biased toward ignorance — films the scorer knew
 *     nothing about clear it more easily than films it knew well. No edges are
 *     emitted at this stage, so there is nothing here to gate.
 *
 * THE FAME INSTRUMENT IS SHARED, ON PURPOSE. GATE 1 is computed by calling
 * plot-source.js's own exported `runGate1`, over pageviews read from
 * plot-source.js's own cache. A gate implemented twice is a gate that
 * disagrees with itself. `axes.js` draws its sample through the readers this
 * file exports, so the sample cannot be stratified by one definition of fame
 * and then audited by another.
 *
 * NOTHING HERE TOUCHES THE NETWORK. Every number comes from
 * pipeline/out/plots.json, static/fingerprints.json and the two on-disk caches
 * that plot-source.js already filled.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ps = require("./plot-source.js");

const ROOT = path.join(__dirname, "..");
const PLOTS = path.join(__dirname, "out", "plots.json");
const LADDERS = path.join(__dirname, "axis-ladders.json");
const FINGERPRINTS = path.join(ROOT, "static", "fingerprints.json");

const AXES = ["dread", "cruelty", "irony", "ambiguity", "fracture"];

/* ------------------------------------------------------------- GATE THRESHOLDS
 *
 * Every number below was fixed BEFORE any film was scored. They are stated here
 * rather than in the report so that a later reader can see they were not tuned
 * to whatever the run produced.
 */

/* GATE 1 — inherited wholesale from plot-source.js rather than restated, so the
   two files cannot drift apart. 0.45, defended there at length: below the 0.50
   midpoint of the two measured poles (description 0.149, full prose 0.856), at
   graph degree's 0.452 which is the most fame-loaded quantity already inside
   the graph, and rho^2 = 0.20. */
const GATE1_MAX_RHO = ps.GATE1_MAX_RHO;

/* GATE 2 — pole prevalence. The band 5-35% is the DECISION's, not mine.
   The pole CUT is mine, and it is fixed a priori at 30/70 for one reason: the
   anchors sit at 10 and 90, so a film inside the cut is nearer its anchor than
   the midpoint of the scale. Counting films past a THRESHOLD and never past the
   ANCHOR is required by axis-ladders.json's `anchorsAreNotCeilings`: two corpus
   films plausibly exceed their axis's high anchor, and a pole defined as
   "past the anchor" would silently clip the top of those two axes.
   A second, tighter cut (20/80) is reported alongside as a sensitivity column,
   but the VERDICT is always the 30/70 one. */
const POLE_LOW = 30;
const POLE_HIGH = 70;
const POLE_MIN_SHARE = 0.05;
const POLE_MAX_SHARE = 0.35;
const POLE_SENSITIVITY = [20, 80];

/* The replaced check, kept only to be printed beside GATE 2. */
const OLD_SIGMA_MIN = 8;

/* GATE 5 — the same 0.45 as GATE 1, and for the same reason. axisConfidence is
   wired into edge confidence by the spec, so a fame-shaped confidence is
   popularity entering edge weighting through the side door, which is exactly
   what AGENTS rule 1 forbids. A confidence input may not be more fame-loaded
   than the source it is computed from. */
const GATE5_MAX_RHO = ps.GATE1_MAX_RHO;

/* ADDED CHECK, not in the brief: the SCORES themselves against fame. GATE 1
   guards the input and GATE 5 guards the confidence, and between them sits the
   thing that actually ships. If `ambiguity` correlates with pageviews at 0.6,
   both specified gates pass and the layer is still a fame map. Same threshold,
   reported per axis, and flagged as an addition rather than smuggled in as one
   of the five. */
const SCORE_FAME_MAX_RHO = 0.45;

const BOOTSTRAP_ITERS = 2000;

/* ---------------------------------------------------------- offline cache reads
 *
 * plot-source.js cached one file per 20-title wikitext batch and one per
 * article-pageviews request. Both are read here directly off disk: this file
 * makes no network call, so a gate run is reproducible, fast, and cannot be
 * changed by Wikipedia between two runs of the same build.
 */

/* The pageviews API does not follow redirects, so plot-source.js resolved every
   title to its canonical form before asking. The redirect map is inside the
   cached batch responses; rebuild it once and reuse. Films whose article is a
   redirect skew non-English and alternate-title — exactly the tail these gates
   are supposed to speak for — so getting this wrong drops them silently. */
let ALIAS = null;
let WIKITEXT = null;

function loadWikitextCache() {
  if (WIKITEXT) return;
  ALIAS = Object.create(null);
  WIKITEXT = Object.create(null);
  let files = [];
  try { files = fs.readdirSync(ps.CACHE_WIKITEXT); } catch (e) { files = []; }
  for (const fn of files) {
    if (!fn.endsWith(".json")) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(ps.CACHE_WIKITEXT, fn), "utf8")); } catch (e) { continue; }
    let idx;
    try { idx = ps.indexWikitext(d); } catch (e) { continue; }
    for (const [k, v] of Object.entries(idx.alias || {})) ALIAS[k] = v;
    for (const [k, v] of Object.entries(idx.byTitle || {})) if (v) WIKITEXT[k] = v;
  }
}

function canonicalTitle(title) {
  loadWikitextCache();
  return ps.resolveAlias(title, ALIAS);
}

function wikitextFor(title) {
  loadWikitextCache();
  const c = canonicalTitle(title);
  return WIKITEXT[c] !== undefined ? WIKITEXT[c] : (WIKITEXT[title] || null);
}

/* Full-article prose length, for the GATE 1 and GATE 5 break runs. This is the
   forbidden variable — the 0.856 one — and it exists in this file only so that
   feeding it to a gate can be watched to fail. */
function fullCharsFor(title) {
  const wt = wikitextFor(title);
  if (!wt) return 0;
  try { return ps.extractPlot(wt).fullChars || 0; } catch (e) { return 0; }
}

/* 60-day pageviews, cache-only. Returns null on a miss rather than fetching:
   a gate that quietly goes to the network is a gate whose number depends on
   the day it ran. */
function cachedViews(title) {
  const win = ps.viewsWindow();
  for (const t of [canonicalTitle(title), title]) {
    if (!t) continue;
    const p = ps.cachePath(ps.CACHE_VIEWS, "pv_" + win.start + "_" + t);
    if (!fs.existsSync(p)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { continue; }
    if (!d || !Array.isArray(d.items)) continue;
    let sum = 0;
    for (const it of d.items) sum += it.views || 0;
    return sum;
  }
  return null;
}

/* --------------------------------------------------------------------- stats */

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }

function sigma(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

/* A constant vector has no ranks to correlate, and Spearman returns NaN. That is
   not a small number — it is the absence of a measurement, and reporting it as
   0.0000 would be the single most flattering rounding error available here. */
function rhoWithCI(x, y) {
  const counts = new Map();
  for (const v of x) counts.set(v, (counts.get(v) || 0) + 1);
  const modalShare = x.length ? Math.max(...counts.values()) / x.length : 1;
  const degenerate = counts.size <= 1;
  /* NEARLY constant is the trap, not constant. A variable where 196 of 197 films
     share one value produces a printable rho with a printable CI, and it is
     carried entirely by the one film that differs. Reporting that as a flat
     confidence would be the same lie as reporting a constant, dressed better. */
  const effectivelyConstant = !degenerate && modalShare >= 0.95;
  const base = { n: x.length, modalShare: Math.round(modalShare * 1000) / 1000, degenerate, effectivelyConstant };
  if (x.length < 8 || degenerate) return Object.assign(base, { rho: null, ci95: null });
  const r = ps.spearman(x, y);
  if (!Number.isFinite(r)) return Object.assign(base, { rho: null, ci95: null, degenerate: true });
  const ci = ps.bootstrapCI(x, y, BOOTSTRAP_ITERS, 20260809);
  return Object.assign(base, {
    rho: Math.round(r * 10000) / 10000,
    ci95: ci.map((v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)),
  });
}

function histogram(vals) {
  const b = new Array(10).fill(0);
  for (const v of vals) b[Math.min(9, Math.floor(v / 10))]++;
  return b;
}

function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }

/* ------------------------------------------------------------------- loading */

function loadAll() {
  for (const p of [PLOTS, LADDERS, FINGERPRINTS]) {
    if (!fs.existsSync(p)) {
      console.error("missing input: " + path.relative(ROOT, p));
      if (p === FINGERPRINTS) console.error("run `node pipeline/axes.js` first.");
      process.exit(2);
    }
  }
  return {
    plots: JSON.parse(fs.readFileSync(PLOTS, "utf8")),
    ladders: JSON.parse(fs.readFileSync(LADDERS, "utf8")),
    fp: JSON.parse(fs.readFileSync(FINGERPRINTS, "utf8")),
  };
}

/* Rows the gates run over: one per film in the scored sample, carrying the
   score, the evidence quantity, and the fame number. Views are read here and
   deliberately NOT written into fingerprints.json — a pageview count inside the
   shipped payload would be popularity sitting in the graph's own file. */
function buildRows(fp, plots) {
  const rows = [];
  for (const [key, f] of Object.entries(fp.films)) {
    const src = plots.films[key] || {};
    rows.push({
      key,
      title: f.title,
      year: f.year,
      wikipedia: f.wikipedia || src.wikipedia || null,
      region: f.region || src.region || "Other",
      scored: !!f.scored,
      withheld: f.withheld || null,
      plotChars: f.plotChars != null ? f.plotChars : (src.plotChars || 0),
      hasArticle: (f.plotChars != null ? f.plotChars : (src.plotChars || 0)) > 0 || !!src.plotHeading || f.withheld !== "no-article",
      axes: f.axes || {},
      axisConfidence: f.axisConfidence,
      confidenceCandidates: f.confidenceCandidates || {},
      views: null,
      fullChars: 0,
    });
  }
  for (const r of rows) {
    if (r.wikipedia) {
      r.views = cachedViews(r.wikipedia);
      r.fullChars = fullCharsFor(r.wikipedia);
    }
  }
  return rows;
}

/* --------------------------------------------------------------------- breaks
 *
 * Each break is a deliberate, plausible mis-implementation applied to an
 * in-memory copy. None of them writes anything. The point of every one is that
 * it is a mistake a reasonable person could actually make — a shuffled ladder,
 * a defaulted axis, a null filled in with 50, a confidence computed from the
 * article instead of the plot — not a nonsense value chosen to be caught.
 */

const BREAKS = {
  "gate1-full":
    "GATE 1 fed full-article prose length instead of plot-section length — the forbidden 0.856 variable.",
  "gate2-constant":
    "GATE 2 given a `dread` axis forced to a single constant for every film.",
  "gate2-defaulted":
    "GATE 2 given a `dread` axis defaulted to 50 for 85% of films — the case the replaced sigma<8 check provably cannot catch.",
  "gate3-shuffle":
    "GATE 3 run against a ladder whose withheld middle (ranks 2-4) has been shuffled.",
  "gate4-default":
    "GATE 4 given a scorer that filled every null with 50 instead of admitting it had no evidence.",
  "gate5-fullchars":
    "GATE 5 given an axisConfidence computed from full-article length.",
};

function applyBreak(name, ctx) {
  const { rows, ladders } = ctx;
  if (name === "gate1-full") {
    ctx.gate1Source = "full";
    return;
  }
  if (name === "gate2-constant") {
    for (const r of rows) if (r.scored) r.axes.dread = { score: 50, basis: "[BREAK] forced constant" };
    return;
  }
  if (name === "gate2-defaulted") {
    /* The DECISION's own scenario, reproduced: 85% of films defaulted to the
       middle, 15% left alive. Deterministic by position so the run repeats. */
    const scored = rows.filter((r) => r.scored);
    scored.forEach((r, i) => {
      if (i % 100 >= 15) r.axes.dread = { score: 50, basis: "[BREAK] defaulted" };
    });
    return;
  }
  if (name === "gate3-shuffle") {
    /* Rotate the withheld middle of one ladder: 2,3,4 -> 4,2,3. Every rung is
       still a real film with a real argument; only the claimed order is wrong,
       which is precisely the failure GATE 3 exists to detect. */
    const rungs = ladders.axes.dread.rungs;
    const mid = rungs.filter((x) => x.rank >= 2 && x.rank <= 4);
    const rotated = [mid[2], mid[0], mid[1]];
    rotated.forEach((r, i) => { r.rank = i + 2; });
    ladders.axes.dread.rungs = rungs.slice().sort((a, b) => a.rank - b.rank);
    ctx.brokenLadder = "dread";
    return;
  }
  if (name === "gate4-default") {
    for (const r of rows) {
      for (const ax of AXES) {
        const a = r.axes[ax];
        if (!a || a.score === null || a.score === undefined) {
          r.axes[ax] = { score: 50, basis: "[BREAK] defaulted null" };
        }
      }
      if (!r.scored) { r.scored = true; r.brokenScored = true; }
    }
    return;
  }
  if (name === "gate5-fullchars") {
    for (const r of rows) r.axisConfidence = r.fullChars ? Math.min(1, r.fullChars / 30000) : null;
    return;
  }
  throw new Error("unknown break: " + name);
}

/* ---------------------------------------------------------------- GATE 1 */

/* GATE 1 is measured over TWO populations, and confusing them would be the
 * easiest way to accidentally flatter it.
 *
 *   SOURCE STAGE — plot-source.js's own 400-film era x region stratified draw,
 *     recorded in plots.json. This is the unbiased population and it is the
 *     GOVERNING verdict, because it is the one that answers "is plot length
 *     fame-graded across this corpus".
 *   SCORED SAMPLE — the films this run actually read. It is deliberately NOT a
 *     random draw of the corpus (200 admitted films plus 25 withheld ones
 *     carried in purely so GATE 4 has something to check), so its LITERAL number
 *     is skewed by construction and is reported for completeness only. Its
 *     OPERATIVE number is meaningful: among admitted films it answers "did the
 *     scorer read more about famous films than obscure ones", which is the
 *     question that matters once the floor exists.
 *
 * Both are computed by calling plot-source.js's own exported runGate1 over
 * pageviews from plot-source.js's own cache. A gate implemented twice is a gate
 * that disagrees with itself.
 */
function gate1(ctx) {
  const { rows } = ctx;
  const which = ctx.gate1Source === "full" ? "full" : "plot";
  const floor = ctx.plots.floor;

  const gr = rows
    .filter((r) => r.views != null)
    .map((r) => ({ plotChars: r.plotChars, fullChars: r.fullChars, description: "", views: r.views }));
  const g = ps.runGate1(gr, { gateSource: which, gateMax: GATE1_MAX_RHO, floor });

  /* The source-stage number is read from the file rather than recomputed: it was
     measured over films this run never loaded. On a break run it is recomputed
     from the same films with the forbidden variable so the break reaches it too. */
  let src = ctx.plots.gate1;
  if (which === "full") {
    src = ps.runGate1(gr, { gateSource: "full", gateMax: GATE1_MAX_RHO, floor });
    src.recomputed = true;
  }

  const pass = which === "full" ? (g.pass && src.pass) : (src.pass === true && g.operative.under);
  return {
    name: "GATE 1  FAME-FLATNESS",
    variable: which === "full" ? "FULL-ARTICLE prose chars  *** THE FORBIDDEN VARIABLE ***" : "plot-section chars",
    threshold: GATE1_MAX_RHO,
    sourceStage: { literal: src.literal, operative: src.operative, admittedShare: src.admittedShare, pass: src.pass, recomputed: !!src.recomputed },
    scoredSample: { literal: g.literal, operative: g.operative, admittedShare: g.admittedShare },
    pass,
  };
}

/* ---------------------------------------------------------------- GATE 2 */

function gate2(ctx) {
  const scored = ctx.rows.filter((r) => r.scored);
  const per = [];
  let allPass = true;
  for (const ax of AXES) {
    const vals = scored.map((r) => r.axes[ax]).filter((a) => a && a.score !== null && a.score !== undefined)
      .map((a) => a.score);
    const n = vals.length;
    const low = vals.filter((v) => v <= POLE_LOW).length;
    const high = vals.filter((v) => v >= POLE_HIGH).length;
    const lowS = n ? low / n : 0;
    const highS = n ? high / n : 0;
    const lowOk = lowS >= POLE_MIN_SHARE && lowS <= POLE_MAX_SHARE;
    const highOk = highS >= POLE_MIN_SHARE && highS <= POLE_MAX_SHARE;
    const s = sigma(vals);
    per.push({
      axis: ax, n,
      lowN: low, lowShare: pct(low, n), lowOk,
      highN: high, highShare: pct(high, n), highOk,
      sensLow: pct(vals.filter((v) => v <= POLE_SENSITIVITY[0]).length, n),
      sensHigh: pct(vals.filter((v) => v >= POLE_SENSITIVITY[1]).length, n),
      sigma: Math.round(s * 100) / 100,
      oldSigmaCheckPasses: s >= OLD_SIGMA_MIN,
      hist: histogram(vals),
      pass: lowOk && highOk,
    });
    if (!(lowOk && highOk)) allPass = false;
  }
  return { name: "GATE 2  POLE PREVALENCE", cut: [POLE_LOW, POLE_HIGH], band: [POLE_MIN_SHARE, POLE_MAX_SHARE], per, pass: allPass };
}

/* ---------------------------------------------------------------- GATE 3 */

function gate3(ctx) {
  const { rows, ladders } = ctx;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const per = [];
  let allPass = true;
  for (const ax of AXES) {
    const spec = ladders.axes[ax];
    const rungs = spec.rungs.slice().sort((a, b) => a.rank - b.rank);
    const got = rungs.map((r) => {
      const row = byKey.get(r.corpusKey);
      const a = row && row.axes ? row.axes[ax] : null;
      return {
        rank: r.rank, title: r.title, withheld: !!r.withheldFromScorer,
        score: a && a.score !== null && a.score !== undefined ? a.score : null,
        inSample: !!row && !!row.scored,
      };
    });
    const missing = got.filter((g) => g.score === null);
    const scoredRungs = got.filter((g) => g.score !== null);

    const inversions = (list) => {
      let inv = 0, pairs = 0;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          pairs++;
          if (!(list[i].score < list[j].score)) inv++;
        }
      }
      return { inv, pairs };
    };
    const full = inversions(scoredRungs);
    const mid = inversions(scoredRungs.filter((g) => g.withheld));

    /* Adjacent margins, so a knife-edge failure is distinguishable from a gross
       one. A ladder missed by two points is a note about the ladder; a ladder
       missed by forty is a note about the scorer, and a pass/fail cannot tell
       them apart. */
    const margins = [];
    for (let i = 1; i < scoredRungs.length; i++) {
      margins.push({
        from: scoredRungs[i - 1].rank, to: scoredRungs[i].rank,
        delta: scoredRungs[i].score - scoredRungs[i - 1].score,
      });
    }

    const runnable = missing.length === 0;
    const pass = runnable && full.inv === 0;
    if (!pass) allPass = false;
    per.push({
      axis: ax, runnable,
      missing: missing.map((m) => m.rank + ":" + m.title + (m.inSample ? " (scored null)" : " (NOT IN SAMPLE)")),
      order: got.map((g) => g.rank + (g.withheld ? "w" : "a") + "=" + (g.score === null ? "null" : g.score)).join("  "),
      fullInversions: full.inv, fullPairs: full.pairs,
      withheldInversions: mid.inv, withheldPairs: mid.pairs, margins,
      weakestAdjacency: spec.weakestAdjacency ? (spec.weakestAdjacency.pair || spec.weakestAdjacency) : null,
      pass,
    });
  }
  return { name: "GATE 3  LADDER COMPLIANCE", per, pass: allPass };
}

/* ---------------------------------------------------------------- GATE 4 */

function gate4(ctx) {
  const viol = [];
  let withheldFilms = 0, withheldAxisSlots = 0, nullAxisSlots = 0;
  for (const r of ctx.rows) {
    const hasEvidence = r.scored && !r.withheld;
    if (!hasEvidence) {
      withheldFilms++;
      for (const ax of AXES) {
        withheldAxisSlots++;
        const a = r.axes[ax];
        if (a && a.score !== null && a.score !== undefined) {
          viol.push({ key: r.key, title: r.title, axis: ax, score: a.score, reason: r.withheld || "not-scored" });
        }
      }
    } else {
      for (const ax of AXES) {
        const a = r.axes[ax];
        if (!a || a.score === null || a.score === undefined) nullAxisSlots++;
        else if (!a.basis || !String(a.basis).trim()) {
          viol.push({ key: r.key, title: r.title, axis: ax, score: a.score, reason: "score with no basis" });
        }
      }
    }
  }
  return {
    name: "GATE 4  NULL HONESTY",
    withheldFilms, withheldAxisSlots,
    nullAxisSlotsAmongScored: nullAxisSlots,
    violations: viol.length,
    examples: viol.slice(0, 5),
    pass: viol.length === 0,
  };
}

/* ---------------------------------------------------------------- GATE 5 */

function gate5(ctx) {
  const scored = ctx.rows.filter((r) => r.scored && r.views != null);
  const x = [], y = [];
  for (const r of scored) {
    if (r.axisConfidence === null || r.axisConfidence === undefined) continue;
    x.push(r.axisConfidence); y.push(r.views);
  }
  const shipped = rhoWithCI(x, y);

  /* Every candidate formulation, measured, not asserted — the brief asks for the
     best one AVAILABLE from plot sections and for its number to be stated, and
     the only way to know which is best is to compute all of them on the same
     films. Two of these are known-bad and are here as controls. */
  const cands = {};
  const names = new Set();
  for (const r of scored) for (const k of Object.keys(r.confidenceCandidates || {})) names.add(k);
  names.add("plot-length-raw");
  names.add("full-article-length [CONTROL, forbidden]");
  for (const nm of names) {
    const cx = [], cy = [];
    for (const r of scored) {
      let v;
      if (nm === "plot-length-raw") v = r.plotChars;
      else if (nm.startsWith("full-article-length")) v = r.fullChars;
      else v = (r.confidenceCandidates || {})[nm];
      if (v === null || v === undefined) continue;
      cx.push(v); cy.push(r.views);
    }
    const uniq = new Set(cx).size;
    cands[nm] = Object.assign(rhoWithCI(cx, cy), { distinctValues: uniq, degenerate: uniq <= 1 });
  }

  /* ADDED CHECK: the scores themselves. */
  const scoreFame = {};
  let scoreFamePass = true;
  for (const ax of AXES) {
    const sx = [], sy = [];
    for (const r of scored) {
      const a = r.axes[ax];
      if (!a || a.score === null || a.score === undefined) continue;
      sx.push(a.score); sy.push(r.views);
    }
    const m = rhoWithCI(sx, sy);
    scoreFame[ax] = m;
    if (m.rho !== null && Math.abs(m.rho) > SCORE_FAME_MAX_RHO) scoreFamePass = false;
  }

  /* A CONSTANT CONFIDENCE PASSES THIS GATE VACUOUSLY, and the report must say
     the word. It is flat against fame because it carries no information at all,
     not because it was well designed — the plot-source measurement predicted
     exactly this outcome, with the fame structure pushed entirely into WHICH
     films are null rather than into how confident the scored ones are. That is
     a defensible thing to ship (a null does not enter the graph; a fame-shaped
     confidence number would) and an indefensible thing to quote as a pass
     without the adjective. */
  const vacuous = !!shipped.degenerate || !!shipped.effectivelyConstant;
  const pass = vacuous || (shipped.rho !== null && Math.abs(shipped.rho) <= GATE5_MAX_RHO);
  return {
    name: "GATE 5  CONFIDENCE IS NOT FAME",
    threshold: GATE5_MAX_RHO,
    shipped, vacuous,
    shippedFormulation: ctx.fp.axisConfidenceFormulation || "(unstated)",
    candidates: cands,
    addedCheckScoreVsFame: scoreFame,
    addedCheckPass: scoreFamePass,
    pass,
  };
}

/* -------------------------------------------------------------------- report */

function fmt(v) { return v === null || v === undefined ? "  n/a " : (v >= 0 ? " " : "") + v.toFixed(4); }
function ci(c) { return c ? "[" + c[0].toFixed(3) + ", " + c[1].toFixed(3) + "]" : "[--]"; }

function runGates(ctx) {
  return [gate1(ctx), gate2(ctx), gate3(ctx), gate4(ctx), gate5(ctx)];
}

/* GATE 2 and GATE 3 already fail on this corpus, on specific axes. So "did the
   break fire" cannot be "did the gate fail" — it has to be "did an axis that was
   passing stop passing". Anything looser reports a break as caught when nothing
   about it was detected. */
function perAxisRegressed(before, after) {
  if (!before.per || !after.per) return before.pass && !after.pass;
  const was = new Map(before.per.map((p) => [p.axis, p.pass]));
  return after.per.some((p) => was.get(p.axis) === true && p.pass === false);
}

function printReport(ctx, gates, breakName) {
  const line = "=".repeat(78);
  console.log("\n" + line);
  console.log("ATLAS FINGERPRINT GATES" + (breakName ? "   *** BREAK RUN: " + breakName + " ***" : ""));
  if (breakName) console.log("  " + BREAKS[breakName]);
  console.log(line);
  const scored = ctx.rows.filter((r) => r.scored).length;
  console.log("sample " + ctx.rows.length + " films, " + scored + " scored, " +
    (ctx.rows.length - scored) + " withheld/null   model " + (ctx.fp.model || "?") +
    "   axisVersion " + (ctx.fp.axisVersion || "?"));
  console.log("pageviews resolved for " + ctx.rows.filter((r) => r.views != null).length + "/" + ctx.rows.length +
    " (60-day window " + ctx.plots.window.start + "-" + ctx.plots.window.end + ", cache only)");

  /* ---- 1 ---- */
  const g1 = gates[0];
  console.log("\n" + g1.name + "   variable: " + g1.variable + "   threshold rho <= " + g1.threshold);
  const g1row = (label, m, floorNote) => console.log("    " + label.padEnd(30) + "rho " + fmt(m.rho) + "  " + ci(m.ci95) +
    "  n=" + String(m.n).padStart(4) + (m.under ? "   under" : "   OVER THRESHOLD") + (floorNote || ""));
  console.log("  SOURCE STAGE — 400-film era x region stratified draw, the governing population" +
    (g1.sourceStage.recomputed ? "  [recomputed with the break variable]" : "  [read from plots.json]"));
  g1row("literal (no floor)", g1.sourceStage.literal);
  g1row("operative (floor " + ctx.plots.floor + " ch)", g1.sourceStage.operative, "   admitted " + (g1.sourceStage.admittedShare * 100).toFixed(1) + "%");
  console.log("  SCORED SAMPLE — the films this run actually read");
  g1row("literal  [SKEWED, see note]", g1.scoredSample.literal);
  g1row("operative (floor " + ctx.plots.floor + " ch)", g1.scoredSample.operative, "   <- what the scorer read");
  console.log("        the scored-sample LITERAL number is not a random draw: 25 withheld films were");
  console.log("        carried in deliberately so GATE 4 has something to check. Reported, not used.");
  console.log("  VERDICT " + (g1.pass ? "PASS" : "FAIL"));
  if (!g1.sourceStage.literal.under) {
    console.log("  NOTE: the UNFLOORED source is not fame-flat. This build stands on the");
    console.log("        minimum-evidence floor, which converts a score gradient into a");
    console.log("        coverage gradient. That is a remedy the owner must accept explicitly.");
  }

  /* ---- 2 ---- */
  const g2 = gates[1];
  console.log("\n" + g2.name + "   pole cut <=" + POLE_LOW + " / >=" + POLE_HIGH + "   band " +
    (POLE_MIN_SHARE * 100) + "-" + (POLE_MAX_SHARE * 100) + "% at EACH pole");
  console.log("  axis        n    low%   high%   |  sens<=20  >=80  |  sigma   old sigma>=8?   verdict");
  for (const p of g2.per) {
    console.log("  " + p.axis.padEnd(10) + String(p.n).padStart(4) +
      String(p.lowShare).padStart(7) + String(p.highShare).padStart(8) + "   |" +
      String(p.sensLow).padStart(9) + String(p.sensHigh).padStart(6) + "  |" +
      String(p.sigma).padStart(7) + "   " + (p.oldSigmaCheckPasses ? "PASSES" : "fails ").padEnd(14) +
      (p.pass ? "PASS" : "FAIL" + (p.lowOk ? "" : " low") + (p.highOk ? "" : " high")));
  }
  console.log("  score distribution, deciles 0-9 .. 90-100 (the shape a pass/fail cannot show):");
  for (const p of g2.per) console.log("    " + p.axis.padEnd(10) + p.hist.map((h) => String(h).padStart(4)).join(""));
  console.log("  VERDICT " + (g2.pass ? "PASS" : "FAIL"));

  /* ---- 3 ---- */
  const g3 = gates[2];
  console.log("\n" + g3.name + "   per axis, never pooled");
  for (const p of g3.per) {
    console.log("  " + p.axis.padEnd(10) + (p.pass ? "PASS" : "FAIL") +
      "   inversions " + p.fullInversions + "/" + p.fullPairs + " full, " +
      p.withheldInversions + "/" + p.withheldPairs + " withheld-only");
    console.log("      order (a=anchor shown, w=withheld):  " + p.order);
    if (p.margins.length) {
      console.log("      adjacent margins: " + p.margins.map((m) => m.from + "->" + m.to + " " +
        (m.delta > 0 ? "+" : "") + m.delta).join("   "));
    }
    if (!p.runnable) console.log("      NOT RUNNABLE: " + p.missing.join("; "));
  }
  console.log("  VERDICT " + (g3.pass ? "PASS" : "FAIL"));

  /* ---- 4 ---- */
  const g4 = gates[3];
  console.log("\n" + g4.name);
  console.log("  films with no admitted plot: " + g4.withheldFilms + "  (" + g4.withheldAxisSlots + " axis slots that MUST be null)");
  console.log("  null axis slots among scored films: " + g4.nullAxisSlotsAmongScored + "  (a scorer that never says 'no evidence' is guessing)");
  console.log("  violations: " + g4.violations + "    VERDICT " + (g4.pass ? "PASS" : "FAIL"));
  for (const v of g4.examples) console.log("      " + v.title + " / " + v.axis + " = " + v.score + "  (" + v.reason + ")");

  /* ---- 5 ---- */
  const g5 = gates[4];
  console.log("\n" + g5.name + "   threshold |rho| <= " + g5.threshold);
  console.log("  SHIPPED: " + g5.shippedFormulation);
  console.log("    rho " + fmt(g5.shipped.rho) + "  " + ci(g5.shipped.ci95) + "  n=" + g5.shipped.n +
    "    VERDICT " + (g5.pass ? (g5.vacuous ? "PASS — BUT VACUOUS" : "PASS") : "FAIL"));
  if (g5.vacuous) {
    console.log("      the shipped confidence takes ONE value on " + (g5.shipped.modalShare * 100).toFixed(1) +
      "% of scored films. It is flat against");
    console.log("      fame because it carries almost no information, not because it is good. All");
    console.log("      the fame structure has moved into WHICH films are null. That is the honest");
    console.log("      floor of this problem, and it must be quoted with the adjective.");
  }
  console.log("  all candidate formulations, same films:");
  const rowsC = Object.entries(g5.candidates).sort((a, b) => Math.abs(a[1].rho || 9) - Math.abs(b[1].rho || 9));
  for (const [nm, m] of rowsC) {
    console.log("    " + nm.padEnd(40) + fmt(m.rho) + "  " + ci(m.ci95) + "  n=" + String(m.n).padStart(4) +
      "  modal " + (m.modalShare * 100).toFixed(0).padStart(3) + "%" +
      (m.degenerate ? "   DEGENERATE (constant: flat by construction, measures nothing)" :
        m.effectivelyConstant ? "   EFFECTIVELY CONSTANT (the rho is carried by a handful of films)" : ""));
  }
  console.log("  ADDED CHECK (not one of the five) — the SCORES against fame, |rho| <= " + SCORE_FAME_MAX_RHO + ":");
  for (const ax of AXES) {
    const m = g5.addedCheckScoreVsFame[ax];
    console.log("    " + ax.padEnd(12) + fmt(m.rho) + "  " + ci(m.ci95) + "  n=" + m.n +
      (m.rho !== null && Math.abs(m.rho) > SCORE_FAME_MAX_RHO ? "   OVER" : ""));
  }

  console.log("\n" + line);
  const verdicts = gates.map((g) => (g.pass ? "PASS" : "FAIL"));
  gates.forEach((g, i) => console.log("  " + verdicts[i].padEnd(5) + g.name));
  const all = gates.every((g) => g.pass);
  console.log("  OVERALL: " + (all ? "ALL FIVE PASS" : "NOT ALL GATES PASS"));
  console.log(line + "\n");
  return all;
}

/* ---------------------------------------------------------------------- main */

function makeCtx() {
  const { plots, ladders, fp } = loadAll();
  /* Deep copy: a break must never be able to touch the files on disk. */
  return {
    plots,
    ladders: JSON.parse(JSON.stringify(ladders)),
    fp,
    rows: buildRows(fp, plots),
    gate1Source: "plot",
  };
}

function main() {
  const a = process.argv.slice(2);
  let brk = null, all = false, json = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--break") { brk = a[++i]; if (brk === "all") { all = true; brk = null; } }
    else if (a[i] === "--json") json = true;
    else if (a[i] === "--help" || a[i] === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]); process.exit(0);
    } else { console.error("unknown flag: " + a[i]); process.exit(2); }
  }

  if (all) {
    /* Every gate, broken in turn, each printed beside the honest run. This is
       the whole point of the file: a check nobody has watched fail is a check
       that lies. */
    const base = makeCtx();
    const baseGates = runGates(base);
    printReport(base, baseGates, null);
    const summary = [];
    for (const name of Object.keys(BREAKS)) {
      const ctx = makeCtx();
      applyBreak(name, ctx);
      const gs = runGates(ctx);
      printReport(ctx, gs, name);
      const idx = { "gate1-full": 0, "gate2-constant": 1, "gate2-defaulted": 1, "gate3-shuffle": 2, "gate4-default": 3, "gate5-fullchars": 4 }[name];
      /* Compared against the HONEST baseline, not against absolute PASS. Two
         gates fail on this corpus before any break is applied, and a ledger that
         did not subtract the baseline would report every break as having broken
         them — which would make the ledger itself the thing that lies. */
      const fired = baseGates[idx].pass ? !gs[idx].pass : perAxisRegressed(baseGates[idx], gs[idx]);
      const collateral = gs.map((g, i) => (i !== idx && baseGates[i].pass && !g.pass ? g.name : null)).filter(Boolean);
      summary.push({ name, target: gs[idx].name, firedCorrectly: fired, others: collateral });
    }
    console.log("=".repeat(78));
    console.log("BREAK LEDGER — a gate that was not watched to fail is UNPROVEN");
    console.log("=".repeat(78));
    for (const s of summary) {
      console.log("  " + (s.firedCorrectly ? "FIRED " : "SILENT") + "  " + s.name.padEnd(18) + s.target +
        (s.others.length ? "   (also failed: " + s.others.join(", ") + ")" : ""));
    }
    const proven = summary.every((s) => s.firedCorrectly);
    console.log("  " + (proven ? "every break fired: all gates proven capable of failing" :
      "SOME BREAK DID NOT FIRE — those gates are UNPROVEN and must not be quoted as passing"));
    console.log("=".repeat(78) + "\n");
    process.exit(proven ? 0 : 1);
  }

  const ctx = makeCtx();
  if (brk) {
    if (!BREAKS[brk]) { console.error("unknown break: " + brk + "\nknown: " + Object.keys(BREAKS).join(", ")); process.exit(2); }
    applyBreak(brk, ctx);
  }
  const gates = runGates(ctx);
  if (json) { console.log(JSON.stringify({ break: brk, gates }, null, 1)); }
  const ok = printReport(ctx, gates, brk);
  /* On a break run, FAILING is the correct outcome — exit 0 only if the break
     was caught. On an honest run, exit 0 only if every gate passes. */
  if (brk) process.exit(ok ? 1 : 0);
  process.exit(ok ? 0 : 1);
}

module.exports = {
  AXES, POLE_LOW, POLE_HIGH, POLE_MIN_SHARE, POLE_MAX_SHARE,
  GATE1_MAX_RHO, GATE5_MAX_RHO, SCORE_FAME_MAX_RHO,
  cachedViews, canonicalTitle, wikitextFor, fullCharsFor,
  rhoWithCI, sigma, gate1, gate2, gate3, gate4, gate5, runGates, applyBreak, BREAKS,
};

if (require.main === module) main();
