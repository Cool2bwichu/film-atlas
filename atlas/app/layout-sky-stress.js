#!/usr/bin/env node
/* Constellation layout by stress majorization (SMACOF) on bond-weighted
 * graph distances.
 *
 *   const { layout } = require("./layout-sky-stress.js");
 *   const pos = layout(films, edges);      // -> { key: [x, y] }, both in [0,1]
 *
 * ── WHY STRESS MAJORIZATION RATHER THAN A FORCE SIMULATION ───────────────────
 *
 * A spring/repulsion simulation encodes the map's meaning only indirectly: you
 * tune a rest length, a charge, a decay and a cooling schedule, and hope the
 * settled equilibrium says what you meant. AGENTS rule 1 states the requirement
 * as a measurable property — *rendered distance encodes formal bond strength* —
 * and stress majorization optimises exactly that property, by name:
 *
 *     minimise  sum_ij  w_ij ( ||p_i - p_j|| - d_ij )^2
 *
 * d_ij is where we say film i and film j ought to sit relative to each other;
 * the algorithm's whole job is making the drawn distance agree. Nothing has to
 * be inferred from an equilibrium, because the objective IS the rule.
 *
 * The Guttman transform (`smacof()`) drives that objective down monotonically —
 * each step provably does not increase stress — so there is no temperature, no
 * velocity cap, no cooling schedule, and no way for the layout to explode on a
 * corpus shaped differently from this one.
 *
 * ── HOW RULE 1 IS OBEYED, LITERALLY ──────────────────────────────────────────
 *
 * An edge's target distance is a strictly decreasing function of that edge's
 * `strength` and of nothing else (see "THE IMPLEMENTATION OF RULE 1" inside
 * `layout`). A strong bond is a SHORT hop. Distances between films NOT joined
 * by an edge are shortest paths through that same bond-weighted graph, so an
 * indirect relation reads as a longer walk — which is the honest statement
 * about it.
 *
 * Node degree appears in no distance, no weight and no force term. Grep this
 * file for "degree": every hit is in a comment. Landmarks are picked by
 * farthest-point sampling on graph distance, never by connectivity, precisely
 * so a well-connected film gets no privileged seat in the basis.
 *
 * The caveat the sibling layouts also carry, stated rather than hidden: in ANY
 * distance-faithful embedding a film with many bonds lands nearer the middle,
 * because its many short target distances can only be jointly satisfied from
 * the centre of its neighbours. That is emergent from the corpus's topology,
 * not applied as a weight — and the topology is formal bonds, which is the
 * thing rule 1 wants drawn. The view must still not reinforce it: node size
 * stays CONSTANT and the caption never ranks. `degreeBias` in the layout
 * harness exists to keep the emergent effect visible and judged; this layout
 * measures -0.21 where the previous constellation layout measured -0.51.
 *
 * ── WHY THE DIRECT-EDGE TARGET OVERRIDES THE SHORTEST PATH ───────────────────
 *
 * This corpus is dense: 803 films, 7,759 edges, average degree ~9.7. In a graph
 * that dense a WEAK edge between A and B almost always has a shorter two-hop
 * detour A→C→B through stronger bonds. If the target for the pair (A,B) were
 * the plain shortest path, that detour would silently overwrite the weak bond's
 * own length and the map would draw a weak bond short — the exact failure rule
 * 1 forbids, arrived at through an innocent-looking shortcut.
 *
 * So for a pair that IS an edge the target is the bond's own rest length,
 * verbatim, and it carries extra weight (EDGE_WEIGHT). Shortest paths supply
 * the target only for pairs that are not edges, where they are the one sensible
 * answer.
 *
 * That deliberately makes the target matrix non-metric: d_AB can exceed
 * d_AC + d_CB. This is fine and intended. Stress majorization never assumes the
 * targets are a metric — it minimises disagreement with whatever targets it is
 * given — so an inconsistency resolves as a weighted compromise rather than an
 * error. Classical MDS *would* assume it, which is why classical MDS appears
 * here only as the starting configuration and never as the answer.
 *
 * ── WHY LANDMARKS ────────────────────────────────────────────────────────────
 *
 * All-pairs stress is O(n^2) terms per iteration: 322k at 803 films, 2M at the
 * 2,000+ this corpus is heading for. So the pair set is capped — every film is
 * tied to K landmark films (Brandes & Pich's landmark/pivot stress) plus to
 * every film it actually shares an edge with. K falls as n rises so the pair
 * count stays near TARGET_PAIRS, which makes cost per iteration roughly FLAT in
 * n instead of quadratic.
 *
 * Measured, and worth knowing before anyone "improves" this: K is a cost knob
 * and NOT a quality knob. Over K = 80 … 803 at n = 803, bondFit moves inside
 * ±0.01 while wall clock moves 4x. The landmark scheme is not a compromise
 * being tolerated for speed; it is free.
 *
 * ── WHAT WAS TRIED AND LOST ──────────────────────────────────────────────────
 *
 * Non-metric MDS (Kruskal disparities by full quantile matching): after the
 * metric solve, re-target every edge onto the distance distribution the layout
 * had actually achieved, permuted so the strongest bond gets the shortest slot.
 * It is the textbook move when the objective is rank agreement, and here it
 * made bondFit WORSE — -0.77 to -0.76 over twelve rounds, and still falling.
 *
 * The reason is worth recording because it is not obvious. Achieved distances
 * on a graph this frustrated are far more COMPRESSED than the targets; the
 * layout cannot stretch as far as it is asked to. Re-targeting onto the
 * achieved distribution therefore shrinks the demanded dynamic range every
 * round, and a shrinking range is exactly what makes the strength ordering
 * easier to lose. The correct lever pushes the range the other way — see
 * LENGTH_FAR — so the code that would have done the shrinking is not here.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────────
 *
 * Required by the reasoning behind AGENTS rule 7: a baked corpus exists so the
 * graph does not re-roll per request, and a layout that settled differently
 * each build would give that away again. Every source of arbitrariness is
 * pinned:
 *
 *   - film order is `Object.keys(films).sort()`, so it does not depend on the
 *     order the JSON happens to list films in;
 *   - the priority queue breaks ties on node index, so equal-cost paths resolve
 *     the same way twice — in a graph this dense there are many of them;
 *   - the power iteration that seeds the layout starts from a fixed vector;
 *   - the only jitter is `mulberry32`-seeded and exists solely to stop two
 *     coincident points dividing by zero.
 *
 * There is no `Math.random()` in this file. Verified: two calls on the 803-film
 * corpus and two on a 2,409-film probe return identical coordinates.
 */
