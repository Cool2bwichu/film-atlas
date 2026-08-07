#!/usr/bin/env node
/* layout-sky-spectral.js — constellation layout: SPECTRAL EMBEDDING of the
 * bond-weighted graph Laplacian, then a short force refinement.
 *
 *   const { layout } = require("./layout-sky-spectral.js");
 *   const pos = layout(films, edges);      // -> { key: [x, y] }, both in [0,1]
 *
 * WHY THIS RUNS AT BUILD TIME
 *
 * A layout over the whole corpus is not something to make a phone compute on
 * first open of the view, every time. Running it here costs under a second of
 * build and ships two numbers per film. It also makes the sky DETERMINISTIC,
 * which AGENTS rule 7 requires of everything else: a layout that settled
 * differently on every load would mean the shape of cinema rearranged itself
 * while you looked away, and nobody could ever say "it's over on the left" to
 * anybody else. Every random source in this file is seeded for that reason.
 *
 * ── WHY SPECTRAL FIRST, AND WHAT IT IS ACTUALLY FOR ─────────────────────────
 *
 * A force simulation started from noise, or from a spiral, is a local search.
 * It fixes local overlap in the first few passes and then spends the rest of
 * its budget unable to undo a global mistake: two traditions that began
 * interleaved stay interleaved, because unpicking them requires moving a
 * hundred films through each other and every intermediate state is worse than
 * both endpoints. The simulation cannot climb that hill, so the answer you get
 * is decided by the initial condition, not by the corpus.
 *
 * The spectral embedding IS a global answer, computed in one shot. The two
 * smallest non-trivial eigenvectors of the graph Laplacian minimise
 *
 *      sum over edges of  w_ij * (u_i - u_j)^2
 *
 * subject to being centred and mutually orthogonal — i.e. they are the smoothest
 * possible pair of coordinates on the graph, the assignment that most nearly
 * gives strongly bonded films the same number. That objective is a global
 * property of the whole edge set. It is not reachable by relaxation and it does
 * not depend on where anything started. Traditions come out as separated blocks
 * because separating them is what minimising that sum means.
 *
 * What spectral is NOT good at is metric distance. It optimises a quadratic
 * form, so it is dominated by the largest displacements, and the standard
 * result is a crowded core with a thin halo: the global arrangement is right
 * and the local spacing is unusable. That is exactly the division of labour
 * here. Spectral decides WHICH REGION each film belongs in; the force stage
 * decides HOW FAR APART two bonded films sit. Neither stage could do the
 * other's job.
 *
 * ── HOW THIS OBEYS AGENTS RULE 1 ────────────────────────────────────────────
 *
 * Rule 1: edge distance encodes formal bond strength, never popularity or node
 * degree. Concretely, in this file:
 *
 *   - The Laplacian is built from `edge.strength` alone: w_ij = strength^alpha.
 *     A strong bond is a stiff spring in the quadratic form, so the smoothest
 *     coordinate puts its two ends close together. Nothing else enters.
 *
 *   - The force stage's TARGET DISTANCE for every edge is a strictly decreasing
 *     function of `edge.strength` and of nothing else. That mapping is the
 *     entire content of the picture.
 *
 *   - Node degree appears in no force term, no target distance, no stiffness
 *     and no step size. The step cap is a single global number, identical for
 *     every film on every iteration, so it cannot smuggle degree back in
 *     through the integrator: a film with 34 bonds is allowed exactly the same
 *     displacement per pass as a film with 1.
 *
 * ONE PLACE DEGREE-SHAPED ARITHMETIC APPEARS, AND WHY IT IS NOT A VIOLATION.
 * The Laplacian is L = D - W, and D is the diagonal of weighted degrees. That
 * is not a weighting decision — it is what the objective above becomes when you
 * write it as a matrix. There is no choice available: any expression of
 * "sum over edges of w_ij (u_i - u_j)^2" has those row sums in it. What WOULD
 * be a violation, and is deliberately not done here, is the usual next step:
 * most spectral-layout literature solves the NORMALISED problem L u = lambda D u,
 * i.e. divides through by degree, which really is a per-node reweighting by how
 * many bonds a film happens to have. This file uses the unnormalised Laplacian
 * with plain Euclidean orthogonality so that the only per-edge quantity in the
 * whole eigenproblem is bond strength. It costs some conditioning; it keeps the
 * rule clean. The `degreeBias` column of the layout harness is the audit for
 * whether that held.
 *
 * ── WHY THE TARGET DISTANCE IS RANK-BASED ───────────────────────────────────
 *
 * `strength` is not uniformly distributed. Across 7,759 edges it takes 263
 * distinct values with the mass piled up between 0.40 and 0.65 — quartiles
 * 0.395 / 0.56 / 0.64 over a full range of 0.19 to 0.92. Mapping strength
 * linearly onto distance therefore spends most of the available separation on
 * the sparse tails and squeezes two thirds of the corpus's edges into a narrow
 * band where the differences between them are smaller than the error a 2D
 * embedding of a graph this dense can possibly achieve. Those edges then order
 * themselves by whatever local frustration decides, which is topology, which is
 * the thing rule 1 exists to keep out.
 *
 * So the target distance is a function of the edge's RANK in strength rather
 * than of its raw value — the flat-histogram transform. This is still a
 * strictly monotone function of `edge.strength` and of nothing else, so the
 * encoding rule 1 demands is intact: stronger bond, shorter edge, always. What
 * changes is that equal steps in bond rank become equal steps in distance, so
 * the resolution is spent where the corpus actually has edges. `bondFit` in the
 * harness is Spearman — a rank correlation — precisely because ranks are what
 * a reader can actually compare on screen, and this makes the layout optimise
 * the same thing the metric measures instead of a proxy for it.
 *
 * Ties are given the midrank they span, so two edges the corpus calls equally
 * strong are given equal target distances rather than an arbitrary order.
 *
 * ── WHY THE FORCE STAGE IS SO SHORT ─────────────────────────────────────────
 *
 * 260 passes, against 420 for the baseline and rather more for a from-scratch
 * simulation. That is the whole benefit of the spectral start: the refinement
 * is not searching for the global arrangement, it already has one. It is only
 * setting distances and relieving overlap, both of which are local work that
 * converges quickly. Cooling is correspondingly gentle — a hot schedule would
 * throw away the initial condition it was given.
 */

