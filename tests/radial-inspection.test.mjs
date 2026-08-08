import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { selectRadialFilm } = require("../atlas/app/radial-inspection.js");

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
