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
 * tune a rest length, a charge, a decay, and hope the settled geometry says
 * what you meant. AGENTS rule 1 states the requirement as a measurable
 * property — *rendered distance encodes formal bond strength* — and stress
 * majorization optimises exactly that property, by name:
 *
 *     minimise  sum_ij  w_ij ( ||p_i - p_j|| - d_ij )^2
 *
 * d_ij is where we say film i and film j ought to sit relative to each other;
 * the algorithm's whole job is making the drawn distance agree. Nothing has to
 * be inferred from a settled equilibrium, because the objective *is* the rule.
 *
 * The Guttman transform (`smacof()` below) drives that objective down
 * monotonically — each iteration provably does not increase stress — so there
 * is no temperature, no velocity cap, no cooling schedule, and no possibility
 * of the layout "exploding" on a corpus shaped differently from this one.
 *
 * ── HOW RULE 1 IS OBEYED, LITERALLY ──────────────────────────────────────────
 *
 * The target distance of an edge comes from `edgeLength()`, a strictly
 * decreasing function of that edge's `strength` and of nothing else. A strong
 * bond is a SHORT hop. Distances between films that are *not* joined by an
 * edge are shortest paths through that same bond-weighted graph, so an
 * indirect relation reads as a longer walk — which is the honest statement.
 *
 * Node degree appears in no distance, no weight and no force term. Grep this
 * file for "degree": the only hits are in comments. Landmarks are chosen by
 * farthest-point sampling on graph distance, never by connectivity, precisely
 * so that a well-connected film gets no privileged seat in the basis.
 *
 * The caveat the sibling layouts also carry, stated rather than hidden: in ANY
 * distance-faithful embedding a film with many bonds lands nearer the middle,
 * because its many short target distances can only be jointly satisfied from
 * the centre of its neighbours. That is emergent from the corpus's topology,
 * not applied as a weight — and the topology is formal bonds, which is the
 * thing rule 1 wants drawn. The view must still not reinforce it: node size
 * stays CONSTANT and the caption never ranks. `degreeBias` in the layout
 * harness exists to keep that emergent effect visible and judged.
 *
 * ── WHY THE DIRECT-EDGE TARGET OVERRIDES THE SHORTEST PATH ───────────────────
 *
 * This corpus is dense: 803 films, 7,759 edges, average degree ~9.7. In a
 * graph that dense, a WEAK edge between A and B almost always has a shorter
 * two-hop detour A→C→B through stronger bonds. If the target for the pair
 * (A,B) were the plain shortest path, that detour would silently overwrite the
 * weak bond's own length, and the map would draw a weak bond short — the exact
 * failure rule 1 forbids, arrived at by an innocent-looking shortcut.
 *
 * So for a pair that IS an edge, the target distance is `edgeLength(strength)`
 * verbatim, not the shortest path, and it carries extra weight
 * (`EDGE_WEIGHT`). Shortest paths supply the target for pairs that are not
 * edges, where they are the only sensible answer.
 *
 * That deliberately makes the target matrix non-metric: d_AB can exceed
 * d_AC + d_CB. This is fine and intentional. Stress majorization never assumes
 * the targets are a metric — it minimises disagreement with whatever targets
 * it is given — so an inconsistency resolves as a weighted compromise instead
 * of an error. Classical MDS *would* assume it, which is why classical MDS is
 * used here only for the starting configuration, never for the final answer.
 *
 * ── WHY LANDMARKS ────────────────────────────────────────────────────────────
 *
 * All-pairs stress is O(n^2) terms per iteration. At 803 films that is 322k
 * terms and costs about a second; at the 2,000+ films this corpus is heading
 * for it is 2M terms and costs ten. So the pair set is capped: every film is
 * tied to K landmark films (Brandes & Pich's landmark/pivot stress) plus to
 * every film it actually shares an edge with. K is chosen so the pair count
 * lands near TARGET_PAIRS whatever n is, which makes the cost per iteration
 * roughly FLAT as the corpus grows instead of quadratic.
 *
 * At n = 803 that formula selects K = n, i.e. the exact all-pairs problem —
 * the landmark machinery is headroom, and today's corpus does not pay for it.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────────
 *
 * Required by AGENTS rule 7's reasoning: a baked corpus exists so the graph
 * does not re-roll per request, and a layout that settled differently each
 * build would give that away again. Every source of arbitrariness here is
 * pinned:
 *
 *   - film order is `Object.keys(films).sort()`, so it does not depend on the
 *     JSON's key insertion order;
 *   - the priority queue breaks ties on node index, so equal-cost paths
 *     resolve the same way twice;
 *   - the power iteration that seeds the layout starts from a fixed
 *     deterministic vector, not a random one;
 *   - the only jitter is `mulberry32`-seeded and exists solely to keep two
 *     coincident points from dividing by zero.
 *
 * There is no `Math.random()` in this file.
 */
"use strict";

/* ── Tuned constants ────────────────────────────────────────────────────────
 *
 * Every one of these was chosen by running the layout harness over the whole
 * corpus and keeping what moved bondFit without wrecking occupancy. Where a
 * value is a compromise between two metrics that is said so, because the next
 * person to touch it needs to know which direction it was already pushed.
 */

/* Rest length of the strongest possible bond. Pure units: the whole layout is
   rescaled to [0,1] at the end, so only the RATIO to LENGTH_FAR matters. */
const LENGTH_NEAR = 1;

/* Rest length of the weakest bond, i.e. the dynamic range of "bond strength"
   as drawn. This is the single most consequential number in the file.
   Too small and the strength ordering is swamped by the residual stress every
   dense graph leaves behind — bondFit collapses toward zero. Too large and the
   weak edges, which are the numerous ones, stretch the map into a sparse haze
   and drag occupancy down while the strong bonds all pile into knots. */
const LENGTH_FAR = 5.2;

/* Strength is mapped to length through a blend of its corpus RANK (uniformly
   spread by construction) and its raw VALUE. Pure rank maximises the spacing
   between adjacent strength levels, which is what a Spearman correlation
   rewards; pure value keeps the drawn map faithful to how much stronger a 0.9
   bond actually is than a 0.6 one. The blend keeps most of the first without
   fully abandoning the second. 1.0 = rank only, 0.0 = value only. */
const RANK_MIX = 0.85;

/* Curvature of the strength → length map. Above 1 pushes the mid-strength
   mass toward the short end, which tightens the visible clustering; at 1.0 the
   map is linear in the blended coordinate. Left at 1.0: bending it measurably
   cost bondFit, because it compresses the very rank gaps the metric reads. */
const LENGTH_GAMMA = 1.0;

/* Weight multiplier on pairs that are actually edges. Rule 1 is a statement
   about EDGES, so the terms that encode it are worth more than the
   shortest-path scaffolding that merely keeps the map globally coherent. Above
   ~6 the scaffolding stops holding and the map folds over itself; below ~2 the
   shortest paths win and weak bonds get drawn short. */
const EDGE_WEIGHT = 4.0;

/* w_ij = 1 / d_ij^WEIGHT_POWER. The classical Sammon/Kruskal choice is 2,
   which makes the objective scale-free: every pair contributes its RELATIVE
   error, so a near pair drawn at twice its target is penalised as hard as a
   far pair drawn at twice its target. Anything less lets the long, weak,
   numerous pairs dominate and the short strong bonds go unenforced. */
const WEIGHT_POWER = 2;

/* Pair-count budget per SMACOF iteration. Sets K via `chooseLandmarks`, and so
   sets the cost curve: with this fixed, cost per iteration is ~flat in n once
   n exceeds ~600 instead of growing as n^2. */
const TARGET_PAIRS = 360000;

/* Never fewer landmarks than this, whatever the budget says — below ~100 the
   landmark distance signature stops separating films that share no edge, and
   they start piling up on each other. */
const MIN_LANDMARKS = 128;

/* Majorization steps. SMACOF's stress decrease is monotone but decelerating;
   past this the geometry moves less than the fourth decimal place the output
   is rounded to. */
const ITERATIONS = 300;

/* Overrelaxation on the Guttman step: p <- p + RELAX * (guttman(p) - p).
   RELAX = 1 is textbook SMACOF and provably monotone. Slight overshoot
   converges faster and, measured on this corpus, lands lower — but it forfeits
   the monotonicity proof, so the stress is checked and the step reverts to 1.0
   for the remaining iterations if it ever rises. See `smacof`. */
const RELAX = 1.35;

/* Non-metric refinement: how many retarget-then-resolve rounds, how many
   majorization steps inside each, and how far each round moves the targets
   toward the rank-matched ones. See `retarget`. */
const PATH_POWER = 1;
const RANK_ROUNDS = 12;
const RANK_ITERATIONS = 40;
const RANK_ETA = 0.5;

/* Post-pass that separates films drawn closer together than this fraction of
   the layout's own diagonal. Two film cells at the same coordinate are not a
   truthful drawing of a short bond, they are one film hiding another. Kept
   deliberately small: every micro-metre of this is a lie about distance, paid
   to keep the map readable. */
const MIN_SEPARATION = 0.006;
const SEPARATION_PASSES = 40;

/* Seeded, because "deterministic" has to survive someone adding a film. Used
   for one thing only: a jitter of ~1e-9 of the layout scale so that two films
   whose landmark signatures are identical do not sit at exactly the same point
   and produce a 0/0 in the Guttman transform. */
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
 * The tie-break on node id is not cosmetic: a graph this dense has many
 * equal-cost paths, and without a total order on the queue the shortest-path
 * tree — and therefore the layout — could differ between two runs on a
 * different heap fill order. */
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
  /* The queue is lazy-deletion Dijkstra: a node can be pushed once per
     improvement, so the capacity has to be the number of relaxations, not the
     number of nodes. Grow rather than assume. */
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

/* ── Strength → rest length ─────────────────────────────────────────────────
 *
 * The one place rule 1 is implemented. Strictly decreasing in `strength` and a
 * function of nothing else: not of type, not of confidence, and above all not
 * of how many other edges either endpoint has.
 *
 * `rank` is the edge's quantile within the corpus's own strength distribution,
 * so the mapping self-calibrates: this corpus's strengths run 0.19–0.92 and a
 * later one may run anywhere, and either way the full drawable range gets
 * used. `value` is the same strength rescaled linearly across the observed
 * range. See RANK_MIX for why both are kept.
 *
 * Confidence is deliberately NOT folded in. AGENTS rule 3 says a low-confidence
 * claim renders differently — dashed, labelled "reading, not record" — and
 * that is a rendering decision the map already makes. Shortening or lengthening
 * a reading's edge on top of that would encode the same fact twice, in a
 * channel reserved for something else, and would make an authored reading and
 * a checkable record with equal strength sit at different distances for a
 * reason distance is not supposed to carry. */
function edgeLength(rank, value) {
  const t = RANK_MIX * rank + (1 - RANK_MIX) * value;   /* 1 = strongest */
  const shortness = Math.pow(t, LENGTH_GAMMA);
  return LENGTH_FAR - (LENGTH_FAR - LENGTH_NEAR) * shortness;
}

/* ── Landmark choice: farthest-point sampling ───────────────────────────────
 *
 * Maximally spread pivots, which is what makes a landmark distance signature
 * discriminative — K landmarks all sitting in the same region would give every
 * distant film nearly the same signature and let unrelated films collapse
 * together.
 *
 * Chosen on graph distance only. It would be easy and wrong to seed this with
 * the best-connected film: that is degree, and rule 1 keeps degree out of the
 * geometry. The first landmark is instead film 0 in sorted key order — an
 * arbitrary but reproducible choice, and farthest-point sampling is famously
 * insensitive to where it starts.
 *
 * Returns the landmark indices and their distance rows, which the caller needs
 * anyway; running Dijkstra twice for the same source would double the only
 * superlinear step in the file. */
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

    /* Dijkstra from `src` over bond lengths. */
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

    /* Next landmark = the film currently farthest from every landmark placed
       so far. Unreachable films (Infinity) win automatically, which is what
       puts a landmark inside every component of a disconnected subgraph — the
       shipped corpus is one component, but a filtered build need not be. */
    let far = -1, farD = -1;
    for (let i = 0; i < n; i++) {
      const d = dist[i];
      if (d < best[i]) best[i] = d;
      const b = best[i];
      const cmp = (b === Infinity) ? Number.MAX_VALUE : b;
      /* Strict > keeps the lowest index on a tie, so the sequence of
         landmarks is a function of the corpus alone. */
      if (cmp > farD) { farD = cmp; far = i; }
    }
    src = far < 0 ? (li + 1) % n : far;
  }
  return { landmarks: landmarks, rows: rows };
}

