#!/usr/bin/env node
/* tag-predicates.js — PASS C. Classify films against the FROZEN predicate
 * vocabulary and nothing else.
 *
 *   node pipeline/tag-predicates.js --dry \
 *        --cohort pipeline/predicate-cohort-300.pc-shard0.txt
 *   node pipeline/tag-predicates.js \
 *        --cohort pipeline/predicate-cohort-300.pc-shard0.txt \
 *        --out pipeline/out/predicate-tags-shard0.json --shard 0 --of 3
 *
 * WHAT THIS IS NOT. Pass A (readings.js) GENERATED free-text predicaments and
 * the vocabulary was mined out of them. This pass does the opposite job: the
 * list is closed and frozen (pipeline/out/predicates-frozen.json,
 * predicate-vocab-1.0.0, 175 entries) and the only question per film is which
 * of those 175 the plot text actually enacts. It may not invent an id, it may
 * not rephrase a label, and it may not stretch a film onto a near miss.
 *
 * "NONE OF THESE" IS A FIRST-CLASS ANSWER. The frozen file's own passCContract
 * says so and its concerns list names four films that returned nothing above
 * the evidence floor and must keep returning nothing. A tagging pass with
 * suspiciously high coverage has failed, not succeeded — so the prompt is
 * written to make the empty answer cheap and the marginal tag expensive.
 *
 * WHAT THE PROMPT DELIBERATELY DOES NOT CONTAIN.
 *   - provenance.readings from the frozen file. Pass A measured that the phrase
 *     a film receives is a property of the six films it was read beside
 *     (cross-batch string reuse 0%); seeding the classifier with them re-imports
 *     that artefact.
 *   - pipeline/predicate-tags.seed.json. Authored from model recall. Never an
 *     exemplar, never a scoring target.
 *   - estPrevalence, cohortPrevalence, or any count. A classifier told how
 *     common a predicate is will reproduce the prior instead of reading.
 *   - tonal distance, in any form. It sorts; it never scores.
 *
 * Input is pipeline/out/plots.json and nothing else — same floor and same gate
 * as axes.js and readings.js. A film below the floor is written in with zero
 * tags and belowFloor: true. It does not get a guess from recall.
 *
 * The cache is keyed on prompt version + vocabulary version + the batch's
 * titles, so concurrent shards never collide and a re-run is free.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PLOTS = path.join(__dirname, "out", "plots.json");
const VOCAB = path.join(__dirname, "out", "predicates-frozen.json");
const CACHE = path.join(__dirname, ".cache-tags-passc");

const MODEL = "claude-opus-5";
const BATCH_SIZE = 3;              // smaller than Pass A: the closed list eats the context
const PROMPT_VERSION = "tag-prompt-1";
const CONCURRENCY = 6;
const CALL_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_PLOT_CHARS = 8000;
const OUTCOMES = ["restored", "unrestored", "fatal", "ambiguous", "transfigured"];

/* ------------------------------------------------------------------ args */

function args() {
  const a = process.argv.slice(2);
  const o = { dry: false, cohort: null, out: null, refresh: false, batches: 0,
              concurrency: CONCURRENCY, shard: 0, of: 1 };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === "--dry") o.dry = true;
    else if (k === "--refresh") o.refresh = true;
    else if (k === "--cohort") o.cohort = a[++i];
    else if (k === "--out") o.out = a[++i];
    else if (k === "--batches") o.batches = parseInt(a[++i], 10);
    else if (k === "--concurrency") o.concurrency = parseInt(a[++i], 10);
    else if (k === "--shard") o.shard = parseInt(a[++i], 10);
    else if (k === "--of") o.of = parseInt(a[++i], 10);
    else { console.error("unknown flag: " + k); process.exit(2); }
  }
  if (!o.cohort) { console.error("need --cohort"); process.exit(2); }
  if (!o.out && !o.dry) { console.error("need --out"); process.exit(2); }
  return o;
}

/* ------------------------------------------------------------------ input */

