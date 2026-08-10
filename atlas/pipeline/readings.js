#!/usr/bin/env node
/* readings.js — the reading pass. One account of what each film is about at the
 * level of what happens between the people in it, read from a plot section and
 * nothing else.
 *
 *   node pipeline/readings.js --dry              # build one prompt, call nothing
 *   node pipeline/readings.js --sample 40        # a cohort, then stop
 *   node pipeline/readings.js --cohort pipeline/predicate-cohort.txt
 *   node pipeline/readings.js --batches 2        # smoke test
 *
 * WHY THIS EXISTS AND WHAT IT IS NOT
 *
 * This pass GENERATES. It does not connect. Its output is a per-film reading —
 * prose plus a short list of the predicaments the film turns on, phrased in the
 * film's own terms — and a list of films it brings to mind.
 *
 * NONE OF THAT IS AN EDGE, and the `relatives` field in particular must never
 * be promoted to one on its own. A graph built from what a model names is
 * asymmetric and popularity-biased by construction: canonical films get named
 * constantly and never do the naming, so the tail of the corpus ends up with
 * readings that nothing points at. AGENTS rule 1 forbids fame in the graph and
 * this is the subtlest route by which it gets in. Measured on 47 unprompted
 * recommendations in the conversation that produced this file: 43% named films
 * absent from the corpus, and 0 came from E-Asia, S-Asia or Oceania, which are
 * 7% of it.
 *
 * `relatives` has two legitimate uses:
 *   1. RECIPROCAL naming — A names B and B names A — is symmetric and is a
 *      genuine candidate edge, at low confidence, ranked below co-occurrence.
 *   2. Films named that are NOT in the corpus are a ranked wishlist for
 *      seeds.txt. This is the pass's most valuable by-product and the reason
 *      `relatives` is collected at all.
 *
 * The predicaments are the real output. They are free text HERE, on purpose:
 * the vocabulary is mined from them afterwards by clustering across the whole
 * corpus, not authored in advance and imposed. A vocabulary written first
 * describes the films its author had in mind; a vocabulary mined from 2,204
 * readings describes the corpus.
 *
 * WHAT IT REFUSES
 *
 * Input is pipeline/out/plots.json and nothing else, same floor and same gate
 * as axes.js. A film below the evidence floor arrives with plot: null and
 * leaves with reading: null. It does not get a guess, and there is no fallback
 * to model recall — the prompt forbids it in as many words, for the same reason
 * axes.js does: a claim built from recall reads exactly like a claim built from
 * the text, and only one of them is checkable.
 *
 * source is "reading", always. Never "record".
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PLOTS = path.join(__dirname, "out", "plots.json");
const OUT_FILE = path.join(ROOT, "static", "readings-pass.json");
const CACHE = path.join(__dirname, ".cache-readings");

const MODEL = "claude-opus-5";
const BATCH_SIZE = 6;              // smaller than axes.js: the output per film is far longer
const PROMPT_VERSION = "readings-prompt-1";
const CONCURRENCY = 3;
const CALL_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_PLOT_CHARS = 8000;

/* ------------------------------------------------------------------ args */

function args() {
  const a = process.argv.slice(2);
  const o = { sample: 0, dry: false, batches: 0, refresh: false, cohort: null, concurrency: CONCURRENCY };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === "--dry") o.dry = true;
    else if (k === "--refresh") o.refresh = true;
    else if (k === "--sample") o.sample = parseInt(a[++i], 10);
    else if (k === "--batches") o.batches = parseInt(a[++i], 10);
    else if (k === "--cohort") o.cohort = a[++i];
    else if (k === "--concurrency") o.concurrency = parseInt(a[++i], 10);
    else if (k === "--help" || k === "-h") { console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]); process.exit(0); }
    else { console.error("unknown flag: " + k); process.exit(2); }
  }
  return o;
}

/* ------------------------------------------------------------------ input */

