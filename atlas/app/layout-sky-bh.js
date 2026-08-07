#!/usr/bin/env node
/* layout-sky-bh.js — constellation layout: Fruchterman-Reingold with GLOBAL
 * Barnes-Hut repulsion over an adaptive quadtree.
 *
 *   const { layout } = require("./layout-sky-bh.js");
 *   const pos = layout(films, edges);      // -> { key: [x, y] }, both in [0,1]
 *
 * WHY THIS RUNS AT BUILD TIME
 *
 * A force layout is O(n^2) in the naive form and the corpus is heading past
 * 2,000 films. Running it in the browser would mean a multi-second freeze on
 * first open of the view, on a phone, every time. Running it here costs a
 * second of build and ships two numbers per film. It also makes the sky
 * DETERMINISTIC, which AGENTS rule 7 requires of everything else: a layout that
 * settled differently on every load would mean the shape of cinema rearranged
 * itself while you looked away, and nobody could ever say "it's over on the
 * left" to anybody else.
 *
 * ── WHY GLOBAL REPULSION, WHICH IS THE WHOLE POINT OF THIS FILE ──────────────
 *
 * The predecessor (`layout-sky.js`) bins films into a lattice and repels each
 * film only against the 3x3 block of cells around it. That is fast and it is
 * wrong, and it is wrong in a way that is invisible in the code and obvious in
 * the output: LOCAL REPULSION CANNOT SEPARATE TWO CLUSTERS.
 *
 * Two dense traditions that begin interleaved will each relax internally --
 * neighbours stop sitting on top of each other -- but the two clumps as wholes
 * feel nothing from each other, because once they are more than one cell apart
 * every pair falls outside the 3x3 window and the force is exactly zero. There
 * is no term in the sum that says "you are a hundred films and they are a
 * hundred films and you should not be in the same place". So the map collapses:
 * everything lands in a hairball with a few springs' worth of outliers
 * stretching the bounding box, and the normalisation at the end makes that look
 * like a layout. Measured on the shipped 803-film corpus the predecessor puts
 * the whole corpus in ~1% of the canvas with 96% of films rendering on top of
 * a neighbour.
 *
 * A cluster-vs-cluster force is intrinsically long-range, so the fix has to be
 * long-range. Barnes-Hut gives that back at O(n log n) instead of O(n^2): build
 * a quadtree over the films, and when a whole subtree is far enough away
 * relative to its width -- the classic s/d < theta test -- replace it with its
 * centre of mass and its film COUNT. Distant clusters then push as clusters,
 * which is exactly the missing term, while nearby films are still resolved
 * exactly so posters do not stack.
 *
 * ── HOW THIS OBEYS AGENTS RULE 1 ─────────────────────────────────────────────
 *
 * Rule 1: edge distance encodes formal bond strength, never popularity or node
 * degree. Concretely, in this file:
 *
 *   - Every spring's REST LENGTH is a pure function of `edge.strength`. A
 *     strong bond wants to be short, a weak one wants to be long. That mapping
 *     is the entire content of the picture.
 *   - Every spring's STIFFNESS is a pure function of `edge.strength` too. This
 *     is the second half of rule 1 and it matters as much as the first: with
 *     ~19 edge-ends per film in 2D, most rest lengths are unsatisfiable at
 *     once, so what a reader actually sees is the outcome of a tug-of-war. If
 *     every spring pulled equally hard, which edge came out short would be
 *     decided by graph topology, i.e. by how many neighbours each end happens
 *     to have -- degree, through the back door. Making strong bonds stiff means
 *     the bonds the corpus is most confident about are the ones that win, and
 *     the weak ones are the ones that stretch.
 *   - The Barnes-Hut "mass" of a quadtree cell is the NUMBER OF FILMS inside
 *     it. Not the sum of their degrees, not any edge property. A film with one
 *     connection and a film with thirty push identically hard.
 *   - The temperature cap is one scalar shared by every film on every
 *     iteration, so it cannot smuggle degree back in either: a well-connected
 *     film is limited to exactly the same step as an isolated one.
 *
 * The honest caveat, worth stating rather than hiding: in ANY force layout a
 * film with many edges ends up nearer the middle, because it is pulled from
 * many directions at once. That is emergent from the topology -- and the
 * topology here is formal bonds -- not applied as a weight. The harness
 * measures it as `degreeBias` so it can be judged rather than assumed. The view
 * must not reinforce it: node size stays CONSTANT, never scaled by degree.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
 *
 * It does not read `confidence`, `type`, `claim` or `signal`. Those are the
 * renderer's business -- AGENTS rule 3 has low-confidence edges drawn dashed,
 * which is a stroke decision, not a geometry one. Position answers one question
 * only, and mixing a second axis into it would make the distance you read off
 * the screen mean two things at once.
 */
