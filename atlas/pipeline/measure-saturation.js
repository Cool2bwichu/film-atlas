#!/usr/bin/env node
/* measure-saturation.js — the gate that decides whether the reading pass's
 * predicament grain is usable, BEFORE anyone spends calls on a 300-film cohort.
 *
 *   node pipeline/measure-saturation.js
 *   node pipeline/measure-saturation.js --in static/readings-pass.json
 *   node pipeline/measure-saturation.js --json pipeline/out/saturation.json
 *
 * THE QUESTION
 *
 * The reading pass generates free text on purpose — the controlled vocabulary
 * is mined from the readings afterwards, not authored before. That only works
 * if the phrases COLLIDE. If every film invents a new phrasing for the same
 * handful of human situations, the clustering step has nothing to cluster and
 * the layer produces zero edges.
 *
 * So: plot distinct predicament phrases against films read, cumulatively. A
 * curve that flattens means the pass is converging on a shared grain. A curve
 * that climbs linearly at ~(phrases per film) means the pass is generating one
 * private vocabulary per film.
 *
 * NORMALISATION IS THE WHOLE ANSWER, so this tool reports four levels rather
 * than picking one and hiding it. See NORMALISERS below. The mandated level is
 * N2 and it is the one the verdict is read from; the others are there so the
 * reader can see how much of the answer is the normaliser's doing.
 *
 * ORDER MATTERS TOO. The cumulative curve depends on which film is read first,
 * so the headline curve is a RAREFACTION: the mean over `--perms` random
 * orderings of the same films, which is order-independent. The as-read order is
 * printed beside it.
 *
 * This tool measures. It does not tune. If the curve disappoints, the
 * disappointing number is the result.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/* ------------------------------------------------------------------ args */

function args() {
  const a = process.argv.slice(2);
  const o = { in: "static/readings-pass.json", json: null, perms: 400, seed: 20260810, top: 10 };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === "--in") o.in = a[++i];
    else if (k === "--json") o.json = a[++i];
    else if (k === "--perms") o.perms = parseInt(a[++i], 10);
    else if (k === "--seed") o.seed = parseInt(a[++i], 10);
    else if (k === "--top") o.top = parseInt(a[++i], 10);
    else if (k === "--help" || k === "-h") { console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]); process.exit(0); }
    else { console.error("unknown flag: " + k); process.exit(2); }
  }
  return o;
}

/* ------------------------------------------------------- normalisers */

const ARTICLES = new Set(["a", "an", "the"]);

// Function words that carry no situational content. Deliberately conservative:
// verbs and nouns are never dropped, only grammar.
const STOP = new Set([
  "a", "an", "the", "and", "or", "but", "so", "as", "of", "to", "in", "on", "at",
  "by", "for", "from", "with", "without", "into", "onto", "over", "under", "than",
  "then", "that", "which", "who", "whom", "whose", "what", "it", "its", "is",
  "are", "was", "were", "be", "been", "being", "has", "have", "had", "not", "no",
  "nor", "do", "does", "did", "will", "would", "can", "could", "may", "might",
  "must", "shall", "should", "their", "them", "they", "there", "his", "her",
  "hers", "him", "he", "she", "you", "your", "i", "we", "our", "us", "this",
  "these", "those", "up", "down", "out", "off", "about", "after", "before",
  "while", "when", "where", "how", "why", "if", "because", "both", "each",
  "other", "another", "same", "own", "very", "just", "only", "also", "still",
  "any", "all", "some", "more", "most", "such", "s",
]);

const strip = (s) =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-");

const n0 = (s) => strip(s).replace(/\s+/g, " ").trim();

/* N1 — lowercase, punctuation stripped, whitespace collapsed. */
const n1 = (s) => strip(s).toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();

/* N2 — THE MANDATED LEVEL. N1 plus the articles a/an/the removed.
 * "lowercase, strip articles and punctuation" and nothing else: word order is
 * preserved, no stemming, no stopword removal, no synonym folding. Two phrases
 * are the same at N2 only if the model wrote the same words in the same order. */
const n2 = (s) => n1(s).split(" ").filter((w) => w && !ARTICLES.has(w)).join(" ");

/* Light stemmer for N3. Suffix-only, no dictionary; it exists to stop
 * "ends"/"ending"/"ended" counting as three different situations. */
