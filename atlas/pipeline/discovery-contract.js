"use strict";

const fs = require("fs");
const path = require("path");
const nodeCrypto = require("crypto");
const { movementValues } = require("./movement-provenance");
const FILM_ID = /^film-[0-9a-f]{16}$/;
const CORPUS_VERSION = /^corpus-[0-9a-f]{16}$/;
const LAYOUT_VERSION = /^layout-[0-9a-f]{16}$/;
const LAYOUT_ALGORITHM_VERSION = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const ERA_BUCKETS = [
  { id: "era:silent-early", label: "Silent & early", maxExclusive: 1930 },
  { id: "era:1930-1959", label: "1930–59", minInclusive: 1930, maxExclusive: 1960 },
  { id: "era:1960-1979", label: "1960–79", minInclusive: 1960, maxExclusive: 1980 },
  { id: "era:1980-1999", label: "1980–99", minInclusive: 1980, maxExclusive: 2000 },
  { id: "era:2000-present", label: "2000–now", minInclusive: 2000 },
];
const ERA_VALUES = [...ERA_BUCKETS.map((era) => era.id), "era:unknown"];
const GENRE_FAMILIES = ["action", "adventure", "animation", "comedy", "crime", "documentary", "drama", "experimental", "fantasy", "historical", "horror", "musical", "mystery", "romance", "science-fiction", "thriller", "war", "western", "uncategorized"]
  .map((name) => `genre:${name}`);

class MissingQidError extends Error {
  constructor(key) {
    super(`Film ${key} has no Wikidata QID`);
    this.name = "MissingQidError";
  }
}

class DuplicateQidError extends Error {
  constructor(qid) {
    super(`Wikidata QID ${qid} is assigned to more than one film`);
    this.name = "DuplicateQidError";
  }
}

class DuplicateFilmIdError extends Error {
  constructor(filmId) {
    super(`Permanent film ID ${filmId} is assigned to more than one QID`);
    this.name = "DuplicateFilmIdError";
  }
}

class InvalidFilmIdError extends Error {
  constructor(filmId) {
    super(`Permanent film ID ${filmId} must match film-<16 lowercase hex characters>`);
    this.name = "InvalidFilmIdError";
  }
}

class SlugRetargetError extends Error {
  constructor(slug, previousQid, incomingQid) {
    super(`Stable slug ${slug} belonged to ${previousQid} and cannot be retargeted to ${incomingQid}`);
    this.name = "SlugRetargetError";
  }
}

class SlugOwnershipError extends Error {
  constructor(slug) {
    super(`Stable slug or alias ${slug} has more than one identity owner`);
    this.name = "SlugOwnershipError";
  }
}

class QidOwnershipError extends Error {
  constructor(qid) {
    super(`Wikidata QID or alias ${qid} has more than one identity owner`);
    this.name = "QidOwnershipError";
  }
}

class QidCorrectionIdentityError extends Error {
  constructor(slug) {
    super(`Reviewed QID correction for ${slug} must preserve the released film ID`);
    this.name = "QidCorrectionIdentityError";
  }
}

class IdentityVersionError extends Error {
  constructor() {
    super("Identity manifest version does not match its canonical film records");
    this.name = "IdentityVersionError";
  }
}

class IdentityStatusError extends Error {
  constructor(status) {
    super(`Identity record status ${JSON.stringify(status)} must be active or legacy-release-only`);
    this.name = "IdentityStatusError";
  }
}

class CorpusIdentityError extends Error {
  constructor(message) {
    super(message);
    this.name = "CorpusIdentityError";
  }
}

const digest = (value) => nodeCrypto.createHash("sha256").update(value).digest("hex");

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function contentVersion(prefix, value) {
  return `${prefix}-${digest(canonicalJson(value)).slice(0, 16)}`;
}

function candidateCorpusVersion(identity) {
  validateIdentityManifest(identity);
  return contentVersion("corpus", { identityVersion: identity.identityVersion, scope: "candidate" });
}

function layoutVersionFor(layoutAlgorithmVersion, corpusVersion, filmOrder) {
  return contentVersion("layout", { algorithm: layoutAlgorithmVersion, corpusVersion, filmOrder });
}

function assertDiscoveryVersions(corpusVersion, layoutAlgorithmVersion) {
  if (typeof corpusVersion !== "string" || !CORPUS_VERSION.test(corpusVersion)) {
    throw new CorpusIdentityError("Discovery corpusVersion must match corpus-<16 lowercase hex characters>");
  }
  if (typeof layoutAlgorithmVersion !== "string" || !LAYOUT_ALGORITHM_VERSION.test(layoutAlgorithmVersion)) {
    throw new CorpusIdentityError("Discovery layoutAlgorithmVersion must be a stable lowercase identifier");
  }
}