function loadVocab() {
  const v = JSON.parse(fs.readFileSync(VOCAB, "utf8"));
  if (!v.frozen) { console.error("vocabulary is not frozen — refusing to tag against a moving list"); process.exit(2); }
  // id / label / roles only. Everything else in that file is provenance,
  // prevalence or judgement, and none of it belongs in a classifier prompt.
  const preds = v.predicates.map((p) => ({ id: p.id, label: p.label, roles: p.roles, axis: p.sourceAxis || "other" }));
  return { version: v.version, count: v.predicateCount, preds };
}

function loadFilms(cohort) {
  const p = JSON.parse(fs.readFileSync(PLOTS, "utf8"));
  const byTitle = new Map();
  for (const f of Object.values(p.films)) if (f && f.title) byTitle.set(f.title, f);
  const want = fs.readFileSync(path.join(ROOT, cohort), "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const films = [], missing = [];
  for (const t of want) {
    const f = byTitle.get(t);
    if (!f) { missing.push(t); continue; }
    films.push({ title: f.title, year: f.year, filmId: f.filmId, region: f.region,
                 plot: f.admitted ? f.plot : null, withheld: f.withheld || null });
  }
  if (missing.length) console.warn(`  ! ${missing.length} cohort titles had no plot row: ${missing.slice(0, 6).join(", ")}`);
  return films;
}

const trimPlot = (s) => {
  if (!s || s.length <= MAX_PLOT_CHARS) return s || null;
  const cut = s.slice(0, MAX_PLOT_CHARS);
  const at = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
  return cut.slice(0, at > 1000 ? at + 1 : cut.length);
};

/* ------------------------------------------------------------------ prompt */

function vocabBlock(preds) {
  const byAxis = new Map();
  for (const p of preds) {
    if (!byAxis.has(p.axis)) byAxis.set(p.axis, []);
    byAxis.get(p.axis).push(p);
  }
  const out = [];
  for (const [axis, list] of byAxis) {
    out.push(`--- ${axis} ---`);
    for (const p of list) out.push(`${p.id}  [${p.roles.join(" / ")}]\n    ${p.label}`);
  }
  return out.join("\n");
}

function buildPrompt(batch, vocab) {
  const films = batch.map((f, i) =>
    `### FILM ${i + 1}\ntitle: ${f.title}\nyear: ${f.year || "unknown"}\nplot:\n${trimPlot(f.plot)}`
  ).join("\n\n");

  return `You are classifying films against a CLOSED, FROZEN list of ${vocab.count} relational predicaments.

This is classification, not generation. You may not invent a predicate, you may
not rephrase one, and you may not stretch a film onto a predicate that nearly
fits. The only question, asked ${vocab.count} times per film, is: does the plot text
below actually stage this situation between these people?

THE LIST. Each entry is an id, its two roles in brackets, and what it means.
The headings group the list so you can scan it; they carry no meaning of their own.

${vocabBlock(vocab.preds)}

WHAT TO RETURN PER FILM

An array of tags. A tag is:

  "predicate"  — an id copied EXACTLY from the list above. Not a label, not a
                 paraphrase, not an id you think ought to exist.
  "role"       — which side THIS FILM's central figure in that situation
                 occupies. One of the two role words shown in brackets for that
                 predicate, or "both" if the film genuinely stages one figure on
                 each side and neither is the film's centre.
  "centrality" — 0 to 1. 1.0 = the film's spine, the thing it is about. 0.3 = a
                 real, staged episode the film passes through. Below 0.25 do not
                 tag it at all.
  "outcome"    — exactly one of: ${OUTCOMES.join(" | ")}
                 restored = the situation is repaired; unrestored = it stands,
                 unrepaired; fatal = it ends in a death that settles it;
                 transfigured = it is resolved into something other than what it
                 was, neither repair nor ruin; ambiguous = the text does not say.
  "basis"      — ONE sentence naming the specific instantiation IN THIS FILM.
                 Names, acts, objects, the actual scene. This sentence is what a
                 claim gets written from later, so it must be specific.
                 A restatement of the label with the film's title bolted on is a
                 FAILED basis. "A bond is severed unilaterally in this film" is
                 worthless. "Colm tells Padraic he simply no longer likes him and
                 will cut off his own fingers if Padraic speaks to him again" is
                 the standard.

"NONE OF THESE" IS A FIRST-CLASS ANSWER — RETURN IT WHENEVER IT IS TRUE

Return "tags": [] for any film whose plot text does not clearly stage any entry
on the list. That is a correct, expected, valuable answer and it will not be
counted against you. Films with no human relation in them at all — a landscape
study, a portrait documentary, a compilation, a film that is a sequence of
events rather than a situation between people — should come back empty. A pass
that finds a tag for every film has failed, because it means the list was
stretched.

THE BAR FOR A TAG, applied one at a time

  1. Can you point at the sentences in the plot text that stage it? If you are
     reasoning from the genre, the period, the setting, or from what films like
     this usually do, that is not evidence and there is no tag.
  2. Is the specific relation present, or only the general theme? Almost every
     drama contains loss, power, and betrayal in some diffuse form. A predicate
     needs the actual configuration: these people, in that relation, doing that.
  3. Would you write the basis sentence from the text without inventing a
     detail? If the basis has to be vague to be true, drop the tag.
  4. Is there a BETTER entry on the list for the same event? Tag once, with the
     closest entry. Do not tag two neighbouring entries for one situation to
     hedge.

Most films will carry between 2 and 6 tags. Some will carry one. Some will carry
none. Do not aim for a number and do not pad to reach one — an extra tag that is
merely defensible is worse than no tag, because it dilutes every real one.

RULES

- Read ONLY the plot text given. Do NOT use anything you remember about these
  films, their directors, their reputation or their reception. If the plot text
  is thin, tag thinly. A claim built from recall reads exactly like a claim built
  from the text and only one of them is checkable.
- Never mention how famous, acclaimed or influential a film is, anywhere.
- The same predicate may be carried by several of the films below. That is
  expected and correct — do not vary your choice to spread them out.

OUTPUT

A single JSON object, no prose around it, no markdown fence:

{"films":[{"n":1,"title":"...","tags":[{"predicate":"bond-severed-unilaterally","role":"severed","centrality":0.9,"outcome":"unrestored","basis":"..."}]}]}

${films}`;
}

/* ------------------------------------------------------------------ call */

function call(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", [
      "-p", "--model", MODEL,
      "--disallowed-tools", "Bash", "Read", "Write", "Edit", "WebSearch", "WebFetch", "Glob", "Grep", "Task",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("model call timed out")); }, CALL_TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error("model exit " + code + ": " + err.slice(0, 400)));
      resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parse(raw, expected) {
  const fail = (m) => { const e = new Error(m); e.raw = raw; throw e; };
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{");
  if (a < 0) fail("no JSON object in model output");
  // Balanced scan, not lastIndexOf("}"). Four batches failed on a reply that was
  // complete except for the root object's final "}", and lastIndexOf then cut
  // the closing "]" off the films array as well, turning a one-character defect
  // into an unparseable one. Closers are APPENDED, never content: if the reply
  // is genuinely truncated the films-length check below still rejects it.
  let depth = 0, inStr = false, esc = false, end = -1;
  const stack = [];
  for (let i = a; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") { stack.push(c === "{" ? "}" : "]"); depth++; }
    else if (c === "}" || c === "]") { stack.pop(); if (--depth === 0) { end = i; break; } }
  }
  let body = end >= 0 ? t.slice(a, end + 1) : t.slice(a) + stack.reverse().join("");
  let obj;
  try { obj = JSON.parse(body); }
  catch (e1) {
    // Observed failure mode: an unescaped double quote inside a basis sentence
    // ends the string early. Retry once with raw newlines and tabs escaped,
    // which is the only other thing that has ever broken this. If it still
    // fails the batch is re-called, never repaired by guesswork.
    try { obj = JSON.parse(body.replace(/[\x00-\x1f]+/g, " ")); }
    catch (e2) { fail(e1.message); }
  }
  if (!obj || !Array.isArray(obj.films)) fail("no films array");
  if (obj.films.length !== expected) fail(`expected ${expected} films, got ${obj.films.length}`);
  return obj.films;
}

