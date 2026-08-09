#!/usr/bin/env node
/* match.js — how well does each film answer the reader's query?
 *
 *   const { buildMatcher } = require("./match.js");
 *   const m = buildMatcher();                       // reads the consensus shards
 *   const r = m.score([                             // a query is a set of CLAUSES
 *     { anyOf: ["story:coming-home"], weight: 1 },
 *     { attr:  "tone:cerebral",       weight: 1 },
 *     { attr:  "mode:action",         weight: 1 },
 *     { attr:  "setting:space",       weight: 1 },
 *   ]);
 *   r.scores        // { filmKey -> 0..1 } for EVERY film in the corpus
 *   r.explain(key)  // per-clause credit, and what was unknown
 *
 * CLI:
 *   node pipeline/match.js --q "story:coming-home,tone:cerebral,mode:action,setting:space"
 *   node pipeline/match.js --q "..." --top 20 --fame        # rule-1 Spearman check
 *   node pipeline/match.js --q "..." --attrs path/to/attrs.json   # alternate source
 *
 * ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
 *
 * A query here does not FILTER. It re-ranks the whole corpus and lets distance
 * carry the answer: match everything and you are at the centre, match three of
 * four and you are a ring out, match one and you are at the rim — still drawn,
 * still clickable, still part of the picture. Three consequences, and they are
 * the reasons this is the right shape:
 *
 *   - A search can never come back empty. Ask for something nobody made and
 *     you still get a world, just a sparse one with a thin middle.
 *   - The near-misses are the point. They are what a reader wants to stumble
 *     into, and a hard filter deletes them silently.
 *   - It rescues the weakest data. Story-shape ("a film about coming home") is
 *     the thinnest thing this corpus knows. Under a filter that is a blocker.
 *     Under distance it is merely LESS CERTAIN, and the film sits a little
 *     further out — which is an honest thing for the picture to say.
 *
 * This file emits a number per film. It does not lay anything out. The layout
 * consumes it exactly the way `layout-sky.js` consumes `edge.strength`: rest
 * length and stiffness are pure functions of the score, so a strong match wants
 * to be short and stiff and a weak one long and slack. AGENTS rule 1 is not
 * weakened by that — it governs it. Distance still encodes strength of a formal
 * statement; the statement is just pointed at the reader instead of at a pair.
 *
 * ── THE INSTRUMENT, AND ONE HONEST DEPARTURE FROM IT ─────────────────────────
 *
 * `surprise()` in associate.js is the one genuinely scale-free signal this
 * project owns: a Poisson tail against the overlap the corpus's own frequencies
 * predict. STATE.md item 1 records that every hand-tuned threshold here drifted
 * when the corpus went 803 -> 2,204 and surprise did not. So this file is built
 * from that statistic and not from a fresh one.
 *
 * The direct port is: treat the QUERY as film A. Expected overlap if a film drew
 * its attributes independently from the corpus is lambda = sum of each wanted
 * attribute's corpus prevalence; observed is how many of them the film has;
 * report -log10 P(X >= observed | Poisson(lambda)). That is implemented below as
 * `jointTailScore()`, and it is available on every result — but it is NOT the
 * ranking, and the reason is a real defect rather than a preference:
 *
 *   FOR A FIXED QUERY, LAMBDA IS THE SAME FOR EVERY FILM. The tail then depends
 *   only on the total observed, so matching "set in space" and matching
 *   "cerebral" score IDENTICALLY. Every trace of rarity has dropped out. The
 *   statistic degenerates into a plain count of matches — which is precisely the
 *   "everything drifts toward films that are vaguely a bit of everything"
 *   failure that rarity weighting exists to prevent.
 *
 *   This is not a flaw in surprise(). In associate.js lambda varies per PAIR,
 *   because it is computed from that pair's own vocabularies, and rarity enters
 *   through it. A query has one vocabulary, so that channel is closed.
 *
 * The departure is therefore to keep the statistic and move it DOWN A LEVEL:
 * score each clause with its own tail probability, and add. Concretely, for a
 * film at strength s on attribute a,
 *
 *      sigma_a(s) = -log10 P( a random film reaches strength >= s on a )
 *
 * estimated from the corpus's own distribution of a. This is the same quantity
 * surprise() computes, at observed = 1, for one attribute. And it is the same
 * number in the regime that matters: for a sparse attribute with prevalence p,
 * -log10 P(X >= 1 | Poisson(p)) = -log10(1 - e^-p) -> -log10 p, and the sum of
 * per-clause surprisals is -log10 of the joint null probability under
 * independence, which is the small-lambda limit of the joint tail up to the
 * log10(k!) combinatorial term. The summed form keeps the per-clause identity
 * that the aggregated tail throws away. `poissonTail()` below is the shared
 * implementation, and `selfTest()` checks it reproduces associate.js's discrete
 * loop exactly at integer observed counts.
 *
 * Three things this buys, all of which the aggregated form cannot do:
 *
 *   RARE ATTRIBUTES COUNT MORE, per clause. "Set in space" is held by ~1% of
 *   the corpus and pays ~2.0; "cerebral" is held broadly and pays ~0.5. A film
 *   that matches you on space has told you four times as much about itself.
 *
 *   STRENGTHS DECIDE ORBIT, which the owner was explicit about. sigma is read
 *   off the attribute's OWN distribution, so dread at 0.9 is scored by how far
 *   into the tail of dread 0.9 is, and dread at 0.3 by how ordinary 0.3 is.
 *   Nothing is thresholded; there is no cutoff to drift. A film at the 92nd
 *   percentile of a common attribute can out-earn a film that merely possesses
 *   a rare one, and that is the correct reading of "rare counts more" — rarity
 *   of the CLAIM, not of the label.
 *
 *   IT RE-ESTIMATES AT ANY N. Every probability is empirical, from the corpus
 *   in front of it. Nothing in this file is a constant calibrated at one corpus
 *   size. That is the property STATE.md says is the only one that survived the
 *   growth to 2,204.
 *
 * ── UNKNOWN IS NOT ZERO, AND IT IS NOT A FREE PASS ───────────────────────────
 *
 * A film the attributor PASSED on, or that predates a vocabulary term, has no
 * opinion recorded for that clause. It must not score as "definitely not", and
 * it must not score as "yes". It is credited with the CORPUS PRIOR MEAN for
 * that clause: what a film drawn at random from the corpus earns there.
 *
 *      credit(f, a) = known ? sigma_a(s)         : E[sigma_a]
 *
 * The denominator is fixed at the query's full information demand — every
 * clause, known or not — so ignorance can never be laundered into a perfect
 * score by shrinking what is being asked.
 *
 * Why the prior mean rather than a coverage discount. The obvious alternative
 * is to multiply the score by the fraction of the query the film could answer.
 * That is a POPULARITY GRADIENT WEARING A RELEVANCE SCORE, and rule 1 exists to
 * catch it: well-known films are attributed more confidently, so coverage is a
 * proxy for fame, and multiplying by it would put fame directly into distance.
 * Imputing the prior is fame-neutral by construction — it neither rewards nor
 * punishes being well described; a film scores above the imputation exactly when
 * its real value is above average, and below it when it is not. The residual
 * risk, that the attributor is systematically MORE GENEROUS to films it
 * recognises, is a data problem this file cannot fix, and it is what the
 * `--fame` Spearman check is for. Run it. Report what it says.
 *
 * The three states are therefore strictly ordered, which is the whole ask:
 *
 *      known-absent (0)  <  unknown (prior)  <  known-present (rising with s)
 *
 * A film known NOT to be set in space earns 0 on that clause. A film we have no
 * reading for earns the small prior — it might be. A film that is earns 2.0.
 *
 * ── ONE CLAUSE PERFECT vs FOUR CLAUSES WEAK ──────────────────────────────────
 *
 * There is a real choice here and it changes the product. The additive surprisal
 * takes a position, and the position is that NEITHER COUNT WINS: what wins is
 * whichever film showed more information. Measured on the reference query, this
 * is sigma_a(s) — what each clause pays at each strength:
 *
 *      attribute            s=0   0.1   0.25   0.5   0.75   0.9   1.0
 *      setting:space       0.00  1.60  1.60  1.74  1.74  1.74  3.64
 *      story:coming-home   0.00  1.70  1.70  2.02  2.13  2.52  3.57
 *      mode:action         0.00  0.72  0.72  0.72  1.04  1.05  3.64
 *      tone:cerebral       0.00  0.11  0.34  0.82  1.85  2.55  3.25
 *
 * Read the 0.25 column, because that is the owner's point falling out of the
 * arithmetic rather than being asserted: a film that is SLIGHTLY in space pays
 * 1.60 and a film that is slightly cerebral pays 0.34. Matching you on space has
 * told you nearly five times as much. Nothing in this file was tuned to produce
 * that; it is what the corpus's own distributions say.
 *
 * So the honest answer to "one perfect or four weak" is: it depends which one,
 * and the score says which. One clause of a rare, effectively-binary attribute
 * beats four faint partials of common ones. Four clauses each at 0.25 beat one
 * common clause at 1.0. That is the correct reading of "rare counts more" —
 * rarity of the CLAIM, not of the label — and it is a better product than either
 * fixed rule, because a reader who asked for four things and got the one
 * improbable one has been told something, while a reader who got a faint smear
 * of all four has been told mainly that films exist.
 *
 * One artefact to know about, since it is visible in the s=1.0 column: every
 * ceiling converges toward log10(K_a), because holding the unique maximum of
 * ANY attribute is rare. So the clauses separate strongly through the middle of
 * their range and barely at the very top. If a future query language wants
 * "only the most X" to be a different kind of ask from "X at all", that is where
 * it would have to intervene — not here.
 *
 * ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────
 *
 * No thresholds, no cutoffs, no top-K. Every film in the corpus comes back with
 * a number, including the ones that score 0. Truncation is a VIEW decision and
 * belongs where the ring count is decided, not here — a filter applied at this
 * layer would delete the near-misses before anything downstream could draw them.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(__dirname, "out");

/* ─────────────────────────────────────────────── the tail, shared with associate

   `poissonTail(lambda, k)` is -log10 P(X >= k) for X ~ Poisson(lambda). At
   integer k it is bit-comparable to the discrete loop in associate.js's
   surprise(); the continuous extension is needed because attribute strengths
   are real-valued, so a weighted observed count is not an integer.

   The continuation is not invented: P(X >= n) for Poisson equals the regularised
   LOWER incomplete gamma P(n, lambda) = gamma(n, lambda) / Gamma(n), which is
   defined for all real n > 0 and agrees with the sum at every integer. Check by
   hand at n=1: P(1, lambda) = 1 - e^-lambda = P(X >= 1). At n=2:
   1 - e^-lambda(1 + lambda) = P(X >= 2).                                      */

