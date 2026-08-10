#!/usr/bin/env node
/* audit-run-atlas.js — run the incumbent over the 30 audit queries and dump a
 * FULL score vector per query, not a top-10.
 *
 * The audit needs whole-corpus vectors because the questions it asks are about
 * the shape of the ranking, not its head: Spearman against pageviews over every
 * film, and the share of the corpus a side is even capable of returning. A
 * top-10 dump would answer neither and would quietly make both sides look
 * better than they are.
 *
 * Output: out/rag-audit-atlas.json
 *   keys[]                 film keys, one fixed order shared by every vector
 *   runs[].scores[]        score per film in keys[] order, 6dp
 *   runs[].read            unread fraction, clause counts, refusal
 * Scores are dumped rather than ranks so the audit can do its own tie handling;
 * match.js's alphabetical tie-break must never reach a correlation.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { buildAtlasSide, SANITY } = require("./atlas-side.js");

const HERE = __dirname;
const OUT = path.join(HERE, "..", "out");
const QUERIES = JSON.parse(fs.readFileSync(path.join(HERE, "audit-queries.json"), "utf8"));
const SHARED = JSON.parse(fs.readFileSync(path.join(HERE, "bakeoff-queries.json"), "utf8"));

/* The sanity queries must be byte-identical to the jointly-owned file. A
   bake-off where the two sides ran slightly different strings is not a
   bake-off, and the only way to know is to assert it every run. */
const mineSanity = QUERIES.queries.filter((q) => q.sanity).map((q) => q.q);
const theirs = SHARED.sanity.map((s) => s.q);
for (let i = 0; i < 3; i++) {
  if (mineSanity[i] !== theirs[i] || mineSanity[i] !== SANITY[i]) {
    console.error("SANITY DRIFT at " + i + ":\n  audit-queries.json: " + mineSanity[i] +
      "\n  bakeoff-queries.json: " + theirs[i] + "\n  atlas-side.js SANITY: " + SANITY[i]);
    process.exit(3);
  }
}

const t0 = Date.now();
const A = buildAtlasSide();
const buildMs = Date.now() - t0;
const keys = A.keys.slice();
const plotted = A.universes.plotted;

const runs = [];
const lat = [];
for (const q of QUERIES.queries) {
  /* One search over the whole corpus. The plotted-universe run is pure
     post-hoc filtering of this same vector — atlas-side.js's selftest asserts
     filtering never reorders — so it is computed at audit time from the mask
     rather than by scoring twice. */
  const r = A.search(q.q, { k: -1 });
  lat.push(r.ms);
  const s = r.scores;
  runs.push({
    id: q.id, tag: q.tag, q: q.q,
    ms: Math.round(r.ms * 100) / 100,
    scores: keys.map((k) => Math.round((s[k] || 0) * 1e6) / 1e6),
    read: {
      unreadFrac: Math.round(r.read.unreadFrac * 1000) / 1000,
      unreadSpans: r.read.unreadSpans,
      clauses: r.read.clauses,
      positiveClauses: r.read.positiveClauses,
      negatedClauses: r.read.negatedClauses,
      readings: r.read.readings.map((x) => ({ kind: x.kind, said: x.said, label: x.label, negate: x.negate })),
      unread: r.read.unread.map((x) => x.said),
    },
    refusal: r.refusal ? r.refusal.code : null,
    ties: { topScore: r.ties.topScore, atTop: r.ties.atTop, degenerate: r.ties.degenerate },
  });
  process.stderr.write(".");
}
process.stderr.write("\n");

/* warm steady-state latency, measured after the memoised first call */
const bench = [];
for (let i = 0; i < 3; i++) for (const q of QUERIES.queries) bench.push(A.search(q.q, { k: 10 }).ms);
bench.sort((a, b) => a - b);

const out = {
  side: "atlas",
  generated: new Date().toISOString(),
  provenance: A.provenance,
  keys,
  plottedMask: keys.map((k) => (plotted.has(k) ? 1 : 0)),
  buildMs,
  latency: {
    firstCallMs: Math.round(lat[0] * 100) / 100,
    warmMeanMs: Math.round((bench.reduce((a, b) => a + b, 0) / bench.length) * 100) / 100,
    warmMedianMs: Math.round(bench[Math.floor(bench.length / 2)] * 100) / 100,
    warmMinMs: Math.round(bench[0] * 100) / 100,
    warmMaxMs: Math.round(bench[bench.length - 1] * 100) / 100,
    n: bench.length,
  },
  runs,
};
fs.writeFileSync(path.join(OUT, "rag-audit-atlas.json"), JSON.stringify(out));
console.log("wrote out/rag-audit-atlas.json — " + runs.length + " queries x " + keys.length +
  " films, build " + buildMs + " ms, warm mean " + out.latency.warmMeanMs + " ms");