"use strict";

/* ── Tuned constants ────────────────────────────────────────────────────────
 *
 * Every value below was chosen by sweeping it against the layout harness over
 * the whole corpus. Where a value is a compromise between two metrics that is
 * said so, because the next person to touch it needs to know which way it has
 * already been pushed.
 */

/* Rest length of the strongest bond in the corpus. Pure units — the layout is
   rescaled to [0,1] at the end, so only the RATIO to LENGTH_FAR matters. */
const LENGTH_NEAR = 1;

/* Rest length of the weakest bond: the dynamic range of "bond strength" as
   drawn, and the single most consequential number in the file.

   Too small and the strength ordering drowns in the residual error every dense
   graph leaves behind — at LENGTH_FAR = 2 bondFit is -0.33, at 5 it is -0.58.
   Too large and the map buys nothing further while the weakest edges, which are
   the numerous ones, stretch it into haze. Measured, the curve flattens hard
   past ~60; 90 sits just inside the flat. */
const LENGTH_FAR = 90;

/* Curvature of rank -> length. Below 1 it bends the mapping so most of the
   drawable range is spent on the strong half of the corpus, where the claims
   are specific and the reader is being told something; the weak tail is
   squeezed out into the far field, where "these barely relate" is the whole
   message. Sweeps put the optimum broadly across 0.3–0.55. */
const LENGTH_GAMMA = 0.4;

/* Weight multiplier on pairs that are actually edges. Rule 1 is a statement
   about EDGES, so the terms encoding it outrank the shortest-path scaffolding
   that merely keeps the map globally coherent. Flat from ~200 to ~2000; below
   ~50 the shortest paths start winning and weak bonds get drawn short. */
const EDGE_WEIGHT = 400;

/* w_ij = 1 / d_ij^WEIGHT_POWER.
 *
 * The classical Sammon/Kruskal choice is 2, which makes the objective
 * scale-free: every pair contributes its RELATIVE error, so a near pair drawn
 * at twice its target is penalised as hard as a far pair drawn at twice its
 * target. That is the right default and it is where this started. It is not
 * what measured best here, and the reason is specific to the direct-edge
 * override above.
 *
 * With LENGTH_FAR/LENGTH_NEAR = 90, an inverse-square weight makes the weakest
 * bond's term 8,100x lighter than the strongest bond's. Those weak terms then
 * contribute essentially nothing, the weak edges drift to wherever the
 * scaffolding leaves them, and the bottom of the strength range stops being
 * drawn at all. It shows up as an actual INVERSION in the measured deciles: at
 * WEIGHT_POWER = 2 the weakest tenth of edges renders at median length 0.332
 * while the next tenth up renders at 0.359 — the two weakest deciles in the
 * wrong order.
 *
 * At 0.65 the ratio is 18x rather than 8,100x: still ordered, so a strong bond
 * is still enforced harder than a weak one, but every edge is enforced at all.
 * All ten deciles then come out strictly monotone and bondFit goes -0.70 to
 * -0.81.
 *
 * So this is a deliberate departure from 1/d^2, made because the override that
 * protects weak bonds from shortcuts is undone by a weight that ignores them. */
const WEIGHT_POWER = 0.65;

/* Shortest-path targets are raised to this power before use. Below 1 it
   compresses the far field, pulling the outer reaches of the map inward and
   spreading the point cloud more evenly across the canvas — occupancy is a real
   requirement and this is the lever that serves it without touching a single
   edge target. Edge targets come from bond strength, never from paths, so rule
   1 is untouched by this knob. */
