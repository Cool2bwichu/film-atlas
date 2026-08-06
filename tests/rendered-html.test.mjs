import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const builtAtlasUrl = new URL("../dist/client/atlas.html", import.meta.url);

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
  assert.match(html, /content="https:\/\/atlas\.example\/og\.png"/);
  assert.doesNotMatch(html, /__ATLAS_ORIGIN__|codex-preview|SkeletonPreview|Your site is taking shape/);
  assert.match(html, /id="home"[^>]*aria-label="Return to the film wall"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /id="map"[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(html, /atlas-preferences-v1/);
});

test("preserves the full validated Atlas corpus and evidence distinctions", async () => {
  const html = await readFile(builtAtlasUrl, "utf8");
  const corpus = embeddedCorpus(html);
  assert.equal(Object.keys(corpus.films).length, 803);
  assert.equal(corpus.edges.length, 7649);
  assert.ok(Object.values(corpus.films).every((film) => "posterLicence" in film));

  const sources = Object.groupBy(corpus.edges, (edge) => edge.source ?? "record");
  assert.equal(sources.record.length, 6982);
  assert.equal(sources.attested.length, 15);
  assert.equal(sources.reading.length, 652);
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
