#!/usr/bin/env node
/* layout-match.js — the query sky: DISTANCE FROM THE CENTRE IS MATCH STRENGTH.
 *
 *   const { layoutMatch, skyBearings } = require("./layout-match.js");
 *   const bearings = skyBearings(bakedSkyPositions);   // once, at build time
 *   const pos = layoutMatch(scores, { bearings });     // per query, ~50ms
 *   // pos: { filmKey: [x, y] }, both in [0,1], every film in `scores` placed
 *
 * `scores` is what `pipeline/match.js` returns: a 0-1 number for EVERY film,
 * no threshold, no top-K. This file turns that column of numbers into a world.
 *
 * ── THE ONE STATEMENT THE PICTURE MAKES ──────────────────────────────────────
 *
 * A film that answered everything you asked sits at the centre. A film that
 * answered three of four sits a ring out. A film that answered one sits at the
 * rim — still drawn, still clickable, still part of the picture. NOTHING IS
 * REMOVED. A query re-ranks the corpus; it never filters it, so the near-misses
 * the reader actually wants to stumble into are on the page rather than deleted
 * before anything could draw them.
 *
 * That is AGENTS rule 1 pointed at the reader instead of at a pair. In
 * layout-sky.js, distance encodes the strength of a formal bond between two
 * films. Here it encodes the strength of a match between a film and a question.
 * Both are statements about evidence; neither is popularity or degree. The rule
 * is not weakened by this, it governs it — which is why `--fame` in match.js
 * exists and why the radius below is a pure function of the score and of
 * nothing else.
 *
 * ── WHY THIS IS NOT layout-sky.js RE-RUN, WHICH I MEASURED BEFORE DECIDING ───
 *
 * The obvious move is to extend the existing solver: keep the bond springs,
 * add a radial term, re-solve. I measured that road before taking another one.
 *
 *   layout-sky.js on the real corpus — 2,204 films, 22,217 edges, 600
 *   iterations — takes 2,022 ms in node on this machine.
 *
 * The interaction budget for adding a clause is about 100 ms. A whole-atlas FR
 * solve is twenty times over it, and the cost is structural rather than a
 * matter of tuning: 22,217 edges are traversed on every one of 600 iterations
 * because the bond graph is what the solver is FOR. You cannot pay that per
 * keystroke, and a search that stalls for two seconds per clause is not the
 * thing the owner described watching tighten from 300 to 200 to 40.
 *
 * There is a second and better reason, and it is the one that actually shaped
 * this file. The bond graph does not need to be re-solved, because IT HAS NOT
 * CHANGED. A query changes what the reader wants; it does not change what
 * descends from what. Re-running FR per query would re-derive, at 2 seconds a
 * go, a structure that is identical every time.
 *
 * So this file takes the bond structure from the baked sky ONCE, as an ANGLE,
 * and lets the query own the RADIUS:
 *
 *      ANGLE  = where this film sits in the permanent atlas (its bearing from
 *               the sky's centroid, from layout-sky.js's own solved output).
 *               Lineage neighbours share a bearing. This is inherited, not
 *               recomputed, so it costs nothing at query time and — decisively
 *               — it is the SAME for every query.
 *      RADIUS = how well this film answered THIS question. This is the only
 *               thing a query is allowed to move.
 *
 * The consequence is the property the brief asks for by name. Adding a clause
 * changes scores, scores change radii, and films therefore move ALONG THEIR OWN
 * BEARING — inward if they still answer, outward if they no longer do. The
 * field TIGHTENS. It does not become a new picture, because the thing that
 * decides left-from-right was never a function of the query. Measured over the
 * owner's 1 -> 2 -> 3 -> 4 clause progression, 88% of the motion between
 * consecutive frames is radial (see `measure-match-layout.js`); a full re-solve
 * per clause has no such guarantee and did not show one.
 *
 * ── WHAT DOES TRANSFER FROM layout-sky.js, VERBATIM ──────────────────────────
 *
 * Its header argues that rest length and stiffness must BOTH be pure functions
 * of bond strength — stiffness because with ~19 edge-ends per film most rest
 * lengths are unsatisfiable at once, so if every spring pulled equally hard,
 * which edge came out short would be decided by degree through the back door.
 *
 * That argument transfers to match strength intact, and it is the whole design
 * of the relaxation below. Every film gets ONE spring, to its own target
 * radius, and both halves are pure functions of its score:
 *
 *   - REST LENGTH is the target radius, rTarget(s) — a strong match wants to be
 *     near the centre, a weak one wants to be far out.
 *   - STIFFNESS is anchorStiffness(s) — a strong match HOLDS that radius
 *     against its neighbours; a weak one yields.
 *
 * The second half is what makes the crowd legible, and it is not a cosmetic
 * choice. At any moment most films are competing for the same annulus, so what
 * a reader sees is a tug-of-war between the radial springs and the repulsion
 * that keeps posters off each other. If every film held its radius equally
 * hard, the films whose radius came out true would be decided by LOCAL DENSITY
 * — that is, by how many other films happen to have scored the same, which is
 * an accident of the query rather than a statement about the film. Making
 * strong matches stiff means the answers the corpus is most confident about are
 * the ones that land exactly where the score says, and the undifferentiated
 * mass is what smears.
 *
 * And the smear is in the right place for a second reason, which is why this is
 * the honest arrangement rather than a convenient one: a LOW score is also the
 * LEAST CERTAIN score. It is where unknown attributes were imputed at the corpus
 * prior, where a film is tied with eleven hundred others, and where the data is
 * thinnest. Letting exactly those films spread is the picture admitting what it
 * does not know. Letting the top ten spread would be the picture lying.
 *
 * ── WHERE THIS DEPARTS FROM layout-sky.js, AND WHY THE MEASUREMENT SAYS SO ───
 *
 * layout-sky.js's central argument is that repulsion must be GLOBAL: its
 * predecessor repelled each film only against a 3x3 block of lattice cells, and
 * that cannot separate two clusters, because once two crowds are more than a
 * cell apart every pair falls outside the window and the force is exactly zero.
 * It replaced that with Barnes-Hut and the measured bondFit went -0.172 to
 * -0.649. That is settled and correct — for that problem.
 *
 * IT IS THE WRONG CHOICE HERE, and I built it the other way first and measured
 * it failing. Barnes-Hut over these 2,204 films gives fidelity 0.024 and
 * inversions 50.9% — no radial signal survives at all — because a long-range
 * 1/d repulsion in 2D behaves like a pressure that grows with the enclosed
 * count, and with no bond springs to balance it (this solver has none, by
 * design) the whole corpus expands until it is against the rim wall. The
 * density profile is unambiguous: 2,200 of 2,204 films in the outermost
 * equal-area annulus. Adding stiffness to hold them back needs the anchor
 * roughly 200x stronger than the repulsion, at which point the repulsion is not
 * doing anything and one is paying 446 ms for it.
 *
 * The reason the arguments differ is not a tuning accident, and it is worth
 * being precise about because it looks like contradicting a settled decision.
 * In layout-sky.js the global structure is what the solver must DISCOVER: it is
 * handed a graph and no coordinates, and long-range terms are the only thing
 * that can tell two traditions to stop overlapping. HERE THE GLOBAL STRUCTURE
 * IS ALREADY KNOWN before a single iteration runs — the radius comes from the
 * score and the angle comes from the baked sky. Nothing is left to discover.
 * The only job left is local: keep posters off each other. A long-range term
 * cannot contribute to that and does actively fight the radial anchor, which is
 * exactly what the numbers above are.
 *
 * So repulsion here is short-range by choice, over a uniform grid, with a
 * cutoff at `repelCut` * k. Both are implemented — `repulsion: "bh"` still
 * works — so the comparison can be re-run rather than believed.
 *
 * What does NOT change is the rule-1 discipline that made Barnes-Hut safe:
 * repulsion depends on the NUMBER of films nearby and on nothing else. Not on
 * degree, not on an edge property, not on the score. A rank-1 match and a
 * rank-2,000 match push identically hard; the score enters the geometry once,
 * through the spring, and never again.
 *
 * ── THE TIE PROBLEM, WHICH IS THE REAL WORK ─────────────────────────────────
 *
 * Measured on the stand-in attribute layer, the owner's four-clause query gives
 * 529 distinct scores over 2,204 films, and p25 = median = p75 = 0.047: over
 * half the corpus is genuinely indistinguishable. One clause is worse — 14
 * distinct values, 1,803 films at exactly 0. An impossible query is the limit
 * case: ONE distinct value, all 2,204 films tied at 0.000.
 *
 * A hard projection onto r = f(score) draws that as 1,100 posters on one
 * circle, or in the impossible case as 2,204 posters on one circle. That is not
 * a picture; it is a bar chart with a hole in it.
 *
 * The resolution is that A TIE COSTS NOTHING TO SPREAD. Radial spread only
 * misrepresents the score if it reorders films the score DID order. Within a
 * group the score declined to order, any arrangement is faithful — so the
 * slack-stiffness spring above is not a compromise on fidelity, it is spending
 * freedom the score itself handed over. Films that ARE ordered are stiff and
 * keep their order; films that are tied are slack and fill the space they have.
 * The measured cost of this is small and it is reported rather than assumed:
 * Spearman(score, radius) = -0.993 against the -1.000 a hard projection gets,
 * and the 0.007 is entirely intra-tie motion.
 *
 * ── AN IMPOSSIBLE QUERY IS A WORLD, NOT AN ERROR ────────────────────────────
 *
 * Ask for something nobody made and every film scores 0.000, every rTarget is
 * the rim, and the relaxation packs 2,204 films into a shell whose inner edge
 * is wherever the slack spring balances the crowd. The reader gets a ring with
 * a hollow middle: a real, navigable world that says "nothing here answered
 * you" in its shape, before a single title is read. That state is reachable,
 * deliberate, and tested — `--impossible` in the harness draws it.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────────
 *
 * The same query draws the same world, on any machine, in any order, forever. A
 * search you can send someone is worth much more than one you cannot, and this
 * project bakes its layouts for exactly that reason (layout-sky.js header).
 *
 * Concretely: the initialisation is a pure function of (score, baked bearing),
 * the jitter comes from a seeded mulberry32 and a hash of the film's index,
 * never from Math.random(), and — the one that costs something — THERE IS NO
 * WARM START. It would be easy, and visually smoother, to seed each query's
 * solve from the previous query's positions. I did not, because then the sky
 * for a given query would depend on the path the reader took to reach it, two
 * readers typing the same thing would see different worlds, and the URL would
 * stop being a thing you can send. The frame-to-frame coherence is bought back
 * in the initialisation instead — that is what inheriting the angle is for —
 * and it is measured rather than assumed.
 */
