#!/usr/bin/env node
/* measure-predicate-coverage.js — what the vocabulary can and cannot reach.
 *
 *   node pipeline/measure-predicate-coverage.js
 *   node pipeline/measure-predicate-coverage.js --tags static/readings-tagged.json
 *   node pipeline/measure-predicate-coverage.js --gaps        # expansion targets only
 *
 * WHY THIS REPLACES THE WISHLIST AFTER ROUND ONE
 *
 * wishlist.js is SUPPLY-driven: it collects whatever the reading pass reached
 * for. That is the right way to start and the wrong way to continue, because
 * what a model reaches for is measurably concentrated — 0 of 47 unprompted
 * recommendations came from E-Asia, S-Asia or Oceania. Iterating on it
 * converges to the closure of the model's own reach, which is a bigger corpus
 * carrying the same skew, now with thousands of films of apparent evidence
 * behind it.
 *
 * This tool is DEMAND-driven. It asks the opposite question: for each
 * predicament the corpus can name, does it hold enough films, across enough
 * traditions and enough decades, for a map on that predicament to travel
 * anywhere? A predicate held by four films that are all American and all
 * post-1990 is a dead end wearing a claim.
 *
 * The output is a set of targeted questions — "who else, anywhere, made a film
 * about a bond severed without a reason?" — which can be pointed at a specific
 * region deliberately. That is the only mechanism here that pushes AGAINST the
 * inherited skew rather than compounding it.
 *
 * A predicate is UNDERSPREAD when it fails any of:
 *   films   >= 6      below this it cannot rank, and every map on it is the same map
 *   regions >= 3      below this it cannot carry a viewer out of one tradition
 *   span    >= 30yr   below this it is a period style, not a predicament
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };

const MIN_FILMS = 6, MIN_REGIONS = 3, MIN_SPAN = 30;

const TAGS = opt("--tags", "pipeline/predicate-tags.seed.json");
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, "pipeline/predicates.json"), "utf8"));
const tagsrc = JSON.parse(fs.readFileSync(path.join(ROOT, TAGS), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static/corpus.json"), "utf8"));
const fps = JSON.parse(fs.readFileSync(path.join(ROOT, "static/fingerprints.json"), "utf8")).films;

const meta = new Map();
for (const f of Object.values(corpus.films)) meta.set(f.title, { year: f.year });
for (const f of Object.values(fps)) {
  const m = meta.get(f.title) || {};
  m.region = f.region || "Other";
  meta.set(f.title, m);
}

const V = new Map(vocab.predicates.map((p) => [p.id, p]));
const hold = new Map();   // predicate -> [{title, year, region}]
for (const [title, tags] of Object.entries(tagsrc.films)) {
  const m = meta.get(title) || {};
  for (const t of tags) {
    if (!hold.has(t.predicate)) hold.set(t.predicate, []);
    hold.get(t.predicate).push({ title, year: m.year, region: m.region || "Other" });
  }
}

const rows = [...V.keys()].map((id) => {
  const f = hold.get(id) || [];
  const years = f.map((x) => x.year).filter(Boolean);
  const regions = new Set(f.map((x) => x.region));
  const span = years.length > 1 ? Math.max(...years) - Math.min(...years) : 0;
  const fails = [];
  if (f.length < MIN_FILMS) fails.push(`films ${f.length}<${MIN_FILMS}`);
  if (regions.size < MIN_REGIONS) fails.push(`regions ${regions.size}<${MIN_REGIONS}`);
  if (span < MIN_SPAN) fails.push(`span ${span}y<${MIN_SPAN}`);
  return { id, label: V.get(id).label, films: f, regions, span, fails };
}).sort((a, b) => a.films.length - b.films.length || a.regions.size - b.regions.size);

const allRegions = new Set(Object.values(fps).map((f) => f.region || "Other"));
const pad = (s, n) => String(s).padEnd(n);

console.log(`\n  PREDICATE COVERAGE — ${TAGS}`);
console.log(`  ${Object.keys(tagsrc.films).length} films tagged, ${V.size} predicates in vocabulary`);
console.log(`  thresholds: >=${MIN_FILMS} films, >=${MIN_REGIONS} regions, >=${MIN_SPAN}y span\n`);

const bad = rows.filter((r) => r.fails.length);
console.log(`  ${rows.length - bad.length}/${rows.length} predicates are spread enough to carry a map.\n`);

if (!argv.includes("--gaps")) {
  console.log(`  ${pad("films", 7)}${pad("reg", 5)}${pad("span", 7)}predicate`);
  for (const r of rows) {
    console.log(`  ${pad(r.films.length, 7)}${pad(r.regions.size, 5)}${pad(r.span + "y", 7)}${r.id}${r.fails.length ? "   [" + r.fails.join(", ") + "]" : "   OK"}`);
  }
  console.log("");
}

console.log("  EXPANSION TARGETS — ask these against the regions listed, not in general\n");
for (const r of bad.slice(0, 20)) {
  const missing = [...allRegions].filter((x) => !r.regions.has(x));
  console.log(`  ${r.id}`);
  console.log(`    "${r.label}"`);
  console.log(`    has: ${r.films.map((f) => `${f.title} (${f.region})`).join(", ").slice(0, 96)}`);
  console.log(`    ask: which films from ${missing.slice(0, 4).join(", ")} turn on this?`);
  console.log("");
}

console.log(`  Feed the answers to wishlist.js's admission rule: harvest, read, keep`);
console.log(`  only what its own reading confirms. A targeted nomination is still a`);
console.log(`  nomination and still one-directional.\n`);
