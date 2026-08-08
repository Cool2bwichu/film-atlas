import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  attachIdentityToCorpus,
  buildIdentityManifest,
  canonicalJson,
  contentVersion,
  filmIdForQid,
} = require("../atlas/pipeline/discovery-contract.js");

const fixture = (name) => JSON.parse(readFileSync(
  new URL(`./fixtures/discovery-foundation/${name}`, import.meta.url),
  "utf8",
));

const overrides = { schemaVersion: 1, films: {} };
const source = "pipeline/seeds-expansion.txt";

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
  assert.notEqual(first.byQid.Q100, first.byQid.Q200);
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
          Q100: { filmId: "film-override" },
          Q200: { filmId: "film-override" },
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
      releasedCorpus: fixture("corpus.json"),
      overrides,
      previousIdentity: first,
      source,
    }),
    { name: "SlugRetargetError" },
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
    assert.equal(identity.byQid[a.wikidataQid], a.filmId);
    assert.equal(identity.byQid[b.wikidataQid], b.filmId);
  }
});