function filmIdForQid(qid) {
  if (typeof qid !== "string" || !/^Q\d+$/.test(qid)) throw new MissingQidError(String(qid));
  return `film-${digest(`wikidata:${qid}`).slice(0, 16)}`;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function assertFilmId(filmId) {
  if (typeof filmId !== "string" || !FILM_ID.test(filmId)) throw new InvalidFilmIdError(filmId);
}

function assertQid(qid, key) {
  if (typeof qid !== "string" || !/^Q\d+$/.test(qid)) throw new MissingQidError(key || String(qid));
}

function indexIdentityRecords(records) {
  const filmIds = new Map();
  const canonicalQids = new Map();
  const canonicalSlugs = new Map();
  const qidAliases = new Map();
  const slugAliases = new Map();
  for (const record of records) {
    assertFilmId(record.filmId);
    assertQid(record.wikidataQid, record.stableSlug);
    if (record.status !== "active" && record.status !== "legacy-release-only") {
      throw new IdentityStatusError(record.status);
    }
    if (typeof record.stableSlug !== "string" || !record.stableSlug) {
      throw new CorpusIdentityError("Every identity record requires a stableSlug");
    }
    if (filmIds.has(record.filmId)) throw new DuplicateFilmIdError(record.filmId);
    if (canonicalQids.has(record.wikidataQid)) throw new QidOwnershipError(record.wikidataQid);
    if (canonicalSlugs.has(record.stableSlug)) throw new SlugOwnershipError(record.stableSlug);
    filmIds.set(record.filmId, record);
    canonicalQids.set(record.wikidataQid, record.filmId);
    canonicalSlugs.set(record.stableSlug, record.filmId);
  }
  for (const record of records) {
    for (const qid of record.qidAliases || []) {
      assertQid(qid, record.stableSlug);
      if (canonicalQids.has(qid) || qidAliases.has(qid)) throw new QidOwnershipError(qid);
      qidAliases.set(qid, record.filmId);
    }
    for (const slug of record.slugAliases || []) {
      if (typeof slug !== "string" || !slug || canonicalSlugs.has(slug) || slugAliases.has(slug)) {
        throw new SlugOwnershipError(slug);
      }
      slugAliases.set(slug, record.filmId);
    }
  }
  return { canonicalQids, canonicalSlugs, qidAliases, slugAliases };
}

function parseMergeOptions(argv, root) {
  function pathFor(flag, fallback) {
    const index = argv.indexOf(`--${flag}`);
    if (index === -1) return fallback;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CorpusIdentityError(`--${flag} requires a path`);
    }
    return value;
  }

  return {
    identity: pathFor("identity", path.join(root, "pipeline", "out", "identity.json")),
    out: pathFor("out", path.join(root, "static", "corpus.json")),
  };
}

function normalizeFacetTaxonomy(rawTaxonomy) {
  if (!rawTaxonomy || rawTaxonomy.schemaVersion !== 1 || !rawTaxonomy.families || !rawTaxonomy.rawGenreToFamily) {
    throw new CorpusIdentityError("Facet taxonomy must use schemaVersion 1 with families and rawGenreToFamily");
  }
  const families = {};
  for (const id of GENRE_FAMILIES) {
    const family = rawTaxonomy.families[id];
    if (!family || typeof family.label !== "string") throw new CorpusIdentityError(`Facet taxonomy is missing ${id}`);
    families[id] = { ...family, label: family.label };
  }
  if (Object.keys(rawTaxonomy.families).some((id) => !GENRE_FAMILIES.includes(id))) {
    throw new CorpusIdentityError("Facet taxonomy contains an unreviewed genre family");
  }
  const rawGenreToFamily = {};
  for (const [qid, family] of Object.entries(rawTaxonomy.rawGenreToFamily)) {
    if (!/^Q\d+$/.test(qid) || !GENRE_FAMILIES.includes(family)) {
      throw new CorpusIdentityError(`Facet taxonomy has an invalid raw genre mapping for ${qid}`);
    }
    rawGenreToFamily[qid] = family;
  }
  if (!families["genre:drama"].broad || families["genre:drama"].programmePriority !== 0) {
    throw new CorpusIdentityError("genre:drama must remain broad with programmePriority 0");
  }
  return { schemaVersion: 1, families, rawGenreToFamily };
}

function eraForYear(year) {
  if (!Number.isInteger(year)) return "era:unknown";
  return ERA_BUCKETS.find((era) => (era.minInclusive === undefined || year >= era.minInclusive) &&
    (era.maxExclusive === undefined || year < era.maxExclusive))?.id || "era:unknown";
}

function discoveryVersionPayload(discovery) {
  const { discoveryVersion, ...payload } = discovery;
  return payload;
}

function discoveryFacetDefinition(label, values) {
  return { label, known: 0, reviewedUnknown: 0, total: 0, selectable: false, values };
}

function discoveryWarningsFor(discovery, legacyFilmCount) {
  const warnings = new Set();
  for (const facet of ["country", "director", "movement"]) {
    for (const [value, indexes] of Object.entries(discovery.facets.postings[facet])) {
      if (!indexes.length || !new RegExp(`^${facet}:Q\\d+$`).test(value)) continue;
      const qid = value.slice(facet.length + 1);
      if (discovery.facets.definitions[facet].values[value]?.label === qid) warnings.add(`missing label for ${value}`);
    }
  }
  if (legacyFilmCount) warnings.add(`movement provenance is legacy-only for ${legacyFilmCount} film(s)`);
  return [...warnings].sort();
}

function discoveryHarvestByQid(harvest) {
  if (!harvest?.films || typeof harvest.films !== "object" || Array.isArray(harvest.films)) {
    throw new CorpusIdentityError("Discovery harvest must contain film records");
  }
  const byQid = new Map();
  for (const [key, film] of Object.entries(harvest.films)) {
    if (!/^Q\d+$/.test(film?.qid || "")) throw new MissingQidError(key);
    if (byQid.has(film.qid)) throw new DuplicateQidError(film.qid);
    byQid.set(film.qid, { key, film });
  }
  return byQid;
}

function selectDiscoveryIdentity(identity, corpusKeys) {
  validateIdentityManifest(identity);
  const ownerByKey = new Map();
  for (const record of identity.films) for (const key of [record.stableSlug, ...(record.slugAliases || [])]) {
    const owner = ownerByKey.get(key);
    if (owner && owner.filmId !== record.filmId) throw new SlugOwnershipError(key);
    ownerByKey.set(key, record);
  }
  if (corpusKeys === undefined || corpusKeys === null) {
    return identity.films.filter((record) => record.status === "active")
      .map((record) => ({ key: record.stableSlug, record }))
      .sort((a, b) => a.record.filmId.localeCompare(b.record.filmId));
  }
  if (!Array.isArray(corpusKeys)) throw new CorpusIdentityError("Discovery corpus keys must be an array");
  const selectedKeyByFilmId = new Map();
  const selections = [];
  for (const key of corpusKeys) {
    const record = ownerByKey.get(key);
    if (!record) throw new CorpusIdentityError(`Discovery corpus key ${key} does not resolve to an identity record`);
    const previousKey = selectedKeyByFilmId.get(record.filmId);
    if (previousKey) {
      throw new CorpusIdentityError(`Discovery corpus keys ${previousKey} and ${key} select the same film more than once`);
    }
    selectedKeyByFilmId.set(record.filmId, key);
    selections.push({ key, record });
  }
  return selections.sort((a, b) => a.record.filmId.localeCompare(b.record.filmId));
}

