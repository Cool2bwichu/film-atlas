#!/usr/bin/env node
/* measure-layout.js — does the constellation still obey AGENTS rule 1?
 *
 *   node pipeline/measure-layout.js                 # whole atlas, gates, PASS/FAIL
 *   node pipeline/measure-layout.js --strata        # + every baked stratum and register
 *   node pipeline/measure-layout.js --selftest      # prove every check can fail
 *   node pipeline/measure-layout.js --json out.json # machine-readable, for a baseline
 *   node pipeline/measure-layout.js --write-baseline
 *
 * ── WHY THIS FILE EXISTS, AND WHY ITS ABSENCE WAS THE BUG ───────────────────
 *
 * AGENTS rule 1: edge distance encodes formal bond strength, never popularity
 * or node degree. `app/layout-sky.js` is written to that rule, cites this
 * harness by name eleven times, and quotes its numbers as the justification for
 * every tuned constant in it — restWeak 48 over the 110 and 180 that "score
 * better", the choice of Barnes-Hut over stress majorization, stiffExp 5.5.
 *
 * The harness itself was never committed. It lived in a scratchpad, was thrown
 * away with the session that wrote it, and every number quoted from it since
 * has been a number nobody could re-derive. Over the harvest from 803 films to
 * 2,204, bondFit went from -0.649 to -0.416 — a 36% loss of the single property
 * rule 1 is about — and no instrument in the repository said a word, because no
 * instrument in the repository could. `validate-corpus.js` checks the graph,
 * `measure-maps.js` and `measure-claims.js` check what a reader reads. Nothing
 * checked what a reader *measures with their eyes*.
 *
 * So this file is committed, gated, and required to be breakable. `--selftest`
 * deliberately inverts the solver's strength-to-rest-length mapping and asserts
 * bondFit goes POSITIVE, shuffles the layout and asserts every spatial statistic
 * collapses to its null, and plants a degree-ordered layout and asserts
 * degreeBias saturates. A check nobody has watched fail is a check that lies —
 * that is AGENTS.md's own standard for the geometry probe and it applies here.
 *
 * ── WHAT IT MEASURES ────────────────────────────────────────────────────────
 *
 *   bondFit        Spearman(edge strength, rendered euclidean length). MUST be
 *                  negative: stronger bond, shorter line. This is rule 1 stated
 *                  as an arithmetic fact about the picture that shipped.
 *
 *   bondFitCeiling the best bondFit the strength distribution ALLOWS. Strength
 *                  has heavy ties (15% of edges sit at exactly 0.60) and a tied
 *                  predictor caps |rho| below 1. Reporting bondFit without its
 *                  ceiling invites blaming the layout for the corpus.
 *
 *   degreeBias     Spearman(degree, distance from the layout centroid). The
 *                  header of layout-sky.js admits that in ANY force layout a
 *                  well-connected film drifts toward the middle, states that
 *                  this is emergent from topology rather than applied as a
 *                  weight, and asks for it to be MEASURED rather than assumed.
 *                  Negative means the well-connected sit centrally. It is
 *                  reported, and gated on magnitude, not on existence: the
 *                  offence rule 1 names is *encoding* degree, and the remedy the
 *                  design already ships is that disc size and caption weight
 *                  never vary with it.
 *
 *   closerP        P(a connected pair renders closer than an unconnected pair).
 *                  This is the statistic that decided the layout bake-off:
 *                  Barnes-Hut 0.763, spectral 0.602, stress 0.581 at n=803. It
 *                  is scale-free — it ranks the layout's distances against its
 *                  own — so it cannot be won by spreading the cloud out.
 *
 *   weakCloserP    the same statistic for the WEAKEST strength decile, and the
 *   weakRatio      median(weakest-decile length) / median(unconnected distance).
 *                  layout-sky.js names this ratio as the constraint restWeak is
 *                  tuned against, quotes 0.83, requires it below 1.0 — and then
 *                  says, in the source, "If you retune this file, re-check that
 *                  ratio; the harness will not." Now it does. Above 1.0 the map
 *                  is asserting that a weak tie is evidence of unrelatedness,
 *                  which is the opposite of what drawing an edge means.
 *
 *   nnLift         among a film's K nearest neighbours, how much more often than
 *                  chance do they share its director / country / era. The sky is
 *                  handed films and edges and nothing else, so any lift here is
 *                  emergent from the graph — but "emergent" is a description of
 *                  the cause, not a verdict on the picture, and a constellation
 *                  that draws filmography needs to be caught doing it.
 *
 *   spacing        median nearest-neighbour distance. DESIGN.md's disc-size and
 *                  re-form-scale arithmetic both rest on this being 0.669/sqrt(N)
 *                  at every corpus size; it is an assumption load-bearing in two
 *                  places and measured in none.
 *
 * ── WHAT IT MEASURES IT ON ──────────────────────────────────────────────────
 *
 * The whole-atlas layout, AND all 44 baked strata and 28 baked registers. Those
 * 72 re-formed constellations are 72 more surfaces for the same failure and
 * nothing has ever measured one. They are not solved by different code — they
 * are `layout()` again over a subset — but they are solved at a different N,
 * with a different density, and with the circular signals excluded, and bondFit
 * is strongly N-dependent (see the RUN NOTES at the bottom of this file).
 *
 * The positions are not read from a built artifact by default. `layout()` is
 * seeded and deterministic, so re-solving here reproduces the baked layout
 * exactly — verified byte-identical against the LAYOUT block of a built
 * atlas.html, and re-verifiable at any time with --artifact. Re-solving rather
 * than parsing means the tool measures what the NEXT build will bake, which is
 * the thing a regression gate has to be able to see.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { layout, LAYOUT_ALGORITHM_VERSION } = require("../app/layout-sky.js");
const { strataLayouts, CIRCULAR, MIN_FILMS, STRATA_LAYOUT_VERSION } =
  require("../app/layout-strata.js");

/* ── arguments ───────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes("--" + n);
const arg = (n, d) => {
  const i = argv.indexOf("--" + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`--${n} requires a value`);
  return v;
};

const CORPUS_PATH = path.resolve(ROOT, arg("corpus", path.join("static", "corpus.json")));
const DISCOVERY_PATH = path.resolve(ROOT, arg("discovery", path.join("static", "discovery.json")));
const REGISTERS_PATH = path.resolve(ROOT, arg("registers", path.join("static", "registers.json")));
const BASELINE_PATH = path.resolve(ROOT, arg("baseline", path.join("pipeline", "layout-baseline.json")));
const ARTIFACT = arg("artifact", null);
const JSON_OUT = arg("json", null);
const KNN = parseInt(arg("knn", "12"), 10);
const PAIRS = parseInt(arg("pairs", "300000"), 10);
const DO_STRATA = flag("strata");
const DO_SELFTEST = flag("selftest");
const WRITE_BASELINE = flag("write-baseline");

/* ── gates ───────────────────────────────────────────────────────────────────
 *
 * Two kinds, deliberately.
 *
 * INVARIANTS are absolute and non-negotiable, and every one of them is a
 * restatement of something already settled in AGENTS.md or in layout-sky.js's
 * own source. They are not set at today's measured value: they are set where
 * the picture stops meaning what it claims to mean. bondFit at -0.25 is still
 * negative and is still a map in which a reader cannot read strength off a
 * length; weakRatio at 1.0 is a map asserting the opposite of what an edge is.
 *
 * The REGRESSION gate is what would have caught the thing this file exists
 * because of. Absolute floors cannot: -0.649 -> -0.416 never crossed one. So
 * every metric is also compared against a committed baseline, and a slide past
 * tolerance FAILS even while the invariant still passes. A baseline that moves
 * has to move in a commit, with a person's name on it.
 */