const PATH_POWER = 0.8;

/* Pair-count budget per SMACOF iteration; sets K, and therefore the cost curve.
   At n = 803 it selects K ≈ 300; at n = 2,409 the budget would ask for ~100 and
   MIN_LANDMARKS raises it back to 128. */
const TARGET_PAIRS = 200000;

/* Never fewer landmarks than this, whatever the budget says. Below ~60 the
   landmark distance signature stops separating films that share no edge, and
   films with similar signatures start piling up on each other. */
const MIN_LANDMARKS = 128;

/* Majorization steps. Converged: 300 and 850 differ by 0.001 of bondFit. 500 is
   deliberately past the knee, because a larger corpus needs more steps to
   propagate structure across a wider map and this must not need retuning the
   day the corpus doubles. */
const ITERATIONS = 500;

/* Overrelaxation on the Guttman step: p <- p + RELAX * (guttman(p) - p).
   RELAX = 1 is textbook SMACOF and provably monotone. A slight overshoot
   converges faster and lands marginally lower but forfeits the monotonicity
   proof — so stress is checked every iteration and the step reverts to 1.0 for
   good the first time stress rises. Worth ~0.002 of bondFit; kept because it is
   free and because the guard makes it safe. */
const RELAX = 1.35;

/* Separation floor, as a fraction of the canvas, applied after normalisation.
 *
 * This is the one place truthfulness is traded for legibility, so the trade is
 * stated in numbers. With no separation pass at all, 11% of films render within
 * the harness's collision distance of another film — two posters in one spot,
 * one of them unclickable. The measured cost/benefit runs:
 *
 *     0.017 -> bondFit -0.820, occupancy 0.326
 *     0.020 -> bondFit -0.814, occupancy 0.351
 *     0.023 -> bondFit -0.796, occupancy 0.380
 *
 * 0.020 is taken as the settle point: past it the curve turns and each further
 * point of occupancy costs several times as much bond fidelity. It is 5x the
 * harness's 0.004 collision threshold and about 29px on a 1440px canvas. */
const MIN_SEPARATION = 0.020;
const SEPARATION_PASSES = 40;

/* Seeded, because "deterministic" has to survive someone adding a film. Used
   for exactly one thing: a jitter of ~1e-9 of the layout scale so two films
   whose landmark signatures coincide do not sit at the same point and produce a
   0/0 in the Guttman transform. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Binary heap keyed on Float64 cost ──────────────────────────────────────
 *
 * Dijkstra runs K times over the whole edge list, so this is the hot inner
 * structure. Typed arrays and an explicit sift beat a sorted array or a
 * comparator-driven library by roughly an order of magnitude at this size.
 *
 * The tie-break on node id is not cosmetic. A graph this dense has many
 * equal-cost paths, and without a total order on the queue the shortest-path
 * tree — and therefore the whole layout — could differ between two runs purely
 * from heap fill order. */
function Heap(cap) {
  this.node = new Int32Array(cap);
  this.cost = new Float64Array(cap);
  this.size = 0;
}
Heap.prototype.clear = function () { this.size = 0; };
Heap.prototype.less = function (i, j) {
  const a = this.cost[i], b = this.cost[j];
  if (a !== b) return a < b;
  return this.node[i] < this.node[j];
};
Heap.prototype.swap = function (i, j) {
  const n = this.node[i]; this.node[i] = this.node[j]; this.node[j] = n;
  const c = this.cost[i]; this.cost[i] = this.cost[j]; this.cost[j] = c;
};
Heap.prototype.push = function (node, cost) {
  /* Lazy-deletion Dijkstra: a node is pushed once per improvement, so capacity
     has to track relaxations rather than nodes. Grow instead of assuming. */
  if (this.size === this.node.length) {
    const nn = new Int32Array(this.node.length * 2);
    nn.set(this.node); this.node = nn;
    const nc = new Float64Array(this.cost.length * 2);
    nc.set(this.cost); this.cost = nc;
  }
  let i = this.size++;
  this.node[i] = node; this.cost[i] = cost;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (this.less(i, p)) { this.swap(i, p); i = p; } else break;
  }
};
Heap.prototype.pop = function () {
  const top = this.node[0], topCost = this.cost[0];
  this.size--;
  if (this.size > 0) {
    this.node[0] = this.node[this.size];
    this.cost[0] = this.cost[this.size];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < this.size && this.less(l, m)) m = l;
      if (r < this.size && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m); i = m;
    }
  }
  return [top, topCost];
};

/* ── Landmark choice: farthest-point sampling ───────────────────────────────
 *
 * Maximally spread pivots, which is what makes a landmark distance signature
 * discriminative — K landmarks clustered in one region would give every distant
 * film nearly the same signature and let unrelated films collapse together.
 *
 * Chosen on graph distance only. It would be easy and wrong to seed this with
 * the best-connected film: that is degree, and rule 1 keeps degree out of the
 * geometry. The first landmark is film 0 in sorted key order — arbitrary but
 * reproducible, and farthest-point sampling is famously insensitive to where it
 * starts.
 *
 * Returns the distance rows alongside the landmarks because the caller needs
 * both; running Dijkstra twice per source would double the only superlinear
 * step in the file. */
