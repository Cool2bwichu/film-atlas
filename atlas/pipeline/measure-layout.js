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
 *   spacing        median nearest-neighbour distance, reported as the constant c
 *                  in c/sqrt(N). DESIGN.md asserts c = 0.669 "at every corpus
 *                  size measured" and builds two separate pieces of arithmetic
 *                  on it — the phone disc-size climbdown and the re-form scale
 *                  factor sqrt(N/N_all), which is what makes a narrowed sky have
 *                  the same star spacing as the whole atlas. It is load-bearing
 *                  in two places and was measured in none.
 *
 *   restWeakWorld  the rest length the solver hands a strength-0 edge, as a
 *                  fraction of the finished picture's width. Not a quality
 *                  metric — a diagnostic, and the one that found the bug. It
 *                  used to read 1.02 for the whole atlas and 15.2 for a ten-film
 *                  register, and it explained the weakRatio column single-handed:
 *                  restWeak was declared in units of k and was in fact a
 *                  fraction of the map, so it re-tuned itself as n changed.
 *                  layout-sky.js now carries `restWeakN` and `restWeakExp` and
 *                  sets this column DELIBERATELY, rising as n^0.25 from 0.66 at
 *                  a ten-film register to 2.56 at the whole atlas. That shape is
 *                  the fix, not a residue of it: read it next to weakRatio,
 *                  which is the thing being held flat.
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

/* restWeak is READ OUT OF app/layout-sky.js, never copied here. Same discipline
   measure-claims.js uses on the app's ranking table and build-registers.js uses
   on the palette: a constant duplicated into a checker is a constant that goes
   stale the moment somebody retunes the solver, and the checker then reports a
   diagnostic for a solver that no longer exists. */
const SOLVER_SOURCE = fs.readFileSync(path.join(ROOT, "app", "layout-sky.js"), "utf8");
const REST_WEAK = (() => {
  const m = SOLVER_SOURCE.match(/restWeak:\s*([\d.]+)/);
  if (!m) throw new Error("app/layout-sky.js no longer declares restWeak in the form this tool reads");
  return parseFloat(m[1]);
})();
/* restWeakN and restWeakExp arrived because this tool found restWeak was not
   scale-free — see the restWeakN block in layout-sky.js. They are read the same
   way and for the same reason, and they are REQUIRED rather than defaulted: if
   the solver drops one, the diagnostic below would silently go back to reporting
   a quantity the solver no longer computes, which is the exact staleness this
   block exists to prevent.

       restWeakWorld = restWeak * (n/restWeakN)^restWeakExp / sqrt(n)

   which is the rest length a strength-0 spring is given, as a fraction of the
   finished picture's width. It is NOT constant in n: it rises as
   n^(restWeakExp - 0.5), which is n^0.25 at the shipped 0.75, because a spring's
   rest length is a wish and the competition it has to win rises with mean
   degree. It IS a closed form of n alone, so a value here that disagrees with
   restWeak * (n/restWeakN)^restWeakExp / sqrt(n) means the solver and the
   harness have diverged. */
const REST_WEAK_N = (() => {
  const m = SOLVER_SOURCE.match(/restWeakN:\s*([\d.]+)/);
  if (!m) throw new Error("app/layout-sky.js no longer declares restWeakN in the form this tool reads");
  return parseFloat(m[1]);
})();
const REST_WEAK_EXP = (() => {
  const m = SOLVER_SOURCE.match(/restWeakExp:\s*([\d.]+)/);
  if (!m) throw new Error("app/layout-sky.js no longer declares restWeakExp in the form this tool reads");
  return parseFloat(m[1]);
})();
const restWeakWorldAt = (n) => REST_WEAK * Math.pow(n / REST_WEAK_N, REST_WEAK_EXP) / Math.sqrt(n);

/* DESIGN.md, "Density is the invariant; extent is the variable". Asserted there
   as holding at every corpus size; this tool exists to find out. */
const DESIGN_SPACING_CONSTANT = 0.669;

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
/* A ratchet's failure mode is that people re-baseline reflexively, and the
   ratchet then records whatever the code happens to do rather than what anybody
   decided. So a re-baseline that LENGTHENS the breach list is refused without
   --note "...": shortening the list needs no excuse, lengthening it needs a
   sentence that survives into the file and into `git log -p`. */
const BASELINE_NOTE = arg("note", null);

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
  /* formFit has no strata twin: a small stratum can be left with a handful of
     non-credit edges and a floor computed off those is noise with a gate
     attached. The whole atlas has 10,399 of them and no excuse. -0.05 is set
     where the property STOPS EXISTING, not near today's value — the shipped
     layout reads -0.1512, which is uncomfortably close, and that closeness is
     the finding rather than a reason to move the line. */
  formFitMax: -0.05,
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
  formFit: 0.030,         /* toward zero                                       */
  bandRatioWorst: 0.060,  /* downward — further from 1.00 is further from rule 1 */
  nnLiftDirector: 3.00,   /* upward — the sky drawing more filmography          */
};