"use strict";

/* Seeded, because "deterministic" has to survive someone adding a film: the
   same corpus must give the same sky twice, and a bare Math.random() would
   quietly break that while still looking fine. Every stochastic decision in
   this file -- the initial jitter and the coincident-node nudge -- draws from
   here or from a pure hash of the node indices, never from the global RNG. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Defaults are the tuned working values, not placeholders: they were swept
   against `measure-layout.js` on the 803-film corpus. `opts` exists so the
   sweep can move one knob at a time without editing this file; the build calls
   layout(films, edges) with nothing and must get the tuned result. */
const DEFAULTS = {
  seed: 0x0a71a5,

  iterations: 600,     /* FR passes. See the cooling note below.               */
  theta: 0.80,         /* Barnes-Hut opening angle. 0 = exact O(n^2), 1 = mush */

  /* All lengths below are in units of k = 1/sqrt(n), the spacing n films would
     have if they were spread evenly over a unit square. Expressing them this
     way is what lets the same constants hold from 800 films to 2,000: the
     corpus grows, k shrinks, and the picture stays equally dense rather than
     equally sized. */
  restStrong: 0.55,    /* rest length at strength 1, in units of k             */
  restWeak: 3.20,      /* rest length at strength 0, in units of k             */
  restExp: 1.00,       /* shape of the strength -> length curve; 1 = linear    */
  stiffFloor: 0.10,    /* a strength-0 spring still pulls this much            */
  stiffExp: 1.30,      /* >1 makes stiffness rise steeply with strength        */

  attract: 0.90,       /* overall spring coefficient                            */
  repel: 1.00,         /* overall repulsion coefficient, in units of k^2        */
  gravity: 0.020,      /* uniform pull to the centroid — degree-free           */

  tempStart: 3.00,     /* initial per-iteration displacement cap, in k         */
  tempEnd: 0.020,      /* final cap, in k                                      */
  coolExp: 2.20,       /* cooling curve exponent; >1 spends longer cold        */

  initRadius: 0.56,    /* phyllotaxis disc radius; ~unit area for any n        */
  margin: 0.004,       /* inset from the [0,1] edges of the render square      */
  round: 5,            /* decimal places kept in the shipped coordinates       */
};

/* Depth cap on the quadtree. Doubles run out of mantissa long before this, but
   two films at bit-identical coordinates would subdivide forever without it, so
   below this depth a leaf is allowed to hold several films as a chain. That
   case is astronomically rare and the short-range softening handles the force;
   the cap exists so a pathological corpus cannot hang the build. */
const MAX_DEPTH = 26;