const INVARIANTS = {
  bondFitMax: -0.25,      /* must be clearly negative, not merely not-positive  */
  closerPMin: 0.70,       /* stress majorization scored 0.581 and was rejected  */
  weakCloserPMin: 0.52,   /* a weak tie must still mean "closer than chance"    */
  weakRatioMax: 1.00,     /* layout-sky.js's own stated constraint             */
  degreeBiasMax: 0.55,    /* |rho|; emergent centrality is allowed, a gradient
                             this steep is the layout drawing degree outright   */
};
/* Strata are smaller and denser-per-film varies wildly (10 films to 1,552), and
   bondFit is strongly N-dependent, so a stratum is held to the invariants but
   the aggregate gate is on the WORST stratum rather than on each one at the
   whole-atlas floor. */
const STRATUM_INVARIANTS = {
  bondFitMax: -0.25,
  closerPMin: 0.65,
  weakCloserPMin: 0.45,
  weakRatioMax: 1.00,
  degreeBiasMax: 0.60,
};
/* Tolerances: how far a metric may drift from the baseline before it is a
   regression rather than noise. The solver is deterministic, so run-to-run
   noise is exactly zero; these absorb corpus edits, not jitter. */
const TOLERANCE = {
  bondFit: 0.030,         /* toward zero                                       */
  closerP: 0.020,         /* downward                                          */
  weakCloserP: 0.030,     /* downward                                          */
  weakRatio: 0.080,       /* upward                                            */
  degreeBias: 0.060,      /* in magnitude                                      */
  nnLiftDirector: 3.00,   /* upward — the sky drawing more filmography          */
};

/* ── statistics ──────────────────────────────────────────────────────────── */

/* Average ranks. Ties matter enormously here: 15% of this corpus's edges carry
   strength exactly 0.60 and another 14% sit within 0.02 of it, so the naive
   "sort and number" ranking would invent an ordering the corpus never stated
   and report a correlation for it. */
