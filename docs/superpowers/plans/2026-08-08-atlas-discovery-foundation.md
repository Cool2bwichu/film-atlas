# Atlas Discovery Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing 803-film release and the prepared 2,204-film candidate library permanent film identities, honest facet provenance, a reviewed normalized taxonomy, and a compact versioned discovery artifact without yet changing the constellation interface or promoting the larger corpus.

**Architecture:** Keep the current slug-keyed `corpus.json` and radial runtime compatible while adding immutable IDs and version metadata additively. A generated identity/admission manifest covers all 2,204 harvested candidates; a generated `static/discovery.json` projects the currently released corpus into indexed facet postings. Harvesters preserve direct and director-inherited movement separately, while legacy harvested movement is explicitly classified as unresolved and cannot become a selectable lens. The app build embeds the discovery contract and a versioned layout object, but no lens UI consumes them in this checkpoint.

**Tech Stack:** Node.js 22 CommonJS pipeline modules, ESM `node:test` tests, deterministic JSON generation, the existing vanilla HTML build, no new production dependencies.

## Global Constraints

- Edge distance continues to represent formal bond strength, never popularity or degree.
- The five relationship types remain exactly `descent`, `rebuttal`, `convergence`, `rhyme`, and `hand`.
- Records, attested claims, and readings remain distinguishable; this checkpoint does not invent claims or relationship bases.
- Runtime output remains deterministic and uses no runtime API, private key, or changing external response.
- Existing slug routes remain valid; permanent IDs are additive and old slugs are aliases, not retargetable identities.
- Canonical positions remain build-time output. Identical corpus input and layout algorithm version must yield the same `layoutVersion` and positions.
- Direct film movement and director-inherited movement must never be collapsed into one authoritative field.
- Facet IDs use stable IDs, never mutable display labels.
- The existing reduced `--films` build is a sample projection. It keeps source identities and facet meanings but receives its own layout version and makes no global count or coordinate parity claim.
- Movement remains non-selectable while any released film has only legacy-unresolved movement provenance.
- No framework rewrite and no new production dependency.
- The current 803-film release stays the public baseline; this checkpoint must not overwrite it with the 2,204-film graph.
- Preserve the user's uncommitted `atlas/pipeline/out/enrich.json` in the main checkout untouched.

---

### Task 1: Permanent identity and release version contract

**Files:**
- Create: `atlas/pipeline/discovery-contract.js`
- Create: `atlas/pipeline/build-identity.js`
- Create: `atlas/pipeline/identity-overrides.json`
- Create: `tests/fixtures/discovery-foundation/harvest.json`
- Create: `tests/fixtures/discovery-foundation/corpus.json`
- Create: `tests/discovery-foundation.test.mjs`
- Generate: `atlas/pipeline/out/identity.json`
- Modify: `atlas/pipeline/merge-corpus.js`
- Modify: `atlas/static/corpus.json` through the generator only

**Interfaces:**
- Produces `filmIdForQid(qid) -> "film-" + 16 lowercase hex characters`, derived from SHA-256 of `wikidata:<QID>`.
- Produces `canonicalJson(value) -> string`, recursively sorting object keys while preserving array order.
- Produces `contentVersion(prefix, value) -> <prefix>-<16 lowercase hex characters>`.
- Produces `buildIdentityManifest({ harvest, releasedCorpus, overrides, previousIdentity, source }) -> IdentityManifestV1`.
- Produces `attachIdentityToCorpus({ corpus, identity }) -> corpus`, adding `filmId`, `aId`, `bId`, and deterministic `meta` while retaining all legacy keys and fields.
- Later tasks consume `IdentityManifestV1.films`, `byQid`, `keyByFilmId`, `identityVersion`, and `corpus.meta.corpusVersion`.

The identity manifest shape is:

```js
{
  schemaVersion: 1,
  identityVersion: "identity-<hash>",
  films: [{
    filmId: "film-<hash>",
    wikidataQid: "Q12018",
    qidAliases: [],
    canonicalTitle: "8½",
    alternateTitles: [],
    releaseYear: 1963,
    stableSlug: "8",
    slugAliases: [],
    admissionCohort: "core-803" | "candidate-2204",
    admissionReason: "validated 803-film core" | "prepared 2,204-film expansion candidate",
    candidateSource: "pipeline/seeds.txt" | "pipeline/seeds-expansion.txt",
    reviewStatus: "legacy-admitted" | "candidate",
    status: "active" | "legacy-release-only",
    sourceProvenance: {
      provider: "Wikidata",
      sourceId: "Q12018",
      harvestArtifact: "pipeline/out/harvest.json"
    }
  }],
  byQid: { Q12018: "film-<hash>" },
  qidAliasToFilmId: { Q12280475: "film-<hash>" },
  keyByFilmId: { "film-<hash>": "8" }
}
```

- [ ] **Step 1: Write failing identity and determinism tests**

Add fixture films with QIDs `Q100`, `Q200`, `Q300`, two colliding display titles, and one corrected title/year/key. Tests must assert:

```js
assert.equal(first.byQid.Q100, corrected.byQid.Q100);
assert.equal(corrected.keyByFilmId[first.byQid.Q100], "corrected-key");
assert.ok(corrected.films.find((film) => film.wikidataQid === "Q100").slugAliases.includes("old-key"));
assert.ok(corrected.films.find((film) => film.wikidataQid === "Q100").alternateTitles.includes("Old title"));
assert.notEqual(first.byQid.Q100, first.byQid.Q200);
assert.equal(canonicalJson(shuffledInput), canonicalJson(originalInput));
assert.match(first.identityVersion, /^identity-[0-9a-f]{16}$/);
```

Also mutate duplicate QIDs, missing QIDs, duplicate film IDs, and a slug that a `previousIdentity` manifest assigned to a different QID; every mutation must throw a named validation error. A title, year, or key correction with the same QID remains valid and keeps the same film ID. The only cross-QID exception is an exact, reasoned `qidCorrections` record whose `fromQid`, `toQid`, and `stableSlug` all match the released and harvested records.

- [ ] **Step 2: Run the identity tests and verify RED**

Run: `node --test --test-name-pattern="identity|content version" tests/discovery-foundation.test.mjs`

Expected: FAIL because `discovery-contract.js` and the identity functions do not exist.

- [ ] **Step 3: Implement the pure identity/version functions**

`identity-overrides.json` begins with a versioned contract that records the two already-reviewed production migrations documented by commits `470d64a` and `223e114`:

```json
{
  "schemaVersion": 1,
  "films": {},
  "qidCorrections": [
    {
      "stableSlug": "earth",
      "fromQid": "Q12280475",
      "toQid": "Q55188",
      "reason": "Correct the released misidentification so the existing Soviet-montage reading resolves to Oleksandr Dovzhenko's Earth."
    }
  ],
  "legacyRetained": [
    {
      "stableSlug": "the duel",
      "qid": "Q17498893",
      "status": "legacy-release-only",
      "reason": "Retain the released Chang Cheh identity and authored endpoint without confusing it with Spielberg's Duel; exclude it from the 2,204-film candidate release."
    }
  ]
}
```

`buildIdentityManifest` sorts records by `filmId`, uses existing released-corpus membership to classify `core-803`, refuses a QID collision, reuses a prior record only by QID, and applies only explicit override fields `filmId`, `alternateTitles`, and `slugAliases`. When the same QID receives a corrected stable slug or canonical title, the prior slug is appended to `slugAliases` and the prior title to `alternateTitles`. It never derives an ID from a title, year, or slug. If a previous stable slug now names another QID, generation fails unless one exact reviewed `qidCorrections` entry matches; that entry preserves the released film ID, records the old QID in `qidAliases`, and maps the old QID through `qidAliasToFilmId`. `legacyRetained` records remain resolvable for the current release and authored endpoints but do not enter candidate-film counts or `keyByFilmId` for the candidate projection.

