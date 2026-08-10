#!/usr/bin/env node
/* audit-fame-mechanism.js — WHY the fame numbers come out the way they do.
 *
 * audit.js finds something that reads as a contradiction on the incumbent's
 * side: its score correlates NEGATIVELY with pageviews across the whole corpus
 * (rho -0.35, comfortably inside the repo's own 0.45 gate) while the band of
 * films at the TOP of a match runs about 3x the corpus median in pageviews.
 * Both are true and they are not in tension — a correlation over 2,204 films is
 * dominated by the tail, and a reader only ever sees the head.
 *
 * A number without a mechanism is a coincidence, so this file tests the one
 * match.js's own comment names:
 *
 *   "well-known films are attributed more confidently, so they can match
 *    everything simply by being better described. That is a popularity
 *    gradient wearing a relevance score."
 *
 * Three measurements, in order:
 *   1. rho(attributes filled, pageviews)  — is the EVIDENCE base fame-shaped?
 *   2. rho(match score, attributes filled) — does the SCORER reward coverage?
 *   3. the control: recompute the head lift INSIDE the stratum where every film
 *      has all 59 attributes filled. If coverage is the whole route, the lift
 *      collapses to 1.0 there. Whatever survives is not explained by coverage.
 *
 * The dense side is carried through the same control as a reference line.
 * Writes out/rag-audit-fame-mechanism.json.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ps = require("../plot-source.js");
const { buildAtlasSide } = require("./atlas-side.js");
const { fame } = require("./fame.js");

const OUT = path.join(__dirname, "..", "out");
const R = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
const A = buildAtlasSide();
const F = fame();
const dump = R("rag-audit-atlas.json");
const D = R("rag-audit-dense.json");
const KEYS = dump.keys;

const table = A.matcher.table;
/* table.vocab is iterable but not an Array — spread it once rather than trust
   .length, which is undefined on it and would silently poison every count. */
const VOCAB_LIST = [...table.vocab];
const VOCAB = VOCAB_LIST.length;
const cov = Object.create(null);
for (const k of A.keys) {
  let n = 0;
  for (const v of VOCAB_LIST) { const x = table.value(k, v); if (x != null && !Number.isNaN(x)) n++; }
  cov[k] = n;
}

const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/* percentile bootstrap over QUERIES, not over films: the unit of variation here
   is which sentence was asked, and resampling films would report a confidence
   the design does not have. */
function bootMedian(vals, iters, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  for (let i = 0; i < iters; i++) {
    const d = [];
    for (let j = 0; j < vals.length; j++) d.push(vals[Math.floor(rnd() * vals.length)]);
    out.push(med(d));
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(iters * 0.025)], out[Math.floor(iters * 0.975)]];
}

const withViews = A.keys.filter((k) => F.views[k] !== undefined);
const rhoCovFame = ps.spearman(withViews.map((k) => cov[k]), withViews.map((k) => F.views[k]));

const readable = new Set(dump.runs.filter((r) => !r.refusal).map((r) => r.id));
const rhoScoreCov = dump.runs.filter((r) => readable.has(r.id)).map((run) => {
  const idx = new Map(KEYS.map((k, i) => [k, i]));
  return ps.spearman(withViews.map((k) => run.scores[idx.get(k)]), withViews.map((k) => cov[k]));
});

function bandLifts(runs, mask) {
  const out = [];
  for (const run of runs) {
    const idx = [];
    for (let i = 0; i < KEYS.length; i++) if (mask[i] && run.scores[i] !== -1) idx.push(i);
    if (idx.length < 50) continue;
    idx.sort((a, b) => run.scores[b] - run.scores[a] || KEYS[a].localeCompare(KEYS[b]));
    const cut = run.scores[idx[Math.min(10, idx.length) - 1]];
    const band = idx.filter((i) => run.scores[i] >= cut - 1e-12);
    const cm = med(idx.map((i) => F.views[KEYS[i]]).filter((v) => v !== undefined));
    const bm = med(band.map((i) => F.views[KEYS[i]]).filter((v) => v !== undefined));
    if (cm) out.push({ id: run.id, band: band.length, lift: bm / cm });
  }
  return out;
}

