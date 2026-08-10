#!/usr/bin/env node
/* merge-predicate-tags.js — fold the three Pass C shards into one file.
 *
 *   node pipeline/merge-predicate-tags.js
 *   node pipeline/merge-predicate-tags.js --extra pipeline/out/predicate-tags-benchmark.json
 *
 * WHY A SCRIPT AND NOT A cat. The three shards were produced by three separate
 * runs and they do NOT share a schema: shard 1 emits `film`/`aboveFloor` where
 * shards 0 and 2 emit `title`/`belowFloor`, and only 0 and 2 carry a `summary`
 * block. Normalising by hand would be a silent re-write of somebody else's
 * measurement; doing it here makes the normalisation reviewable and re-runnable.
 *
 * WHAT IT DOES NOT DO. It does not re-tag, re-score, drop, dedupe by judgement
 * or repair a tag. Every tag is re-validated against predicates-frozen.json by
 * id / role / outcome and anything that fails is reported, never fixed.
 *
 * It also does not merge into corpus.json and must not be made to — proposal
 * prohibition 6, phase 5.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "out");
const VOCAB_FILE = path.join(OUT, "predicates-frozen.json");
const OUTCOMES = new Set(["restored", "unrestored", "fatal", "ambiguous", "transfigured"]);

const argv = process.argv.slice(2);
const extras = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === "--extra") extras.push(argv[++i]);
const outPath = (() => { const i = argv.indexOf("--out"); return i === -1 ? "pipeline/out/predicate-tags.json" : argv[i + 1]; })();

const vocabFile = JSON.parse(fs.readFileSync(VOCAB_FILE, "utf8"));
if (!vocabFile.frozen) { console.error("vocabulary is not frozen — refusing"); process.exit(2); }
const VOCAB = new Map(vocabFile.predicates.map((p) => [p.id, p]));

/* One shard row -> the common shape. The only fields that survive are the ones
   every shard actually measured; a field only one shard emitted is dropped
   rather than defaulted, so nothing downstream can mistake a default for a
   measurement. */
function normaliseFilm(row, shardIndex) {
  const title = row.title || row.film;
  const belowFloor = row.belowFloor != null ? !!row.belowFloor
    : row.aboveFloor != null ? !row.aboveFloor : null;
  return {
    title,
    year: row.year ?? null,
    filmId: row.filmId ?? null,
    plotChars: row.plotChars ?? null,
    belowFloor,
    noneOfThese: !!row.noneOfThese,
    shard: shardIndex,
    tags: (row.tags || []).map((t) => ({
      predicate: t.predicate, role: t.role,
      centrality: t.centrality, outcome: t.outcome, basis: t.basis,
    })),
  };
}

const sources = [];
const films = [];
const problems = [];
const seen = new Map();

function ingest(rel, label) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  const idx = (j.shard && j.shard.index != null) ? j.shard.index : label;
  let tags = 0;
  for (const row of j.films) {
    const f = normaliseFilm(row, idx);
    if (seen.has(f.title)) { problems.push({ kind: "duplicate film across shards", title: f.title, shards: [seen.get(f.title), idx] }); continue; }
    seen.set(f.title, idx);
    /* re-validate; report, never repair */
    f.tags = f.tags.filter((t) => {
      const p = VOCAB.get(t.predicate);
      if (!p) { problems.push({ kind: "unknown predicate id", title: f.title, value: t.predicate }); return false; }
      /* "both" is a declared answer in the Pass C prompt — one figure staged on
         both sides of the situation — so the legal set is the predicate's two
         roles plus "both". It carries no complementarity and earns no bonus
         downstream; see associate-predicates.js. */
      if (t.role && !p.roles.includes(t.role) && t.role !== "both") { problems.push({ kind: "role not declared by predicate", title: f.title, value: t.predicate + ":" + t.role }); return false; }
      if (!OUTCOMES.has(t.outcome)) { problems.push({ kind: "outcome not one of the five", title: f.title, value: t.predicate + ":" + t.outcome }); return false; }
      return true;
    });
    /* a film may not carry the same predicate twice */
    const byPred = new Map();
    f.tags = f.tags.filter((t) => { if (byPred.has(t.predicate)) { problems.push({ kind: "duplicate predicate on one film", title: f.title, value: t.predicate }); return false; } byPred.set(t.predicate, 1); return true; });
    tags += f.tags.length;
    films.push(f);
  }
  sources.push({ file: rel, films: j.films.length, tagsAfterRevalidation: tags, shardIndex: idx,
                 vocabulary: (j.vocabulary && j.vocabulary.version) || j.vocabulary || null });
}

["pipeline/out/predicate-tags-shard0.json",
 "pipeline/out/predicate-tags-shard1.json",
 "pipeline/out/predicate-tags-shard2.json"].forEach((f, i) => ingest(f, i));

