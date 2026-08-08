import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  createRadialSnapshot,
  panelScrollTarget,
  restoreRadialSnapshot,
  selectRadialFilm,
} = require("../atlas/app/radial-inspection.js");

const rebecca = { key: "rebecca", e: { claim: "A precise connection." } };
const oldboy = { key: "oldboy", e: { claim: "A second precise connection." } };

test("a ring film becomes an inspection intent without mutating the web", () => {
  const ring = [rebecca, oldboy];
  const before = structuredClone(ring);
  const result = selectRadialFilm({
    centreKey: "the handmaiden",
    ring,
    selectedKey: "rebecca",
  });

  assert.equal(result.kind, "inspect");
  assert.equal(result.selectedKey, "rebecca");
  assert.equal(result.centreKey, "the handmaiden");
  assert.equal(result.connection, rebecca);
  assert.deepEqual(ring, before);
});

test("the center remains a center-detail intent", () => {
  assert.deepEqual(
    selectRadialFilm({
      centreKey: "the handmaiden",
      ring: [rebecca],
      selectedKey: "the handmaiden",
    }),
    {
      kind: "centre",
      selectedKey: "the handmaiden",
      centreKey: "the handmaiden",
      connection: null,
    },
  );
});

test("a film outside the current web cannot become an inspection", () => {
  assert.deepEqual(
    selectRadialFilm({
      centreKey: "the handmaiden",
      ring: [rebecca],
      selectedKey: "stalker",
    }),
    {
      kind: "missing",
      selectedKey: null,
      centreKey: "the handmaiden",
      connection: null,
    },
  );
});

test("multi-hop Back restores the captured centre, ordered ring, trail, and hash", () => {
  assert.equal(typeof createRadialSnapshot, "function", "snapshot creation should be available");
  assert.equal(typeof restoreRadialSnapshot, "function", "snapshot restoration should be available");

  const edges = [
    { a: "a", b: "b", claim: "A to B" },
    { a: "b", b: "x", claim: "B first" },
    { a: "b", b: "a", claim: "B second" },
    { a: "b", b: "c", claim: "B to C" },
    { a: "c", b: "y", claim: "C first" },
  ];
  const films = new Set(["a", "b", "c", "x", "y"]);
  const options = {
    edgeAt: (index) => edges[index],
    edgeIndex: (edge) => edges.indexOf(edge),
    filmExists: (key) => films.has(key),
  };
  const a = { centreKey: "a", ring: [{ key: "b", e: edges[0] }], trail: ["a"] };
  const b = {
    centreKey: "b",
    ring: [{ key: "x", e: edges[1] }, { key: "a", e: edges[2] }, { key: "c", e: edges[3] }],
    trail: ["a", "b"],
  };
  const c = { centreKey: "c", ring: [{ key: "y", e: edges[4] }], trail: ["a", "b", "c"] };
  const entries = [
    { hash: "#/film/a", state: { atlasRadial: createRadialSnapshot(a, options) } },
  ];

  // A -> B -> C; each destination owns its exact snapshot. Browser Back then
  // returns the B entry rather than asking the recommender to build B again.
  entries.push({ hash: "#/film/b", state: { atlasRadial: createRadialSnapshot(b, options) } });
  const capturedB = {
    centreKey: b.centreKey,
    orderedRing: b.ring.map(({ key, e }) => ({ key, claim: e.claim })),
    trail: [...b.trail],
    hash: entries[1].hash,
  };
  entries.push({ hash: "#/film/c", state: { atlasRadial: createRadialSnapshot(c, options) } });

  const backEntry = entries[1];
  const restored = restoreRadialSnapshot(backEntry.state.atlasRadial, options);
  assert.deepEqual(
    {
      centreKey: restored.centreKey,
      orderedRing: restored.ring.map(({ key, e }) => ({ key, claim: e.claim })),
      trail: restored.trail,
      hash: backEntry.hash,
    },
    capturedB,
  );
});

test("history restoration rejects snapshots whose edge no longer joins the captured web", () => {
  assert.equal(typeof createRadialSnapshot, "function", "snapshot creation should be available");
  assert.equal(typeof restoreRadialSnapshot, "function", "snapshot restoration should be available");
  const films = new Set(["a", "b", "elsewhere"]);
  const wrongEdge = { a: "b", b: "elsewhere", claim: "Wrong web" };
  const options = {
    edgeAt: () => wrongEdge,
    edgeIndex: () => 0,
    filmExists: (key) => films.has(key),
  };
  const invalid = {
    version: 1,
    centreKey: "a",
    ring: [{ key: "b", edgeIndex: 0 }],
    trail: ["a"],
  };

  assert.equal(
    createRadialSnapshot({
      centreKey: "a",
      ring: [{ key: "b", e: wrongEdge }],
      trail: ["a"],
    }, options),
    null,
  );
  assert.equal(
    restoreRadialSnapshot(invalid, options),
    null,
  );
});

test("drawer scroll resets for a different film and survives same-film preference rerenders", () => {
  assert.equal(typeof panelScrollTarget, "function", "panel scroll policy should be available");
  assert.equal(panelScrollTarget("rebecca", "oldboy", 284), 0);
  assert.equal(panelScrollTarget("oldboy", "oldboy", 284), 284);
});
