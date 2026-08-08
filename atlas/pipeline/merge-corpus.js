#!/usr/bin/env node
/* Merge the machine-built record spine with hand-written interpretive edges.
 *
 *   node pipeline/merge-corpus.js
 *
 * Reads  pipeline/out/spine.json   (generated, never edited by hand)
 *        static/readings.json      (edited by hand, never generated in place)
 * Writes static/corpus.json        (what the app loads)
 *
 * The separation is the safeguard. Regenerating the spine can never overwrite
 * a reviewed reading, and adding a reading can never be mistaken for a record,
 * because the two live in different files with different provenance and only
 * meet here. A reading that names a film absent from the spine is dropped and
 * reported rather than silently inventing a node for it.
 */

const fs = require("fs");
const path = require("path");
const pairKey = require("./pair-key");
const { attachIdentityToCorpus } = require("./discovery-contract");

const ROOT = path.join(__dirname, "..");
const SPINE = path.join(ROOT, "pipeline", "out", "spine.json");
const READINGS = path.join(ROOT, "static", "readings.json");
const IDENTITY = path.join(ROOT, "pipeline", "out", "identity.json");
const OUT = path.join(ROOT, "static", "corpus.json");

const spine = JSON.parse(fs.readFileSync(SPINE, "utf8"));
const readings = fs.existsSync(READINGS)
  ? JSON.parse(fs.readFileSync(READINGS, "utf8"))
  : { edges: [], palettes: {} };
if (!fs.existsSync(IDENTITY)) {
  throw new Error("no pipeline/out/identity.json — run: node pipeline/build-identity.js");
}
const identity = JSON.parse(fs.readFileSync(IDENTITY, "utf8"));

const films = JSON.parse(JSON.stringify(spine.films));
const edges = spine.edges.slice();

/* Curated palettes win over the era heuristic — a real colour observed from
   the film's photography is a better fact than a decade-wide default. */
let repainted = 0;
for (const [k, p] of Object.entries(readings.palettes || {})) {
  if (!films[k]) continue;
  films[k].shadow = p.shadow;
  films[k].highlight = p.highlight;
  films[k].paletteSource = "curated";
  repainted++;
}

/* associate.js guarantees one edge per pair. Appending readings blindly broke
   that guarantee, and the symptom is not a duplicate row in a file — the app
   walks the adjacency list, so a pair carrying two edges puts the SAME FILM on
   the ring twice and spends one of six slots saying the same thing.

   Where both exist the reading wins, which is the whole of AGENTS rule 8. The
   record edge would otherwise outrank it on raw score and replace a written
   observation with the coincidence underneath it: Alien -> Sunshine was about
   to render "Both turn on space suit and space marine" in place of "a working
   crew rather than heroes, undone in corridors". The superseded record claim is
   kept on `alsoRecord` so the evidence is not lost. */
const spineByPair = new Map();
edges.forEach((e, i) => spineByPair.set(pairKey(e.a, e.b), i));

/* Readings win over records on the same pair (above), but two READINGS on the
   same pair are a different failure with the same symptom: nothing here
   stopped a second hand-written edge on a pair another reading already
   claimed, which reproduces the exact "same film twice on one ring" bug for
   authored-vs-authored instead of authored-vs-record. Never triggered yet —
   checked across all 516 current readings — but latent, and cheap to close
   now while a human has to fix the source file anyway rather than have the
   pipeline silently pick a winner between two arguments someone wrote. */
const claimedByReading = new Map();

const dropped = [], duplicateReadings = [];
let added = 0, superseded = 0;
const supersededIdx = new Set();
for (const e of readings.edges || []) {
  if (!films[e.a] || !films[e.b]) { dropped.push(e.a + " -> " + e.b); continue; }
  if (e.source === "record") {
    console.error("REFUSED: " + e.a + " -> " + e.b +
      " is marked 'record' in readings.json. Records come from the pipeline, " +
      "not from hand editing. Add the underlying fact to Wikidata instead.");
    process.exit(1);
  }

  const sig = pairKey(e.a, e.b);
  const prior = claimedByReading.get(sig);
  if (prior !== undefined) {
    duplicateReadings.push(e.a + " -> " + e.b + "  (kept: \"" +
      prior.claim.slice(0, 60) + "\", dropped: \"" + e.claim.slice(0, 60) + "\")");
    continue;
  }
  claimedByReading.set(sig, e);

  /* attested and reading are both authored; only record is derived */
  const basis = e.source === "attested" ? "attested" : "reading";
  const merged = Object.assign({}, e, { source: basis });

  const hit = spineByPair.get(sig);
  if (hit !== undefined && !supersededIdx.has(hit)) {
    const rec = edges[hit];
    merged.alsoRecord = { signal: rec.signal || null, claim: rec.claim, strength: rec.strength };
    supersededIdx.add(hit);
    superseded++;
  }
  edges.push(merged);
  added++;
}

/* Splice out the superseded records only after the loop, so the indices above
   stay valid while it runs. */
const finalEdges = edges.filter((_, i) => !supersededIdx.has(i));

const legacyCorpus = {
  version: spine.version + "+readings",
  note: "Generated by pipeline/merge-corpus.js. Do not edit by hand: " +
        "records come from pipeline/out/spine.json, readings from static/readings.json.",
  films: films,
  edges: finalEdges,
};
const corpus = attachIdentityToCorpus({ corpus: legacyCorpus, identity });
fs.writeFileSync(OUT, JSON.stringify(corpus, null, 1));

console.log("films            : " + Object.keys(films).length);
console.log("record edges     : " + spine.edges.length);
console.log("authored edges   : " + added + "   (attested " +
  (readings.edges || []).filter((e) => e.source === "attested").length + ")");
console.log("curated palettes : " + repainted);
console.log("superseded       : " + superseded +
  "   record edges replaced by a reading on the same pair (claim kept on alsoRecord)");
console.log("total edges      : " + finalEdges.length);
if (duplicateReadings.length) {
  console.log("\nREADINGS DROPPED, second one on a pair already claimed (" +
    duplicateReadings.length + "):");
  duplicateReadings.forEach((d) => console.log("  - " + d));
  console.log("Fix by rewriting one of the two readings.json entries, not by rerunning.");
}
if (dropped.length) {
  console.log("\ndropped readings referencing films outside the spine (" + dropped.length + "):");
  dropped.forEach((d) => console.log("  - " + d));
  console.log("Add those titles to pipeline/seeds.txt and rebuild the spine.");
}
console.log("\nwrote static/corpus.json");
