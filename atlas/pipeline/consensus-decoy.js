#!/usr/bin/env node
/* consensus-decoy.js — does the "I do not know this film" gate actually hold?
 *
 *   node pipeline/consensus-decoy.js --dry
 *   node pipeline/consensus-decoy.js
 *
 * A low answer rate is not evidence of honesty; it is only evidence of a low
 * answer rate. The layer's whole claim is that when the model says `well` it is
 * RECALLING and when it says `no` it is ADMITTING, and nothing in the main pass
 * can distinguish that from a model that guesses well-shaped answers at some
 * fixed rate. So: plant films that do not exist.
 *
 * Each decoy is a real director, a plausible year inside that director's working
 * life, and an invented title. Title + year + director is exactly what the main
 * prompt is given, so a decoy is indistinguishable from a real obscure film by
 * anything except actually knowing the filmography. A confabulator cannot tell
 * them apart. A recaller can.
 *
 * The decoys are mixed TWO PER BATCH OF TEN with real corpus films, at the same
 * ratio and in the same prompt as the production run — a batch of ten fakes
 * would be detectable as a pattern and would measure nothing.
 *
 * WHAT THE RESULT MEANS
 *
 *   decoys marked `no`       — the gate held for that film.
 *   decoys marked `outline`  — soft failure. The model inferred from the
 *                              director's habits, which is exactly the
 *                              "1970s Hungarian drama, so austere" reasoning the
 *                              prompt names and refuses. These land in the
 *                              no-vocabulary shard, so the damage is bounded to
 *                              a few false positives.
 *   decoys marked `well`     — hard failure, and the number that matters. A
 *                              `well` on a film that does not exist means the
 *                              concrete-recall toll was paid with an invention,
 *                              and every `well` in the main run is suspect at
 *                              roughly this rate.
 *
 * The real films in these batches are scored too and are reported beside the
 * decoys, because the contrast is the measurement: the gate is only meaningful
 * if the same call that refuses the fakes accepts the real ones.
 *
 * This writes `pipeline/out/consensus-decoy.json` and touches nothing the
 * production pass wrote. No decoy ever enters consensus.json.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const nodeCrypto = require("crypto");
const { spawn } = require("child_process");

const OUT = path.join(__dirname, "out");
const CACHE = path.join(__dirname, ".cache-consensus-decoy");
const VOCAB_FILE = path.join(__dirname, "consensus-vocab.json");
const { buildPrompt, loadFilms, normalise } = require("./consensus.js");

const MODEL = "claude-opus-5";
const DECOYS_PER_BATCH = 2;
const CALL_TIMEOUT_MS = 12 * 60 * 1000;

/* Twenty-four films that do not exist. Every director is real and every year is
   inside that director's working life, so the surface is exactly as plausible as
   a genuine obscure entry. Each title was checked against the corpus; none
   collides with a real film by this director. */
const DECOYS = [
  { title: "The Salt Marshes", year: 1971, director: "Krzysztof Zanussi" },
  { title: "Winter Ledger", year: 1983, director: "Jerzy Kawalerowicz" },
  { title: "A Room Above the Harbour", year: 1958, director: "Kon Ichikawa" },
  { title: "The Quiet Inheritance", year: 1996, director: "Otar Iosseliani" },
  { title: "Nine Bridges", year: 1965, director: "Miklós Jancsó" },
  { title: "The Copper Hours", year: 1978, director: "Márta Mészáros" },
  { title: "Letters from the Interior", year: 1988, director: "Souleymane Cissé" },
  { title: "The Glass Orchard", year: 1974, director: "Shohei Imamura" },
  { title: "Provincial Weather", year: 1962, director: "Mario Monicelli" },
  { title: "The Long Sunday", year: 1991, director: "Manoel de Oliveira" },
  { title: "Tin Anniversary", year: 1969, director: "Věra Chytilová" },
  { title: "The Borrowed Coat", year: 1959, director: "Yasuzo Masumura" },
  { title: "Cattle Road", year: 1980, director: "Fred Schepisi" },
  { title: "The Third Summer", year: 1993, director: "Hou Hsiao-hsien" },
  { title: "Machine for Sleeping", year: 2004, director: "Lucrecia Martel" },
  { title: "The Undertow", year: 1976, director: "Krzysztof Kieślowski" },
  { title: "Fair Weather Friends", year: 1948, director: "Jules Dassin" },
  { title: "The Mineral Line", year: 1986, director: "Aleksandr Sokurov" },
  { title: "Blue Hour at the Depot", year: 2011, director: "Cristian Mungiu" },
  { title: "The Neighbours' Garden", year: 1967, director: "Satyajit Ray" },
  { title: "The Orchard Wall", year: 1999, director: "Abbas Kiarostami" },
  { title: "Gravel", year: 2015, director: "Kelly Reichardt" },
  { title: "The Emptied House", year: 1990, director: "Theo Angelopoulos" },
  { title: "The Cold Kitchen", year: 1972, director: "István Szabó" },
];

function callModel(prompt, model) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", [
      "-p", "--model", model,
      "--disallowed-tools", "Bash", "Read", "Write", "Edit", "WebSearch", "WebFetch", "Glob", "Grep", "Task",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("timed out")); }, CALL_TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (c) => { clearTimeout(timer); c === 0 ? resolve(out) : reject(new Error("exit " + c + ": " + err.slice(0, 300))); });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseReply(raw, expected) {
  let t = String(raw).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object");
  const obj = JSON.parse(t.slice(a, b + 1));
  if (!obj || !Array.isArray(obj.films)) throw new Error("no films array");
  if (obj.films.length !== expected) throw new Error("expected " + expected + ", got " + obj.films.length);
  return obj.films;
}

