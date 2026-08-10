#!/usr/bin/env node
/**
 * predicate-cohort-300.js — the Pass A cohort. 300 films, all readable.
 *
 * This is a second sampler, not a replacement for `predicate-cohort.js`. That
 * one answers "how many predicates does the corpus need?" and is allowed to
 * emit films that cannot be read, because a hand-tagger can watch a film. This
 * one feeds `readings.js`, which reads a plot section and nothing else, so a
 * film below plot-source.js's 1,500-char evidence floor is a wasted call and a
 * zero dragged through the per-film predicament average. Proposal prohibition
 * 7: probe for an above-floor plot section BEFORE harvesting, not after.
 *
 * WHAT IT SELECTS FOR, AND WHY THE OLD SAMPLER'S RULE WAS DROPPED
 *
 * predicate-cohort.js weights within a stratum toward graph degree — "a
 * predicate on a high-degree film is read more often". That is right for a
 * saturation curve and wrong here. The vocabulary mined out of Pass A becomes
 * the closed list every one of 2,204 films is classified against, so a cohort
 * tilted toward the well-connected produces a vocabulary that describes the
 * canon and then imposes it on the tail. That is the proposal's central risk
 * ("a vocabulary that describes its author's recall") reproduced one level
 * down. So this sampler balances FIVE margins against the corpus's own
 * distribution instead of one, and treats fame as a thing to spread rather
 * than a thing to prefer:
 *
 *   region     — 10 buckets, from plots.json's own `region` field
 *   era        — the same five buckets predicate-cohort.js uses
 *   fame       — decile of 60-day Wikipedia pageviews, the instrument
 *                plot-source.js already uses for its fame-flatness gate.
 *                Read from pipeline/.cache-views. NO NETWORK CALL.
 *   era x region — the joint. Fitting the two margins alone left 1990s E-Asia
 *                at 2 seats against 6.8 expected with 36 readable films sitting
 *                unused, because every one of them could be traded for a film
 *                that closed the same two margins somewhere else.
 *   tradition  — country-derived, because `region` has no Africa bucket and no
 *                Middle East bucket and files Nordic cinema under W-Europe.
 *                See "tradition audit" below.
 *
 * Plus a soft per-director cap on the fill stage, because the corpus holds 55
 * Hitchcocks and 50 Bergmans and a corpus-proportional cohort hands one hand
 * seven or eight of the 300 seats.
 *
 * Targets are the CORPUS's shares, not the readable pool's. The readable pool
 * is not a random subset — readability is 85.4% for US/CA and 53.6% for
 * W-Europe, 100% in the top fame decile and 11.1% in the bottom — so sampling
 * proportionally from it would bake that skew in. Sampling against the corpus
 * corrects for it up to the point where a stratum simply has too few readable
 * films, and the report prints the residual gap rather than hiding it.
 *
 * THE STRESS QUOTA
 *
 * "None of these" is a first-class answer at tag time, per the proposal. A
 * vocabulary that cannot say it for a film with no interpersonal content is
 * not a vocabulary, so the cohort deliberately over-samples the cases that
 * should produce it: documentaries, non-narrative and essayistic work, and
 * silent film. This is a KNOWN, INTENTIONAL skew away from the corpus profile
 * and the report names it as one.
 *
 * WHAT IT EXCLUDES, AND WHY
 *
 *   - Films below the floor. See above.
 *   - The 18 films in predicate-tags.seed.json. predicate-cohort.js excludes
 *     them too, but for a different reason. Those tags were authored from
 *     model recall and prohibition 1 says they are not ground truth and must
 *     not be evaluated against. Keeping those films out of Pass A removes the
 *     temptation entirely. It costs nothing: Pass C tags all 2,204 anyway.
 *   - Titles that are ambiguous inside plots.json (24 titles held by two films
 *     each — two Psychos, two Dunes, two Nosferatus). readings.js resolves
 *     `--cohort` by TITLE, so admitting one admits both and the cohort is no
 *     longer 300 films.
 *
 * RUN
 *   node pipeline/predicate-cohort-300.js                     # report only
 *   node pipeline/predicate-cohort-300.js --write             # + write the .txt and the profile
 *   node pipeline/predicate-cohort-300.js --n 300 --seed 1
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const flag = (k) => argv.includes(k);

const N = parseInt(opt("--n", 300), 10);
const SEED = parseInt(opt("--seed", 1), 10);
const OUT_TXT = path.join(ROOT, opt("--out", "pipeline/predicate-cohort-300.txt"));
const OUT_PROFILE = path.join(ROOT, "pipeline/out/predicate-cohort-300.profile.json");

const ERAS = ["pre-1950", "1950-69", "1970-89", "1990-09", "2010+"];
const eraOf = (y) => (y < 1950 ? "pre-1950" : y < 1970 ? "1950-69" : y < 1990 ? "1970-89" : y < 2010 ? "1990-09" : "2010+");

/* ------------------------------------------------------------------ inputs */