function prepareDiscoveryHarvest({ identity, harvest, corpus }) {
  if (!harvest?.films || !corpus?.films) {
    throw new CorpusIdentityError("Discovery harvest preparation requires harvest and corpus films");
  }
  const selections = selectDiscoveryIdentity(identity, Object.keys(corpus.films));
  const selectionByKey = new Map(selections.map((selection) => [selection.key, selection.record]));
  const prepared = { ...harvest, films: { ...harvest.films } };
  const harvestedQids = new Set(discoveryHarvestByQid(harvest).keys());
  for (const [key, film] of Object.entries(corpus.films)) {
    const record = selectionByKey.get(key);
    if (record && harvestedQids.has(record.wikidataQid)) continue;
    const exactLegacy = record?.status === "legacy-release-only" &&
      record.wikidataQid === film.qid && (!film.filmId || film.filmId === record.filmId);
    if (!exactLegacy) throw new CorpusIdentityError(`Active corpus film ${key} is missing from harvest`);
    prepared.films[key] = {
      qid: record.wikidataQid,
      title: film.title || record.canonicalTitle,
      year: film.year ?? record.releaseYear,
      crew: { director: [] },
      country: [],
      genre: [],
      movement: [],
    };
  }
  return prepared;
}

function buildDiscovery({ identity, harvest, corpusKeys, taxonomy, corpusVersion, layoutAlgorithmVersion = "atlas-layout-v1" }) {
  if (!harvest?.films || !harvest?.labels || !corpusVersion || !layoutAlgorithmVersion) {
    throw new CorpusIdentityError("Discovery requires identity, harvest films and labels, corpusVersion, and layoutAlgorithmVersion");
  }
  assertDiscoveryVersions(corpusVersion, layoutAlgorithmVersion);
  const selections = selectDiscoveryIdentity(identity, corpusKeys);
  const reviewedTaxonomy = normalizeFacetTaxonomy(taxonomy);
  const harvestByQid = discoveryHarvestByQid(harvest);
  const records = selections.map(({ key, record }) => ({ key, record, harvested: harvestByQid.get(record.wikidataQid) }));
  for (const entry of records) if (!entry.harvested) throw new CorpusIdentityError(`Identity ${entry.record.filmId} has no harvested record`);
  records.sort((a, b) => a.record.filmId.localeCompare(b.record.filmId));

  const definitions = {
    era: discoveryFacetDefinition("Era", Object.fromEntries([...ERA_BUCKETS.map((era) => [era.id, { label: era.label }]), ["era:unknown", { label: "Unknown" }]])),
    country: discoveryFacetDefinition("Cinema", { "country:unknown": { label: "Unknown" } }),
    genre: discoveryFacetDefinition("Genre", structuredClone(reviewedTaxonomy.families)),
    movement: { label: "Movement", total: 0, direct: 0, inherited: 0, legacy: 0, selectable: false, values: {} },
    director: discoveryFacetDefinition("Director", { "director:unknown": { label: "Unknown" } }),
  };
  const postings = { era: {}, country: {}, genre: {}, movement: {}, director: {} };
  const warnings = new Set();
  const movementProvenance = {};
  const post = (facet, value, index) => {
    if (!definitions[facet].values[value]) throw new CorpusIdentityError(`Discovery ${facet} posting has no definition: ${value}`);
    const list = postings[facet][value] || (postings[facet][value] = []);
    if (!list.includes(index)) list.push(index);
  };
  const stableValue = (facet, qid) => {
    if (typeof qid !== "string" || !/^Q\d+$/.test(qid)) {
      throw new CorpusIdentityError(`Discovery ${facet} has invalid QID ${JSON.stringify(qid)}`);
    }
    const value = `${facet}:${qid}`;
    if (!definitions[facet].values[value]) {
      const label = harvest.labels[qid] || qid;
      definitions[facet].values[value] = { label };
      if (label === qid) warnings.add(`missing label for ${value}`);
    }
    return value;
  };

  for (const [index, { record, harvested }] of records.entries()) {
    const film = harvested.film;
    const era = eraForYear(film.year);
    post("era", era, index);
    definitions.era.total++;
    definitions.era[era === "era:unknown" ? "reviewedUnknown" : "known"]++;

    const countries = [...new Set(film.country || [])].sort();
    if (!countries.length) post("country", "country:unknown", index);
    else for (const country of countries) post("country", stableValue("country", country), index);
    definitions.country.total++;
    definitions.country[countries.length ? "known" : "reviewedUnknown"]++;

    const genres = [...new Set(film.genre || [])].sort();
    const families = genres.map((qid) => reviewedTaxonomy.rawGenreToFamily[qid]);
    if (families.some((family) => !family)) throw new CorpusIdentityError(`Unmapped raw genre for ${record.filmId}`);
    const reviewedGenres = [...new Set(families.length ? families : ["genre:uncategorized"])].sort();
    for (const family of reviewedGenres) post("genre", family, index);
    definitions.genre.total++;
    definitions.genre[reviewedGenres.every((family) => family === "genre:uncategorized") ? "reviewedUnknown" : "known"]++;

    const directors = [...new Set(film.crew?.director || [])].sort();
    if (!directors.length) post("director", "director:unknown", index);
    else for (const director of directors) post("director", stableValue("director", director), index);
    definitions.director.total++;
    definitions.director[directors.length ? "known" : "reviewedUnknown"]++;

    const hasAuthoritativeMovement = Array.isArray(film.movementDirect) || Array.isArray(film.movementInherited);
    const routes = {};
    for (const movement of film.movementDirect || []) {
      const value = stableValue("movement", movement);
      (routes[value] = routes[value] || []).push("direct");
    }
    for (const membership of film.movementInherited || []) {
      const value = stableValue("movement", membership.value);
      if (typeof membership.viaDirector !== "string" || !/^Q\d+$/.test(membership.viaDirector)) {
        throw new CorpusIdentityError(`Discovery movement has invalid director route QID ${JSON.stringify(membership.viaDirector)}`);
      }
      (routes[value] = routes[value] || []).push(`director:${membership.viaDirector}`);
    }
    if (!hasAuthoritativeMovement) for (const movement of movementValues(film)) {
      const value = stableValue("movement", movement);
      (routes[value] = routes[value] || []).push("legacy");
    }
    for (const [value, provenance] of Object.entries(routes)) {
      routes[value] = [...new Set(provenance)].sort();
      post("movement", value, index);
    }
    if (Object.keys(routes).length) {
      movementProvenance[record.filmId] = routes;
      definitions.movement.total++;
      const sources = Object.values(routes).flat();
      if (sources.includes("direct")) definitions.movement.direct++;
      if (sources.some((source) => source.startsWith("director:"))) definitions.movement.inherited++;
      if (sources.includes("legacy")) definitions.movement.legacy++;
    }
  }
  if (definitions.movement.legacy) warnings.add(`movement provenance is legacy-only for ${definitions.movement.legacy} film(s)`);
  for (const facet of Object.values(postings)) for (const list of Object.values(facet)) list.sort((a, b) => a - b);
  for (const [facet, values] of Object.entries(definitions)) for (const [value, definition] of Object.entries(values.values)) {
    definition.count = (postings[facet][value] || []).length;
  }
  const filmOrder = records.map(({ record }) => record.filmId);
  const keyByFilmId = Object.fromEntries(records.map(({ key, record }) => [record.filmId, key]));
  const discovery = {
    schemaVersion: 1,
    identityVersion: identity.identityVersion,
    corpusVersion,
    layoutAlgorithmVersion,
    layoutVersion: layoutVersionFor(layoutAlgorithmVersion, corpusVersion, filmOrder),
    filmOrder,
    keyByFilmId,
    facets: { definitions, postings },
    movementProvenance,
    coverageWarnings: [...warnings].sort(),
  };
  discovery.discoveryVersion = contentVersion("discovery", discoveryVersionPayload(discovery));
  return validateDiscovery(discovery, { identity, corpusKeys, corpusVersion, layoutAlgorithmVersion });
}