/* A model that invents an id has not classified, it has generated. Invented ids
 * are DROPPED and counted, never repaired by fuzzy matching onto a real entry —
 * a near-match repair is exactly the "stretch it onto the one that nearly fits"
 * the pass is forbidden to do. */
function validate(rows, byId, rejects) {
  for (const r of rows) {
    const kept = [];
    for (const t of (r.tags || [])) {
      const p = byId.get(t.predicate);
      if (!p) { rejects.push({ film: r.title, reason: "unknown predicate id", value: t.predicate }); continue; }
      const roles = [...p.roles, "both"];
      if (!roles.includes(t.role)) { rejects.push({ film: r.title, reason: "role not in predicate", value: `${t.predicate}:${t.role}` }); continue; }
      if (!OUTCOMES.includes(t.outcome)) { rejects.push({ film: r.title, reason: "outcome not in vocabulary", value: `${t.predicate}:${t.outcome}` }); continue; }
      const c = Number(t.centrality);
      if (!(c > 0 && c <= 1)) { rejects.push({ film: r.title, reason: "centrality out of range", value: `${t.predicate}:${t.centrality}` }); continue; }
      if (!t.basis || String(t.basis).trim().length < 20) { rejects.push({ film: r.title, reason: "basis missing or empty", value: t.predicate }); continue; }
      kept.push({ predicate: t.predicate, role: t.role, centrality: c, outcome: t.outcome, basis: String(t.basis).trim() });
    }
    // One situation, one tag. A duplicate id on one film is a hedge, not a claim.
    const seen = new Set();
    r.tags = kept.filter((t) => (seen.has(t.predicate) ? (rejects.push({ film: r.title, reason: "duplicate predicate on one film", value: t.predicate }), false) : (seen.add(t.predicate), true)));
  }
  return rows;
}

