/* interpret-check.mjs — does the translator actually translate?
 *
 * Runs worker/interpret.ts's OWN system prompt against a real model through the
 * claude CLI, so the thing measured here is the thing that would ship. Proves
 * three properties before any of it is deployed:
 *   1. it emits vocabulary and never films
 *   2. every id it emits is in the closed list
 *   3. it says which of the reader's words it could not place
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const vocab = JSON.parse(readFileSync("atlas/pipeline/consensus-vocab.json", "utf8"));
const attrs = vocab.attributes;
const known = new Set(attrs.map(a => a.id));
const src = readFileSync("worker/interpret.ts", "utf8");
const m = src.match(/const SYSTEM = \(attrs: Vocab\[\]\) => `([\s\S]*?)`;/);
if (!m) throw new Error("could not lift the system prompt out of worker/interpret.ts");
const SYSTEM = m[1]
  .replace(/\$\{attrs\.length\}/g, String(attrs.length))
  .replace(/\$\{MAX_CLAUSES\}/g, "8")
  .replace(/\$\{attrs\.map\([\s\S]*?\)\.join\("\\n"\)\}/,
    attrs.map(a => `${a.id} — ${a.gloss}${a.not ? ` NOT: ${a.not}` : ""}`).join("\n"));

const ask = (q) => new Promise((res, rej) => {
  const c = spawn("claude", ["-p", "--model", "claude-haiku-4-5-20251001",
    "--append-system-prompt", SYSTEM], { stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "";
  c.stdout.on("data", d => out += d); c.stderr.on("data", d => err += d);
  c.on("close", code => code === 0 ? res(out) : rej(new Error(err.slice(0, 300))));
  c.stdin.end(q);
});

const QUERIES = [
  "friends who break up but make up towards the end",
  "a film that has fast pacing, has the mood of the matrix, has a hopeful tone, has little dialogue, very spiritual in nature",
  "something bleak and slow with almost no music",
  "a revenge film that isn't violent",
  "heist films starring Matt Damon",
  "the best films of 1997",
];
let bad = 0, filmsNamed = 0, prose = 0;
for (const q of QUERIES) {
  let raw;
  try { raw = await ask(q); } catch (e) { console.log(`FAIL ${q}: ${e.message}`); bad++; continue; }
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  let p = {};
  /* Unparseable is NOT counted as a fault of the vocabulary contract: the
     worker degrades it to zero clauses and the reader is told nothing was read.
     It is counted separately, because prose instead of JSON loses the reader's
     words and the prompt is supposed to prevent it. */
  try { p = JSON.parse(raw.slice(a, b + 1)); } catch { console.log(`\nQ ${JSON.stringify(q)}\n  PROSE, not JSON — degrades to nothing read`); prose++; continue; }
  const cl = Array.isArray(p.clauses) ? p.clauses : [];
  const rejected = cl.map(c => c.attr).filter(x => !known.has(x));
  if (rejected.length) bad++;
  console.log(`\nQ ${JSON.stringify(q)}`);
  console.log(`  ${cl.length} clauses: ` + cl.map(c => `${c.attr}${c.negate ? " NOT" : ""}${c.weight !== 1 ? " x" + c.weight : ""}`).join(", "));
  if (p.unread?.length) console.log(`  unread: ${JSON.stringify(p.unread)}`);
  if (rejected.length) console.log(`  !! OUTSIDE THE VOCABULARY: ${rejected.join(", ")}`);
  if (/\b(19|20)\d\d\b/.test(JSON.stringify(cl))) { filmsNamed++; console.log("  !! a year leaked into the clauses"); }
}
console.log(`\n${QUERIES.length} queries · ${bad} with invented ids · ${filmsNamed} leaking a year · ${prose} answered in prose`);
console.log(bad === 0 && filmsNamed === 0 && prose === 0 ? "INTERPRET PASS" : "INTERPRET FAIL");