const plots = JSON.parse(fs.readFileSync(path.join(ROOT, "pipeline/out/plots.json"), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static/corpus.json"), "utf8"));
const discovery = JSON.parse(fs.readFileSync(path.join(ROOT, "static/discovery.json"), "utf8"));
const seedTagged = new Set(Object.keys(JSON.parse(
  fs.readFileSync(path.join(ROOT, "pipeline/predicate-tags.seed.json"), "utf8")).films));
const cohort60 = fs.readFileSync(path.join(ROOT, "pipeline/predicate-cohort.txt"), "utf8")
  .split("\n").map((s) => s.trim()).filter(Boolean);

/* Fame. Same instrument as plot-source.js's GATE 1 — 60-day pageviews — read
   straight out of its cache so this script never touches the network. The
   cached payload names its own article, so no filename-hash reconstruction. */
function loadViews() {
  const dir = path.join(__dirname, ".cache-views");
  const m = new Map();
  if (!fs.existsSync(dir)) return m;
  for (const fn of fs.readdirSync(dir)) {
    if (!fn.endsWith(".json")) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(dir, fn), "utf8")); } catch (e) { continue; }
    if (!d || !Array.isArray(d.items) || !d.items.length) continue;   // __missing markers land here
    m.set(String(d.items[0].article).replace(/_/g, " "),
      d.items.reduce((a, i) => a + (i.views || 0), 0));
  }
  return m;
}
const views = loadViews();

const directorOf = new Map();
for (const f of Object.values(corpus.films)) directorOf.set(f.filmId, f.director || "—");

const genresOf = new Map();
for (const [g, idx] of Object.entries(discovery.facets.postings.genre)) {
  const label = g.replace(/^genre:/, "");
  for (const i of idx) {
    const fid = discovery.filmOrder[i];
    if (!genresOf.has(fid)) genresOf.set(fid, []);
    genresOf.get(fid).push(label);
  }
}

/* ---------------------------------------------------------- tradition audit
 *
 * plot-source.js's `region` is the first country Wikidata lists, mapped through
 * a 10-bucket table with no Africa and no Middle East in it. So it files Yeelen
 * (Mali) and Black Girl (Senegal) as W-Europe, The Battle of Algiers as
 * W-Europe, Close-Up as W-Europe, and Iranian cinema as S-Asia. Balancing
 * `region` against the corpus therefore balances CO-PRODUCTION FINANCE, not
 * traditions, and a cohort can look perfectly balanced while containing almost
 * no African or Middle Eastern film.
 *
 * This is the counter-axis, and it is deliberately biased the OTHER way: a film
 * is credited to the first tradition in this precedence list that any of its
 * countries matches, so a France/Mali co-production counts as Africa. It
 * therefore reads as an UPPER BOUND on how much of a tradition is present.
 *
 * It is BOTH balanced against and reported. That is a Goodhart hazard and the
 * report says so at the table: once a margin is optimised, hitting it proves
 * nothing. What the table is still good for is the RESIDUAL — a tradition that
 * misses its target after being aimed at is supply-limited, and that is the
 * finding. Africa is the one that misses. The taxonomy below is hand-written
 * for this file and is not a project-wide fact. */