/* ------------------------------------------------------------------ run */

(async function main() {
  const o = args();
  const vocab = loadVocab();
  const byId = new Map(vocab.preds.map((p) => [p.id, p]));
  const films = loadFilms(o.cohort);
  const withPlot = films.filter((f) => f.plot && f.plot.length);
  const nulls = films.filter((f) => !f.plot || !f.plot.length);

  const batches = [];
  for (let i = 0; i < withPlot.length; i += BATCH_SIZE) batches.push(withPlot.slice(i, i + BATCH_SIZE));
  const run = o.batches ? batches.slice(0, o.batches) : batches;

  console.log(`\n  PASS C — TAG. shard ${o.shard} of ${o.of}`);
  console.log(`  ${films.length} films, ${withPlot.length} readable, ${nulls.length} below the floor`);
  console.log(`  vocabulary ${vocab.version}, ${vocab.count} predicates, FROZEN`);
  console.log(`  ${run.length} batches of ${BATCH_SIZE}, model ${MODEL}, prompt ${PROMPT_VERSION}\n`);

  if (o.dry) {
    const p = buildPrompt(run[0] || [], vocab);
    console.log(p.slice(0, 4000));
    console.log(`\n  ... [prompt is ${p.length} chars] ...\n`);
    console.log(`  --dry: built 1 prompt of ${run.length}, called nothing.\n`);
    return;
  }

  fs.mkdirSync(CACHE, { recursive: true });
  const results = [], rejects = [], failed = [];
  let done = 0;

  const worker = async (queue) => {
    for (;;) {
      const batch = queue.shift();
      if (!batch) return;
      const key = path.join(CACHE, `${PROMPT_VERSION}-${vocab.version}-${batch.map((f) => f.title).join("|").replace(/[^\w]+/g, "_").slice(0, 120)}.json`);
      if (!o.refresh && fs.existsSync(key)) {
        results.push(...validate(JSON.parse(fs.readFileSync(key, "utf8")), byId, rejects));
        console.log(`  [${++done}/${run.length}] cached`);
        continue;
      }
      try {
        const parsed = parse(await call(buildPrompt(batch, vocab)), batch.length);
        parsed.forEach((p, i) => {
          p.title = batch[i].title; p.year = batch[i].year; p.filmId = batch[i].filmId;
          p.plotChars = (batch[i].plot || "").length; p.belowFloor = false;
        });
        fs.writeFileSync(key, JSON.stringify(parsed));
        results.push(...validate(parsed, byId, rejects));
        console.log(`  [${++done}/${run.length}] ${batch.map((f) => f.title).join(", ").slice(0, 66)}`);
      } catch (e) {
        failed.push(batch.map((f) => f.title));
        // Keep the raw reply next to the cache so a malformed batch can be read
        // rather than guessed at. It is NOT written under the cache key, so a
        // re-run re-calls the batch instead of loading the broken reply.
        if (e.raw) { try { fs.writeFileSync(key.replace(/\.json$/, ".raw.txt"), e.raw); } catch (_) {} }
        console.error(`  [${++done}/${run.length}] FAILED: ${e.message}`);
      }
    }
  };

  const queue = run.slice();
  await Promise.all(Array.from({ length: Math.min(o.concurrency, queue.length) }, () => worker(queue)));

  for (const f of nulls) {
    results.push({ title: f.title, year: f.year, filmId: f.filmId, tags: [],
                   plotChars: 0, belowFloor: true, withheld: f.withheld });
  }

  const rows = results.map((r) => ({
    title: r.title, year: r.year, filmId: r.filmId, plotChars: r.plotChars,
    belowFloor: !!r.belowFloor, withheld: r.withheld || null,
    noneOfThese: (r.tags || []).length === 0,
    tags: r.tags || [],
  })).sort((a, b) => (a.year || 0) - (b.year || 0) || a.title.localeCompare(b.title));

  const tagged = rows.filter((r) => !r.belowFloor);
  const nTags = tagged.reduce((s, r) => s + r.tags.length, 0);
  const none = tagged.filter((r) => r.noneOfThese).length;
  const counts = new Map();
  for (const r of tagged) for (const t of r.tags) counts.set(t.predicate, (counts.get(t.predicate) || 0) + 1);

  fs.writeFileSync(path.join(ROOT, o.out), JSON.stringify({
    version: 1, pass: "C — tag", promptVersion: PROMPT_VERSION, model: MODEL,
    vocabulary: vocab.version, vocabularyFile: "pipeline/out/predicates-frozen.json",
    source: "reading",
    shard: { index: o.shard, of: o.of, cohort: o.cohort, films: films.length,
             readable: withPlot.length, belowFloor: nulls.length,
             batches: run.length, batchesFailed: failed.length, failed },
    note: "Closed-vocabulary classification against predicate-vocab-1.0.0. Read from pipeline/out/plots.json and nothing else. 'none of these' is a first-class answer and empty tag arrays are real answers, not failures. NOT merged into corpus.json and not to be merged before full-corpus tagging (proposal phase 5).",
    summary: {
      filmsInShard: rows.length, readable: tagged.length, belowFloor: nulls.length,
      tags: nTags, meanTagsPerReadableFilm: +(nTags / (tagged.length || 1)).toFixed(2),
      noneOfThese: none, noneOfTheseShare: +(none / (tagged.length || 1) * 100).toFixed(1),
      distinctPredicatesFired: counts.size, predicatesNeverFired: vocab.count - counts.size,
      rejectedTags: rejects.length,
    },
    rejected: rejects,
    generated: new Date().toISOString(),
    films: rows,
  }, null, 1));

  console.log(`\n  wrote ${rows.length} films -> ${o.out}`);
  console.log(`  ${nTags} tags, mean ${(nTags / (tagged.length || 1)).toFixed(2)} per readable film`);
  console.log(`  none of these: ${none}/${tagged.length} (${(none / (tagged.length || 1) * 100).toFixed(1)}%)`);
  console.log(`  ${counts.size}/${vocab.count} predicates fired, ${rejects.length} tags rejected, ${failed.length} batches failed\n`);
})();
