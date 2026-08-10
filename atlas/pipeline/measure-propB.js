#!/usr/bin/env node
/* measure-propB.js — no model calls. Turns the tags into the deliverable and
 * measures it honestly.
 *
 *   node pipeline/measure-propB.js
 *
 * Writes pipeline/out/predicates-propB.json and prints the report.
 *
 * WHAT IS MEASURED AND WHY EACH ONE IS HERE
 *
 * 1. COVERAGE, split seen/held-out. The vocabulary was induced from a
 *    deterministic 2/3 of the predicaments. If the "none of these" rate on the
 *    held-out third is much worse than on the induction sample, the vocabulary
 *    describes its own sample rather than the corpus.
 * 2. PREVALENCE, measured, never estimated. `estPrevalence` in the seed file is
 *    a hand guess and is not read here. The band is the proposal's 0.4%-8%.
 * 3. CROSS-SHARD REACH against a permutation null. The four shards are ERA
 *    slices (1920-62, 62-78, 78-96, 97-2025), so a predicate that spans shards
 *    spans eras. Pass A measured cross-shard STRING reuse at 0-0.3%; this is the
 *    same measurement on the vocabulary, and the null says what chance alone
 *    would give.
 * 4. REBUTTAL YIELD. Same predicate, opposed outcome, is a film arguing with
 *    another film. corpus.json holds 110 rebuttal edges out of 22,217, all
 *    hand-authored. This counts how many candidate rebuttal pairs fall out of
 *    the tagging without anyone authoring them.
 * 5. THE STRING BASELINE, computed on the same pool, so the vocabulary is
 *    compared against doing nothing rather than against zero.
 *
 * Nothing here is merged into corpus.json. Tonal distance is not read, not
 * computed and not used: this file produces the SELECTOR only, and ordering a
 * selected family by fingerprint is a later stage that must never feed back
 * into strength.
 */

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "out");
const ROOT = path.resolve(__dirname, "..");

const N2 = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w && !["a", "an", "the"].includes(w)).join(" ");

function rng(seed) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const SEED = 20260810, INDUCE_SHARE = 2 / 3;
const pct = (a, b) => (b ? (100 * a / b) : 0);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ inputs */

const preds = [], filmRows = [];
[0, 1, 2, 3].forEach((shard) => {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, `readings-pass-shard${shard}.json`), "utf8"));
  for (const f of j.films) {
    filmRows.push({ title: f.title, year: f.year, shard, batch: f.batch, n: (f.predicaments || []).length });
    (f.predicaments || []).forEach((pr, i) => preds.push({
      id: `s${shard}b${f.batch}-${N2(f.title).replace(/ /g, "_").slice(0, 28)}-${i}`,
      film: f.title, year: f.year, shard, batch: f.batch,
      situation: pr.situation, n2: N2(pr.situation), roles: Object.keys(pr.roles || {}),
      outcome: pr.outcome, centrality: pr.centrality, basis: pr.basis,
    }));
  }
});
{ const r = rng(SEED); for (const p of preds) p.induce = r() < INDUCE_SHARE; }

// region comes from plots.json, the same source the reading pass read
const region = {};
{
  const p = JSON.parse(fs.readFileSync(path.join(OUT, "plots.json"), "utf8"));
  const want = new Set(filmRows.map((f) => f.title));
  for (const f of Object.values(p.films)) if (f && want.has(f.title)) region[f.title] = f.region || "?";
}

const vocabFile = JSON.parse(fs.readFileSync(path.join(OUT, "propB-vocab.json"), "utf8"));
const vocab = vocabFile.predicates;
const tagFile = JSON.parse(fs.readFileSync(path.join(OUT, "propB-tags.json"), "utf8"));
const tagById = new Map(tagFile.tags.map((t) => [t.id, t.predicate]));
for (const p of preds) p.predicate = tagById.has(p.id) ? tagById.get(p.id) : "__untagged";

