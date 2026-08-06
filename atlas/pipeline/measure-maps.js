#!/usr/bin/env node
/* Measure what a map actually looks like, across every seed in the corpus.
 *
 *   node pipeline/measure-maps.js
 *
 * validate-corpus.js checks the graph. This checks the *experience*: what a
 * viewer sees when they type a title. A corpus can be well-formed, connected
 * and factually impeccable while every map it produces is six films by the
 * same director — which is precisely what the first record-only build did, and
 * nothing in the schema or the graph shape revealed it.
 *
 * Diversity here is not a preference. AGENTS.md rule 1 exists to stop the map
 * collapsing toward what the viewer already knows; these numbers are how you
 * tell whether it has.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));

/* resolver.js is an ES module and this is CommonJS; rather than add a build
   step for one script, load it and evaluate the two functions we need. */
const src = fs.readFileSync(path.join(ROOT, "static", "resolver.js"), "utf8");
const mod = { exports: {} };
new Function("module", "exports", src.replace(/export\s+(function|const)/g, "$1") +
  "\nmodule.exports = { resolve, normalise, lookup };")(mod, mod.exports);
const { resolve } = mod.exports;

const THRESHOLDS = {
  sameDirectorShare: 0.35,   // above this, maps are filmography tours
  singleTypeShare: 0.72,     // above this, the five-type grammar is decorative
  readingShare: 0.15,        // below this, nothing ever leaves the neighbourhood
};

const rows = [];
for (const key of Object.keys(corpus.films)) {
  const r = resolve(corpus, corpus.films[key].title, 6);
  if (!r || !r.links.length) continue;
  const seedDir = (corpus.films[key].director || "?").toLowerCase();
  const n = r.links.length;
  const same = r.links.filter((l) => (l.director || "!").toLowerCase() === seedDir).length;
  const types = {};
  r.links.forEach((l) => (types[l.type] = (types[l.type] || 0) + 1));
  const biggest = Math.max.apply(null, Object.values(types));
  const readings = r.links.filter((l) => l.source === "reading").length;
  const years = r.links.map((l) => l.year).filter(Boolean);
  const span = years.length ? Math.max.apply(null, years) - Math.min.apply(null, years) : 0;
  rows.push({
    key: key, title: corpus.films[key].title, n: n,
    sameDir: same / n, oneType: biggest / n, reading: readings / n,
    types: Object.keys(types).length, span: span,
  });
}

const avg = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
const pc = (x) => Math.round(x * 100) + "%";

console.log("maps measured            : " + rows.length);
console.log("avg map size             : " + avg((r) => r.n).toFixed(1) + " connections");
console.log("same director            : " + pc(avg((r) => r.sameDir)) +
  "   (target below " + pc(THRESHOLDS.sameDirectorShare) + ")");
console.log("single dominant type     : " + pc(avg((r) => r.oneType)) +
  "   (target below " + pc(THRESHOLDS.singleTypeShare) + ")");
console.log("interpretive edges        : " + pc(avg((r) => r.reading)) +
  "   (target above " + pc(THRESHOLDS.readingShare) + ")");
console.log("distinct types per map   : " + avg((r) => r.types).toFixed(2) + " of 5");
console.log("avg year span of a map   : " + Math.round(avg((r) => r.span)) + " years");

const monoculture = rows.filter((r) => r.sameDir >= 0.99);
console.log("maps that are 100% one director: " + monoculture.length +
  (monoculture.length ? "  (" + monoculture.slice(0, 5).map((r) => r.title).join(", ") + ")" : ""));

const fails = [];
if (avg((r) => r.sameDir) > THRESHOLDS.sameDirectorShare) fails.push("same-director share too high");
if (avg((r) => r.oneType) > THRESHOLDS.singleTypeShare) fails.push("one edge type dominates");
if (avg((r) => r.reading) < THRESHOLDS.readingShare) fails.push("interpretive edges are being ranked out");

console.log();
if (fails.length) { console.log("FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("PASS - maps are varied in author, type and era");