function rankAvg(v) {
  const n = v.length;
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const order = Array.prototype.slice.call(idx).sort((a, b) => v[a] - v[b]);
  const r = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && v[order[j + 1]] === v[order[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let t = i; t <= j; t++) r[order[t]] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(a, b) {
  const n = a.length;
  if (n < 3) return NaN;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  const d = Math.sqrt(saa * sbb);
  return d === 0 ? 0 : sab / d;
}

const spearman = (x, y) => pearson(rankAvg(x), rankAvg(y));

function median(a) {
  if (!a.length) return NaN;
  const b = Float64Array.from(a).sort();
  const h = b.length >> 1;
  return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
}

/* The same generator layout-sky.js uses, for the same reason: every sampled
   statistic below must return the same number on a second run or a regression
   gate built on it is noise with a threshold painted on. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── the measurement ─────────────────────────────────────────────────────── */

/* attrs: { director: Map(key -> string|null), country: Map(key -> Set), era: ... }
   Multi-valued attributes are Sets and count as shared on any overlap. */
function measureLayout(label, films, edges, positions, attrs, opts) {
  const o = Object.assign({ knn: KNN, pairs: PAIRS, seed: 0x1a7e5 }, opts || {});
  const keys = Object.keys(films);
  const n = keys.length;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  const at = new Map();
  for (let i = 0; i < n; i++) {
    const p = positions[keys[i]];
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      throw new Error(`${label}: no valid position for ${keys[i]}`);
    }
    xs[i] = p[0]; ys[i] = p[1]; at.set(keys[i], i);
  }

  /* ---- bondFit -------------------------------------------------------- */
  const S = new Float64Array(edges.length), L = new Float64Array(edges.length);
  const degree = new Int32Array(n);
  let m = 0;
  for (const e of edges) {
    const i = at.get(e.a), j = at.get(e.b);
    if (i === undefined || j === undefined || i === j) continue;
    S[m] = Math.max(0, Math.min(1, e.strength || 0));
    L[m] = Math.hypot(xs[i] - xs[j], ys[i] - ys[j]);
    degree[i]++; degree[j]++;
    m++;
  }
  const Sv = S.subarray(0, m), Lv = L.subarray(0, m);
  const bondFit = m >= 3 ? spearman(Sv, Lv) : NaN;

  /* The ceiling: the best bondFit this strength distribution permits, given
     that rendered length is continuous and strength is not. Assign the ideal
     perfectly-monotone length and re-run the same estimator. */
  let bondFitCeiling = NaN;
  if (m >= 3) {
    const ord = Array.from({ length: m }, (_, i) => i).sort((a, b) => Sv[a] - Sv[b]);
    const ideal = new Float64Array(m);
    for (let i = 0; i < m; i++) ideal[ord[i]] = m - i;   /* strongest -> shortest */
    bondFitCeiling = spearman(Sv, ideal);
  }

  /* ---- degreeBias ----------------------------------------------------- */
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += xs[i]; cy += ys[i]; }
  cx /= n; cy /= n;
  const dist = new Float64Array(n), deg = new Float64Array(n);
  for (let i = 0; i < n; i++) { dist[i] = Math.hypot(xs[i] - cx, ys[i] - cy); deg[i] = degree[i]; }
  const degreeBias = n >= 3 ? spearman(deg, dist) : NaN;

  /* ---- closerP, weakCloserP, weakRatio -------------------------------- */
  const rnd = mulberry32(o.seed);
  const connected = new Set();
  for (const e of edges) {
    const i = at.get(e.a), j = at.get(e.b);
    if (i === undefined || j === undefined) continue;
    connected.add(i < j ? i * n + j : j * n + i);
  }
  /* Sample UNCONNECTED pairs rather than enumerating them: n^2/2 is 2.4M for
     the whole atlas, which is affordable, but the same code has to run for a
     10-film register where enumeration and sampling agree anyway. */
  const unc = [];
  const budget = Math.min(o.pairs, 60000);
  for (let t = 0; t < budget * 6 && unc.length < budget; t++) {
    const i = (rnd() * n) | 0, j = (rnd() * n) | 0;
    if (i === j) continue;
    if (connected.has(i < j ? i * n + j : j * n + i)) continue;
    unc.push(Math.hypot(xs[i] - xs[j], ys[i] - ys[j]));
  }
  const ordS = Array.from({ length: m }, (_, i) => i).sort((a, b) => Sv[a] - Sv[b]);
  const weakN = Math.max(1, Math.floor(m / 10));
  const weakL = ordS.slice(0, weakN).map((i) => Lv[i]);

  const contest = (sample) => {
    if (!sample.length || !unc.length) return NaN;
    let win = 0;
    for (let t = 0; t < o.pairs; t++) {
      const a = sample[(rnd() * sample.length) | 0];
      const b = unc[(rnd() * unc.length) | 0];
      if (a < b) win++; else if (a === b) win += 0.5;
    }
    return win / o.pairs;
  };
  const closerP = contest(Array.prototype.slice.call(Lv));
  const weakCloserP = contest(weakL);
  const medUnc = median(unc);
  const weakRatio = median(weakL) / medUnc;

  /* ---- nearest-neighbour lift ----------------------------------------- */
  const K = Math.min(o.knn, n - 1);
  const nn = [];
  for (let i = 0; i < n; i++) {
    /* Partial selection rather than a full sort: n log n per film over 2,204
       films is 50M comparisons and this runs 73 times. */
    const best = [];
    let worst = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = xs[i] - xs[j], dy = ys[i] - ys[j];
      const d2 = dx * dx + dy * dy;
      if (best.length < K) {
        best.push([d2, j]);
        if (best.length === K) { best.sort((a, b) => a[0] - b[0]); worst = best[K - 1][0]; }
      } else if (d2 < worst) {
        let p = K - 1;
        while (p > 0 && best[p - 1][0] > d2) { best[p] = best[p - 1]; p--; }
        best[p] = [d2, j];
        worst = best[K - 1][0];
      }
    }
    nn.push(best.map((b) => b[1]));
  }

  const nnLift = {};
  for (const [field, table] of Object.entries(attrs || {})) {
    /* Films with no recorded value are excluded from both the observed rate and
       the baseline; counting an unknown as "does not share" would deflate both
       and report a lift that is a coverage artefact. */
    const have = [];
    for (let i = 0; i < n; i++) {
      const v = table.get(keys[i]);
      if (v === undefined || v === null) continue;
      if (v instanceof Set ? v.size === 0 : v === "") continue;
      have.push(i);
    }
    if (have.length < 20) { nnLift[field] = null; continue; }
    const shares = (i, j) => {
      const a = table.get(keys[i]), b = table.get(keys[j]);
      if (a === undefined || b === undefined || a === null || b === null) return false;
      if (a instanceof Set) { for (const v of a) if (b.has(v)) return true; return false; }
      return a === b;
    };
    let hit = 0, tot = 0;
    for (const i of have) {
      for (const j of nn[i]) {
        const v = table.get(keys[j]);
        if (v === undefined || v === null) continue;
        if (v instanceof Set ? v.size === 0 : v === "") continue;
        tot++;
        if (shares(i, j)) hit++;
      }
    }
    /* Exact expectation of the shuffle null, not a sampled one: for each film,
       the chance a uniformly chosen OTHER film with a recorded value shares it. */
    let base = 0;
    for (const i of have) {
      let c = 0;
      for (const j of have) if (j !== i && shares(i, j)) c++;
      base += c / (have.length - 1);
    }
    base /= have.length;
    const rate = tot ? hit / tot : NaN;
    nnLift[field] = {
      films: have.length, neighbours: tot, rate, baseline: base,
      lift: base > 0 ? rate / base : NaN,
    };
  }

  /* ---- spacing -------------------------------------------------------- */
  const nnd = [];
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = xs[i] - xs[j], dy = ys[i] - ys[j];
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    nnd.push(Math.sqrt(best));
  }
  const spacing = median(nnd);

  return {
    label, films: n, edges: m, meanDegree: n ? (2 * m) / n : 0,
    bondFit, bondFitCeiling, bondFitShare: bondFit / bondFitCeiling,
    degreeBias, closerP, weakCloserP, weakRatio,
    medianEdgeLength: median(Array.prototype.slice.call(Lv)), medianUnconnected: medUnc,
    spacing, spacingTimesSqrtN: spacing * Math.sqrt(n),
    nnLift,
  };
}

