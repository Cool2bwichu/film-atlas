#!/usr/bin/env node
/* audit-tags-basis.js — is the BASIS specific, or is it the label again?
 *
 *   node pipeline/audit-tags-basis.js pipeline/out/predicate-tags-shard0.json
 *
 * The basis is the field a claim gets written from. A basis that restates the
 * predicate label carries no information the predicate id did not already carry,
 * so the tag is unusable even when the classification is right. Two cheap
 * mechanical proxies, neither of which is a substitute for reading a sample:
 *
 *   overlap  — content-word Jaccard between basis and label. High means the
 *              basis is the label rephrased.
 *   grounded — does the basis name something only this film has: a capitalised
 *              word that is not the first word of the sentence.
 *
 * Both are proxies. A basis can be specific with no proper nouns (a film whose
 * plot section names nobody) and generic with several. Read the flagged ones.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const file = process.argv[2];
if (!file) { console.error("usage: audit-tags-basis.js <shard.json>"); process.exit(2); }
const d = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const vocab = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "predicates-frozen.json"), "utf8"));
const label = new Map(vocab.predicates.map((p) => [p.id, p.label]));

const STOP = new Set("a an the of to in on and or that this it its one party other another who whom which is are was were be been being for with by from as at not no their them they he she his her".split(" "));
const words = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

const rows = [];
for (const f of d.films) for (const t of f.tags) {
  const a = new Set(words(t.basis)), b = new Set(words(label.get(t.predicate) || ""));
  const inter = [...b].filter((w) => a.has(w)).length;
  const overlap = inter / (new Set([...a, ...b]).size || 1);
  const grounded = /\s[A-Z][a-z]/.test(" " + t.basis.replace(/^[^.]*?\b/, (m) => m)) && /(?!^)\b[A-Z][a-z]+/.test(t.basis.slice(1));
  rows.push({ film: f.title, predicate: t.predicate, overlap, grounded, len: t.basis.split(/\s+/).length, basis: t.basis });
}

const n = rows.length;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
console.log(`\n  ${n} tags audited`);
console.log(`  mean basis length          ${mean(rows.map((r) => r.len)).toFixed(1)} words`);
console.log(`  mean basis/label overlap   ${mean(rows.map((r) => r.overlap)).toFixed(3)}`);
console.log(`  names a proper noun        ${rows.filter((r) => r.grounded).length}/${n} (${(rows.filter((r) => r.grounded).length / n * 100).toFixed(1)}%)`);
console.log(`  overlap > 0.35             ${rows.filter((r) => r.overlap > 0.35).length}`);
console.log(`  under 12 words             ${rows.filter((r) => r.len < 12).length}`);

console.log(`\n  TEN MOST LABEL-LIKE BASES (highest overlap) — read these`);
rows.sort((a, b) => b.overlap - a.overlap).slice(0, 10).forEach((r, i) =>
  console.log(`   ${i + 1}. ${r.overlap.toFixed(2)}  ${r.film} / ${r.predicate}\n        ${r.basis}`));
console.log();
