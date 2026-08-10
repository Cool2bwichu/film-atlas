#!/usr/bin/env node
/* dump-clauses.js — the parsed clauses for the 30 audit queries, as attribute
 * ids, so the Python side can build the BUILD-TIME-SHIPPABLE hybrid without
 * re-implementing query-parse.js in another language.
 *
 * Writes out/rag-query-clauses.json: { qid: { positive:[attr], negated:[attr] } }
 * Uses the shipped parser and shipped lexicon; adds nothing.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { buildParser } = require("../query-parse.js");

const HERE = __dirname;
const OUT = path.join(HERE, "..", "out");
const Q = JSON.parse(fs.readFileSync(path.join(HERE, "audit-queries.json"), "utf8"));
const parser = buildParser();

const out = {};
for (const q of Q.queries) {
  const p = parser.parse(q.q);
  const positive = new Set(), negated = new Set();
  for (const c of p.clauses) {
    const bag = c.negate ? negated : positive;
    for (const a of (c.anyOf || c.terms || [])) bag.add(a);
  }
  out[q.id] = {
    q: q.q,
    positive: [...positive],
    negated: [...negated],
    unread: p.unread.map((u) => u.text),
  };
}
fs.writeFileSync(path.join(OUT, "rag-query-clauses.json"),
  JSON.stringify({ note: "parsed attribute ids per audit query, from the shipped query-parse.js", queries: out }, null, 1));
const withAttrs = Object.values(out).filter((r) => r.positive.length || r.negated.length).length;
console.log(`rag-query-clauses.json: ${Object.keys(out).length} queries, ${withAttrs} with at least one attribute`);
