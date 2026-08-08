#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { candidateCorpusVersion, validateDiscovery } = require("./discovery-contract");

const [discoveryPath] = process.argv.slice(2);
if (!discoveryPath) throw new Error("usage: validate-discovery.js <discovery> --identity <identity> [--corpus <corpus>]");
const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
};
const identityPath = argument("identity");
if (!identityPath) throw new Error("--identity is required");
const corpusPath = argument("corpus");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const identity = readJson(identityPath);
const corpus = corpusPath ? readJson(corpusPath) : null;
if (corpus && !corpus.meta?.corpusVersion) throw new Error("Supplied corpus has no corpusVersion");
const corpusKeys = corpus ? Object.keys(corpus.films || {}) : undefined;
const corpusFilmIds = corpus ? Object.fromEntries(Object.entries(corpus.films || {}).map(([key, film]) => [key, film.filmId])) : undefined;
const discovery = validateDiscovery(readJson(discoveryPath), {
  identity,
  corpusKeys,
  corpusVersion: corpus?.meta?.corpusVersion || candidateCorpusVersion(identity),
  corpusVersionContext: corpus ? "corpus metadata" : "candidate identity",
  corpusFilmIds,
});
console.log(`discovery OK: ${discovery.filmOrder.length} films`);
