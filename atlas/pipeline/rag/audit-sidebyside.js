#!/usr/bin/env node
/* audit-sidebyside.js — the top 5 from each side, next to each other, with the
 * two numbers that decide whether a row means anything: how much of the
 * sentence the incumbent READ, and how many films are tied with the one shown.
 * Every film carries its 60-day pageviews so the fame claims in the report can
 * be checked by eye rather than taken on trust.
 *
 *   node atlas/pipeline/rag/audit-sidebyside.js            # all 30
 *   node atlas/pipeline/rag/audit-sidebyside.js q01 q27    # named queries
 */
"use strict";
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "out");
const R = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
const { fame } = require("./fame.js");
const A = R("rag-audit-atlas.json"), D = R("rag-audit-dense.json"), FACTS = R("rag-audit-facts.json").films;
const F = fame(), KEYS = A.keys;
const want = process.argv.slice(2).filter((a) => /^q\d+$/.test(a));

function top(run, n) {
  const idx = KEYS.map((_, i) => i).filter((i) => run.scores[i] !== -1);
  idx.sort((a, b) => run.scores[b] - run.scores[a] || KEYS[a].localeCompare(KEYS[b]));
  const cut = run.scores[idx[n - 1]];
  const band = idx.filter((i) => run.scores[i] >= cut - 1e-12).length;
  return { rows: idx.slice(0, n), band };
}
const line = (i, s) => "     " + (s === undefined ? "" : s.toFixed(3).padStart(6) + "  ") +
  KEYS[i].padEnd(38) + String(F.views[KEYS[i]] === undefined ? "?" : F.views[KEYS[i]]).padStart(9) + " views  " +
  ((FACTS[KEYS[i]] || {}).textTier || "?");

const denseRuns = new Map(D.configs.native256.runs.map((r) => [r.id, r]));
for (const run of A.runs) {
  if (want.length && !want.includes(run.id)) continue;
  const dr = denseRuns.get(run.id);
  console.log("\n" + run.id + " [" + run.tag + "]  " + run.q);
  const a = top(run, 5), d = top(dr, 5);
  console.log("   ATLAS   read " + ((1 - run.read.unreadFrac) * 100).toFixed(0) + "% of the sentence" +
    (run.refusal ? "   REFUSAL: " + run.refusal + " — the list below is the alphabet, not a ranking"
      : "   top band " + a.band + " films"));
  for (const i of a.rows) console.log(line(i, run.scores[i]));
  console.log("   DENSE   MiniLM native 256, always returns 5, never declares a miss");
  for (const i of d.rows) console.log(line(i, dr.scores[i]));
}