function loadFilms(o) {
  if (!fs.existsSync(PLOTS)) { console.error("missing " + PLOTS + " — run plot-source.js first"); process.exit(2); }
  const p = JSON.parse(fs.readFileSync(PLOTS, "utf8"));
  if (!p || !p.films) { console.error("plots.json has no films map — did plot-source.js finish?"); process.exit(2); }
  // Respect plot-source.js's own gate: a film it withheld is not re-opened here.
  let films = Object.values(p.films).filter((f) => f && f.title).map((f) => ({
    title: f.title, year: f.year, filmId: f.filmId, region: f.region,
    plot: f.admitted ? f.plot : null, withheld: f.withheld || null,
  }));

  if (o.cohort) {
    const want = new Set(fs.readFileSync(path.join(ROOT, o.cohort), "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
    films = films.filter((f) => want.has(f.title));
    const got = new Set(films.map((f) => f.title));
    const miss = [...want].filter((t) => !got.has(t));
    if (miss.length) console.warn(`  ! ${miss.length} cohort titles had no plot row: ${miss.slice(0, 6).join(", ")}${miss.length > 6 ? "…" : ""}`);
  }
  if (o.sample) films = films.slice(0, o.sample);
  return films;
}

const trimPlot = (s) => {
  if (!s || s.length <= MAX_PLOT_CHARS) return { text: s || null, truncated: false };
  const cut = s.slice(0, MAX_PLOT_CHARS);
  const at = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
  return { text: cut.slice(0, at > 1000 ? at + 1 : cut.length), truncated: true };
};

/* ------------------------------------------------------------------ prompt */

function buildPrompt(batch) {
  const films = batch.map((f, i) => {
    const { text } = trimPlot(f.plot);
    return `### FILM ${i + 1}\ntitle: ${f.title}\nyear: ${f.year || "unknown"}\nplot:\n${text}`;
  }).join("\n\n");

  return `You are reading plot sections and writing one account of each film's human situation.

WHAT I WANT, PER FILM

1. "engine" — two or three sentences naming what the film is actually about at
   the level of what happens between the people in it. Not the plot; the thing
   underneath the plot that makes the plot happen. Write it for someone who has
   not seen the film. Name the specific thing, not a theme: "a boy is asked
   which parent he wants to live with and spends the film forging a life that
   would put that evening back" — not "explores family and identity".

2. "predicaments" — 3 to 6 short phrases, each naming ONE situation the film
   turns on, in the form of something that happens between people. Phrase each
   as a general situation, not as this film's specifics, so that another film
   could be described by the same phrase: "one party ends a bond and will not
   give a reason the other can accept". For each, give:
     - "situation": the general phrase
     - "basis": one sentence naming how it appears in THIS film, specifically
     - "centrality": 0-1, is this the spine or something the film passes through
     - "outcome": one of restored | unrestored | fatal | ambiguous | transfigured
     - "roles": if the situation has two sides, name which side each main
       figure occupies; omit if it does not

3. "relatives" — up to 5 other films this one brings to mind AT THE LEVEL OF
   THE SITUATION, not of genre, era, country or director. One clause each
   saying which situation is shared. Reach outside this film's own tradition
   where you honestly can: a film from another country or era that lands on the
   same predicament is worth more here than an obvious neighbour.

RULES

- Read ONLY the plot text given. Do not use anything you remember about these
  films. If the plot section does not support a claim, do not make it. A film
  whose plot text is too thin to support an engine gets "engine": null and an
  empty predicaments array — that is a correct answer, not a failure.
- Never mention how famous, acclaimed, influential or well-regarded any film is.
- Do not invent a situation to fill the quota. Three good ones beat six.
- "relatives" is allowed to name films from your own knowledge, since it is a
  pointer and not a claim about the text.

OUTPUT

A single JSON object, no prose around it, no markdown fence:

{"films":[{"n":1,"title":"...","engine":"...","predicaments":[{"situation":"...","basis":"...","centrality":0.9,"outcome":"unrestored","roles":{"severing":"Colm","severed":"Padraic"}}],"relatives":[{"title":"...","shares":"..."}]}]}

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
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object in model output");
  const obj = JSON.parse(t.slice(a, b + 1));
  if (!obj || !Array.isArray(obj.films)) throw new Error("no films array");
  if (obj.films.length !== expected) throw new Error(`expected ${expected} films, got ${obj.films.length}`);
  return obj.films;
}

/* ------------------------------------------------------------------ run */

(async function main() {
  const o = args();
  const films = loadFilms(o);
  const withPlot = films.filter((f) => f.plot && f.plot.length);
  const nulls = films.filter((f) => !f.plot || !f.plot.length);

  const batches = [];
  for (let i = 0; i < withPlot.length; i += BATCH_SIZE) batches.push(withPlot.slice(i, i + BATCH_SIZE));
  const run = o.batches ? batches.slice(0, o.batches) : batches;

  console.log(`\n  READING PASS — ${films.length} films, ${withPlot.length} with plot, ${nulls.length} below the floor`);
  console.log(`  ${run.length} batches of ${BATCH_SIZE}, model ${MODEL}, prompt ${PROMPT_VERSION}\n`);

  if (o.dry) {
    console.log(buildPrompt(run[0] || []));
    console.log(`\n  --dry: built 1 prompt of ${run.length}, called nothing.\n`);
    return;
  }

  fs.mkdirSync(CACHE, { recursive: true });
  const results = [];
  let done = 0;

  const worker = async (queue) => {
    for (;;) {
      const batch = queue.shift();
      if (!batch) return;
      const key = path.join(CACHE, `${PROMPT_VERSION}-${batch.map((f) => f.title).join("|").replace(/[^\w]+/g, "_").slice(0, 120)}.json`);
      if (!o.refresh && fs.existsSync(key)) {
        results.push(...JSON.parse(fs.readFileSync(key, "utf8")));
        console.log(`  [${++done}/${run.length}] cached`);
        continue;
      }
      try {
        const parsed = parse(await call(buildPrompt(batch)), batch.length);
        parsed.forEach((p, i) => { p.title = batch[i].title; p.year = batch[i].year; p.source = "reading"; p.plotChars = (batch[i].plot || "").length; });
        fs.writeFileSync(key, JSON.stringify(parsed));
        results.push(...parsed);
        console.log(`  [${++done}/${run.length}] ${batch.map((f) => f.title).join(", ").slice(0, 70)}`);
      } catch (e) {
        console.error(`  [${++done}/${run.length}] FAILED: ${e.message}`);
      }
    }
  };

  const queue = run.slice();
  await Promise.all(Array.from({ length: Math.min(o.concurrency, queue.length) }, () => worker(queue)));

  for (const f of nulls) results.push({ title: f.title, year: f.year, engine: null, predicaments: [], relatives: [], source: "reading", plotChars: 0, belowFloor: true });

  const out = {
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL, source: "reading",
    note: "Per-film readings. Predicaments are free text on purpose — the vocabulary is mined from them afterwards, not imposed before. `relatives` is NOT an edge list: see the header of readings.js.",
    generated: new Date().toISOString(),
    films: results,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1));

  const phrases = results.flatMap((r) => (r.predicaments || []).map((p) => p.situation)).filter(Boolean);
  console.log(`\n  wrote ${results.length} readings -> ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`  ${phrases.length} predicament phrases, ${new Set(phrases.map((s) => s.toLowerCase())).size} distinct before clustering`);
  console.log(`  -> next: cluster those into a controlled vocabulary, then re-tag.\n`);
})();
