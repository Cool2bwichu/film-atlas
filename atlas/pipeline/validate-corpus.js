#!/usr/bin/env node
/* Corpus health check.
 *
 *   node pipeline/validate-corpus.js pipeline/out/spine.json
 *
 * Schema correctness is the easy half. The half that matters is graph shape:
 * a corpus can be perfectly well-formed and still be a pile of disconnected
 * cliques, which is what a record-only spine naturally produces. Report it in
 * numbers so growth decisions are made against evidence rather than a feeling
 * that the corpus is "getting bigger".
 */

const fs = require("fs");
const pairKey = require("./pair-key");

const TYPES = ["descent", "rebuttal", "convergence", "rhyme", "hand"];
/* Three kinds of claim, deliberately not collapsible into one confidence number:
     record   — checkable against credits or documents; derived, never written
     attested — someone involved said it; sourced, written by hand
     reading  — an interpretive claim about form; arguable, and labelled so
   The split matters most when one author is writing at volume: without it, a
   quotable fact and a personal reading arrive wearing the same clothes. */
const SOURCES = ["record", "attested", "reading"];

function load(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function components(films, edges) {
  const adj = new Map(Object.keys(films).map((k) => [k, new Set()]));
  for (const e of edges) {
    if (adj.has(e.a)) adj.get(e.a).add(e.b);
    if (adj.has(e.b)) adj.get(e.b).add(e.a);
  }
  const seen = new Set(), out = [];
  for (const k of adj.keys()) {
    if (seen.has(k)) continue;
    const stack = [k], comp = [];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n); comp.push(n);
      for (const m of adj.get(n) || []) if (!seen.has(m)) stack.push(m);
    }
    out.push(comp.sort());
  }
  return { comps: out.sort((a, b) => b.length - a.length), adj: adj };
}

function main() {
  const file = process.argv[2] || "pipeline/out/spine.json";
  const c = load(file);
  const films = c.films, edges = c.edges;
  const errors = [], warnings = [];

  /* ---- schema ---- */
  for (const [k, f] of Object.entries(films)) {
    if (!f.title) errors.push(k + ": no title");
    if (!f.year) warnings.push(k + ": no year (breaks the chronological layout)");
    if (!/^#[0-9a-fA-F]{6}$/.test(f.shadow || "")) errors.push(k + ": bad shadow colour");
    if (!/^#[0-9a-fA-F]{6}$/.test(f.highlight || "")) errors.push(k + ": bad highlight colour");
  }
  const seenEdge = new Map();   // pair -> the type already seen, for the message
  for (const e of edges) {
    if (!films[e.a]) errors.push("edge references unknown film: " + e.a);
    if (!films[e.b]) errors.push("edge references unknown film: " + e.b);
    if (e.a === e.b) errors.push("self edge on " + e.a);
    if (TYPES.indexOf(e.type) < 0) errors.push("unknown type " + e.type);
    if (SOURCES.indexOf(e.source) < 0) errors.push("unknown source " + e.source);
    if (!e.claim || e.claim.length < 12) errors.push(e.a + "->" + e.b + ": claim too thin");
    if (e.source === "record" && e.confidence < 1) {
      errors.push(e.a + "->" + e.b + ": a record with confidence < 1 is a category error");
    }
    if (e.source === "attested" && (e.confidence < 0.6 || e.confidence >= 1)) {
      errors.push(e.a + "->" + e.b + ": an attested claim sits between 0.6 and 0.99 — " +
        "someone said it (so not a guess) but saying it does not make it structurally true");
    }
    if (e.source === "attested" && !(e.evidence || []).length && !e.attribution) {
      errors.push(e.a + "->" + e.b + ": attested with nothing attributing it. Name who said it.");
    }
    if (e.source === "reading" && e.confidence >= 1) {
      errors.push(e.a + "->" + e.b + ": a reading cannot be certain");
    }
    if (e.source === "record" && !(e.evidence || []).length) {
      errors.push(e.a + "->" + e.b + ": record with no evidence reference");
    }
    /* Keyed on the PAIR, not on pair+type. Including the type made this check
       blind to the case that actually hurts: the app walks an adjacency list, so
       any pair carrying two edges puts the same film on the ring twice, whether
       or not the two edges agree about type. Keyed on pair+type it reported 5 of
       17 real duplicates and stayed silent about the rest. */
    const sig = pairKey(e.a, e.b);
    if (seenEdge.has(sig)) {
      warnings.push("duplicate edge: " + sig + " (" + seenEdge.get(sig) + " + " + e.type +
        ") -- the same film will appear twice on the other's ring");
    }
    seenEdge.set(sig, e.type);
  }

  /* ---- shape ---- */
  const { comps, adj } = components(films, edges);
  const orphans = [...adj.keys()].filter((k) => adj.get(k).size === 0);
  const thin = [...adj.keys()].filter((k) => adj.get(k).size === 1);
  const byType = {}; TYPES.forEach((t) => (byType[t] = edges.filter((e) => e.type === t).length));
  const record = edges.filter((e) => e.source === "record").length;
  const attested = edges.filter((e) => e.source === "attested").length;

  /* Strength collapse: within one director's filmography every pair maxes out
     on shared crew, so distance stops encoding anything and the cluster reads
     as an undifferentiated blob. AGENTS.md rule 1 says distance encodes the
     strength of the bond; if most edges share one value, it encodes nothing. */
  const buckets = {};
  edges.forEach((e) => { const b = e.strength.toFixed(2); buckets[b] = (buckets[b] || 0) + 1; });
  const topBucket = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0] || ["-", 0];
  const collapse = topBucket[1] / Math.max(1, edges.length);

  console.log("films            : " + Object.keys(films).length);
  console.log("edges            : " + edges.length + "   (record " + record +
    " / attested " + attested + " / reading " + (edges.length - record - attested) + ")");
  console.log("by type          : " + TYPES.map((t) => t + " " + byType[t]).join(", "));
  console.log("components       : " + comps.length + "   sizes " + comps.map((c) => c.length).join(", "));
  console.log("largest component: " + comps[0].length + " films (" +
    Math.round((100 * comps[0].length) / Object.keys(films).length) + "% of corpus)");
  console.log("orphans          : " + (orphans.length ? orphans.join(", ") : "none"));
  console.log("single-edge films: " + thin.length);
  console.log("strength collapse: " + Math.round(collapse * 100) + "% of edges at " + topBucket[0]);

  if (warnings.length) {
    console.log("\nwarnings (" + warnings.length + "):");
    warnings.slice(0, 12).forEach((w) => console.log("  - " + w));
    if (warnings.length > 12) console.log("  ... and " + (warnings.length - 12) + " more");
  }
  if (errors.length) {
    console.log("\nERRORS (" + errors.length + "):");
    errors.slice(0, 20).forEach((e) => console.log("  - " + e));
    console.log("\nFAIL");
    process.exit(1);
  }

  /* Advisory thresholds, not errors — a spine legitimately fragments. */
  console.log("\nschema OK");
  if (comps.length > 1) {
    console.log("NOTE: the graph is not connected. Shared crew builds dense clusters " +
      "inside a tradition and almost never crosses one. Bridging is what interpretive " +
      "edges are for — target them at pairs in different components rather than " +
      "generating them uniformly.");
  }
  if (collapse > 0.3) {
    console.log("NOTE: strength is collapsing toward a single value. Inside one " +
      "filmography every pair shares the same crew, so distance stops discriminating. " +
      "Consider collapsing a director's body of work to one cluster node rather than " +
      "drawing every pair.");
  }
}

main();