const TRADITION = [
  ["Africa", ["Senegal", "Mali", "Burkina Faso", "Cameroon", "The Gambia", "Mauritania"]],
  ["MENA", ["Egypt", "Algeria", "Tunisia", "Morocco", "Iran", "Israel", "Jordan", "United Arab Emirates", "Lebanon"]],
  ["S-Asia", ["India"]],
  ["SE-Asia", ["Thailand", "Indonesia"]],
  ["E-Asia", ["People's Republic of China", "South Korea", "Taiwan", "Hong Kong", "British Hong Kong", "Republic of China"]],
  ["Japan", ["Japan", "Empire of Japan"]],
  ["LatAm", ["Mexico", "Brazil", "Argentina", "Chile", "Colombia", "Peru", "Cuba", "Venezuela"]],
  ["Oceania", ["Australia", "New Zealand"]],
  ["E-Europe", ["Poland", "Soviet Union", "Russia", "Hungary", "Czechoslovakia", "Czech Republic", "Slovakia", "Slovenia",
    "Yugoslavia", "Federal Republic of Yugoslavia", "Socialist Federal Republic of Yugoslavia", "North Macedonia",
    "Bulgaria", "People's Republic of Bulgaria", "Romania", "Latvia", "Estonia", "Lithuania"]],
  ["N-Europe", ["Sweden", "Norway", "Denmark", "Finland", "Iceland"]],
  ["UK/IE", ["United Kingdom", "Ireland"]],
  ["W-Europe", ["France", "Italy", "Kingdom of Italy", "Germany", "West Germany", "Weimar Republic", "German Reich",
    "Spain", "Switzerland", "Netherlands", "Kingdom of the Netherlands", "Belgium", "Austria", "Greece",
    "Portugal", "Luxembourg", "Monaco", "Malta", "Cyprus", "Vatican City"]],
  ["US/CA", ["United States", "Canada"]],
];
const TRADITION_ORDER = TRADITION.map((t) => t[0]).concat(["unmapped"]);
const countriesOf = new Map();
{
  const vals = discovery.facets.definitions.country.values;
  for (const [k, idx] of Object.entries(discovery.facets.postings.country)) {
    const label = vals[k].label;
    for (const i of idx) {
      const fid = discovery.filmOrder[i];
      if (!countriesOf.has(fid)) countriesOf.set(fid, []);
      countriesOf.get(fid).push(label);
    }
  }
}
const traditionOf = (fid) => {
  const cs = countriesOf.get(fid) || [];
  for (const [name, list] of TRADITION) if (cs.some((c) => list.includes(c))) return name;
  return "unmapped";
};

const titleCount = new Map();
for (const f of Object.values(plots.films)) titleCount.set(f.title, (titleCount.get(f.title) || 0) + 1);

const rows = Object.values(plots.films).map((f) => ({
  filmId: f.filmId,
  title: f.title,
  year: f.year,
  region: f.region || "Other",
  era: eraOf(f.year),
  plotChars: f.plotChars || 0,
  readable: !!f.admitted,
  withheld: f.withheld || null,
  director: directorOf.get(f.filmId) || "—",
  genres: genresOf.get(f.filmId) || [],
  views: views.has(f.wikipedia) ? views.get(f.wikipedia) : (views.has(f.title) ? views.get(f.title) : null),
  ambiguous: titleCount.get(f.title) > 1,
  countries: countriesOf.get(f.filmId) || [],
  tradition: traditionOf(f.filmId),
}));

/* Fame deciles are cut on the WHOLE corpus, so "decile 3" means the same thing
   in the cohort table and the corpus table. Films the pageviews API never
   answered for get their own bucket rather than a fabricated rank. */
const sortedViews = rows.filter((r) => r.views != null).map((r) => r.views).sort((a, b) => a - b);
const CUTS = [];
for (let d = 1; d < 10; d++) CUTS.push(sortedViews[Math.floor(sortedViews.length * d / 10)]);
const fameOf = (r) => { if (r.views == null) return "unknown"; let d = 0; while (d < 9 && r.views >= CUTS[d]) d++; return String(d); };
for (const r of rows) r.fame = fameOf(r);

const byTitle = new Map(rows.map((r) => [r.title, r]));

/* ------------------------------------------------------------------- pool */

const pool = rows.filter((r) => r.readable && !r.ambiguous && !seedTagged.has(r.title));

/* --------------------------------------------------------- stress quota */

/* The genre facet is Wikidata/TMDB-derived and it is noisy. Once Upon a Time
   in America carries `documentary` and is a 229-minute gangster picture. A
   mistagged film in the stress quota does not stress anything, so the tag is
   overridden here rather than silently trusted. */
const MISTAGGED_DOC = new Set(["Once Upon a Time in America"]);