/* A NOTE THE NEXT PERSON NEEDS BEFORE THEY READ A bondFit REGRESSION.
 *
 * bondFit is PARTLY A MEASUREMENT OF A DEFECT, and the tolerance above will
 * therefore fire on at least one change that improves the picture. Measured on
 * the shipped whole atlas: crew scores -0.674 and cast -0.021, and the 10,399
 * edges that are neither score -0.151. A large part of the headline -0.4163 is
 * "production credits are strong and drawn short while formal arguments are
 * weak and drawn long" — a between-group effect, not evidence that a reader can
 * read strength off a length.
 *
 * So a corpus change that stops the credit block from crowding out the form
 * edges will move bondFit TOWARD ZERO and formFit AWAY from it, and only the
 * second of those is the thing rule 1 is about. Read both before re-baselining,
 * and if bondFit and formFit have moved in opposite directions, say which one
 * you are buying in the commit message.
 */

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

  /* ---- formFit: bondFit over the edges that carry an ARGUMENT ---------- */

  /* bondFit is one global rank correlation over every edge, and this corpus's
     edges are not one population. Decomposed on the shipped whole atlas:

         all 22,050        -0.4163
         crew   5,605      -0.6742      cast 6,046   -0.0205
         everything else  10,399        -0.1512

     So the headline number is largely a BETWEEN-GROUP effect — production
     credits are strong and drawn short, formal arguments are weak and drawn
     long — and it stays healthy while the edges that actually carry a claim
     are positioned at a rank correlation of -0.15. `cast` is 27.4% of the
     graph and contributes essentially nothing to it.

     signature-schema.md's first test for whether a field earns its place is
     "formal, not industrial: it describes how the film behaves on screen, not
     who was paid to make it". formFit applies rule 1 to exactly the edges that
     pass that test. It is the sharper instrument and it is the one bondFit
     hides: a change that trades credit geometry for form geometry moves the two
     in opposite directions, and only one of them is the thing rule 1 is about. */
  const INDUSTRIAL = new Set(["crew", "cast"]);
  const formIdx = [];
  {
    let mm = 0;
    for (const e of edges) {
      const i = at.get(e.a), j = at.get(e.b);
      if (i === undefined || j === undefined || i === j) continue;
      if (!INDUSTRIAL.has(e.signal)) formIdx.push(mm);
      mm++;
    }
  }
  let formFit = NaN;
  if (formIdx.length >= 3) {
    const fs_ = new Float64Array(formIdx.length), fl_ = new Float64Array(formIdx.length);
    for (let t = 0; t < formIdx.length; t++) { fs_[t] = Sv[formIdx[t]]; fl_[t] = Lv[formIdx[t]]; }
    formFit = spearman(fs_, fl_);
  }

  /* ---- bandRatio: the same strength drawn two different lengths -------- */

  /* Rule 1 says rendered length is a statement about bond strength AND NOTHING
     ELSE. Test it directly: inside a narrow strength band, an edge between two
     films by the same director and an edge between two films by different
     directors should render at the same median length. Every ratio should be
     1.00. On the shipped whole atlas the five bands read

         0.421   0.435   0.637   0.602   0.422

     — two edges the corpus calls equally strong are drawn up to 2.4x apart
     depending on whether they share a director. bondFit is a single global rank
     correlation and STRUCTURALLY CANNOT report that the strength->length map
     differs between subpopulations, so it reads -0.4163 while this is true.

     This is emergent rather than applied: a director's shelf is a dense clique
     and a clique collapses whatever its rest lengths are. Emergent is a
     statement about the cause, not a defence of the picture — the number a
     reader measures still does not mean what they are told it means. Reported,
     and gated only as a floor, because a value near 1.00 is unreachable while
     the graph carries 3,106 same-director crew edges. */
  const BANDS = [[0.20, 0.40], [0.40, 0.55], [0.55, 0.65], [0.65, 0.75], [0.75, 0.95]];
  const bandRatio = [];
  {
    const dirOf = (attrs && attrs.director) || new Map();
    const same = new Uint8Array(m);
    let mm = 0;
    for (const e of edges) {
      const i = at.get(e.a), j = at.get(e.b);
      if (i === undefined || j === undefined || i === j) continue;
      const da = dirOf.get(e.a), db = dirOf.get(e.b);
      same[mm] = da && db && da === db ? 1 : 0;
      mm++;
    }
    for (const [lo, hi] of BANDS) {
      const A = [], B = [];
      for (let t = 0; t < m; t++) {
        if (Sv[t] < lo || Sv[t] >= hi) continue;
        (same[t] ? A : B).push(Lv[t]);
      }
      /* Ten a side is the floor for a median worth printing; below it the band
         is reported as null rather than as a confident ratio built on three
         lines, which is the mistake STATE.md records for `sameAuthor`. */
      bandRatio.push({ lo, hi, sameN: A.length, otherN: B.length,
        ratio: A.length >= 10 && B.length >= 10 ? median(A) / median(B) : null });
    }
  }
  const bandRatioWorst = bandRatio.reduce((w, b) =>
    b.ratio != null && (w == null || b.ratio < w) ? b.ratio : w, null);

  /* ---- degreeBias ----------------------------------------------------- */
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += xs[i]; cy += ys[i]; }
  cx /= n; cy /= n;
  const dist = new Float64Array(n), deg = new Float64Array(n);
  for (let i = 0; i < n; i++) { dist[i] = Math.hypot(xs[i] - cx, ys[i] - cy); deg[i] = degree[i]; }
  const degreeBias = n >= 3 ? spearman(deg, dist) : NaN;
  /* A stratum leaves some films with no edge at all inside it, and
     layout-strata.js explicitly accepts that those drift to the rim — "the
     honest place for a film whose only tie to a tradition is belonging to it".
     Fine, but it also means a degreeBias computed over everybody could be
     nothing but those isolates. Recomputing over films with at least one edge
     separates "isolates went to the rim" from "the layout drew a degree
     gradient", which are different findings with different remedies. */
  const linkedD = [], linkedR = [];
  for (let i = 0; i < n; i++) if (degree[i] > 0) { linkedD.push(degree[i]); linkedR.push(dist[i]); }
  const isolates = n - linkedD.length;
  const degreeBiasLinked = linkedD.length >= 12 ? spearman(linkedD, linkedR) : NaN;
  /* Degree is even more heavily tied than strength — 1,336 of 2,204 films sit at
     exactly degree 20, because the edge budget is a cap — so a layout that
     ordered films by degree PERFECTLY could still only reach -0.879. Without
     this number the selftest's degree-ordered control looks like a partial
     failure when it is in fact saturated. */
  let degreeBiasCeiling = NaN;
  if (n >= 3) {
    const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => deg[b] - deg[a]);
    const ideal = new Float64Array(n);
    for (let i = 0; i < n; i++) ideal[ord[i]] = i;   /* highest degree -> centre */
    degreeBiasCeiling = spearman(deg, ideal);
  }

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
  /* Never fewer than four edges in the "decile": a ten-film register has four
     edges in total, and a statistic computed off one of them is a number with
     no error bar being printed next to numbers that have one. Anything under
     THIN_EDGES is flagged and excluded from the gates rather than quietly
     scored — see AGENTS.md on drift ratios quoted without their event count. */
  const THIN_EDGES = 40;
  const weakN = Math.min(m, Math.max(4, Math.floor(m / 10)));
  const weakL = ordS.slice(0, weakN).map((i) => Lv[i]);
  const thin = m < THIN_EDGES;

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
  if (o.quick) {
    return { label, films: n, edges: m, meanDegree: n ? (2 * m) / n : 0, thin,
      bondFit, bondFitCeiling, bondFitShare: bondFit / bondFitCeiling,
      degreeBias, degreeBiasLinked, degreeBiasCeiling, isolates, closerP, weakCloserP, weakRatio,
      formFit, formEdges: formIdx.length, bandRatio, bandRatioWorst,
      medianEdgeLength: median(Array.prototype.slice.call(Lv)), medianUnconnected: medUnc,
      restWeakWorld: restWeakWorldAt(n), nnLift: {} };
  }
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
    /* The ceiling: the rate a layout that placed every co-attributed film
       adjacent would reach. It is well below 1 for director, because 483 of 758
       directors have a single film in this corpus and their K neighbours can
       never share anything. Without it, "19.65x" has no scale — the reader
       cannot tell whether the sky is nearly a filmography browser or a tenth of
       the way to one. */
    let ceilHit = 0;
    for (const i of have) {
      let c = 0;
      for (const j of have) if (j !== i && shares(i, j)) c++;
      ceilHit += Math.min(K, c);
    }
    const rate = tot ? hit / tot : NaN;
    const ceilRate = have.length ? ceilHit / (have.length * K) : NaN;
    nnLift[field] = {
      films: have.length, neighbours: tot, rate, baseline: base,
      lift: base > 0 ? rate / base : NaN,
      ceilingRate: ceilRate, ceilingLift: base > 0 ? ceilRate / base : NaN,
      shareOfCeiling: ceilRate > 0 ? rate / ceilRate : NaN,
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
    label, films: n, edges: m, meanDegree: n ? (2 * m) / n : 0, thin,
    bondFit, bondFitCeiling, bondFitShare: bondFit / bondFitCeiling,
    degreeBias, degreeBiasLinked, degreeBiasCeiling, isolates, closerP, weakCloserP, weakRatio,
    formFit, formEdges: formIdx.length, bandRatio, bandRatioWorst,
    medianEdgeLength: median(Array.prototype.slice.call(Lv)), medianUnconnected: medUnc,
    spacing, spacingConstant: spacing * Math.sqrt(n),
    restWeakWorld: restWeakWorldAt(n),
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
  console.log("formFit                  : " + fmt(r.formFit) +
    "   (the " + r.formEdges + " edges that are not crew or cast — rule 1 on the edges that carry an argument)");
  console.log("bandRatio (same-director / same-strength other):");
  console.log("  " + r.bandRatio.map((b) =>
    b.lo.toFixed(2) + "-" + b.hi.toFixed(2) + " " +
    (b.ratio == null ? " thin" : b.ratio.toFixed(3))).join("   ") + "     (1.000 = rule 1 holds within the band)");
  console.log("degreeBias               : " + fmt(r.degreeBias) +
    "   (negative = the well-connected sit central; " + fmt(r.degreeBiasLinked) +
    " over linked films, " + r.isolates + " isolates)");
  console.log("P(connected closer)      : " + fmt(r.closerP, 3) +
    "   (0.5 = chance; stress build scored 0.581 and was rejected)");
  console.log("  weakest decile          : " + fmt(r.weakCloserP, 3));
  console.log("weakRatio                : " + fmt(r.weakRatio, 3) +
    "   (layout-sky.js: must stay below 1.0; quoted 0.83 at n=803)");
  console.log("median edge / unconnected: " + fmt(r.medianEdgeLength) + " / " + fmt(r.medianUnconnected));
  console.log("restWeakWorld            : " + fmt(r.restWeakWorld, 2) +
    "   (restWeak=" + REST_WEAK + " at n=" + REST_WEAK_N + ", exponent " + REST_WEAK_EXP +
    ", in units of the finished picture's width — rises as n^" +
    (REST_WEAK_EXP - 0.5).toFixed(2) + " by construction)");
  console.log("spacing (median NN dist) : " + fmt(r.spacing, 5) +
    "   = " + fmt(r.spacingConstant, 3) + "/sqrt(N)   (DESIGN.md asserts " +
    DESIGN_SPACING_CONSTANT + ")");
  console.log("nearest-" + KNN + " neighbours share:");
  for (const [f, v] of Object.entries(r.nnLift)) {
    if (!v) { console.log("  " + f.padEnd(10) + " n/a"); continue; }
    console.log("  " + f.padEnd(10) + pc(v.rate).padStart(7) + "   baseline " + pc(v.baseline).padStart(7) +
      "   lift " + (v.lift.toFixed(2) + "x").padStart(7) +
      "   ceiling " + (v.ceilingLift.toFixed(1) + "x").padStart(7) +
      "   " + pc(v.shareOfCeiling).padStart(6) + " of it");
  }
}