function layout(films, edges, opts) {
  const P = Object.assign({}, DEFAULTS, opts || {});

  const keys = Object.keys(films);
  const n = keys.length;
  if (n === 0) return {};
  if (n === 1) return { [keys[0]]: [0.5, 0.5] };

  const idx = new Map();
  for (let i = 0; i < n; i++) idx.set(keys[i], i);

  /* k is the ideal spacing: the distance between films if n of them were laid
     out evenly on a unit square. Everything metric in this file is a multiple
     of it, which is what makes the tuning scale-free. */
  const k = 1 / Math.sqrt(n);
  const k2 = k * k;

  const x = new Float64Array(n), y = new Float64Array(n);
  const dispX = new Float64Array(n), dispY = new Float64Array(n);

  /* Start on a phyllotaxis spiral rather than uniform noise. Random starts let
     two dense traditions land inside one another and stay there; global
     repulsion can pull them apart but it wastes half the schedule doing it. An
     even spiral gives every film room to be claimed by its own neighbourhood on
     the first few passes. The jitter breaks the exact symmetry that would
     otherwise leave collinear films with zero net force forever. */
  const rnd = mulberry32(P.seed);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = P.initRadius * Math.sqrt((i + 0.5) / n);
    const a = i * GOLDEN;
    x[i] = r * Math.cos(a) + (rnd() - 0.5) * k * 0.05;
    y[i] = r * Math.sin(a) + (rnd() - 0.5) * k * 0.05;
  }

  /* ---------------------------------------------------------------- edges -- */

  /* Flat typed arrays: one linear pass per iteration beats chasing 7,759 object
     pointers 600 times. Self-loops and edges naming a film that is not in the
     corpus are dropped here rather than guarded for in the hot loop. */
  const m = edges.length;
  const ea = new Int32Array(m), eb = new Int32Array(m);
  const rest = new Float64Array(m), stiff = new Float64Array(m);
  let live = 0;
  for (let e = 0; e < m; e++) {
    const A = idx.get(edges[e].a), B = idx.get(edges[e].b);
    if (A === undefined || B === undefined || A === B) continue;
    const s = Math.max(0, Math.min(1, edges[e].strength || 0));
    ea[live] = A; eb[live] = B;

    /* THIS LINE IS AGENTS RULE 1. The distance a reader measures between two
       connected films is a statement about how tightly the corpus says they are
       bound, and about nothing else. Linear in strength because the mapping has
       to be legible: halfway between two strengths is halfway between two
       lengths, and a reader comparing two edges by eye is doing the right
       arithmetic. */
    rest[live] = k * (P.restStrong +
      Math.pow(1 - s, P.restExp) * (P.restWeak - P.restStrong));

    /* Stiffness rises with strength, with a floor. The floor is load-bearing
       and it is not a tuning convenience: STATE.md records that deleting weak
       ties makes 42% of films dead ends, so weak ties are what keeps the sky one
       object rather than a scatter of islands. They must still pull. They just
       do not get to decide the shape. */
    stiff[live] = P.stiffFloor + (1 - P.stiffFloor) * Math.pow(s, P.stiffExp);
    live++;
  }

  /* ------------------------------------------------------------- quadtree -- */

  /* The tree is rebuilt from scratch every iteration and the arrays are reused,
     so the per-iteration allocation is zero. Capacity grows by doubling; a
     quadtree over n well-spread points settles around 1.4n cells, but a corpus
     with a very tight cluster can need more, so this is measured rather than
     assumed. */
  let qCap = Math.max(64, n * 2);
  let qChild = new Int32Array(qCap * 4);
  let qMass = new Float64Array(qCap);
  let qComX = new Float64Array(qCap);
  let qComY = new Float64Array(qCap);
  let qBody = new Int32Array(qCap);
  let qHalf = new Float64Array(qCap);
  const bNext = new Int32Array(n);   /* leaf overflow chain, see MAX_DEPTH     */
  let qCount = 0;

  function growCells() {
    const cap = qCap * 2;
    const nChild = new Int32Array(cap * 4); nChild.set(qChild);
    const nMass = new Float64Array(cap); nMass.set(qMass);
    const nComX = new Float64Array(cap); nComX.set(qComX);
    const nComY = new Float64Array(cap); nComY.set(qComY);
    const nBody = new Int32Array(cap); nBody.set(qBody);
    const nHalf = new Float64Array(cap); nHalf.set(qHalf);
    qCap = cap;
    qChild = nChild; qMass = nMass; qComX = nComX; qComY = nComY;
    qBody = nBody; qHalf = nHalf;
  }

  function newCell(half) {
    if (qCount >= qCap) growCells();
    const c = qCount++;
    const b = c * 4;
    qChild[b] = -1; qChild[b + 1] = -1; qChild[b + 2] = -1; qChild[b + 3] = -1;
    qMass[c] = 0; qComX[c] = 0; qComY[c] = 0; qBody[c] = -1; qHalf[c] = half;
    return c;
  }

  let rootCX = 0, rootCY = 0, rootHalf = 1;

  /* A cell is EMPTY (mass 0), a LEAF (mass >= 1, qBody >= 0, no children) or
     INTERNAL (qBody === -1, children). Insertion walks down; when it meets an
     occupied leaf it pushes that single film one level down into a fresh child
     and carries on, which turns the leaf into an internal node without
     recursion. Below MAX_DEPTH the leaf keeps a chain instead. */
  function insertBody(i) {
    const px = x[i], py = y[i];
    let c = 0, cx = rootCX, cy = rootCY, half = rootHalf, depth = 0;
    for (;;) {
      if (qMass[c] === 0) {
        qMass[c] = 1; qComX[c] = px; qComY[c] = py; qBody[c] = i; bNext[i] = -1;
        return;
      }
      if (qBody[c] >= 0) {
        if (depth >= MAX_DEPTH) {
          bNext[i] = qBody[c]; qBody[c] = i;
          const mm = qMass[c];
          qComX[c] = (qComX[c] * mm + px) / (mm + 1);
          qComY[c] = (qComY[c] * mm + py) / (mm + 1);
          qMass[c] = mm + 1;
          return;
        }
        const j = qBody[c];
        qBody[c] = -1;
        const jx = x[j], jy = y[j];
        const jh = half * 0.5;
        const kj = (jx >= cx ? 1 : 0) + (jy >= cy ? 2 : 0);
        const cj = newCell(jh);          /* may reallocate: read arrays after  */
        qChild[c * 4 + kj] = cj;
        qMass[cj] = 1; qComX[cj] = jx; qComY[cj] = jy; qBody[cj] = j;
        bNext[j] = -1;
      }
      const mm = qMass[c];
      qComX[c] = (qComX[c] * mm + px) / (mm + 1);
      qComY[c] = (qComY[c] * mm + py) / (mm + 1);
      qMass[c] = mm + 1;

      const qh = half * 0.5;
      const east = px >= cx, south = py >= cy;
      const slot = c * 4 + (east ? 1 : 0) + (south ? 2 : 0);
      let ch = qChild[slot];
      if (ch === -1) {
        /* Two statements, not `qChild[slot] = newCell(...)`: JS evaluates the
           assignment target's base reference BEFORE the right-hand side, so the
           one-liner would write into the pre-growth array and lose the child. */
        const created = newCell(qh);
        qChild[slot] = created;
        ch = created;
      }
      cx = east ? cx + qh : cx - qh;
      cy = south ? cy + qh : cy - qh;
      half = qh;
      c = ch;
      depth++;
    }
  }

  function buildTree() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (x[i] < minX) minX = x[i];
      if (x[i] > maxX) maxX = x[i];
      if (y[i] < minY) minY = y[i];
      if (y[i] > maxY) maxY = y[i];
    }
    /* Square root cell, padded so a film exactly on the bounding box does not
       land outside the root and vanish from the traversal. */
    const w = maxX - minX, h = maxY - minY;
    rootCX = (minX + maxX) * 0.5;
    rootCY = (minY + maxY) * 0.5;
    rootHalf = Math.max(w, h) * 0.5 * 1.02 + 1e-9;
    qCount = 0;
    newCell(rootHalf);
    for (let i = 0; i < n; i++) insertBody(i);
  }

  /* ---------------------------------------------------------------- forces -- */

  const THETA2 = P.theta * P.theta;
  const CREP = P.repel * k2;
  /* Short-range softening. Without it a pair that happens to coincide produces
     an infinite kick and the whole sim leaves the building on the next step. At
     k/8 the softening is far below the spacing that matters visually, so it
     never blunts the separation the overlap metric cares about. */
  const SOFT = k * 0.125, SOFT2 = SOFT * SOFT;

  /* DFS stack. A quadtree walk holds at most three unopened siblings per level,
     so 4*MAX_DEPTH is already generous; this is deliberately larger so an
     unexpected corpus cannot silently overrun a typed array. */
  const stack = new Int32Array(4 * MAX_DEPTH + 64);

  /* Deterministic unit vector from a pair of indices. Used only when two films
     are at (numerically) the same point: they need a push in SOME direction and
     it must be the same direction on every run, so it is hashed rather than
     drawn from the PRNG whose call order would then depend on the geometry. */
  function nudgeAngle(i, j) {
    let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(j + 1, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    return (h / 4294967296) * Math.PI * 2;
  }

  function repulsion() {
    for (let i = 0; i < n; i++) {
      const px = x[i], py = y[i];
      let fx = 0, fy = 0, sp = 0;
      stack[sp++] = 0;
      while (sp > 0) {
        const c = stack[--sp];
        const mass = qMass[c];
        if (mass === 0) continue;

        /* Leaves are always resolved exactly. A leaf holds one film (or, in the
           MAX_DEPTH case, a short chain), so this is cheap, and it is what keeps
           i from repelling itself through its own cell's centre of mass. */
        if (qBody[c] >= 0) {
          for (let b = qBody[c]; b !== -1; b = bNext[b]) {
            if (b === i) continue;
            let dx = px - x[b], dy = py - y[b];
            let d2 = dx * dx + dy * dy;
            if (d2 < 1e-24) {
              const a = nudgeAngle(i, b);
              dx = Math.cos(a) * SOFT; dy = Math.sin(a) * SOFT;
              d2 = SOFT2;
            } else if (d2 < SOFT2) {
              d2 = SOFT2;
            }
            const f = CREP / d2;
            fx += dx * f; fy += dy * f;
          }
          continue;
        }

        const dx = px - qComX[c], dy = py - qComY[c];
        let d2 = dx * dx + dy * dy;
        const width = qHalf[c] * 2;
        /* The Barnes-Hut opening criterion, squared to avoid a sqrt: a cell is
           far enough to be replaced by its centre of mass when its width over
           the distance is below theta. This single test is the difference
           between this file and its predecessor -- it is what lets a cluster
           two hundred films away still push. */
        if (width * width < THETA2 * d2) {
          if (d2 < SOFT2) d2 = SOFT2;
          const f = CREP * mass / d2;
          fx += dx * f; fy += dy * f;
          continue;
        }
        const b4 = c * 4;
        let ch;
        ch = qChild[b4];     if (ch !== -1) stack[sp++] = ch;
        ch = qChild[b4 + 1]; if (ch !== -1) stack[sp++] = ch;
        ch = qChild[b4 + 2]; if (ch !== -1) stack[sp++] = ch;
        ch = qChild[b4 + 3]; if (ch !== -1) stack[sp++] = ch;
      }
      dispX[i] += fx; dispY[i] += fy;
    }
  }

  function attraction() {
    for (let e = 0; e < live; e++) {
      const i = ea[e], j = eb[e];
      let dx = x[j] - x[i], dy = y[j] - y[i];
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-12) {
        const a = nudgeAngle(i, j);
        dx = Math.cos(a) * SOFT; dy = Math.sin(a) * SOFT; d = SOFT;
      }
      /* Hooke, not Fruchterman-Reingold's d^2/k. FR's attraction has no notion
         of a preferred length -- it only ever pulls -- so with it the rendered
         distance is set by where repulsion happens to balance the pull, and
         `strength` could bias that only indirectly. A spring with an explicit
         rest length states the target distance outright, which is the only form
         in which rule 1 is actually checkable: the harness's bondFit is exactly
         the question "did the rest lengths survive". */
      const f = P.attract * stiff[e] * (d - rest[e]);
      const ux = dx / d, uy = dy / d;
      dispX[i] += ux * f; dispY[i] += uy * f;
      dispX[j] -= ux * f; dispY[j] -= uy * f;
    }
  }

  /* ------------------------------------------------------------- the loop -- */

  const T0 = P.tempStart * k, T1 = P.tempEnd * k;
  const ITER = P.iterations;

  for (let it = 0; it < ITER; it++) {
    dispX.fill(0); dispY.fill(0);

    buildTree();
    repulsion();
    attraction();

    /* Uniform gravity toward the centroid. It does two jobs: it stops the whole
       constellation drifting (global repulsion has no fixed frame), and it
       keeps the outer films from being blown to the rim, which is what wrecks
       occupancy — a handful of outliers stretch the bounding box and the
       normalisation shrinks everything else into a dot. It is one constant for
       every film. Note that ForceAtlas2's gravity is scaled by (degree + 1);
       that is precisely the form rule 1 forbids and it is not used here. */
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += x[i]; cy += y[i]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      dispX[i] -= (x[i] - cx) * P.gravity;
      dispY[i] -= (y[i] - cy) * P.gravity;
    }

    /* THE TEMPERATURE CAP IS WHAT MAKES THIS CONVERGE AT ALL. With ~19 edge
       ends per film every spring adds into the same displacement, and a film
       that starts 2.0 away from a neighbour whose rest length is 0.05 receives
       a correction far larger than the distance it needed to move. Uncapped,
       the layout spans thousands of units by the second iteration and settles
       into a dot with three survivors flung to the edges — a picture with no
       information in it that still normalises into something that looks like a
       layout. Capping the step is the standard FR cooling schedule.

       The curve matters as much as the cap. Cooling too fast freezes the
       hairball before global repulsion has finished separating the clusters;
       too slow and the sim is still making large rearrangements at the end and
       never settles. coolExp > 1 spends most of the schedule cold, doing the
       fine placement that the overlap metric measures, after a short hot phase
       that does the coarse separation. */
    const frac = 1 - it / ITER;
    const temp = T1 + (T0 - T1) * Math.pow(frac, P.coolExp);

    for (let i = 0; i < n; i++) {
      const fx = dispX[i], fy = dispY[i];
      const mag = Math.sqrt(fx * fx + fy * fy);
      if (mag < 1e-15) continue;
      const step = mag > temp ? temp / mag : 1;
      x[i] += fx * step;
      y[i] += fy * step;
    }
  }

  /* ----------------------------------------------------------- normalise -- */

  /* Fit into [margin, 1-margin] on the LONGER axis and centre the shorter one.
     Stretching each axis independently to fill the square would be free
     occupancy and a lie: it would scale x-distances and y-distances by
     different factors, so two edges of equal bond strength would render at
     different lengths depending only on their orientation. Rule 1 says the
     length on screen is the meaning, so the transform has to be a similarity. */
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] < minX) minX = x[i];
    if (x[i] > maxX) maxX = x[i];
    if (y[i] < minY) minY = y[i];
    if (y[i] > maxY) maxY = y[i];
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const usable = 1 - 2 * P.margin;
  const scale = usable / span;
  const offX = P.margin + (usable - (maxX - minX) * scale) * 0.5;
  const offY = P.margin + (usable - (maxY - minY) * scale) * 0.5;

  const q = Math.pow(10, P.round);
  const out = {};
  for (let i = 0; i < n; i++) {
    const px = (x[i] - minX) * scale + offX;
    const py = (y[i] - minY) * scale + offY;
    out[keys[i]] = [
      Math.round(Math.min(1, Math.max(0, px)) * q) / q,
      Math.round(Math.min(1, Math.max(0, py)) * q) / q,
    ];
  }
  return out;
}

module.exports = { layout };