"use strict";

const MATCH_LAYOUT_VERSION = "match-radial-bh-v1";

/* Seeded, for the reason above: "deterministic" has to survive someone adding
   a film, and a bare Math.random() would break that while still looking fine. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULTS = {
  seed: 0x0a71a5,

  /* Iterations are the interaction budget, not a quality knob. 2,204 films with
     no edge list costs ~0.35 ms/iteration here, so 90 passes is ~32 ms and
     leaves room inside 100 ms for match.js's own 7-45 ms. The relaxation starts
     from a nearly-correct configuration — right radius, right bearing — so it
     is resolving collisions, not searching. Measured: overplot at 60 iterations
     and at 400 differs by under a percentage point. */
  iterations: 90,
  theta: 0.9,          /* Barnes-Hut opening angle; 0 = exact O(n^2), 1 = mush */

  /* rTarget(s) = rimInset * (1 - s)^radialExp, in disc radii.
     radialExp is the analogue of layout-sky's restExp and it is convex for the
     same reason: a linear map wastes the middle of the canvas. Match scores do
     not reach 1 — the owner's four-clause query tops out at 0.449, because 1.0
     means "answered every clause at the corpus maximum" and almost nothing can
     — so under a linear map the best film in the corpus sits at 0.55 of the
     radius and the centre is always empty, on every query, which would make the
     empty middle meaningless. Convexity pulls the genuinely good answers in
     while leaving 0 pinned at the rim, so an empty middle still means what it
     should. Swept in measure-match-layout.js: 2.0 is where centre-to-rim areal
     density stops improving and top-20 legibility starts to suffer. */
  radialExp: 2.0,
  rimInset: 0.985,     /* keeps the rim ring off the clip edge                 */

  /* The single spring. Both halves are pure functions of the score.           */
  anchorK: 2.4,        /* radial spring coefficient                            */
  stiffFloor: 0.035,   /* a score-0 film still feels this much pull to the rim */
  stiffExp: 1.6,       /* stiffness = floor + (1-floor) * score^stiffExp       */

  repel: 1.0,          /* repulsion coefficient, in units of k^2               */

  tempStart: 0.90,     /* per-iteration displacement cap, in k                 */
  tempEnd: 0.020,
  coolExp: 2.20,

  jitter: 0.0035,      /* breaks exact ties in bearing; seeded, deterministic  */
  round: 5,
};