function stem(w) {
  if (w.length <= 3) return w;
  // No -er/-ers rule: it turns "other" into "oth" and "slaughter" into
  // "slaught", which collides words that are not related at all.
  for (const [suf, min] of [["ing", 5], ["ies", 5], ["ied", 5], ["ed", 4], ["es", 4], ["s", 4]]) {
    if (w.length < min || !w.endsWith(suf)) continue;
    // "homes"/"leaves" lose only the s; "watches"/"boxes" lose the whole "es".
    if (suf === "es" && !/[sxzh]es$/.test(w)) return w.slice(0, -1);
    let base = w.slice(0, -suf.length);
    if (suf === "ies" || suf === "ied") base += "y";
    // "stopped" -> "stop", but never "tell" -> "tel" or "pass" -> "pas".
    if (base.length >= 4 && /([^aeioulsfz])\1$/.test(base)) base = base.slice(0, -1);
    return base;
  }
  return w;
}

/* N3 — content key. N2 plus stopwords dropped, tokens stemmed, deduped and
 * SORTED. Word order is destroyed on purpose: this asks "are these the same
 * content words rearranged?", which is a floor on what clustering could reach
 * by lexical means alone. It is NOT the mandated level and the verdict is not
 * read from it. */
const n3 = (s) => [...new Set(n2(s).split(" ").map(stem).filter((w) => w && !STOP.has(w)))].sort().join(" ");

const NORMALISERS = [
  ["N0 raw", n0, "whitespace collapsed only — exactly what the model wrote"],
  ["N1 lower+punct", n1, "lowercase, punctuation -> space, whitespace collapsed"],
  ["N2 MANDATED", n2, "N1 plus articles a/an/the dropped; word order kept, no stemming"],
  ["N3 content key", n3, "N2 plus stopwords dropped, stemmed, deduped, sorted (order destroyed)"],
];

/* ------------------------------------------------------- content sets */

const contentSet = (s) => new Set(n2(s).split(" ").map(stem).filter((w) => w && !STOP.has(w)));

function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/* Greedy leader clustering over content sets. Deterministic: phrases are
 * visited most-frequent first, ties broken alphabetically, and each joins the
 * FIRST leader it is within `t` of. Single-link chaining is avoided by
 * comparing only against leaders. This is a proxy for what pass B would find by
 * lexical means; a real canonicalisation is editorial and does better. */
function cluster(phrases, t) {
  const counts = new Map();
  for (const p of phrases) counts.set(p, (counts.get(p) || 0) + 1);
  const uniq = [...counts.keys()].sort((a, b) => (counts.get(b) - counts.get(a)) || (a < b ? -1 : 1));
  const leaders = [];
  const assign = new Map();
  for (const p of uniq) {
    const set = contentSet(p);
    let hit = -1;
    for (let i = 0; i < leaders.length; i++) if (jaccard(set, leaders[i].set) >= t) { hit = i; break; }
    if (hit < 0) { leaders.push({ label: p, set, members: [p], n: counts.get(p) }); assign.set(p, leaders.length - 1); }
    else { leaders[hit].members.push(p); leaders[hit].n += counts.get(p); assign.set(p, hit); }
  }
  return { leaders, assign };
}

/* ------------------------------------------------------- curves */

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** cumulative distinct-key count after each film, for one ordering */
function curveFor(order, keysByFilm) {
  const seen = new Set();
  return order.map((i) => { for (const k of keysByFilm[i]) seen.add(k); return seen.size; });
}

/** rarefaction: mean cumulative curve over `perms` random orderings */
function rarefy(keysByFilm, perms, rnd) {
  const n = keysByFilm.length;
  const sum = new Array(n).fill(0);
  const idx = keysByFilm.map((_, i) => i);
  for (let p = 0; p < perms; p++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const c = curveFor(idx, keysByFilm);
    for (let i = 0; i < n; i++) sum[i] += c[i];
  }
  return sum.map((v) => v / perms);
}

/* ------------------------------------------------------------------ run */

const o = args();
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, o.in), "utf8"));
const films = raw.films || [];

const readable = films.filter((f) => f.plotChars > 0 && !f.belowFloor);
const scored = films.filter((f) => (f.predicaments || []).length > 0);
const belowFloor = films.filter((f) => f.belowFloor || f.plotChars === 0);
const readableEmpty = readable.filter((f) => (f.predicaments || []).length === 0);