/* Returns a list of breach strings rather than pushing straight onto the fail
   list, so the caller can decide whether a given breach is new (a regression,
   which fails) or standing (recorded in the baseline, which is reported). */
function breaches(r, inv, prefix) {
  const out = [];
  const p = prefix ? prefix + " " : "";
  if (!(r.bondFit <= inv.bondFitMax)) out.push(`${p}bondFit ${fmt(r.bondFit)} is not at or below ${inv.bondFitMax}`);
  if (!(r.closerP >= inv.closerPMin)) out.push(`${p}closerP ${fmt(r.closerP, 3)} is below ${inv.closerPMin}`);
  if (!r.thin && !(r.weakCloserP >= inv.weakCloserPMin)) out.push(`${p}weakCloserP ${fmt(r.weakCloserP, 3)} is below ${inv.weakCloserPMin} — a weak tie is drawn as evidence of unrelatedness`);
  if (!r.thin && !(r.weakRatio < inv.weakRatioMax)) out.push(`${p}weakRatio ${fmt(r.weakRatio, 3)} is at or above ${inv.weakRatioMax} — see layout-sky.js on restWeak`);
  if (!(Math.abs(r.degreeBias) <= inv.degreeBiasMax)) out.push(`${p}|degreeBias| ${fmt(Math.abs(r.degreeBias))} exceeds ${inv.degreeBiasMax} — the layout is drawing degree`);
  if (inv.formFitMax !== undefined && !(r.formFit <= inv.formFitMax)) {
    out.push(`${p}formFit ${fmt(r.formFit)} is not at or below ${inv.formFitMax} — the edges that carry an argument are not positioned by their strength`);
  }
  return out;
}

