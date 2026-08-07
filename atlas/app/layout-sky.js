#!/usr/bin/env node
/* Deterministic layout for the constellation view.
 *
 *   const { layout } = require("./layout-sky.js");
 *   const pos = layout(films, edges);      // -> { key: [x, y] }, both in [0,1]
 *
 * WHY THIS RUNS AT BUILD TIME
 *
 * A force layout is O(n^2) in the naive form and the corpus is heading past
 * 2,000 films. Running it in the browser would mean a multi-second freeze on
 * first open of the view, on a phone, every time. Running it here costs a
 * second of build and ships two numbers per film.
 *
 * It also makes the constellation DETERMINISTIC, which the project requires of
 * everything else: AGENTS rule 7 keeps the corpus baked precisely so the graph
 * does not re-roll per request. A layout that settled differently on every load
 * would mean the shape of cinema rearranged itself while you looked away, and
 * no one could ever say "it's over on the left" to anyone else.
 *
 * HOW THIS OBEYS AGENTS RULE 1
 *
 * Rule 1: edge distance encodes formal bond strength, never popularity or node
 * degree. So the spring REST LENGTH is a function of edge strength alone --
 * a strong bond wants to be short, a weak one wants to be long -- and degree
 * appears nowhere in the force calculation. Nothing is scaled by fame.
 *
 * The honest caveat, which is worth stating rather than hiding: in ANY force
 * layout a node with many edges ends up nearer the middle, because it is being
 * pulled from many directions at once. That is emergent from the topology, not
 * applied as a weight, and the topology here is formal bonds. But it does mean
 * "central in the constellation" reads a little like "well-connected", and a
 * reader may take that as importance. The view must not reinforce it: node size
 * is CONSTANT, never scaled by degree, and the caption never ranks.
 */
"use strict";

/* Seeded, because "deterministic" has to survive someone adding a film: the
   same corpus must give the same sky twice, and a Math.random() init would
   quietly break that while still looking fine. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layout(films, edges, opts) {
  const o = opts || {};
  const ITER = o.iterations || 420;
  const keys = Object.keys(films);
  const n = keys.length;
  const idx = {};
  for (let i = 0; i < n; i++) idx[keys[i]] = i;

  const x = new Float64Array(n), y = new Float64Array(n);
  const vx = new Float64Array(n), vy = new Float64Array(n);

  /* Start on a phyllotaxis spiral rather than uniform noise. Random starts let
     two dense traditions land on top of each other and stay there -- the sim
     relaxes local overlap long before it can pull two interleaved clusters
     apart. An even spiral gives every film room to be claimed by its own
     neighbourhood on the first few passes. The jitter breaks the perfect
     symmetry that would otherwise leave collinear nodes with zero net force. */
  const rnd = mulberry32(0x0a71a5);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n);
    const a = i * GOLDEN;
    x[i] = r * Math.cos(a) + (rnd() - 0.5) * 0.004;
    y[i] = r * Math.sin(a) + (rnd() - 0.5) * 0.004;
  }

  /* Edge list as flat arrays: one pass over typed arrays per iteration beats
     chasing 7,000 object pointers 420 times. */
  const m = edges.length;
  const ea = new Int32Array(m), eb = new Int32Array(m), rest = new Float64Array(m), pull = new Float64Array(m);
  let live = 0;
  for (let e = 0; e < m; e++) {
    const A = idx[edges[e].a], B = idx[edges[e].b];
    if (A === undefined || B === undefined || A === B) continue;
    const s = Math.max(0, Math.min(1, edges[e].strength || 0));
    ea[live] = A; eb[live] = B;
    /* Rest length is a pure function of bond strength. This IS rule 1: the
       distance you read off the screen between two connected films is what the
       corpus says about how tightly they are bound, and nothing else. */
    rest[live] = 0.020 + (1 - s) * 0.075;
    /* A weak tie should still hold the graph together -- STATE.md is explicit
       that deleting weak ties makes 42% of films dead ends -- so the pull is
       floored rather than proportional. Weak ties keep the sky one object;
       they just do not get to decide the shape. */
    pull[live] = 0.35 + s * 0.65;
    live++;
  }

  const CELL = 0.055;
  const bins = new Map();
  const REPEL = o.repel || 0.00042;

  for (let it = 0; it < ITER; it++) {
    /* Cooling: big rearrangements early, fine settling late. Without it the
       sim oscillates around a good answer forever and never lands on one. */
    const heat = Math.pow(1 - it / ITER, 1.6);
    const damp = 0.86;

    bins.clear();
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i] / CELL), cy = Math.floor(y[i] / CELL);
      const k = cx * 100000 + cy;
      let b = bins.get(k);
      if (!b) { b = []; bins.set(k, b); }
      b.push(i);
    }

    /* Repulsion, but only against neighbours in the 3x3 cell block. Every film
       repelling every other film is 2,000^2 = 4M pairs per iteration and the
       far-field contribution is a near-constant push toward the centre that the
       centring term below already supplies. Local repulsion is what actually
       stops posters landing on top of each other. */
    for (const [k, b] of bins) {
      const cx = Math.floor(k / 100000), cy = k - cx * 100000;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nb = bins.get((cx + dx) * 100000 + (cy + dy));
        if (!nb) continue;
        for (let p = 0; p < b.length; p++) {
          const i = b[p];
          for (let q = 0; q < nb.length; q++) {
            const j = nb[q];
            if (j <= i) continue;
            let ddx = x[i] - x[j], ddy = y[i] - y[j];
            let d2 = ddx * ddx + ddy * ddy;
            if (d2 > CELL * CELL * 4) continue;
            if (d2 < 1e-9) { ddx = (rnd() - 0.5) * 1e-4; ddy = (rnd() - 0.5) * 1e-4; d2 = ddx * ddx + ddy * ddy; }
            const d = Math.sqrt(d2);
            const f = (REPEL / d2) * heat;
            const ux = ddx / d, uy = ddy / d;
            vx[i] += ux * f; vy[i] += uy * f;
            vx[j] -= ux * f; vy[j] -= uy * f;
          }
        }
      }
    }

    for (let e = 0; e < live; e++) {
      const i = ea[e], j = eb[e];
      const ddx = x[j] - x[i], ddy = y[j] - y[i];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-6;
      const f = (d - rest[e]) * pull[e] * 0.045 * heat;
      const ux = ddx / d, uy = ddy / d;
      vx[i] += ux * f; vy[i] += uy * f;
      vx[j] -= ux * f; vy[j] -= uy * f;
    }

    for (let i = 0; i < n; i++) {
      vx[i] -= x[i] * 0.0016 * heat;
      vy[i] -= y[i] * 0.0016 * heat;
      vx[i] *= damp; vy[i] *= damp;
      x[i] += vx[i]; y[i] += vy[i];
    }
  }

  /* Normalise into [0,1] on the longer axis, preserving aspect: squashing the
     sky to fill a square would distort exactly the distances rule 1 says are
     the meaningful thing on screen. */
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] < minX) minX = x[i]; if (x[i] > maxX) maxX = x[i];
    if (y[i] < minY) minY = y[i]; if (y[i] > maxY) maxY = y[i];
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const offX = (span - (maxX - minX)) / 2, offY = (span - (maxY - minY)) / 2;

  const out = {};
  for (let i = 0; i < n; i++) {
    out[keys[i]] = [
      Math.round(((x[i] - minX + offX) / span) * 10000) / 10000,
      Math.round(((y[i] - minY + offY) / span) * 10000) / 10000,
    ];
  }
  return out;
}

module.exports = { layout };