function chooseLandmarks(n, K, adjStart, adjNode, adjLen) {
  const landmarks = new Int32Array(K);
  const rows = [];
  const best = new Float64Array(n).fill(Infinity);
  const dist = new Float64Array(n);
  const done = new Uint8Array(n);
  const heap = new Heap(Math.max(64, adjNode.length + 1));

  let src = 0;
  for (let li = 0; li < K; li++) {
    landmarks[li] = src;

    dist.fill(Infinity);
    done.fill(0);
    heap.clear();
    dist[src] = 0;
    heap.push(src, 0);
    while (heap.size > 0) {
      const popped = heap.pop();
      const u = popped[0];
      if (done[u]) continue;
      done[u] = 1;
      const du = popped[1];
      for (let e = adjStart[u]; e < adjStart[u + 1]; e++) {
        const v = adjNode[e];
        if (done[v]) continue;
        const nd = du + adjLen[e];
        if (nd < dist[v]) { dist[v] = nd; heap.push(v, nd); }
      }
    }

    const row = new Float64Array(n);
    row.set(dist);
    rows.push(row);

    /* Next landmark = the film currently farthest from every landmark placed so
       far. Unreachable films (Infinity) win automatically, which is what puts a
       landmark inside every component of a disconnected subgraph — the shipped
       corpus is one component, but a `--films` filtered build need not be. */
    let far = -1, farD = -1;
    for (let i = 0; i < n; i++) {
      const d = dist[i];
      if (d < best[i]) best[i] = d;
      const b = best[i];
      const cmp = (b === Infinity) ? Number.MAX_VALUE : b;
      /* Strict > keeps the lowest index on a tie, so the landmark sequence is a
         function of the corpus alone. */
      if (cmp > farD) { farD = cmp; far = i; }
    }
    src = far < 0 ? (li + 1) % n : far;
  }
  return { landmarks: landmarks, rows: rows };
}

/* ── PivotMDS: the starting configuration ───────────────────────────────────
 *
 * SMACOF descends to a LOCAL minimum, so where it starts decides which one. A
 * seeded-random start on a graph this size reliably lands folded — two regions
 * of the corpus laid over each other — and no amount of further majorization
 * undoes it, because unfolding requires passing back UP through higher stress.
 *
 * PivotMDS (Brandes & Pich, 2007) is classical MDS restricted to the n x K
 * distance matrix: double-centre the squared distances, take the top two
 * singular directions. Two matrix passes, and it hands SMACOF a globally sane,
 * unfolded configuration to sharpen.
 *
 * Classical MDS appears HERE and only here, for the reason given at the top of
 * the file: it assumes the targets are a metric, and the direct-edge override
 * makes ours deliberately not one. As a starting guess that assumption is
 * harmless; as the final answer it would quietly re-impose the shortcut the
 * override exists to prevent. */
function pivotMds(n, K, rows, x, y) {
  /* C[i][j] = -0.5 * double-centred squared distance. Row-major n x K. */
  const C = new Float64Array(n * K);
  const colMean = new Float64Array(K);
  const rowMean = new Float64Array(n);
  let grand = 0;

  for (let j = 0; j < K; j++) {
    const row = rows[j];
    let cs = 0;
    for (let i = 0; i < n; i++) {
      const d = row[i];
      const sq = d * d;
      C[i * K + j] = sq;
      cs += sq;
    }
    colMean[j] = cs / n;
  }
  for (let i = 0; i < n; i++) {
    let rs = 0;
    for (let j = 0; j < K; j++) rs += C[i * K + j];
    rowMean[i] = rs / K;
    grand += rs;
  }
  grand /= (n * K);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < K; j++) {
      C[i * K + j] = -0.5 * (C[i * K + j] - rowMean[i] - colMean[j] + grand);
    }
  }

  /* Top two right singular vectors of C by power iteration on C^T C, computed
     WITHOUT forming C^T C — that product costs n*K^2, half a billion multiplies
     at n = K = 803, for a starting guess. v <- C^T (C v) costs 2nK.

     The start vector is fixed rather than random, for determinism. A constant
     vector would be a poor choice — it is close to the direction the double
     centring just removed — so a deterministic ramp is used instead. */
  const v = new Float64Array(K);
  const w = new Float64Array(K);
  const tmp = new Float64Array(n);
  const vecs = [];

  for (let comp = 0; comp < 2; comp++) {
    for (let j = 0; j < K; j++) v[j] = Math.sin((j + 1) * (comp + 1) * 0.7391) + 0.1;
    for (let it = 0; it < 60; it++) {
      /* Deflate against the component already extracted, so the second pass
         finds the second direction instead of re-finding the first. */
      for (let p = 0; p < vecs.length; p++) {
        const u = vecs[p];
        let dot = 0;
        for (let j = 0; j < K; j++) dot += v[j] * u[j];
        for (let j = 0; j < K; j++) v[j] -= dot * u[j];
      }
      tmp.fill(0);
      for (let i = 0; i < n; i++) {
        let s = 0;
        const base = i * K;
        for (let j = 0; j < K; j++) s += C[base + j] * v[j];
        tmp[i] = s;
      }
      w.fill(0);
      for (let i = 0; i < n; i++) {
        const s = tmp[i];
        if (s === 0) continue;
        const base = i * K;
        for (let j = 0; j < K; j++) w[j] += C[base + j] * s;
      }
      let norm = 0;
      for (let j = 0; j < K; j++) norm += w[j] * w[j];
      norm = Math.sqrt(norm);
      if (norm < 1e-300) break;
      for (let j = 0; j < K; j++) v[j] = w[j] / norm;
    }
    const keep = new Float64Array(K);
    keep.set(v);
    vecs.push(keep);
  }

  for (let i = 0; i < n; i++) {
    const base = i * K;
    let sx = 0, sy = 0;
    for (let j = 0; j < K; j++) {
      const c = C[base + j];
      sx += c * vecs[0][j];
      sy += c * vecs[1][j];
    }
    x[i] = sx; y[i] = sy;
  }
}

