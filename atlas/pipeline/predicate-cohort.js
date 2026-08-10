#!/usr/bin/env node
/**
 * predicate-cohort.js — pick the films to hand-tag, and only those.
 *
 * The question this exists to answer: how many predicates does the corpus
 * actually need? Tag films in the order this emits, recording after each one
 * how many NEW predicates it required, and plot that against films-tagged.
 *
 *   still climbing linearly at film 40   -> the space is unbounded, stop
 *   flattening by film 60-80             -> the vocabulary saturates, proceed
 *
 * Sampling is stratified by era x region against the corpus's own proportions,
 * because a cohort of Anglo drama will saturate early and lie to you. The seed
 * is fixed so the cohort is reproducible and a second run does not quietly
 * reshuffle which films the curve refers to — the mistake STATE.md records
 * against measure-scale.js's subsample().
 *
 * RUN
 *   node pipeline/predicate-cohort.js                 # 60 films, stratified
 *   node pipeline/predicate-cohort.js --n 120 --seed 7
 *   node pipeline/predicate-cohort.js --out pipeline/predicate-cohort.txt
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };

const N = parseInt(opt('--n', 60), 10);
const SEED = parseInt(opt('--seed', 1), 10);

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'static/corpus.json'), 'utf8'));
const fps = JSON.parse(fs.readFileSync(path.join(ROOT, 'static/fingerprints.json'), 'utf8')).films;
const tagged = new Set(Object.keys(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'pipeline/predicate-tags.seed.json'), 'utf8')).films
));

const regionOf = new Map();
for (const f of Object.values(fps)) regionOf.set(f.title, f.region || 'Other');

const era = (y) => y < 1950 ? 'pre-1950' : y < 1970 ? '1950-69' : y < 1990 ? '1970-89' : y < 2010 ? '1990-09' : '2010+';

// degree, so the cohort can prefer films that actually appear in maps
const degree = new Map();
for (const e of corpus.edges) {
  degree.set(e.a, (degree.get(e.a) || 0) + 1);
  degree.set(e.b, (degree.get(e.b) || 0) + 1);
}

const pool = [];
for (const [key, f] of Object.entries(corpus.films)) {
  if (!f.year || tagged.has(f.title)) continue;
  pool.push({
    key, title: f.title, year: f.year, director: f.director || '—',
    era: era(f.year), region: regionOf.get(f.title) || 'Other',
    degree: degree.get(key) || 0,
    scored: !!(fps[Object.keys(fps).find((k) => fps[k].title === f.title)] || {}).scored,
  });
}

// mulberry32 — small, deterministic, no dependency
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const strata = new Map();
for (const f of pool) {
  const k = `${f.era} · ${f.region}`;
  if (!strata.has(k)) strata.set(k, []);
  strata.get(k).push(f);
}

// Allocate seats proportionally, largest-remainder, floor of 1 for any stratum
// holding at least 1% of the corpus so the tail is represented at all.
const total = pool.length;
const alloc = [];
for (const [k, films] of strata) {
  const share = films.length / total;
  alloc.push({ k, films, exact: share * N, share });
}
alloc.forEach((a) => { a.seats = Math.floor(a.exact); });
let left = N - alloc.reduce((t, a) => t + a.seats, 0);
alloc.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
for (const a of alloc) { if (left <= 0) break; if (a.share >= 0.01 || a.seats === 0) { a.seats++; left--; } }
for (let i = 0; left > 0; i = (i + 1) % alloc.length) { alloc[i].seats++; left--; }

const picked = [];
for (const a of alloc) {
  if (!a.seats) continue;
  // Within a stratum, weight toward films that appear in more maps — a
  // predicate on a high-degree film is read more often — but keep it random
  // enough that the cohort is not just the canon.
  const shuffled = a.films
    .map((f) => ({ f, r: rnd() * (1 + Math.min(1, f.degree / 30)) }))
    .sort((x, y) => y.r - x.r)
    .map((x) => x.f);
  picked.push(...shuffled.slice(0, a.seats));
}
picked.sort((x, y) => rnd() - 0.5);

console.log(`\n  PREDICATE COHORT — ${picked.length} films, seed ${SEED}, stratified era x region`);
console.log(`  ${tagged.size} already tagged and excluded\n`);
const grid = new Map();
picked.forEach((f) => grid.set(`${f.era} · ${f.region}`, (grid.get(`${f.era} · ${f.region}`) || 0) + 1));
[...grid.entries()].sort().forEach(([k, n]) => console.log(`   ${String(n).padStart(3)}  ${k}`));
console.log('');
picked.forEach((f, i) => {
  console.log(` ${String(i + 1).padStart(3)}. ${f.title} (${f.year}) — ${f.director}   [deg ${f.degree}${f.scored ? '' : ', UNSCORED'}]`);
});

const out = opt('--out', null);
if (out) {
  fs.writeFileSync(path.join(ROOT, out), picked.map((f) => f.title).join('\n') + '\n');
  console.log(`\n  wrote ${picked.length} titles -> ${out}`);
}
console.log('');