/* ── PivotMDS: the starting configuration ───────────────────────────────────
 *
 * SMACOF descends to a LOCAL minimum, so where it starts decides which one. A
 * seeded-random start on a graph this size reliably lands in a folded
 * configuration — two regions of the corpus laid over each other, which no
 * amount of further majorization undoes, because unfolding requires passing
 * back UP through higher stress.
 *
 * PivotMDS (Brandes & Pich, 2007) is classical MDS restricted to the n x K
 * distance matrix: double-centre the squared distances, then take the top two
 * singular directions. It costs two matrix passes and produces a globally
 * sane, unfolded configuration for SMACOF to sharpen.
 *
 * Classical MDS is used HERE and only here, for the reason given at the top of
 * the file: it assumes the target distances are a metric, and the direct-edge
 * override makes ours deliberately not one. As a starting guess that
 * assumption is harmless; as the final answer it would quietly re-impose the
 * shortcut that the override exists to prevent. */
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
      /* An unreachable pair has no finite target. Substituting 0 would claim
         the two films are the same point; the finite max keeps them merely
         very far apart, which is the truthful reading of "no path". */
      const d = isFinite(row[i]) ? row[i] : 0;
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
     WITHOUT forming C^T C — that product costs n*K^2, which at n = K = 803 is
     half a billion multiplies for a starting guess. v <- C^T (C v) is 2nK.

     The start vector is fixed, not random: determinism, and a constant vector
     would be orthogonal to nothing useful, so a simple deterministic ramp is
     used instead. */
  const v = new Float64Array(K);
  const w = new Float64Array(K);
  const tmp = new Float64Array(n);
  const vecs = [];

  for (let comp = 0; comp < 2; comp++) {
    for (let j = 0; j < K; j++) v[j] = Math.sin((j + 1) * (comp + 1) * 0.7391) + 0.1;
    for (let it = 0; it < 60; it++) {
      /* Deflate against the component already extracted, so the second pass
         finds the second direction rather than re-finding the first. */
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
 * Read it as: every partner j proposes where i should be — "at your current
 * bearing from me, but at the distance we agreed on" — and i moves to the
 * weighted average of those proposals. Because it is a majorization step, the
 * stress cannot increase; there is nothing to cool and nothing to clamp.
 *
 * The denominators are constant across iterations and computed once.
 *
 * RELAX > 1 overshoots the step. That is a heuristic, not part of the proof,
 * so stress is evaluated each iteration and the relaxation is dropped back to
 * the provably-monotone 1.0 permanently the first time stress goes up. */
function smacof(n, pi, pj, pd, pw, x, y, iterations) {
  const m = pd.length;
  const den = new Float64Array(n);
  for (let e = 0; e < m; e++) { den[pi[e]] += pw[e]; den[pj[e]] += pw[e]; }
  /* A film in no pair at all (possible only in a degenerate filtered corpus)
     must not divide by zero; it simply never moves. */
  for (let i = 0; i < n; i++) if (den[i] === 0) den[i] = 1;

  const numX = new Float64Array(n), numY = new Float64Array(n);
  let relax = RELAX;
  let prevStress = Infinity;

  for (let it = 0; it < iterations; it++) {
    numX.fill(0); numY.fill(0);
    let stress = 0;

    for (let e = 0; e < m; e++) {
      const i = pi[e], j = pj[e];
      const dx = x[i] - x[j], dy = y[i] - y[j];
      let r = Math.sqrt(dx * dx + dy * dy);
      const d = pd[e], w = pw[e];
      const diff = r - d;
      stress += w * diff * diff;
      if (r < 1e-12) {
        /* Coincident points have no bearing to hold. The textbook convention
           is to drop the directional term, which leaves the pair pulling to
           each other's position and lets the rest of the graph separate them
           on the next step. */
        numX[i] += w * x[j]; numY[i] += w * y[j];
        numX[j] += w * x[i]; numY[j] += w * y[i];
        continue;
      }
      const k = w * d / r;
      numX[i] += w * x[j] + k * dx; numY[i] += w * y[j] + k * dy;
      numX[j] += w * x[i] - k * dx; numY[j] += w * y[i] - k * dy;
    }

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

/* Seeded micro-jitter. Two films at literally the same coordinate divide by
   zero in the Guttman transform and make the separation pass degenerate. The
   displacement is ~1e-9 of the layout scale, five orders of magnitude below
   the fourth decimal the output is rounded to, so it changes nothing visible
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

/* ── Rank matching: the non-metric refinement ───────────────────────────────
 *
 * Metric SMACOF asks for the drawn distance to EQUAL the target. Rule 1 asks
 * for something weaker and more useful: that drawn distance be ORDERED by bond
 * strength. Those come apart on a graph this dense. 803 films with average
 * degree ~9.7 cannot be embedded in a plane with every target met — a film
 * with ten bonds of ten different lengths has more constraints than a point in
 * R^2 has freedom — so metric stress settles into a compromise where the
 * residual error is large enough to shuffle neighbouring strength levels past
 * each other. The ORDER is what the reader perceives and what the harness's
 * bondFit measures, and it is being spent to buy exact lengths nobody can read
 * off the screen.
 *
 * So after the metric solve, the edge targets are replaced by DISPARITIES, in
 * the sense of Kruskal's non-metric MDS: numbers that respect the required
 * ordering while otherwise staying as close as possible to what the layout has
 * actually managed to draw. This implementation uses the strongest available
 * form of that — full quantile matching:
 *
 *   1. take the distances the layout currently draws for the m edges;
 *   2. sort those m values ascending; they are the distance "slots" this
 *      geometry has demonstrably proved it can produce, all together;
 *   3. hand the shortest slot to the strongest bond, the next to the next, and
 *      so on down to the weakest bond and the longest slot;
 *   4. move each edge's target a fraction RANK_ETA of the way toward its slot
 *      and re-solve.
 *
 * Step 2 is what keeps this honest. The new targets are a PERMUTATION of the
 * distances already on the page, so the refinement cannot inflate the map,
 * cannot collapse it, and cannot ask for a configuration whose distance
 * distribution is unreachable. It only ever asks: given the spread of lengths
 * you can draw, are they going to the right bonds?
 *
 * Ties are handled by ordering equal-strength edges among themselves by their
 * CURRENT drawn distance. Two edges the corpus calls equally strong carry no
 * instruction about which should be shorter, so no reordering is demanded of
 * them, and none of the layout's effort is wasted on an arbitrary swap.
 *
 * The blend factor exists because a full jump would chase the layout's own
 * noise and oscillate. A partial step is a damped fixed-point iteration and
 * settles.
 */
function retarget(m, es, edgePairAt, pi, pj, x, y, curTarget, pd, pw, eta, edgeW, wpow) {
  const ach = new Float64Array(m);
  for (let q = 0; q < m; q++) {
    const p = edgePairAt[q];
    const dx = x[pi[p]] - x[pj[p]], dy = y[pi[p]] - y[pj[p]];
    ach[q] = Math.sqrt(dx * dx + dy * dy);
  }
  const slots = Float64Array.from(ach);
  slots.sort();

  /* Strongest bond first; equal strengths keep their current order, so a tie
     is never asked to resolve itself. The index tiebreak at the end keeps the
     sort total, and therefore the whole pass reproducible. */
  const order = new Array(m);
  for (let q = 0; q < m; q++) order[q] = q;
  order.sort((a, b) => (es[b] - es[a]) || (ach[a] - ach[b]) || (a - b));

  for (let k = 0; k < m; k++) {
    const q = order[k];
    const t = curTarget[q] + eta * (slots[k] - curTarget[q]);
    curTarget[q] = t;
    const p = edgePairAt[q];
    pd[p] = t;
    pw[p] = (wpow === 2 ? 1 / (t * t) : Math.pow(t, -wpow)) * edgeW;
  }
}

/* ── Separation: the one place truth is traded for legibility ───────────────
 *
 * Stress majorization is free to draw two films on top of each other whenever
 * that is the least-stress compromise, and on a dense graph it sometimes is.
 * On screen that is not "a very strong bond", it is one poster occluding
 * another and one of the two films becoming unclickable.
 *
 * So: a few passes that push apart only the pairs closer than MIN_SEPARATION,
 * by exactly the shortfall and no more, symmetric so no film is privileged.
 * Uniform grid bucketed at the threshold, so the 3x3 block around a film
 * provably contains every candidate within it — this is exact, and it avoids
 * the O(n^2) scan that would reappear at 2,000 films.
 *
 * This runs on the NORMALISED coordinates, after the aspect-preserving fit,
 * because the threshold is a screen fact ("two cells overlap") and not a
 * graph fact. It is deliberately the last word and deliberately tiny. */
function separate(n, x, y, minSep, passes) {
  const cell = minSep;
  const buckets = new Map();
  const minSep2 = minSep * minSep;

  for (let pass = 0; pass < passes; pass++) {
    buckets.clear();
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i] / cell), cy = Math.floor(y[i] / cell);
      const k = cx * 73856093 ^ cy * 19349663;
      let b = buckets.get(k);
      if (!b) { b = []; buckets.set(k, b); }
      b.push(i);
    }
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i] / cell), cy = Math.floor(y[i] / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const b = buckets.get((cx + dx) * 73856093 ^ (cy + dy) * 19349663);
          if (!b) continue;
          for (let q = 0; q < b.length; q++) {
            const j = b[q];
            /* i < j only: each pair is handled once, and the fix is applied
               symmetrically inside that single visit. */
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
 * `opts` exists for the tuning harness; the shipped defaults are the constants
 * above and no caller needs to pass anything.
 */
function layout(films, edges, opts) {
  const o = opts || {};
  const LEN_FAR = o.lengthFar != null ? o.lengthFar : LENGTH_FAR;
  const LEN_NEAR = o.lengthNear != null ? o.lengthNear : LENGTH_NEAR;
  const RMIX = o.rankMix != null ? o.rankMix : RANK_MIX;
  const GAMMA = o.gamma != null ? o.gamma : LENGTH_GAMMA;
  const EW = o.edgeWeight != null ? o.edgeWeight : EDGE_WEIGHT;
  const WPOW = o.weightPower != null ? o.weightPower : WEIGHT_POWER;
  const ITER = o.iterations != null ? o.iterations : ITERATIONS;
  const TPAIRS = o.targetPairs != null ? o.targetPairs : TARGET_PAIRS;
  const MINLM = o.minLandmarks != null ? o.minLandmarks : MIN_LANDMARKS;
  const PATHPOW = o.pathPower != null ? o.pathPower : PATH_POWER;
  const RROUNDS = o.rankRounds != null ? o.rankRounds : RANK_ROUNDS;
  const RITER = o.rankIterations != null ? o.rankIterations : RANK_ITERATIONS;
  const RETA = o.rankEta != null ? o.rankEta : RANK_ETA;
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
    /* Store with a canonical orientation so a pair is recognisable later
       regardless of which way round the corpus wrote it. */
    ea.push(A < B ? A : B);
    eb.push(A < B ? B : A);
    es.push(s);
  }
  const m = es.length;

  /* Corpus-relative rank and value. Ranks use midranks so that the 263
     distinct strength levels in a 7,759-edge corpus map to 263 distinct
     lengths rather than 7,759 arbitrarily separated ones — two edges the
     corpus calls equally strong must be drawn equally long. */
  const rank = new Float64Array(m);
  const value = new Float64Array(m);
  if (m > 0) {
    const order = new Int32Array(m);
    for (let i = 0; i < m; i++) order[i] = i;
    const arr = Array.from(order);
    arr.sort((p, q) => (es[p] - es[q]) || (p - q));
    let i = 0;
    while (i < m) {
      let j = i;
      while (j + 1 < m && es[arr[j + 1]] === es[arr[i]]) j++;
      const mid = (i + j) / 2;
      const r = m > 1 ? mid / (m - 1) : 1;
      for (let k = i; k <= j; k++) rank[arr[k]] = r;
      i = j + 1;
    }
    let sMin = Infinity, sMax = -Infinity;
    for (let q = 0; q < m; q++) { if (es[q] < sMin) sMin = es[q]; if (es[q] > sMax) sMax = es[q]; }
    const span = (sMax - sMin) || 1;
    for (let q = 0; q < m; q++) value[q] = (es[q] - sMin) / span;
  }

  const elen = new Float64Array(m);
  for (let q = 0; q < m; q++) {
    const t = RMIX * rank[q] + (1 - RMIX) * value[q];
    elen[q] = LEN_FAR - (LEN_FAR - LEN_NEAR) * Math.pow(t, GAMMA);
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

  /* Pairs contributed by K landmarks = K*n - K - K(K-1)/2. Solve for the
     largest K within budget, clamp to [MIN_LANDMARKS, n]. At n = 803 the
     budget admits K = n, so today's corpus gets the exact all-pairs problem
     and the landmark path is dormant headroom. */
  let K = n;
  const pairsFor = (k) => k * n - k - (k * (k - 1)) / 2;
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
     the objective. The shipped corpus is a single component and never uses
     this; a `--films` filtered build can. */
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

  /* Every (landmark, film) pair, plus every edge. An edge whose pair is
     already present as a landmark pair is not duplicated: its target and
     weight OVERRIDE the shortest-path ones in place, which is the whole point
     of the override — a duplicate would let the shortcut keep half a vote. */
  const edgeKey = new Map();
  for (let q = 0; q < m; q++) edgeKey.set(ea[q] * n + eb[q], q);
  const consumed = new Uint8Array(m);

  const capacity = K * n + m;
  const pi = new Int32Array(capacity);
  const pj = new Int32Array(capacity);
  const pd = new Float64Array(capacity);
  const pw = new Float64Array(capacity);
  /* Where each edge's term ended up in the pair arrays. The rank-matching pass
     rewrites those terms in place and needs to find them without searching. */
  const edgePairAt = new Int32Array(m).fill(-1);
  let np = 0;

  const wOf = (d) => (WPOW === 2 ? 1 / (d * d) : Math.pow(d, -WPOW));

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
        edgePairAt[eq] = np;
        pi[np] = a; pj[np] = b; pd[np] = elen[eq]; pw[np] = wOf(elen[eq]) * EW; np++;
      } else {
        const d = PATHPOW === 1 ? row[v] : Math.pow(row[v], PATHPOW);
        pi[np] = a; pj[np] = b; pd[np] = d; pw[np] = wOf(d); np++;
      }
    }
  }
  for (let q = 0; q < m; q++) {
    if (consumed[q]) continue;
    edgePairAt[q] = np;
    pi[np] = ea[q]; pj[np] = eb[q]; pd[np] = elen[q]; pw[np] = wOf(elen[q]) * EW; np++;
  }

  const PI = pi.subarray(0, np), PJ = pj.subarray(0, np);
  const PD = pd.subarray(0, np), PW = pw.subarray(0, np);

  /* ---- solve ------------------------------------------------------------ */

  const x = new Float64Array(n), y = new Float64Array(n);
  pivotMds(n, K, rows, x, y);

  /* PivotMDS returns the configuration in the singular values' own units,
     which can be orders of magnitude off the target distances. SMACOF would
     recover eventually, but starting at the right scale saves iterations that
     would otherwise be spent purely inflating or deflating the whole map. */
  let curSum = 0, tgtSum = 0;
  const probe = Math.min(np, 4096);
  const stepP = Math.max(1, Math.floor(np / probe));
  for (let e = 0; e < np; e += stepP) {
    const dx = x[PI[e]] - x[PJ[e]], dy = y[PI[e]] - y[PJ[e]];
    curSum += Math.sqrt(dx * dx + dy * dy);
    tgtSum += PD[e];
  }
  if (curSum > 1e-12) {
    const s = tgtSum / curSum;
    for (let i = 0; i < n; i++) { x[i] *= s; y[i] *= s; }
  } else {
    /* Degenerate start (every film at one point): seed a deterministic spiral
       so the first Guttman step has bearings to work with. */
    for (let i = 0; i < n; i++) {
      const t = i * 2.39996;
      const r = Math.sqrt(i + 1);
      x[i] = Math.cos(t) * r; y[i] = Math.sin(t) * r;
    }
  }

  const rnd = mulberry32(0x5C1F);
  smacof(n, PI, PJ, PD, PW, x, y, ITER);
  dejitter(n, x, y, rnd);

  /* Non-metric refinement. See `retarget` for why the exact-distance objective
     is the wrong one to spend the last of the budget on. */
  if (RROUNDS > 0 && m > 1) {
    const curTarget = Float64Array.from(elen);
    for (let r = 0; r < RROUNDS; r++) {
      retarget(m, es, edgePairAt, PI, PJ, x, y, curTarget, PD, PW, RETA, EW, WPOW);
      smacof(n, PI, PJ, PD, PW, x, y, RITER);
    }
    dejitter(n, x, y, rnd);
  }

  /* ---- normalise, preserving aspect ------------------------------------- */

  /* Both axes are divided by the SAME span. Fitting each axis to [0,1]
     independently would stretch the map to fill the square and, in doing so,
     scale x-distances and y-distances differently — which would corrupt
     exactly the distances rule 1 makes meaningful, in a way no metric on the
     final coordinates could recover. The shorter axis is centred instead. */
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

  /* The separation pass can push a film a hair outside the box. Re-fit with
     the same single span rather than clamping: clamping would stack films on
     the border, which is the collision the pass just removed. */
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
    /* Four decimals: enough to place a film to a quarter-pixel on a 4K canvas,
       and it keeps the baked coordinate table small in the shipped HTML. */
    out[keys[i]] = [Math.round(px * 10000) / 10000, Math.round(py * 10000) / 10000];
  }
  return out;
}

module.exports = { layout };
