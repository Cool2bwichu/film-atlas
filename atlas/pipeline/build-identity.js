#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { buildIdentityManifest, writeJsonAtomically } = require("./discovery-contract");

const ROOT = path.join(__dirname, "..");
const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const HARVEST = flag("harvest", path.join(ROOT, "pipeline", "out", "harvest.json"));
const CORPUS = flag("corpus", path.join(ROOT, "static", "corpus.json"));
const OVERRIDES = flag("overrides", path.join(ROOT, "pipeline", "identity-overrides.json"));
const OUT = flag("out", path.join(ROOT, "pipeline", "out", "identity.json"));
const PREVIOUS = flag("previous", fs.existsSync(OUT) ? OUT : null);

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const manifest = buildIdentityManifest({
  harvest: read(HARVEST),
  releasedCorpus: read(CORPUS),
  overrides: read(OVERRIDES),
  previousIdentity: PREVIOUS && fs.existsSync(PREVIOUS) ? read(PREVIOUS) : undefined,
  source: "pipeline/seeds-expansion.txt",
});

writeJsonAtomically(OUT, manifest);
console.log(`identity records: ${manifest.films.length}`);
console.log(`identity version: ${manifest.identityVersion}`);
console.log(`wrote ${OUT}`);
