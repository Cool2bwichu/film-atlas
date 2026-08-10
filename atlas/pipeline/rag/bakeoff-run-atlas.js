#!/usr/bin/env node
/* bakeoff-run-atlas.js — runs the shared battery through atlas-side.js and
 * dumps one JSON blob. Adds no scoring: it slices what atlas-side returned,
 * plus the rank of each watch film, plus what the parser did and did not read. */
const fs = require("fs");
const path = require("path");
const { buildAtlasSide } = require("./atlas-side.js");

const HERE = __dirname;
const battery = JSON.parse(fs.readFileSync(path.join(HERE, "bakeoff-battery.json"), "utf8"));
const A = buildAtlasSide();
const out = { side: "atlas", provenance: A.provenance, queries: [] };

const universe = process.argv.includes("--plotted") ? "plotted" : undefined;

for (const spec of battery.queries) {
  const full = A.search(spec.q, { k: -1, universe });
  const n = full.results.length;
  const rankOf = {};
  for (const w of spec.watch) {
    const hit = full.results.find((r) => r.key === w);
    rankOf[w] = hit ? { rank: hit.rank, score: +hit.score.toFixed(4), of: n, tie: hit.tie } : { rank: null, of: n, note: "key not found" };
  }
  out.queries.push({
    id: spec.id, q: spec.q, probes: spec.probes,
    ms: +full.ms.toFixed(2),
    universe: full.universe,
    top: full.results.slice(0, 12).map((r) => ({
      rank: r.rank, key: r.key, title: r.title, year: r.year,
      score: +r.score.toFixed(4), tie: r.tie,
    })),
    read: {
      unreadFrac: +full.read.unreadFrac.toFixed(3),
      unread: full.read.unread.map((u) => u.said),
      readings: full.read.readings.map((r) => ({
        said: r.said, label: r.label, terms: r.terms, negate: r.negate,
        film: r.film ? r.film.title : undefined,
      })),
      clauses: full.read.clauses,
      negatedClauses: full.read.negatedClauses,
      conflicts: full.read.conflicts,
    },
    ties: full.ties,
    refusal: full.refusal,
    rankOf,
  });
}

const dest = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "/dev/stdout";
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
console.error(`atlas side: ${out.queries.length} queries, universe=${universe || "corpus"} -> ${dest}`);