/* ── Stress majorization proper ─────────────────────────────────────────────
 *
 * One Guttman transform per iteration:
 *
 *   p_i <- ( sum_j w_ij [ p_j + d_ij (p_i - p_j) / ||p_i - p_j|| ] ) / sum_j w_ij
 *
 * Read it as: every partner j proposes where i should be — "on your current
 * bearing from me, but at the distance we agreed" — and i moves to the weighted
 * average of those proposals. Because it is a majorization step the stress
 * cannot increase, so there is nothing to cool and nothing to clamp.
 *
 * The denominators are constant across iterations and computed once. */
function smacof(n, pi, pj, pd, pw, x, y, iterations, relaxStart) {
  const m = pd.length;
  const den = new Float64Array(n);
  for (let e = 0; e < m; e++) { den[pi[e]] += pw[e]; den[pj[e]] += pw[e]; }
  /* A film in no pair at all — possible only in a degenerate filtered corpus —
     must not divide by zero. It simply never moves. */
  for (let i = 0; i < n; i++) if (den[i] === 0) den[i] = 1;

  const numX = new Float64Array(n), numY = new Float64Array(n);
  let relax = relaxStart;
  let prevStress = Infinity;

  for (let it = 0; it < iterations; it++) {
    numX.fill(0); numY.fill(0);
    let stress = 0;

    for (let e = 0; e < m; e++) {
      const i = pi[e], j = pj[e];
      const dx = x[i] - x[j], dy = y[i] - y[j];
      const r = Math.sqrt(dx * dx + dy * dy);
      const d = pd[e], w = pw[e];
      const diff = r - d;
      stress += w * diff * diff;
      if (r < 1e-12) {
        /* Coincident points have no bearing to hold. The textbook convention is
           to drop the directional term, which leaves the pair pulling toward
           each other's position and lets the rest of the graph separate them on
           the next step. */
        numX[i] += w * x[j]; numY[i] += w * y[j];
        numX[j] += w * x[i]; numY[j] += w * y[i];
        continue;
      }
      const k = w * d / r;
      numX[i] += w * x[j] + k * dx; numY[i] += w * y[j] + k * dy;
      numX[j] += w * x[i] - k * dx; numY[j] += w * y[i] - k * dy;
    }

    /* The overrelaxation guard. Stress rising means the overshoot has stopped
       helping; fall back to the provably monotone step and stay there. */
    if (stress > prevStress) relax = 1.0;
    prevStress = stress;

    if (relax === 1.0) {
      for (let i = 0; i < n; i++) { x[i] = numX[i] / den[i]; y[i] = numY[i] / den[i]; }
    } else {
      for (let i = 0; i < n; i++) {
        x[i] += relax * (numX[i] / den[i] - x[i]);
        y[i] += relax * (numY[i] / den[i] - y[i]);
      }
    }
  }
}

/* Seeded micro-jitter. Two films at exactly the same coordinate divide by zero
   in the Guttman transform and make the separation pass degenerate. The
   displacement is ~1e-9 of the layout scale — five orders of magnitude below
   the fourth decimal the output is rounded to — so it changes nothing visible
   and everything numerical. */
function dejitter(n, x, y, rnd) {
  let scale = 0;
  for (let i = 0; i < n; i++) scale += Math.abs(x[i]) + Math.abs(y[i]);
  scale = (scale / Math.max(1, n)) || 1;
  for (let i = 0; i < n; i++) {
    x[i] += (rnd() - 0.5) * scale * 1e-9;
    y[i] += (rnd() - 0.5) * scale * 1e-9;
  }
}