const allPhrases = films.flatMap((f) => (f.predicaments || []).map((p) => p.situation)).filter((s) => typeof s === "string" && s.trim());

console.log(`\n  SATURATION — ${path.relative(ROOT, path.join(ROOT, o.in))}`);
console.log(`  prompt ${raw.promptVersion}, model ${raw.model}`);
console.log(`  ${films.length} films in file · ${readable.length} readable · ${belowFloor.length} below floor · ${readableEmpty.length} readable but returned nothing`);
console.log(`  ${allPhrases.length} predicament phrases, ${(allPhrases.length / (scored.length || 1)).toFixed(2)} per film that returned any\n`);

/* ---- distinctness by normaliser ---- */
console.log("  DISTINCTNESS BY NORMALISER (all phrases pooled)");
console.log("  " + "level".padEnd(18) + "distinct".padStart(9) + "  of".padStart(5) + "   reuse   note");
const byLevel = {};
for (const [name, fn, note] of NORMALISERS) {
  const keys = allPhrases.map(fn);
  const d = new Set(keys).size;
  byLevel[name] = { distinct: d, keys };
  const reuse = 1 - d / allPhrases.length;
  console.log(`  ${name.padEnd(18)}${String(d).padStart(9)}${String(allPhrases.length).padStart(7)}   ${(reuse * 100).toFixed(1).padStart(5)}%   ${note}`);
}

/* ---- the curve, per normaliser, at the requested checkpoints ---- */
//
// TWO SCOPES, because they answer different questions and one of them lies.
//
//   ALL   — every cohort film in file order. A below-floor film contributes an
//           empty phrase set, so it flattens the curve WITHOUT the grain having
//           improved. This is the honest "what does 24 films of budget buy you"
//           curve, and the checkpoints 6/12/24/36/48/60 are stated on it.
//   READ  — readable films only. This is the grain question with the coverage
//           ceiling removed. Read the verdict from this one.
//
const CHECK = [6, 12, 24, 36, 48, 60];
const WIN = [[1, 12], [13, 24], [25, 36], [37, 48], [49, 60]];
const SCOPES = [
  ["ALL  cohort", films],
  ["READ readable", films.filter((f) => (f.plotChars || 0) > 0 && !f.belowFloor)],
];

const table = {};
const slopes = {};
for (const [scopeName, set] of SCOPES) {
  console.log(`\n  CUMULATIVE DISTINCT PHRASES vs FILMS READ — ${scopeName} (n=${set.length})`);
  const order = set.map((_, i) => i);
  for (const [name, fn] of NORMALISERS) {
    const keysByFilm = set.map((f) => new Set((f.predicaments || []).map((p) => fn(p.situation || "")).filter(Boolean)));
    const asRead = curveFor(order, keysByFilm);
    const rare = rarefy(keysByFilm, o.perms, mulberry(o.seed));
    table[scopeName + "|" + name] = { asRead, rare };
    const cells = CHECK.map((k) => {
      if (k > asRead.length) return "  —  ";
      return `${String(asRead[k - 1]).padStart(3)}/${rare[k - 1].toFixed(0).padStart(3)}`;
    });
    console.log(`  ${name.padEnd(18)}` + CHECK.map((k, i) => `${String(k).padStart(3)}f:${cells[i]}`).join("  "));
  }
  console.log("  (cells are as-read / rarefaction-mean over " + o.perms + " orderings)");

  console.log(`  NEW DISTINCT PHRASES PER FILM by window, rarefaction — ${scopeName}`);
  console.log("  " + "level".padEnd(18) + WIN.map(([a, b]) => `${a}-${b}`.padStart(8)).join("") + "   last/first");
  for (const [name] of NORMALISERS) {
    const r = table[scopeName + "|" + name].rare;
    const vals = WIN.map(([a, b]) => {
      const hi = Math.min(b, r.length);
      if (a > r.length) return null;
      const lo = a === 1 ? 0 : r[a - 2];
      return (r[hi - 1] - lo) / (hi - a + 1);
    });
    slopes[scopeName + "|" + name] = vals;
    const last = [...vals].reverse().find((v) => v != null);
    const ratio = vals[0] ? last / vals[0] : null;
    console.log(`  ${name.padEnd(18)}` + vals.map((v) => (v == null ? "     —  " : v.toFixed(2).padStart(8))).join("") + "   " + (ratio == null ? "—" : ratio.toFixed(2)));
  }
}

