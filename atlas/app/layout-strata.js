#!/usr/bin/env node
/* layout-strata.js — one baked constellation per stratum, so the atlas can
 * actually change shape when you narrow it.
 *
 *   const { strataLayouts, STRATA_LAYOUT_VERSION } = require("./layout-strata.js");
 *   const strata = strataLayouts(corpus, discovery);   // -> { "genre:drama": "<base64>" }
 *
 * ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
 *
 * Until now, narrowing the constellation DIMMED. Films kept their whole-atlas
 * positions and everything outside the selection dropped to 9% alpha. That was
 * a considered choice and the argument for it is still in template.html: a
 * film's place is the one thing the sky promises to a second person, and
 * re-solving for a subset trades that promise for a denser picture.
 *
 * The owner has overruled it, and they are right about what it costs. A
 * dimmed field is the same picture with most of it turned down; it does not
 * feel like the atlas has done anything. What they asked for is an atlas that
 * "evolves and changes under different criteria" — and a tradition deserves to
 * be seen as its OWN constellation, spread across the whole sky, not as
 * scattered survivors of a layout solved for two thousand other films.
 *
 * ── WHY THIS IS BAKED AND NOT SOLVED IN THE BROWSER ─────────────────────────
 *
 * The obvious implementation is to run layout-sky.js live on the filtered
 * subgraph. Measured on this corpus, on a desktop, with the real solver:
 *
 *     genre:experimental      22 films      28 ms
 *     genre:adventure        152 films      92 ms
 *     genre:thriller         336 films     284 ms
 *     country:Q30            794 films     855 ms
 *     genre:drama          1,552 films   1,864 ms
 *
 * A phone is 3-5x slower than that. So the most-used filter in the app would
 * freeze the page for the better part of ten seconds, EVERY TIME IT WAS
 * CLICKED — and the entire point of this feature is that people click it over
 * and over to see what configurations they can arrive at. The cost lands
 * exactly where the feature lives.
 *
 * Solving all 44 strata at build time costs 8.6 seconds ONCE and ships 40 KB.
 * That is the whole trade, and it is not close.
 *
 * It also keeps two things that would otherwise be lost:
 *
 *   DETERMINISM (AGENTS rule 7). layout() is seeded, and solving each stratum
 *   twice was verified to return byte-identical positions. So "the Japanese
 *   New Wave sits in a long arc" is a thing one person can say to another, the
 *   same way the whole-atlas layout already is. A live solve would be
 *   deterministic too — but only for a fixed subset, and it would still have to
 *   be re-earned on every machine.
 *
 *   CHOREOGRAPHY. When both endpoints are known before the animation starts,
 *   the transition is a TWEEN between two solved layouts: every film takes a
 *   clean path to a known destination and arrives when the others do. Watching
 *   a force simulation converge is not that. It is jitter — films twitching
 *   past each other, overshooting, settling at different times — which reads as
 *   the page struggling rather than as the atlas re-forming.
 *
 * ── WHICH STRATA GET BAKED, AND WHY THAT IS NOT A POPULARITY TEST ───────────
 *
 * A stratum is baked if it has at least MIN_FILMS films. That is a floor on
 * COVERAGE, not on fame: it exists because a force layout over eight nodes is
 * not a constellation, it is a scatter of eight dots, and re-forming into it
 * tells a reader nothing they could not see already. No film's position, and
 * no stratum's inclusion, depends on degree, popularity or how many claims a
 * film happens to carry — AGENTS rule 1 governs this file exactly as it
 * governs layout-sky.js, which does all the actual work here.
 *
 * Intersections (genre AND era AND mood) are deliberately NOT baked: there are
 * combinatorially many and they are small. Measured, genre x era and genre x
 * country intersections with 8+ films run median 31 films / 30 ms, p90 116 /
 * 76 ms, worst 518 / 498 ms. Those solve live inside a frame budget the single
 * strata never could. The app takes the baked path when exactly one value is
 * selected and the live path otherwise.
 *
 * ── THE WIRE FORMAT ─────────────────────────────────────────────────────────
 *
 * A stratum's positions are stored in its POSTING-LIST ORDER, so no keys are
 * needed on the wire — discovery.json already ships the posting list, and
 * discovery-contract.js sorts every one of them ascending. Coordinates are
 * quantised to 16 bits over [0,1] and base64'd.
 *
 * The precision is not a compromise. 1/65535 is 1.5e-5, and the closest two
 * films ever sit in a solved layout is on the order of 1/sqrt(n) — 0.014 for
 * the whole atlas, 0.054 for a 150-film stratum. Quantisation error is three
 * orders of magnitude below the nearest-neighbour distance, so no film moves a
 * pixel it would not otherwise have moved. Raw JSON arrays would be 6x larger
 * for that same 40 KB of information. */
"use strict";

const { layout, LAYOUT_ALGORITHM_VERSION, solverFingerprint } = require("./layout-sky.js");

/* v3 was bumped by hand when the weak rest length became a function of n
   (layout-sky.js, restWeakExp), which moved EVERY baked position in every
   stratum and register. The version is what tells a stale artifact's blobs
   apart from a current one's — see the --artifact cross-check in
   measure-layout.js, which prints a warning when they disagree.

   "Bump it whenever the solver's output moves" was the instruction this
   comment used to carry, and on 2026-08-09 the same commit that obeyed it here
   failed to obey it in layout-sky.js. So the instruction is now arithmetic:
   the version carries a fingerprint of the sky solver's own version — which is
   itself a fingerprint of its tuned constants — together with every knob this
   file adds. Retune either file and every baked blob is renamed, with nobody in
   the loop. The declaration itself sits below those knobs; see it there. */

