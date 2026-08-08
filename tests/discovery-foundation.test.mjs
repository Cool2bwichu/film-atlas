import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  attachIdentityToCorpus,
  buildIdentityManifest,
  canonicalJson,
  candidateCorpusVersion,
  contentVersion,
  buildDiscovery,
  filmIdForQid,
  normalizeFacetTaxonomy,
  parseMergeOptions,
  prepareDiscoveryHarvest,
  projectDiscovery,
  validateDiscovery,
  validateIdentityManifest,
  writeJsonAtomically,
} = require("../atlas/pipeline/discovery-contract.js");

const fixture = (name) => JSON.parse(readFileSync(
  new URL(`./fixtures/discovery-foundation/${name}`, import.meta.url),
  "utf8",
));

const overrides = { schemaVersion: 1, films: {} };
const source = "pipeline/seeds-expansion.txt";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const writeJson = (destination, value) => writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`);
const runPipeline = (script, args) => spawnSync(process.execPath, [script, ...args], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
const rehashDiscovery = (discovery) => {
  const payload = structuredClone(discovery);
  delete payload.discoveryVersion;
  discovery.discoveryVersion = contentVersion("discovery", payload);
  return discovery;
};

function legacyDiscoveryFixture() {
  const harvest = fixture("harvest.json");
  const releasedCorpus = fixture("corpus.json");
  const legacy = {
    stableSlug: "the duel",
    qid: "Q17498893",
    status: "legacy-release-only",
    reason: "Keep the authored endpoint.",
  };
  releasedCorpus.films[legacy.stableSlug] = {
    qid: legacy.qid,
    title: "The Duel",
    year: 1971,
  };
  const identity = buildIdentityManifest({
    harvest,
    releasedCorpus,
    overrides: { schemaVersion: 1, films: {}, qidCorrections: [], legacyRetained: [legacy] },
    source,
  });
  const record = identity.films.find((film) => film.stableSlug === legacy.stableSlug);
  const corpus = {
    meta: { corpusVersion: contentVersion("corpus", { fixture: "legacy-release" }) },
    films: {
      [legacy.stableSlug]: {
        ...releasedCorpus.films[legacy.stableSlug],
        filmId: record.filmId,
      },
    },
    edges: [],
  };
  return { corpus, harvest, identity, record };
}

function discoveryFixture() {
  const harvest = fixture("harvest.json");
  const identity = buildIdentityManifest({
    harvest,
    releasedCorpus: fixture("corpus.json"),
    overrides,
    source,
  });
  return {
    identity,
    harvest,
    taxonomy: fixture("facet-taxonomy.json"),
    corpusKeys: ["old-key", "collision-one", "collision-two"],
    corpusVersion: contentVersion("corpus", { fixture: "discovery-v1" }),
    layoutAlgorithmVersion: "fixture-layout-v1",
  };
}

test("facet taxonomy explicitly assigns every raw genre exactly once", () => {
  const taxonomy = normalizeFacetTaxonomy(fixture("facet-taxonomy.json"));

  assert.equal(taxonomy.rawGenreToFamily.Q1000, "genre:action");
  assert.equal(taxonomy.rawGenreToFamily.Q1001, "genre:drama");
  assert.equal(taxonomy.rawGenreToFamily.Q1002, "genre:uncategorized");
  assert.equal(taxonomy.families["genre:drama"].broad, true);
  assert.equal(taxonomy.families["genre:drama"].programmePriority, 0);
  assert.throws(() => normalizeFacetTaxonomy({ ...fixture("facet-taxonomy.json"), rawGenreToFamily: { Q1000: "genre:not-reviewed" } }));
});

test("facet taxonomy retains reviewed high-risk genre decisions", () => {
  const taxonomy = JSON.parse(readFileSync(new URL("../atlas/pipeline/facet-taxonomy.json", import.meta.url), "utf8"));
  const expected = {
    Q1135802: "genre:uncategorized", Q622370: "genre:drama", Q853630: "genre:horror",
    Q2297927: "genre:thriller", Q130130466: "genre:fantasy", Q104765957: "genre:science-fiction",
    Q138603203: "genre:comedy", Q1332055: "genre:horror", Q4184: "genre:uncategorized",
  };
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map((qid) => [qid, taxonomy.rawGenreToFamily[qid]])), expected);
  assert.equal(taxonomy.families["genre:historical"].label, "Historical & biographical");
});

test("discovery manifest preserves reviewed facets and movement provenance", () => {
  const input = discoveryFixture();
  const expected = fixture("discovery.expected.json");
  const discovery = buildDiscovery(input);

  assert.deepEqual(discovery.filmOrder, expected.filmOrder);
  assert.deepEqual(discovery.facets.postings, expected.postings);
  assert.deepEqual(discovery.movementProvenance, expected.movementProvenance);
  for (const [name, coverage] of Object.entries(expected.coverage)) {
    for (const [key, value] of Object.entries(coverage)) assert.equal(discovery.facets.definitions[name][key], value);
  }
  assert.equal(discovery.facets.definitions.country.values["country:Q38"].label, "Italy");
  assert.equal(discovery.facets.definitions.director.values["director:Q700"].label, "Director One");
  assert.deepEqual(Object.values(discovery.facets.definitions).map((definition) => definition.selectable), [false, false, false, false, false]);
  assert.deepEqual(discovery.coverageWarnings, ["movement provenance is legacy-only for 1 film(s)"]);
  assert.equal(discovery.layoutAlgorithmVersion, input.layoutAlgorithmVersion);
  assert.equal(discovery.layoutVersion, contentVersion("layout", {
    algorithm: input.layoutAlgorithmVersion,
    corpusVersion: input.corpusVersion,
    filmOrder: discovery.filmOrder,
  }));
  assert.deepEqual(validateDiscovery(discovery, { identity: input.identity, corpusKeys: input.corpusKeys }), discovery);
});

test("discovery facet output is canonical and validation rejects corrupt memberships", () => {
  const input = discoveryFixture();
  const discovery = buildDiscovery(input);
  const shuffled = {
    ...input,
    harvest: { ...input.harvest, films: Object.fromEntries(Object.entries(input.harvest.films).reverse()) },
    taxonomy: { ...input.taxonomy, rawGenreToFamily: Object.fromEntries(Object.entries(input.taxonomy.rawGenreToFamily).reverse()) },
  };
  assert.equal(canonicalJson(buildDiscovery(shuffled)), canonicalJson(discovery));

  const corrupt = structuredClone(discovery);
  corrupt.facets.postings.country["country:Q38"] = [0, 0];
  assert.throws(() => validateDiscovery(corrupt, { identity: input.identity, corpusKeys: input.corpusKeys }));
  const unmapped = structuredClone(input.taxonomy);
  delete unmapped.rawGenreToFamily.Q1002;
  assert.throws(() => buildDiscovery({ ...input, taxonomy: unmapped }));
});

test("discovery validation rejects facet, membership, coverage, provenance, warning, corpus, and layout mutations", () => {
  const input = discoveryFixture();
  const discovery = buildDiscovery(input);
  const reject = (mutate, expected) => {
    const value = structuredClone(discovery);
    mutate(value);
    rehashDiscovery(value);
    assert.throws(() => validateDiscovery(value, {
      identity: input.identity,
      corpusKeys: input.corpusKeys,
      corpusVersion: input.corpusVersion,
      layoutAlgorithmVersion: input.layoutAlgorithmVersion,
    }), expected);
  };
  reject((value) => { delete value.facets.definitions.director; });
  reject((value) => { value.keyByFilmId[value.filmOrder[0]] = "wrong-key"; });
  reject((value) => { delete value.facets.postings.era["era:1980-1999"]; });
  reject((value) => { value.facets.definitions.country.values["country:unused"] = { label: "Unused", count: 1 }; });
  reject((value) => { value.facets.definitions.genre.known++; });
  reject((value) => { delete value.movementProvenance[value.filmOrder[0]]; });
  reject((value) => { value.coverageWarnings = []; });
  reject((value) => { value.corpusVersion = "corpus-wrong"; });
  reject((value) => { value.layoutVersion = discovery.layoutVersion; value.filmOrder = value.filmOrder.slice(0, 2); });
  reject((value) => {
    value.layoutAlgorithmVersion = "fixture-layout-v2";
    value.layoutVersion = contentVersion("layout", {
      algorithm: value.layoutAlgorithmVersion,
      corpusVersion: value.corpusVersion,
      filmOrder: value.filmOrder,
    });
  }, /layoutAlgorithmVersion does not match the supplied layout basis/);
  reject((value) => { value.layoutVersion = "layout-0000000000000000"; }, /layoutVersion is invalid/);
  reject((value) => {
    value.layoutAlgorithmVersion = "fixture layout v1";
    value.layoutVersion = contentVersion("layout", {
      algorithm: value.layoutAlgorithmVersion,
      corpusVersion: value.corpusVersion,
      filmOrder: value.filmOrder,
    });
  }, /layoutAlgorithmVersion must be a stable lowercase identifier/);
});

test("discovery validates exact per-film movement provenance and counters", () => {
  const input = discoveryFixture();
  const discovery = buildDiscovery(input);
  const validateMutation = (mutate) => {
    const value = structuredClone(discovery);
    mutate(value);
    rehashDiscovery(value);
    assert.throws(() => validateDiscovery(value, {
      identity: input.identity,
      corpusKeys: input.corpusKeys,
      corpusVersion: input.corpusVersion,
      layoutAlgorithmVersion: input.layoutAlgorithmVersion,
    }));
  };

  validateMutation((value) => {
    const filmId = value.filmOrder[0];
    value.movementProvenance[filmId]["movement:Q901"] = value.movementProvenance[filmId]["movement:Q900"];
    delete value.movementProvenance[filmId]["movement:Q900"];
  });
  validateMutation((value) => {
    value.movementProvenance[value.filmOrder[0]]["movement:Q900"][1] = "director:not-a-qid";
  });
  validateMutation((value) => {
    value.movementProvenance[value.filmOrder[0]]["movement:Q900"] = ["director:Q700", "direct"];
  });
  validateMutation((value) => {
    value.movementProvenance[value.filmOrder[0]]["movement:Q900"] = ["direct", "direct"];
  });
  validateMutation((value) => {
    value.movementProvenance[value.filmOrder[0]]["movement:Q900"] = [];
  });
  validateMutation((value) => {
    value.movementProvenance[value.filmOrder[2]]["movement:Q901"] = ["direct", "legacy"];
  });
  validateMutation((value) => { value.facets.definitions.movement.direct++; });
  validateMutation((value) => { value.facets.definitions.movement.inherited++; });
  validateMutation((value) => { value.facets.definitions.movement.legacy++; });
  validateMutation((value) => { value.facets.definitions.movement.total++; });
});

test("discovery rejects ambiguous singular facets and derives the exact warning set", () => {
  const input = discoveryFixture();
  const discovery = buildDiscovery(input);
  const reject = (mutate, source = discovery) => {
    const value = structuredClone(source);
    mutate(value);
    rehashDiscovery(value);
    assert.throws(() => validateDiscovery(value, {
      identity: input.identity,
      corpusKeys: input.corpusKeys,
      corpusVersion: input.corpusVersion,
      layoutAlgorithmVersion: input.layoutAlgorithmVersion,
    }));
  };

  reject((value) => {
    value.facets.postings.era["era:1960-1979"].push(0);
    value.facets.postings.era["era:1960-1979"].sort((a, b) => a - b);
    value.facets.definitions.era.values["era:1960-1979"].count++;
  });
  reject((value) => {
    value.facets.postings.country["country:Q38"].push(2);
    value.facets.definitions.country.values["country:Q38"].count++;
  });
  reject((value) => {
    value.facets.postings.director["director:unknown"] = [0];
    value.facets.definitions.director.values["director:unknown"].count = 1;
    value.facets.definitions.director.known = 2;
    value.facets.definitions.director.reviewedUnknown = 1;
  });

  const missingLabelInput = structuredClone(input);
  delete missingLabelInput.harvest.labels.Q701;
  const missingLabelDiscovery = buildDiscovery(missingLabelInput);
  assert.deepEqual(missingLabelDiscovery.coverageWarnings, [
    "missing label for director:Q701",
    "movement provenance is legacy-only for 1 film(s)",
  ]);
  reject((value) => {
    value.coverageWarnings = value.coverageWarnings.filter((warning) => warning !== "missing label for director:Q701");
  }, missingLabelDiscovery);
  reject((value) => { value.coverageWarnings.push("missing label for director:Q700"); });
  reject((value) => { value.coverageWarnings.push("missing label for country:Q999"); });

  const projected = projectDiscovery(missingLabelDiscovery, fixture("sample-keep.json"), "fixture-warning-sample-v1");
  assert.deepEqual(projected.coverageWarnings, ["movement provenance is legacy-only for 1 film(s)"]);
});

test("discovery version fields require literal strings rather than coercible values", () => {
  const input = discoveryFixture();
  const discovery = buildDiscovery(input);
  const reject = (mutate) => {
    const value = structuredClone(discovery);
    mutate(value);
    value.layoutVersion = contentVersion("layout", {
      algorithm: value.layoutAlgorithmVersion,
      corpusVersion: value.corpusVersion,
      filmOrder: value.filmOrder,
    });
    rehashDiscovery(value);
    assert.throws(() => validateDiscovery(value));
  };

  reject((value) => { value.corpusVersion = [value.corpusVersion]; });
  reject((value) => { value.corpusVersion = { value: input.corpusVersion }; });
  reject((value) => { value.layoutAlgorithmVersion = [value.layoutAlgorithmVersion]; });
  reject((value) => { value.layoutAlgorithmVersion = { value: input.layoutAlgorithmVersion }; });
  assert.throws(() => buildDiscovery({ ...input, corpusVersion: [input.corpusVersion] }));
  assert.throws(() => buildDiscovery({ ...input, layoutAlgorithmVersion: [input.layoutAlgorithmVersion] }));
});

test("discovery build rejects noncanonical dynamic facet QIDs", () => {
  const mutations = [
    (input) => { input.harvest.films["old-key"].country = ["not-a-qid"]; },
    (input) => { input.harvest.films["old-key"].crew.director = ["not-a-qid"]; },
    (input) => { input.harvest.films["old-key"].movementDirect = ["not-a-qid"]; },
    (input) => { input.harvest.films["old-key"].movementInherited[0].viaDirector = "not-a-qid"; },
  ];
  for (const mutate of mutations) {
    const input = discoveryFixture();
    mutate(input);
    assert.throws(() => buildDiscovery(input), /invalid .*QID|invalid director route/);
  }
});

test("discovery validation rejects rehashed noncanonical dynamic facet IDs", () => {
  const input = discoveryFixture();
  const discovery = buildDiscovery(input);
  const replacements = [
    ["country", "country:Q142", "country:not-a-qid"],
    ["director", "director:Q701", "director:not-a-qid"],
    ["movement", "movement:Q900", "movement:not-a-qid"],
  ];
  for (const [facet, original, replacement] of replacements) {
    const value = structuredClone(discovery);
    value.facets.definitions[facet].values[replacement] = value.facets.definitions[facet].values[original];
    delete value.facets.definitions[facet].values[original];
    value.facets.postings[facet][replacement] = value.facets.postings[facet][original];
    delete value.facets.postings[facet][original];
    if (facet === "movement") for (const routes of Object.values(value.movementProvenance)) {
      if (!routes[original]) continue;
      routes[replacement] = routes[original];
      delete routes[original];
    }
    rehashDiscovery(value);
    assert.throws(() => validateDiscovery(value, {
      identity: input.identity,
      corpusKeys: input.corpusKeys,
      corpusVersion: input.corpusVersion,
      layoutAlgorithmVersion: input.layoutAlgorithmVersion,
    }), /dynamic value is invalid/);
  }
});

test("discovery rejects duplicate canonical harvest QIDs before either preparation or build lookup", () => {
  const input = discoveryFixture();
  const harvest = structuredClone(input.harvest);
  harvest.films["duplicate-qid-record"] = { ...structuredClone(harvest.films["old-key"]), title: "Duplicate" };

  assert.throws(
    () => prepareDiscoveryHarvest({ identity: input.identity, harvest, corpus: { films: {} } }),
    /Q100 is assigned to more than one film/,
  );
  assert.throws(() => buildDiscovery({ ...input, harvest }), /Q100 is assigned to more than one film/);
});

test("candidate corpus versions are deterministic and malformed corpus versions are rejected", () => {
  const input = discoveryFixture();
  const expectedCorpusVersion = contentVersion("corpus", {
    identityVersion: input.identity.identityVersion,
    scope: "candidate",
  });
  assert.equal(typeof candidateCorpusVersion, "function");
  assert.equal(candidateCorpusVersion(input.identity), expectedCorpusVersion);
  assert.throws(() => buildDiscovery({ ...input, corpusVersion: "corpus-fixture-v1" }), /corpusVersion/);
});

test("candidate validation rejects an independently rehashed corpus-version substitute", () => {
  const input = discoveryFixture();
  const expectedCorpusVersion = contentVersion("corpus", {
    identityVersion: input.identity.identityVersion,
    scope: "candidate",
  });
  const directory = mkdtempSync(join(tmpdir(), "atlas-discovery-candidate-context-"));
  const identityPath = join(directory, "identity.json");
  const discoveryPath = join(directory, "discovery.json");
  try {
    const discovery = buildDiscovery({ ...input, corpusKeys: undefined, corpusVersion: expectedCorpusVersion });
    discovery.corpusVersion = "corpus-0000000000000000";
    discovery.layoutVersion = contentVersion("layout", {
      algorithm: input.layoutAlgorithmVersion,
      corpusVersion: discovery.corpusVersion,
      filmOrder: discovery.filmOrder,
    });
    rehashDiscovery(discovery);
    writeJson(identityPath, input.identity);
    writeJson(discoveryPath, discovery);

    const result = runPipeline("atlas/pipeline/validate-discovery.js", [discoveryPath, "--identity", identityPath]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /corpusVersion does not match candidate identity/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("discovery projection reindexes a non-contiguous sample without changing corpus version", () => {
  const input = discoveryFixture();
  const discovery = buildDiscovery(input);
  const sample = projectDiscovery(discovery, fixture("sample-keep.json"), "fixture-sample-layout-v1");

  assert.deepEqual(sample.filmOrder, ["film-387975858e4951c2", "film-5c42db0e6023655b"]);
  assert.deepEqual(sample.facets.postings.country, { "country:Q38": [0], "country:Q142": [0], "country:unknown": [1] });
  assert.deepEqual(sample.facets.postings.movement, { "movement:Q900": [0], "movement:Q901": [1] });
  assert.equal(sample.corpusVersion, discovery.corpusVersion);
  assert.equal(sample.layoutAlgorithmVersion, "fixture-sample-layout-v1");
  assert.equal(sample.layoutVersion, contentVersion("layout", {
    algorithm: sample.layoutAlgorithmVersion,
    corpusVersion: sample.corpusVersion,
    filmOrder: sample.filmOrder,
  }));
  assert.notEqual(sample.layoutVersion, discovery.layoutVersion);
  assert.throws(() => projectDiscovery(discovery, fixture("sample-keep.json"), discovery.layoutAlgorithmVersion));
  assert.deepEqual(validateDiscovery(sample, { identity: input.identity, corpusKeys: ["old-key", "collision-two"] }), sample);
});

test("discovery build rejects an active requested corpus film missing from harvest", () => {
  const input = discoveryFixture();
  const directory = mkdtempSync(join(tmpdir(), "atlas-discovery-missing-active-"));
  const identityPath = join(directory, "identity.json");
  const harvestPath = join(directory, "harvest.json");
  const corpusPath = join(directory, "corpus.json");
  const taxonomyPath = join(directory, "taxonomy.json");
  const outputPath = join(directory, "discovery.json");
  const harvest = structuredClone(input.harvest);
  delete harvest.films["old-key"];
  const record = input.identity.films.find((film) => film.stableSlug === "old-key");
  const corpus = {
    meta: { corpusVersion: contentVersion("corpus", { fixture: "active-missing" }) },
    films: {
      "old-key": { qid: record.wikidataQid, filmId: record.filmId, title: record.canonicalTitle, year: record.releaseYear },
    },
    edges: [],
  };
  try {
    writeJson(identityPath, input.identity);
    writeJson(harvestPath, harvest);
    writeJson(corpusPath, corpus);
    writeJson(taxonomyPath, input.taxonomy);
    const result = runPipeline("atlas/pipeline/build-discovery.js", [
      "--identity", identityPath,
      "--harvest", harvestPath,
      "--corpus", corpusPath,
      "--taxonomy", taxonomyPath,
      "--out", outputPath,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Active corpus film old-key is missing from harvest/);
    assert.equal(existsSync(outputPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("discovery build synthesizes only an exact legacy release without mutating its source harvest", () => {
  assert.equal(typeof prepareDiscoveryHarvest, "function", "discovery build must expose its harvest preparation policy");
  const input = legacyDiscoveryFixture();
  const before = structuredClone(input.harvest);
  const prepared = prepareDiscoveryHarvest({ identity: input.identity, harvest: input.harvest, corpus: input.corpus });

  assert.deepEqual(input.harvest, before);
  assert.notEqual(prepared, input.harvest);
  assert.notEqual(prepared.films, input.harvest.films);
  assert.deepEqual(prepared.films[input.record.stableSlug], {
    qid: input.record.wikidataQid,
    title: "The Duel",
    year: 1971,
    crew: { director: [] },
    country: [],
    genre: [],
    movement: [],
  });

  const directory = mkdtempSync(join(tmpdir(), "atlas-discovery-legacy-release-"));
  const identityPath = join(directory, "identity.json");
  const harvestPath = join(directory, "harvest.json");
  const corpusPath = join(directory, "corpus.json");
  const taxonomyPath = join(directory, "taxonomy.json");
  const outputPath = join(directory, "discovery.json");
  try {
    writeJson(identityPath, input.identity);
    writeJson(harvestPath, input.harvest);
    writeJson(corpusPath, input.corpus);
    writeJson(taxonomyPath, fixture("facet-taxonomy.json"));
    const sourceBytes = readFileSync(harvestPath, "utf8");
    const result = runPipeline("atlas/pipeline/build-discovery.js", [
      "--identity", identityPath,
      "--harvest", harvestPath,
      "--corpus", corpusPath,
      "--taxonomy", taxonomyPath,
      "--out", outputPath,
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(harvestPath, "utf8")), before);
    assert.equal(readFileSync(harvestPath, "utf8"), sourceBytes);
    assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")).filmOrder, [input.record.filmId]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("committed core and candidate discovery manifests equal fresh canonical regeneration", () => {
  const directory = mkdtempSync(join(tmpdir(), "atlas-discovery-parity-"));
  const coreOutput = join(directory, "core.json");
  const candidateOutput = join(directory, "candidate.json");
  const identityPath = fileURLToPath(new URL("../atlas/pipeline/out/identity.json", import.meta.url));
  const harvestPath = fileURLToPath(new URL("../atlas/pipeline/out/harvest.json", import.meta.url));
  const taxonomyPath = fileURLToPath(new URL("../atlas/pipeline/facet-taxonomy.json", import.meta.url));
  const corpusPath = fileURLToPath(new URL("../atlas/static/corpus.json", import.meta.url));
  const committedCore = fileURLToPath(new URL("../atlas/static/discovery.json", import.meta.url));
  const committedCandidate = fileURLToPath(new URL("../atlas/pipeline/out/discovery-candidate.json", import.meta.url));
  const harvestBytes = readFileSync(harvestPath, "utf8");
  try {
    const core = runPipeline("atlas/pipeline/build-discovery.js", [
      "--identity", identityPath,
      "--harvest", harvestPath,
      "--corpus", corpusPath,
      "--taxonomy", taxonomyPath,
      "--out", coreOutput,
    ]);
    const candidate = runPipeline("atlas/pipeline/build-discovery.js", [
      "--identity", identityPath,
      "--harvest", harvestPath,
      "--taxonomy", taxonomyPath,
      "--out", candidateOutput,
    ]);

    assert.equal(core.status, 0, core.stderr);
    assert.equal(candidate.status, 0, candidate.stderr);
    assert.equal(JSON.parse(readFileSync(coreOutput, "utf8")).filmOrder.length, 803);
    assert.equal(JSON.parse(readFileSync(candidateOutput, "utf8")).filmOrder.length, 2204);
    assert.equal(readFileSync(coreOutput, "utf8"), readFileSync(committedCore, "utf8"));
    assert.equal(readFileSync(candidateOutput, "utf8"), readFileSync(committedCandidate, "utf8"));
    assert.equal(readFileSync(harvestPath, "utf8"), harvestBytes);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("discovery validation rejects rehashed stale artifacts and supplied corpus film-ID mismatches", () => {
  const directory = mkdtempSync(join(tmpdir(), "atlas-discovery-context-"));
  const committedDiscovery = JSON.parse(readFileSync(new URL("../atlas/static/discovery.json", import.meta.url), "utf8"));
  const committedCorpus = JSON.parse(readFileSync(new URL("../atlas/static/corpus.json", import.meta.url), "utf8"));
  const identityPath = fileURLToPath(new URL("../atlas/pipeline/out/identity.json", import.meta.url));
  const corpusPath = join(directory, "corpus.json");
  const discoveryPath = join(directory, "discovery.json");
  try {
    const stale = structuredClone(committedDiscovery);
    stale.corpusVersion = "corpus-0000000000000000";
    const stalePayload = structuredClone(stale);
    delete stalePayload.discoveryVersion;
    stale.discoveryVersion = contentVersion("discovery", stalePayload);
    writeJson(discoveryPath, stale);
    writeJson(corpusPath, committedCorpus);
    const staleResult = runPipeline("atlas/pipeline/validate-discovery.js", [
      discoveryPath,
      "--identity", identityPath,
      "--corpus", corpusPath,
    ]);
    assert.notEqual(staleResult.status, 0);
    assert.match(staleResult.stderr, /corpusVersion does not match corpus metadata/);

    const wrongFilmIdCorpus = structuredClone(committedCorpus);
    const [firstKey, secondKey] = Object.keys(wrongFilmIdCorpus.films);
    wrongFilmIdCorpus.films[firstKey].filmId = wrongFilmIdCorpus.films[secondKey].filmId;
    writeJson(discoveryPath, committedDiscovery);
    writeJson(corpusPath, wrongFilmIdCorpus);
    const filmIdResult = runPipeline("atlas/pipeline/validate-discovery.js", [
      discoveryPath,
      "--identity", identityPath,
      "--corpus", corpusPath,
    ]);
    assert.notEqual(filmIdResult.status, 0);
    assert.match(filmIdResult.stderr, /film ID does not match identity/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("movement provenance records direct film membership once", () => {
  const { addDirectMovement, movementValues } = require("../atlas/pipeline/movement-provenance.js");
  const film = {};

  addDirectMovement(film, "Q900");
  addDirectMovement(film, "Q900");

  assert.deepEqual(film.movementDirect, ["Q900"]);
  assert.deepEqual(film.movementInherited, []);
  assert.deepEqual(film.movement, ["Q900"]);
  assert.deepEqual(movementValues(film), ["Q900"]);
});

test("movement provenance records inherited director membership once", () => {
  const { addInheritedMovement, movementValues } = require("../atlas/pipeline/movement-provenance.js");
  const film = {};

  addInheritedMovement(film, "Q900", "Q700");
  addInheritedMovement(film, "Q900", "Q700");

  assert.deepEqual(film.movementDirect, []);
  assert.deepEqual(film.movementInherited, [{ value: "Q900", viaDirector: "Q700" }]);
  assert.deepEqual(film.movement, ["Q900"]);
  assert.deepEqual(movementValues(film), ["Q900"]);
});

test("movement provenance preserves both paths for the same membership", () => {
  const { addDirectMovement, addInheritedMovement, movementValues } = require("../atlas/pipeline/movement-provenance.js");
  const film = {};

  addDirectMovement(film, "Q900");
  addInheritedMovement(film, "Q900", "Q700");

  assert.deepEqual(film.movementDirect, ["Q900"]);
  assert.deepEqual(film.movementInherited, [{ value: "Q900", viaDirector: "Q700" }]);
  assert.deepEqual(movementValues(film), ["Q900"]);
});

test("movement values use the legacy flat list only without authoritative provenance", () => {
  const { movementValues } = require("../atlas/pipeline/movement-provenance.js");

  assert.deepEqual(movementValues({ movement: ["Q902", "Q900", "Q902"] }), ["Q900", "Q902"]);
  assert.deepEqual(movementValues({ movementDirect: [], movementInherited: [], movement: ["Q999"] }), []);
});

test("movement values stay consistent for association input and scale measurement", () => {
  const { movementValues } = require("../atlas/pipeline/movement-provenance.js");
  const { measure } = require("../atlas/pipeline/measure-scale.js");
  const authoritativeEmpty = {
    first: { movementDirect: [], movementInherited: [], movement: ["Q900"] },
    second: { movementDirect: [], movementInherited: [], movement: ["Q900"] },
    third: { movementDirect: [], movementInherited: [], movement: [] },
  };
  const legacy = {
    first: { movement: ["Q900"] },
    second: { movement: ["Q900"] },
    third: { movement: [] },
  };

  assert.deepEqual(movementValues(authoritativeEmpty.first), []);
  assert.deepEqual(movementValues(legacy.first), ["Q900"]);
  assert.equal(measure(authoritativeEmpty, Object.keys(authoritativeEmpty), 3).fired.movement, 0);
  assert.equal(measure(legacy, Object.keys(legacy), 3).fired.movement, 1);
});

function correctedHarvest() {
  const harvest = fixture("harvest.json");
  harvest.films["corrected-key"] = {
    qid: "Q100",
    title: "Corrected title",
    year: 1984,
  };
  delete harvest.films["old-key"];
  return harvest;
}

test("identity keeps the film ID while a QID receives corrected title, year, and slug", () => {
  const first = buildIdentityManifest({
    harvest: fixture("harvest.json"),
    releasedCorpus: fixture("corpus.json"),
    overrides,
    source,
  });
  const corrected = buildIdentityManifest({
    harvest: correctedHarvest(),
    releasedCorpus: fixture("corpus.json"),
    overrides,
    previousIdentity: first,
    source,
  });

  assert.equal(first.byQid.Q100, corrected.byQid.Q100);
  assert.equal(corrected.keyByFilmId[first.byQid.Q100], "corrected-key");
  assert.ok(corrected.films.find((film) => film.wikidataQid === "Q100").slugAliases.includes("old-key"));
  assert.ok(corrected.films.find((film) => film.wikidataQid === "Q100").alternateTitles.includes("Old title"));
  const q200 = first.films.find((film) => film.wikidataQid === "Q200");
  const q300 = first.films.find((film) => film.wikidataQid === "Q300");
  assert.equal(q200.canonicalTitle, q300.canonicalTitle);
  assert.notEqual(q200.filmId, q300.filmId);
  assert.equal(first.films.find((film) => film.wikidataQid === "Q100").admissionCohort, "core-803");
  assert.equal(first.films.find((film) => film.wikidataQid === "Q300").admissionCohort, "candidate-2204");
  assert.match(first.identityVersion, /^identity-[0-9a-f]{16}$/);
  assert.equal(first.byQid.Q100, filmIdForQid("Q100"));
});

test("identity rejects invalid source identities and slug retargeting", () => {
  const first = buildIdentityManifest({
    harvest: fixture("harvest.json"),
    releasedCorpus: fixture("corpus.json"),
    overrides,
    source,
  });

  const duplicateQid = fixture("harvest.json");
  duplicateQid.films.duplicate = { qid: "Q100", title: "Duplicate", year: 2000 };
  assert.throws(
    () => buildIdentityManifest({ harvest: duplicateQid, releasedCorpus: fixture("corpus.json"), overrides, source }),
    { name: "DuplicateQidError" },
  );

  const missingQid = fixture("harvest.json");
  delete missingQid.films["old-key"].qid;
  assert.throws(
    () => buildIdentityManifest({ harvest: missingQid, releasedCorpus: fixture("corpus.json"), overrides, source }),
    { name: "MissingQidError" },
  );

  assert.throws(
    () => buildIdentityManifest({
      harvest: fixture("harvest.json"),
      releasedCorpus: fixture("corpus.json"),
      source,
      overrides: {
        schemaVersion: 1,
        films: {
          Q100: { filmId: filmIdForQid("Q999") },
          Q200: { filmId: filmIdForQid("Q999") },
        },
      },
    }),
    { name: "DuplicateFilmIdError" },
  );

  const retargeted = fixture("harvest.json");
  retargeted.films["old-key"] = { qid: "Q200", title: "Retargeted", year: 2000 };
  delete retargeted.films["collision-one"];
  assert.throws(
    () => buildIdentityManifest({
      harvest: retargeted,
      releasedCorpus: { films: {}, edges: [] },
      overrides,
      previousIdentity: first,
      source,
    }),
    { name: "SlugRetargetError" },
  );
});

test("identity rejects malformed IDs and correction overrides that replace a released identity", () => {
  const releasedCorpus = { films: { earth: { qid: "Q12280475", title: "Earth", year: 1930 } }, edges: [] };
  const harvest = { films: { earth: { qid: "Q55188", title: "Earth", year: 1930 } } };
  const correction = {
    stableSlug: "earth",
    fromQid: "Q12280475",
    toQid: "Q55188",
    reason: "Correct the released misidentification.",
  };

  assert.throws(
    () => buildIdentityManifest({
      harvest: fixture("harvest.json"),
      releasedCorpus: fixture("corpus.json"),
      source,
      overrides: { schemaVersion: 1, films: { Q100: { filmId: "film-not-a-hash" } } },
    }),
    { name: "InvalidFilmIdError" },
  );

  const first = buildIdentityManifest({ harvest: fixture("harvest.json"), releasedCorpus: fixture("corpus.json"), overrides, source });
  const malformedPrior = structuredClone(first);
  malformedPrior.films[0].filmId = "film-not-a-hash";
  assert.throws(
    () => buildIdentityManifest({ harvest: fixture("harvest.json"), releasedCorpus: fixture("corpus.json"), overrides, previousIdentity: malformedPrior, source }),
    { name: "InvalidFilmIdError" },
  );

  assert.throws(
    () => buildIdentityManifest({
      harvest,
      releasedCorpus,
      source,
      overrides: {
        schemaVersion: 1,
        films: { Q55188: { filmId: filmIdForQid("Q55188") } },
        qidCorrections: [correction],
        legacyRetained: [],
      },
    }),
    { name: "QidCorrectionIdentityError" },
  );
});

test("identity rejects canonical and alias ownership collisions independent of input order", () => {
  const first = buildIdentityManifest({ harvest: fixture("harvest.json"), releasedCorpus: fixture("corpus.json"), overrides, source });
  const reversedHarvest = { films: Object.fromEntries(Object.entries(fixture("harvest.json").films).reverse()) };

  for (const harvest of [fixture("harvest.json"), reversedHarvest]) {
    assert.throws(
      () => buildIdentityManifest({
        harvest,
        releasedCorpus: fixture("corpus.json"),
        source,
        overrides: { schemaVersion: 1, films: { Q100: { slugAliases: ["collision-one"] } } },
      }),
      { name: "SlugOwnershipError" },
    );
  }

  const qidCollision = structuredClone(first);
  qidCollision.films.find((film) => film.wikidataQid === "Q100").qidAliases = ["Q200"];
  assert.throws(
    () => buildIdentityManifest({
      harvest: fixture("harvest.json"),
      releasedCorpus: { films: {}, edges: [] },
      overrides,
      previousIdentity: qidCollision,
      source,
    }),
    { name: "QidOwnershipError" },
  );
});

test("identity applies an exact reviewed QID correction without retargeting Earth", () => {
  const releasedCorpus = {
    films: {
      earth: { qid: "Q12280475", title: "Earth", year: 1930 },
    },
    edges: [],
  };
  const harvest = {
    films: {
      earth: { qid: "Q55188", title: "Earth", year: 1930 },
    },
  };
  const identity = buildIdentityManifest({
    harvest,
    releasedCorpus,
    source,
    overrides: {
      schemaVersion: 1,
      films: {},
      qidCorrections: [{
        stableSlug: "earth",
        fromQid: "Q12280475",
        toQid: "Q55188",
        reason: "Correct the released misidentification.",
      }],
      legacyRetained: [],
    },
  });
  const earth = identity.films[0];

  assert.equal(earth.wikidataQid, "Q55188");
  assert.equal(earth.filmId, filmIdForQid("Q12280475"));
  assert.deepEqual(earth.qidAliases, ["Q12280475"]);
  assert.equal(identity.qidAliasToFilmId.Q12280475, earth.filmId);
  assert.equal(identity.byQid.Q55188, earth.filmId);
});

test("identity retains reviewed legacy releases outside the candidate key projection", () => {
  const legacy = { stableSlug: "the duel", qid: "Q17498893", status: "legacy-release-only", reason: "Keep the authored endpoint." };
  const releasedCorpus = fixture("corpus.json");
  releasedCorpus.films[legacy.stableSlug] = { qid: legacy.qid, title: "The Duel", year: 1971 };
  const identity = buildIdentityManifest({
    harvest: fixture("harvest.json"),
    releasedCorpus,
    source,
    overrides: { schemaVersion: 1, films: {}, qidCorrections: [], legacyRetained: [legacy] },
  });
  const retained = identity.films.find((film) => film.wikidataQid === legacy.qid);

  assert.equal(retained.status, "legacy-release-only");
  assert.equal(identity.byQid[legacy.qid], retained.filmId);
  assert.equal(identity.keyByFilmId[retained.filmId], undefined);
});

test("identity and content versions are canonical under object-key reorderings", () => {
  const originalInput = { b: { z: 3, a: ["first", "second"] }, a: 1 };
  const shuffledInput = { a: 1, b: { a: ["first", "second"], z: 3 } };
  assert.equal(canonicalJson(shuffledInput), canonicalJson(originalInput));
  assert.equal(contentVersion("corpus", shuffledInput), contentVersion("corpus", originalInput));
  assert.match(contentVersion("corpus", originalInput), /^corpus-[0-9a-f]{16}$/);
});

test("corpus attachment adds stable film and endpoint IDs without deleting legacy fields", () => {
  const corpus = fixture("corpus.json");
  const identity = buildIdentityManifest({
    harvest: fixture("harvest.json"),
    releasedCorpus: corpus,
    overrides,
    source,
  });
  const attached = attachIdentityToCorpus({ corpus, identity });

  assert.equal(attached.films["old-key"].filmId, identity.byQid.Q100);
  assert.equal(attached.edges[0].aId, identity.byQid.Q100);
  assert.equal(attached.edges[0].bId, identity.byQid.Q200);
  assert.equal(attached.edges[0].claim, corpus.edges[0].claim);
  assert.equal(attached.meta.schemaVersion, 2);
  assert.equal(attached.meta.identityVersion, identity.identityVersion);
  assert.match(attached.meta.corpusVersion, /^corpus-[0-9a-f]{16}$/);
});

test("identity resolves every authored legacy endpoint without retargeting it", () => {
  const harvest = JSON.parse(readFileSync(new URL("../atlas/pipeline/out/harvest.json", import.meta.url), "utf8"));
  const releasedCorpus = JSON.parse(readFileSync(new URL("../atlas/static/corpus.json", import.meta.url), "utf8"));
  const readings = JSON.parse(readFileSync(new URL("../atlas/static/readings.json", import.meta.url), "utf8"));
  const productionOverrides = JSON.parse(readFileSync(new URL("../atlas/pipeline/identity-overrides.json", import.meta.url), "utf8"));
  const identity = buildIdentityManifest({
    harvest,
    releasedCorpus,
    overrides: productionOverrides,
    source: "pipeline/seeds-expansion.txt",
  });
  const byStableSlug = new Map(identity.films.map((film) => [film.stableSlug, film]));

  assert.equal(identity.films.length, 2205);
  assert.equal(identity.films.filter((film) => film.status === "active").length, 2204);
  assert.equal(identity.films.filter((film) => film.status === "legacy-release-only").length, 1);
  assert.equal(identity.films.find((film) => film.stableSlug === "earth").wikidataQid, "Q55188");
  assert.equal(identity.qidAliasToFilmId.Q12280475, identity.byQid.Q55188);

  for (const edge of readings.edges) {
    const a = byStableSlug.get(edge.a);
    const b = byStableSlug.get(edge.b);
    assert.ok(a, `authored endpoint ${edge.a} is missing from the identity manifest`);
    assert.ok(b, `authored endpoint ${edge.b} is missing from the identity manifest`);
    for (const [slug, record] of [[edge.a, a], [edge.b, b]]) {
      const released = releasedCorpus.films[slug];
      assert.ok(released, `authored endpoint ${slug} is absent from the released corpus`);
      const resolvedId = identity.byQid[released.qid] || identity.qidAliasToFilmId[released.qid];
      assert.equal(resolvedId, released.filmId, `released QID ${released.qid} was retargeted for ${slug}`);
      assert.equal(record.filmId, released.filmId, `manifest film ID changed for ${slug}`);
    }
  }
});

test("identity ledger validation rejects forged manifests and matches the committed regeneration", () => {
  const harvest = JSON.parse(readFileSync(new URL("../atlas/pipeline/out/harvest.json", import.meta.url), "utf8"));
  const releasedCorpus = JSON.parse(readFileSync(new URL("../atlas/static/corpus.json", import.meta.url), "utf8"));
  const productionOverrides = JSON.parse(readFileSync(new URL("../atlas/pipeline/identity-overrides.json", import.meta.url), "utf8"));
  const committed = JSON.parse(readFileSync(new URL("../atlas/pipeline/out/identity.json", import.meta.url), "utf8"));
  const regenerated = buildIdentityManifest({ harvest, releasedCorpus, overrides: productionOverrides, source: "pipeline/seeds-expansion.txt" });

  assert.equal(canonicalJson(regenerated), canonicalJson(committed));
  assert.deepEqual(validateIdentityManifest(committed), committed);

  const forgedVersion = structuredClone(committed);
  forgedVersion.identityVersion = "identity-0000000000000000";
  assert.throws(() => validateIdentityManifest(forgedVersion), { name: "IdentityVersionError" });

  const duplicate = structuredClone(committed);
  duplicate.films.push(structuredClone(duplicate.films[0]));
  assert.throws(() => validateIdentityManifest(duplicate), { name: "DuplicateFilmIdError" });

  const malformed = structuredClone(committed);
  malformed.films[0].filmId = "film-not-a-hash";
  assert.throws(() => validateIdentityManifest(malformed), { name: "InvalidFilmIdError" });

  const invalidStatus = structuredClone(committed);
  invalidStatus.films[0].status = "activ";
  invalidStatus.identityVersion = contentVersion("identity", { schemaVersion: 1, films: invalidStatus.films });
  assert.throws(() => validateIdentityManifest(invalidStatus), { name: "IdentityStatusError" });
});

test("identity ledger writes atomically beside its destination", () => {
  const directory = mkdtempSync(join(tmpdir(), "atlas-identity-test-"));
  const destination = join(directory, "identity.json");
  try {
    writeJsonAtomically(destination, { schemaVersion: 1, films: [] });
    assert.equal(existsSync(destination), true);
    assert.deepEqual(JSON.parse(readFileSync(destination, "utf8")), { schemaVersion: 1, films: [] });
    assert.deepEqual(readdirSync(directory), ["identity.json"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("merge rejects a forged committed identity ledger before consuming it", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  assert.equal(typeof parseMergeOptions, "function", "merge must expose injectable identity and output paths");
  const directory = mkdtempSync(join(tmpdir(), "atlas-merge-test-"));
  const identityPath = join(directory, "identity.json");
  const outputPath = join(directory, "corpus.json");
  const originalIdentity = fileURLToPath(new URL("../atlas/pipeline/out/identity.json", import.meta.url));
  const originalCorpus = fileURLToPath(new URL("../atlas/static/corpus.json", import.meta.url));
  const originalIdentityContents = readFileSync(originalIdentity, "utf8");
  const originalCorpusContents = readFileSync(originalCorpus, "utf8");
  copyFileSync(originalIdentity, identityPath);
  const forged = JSON.parse(readFileSync(identityPath, "utf8"));
  forged.identityVersion = "identity-0000000000000000";
  try {
    writeFileSync(identityPath, `${JSON.stringify(forged)}\n`);
    const result = spawnSync(process.execPath, ["atlas/pipeline/merge-corpus.js", "--identity", identityPath, "--out", outputPath], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /IdentityVersionError/);
    assert.equal(existsSync(outputPath), false);
    assert.equal(readFileSync(originalIdentity, "utf8"), originalIdentityContents);
    assert.equal(readFileSync(originalCorpus, "utf8"), originalCorpusContents);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