const cohortFilms = films.length;
extras.forEach((f) => ingest(f, "extra"));

/* ---- counts. These REPLACE estPrevalence, per prohibition 4. ---- */
const counts = new Map();
for (const f of films) for (const t of f.tags) counts.set(t.predicate, (counts.get(t.predicate) || 0) + 1);

/* Prevalence is counted over the 300-film Pass C cohort ONLY. Benchmark films
   added with --extra are scored against that table and never vote in it: a
   handful of films chosen because of the situation being measured is precisely
   the population idf must not be estimated from. */
const cohortCounts = new Map();
for (const f of films.slice(0, cohortFilms)) for (const t of f.tags) cohortCounts.set(t.predicate, (cohortCounts.get(t.predicate) || 0) + 1);

const N = cohortFilms;
const prevalence = [...cohortCounts.entries()]
  .map(([id, n]) => ({ predicate: id, films: n, pctOfCohort: +(100 * n / N).toFixed(2), label: VOCAB.get(id).label }))
  .sort((a, b) => b.films - a.films);

const never = vocabFile.predicates.map((p) => p.id).filter((id) => !cohortCounts.has(id));
const tagTotal = films.slice(0, cohortFilms).reduce((s, f) => s + f.tags.length, 0);
const none = films.slice(0, cohortFilms).filter((f) => f.noneOfThese || f.tags.length === 0);
const dist = {};
for (const f of films.slice(0, cohortFilms)) dist[f.tags.length] = (dist[f.tags.length] || 0) + 1;

const above = prevalence.filter((p) => p.pctOfCohort > 8);
const below = prevalence.filter((p) => p.pctOfCohort < 0.4);

const out = {
  version: 1,
  pass: "C — tag, merged",
  vocabulary: vocabFile.version,
  vocabularyFile: "pipeline/out/predicates-frozen.json",
  source: "reading",
  note: "The three Pass C shards, normalised to one schema and re-validated against the frozen vocabulary. NOT merged into corpus.json and not to be merged before full-corpus tagging (proposal phase 5).",
  sources,
  cohortFilms,
  extraFilms: films.length - cohortFilms,
  summary: {
    filmsInCohort: cohortFilms,
    tags: tagTotal,
    meanTagsPerFilm: +(tagTotal / cohortFilms).toFixed(2),
    noneOfThese: none.length,
    noneOfTheseShare: +(100 * none.length / cohortFilms).toFixed(1),
    noneOfTheseFilms: none.map((f) => f.title),
    tagsPerFilmDistribution: dist,
    distinctPredicatesFired: cohortCounts.size,
    predicatesNeverFired: never.length,
    revalidationProblems: problems.length,
  },
  prevalenceBandCheck: {
    band: [0.004, 0.08],
    measuredOn: cohortFilms + " films of the 300-film stratified Pass A cohort — all above the 1,500-char evidence floor by construction. The corpus is 2,204 films of which 657 (29.8%) are below that floor and can never be tagged, so this is a prevalence over the READABLE corpus estimated from a stratified sample, not a corpus prevalence.",
    aboveBand: above,
    belowBand: below.length,
    note: "Recorded, NOT cut. The band cut belongs after full-corpus tagging (frozen file, afterPassC).",
  },
  prevalence,
  neverFired: never,
  revalidationProblems: problems,
  generated: new Date().toISOString(),
  films,
};

fs.writeFileSync(path.join(ROOT, outPath), JSON.stringify(out, null, 1));

const line = (c = "─") => console.log(c.repeat(78));
line("═");
console.log("  PASS C — MERGED");
line("═");
console.log(`  ${cohortFilms} cohort films + ${films.length - cohortFilms} extra, ${tagTotal} tags, mean ${out.summary.meanTagsPerFilm}`);
console.log(`  none of these: ${none.length}/${cohortFilms} = ${out.summary.noneOfTheseShare}%   ${none.map((f) => f.title).join(", ")}`);
console.log(`  predicates fired ${cohortCounts.size}/175, never fired ${never.length}`);
console.log(`  re-validation problems: ${problems.length}`);
for (const p of problems.slice(0, 12)) console.log(`    ! ${p.kind}: ${p.title} ${p.value || ""}`);
console.log(`\n  ABOVE the 0.4–8% band (${above.length}) — recorded, not cut:`);
for (const p of above) console.log(`    ${String(p.films).padStart(3)}/${cohortFilms} = ${String(p.pctOfCohort).padStart(5)}%  ${p.predicate}`);
console.log(`  BELOW 0.4%: ${below.length} predicates (single-film, at N=${cohortFilms} one film is ${(100 / cohortFilms).toFixed(2)}%)`);
console.log(`\n  wrote -> ${outPath}\n`);
