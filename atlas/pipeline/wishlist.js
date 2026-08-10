#!/usr/bin/env node
/* wishlist.js — the films the corpus is missing, named by the corpus itself.
 *
 *   node pipeline/wishlist.js                              # from static/readings-pass.json
 *   node pipeline/wishlist.js --from pipeline/out/readings-demo.json
 *   node pipeline/wishlist.js --out pipeline/seeds-wishlist.txt --top 80
 *
 * THE RULE THIS HAS TO SURVIVE
 *
 * seeds.txt: "Grow this by CONNECTION DENSITY, not by count." expand-seeds.js
 * refuses reputation-driven growth outright, because "reputation is
 * uncorrelated with whether a film has a formal tie to anything already in the
 * corpus", and because a reputation list "quietly re-imports the canon bias
 * that AGENTS rule 1 exists to prevent".
 *
 * A nomination from the reading pass is NOT reputation — it arrives with a
 * stated reason, naming a predicament shared with a specific corpus film. That
 * is a connection-density signal on a different axis from expand-seeds.js's
 * shared-hand signal, and it satisfies the same rule: a nominated film is
 * connected by construction to the film that named it.
 *
 * But the mechanism is still measurably canon-biased in WHICH films it reaches
 * for. On 47 unprompted recommendations: 43% named films absent from the
 * corpus, and none came from E-Asia, S-Asia or Oceania — 7% of it. Growing the
 * corpus from raw nomination frequency would amplify that, not correct it. So:
 *
 *   1. Rank by DISTINCT NOMINATORS x DISTINCT PREDICAMENTS, never raw count —
 *      the same device expand-seeds.js uses when it ranks by how many distinct
 *      corpus films a candidate reaches. A film named nine times for one
 *      situation is one connection repeated; named three times across three
 *      situations, it is embedded.
 *   2. Report the region and era profile of the NOMINATING films, so the skew
 *      being inherited is visible before the harvest runs. This tool cannot fix
 *      that skew — it does not know an absent film's region — so it prints it
 *      and expects the operator to counterweight the batch deliberately from
 *      expand-seeds.js, which derives candidates from the corpus rather than
 *      from anybody's recall.
 *
 * A NOMINATION IS A CANDIDATE, NOT AN ADMISSION
 *
 * The nomination is one-directional: film A's reading claims a bond with film
 * B, and B has not spoken. Harvest the candidate, run readings.js on it, and
 * keep it only if B's OWN reading produces a predicament that co-occurs with
 * something already present. That turns an asymmetric claim into a symmetric,
 * checkable one — and if it fails, the nomination was the model reaching for a
 * famous title, which is precisely what this must not import.
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };

const FROM = opt("--from", "static/readings-pass.json");
const TOP = parseInt(opt("--top", 60), 10);
const OUT = opt("--out", null);

const norm = (s) => String(s || "")
  .toLowerCase()
  .replace(/\s*\(\d{4}\)\s*$/, "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/^(the|a|an|le|la|les|el|il|der|die|das)\s+/, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static/corpus.json"), "utf8"));
const fps = JSON.parse(fs.readFileSync(path.join(ROOT, "static/fingerprints.json"), "utf8")).films;
const regionOf = new Map(Object.values(fps).map((f) => [f.title, f.region || "Other"]));

const present = new Set();
for (const f of Object.values(corpus.films)) present.add(norm(f.title));
const aliasPath = path.join(__dirname, "out", "film-aliases.json");
if (fs.existsSync(aliasPath)) {
  const al = JSON.parse(fs.readFileSync(aliasPath, "utf8"));
  const walk = (v) => {
    if (typeof v === "string") present.add(norm(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(al);
}

const src = JSON.parse(fs.readFileSync(path.join(ROOT, FROM), "utf8"));
const readings = src.films || [];

/* ------------------------------------------------------------- collect */

const cand = new Map();          // norm -> record
const nominators = [];           // titles that did the naming

for (const r of readings) {
  const rel = r.relatives || [];
  if (rel.length) nominators.push(r.title);
  for (const x of rel) {
    const title = typeof x === "string" ? x : x.title;
    if (!title) continue;
    const n = norm(title);
    if (!n || present.has(n)) continue;
    if (!cand.has(n)) cand.set(n, { title, byFilm: new Set(), reasons: new Set(), examples: [] });
    const c = cand.get(n);
    c.byFilm.add(r.title);
    const why = (typeof x === "object" && x.shares) ? x.shares : null;
    if (why) { c.reasons.add(norm(why).slice(0, 60)); if (c.examples.length < 3) c.examples.push({ from: r.title, why }); }
  }
}

