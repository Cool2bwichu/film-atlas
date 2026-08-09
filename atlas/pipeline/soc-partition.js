#!/usr/bin/env node
/* The writable surface, and this writer's third of it.
 *
 *   node pipeline/soc-partition.js            # list this writer's films
 *   node pipeline/soc-partition.js --film "in the mood for love"
 *
 * The audit reported Senses of Cinema reaching 813 of the 2,204 films. That
 * set was not cached with the audit, so it is reconstructed here by ranking
 * every reached film on depth of coverage -- how many essays are ABOUT it,
 * then total mention weight, then key -- and taking the top 813. Deterministic
 * from the cache, and the ordering is stable under a re-harvest.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ix = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "soc-index.json"), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));

const SURFACE = 813;
const WRITERS = 3;
const ME = 0;

const ranked = Object.entries(ix.films)
  .map(([k, l]) => ({
    k,
    about: l.filter((e) => e.about).length,
    w: l.reduce((a, e) => a + e.w, 0),
    list: l,
  }))
  .sort((a, b) => (b.about - a.about) || (b.w - a.w) || (a.k < b.k ? -1 : 1))
  .slice(0, SURFACE);

const surfaceKeys = ranked.map((r) => r.k).sort();
const mine = surfaceKeys.filter((_, i) => i % WRITERS === ME);

const arg = process.argv.indexOf("--film");
if (arg > -1) {
  const key = process.argv[arg + 1];
  const entry = ix.films[key];
  if (!entry) { console.error("no SOC coverage for " + key); process.exit(1); }
  const f = corpus.films[key];
  console.log("=== " + f.title + " (" + f.year + ", " + f.director + ")  [" + key + "]");
  const limit = Number(process.argv[process.argv.indexOf("--chars") + 1]) || 9000;
  for (const e of entry.slice(0, Number(process.argv[process.argv.indexOf("--n") + 1]) || 3)) {
    const p = ix.posts[e.id];
    console.log("\n--- " + (e.about ? "[ABOUT] " : "") + p.title + "  (" + p.date + ", " + p.words + "w)\n" + p.link);
    console.log(p.text.slice(0, limit));
  }
  process.exit(0);
}

if (process.argv.includes("--all")) {
  console.log(surfaceKeys.join("\n"));
  process.exit(0);
}

console.log("surface " + surfaceKeys.length + "  mine " + mine.length);
for (const k of mine) {
  const f = corpus.films[k];
  const r = ranked.find((x) => x.k === k);
  console.log([k, f.year, f.director, "about=" + r.about, "w=" + r.w].join("\t"));
}