/* ------------------------------------------------------------------ coverage */

const untagged = preds.filter((p) => p.predicate === "__untagged").length;
const assigned = preds.filter((p) => p.predicate !== "none" && p.predicate !== "__untagged");
const none = preds.filter((p) => p.predicate === "none");
const seen = preds.filter((p) => p.induce), held = preds.filter((p) => !p.induce);
const seenAssigned = seen.filter((p) => p.predicate !== "none" && p.predicate !== "__untagged").length;
const heldAssigned = held.filter((p) => p.predicate !== "none" && p.predicate !== "__untagged").length;

const filmsScoring = filmRows.filter((f) => f.n > 0);
const filmAssigned = new Set(assigned.map((p) => p.film));

/* ------------------------------------------------------------------ per predicate */

const byPred = new Map();
for (const p of assigned) {
  if (!byPred.has(p.predicate)) byPred.set(p.predicate, []);
  byPred.get(p.predicate).push(p);
}

const POS = new Set(["restored", "transfigured"]);
const NEG = new Set(["unrestored", "fatal"]);

const rows = vocab.map((v) => {
  const m = byPred.get(v.id) || [];
  const filmsOn = [...new Set(m.map((p) => p.film))];
  const shards = [...new Set(m.map((p) => p.shard))].sort();
  const regions = {};
  for (const f of filmsOn) regions[region[f] || "?"] = (regions[region[f] || "?"] || 0) + 1;
  const outcomes = {};
  for (const p of m) outcomes[p.outcome] = (outcomes[p.outcome] || 0) + 1;
  const years = filmsOn.map((f) => (filmRows.find((x) => x.title === f) || {}).year).filter(Boolean);
  // rebuttal pairs: distinct FILM pairs on this predicate with opposed outcomes
  const filmOutcome = new Map();
  for (const p of m) {
    if (!filmOutcome.has(p.film)) filmOutcome.set(p.film, new Set());
    filmOutcome.get(p.film).add(p.outcome);
  }
  const fa = [...filmOutcome.entries()];
  let reb = 0; const rebPairs = [];
  for (let i = 0; i < fa.length; i++) for (let j = i + 1; j < fa.length; j++) {
    const A = fa[i][1], B = fa[j][1];
    const opposed = [...A].some((x) => POS.has(x) && [...B].some((y) => NEG.has(y))) ||
      [...B].some((x) => POS.has(x) && [...A].some((y) => NEG.has(y)));
    if (opposed) { reb++; if (rebPairs.length < 4) rebPairs.push([fa[i][0], fa[j][0]]); }
  }
  const shareCohort = pct(filmsOn.length, filmsScoring.length);
  return {
    id: v.id, label: v.label, roles: v.roles, axis: v.axis,
    prevalence: {
      films: filmsOn.length, tags: m.length,
      shareOfScoringCohort: r2(shareCohort),
      shareOfAttemptedCohort: r2(pct(filmsOn.length, filmRows.length)),
      projectedCorpusShare: r2(shareCohort * (1547 / 2204)),
      band: filmsOn.length < 2 ? "below" : shareCohort > 8 ? "above" : "in",
    },
    reach: {
      shards: shards.length, shardIds: shards, regions: Object.keys(regions).length,
      regionCounts: regions,
      yearSpan: years.length ? Math.max(...years) - Math.min(...years) : 0,
      years: years.length ? [Math.min(...years), Math.max(...years)] : [],
    },
    outcomes,
    rebuttalPairs: reb, rebuttalExamples: rebPairs,
    absorbs: (v.absorbs || []).length,
    members: filmsOn.map((f) => {
      const p = m.find((x) => x.film === f);
      return { film: f, year: p.year, situation: p.situation, outcome: p.outcome, centrality: p.centrality };
    }).sort((a, b) => (b.centrality || 0) - (a.centrality || 0)),
  };
});
rows.sort((a, b) => b.prevalence.films - a.prevalence.films || a.id.localeCompare(b.id));