- [ ] **Step 4: Run the identity tests and verify GREEN**

Run: `node --test --test-name-pattern="identity|content version" tests/discovery-foundation.test.mjs`

Expected: all selected tests pass with zero warnings.

- [ ] **Step 5: Add the identity CLI and corpus migration**

`build-identity.js` accepts exact path flags:

```text
--harvest <path>   default atlas/pipeline/out/harvest.json
--corpus <path>    default atlas/static/corpus.json
--overrides <path> default atlas/pipeline/identity-overrides.json
--previous <path>  default existing --out file when present
--out <path>       default atlas/pipeline/out/identity.json
```

Modify `merge-corpus.js` to read the generated manifest, attach `filmId` to every film, attach `aId` and `bId` to every edge without changing `a` or `b`, and emit:

```js
meta: {
  schemaVersion: 2,
  identityVersion: identity.identityVersion,
  corpusVersion: contentVersion("corpus", semanticCorpusProjection)
}
```

The semantic projection includes stable film IDs plus all existing edge presentation data and excludes `note`, generation timestamps, and formatting.

- [ ] **Step 6: Verify current authored endpoints survive the migration**

Extend the test to load `static/readings.json`, resolve every `a`/`b` through `keyByFilmId`, and assert no authored endpoint is missing or retargeted. Run:

`node --test tests/discovery-foundation.test.mjs`

- [ ] **Step 7: Generate and validate the production identity manifest**

Run:

```text
node atlas/pipeline/build-identity.js
node atlas/pipeline/merge-corpus.js
node atlas/pipeline/validate-corpus.js atlas/static/corpus.json
```

Expected: 2,205 unique identity records—2,204 active candidates plus one `legacy-release-only` *The Duel* record—while all 803 released films are annotated, 7,759 edges are retained, and the existing one-component/no-orphan result is unchanged. *Earth* is one identity with current QID `Q55188` and legacy QID alias `Q12280475`, not two films.

- [ ] **Step 8: Commit Task 1**

Stage only Task 1 files and commit with: `feat: establish permanent Atlas film identity`

---

### Task 2: Preserve direct and inherited movement provenance

**Files:**
- Create: `atlas/pipeline/movement-provenance.js`
- Modify: `atlas/pipeline/harvest-sparql.js`
- Modify: `atlas/pipeline/harvest.js`
- Modify: `atlas/pipeline/associate.js`
- Modify: `tests/fixtures/discovery-foundation/harvest.json`
- Modify: `tests/discovery-foundation.test.mjs`

**Interfaces:**
- Produces `addDirectMovement(film, movementQid)`.
- Produces `addInheritedMovement(film, movementQid, directorQid)`.
- Produces `movementValues(film) -> sorted unique QID[]` for association compatibility.
- Harvested films gain authoritative `movementDirect: QID[]` and `movementInherited: { value, viaDirector }[]`.
- Legacy `movement: QID[]` remains a derived sorted union during migration; no new code may treat it as authoritative provenance.

- [ ] **Step 1: Write failing provenance tests**

Cover direct-only, inherited-only, and the same movement arriving through both paths:

```js
assert.deepEqual(film.movementDirect, ["Q900"]);
assert.deepEqual(film.movementInherited, [{ value: "Q900", viaDirector: "Q700" }]);
assert.deepEqual(movementValues(film), ["Q900"]);
```

Also assert duplicate query rows do not duplicate either collection and that inherited membership is never written into `movementDirect`.

- [ ] **Step 2: Run the movement tests and verify RED**

Run: `node --test --test-name-pattern="movement" tests/discovery-foundation.test.mjs`

Expected: FAIL because `movement-provenance.js` and the new fields do not exist.

- [ ] **Step 3: Implement the shared provenance helper and both harvest paths**

In both harvesters, direct film `P135` rows call `addDirectMovement`; director `P135` rows call `addInheritedMovement` with the director QID. After harvesting, derive the compatibility `movement` union with `movementValues`.

