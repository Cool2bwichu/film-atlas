#!/usr/bin/env node
/* propB-stability.js — the control that decides whether Pass C is viable.
 *
 *   node pipeline/propB-stability.js            # 240 predicaments, re-tagged in new company
 *
 * WHY THIS EXISTS
 *
 * Pass A measured that GENERATION is a property of the batch: the same film,
 * same prompt, same model, re-read beside six different films, reproduces
 * 1-4% of its own phrases. Four shards produced four essentially disjoint
 * vocabularies. The entire justification for a closed-vocabulary Pass C is the
 * claim that CLASSIFICATION does not behave that way — that a frozen list makes
 * the answer a property of the item and not of its neighbours.
 *
 * That claim has not been measured. This measures it. It re-tags a sample of
 * predicaments against the SAME frozen vocabulary, in a different order, in
 * different company, in different-sized groups, under a different cache key,
 * and reports how often the two independent assignments agree.
 *
 * If agreement is low, proposal B fails on its own terms and the number gets
 * reported as it is. It does not get tuned.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const OUT = path.join(__dirname, "out");
const CACHE = path.join(__dirname, ".cache-propB");
const MODEL = "claude-opus-5";
const PROMPT_VERSION = "propB-role-1-stability";
const BATCH = 30;                 // deliberately NOT 48 — different company AND different group size
const CONCURRENCY = 4;
const SAMPLE = 240;
const SEED = 777;
const CALL_TIMEOUT_MS = 15 * 60 * 1000;

const N2 = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w && !["a", "an", "the"].includes(w)).join(" ");

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pool() {
  const preds = [];
  [0, 1, 2, 3].forEach((shard) => {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, `readings-pass-shard${shard}.json`), "utf8"));
    for (const f of j.films) (f.predicaments || []).forEach((pr, i) => preds.push({
      id: `s${shard}b${f.batch}-${N2(f.title).replace(/ /g, "_").slice(0, 28)}-${i}`,
      film: f.title, shard, situation: pr.situation, roles: Object.keys(pr.roles || {}), outcome: pr.outcome,
    }));
  });
  return preds;
}

function call(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--model", MODEL,
      "--disallowed-tools", "Bash", "Read", "Write", "Edit", "WebSearch", "WebFetch", "Glob", "Grep", "Task"],
      { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("timed out")); }, CALL_TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (c) => { clearTimeout(timer); c !== 0 ? reject(new Error("exit " + c + ": " + err.slice(0, 300))) : resolve(out); });
    child.stdin.write(prompt); child.stdin.end();
  });
}

function parseJSON(raw) {
  let t = String(raw).trim();
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) t = f[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON");
  return JSON.parse(t.slice(a, b + 1));
}

/* The prompt is character-identical to the assignment prompt in
 * canonicalise-propB.js. Only the company, the order and the group size differ
 * — otherwise this would measure prompt sensitivity instead of batch
 * sensitivity, which is a different question. */
function assignPrompt(vocab, items) {
  const v = vocab.map((p) => `${p.id} [${(p.roles || []).join("/")}] — ${p.label}`).join("\n");
  const lines = items.map((p, i) => `${i + 1}. "${p.situation}"  [roles: ${p.roles.length ? p.roles.join(" / ") : "—"}]`).join("\n");
  return `You are TAGGING, not inventing. Below is a FROZEN vocabulary of relational
predicates, and ${items.length} situations read from films. For each situation, name the ONE
predicate whose relation it is an instance of — or say none.

HOW TO DECIDE

Ask only: are the same two positions in the same transaction? Who does what to
whom. Ignore subject matter entirely — the bond can be a marriage in one film
and a business partnership in another and still be the same predicate. Ignore
tone, genre, era and country.

Do not consider how the situation ends. Outcome is recorded separately and is
never a reason to reject a predicate.

"none" IS A FIRST-CLASS ANSWER AND YOU WILL NEED IT OFTEN.

  - Use "none" whenever the situation is not an instance of any listed relation.
  - Use "none" when the situation names a state rather than a transaction
    between parties ("a country is at war", "a family is poor").
  - Do NOT reach for the nearest-sounding entry. A wrong tag is worse than an
    absent one: this vocabulary is about to be measured on how honestly it
    covers the corpus, and a forced tag corrupts that measurement.
  - Expect to answer "none" for a substantial share of a list like this. That
    is the correct behaviour, not a failure.

OUTPUT — a single JSON object, no prose, no markdown fence. One entry per
numbered situation, in order, using the exact predicate ids:

{"tags":[{"n":1,"predicate":"bond-severed-unilaterally"},{"n":2,"predicate":"none"}]}

THE VOCABULARY

${v}

THE SITUATIONS

${lines}`;
}

(async function main() {
  const preds = pool();
  const vocab = JSON.parse(fs.readFileSync(path.join(OUT, "propB-vocab.json"), "utf8")).predicates;
  const ids = new Set(vocab.map((p) => p.id));

  const r = rng(SEED);
  const shuffled = preds.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const sample = shuffled.slice(0, SAMPLE);

  const groups = [];
  for (let i = 0; i < sample.length; i += BATCH) groups.push(sample.slice(i, i + BATCH));
  console.log(`\n  STABILITY — ${sample.length} predicaments re-tagged, ${groups.length} calls of ${BATCH}, vocabulary ${vocab.length}\n`);

  fs.mkdirSync(CACHE, { recursive: true });
  const q = groups.map((g, i) => ({ g, i }));
  const out = [];
  let done = 0;
  const worker = async () => {
    for (;;) {
      const job = q.shift(); if (!job) return;
      const key = path.join(CACHE, `${PROMPT_VERSION}-${job.i}.json`);
      try {
        let rows;
        if (fs.existsSync(key)) rows = JSON.parse(fs.readFileSync(key, "utf8"));
        else {
          const obj = parseJSON(await call(assignPrompt(vocab, job.g)));
          const tags = obj.tags || [];
          if (tags.length !== job.g.length) throw new Error(`expected ${job.g.length}, got ${tags.length}`);
          rows = job.g.map((p, i) => {
            const pid = String((tags[i] || {}).predicate || "none").trim();
            return { id: p.id, predicate: ids.has(pid) ? pid : "none" };
          });
          fs.writeFileSync(key, JSON.stringify(rows));
        }
        out.push(...rows);
        console.log(`  [${++done}/${groups.length}] group ${job.i}`);
      } catch (e) { console.error(`  [${++done}/${groups.length}] group ${job.i} FAILED: ${e.message}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, q.length) }, worker));

  fs.writeFileSync(path.join(OUT, "propB-stability.json"), JSON.stringify({
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL,
    note: "Independent re-tag of a random sample against the same frozen vocabulary, in different company and different group size. Compare with propB-tags.json.",
    generated: new Date().toISOString(), sample: sample.length, batch: BATCH, tagged: out.length, tags: out,
  }, null, 1));
  console.log(`\n  ${out.length} re-tags -> pipeline/out/propB-stability.json\n`);
})().catch((e) => { console.error(e); process.exit(1); });
