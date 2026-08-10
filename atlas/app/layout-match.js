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
 * consecutive frames is radial (measured by `pipeline/measure-match-layout.js`,
 * which this header cited for months before it existed — see THE CITATION at
 * the foot of this comment); a full re-solve per clause has no such guarantee.
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
 * spread is not a compromise on fidelity, it is spending freedom the score
 * itself handed over.
 *
 * ── AND THE FIRST DRAFT SPENT FREEDOM IT DID NOT HAVE ───────────────────────
 *
 * That argument was right and the implementation of it was not, which is the
 * defect this version exists to fix. Slack stiffness is not a fence: it lets a
 * tied film be SPREAD, but it also lets the crowd PUSH it, and on a real query
 * the crowd all pushes the same way. Most of the corpus scores near zero, most
 * rest lengths are therefore near the rim, the rim is jammed, and the only
 * direction left for the pressure to go is inward — through the films the
 * score DID order. Measured off the composited page on the owner's sentence:
 *
 *     Spearman(radius, score)  -0.876  (this header used to claim -0.993)
 *     ordered pairs drawn backwards            13.31% of 376,155
 *     widest tie                    103.06px on a 171.8px radial range
 *     of the 30 films drawn NEAREST the centre, 11 were outside the top 30
 *     by score and 5 outside the top 100; the worst was score-rank 779
 *
 * A film the reader's sentence answered three times worse, drawn nearer. That
 * is not intra-tie freedom, it is the picture lying about the one thing it
 * claims to say.
 *
 * SO THE TIE IS GIVEN A ROOM RATHER THAN A SPRING. Every distinct score gets
 * its own annulus — a BAND — and no film may leave its own band, ever, on any
 * iteration. The bands are laid out in score order, so a better answer is
 * drawn nearer than a worse one BY CONSTRUCTION and the inversion count is not
 * a statistic that came out well, it is zero for the same reason a sorted list
 * is sorted. Inside its band a tie is as free as it always was, and the crowd
 * pressure that used to travel inward now travels around the ring, which is
 * the direction that costs the reader nothing.
 *
 * Each band is wide enough to hold its own films — the area a group needs at
 * the solver's own k, times `bandPack` — and the slack left over is spent in
 * proportion to the score gaps, so where the score DID separate two films the
 * canvas still separates them. The widest band is a number the interface is
 * expected to print: `matchBands()` returns the table so the readout can say
 * "N films the score declined to order are spread over X of the radius"
 * instead of leaving the reader to infer an order that is not there.
 *
 * ── THE MIDDLE HAS TO BE OCCUPIED ───────────────────────────────────────────
 *
 * The absolute mapping rTarget(s) = rimInset*(1-s)^2 has one more consequence
 * that measurement caught and argument had not: on the owner's own sentence the
 * best score in the corpus is 0.381, so NOTHING is drawn inside r=0.246 and the
 * picture is a dark hole a quarter of the disc wide with a bright rim around
 * it. 365 of 2,204 films (16.6%) sit in the outermost 0.05. The brightest thing
 * on screen was the ring of films that did not answer, and the caption under it
 * said "distance from the centre is how well each one answers, nearest first".
 *
 * So the score is normalised against what the query can actually reach before
 * it becomes a radius. THE ORDER IS UNCHANGED — it is a monotone divide by one
 * constant — and the centre now holds the best answers the corpus has, which is
 * what the sentence above it says it holds. The absolute number does not
 * disappear: `matchBands().scoreMax` is what the readout prints as "the closest
 * anything gets is 0.38 of what you asked", which is the honest sentence, and
 * it is a sentence rather than a hole in the middle of the picture. An
 * impossible query still draws the shell — with every score 0 there is nothing
 * to normalise against, `scoreMax` is 0, and every target is the rim.
 *
 * ── THE CITATION ────────────────────────────────────────────────────────────
 *
 * `measure-match-layout.js` was cited three times by this header and did not
 * exist. It exists now, in pipeline/, and every number in this comment comes
 * out of it or out of .claude/skills/run-film-atlas/search-probe.mjs.
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