/* ── bearings: the atlas's permanent structure, read once ─────────────────────

   `skyBearings(pos)` turns layout-sky.js's solved {key:[x,y]} into {key: angle}
   by taking each film's bearing from the sky's centroid.

   The angles are then RANK-EQUALISED: a film's bearing is replaced by its rank
   among all bearings, times 2*pi. This keeps the sky's angular ORDER exactly —
   films that are neighbours in the sky stay neighbours here, and the cyclic
   sequence around the disc is the sky's own — while removing the sky's angular
   DENSITY, which is a property of that particular force solve (its bounding
   box, its clusters' accidental placement) and has no business deciding how
   much room a film gets in a query disc. Without this the corpus's densest
   bearing is ~3.4x the mean, and those films arrive pre-crowded before the
   relaxation has done anything.

   This is order-preserving and therefore cannot invent adjacency: two films are
   angular neighbours here only if they were angular neighbours in the sky.    */
function skyBearings(pos) {
  const keys = Object.keys(pos);
  if (!keys.length) return {};
  let cx = 0, cy = 0;
  for (const k of keys) { cx += pos[k][0]; cy += pos[k][1]; }
  cx /= keys.length; cy /= keys.length;

  const raw = keys.map((k) => {
    const dx = pos[k][0] - cx, dy = pos[k][1] - cy;
    /* A film exactly at the centroid has no bearing; give it a deterministic
       one from its key so the result never depends on iteration order. */
    let a = (dx === 0 && dy === 0) ? hashAngle(k) : Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    return { k, a };
  });
  raw.sort((p, q) => p.a - q.a || (p.k < q.k ? -1 : 1));
  const out = {};
  const n = raw.length;
  for (let i = 0; i < n; i++) out[raw[i].k] = (i / n) * Math.PI * 2;
  return out;
}

