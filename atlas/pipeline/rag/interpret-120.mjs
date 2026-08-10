/* interpret-120.mjs — what does /api/interpret ADD, on the 120-query find set?
 *
 * Method is interpret-check.mjs's, widened from 6 queries to 120: the system
 * prompt is LIFTED OUT OF worker/interpret.ts rather than copied, so the thing
 * measured is the thing that would run. Every reply is cached to disk under a
 * hash of (prompt, model, query), so a re-run costs nothing and a prompt edit
 * invalidates exactly the calls it changes.
 *
 * It measures, and does not fix, three things the shipped page does with the
 * reply. See interpret-120-report.mjs for what the numbers mean.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = "/home/user/film-atlas";
const CACHE = path.join(ROOT, "atlas/pipeline/rag/interpret-cache");
mkdirSync(CACHE, { recursive: true });
const MODEL = process.env.ATLAS_INTERPRET_MODEL || "claude-haiku-4-5-20251001";

/* ── lift the prompt out of the worker, exactly as interpret-check.mjs does ── */
const vocab = JSON.parse(readFileSync(path.join(ROOT, "atlas/pipeline/consensus-vocab.json"), "utf8"));
const attrs = vocab.attributes;
export const KNOWN = new Set(attrs.map(a => a.id));
const src = readFileSync(path.join(ROOT, "worker/interpret.ts"), "utf8");
const m = src.match(/const SYSTEM = \(attrs: Vocab\[\]\) => `([\s\S]*?)`;/);
if (!m) throw new Error("could not lift the system prompt out of worker/interpret.ts");
export const SYSTEM = m[1]
  .replace(/\$\{attrs\.length\}/g, String(attrs.length))
  .replace(/\$\{MAX_CLAUSES\}/g, "8")
  .replace(/\$\{attrs\.map\([\s\S]*?\)\.join\("\\n"\)\}/,
    attrs.map(a => `${a.id} — ${a.gloss}${a.not ? ` NOT: ${a.not}` : ""}`).join("\n"));
const PROMPT_HASH = createHash("sha256").update(SYSTEM + "\0" + MODEL).digest("hex").slice(0, 12);

const ask = (q) => new Promise((res) => {
  const t0 = Date.now();
  const c = spawn("claude", ["-p", "--output-format", "json", "--model", MODEL,
    "--append-system-prompt", SYSTEM], { stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "";
  c.stdout.on("data", d => out += d); c.stderr.on("data", d => err += d);
  c.on("close", code => {
    const wall = Date.now() - t0;
    if (code !== 0) return res({ error: err.slice(0, 400) || `exit ${code}`, wall });
    try {
      const env = JSON.parse(out);
      res({ text: String(env.result ?? ""), wall, apiMs: env.duration_api_ms,
            usage: env.usage, cliCost: env.total_cost_usd, isError: env.is_error });
    } catch { res({ error: "CLI did not return JSON", raw: out.slice(0, 400), wall }); }
  });
  c.stdin.end(q);
});

/* ── the run ── */
const QUERIES = JSON.parse(readFileSync(path.join(ROOT, "atlas/pipeline/rag/find-queries.json"), "utf8")).queries;
const slot = (row) => path.join(CACHE, `${row.id}.${PROMPT_HASH}.json`);

const todo = QUERIES.filter(r => !existsSync(slot(r)));
console.log(`prompt ${PROMPT_HASH} · model ${MODEL} · ${QUERIES.length} queries · ${todo.length} to call, ${QUERIES.length - todo.length} cached`);

const LANES = Number(process.env.LANES || 6);
let n = 0, done = 0;
async function lane() {
  while (n < todo.length) {
    const row = todo[n++];
    const r = await ask(row.q);
    writeFileSync(slot(row), JSON.stringify({ id: row.id, q: row.q, model: MODEL, promptHash: PROMPT_HASH, ...r }, null, 1));
    done++;
    if (done % 10 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
  }
}
await Promise.all(Array.from({ length: Math.min(LANES, todo.length) }, lane));
const missing = QUERIES.filter(r => !existsSync(slot(r)));
console.log(missing.length ? `INCOMPLETE — ${missing.length} missing` : `all ${QUERIES.length} cached at ${CACHE}`);