function validateDiscovery(discovery, {
  identity,
  corpusKeys,
  corpusVersion,
  corpusVersionContext = "corpus metadata",
  corpusFilmIds,
  layoutAlgorithmVersion,
} = {}) {
  if (!discovery || discovery.schemaVersion !== 1 || !Array.isArray(discovery.filmOrder) || !discovery.facets?.definitions || !discovery.facets?.postings) {
    throw new CorpusIdentityError("Discovery manifest must use schemaVersion 1 with filmOrder and facets");
  }
  assertDiscoveryVersions(discovery.corpusVersion, discovery.layoutAlgorithmVersion);
  if (layoutAlgorithmVersion) {
    if (!LAYOUT_ALGORITHM_VERSION.test(layoutAlgorithmVersion) || discovery.layoutAlgorithmVersion !== layoutAlgorithmVersion) {
      throw new CorpusIdentityError("Discovery layoutAlgorithmVersion does not match the supplied layout basis");
    }
  }
  if (identity) {
    const selections = selectDiscoveryIdentity(identity, corpusKeys);
    if (discovery.identityVersion !== identity.identityVersion) throw new CorpusIdentityError("Discovery identityVersion does not match identity ledger");
    const expected = selections.map(({ record }) => record.filmId);
    if (canonicalJson(discovery.filmOrder) !== canonicalJson(expected)) throw new CorpusIdentityError("Discovery filmOrder does not match its identity selection");
    const expectedKeys = Object.fromEntries(selections.map(({ key, record }) => [record.filmId, key]));
    if (canonicalJson(discovery.keyByFilmId || {}) !== canonicalJson(expectedKeys)) throw new CorpusIdentityError("Discovery keyByFilmId does not match identity");
    if (corpusFilmIds) {
      for (const { key, record } of selectDiscoveryIdentity(identity, Object.keys(corpusFilmIds))) {
        if (record.filmId !== corpusFilmIds[key]) {
          throw new CorpusIdentityError(`Corpus film ${key} film ID does not match identity`);
        }
      }
    }
  }
  if (corpusVersion && discovery.corpusVersion !== corpusVersion) {
    throw new CorpusIdentityError(`Discovery corpusVersion does not match ${corpusVersionContext}`);
  }
  if (new Set(discovery.filmOrder).size !== discovery.filmOrder.length || discovery.filmOrder.some((id) => !FILM_ID.test(id))) {
    throw new CorpusIdentityError("Discovery filmOrder must contain unique permanent film IDs");
  }
  const facetNames = ["country", "director", "era", "genre", "movement"];
  if (canonicalJson(Object.keys(discovery.facets.definitions).sort()) !== canonicalJson(facetNames) || canonicalJson(Object.keys(discovery.facets.postings).sort()) !== canonicalJson(facetNames)) throw new CorpusIdentityError("Discovery facets must contain exactly five facets");
  for (const [facet, expectedValues] of [["era", ERA_VALUES], ["genre", GENRE_FAMILIES]]) {
    const definitionValues = Object.keys(discovery.facets.definitions[facet].values || {}).sort();
    const postingValues = Object.keys(discovery.facets.postings[facet] || {});
    if (canonicalJson(definitionValues) !== canonicalJson(expectedValues.slice().sort()) ||
        postingValues.some((value) => !expectedValues.includes(value))) {
      throw new CorpusIdentityError(`Discovery ${facet} values are invalid`);
    }
  }
  if (canonicalJson(Object.keys(discovery.keyByFilmId || {}).sort()) !== canonicalJson(discovery.filmOrder.slice().sort()) || discovery.filmOrder.some((id) => !discovery.keyByFilmId[id])) throw new CorpusIdentityError("Discovery keyByFilmId is invalid");
  for (const definition of Object.values(discovery.facets.definitions)) if (definition.selectable !== false) {
    throw new CorpusIdentityError("Discovery facets are not selectable at this checkpoint");
  }
  for (const [facet, values] of Object.entries(discovery.facets.postings)) {
    const definitions = discovery.facets.definitions[facet]?.values || {};
    if (["country", "director", "movement"].includes(facet)) {
      const dynamicValue = new RegExp(`^${facet}:Q\\d+$`);
      const unknownValue = facet === "movement" ? null : `${facet}:unknown`;
      if ([...new Set([...Object.keys(values), ...Object.keys(definitions)])]
        .some((value) => value !== unknownValue && !dynamicValue.test(value))) {
        throw new CorpusIdentityError(`Discovery ${facet} dynamic value is invalid`);
      }
    }
    for (const [value, indexes] of Object.entries(values)) {
      if (!definitions[value] || !Array.isArray(indexes) || indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= discovery.filmOrder.length) ||
          new Set(indexes).size !== indexes.length || definitions[value].count !== indexes.length || canonicalJson(indexes) !== canonicalJson(indexes.slice().sort((a, b) => a - b))) {
        throw new CorpusIdentityError(`Discovery posting ${facet}:${value} is invalid`);
      }
    }
    for (const [value, definition] of Object.entries(definitions)) if ((values[value] || []).length !== definition.count) throw new CorpusIdentityError(`Discovery definition ${facet}:${value} is invalid`);
  }
  const membershipsFor = (facet, index) => Object.entries(discovery.facets.postings[facet])
    .filter(([, indexes]) => indexes.includes(index)).map(([value]) => value).sort();
  for (const [facet, unknown] of [["era", "era:unknown"], ["country", "country:unknown"], ["director", "director:unknown"]]) {
    const definition = discovery.facets.definitions[facet];
    let known = 0;
    let reviewedUnknown = 0;
    for (let index = 0; index < discovery.filmOrder.length; index++) {
      const memberships = membershipsFor(facet, index);
      if ((facet === "era" && memberships.length !== 1) ||
          (facet !== "era" && (!memberships.length || (memberships.includes(unknown) && memberships.length !== 1)))) {
        throw new CorpusIdentityError(`Discovery film ${index} has invalid ${facet} membership`);
      }
      if (memberships[0] === unknown) reviewedUnknown++;
      else known++;
    }
    if (definition.total !== discovery.filmOrder.length || definition.reviewedUnknown !== reviewedUnknown || definition.known !== known) {
      throw new CorpusIdentityError(`Discovery ${facet} coverage is invalid`);
    }
  }
  const genreDefinition = discovery.facets.definitions.genre;
  let genreKnown = 0, genreUnknown = 0;
  for (let index = 0; index < discovery.filmOrder.length; index++) {
    const memberships = membershipsFor("genre", index);
    if (memberships.some((value) => value !== "genre:uncategorized")) genreKnown++;
    else if (memberships.length === 1) genreUnknown++;
    else throw new CorpusIdentityError(`Discovery film ${index} has invalid genre membership`);
  }
  if (genreDefinition.total !== discovery.filmOrder.length || genreDefinition.known !== genreKnown || genreDefinition.reviewedUnknown !== genreUnknown || genreKnown + genreUnknown !== genreDefinition.total) throw new CorpusIdentityError("Discovery genre coverage is invalid");
  const movementProvenance = discovery.movementProvenance;
  if (!movementProvenance || typeof movementProvenance !== "object" || Array.isArray(movementProvenance) ||
      Object.keys(movementProvenance).some((filmId) => !discovery.filmOrder.includes(filmId))) {
    throw new CorpusIdentityError("Discovery movement provenance is invalid");
  }
  const movementCoverage = { total: 0, direct: 0, inherited: 0, legacy: 0 };
  for (let index = 0; index < discovery.filmOrder.length; index++) {
    const filmId = discovery.filmOrder[index];
    const expectedValues = membershipsFor("movement", index);
    const hasProvenance = Object.prototype.hasOwnProperty.call(movementProvenance, filmId);
    if (hasProvenance !== Boolean(expectedValues.length)) throw new CorpusIdentityError(`Discovery movement provenance for ${filmId} is invalid`);
    if (!hasProvenance) continue;
    const routesByValue = movementProvenance[filmId];
    if (!routesByValue || typeof routesByValue !== "object" || Array.isArray(routesByValue) ||
        canonicalJson(Object.keys(routesByValue).sort()) !== canonicalJson(expectedValues)) {
      throw new CorpusIdentityError(`Discovery movement provenance for ${filmId} is invalid`);
    }
    const filmRoutes = [];
    for (const value of expectedValues) {
      const routes = routesByValue[value];
      if (!Array.isArray(routes) || !routes.length || routes.some((route) => !/^(?:direct|legacy|director:Q\d+)$/.test(route)) ||
          new Set(routes).size !== routes.length || canonicalJson(routes) !== canonicalJson(routes.slice().sort())) {
        throw new CorpusIdentityError(`Discovery movement routes for ${filmId}:${value} are invalid`);
      }
      filmRoutes.push(...routes);
    }
    const hasLegacy = filmRoutes.includes("legacy");
    const hasDirect = filmRoutes.includes("direct");
    const hasInherited = filmRoutes.some((route) => route.startsWith("director:"));
    if (hasLegacy && (hasDirect || hasInherited)) throw new CorpusIdentityError(`Discovery movement routes for ${filmId} mix legacy and authoritative provenance`);
    movementCoverage.total++;
    if (hasDirect) movementCoverage.direct++;
    if (hasInherited) movementCoverage.inherited++;
    if (hasLegacy) movementCoverage.legacy++;
  }
  const movementDefinition = discovery.facets.definitions.movement;
  for (const counter of ["total", "direct", "inherited", "legacy"]) {
    if (movementDefinition[counter] !== movementCoverage[counter]) throw new CorpusIdentityError(`Discovery movement ${counter} coverage is invalid`);
  }
  const expectedWarnings = discoveryWarningsFor(discovery, movementCoverage.legacy);
  if (!Array.isArray(discovery.coverageWarnings) || canonicalJson(discovery.coverageWarnings) !== canonicalJson(expectedWarnings)) {
    throw new CorpusIdentityError("Discovery coverage warnings are invalid");
  }
  if (typeof discovery.layoutVersion !== "string" || !LAYOUT_VERSION.test(discovery.layoutVersion) ||
      discovery.layoutVersion !== layoutVersionFor(discovery.layoutAlgorithmVersion, discovery.corpusVersion, discovery.filmOrder)) {
    throw new CorpusIdentityError("Discovery layoutVersion is invalid");
  }
  if (discovery.discoveryVersion !== contentVersion("discovery", discoveryVersionPayload(discovery))) throw new CorpusIdentityError("Discovery discoveryVersion is invalid");
  return discovery;
}