/* ---- WITHIN-BATCH vs CROSS-BATCH reuse — the number that predicts a shard ----
 *
 * readings.js sends BATCH_SIZE films in one prompt, and the prompt asks the
 * model to reuse a phrase when two films in front of it share a situation. That
 * instruction can only operate inside a batch. So a headline reuse figure can be
 * entirely an artifact of batching and vanish the moment the pass is sharded
 * across agents that never see each other's films.
 *
 * CROSS-BATCH reuse is therefore the honest number: it is what the 300-film pass
 * across four shard agents would actually get. Within-batch reuse is real but it
 * does not scale — it is bounded by BATCH_SIZE and it is not evidence about the
 * corpus.
 *
 * Batches are contiguous in the output (a worker pushes a whole parsed batch at
 * once) and each film carries its 1-based position `n` within its batch, so a
 * batch boundary is n===1. Falls back to fixed chunks if `n` is missing.
 */
{
  let b = -1;
  const batchOf = new Map();
  const hasN = films.some((f) => f.n === 1);
  films.forEach((f, i) => {
    if (hasN) { if (f.n === 1) b++; } else if (i % 6 === 0) b++;
    if (!f.belowFloor && (f.plotChars || 0) > 0) batchOf.set(f.title, b);
  });
  const nBatches = new Set(batchOf.values()).size;

  const byPhrase = new Map();
  for (const f of films) {
    if (!batchOf.has(f.title)) continue;
    for (const pr of f.predicaments || []) {
      const k = n2(pr.situation || "");
      if (!k) continue;
      if (!byPhrase.has(k)) byPhrase.set(k, new Set());
      byPhrase.get(k).add(f.title);
    }
  }
  let shared = 0, withinOnly = 0, crossB = 0;
  const crossExamples = [];
  for (const [k, set] of byPhrase) {
    if (set.size < 2) continue;
    shared++;
    const bs = new Set([...set].map((t) => batchOf.get(t)));
    if (bs.size > 1) { crossB++; crossExamples.push([k, [...set]]); } else withinOnly++;
  }
  // phrase instances that land on a phrase some OTHER batch also used
  let crossInstances = 0, total = 0;
  for (const f of films) {
    if (!batchOf.has(f.title)) continue;
    for (const pr of f.predicaments || []) {
      const k = n2(pr.situation || "");
      if (!k) continue;
      total++;
      const set = byPhrase.get(k);
      if (set && new Set([...set].map((t) => batchOf.get(t))).size > 1) crossInstances++;
    }
  }
  console.log(`\n  WITHIN-BATCH vs CROSS-BATCH REUSE — ${nBatches} batches of readable films`);
  console.log(`  phrases used by more than one film: ${shared}`);
  console.log(`    shared only inside one batch : ${withinOnly}   (bounded by BATCH_SIZE — does NOT scale, and does NOT survive sharding)`);
  console.log(`    shared ACROSS batches        : ${crossB}   <- the number a sharded 300-film pass would get`);
  console.log(`  cross-batch reuse rate: ${(crossInstances / (total || 1) * 100).toFixed(1)}% of ${total} phrase instances`);
  crossExamples.slice(0, 10).forEach(([k, t]) => console.log(`    + ${k.slice(0, 78)}  <- ${t.join(" | ").slice(0, 60)}`));
}

/* ---- concept clusters: what pass B would have to work with ---- */
console.log("\n  LEXICAL CLUSTERING (diagnostic, NOT the verdict instrument)");
for (const t of [0.5, 0.6]) {
  const { leaders } = cluster(allPhrases, t);
  const multi = leaders.filter((l) => l.n > 1).length;
  const covered = leaders.filter((l) => l.n > 1).reduce((s, l) => s + l.n, 0);
  console.log(`  jaccard>=${t}: ${leaders.length} clusters over ${allPhrases.length} phrases · ${multi} have >1 member · ${(covered / allPhrases.length * 100).toFixed(1)}% of phrases land in a shared cluster`);
}