/* ------------------------------------------------------------------ nulls */

// P(all k films in one shard) under a random draw from the 300, shards of 75
function logC(n, k) { let s = 0; for (let i = 0; i < k; i++) s += Math.log(n - i) - Math.log(i + 1); return s; }
function pSingleShard(k, sizes, N) {
  if (k < 2) return 1;
  let p = 0;
  for (const s of sizes) if (s >= k) p += Math.exp(logC(s, k) - logC(N, k));
  return p;
}
const shardSizes = [0, 1, 2, 3].map((s) => filmsScoring.filter((f) => f.shard === s).length);
const regionSizes = Object.values(filmsScoring.reduce((a, f) => { const r = region[f.title] || "?"; a[r] = (a[r] || 0) + 1; return a; }, {}));
const N = filmsScoring.length;

const multi = rows.filter((r) => r.prevalence.films >= 2);
const obsShardSpan = multi.filter((r) => r.reach.shards >= 2).length;
const expShardSpan = multi.reduce((a, r) => a + (1 - pSingleShard(r.prevalence.films, shardSizes, N)), 0);
const obsRegionSpan = multi.filter((r) => r.reach.regions >= 2).length;
const expRegionSpan = multi.reduce((a, r) => a + (1 - pSingleShard(r.prevalence.films, regionSizes, N)), 0);

/* ------------------------------------------------------------------ string baseline */

const byString = new Map();
for (const p of preds) { if (!byString.has(p.n2)) byString.set(p.n2, []); byString.get(p.n2).push(p); }
function pairStats(groups) {
  const pairs = new Set(); const crossShard = new Set(); const crossRegion = new Set(); const rebut = new Set();
  for (const g of groups) {
    const byFilm = new Map();
    for (const p of g) { if (!byFilm.has(p.film)) byFilm.set(p.film, new Set()); byFilm.get(p.film).add(p.outcome); }
    const fa = [...byFilm.entries()];
    for (let i = 0; i < fa.length; i++) for (let j = i + 1; j < fa.length; j++) {
      const a = fa[i][0], b = fa[j][0], key = a < b ? a + "|" + b : b + "|" + a;
      pairs.add(key);
      const sa = filmRows.find((f) => f.title === a).shard, sb = filmRows.find((f) => f.title === b).shard;
      if (sa !== sb) crossShard.add(key);
      if ((region[a] || "?") !== (region[b] || "?")) crossRegion.add(key);
      const A = fa[i][1], B = fa[j][1];
      if ([...A].some((x) => POS.has(x) && [...B].some((y) => NEG.has(y))) || [...B].some((x) => POS.has(x) && [...A].some((y) => NEG.has(y)))) rebut.add(key);
    }
  }
  return { pairs: pairs.size, crossShard: crossShard.size, crossRegion: crossRegion.size, rebuttal: rebut.size, pairSet: pairs };
}
const stringStats = pairStats([...byString.values()]);
const predStats = pairStats([...byPred.values()]);

// per-film family size under the vocabulary
const neighbours = new Map();
for (const key of predStats.pairSet) {
  const [a, b] = key.split("|");
  if (!neighbours.has(a)) neighbours.set(a, new Set());
  if (!neighbours.has(b)) neighbours.set(b, new Set());
  neighbours.get(a).add(b); neighbours.get(b).add(a);
}
const degs = filmsScoring.map((f) => (neighbours.get(f.title) || new Set()).size).sort((a, b) => a - b);
const med = (a) => a.length ? a[Math.floor(a.length / 2)] : 0;

/* ------------------------------------------------------------------ stability */