function projectDiscovery(discovery, retainedFilmIds, sampleLayoutVersion) {
  validateDiscovery(discovery);
  if (typeof sampleLayoutVersion !== "string" || !LAYOUT_ALGORITHM_VERSION.test(sampleLayoutVersion) || sampleLayoutVersion === discovery.layoutAlgorithmVersion) {
    throw new CorpusIdentityError("Sample discovery requires a distinct stable layout algorithm version");
  }
  const retained = new Set(retainedFilmIds);
  const sourceIndexes = discovery.filmOrder.map((id, index) => retained.has(id) ? index : -1).filter((index) => index >= 0);
  if (sourceIndexes.length !== retained.size) throw new CorpusIdentityError("Sample discovery retains an unknown film ID");
  const remap = new Map(sourceIndexes.map((source, index) => [source, index]));
  const filmOrder = sourceIndexes.map((index) => discovery.filmOrder[index]);
  const keyByFilmId = Object.fromEntries(filmOrder.map((id) => [id, discovery.keyByFilmId[id]]));
  const postings = {};
  for (const [facet, values] of Object.entries(discovery.facets.postings)) {
    postings[facet] = {};
    for (const [value, indexes] of Object.entries(values)) {
      const projected = indexes.filter((index) => remap.has(index)).map((index) => remap.get(index));
      if (projected.length) postings[facet][value] = projected;
    }
  }
  const movementProvenance = Object.fromEntries(filmOrder.filter((id) => discovery.movementProvenance[id]).map((id) => [id, structuredClone(discovery.movementProvenance[id])]));
  const projected = {
    ...structuredClone(discovery), filmOrder, keyByFilmId,
    layoutAlgorithmVersion: sampleLayoutVersion,
    layoutVersion: layoutVersionFor(sampleLayoutVersion, discovery.corpusVersion, filmOrder),
    facets: { definitions: structuredClone(discovery.facets.definitions), postings }, movementProvenance,
  };
  for (const [facet, definition] of Object.entries(projected.facets.definitions)) for (const [value, details] of Object.entries(definition.values)) {
    details.count = (projected.facets.postings[facet][value] || []).length;
  }
  for (const [facet, unknown] of [["era", "era:unknown"], ["country", "country:unknown"], ["director", "director:unknown"]]) {
    const definition = projected.facets.definitions[facet];
    definition.total = filmOrder.length;
    definition.reviewedUnknown = (projected.facets.postings[facet][unknown] || []).length;
    definition.known = filmOrder.length - definition.reviewedUnknown;
  }
  const projectedGenre = projected.facets.definitions.genre;
  projectedGenre.total = filmOrder.length;
  projectedGenre.known = 0;
  projectedGenre.reviewedUnknown = 0;
  for (let index = 0; index < filmOrder.length; index++) {
    const memberships = Object.entries(projected.facets.postings.genre).filter(([, indexes]) => indexes.includes(index)).map(([value]) => value);
    if (memberships.some((value) => value !== "genre:uncategorized")) projectedGenre.known++;
    else projectedGenre.reviewedUnknown++;
  }
  const routeSets = Object.values(movementProvenance).map((routes) => Object.values(routes).flat());
  projected.facets.definitions.movement.total = routeSets.length;
  projected.facets.definitions.movement.direct = routeSets.filter((routes) => routes.includes("direct")).length;
  projected.facets.definitions.movement.inherited = routeSets.filter((routes) => routes.some((route) => route.startsWith("director:"))).length;
  projected.facets.definitions.movement.legacy = routeSets.filter((routes) => routes.includes("legacy")).length;
  projected.coverageWarnings = discoveryWarningsFor(projected, projected.facets.definitions.movement.legacy);
  projected.discoveryVersion = contentVersion("discovery", discoveryVersionPayload(projected));
  return validateDiscovery(projected, { layoutAlgorithmVersion: sampleLayoutVersion });
}