/* ── Separation: the one place truth is traded for legibility ───────────────
 *
 * Stress majorization is free to draw two films on top of each other whenever
 * that is the least-stress compromise, and on a graph this dense it sometimes
 * is — measured, 11% of films without this pass. On screen that is not "a very
 * strong bond", it is one poster occluding another and one film becoming
 * unclickable.
 *
 * So: passes that push apart only the pairs closer than minSep, by exactly the
 * shortfall and no more, symmetric so neither film is privileged. Uniform grid
 * bucketed at the threshold, so the 3x3 block around a film provably contains
 * every candidate within it — exact, not approximate, and it avoids the O(n^2)
 * scan that would otherwise reappear at 2,000 films.
 *
 * Runs on the NORMALISED coordinates, after the aspect-preserving fit, because
 * the threshold is a screen fact ("two cells overlap") rather than a graph
 * fact. Deliberately the last word, and deliberately small. */
function separate(n, x, y, minSep, passes) {
  const cell = minSep;
  const buckets = new Map();
  const minSep2 = minSep * minSep;
  const hash = (cx, cy) => (cx * 73856093) ^ (cy * 19349663);

  for (let pass = 0; pass < passes; pass++) {
    buckets.clear();
    for (let i = 0; i < n; i++) {
      const k = hash(Math.floor(x[i] / cell), Math.floor(y[i] / cell));
      let b = buckets.get(k);
      if (!b) { b = []; buckets.set(k, b); }
      b.push(i);
    }
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i] / cell), cy = Math.floor(y[i] / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const b = buckets.get(hash(cx + dx, cy + dy));
          if (!b) continue;
          for (let q = 0; q < b.length; q++) {
            const j = b[q];
            /* i < j only: every pair is visited once and fixed symmetrically
               inside that single visit. */
            if (j <= i) continue;
            const ex = x[i] - x[j], ey = y[i] - y[j];
            const r2 = ex * ex + ey * ey;
            if (r2 >= minSep2 || r2 === 0) continue;
            const r = Math.sqrt(r2);
            const push = (minSep - r) * 0.5;
            const ux = ex / r, uy = ey / r;
            x[i] += ux * push; y[i] += uy * push;
            x[j] -= ux * push; y[j] -= uy * push;
            moved++;
          }
        }
      }
    }
    if (moved === 0) break;
  }
}

/* ── Entry point ────────────────────────────────────────────────────────────
 *
 * layout(films, edges, opts) -> { filmKey: [x, y] }, both coordinates in [0,1].
 *
 * `films` is the corpus films object, `edges` the corpus edges array. `opts`
 * exists so the tuning harness can sweep a constant without editing the file;
 * every key falls back to the constant above, and no shipped caller passes any.
 */