const MATCH_LAYOUT_VERSION = "match-radial-banded-v2";

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
  repulsion: "local",  /* "local" (grid, cutoff) or "bh" — see header          */
  repelCut: 2.6,       /* interaction cutoff, in k. ~21 neighbours at uniform  */
  theta: 0.9,          /* Barnes-Hut opening angle, only used by "bh"          */

  /* rTarget(s) = rimInset * (1 - s)^radialExp, in disc radii.
     radialExp is the analogue of layout-sky's restExp and it is convex for the
     same reason: a linear map wastes the middle of the canvas. Match scores do
     not reach 1 — the owner's five-ask sentence tops out at 0.381, because 1.0
     means "answered every clause at the corpus maximum" and almost nothing can.
     Convexity spends the canvas on the differences that exist rather than on
     the empty top of the scale. Swept in measure-match-layout.js: 2.0 is where
     centre-to-rim areal density stops improving and top-20 legibility starts to
     suffer. */
  radialExp: 2.0,
  rimInset: 0.985,     /* keeps the rim ring off the clip edge                 */

  /* THE SCORE IS NORMALISED AGAINST WHAT THIS QUERY CAN REACH. See THE MIDDLE
     HAS TO BE OCCUPIED in the header. `normalise:false` restores the absolute
     mapping; `scoreMax` overrides the divisor. */
  normalise: true,
  scoreMax: null,

  /* `bands:false` restores the v1 arrangement exactly — absolute score, no
     fence, rim wall only — so the comparison in measure-match-layout.js is a
     control that runs rather than a claim about a deleted version. */
  bands: true,

  /* Band packing — see THE TIE PROBLEM. bandPack is how much more annulus area
     a score group gets than its films strictly need at the solver's own k;
     measured, below ~1.6 the widest tie welds into a solid ring. */
  bandPack: 1.9,
  bandMin: 0.0035,     /* no band is thinner than this, in disc radii          */

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

/* Global Barnes-Hut repulsion, kept so the header's claim about it can be
   re-measured rather than taken on trust. Not the default: see the header. */
function repelBarnesHut(x, y, n, dx, dy, k2, P) {
  const T = buildTree(x, y, n);
  const stack = new Int32Array(4 * 30 + 8);
  for (let i = 0; i < n; i++) {
    let sp = 0;
    stack[sp++] = 0;
    let fx = 0, fy = 0;
    while (sp > 0) {
      const node = stack[--sp];
      const m = T.mass[node];
      if (m === 0) continue;
      const isLeaf = T.leaf[node] >= 0;
      if (isLeaf && T.leaf[node] === i) continue;
      let ddx = x[i] - T.comX[node];
      let ddy = y[i] - T.comY[node];
      let d2 = ddx * ddx + ddy * ddy;
      if (isLeaf || T.bw[node] * T.bw[node] < P.theta * P.theta * d2) {
        if (d2 < 1e-14) {
          const h = ((i * 2654435761) >>> 0) / 4294967296 * Math.PI * 2;
          ddx = Math.cos(h) * 1e-7; ddy = Math.sin(h) * 1e-7; d2 = 1e-14;
        }
        const d = Math.sqrt(d2);
        const f = P.repel * k2 * m / d;
        fx += (ddx / d) * f; fy += (ddy / d) * f;
      } else {
        for (let q = 0; q < 4; q++) {
          const c = T.childBase[node * 4 + q];
          if (c >= 0 && sp < stack.length) stack[sp++] = c;
        }
      }
    }
    dx[i] += fx; dy[i] += fy;
  }
}

/* ── the bands: one annulus per distinct score, laid out in score order ───────

   This is the fence the first version did not have. `matchBands` is a PURE
   function of (scores, opts) — no relaxation, no randomness — so the interface
   can ask for the same table the solver used and quote it in words.

   Returned:
     scoreMax   the best score in this query, BEFORE normalisation. This is the
                number the readout owes the reader: "the closest anything gets".
     normalised whether the radius was divided by it
     groups     [{ score, n, lo, hi }] in score order, radii in disc radii
     widest     the largest band that holds more than one film, and its count —
                i.e. how far apart the picture draws films it refuses to order.  */