let stability = null;
const stabPath = path.join(OUT, "propB-stability.json");
if (fs.existsSync(stabPath)) {
  const s = JSON.parse(fs.readFileSync(stabPath, "utf8"));
  let agree = 0, both = 0, bothNone = 0, oneNone = 0, agreeNonNone = 0, n = 0;
  for (const t of s.tags) {
    const a = tagById.get(t.id); if (a === undefined) continue;
    n++;
    if (a === t.predicate) { agree++; if (a === "none") bothNone++; else agreeNonNone++; }
    if (a !== "none" && t.predicate !== "none") both++;
    if ((a === "none") !== (t.predicate === "none")) oneNone++;
  }
  stability = {
    compared: n, exactAgreement: r1(pct(agree, n)),
    bothNamedAPredicate: both, agreedOnAPredicate: agreeNonNone,
    agreementWhenBothNamed: r1(pct(agreeNonNone, both)),
    bothSaidNone: bothNone, oneSaidNone: oneNone, noneFlipRate: r1(pct(oneNone, n)),
  };
}

/* ------------------------------------------------------------------ deliverable */

const inBand = rows.filter((r) => r.prevalence.band === "in");
const aboveBand = rows.filter((r) => r.prevalence.band === "above");
const belowBand = rows.filter((r) => r.prevalence.band === "below");
const dead = rows.filter((r) => r.prevalence.films === 0);

const axisCounts = rows.reduce((a, r) => { a[r.axis || "?"] = (a[r.axis || "?"] || 0) + 1; return a; }, {});
const noneCounts = {};
for (const p of none) noneCounts[p.n2] = (noneCounts[p.n2] || 0) + 1;