function priorRecordByQid(previousIdentity) {
  const records = new Map();
  for (const record of previousIdentity?.films || []) {
    assertFilmId(record.filmId);
    for (const qid of [record.wikidataQid, ...(record.qidAliases || [])]) {
      const prior = records.get(qid);
      if (prior && prior.filmId !== record.filmId) throw new QidOwnershipError(qid);
      records.set(qid, record);
    }
  }
  return records;
}

function priorSlugOwners(previousIdentity) {
  const owners = new Map();
  for (const record of previousIdentity?.films || []) {
    for (const slug of [record.stableSlug, ...(record.slugAliases || [])]) {
      if (!slug) continue;
      const owner = owners.get(slug);
      if (owner && owner !== record.wikidataQid) throw new SlugOwnershipError(slug);
      owners.set(slug, record.wikidataQid);
    }
  }
  return owners;
}

function releasedQids(releasedCorpus, correctionsBySlug) {
  return new Set(Object.entries(releasedCorpus?.films || {}).map(([slug, film]) =>
    correctionsBySlug.get(slug)?.toQid || film.qid).filter(Boolean));
}

function explicitOverride(overrides, qid) {
  const value = overrides?.films?.[qid] || {};
  const allowed = new Set(["filmId", "alternateTitles", "slugAliases"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new CorpusIdentityError(`Identity override for ${qid} contains unsupported field ${key}`);
  }
  if (value.filmId !== undefined) assertFilmId(value.filmId);
  return value;
}

function correctionBySlug(overrides) {
  const corrections = new Map();
  for (const correction of overrides.qidCorrections || []) {
    if (!correction?.stableSlug || !/^Q\d+$/.test(correction.fromQid || "") ||
        !/^Q\d+$/.test(correction.toQid || "") || !correction.reason) {
      throw new CorpusIdentityError("Every qidCorrections entry requires stableSlug, fromQid, toQid, and reason");
    }
    if (correction.fromQid === correction.toQid || corrections.has(correction.stableSlug)) {
      throw new CorpusIdentityError(`Invalid QID correction for ${correction.stableSlug}`);
    }
    corrections.set(correction.stableSlug, correction);
  }
  return corrections;
}

function retainedBySlug(overrides) {
  const retained = new Map();
  for (const legacy of overrides.legacyRetained || []) {
    if (!legacy?.stableSlug || !/^Q\d+$/.test(legacy.qid || "") ||
        legacy.status !== "legacy-release-only" || !legacy.reason || retained.has(legacy.stableSlug)) {
      throw new CorpusIdentityError("Every legacyRetained entry requires stableSlug, QID, legacy-release-only status, and reason");
    }
    retained.set(legacy.stableSlug, legacy);
  }
  return retained;
}

function buildIdentityManifest({ harvest, releasedCorpus, overrides = { schemaVersion: 1, films: {} }, previousIdentity, source }) {
  if (!harvest || !harvest.films || typeof harvest.films !== "object") {
    throw new CorpusIdentityError("Harvest must contain a films object");
  }
  if (!source) throw new CorpusIdentityError("Identity manifest requires a candidate source");
  if (overrides.schemaVersion !== 1 || !overrides.films || typeof overrides.films !== "object") {
    throw new CorpusIdentityError("Identity overrides must use schemaVersion 1 with a films object");
  }

  const correctionsBySlug = correctionBySlug(overrides);
  const legacyBySlug = retainedBySlug(overrides);
  const validatedPrevious = previousIdentity ? validateIdentityManifest(previousIdentity) : undefined;
  const priorByQid = priorRecordByQid(validatedPrevious);
  const slugOwners = priorSlugOwners(validatedPrevious);
  const coreQids = releasedQids(releasedCorpus, correctionsBySlug);
  const incoming = [];
  const incomingByQid = new Map();
  for (const [stableSlug, film] of Object.entries(harvest.films)) {
    const qid = film?.qid;
    if (typeof qid !== "string" || !/^Q\d+$/.test(qid)) throw new MissingQidError(stableSlug);
    if (incomingByQid.has(qid)) throw new DuplicateQidError(qid);
    const entry = { stableSlug, film, legacySlugs: [], qidAliases: [], status: "active", preservedFilmIdQid: null };
    incoming.push(entry);
    incomingByQid.set(qid, entry);
  }
  /* A release manifest is the durable prior edition. It can only depart from a
     new harvest through an explicitly reviewed QID correction or a deliberately
     retained legacy record; every other mismatch is a route-retargeting error. */
  for (const [stableSlug, film] of Object.entries(releasedCorpus?.films || {})) {
    const qid = film?.qid;
    if (typeof qid !== "string" || !/^Q\d+$/.test(qid)) throw new MissingQidError(stableSlug);
    const sameSlug = harvest.films[stableSlug];
    const correction = correctionsBySlug.get(stableSlug);
    const isCorrection = correction && correction.fromQid === qid && sameSlug && sameSlug.qid === correction.toQid;
    if (sameSlug && sameSlug.qid !== qid && !isCorrection) throw new SlugRetargetError(stableSlug, qid, sameSlug.qid);
    if (correction && !isCorrection) {
      throw new CorpusIdentityError(`QID correction for ${stableSlug} does not exactly match released and harvested records`);
    }
    if (isCorrection) {
      const corrected = incomingByQid.get(correction.toQid);
      corrected.qidAliases.push(correction.fromQid);
      corrected.preservedFilmIdQid = correction.fromQid;
      continue;
    }
    const existing = incomingByQid.get(qid);
    if (existing) {
      if (existing.stableSlug !== stableSlug) existing.legacySlugs.push(stableSlug);
      continue;
    }
    const legacy = legacyBySlug.get(stableSlug);
    if (!legacy || legacy.qid !== qid) {
      throw new CorpusIdentityError(`Released film ${stableSlug} (${qid}) is absent from harvest without a matching legacyRetained record`);
    }
    const entry = { stableSlug, film, legacySlugs: [], qidAliases: [], status: legacy.status, preservedFilmIdQid: null };
    incoming.push(entry);
    incomingByQid.set(qid, entry);
  }
  const qids = new Set();
  const filmIds = new Set();
  const records = [];

  for (const { stableSlug, film, legacySlugs, qidAliases, status, preservedFilmIdQid } of incoming) {
    const qid = film?.qid;
    if (typeof qid !== "string" || !/^Q\d+$/.test(qid)) throw new MissingQidError(stableSlug);
    if (qids.has(qid)) throw new DuplicateQidError(qid);
    qids.add(qid);

    const oldOwner = slugOwners.get(stableSlug);
    const correction = correctionsBySlug.get(stableSlug);
    const isPriorCorrection = correction && correction.fromQid === oldOwner && correction.toQid === qid;
    if (oldOwner && oldOwner !== qid && !isPriorCorrection) throw new SlugRetargetError(stableSlug, oldOwner, qid);

    const prior = priorByQid.get(qid);
    const override = explicitOverride(overrides, qid);
    const correctionFilmId = preservedFilmIdQid ? filmIdForQid(preservedFilmIdQid) : null;
    if (correctionFilmId && ((prior && prior.filmId !== correctionFilmId) ||
        (override.filmId && override.filmId !== correctionFilmId))) {
      throw new QidCorrectionIdentityError(stableSlug);
    }
    const filmId = correctionFilmId || prior?.filmId || override.filmId || filmIdForQid(qid);
    assertFilmId(filmId);
    if (filmIds.has(filmId)) throw new DuplicateFilmIdError(filmId);
    filmIds.add(filmId);

    const isCore = coreQids.has(qid);
    records.push({
      filmId,
      wikidataQid: qid,
      qidAliases: uniqueSorted([...(prior?.qidAliases || []), ...qidAliases]),
      canonicalTitle: film.title || qid,
      alternateTitles: uniqueSorted([
        ...(prior?.alternateTitles || []),
        ...(override.alternateTitles || []),
        prior && prior.canonicalTitle !== film.title ? prior.canonicalTitle : null,
      ]),
      releaseYear: film.year || null,
      stableSlug,
      slugAliases: uniqueSorted([
        ...(prior?.slugAliases || []),
        ...(override.slugAliases || []),
        ...legacySlugs,
        prior && prior.stableSlug !== stableSlug ? prior.stableSlug : null,
      ]).filter((slug) => slug !== stableSlug),
      admissionCohort: isCore ? "core-803" : "candidate-2204",
      admissionReason: isCore ? "validated 803-film core" : "prepared 2,204-film expansion candidate",
      candidateSource: isCore ? "pipeline/seeds.txt" : source,
      reviewStatus: isCore ? "legacy-admitted" : "candidate",
      status,
      sourceProvenance: {
        provider: "Wikidata",
        sourceId: qid,
        harvestArtifact: "pipeline/out/harvest.json",
      },
    });
  }

  records.sort((a, b) => a.filmId.localeCompare(b.filmId));
  const indexes = indexIdentityRecords(records);
  const byQid = Object.fromEntries(indexes.canonicalQids);
  const qidAliasToFilmId = Object.fromEntries(indexes.qidAliases);
  const keyByFilmId = Object.fromEntries(records.filter((record) => record.status === "active")
    .map((record) => [record.filmId, record.stableSlug]));
  const identityVersion = contentVersion("identity", { schemaVersion: 1, films: records });
  return validateIdentityManifest({ schemaVersion: 1, identityVersion, films: records, byQid, qidAliasToFilmId, keyByFilmId });
}

function validateIdentityManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.films)) {
    throw new CorpusIdentityError("Identity manifest must use schemaVersion 1 with a films array");
  }
  const indexes = indexIdentityRecords(manifest.films);
  const byQid = Object.fromEntries(indexes.canonicalQids);
  const qidAliasToFilmId = Object.fromEntries(indexes.qidAliases);
  const keyByFilmId = Object.fromEntries(manifest.films.filter((record) => record.status === "active")
    .map((record) => [record.filmId, record.stableSlug]));
  if (canonicalJson(manifest.byQid || {}) !== canonicalJson(byQid) ||
      canonicalJson(manifest.qidAliasToFilmId || {}) !== canonicalJson(qidAliasToFilmId) ||
      canonicalJson(manifest.keyByFilmId || {}) !== canonicalJson(keyByFilmId)) {
    throw new CorpusIdentityError("Identity manifest indexes do not match its film records");
  }
  const expectedVersion = contentVersion("identity", { schemaVersion: 1, films: manifest.films });
  if (manifest.identityVersion !== expectedVersion) throw new IdentityVersionError();
  return manifest;
}