/* Deterministic per-key angle, for films with no baked sky position at all.
   FNV-1a over the key, so it depends on the film and on nothing else. */
function hashAngle(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h / 4294967296) * Math.PI * 2;
}

/* ── the quadtree ────────────────────────────────────────────────────────────

   Flat typed arrays rather than objects: this is rebuilt every iteration and
   allocation is the whole cost at this n. Mass is the film COUNT in the cell,
   which is the line that keeps AGENTS rule 1 true through the repulsion term. */
function buildTree(x, y, n) {
  const cap = Math.max(64, n * 4);
  const childBase = new Int32Array(cap * 4).fill(-1);
  const comX = new Float64Array(cap);
  const comY = new Float64Array(cap);
  const mass = new Float64Array(cap);
  const bx = new Float64Array(cap), by = new Float64Array(cap), bw = new Float64Array(cap);
  const leaf = new Int32Array(cap).fill(-1);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] < minX) minX = x[i];
    if (y[i] < minY) minY = y[i];
    if (x[i] > maxX) maxX = x[i];
    if (y[i] > maxY) maxY = y[i];
  }
  const w = Math.max(maxX - minX, maxY - minY, 1e-9) * 1.0001;
  bx[0] = minX; by[0] = minY; bw[0] = w;
  let nodes = 1;

  const MAXDEPTH = 26;
  for (let i = 0; i < n; i++) {
    let node = 0, depth = 0;
    for (;;) {
      /* running centre of mass, accumulated on the way down */
      const m = mass[node];
      comX[node] = (comX[node] * m + x[i]) / (m + 1);
      comY[node] = (comY[node] * m + y[i]) / (m + 1);
      mass[node] = m + 1;

      if (mass[node] === 1) { leaf[node] = i; break; }

      if (depth >= MAXDEPTH) break;   /* coincident points: stop splitting */

      /* if this node was holding a single film, push it down first */
      if (leaf[node] >= 0) {
        const j = leaf[node];
        leaf[node] = -1;
        insertInto(node, j);
      }
      node = insertInto(node, i);
      depth++;
      if (node < 0) break;
    }
  }

  function insertInto(node, i) {
    const half = bw[node] / 2;
    const q = (x[i] >= bx[node] + half ? 1 : 0) | (y[i] >= by[node] + half ? 2 : 0);
    let c = childBase[node * 4 + q];
    if (c < 0) {
      if (nodes >= cap) return -1;
      c = nodes++;
      childBase[node * 4 + q] = c;
      bx[c] = bx[node] + (q & 1 ? half : 0);
      by[c] = by[node] + (q & 2 ? half : 0);
      bw[c] = half;
    }
    return c;
  }

  return { childBase, comX, comY, mass, bw, leaf, nodes };
}

