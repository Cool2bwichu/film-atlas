"use strict";

const nodeCrypto = require("crypto");

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

class SlugRetargetError extends Error {
  constructor(slug, previousQid, incomingQid) {
    super(`Stable slug ${slug} belonged to ${previousQid} and cannot be retargeted to ${incomingQid}`);
    this.name = "SlugRetargetError";
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

function filmIdForQid(qid) {
  if (typeof qid !== "string" || !/^Q\d+$/.test(qid)) throw new MissingQidError(String(qid));
  return `film-${digest(`wikidata:${qid}`).slice(0, 16)}`;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function priorRecordByQid(previousIdentity) {
  const records = new Map();
  for (const record of previousIdentity?.films || []) {
    for (const qid of [record.wikidataQid, ...(record.qidAliases || [])]) {
      const prior = records.get(qid);
      if (prior && prior.filmId !== record.filmId) throw new DuplicateQidError(qid);
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
      if (owner && owner !== record.wikidataQid) throw new SlugRetargetError(slug, owner, record.wikidataQid);
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
  const priorByQid = priorRecordByQid(previousIdentity);
  const slugOwners = priorSlugOwners(previousIdentity);
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
    const filmId = prior?.filmId || override.filmId || filmIdForQid(preservedFilmIdQid || qid);
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
  const byQid = {};
  const qidAliasToFilmId = {};
  const keyByFilmId = {};
  for (const record of records) {
    byQid[record.wikidataQid] = record.filmId;
    for (const qid of record.qidAliases) {
      if (byQid[qid] || qidAliasToFilmId[qid]) throw new DuplicateQidError(qid);
      qidAliasToFilmId[qid] = record.filmId;
    }
    if (record.status === "active") keyByFilmId[record.filmId] = record.stableSlug;
  }
  const identityVersion = contentVersion("identity", { schemaVersion: 1, films: records });
  return { schemaVersion: 1, identityVersion, films: records, byQid, qidAliasToFilmId, keyByFilmId };
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
  MissingQidError,
  SlugRetargetError,
  attachIdentityToCorpus,
  buildIdentityManifest,
  canonicalJson,
  contentVersion,
  filmIdForQid,
  semanticCorpusProjection,
};