const doc = {
  version: 1,
  proposal: "B — role-structured",
  promptVersion: vocabFile.promptVersion,
  model: vocabFile.model,
  generated: new Date().toISOString(),
  note: "Pass B vocabulary MINED from the Pass A readings of a 300-film cohort. NOT merged into corpus.json, NOT a corpus-wide measurement. Prevalence is counted, never estimated; estPrevalence and --prior were not read. Outcome is deliberately not part of any predicate's identity, so that same-predicate-opposed-outcome can generate rebuttals.",
  method: {
    organisingPrinciple: "A predicate is identified by (agent role) -- act --> (patient role) and nothing else. Subject matter, genre, era and country are stripped; they live in the per-film basis. Outcome is a per-film field, never a discriminator.",
    input: "1,538 predicaments over 300 films, pooled from readings-pass-shard{0..3}.json (Pass A, prompt readings-prompt-2).",
    shownToTheModel: "situation phrase + Pass A role keys + outcome. NOT shown: film title, year, engine, basis — basis carries every proper noun and would pull clustering back onto subject matter.",
    stages: [
      "induce: 2/3 deterministic sample, shuffled across all four shards and all 50 batches so no induction group re-forms a Pass A reading batch; free grouping into role-structured families.",
      "merge: all candidate families collapsed into one vocabulary in a single pass, then an audit pass that folds surviving duplicates and flags outcome leaks and topics.",
      "assign: every one of the 1,538 predicaments classified against the frozen vocabulary, one predicate or 'none'.",
    ],
    heldOut: "The third of the predicaments not used for induction is the generalisation control. Its 'none' rate is reported separately.",
    notDone: "No clustering by string, stem, Jaccard or embedding. No tonal distance anywhere. Relatives not promoted to edges. Seed tags never read.",
  },
  cohort: {
    films: filmRows.length, scoring: filmsScoring.length, empty: filmRows.length - filmsScoring.length,
    predicaments: preds.length, distinctPhrasesN2: byString.size,
    shards: "contiguous era slices of predicate-cohort-300.txt: 1920-62, 1962-78, 1978-96, 1997-2025",
    regions: filmsScoring.reduce((a, f) => { const r = region[f.title] || "?"; a[r] = (a[r] || 0) + 1; return a; }, {}),
    caveat: "The cohort is 100% above plot-source.js's evidence floor by construction. 657 corpus films (29.8%) are below it and can never be tagged, so no number here extrapolates to the corpus without the 0.702 factor applied in projectedCorpusShare.",
  },
  vocabulary: {
    candidatesInduced: vocabFile.candidates,
    afterMerge: vocabFile.afterMerge, afterAudit: vocabFile.afterAudit,
    predicates: rows.length,
    used: rows.length - dead.length, dead: dead.length,
    axisCounts,
    outcomeLeaksFlagged: vocabFile.outcomeLeaks, topicsFlagged: vocabFile.topicsFlagged,
  },
  coverage: {
    predicamentsTagged: preds.length - untagged, predicamentsUntaggedByFailure: untagged,
    assigned: assigned.length, assignedShare: r1(pct(assigned.length, preds.length)),
    noneOfThese: none.length, noneShare: r1(pct(none.length, preds.length)),
    inductionSeen: { n: seen.length, assigned: seenAssigned, noneShare: r1(pct(seen.length - seenAssigned, seen.length)) },
    heldOut: { n: held.length, assigned: heldAssigned, noneShare: r1(pct(held.length - heldAssigned, held.length)) },
    filmsWithAtLeastOne: filmAssigned.size,
    filmsWithAtLeastOneShare: r1(pct(filmAssigned.size, filmsScoring.length)),
    filmsWithNone: filmsScoring.filter((f) => !filmAssigned.has(f.title)).map((f) => f.title),
    honestyNote: "'none of these' is a first-class answer at tag time. The residue below is not a defect to be closed by widening the vocabulary; a predicate that swallows everything is a genre.",
    topUnassignedPhrases: Object.entries(noneCounts).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ phrase: k, films: v })),
  },
  prevalenceBand: {
    band: "0.4%-8% of the corpus, per the proposal",
    denominatorUsed: `${filmsScoring.length} scoring cohort films`,
    inBand: inBand.length, aboveBand: aboveBand.length, belowBand: belowBand.length,
    aboveBandIds: aboveBand.map((r) => ({ id: r.id, films: r.prevalence.films, share: r.prevalence.shareOfScoringCohort })),
    singletons: rows.filter((r) => r.prevalence.films === 1).length,
    note: "Measured on 300 films, not 2,204. A predicate at 3 films here is 1.0% here and would be 0.7% of the corpus if the below-floor 30% can never hold it. The band cut is deferred to Pass C, per the proposal.",
  },
  reach: {
    predicatesWithTwoOrMoreFilms: multi.length,
    spanningTwoOrMoreShards: obsShardSpan,
    spanningTwoOrMoreShardsExpectedByChance: r1(expShardSpan),
    spanningTwoOrMoreRegions: obsRegionSpan,
    spanningTwoOrMoreRegionsExpectedByChance: r1(expRegionSpan),
    spanningAllFourShards: multi.filter((r) => r.reach.shards === 4).length,
    medianYearSpan: med(multi.map((r) => r.reach.yearSpan).sort((a, b) => a - b)),
    note: "The four shards are era slices and were read by four separate agents whose phrase vocabularies were measured as disjoint (0-0.3% cross-shard string reuse). Spanning shards is therefore the test of whether this layer joins what strings could not.",
  },
  cooccurrence: {
    stringBaseline: { pairs: stringStats.pairs, crossShardPairs: stringStats.crossShard, crossRegionPairs: stringStats.crossRegion, rebuttalPairs: stringStats.rebuttal },
    roleStructured: { pairs: predStats.pairs, crossShardPairs: predStats.crossShard, crossRegionPairs: predStats.crossRegion, rebuttalPairs: predStats.rebuttal },
    perFilmNeighbours: { min: degs[0] || 0, p25: degs[Math.floor(degs.length * 0.25)] || 0, median: med(degs), p75: degs[Math.floor(degs.length * 0.75)] || 0, max: degs[degs.length - 1] || 0, withZero: degs.filter((d) => d === 0).length, withSixOrMore: degs.filter((d) => d >= 6).length },
    note: "Pairs are co-occurrence candidates, not edges. Nothing is ranked here: the predicate SELECTS the family and the fingerprint ORDERS it, and tonal distance is not read by this file at all. Family sizes are measured on 13.6% of the corpus and will grow with full tagging.",
  },
  rebuttal: {
    definition: "Same predicate, opposed outcome. Positive = restored | transfigured. Negative = unrestored | fatal. 'ambiguous' is excluded from opposition.",
    candidatePairs: predStats.rebuttal,
    predicatesYieldingAtLeastOne: rows.filter((r) => r.rebuttalPairs > 0).length,
    corpusToday: { rebuttalEdges: 110, ofTotalEdges: 22217, share: "0.5%, hand-authored pair by pair" },
    note: "Candidate pairs, not edges. Each still needs the two basis sentences to compose a claim, and 300 films is 13.6% of the corpus.",
  },
  assignmentStability: stability || { note: "propB-stability.json not present — run pipeline/propB-stability.js" },
  predicates: rows,
};