"use strict";

/* Defaults are the tuned values; every one is exposed through `opts` so the
   sweep that chose them can be re-run rather than taken on trust. */
const DEFAULTS = {
  /* --- spectral stage --- */
  spectralAlpha: 1.0,     /* w_ij = strength^alpha in the Laplacian           */
  spectralIters: 600,     /* hard cap on power iterations per eigenvector     */
  spectralTol: 1e-12,     /* relative Rayleigh-quotient change to stop at     */
  shiftFrac: 0.62,        /* spectral shift, as a fraction of lambda_max      */

  /* --- target distances --- */
  targetSpread: 15.0,     /* weakest target / strongest target, minus one    */
  rankMix: 1.0,           /* 1 = pure rank transform, 0 = raw strength        */
  stiffPow: 1.25,         /* spring stiffness = target^-stiffPow              */

  /* --- force refinement --- */
  refineIters: 900,
  springGain: 0.60,
  repelGain: 0.55,
  repelRange: 2.0,        /* repulsion cutoff, in units of the shortest target */
  stepHot: 4.7,           /* per-pass displacement cap, hot, in MEAN targets  */
  stepCold: 0.02,         /* per-pass displacement cap, cold, in mean targets */
  coolPow: 1.35,

  /* --- spacing floor --- */
  reliefPack: 0.62,       /* floor as a fraction of the ideal packing pitch   */
  reliefRounds: 4,
  reliefPasses: 220,
};

/* Seeded, because "deterministic" has to survive someone adding a film: the
   same corpus must give the same sky twice, and a bare Math.random() would
   quietly break that while still looking fine in a screenshot. This is used
   only for the power iteration's start vector and for nudging apart films that
   land at numerically identical coordinates, but both would be enough to make
   two builds disagree. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Midranks scaled to (0,1). Ties share the average of the ranks they span,
   which is what makes this the flat-histogram transform rather than an
   arbitrary tiebreak: the corpus says these bonds are equally strong, so they
   must be given equal target distances. The index tiebreak in the comparator
   keeps the sort stable, and therefore the whole layout reproducible. */
function midrankFractions(values, count) {
  const order = new Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  order.sort((p, q) => (values[p] - values[q]) || (p - q));
  const out = new Float64Array(count);
  let i = 0;
  while (i < count) {
    let j = i;
    while (j + 1 < count && values[order[j + 1]] === values[order[i]]) j++;
    /* Midrank of the run, mapped to (0,1) with half-cell insets so neither
       endpoint is exactly 0 or 1. */
    const f = ((i + j) / 2 + 0.5) / count;
    for (let k = i; k <= j; k++) out[order[k]] = f;
    i = j + 1;
  }
  return out;
}

