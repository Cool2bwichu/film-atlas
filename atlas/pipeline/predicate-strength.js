#!/usr/bin/env node
/**
 * predicate-strength.js — the ONLY place a predicate edge's strength is computed.
 *
 * ═══ WHY THIS IS ITS OWN FILE ═══
 *
 * The proposal's one rule that must not break:
 *
 *     1. the predicate SELECTS the family      (co-occurrence — a hard filter)
 *     2. the fingerprint ORDERS it             (tonal distance — sort and tiebreak ONLY)
 *
 * A comment saying "do not use tonal distance here" is not an enforcement
 * mechanism; the prototype had exactly that comment and the temptation it
 * guards against is a one-line edit away in a file that also holds the
 * fingerprint table. So the scorer was moved OUT of that file.
 *
 * THIS MODULE HAS NO ACCESS TO A FINGERPRINT. It requires nothing, reads no
 * file, and receives no tonal argument. `static/fingerprints.json` is not in
 * scope and cannot be brought into scope without adding a `require` and a
 * parameter to an exported signature — two changes that are visible in a diff
 * and that `--selftest` in associate-predicates.js is written to catch.
 *
 * `scoreFamily()` additionally REJECTS any input carrying a tonal-looking key.
 * That is not paranoia about typos: the realistic failure is someone widening
 * the shared-tag object to carry the pair's distance "for the claim string" and
 * then reaching for it here because it is already sitting in the argument.
 *
 * ═══ THE RARITY TERM: surprise(), NOT idf ═══
 *
 * The prototype scored rarity as a normalised idf over the tagged population.
 * That silently re-tunes every time the corpus grows: idf's denominator is
 * log(N), so the same predicate held by the same share of films scores
 * differently at N=300 and N=2,204, and every threshold calibrated against it
 * moves underneath.
 *
 * `associate.js` already solved this for TMDB keywords and records why
 * (associate.js, "How unlikely is this overlap?"): compute the overlap two
 * films would be EXPECTED to have if they drew their tags independently from
 * this population, and report the Poisson tail probability of the overlap
 * actually observed. Expectation is computed FROM the population, so as films
 * are added the observed and the expected grow together and the number keeps
 * meaning the same thing. Measured there: a surprise threshold drifts 2.0x in
 * selectivity across subsampled corpora where a fixed count drifts 3.9x.
 *
 * This module is that same statistic, with predicates in place of keywords. It
 * follows associate.js in three specifics that were each fixed there for a
 * reason and would be re-broken by writing it fresh:
 *
 *   - lambda is the MEAN of the two conditionings, not one film's. Reading the
 *     expectation off `a` alone makes an edge's strength depend on which film
 *     the i<j loop called `a`, i.e. on corpus order. associate.js measured that
 *     as 334 of 353 keyword edges changing strength under a film-order reversal.
 *   - the per-tag term is (count - 1) / (N - 1): the chance the OTHER film
 *     carries this tag, excluding the film itself from its own expectation.
 *   - the tail is P(X >= observed), returned as -log10, so 3 means "about one
 *     pair in a thousand would do this by accident".
 *
 * ═══ WHAT COUNTS AS THE POPULATION ═══
 *
 * Rarity must be estimated on a population that was NOT assembled around the
 * situations being measured — the rarity trap the proposal records, and which
 * dropped Old Joy from 1st to 5th on the 8-film prototype. Callers pass
 * `counts` and `N`; this module does not choose them, and states the
 * requirement so a caller cannot claim it was not told.
 */

"use strict";

/* Keys that would mean a caller has smuggled tonal information in. Checked, not
   trusted: the failure mode is a well-meaning widening of the tag object. */
const FORBIDDEN_KEYS = /^(tonal|tonalDistance|fingerprint|axes|dread|cruelty|irony|ambiguity|fracture|distance)$/i;

function assertNoTonalInput(obj, where) {
  if (!obj || typeof obj !== "object") return;
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.test(k)) {
      throw new Error(
        `predicate-strength.js: refusing to score — "${k}" was passed in ${where}. ` +
        `Tonal distance orders the family; it never scores it. See the header.`
      );
    }
  }
}

/**
 * Expected overlap for one film's tag list, against a population.
 * @param {string[]} predicateIds
 * @param {Map<string,number>} counts  predicate id -> films in the population holding it
 * @param {number} N                   size of the population the counts were taken over
 */
function expectedOverlap(predicateIds, counts, N) {
  let lambda = 0;
  for (const id of predicateIds) lambda += ((counts.get(id) || 1) - 1) / Math.max(1, N - 1);
  return lambda;
}

/** -log10 P(X >= observed) for X ~ Poisson(lambda). */
function poissonTailLog10(lambda, observed) {
  if (observed <= 0) return 0;
  if (lambda <= 0) return 12;
  let cum = 0, term = Math.exp(-lambda);
  for (let i = 0; i < observed; i++) { cum += term; term *= lambda / (i + 1); }
  return -Math.log10(Math.max(1e-12, 1 - cum));
}

/* The band a surprise score is mapped onto. Mirrors associate.js's keyword
   edge (0.40 + min(1, s/6) * 0.34) so a predicate edge and a keyword edge of
   equal improbability arrive at the top-six contest on the same scale. That
   contest is phase 5's problem, not this file's, but picking a different band
   here would silently decide it. */
const BASE = 0.40, RANGE = 0.34, S_CAP = 6;