Modify `associate.js` so its frequency and shared-value logic calls `movementValues(film)`. A legacy film with only `movement[]` remains associable but is marked legacy by the discovery builder in Task 3.

- [ ] **Step 4: Verify GREEN and inspect both source paths**

Run:

```text
node --test --test-name-pattern="movement" tests/discovery-foundation.test.mjs
node --check atlas/pipeline/harvest-sparql.js
node --check atlas/pipeline/harvest.js
node --check atlas/pipeline/associate.js
```

- [ ] **Step 5: Commit Task 2**

Commit with: `feat: preserve movement membership provenance`

---

### Task 3: Build and validate the compact discovery manifest

**Files:**
- Create: `atlas/pipeline/facet-taxonomy.json`
- Create: `atlas/pipeline/build-discovery.js`
- Create: `atlas/pipeline/validate-discovery.js`
- Create: `tests/fixtures/discovery-foundation/facet-taxonomy.json`
- Create: `tests/fixtures/discovery-foundation/discovery.expected.json`
- Create: `tests/fixtures/discovery-foundation/sample-keep.json`
- Modify: `atlas/pipeline/discovery-contract.js`
- Modify: `tests/discovery-foundation.test.mjs`
- Generate: `atlas/static/discovery.json`
- Generate: `atlas/pipeline/out/discovery-candidate.json`

**Interfaces:**
- Produces `normalizeFacetTaxonomy(rawTaxonomy) -> reviewed taxonomy`.
- Produces `buildDiscovery({ identity, harvest, corpusKeys, taxonomy, corpusVersion, layoutAlgorithmVersion }) -> DiscoveryManifestV1`.
- Produces `validateDiscovery(discovery, { identity, corpusKeys })`.
- Produces `projectDiscovery(discovery, retainedFilmIds, sampleLayoutVersion) -> DiscoveryManifestV1`.

`DiscoveryManifestV1` is:

```js
{
  schemaVersion: 1,
  discoveryVersion: "discovery-<hash>",
  identityVersion: "identity-<hash>",
  corpusVersion: "corpus-<hash>",
  layoutVersion: "layout-<hash>",
  filmOrder: ["film-..."],
  keyByFilmId: { "film-...": "legacy-slug" },
  facets: {
    definitions: {
      era: { label: "Era", known, total, selectable: false, values: {} },
      country: { label: "Cinema", known, total, selectable: false, values: {} },
      genre: { label: "Genre", known, total, selectable: false, values: {} },
      movement: { label: "Movement", known, total, selectable: false, values: {} },
      director: { label: "Director", known, total, selectable: false, values: {} }
    },
    postings: {
      era: { "era:1960-1979": [0] },
      country: { "country:Q38": [0] },
      genre: { "genre:drama": [0] },
      movement: { "movement:Q123": [0] },
      director: { "director:Q7371": [0] }
    }
  },
  movementProvenance: {
    "film-...": {
      "movement:Q123": ["direct", "director:Q7371"]
    }
  },
  coverageWarnings: []
}
```

Era boundaries are exact and match the current wall:

```json
[
  { "id": "era:silent-early", "label": "Silent & early", "maxExclusive": 1930 },
  { "id": "era:1930-1959", "label": "1930–59", "minInclusive": 1930, "maxExclusive": 1960 },
  { "id": "era:1960-1979", "label": "1960–79", "minInclusive": 1960, "maxExclusive": 1980 },
  { "id": "era:1980-1999", "label": "1980–99", "minInclusive": 1980, "maxExclusive": 2000 },
  { "id": "era:2000-present", "label": "2000–now", "minInclusive": 2000 }
]
```

Initial reviewed genre families are exactly:

```text
genre:action, genre:adventure, genre:animation, genre:comedy,
genre:crime, genre:documentary, genre:drama, genre:experimental,
genre:fantasy, genre:historical, genre:horror, genre:musical,
genre:mystery, genre:romance, genre:science-fiction, genre:thriller,
genre:war, genre:western, genre:uncategorized
```

