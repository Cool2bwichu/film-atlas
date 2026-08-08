import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const builtAtlasUrl = new URL("../dist/client/atlas.html", import.meta.url);
const sourceTemplateUrl = new URL("../atlas/app/template.html", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`https://atlas.example${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          if (url.pathname !== "/atlas.html") return new Response("Not found", { status: 404 });
          const body = request.method === "HEAD" ? null : await readFile(builtAtlasUrl);
          return new Response(body, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function embeddedCorpus(html) {
  const match = html.match(
    /const CORPUS = JSON\.parse\(\[\n([\s\S]*?)\n\]\.join\(""\)\);/,
  );
  assert.ok(match, "generated Atlas should contain a chunked embedded corpus");
  const chunks = JSON.parse(`[${match[1]}]`);
  return JSON.parse(chunks.join(""));
}

test("serves the Atlas experience directly at the site root", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const html = await response.text();
  assert.match(html, /<title>ATLAS — the shape of cinema<\/title>/i);
  assert.match(html, /AtlasRadialInspection/);
  assert.match(html, /function selectRadialFilm/);
  assert.doesNotMatch(html, /__RADIAL_INSPECTION__/);
  assert.equal((html.match(/function selectRadialFilm/g) ?? []).length, 1);
  assert.match(html, /content="https:\/\/atlas\.example\/og\.png"/);
  assert.doesNotMatch(html, /__ATLAS_ORIGIN__|codex-preview|SkeletonPreview|Your site is taking shape/);
  assert.match(html, /id="home"[^>]*aria-label="Return to the film wall"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /id="map"[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(html, /atlas-preferences-v1/);
});

test("radial neighbours expose inspection before explicit traversal", async () => {
  const [html, template] = await Promise.all([
    readFile(builtAtlasUrl, "utf8"),
    readFile(sourceTemplateUrl, "utf8"),
  ]);

  assert.match(html, /Connected to/);
  assert.match(html, /Why it appears here/);
  assert.match(html, /Explore this film's web/);
  assert.match(template, /data-act="travel"/);
  assert.match(template, /node\.setAttribute\("aria-pressed",selected\?"true":"false"\)/);
  const ringLabel = template.match(
    /n\.setAttribute\("aria-label",i<0[\s\S]*?\n\s*:\s*([\s\S]*?)\);\n\s*n\.style/,
  );
  assert.ok(ringLabel, "renderMap should define a distinct accessible label for ring nodes");
  assert.match(
    ringLabel[1],
    /Open film details\.[\s\S]*edgeMeta\(conn\.e\)[\s\S]*conn\.e\.claim/,
    "ring-node labels should announce inspection while preserving the exact relationship",
  );
  assert.doesNotMatch(template, /else openMap\(k,true\)/);
});

/* WHAT THIS TEST PROTECTS, AND WHY IT NO LONGER SPELLS IT AS FIVE CONSTANTS.
 *
 * It used to assert 803 films, 7,759 edges, 6,893 record / 15 attested / 851
 * reading. Those were measurements of one corpus, not properties of the build.
 * `pipeline/harvest-sparql.js` grows the corpus on purpose; the moment it does,
 * all five equalities go red — and `npm test` runs `npm run build` first, so
 * this is a hard stop on a change that is entirely correct. (`pages.yml` runs
 * only validate-corpus and measure-claims, so the deploy survives; the
 * developer loop does not.)
 *
 * Relaxing them to `> 0` would be the wrong repair, because the thing being
 * defended was never a number. It is a relationship: with no `--films` flag
 * `app/build.js` takes the `FILMS==="0"` path and must embed the WHOLE of
 * `static/corpus.json` — every film, every edge, and the evidence distinction
 * of AGENTS rule 8 intact. A `record` claim is checkable against credits, a
 * `reading` is an argument, an `attested` claim is a reading that has been
 * checked against a source. The build must not lose a tier, must not relabel
 * one as another, and must not truncate.
 *
 * So every count is re-derived from the corpus the build read and compared
 * exactly. That is strictly STRONGER than the constants were, not weaker: the
 * old `=== 803` passed happily if the build swapped one film for another, and
 * `=== 851` passed if a reading was retargeted onto a different pair. Set and
 * per-tier comparison catches both — which is precisely the failure mode the
 * slug-collision work in `harvest-sparql.js` exists to prevent, where a key
 * like `psycho` changes which film it names while the totals stay put.
 *
 * The floors exist because a fidelity check between two derived sides dies
 * quietly when both sides go empty: `0 === 0` is green. Each floor sits under
 * a value measured on the shipped corpus, named here so that lowering one is a
 * deliberate, explainable act. The attested floor matters most and is the one
 * most easily lost by accident — 15 claims out of 7,759, each individually
 * fact-checked against a live source (STATE.md, "All 12 attested claims
 * checked"), carried by name through `merge-corpus.js`, which drops an
 * authored claim silently when neither endpoint survives a rekey. */
const AUTHORED_CORPUS = new URL("../atlas/static/corpus.json", import.meta.url);

/* The shipped pre-growth corpus, 2026-08-08. Floors, not targets. */
const FLOOR_FILMS = 803;
const FLOOR_EDGES = 7000;
const FLOOR_RECORD = 6000;
const FLOOR_READING = 800;
const FLOOR_ATTESTED = 15;

/* `source` is optional in the schema and defaults to `record` in both the
   builder and the app, so the tally has to apply the same default or the two
   sides disagree over films that predate the field. */
function byEvidence(edges) {
  const counts = new Map();
  for (const edge of edges) {
    const source = edge.source ?? "record";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return counts;
}

function missingFrom(expected, actual) {
  const have = new Set(actual);
  return expected.filter((key) => !have.has(key));
}

test("preserves the full validated Atlas corpus and evidence distinctions", async () => {
  const html = await readFile(builtAtlasUrl, "utf8");
  const corpus = embeddedCorpus(html);
  const authored = JSON.parse(await readFile(AUTHORED_CORPUS, "utf8"));

  const authoredKeys = Object.keys(authored.films);
  const embeddedKeys = Object.keys(corpus.films);
  const authoredTiers = byEvidence(authored.edges);

  // Floors first: everything below is a comparison, and a comparison between
  // two empty sides is green. These make that impossible.
  assert.ok(
    authoredKeys.length >= FLOOR_FILMS,
    `static/corpus.json holds ${authoredKeys.length} films, below the ${FLOOR_FILMS} the shipped corpus carried`,
  );
  assert.ok(
    authored.edges.length >= FLOOR_EDGES,
    `static/corpus.json holds ${authored.edges.length} edges, below the floor of ${FLOOR_EDGES}`,
  );
  assert.deepEqual(
    [...authoredTiers.keys()].sort(),
    ["attested", "reading", "record"],
    "the evidence vocabulary is settled at record / attested / reading (AGENTS rule 8)",
  );
  for (const [tier, floor] of [["record", FLOOR_RECORD], ["reading", FLOOR_READING], ["attested", FLOOR_ATTESTED]]) {
    assert.ok(
      authoredTiers.get(tier) >= floor,
      `static/corpus.json carries ${authoredTiers.get(tier)} ${tier} claims, below the floor of ${floor}`,
    );
  }

  // Fidelity: the whole corpus, film for film, edge for edge.
  assert.deepEqual(
    missingFrom(authoredKeys, embeddedKeys),
    [],
    "films in static/corpus.json that the build did not embed",
  );
  assert.deepEqual(
    missingFrom(embeddedKeys, authoredKeys),
    [],
    "films the build embedded that are not in static/corpus.json",
  );
  assert.equal(embeddedKeys.length, authoredKeys.length);
  assert.equal(corpus.edges.length, authored.edges.length);

  // A key surviving is not the same as the film surviving under it.
  const swapped = authoredKeys.filter(
    (key) =>
      corpus.films[key].title !== authored.films[key].title ||
      (corpus.films[key].year ?? null) !== (authored.films[key].year ?? null),
  );
  assert.deepEqual(swapped, [], "film keys that name a different film in the build than in the corpus");
  assert.ok(Object.values(corpus.films).every((film) => "posterLicence" in film));

  // The evidence tiers, exactly — no tier lost, none relabelled as another.
  const embeddedTiers = byEvidence(corpus.edges);
  assert.deepEqual([...embeddedTiers.keys()].sort(), [...authoredTiers.keys()].sort());
  for (const [tier, count] of authoredTiers) {
    assert.equal(embeddedTiers.get(tier), count, `${tier} claims embedded`);
  }

  const sources = Object.groupBy(corpus.edges, (edge) => edge.source ?? "record");
  assert.ok(sources.attested.every((edge) => edge.confidence >= 0.5));
  assert.ok(sources.reading.every((edge) => Number.isFinite(edge.confidence)));
  assert.doesNotMatch(html, /\/\* __CORPUS__ \*\//);
});

test("keeps generated artifacts out of the authored source contract", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /redirect\("\/atlas\.html"\)/);
  assert.match(layout, /ATLAS — the shape of cinema/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(packageJson, /site-creator-vinext-starter/);
  assert.ok(new URL("../atlas/app/template.html", root));
});
