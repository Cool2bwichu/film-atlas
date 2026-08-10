#!/usr/bin/env node
/* measure-tags-shard.js — report one Pass C shard without touching it.
 *
 *   node pipeline/measure-tags-shard.js pipeline/out/predicate-tags-shard0.json
 *
 * Reports only what the shard measures. Prevalence against the 0.4-8% band is
 * NOT reported here: the band is defined over the whole corpus and a 100-film
 * shard cannot see it. Cut the band after all three shards and the full pass.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const file = process.argv[2];
if (!file) { console.error("usage: measure-tags-shard.js <shard.json>"); process.exit(2); }
const d = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const vocab = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "predicates-frozen.json"), "utf8"));
const label = new Map(vocab.predicates.map((p) => [p.id, p.label]));

const readable = d.films.filter((f) => !f.belowFloor);
const nTags = readable.reduce((s, f) => s + f.tags.length, 0);
const none = readable.filter((f) => f.tags.length === 0);

const counts = new Map();
const outcomes = new Map();
const cents = [];
for (const f of readable) for (const t of f.tags) {
  counts.set(t.predicate, (counts.get(t.predicate) || 0) + 1);
  outcomes.set(t.outcome, (outcomes.get(t.outcome) || 0) + 1);
  cents.push(t.centrality);
}
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const hist = new Map();
for (const f of readable) hist.set(f.tags.length, (hist.get(f.tags.length) || 0) + 1);

console.log(`\n  ${file}  —  vocabulary ${d.vocabulary}`);
console.log(`  films in shard        ${d.films.length}   (readable ${readable.length}, below floor ${d.films.length - readable.length})`);
console.log(`  tags                  ${nTags}`);
console.log(`  mean tags / film      ${(nTags / readable.length).toFixed(2)}   median ${[...readable.map((f) => f.tags.length)].sort((a, b) => a - b)[Math.floor(readable.length / 2)]}`);
console.log(`  none of these         ${none.length}/${readable.length}  (${(none.length / readable.length * 100).toFixed(1)}%)`);
console.log(`  predicates fired      ${counts.size}/${vocab.predicateCount}   never fired ${vocab.predicateCount - counts.size}`);
console.log(`  rejected tags         ${(d.rejected || []).length}`);
console.log(`  mean centrality       ${(cents.reduce((a, b) => a + b, 0) / cents.length).toFixed(2)}`);
console.log(`  outcomes              ${[...outcomes.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("  ")}`);

console.log(`\n  TAGS PER FILM`);
[...hist.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, v]) => console.log(`    ${String(k).padStart(2)} tags  ${String(v).padStart(3)} films  ${"#".repeat(v)}`));

console.log(`\n  TEN THAT FIRED MOST`);
ranked.slice(0, 10).forEach(([id, n], i) =>
  console.log(`   ${String(i + 1).padStart(2)}. ${String(n).padStart(3)} films  ${id}\n        ${label.get(id)}`));

const rare = ranked.filter(([, n]) => n > 0).slice(-10).reverse();
console.log(`\n  TEN THAT FIRED LEAST (of the ${counts.size} that fired at all)`);
rare.forEach(([id, n], i) => console.log(`   ${String(i + 1).padStart(2)}. ${String(n).padStart(3)} film${n === 1 ? "" : "s"}   ${id}`));

const silent = vocab.predicates.map((p) => p.id).filter((id) => !counts.has(id));
console.log(`\n  ${silent.length} PREDICATES FIRED ZERO TIMES IN THIS SHARD`);
console.log(`    ${silent.join(", ")}`);

console.log(`\n  FILMS THAT CARRY NOTHING`);
none.forEach((f) => console.log(`    ${f.title} (${f.year}) — ${f.plotChars} plot chars`));
console.log();