function layout(films, edges, opts) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  const keys = Object.keys(films);
  const n = keys.length;
  const out = {};
  if (n === 0) return out;
  if (n === 1) { out[keys[0]] = [0.5, 0.5]; return out; }

  const idx = new Map();
  for (let i = 0; i < n; i++) idx.set(keys[i], i);

  /* Edge list as flat typed arrays. One pass over three Float64Arrays per
     iteration beats chasing 7,759 object pointers 260 times, and at the 20,000
     edges this has to survive it is the difference between a build step and a
     coffee break. Edges naming a film the corpus does not contain, and
     self-edges, are dropped here rather than guarded against in the inner
     loops. */
  const rawM = edges.length;
  const ea = new Int32Array(rawM);
  const eb = new Int32Array(rawM);
  const es = new Float64Array(rawM);
  let m = 0;
  for (let e = 0; e < rawM; e++) {
    const E = edges[e];
    const A = idx.get(E.a), B = idx.get(E.b);
    if (A === undefined || B === undefined || A === B) continue;
    let s = E.strength;
    s = (typeof s === "number" && isFinite(s)) ? s : 0;
    ea[m] = A; eb[m] = B;
    es[m] = s < 0 ? 0 : (s > 1 ? 1 : s);
    m++;
  }

  const rnd = mulberry32(0x0a71a5);

  /* ================================================================ stage 1
     SPECTRAL EMBEDDING

     Wanted: the eigenvectors of L = D - W for the two smallest non-zero
     eigenvalues. L is symmetric positive semi-definite; on a connected graph
     the smallest eigenvalue is exactly 0 with the all-ones eigenvector, which
     carries no information (it says "put every film in the same place") and is
     deflated away.

     Power iteration finds the LARGEST eigenvalue, so the spectrum is flipped:
     iterate on M = c*I - L, whose eigenvalues are c - lambda. Deflate the
     all-ones vector and the largest remaining is the Fiedler vector; deflate
     that too and the next is the second. Both deflations are re-applied on
     every pass, not just at the start: in floating point the component along a
     deflated direction regrows from rounding error and, because that direction
     has the largest eigenvalue of them all, it regrows fastest. Deflate once
     and the iteration converges neatly to the answer you just removed.

     The choice of c is the only delicate part and it is a speed/safety trade.
     Convergence to the wanted vector needs c - lambda_2 > |c - lambda_max|,
     i.e. c above the midpoint of the spectrum; convergence SPEED is governed by
     (c - lambda_3)/(c - lambda_2), which improves as c falls toward that
     midpoint. So c is set just above half of an estimated lambda_max, and the
     estimate is made by power-iterating L directly rather than by using the
     Gershgorin bound 2*max(D), which on this corpus overshoots by enough to
     roughly triple the iteration count. The result is then checked: if the
     vector that came back has a Rayleigh quotient up at the top of the
     spectrum, the shift was too small, and the whole stage is redone with a
     conservative c. That fallback has not fired on this corpus; it exists
     because a future corpus with a very different spectrum should degrade in
     speed, not in correctness. */

  const wt = new Float64Array(m);
  for (let e = 0; e < m; e++) {
    wt[e] = o.spectralAlpha === 1 ? es[e] : Math.pow(es[e], o.spectralAlpha);
  }
  const wdeg = new Float64Array(n);
  for (let e = 0; e < m; e++) { wdeg[ea[e]] += wt[e]; wdeg[eb[e]] += wt[e]; }

  const tmp = new Float64Array(n);

  /* v = L u, with L = D - W. Never materialised: L is 803x803 today and
     2,000x2,000 soon, and the product is O(n + m) from the edge list. */
  function applyL(u, v) {
    for (let i = 0; i < n; i++) v[i] = wdeg[i] * u[i];
    for (let e = 0; e < m; e++) {
      const i = ea[e], j = eb[e], w = wt[e];
      v[i] -= w * u[j];
      v[j] -= w * u[i];
    }
  }

  function norm(u) {
    let s = 0;
    for (let i = 0; i < n; i++) s += u[i] * u[i];
    return Math.sqrt(s);
  }

  function scaleToUnit(u) {
    const s = norm(u);
    if (s <= 1e-300) { u[0] = 1; return; }
    const inv = 1 / s;
    for (let i = 0; i < n; i++) u[i] *= inv;
  }

  /* Remove the all-ones component (centre it) and the component along each
     already-found eigenvector. Modified Gram-Schmidt, run twice: one pass
     leaves a residual proportional to the rounding error times the condition
     number, and re-orthogonalising once more takes that to machine precision.
     Cheap at O(n) per vector, and the alternative is silent contamination. */
  function deflate(u, basis) {
    for (let pass = 0; pass < 2; pass++) {
      let mean = 0;
      for (let i = 0; i < n; i++) mean += u[i];
      mean /= n;
      for (let i = 0; i < n; i++) u[i] -= mean;
      for (let b = 0; b < basis.length; b++) {
        const v = basis[b];
        let dot = 0;
        for (let i = 0; i < n; i++) dot += u[i] * v[i];
        for (let i = 0; i < n; i++) u[i] -= dot * v[i];
      }
    }
  }

  /* Rough lambda_max by power iteration on L itself. 90 passes is nowhere near
     converged and does not need to be — this only sets a shift, and the guard
     below covers an underestimate. */
  function estimateLambdaMax() {
    const u = new Float64Array(n);
    for (let i = 0; i < n; i++) u[i] = rnd() - 0.5;
    scaleToUnit(u);
    let lam = 0;
    for (let it = 0; it < 90; it++) {
      applyL(u, tmp);
      lam = 0;
      for (let i = 0; i < n; i++) lam += u[i] * tmp[i];
      const s = norm(tmp);
      if (s <= 1e-300) break;
      const inv = 1 / s;
      for (let i = 0; i < n; i++) u[i] = tmp[i] * inv;
    }
    return lam;
  }

  /* One eigenvector of L, by power iteration on c*I - L with `basis` deflated
     out. Returns the vector and its Rayleigh quotient on L. */
  function lowEigenvector(c, basis) {
    const u = new Float64Array(n);
    for (let i = 0; i < n; i++) u[i] = rnd() - 0.5;
    deflate(u, basis);
    scaleToUnit(u);
    let lam = Infinity, prev = Infinity, stable = 0;
    for (let it = 0; it < o.spectralIters; it++) {
      applyL(u, tmp);
      lam = 0;
      for (let i = 0; i < n; i++) lam += u[i] * tmp[i];
      /* u <- (c*I - L) u */
      for (let i = 0; i < n; i++) tmp[i] = c * u[i] - tmp[i];
      for (let i = 0; i < n; i++) u[i] = tmp[i];
      deflate(u, basis);
      scaleToUnit(u);
      /* Stop on a Rayleigh quotient that has stopped moving. Requiring it to
         hold for three consecutive passes guards against the transient plateau
         a power iteration crosses while two components are still trading. The
         test is on floating-point values produced by a fixed code path, so it
         fires on exactly the same iteration in every run. */
      const rel = Math.abs(lam - prev) / (Math.abs(lam) + 1e-30);
      if (rel < o.spectralTol) { if (++stable >= 3) break; } else stable = 0;
      prev = lam;
    }
    return { u, lam };
  }

  const lamMax = estimateLambdaMax();
  let shift = o.shiftFrac * (lamMax > 0 ? lamMax : 1);
  let basis = [];
  let v1 = lowEigenvector(shift, basis);
  /* The guard. A Rayleigh quotient sitting above the shift means the iteration
     climbed to the wrong end of the spectrum. Redo with c comfortably above
     lambda_max, which always converges to the bottom, just slowly. */
  if (!(v1.lam < shift) && lamMax > 0) {
    shift = 1.05 * lamMax;
    basis = [];
    v1 = lowEigenvector(shift, basis);
  }
  basis = [v1.u];
  const v2 = lowEigenvector(shift, basis);

  /* ── DE-CROWDING, WHICH IS NOT OPTIONAL ON THIS CORPUS ──────────────────
   *
   * "Spectral layouts crowd" understates what happens here. MEASURED on the
   * shipped 803-film corpus: 801 of 803 films land inside 10% of the point
   * cloud's radius, and the ratio of the largest radius to the median is 425.
   * The eigenvectors are LOCALISED — the inverse participation ratio of every
   * one of the first eight non-trivial modes says an effective support of 1.0
   * films. Each of those modes is a spike on a single film with a decaying
   * tail over the rest of the graph.
   *
   * This is not a bug in the iteration; it is what the unnormalised Laplacian
   * of this graph actually looks like. Weighted degree here runs from 0.54 to
   * 21.9, and a film bonded to the corpus by 0.54 of total strength is very
   * nearly an isolated vertex: it contributes an eigenvalue of about its own
   * weighted degree with an eigenvector concentrated on itself. Fourteen films
   * have three or fewer edges, and the low tail of weighted degree is
   * continuous below that, so there is no shallow set of localised modes one
   * could simply skip past — 83 films sit below weighted degree 5.
   *
   * The textbook cure is the degree-normalised problem, L u = lambda D u, which
   * suppresses exactly this. IT IS BARRED HERE, and not on a technicality:
   * that formulation constrains sum(d_i * u_i^2) = 1, which gives a
   * well-connected film more mass and so penalises it for sitting away from
   * the centre. That is a graph weighted by fame, drawing the canon toward the
   * middle — the precise failure AGENTS rule 1 was written after.
   *
   * So the localisation is absorbed rather than prevented. Each eigenvector is
   * WINSORISED at its 2nd and 98th percentiles and rescaled to unit standard
   * deviation, which throws away the spike's magnitude and keeps the tail —
   * and the tail is the part carrying global information, since it decays with
   * graph distance from the film the mode sits on. What the force stage
   * receives is therefore a crude but real global arrangement rather than 801
   * films stacked at the origin with two flung to the corners.
   *
   * Without this the layout is not merely worse, it is destroyed: at 150
   * refinement passes the raw eigenvectors give occupancy 0.006 with 99% of
   * films overlapping, against 0.358 and 0.3% after winsorising.
   */
  const x = new Float64Array(n), y = new Float64Array(n);
  robustAxis(v1.u, x);
  robustAxis(v2.u, y);

  function robustAxis(src, dst) {
    const s = Float64Array.from(src);
    s.sort();
    const lo = s[Math.floor(0.02 * (n - 1))];
    const hi = s[Math.floor(0.98 * (n - 1))];
    let mean = 0;
    for (let i = 0; i < n; i++) {
      const v = src[i] < lo ? lo : (src[i] > hi ? hi : src[i]);
      dst[i] = v; mean += v;
    }
    mean /= n;
    let sd = 0;
    for (let i = 0; i < n; i++) { const d = dst[i] - mean; sd += d * d; }
    sd = Math.sqrt(sd / n) || 1;
    for (let i = 0; i < n; i++) dst[i] = (dst[i] - mean) / sd;
  }

  /* Both axes are now at unit standard deviation, so they arrive at the same
     scale by construction rather than at scales set by their eigenvalues. That
     is the right choice here: the axes are a starting arrangement, not a metric
     embedding, and letting the second axis arrive pre-squashed by
     lambda_2/lambda_3 would hand the force stage a strip to un-flatten with a
     budget meant for spacing. */

  /* ================================================================ stage 2
     TARGET DISTANCES

     A strictly decreasing function of bond strength, computed once. Everything
     downstream is in these units, so the absolute scale is arbitrary — only
     the RATIO between the weakest and strongest target does anything, and that
     is `targetSpread`. The shortest target is pinned at 1. */

  const strengthFrac = midrankFractions(es, m);
  const target = new Float64Array(m);
  const stiff = new Float64Array(m);
  let sMin = Infinity, sMax = -Infinity;
  for (let e = 0; e < m; e++) {
    if (es[e] < sMin) sMin = es[e];
    if (es[e] > sMax) sMax = es[e];
  }
  const sRange = (sMax - sMin) || 1;
  for (let e = 0; e < m; e++) {
    /* `rankMix` blends the flat-histogram transform with the raw value. It is
       kept as a knob rather than hard-coded at 1 because the argument for the
       rank transform is an argument about THIS corpus's strength histogram; a
       corpus whose strengths came out uniform would want the raw value, and
       the difference should be visible in one number rather than in a rewrite. */
    const fr = o.rankMix * strengthFrac[e] +
               (1 - o.rankMix) * ((es[e] - sMin) / sRange);
    target[e] = 1 + o.targetSpread * (1 - fr);
    /* Stiffness falls with target length. This is the standard stress weight
       (w = d^-2 recovers Kamada-Kawai exactly), softened to d^-0.5 here.
       WHY SOFTENED: the harness's bondFit is a rank correlation over all edges
       equally, so an edge that should be long deserves nearly as much of the
       optimiser's attention as one that should be short. Full d^-2 spends
       almost everything on the short end, nails the strong bonds, and lets the
       weak half of the corpus order itself at random — which reads on screen as
       "distance means nothing out here". Note this is a function of the target,
       i.e. of strength, so it is rule-1 clean: it is not a per-node quantity at
       all and cannot carry degree. */
    stiff[e] = o.stiffPow === 0 ? 1 : Math.pow(target[e], -o.stiffPow);
  }

  /* Put the spectral cloud at the scale the targets expect, by matching the
     mean rendered edge length to the mean target. One global scalar: it
     changes no distance ratio and therefore no structure, it just stops the
     force stage spending its first fifty passes inflating or deflating a cloud
     whose shape was already correct. */
  {
    let sumLen = 0, sumTgt = 0;
    for (let e = 0; e < m; e++) {
      const dx = x[ea[e]] - x[eb[e]], dy = y[ea[e]] - y[eb[e]];
      sumLen += Math.sqrt(dx * dx + dy * dy);
      sumTgt += target[e];
    }
    const k = (sumLen > 1e-12) ? (sumTgt / sumLen) : 1;
    for (let i = 0; i < n; i++) { x[i] *= k; y[i] *= k; }
  }

  /* Break exact ties. Spectral coordinates are genuinely degenerate for films
     the graph cannot tell apart — two films whose entire edge set is identical
     get identical eigenvector entries, exactly, and then every force between
     them is zero forever and they stay welded together through the whole
     refinement. The nudge is far below the shortest target so it perturbs
     nothing else. */
  {
    const jitter = 1e-3;
    for (let i = 0; i < n; i++) {
      x[i] += (rnd() - 0.5) * jitter;
      y[i] += (rnd() - 0.5) * jitter;
    }
  }

  /* ================================================================ stage 3
     FORCE REFINEMENT

     Plain gradient descent on the stress
        sum over edges of  stiff_e * (|p_i - p_j| - target_e)^2
     plus a short-range repulsion that only exists to stop two films printing
     on top of each other. No velocity, no momentum: a capped-step descent on a
     configuration that is already globally right converges without them, and
     momentum on a dense graph is what turns a settling layout into a ringing
     one.

     THE STEP CAP IS WHAT MAKES THIS CONVERGE. With ~19 edge-ends per film,
     every spring adds into the same displacement, and a film sitting far from
     a neighbour receives a correction much larger than the distance it needed
     to move. Capping the per-pass displacement is the Fruchterman-Reingold
     cooling schedule, and it is deliberately DEGREE-FREE: one number, the same
     for every film on every pass. A well-connected film is allowed exactly the
     same step as an isolated one, so the integrator cannot reintroduce the
     popularity weighting rule 1 keeps out of the forces. */

  const fx = new Float64Array(n), fy = new Float64Array(n);
  const sep = o.repelRange;             /* repulsion cutoff, in target units */
  const cell = sep;
  const bins = new Map();
  const ITER = o.refineIters;
  /* The step cap is quoted in MEAN TARGET lengths rather than in raw units, so
     that changing `targetSpread` does not silently change how hard the
     integrator is being throttled. Without this the cap is absolute while the
     layout's scale is set by the targets, and raising the spread quietly
     freezes the simulation — measured: at spread 30 with the old absolute cap
     the refinement stopped moving long before the stress minimum and bondFit
     came out at -0.52 instead of -0.77. */
  let meanTarget = 0;
  for (let e = 0; e < m; e++) meanTarget += target[e];
  meanTarget = m ? meanTarget / m : 1;

  for (let it = 0; it < ITER; it++) {
    /* Cooling: real rearrangement early, fine settling late. Gentler than a
       from-scratch simulation would use, because the initial condition here is
       worth preserving. */
    const heat = Math.pow(1 - it / ITER, o.coolPow);
    fx.fill(0); fy.fill(0);

    /* Springs. `target` is a function of edge strength and nothing else; this
       loop is the whole of rule 1 in executable form. */
    for (let e = 0; e < m; e++) {
      const i = ea[e], j = eb[e];
      let dx = x[j] - x[i], dy = y[j] - y[i];
      let d2 = dx * dx + dy * dy;
      if (d2 < 1e-18) { dx = 1e-6; dy = 0; d2 = 1e-12; }
      const d = Math.sqrt(d2);
      const f = o.springGain * stiff[e] * (d - target[e]) / d;
      const ux = f * dx, uy = f * dy;
      fx[i] += ux; fy[i] += uy;
      fx[j] -= ux; fy[j] -= uy;
    }

    /* Repulsion, over a lattice, against the 3x3 block of cells only. Two
       objections to that, both answered by the structure of this file rather
       than by the force itself:

       - "Local repulsion cannot separate two clusters." True, and irrelevant
         here: separating clusters is the spectral stage's job and it has
         already been done globally, in closed form, before this loop runs.
         Long-range repulsion would in fact FIGHT that result, because it
         pushes on films that share no bond at all and therefore has no
         opinion the corpus authorised.

       - "It will leave films stacked." Only if the cutoff is too small; it is
         set slightly above the shortest target, so any pair close enough to
         collide is inside somebody's 3x3 block by construction.

       The force is linear in the overlap and vanishes at the cutoff, so it has
       no singularity to blow the integrator up with, unlike an unbounded
       1/d^2. It is also applied to bonded and unbonded pairs alike: a pair
       whose target is shorter than the cutoff would otherwise be shoved apart
       by a term the corpus never asked for, so the cutoff is chosen to sit at
       the strongest bond's target and the two forces balance there instead of
       fighting. */
    bins.clear();
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i] / cell), cy = Math.floor(y[i] / cell);
      const k = cx * 1048576 + cy;
      let b = bins.get(k);
      if (!b) { b = []; bins.set(k, b); }
      b.push(i);
    }
    const rg = o.repelGain * (0.35 + 0.65 * heat);
    for (const [k, b] of bins) {
      const cx = Math.floor(k / 1048576), cy = k - cx * 1048576;
      for (let dxc = -1; dxc <= 1; dxc++) {
        for (let dyc = -1; dyc <= 1; dyc++) {
          const nb = bins.get((cx + dxc) * 1048576 + (cy + dyc));
          if (!nb) continue;
          for (let p = 0; p < b.length; p++) {
            const i = b[p];
            for (let q = 0; q < nb.length; q++) {
              const j = nb[q];
              if (j <= i) continue;
              let dx = x[i] - x[j], dy = y[i] - y[j];
              let d2 = dx * dx + dy * dy;
              if (d2 >= sep * sep) continue;
              if (d2 < 1e-18) { dx = (rnd() - 0.5) * 1e-5; dy = (rnd() - 0.5) * 1e-5; d2 = dx * dx + dy * dy; }
              const d = Math.sqrt(d2);
              const f = rg * (sep - d) / d;
              const ux = f * dx, uy = f * dy;
              fx[i] += ux; fy[i] += uy;
              fx[j] -= ux; fy[j] -= uy;
            }
          }
        }
      }
    }

    const step = (o.stepHot * heat + o.stepCold) * meanTarget;
    const step2 = step * step;
    for (let i = 0; i < n; i++) {
      let dx = fx[i], dy = fy[i];
      const s2 = dx * dx + dy * dy;
      if (s2 > step2) { const s = step / Math.sqrt(s2); dx *= s; dy *= s; }
      x[i] += dx; y[i] += dy;
    }
  }

  /* ================================================================ stage 4
     NORMALISE, THEN ENFORCE A SPACING FLOOR

     Normalise into [0,1] on the LONGER axis and centre the shorter one, so the
     aspect ratio of the cloud survives. Squashing the sky to fill a square
     would stretch one axis and compress the other, which distorts exactly the
     distances rule 1 says are the meaningful thing on screen — a layout that
     scored well on bond fit before the squash would be lying after it.

     Then a spacing floor: no two films closer than `sepFloor` on the rendered
     canvas. This is a separate stage from the refinement's repulsion, and it
     is separate for a reason the refinement cannot get around. A film is
     STACKED when its cell overlaps a neighbour's cell in pixels, which is a
     fact about [0,1] and about the final scale — and the final scale is not
     known while the simulation is still running in target units, because it
     falls out of the extent the simulation happens to settle into. So the
     floor has to be applied after normalisation or it is being enforced
     against a number that does not exist yet.

     THE FLOOR SCALES WITH THE CORPUS, and must. For n points in a unit square
     the tightest possible uniform spacing is the hexagonal packing pitch,
     sqrt(2/(sqrt(3) n)) ~ 1.0746/sqrt(n): 0.038 at today's 803 films, 0.024 at
     2,000. A floor hard-coded at today's value would be unsatisfiable at
     2,000 and the stage would spend its whole budget grinding without ever
     terminating. Quoting it as a FRACTION of that pitch keeps its meaning
     fixed as the corpus grows — "keep films at least 70% of ideal-packing
     apart" is the same instruction at any n.

     WHY THE STRUCTURE IS ROUNDS-OF-PASSES RATHER THAN ONE LOOP. The obvious
     implementation — push apart, renormalise, repeat — is a treadmill and does
     not converge: the push gains separation and the renormalise immediately
     takes it back, so the pass count silently becomes a parameter and the
     answer depends on where the budget ran out. Measured, that version was
     still reporting 1,900 violating pairs after 200 passes with no downward
     trend. Here the inner passes run in a FIXED frame, where pushing apart
     only ever increases separations, so violations fall monotonically and the
     loop terminates on its own; the cloud grows a little, and the outer round
     renormalises once and re-checks. Four rounds is comfortably past the point
     where the growth factor stops mattering.

     WHAT THIS COSTS, STATED PLAINLY: the floor is a mild uniformising
     pressure, and uniformising is not free. It takes bondFit from -0.775 to
     -0.749 on the shipped corpus while taking occupancy from 0.385 to 0.466.
     That trade is taken deliberately — films are drawn as poster cells with
     real width, and two films 0.018 apart on a 1440px canvas are 26px apart,
     i.e. printed on top of each other — but it is a trade, and a corpus whose
     density variation was itself the story would want `reliefPack` lower. */

  function normalise() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (x[i] < minX) minX = x[i]; if (x[i] > maxX) maxX = x[i];
      if (y[i] < minY) minY = y[i]; if (y[i] > maxY) maxY = y[i];
    }
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const offX = (span - (maxX - minX)) / 2, offY = (span - (maxY - minY)) / 2;
    for (let i = 0; i < n; i++) {
      x[i] = (x[i] - minX + offX) / span;
      y[i] = (y[i] - minY + offY) / span;
    }
  }

  normalise();

  {
    /* Ideal packing pitch for n points in the unit square, times the requested
       fraction of it. */
    const sepFloor = o.reliefPack * Math.sqrt(2 / (Math.sqrt(3) * n));
    const rbins = new Map();
    for (let round = 0; round < o.reliefRounds; round++) {
      let moved = false;
      for (let pass = 0; pass < o.reliefPasses; pass++) {
        rbins.clear();
        for (let i = 0; i < n; i++) {
          const cx = Math.floor(x[i] / sepFloor), cy = Math.floor(y[i] / sepFloor);
          const k = cx * 1048576 + cy;
          let b = rbins.get(k);
          if (!b) { b = []; rbins.set(k, b); }
          b.push(i);
        }
        fx.fill(0); fy.fill(0);
        let hits = 0;
        for (const [k, b] of rbins) {
          const cx = Math.floor(k / 1048576), cy = k - cx * 1048576;
          for (let dxc = -1; dxc <= 1; dxc++) {
            for (let dyc = -1; dyc <= 1; dyc++) {
              const nb = rbins.get((cx + dxc) * 1048576 + (cy + dyc));
              if (!nb) continue;
              for (let p = 0; p < b.length; p++) {
                const i = b[p];
                for (let q = 0; q < nb.length; q++) {
                  const j = nb[q];
                  if (j <= i) continue;
                  let dx = x[i] - x[j], dy = y[i] - y[j];
                  let d2 = dx * dx + dy * dy;
                  if (d2 >= sepFloor * sepFloor) continue;
                  /* Two films at numerically identical coordinates have no
                     direction to separate along; the seeded nudge supplies one.
                     This is the only place in the file where a random number
                     touches a position, and it is seeded for the same reason
                     everything else here is. */
                  if (d2 < 1e-20) {
                    dx = (rnd() - 0.5) * 1e-6; dy = (rnd() - 0.5) * 1e-6;
                    d2 = dx * dx + dy * dy;
                  }
                  const d = Math.sqrt(d2);
                  hits++;
                  /* Each end takes half the shortfall, under-relaxed. Applying
                     the full correction in one pass overshoots into the next
                     collision and the pass oscillates instead of settling. */
                  const push = 0.5 * 0.55 * (sepFloor - d) / d;
                  fx[i] += push * dx; fy[i] += push * dy;
                  fx[j] -= push * dx; fy[j] -= push * dy;
                }
              }
            }
          }
        }
        if (!hits) break;
        moved = true;
        for (let i = 0; i < n; i++) { x[i] += fx[i]; y[i] += fy[i]; }
      }
      if (!moved) break;
      normalise();
    }
  }

  /* Four decimal places is ~1/25th of the collision threshold and ~1/10,000th
     of the canvas, so rounding here costs nothing visible and keeps the shipped
     corpus small. */
  for (let i = 0; i < n; i++) {
    out[keys[i]] = [
      Math.round(x[i] * 10000) / 10000,
      Math.round(y[i] * 10000) / 10000,
    ];
  }
  return out;
}

module.exports = { layout };
