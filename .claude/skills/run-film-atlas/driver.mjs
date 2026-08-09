#!/usr/bin/env node
/* driver.mjs — drive the running ATLAS in a real browser.
 *
 *   node .claude/skills/run-film-atlas/driver.mjs smoke
 *   node .claude/skills/run-film-atlas/driver.mjs shot '#/sky'
 *   node .claude/skills/run-film-atlas/driver.mjs eval 'KEYS.length'
 *   node .claude/skills/run-film-atlas/driver.mjs repl
 *
 * WHY THIS EXISTS AND WHY IT CHECKS PIXELS.
 * atlas/STATE.md records the trap this project keeps falling into, twice
 * already: "jsdom cannot tell you a page is visible. It mounts and evaluates;
 * it does no layout and no paint. Two handoffs passed it while rendering a
 * black screen." So a driver that asserts "no console error" and "the DOM has
 * nodes" would pass exactly the failures that have actually shipped here.
 *
 * Every check below therefore ends in INK: how many tiles really laid out with
 * a non-zero box, how many pixels the constellation canvas actually painted.
 * A screenshot that exists is not evidence. A screenshot with 0.4% ink is a
 * black page with a header on it. */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = resolve(HERE, "../../..");            /* repo root */
const ARTIFACT = process.env.ATLAS_HTML || join(UNIT, "public/atlas.html");
const SHOTS = process.env.ATLAS_SHOTS || join(UNIT, ".atlas-shots");
/* The artifact is ~9 MB of inlined JSON that the page parses on load. On this
   container that is ~4s cold; a 30s default has never been close, but a 5s one
   would flake constantly. */
const LOAD_MS = Number(process.env.ATLAS_LOAD_MS || 45000);

const log = (...a) => console.log(...a);
const fail = (m) => { console.error("FAIL: " + m); process.exitCode = 1; return false; };

function artifactOrDie() {
  if (!existsSync(ARTIFACT)) {
    console.error(`No artifact at ${ARTIFACT}\n  build it:  node atlas/app/build.js --out public/atlas.html`);
    process.exit(2);
  }
  return pathToFileURL(ARTIFACT).href;
}

/* POSTERS DO NOT LOAD IN THIS CONTAINER, AND THEY DO NOT FAIL EITHER.
   Measured: the page issues 239 image requests to upload.wikimedia.org and
   gets back 0 responses and 0 failures - they hang. Direct navigation to the
   same URL returns ERR_CONNECTION_RESET, so the host is not reachable from the
   browser here even with --proxy-server set.

   That matters more than "no pictures in the screenshot". The app's fallback to
   its own generated cell is wired to the img's onerror:

       onerror="this.outerHTML=genArt(k)"

   A request that HANGS never fires onerror, so the cell never renders and the
   tile stays an empty frame forever. Blocking the requests outright makes them
   fail instantly, which fires onerror, which is how you see what the app
   actually looks like on its own art - AGENTS rule 9's "the generated cell IS
   the visual identity, not a fallback". Default ON; set ATLAS_POSTERS=1 to let
   them through if you are somewhere they resolve. */
const BLOCK_POSTERS = process.env.ATLAS_POSTERS !== "1";