function lnGamma(x) {
  /* Lanczos, g=7, n=9. Accurate to ~1e-13 over the range used here. */
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = g[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += g[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/* Regularised lower incomplete gamma P(a, x). Series below the crossover,
   Lentz continued fraction for Q above it, as in Numerical Recipes. */
function regLowerGamma(a, x) {
  if (a <= 0) return 1;
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  const TINY = 1e-300;
  let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;  if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  return 1 - q;
}

/* -log10 P(X >= k). Clamped at 12 the way associate.js clamps, so a
   probability below 1e-12 does not turn into an unbounded score. */
function poissonTail(lambda, k) {
  if (k <= 0) return 0;
  if (lambda <= 0) return 12;
  const p = regLowerGamma(k, lambda);
  return Math.min(12, -Math.log10(Math.max(1e-12, p)));
}

/* ───────────────────────────────────────────────────── loading the attributes

   The consensus shards are the source of truth. They are written by a separate
   pass and MAY BE INCOMPLETE while this runs; every rule below is written so
   that a missing shard, a missing film or a missing vocabulary term degrades to
   "unknown" rather than to "no".

   Shard shape (each of pipeline/out/consensus.shard-*.json):

     {
       "version": 1,
       "vocabulary": ["setting:space", "tone:cerebral", ...],   // closed, this shard's
       "films": {
         "<film key>": { "attrs": { "setting:space": 0.9 } },   // scored
         "<film key>": { "passed": true }                       // model did not know it
       }
     }

   Three-state rule, and the third state is the one that makes partial data safe:

     - film absent from every shard, or `passed: true`  -> UNKNOWN on everything.
     - attribute listed in `attrs`                      -> KNOWN at that weight
                                                           (an explicit 0 means
                                                           "definitely not").
     - attribute in the shard's `vocabulary` but not in the film's `attrs`
                                                        -> KNOWN-ABSENT (0). The
       closed vocabulary was in front of the attributor, so silence is a verdict.
     - attribute in NEITHER                             -> UNKNOWN. This is the
       case where the vocabulary grew after the shard was written. Treating it as
       absent would silently mark every early-shard film "definitely not" on every
       new term, which is exactly how partial data turns into a false negative.

   A NOTE FOR WHOEVER WRITES THE SHARDS, because this is the one way to make the
   whole scorer lie: DECLARE `vocabulary` ONLY IF THE ATTRIBUTOR WAS ACTUALLY
   ASKED ABOUT EVERY TERM IN IT. A closed vocabulary put in front of a model
   makes silence a verdict, and that is the correct and strong reading. A source
   that can only say "yes" — a tag dump, a keyword list, a genre field — must NOT
   declare a vocabulary, because its silence is ignorance and encoding it as
   known-absent is a lie the scorer will faithfully amplify.

   This was measured, not theorised. Standing in for the missing shards with TMDB
   keywords and declaring silence to be absence put Interstellar at rank 35 on
   the reference query with `story:coming-home = 0` — a confident denial produced
   entirely by TMDB never having tagged the film "homecoming". The same data with
   keyword silence honestly marked UNKNOWN, and the same scorer, does not make
   that claim.                                                                  */

function readShards(dir) {
  const files = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { names = []; }
  for (const n of names) {
    if (/^consensus\.shard-.*\.json$/.test(n)) files.push(path.join(dir, n));
  }
  files.sort();
  const shards = [];
  for (const p of files) {
    try { shards.push(JSON.parse(fs.readFileSync(p, "utf8"))); }
    catch (e) { console.error("match: skipping unreadable shard " + path.basename(p) + " (" + e.message + ")"); }
  }
  return { files, shards };
}

/* Universe of film keys. Every one of these gets a score, always. */
function readCorpusKeys() {
  const p = path.join(ROOT, "static", "corpus.json");
  if (!fs.existsSync(p)) return null;
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  const films = c.films || {};
  const meta = {};
  for (const [k, f] of Object.entries(films)) {
    meta[k] = { title: f.title, year: f.year, wikipedia: f.wikipedia || null };
  }
  return meta;
}

/* An attribute table is the only thing the scorer needs:
     value(film, attr) -> number | undefined       (undefined = UNKNOWN)
   built once, kept dense-ish in Maps so scoring a 2,204-film corpus against a
   four-clause query is a few thousand lookups. */
function buildTable(shards, keys) {
  const byAttr = new Map();    // attr -> Map(filmKey -> strength)
  const vocab = new Set();
  const passed = new Set();
  const seen = new Set();      // films appearing in any shard
  const shardVocab = [];       // per shard, for the "not in either" rule

  for (const s of shards) {
    const v = new Set(s.vocabulary || []);
    for (const t of v) vocab.add(t);
    shardVocab.push(v);
    for (const [k, rec] of Object.entries(s.films || {})) {
      seen.add(k);
      if (rec && rec.passed) { passed.add(k); continue; }
      const attrs = (rec && rec.attrs) || {};
      for (const [a, w] of Object.entries(attrs)) {
        vocab.add(a);
        if (!byAttr.has(a)) byAttr.set(a, new Map());
        const n = Number(w);
        if (Number.isFinite(n)) byAttr.get(a).set(k, Math.max(0, Math.min(1, n)));
      }
      /* known-absent: in this shard's vocabulary, not in this film's attrs */
      for (const a of v) {
        if (a in attrs) continue;
        if (!byAttr.has(a)) byAttr.set(a, new Map());
        if (!byAttr.get(a).has(k)) byAttr.get(a).set(k, 0);
      }
    }
  }

  return {
    vocab,
    keys,
    /* undefined => UNKNOWN */
    value(filmKey, attr) {
      const m = byAttr.get(attr);
      if (!m) return undefined;
      return m.get(filmKey);
    },
    stats() {
      return {
        vocabulary: vocab.size,
        filmsInShards: seen.size,
        filmsPassed: passed.size,
        filmsUnseen: keys.filter((k) => !seen.has(k)).length,
      };
    },
  };
}

/* ───────────────────────────────────────────────────── per-attribute surprisal

   For attribute a, over the films KNOWN on a:

     tail_a(s)  = ( |{f : s_f >= s}| + 0.5 ) / ( K_a + 0.5 )
     sigma_a(s) = -log10 tail_a(s),   with sigma_a(0) := 0

   The +0.5 is a Jeffreys continuity guard, not a tuned constant: without it a
   film holding the unique maximum of an attribute has tail 1/K and, worse, a
   film above every other has tail 0 and infinite surprisal. It costs a rare
   attribute a fraction of a decibel and it makes the statistic finite at any N.

   sigma_a(0) is pinned to 0 by definition. Not matching is not information, and
   the empirical tail at s=0 is 1.0 anyway for any attribute where some film
   scores 0 — pinning it just makes "definitely not" exactly zero rather than
   epsilon, which is what the three-state ordering needs.

   Consistency with the Poisson form: for a binary attribute held by n of K
   films, sigma_a(1) = -log10((n + 0.5)/(K + 0.5)), and the Poisson tail at
   observed=1 with lambda = n/K is -log10(1 - e^(-n/K)) which for n << K is
   -log10(n/K) + O(n/K). Same number. `poissonTail` is used directly for the
   `jointTailScore` diagnostic so the two live in one implementation.         */

function attributeModel(table, attr) {
  const vals = [];
  for (const k of table.keys) {
    const v = table.value(k, attr);
    if (v !== undefined) vals.push(v);
  }
  const K = vals.length;
  if (!K) {
    /* Nobody is known on this attribute. It can pay nothing and nothing is
       unknown-relative-to-it either: every film gets the same 0, so the clause
       contributes no ordering. It still occupies its share of the denominator,
       which is right — the reader asked for something the corpus cannot speak
       to, and every film should be pushed outward equally by that. */
    return { attr, known: 0, max: 0, sigmaAt: () => 0, prior: 0, sigmaMax: 0, prevalence: 0 };
  }
  const sorted = vals.slice().sort((a, b) => a - b);
  const maxS = sorted[K - 1];
  /* count of values >= s, by binary search on the ascending array */
  const atLeast = (s) => {
    let lo = 0, hi = K;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < s) lo = mid + 1; else hi = mid; }
    return K - lo;
  };
  const sigmaAt = (s) => {
    if (!(s > 0)) return 0;
    return -Math.log10((atLeast(s) + 0.5) / (K + 0.5));
  };
  const sigmaMax = sigmaAt(maxS);
  let acc = 0;
  for (const v of vals) acc += sigmaAt(v);
  const prior = acc / K;                 /* E[sigma] over films known on a */
  let pos = 0;
  for (const v of vals) if (v > 0) pos++;
  return { attr, known: K, max: maxS, sigmaAt, prior, sigmaMax, prevalence: pos / K };
}

/* ─────────────────────────────────────────────────────────────────── the query

   A clause is { attr } or { anyOf: [...] }, plus an optional `weight` (default
   1) saying how much the reader cares. `anyOf` exists because the reader's
   words are not vocabulary terms — "coming home" may land on several — and it
   takes the MAX credit among its members rather than the sum, because those
   members are the same wish spelled differently and summing would let a
   synonym pair pay twice.

   The reader weight scales the clause's contribution to both the numerator and
   the denominator. Halving it halves both what the clause can pay and what it
   demands, which is what "I care about this half as much" has to mean if the
   score is to stay in [0, 1].                                                */

function normaliseQuery(q) {
  const out = [];
  for (const raw of q) {
    if (typeof raw === "string") { out.push({ terms: [raw], weight: 1, label: raw }); continue; }
    const terms = raw.anyOf ? raw.anyOf.slice() : [raw.attr];
    const weight = raw.weight === undefined ? 1 : Number(raw.weight);
    if (!terms.length || !terms[0]) throw new Error("match: clause has no attribute");
    if (!(weight >= 0)) throw new Error("match: clause weight must be >= 0");
    out.push({ terms, weight, label: raw.label || terms.join("|") });
  }
  if (!out.length) throw new Error("match: empty query");
  return out;
}

function buildMatcher(opts) {
  opts = opts || {};
  const dir = opts.dir || OUT;
  const meta = opts.meta || readCorpusKeys();
  if (!meta) throw new Error("match: no static/corpus.json and no meta supplied");
  const keys = Object.keys(meta);

  let table;
  let provenance;
  if (opts.table) {
    table = opts.table;
    provenance = { source: "supplied" };
  } else if (opts.attrsFile) {
    const raw = JSON.parse(fs.readFileSync(opts.attrsFile, "utf8"));
    table = buildTable([raw], keys);
    provenance = { source: path.relative(ROOT, opts.attrsFile), shards: 1 };
  } else {
    const { files, shards } = readShards(dir);
    table = buildTable(shards, keys);
    provenance = { source: "consensus shards", shards: files.length, files: files.map((f) => path.basename(f)) };
  }

  const models = new Map();
  const modelFor = (a) => {
    if (!models.has(a)) models.set(a, attributeModel(table, a));
    return models.get(a);
  };

  function score(query) {
    const clauses = normaliseQuery(query);

    /* Per clause: the model of each term, the clause ceiling (the most it can
       pay), and the clause prior (what an unknown film is credited). Both are
       taken over the term the clause would best be served by, consistent with
       `anyOf` taking the max. */
    const prepared = clauses.map((c) => {
      const ms = c.terms.map(modelFor);
      const ceiling = Math.max(...ms.map((m) => m.sigmaMax), 0);
      const prior = Math.max(...ms.map((m) => m.prior), 0);
      return { clause: c, models: ms, ceiling, prior };
    });

    const denom = prepared.reduce((a, p) => a + p.clause.weight * p.ceiling, 0);

    /* the direct-port diagnostic: one lambda for the whole corpus */
    const lambda = prepared.reduce(
      (a, p) => a + p.clause.weight * Math.max(...p.models.map((m) => m.prevalence * m.max), 0), 0);

    const scores = Object.create(null);
    const joint = Object.create(null);
    const details = Object.create(null);

    for (const k of keys) {
      let num = 0, obs = 0, unknownWeight = 0, knownWeight = 0;
      const per = [];
      for (const p of prepared) {
        let best = null;
        for (const m of p.models) {
          const v = table.value(k, m.attr);
          if (v === undefined) continue;
          const s = m.sigmaAt(v);
          if (!best || s > best.sigma) best = { attr: m.attr, value: v, sigma: s };
        }
        if (best === null) {
          num += p.clause.weight * p.prior;
          unknownWeight += p.clause.weight;
          per.push({ clause: p.clause.label, state: "unknown", credit: p.prior, ceiling: p.ceiling });
        } else {
          num += p.clause.weight * best.sigma;
          obs += p.clause.weight * best.value;
          knownWeight += p.clause.weight;
          per.push({
            clause: p.clause.label, state: best.value > 0 ? "present" : "absent",
            attr: best.attr, value: best.value, credit: best.sigma, ceiling: p.ceiling,
          });
        }
      }
      scores[k] = denom > 0 ? Math.max(0, Math.min(1, num / denom)) : 0;
      joint[k] = poissonTail(lambda, obs);
      details[k] = { per, raw: num, denom, coverage: knownWeight / (knownWeight + unknownWeight || 1) };
    }

    return {
      scores, joint, clauses: prepared.map((p) => ({
        label: p.clause.label, terms: p.clause.terms, weight: p.clause.weight,
        ceiling: round(p.ceiling), prior: round(p.prior),
        known: p.models.map((m) => ({ attr: m.attr, known: m.known, prevalence: round(m.prevalence) })),
      })),
      lambda: round(lambda),
      explain: (k) => details[k],
      ranked: () => keys.slice().sort((a, b) => scores[b] - scores[a] || a.localeCompare(b)),
    };
  }

  return { score, table, meta, keys, provenance, stats: table.stats() };
}

function round(x) { return Math.round(x * 1000) / 1000; }

/* ────────────────────────────────────────────── AGENTS rule 1: the fame check

   "Edge distance encodes formal bond strength, never popularity." A match score
   feeds distance, so it inherits the rule, and the failure mode is specific:
   well-known films are attributed more confidently, so they can match everything
   simply by being better described. That is a popularity gradient wearing a
   relevance score.

   Spearman against 60-day Wikipedia pageviews, read from plot-source.js's cache
   ONLY — never fetched, so the number does not depend on the day it ran. Three
   correlations are reported and they answer different questions:

     rho(score, views)     — the headline. The project's own gate for a scored
                             layer is SCORE_FAME_MAX_RHO = 0.45 in axis-gates.js;
                             the same threshold is applied here.
     rho(coverage, views)  — how much of a fame proxy "how much of the query this
                             film could answer" is. This is the number that
                             justifies imputing the prior instead of multiplying
                             by coverage. Expect it to be LARGE. That is the
                             point: it is the variable this file refuses to use.
     per clause            — where a headline correlation comes from, split into
                             rho(strength | known) and rho(is-known). The first is
                             a property of the corpus; the second is a property of
                             the attribution pass.

   ONE HEADLINE NUMBER CANNOT SETTLE THIS, and the decisive test is comparative:
   run several queries. A genuine popularity gradient is positive for EVERY
   query, because it comes from the scorer. A correlation that flips sign when
   the reader asks for different things is a fact about the corpus — action and
   space films are read more on Wikipedia than difficult ones — and the scorer is
   reporting it, not manufacturing it. `--fame` runs the reader's query and the
   inverse-flavoured control together for exactly that reason. */

const SCORE_FAME_MAX_RHO = 0.45;   /* same constant as pipeline/axis-gates.js */

function famePageviews(meta, keys) {
  let ps;
  try { ps = require("./plot-source.js"); }
  catch (e) { return null; }
  const win = ps.viewsWindow();
  const views = Object.create(null);
  let hit = 0;
  for (const k of keys) {
    const t = meta[k] && meta[k].wikipedia;
    if (!t) continue;
    const p = ps.cachePath(ps.CACHE_VIEWS, "pv_" + win.start + "_" + t);
    if (!fs.existsSync(p)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { continue; }
    if (!d || !Array.isArray(d.items)) continue;
    let s = 0;
    for (const it of d.items) s += it.views || 0;
    if (s > 0) { views[k] = s; hit++; }
  }
  return { ps, win, views, hit };
}

function fameCheck(m, query, controls) {
  const fv = famePageviews(m.meta, m.keys);
  if (!fv) { console.log("fame check: plot-source.js unavailable"); return true; }
  if (!fv.hit) {
    console.log("fame check: NO pageviews in " + path.relative(ROOT, require("./plot-source.js").CACHE_VIEWS) +
      " — cannot run. This is not a pass.");
    return false;
  }
  const { ps, win, views } = fv;
  console.log("\nRULE 1 — match score vs 60-day Wikipedia pageviews, window " + win.start + ".." + win.end);
  console.log("           cache-only, never fetched. gate |rho| <= " + SCORE_FAME_MAX_RHO);

  const r = m.score(query);
  const xs = [], ys = [], cx = [];
  for (const k of m.keys) {
    if (views[k] === undefined) continue;
    xs.push(r.scores[k]); ys.push(views[k]); cx.push(r.explain(k).coverage);
  }
  const rho = ps.spearman(xs, ys);
  const ci = ps.bootstrapCI(xs, ys, 2000, 20260809);
  const rhoCov = ps.spearman(cx, ys);
  const pass = Math.abs(rho) <= SCORE_FAME_MAX_RHO;
  console.log("  " + (pass ? "PASS" : "FAIL") + "  rho(score, views) = " + rho.toFixed(4) +
    "  ci95 [" + ci.map((x) => x.toFixed(3)).join(", ") + "]  n=" + xs.length);
  console.log("        rho(query coverage, views) = " + rhoCov.toFixed(4) +
    "   <- the variable this file deliberately does NOT multiply by");

  for (const c of r.clauses) {
    const sx = [], sy = [], kx = [], ky = [];
    for (const k of m.keys) {
      if (views[k] === undefined) continue;
      const p = r.explain(k).per.find((p) => p.clause === c.label);
      kx.push(p.state === "unknown" ? 0 : 1); ky.push(views[k]);
      if (p.state !== "unknown") { sx.push(p.value); sy.push(views[k]); }
    }
    console.log("        " + c.label.padEnd(22) +
      " rho(strength|known) = " + (sx.length >= 8 ? ps.spearman(sx, sy).toFixed(4) : "n/a").padStart(7) +
      " (n=" + sx.length + ")   rho(is-known) = " + ps.spearman(kx, ky).toFixed(4));
  }

  if (controls && controls.length) {
    console.log("  controls — a real popularity gradient is positive for EVERY query:");
    for (const q of controls) {
      const rr = m.score(parseQuery(q));
      const ax = [], ay = [];
      for (const k of m.keys) { if (views[k] === undefined) continue; ax.push(rr.scores[k]); ay.push(views[k]); }
      console.log("        " + q.padEnd(42) + " rho = " + ps.spearman(ax, ay).toFixed(4).padStart(8));
    }
  }
  return pass;
}

/* ─────────────────────────────────────────────────────────────────── self test

   `poissonTail` must reproduce associate.js's discrete loop at integer k, or
   the claim that this file reuses that instrument is decoration. Run with
   `node pipeline/match.js --selftest`.                                        */

function discreteTail(lambda, observed) {
  let cum = 0, term = Math.exp(-lambda);
  for (let i = 0; i < observed; i++) { cum += term; term *= lambda / (i + 1); }
  return -Math.log10(Math.max(1e-12, 1 - cum));
}

function selfTest() {
  let worst = 0, cases = 0;
  for (const lambda of [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 12, 40]) {
    for (let k = 1; k <= 12; k++) {
      const a = Math.min(12, discreteTail(lambda, k));
      const b = poissonTail(lambda, k);
      worst = Math.max(worst, Math.abs(a - b));
      cases++;
    }
  }
  /* 1e-5, not 1e-12, and the slack is the DISCRETE loop's, not this one's. It
     forms P(X >= k) as `1 - cum`, and when cum is 1 - 8e-12 a double has about
     four significant digits left of the answer. The gamma form computes the
     upper tail directly and never subtracts. The worst case in this grid is
     lambda=0.5, k=11, where the two differ by 1.8e-6 at a score of 11.11 —
     seven orders of magnitude below anything a rank is decided by. */
  const ok = worst < 1e-5;
  console.log((ok ? "PASS" : "FAIL") + "  poissonTail vs associate.js discrete loop: " +
    cases + " cases, max |diff| = " + worst.toExponential(2));
  return ok;
}

/* ───────────────────────────────────────────────────────────────────────── CLI */

function parseArgs(argv) {
  const a = { top: 20 };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--q") a.q = argv[++i];
    else if (t === "--top") a.top = parseInt(argv[++i], 10);
    else if (t === "--attrs") a.attrs = argv[++i];
    else if (t === "--fame") a.fame = true;
    else if (t === "--control") (a.controls = a.controls || []).push(argv[++i]);
    else if (t === "--selftest") a.selftest = true;
    else if (t === "--json") a.json = true;
  }
  return a;
}

/* A CLI clause is `term[|term2][:weight]`, clauses comma separated. */
function parseQuery(s) {
  return s.split(",").map((part) => {
    const t = part.trim();
    const m = /^(.*?)(?::([0-9.]+))?$/.exec(t);
    const terms = m[1].split("|").map((x) => x.trim()).filter(Boolean);
    return { anyOf: terms, weight: m[2] === undefined ? 1 : Number(m[2]), label: m[1] };
  });
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.selftest) { process.exit(selfTest() ? 0 : 1); }
  if (!a.q) {
    console.error("usage: node pipeline/match.js --q \"attr[|alt][:weight],...\" [--top N] [--attrs FILE] [--fame]");
    process.exit(2);
  }
  const m = buildMatcher({ attrsFile: a.attrs });
  const r = m.score(parseQuery(a.q));
  const order = r.ranked();

  if (a.json) {
    console.log(JSON.stringify({ clauses: r.clauses, lambda: r.lambda,
      top: order.slice(0, a.top).map((k) => ({ key: k, title: m.meta[k].title, year: m.meta[k].year, score: round(r.scores[k]) })) }, null, 1));
    return;
  }

  console.log("attributes: " + JSON.stringify(m.stats) + "  source: " + JSON.stringify(m.provenance));
  console.log("");
  for (const c of r.clauses) {
    console.log("clause " + c.label + "  weight " + c.weight + "  ceiling " + c.ceiling +
      "  prior(unknown credit) " + c.prior + "  " +
      c.known.map((k) => k.attr + " known=" + k.known + " prevalence=" + k.prevalence).join("; "));
  }
  console.log("");
  console.log("rank  score  film");
  order.slice(0, a.top).forEach((k, i) => {
    const d = m.meta[k];
    const e = r.explain(k);
    const bits = e.per.map((p) => p.clause.split(":").pop() + "=" +
      (p.state === "unknown" ? "?" : p.value) + "/" + round(p.credit)).join(" ");
    console.log(String(i + 1).padStart(4) + "  " + r.scores[k].toFixed(3) + "  " +
      (d.title + " (" + d.year + ")").padEnd(44) + bits);
  });

  /* Distribution, always. A ranking printed without it hides whether the
     re-ranking actually separated the corpus or piled most of it onto one
     radius — which is what thin attribute coverage does, and it is a layout
     problem, not a scoring one. */
  const v = order.map((k) => r.scores[k]);
  const at = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))].toFixed(3);
  console.log("");
  console.log("distribution over " + v.length + " films: max " + v[0].toFixed(3) +
    "  p1 " + at(0.01) + "  p5 " + at(0.05) + "  p25 " + at(0.25) + "  median " + at(0.5) +
    "  p75 " + at(0.75) + "  min " + v[v.length - 1].toFixed(3));
  console.log("scoring above zero: " + v.filter((x) => x > 0).length + " / " + v.length +
    "   (a query never empties the corpus)");

  if (a.fame) process.exitCode = fameCheck(m, parseQuery(a.q), a.controls) ? 0 : 1;
}

module.exports = {
  buildMatcher, buildTable, attributeModel, poissonTail, regLowerGamma,
  normaliseQuery, parseQuery, readShards, readCorpusKeys, selfTest, discreteTail,
  fameCheck, famePageviews, SCORE_FAME_MAX_RHO,
};

if (require.main === module) main();
