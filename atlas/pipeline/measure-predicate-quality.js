#!/usr/bin/env node
/* measure-predicate-quality.js — does the predicate layer earn its place?
 *
 * Four questions, asked of pipeline/out/predicate-edges.json against the
 * shipped graph in static/corpus.json. MEASUREMENT ONLY. Nothing is written
 * into corpus.json and no edge file is modified.
 *
 *   FAME       AGENTS rule 1: distance and size encode strength of a formal
 *              statement, never popularity. If predicate degree correlates with
 *              fame the layer is a popularity mechanism wearing a new name.
 *              Fame proxy is rag/fame.js — 60-day en.wikipedia pageviews out of
 *              plot-source.js's own cache, the proxy match.js's fameCheck() and
 *              axis-gates.js already use. Corpus degree is reported as the
 *              second opinion fame.js itself says it is.
 *   STRANGERS  predicate edges between films with no existing edge. The layer's
 *              whole reason to exist. Reported with the existing-graph geodesic
 *              so "no edge" can be told apart from "nowhere near each other".
 *   TRADITION  cross-region and cross-decade share, against crew / cast /
 *              keyword — and against the two nulls that make that number mean
 *              something: corpus edges RESTRICTED to the same films, and the
 *              random-pair rate inside those same films.
 *   REBUTTALS  same predicate, opposed outcome. Counted at pair level over
 *              every shared predicate, not just the lead one the edge is typed
 *              on, because the lead is chosen by strength and not by argument.
 *
 * The cohort is stratified by era x region BY CONSTRUCTION (predicate-cohort-300.js),
 * so every cross-tradition number here is reported against the random-pair rate
 * inside the same films. A cross-region share above the corpus but at or below
 * its own null measures the sampler, not the layer.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const corpus = rd("static/corpus.json");
const fps = rd("static/fingerprints.json");
const P = rd("pipeline/out/predicate-edges.json");
const TAGS = rd("pipeline/out/predicate-tags.json");
const FROZEN = rd("pipeline/out/predicates-frozen.json");
const { fame } = require("./rag/fame.js");

const films = corpus.films;
const byFilmId = new Map();
for (const [k, f] of Object.entries(films)) if (f.filmId) byFilmId.set(f.filmId, k);
const byTitle = new Map();
for (const [k, f] of Object.entries(films)) if (!byTitle.has(f.title)) byTitle.set(f.title, k);

const regionOf = (k) => (fps.films[k] ? fps.films[k].region : null);
const yearOf = (k) => (films[k] ? films[k].year : null);
const decadeOf = (k) => { const y = yearOf(k); return y == null ? null : Math.floor(y / 10) * 10; };
/* Film keys are human slugs and CONTAIN SPACES ("the idiot"), so the pair key
   is tab-joined and split on the tab. A space separator both mis-splits and can
   collide two different pairs onto one string. */
const SEP = "\t";
const pk = (a, b) => (a < b ? a + SEP + b : b + SEP + a);
const unpk = (k) => k.split(SEP);

/* ---------- existing graph ---------- */
const adj = new Map();
const existingPairs = new Set();
const existingBySignal = new Map();
for (const e of corpus.edges) {
  const a = e.a, b = e.b;
  if (!films[a] || !films[b] || a === b) continue;
  existingPairs.add(pk(a, b));
  if (!adj.has(a)) adj.set(a, new Set());
  if (!adj.has(b)) adj.set(b, new Set());
  adj.get(a).add(b); adj.get(b).add(a);
  const s = e.signal || "(none)";
  if (!existingBySignal.has(s)) existingBySignal.set(s, new Set());
  existingBySignal.get(s).add(pk(a, b));
}
const corpusDegree = Object.create(null);
for (const k of Object.keys(films)) corpusDegree[k] = adj.has(k) ? adj.get(k).size : 0;