/* Non-narrative or essayistic work that is NOT tagged documentary. These are
   the films whose readings should come back with an honest "none of these" or
   with predicaments that have no second party. */
const STRESS_NON_NARRATIVE = [
  "La Jetée",              // photo-roman, narration over stills
  "F for Fake",            // essay film, no plot in the ordinary sense
  "Joy of Learning",       // Godard, two figures reciting political text
  "Daisies",               // Chytilová, anti-narrative
  "I Am Cuba",             // four unconnected episodes, camera as subject
  "The Mirror",            // Tarkovsky, memory without chronology
  "Eraserhead",            // dream logic
  "Inland Empire",         // dream logic
];

/* Silent film. Twelve, chosen to span region and the full fame range rather
   than to be the twelve best-known: Sword of Penitence at 541 views and The
   Burning Soil at 623 sit in the bottom fame decile, Metropolis at 94,432 in
   the top. Two of them — Battleship Potemkin and Strike — have a crowd where
   a protagonist would be, which is the interpersonal-content stress case in
   its purest available form. */
const STRESS_SILENT = [
  "Metropolis", "The Cabinet of Dr. Caligari", "Battleship Potemkin", "Strike",
  "A Page of Madness", "Sword of Penitence", "The General", "The Crowd",
  "Sunrise: A Song of Two Humans", "The Passion of Joan of Arc",
  "The Burning Soil", "The Manxman",
];

const inPool = new Set(pool.map((r) => r.title));
const stress = new Map();
const addStress = (title, why) => {
  if (!inPool.has(title)) return { title, why, ok: false };
  if (!stress.has(title)) stress.set(title, why);
  return { title, why, ok: true };
};
const stressAudit = [];
for (const r of pool) {
  if (r.genres.includes("documentary") && !MISTAGGED_DOC.has(r.title)) stressAudit.push(addStress(r.title, "documentary"));
}
for (const t of STRESS_NON_NARRATIVE) stressAudit.push(addStress(t, "non-narrative / essayistic"));
for (const t of STRESS_SILENT) stressAudit.push(addStress(t, "silent"));

/* ------------------------------------------------------------- selection */

let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jitter = new Map(pool.map((r) => [r.title, rnd()]));   // fixed per film, so ties break the same way every run

const share = (dim) => {
  const m = new Map();
  for (const r of rows) m.set(r[dim], (m.get(r[dim]) || 0) + 1);
  return m;
};
/* The three margins are reported; `cell` is the era x region joint, carried as
   a fourth balancing term only. Fitting the margins alone is not enough — it
   left 1990s E-Asia at 2 seats against 6.8 expected while 36 readable films
   were sitting there, because every one of those films could be traded for a
   film that closed the same two margins elsewhere. */
const DIMS = ["region", "era", "fame", "cell", "tradition"];
const REPORTED = ["region", "era", "fame", "tradition"];
for (const r of rows) r.cell = `${r.era} · ${r.region}`;
const corpusCounts = Object.fromEntries(DIMS.map((d) => [d, share(d)]));

/* Largest-remainder allocation of N seats against the corpus's own share. */
function targets(dim) {
  const total = rows.length;
  const rowsOut = [...corpusCounts[dim].entries()].map(([k, n]) => ({ k, exact: N * n / total }));
  rowsOut.forEach((a) => { a.seats = Math.floor(a.exact); });
  let left = N - rowsOut.reduce((t, a) => t + a.seats, 0);
  rowsOut.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (let i = 0; left > 0; i = (i + 1) % rowsOut.length) { rowsOut[i].seats++; left--; }
  return new Map(rowsOut.map((a) => [a.k, a.seats]));
}
const TARGET = Object.fromEntries(DIMS.map((d) => [d, targets(d)]));

const picked = new Map();
const current = Object.fromEntries(DIMS.map((d) => [d, new Map()]));
const take = (r) => {
  if (picked.has(r.title)) return;
  picked.set(r.title, r);
  for (const d of DIMS) current[d].set(r[d], (current[d].get(r[d]) || 0) + 1);
};

/* 1. Every readable film of the 60-film cohort. Nothing already spent is
      dropped. (See the report for what the readings cache does and does not
      actually make free.) */
const carried = cohort60.map((t) => byTitle.get(t)).filter((r) => r && r.readable && !r.ambiguous && !seedTagged.has(r.title));
carried.forEach(take);