async function open(route) {
  const url = artifactOrDie();
  const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  /* When we abort the poster requests ourselves, Chromium logs one
     "Failed to load resource" per image. Those are OUR errors, not the
     app's, and counting them would bury a real one under 142 of them. */
  const ours = (t) => BLOCK_POSTERS && /Failed to load resource/i.test(t);
  page.on("console", (m) => { if (m.type() === "error" && !ours(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  if (BLOCK_POSTERS) await page.route("**/*", (r) => (r.request().resourceType() === "image" ? r.abort() : r.continue()));
  await page.goto(url + (route || ""), { waitUntil: "load", timeout: LOAD_MS });
  /* The app's own readiness signal: it logs film and connection counts at the
     end of its script. Waiting on KEYS beats waiting on a timer. */
  await page.waitForFunction("typeof KEYS !== 'undefined' && KEYS.length > 0", null, { timeout: LOAD_MS });
  return { browser, page, errors };
}

/* Ink on the constellation canvas, as a fraction of its pixels. Reads the real
   backing store, so it cannot be fooled by a canvas that is sized and never
   painted — which is precisely what a broken sky looks like. */
const CANVAS_INK = `(() => {
  const c = document.getElementById("sky-c");
  if (!c || !c.width) return { ok: false, why: "no canvas" };
  const g = c.getContext("2d", { willReadFrequently: true });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 8) lit++;   /* stride-sample alpha */
  const n = Math.ceil(d.length / (4 * 37));
  return { ok: true, pct: +(100 * lit / n).toFixed(2), w: c.width, h: c.height };
})()`;

/* Wall tiles that actually took up space. offsetHeight is layout, not markup —
   the distinction the jsdom trap turns on. */
const WALL_INK = `(() => {
  const t = [...document.querySelectorAll("#wall-body .tile, #wall-body [data-key], #wall-body a, #wall-body button")];
  const laid = t.filter(e => e.offsetWidth > 8 && e.offsetHeight > 8);
  return { nodes: t.length, laid: laid.length };
})()`;

async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  const p = join(SHOTS, name.endsWith(".png") ? name : name + ".png");
  await page.screenshot({ path: p });
  return `${p} (${(statSync(p).size / 1024).toFixed(0)} KB)`;
}

/* ── commands ─────────────────────────────────────────────────────────── */

async function cmdShot(route, name) {
  const { browser, page, errors } = await open(route || "");
  /* Every view has an entrance: the radial map fades and slides its ring in,
     the constellation paints 2,204 discs on the frame after it builds. Shooting
     immediately catches the animation half-done and looks like a rendering bug
     in the screenshot. Settle first — the sky needs the longer wait. */
  await page.waitForTimeout(route && route.includes("/sky") ? 1800 : 1200);
  log(await shot(page, name || "shot"));
  if (errors.length) log("console errors:\n  " + errors.join("\n  "));
  await browser.close();
}

async function cmdEval(js) {
  const { browser, page, errors } = await open("");
  const out = await page.evaluate(`(() => { try { return JSON.stringify(${js}); } catch (e) { return "ERR " + e.message; } })()`);
  log(out);
  if (errors.length) log("console errors:\n  " + errors.join("\n  "));
  await browser.close();
}

async function cmdSmoke() {
  const { browser, page, errors } = await open("");
  let ok = true;

  log(`posters     ${BLOCK_POSTERS ? "blocked, so generated cells render" : "allowed"}`);

  /* 1 ── the wall paints */
  const wall = await page.evaluate(WALL_INK);
  log(`wall        ${wall.laid} tiles laid out (${wall.nodes} nodes)`);
  if (wall.laid < 12) ok = fail(`wall rendered ${wall.laid} laid-out tiles — a black page passes every DOM check but this one`);
  log("  " + await shot(page, "1-wall"));

  /* 2 ── a film's radial map opens by address */
  const key = await page.evaluate("KEYS.find(k => (ADJ[k]||[]).length >= 6)");
  await page.evaluate(`location.hash = "#/film/" + encodeURIComponent(${JSON.stringify(key)})`);
  await page.waitForTimeout(900);
  const map = await page.evaluate(`(() => {
    const stage = document.getElementById("stage");
    const nodes = [...stage.querySelectorAll("*")].filter(e => e.offsetWidth > 20 && e.offsetHeight > 20);
    const paths = stage.querySelectorAll("#edges path, #edges line");
    return { view: document.getElementById("map").getAttribute("aria-hidden"), nodes: nodes.length, curves: paths.length };
  })()`);
  log(`map         ${JSON.stringify(key)} -> ${map.nodes} laid-out nodes, ${map.curves} curves, aria-hidden=${map.view}`);
  if (map.view !== "false") ok = fail("#/film/<key> did not switch to the map view");
  if (map.curves < 3) ok = fail(`map drew ${map.curves} curves — the lineage did not render`);
  log("  " + await shot(page, "2-map"));

  /* 3 ── the constellation paints 2,204 discs */
  await page.evaluate('location.hash = "#/sky"');
  await page.waitForTimeout(1800);
  const ink = await page.evaluate(CANVAS_INK);
  const sky = await page.evaluate('({ ready: !!sky.ready, n: sky.n, visibleN: sky.visibleN })');
  log(`sky         ${sky.n} films, canvas ${ink.w}x${ink.h}, ink ${ink.pct}%`);
  if (!sky.ready) ok = fail("sky never became ready");
  if (!ink.ok || ink.pct < 0.5) ok = fail(`constellation painted ${ink.pct}% ink — this is the black-page failure STATE.md records twice`);
  log("  " + await shot(page, "3-sky"));

  /* 4 ── narrowing the field re-forms it */
  const facet = await page.evaluate(`(() => {
    const f = FACET_FIELDS[0]; if (!f) return null;
    const counts = [...skyFacetCounts(f.key).entries()].sort((a,b) => b[1]-a[1]);
    return counts.length ? { field: f.key, value: counts[0][0], n: counts[0][1] } : null;
  })()`);
  if (!facet) { ok = fail("no facet available to filter on"); }
  else {
    const before = await page.evaluate("sky.visibleN || sky.n");
    await page.evaluate(`skyToggleFacet(${JSON.stringify(facet.field)}, ${JSON.stringify(facet.value)})`);
    await page.waitForTimeout(1400);
    const after = await page.evaluate("sky.visibleN");
    const ink2 = await page.evaluate(CANVAS_INK);
    log(`narrow      ${facet.field}=${facet.value} -> ${after} of ${before} films, ink ${ink2.pct}%`);
    if (!(after > 0 && after < before)) ok = fail(`filter moved ${before} -> ${after}; it selected nothing or everything`);
    if (ink2.pct < 0.2) ok = fail(`filtered constellation painted ${ink2.pct}% ink`);
    log("  " + await shot(page, "4-narrowed"));
    await page.evaluate("skyClearFacets()");
    await page.waitForTimeout(700);
  }

  /* 5 ── Passage routes a chain of claims between two films */
  const pair = await page.evaluate("[KEYS[0], KEYS[Math.floor(KEYS.length/2)]]");
  const t0 = Date.now();
  const route = await page.evaluate(`(() => { const r = passageRoute(${JSON.stringify(pair[0])}, ${JSON.stringify(pair[1])});
    return r && { hops: r.hops, claims: r.steps.map(s => s.edge.claim).filter(Boolean).length }; })()`);
  log(`passage     ${JSON.stringify(pair)} -> ${route ? route.hops + " hops, " + route.claims + " claims" : "NO ROUTE"} in ${Date.now()-t0}ms`);
  if (!route || !route.hops) ok = fail("passageRoute returned nothing between two real films — the corpus claims zero orphans");

  /* 6 ── console */
  if (errors.length) { log("console errors:\n  " + errors.join("\n  ")); ok = fail(`${errors.length} console error(s)`); }
  else log("console     clean");

  await browser.close();
  log(ok ? "\nSMOKE PASS" : "\nSMOKE FAIL");
}

/* stdin REPL, for poking at something the smoke test does not cover.
   One command per line:  goto <route> | eval <js> | shot <name> | ink | quit */
async function cmdRepl() {
  const { browser, page, errors } = await open("");
  log("ready. commands: goto <route> | eval <js> | shot <name> | ink | errors | quit");
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    const arg = line.trim().slice((cmd || "").length).trim();
    try {
      if (cmd === "quit" || cmd === "exit") break;
      else if (cmd === "goto") { await page.evaluate(`location.hash = ${JSON.stringify(arg)}`); await page.waitForTimeout(1200); log("ok"); }
      else if (cmd === "eval") log(await page.evaluate(`(() => { try { return JSON.stringify(${arg}); } catch (e) { return "ERR " + e.message; } })()`));
      else if (cmd === "shot") log(await shot(page, arg || "repl"));
      else if (cmd === "ink") log(JSON.stringify(await page.evaluate(CANVAS_INK)));
      else if (cmd === "errors") log(errors.length ? errors.join("\n") : "clean");
      else if (cmd) log("? " + cmd);
    } catch (e) { log("ERR " + e.message); }
  }
  await browser.close();
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "smoke") await cmdSmoke();
else if (cmd === "shot") await cmdShot(args[0], args[1]);
else if (cmd === "eval") await cmdEval(args.join(" "));
else if (cmd === "repl") await cmdRepl();
else { console.error("usage: driver.mjs smoke | shot <route> [name] | eval <js> | repl"); process.exit(2); }
