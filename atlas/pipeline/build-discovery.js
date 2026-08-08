#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { buildDiscovery, contentVersion, writeJsonAtomically } = require("./discovery-contract");

const ROOT = path.join(__dirname, "..");
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a path or stable string`);
  return value;
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const identityPath = argument("identity", path.join(ROOT, "pipeline", "out", "identity.json"));
const harvestPath = argument("harvest", path.join(ROOT, "pipeline", "out", "harvest.json"));
const corpusPath = argument("corpus", null);
const taxonomyPath = argument("taxonomy", path.join(ROOT, "pipeline", "facet-taxonomy.json"));
const outPath = argument("out", corpusPath ? path.join(ROOT, "static", "discovery.json") : path.join(ROOT, "pipeline", "out", "discovery-candidate.json"));
const layoutAlgorithmVersion = argument("layout-algorithm", "atlas-layout-v1");
const identity = readJson(identityPath);
const harvest = readJson(harvestPath);
const corpus = corpusPath ? readJson(corpusPath) : null;
const corpusKeys = corpus ? Object.keys(corpus.films || {}) : undefined;
if (corpus) for (const [key, film] of Object.entries(corpus.films || {})) {
  if (!harvest.films[key]) harvest.films[key] = {
    qid: film.qid, title: film.title, year: film.year, crew: { director: [] }, country: [], genre: [], movement: [],
  };
}
const corpusVersion = corpus?.meta?.corpusVersion || contentVersion("corpus", { identityVersion: identity.identityVersion, scope: "candidate" });
const discovery = buildDiscovery({ identity, harvest, corpusKeys, taxonomy: readJson(taxonomyPath), corpusVersion, layoutAlgorithmVersion });
writeJsonAtomically(outPath, discovery);
console.log(`films: ${discovery.filmOrder.length}`);
console.log(`discovery version: ${discovery.discoveryVersion}`);
console.log(`coverage warnings: ${discovery.coverageWarnings.length}`);
console.log(`wrote ${outPath}`);