/* Real films drawn by hash from the far end of the corpus's own shuffle, so the
   probe's real half is not the production run's first batches. */
function realPool(films, want, salt) {
  return films
    .map((f) => ({ f, h: nodeCrypto.createHash("sha1").update(salt + "|" + f.key).digest("hex") }))
    .sort((a, b) => (a.h < b.h ? -1 : 1))
    .slice(0, want)
    .map((x) => x.f);
}

function makeMixedBatches(reals, decoys) {
  const nb = Math.ceil(decoys.length / DECOYS_PER_BATCH);
  const batches = [];
  for (let i = 0; i < nb; i++) {
    const mine = decoys.slice(i * DECOYS_PER_BATCH, (i + 1) * DECOYS_PER_BATCH)
      .map((d, j) => ({ key: "decoy:" + i + ":" + j, title: d.title, year: d.year, director: d.director, decoy: true }));
    const rest = reals.slice(i * (10 - DECOYS_PER_BATCH), (i + 1) * (10 - DECOYS_PER_BATCH));
    /* Deterministic interleave: decoys are not all at the end, where a reader
       (or a model) would notice them as a block. */
    const b = rest.slice();
    b.splice(2, 0, mine[0]);
    if (mine[1]) b.splice(7, 0, mine[1]);
    batches.push(b);
  }
  return batches;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const vocab = JSON.parse(fs.readFileSync(VOCAB_FILE, "utf8"));
  const vocabSet = new Set(vocab.attributes.map((a) => a.id));
  const films = loadFilms();
  const nb = Math.ceil(DECOYS.length / DECOYS_PER_BATCH);
  const reals = realPool(films, nb * (10 - DECOYS_PER_BATCH), "consensus-decoy-1");
  const batches = makeMixedBatches(reals, DECOYS);

  if (dry) {
    console.log(batches.length + " batches, " + DECOYS.length + " decoys, " + reals.length + " real films");
    console.log(buildPrompt(batches[0], vocab).split("THE FILMS")[1]);
    return;
  }

  fs.mkdirSync(CACHE, { recursive: true });
  const results = [];
  const CONC = Number((process.argv.find((a, i) => process.argv[i - 1] === "--concurrency")) || 3);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= batches.length) return;
      await runOne(batches[i], i);
    }
  };
  const runOne = (async (b, i) => {
    const h = nodeCrypto.createHash("sha1").update("decoy1|" + MODEL + "|" + b.map((f) => f.key).join(",")).digest("hex").slice(0, 16);
    const cp = path.join(CACHE, "d_" + h + ".json");
    let parsed = null;
    if (fs.existsSync(cp)) {
      try { const d = JSON.parse(fs.readFileSync(cp, "utf8")); if (d.films && d.films.length === b.length) parsed = d.films; } catch (e) { /* refetch */ }
    }
    if (!parsed) {
      const prompt = buildPrompt(b, vocab);
      for (let attempt = 1; attempt <= 3 && !parsed; attempt++) {
        try {
          parsed = parseReply(await callModel(prompt, MODEL), b.length);
          fs.writeFileSync(cp, JSON.stringify({ films: parsed }));
        } catch (e) { if (attempt === 3) process.stderr.write("decoy batch " + i + " failed: " + e.message + "\n"); }
      }
    }
    if (!parsed) return;
    for (let j = 0; j < b.length; j++) {
      const entry = parsed.find((x) => Number(x && x.n) === j + 1) || parsed[j];
      if (!entry) continue;
      const rec = normalise(entry, vocabSet);
      results.push({ decoy: !!b[j].decoy, title: b[j].title, year: b[j].year, director: b[j].director, known: rec.known, recall: rec.recall, filled: Object.keys(rec.attrs).length });
    }
  });
  await Promise.all(new Array(Math.min(CONC, batches.length)).fill(0).map(worker));

  const d = results.filter((r) => r.decoy), r = results.filter((r) => !r.decoy);
  const tally = (xs) => ({ well: xs.filter((x) => x.known === "well").length, outline: xs.filter((x) => x.known === "outline").length, no: xs.filter((x) => x.known === "no").length, n: xs.length });
  const td = tally(d), tr = tally(r);

  console.log("\nDECOY PROBE — " + d.length + " films that do not exist, " + r.length + " real corpus films, same prompt, same batches\n");
  const fmt = (t) => "well " + t.well + " (" + (100 * t.well / t.n).toFixed(0) + "%)   outline " + t.outline + " (" + (100 * t.outline / t.n).toFixed(0) + "%)   no " + t.no + " (" + (100 * t.no / t.n).toFixed(0) + "%)";
  console.log("  DECOYS (do not exist):  " + fmt(td));
  console.log("  REAL   (same calls):    " + fmt(tr));
  console.log("");
  console.log("  hard failure rate (a `well` on a film that does not exist): " + (100 * td.well / td.n).toFixed(1) + "%");
  console.log("  soft failure rate (an `outline` inferred from the director): " + (100 * td.outline / td.n).toFixed(1) + "%");
  console.log("");
  for (const x of d) {
    console.log("  " + x.known.padEnd(8) + String(x.filled).padStart(2) + "  " + (x.title + " (" + x.year + ") — " + x.director).padEnd(56) + (x.recall ? " | " + x.recall : ""));
  }

  fs.writeFileSync(path.join(OUT, "consensus-decoy.json"), JSON.stringify({
    version: 1, model: MODEL, generated: new Date().toISOString(),
    note: "Hallucination probe for the consensus layer. Decoy films DO NOT EXIST and must never enter consensus.json.",
    decoyTally: td, realTally: tr, results,
  }, null, 1));
  console.log("\nwrote pipeline/out/consensus-decoy.json");
}

if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