/* ═══ NO MODIFIER MAY OUT-LEVER THE MEASUREMENT ═══
 *
 * The prototype scored `rarity * centrality * roleFactor` with centrality used
 * raw. Carried over unchanged, that shape defeats the point of routing through
 * surprise(): the surprise band spans 0.40..0.74, a lever of 1.85x, while raw
 * centrality spans the tagger's observed 0.28..1.0, a lever of 3.6x. The
 * modifier then decides the ranking and the measurement decorates it.
 *
 * Measured on Banshees' own map before this bound was applied: its rarest
 * co-occurrence — `the-bond-ended-without-account`, held by 5 of 300 films,
 * two shared predicates, surprise 1.77 — ranked SEVENTH, below six edges on
 * `harm-answered-with-harm`, held by 31 of 300 at surprise 0.59-0.72. A 3x
 * more improbable overlap lost on a centrality difference of 0.50 vs 0.45.
 *
 * So centrality is bounded to [C_FLOOR, 1]: it still says a predicament
 * incidental to one film is an incidental bond, but it can no longer overturn
 * the rarity measurement. `leverage()` below states the rule as an arithmetic
 * check rather than a promise, and callers are expected to run it.
 *
 * This is a scoring change on top of the idf -> surprise change and it is
 * called out as one. It was not made to improve any particular film's map; the
 * over-band `harm-answered-with-harm` edges it demotes are a prevalence problem
 * that the 0.4-8% band cut has to solve, not a scoring problem. */
const C_FLOOR = 0.6;
const ROLE_BONUS = 1.15;

/** The multiplicative range each term can move a score over. */
function leverage() {
  return {
    surprise: (BASE + RANGE) / BASE,          // the measurement
    centrality: 1 / C_FLOOR,                  // modifier
    role: ROLE_BONUS,                         // modifier
  };
}

/** Throws if any modifier can move a score further than the measurement can. */
function assertLeverageOrder() {
  const l = leverage();
  for (const k of ["centrality", "role"]) {
    if (l[k] > l.surprise) {
      throw new Error(
        `predicate-strength.js: modifier "${k}" has leverage ${l[k].toFixed(2)}x against ` +
        `surprise's ${l.surprise.toFixed(2)}x. The modifier would decide the ranking and the ` +
        `measurement would decorate it. Tighten the modifier or widen the band deliberately.`
      );
    }
  }
  return l;
}

/**
 * Score one pair's shared-predicate family.
 *
 * @param {object} pair
 * @param {string[]} pair.aPredicates   ALL of film A's predicate ids (not just shared)
 * @param {string[]} pair.bPredicates   ALL of film B's predicate ids
 * @param {Array}    pair.shared        [{ predicate, aTag, bTag }] — the co-occurrences
 * @param {Map<string,number>} counts   population counts. MUST NOT be counted over a
 *                                      population assembled around these predicates.
 * @param {number} N                    population size the counts were taken over
 * @returns {object} { strength, surprise, lambda, lead, type, centrality, complementary }
 *
 * There is no tonal parameter. There is no fourth argument. Adding one is the
 * change this whole file exists to make expensive.
 */
function scoreFamily(pair, counts, N) {
  assertNoTonalInput(pair, "the pair object");
  for (const s of pair.shared) {
    assertNoTonalInput(s, `shared["${s.predicate}"]`);
    assertNoTonalInput(s.aTag, `shared["${s.predicate}"].aTag`);
    assertNoTonalInput(s.bTag, `shared["${s.predicate}"].bTag`);
  }

  const observed = pair.shared.length;
  if (!observed) return null;

  const lambda = (expectedOverlap(pair.aPredicates, counts, N) +
                  expectedOverlap(pair.bPredicates, counts, N)) / 2;
  const s = poissonTailLog10(lambda, observed);

  /* Which co-occurrence leads the claim: the rarest shared predicate in the
     population, tie-broken by how central it is to both films. Never by tonal
     proximity — that is the sort key one level up, and it is not here. */
  const lead = [...pair.shared].sort((x, y) => {
    const cx = counts.get(x.predicate) || 1, cy = counts.get(y.predicate) || 1;
    if (cx !== cy) return cx - cy;
    return Math.min(y.aTag.centrality, y.bTag.centrality) - Math.min(x.aTag.centrality, x.bTag.centrality);
  })[0];

  /* How much of each film the situation actually is. The weaker of the two
     holdings governs: a predicament central to one film and incidental to the
     other is an incidental bond. */
  const centrality = Math.min(lead.aTag.centrality, lead.bTag.centrality);

  /* Complementary roles — one severing, one severed — are a stronger bond than
     two films in the same seat. "both" is a declared Pass C answer meaning one
     figure stands on both sides; it is neither same-seat nor complementary, so
     it earns nothing rather than being counted as either. */
  const ra = lead.aTag.role, rb = lead.bTag.role;
  const complementary = !!(ra && rb && ra !== "both" && rb !== "both" && ra !== rb);
  const roleFactor = complementary ? ROLE_BONUS : 1.0;

  /* bounded so the modifier cannot out-lever the measurement — see above */
  const centralityFactor = C_FLOOR + (1 - C_FLOOR) * Math.max(0, Math.min(1, centrality));

  const strength = Math.min(0.95, (BASE + Math.min(1, s / S_CAP) * RANGE) * centralityFactor * roleFactor);

  return {
    strength: +strength.toFixed(4),
    centralityFactor: +centralityFactor.toFixed(4),
    surprise: +s.toFixed(3),
    lambda: +lambda.toFixed(4),
    lead,
    centrality,
    complementary,
    observed,
  };
}

module.exports = { scoreFamily, expectedOverlap, poissonTailLog10, leverage, assertLeverageOrder,
                   BASE, RANGE, S_CAP, C_FLOOR, ROLE_BONUS };