function layout(films, edges, opts) {
  const o = opts || {};
  const LEN_FAR = o.lengthFar != null ? o.lengthFar : LENGTH_FAR;
  const LEN_NEAR = o.lengthNear != null ? o.lengthNear : LENGTH_NEAR;
  const GAMMA = o.gamma != null ? o.gamma : LENGTH_GAMMA;
  const EW = o.edgeWeight != null ? o.edgeWeight : EDGE_WEIGHT;
  const WPOW = o.weightPower != null ? o.weightPower : WEIGHT_POWER;
  const PATHPOW = o.pathPower != null ? o.pathPower : PATH_POWER;
  const ITER = o.iterations != null ? o.iterations : ITERATIONS;
  const RLX = o.relax != null ? o.relax : RELAX;
  const TPAIRS = o.targetPairs != null ? o.targetPairs : TARGET_PAIRS;
  const MINLM = o.minLandmarks != null ? o.minLandmarks : MIN_LANDMARKS;
  const MINSEP = o.minSeparation != null ? o.minSeparation : MIN_SEPARATION;
  const SEPPASS = o.separationPasses != null ? o.separationPasses : SEPARATION_PASSES;

  /* Sorted, so the layout is a function of the corpus's CONTENT and not of the
     order the JSON happens to list it in. */
  const keys = Object.keys(films).sort();
  const n = keys.length;
  const out = {};
  if (n === 0) return out;
  if (n === 1) { out[keys[0]] = [0.5, 0.5]; return out; }

  const idx = new Map();
  for (let i = 0; i < n; i++) idx.set(keys[i], i);

  /* ---- edges -> bond lengths ------------------------------------------- */

  const ea = [], eb = [], es = [];
  for (let q = 0; q < edges.length; q++) {
    const e = edges[q];
    const A = idx.get(e.a), B = idx.get(e.b);
    if (A === undefined || B === undefined || A === B) continue;
    let s = typeof e.strength === "number" ? e.strength : 0;
    if (!isFinite(s)) s = 0;
    s = s < 0 ? 0 : (s > 1 ? 1 : s);
    /* Canonical orientation, so a pair stays recognisable later regardless of
       which way round the corpus wrote it. */
    ea.push(A < B ? A : B);
    eb.push(A < B ? B : A);
    es.push(s);
  }
  const m = es.length;

  /* THE IMPLEMENTATION OF RULE 1.
   *
   * Rest length is a strictly decreasing function of `strength` and of nothing
   * else — not of type, not of confidence, and above all not of how many other
   * edges either endpoint has.
   *
   * The coordinate it decreases in is the strength's RANK within the corpus's
   * own distribution, not the raw number. Two reasons, one practical and one
   * about honesty:
   *
   *   - Practical: it self-calibrates. This corpus's strengths run 0.19–0.92
   *     and are lumpy — 263 distinct values, half of all edges packed between
   *     0.395 and 0.64 — and a later corpus will be lumpy somewhere else.
   *     Ranking spreads whatever distribution arrives evenly across the
   *     drawable range, so the map never silently loses its contrast because
   *     the association engine was retuned. Measured, it is worth about 0.01 of
   *     bondFit over the raw value; a blend of the two was tried and measured
   *     worse than either end.
   *
   *   - Honesty: `strength` is a weighted rarity score capped per signal by the
   *     ceilings in associate.js, not a physical quantity. Its ORDER is
   *     meaningful; its ratios are an artefact of those ceilings. Drawing the
   *     order faithfully and declining to claim the ratios is the truthful
   *     reading of what the number is. The cost is stated plainly: two bonds
   *     twice as far apart on screen are NOT two bonds of half the strength,
   *     and nothing in the interface should imply they are.
   *
   * Ties get midranks, so the 263 distinct strength levels map to 263 distinct
   * lengths rather than 7,759 arbitrarily separated ones — two edges the corpus
   * calls equally strong must be drawn equally long.
   *
   * Confidence is deliberately NOT folded in. AGENTS rule 3 says a
   * low-confidence claim renders differently — dashed, labelled "reading, not
   * record" — and that is a rendering decision the map already makes. Encoding
   * it in distance as well would say the same thing twice, in the one channel
   * reserved for something else, and would put an authored reading and a
   * checkable record of equal strength at different distances for a reason
   * distance is not supposed to carry. */
  const elen = new Float64Array(m);
  if (m > 0) {
    const arr = new Array(m);
    for (let i = 0; i < m; i++) arr[i] = i;
    arr.sort((p, q) => (es[p] - es[q]) || (p - q));
    let i = 0;
    while (i < m) {
      let j = i;
      while (j + 1 < m && es[arr[j + 1]] === es[arr[i]]) j++;
      /* Midrank normalised to [0,1]; 1 is the strongest bond in the corpus. */
      const r = m > 1 ? ((i + j) / 2) / (m - 1) : 1;
      const L = LEN_FAR - (LEN_FAR - LEN_NEAR) * Math.pow(r, GAMMA);
      for (let k = i; k <= j; k++) elen[arr[k]] = L;
      i = j + 1;
    }
  }

  /* ---- CSR adjacency ---------------------------------------------------- */

  const adjStart = new Int32Array(n + 1);
  for (let q = 0; q < m; q++) { adjStart[ea[q] + 1]++; adjStart[eb[q] + 1]++; }
  for (let i = 0; i < n; i++) adjStart[i + 1] += adjStart[i];
  const adjNode = new Int32Array(2 * m);
  const adjLen = new Float64Array(2 * m);
  const fill = new Int32Array(n);
  for (let q = 0; q < m; q++) {
    const a = ea[q], b = eb[q], L = elen[q];
    let p = adjStart[a] + fill[a]++; adjNode[p] = b; adjLen[p] = L;
    p = adjStart[b] + fill[b]++; adjNode[p] = a; adjLen[p] = L;
  }

  /* ---- landmark count --------------------------------------------------- */

  /* K landmarks contribute K*n - K - K(K-1)/2 pairs. Take the largest K inside
     the budget, then clamp to [MIN_LANDMARKS, n]. */
  const pairsFor = (k) => k * n - k - (k * (k - 1)) / 2;
  let K = n;
  if (pairsFor(n) > TPAIRS) {
    let lo = 1, hi = n;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pairsFor(mid) <= TPAIRS) lo = mid; else hi = mid - 1;
    }
    K = lo;
  }
  if (K < MINLM) K = MINLM;
  if (o.landmarks != null) K = o.landmarks;
  if (K > n) K = n;

  const picked = chooseLandmarks(n, K, adjStart, adjNode, adjLen);
  const landmarks = picked.landmarks;
  const rows = picked.rows;

  const landmarkOf = new Int32Array(n).fill(-1);
  for (let li = 0; li < K; li++) landmarkOf[landmarks[li]] = li;

  /* A finite stand-in for "no path exists", needed by both the initial
     configuration and the pair set. One and a half times the widest real
     distance: far enough to read as unrelated, finite enough not to dominate
     the objective. Substituting 0 instead — the other obvious choice — would
     claim the two films are the SAME point, which is the opposite of the truth.
     The shipped corpus is one component and never reaches this; a `--films`
     filtered build can. */
  let maxFinite = 0;
  for (let li = 0; li < K; li++) {
    const row = rows[li];
    for (let i = 0; i < n; i++) if (isFinite(row[i]) && row[i] > maxFinite) maxFinite = row[i];
  }
  const UNREACHABLE = (maxFinite || LEN_FAR) * 1.5;
  for (let li = 0; li < K; li++) {
    const row = rows[li];
    for (let i = 0; i < n; i++) if (!isFinite(row[i])) row[i] = UNREACHABLE;
  }

  /* ---- pair set --------------------------------------------------------- */

  /* Every (landmark, film) pair, plus every edge. An edge whose pair is already
     present as a landmark pair is NOT duplicated: its target and weight
     override the shortest-path ones in place. A duplicate would leave the
     shortcut holding half a vote, which is precisely what the override exists
     to prevent. */
  const edgeKey = new Map();
  for (let q = 0; q < m; q++) edgeKey.set(ea[q] * n + eb[q], q);
  const consumed = new Uint8Array(m);

  const capacity = K * n + m;
  const pi = new Int32Array(capacity);
  const pj = new Int32Array(capacity);
  const pd = new Float64Array(capacity);
  const pw = new Float64Array(capacity);
  let np = 0;

  const wOf = (d) => Math.pow(d, -WPOW);

  for (let li = 0; li < K; li++) {
    const L = landmarks[li];
    const row = rows[li];
    for (let v = 0; v < n; v++) {
      if (v === L) continue;
      /* Skip landmark-landmark pairs already emitted from the other side. */
      const lv = landmarkOf[v];
      if (lv !== -1 && lv < li) continue;
      const a = L < v ? L : v, b = L < v ? v : L;
      const eq = edgeKey.get(a * n + b);
      if (eq !== undefined) {
        consumed[eq] = 1;
        pi[np] = a; pj[np] = b; pd[np] = elen[eq]; pw[np] = wOf(elen[eq]) * EW; np++;
      } else {
        const d = PATHPOW === 1 ? row[v] : Math.pow(row[v], PATHPOW);
        pi[np] = a; pj[np] = b; pd[np] = d; pw[np] = wOf(d); np++;
      }
    }
  }
  for (let q = 0; q < m; q++) {
    if (consumed[q]) continue;
    pi[np] = ea[q]; pj[np] = eb[q]; pd[np] = elen[q]; pw[np] = wOf(elen[q]) * EW; np++;
  }

  const PI = pi.subarray(0, np), PJ = pj.subarray(0, np);
  const PD = pd.subarray(0, np), PW = pw.subarray(0, np);

  /* ---- solve ------------------------------------------------------------ */

  const x = new Float64Array(n), y = new Float64Array(n);
  pivotMds(n, K, rows, x, y);

  /* PivotMDS returns the configuration in the singular values' own units, which
     can be orders of magnitude off the target distances. SMACOF would recover
     eventually, but starting at the right scale saves iterations otherwise
     spent purely inflating or deflating the whole map. */
  let curSum = 0, tgtSum = 0;
  const stepP = Math.max(1, Math.floor(np / 4096));
  for (let e = 0; e < np; e += stepP) {
    const dx = x[PI[e]] - x[PJ[e]], dy = y[PI[e]] - y[PJ[e]];
    curSum += Math.sqrt(dx * dx + dy * dy);
    tgtSum += PD[e];
  }
  if (curSum > 1e-12) {
    const s = tgtSum / curSum;
    for (let i = 0; i < n; i++) { x[i] *= s; y[i] *= s; }
  } else {
    /* Degenerate start — every film on one point, reachable only if the pivot
       matrix has no rank at all. Seed a deterministic phyllotactic spiral so the
       first Guttman step has bearings to work with. */
    for (let i = 0; i < n; i++) {
      const t = i * 2.39996;
      const r = Math.sqrt(i + 1);
      x[i] = Math.cos(t) * r; y[i] = Math.sin(t) * r;
    }
  }

  smacof(n, PI, PJ, PD, PW, x, y, ITER, RLX);
  dejitter(n, x, y, mulberry32(0x5C1F));

  /* ---- normalise, preserving aspect ------------------------------------- */

  /* Both axes are divided by the SAME span. Fitting each axis to [0,1]
     independently would stretch the map to fill the square and, in doing so,
     scale x-distances and y-distances differently — corrupting exactly the
     distances rule 1 makes meaningful, in a way no measurement on the final
     coordinates could undo. The shorter axis is centred instead. */
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

  if (MINSEP > 0 && SEPPASS > 0) separate(n, x, y, MINSEP, SEPPASS);

  /* The separation pass can push a film a hair outside the box. Re-fit with the
     same single span rather than clamping: clamping would stack films along the
     border, which is the collision the pass just removed. */
  minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] < minX) minX = x[i]; if (x[i] > maxX) maxX = x[i];
    if (y[i] < minY) minY = y[i]; if (y[i] > maxY) maxY = y[i];
  }
  const span2 = Math.max(maxX - minX, maxY - minY) || 1;
  const off2X = (span2 - (maxX - minX)) / 2, off2Y = (span2 - (maxY - minY)) / 2;

  for (let i = 0; i < n; i++) {
    let px = (x[i] - minX + off2X) / span2;
    let py = (y[i] - minY + off2Y) / span2;
    px = px < 0 ? 0 : (px > 1 ? 1 : px);
    py = py < 0 ? 0 : (py > 1 ? 1 : py);
    /* Four decimals: a quarter of a pixel on a 4K canvas, and it keeps the baked
       coordinate table small in the shipped HTML. */
    out[keys[i]] = [Math.round(px * 10000) / 10000, Math.round(py * 10000) / 10000];
  }
  return out;
}

module.exports = { layout };