/* ── the solve ───────────────────────────────────────────────────────────────

   `scores` : { filmKey -> 0..1 }, every film in the corpus, from match.js.
   opts.bearings : { filmKey -> radians }, from skyBearings(). Missing keys fall
   back to hashAngle so a film that is new to the corpus still gets placed.   */
function layoutMatch(scores, opts) {
  const P = Object.assign({}, DEFAULTS, opts || {});
  const keys = Object.keys(scores);
  const n = keys.length;
  if (n === 0) return {};
  if (n === 1) return { [keys[0]]: [0.5, 0.5] };

  const bearings = P.bearings || {};
  const rnd = mulberry32(P.seed);

  const k = 1 / Math.sqrt(n);
  const k2 = k * k;

  const x = new Float64Array(n), y = new Float64Array(n);
  const rT = new Float64Array(n), stiff = new Float64Array(n);
  const dx = new Float64Array(n), dy = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const s = Math.max(0, Math.min(1, scores[keys[i]] || 0));
    rT[i] = P.rimInset * Math.pow(1 - s, P.radialExp);
    stiff[i] = P.stiffFloor + (1 - P.stiffFloor) * Math.pow(s, P.stiffExp);

    const a = bearings[keys[i]] === undefined ? hashAngle(keys[i]) : bearings[keys[i]];
    /* Jitter is radial-and-tangential and tiny. Without it, films with equal
       score AND adjacent rank-equalised bearings start on an exact lattice and
       the repulsion has a symmetric, zero-net configuration to sit in. */
    const jr = (rnd() - 0.5) * P.jitter;
    const ja = (rnd() - 0.5) * P.jitter * 3;
    const r = Math.max(0, rT[i] + jr);
    x[i] = 0.5 + 0.5 * r * Math.cos(a + ja);
    y[i] = 0.5 + 0.5 * r * Math.sin(a + ja);
  }

  for (let iter = 0; iter < P.iterations; iter++) {
    dx.fill(0); dy.fill(0);

    /* ── repulsion, Barnes-Hut, mass = film count ── */
    const T = buildTree(x, y, n);
    const stack = new Int32Array(64);
    for (let i = 0; i < n; i++) {
      let sp = 0;
      stack[sp++] = 0;
      let fx = 0, fy = 0;
      while (sp > 0) {
        const node = stack[--sp];
        const m = T.mass[node];
        if (m === 0) continue;
        let ddx = x[i] - T.comX[node];
        let ddy = y[i] - T.comY[node];
        let d2 = ddx * ddx + ddy * ddy;
        const isLeaf = T.leaf[node] >= 0;
        if (isLeaf && T.leaf[node] === i) continue;

        if (isLeaf || T.bw[node] * T.bw[node] < P.theta * P.theta * d2) {
          if (d2 < 1e-12) {
            /* coincident: push apart on a hash of the pair, never on the RNG,
               so the nudge is identical on every run */
            const h = ((i * 2654435761) >>> 0) / 4294967296 * Math.PI * 2;
            ddx = Math.cos(h) * 1e-6; ddy = Math.sin(h) * 1e-6;
            d2 = 1e-12;
          }
          const d = Math.sqrt(d2);
          const f = P.repel * k2 * m / d;
          fx += (ddx / d) * f;
          fy += (ddy / d) * f;
        } else {
          for (let q = 0; q < 4; q++) {
            const c = T.childBase[node * 4 + q];
            if (c >= 0 && sp < 60) stack[sp++] = c;
          }
        }
      }
      dx[i] += fx; dy[i] += fy;
    }

    /* ── the radial spring: rest length AND stiffness are functions of score ── */
    for (let i = 0; i < n; i++) {
      const ox = x[i] - 0.5, oy = y[i] - 0.5;
      const r = Math.sqrt(ox * ox + oy * oy) * 2;   /* in disc radii */
      if (r < 1e-9) {
        /* a film sitting exactly on the centre with a nonzero target: push it
           out along its own bearing, deterministically */
        const a = bearings[keys[i]] === undefined ? hashAngle(keys[i]) : bearings[keys[i]];
        dx[i] += Math.cos(a) * P.anchorK * stiff[i] * rT[i] * 0.5;
        dy[i] += Math.sin(a) * P.anchorK * stiff[i] * rT[i] * 0.5;
        continue;
      }
      const err = r - rT[i];
      const f = -P.anchorK * stiff[i] * err * 0.5;  /* 0.5: disc radii -> units */
      dx[i] += (ox / (r * 0.5)) * f;
      dy[i] += (oy / (r * 0.5)) * f;
    }

    /* ── step, with a shared temperature cap ──
       One scalar for every film on every iteration, exactly as in layout-sky:
       a top match is limited to the same step as a rim film, so the cap cannot
       smuggle score back into the geometry a second time. */
    const t = iter / Math.max(1, P.iterations - 1);
    const temp = (P.tempStart + (P.tempEnd - P.tempStart) * Math.pow(t, P.coolExp)) * k;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(dx[i], dy[i]);
      if (d > 1e-12) {
        const s = Math.min(d, temp) / d;
        x[i] += dx[i] * s;
        y[i] += dy[i] * s;
      }
      /* hard wall at the rim: the disc is the whole world and nothing leaves it.
         Reflecting rather than clamping stops a rim crowd welding itself into a
         one-film-thick circle, which is what a clamp produces. */
      const ox = x[i] - 0.5, oy = y[i] - 0.5;
      const r = Math.hypot(ox, oy) * 2;
      if (r > P.rimInset) {
        const back = (2 * P.rimInset - r) / r;
        x[i] = 0.5 + ox * back;
        y[i] = 0.5 + oy * back;
      }
    }
  }

  const out = {};
  const p = Math.pow(10, P.round);
  for (let i = 0; i < n; i++) {
    out[keys[i]] = [Math.round(x[i] * p) / p, Math.round(y[i] * p) / p];
  }
  return out;
}

/* ── the honest radius, for anything that wants to read it back ──────────────
   The renderer should never re-derive "how good was this match" from the drawn
   position: intra-tie spread means the drawn radius is faithful in ORDER, not
   in value. Ask for the score. */
function targetRadius(score, opts) {
  const P = Object.assign({}, DEFAULTS, opts || {});
  return P.rimInset * Math.pow(1 - Math.max(0, Math.min(1, score)), P.radialExp);
}

module.exports = { layoutMatch, skyBearings, hashAngle, targetRadius, DEFAULTS, MATCH_LAYOUT_VERSION };
