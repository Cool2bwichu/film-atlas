/* layout-version.test.mjs — a layout may not change without its version changing.
 *
 * THE BUG THIS FILE IS ABOUT. On 2026-08-09 commit e49de94 took the solver's
 * `restWeak` from 48 to 120 and added `restWeakExp`. Every one of the 2,204
 * positions in the shipped atlas moved — 2,204 of 2,204 different — and
 * `LAYOUT_ALGORITHM_VERSION` stayed at the hand-written literal `sky-fr-bh-v1`,
 * so `layoutVersion` read `layout-1f25a90c58b53266` on both sides of a layout
 * that was completely different. AGENTS rule 7 says the same corpus draws the
 * same sky twice and that an address returns the picture it promised; nothing
 * was enforcing either.
 *
 * These checks are about the MECHANISM, not about today's value: every one of
 * them re-solves a real layout from a patched copy of the solver, so a version
 * that moves for a change that does not move the picture, or a picture that
 * moves under a version that does not, both fail here rather than in a
 * screenshot three weeks later.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const solverPath = fileURLToPath(new URL("../atlas/app/layout-sky.js", import.meta.url));
const strataPath = fileURLToPath(new URL("../atlas/app/layout-strata.js", import.meta.url));
const HEAD = require("../atlas/app/layout-sky.js");
const { layoutVersionFor } = require("../atlas/pipeline/discovery-contract.js");

/* Small and real: four films, four typed edges of four different strengths, so
   the weak end of the strength->length curve — the constant e49de94 moved — is
   actually exercised. A synthetic fixture rather than the 13 MB corpus keeps
   this in the fast `node --test tests/*.test.mjs` loop. */
const FILMS = {
  a: { title: "A", year: 1927 }, b: { title: "B", year: 1952 },
  c: { title: "C", year: 1968 }, d: { title: "D", year: 1999 },
  e: { title: "E", year: 2011 }, f: { title: "F", year: 1931 },
};
const EDGES = [
  { a: "a", b: "b", type: "descent", strength: 0.95 },
  { a: "b", b: "c", type: "hand", strength: 0.05 },
  { a: "c", b: "d", type: "rhyme", strength: 0.55 },
  { a: "d", b: "e", type: "convergence", strength: 0.10 },
  { a: "e", b: "f", type: "rebuttal", strength: 0.80 },
  { a: "f", b: "a", type: "hand", strength: 0.02 },
];

const positionsOf = (solver) => solver.layout(FILMS, EDGES);
const moved = (p, q) => Object.keys(p).reduce(
  (worst, k) => Math.max(worst, Math.hypot(p[k][0] - q[k][0], p[k][1] - q[k][1])), 0);

/* Load a patched copy of the solver under its own module identity. The copy
   lives beside the original so its own `require`s still resolve. */