fs.writeFileSync(path.join(OUT, "predicates-propB.json"), JSON.stringify(doc, null, 1));

/* ------------------------------------------------------------------ report */

const L = console.log;
L(`\n  PASS B / PROPOSAL B — role-structured vocabulary`);
L(`  cohort ${filmRows.length} films (${filmsScoring.length} scoring), ${preds.length} predicaments, ${byString.size} distinct phrases at N2`);
L(`\n  VOCABULARY  ${vocabFile.candidates} candidates -> ${vocabFile.afterMerge} merged -> ${rows.length} after audit`);
L(`              ${rows.length - dead.length} used, ${dead.length} dead (0 films)`);
L(`  COVERAGE    ${assigned.length}/${preds.length} assigned (${r1(pct(assigned.length, preds.length))}%), ${none.length} none of these (${r1(pct(none.length, preds.length))}%)`);
L(`              induction-seen none ${r1(pct(seen.length - seenAssigned, seen.length))}%  vs  HELD-OUT none ${r1(pct(held.length - heldAssigned, held.length))}%`);
L(`              ${filmAssigned.size}/${filmsScoring.length} films carry at least one predicate (${r1(pct(filmAssigned.size, filmsScoring.length))}%)`);
L(`  PREVALENCE  in band ${inBand.length}, above 8% ${aboveBand.length}, below 0.4% (singletons+dead) ${belowBand.length}`);
if (aboveBand.length) L(`              above band: ${aboveBand.map((r) => `${r.id} ${r.prevalence.films}f ${r.prevalence.shareOfScoringCohort}%`).join(", ")}`);
L(`  REACH       ${obsShardSpan}/${multi.length} multi-film predicates span 2+ era shards (chance would give ${r1(expShardSpan)})`);
L(`              ${obsRegionSpan}/${multi.length} span 2+ regions (chance ${r1(expRegionSpan)}), ${multi.filter((r) => r.reach.shards === 4).length} span all four shards`);
L(`  CO-OCCUR    strings: ${stringStats.pairs} film pairs, ${stringStats.crossShard} cross-shard, ${stringStats.rebuttal} opposed-outcome`);
L(`              propB:   ${predStats.pairs} film pairs, ${predStats.crossShard} cross-shard, ${predStats.rebuttal} opposed-outcome`);
L(`              per film: median ${med(degs)} neighbours, ${degs.filter((d) => d === 0).length} with none, ${degs.filter((d) => d >= 6).length} with 6+`);
if (stability) L(`  STABILITY   ${stability.exactAgreement}% exact agreement on re-tag (n=${stability.compared}), ${stability.agreementWhenBothNamed}% when both named a predicate, none-flip ${stability.noneFlipRate}%`);
else L(`  STABILITY   not measured yet`);
L(`\n  -> pipeline/out/predicates-propB.json\n`);