/* ── loading ─────────────────────────────────────────────────────────────── */

function loadAttributes(corpus, discovery) {
  const director = new Map(), country = new Map(), era = new Map();
  for (const [key, f] of Object.entries(corpus.films)) {
    const d = (f.director || "").trim();
    director.set(key, d && d !== "?" ? d.toLowerCase() : null);
    country.set(key, new Set());
    era.set(key, null);
  }
  const keyAt = discovery.filmOrder.map((id) => discovery.keyByFilmId[id]);
  for (const [value, list] of Object.entries(discovery.facets.postings.country || {})) {
    for (const i of list) { const k = keyAt[i]; if (k && country.has(k)) country.get(k).add(value); }
  }
  for (const [value, list] of Object.entries(discovery.facets.postings.era || {})) {
    for (const i of list) { const k = keyAt[i]; if (k && era.has(k)) era.set(k, value); }
  }
  return { director, country, era };
}

/* The whole-atlas layout, solved exactly the way app/build.js solves it. */
function wholeAtlas(corpus) {
  return layout(corpus.films, corpus.edges);
}

/* Dequantise a baked stratum blob back to positions. Reading the SHIPPED bytes
   rather than the pre-quantisation floats means the 16-bit wire format is inside
   the measurement, not assumed away by it. */
function dequantise(b64, order) {
  const buf = Buffer.from(b64, "base64");
  const u = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  if (u.length !== order.length * 2) throw new Error("stratum blob length disagrees with its posting list");
  const out = {};
  for (let i = 0; i < order.length; i++) out[order[i]] = [u[i * 2] / 65535, u[i * 2 + 1] / 65535];
  return out;
}

/* Reproduces the edge set layout-strata.js actually hands the solver: both ends
   inside, minus the signals the selection manufactures. CIRCULAR is imported
   rather than copied, so this cannot drift from the bake. */
function stratumEdges(corpus, keys, field) {
  const inside = new Set(keys);
  const all = corpus.edges.filter((e) => inside.has(e.a) && inside.has(e.b));
  const circ = CIRCULAR[field];
  const solver = circ && circ.size ? all.filter((e) => !circ.has(e.signal)) : all;
  return { all, solver };
}

/* ── the runs ────────────────────────────────────────────────────────────── */

function fmt(v, d) { return Number.isFinite(v) ? v.toFixed(d === undefined ? 4 : d) : "  n/a"; }
function pc(v) { return Number.isFinite(v) ? (v * 100).toFixed(1) + "%" : "n/a"; }