/* ---------- predicate layer ---------- */
const pedges = P.edges;
const predPairs = new Set(pedges.map((e) => pk(e.a, e.b)));
const EXTRA = new Set();
for (const t of P.extraScoredNotCounted || []) if (byTitle.has(t)) EXTRA.add(byTitle.get(t));

/* the tagged population: every film the pass looked at, including the 12 that
   answered "none of these" and therefore can carry no edge. Dropping them would
   flatter every coverage number below. */
const taggedKeys = [];
for (const f of TAGS.films) {
  const k = byFilmId.get(f.filmId) || byTitle.get(f.title);
  if (k) taggedKeys.push(k);
}
const COHORT = new Set(taggedKeys);
const SCORED = new Set([...taggedKeys, ...EXTRA]);

const predDegree = Object.create(null);
for (const k of SCORED) predDegree[k] = 0;
for (const e of pedges) { predDegree[e.a] = (predDegree[e.a] || 0) + 1; predDegree[e.b] = (predDegree[e.b] || 0) + 1; }

const tagCount = Object.create(null);
const plotChars = Object.create(null);
for (const f of TAGS.films) {
  const k = byFilmId.get(f.filmId) || byTitle.get(f.title);
  if (!k) continue;
  tagCount[k] = f.tags.length;
  plotChars[k] = f.plotChars || 0;
}