/* Titles that will fight the resolver. STATE.md: unfiltered title search returns
   a genus of molluscs for "Vertigo" and a video game for "Alien", and the
   failures cluster on the most canonical titles. Anything short or generic gets
   flagged so it is written into seeds.txt WITH a year, which the seed format
   already calls "strongly preferred". */
const ambiguous = (t) => {
  const w = t.trim().split(/\s+/);
  return w.length <= 2 || /^(the )?(alien|vertigo|solaris|heat|drive|it|up|her|m|persona|contact)$/i.test(t.trim());
};

const scored = [...cand.values()].map((c) => ({
  title: c.title,
  nominators: c.byFilm.size,
  distinctReasons: Math.max(1, c.reasons.size),
  score: c.byFilm.size * Math.max(1, c.reasons.size),
  examples: c.examples,
  flag: ambiguous(c.title) ? "needs (year)" : "",
})).sort((a, b) => b.score - a.score || b.nominators - a.nominators);

/* ------------------------------------------------------------- report */

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n  WISHLIST — from ${FROM}`);
console.log(`  ${readings.length} readings, ${nominators.length} of them naming anything`);
console.log(`  ${cand.size} distinct films named that the corpus does not have\n`);

const regs = {};
for (const t of nominators) { const r = regionOf.get(t) || "Other"; regs[r] = (regs[r] || 0) + 1; }
const totalN = nominators.length || 1;
const base = {};
for (const f of Object.values(corpus.films)) { const r = regionOf.get(f.title) || "Other"; base[r] = (base[r] || 0) + 1; }
const totalB = Object.values(base).reduce((a, b) => a + b, 0);

console.log("  SKEW BEING INHERITED — region of the films doing the naming");
console.log(`  ${pad("region", 12)}${pad("corpus", 9)}${pad("nominating", 12)}lift`);
for (const r of Object.keys(base).sort((a, b) => base[b] - base[a])) {
  const b = 100 * base[r] / totalB, m = 100 * (regs[r] || 0) / totalN;
  const lift = b ? m / b : 0;
  console.log(`  ${pad(r, 12)}${pad(b.toFixed(1) + "%", 9)}${pad(m.toFixed(1) + "%", 12)}${lift ? lift.toFixed(1) + "x" : "0.0x"}${lift === 0 ? "   <- unreached" : lift > 1.5 ? "   <- amplified" : ""}`);
}
console.log("\n  This tool cannot correct that: it does not know an absent film's region.");
console.log("  Counterweight the batch from expand-seeds.js, which derives candidates");
console.log("  from the corpus rather than from recall.\n");

console.log(`  TOP ${Math.min(TOP, scored.length)} CANDIDATES — ranked by nominators x distinct reasons\n`);
console.log(`  ${pad("score", 7)}${pad("nom", 5)}${pad("why", 5)}title`);
scored.slice(0, TOP).forEach((c) => {
  console.log(`  ${pad(c.score, 7)}${pad(c.nominators, 5)}${pad(c.distinctReasons, 5)}${c.title}${c.flag ? "   [" + c.flag + "]" : ""}`);
  if (c.examples[0]) console.log(`         ${c.examples[0].from} -> ${c.examples[0].why}`.slice(0, 100));
});

if (OUT) {
  const lines = [
    "# Wishlist — films named by the reading pass that the corpus does not have.",
    "# Ranked by DISTINCT nominators x DISTINCT reasons, never raw frequency.",
    "#",
    "# These are CANDIDATES. Harvest, run readings.js on them, and keep only the",
    "# ones whose own reading co-occurs with something already present. A",
    "# nomination that does not survive that check was the model reaching for a",
    "# famous title.",
    "#",
    `# generated ${new Date().toISOString()} from ${FROM}`,
    "",
    ...scored.slice(0, TOP).map((c) => `${c.title}${c.flag ? "   # needs a (year) — resolver will refuse rather than guess" : ""}`),
    "",
  ];
  fs.writeFileSync(path.join(ROOT, OUT), lines.join("\n"));
  console.log(`\n  wrote ${Math.min(TOP, scored.length)} candidates -> ${OUT}\n`);
}