Every raw genre QID in the 2,204 harvest must map to exactly one reviewed family or to `genre:uncategorized`; no label-derived runtime fallback is allowed. `genre:drama` is retained but marked `broad: true` and `programmePriority: 0`, so it cannot dominate the front-door programme slate later.

- [ ] **Step 1: Write failing facet, determinism, validation, and projection tests**

Tests must cover:

- OR-ready multi-country postings without deduplication loss;
- stable director QID postings rather than director labels;
- every raw genre maps exactly once;
- definitions and postings agree;
- postings are sorted, unique integers in range;
- known plus reviewed-unknown equals total;
- direct/inherited/both movement provenance remains distinct;
- legacy-only movement adds a coverage warning and forces `movement.selectable === false`;
- shuffled film/facet input yields byte-identical canonical output;
- a non-contiguous three-film sample reindexes postings and preserves stable IDs;
- the sample retains source `corpusVersion` but receives a distinct `layoutVersion`.

- [ ] **Step 2: Run the discovery tests and verify RED**

Run: `node --test --test-name-pattern="facet|discovery|projection|taxonomy" tests/discovery-foundation.test.mjs`

Expected: FAIL because taxonomy normalization, discovery generation, validation, and projection do not exist.

- [ ] **Step 3: Implement the taxonomy and pure discovery functions**

Country, movement, and director values use `country:<QID>`, `movement:<QID>`, and `director:<QID>`. Labels come only from `harvest.labels`. Missing labels stay stable and display as the QID while adding a coverage warning; they are never silently removed.

Era, country, and genre report `known / total`; reviewed unknowns are posted to `era:unknown`, `country:unknown`, and `genre:uncategorized` and count against known coverage. Movement reports direct/inherited/legacy counts separately. All facet definitions remain `selectable: false` in this checkpoint because relationship-basis suppression has not landed.

- [ ] **Step 4: Implement CLI generation and validation**

`build-discovery.js` accepts:

```text
--identity <path>
--harvest <path>
--corpus <path or omitted for all identity films>
--taxonomy <path>
--out <path>
--layout-algorithm <stable string>
```

`validate-discovery.js <discovery> --identity <identity> [--corpus <corpus>]` exits nonzero for duplicate identity, mismatched versions, corrupt postings, missing membership, unmapped genres, or sample/full layout masquerading.

- [ ] **Step 5: Verify fixture GREEN**

Run: `node --test tests/discovery-foundation.test.mjs`

Expected: every identity, movement, taxonomy, discovery, validation, and sample-projection test passes.

- [ ] **Step 6: Generate the production and candidate manifests**

Run:

```text
node atlas/pipeline/build-discovery.js --corpus atlas/static/corpus.json --out atlas/static/discovery.json
node atlas/pipeline/build-discovery.js --out atlas/pipeline/out/discovery-candidate.json
node atlas/pipeline/validate-discovery.js atlas/static/discovery.json --identity atlas/pipeline/out/identity.json --corpus atlas/static/corpus.json
node atlas/pipeline/validate-discovery.js atlas/pipeline/out/discovery-candidate.json --identity atlas/pipeline/out/identity.json
```

Expected: production contains exactly 803 film IDs; candidate contains exactly 2,204. Era/country/genre coverage is reported exactly, movement is explicitly non-selectable until a provenance-preserving harvest replaces the legacy artifact, and no posting invariant fails.

- [ ] **Step 7: Commit Task 3**

Commit with: `feat: generate versioned Atlas discovery facets`

---

### Task 4: Preserve discovery identity and versions through the app build