/* ---------- stats ---------- */
function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let m = i; m <= j; m++) r[idx[m][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
function lgamma(z) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let x = 0.99999999999980993;
  for (let i = 0; i < 8; i++) x += g[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function betainc(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  let f = 1, c = 1, d = 0;
  for (let i = 0; i <= 400; i++) {
    const m = Math.floor(i / 2);
    let num;
    if (i === 0) num = 1;
    else if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    const cd = c * d; f *= cd;
    if (Math.abs(1 - cd) < 1e-12) break;
  }
  return front * (f - 1);
}
function pOf(rho, n) {
  if (n < 4 || Math.abs(rho) >= 1) return 0;
  const t = Math.abs(rho) * Math.sqrt((n - 2) / (1 - rho * rho));
  const df = n - 2;
  const x = df / (df + t * t);
  return betainc(x, df / 2, 0.5);
}
function spearmanRho(x, y) { return pearson(ranks(x), ranks(y)); }
/* partial rank correlation of x with y holding z fixed. Used to ask whether the
   fame signal in predicate degree is anything more than "famous films have
   longer Wikipedia plot sections, so the tagger had more to tag". */
function partialSpearman(x, y, z) {
  const rxy = spearmanRho(x, y), rxz = spearmanRho(x, z), ryz = spearmanRho(y, z);
  const den = Math.sqrt((1 - rxz * rxz) * (1 - ryz * ryz));
  const rho = den ? (rxy - rxz * ryz) / den : 0;
  return { rho: +rho.toFixed(4), n: x.length, p: +pOf(rho, x.length - 1).toPrecision(3),
    zeroOrder: +rxy.toFixed(4) };
}
function spearman(pairs) {
  const x = pairs.map((p) => p[0]), y = pairs.map((p) => p[1]);
  const rho = pearson(ranks(x), ranks(y));
  return { rho: +rho.toFixed(4), n: pairs.length, p: +pOf(rho, pairs.length).toPrecision(3) };
}

/* ================= 1. FAME ================= */
const F = fame();
const out = {
  generated: new Date().toISOString(),
  what: "quality audit of pipeline/out/predicate-edges.json. Measurement only; corpus.json untouched.",
  fameProxy: { source: "pipeline/rag/fame.js", proxy: "60-day en.wikipedia pageviews, cache-only",
    window: F.window, staleVsTodayWindow: F.stale ? F.todayWindow : null,
    coverage: F.coverage.hit + "/" + F.n },
};

function fameBlock(keys, label) {
  const withViews = keys.filter((k) => F.views[k] != null);
  const rows = {
    "predicate degree vs pageviews": withViews.map((k) => [predDegree[k] || 0, F.views[k]]),
    "predicate degree vs corpus degree": keys.map((k) => [predDegree[k] || 0, corpusDegree[k]]),
    "tags per film vs pageviews": withViews.filter((k) => tagCount[k] != null).map((k) => [tagCount[k], F.views[k]]),
    "plot chars vs pageviews": withViews.filter((k) => plotChars[k] != null).map((k) => [plotChars[k], F.views[k]]),
    "CONTROL corpus degree vs pageviews, same films": withViews.map((k) => [corpusDegree[k], F.views[k]]),
  };
  const r = { label, films: keys.length, filmsWithViews: withViews.length };
  for (const [k, v] of Object.entries(rows)) r[k] = spearman(v);
  const wv = withViews.filter((k) => plotChars[k] != null && tagCount[k] != null);
  r["PARTIAL predicate degree vs pageviews, holding plot chars fixed"] =
    partialSpearman(wv.map((k) => predDegree[k] || 0), wv.map((k) => F.views[k]), wv.map((k) => plotChars[k]));
  r["PARTIAL predicate degree vs pageviews, holding tag count fixed"] =
    partialSpearman(wv.map((k) => predDegree[k] || 0), wv.map((k) => F.views[k]), wv.map((k) => tagCount[k]));
  const med = (arr, f) => { const v = arr.map(f).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const n = withViews.length;
  const sorted = withViews.slice().sort((a, b) => (predDegree[a] || 0) - (predDegree[b] || 0));
  const lo = sorted.slice(0, Math.floor(n / 4)), hi = sorted.slice(Math.ceil(3 * n / 4));
  r.medianViewsByPredicateDegreeQuartile = {
    bottom: med(lo, (k) => F.views[k]), top: med(hi, (k) => F.views[k]),
    ratio: +(med(hi, (k) => F.views[k]) / med(lo, (k) => F.views[k])).toFixed(2),
    meanPredDegreeBottom: +(lo.reduce((s, k) => s + (predDegree[k] || 0), 0) / lo.length).toFixed(1),
    meanPredDegreeTop: +(hi.reduce((s, k) => s + (predDegree[k] || 0), 0) / hi.length).toFixed(1),
  };
  const sortedC = withViews.slice().sort((a, b) => corpusDegree[a] - corpusDegree[b]);
  const loC = sortedC.slice(0, Math.floor(n / 4)), hiC = sortedC.slice(Math.ceil(3 * n / 4));
  r.medianViewsByCorpusDegreeQuartile = {
    bottom: med(loC, (k) => F.views[k]), top: med(hiC, (k) => F.views[k]),
    ratio: +(med(hiC, (k) => F.views[k]) / med(loC, (k) => F.views[k])).toFixed(2),
  };
  return r;
}
out.fame = {
  cohort300: fameBlock([...COHORT], "the 300-film cohort, stratified by fame decile by construction"),
  scored304: fameBlock([...SCORED], "300 cohort + 4 films scored but not counted for prevalence"),
  wholeCorpusControl: (() => {
    const keys = Object.keys(films).filter((k) => F.views[k] != null);
    return { label: "all 2,204 films, existing graph only", films: keys.length,
      "corpus degree vs pageviews": spearman(keys.map((k) => [corpusDegree[k], F.views[k]])) };
  })(),
};

/* AGENTS rule 1 names DISTANCE AND SIZE, and distance is drawn from `strength`,
   not from degree. So the sharpest form of the test is at the edge, not the
   node: does a pair of famous films get a stronger edge than a pair of obscure
   ones? Degree is the node-level test the brief asked for; this is the one the
   rule is actually written about. */
out.fame.edgeLevel = (() => {
  const rows = [];
  for (const e of pedges) {
    const va = F.views[e.a], vb = F.views[e.b];
    if (va == null || vb == null) continue;
    rows.push({ s: e.strength, mean: (va + vb) / 2, min: Math.min(va, vb), max: Math.max(va, vb) });
  }
  return {
    edgesWithBothViewsKnown: rows.length,
    "strength vs mean pageviews of the two films": spearman(rows.map((r) => [r.s, r.mean])),
    "strength vs the LESS famous film": spearman(rows.map((r) => [r.s, r.min])),
    "strength vs the MORE famous film": spearman(rows.map((r) => [r.s, r.max])),
  };
})();

/* Hubs. A layer that routes everything through a handful of films has rebuilt
   the canon whatever its rho says. */
out.fame.hubs = (() => {
  const keys = [...SCORED].sort((a, b) => (predDegree[b] || 0) - (predDegree[a] || 0));
  const deg = keys.map((k) => predDegree[k] || 0);
  const top = keys.slice(0, 10).map((k) => ({ title: films[k].title, predicateDegree: predDegree[k] || 0,
    corpusDegree: corpusDegree[k], pageviews: F.views[k] == null ? null : F.views[k],
    tags: tagCount[k], plotChars: plotChars[k] }));
  const tot = deg.reduce((a, b) => a + b, 0);
  const top10Share = +(100 * deg.slice(0, 10).reduce((a, b) => a + b, 0) / tot).toFixed(1);
  return { top10ByPredicateDegree: top, top10ShareOfAllEdgeEndpointsPct: top10Share,
    filmsWithZeroPredicateEdges: [...SCORED].filter((k) => !predDegree[k]).length,
    maxDegree: deg[0], medianDegree: deg[Math.floor(deg.length / 2)] };
})();

/* ================= 2. STRANGERS ================= */
const geo = new Map();
{
  const sources = new Set(pedges.map((e) => e.a));
  const wanted = new Map();
  for (const e of pedges) {
    if (!wanted.has(e.a)) wanted.set(e.a, []);
    wanted.get(e.a).push(e.b);
  }
  for (const src of sources) {
    const dist = new Map([[src, 0]]);
    let frontier = [src];
    for (let d = 1; d <= 4 && frontier.length; d++) {
      const next = [];
      for (const u of frontier) for (const v of adj.get(u) || []) if (!dist.has(v)) { dist.set(v, d); next.push(v); }
      frontier = next;
    }
    for (const b of wanted.get(src)) geo.set(pk(src, b), dist.has(b) ? dist.get(b) : 99);
  }
}
const strangers = pedges.filter((e) => !existingPairs.has(pk(e.a, e.b)));
const hopHist = {};
for (const e of pedges) { const h = geo.get(pk(e.a, e.b)); const key = h >= 99 ? "5+" : String(h); hopHist[key] = (hopHist[key] || 0) + 1; }
const touched = [...new Set(pedges.flatMap((e) => [e.a, e.b]))];
let cohortPairs = 0, cohortPairsWithEdge = 0;
for (let i = 0; i < touched.length; i++) for (let j = i + 1; j < touched.length; j++) {
  cohortPairs++; if (existingPairs.has(pk(touched[i], touched[j]))) cohortPairsWithEdge++;
}
out.strangers = {
  predicateEdges: pedges.length,
  joiningFilmsWithNoExistingEdge: strangers.length,
  sharePct: +(100 * strangers.length / pedges.length).toFixed(1),
  baseRate: {
    filmsTouched: touched.length, possiblePairs: cohortPairs, alreadyConnected: cohortPairsWithEdge,
    pctOfPossiblePairsAlreadyConnected: +(100 * cohortPairsWithEdge / cohortPairs).toFixed(2),
    strangerShareIfEdgesWereDrawnAtRandom: +(100 * (1 - cohortPairsWithEdge / cohortPairs)).toFixed(1),
  },
  existingGraphHopsBetweenEndpoints: hopHist,
  crossRegionAndAtLeastThreeHopsApart: (() => {
    let n = 0;
    for (const e of pedges) {
      const h = geo.get(pk(e.a, e.b));
      if (h >= 3 && regionOf(e.a) && regionOf(e.b) && regionOf(e.a) !== regionOf(e.b)) n++;
    }
    return { edges: n, pctOfPredicateEdges: +(100 * n / pedges.length).toFixed(1) };
  })(),
  recoveryOfExistingEdges: {
    predicateEdgesLandingOnAnExistingPair: pedges.length - strangers.length,
    expectedIfDrawnAtRandom: +(pedges.length * cohortPairsWithEdge / cohortPairs).toFixed(1),
    enrichment: +((pedges.length - strangers.length) / (pedges.length * cohortPairsWithEdge / cohortPairs)).toFixed(2),
  },
  strongestTenStrangers: strangers.slice().sort((a, b) => b.strength - a.strength).slice(0, 10)
    .map((e) => ({ pair: e.aTitle + " / " + e.bTitle, predicate: e.predicate, type: e.type,
      hops: geo.get(pk(e.a, e.b)), strength: e.strength, tonalDistance: e.tonalDistance,
      regions: [regionOf(e.a), regionOf(e.b)], years: [yearOf(e.a), yearOf(e.b)] })),
};

/* ================= 3. TRADITION ================= */
function crossShare(pairKeys) {
  let n = 0, xr = 0, xd = 0, both = 0, unmeasurable = 0;
  for (const key of pairKeys) {
    const [a, b] = unpk(key);
    const ra = regionOf(a), rb = regionOf(b), da = decadeOf(a), db = decadeOf(b);
    if (ra == null || rb == null || da == null || db == null) { unmeasurable++; continue; }
    n++;
    const r = ra !== rb, d = da !== db;
    if (r) xr++;
    if (d) xd++;
    if (r && d) both++;
  }
  if (!n) return { pairs: 0 };
  return { pairs: n, crossRegionPct: +(100 * xr / n).toFixed(1), crossDecadePct: +(100 * xd / n).toFixed(1),
    crossBothPct: +(100 * both / n).toFixed(1), unmeasurable };
}
function yearGap(pairKeys) {
  const g = [];
  for (const key of pairKeys) {
    const [ka, kb] = unpk(key);
    const ya = yearOf(ka), yb = yearOf(kb);
    if (ya != null && yb != null) g.push(Math.abs(ya - yb));
  }
  g.sort((x, y) => x - y);
  return { medianYears: g[Math.floor(g.length / 2)], meanYears: +(g.reduce((a, b) => a + b, 0) / g.length).toFixed(1) };
}
const trad = {};
trad.predicate = { ...crossShare(predPairs), ...yearGap(predPairs) };
for (const s of ["crew", "cast", "keyword", "subject", "setting", "genreEra", "countryEra"]) {
  const set = existingBySignal.get(s) || new Set();
  trad[s] = { ...crossShare(set), ...yearGap(set) };
}
trad.allCorpusEdges = { ...crossShare(existingPairs), ...yearGap(existingPairs) };
const inTouched = new Set(touched);
const restricted = new Set([...existingPairs].filter((k) => { const [a, b] = unpk(k); return inTouched.has(a) && inTouched.has(b); }));
trad.NULL_corpusEdgesAmongTheSameFilms = { ...crossShare(restricted), ...yearGap(restricted) };
const restrictedBySig = {};
for (const s of ["crew", "cast", "keyword"]) {
  const set = new Set([...(existingBySignal.get(s) || [])].filter((k) => { const [a, b] = unpk(k); return inTouched.has(a) && inTouched.has(b); }));
  restrictedBySig[s] = set.size ? { ...crossShare(set), ...yearGap(set) } : { pairs: 0 };
}
trad.NULL_bySignalAmongTheSameFilms = restrictedBySig;
const allCohortPairKeys = [];
for (let i = 0; i < touched.length; i++) for (let j = i + 1; j < touched.length; j++) allCohortPairKeys.push(pk(touched[i], touched[j]));
/* NULL 3 — a random pair drawn from the WHOLE corpus. This is the null crew,
   cast and keyword must be read against; the same-films null is only the right
   one for the predicate layer. Computed in closed form from the marginals. */
{
  const keys = Object.keys(films).filter((k) => regionOf(k) != null && yearOf(k) != null);
  const N = keys.length, tot = N * (N - 1) / 2;
  const cr = new Map(), cd = new Map();
  for (const k of keys) {
    cr.set(regionOf(k), (cr.get(regionOf(k)) || 0) + 1);
    cd.set(decadeOf(k), (cd.get(decadeOf(k)) || 0) + 1);
  }
  const same = (m) => [...m.values()].reduce((a, n) => a + n * (n - 1) / 2, 0);
  trad.NULL_randomPairInWholeCorpus = {
    pairs: tot, films: N,
    crossRegionPct: +(100 * (1 - same(cr) / tot)).toFixed(1),
    crossDecadePct: +(100 * (1 - same(cd) / tot)).toFixed(1),
  };
}
trad.NULL_randomPairAmongTheSameFilms = { ...crossShare(allCohortPairKeys), ...yearGap(allCohortPairKeys) };
out.tradition = trad;

/* ================= 4. REBUTTALS ================= */
const KIND = { restored: "held", transfigured: "held", unrestored: "broken", fatal: "broken", ambiguous: "open" };
const tagsByFilm = new Map();
for (const f of TAGS.films) {
  const k = byFilmId.get(f.filmId) || byTitle.get(f.title);
  if (k) tagsByFilm.set(k, f.tags);
}
for (const extraFile of ["pipeline/out/predicate-tags-benchmark.json"]) {
  try {
    const d = rd(extraFile);
    for (const f of d.films || []) {
      const k = byFilmId.get(f.filmId) || byTitle.get(f.title);
      if (k && !tagsByFilm.has(k)) tagsByFilm.set(k, f.tags);
    }
  } catch (e) { /* optional */ }
}
const label = new Map((FROZEN.predicates || []).map((p) => [p.id, p.label]));
const opposed = [];
let missingTagSide = 0;
for (const e of pedges) {
  const ta = tagsByFilm.get(e.a), tb = tagsByFilm.get(e.b);
  if (!ta || !tb) { missingTagSide++; continue; }
  const shared = [e.predicate, ...(e.alsoShares || [])];
  for (const p of shared) {
    const ga = ta.find((t) => t.predicate === p), gb = tb.find((t) => t.predicate === p);
    if (!ga || !gb) continue;
    const ka = KIND[ga.outcome], kb = KIND[gb.outcome];
    if (ka !== kb && ka !== "open" && kb !== "open") {
      opposed.push({ a: e.aTitle, b: e.bTitle, predicate: p, isLeadPredicate: p === e.predicate,
        label: label.get(p) || p,
        aOutcome: ga.outcome, bOutcome: gb.outcome,
        aCentrality: ga.centrality, bCentrality: gb.centrality,
        aRole: ga.role, bRole: gb.role, sameRole: ga.role === gb.role,
        aBasis: ga.basis, bBasis: gb.basis,
        strength: e.strength, regions: [regionOf(e.a), regionOf(e.b)], years: [yearOf(e.a), yearOf(e.b)] });
    }
  }
}
const oc = {};
for (const o of opposed) { const k = [o.aOutcome, o.bOutcome].sort().join(" vs "); oc[k] = (oc[k] || 0) + 1; }
out.rebuttals = {
  edgesTypedRebuttalByAssociatePredicates: pedges.filter((e) => e.type === "rebuttal").length,
  edgesTypedRhyme: pedges.filter((e) => e.type === "rhyme").length,
  opposedOutcomeInstancesOverEverySharedPredicate: opposed.length,
  distinctPairsWithAtLeastOneOpposition: new Set(opposed.map((o) => pk(o.a, o.b))).size,
  onANonLeadSharedPredicate: opposed.filter((o) => !o.isLeadPredicate).length,
  edgesSkippedForMissingTagSide: missingTagSide,
  outcomePairings: Object.fromEntries(Object.entries(oc).sort((a, b) => b[1] - a[1])),
  /* A rebuttal is only an argument if the two films are standing in the same
     place and coming out differently. Films on OPPOSITE sides of the same
     predicate reaching different outcomes may be describing one situation from
     two ends, not disagreeing about it. */
  roleAgreement: {
    sameRole: opposed.filter((o) => o.sameRole).length,
    differentRole: opposed.filter((o) => !o.sameRole).length,
    eitherSideTaggedBoth: opposed.filter((o) => o.aRole === "both" || o.bRole === "both").length,
    sameRoleAndBothCentral: opposed.filter((o) => o.sameRole && o.aCentrality >= 0.6 && o.bCentrality >= 0.6).length,
  },
  handAuthoredRebuttalsInCorpusToday: corpus.edges.filter((e) => e.type === "rebuttal").length,
  centralityFilter: {
    bothAtLeast0_6: opposed.filter((o) => o.aCentrality >= 0.6 && o.bCentrality >= 0.6).length,
    eitherBelow0_4: opposed.filter((o) => o.aCentrality < 0.4 || o.bCentrality < 0.4).length,
  },
  /* "Loose outcome labelling" turned into a number rather than left as an
     adjective. The tagger's own rule: fatal = "it ends in a death that settles
     it". So a basis that names a death of one of the parties and an outcome of
     restored is a self-contradiction on the tagger's own terms. Both directions
     are crude keyword proxies and are upper bounds, not verdicts. */
  outcomeVsBasisConsistency: (() => {
    const DEATH = /\b(kill|kills|killed|killing|dies|died|dead|death|shot dead|murder|murdered|suicide|hangs? himself|hangs? herself|executed|drowns?|drowned|stabs? .* to death)\b/i;
    let restoredWithDeath = 0, fatalWithoutDeath = 0, total = 0;
    const samples = [];
    for (const [k, tags] of tagsByFilm) for (const t of tags) {
      total++;
      const d = DEATH.test(t.basis);
      if (t.outcome === "restored" && d) { restoredWithDeath++; if (samples.length < 8) samples.push({ film: films[k].title, predicate: t.predicate, outcome: t.outcome, basis: t.basis }); }
      if (t.outcome === "fatal" && !d) fatalWithoutDeath++;
    }
    return { VERDICT: "INCONCLUSIVE — this instrument failed. Read the samples: most flagged tags are correct ('her dead husband's son', a drowning the film ABANDONS). The regex cannot tell a death that settles the situation from a death mentioned in passing, and the 'fatal with no death word' rate of ~51% shows the same failure from the other side. These two numbers are NOT defect rates and must not be quoted as such. The judgement on outcome labelling stays a hand judgement on the ten printed pairs.",
      tagsChecked: total, restoredButBasisNamesADeath: restoredWithDeath,
      pctOfRestored: +(100 * restoredWithDeath / [...tagsByFilm.values()].flat().filter((t) => t.outcome === "restored").length).toFixed(1),
      fatalButBasisNamesNoDeath: fatalWithoutDeath,
      pctOfFatal: +(100 * fatalWithoutDeath / [...tagsByFilm.values()].flat().filter((t) => t.outcome === "fatal").length).toFixed(1),
      samples };
  })(),
  tenToJudge: opposed.filter((o) => o.aCentrality >= 0.6 && o.bCentrality >= 0.6)
    .sort((a, b) => b.strength - a.strength).slice(0, 10),
};

fs.writeFileSync(path.join(ROOT, "pipeline/out/predicate-quality.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