function printWhole(r) {
  console.log("── the whole atlas ─────────────────────────────────────────────────");
  console.log("films / edges            : " + r.films + " / " + r.edges +
    "   (mean degree " + r.meanDegree.toFixed(2) + ")");
  console.log("bondFit                  : " + fmt(r.bondFit) +
    "   (ceiling " + fmt(r.bondFitCeiling) + ", " + pc(r.bondFitShare) + " of achievable)");
  console.log("degreeBias               : " + fmt(r.degreeBias) +
    "   (negative = the well-connected sit central)");
  console.log("P(connected closer)      : " + fmt(r.closerP, 3) +
    "   (0.5 = chance; stress build scored 0.581 and was rejected)");
  console.log("  weakest decile          : " + fmt(r.weakCloserP, 3));
  console.log("weakRatio                : " + fmt(r.weakRatio, 3) +
    "   (layout-sky.js: must stay below 1.0; quoted 0.83 at n=803)");
  console.log("median edge / unconnected: " + fmt(r.medianEdgeLength) + " / " + fmt(r.medianUnconnected));
  console.log("spacing (median NN dist) : " + fmt(r.spacing, 5) +
    "   = " + fmt(r.spacingTimesSqrtN, 3) + "/sqrt(N)   (DESIGN.md asserts 0.669)");
  console.log("nearest-" + KNN + " neighbours share:");
  for (const [f, v] of Object.entries(r.nnLift)) {
    if (!v) { console.log("  " + f.padEnd(10) + " n/a"); continue; }
    console.log("  " + f.padEnd(10) + pc(v.rate).padStart(7) + "   baseline " + pc(v.baseline).padStart(7) +
      "   lift " + v.lift.toFixed(2) + "x");
  }
}

function gate(r, inv, fails, prefix) {
  const p = prefix ? prefix + ": " : "";
  if (!(r.bondFit <= inv.bondFitMax)) fails.push(`${p}bondFit ${fmt(r.bondFit)} is not at or below ${inv.bondFitMax}`);
  if (!(r.closerP >= inv.closerPMin)) fails.push(`${p}P(connected closer) ${fmt(r.closerP, 3)} is below ${inv.closerPMin}`);
  if (!(r.weakCloserP >= inv.weakCloserPMin)) fails.push(`${p}weakest-decile closer ${fmt(r.weakCloserP, 3)} is below ${inv.weakCloserPMin} — a weak tie is being drawn as evidence of unrelatedness`);
  if (!(r.weakRatio < inv.weakRatioMax)) fails.push(`${p}weakRatio ${fmt(r.weakRatio, 3)} is at or above ${inv.weakRatioMax} — see layout-sky.js on restWeak`);
  if (!(Math.abs(r.degreeBias) <= inv.degreeBiasMax)) fails.push(`${p}|degreeBias| ${fmt(Math.abs(r.degreeBias))} exceeds ${inv.degreeBiasMax} — the layout is drawing degree`);
}

function regression(now, base, fails) {
  if (!base) return;
  const check = (name, v, b, tol, dir) => {
    if (!Number.isFinite(v) || !Number.isFinite(b)) return;
    const slid = dir === "up" ? v - b : b - v;
    if (slid > tol) {
      fails.push(`REGRESSION ${name}: ${fmt(v)} against baseline ${fmt(b)} ` +
        `(moved ${slid.toFixed(4)}, tolerance ${tol})`);
    }
  };
  check("bondFit", now.bondFit, base.bondFit, TOLERANCE.bondFit, "up");
  check("closerP", now.closerP, base.closerP, TOLERANCE.closerP, "down");
  check("weakCloserP", now.weakCloserP, base.weakCloserP, TOLERANCE.weakCloserP, "down");
  check("weakRatio", now.weakRatio, base.weakRatio, TOLERANCE.weakRatio, "up");
  check("|degreeBias|", Math.abs(now.degreeBias), Math.abs(base.degreeBias), TOLERANCE.degreeBias, "up");
  if (now.nnLift.director && base.nnLift && base.nnLift.director) {
    check("nnLift.director", now.nnLift.director.lift, base.nnLift.director.lift,
      TOLERANCE.nnLiftDirector, "up");
  }
}

/* ── --selftest: prove every check can fail ──────────────────────────────── */