/* cluster-level saturation curve, same checkpoints */
{
  const { assign } = cluster(allPhrases, 0.6);
  const readOnly = films.filter((f) => (f.plotChars || 0) > 0 && !f.belowFloor);
  const keysByFilm = readOnly.map((f) => new Set((f.predicaments || []).map((p) => assign.get(p.situation)).filter((v) => v !== undefined).map(String)));
  const rare = rarefy(keysByFilm, o.perms, mulberry(o.seed));
  const cells = CHECK.map((k) => (k <= rare.length ? rare[k - 1].toFixed(0).padStart(3) : "  —"));
  console.log(`  cluster curve (j>=0.6, rarefaction, READ scope): ` + CHECK.map((k, i) => `${k}f:${cells[i]}`).join("  "));
  const w = WIN.map(([a, b]) => (b > rare.length ? null : (rare[b - 1] - (a === 1 ? 0 : rare[a - 2])) / (b - a + 1)));
  console.log(`  cluster new/film by window: ` + w.map((v) => (v == null ? "—" : v.toFixed(2))).join("  "));
}

/* ---- most repeated ---- */
function topRepeats(keys, phrases, n) {
  const m = new Map();
  keys.forEach((k, i) => { if (!m.has(k)) m.set(k, { n: 0, ex: [] }); const e = m.get(k); e.n++; if (e.ex.length < 3) e.ex.push(phrases[i]); });
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1)).slice(0, n);
}

console.log(`\n  TOP ${o.top} MOST-REPEATED PHRASES — N2, exact after normalisation`);
const t2 = topRepeats(byLevel["N2 MANDATED"].keys, allPhrases, o.top);
t2.forEach(([k, e], i) => console.log(`  ${String(i + 1).padStart(2)}. x${e.n}  ${k.slice(0, 110)}`));

console.log(`\n  TOP ${o.top} MOST-REPEATED — N3 content key (order-free, stemmed)`);
topRepeats(byLevel["N3 content key"].keys, allPhrases, o.top)
  .forEach(([k, e], i) => console.log(`  ${String(i + 1).padStart(2)}. x${e.n}  [${k.slice(0, 70)}]  e.g. "${e.ex[0].slice(0, 80)}"`));

console.log(`\n  TOP ${o.top} LARGEST LEXICAL CLUSTERS (jaccard>=0.6)`);
cluster(allPhrases, 0.6).leaders.slice(0, o.top).forEach((l, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. x${l.n}  ${l.label.slice(0, 100)}`);
  l.members.slice(1, 4).forEach((m) => console.log(`         + ${m.slice(0, 96)}`));
});

/* ---- grain diagnostics: length and proper nouns ---- */
const words = allPhrases.map((p) => n1(p).split(" ").length);
words.sort((a, b) => a - b);
const pct = (q) => words[Math.min(words.length - 1, Math.floor(q * words.length))];
console.log(`\n  PHRASE LENGTH in words: min ${words[0]} · p25 ${pct(0.25)} · median ${pct(0.5)} · p75 ${pct(0.75)} · max ${words[words.length - 1]}`);

// A proper noun inside a "general situation" is the clearest single sign the
// phrase has been written about this film rather than about a situation.
const propers = allPhrases.filter((p) => /(?:^|\s)(?!I\s)[A-Z][a-z]{2,}/.test(p.replace(/^[A-Z]/, (c) => c.toLowerCase())));
console.log(`  phrases containing a capitalised word mid-phrase (proper-noun leak): ${propers.length} of ${allPhrases.length}`);
propers.slice(0, 5).forEach((p) => console.log(`    ! ${p.slice(0, 110)}`));

if (o.json) {
  const out = {
    generated: new Date().toISOString(),
    input: o.in, promptVersion: raw.promptVersion, model: raw.model,
    films: films.length, readable: readable.length, belowFloor: belowFloor.length,
    phrases: allPhrases.length,
    normalisers: NORMALISERS.map(([name, , note]) => ({ name, note, distinct: byLevel[name].distinct })),
    checkpoints: CHECK,
    curves: Object.fromEntries(Object.entries(table).map(([k, v]) => [k, { asRead: v.asRead, rarefaction: v.rare.map((x) => +x.toFixed(3)) }])),
    windowSlopes: slopes,
    perms: o.perms, seed: o.seed,
  };
  fs.mkdirSync(path.dirname(path.join(ROOT, o.json)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, o.json), JSON.stringify(out, null, 1));
  console.log(`\n  wrote ${o.json}`);
}
console.log("");