**Files:**
- Modify: `atlas/app/layout-sky.js`
- Modify: `atlas/app/build.js`
- Modify: `atlas/app/template.html`
- Modify: `atlas/pipeline/pack-corpus.js`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- `layout-sky.js` exports `LAYOUT_ALGORITHM_VERSION = "sky-fr-bh-v1"` beside `layout`.
- Full build accepts `--corpus <path>` and `--discovery <path>`.
- Template receives chunked constants `CORPUS`, `DISCOVERY`, and `LAYOUT`; compatibility alias `POS = LAYOUT.positions` remains.
- `LAYOUT` is `{ version, algorithmVersion, corpusVersion, positions }` and positions are keyed by permanent film ID.
- Sample builds call `projectDiscovery`; they never implement a second projection algorithm.

- [ ] **Step 1: Write failing rendered-build tests**

Generalize the existing embedded-data helper to read any chunked constant and add:

```js
assert.equal(full.CORPUS.meta.corpusVersion, full.DISCOVERY.corpusVersion);
assert.equal(full.DISCOVERY.layoutVersion, full.LAYOUT.version);
assert.equal(full.LAYOUT.algorithmVersion, "sky-fr-bh-v1");
assert.equal(Object.keys(full.LAYOUT.positions).length, 803);
assert.equal(new Set(full.DISCOVERY.filmOrder).size, 803);
```

For every embedded film, assert `filmId` and `qid` survive. For a sample build, assert projected film IDs equal sample `filmOrder`, every posting index is in range, source `corpusVersion` is retained, and layout version differs from the full layout.

- [ ] **Step 2: Run rendered tests and verify RED**

Run:

```text
npm run build:atlas
node --test tests/rendered-html.test.mjs
```

Expected: FAIL because `DISCOVERY`, versioned `LAYOUT`, permanent IDs, and build input flags are absent.

- [ ] **Step 3: Implement build integration without changing runtime behavior**

The build must validate exact corpus/discovery identity agreement before layout. Convert the solver's legacy-key positions to permanent-film-ID positions and embed:

```js
const LAYOUT = {
  version: DISCOVERY.layoutVersion,
  algorithmVersion: LAYOUT_ALGORITHM_VERSION,
  corpusVersion: DISCOVERY.corpusVersion,
  positions
};
const POS = Object.fromEntries(
  Object.entries(DISCOVERY.keyByFilmId).map(([id, key]) => [key, LAYOUT.positions[id]])
);
```

`POS` remains legacy-keyed so the current sky is byte-behavior compatible. No lens, filter, programme, or visual control is added in this checkpoint.

- [ ] **Step 4: Preserve sample identity/facets**

Add `filmId` and QID to the packed film tuple, retain poster licence, and have `build.js` project the source discovery manifest over retained IDs. Sample positions are solved from the sample graph and receive `sample-<hash>` layout version metadata.

- [ ] **Step 5: Verify rendered GREEN and artifact parity**

Run:

```text
npm run build:atlas
node --test tests/rendered-html.test.mjs
node atlas/pipeline/validate-discovery.js atlas/static/discovery.json --identity atlas/pipeline/out/identity.json --corpus atlas/static/corpus.json
```

- [ ] **Step 6: Run full release regression checks**

Run:

```text
npm run lint
npm test
git diff --check
```

Expected: all application tests pass; the corpus remains 803 films and 7,759 edges; map and claim gates retain the baseline values; generated artifact contains no unresolved marker.

- [ ] **Step 7: Commit Task 4**

Commit with: `feat: embed versioned discovery foundation`

---

## Checkpoint boundaries and deferred work

This plan deliberately stops before relationship `bases[]`, `claimVariants[]`, the shared production resolver, LensEngine, Generated Programmes, Ask, trail/journal, or 2,204-film promotion. Those depend on the stable identities and facets created here. Because the current 2,204 harvest has already collapsed movement provenance, Movement remains non-selectable until the modified harvester is run successfully and the refreshed artifact passes the same validation.

The next implementation plan begins with permanent relationship IDs and structured basis/claim-variant migration, then extracts one shared production resolver and regenerates reproducible 803/2,204 quality baselines before rebalancing the candidate graph.