function matchBands(scores, opts) {
  const P = Object.assign({}, DEFAULTS, opts || {});
  const keys = Object.keys(scores);
  const n = keys.length;
  if (!n) return { scoreMax: 0, normalised: false, div: 1, groups: [], widest: null, index: {} };

  const val = new Float64Array(n);
  let sMax = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, scores[keys[i]] || 0));
    val[i] = v;
    if (v > sMax) sMax = v;
  }
  /* Divide by what the query can reach, not by 1. A monotone divide by one
     constant cannot reorder anything; it decides only whether the best answer
     is drawn in the middle of the picture that describes it as the middle. */
  const div = P.scoreMax !== null && P.scoreMax !== undefined
    ? Math.max(0, Math.min(1, P.scoreMax))
    : (P.normalise ? sMax : 1);

  const count = new Map();
  for (let i = 0; i < n; i++) count.set(val[i], (count.get(val[i]) || 0) + 1);
  const vals = [...count.keys()].sort((a, b) => b - a);
  const G = vals.length;

  /* Where each group WANTS to be, on the same convex map as before. */
  const t = vals.map((v) => P.rimInset * Math.pow(1 - (div > 0 ? Math.min(1, v / div) : 0), P.radialExp));

  /* The desired edges: halfway between neighbouring targets, which is the hard
     projection this file used to draw. Everything below only widens them. */
  const want = new Array(G);
  {
    let prev = 0;
    for (let g = 0; g < G; g++) {
      const next = g === G - 1 ? P.rimInset : (t[g] + t[g + 1]) / 2;
      want[g] = Math.max(0, next - prev);
      prev = next;
    }
  }

  /* HOW MUCH ROOM A TIE ACTUALLY NEEDS, from the same k the repulsion uses.
     An annulus between disc radii r0 and r1 has world area (pi/4)(r1^2-r0^2),
     and a film occupies about k^2; bandPack is the slack over shoulder-to-
     shoulder. Two passes, because the area a band needs depends on how far out
     it ended up and that is what is being solved for. */
  const k2 = 1 / Math.max(1, n);
  const width = want.slice();
  for (let pass = 0; pass < 2; pass++) {
    const need = new Array(G);
    let sumNeed = 0, sumWant = 0;
    let at = 0;
    for (let g = 0; g < G; g++) {
      const mid = Math.max(1e-3, at + width[g] / 2);
      at += width[g];
      need[g] = Math.max(P.bandMin, (2 * count.get(vals[g]) * P.bandPack * k2) / (Math.PI * mid));
      sumNeed += need[g];
      sumWant += want[g];
    }
    if (sumNeed >= P.rimInset) {
      /* The disc is full: every band is squeezed by the same factor, so the
         ORDER survives even when the room does not. */
      const f = P.rimInset / sumNeed;
      for (let g = 0; g < G; g++) width[g] = need[g] * f;
    } else {
      const slack = P.rimInset - sumNeed;
      for (let g = 0; g < G; g++) {
        width[g] = need[g] + slack * (sumWant > 0 ? want[g] / sumWant : 1 / G);
      }
    }
  }

  const lo = new Array(G), hi = new Array(G);
  {
    let at = 0;
    for (let g = 0; g < G; g++) { lo[g] = at; at += width[g]; hi[g] = at; }
    /* Rounding drift over ~1,900 groups must not push the last band past the
       rim, because the rim is a wall the solver enforces separately. */
    hi[G - 1] = Math.min(hi[G - 1], P.rimInset);
  }

  const index = new Map(vals.map((v, g) => [v, g]));
  const groups = vals.map((v, g) => ({ score: v, n: count.get(v), lo: lo[g], hi: hi[g], target: t[g] }));
  let widest = null;
  for (const g of groups) if (g.n > 1 && (!widest || g.hi - g.lo > widest.hi - widest.lo)) widest = g;

  return { scoreMax: sMax, normalised: div !== 1 && P.normalise, div, groups, widest, index, vals, lo, hi, t };
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
  const bLo = new Float64Array(n), bHi = new Float64Array(n);
  const dx = new Float64Array(n), dy = new Float64Array(n);

  /* THE FENCE. One band per distinct score, in score order — see the header.
     Nothing below may move a film out of its own band, so "a better answer is
     drawn nearer" is a property of the arrangement rather than of the outcome. */
  const B = P.bands === false ? null : matchBands(scores, P);

  for (let i = 0; i < n; i++) {
    const s = Math.max(0, Math.min(1, scores[keys[i]] || 0));
    const g = B ? B.index.get(s) : undefined;
    const lo = g === undefined ? 0 : B.lo[g];
    const hi = g === undefined ? P.rimInset : B.hi[g];
    bLo[i] = lo; bHi[i] = hi;
    /* The spring still pulls to the score's own target; the band only says how
       far the crowd may carry it away from that. A band narrower than its
       target's distance from it simply pins the target to the near edge. */
    const pad = Math.min((hi - lo) * 0.5, 1e-4);
    const t = g === undefined ? P.rimInset * Math.pow(1 - s, P.radialExp) : B.t[g];
    rT[i] = Math.min(hi - pad, Math.max(lo + pad, t));
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

  /* Grid scratch, allocated ONCE. Rebuilding these per iteration is what made
     the first draft cost 5 ms an iteration: at 90 iterations that is 90 rounds
     of multi-megabyte allocation, and it is pure overhead — the arrays are
     overwritten every pass anyway. */
  const cut = P.repelCut * k;
  const gN = Math.max(1, Math.ceil(1.4 / cut));      /* the disc lives in [0,1] */
  const cellSize = 1.4 / gN;
  const cellStart = new Int32Array(gN * gN + 1);
  const cellCount = new Int32Array(gN * gN);
  const order = new Int32Array(n);
  const cellOf = new Int32Array(n);

  for (let iter = 0; iter < P.iterations; iter++) {
    dx.fill(0); dy.fill(0);

    if (P.repulsion === "bh") {
      repelBarnesHut(x, y, n, dx, dy, k2, P);
    } else {
      /* ── short-range repulsion over a uniform grid ──
         Counting sort into cells, then each film against the 3x3 block. The
         cutoff is `cut`, so the 3x3 block is exhaustive: nothing within range is
         missed, which is the property that made the lattice wrong in
         layout-sky.js and is harmless here (see header). */
      cellCount.fill(0);
      for (let i = 0; i < n; i++) {
        let cx = ((x[i] + 0.2) / cellSize) | 0;
        let cy = ((y[i] + 0.2) / cellSize) | 0;
        if (cx < 0) cx = 0; else if (cx >= gN) cx = gN - 1;
        if (cy < 0) cy = 0; else if (cy >= gN) cy = gN - 1;
        const c = cy * gN + cx;
        cellOf[i] = c;
        cellCount[c]++;
      }
      let acc = 0;
      for (let c = 0; c < gN * gN; c++) { cellStart[c] = acc; acc += cellCount[c]; }
      cellStart[gN * gN] = acc;
      const fill = cellStart.slice(0, gN * gN);
      for (let i = 0; i < n; i++) order[fill[cellOf[i]]++] = i;

      const cut2 = cut * cut;
      for (let i = 0; i < n; i++) {
        const c = cellOf[i];
        const cx = c % gN, cy = (c / gN) | 0;
        let fx = 0, fy = 0;
        const xi = x[i], yi = y[i];
        for (let b = -1; b <= 1; b++) {
          const ry = cy + b;
          if (ry < 0 || ry >= gN) continue;
          for (let a = -1; a <= 1; a++) {
            const rx = cx + a;
            if (rx < 0 || rx >= gN) continue;
            const cc = ry * gN + rx;
            const s0 = cellStart[cc], s1 = cellStart[cc + 1];
            for (let t = s0; t < s1; t++) {
              const j = order[t];
              if (j === i) continue;
              let ddx = xi - x[j], ddy = yi - y[j];
              let d2 = ddx * ddx + ddy * ddy;
              if (d2 > cut2) continue;
              if (d2 < 1e-14) {
                /* coincident films: separate on a hash of the two indices, never
                   on the RNG, so the nudge is identical on every run */
                const h = (((i * 2654435761) ^ (j * 40503)) >>> 0) / 4294967296 * Math.PI * 2;
                ddx = Math.cos(h) * 1e-7; ddy = Math.sin(h) * 1e-7;
                d2 = 1e-14;
              }
              const d = Math.sqrt(d2);
              const f = P.repel * k2 / d;
              fx += (ddx / d) * f;
              fy += (ddy / d) * f;
            }
          }
        }
        dx[i] += fx; dy[i] += fy;
      }
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
      /* THE BAND IS A WALL ON BOTH SIDES, and the rim is the outer wall of the
         outermost band. Reflecting rather than clamping stops a crowd welding
         itself into a one-film-thick circle, which is what a clamp produces;
         the reflection is bounded by the far edge so a band narrower than the
         overshoot cannot bounce a film out through its other side. */
      const ox = x[i] - 0.5, oy = y[i] - 0.5;
      const r = Math.hypot(ox, oy) * 2;
      let want = r;
      if (r > bHi[i]) want = Math.max(bLo[i], 2 * bHi[i] - r);
      else if (r < bLo[i]) want = Math.min(bHi[i], 2 * bLo[i] - r);
      if (want > P.rimInset) want = P.rimInset;
      if (want !== r) {
        if (r < 1e-9) {
          /* exactly on the centre with a band that excludes it: leave along the
             film's own bearing, deterministically */
          const a = bearings[keys[i]] === undefined ? hashAngle(keys[i]) : bearings[keys[i]];
          x[i] = 0.5 + 0.5 * want * Math.cos(a);
          y[i] = 0.5 + 0.5 * want * Math.sin(a);
        } else {
          const back = want / r;
          x[i] = 0.5 + ox * back;
          y[i] = 0.5 + oy * back;
        }
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
   in value, and since v2 the radius is also relative to what the query could
   reach. Ask for the score. Pass `scoreMax` to get the mapping this query
   actually used. */
function targetRadius(score, opts) {
  const P = Object.assign({}, DEFAULTS, opts || {});
  const div = P.scoreMax !== null && P.scoreMax !== undefined
    ? Math.max(0, Math.min(1, P.scoreMax)) : 1;
  const s = Math.max(0, Math.min(1, score));
  const u = div > 0 ? Math.min(1, s / div) : 0;
  return P.rimInset * Math.pow(1 - u, P.radialExp);
}

module.exports = { layoutMatch, matchBands, skyBearings, hashAngle, targetRadius, DEFAULTS, MATCH_LAYOUT_VERSION };