function selftest(corpus, discovery, attrs) {
  console.log("── SELFTEST: every check, deliberately broken ──────────────────────");
  console.log("A harness nobody has watched fail is a harness that lies.\n");
  const films = corpus.films, edges = corpus.edges;
  const results = [];
  const truth = measureLayout("control", films, edges, wholeAtlas(corpus), attrs, { pairs: 120000 });
  console.log("control (the shipped layout)");
  console.log("  bondFit " + fmt(truth.bondFit) + "   closerP " + fmt(truth.closerP, 3) +
    "   degreeBias " + fmt(truth.degreeBias) + "   director lift " + truth.nnLift.director.lift.toFixed(2) + "x");
  results.push(["control", truth]);

  /* 1. INVERT THE STRENGTH -> REST-LENGTH MAPPING.
     layout-sky.js computes rest = k*(restStrong + (1-s)^restExp * (restWeak-restStrong)),
     so feeding it (1 - s) makes the strongest bonds want to be the LONGEST —
     rule 1 stood exactly on its head. The layout is then scored against the
     TRUE strengths, so bondFit must go positive. This requires no edit to the
     solver: the inversion is in the input, which is the honest place for it. */
  const inverted = edges.map((e) => Object.assign({}, e, { strength: 1 - Math.max(0, Math.min(1, e.strength || 0)) }));
  const invPos = layout(films, inverted);
  const inv = measureLayout("inverted", films, edges, invPos, attrs, { pairs: 120000 });
  console.log("\n1. solver fed inverted strengths (strong bonds given long rest lengths)");
  console.log("  bondFit " + fmt(inv.bondFit) + "   closerP " + fmt(inv.closerP, 3) +
    "   weakRatio " + fmt(inv.weakRatio, 3));
  results.push(["inverted", inv]);

  /* 2. SHUFFLE THE POSITIONS. Every spatial statistic must collapse to its null:
     bondFit to 0, closerP to 0.5, every nearest-neighbour lift to 1.0. This is
     the check that the lifts are measuring the layout and not the corpus. */
  const keys = Object.keys(films);
  const rnd = mulberry32(0xdead);
  const real = wholeAtlas(corpus);
  const perm = keys.slice();
  for (let i = perm.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const shufPos = {};
  for (let i = 0; i < keys.length; i++) shufPos[keys[i]] = real[perm[i]];
  const shuf = measureLayout("shuffled", films, edges, shufPos, attrs, { pairs: 120000 });
  console.log("\n2. positions shuffled between films (the layout destroyed, the cloud kept)");
  console.log("  bondFit " + fmt(shuf.bondFit) + "   closerP " + fmt(shuf.closerP, 3) +
    "   degreeBias " + fmt(shuf.degreeBias));
  console.log("  lifts: " + Object.entries(shuf.nnLift).map(([f, v]) => f + " " + v.lift.toFixed(2) + "x").join("   "));
  results.push(["shuffled", shuf]);

  /* 3. PLANT A DEGREE-ORDERED LAYOUT. Films are laid on a spiral sorted by
     degree, most-connected at the centre — a popularity chart wearing a star
     map's clothes, which is exactly the thing rule 1 forbids. degreeBias must
     saturate toward -1. */
  const degree = new Map(keys.map((k) => [k, 0]));
  for (const e of edges) { degree.set(e.a, degree.get(e.a) + 1); degree.set(e.b, degree.get(e.b) + 1); }
  const byDeg = keys.slice().sort((a, b) => degree.get(b) - degree.get(a) || (a < b ? -1 : 1));
  const degPos = {};
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < byDeg.length; i++) {
    const r = 0.49 * Math.sqrt((i + 0.5) / byDeg.length), a = i * GOLDEN;
    degPos[byDeg[i]] = [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)];
  }
  const degL = measureLayout("degree-ordered", films, edges, degPos, attrs, { pairs: 120000 });
  console.log("\n3. positions laid out by degree, most-connected at the centre");
  console.log("  degreeBias " + fmt(degL.degreeBias) + "   bondFit " + fmt(degL.bondFit) +
    "   closerP " + fmt(degL.closerP, 3));
  results.push(["degree-ordered", degL]);

  /* 4. A DIRECTOR-CLUSTERED LAYOUT, to prove the nnLift number can move. */
  const dirOf = attrs.director;
  const groups = new Map();
  for (const k of keys) { const d = dirOf.get(k) || "?"; if (!groups.has(d)) groups.set(d, []); groups.get(d).push(k); }
  const byDir = [].concat(...[...groups.values()]);
  const dirPos = {};
  for (let i = 0; i < byDir.length; i++) {
    const r = 0.49 * Math.sqrt((i + 0.5) / byDir.length), a = i * GOLDEN;
    dirPos[byDir[i]] = [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)];
  }
  const dirL = measureLayout("director-clustered", films, edges, dirPos, attrs, { pairs: 120000 });
  console.log("\n4. positions laid out with a director's films adjacent");
  console.log("  director lift " + dirL.nnLift.director.lift.toFixed(2) + "x" +
    "   bondFit " + fmt(dirL.bondFit) + "   closerP " + fmt(dirL.closerP, 3));
  results.push(["director-clustered", dirL]);

  /* ---- assertions ---- */
  const checks = [
    ["bondFit goes POSITIVE when the rest-length mapping is inverted", inv.bondFit > 0.15],
    ["bondFit collapses to ~0 when positions are shuffled", Math.abs(shuf.bondFit) < 0.05],
    ["closerP collapses to ~0.5 when positions are shuffled", Math.abs(shuf.closerP - 0.5) < 0.03],
    ["weakCloserP collapses to ~0.5 when positions are shuffled", Math.abs(shuf.weakCloserP - 0.5) < 0.03],
    ["weakRatio goes to ~1.0 when positions are shuffled", Math.abs(shuf.weakRatio - 1) < 0.06],
    ["degreeBias collapses to ~0 when positions are shuffled", Math.abs(shuf.degreeBias) < 0.05],
    ["every nnLift collapses to ~1.0 when positions are shuffled",
      Object.values(shuf.nnLift).every((v) => Math.abs(v.lift - 1) < 0.25)],
    ["degreeBias saturates on a degree-ordered layout", degL.degreeBias < -0.90],
    ["the shipped layout is FAR from that", Math.abs(truth.degreeBias) < 0.90],
    ["director lift explodes on a director-clustered layout", dirL.nnLift.director.lift > truth.nnLift.director.lift * 3],
    ["the shipped layout's bondFit is negative", truth.bondFit < -0.25],
    ["the inverted layout would FAIL the shipped gate", !(inv.bondFit <= INVARIANTS.bondFitMax)],
  ];
  console.log("\n── assertions ─────────────────────────────────────────────────────");
  let bad = 0;
  for (const [name, ok] of checks) {
    console.log((ok ? "  ok   " : "  FAIL ") + name);
    if (!ok) bad++;
  }
  console.log();
  if (bad) { console.log(`SELFTEST FAIL — ${bad} of ${checks.length} controls did not behave`); process.exit(1); }
  console.log(`SELFTEST PASS — ${checks.length} controls, every check demonstrably breakable`);
  return results;
}