function regression(now, base, fails) {
  if (!base) return;
  /* The label matters: this runs 73 times and a bare "REGRESSION bondFit" with
     no layout attached is a line nobody can act on. */
  const where = now.label && now.label !== "whole atlas" ? now.label + " " : "";
  const check = (name, v, b, tol, dir) => {
    if (!Number.isFinite(v) || !Number.isFinite(b)) return;
    const slid = dir === "up" ? v - b : b - v;
    if (slid > tol) {
      fails.push(`REGRESSION ${where}${name}: ${fmt(v)} against baseline ${fmt(b)} ` +
        `(moved ${slid.toFixed(4)}, tolerance ${tol})`);
    }
  };
  check("bondFit", now.bondFit, base.bondFit, TOLERANCE.bondFit, "up");
  check("closerP", now.closerP, base.closerP, TOLERANCE.closerP, "down");
  check("weakCloserP", now.weakCloserP, base.weakCloserP, TOLERANCE.weakCloserP, "down");
  check("weakRatio", now.weakRatio, base.weakRatio, TOLERANCE.weakRatio, "up");
  check("|degreeBias|", Math.abs(now.degreeBias), Math.abs(base.degreeBias), TOLERANCE.degreeBias, "up");
  check("formFit", now.formFit, base.formFit, TOLERANCE.formFit, "up");
  check("bandRatioWorst", now.bandRatioWorst, base.bandRatioWorst, TOLERANCE.bandRatioWorst, "down");
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
    "   weakRatio " + fmt(inv.weakRatio, 3) + "   formFit " + fmt(inv.formFit));
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
    "   degreeBias " + fmt(shuf.degreeBias) + "   formFit " + fmt(shuf.formFit));
  console.log("  bandRatio " + shuf.bandRatio.map((b) => b.ratio == null ? "thin" : b.ratio.toFixed(3)).join(" ") +
    "   (worst " + fmt(shuf.bandRatioWorst, 3) + " against " + fmt(truth.bandRatioWorst, 3) + " shipped)");
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
  console.log("  degreeBias " + fmt(degL.degreeBias) + "   (its tie ceiling is " +
    fmt(degL.degreeBiasCeiling) + " — 1,336 of 2,204 films sit at exactly degree 20," +
    " because the edge budget is a cap)");
  console.log("  bondFit " + fmt(degL.bondFit) + "   closerP " + fmt(degL.closerP, 3));
  results.push(["degree-ordered", degL]);

  /* 4. A DIRECTOR-CLUSTERED LAYOUT, to prove the nnLift number can move.
     A ROW-MAJOR GRID, not the phyllotaxis spiral controls 3 uses. The spiral is
     the right shape for a radial gradient and exactly the wrong one for
     clustering: consecutive indices land a golden angle apart, which is the
     property phyllotaxis exists for, so a director's films end up scattered and
     the control under-reads. The first version of this control did that and
     reported 6.1x — LOWER than the shipped layout — which looks like the
     harness saying the constellation clusters harder than a clustered layout
     does. It was the control that was wrong, and only having a second,
     differently-shaped control revealed it. */
  const dirOf = attrs.director;
  const groups = new Map();
  for (const k of keys) { const d = dirOf.get(k) || "?"; if (!groups.has(d)) groups.set(d, []); groups.get(d).push(k); }
  const byDir = [].concat(...[...groups.values()]);
  const dirPos = {};
  /* One phyllotaxis site per DIRECTOR, and that director's films packed into a
     small disc around it — so a film's nearest neighbours really are its own
     shelf. Two weaker versions were built first and both under-read:
     consecutive indices on one spiral (6.1x) and a row-major grid (35.8x), the
     grid because twelve neighbours there span four rows and a row is W apart in
     the ordering. The assertion below is against the COMPUTED ceiling rather
     than a hand-picked multiple, which is what stopped the third version being
     tuned until it passed. */
  let site = 0;
  for (const list of groups.values()) {
    const R = 0.49 * Math.sqrt((site + 0.5) / groups.size), A = site * GOLDEN;
    const gx = 0.5 + R * Math.cos(A), gy = 0.5 + R * Math.sin(A);
    const spread = 0.004;
    for (let t = 0; t < list.length; t++) {
      const r = spread * Math.sqrt((t + 0.5) / list.length), a = t * GOLDEN;
      dirPos[list[t]] = [gx + r * Math.cos(a), gy + r * Math.sin(a)];
    }
    site++;
  }
  const dirL = measureLayout("director-clustered", films, edges, dirPos, attrs, { pairs: 120000 });
  console.log("\n4. positions laid out with a director's films packed together");
  console.log("  bandRatio " + dirL.bandRatio.map((b) => b.ratio == null ? "thin" : b.ratio.toFixed(3)).join(" ") +
    "   (worst " + fmt(dirL.bandRatioWorst, 3) + "; 1.000 is rule 1 holding within a band)");
  console.log("  director lift " + dirL.nnLift.director.lift.toFixed(2) + "x  (" +
    pc(dirL.nnLift.director.shareOfCeiling) + " of the ceiling " +
    dirL.nnLift.director.ceilingLift.toFixed(1) + "x; the shipped layout reaches " +
    pc(truth.nnLift.director.shareOfCeiling) + ")");
  console.log("  bondFit " + fmt(dirL.bondFit) + "   closerP " + fmt(dirL.closerP, 3));
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
    ["degreeBias saturates at its tie ceiling on a degree-ordered layout",
      Math.abs(degL.degreeBias - degL.degreeBiasCeiling) < 0.01],
    ["the shipped layout is far from that ceiling",
      Math.abs(truth.degreeBias) < Math.abs(truth.degreeBiasCeiling) * 0.5],
    ["director lift reaches its ceiling on a director-clustered layout",
      dirL.nnLift.director.shareOfCeiling > 0.95],
    ["the shipped layout is well below that ceiling", truth.nnLift.director.shareOfCeiling < 0.35],
    ["the shipped layout's bondFit is negative", truth.bondFit < -0.25],
    ["the inverted layout would FAIL the shipped gate", !(inv.bondFit <= INVARIANTS.bondFitMax)],
    /* formFit and bandRatio are gated, so they need controls of their own —
       the whole point of this file is that a check nobody has watched fail is a
       check that lies, and that applies to the checks added last, not only to
       the ones added first. */
    ["formFit goes POSITIVE when the rest-length mapping is inverted", inv.formFit > 0.1],
    ["formFit collapses to ~0 when positions are shuffled", Math.abs(shuf.formFit) < 0.03],
    ["the inverted layout would FAIL the shipped formFit gate", !(inv.formFit <= INVARIANTS.formFitMax)],
    /* Shuffling makes "same director" tell you nothing about a rendered length,
       so every band must read 1.00. This is the check that bandRatio measures
       the layout and not the strength distribution. */
    ["every bandRatio goes to ~1.0 when positions are shuffled",
      shuf.bandRatio.every((b) => b.ratio == null || Math.abs(b.ratio - 1) < 0.12)],
    /* And packing each director's films onto their own disc must drive it to the
       floor: it is the maximal version of exactly the defect bandRatio names. */
    ["bandRatio collapses on a director-packed layout",
      dirL.bandRatioWorst < 0.15 && dirL.bandRatioWorst < truth.bandRatioWorst],
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
  /* EVERY number this file prints depends on BOTH files: corpus.json supplies
     the edges the solver is given, discovery.json supplies the film order, the
     stratum memberships and the director/country/era attributes behind nnLift.
     They can disagree — a reading pass that lands corpus.json without re-running
     build-discovery.js leaves exactly that state, and app/build.js dies on it
     with CorpusIdentityError. Measuring across the seam produces numbers that
     look fine and describe a corpus that does not exist, and a BASELINE taken
     across it is worse than none, because it will fire on the correct state
     later. This is a warning rather than a throw so the tool can still be used
     to diagnose the mismatch, but a baseline may not be written over it. */
  const SPLIT = discovery.corpusVersion && discovery.corpusVersion !== corpus.meta.corpusVersion;
  if (SPLIT) {
    console.log("WARNING: corpus.json and discovery.json disagree — discovery was built against " +
      discovery.corpusVersion + ".");
    console.log("  Every stratum membership and every nnLift below is measured across that seam.");
    console.log("  Run pipeline/build-discovery.js, then re-run this tool.");
    if (WRITE_BASELINE) {
      console.log("  REFUSED: a baseline may not be written across a corpus/discovery mismatch.");
      process.exit(1);
    }
  }
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
  const standing = breaches(whole, INVARIANTS, "whole atlas");
  /* The whole atlas is never ratcheted. It is the picture the project is
     principally about, and a standing rule-1 breach there is not a backlog
     item. */
  fails.push(...standing);

  if (DO_STRATA) {
    console.log("\n── the baked strata and registers ──────────────────────────────────");
    const keyAt = discovery.filmOrder.map((id) => discovery.keyByFilmId[id]);
    const jobs = [];

    const { strata } = strataLayouts(corpus, discovery);
    for (const field of ["genre", "country", "era"]) {
      const post = discovery.facets.postings[field] || {};
      for (const [value, list] of Object.entries(post)) {
        if (list.length < MIN_FILMS) continue;
        /* Recorded facet postings are already keyed "genre:drama"; register ids
           are bare. Label them once, not twice. */
        jobs.push({ field, value, label: value.includes(":") ? value : field + ":" + value,
          order: list.map((i) => keyAt[i]), blob: strata[value] });
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
        jobs.push({ field: "register", value: id, label: "register:" + id,
          order: list.map((i) => keyAt[i]), blob: regStrata[id] });
        registerCount++;
      }
    }

    console.log("field     value                  films edges restWk  bondFit  closerP weakClsr weakRatio  degBias degBiasL  dirLift");
    const rows = [];
    for (const job of jobs) {
      if (!job.blob) throw new Error(`no baked layout for ${job.field}:${job.value}`);
      const pos = dequantise(job.blob, job.order);
      const films = {}; for (const k of job.order) films[k] = corpus.films[k];
      const { all, solver } = stratumEdges(corpus, job.order, job.field);
      const r = measureLayout(job.label, films, solver, pos, attrs, { pairs: 60000 });
      /* Also score against every in-stratum edge, including the circular ones
         the solver never saw — those are drawn on screen and a reader measures
         them too. Reported, not gated: the solver cannot be held to a spring it
         was deliberately not given. */
      const drawn = measureLayout(job.label, films, all, pos, attrs, { pairs: 20000, quick: true });
      r.field = job.field; r.value = job.value;
      r.bondFitDrawn = drawn.bondFit; r.drawnEdges = drawn.edges;
      rows.push(r);
      out.strata.push(r);
      console.log(job.field.padEnd(9) + String(job.value).replace(/^(genre|country|era):/, "").slice(0, 22).padEnd(23) +
        String(r.films).padStart(5) + String(r.edges).padStart(6) + fmt(r.restWeakWorld, 1).padStart(7) +
        fmt(r.bondFit).padStart(9) + fmt(r.closerP, 3).padStart(9) +
        (r.thin ? "   thin" : fmt(r.weakCloserP, 3).padStart(9)) +
        (r.thin ? "      thin" : fmt(r.weakRatio, 3).padStart(10)) +
        fmt(r.degreeBias).padStart(9) + fmt(r.degreeBiasLinked).padStart(9) +
        (r.nnLift.director ? (r.nnLift.director.lift.toFixed(1) + "x").padStart(9) : "      n/a"));
      standing.push(...breaches(r, STRATUM_INVARIANTS, job.label));
    }
    console.log("\n" + rows.length + " baked layouts measured (" +
      (rows.length - registerCount) + " strata + " + registerCount + " registers).");
    const by = (f) => rows.slice().sort((a, b) => f(a) - f(b));
    const worstBond = by((r) => -r.bondFit)[0];
    const scored = rows.filter((r) => !r.thin);
    const worstRatio = scored.slice().sort((a, b) => b.weakRatio - a.weakRatio)[0];
    const worstDeg = by((r) => -Math.abs(r.degreeBiasLinked || r.degreeBias))[0];
    const worstDir = rows.filter((r) => r.nnLift.director).sort((a, b) => b.nnLift.director.lift - a.nnLift.director.lift)[0];
    console.log("worst bondFit      : " + worstBond.label + "  " + fmt(worstBond.bondFit));
    console.log("worst weakRatio    : " + worstRatio.label + "  " + fmt(worstRatio.weakRatio, 3));
    console.log("worst |degreeBias| : " + worstDeg.label + "  " + fmt(worstDeg.degreeBiasLinked));
    if (worstDir) console.log("worst director lift: " + worstDir.label + "  " + worstDir.nnLift.director.lift.toFixed(1) + "x");
    const overRatio = scored.filter((r) => r.weakRatio >= 1);
    console.log("\nbaked layouts whose weakest-decile edges render FURTHER apart than an " +
      "unconnected pair\n  (weakRatio >= 1.0, the one constraint layout-sky.js names): " +
      overRatio.length + " of " + scored.length + " scoreable");
    const drift = rows.filter((r) => Number.isFinite(r.bondFitDrawn) && r.bondFitDrawn - r.bondFit > 0.10);
    console.log("baked layouts whose DRAWN bondFit is >0.10 worse than the SOLVED one\n" +
      "  (the circular edges the solver was deliberately not given, but a reader still sees): " +
      drift.length);
    for (const r of drift.slice(0, 6)) {
      console.log("  " + r.label.padEnd(28) + " solved " + fmt(r.bondFit) + "   drawn " + fmt(r.bondFitDrawn) +
        "   (" + r.drawnEdges + " edges drawn vs " + r.edges + " solved)");
    }
    const spacings = rows.map((r) => r.spacingConstant).filter(Number.isFinite).sort((a, b) => a - b);
    console.log("\nspacing constant c in c/sqrt(N), across every baked layout: " +
      spacings[0].toFixed(3) + " – " + spacings[spacings.length - 1].toFixed(3) +
      "   (DESIGN.md asserts " + DESIGN_SPACING_CONSTANT + " at every corpus size)");
  }

  /* ---- baseline, regression and the standing-breach ratchet ----
   *
   * The strata are held to the same invariants as the whole atlas, and at HEAD
   * a large number of them breach. Two bad answers were available: loosen the
   * thresholds until everything passes, which is how a checker becomes
   * decoration, or fail every run forever, which is how a checker gets ignored
   * and then deleted. The third answer is a ratchet — the baseline records the
   * breaches that already exist, they are printed in full on every run so
   * nobody can forget them, and a breach that is NOT in that list fails the
   * build. The list can only be shortened by fixing something, and only ever
   * lengthens in a commit with a person's name on it. */
  let baseline = null;
  if (fs.existsSync(BASELINE_PATH)) baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  console.log("\n── invariant breaches ──────────────────────────────────────────────");
  if (standing.length) {
    console.log(standing.length + " standing breach" + (standing.length === 1 ? "" : "es") + ":");
    for (const b of standing) console.log("  " + b);
  } else {
    console.log("none.");
  }

  console.log("\n── regression gate ─────────────────────────────────────────────────");
  if (WRITE_BASELINE) {
    const before = baseline ? (baseline.knownBreaches || []).length : 0;
    if (standing.length > before && !BASELINE_NOTE) {
      console.log("REFUSED: this baseline would record " + standing.length + " breaches against the " +
        before + " already committed.");
      console.log("Lengthening the ratchet needs a reason. Re-run with --note \"why these are acceptable\".");
      process.exit(1);
    }
    const b = { generated: out.generated, solver: out.solver, strataSolver: out.strataSolver,
      corpusVersion: out.corpusVersion, note: BASELINE_NOTE || (baseline && baseline.note) || null,
      previousBreachCount: before, whole: out.whole, knownBreaches: standing };
    if (DO_STRATA) {
      b.strata = out.strata.map((r) => ({ label: r.label, films: r.films, edges: r.edges, thin: r.thin,
        bondFit: r.bondFit, closerP: r.closerP, weakCloserP: r.weakCloserP,
        weakRatio: r.weakRatio, degreeBias: r.degreeBias, degreeBiasLinked: r.degreeBiasLinked }));
    } else {
      console.log("NOTE: written WITHOUT --strata, so it protects the whole atlas only.");
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(b, null, 2) + "\n");
    console.log("baseline written to " + path.relative(ROOT, BASELINE_PATH) +
      " with " + standing.length + " known breaches — commit it, or it protects nothing.");
  } else if (!baseline) {
    console.log("NO BASELINE at " + path.relative(ROOT, BASELINE_PATH) + ".");
    console.log("Absolute floors alone would not have caught the failure this file exists for:");
    console.log("bondFit fell -0.649 -> -0.416 without ever crossing one. Run --write-baseline");
    console.log("and commit the result, or this tool can only see a catastrophe, never a slide.");
    fails.push("no committed baseline — the regression gate is not armed");
  } else {
    console.log("baseline " + baseline.generated + "  corpus " + baseline.corpusVersion +
      (baseline.corpusVersion !== out.corpusVersion ? "   (CORPUS HAS CHANGED SINCE)" : ""));
    if (baseline.strataSolver && baseline.strataSolver !== out.strataSolver) {
      console.log("  NOTE: baseline was taken under strata solver " + baseline.strataSolver +
        ", HEAD is " + out.strataSolver + " — stratum comparisons are across a solver change.");
    }
    regression(whole, baseline.whole, fails);
    if (DO_STRATA && baseline.strata) {
      const byLabel = new Map(baseline.strata.map((s) => [s.label, s]));
      for (const r of out.strata) {
        const b = byLabel.get(r.label);
        if (b) regression(r, Object.assign({ nnLift: {} }, b), fails);
        else fails.push(`NEW baked layout ${r.label} is not in the baseline — re-baseline deliberately`);
      }
    }
    /* Only diff the breach lists when this run covered the same surfaces the
       baseline did. A --strata baseline compared against a whole-atlas-only run
       would report every stratum breach as "healed", which is a checker
       congratulating itself for not having looked. */
    /* Breaches are matched on WHICH LAYOUT BREACHED WHICH INVARIANT, not on the
       breach sentence, because the sentence carries the measured value. The
       first version compared the strings, and a concurrent reading pass that
       moved the corpus by 169 edges turned 40 unchanged breaches into 40 "NEW
       BREACH" lines while only 6 layouts had actually crossed a threshold. A
       ratchet that cries wolf on every corpus edit is a ratchet people
       re-baseline reflexively, which is the one failure mode it exists to stop.
       The MAGNITUDE of a known breach is not unpoliced — that is what the
       tolerances in regression() are for, and they run over the strata too. */
    const identity = (b) => b.replace(/-?\d+\.\d+/g, "#");
    const known = new Set((baseline.knownBreaches || []).map(identity));
    const comparable = !baseline.strata || DO_STRATA;
    if (comparable) {
      const nowIds = new Set(standing.map(identity));
      const fresh = standing.filter((b) => !known.has(identity(b)));
      const healed = (baseline.knownBreaches || []).filter((b) => !nowIds.has(identity(b)));
      for (const b of fresh) fails.push("NEW BREACH: " + b);
      console.log("known breaches " + known.size + " · new " + fresh.length + " · healed " + healed.length +
        (healed.length ? "  (re-baseline to lock the improvement in)" : ""));
    } else {
      console.log("known breaches " + known.size + " — not diffed: the baseline covers the strata " +
        "and this run did not. Re-run with --strata to check them.");
    }
  }

  if (JSON_OUT) {
    fs.writeFileSync(path.resolve(ROOT, JSON_OUT), JSON.stringify(out, null, 2) + "\n");
    console.log("full results written to " + JSON_OUT);
  }

  console.log("\nmeasured in " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
  if (fails.length) {
    console.log("\nFAIL\n  " + fails.join("\n  "));
    /* The single most common cause of a red run here is a corpus edit, and the
       remedy for that is different from the remedy for a solver regression. Say
       which one this is rather than leaving it to be guessed. */
    if (baseline && baseline.corpusVersion && baseline.corpusVersion !== out.corpusVersion) {
      console.log("\n  THE CORPUS HAS CHANGED since this baseline was taken (" +
        baseline.corpusVersion + " -> " + out.corpusVersion + ").");
      console.log("  A reading pass or an associator change moves these numbers and that is not a");
      console.log("  solver regression. Read them, decide they are acceptable, then:");
      console.log("    node pipeline/measure-layout.js --strata --write-baseline --note \"...\"");
      console.log("  and commit the baseline in the same commit as the corpus.");
    }
    process.exit(1);
  }
  console.log("\nPASS — the whole atlas holds rule 1, nothing regressed against the baseline" +
    (standing.length ? ", and the " + standing.length + " standing breaches above are unchanged" : ""));
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
 *
 * ── WHAT WAS RULED OUT, WITH THE NUMBER ─────────────────────────────────────
 *
 * All at n=2,204, whole corpus, one knob at a time off the shipped defaults:
 *
 *   the solver has not stopped converging.  iterations 300 / 600 / 1200 / 2400
 *   -> bondFit -0.434 / -0.416 / -0.410 / -0.404. Quadrupling the schedule that
 *   was tuned "flat past ~350 at n=803" buys 0.012. theta 0.8 -> 0.5, which is
 *   the Barnes-Hut approximation going from cheap to nearly exact, buys 0.001.
 *
 *   the strength ties are not the cause.  bondFitCeiling is -0.998, so the 15%
 *   of edges piled at exactly 0.60 cost 0.002 of headroom. Deleting that pile
 *   outright moves bondFit -0.416 -> -0.442; deleting every tie group over 200
 *   edges (leaving 7,356 of 22,050) moves it to -0.485. Real, and an order of
 *   magnitude too small to explain 0.233.
 *
 *   the edge budget is the biggest LEVER and not the cause.  Degree 4 -> 20 at
 *   fixed n=2,204 costs 0.351 of bondFit, far more than anything else measured.
 *   But mean degree was 19.3 at 803 films (7,759 edges) and is 20.0 now. It did
 *   not move. A cap the corpus was already sitting against cannot explain a
 *   change.
 *
 * ── WHAT IS LEFT: restWeak IS NOT SCALE-FREE, AND SAYS SO IN ITS OWN UNITS ──
 *
 * layout-sky.js argues that expressing lengths in units of k = 1/sqrt(n) "lets
 * the same constants hold from 800 films to 2,000". True for a LOCAL length.
 * restWeak is not one: restWeak * k = 48/sqrt(n) is 1.69 picture-widths at
 * n=803 and 1.02 at n=2,204. A rest length larger than the whole map is a
 * fraction-of-the-map quantity wearing k's clothes, and that fraction decays as
 * 1/sqrt(n). So the constant governing the WEAK end of the picture shrank
 * relative to the picture as the corpus grew — the same shape of failure
 * STATE.md item 1 records for idf, in the layout instead of the associator.
 *
 * The file names the constraint restWeak is tuned against and quotes 0.83 for
 * it at n=803. This tool measures that same ratio at 0.495 today. The constant
 * did not merely drift, it drifted to nearly twice as conservative as it was
 * set to be, and bondFit is what it spent. Measured, at n=2,204:
 *
 *      restWeak      48      90     100     110     120     130
 *      bondFit    -0.416  -0.527  -0.550  -0.567  -0.584  -0.601
 *      weakRatio   0.495   0.707   0.758   0.785   0.833   0.902
 *
 * restWeak 120 puts the ratio back on its tuned 0.83 and returns bondFit to
 * -0.584 — 0.168 of the 0.233 that was lost — without breaking any constraint
 * this project has written down.
 *
 * THE SAME CONSTANT FAILS THE OTHER WAY ON THE STRATA, which is the strongest
 * evidence that the unit is what is wrong rather than the value. restWeak * k
 * is 15.2 picture-widths for a ten-film register, so every spring in it is
 * compressed to the point of shoving, and 39 of 64 scoreable baked layouts draw
 * their weakest-decile edges FURTHER apart than an unconnected pair — the exact
 * failure restWeak 180 was rejected for at n=803.
 *
 * Holding restWeak * k fixed at the value it had when it was tuned — i.e.
 * restWeak = 1.694 * sqrt(n), which is 48.0 at n=803 by construction — was
 * measured across the whole atlas and all 72 baked layouts:
 *
 *      weakRatio >= 1.0        41 of 65 scoreable  ->  11 of 65
 *      whole-atlas bondFit     -0.416              ->  -0.496
 *      whole-atlas weakRatio    0.495              ->   0.635
 *      whole-atlas closerP      0.837              ->   0.812
 *
 * WHAT WAS DONE FIRST, 2026-08-09: THE UNIT, WITHOUT THE VALUE.
 *
 * layout-sky.js took `restWeakN: 2204` and held restWeak * k constant, so one
 * constant meant the same thing to the whole atlas and to a ten-film register.
 * It was pinned at n=2204, which makes the scale factor exactly 1 for the whole
 * atlas: the shipped 2,204-film layout was reproduced BIT-IDENTICALLY (verified
 * with --artifact, worst position delta 0.00e+0) and only the 72 re-formed
 * skies moved. Measured across all 73:
 *
 *      weakRatio >= 1.0        39 of 64  ->   2 of 64
 *      weakCloserP < 0.45      33 of 64  ->   1 of 64
 *      closerP < 0.65          20 of 64  ->   0 of 64
 *      |degreeBias| > 0.60     26 of 64  ->  56 of 64
 *      total standing breaches      118  ->      59
 *
 * The degreeBias column is the honest cost and it is not what it looks like.
 * The layouts that gained a radial gradient are exactly the ones whose
 * positions previously meant nothing: the correlation between degreeBias
 * magnitude gained and OLD closerP is -0.60, and `register:coming-of-age` went
 * from weakCloserP 0.051 / degreeBias +0.061 to 0.643 / -0.650. A layout cannot
 * be credited with not drawing degree while it was not drawing anything. The
 * gradient is also not specifically degree: summed bond strength predicts
 * radius as well or better (genre:drama -0.433 against -0.154 for degree), and
 * layout-sky.js already documents emergent centrality and asks for it to be
 * measured rather than eliminated. It is ratcheted, with that reason written
 * into layout-baseline.json's `note`.
 *
 * Raising the whole atlas to restWeak 120 was NOT done in that pass. It
 * recovers 0.168 of bondFit and costs closerP 0.839 -> 0.768 and weakCloserP
 * 0.765 -> 0.574; the operating point shipped then was legal on every
 * constraint this project has written down, so moving along the trade curve was
 * a design decision for whoever owns the sky, not a bug fix. The measurements
 * were left above so that decision could be taken with numbers.
 *
 * WHAT WAS DONE SECOND: THE VALUE, AND THE EXPONENT IT NEEDED.
 *
 * The owner took it. restWeak is 120, restoring the whole atlas to the 0.83 the
 * solver's own header always said it was tuned to.
 *
 * Setting 120 with restWeak * k held FLAT does not work, and this tool is what
 * says so: the value that puts the whole atlas on 0.83 puts 13 of 64 scoreable
 * strata OVER 1.0, worse than the 4 the unit fix alone left. A rest length is a
 * wish and a small sparse register grants far more of it than the dense atlas
 * does, so one fraction-of-the-picture cannot serve both. layout-sky.js
 * therefore carries `restWeakExp: 0.75` — restWeak * k rises as n^0.25 — and
 * the full argument, the sweep and the counterfactual live in that file's
 * header under "WHY THE EXPONENT IS 0.75". Measured here, 48-flat -> 120-at-
 * 0.75, across all 73:
 *
 *     whole atlas bondFit      -0.4161 -> -0.5836
 *     whole atlas formFit      -0.1532 -> -0.4062
 *     whole atlas weakRatio      0.499 ->   0.837
 *     whole atlas closerP        0.837 ->   0.766   (invariant floor 0.70)
 *     whole atlas weakCloserP    0.766 ->   0.577   (invariant floor 0.52)
 *     director nnLift            19.0x ->   10.1x
 *     weakRatio >= 1.0         4 of 64 -> 3 of 64
 *     total standing breaches       66 ->      61
 *
 * closerP and weakCloserP falling IS the trade curve, walked deliberately to
 * the tuned point and no further. Read them next to formFit, which is the
 * statistic rule 1 is actually about, and which nearly tripled.
 *
 * ── WHERE THIS GATE SITS IN `npm test`, WHICH IS LOAD-BEARING ───────────────
 *
 * `npm test` chains with &&, and `test:atlas-engine` contains measure-maps.js,
 * which FAILS at HEAD and has failed since the harvest (STATE.md item 2:
 * interpretive edges 11% against a 15% target). A gate placed after it never
 * executes. So `test:atlas-layout` runs BEFORE `test:atlas-engine` — otherwise
 * this file would have been wired into the release command and still never run,
 * which is a more expensive version of not being committed at all. If
 * measure-maps.js is ever fixed, the order stops mattering; until then, do not
 * "tidy" it back.
 */