function writeJsonAtomically(destination, value) {
  const directory = path.dirname(destination);
  const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${Date.now()}.tmp`);
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function semanticCorpusProjection(corpus) {
  return {
    films: corpus.films,
    edges: corpus.edges,
  };
}

function attachIdentityToCorpus({ corpus, identity }) {
  if (!corpus?.films || !Array.isArray(corpus.edges)) {
    throw new CorpusIdentityError("Corpus must contain films and edges before identity attachment");
  }
  const attached = structuredClone(corpus);
  const filmIdByKey = new Map();
  for (const [key, film] of Object.entries(attached.films)) {
    const filmId = identity?.byQid?.[film.qid] || identity?.qidAliasToFilmId?.[film.qid];
    if (!filmId) throw new CorpusIdentityError(`Corpus film ${key} has no identity record for ${film.qid || "missing QID"}`);
    film.filmId = filmId;
    filmIdByKey.set(key, filmId);
  }
  for (const edge of attached.edges) {
    edge.aId = filmIdByKey.get(edge.a);
    edge.bId = filmIdByKey.get(edge.b);
    if (!edge.aId || !edge.bId) throw new CorpusIdentityError(`Corpus edge ${edge.a} -> ${edge.b} has an unresolved endpoint`);
  }
  attached.meta = {
    schemaVersion: 2,
    identityVersion: identity.identityVersion,
    corpusVersion: contentVersion("corpus", semanticCorpusProjection(attached)),
  };
  return attached;
}

module.exports = {
  CorpusIdentityError,
  DuplicateFilmIdError,
  DuplicateQidError,
  IdentityStatusError,
  IdentityVersionError,
  InvalidFilmIdError,
  MissingQidError,
  QidCorrectionIdentityError,
  QidOwnershipError,
  SlugOwnershipError,
  SlugRetargetError,
  attachIdentityToCorpus,
  buildDiscovery,
  buildIdentityManifest,
  canonicalJson,
  candidateCorpusVersion,
  contentVersion,
  filmIdForQid,
  normalizeFacetTaxonomy,
  parseMergeOptions,
  prepareDiscoveryHarvest,
  projectDiscovery,
  semanticCorpusProjection,
  validateIdentityManifest,
  validateDiscovery,
  writeJsonAtomically,
};