async function withPatchedSolver(patch, run) {
  const dir = await mkdtemp(join(tmpdir(), "atlas-solver-"));
  try {
    const source = await readFile(solverPath, "utf8");
    const patched = patch(source);
    assert.notEqual(patched, source, "the patch did not change layout-sky.js — the control is broken, not the code");
    const copy = join(fileURLToPath(new URL("../atlas/app/", import.meta.url)), `layout-sky.__test-${process.pid}.js`);
    await writeFile(copy, patched);
    try {
      return await run(require(copy));
    } finally {
      delete require.cache[copy];
      await rm(copy, { force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("the solver version is computed, never a literal somebody has to remember", async () => {
  const source = await readFile(solverPath, "utf8");
  /* The exact shape that failed: `const LAYOUT_ALGORITHM_VERSION = "…";`. If
     this ever comes back, every other check in this file becomes a check on
     whether a human was paying attention. */
  assert.doesNotMatch(
    source,
    /const\s+LAYOUT_ALGORITHM_VERSION\s*=\s*["'][^"'+]*["']\s*;/,
    "LAYOUT_ALGORITHM_VERSION must be derived from the solver's constants, not written out",
  );
  assert.match(HEAD.LAYOUT_ALGORITHM_VERSION, /^sky-fr-bh-v2-[0-9a-f]{16}$/);
  /* The discovery contract's own identifier rule, since this string is hashed
     into layoutVersion and validated there. */
  assert.match(HEAD.LAYOUT_ALGORITHM_VERSION, /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);
});

test("retuning any solver constant moves the version AND the picture", async () => {
  const before = positionsOf(HEAD);
  /* One knob at a time, and each of these is a real tuning knob somebody has
     reached for: restWeak is the one e49de94 moved, iterations decides when the
     solve stops, seed decides the initial jitter. */
  const knobs = [
    ["restWeak", /restWeak: 120,/, "restWeak: 121,"],
    ["iterations", /iterations: 600,/, "iterations: 601,"],
    ["seed", /seed: 0x0a71a5,/, "seed: 0x0a71a6,"],
  ];
  for (const [name, find, replace] of knobs) {
    await withPatchedSolver((s) => s.replace(find, replace), (patched) => {
      assert.notEqual(patched.LAYOUT_ALGORITHM_VERSION, HEAD.LAYOUT_ALGORITHM_VERSION,
        `${name} changed and the solver version did not`);
      /* And the version moving is not cosmetic: the layout really is different.
         A knob that renamed the picture without redrawing it would make this
         mechanism cry wolf, which is how a version stops being believed. */
      assert.ok(moved(before, positionsOf(patched)) > 1e-9,
        `${name} changed the version but not one position — the fixture does not exercise it`);
    });
  }
});

test("adding or removing a constant moves the version too", async () => {
  await withPatchedSolver((s) => s.replace(/round: 5,/, "round: 5,\n  restStrongFloor: 0.01,"), (patched) => {
    assert.notEqual(patched.LAYOUT_ALGORITHM_VERSION, HEAD.LAYOUT_ALGORITHM_VERSION);
  });
  await withPatchedSolver((s) => s.replace(/\n\s*gravity: 0\.90,[^\n]*\n/, "\n"), (patched) => {
    assert.notEqual(patched.LAYOUT_ALGORITHM_VERSION, HEAD.LAYOUT_ALGORITHM_VERSION);
  });
});

/* THE NEGATIVE CONTROL, and it is the one that keeps the mechanism honest.
   A fingerprint that moved on any edit at all would rename the whole atlas
   every time somebody fixed a typo in a comment, and a version that changes
   for no reason is a version nobody reads. */
test("editing prose around the constants does not move the version", async () => {
  await withPatchedSolver(
    (s) => s.replace("Fruchterman-Reingold with GLOBAL", "Fruchterman-Reingold with global"),
    (patched) => {
      assert.equal(patched.LAYOUT_ALGORITHM_VERSION, HEAD.LAYOUT_ALGORITHM_VERSION);
    },
  );
});

test("the strata version carries the sky solver's, so baked blobs are renamed too", async () => {
  const strata = require("../atlas/app/layout-strata.js");
  assert.match(strata.STRATA_LAYOUT_VERSION, /^atlas-strata-v4-[0-9a-f]{16}$/);
  const source = await readFile(strataPath, "utf8");
  assert.doesNotMatch(source, /const\s+STRATA_LAYOUT_VERSION\s*=\s*["'][^"'+]*["']\s*;/,
    "STRATA_LAYOUT_VERSION must be derived, not written out");
  /* It reads the sky version rather than restating it — the same solver, so the
     same rename. Proven by fingerprinting the two inputs it declares. */
  assert.notEqual(
    HEAD.solverFingerprint({ sky: HEAD.LAYOUT_ALGORITHM_VERSION, minFilms: 20, bakedFacets: "genre,country,era" }),
    HEAD.solverFingerprint({ sky: "sky-fr-bh-v1", minFilms: 20, bakedFacets: "genre,country,era" }),
  );
});

test("the shipped layout version is a function of the solver, the corpus and the film order", () => {
  const filmOrder = ["film-0000000000000001", "film-0000000000000002"];
  const corpusVersion = "corpus-e7d72e282fdbb554";
  const here = layoutVersionFor(HEAD.LAYOUT_ALGORITHM_VERSION, corpusVersion, filmOrder);
  assert.match(here, /^layout-[0-9a-f]{16}$/);
  /* The exact failure of e49de94: same corpus, same films, different solver.
     Under the old scheme this returned the same string both times. */
  assert.notEqual(here, layoutVersionFor("sky-fr-bh-v1", corpusVersion, filmOrder));
  assert.notEqual(here, layoutVersionFor(HEAD.LAYOUT_ALGORITHM_VERSION, "corpus-0000000000000000", filmOrder));
  assert.notEqual(here, layoutVersionFor(HEAD.LAYOUT_ALGORITHM_VERSION, corpusVersion, filmOrder.slice(0, 1)));
});