/* Below this a re-form is a scatter, not a constellation. See the note above:
   a coverage floor, never a popularity one. */
const MIN_FILMS = 20;

/* Which facets can be re-formed into. `director` is a directory rather than a
   filter and `movement` is selectable:false (legacy-only provenance for 454
   films), so neither is offered in the interface and neither is baked — baking
   a layout for a control that does not exist is 900 KB of nothing. Derived
   strata are passed in separately by the caller. */
const BAKED_FACETS = ["genre", "country", "era"];

function quantise(positions, order) {
  const out = new Uint16Array(order.length * 2);
  for (let i = 0; i < order.length; i++) {
    const p = positions[order[i]];
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      throw new Error(`Stratum layout is missing a valid position for ${order[i]}`);
    }
    /* clamp before rounding: layout() normalises into [0,1] but a value of
       exactly 1 must land on 65535 rather than wrapping to 0. */
    out[i * 2] = Math.round(Math.min(1, Math.max(0, p[0])) * 65535);
    out[i * 2 + 1] = Math.round(Math.min(1, Math.max(0, p[1])) * 65535);
  }
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength).toString("base64");
}

/* THE CIRCULAR EDGE, AND WHY IT MUST NOT SHAPE THE PICTURE.
   Filter to Documentary and 81.2% of the surviving connections say some version
   of "both are documentaries." That was tolerable when narrowing only dimmed:
   a redundant line is clutter. It stopped being tolerable the moment narrowing
   started RE-FORMING the field, because now those edges are springs, and a
   spring whose entire content is the filter you just applied is a force with no
   information in it. The documentary constellation would be 81% positioned by
   the one fact every film in it shares.

   Measured across the 25 strata of 100+ films, before this exclusion:

       documentary  81.2%     fantasy      56.4%     historical  53.9%
       war          44.8%     2000-present 44.4%     1980-1999   41.1%
       Japan        33.1%     thriller     30.4%
       ALL LENSES   25.7% of surviving edges are made of the thing you filtered on

   So a stratum is solved WITHOUT the signals its own selection manufactures.
   The cost is much smaller than the saving, because these edges are mostly
   redundant — they sit on pairs already joined by something with content.
   Films left with no edge at all inside their stratum: 1-3% for every era and
   country lens, worst case 15% (fantasy, historical). Those films drift to the
   rim, which is the honest place for a film whose only tie to a tradition is
   belonging to it.

   Note this is a LAYOUT decision and not a corpus one. Nothing is deleted;
   these edges still exist, still ship, and still draw. They just do not get to
   vote on where a film sits inside a stratum they define. */
const CIRCULAR = {
  genre: new Set(["genre", "genreEra"]),
  country: new Set(["countryEra"]),
  era: new Set(["countryEra", "genreEra"]),
};

/* Declared HERE, below every constant it names, and reading them rather than
   restating them: a fingerprint over a copy of the inputs is a fingerprint that
   goes stale the first time somebody edits the original — which is the whole
   defect this mechanism exists to close, one level down. */
const STRATA_LAYOUT_VERSION = "atlas-strata-v4-" + solverFingerprint({
  sky: LAYOUT_ALGORITHM_VERSION,
  minFilms: MIN_FILMS,
  bakedFacets: BAKED_FACETS.join(","),
  circular: Object.keys(CIRCULAR).sort()
    .map((f) => f + ":" + [...CIRCULAR[f]].sort().join("|")).join(";"),
});

/* One stratum: solve over its own films and ONLY the edges with both ends
   inside it. An edge to a film that is not on screen must not pull anything —
   it would bend the constellation toward a film the reader cannot see, which
   is a force with no visible cause. */
function solveStratum(corpus, keys, circular) {
  const inside = new Set(keys);
  const films = {};
  for (const k of keys) films[k] = corpus.films[k];
  const all = corpus.edges.filter((e) => inside.has(e.a) && inside.has(e.b));
  const edges = circular && circular.size ? all.filter((e) => !circular.has(e.signal)) : all;
  return { positions: layout(films, edges), edges: edges.length, dropped: all.length - edges.length };
}

/* postingsByField: { field: { value: [filmOrderIndex, ...] } }. Pass extra
   derived strata here alongside the recorded facets; this file does not care
   which is which, and the caller is responsible for labelling them honestly in
   the interface. */
function strataLayouts(corpus, discovery, extraPostings, options) {
  const opts = Object.assign({ minFilms: MIN_FILMS, facets: BAKED_FACETS }, options || {});
  const keyAt = discovery.filmOrder.map((id) => discovery.keyByFilmId[id]);
  const sources = [];
  for (const field of opts.facets) {
    const post = discovery.facets.postings[field];
    if (post) sources.push([field, post]);
  }
  for (const [field, post] of Object.entries(extraPostings || {})) sources.push([field, post]);

  const strata = {};
  const report = [];
  for (const [field, post] of sources) {
    for (const [value, list] of Object.entries(post)) {
      if (list.length < opts.minFilms) continue;
      const keys = list.map((i) => keyAt[i]);
      if (keys.some((k) => !k || !corpus.films[k])) {
        throw new Error(`Stratum ${value} posts a film index that is not in the corpus`);
      }
      /* A derived stratum (mood, and whatever follows it) manufactures no
         record signal of its own, so it excludes nothing — CIRCULAR is keyed by
         field and an unknown field correctly yields undefined. */
      const { positions, edges, dropped } = solveStratum(corpus, keys, CIRCULAR[field]);
      strata[value] = quantise(positions, keys);
      report.push({ field, value, films: keys.length, edges, dropped });
    }
  }
  return { strata, report };
}

module.exports = { STRATA_LAYOUT_VERSION, MIN_FILMS, BAKED_FACETS, CIRCULAR, strataLayouts };
