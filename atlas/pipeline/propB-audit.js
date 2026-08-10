#!/usr/bin/env node
/* propB-audit.js — is a tag actually right? With decoys, so the answer means something.
 *
 *   node pipeline/propB-audit.js
 *
 * Coverage is worthless without precision. 73.7% of predicaments received a
 * predicate; this asks a fresh call, which has not seen the assignment prompt
 * and does not know which pairing is real, whether each pairing actually holds.
 *
 * THE DECOY CONTROL, which is the only reason to trust the number.
 *
 * One item in three is a DECOY: the same situation paired with a predicate
 * drawn at random from the vocabulary instead of the one it was assigned. The
 * auditor is not told which is which. If it accepts decoys at anything near the
 * rate it accepts real tags, it is agreeing rather than judging and the whole
 * audit — including the flattering part — is void. `consensus-decoy.js` in this
 * pipeline uses the same device for the same reason.
 *
 * Reports acceptance on real tags, acceptance on decoys, and the gap.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const OUT = path.join(__dirname, "out");
const CACHE = path.join(__dirname, ".cache-propB");
const MODEL = "claude-opus-5";
const PROMPT_VERSION = "propB-audit-1";
const BATCH = 30;
const CONCURRENCY = 4;
const SAMPLE = 180;
const DECOY_EVERY = 3;
const SEED = 4242;
const CALL_TIMEOUT_MS = 15 * 60 * 1000;

const N2 = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w && !["a", "an", "the"].includes(w)).join(" ");

function rng(seed) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
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
    child.on("close", (c) => { clearTimeout(timer); c !== 0 ? reject(new Error("exit " + c)) : resolve(out); });
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

function auditPrompt(items) {
  const lines = items.map((it, i) =>
    `${i + 1}. situation: "${it.situation}"  [roles: ${it.roles.length ? it.roles.join(" / ") : "—"}]\n   proposed predicate: ${it.label}  [${(it.predRoles || []).join(" / ")}]`
  ).join("\n\n");

  return `You are checking proposed pairings. Each item below is a situation read from a
film, paired with a proposed relational predicate. Some of these pairings are
right and some are wrong. Your job is to say which.

A pairing HOLDS if the situation is an instance of that relation — the same two
positions, the same transaction between them. It does not have to be the best
possible wording, and the subject matter is free to differ: a bond severed
without explanation is the same relation whether the bond is a friendship, a
marriage or a contract.

A pairing FAILS if the parties are different, or the transaction between them is
different, or the predicate is merely in the same emotional neighbourhood
without naming what actually passes between the two sides.

Be strict. A substantial number of these pairings are wrong and saying so is the
point of the exercise. Do not soften a "no" into a "yes" because the two are
loosely related.

OUTPUT — a single JSON object, no prose, no markdown fence, one verdict per
numbered item in order:

{"verdicts":[{"n":1,"holds":true},{"n":2,"holds":false}]}

THE PAIRINGS

${lines}`;
}

(async function main() {
  const vocab = JSON.parse(fs.readFileSync(path.join(OUT, "propB-vocab.json"), "utf8")).predicates;
  const byId = new Map(vocab.map((p) => [p.id, p]));
  const tags = new Map(JSON.parse(fs.readFileSync(path.join(OUT, "propB-tags.json"), "utf8")).tags.map((t) => [t.id, t.predicate]));

  const preds = [];
  [0, 1, 2, 3].forEach((shard) => {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, `readings-pass-shard${shard}.json`), "utf8"));
    for (const f of j.films) (f.predicaments || []).forEach((pr, i) => preds.push({
      id: `s${shard}b${f.batch}-${N2(f.title).replace(/ /g, "_").slice(0, 28)}-${i}`,
      film: f.title, situation: pr.situation, roles: Object.keys(pr.roles || {}),
    }));
  });

  const r = rng(SEED);
  const assigned = preds.filter((p) => { const t = tags.get(p.id); return t && t !== "none"; });
  const shuffled = assigned.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }

  const items = shuffled.slice(0, SAMPLE).map((p, i) => {
    const real = byId.get(tags.get(p.id));
    const isDecoy = i % DECOY_EVERY === DECOY_EVERY - 1;
    let chosen = real;
    if (isDecoy) { do { chosen = vocab[Math.floor(r() * vocab.length)]; } while (chosen.id === real.id); }
    return { ...p, decoy: isDecoy, assignedId: real.id, shownId: chosen.id, label: chosen.label, predRoles: chosen.roles };
  });

  const groups = [];
  for (let i = 0; i < items.length; i += BATCH) groups.push(items.slice(i, i + BATCH));
  console.log(`\n  AUDIT — ${items.length} pairings (${items.filter((i) => i.decoy).length} decoys), ${groups.length} calls of ${BATCH}\n`);

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
          const obj = parseJSON(await call(auditPrompt(job.g)));
          const v = obj.verdicts || [];
          if (v.length !== job.g.length) throw new Error(`expected ${job.g.length}, got ${v.length}`);
          rows = job.g.map((it, i) => ({ id: it.id, decoy: it.decoy, assignedId: it.assignedId, shownId: it.shownId, holds: !!(v[i] || {}).holds }));
          fs.writeFileSync(key, JSON.stringify(rows));
        }
        out.push(...rows);
        console.log(`  [${++done}/${groups.length}] group ${job.i}`);
      } catch (e) { console.error(`  [${++done}/${groups.length}] group ${job.i} FAILED: ${e.message}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, q.length) }, worker));

  const real = out.filter((x) => !x.decoy), dec = out.filter((x) => x.decoy);
  const acc = (a) => a.length ? Math.round(1000 * a.filter((x) => x.holds).length / a.length) / 10 : 0;
  const summary = {
    n: out.length, realTags: real.length, decoys: dec.length,
    realAccepted: acc(real), decoyAccepted: acc(dec), gap: Math.round((acc(real) - acc(dec)) * 10) / 10,
    verdict: acc(dec) > 40 ? "AUDIT VOID — the auditor accepts decoys at a rate that makes its approvals meaningless"
      : acc(dec) > 20 ? "audit weak — decoy acceptance is high enough to inflate the real-tag figure"
        : "audit usable — decoys are rejected, so acceptance of real tags carries information",
  };
  fs.writeFileSync(path.join(OUT, "propB-audit.json"), JSON.stringify({
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL, generated: new Date().toISOString(),
    note: "Blind precision audit of assigned tags with 1-in-3 random-predicate decoys. Decoy acceptance is the control; without it the real-tag acceptance rate is not evidence.",
    summary, verdicts: out,
  }, null, 1));
  console.log(`\n  real tags accepted ${summary.realAccepted}%   decoys accepted ${summary.decoyAccepted}%   gap ${summary.gap}`);
  console.log(`  ${summary.verdict}`);
  console.log(`  -> pipeline/out/propB-audit.json\n`);
})().catch((e) => { console.error(e); process.exit(1); });