/* 2. The stress quota. */
[...stress.keys()].map((t) => byTitle.get(t)).forEach(take);

/* 3. Fill the rest by the margin that is furthest from the corpus. Deficit is
      expressed as a FRACTION of the stratum's target so a 4-seat stratum can
      out-compete a 100-seat one; without that the tail never gets picked. */
const CELL_WEIGHT = parseFloat(opt("--cell-weight", "1"));
const TRADITION_WEIGHT = parseFloat(opt("--tradition-weight", "1"));
const need = (d, k) => {
  const t = TARGET[d].get(k) || 0;
  return (t - (current[d].get(k) || 0)) / Math.max(1, t);
};
/* A soft cap on the FILL stage only. The corpus has 55 Hitchcocks and 49
   Herzogs, so a corpus-proportional cohort hands one hand seven or eight seats
   and the mined vocabulary inherits that hand's preoccupations. The cap is not
   applied to the carried or stress films — those are already committed, and
   the readable-documentary set is Herzog-heavy for reasons no sampler can fix.
   If the cap ever makes a seat unfillable it is relaxed rather than enforced,
   so the margins always win over the cap. */
const FILL_DIRECTOR_CAP = parseInt(opt("--director-cap", "4"), 10);
const perDirector = new Map();
for (const r of picked.values()) perDirector.set(r.director, (perDirector.get(r.director) || 0) + 1);
let capRelaxations = 0, capExemptions = 0;
/* The cap must never cost a seat in a stratum that is running out of films.
   The bottom fame decile holds 24 readable films in the whole corpus, three of
   them Ozu; enforcing the cap there trades a measured fame gap for a director
   preference, which is the wrong way round. A film is exempt from the cap when
   any bucket it belongs to has no more supply than it still needs. */
while (picked.size < N) {
  let best = null, bestScore = -Infinity;
  const supply = Object.fromEntries(DIMS.map((d) => [d, new Map()]));
  for (const r of pool) {
    if (picked.has(r.title)) continue;
    for (const d of DIMS) supply[d].set(r[d], (supply[d].get(r[d]) || 0) + 1);
  }
  const scarce = (r) => DIMS.some((d) => {
    const deficit = (TARGET[d].get(r[d]) || 0) - (current[d].get(r[d]) || 0);
    return deficit > 0 && (supply[d].get(r[d]) || 0) <= deficit;
  });
  for (let pass = 0; pass < 2 && !best; pass++) {
    for (const r of pool) {
      if (picked.has(r.title)) continue;
      if (pass === 0 && (perDirector.get(r.director) || 0) >= FILL_DIRECTOR_CAP) {
        if (!scarce(r)) continue;
        capExemptions++;
      }
      const sc = need("region", r.region) + need("era", r.era) + need("fame", r.fame)
        + CELL_WEIGHT * need("cell", r.cell) + TRADITION_WEIGHT * need("tradition", r.tradition)
        + jitter.get(r.title) * 1e-3;
      if (sc > bestScore) { bestScore = sc; best = r; }
    }
    if (!best && pass === 0) capRelaxations++;
  }
  if (!best) break;
  perDirector.set(best.director, (perDirector.get(best.director) || 0) + 1);
  take(best);
}

const cohort = [...picked.values()].sort((a, b) => (a.year - b.year) || a.title.localeCompare(b.title));

/* ---------------------------------------------------------------- report */

const pctOf = (n, d) => (100 * n / d).toFixed(1);
const table = (dim, order) => {
  const keys = order || [...corpusCounts[dim].keys()].sort((a, b) => corpusCounts[dim].get(b) - corpusCounts[dim].get(a));
  const readable = new Map();
  for (const r of rows) if (r.readable) readable.set(r[dim], (readable.get(r[dim]) || 0) + 1);
  const out = [];
  console.log(`\n  ${dim.toUpperCase()}`);
  console.log("  bucket        corpus          readable pool     cohort/300        target   gap");
  for (const k of keys) {
    const c = corpusCounts[dim].get(k) || 0;
    const rd = readable.get(k) || 0;
    const co = current[dim].get(k) || 0;
    const tg = TARGET[dim].get(k) || 0;
    const gap = (100 * co / N) - (100 * c / rows.length);
    out.push({ bucket: k, corpus: c, corpusPct: +pctOf(c, rows.length), readable: rd, cohort: co, target: tg, gapPts: +gap.toFixed(1) });
    console.log("  " + String(k).padEnd(12) +
      String(c).padStart(5) + " " + pctOf(c, rows.length).padStart(5) + "%" +
      String(rd).padStart(9) + " " + pctOf(rd, c).padStart(5) + "%rd" +
      String(co).padStart(8) + " " + pctOf(co, N).padStart(5) + "%" +
      String(tg).padStart(8) +
      (gap >= 0 ? "  +" : "  ") + gap.toFixed(1));
  }
  return out;
};

