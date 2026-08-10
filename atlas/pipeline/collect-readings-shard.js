#!/usr/bin/env node
/* collect-readings-shard.js — rebuild ONE shard's reading-pass output from the
 * per-batch cache in pipeline/.cache-readings/, without touching
 * static/readings-pass.json.
 *
 *   node pipeline/collect-readings-shard.js --cohort pipeline/predicate-cohort-300.shard0.txt \
 *        --out pipeline/out/readings-pass-shard0.json
 *
 * WHY THIS EXISTS. readings.js has no --out flag: it always writes
 * static/readings-pass.json. Four shard agents running concurrently therefore
 * race on one file and the last writer wins. The CACHE does not race — it is
 * keyed on PROMPT_VERSION plus the batch's joined titles, so two shards that
 * never share a batch never share a key. This reads the cache back through
 * readings.js's own loader and batching logic and emits exactly the shard.
 *
 * It makes no model call and it modifies nothing readings.js owns.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PLOTS = path.join(__dirname, "out", "plots.json");
const CACHE = path.join(__dirname, ".cache-readings");

// Mirrored from readings.js. If either moves there, it must move here.
const BATCH_SIZE = 6;
const PROMPT_VERSION = "readings-prompt-2";
const MODEL = "claude-opus-5";

const a = process.argv.slice(2);
let cohort = null, out = null, promptVersion = PROMPT_VERSION;
for (let i = 0; i < a.length; i++) {
  if (a[i] === "--cohort") cohort = a[++i];
  else if (a[i] === "--out") out = a[++i];
  else if (a[i] === "--prompt-version") promptVersion = a[++i];
  else { console.error("unknown flag: " + a[i]); process.exit(2); }
}
if (!cohort || !out) { console.error("need --cohort and --out"); process.exit(2); }

const p = JSON.parse(fs.readFileSync(PLOTS, "utf8"));
let films = Object.values(p.films).filter((f) => f && f.title).map((f) => ({
  title: f.title, year: f.year, filmId: f.filmId, region: f.region,
  plot: f.admitted ? f.plot : null, withheld: f.withheld || null,
}));
const want = new Set(fs.readFileSync(path.join(ROOT, cohort), "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
films = films.filter((f) => want.has(f.title));

const withPlot = films.filter((f) => f.plot && f.plot.length);
const nulls = films.filter((f) => !f.plot || !f.plot.length);
const batches = [];
for (let i = 0; i < withPlot.length; i += BATCH_SIZE) batches.push(withPlot.slice(i, i + BATCH_SIZE));

const results = [];
const missing = [];
batches.forEach((batch, bi) => {
  const key = path.join(CACHE, `${promptVersion}-${batch.map((f) => f.title).join("|").replace(/[^\w]+/g, "_").slice(0, 120)}.json`);
  if (!fs.existsSync(key)) { missing.push(batch.map((f) => f.title)); return; }
  const rows = JSON.parse(fs.readFileSync(key, "utf8"));
  // Stamp the batch this film was actually read in. Output order is completion
  // order under concurrency, so it cannot be recovered downstream — and the
  // within-batch vs cross-batch split is the number that predicts a sharded
  // pass, so guessing it from row order would fabricate cross-batch reuse.
  rows.forEach((r) => { r.batch = bi; });
  results.push(...rows);
});
for (const f of nulls) results.push({ title: f.title, year: f.year, engine: null, predicaments: [], relatives: [], source: "reading", plotChars: 0, belowFloor: true });

fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true });
fs.writeFileSync(path.join(ROOT, out), JSON.stringify({
  version: 1, promptVersion, model: MODEL, source: "reading",
  shard: { cohort, films: films.length, withPlot: withPlot.length, belowFloor: nulls.length, batches: batches.length, batchesMissing: missing.length },
  note: "One shard of Pass A, rebuilt from pipeline/.cache-readings/. Predicaments are free text on purpose. `relatives` is NOT an edge list — see readings.js. Nothing here is clustered; that is Pass B.",
  generated: new Date().toISOString(),
  films: results,
}, null, 1));

console.log(`  ${films.length} cohort films, ${withPlot.length} with plot, ${nulls.length} below floor`);
console.log(`  ${batches.length} batches, ${batches.length - missing.length} present in cache, ${missing.length} MISSING`);
missing.forEach((m) => console.log(`    MISSING: ${m.join(" | ")}`));
console.log(`  wrote ${results.length} readings -> ${out}`);
