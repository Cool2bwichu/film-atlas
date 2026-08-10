#!/usr/bin/env node
/* dump-attrs.js — writes the consensus attribute table out as plain JSON so the
 * Python hybrid harness can run the negation check off the SAME table match.js
 * scores from, rather than a second table invented for the audit.
 *
 * Reads: consensus.shard-*.json via match.js readShards, corpus.json via
 * readCorpusKeys, complements via questioner.js withComplements — i.e. exactly
 * the wire app/query-runtime.js uses and atlas-side.js reproduces.
 * Writes: out/rag-attr-table.json   { vocab, films: { key: { attr: strength } } }
 * Adds no scoring logic of its own.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { buildTable, readShards, readCorpusKeys } = require("../match.js");
const { withComplements } = require("../questioner.js");

const OUT = path.join(__dirname, "..", "out");
const t = withComplements(buildTable(readShards(OUT).shards, readCorpusKeys()));
const vocab = [...t.vocab];
const keys = Object.keys(t.keys);   /* t.keys is the corpus meta map, not a Set */

const films = {};
let cells = 0;
for (const k of keys) {
  const row = {};
  for (const a of vocab) {
    const v = t.value(k, a);
    if (typeof v === "number" && v > 0) { row[a] = v; cells++; }
  }
  films[k] = row;
}

/* match.js breaks a score tie with a.localeCompare(b). The Python harness cannot
   reproduce ICU collation by guessing, so the exact order is emitted here as an
   ordinal per key and Python sorts by (-score, localeOrder). Same tie-break,
   not a similar one. */
const localeOrder = {};
keys.slice().sort((a, b) => a.localeCompare(b)).forEach((k, i) => { localeOrder[k] = i; });

const payload = {
  note: "consensus attribute table, dumped verbatim for the hybrid harness's negation check. Same shards, same complements, same accessor as match.js.",
  generated: new Date().toISOString(),
  vocab, nFilms: keys.length, nCells: cells, localeOrder,
  films,
};
fs.writeFileSync(path.join(OUT, "rag-attr-table.json"), JSON.stringify(payload));
console.log(`rag-attr-table.json: ${keys.length} films x ${vocab.length} attrs, ${cells} non-zero cells, localeOrder emitted`);