console.log(`\n  PASS-A COHORT — ${cohort.length} films, seed ${SEED}`);
console.log(`  pool: ${rows.length} in plots.json, ${rows.filter((r) => r.readable).length} at or above the ${plots.floor}-char floor,`);
console.log(`        ${pool.length} selectable after removing ${rows.filter((r) => r.readable && r.ambiguous).length} ambiguous-title and ${rows.filter((r) => r.readable && seedTagged.has(r.title)).length} seed-tagged films`);
console.log(`  carried from the 60-film cohort: ${carried.length} of ${cohort60.length} (${cohort60.length - carried.length} are below the floor)`);
console.log(`  stress quota: ${stress.size}`);
console.log(`  fill director cap: ${FILL_DIRECTOR_CAP}${capRelaxations ? `, relaxed ${capRelaxations}x` : ""}${capExemptions ? `, ${capExemptions} scarcity exemptions considered` : ""}`);

const report = {
  region: table("region"),
  era: table("era", ERAS),
  fame: table("fame", ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "unknown"]),
};

console.log("\n  ERA x REGION — cohort count (corpus-proportional seats in brackets)");
const cell = new Map();
for (const r of cohort) cell.set(`${r.era}|${r.region}`, (cell.get(`${r.era}|${r.region}`) || 0) + 1);
const cellCorpus = new Map();
for (const r of rows) cellCorpus.set(`${r.era}|${r.region}`, (cellCorpus.get(`${r.era}|${r.region}`) || 0) + 1);
const regionsBySize = [...corpusCounts.region.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
console.log("  " + "".padEnd(10) + regionsBySize.map((r) => r.slice(0, 8).padStart(9)).join(""));
for (const e of ERAS) {
  console.log("  " + e.padEnd(10) + regionsBySize.map((rg) => {
    const got = cell.get(`${e}|${rg}`) || 0;
    const exp = ((cellCorpus.get(`${e}|${rg}`) || 0) * N / rows.length).toFixed(1);
    return `${got}/${exp}`.padStart(9);
  }).join(""));
}

console.log("\n  TRADITION — country-derived, and BALANCED AGAINST, not an independent audit.");
console.log("  Upper bound: a co-production is credited to its least-Western partner.");
console.log("  Read the residual, not the hit: a miss here is a supply limit.");
console.log("  tradition     corpus          readable pool     cohort/300     gap");
const tradCorpus = new Map(), tradReadable = new Map(), tradCohort = new Map();
for (const r of rows) {
  tradCorpus.set(r.tradition, (tradCorpus.get(r.tradition) || 0) + 1);
  if (r.readable) tradReadable.set(r.tradition, (tradReadable.get(r.tradition) || 0) + 1);
}
for (const r of cohort) tradCohort.set(r.tradition, (tradCohort.get(r.tradition) || 0) + 1);
const traditionReport = [];
for (const t of TRADITION_ORDER) {
  const c = tradCorpus.get(t) || 0;
  if (!c) continue;
  const rd = tradReadable.get(t) || 0;
  const co = tradCohort.get(t) || 0;
  const gap = (100 * co / N) - (100 * c / rows.length);
  traditionReport.push({ tradition: t, corpus: c, corpusPct: +pctOf(c, rows.length), readable: rd, cohort: co, gapPts: +gap.toFixed(1) });
  console.log("  " + t.padEnd(12) +
    String(c).padStart(5) + " " + pctOf(c, rows.length).padStart(5) + "%" +
    String(rd).padStart(9) + " " + pctOf(rd, c).padStart(5) + "%rd" +
    String(co).padStart(8) + " " + pctOf(co, N).padStart(5) + "%" +
    (gap >= 0 ? "   +" : "   ") + gap.toFixed(1));
}

const stressPicked = cohort.filter((r) => stress.has(r.title));
console.log(`\n  STRESS FILMS IN COHORT — ${stressPicked.length}`);
for (const r of stressPicked) console.log(`   ${String(r.year).padStart(4)}  ${r.title}  [${r.region}, fame decile ${r.fame}]  — ${stress.get(r.title)}`);
const reasonUnavailable = (t) => {
  const r = byTitle.get(t);
  if (!r) return "not in plots.json";
  if (seedTagged.has(t)) return "excluded: hand-tagged in predicate-tags.seed.json";
  if (r.ambiguous) return "excluded: title held by two films in plots.json";
  return r.withheld || "not readable";
};
const unavailable = stressAudit.filter((a) => !a.ok);
if (unavailable.length) {
  console.log(`\n  STRESS FILMS NAMED BUT NOT AVAILABLE — ${unavailable.length}`);
  for (const a of unavailable) {
    const r = byTitle.get(a.title);
    console.log(`   ${a.title} — ${reasonUnavailable(a.title)}`);
  }
}

const dirCohort = new Map(), dirCorpus = new Map();
for (const r of cohort) dirCohort.set(r.director, (dirCohort.get(r.director) || 0) + 1);
for (const r of rows) dirCorpus.set(r.director, (dirCorpus.get(r.director) || 0) + 1);
const topDirs = [...dirCohort.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`\n  DIRECTOR CONCENTRATION — ${dirCohort.size} directors across ${cohort.length} films`);
console.log(`  top 12 (cohort count / corpus count / corpus-proportional seats at ${N}):`);
for (const [d, n] of topDirs) console.log(`   ${String(n).padStart(2)}  ${d}  (corpus ${dirCorpus.get(d)}, proportional ${((dirCorpus.get(d) || 0) * N / rows.length).toFixed(1)})`);

console.log("\n  COHORT");
cohort.forEach((r, i) => console.log(
  ` ${String(i + 1).padStart(3)}. ${r.title} (${r.year}) — ${r.director}  [${r.region}, ${r.plotChars}ch, fame ${r.fame}]${stress.has(r.title) ? " *stress" : ""}${carried.some((c) => c.title === r.title) ? " *carried" : ""}`));

if (flag("--write")) {
  fs.writeFileSync(OUT_TXT, cohort.map((r) => r.title).join("\n") + "\n");
  fs.mkdirSync(path.dirname(OUT_PROFILE), { recursive: true });
  fs.writeFileSync(OUT_PROFILE, JSON.stringify({
    version: 1,
    generated: new Date().toISOString(),
    n: cohort.length,
    seed: SEED,
    floor: plots.floor,
    note: "Pass-A reading cohort. Every film is at or above plot-source.js's evidence floor. Targets are the CORPUS's shares, not the readable pool's.",
    source: { plots: "pipeline/out/plots.json", fame: "pipeline/.cache-views (60-day pageviews)", genre: "static/discovery.json" },
    pool: {
      inPlots: rows.length,
      readable: rows.filter((r) => r.readable).length,
      selectable: pool.length,
      excludedAmbiguousTitle: rows.filter((r) => r.readable && r.ambiguous).length,
      excludedSeedTagged: rows.filter((r) => r.readable && seedTagged.has(r.title)).length,
    },
    carriedFrom60: carried.map((r) => r.title),
    stress: stressPicked.map((r) => ({ title: r.title, year: r.year, region: r.region, fame: r.fame, why: stress.get(r.title) })),
    stressUnavailable: unavailable.map((a) => {
      const r = byTitle.get(a.title);
      return { title: a.title, why: a.why, reason: reasonUnavailable(a.title) };
    }),
    profile: report,
    traditionAudit: traditionReport,
    films: cohort.map((r) => ({ title: r.title, year: r.year, region: r.region, tradition: r.tradition, countries: r.countries, era: r.era, fame: r.fame, views: r.views, plotChars: r.plotChars, genres: r.genres })),
  }, null, 1));
  console.log(`\n  wrote ${cohort.length} titles -> ${path.relative(ROOT, OUT_TXT)}`);
  console.log(`  wrote profile      -> ${path.relative(ROOT, OUT_PROFILE)}`);
}
console.log("");