const strata = [];
for (const thr of [0, VOCAB]) {
  const mask = KEYS.map((k) => (cov[k] >= thr ? 1 : 0));
  const n = mask.reduce((a, b) => a + b, 0);
  const at = bandLifts(dump.runs.filter((r) => readable.has(r.id)), mask);
  const de = bandLifts(D.configs.article.runs.filter((r) => readable.has(r.id)), mask);
  strata.push({
    minAttributesFilled: thr, films: n,
    atlas: { medianBandLift: med(at.map((x) => x.lift)), ci95: bootMedian(at.map((x) => x.lift), 4000, 7), medianBand: med(at.map((x) => x.band)), queries: at.length },
    dense: { medianBandLift: med(de.map((x) => x.lift)), ci95: bootMedian(de.map((x) => x.lift), 4000, 7), queries: de.length },
  });
}

const covVals = Object.values(cov);
const out = {
  generated: new Date().toISOString(),
  vocabulary: VOCAB,
  coverage: {
    note: "attributes with a value in the consensus table, per film. Bimodal, not graded: " +
      covVals.filter((c) => c === VOCAB).length + " films have all " + VOCAB +
      " and the p25 film has " + covVals.slice().sort((a, b) => a - b)[Math.floor(covVals.length * 0.25)] + ".",
    mean: Math.round(mean(covVals) * 10) / 10,
    fullyCovered: covVals.filter((c) => c === VOCAB).length,
    films: covVals.length,
  },
  step1_evidenceIsFameShaped: { rho: Math.round(rhoCovFame * 10000) / 10000, n: withViews.length,
    reads: "rho(attributes filled, pageviews). Positive means the corpus knows more about famous films." },
  step2_scorerRewardsSparsity: { meanRho: Math.round(mean(rhoScoreCov) * 10000) / 10000,
    min: Math.min(...rhoScoreCov), max: Math.max(...rhoScoreCov), queries: rhoScoreCov.length,
    reads: "rho(match score, attributes filled). NEGATIVE: a film with few attributes clears a one-clause query trivially, which is where the whole-corpus anti-fame rho comes from." },
  step3_stratifiedControl: strata,
  conclusion: "The head lift falls from " + strata[0].atlas.medianBandLift.toFixed(2) + "x to " +
    strata[1].atlas.medianBandLift.toFixed(2) + "x once every film in the pool is equally well described. " +
    "Coverage is most of the route, not all of it.",
};
fs.writeFileSync(path.join(OUT, "rag-audit-fame-mechanism.json"), JSON.stringify(out, null, 1));

console.log("\n── WHY the incumbent's head is famous while its corpus rho is not ────────────");
console.log("  vocabulary " + VOCAB + " attributes; coverage is bimodal — " + out.coverage.fullyCovered +
  " films have all " + VOCAB + ", the p25 film has " + covVals.slice().sort((a, b) => a - b)[Math.floor(covVals.length * 0.25)] + ".");
console.log("  1. the evidence base IS fame-shaped   rho(attributes filled, pageviews) = " + rhoCovFame.toFixed(4));
console.log("  2. the scorer rewards SPARSITY        rho(score, attributes filled) = " + mean(rhoScoreCov).toFixed(4) +
  "  (range " + Math.min(...rhoScoreCov).toFixed(3) + ".." + Math.max(...rhoScoreCov).toFixed(3) + ")");
console.log("     -> that is where the negative whole-corpus fame rho comes from, and it is not a virtue:");
console.log("        a film we know nothing about satisfies a one-clause query by default.");
console.log("  3. the control — head lift inside a pool where every film is equally described:");
for (const s of strata) {
  console.log("     " + (s.minAttributesFilled ? "all " + VOCAB + " attributes filled" : "every film").padEnd(26) +
    String(s.films).padStart(5) + " films   atlas " + s.atlas.medianBandLift.toFixed(2) + "x " +
    "[" + s.atlas.ci95.map((v) => v.toFixed(2)).join(", ") + "]   dense " + s.dense.medianBandLift.toFixed(2) + "x " +
    "[" + s.dense.ci95.map((v) => v.toFixed(2)).join(", ") + "]");
}
console.log("  " + out.conclusion);
console.log("");