/* ── main ────────────────────────────────────────────────────────────────── */

function main() {
  const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
  const discovery = JSON.parse(fs.readFileSync(DISCOVERY_PATH, "utf8"));
  const attrs = loadAttributes(corpus, discovery);

  console.log("measure-layout.js — AGENTS rule 1, measured on the layout that ships");
  console.log("solver " + LAYOUT_ALGORITHM_VERSION + " / strata " + STRATA_LAYOUT_VERSION +
    " / corpus " + corpus.meta.corpusVersion);
  console.log();

  if (DO_SELFTEST) { selftest(corpus, discovery, attrs); return; }

  const t0 = Date.now();
  const positions = wholeAtlas(corpus);

  /* Optional: prove the re-solve above really is the layout that shipped. */
  if (ARTIFACT) {
    const html = fs.readFileSync(path.resolve(ROOT, ARTIFACT), "utf8");
    const head = "const LAYOUT = JSON.parse([";
    const i = html.indexOf(head);
    if (i < 0) throw new Error(`${ARTIFACT} has no embedded LAYOUT block`);
    const j = html.indexOf('].join(""));', i);
    const baked = JSON.parse(JSON.parse("[" + html.slice(i + head.length, j) + "]").join(""));
    let worst = 0, missing = 0;
    for (const filmId of discovery.filmOrder) {
      const key = discovery.keyByFilmId[filmId];
      const a = baked.positions[filmId], b = positions[key];
      if (!a || !b) { missing++; continue; }
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
    console.log("artifact cross-check     : " + path.basename(ARTIFACT) +
      "  solver " + baked.algorithmVersion + "  strata " + baked.strataAlgorithmVersion +
      "  worst position delta " + worst.toExponential(2) + (missing ? "  MISSING " + missing : ""));
    if (baked.strataAlgorithmVersion !== STRATA_LAYOUT_VERSION) {
      console.log("  NOTE: that artifact was baked by a different strata version than HEAD — " +
        "its stratum blobs are stale, rebuild before trusting them.");
    }
    console.log();
  }

  const whole = measureLayout("whole atlas", corpus.films, corpus.edges, positions, attrs);
  printWhole(whole);

  const out = { generated: new Date().toISOString(), solver: LAYOUT_ALGORITHM_VERSION,
    strataSolver: STRATA_LAYOUT_VERSION, corpusVersion: corpus.meta.corpusVersion, whole, strata: [] };

  const fails = [];
  gate(whole, INVARIANTS, fails);

  if (DO_STRATA) {
    console.log("\n── the baked strata and registers ──────────────────────────────────");
    const keyAt = discovery.filmOrder.map((id) => discovery.keyByFilmId[id]);
    const jobs = [];

    const { strata } = strataLayouts(corpus, discovery);
    for (const field of ["genre", "country", "era"]) {
      const post = discovery.facets.postings[field] || {};
      for (const [value, list] of Object.entries(post)) {
        if (list.length < MIN_FILMS) continue;
        jobs.push({ field, value, order: list.map((i) => keyAt[i]), blob: strata[value] });
      }
    }
    let registerCount = 0;
    if (fs.existsSync(REGISTERS_PATH)) {
      const REG = JSON.parse(fs.readFileSync(REGISTERS_PATH, "utf8"));
      if (REG.identityVersion !== discovery.identityVersion) {
        throw new Error("registers.json was built against a different identity version — re-run build-registers.js");
      }
      const { strata: regStrata } = strataLayouts(corpus, discovery, { register: REG.postings }, { minFilms: 8, facets: [] });
      for (const [id, list] of Object.entries(REG.postings)) {
        if (list.length < 8) continue;
        jobs.push({ field: "register", value: id, order: list.map((i) => keyAt[i]), blob: regStrata[id] });
        registerCount++;
      }
    }

    console.log("field      value                     films  edges  bondFit  closerP weakClsr weakRatio  degBias  dirLift");
    const rows = [];
    for (const job of jobs) {
      if (!job.blob) throw new Error(`no baked layout for ${job.field}:${job.value}`);
      const pos = dequantise(job.blob, job.order);
      const films = {}; for (const k of job.order) films[k] = corpus.films[k];
      const { all, solver } = stratumEdges(corpus, job.order, job.field);
      const r = measureLayout(job.field + ":" + job.value, films, solver, pos, attrs, { pairs: 60000 });
      /* Also score against every in-stratum edge, including the circular ones
         the solver never saw — those are drawn on screen and a reader measures
         them too. Reported, not gated: the solver cannot be held to a spring it
         was deliberately not given. */
      const drawn = measureLayout(job.field + ":" + job.value + " (drawn)", films, all, pos, attrs, { pairs: 20000 });
      r.field = job.field; r.value = job.value;
      r.bondFitDrawn = drawn.bondFit; r.drawnEdges = drawn.edges;
      rows.push(r);
      out.strata.push(r);
      console.log(job.field.padEnd(10) + String(job.value).slice(0, 24).padEnd(26) +
        String(r.films).padStart(5) + String(r.edges).padStart(7) +
        fmt(r.bondFit).padStart(9) + fmt(r.closerP, 3).padStart(9) + fmt(r.weakCloserP, 3).padStart(9) +
        fmt(r.weakRatio, 3).padStart(10) + fmt(r.degreeBias).padStart(9) +
        (r.nnLift.director ? (r.nnLift.director.lift.toFixed(1) + "x").padStart(9) : "      n/a"));
      gate(r, STRATUM_INVARIANTS, fails, job.field + ":" + job.value);
    }
    console.log("\n" + rows.length + " baked layouts measured (" +
      (rows.length - registerCount) + " strata + " + registerCount + " registers).");
    const by = (f) => rows.slice().sort((a, b) => f(a) - f(b));
    const worstBond = by((r) => -r.bondFit)[0];
    const worstRatio = by((r) => -r.weakRatio)[0];
    const worstDeg = by((r) => -Math.abs(r.degreeBias))[0];
    const worstDir = rows.filter((r) => r.nnLift.director).sort((a, b) => b.nnLift.director.lift - a.nnLift.director.lift)[0];
    console.log("worst bondFit    : " + worstBond.label + "  " + fmt(worstBond.bondFit));
    console.log("worst weakRatio  : " + worstRatio.label + "  " + fmt(worstRatio.weakRatio, 3));
    console.log("worst |degreeBias|: " + worstDeg.label + "  " + fmt(worstDeg.degreeBias));
    if (worstDir) console.log("worst director lift: " + worstDir.label + "  " + worstDir.nnLift.director.lift.toFixed(1) + "x");
    const drift = rows.filter((r) => Number.isFinite(r.bondFitDrawn) && r.bondFitDrawn - r.bondFit > 0.10);
    console.log("strata whose DRAWN bondFit is >0.10 worse than the solved one (the " +
      "circular edges the solver was not given): " + drift.length);
    for (const r of drift.slice(0, 6)) {
      console.log("  " + r.label.padEnd(28) + " solved " + fmt(r.bondFit) + "   drawn " + fmt(r.bondFitDrawn) +
        "   (" + r.drawnEdges + " edges vs " + r.edges + ")");
    }
  }

  /* ---- baseline / regression ---- */
  let baseline = null;
  if (fs.existsSync(BASELINE_PATH)) baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  console.log("\n── regression gate ─────────────────────────────────────────────────");
  if (WRITE_BASELINE) {
    const b = { generated: out.generated, solver: out.solver, corpusVersion: out.corpusVersion, whole: out.whole };
    if (DO_STRATA) b.strata = out.strata.map((r) => ({ label: r.label, bondFit: r.bondFit, closerP: r.closerP,
      weakCloserP: r.weakCloserP, weakRatio: r.weakRatio, degreeBias: r.degreeBias }));
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(b, null, 2) + "\n");
    console.log("baseline written to " + path.relative(ROOT, BASELINE_PATH) + " — commit it, or it protects nothing.");
  } else if (!baseline) {
    console.log("NO BASELINE at " + path.relative(ROOT, BASELINE_PATH) + ".");
    console.log("Absolute floors alone would not have caught the failure this file exists for:");
    console.log("bondFit fell -0.649 -> -0.416 without crossing one. Run --write-baseline and commit it.");
  } else {
    console.log("baseline " + baseline.generated + "  corpus " + baseline.corpusVersion +
      (baseline.corpusVersion !== out.corpusVersion ? "   (CORPUS HAS CHANGED SINCE)" : ""));
    regression(whole, baseline.whole, fails);
    if (DO_STRATA && baseline.strata) {
      const byLabel = new Map(baseline.strata.map((s) => [s.label, s]));
      for (const r of out.strata) {
        const b = byLabel.get(r.label);
        if (b) regression(r, Object.assign({ nnLift: {} }, b), fails);
      }
    }
    console.log("checked against baseline.");
  }

  if (JSON_OUT) {
    fs.writeFileSync(path.resolve(ROOT, JSON_OUT), JSON.stringify(out, null, 2) + "\n");
    console.log("full results written to " + JSON_OUT);
  }

  console.log("\nmeasured in " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
  if (fails.length) {
    console.log("\nFAIL\n  " + fails.join("\n  "));
    process.exit(1);
  }
  console.log("\nPASS — distance still encodes bond strength" + (DO_STRATA ? ", in every baked layout" : ""));
}

main();

/* ── RUN NOTES ───────────────────────────────────────────────────────────────
 *
 * bondFit IS STRONGLY N- AND DENSITY-DEPENDENT, AND THAT IS THE FINDING.
 * Measured with this file, shipped solver, shipped constants, today's corpus,
 * varying only which films and how many of their edges are handed to layout():
 *
 *      mean degree ->     4       7      10      14      20
 *      n =  803        -0.811  -0.697    —       —       —
 *      n = 1400        -0.783  -0.621  -0.533  -0.474    —
 *      n = 2204        -0.769  -0.602  -0.499  -0.441  -0.418
 *
 * So a bondFit figure is meaningless without the N and the mean degree beside
 * it, and comparing -0.649 at 803 films to -0.416 at 2,204 is comparing two
 * different questions. That is why the regression gate above is a comparison
 * against a baseline taken at a known corpus version and not a fixed floor.
 *
 * It is ALSO why a small stratum scores far better than the whole atlas and
 * that is not a compliment to the stratum: a 22-film register has almost no
 * geometric frustration to lose to. Read a stratum's bondFit against its own
 * N and degree, never against the whole atlas's.
 */
