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
import { existsSync, mkdirSync, statSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = resolve(HERE, "../../..");            /* repo root */
const ARTIFACT = process.env.ATLAS_HTML || join(UNIT, "public/atlas.html");
const SHOTS = process.env.ATLAS_SHOTS || join(UNIT, ".atlas-shots");
const FILMS = process.env.ATLAS_FILMS || join(UNIT, ".atlas-films");
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

/* One way in for every command. `video` is a directory: pass it and the whole
   context is recorded, which is the only way Playwright will record at all —
   recordVideo is a BrowserContext option, not a page one, and the file is not
   written until the context closes. */
async function openCtx({ route = "", video = null, viewport = { width: 1440, height: 900 } } = {}) {
  const url = artifactOrDie();
  const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport,
    /* Explicit rather than inherited: every motion check below is void under
       prefers-reduced-motion, which the app honours by not animating at all. */
    reducedMotion: "no-preference",
    ...(video ? { recordVideo: { dir: video, size: viewport } } : {}),
  });
  const page = await ctx.newPage();
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
  return { browser, ctx, page, errors };
}

async function open(route) { return openCtx({ route }); }

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

/* ══ MOTION ═══════════════════════════════════════════════════════════════
   EVERY ANIMATION JUDGEMENT ON THIS PROJECT SO FAR CAME FROM STILL FRAMES.
   A design pass said so in its own words: "Motion smoothness by eye — I
   inspected still frames and argued the 45 fps case arithmetically." That is
   the same class of mistake as the jsdom trap this driver already exists to
   avoid: reasoning about a thing instead of looking at it.

   So `film` records. But A VIDEO NOBODY WATCHES IS WORSE THAN THE STILL WE
   HAD, because it produces the feeling of verification without any. The video
   is for a human; the numbers below are the verification, and they are taken
   from the frames the compositor actually presented.

   ── HOW THE FRAMES ARE GOT ───────────────────────────────────────────────
   CDP Page.startScreencast, not screenshots. A screenshot costs 60-150 ms and
   would sample a 1,150 ms flight eight times; the screencast emits a frame
   per compositor swap, which is ~45 fps here, and each frame carries a swap
   timestamp. It also captures what the SCREEN got — canvas and DOM together —
   rather than what the app computed, which is the distinction that matters
   when the question is whether a tween was smooth.

   Two consequences worth knowing before reading any number out of this:

   1. The screencast emits ONLY WHEN THE PAGE CHANGES. A static page produces
      exactly one frame. So a stalled tween does not show up as a zero delta,
      it shows up as a GAP BETWEEN TIMESTAMPS, and both are reported.
   2. Capturing costs the page something. Presented fps here is ~45 against
      the ~52 the app measures for itself (sky.lastForm.frames), so the
      absolute frame rate under capture is a floor, not the app's real rate.
      The SHAPE of the profile is what is being judged, and the app's own
      count is printed beside it as the uninstrumented control.

   ── WHAT IS MEASURED ─────────────────────────────────────────────────────
   Consecutive frames are downsampled to 320x200 luma and differenced:

     delta   mean |luma difference| per pixel, 0-255. The frame's motion.
     moved%  share of pixels that changed by more than 8. Tells a whole field
             sliding apart from a meteor crossing an otherwise still one.

   From that series, four threshold-free readings decide whether the motion is
   a tween or a lie:

     centroid    Sum(t*delta)/Sum(delta), as a share of the nominal duration.
                 A real ease lands somewhere in the middle of its window. A
                 snap lands on frame one.
     peak share  the largest single frame's delta over the total. A tween
                 spreads its motion; a snap puts ~all of it in one frame.
     to 50%      how many frames it takes to account for half the motion.
                 A snap: one.
     worst gap   the longest interval between presented frames inside the
                 window. This is the dropped frame / stall detector.

   Proven by breaking it: forcing skyFormStep's p to 1 makes the flight snap,
   and the numbers move from centroid 30% / peak share 0.30 / to-50% 7 frames
   to centroid 1% / peak share 0.97 / to-50% 1 frame. See SKILL.md. */

const FILM_W = Number(process.env.ATLAS_FILM_W || 640);       /* capture width  */
const FILM_H = Math.round((FILM_W * 900) / 1440);
const FILM_Q = 78;                                            /* jpeg quality   */
/* Differenced at the capture's own resolution rather than downsampled again.
   A meteor is a ~2px streak: at half size it is sub-pixel and its delta sinks
   into the scintillation floor. Measured at 640x400 the streak's `moved` share
   separates cleanly from the background (0.11% against 0.00%), which is the
   whole reason the meteor scene is judgeable at all. */
const ANA_W = Number(process.env.ATLAS_FILM_ANA || FILM_W), ANA_H = Math.round((ANA_W * 900) / 1440);
/* A flight is allowed to finish slightly late: the frame that lands it is
   presented after the deadline, and skyFormStep does its regrid on it. */
const FILM_GRACE = 200;
const STRIP_COLS = 4, STRIP_CELLS = 12;

const NIGHT = "cold-science-fiction";      /* the one register with a night sky */

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);

/* Wait for the constellation to be built AND for its 950 ms arrival settle to
   finish, so a scene starts from a picture that is standing still. */
async function skyReady(page) {
  await page.waitForFunction("typeof sky !== 'undefined' && sky.ready && sky.n > 0", null, { timeout: LOAD_MS });
  await page.waitForTimeout(2200);
}

/* ── the scenes ───────────────────────────────────────────────────────────
   Each returns { label, judge, tail, setup, act }. `act` fires the thing being
   filmed and returns the mark (page-clock ms) it started at plus the duration
   the app itself claims for it — never a duration this file invented. */
function scene(name, arg) {
  const world = arg || NIGHT;
  const S = {
    /* The 1,150 ms flight of 2,204 films between two baked layouts. */
    reform: {
      label: `re-form into "${world}"`, judge: "tween", form: true, tail: 900,
      setup: async (page) => { await skyReady(page); },
      act: (page) => page.evaluate((id) => {
        const t = performance.now(); skyWorldChoose(id);
        return { mark: t, nominal: SKY_FORM_MS, note: id };
      }, world),
    },
    /* The way back: every film that left flies in from beyond the frame, and
       the worlds strip unspools again on top of it. */
    return: {
      label: `whole-atlas return from "${world}"`, judge: "tween", form: true, tail: 1200,
      setup: async (page) => {
        await skyReady(page);
        await page.evaluate((id) => skyWorldChoose(id), world);
        await page.waitForTimeout(2200);
      },
      act: (page) => page.evaluate(() => {
        const t = performance.now(); skyClearFacets();
        return { mark: t, nominal: SKY_FORM_MS, note: "clear" };
      }),
    },
    /* One meteor, from just off one edge to just off another. Forced rather
       than waited for — the real generator still draws the path, only the
       clock is moved, so what is filmed is a sample from the shipping
       distribution and not a hand-built streak. */
    meteor: {
      label: "night sky, one meteor crossing", judge: "tween", tail: 700,
      setup: async (page) => {
        await skyReady(page);
        await page.evaluate((id) => skyWorldChoose(id), NIGHT);
        await page.waitForTimeout(2400);
      },
      act: async (page) => {
        const r = await page.evaluate(async () => {
          sky.meteor = null; sky.meteorAt = performance.now() - 1;
          skyRender();
          for (let i = 0; i < 8 && !sky.meteor; i++) await new Promise((res) => requestAnimationFrame(res));
          /* The mark is the meteor's OWN t0, not the click: the streak begins
             on the frame that spawned it, which is the frame after this. */
          return sky.meteor ? { mark: sky.meteor.t0, nominal: sky.meteor.ms,
            note: `${Math.round(sky.meteor.len)}px path, ${(sky.meteor.inside * 100).toFixed(0)}% of it in frame` } : null;
        });
        if (!r) throw new Error("no meteor spawned — skyMeteorStep returned null (reduced motion? wrong world?)");
        return r;
      },
    },
    /* The worlds strip, on its own: a 900 ms CSS unspool with no re-form under
       it. This is the one scene whose motion is entirely DOM, which is why the
       delta is taken from presented frames and not from the canvas. */
    worlds: {
      label: "worlds strip unspooling", judge: "tween", tail: 600,
      setup: async (page) => {
        await skyReady(page);
        await page.evaluate((id) => skyWorldChoose(id), world);
        await page.waitForTimeout(2200);
      },
      act: (page) => page.evaluate(() => {
        const t = performance.now(); skyWorldsOpen(true);
        return { mark: t, nominal: 900, note: "unspool" };
      }),
    },
  };
  if (S[name]) return S[name];

  /* The four motion signatures, observed at rest. `still` is the negative
     control and the most useful of the four: a register that declares itself
     still must not be repainting at all, and the screencast's change-driven
     nature means that reads as "no frames". */
  if (["still", "pulse", "drift", "flicker"].includes(name)) {
    return {
      label: `motion signature "${name}", observed at rest`,
      judge: name === "still" ? "quiet" : "loop", tail: 200,
      setup: async (page) => {
        await skyReady(page);
        const id = await page.evaluate((kind) => {
          const ids = Object.keys(REG_DEFS).filter((k) => ((REG_DEFS[k].treatment || {}).motion || {}).kind === kind);
          ids.sort((a, b) => (REG_DEFS[b].count || 0) - (REG_DEFS[a].count || 0));
          return ids[0] || null;
        }, name);
        if (!id) throw new Error(`no register carries motion.kind "${name}"`);
        await page.evaluate((i) => skyWorldChoose(i), id);
        await page.waitForTimeout(2400);
        return id;
      },
      act: (page) => page.evaluate(() => ({
        mark: performance.now(), nominal: 2400,
        note: `${skyRegisterId()}, depth ${((skyTreatment() || {}).motion || {}).depth}`,
      })),
    };
  }
  return null;
}

/* ── the paint tap ────────────────────────────────────────────────────────
   A gap in the presented frames has two possible authors and they call for
   opposite responses: either the APP did not paint, which is a stall in the
   product, or it painted and the compositor coalesced or delayed the frame,
   which is the harness. Timing skyDraw at its own call site separates them.

   skyDraw is a top-level function declaration in a classic script, so it is a
   window property and the assignment is what skyFrame's own `skyDraw()`
   resolves to — the same technique meteor-probe.mjs uses, verified there by
   the count being non-zero. The wrapper costs one call and one push per
   frame against a draw that paints up to 2,204 discs. */
const PAINT_TAP = `(() => {
  if (window.__paints) { window.__paints.length = 0; return "already"; }
  window.__paints = [];
  const real = window.skyDraw;
  if (typeof real !== "function") return "no skyDraw";
  window.skyDraw = function(){
    const a = performance.now();
    real.apply(this, arguments);
    window.__paints.push([a, performance.now() - a]);
  };
  return "wrapped";
})()`;

/* ── capture ──────────────────────────────────────────────────────────────
   Pre-roll first, so the first in-window delta is measured against a frame of
   the picture standing still rather than against nothing. */
async function screencast(ctx, page, sc) {
  const origin = await page.evaluate("performance.timeOrigin");
  await page.evaluate(PAINT_TAP);
  const client = await ctx.newCDPSession(page);
  const frames = [];
  client.on("Page.screencastFrame", (ev) => {
    /* metadata.timestamp is seconds since epoch; performance.now() is ms since
       timeOrigin. This puts both on the page's clock so the mark lines up. */
    frames.push({ t: ev.metadata.timestamp * 1000 - origin, data: ev.data });
    client.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });
  await client.send("Page.startScreencast",
    { format: "jpeg", quality: FILM_Q, maxWidth: FILM_W, maxHeight: FILM_H, everyNthFrame: 1 });
  await page.waitForTimeout(500);
  await page.evaluate("window.__paints && (window.__paints.length = 0)");
  const r = await sc.act(page);
  await page.waitForTimeout(r.nominal + sc.tail);
  await client.send("Page.stopScreencast").catch(() => {});
  await client.detach().catch(() => {});
  const paints = await page.evaluate("JSON.stringify(window.__paints || [])");
  return { frames, paints: JSON.parse(paints).map(([t, cost]) => ({ t: +(t - r.mark).toFixed(1), cost })), ...r };
}

/* Consecutive-frame difference, done in a browser because that is where a JPEG
   decoder already is. A separate context so it is not in the recording. */
async function deltas(browser, datas) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("about:blank");
  const out = await page.evaluate(async ({ datas, W, H }) => {
    const c = new OffscreenCanvas(W, H), g = c.getContext("2d", { willReadFrequently: true });
    let prev = null; const res = [];
    for (const d of datas) {
      const bin = atob(d), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u], { type: "image/jpeg" }));
      g.clearRect(0, 0, W, H); g.drawImage(bmp, 0, 0, W, H); bmp.close();
      const px = g.getImageData(0, 0, W, H).data, lum = new Uint8Array(W * H);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) lum[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
      if (prev) {
        let sum = 0, moved = 0;
        for (let j = 0; j < lum.length; j++) { const q = Math.abs(lum[j] - prev[j]); sum += q; if (q > 8) moved++; }
        res.push({ delta: sum / lum.length, moved: (100 * moved) / lum.length });
      } else res.push(null);
      prev = lum;
    }
    return res;
  }, { datas, W: ANA_W, H: ANA_H });
  await ctx.close();
  return out;
}

/* ── the filmstrip ────────────────────────────────────────────────────────
   Cells are sampled by TIME, not by index, so a stall renders as two adjacent
   cells that look identical — which is the failure being hunted, drawn. Under
   them, one bar per presented frame positioned at its real timestamp: a gap in
   the bars is a gap in the frames. */
async function strip(browser, series, sel, meta, out) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("about:blank");
  const png = await page.evaluate(async (a) => {
    const CW = 348, CH = Math.round((CW * 900) / 1440), CAP = 20, PAD = 10, HEAD = 62, PLOT = 132;
    const cols = a.cols, rows = Math.ceil(a.cells.length / cols);
    const W = PAD + cols * (CW + PAD), H = HEAD + rows * (CH + CAP + PAD) + PLOT + PAD;
    const c = new OffscreenCanvas(W, H), g = c.getContext("2d");
    g.fillStyle = "#0e0c0b"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#efe8df"; g.font = "600 17px system-ui, sans-serif";
    g.fillText(a.title, PAD, 26);
    g.fillStyle = "#9d938a"; g.font = "12px ui-monospace, monospace";
    g.fillText(a.sub, PAD, 46);
    for (let i = 0; i < a.cells.length; i++) {
      const cell = a.cells[i], cx = PAD + (i % cols) * (CW + PAD), cy = HEAD + Math.floor(i / cols) * (CH + CAP + PAD);
      const bin = atob(cell.data), u = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
      const bmp = await createImageBitmap(new Blob([u], { type: "image/jpeg" }));
      g.drawImage(bmp, cx, cy, CW, CH); bmp.close();
      g.strokeStyle = cell.peak ? "#e0b04a" : (cell.dup ? "#7a4a3a" : "#2b2724"); g.lineWidth = cell.peak ? 2 : 1;
      g.strokeRect(cx + 0.5, cy + 0.5, CW - 1, CH - 1);
      g.fillStyle = cell.peak ? "#e0b04a" : (cell.dup ? "#c2765c" : "#9d938a");
      g.font = "11px ui-monospace, monospace";
      g.fillText(cell.dup
        ? `+${cell.want}ms   no new frame — still showing +${cell.t}ms`
        : `+${cell.t}ms   d ${cell.delta}   ${cell.moved}% moved`, cx + 2, cy + CH + 14);
    }
    /* the energy plot */
    const py = H - PLOT, ph = PLOT - 34, x0 = PAD, x1 = W - PAD;
    const T = (t) => x0 + ((t - a.t0) / Math.max(1, a.t1 - a.t0)) * (x1 - x0);
    g.fillStyle = "#151211"; g.fillRect(x0, py, x1 - x0, ph);
    g.fillStyle = "#1d1917"; g.fillRect(T(0), py, T(a.nominal) - T(0), ph);   /* the nominal window */
    for (const s of a.series) {
      const h = Math.max(1, (s.delta / Math.max(1e-6, a.peak)) * ph);
      g.fillStyle = s.delta === a.peak ? "#e0b04a" : "#6fa8c8";
      g.fillRect(T(s.t), py + ph - h, 2, h);
    }
    g.strokeStyle = "#8a7f76"; g.lineWidth = 1;
    for (const [t, lab] of [[0, "action"], [a.nominal, `nominal +${a.nominal}ms`]]) {
      g.beginPath(); g.moveTo(T(t) + 0.5, py); g.lineTo(T(t) + 0.5, py + ph); g.stroke();
      g.fillStyle = "#8a7f76"; g.font = "11px ui-monospace, monospace"; g.fillText(lab, T(t) + 4, py + ph + 14);
    }
    g.fillStyle = "#6d645c"; g.font = "11px ui-monospace, monospace";
    g.fillText(`per-frame delta, one bar per presented frame at its real timestamp — peak ${a.peak.toFixed(2)}`, x0, py + ph + 28);
    const blob = await c.convertToBlob({ type: "image/png" });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return btoa(s);
  }, { cells: sel, series, cols: STRIP_COLS, ...meta });
  writeFileSync(out, Buffer.from(png, "base64"));
  await ctx.close();
}

/* A delta profile in text, one column per equal slice of the window. "·" is a
   slice with NO presented frame in it — the shape a dropped frame makes. */
function sparkline(series, from, to, cols = 56) {
  const B = " ▁▂▃▄▅▆▇█", w = (to - from) / cols, peak = Math.max(1e-6, ...series.map((s) => s.delta));
  let out = "";
  for (let i = 0; i < cols; i++) {
    const inCol = series.filter((s) => s.t >= from + i * w && s.t < from + (i + 1) * w);
    if (!inCol.length) { out += "·"; continue; }
    const v = Math.max(...inCol.map((s) => s.delta));
    out += B[Math.max(1, Math.min(8, Math.ceil((v / peak) * 8)))];
  }
  return out;
}

/* ── WHY THERE ARE TWO PASSES ─────────────────────────────────────────────
   MEASURED, because it was going to be assumed otherwise: recording the video
   HALVES the frame rate of the thing being filmed. Same machine, same scene,
   same artifact, reading the app's own sky.lastForm.frames — 43 frames for the
   1,150 ms re-form with recordVideo off, 22 with it on. Playwright's recorder
   is itself a screencast plus an ffmpeg encode, so with our own screencast up
   there are two of them competing with the page's rAF.

   Filming and measuring in one pass would therefore make the harness the
   biggest source of jank in its own report, and "worst gap 132 ms" would be
   OUR gap. So the scene is driven twice: once with the screencast alone, which
   is where every number below comes from, and once with recordVideo alone,
   which is the video a person watches.

   That only works if both passes film the SAME event, so Math.random is
   replaced with a seeded PRNG at the moment the action fires — after setup, so
   the sequence consumed from that point is identical in both passes. The
   generator is untouched: skyMeteorStep still draws its own angle and its own
   parallel, it just draws the same ones twice. It also makes `film meteor`
   reproducible run to run, which a distribution sampled live never was. */
const SEED_RANDOM = `(() => {
  let a = 0x9e3779b9;
  Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return true;
})()`;

const appFrames = (page) =>
  page.evaluate("typeof sky!=='undefined' && sky.lastForm ? JSON.stringify(sky.lastForm) : null");

/* Pass two. Drives the identical scene with the identical seed and keeps only
   the .webm; nothing here is measured, because measuring it is what the first
   pass is for. */
async function recordPass(sc, slug) {
  const vdir = join(FILMS, ".vid-" + slug);
  rmSync(vdir, { recursive: true, force: true });
  const { browser, ctx, page, errors } = await openCtx({ route: "#/sky", video: vdir });
  await sc.setup(page);
  await page.evaluate(SEED_RANDOM);
  const r = await sc.act(page);
  await page.waitForTimeout(r.nominal + sc.tail);
  const lf = await appFrames(page);
  await ctx.close();                       /* this is what writes the video */
  const src = await page.video()?.path().catch(() => null);
  const out = join(FILMS, slug + ".webm");
  if (src && existsSync(src)) { renameSync(src, out); }
  rmSync(vdir, { recursive: true, force: true });
  await browser.close();
  return { path: existsSync(out) ? out : null, lastForm: lf ? JSON.parse(lf) : null, errors };
}

async function cmdFilm(name, arg, label) {
  const sc = scene(name, arg);
  if (!sc) {
    console.error(`unknown scene "${name}". try: reform | return | meteor | worlds | still | pulse | drift | flicker | all`);
    process.exit(2);
  }
  const slug = label || (arg && name !== "reform" && name !== "return" ? `${name}-${arg}` : name);
  mkdirSync(FILMS, { recursive: true });

  const { browser, ctx, page, errors } = await openCtx({ route: "#/sky" });
  await sc.setup(page);
  await page.evaluate(SEED_RANDOM);
  const cap = await screencast(ctx, page, sc);
  /* The app's own accounting for the flight it just flew, read before the
     context dies. Uninstrumented by us: skyFrame has always kept it. */
  const lastForm = await appFrames(page);
  await ctx.close();

  const raw = await deltas(browser, cap.frames.map((f) => f.data));
  const all = cap.frames.map((f, i) => ({
    t: +(f.t - cap.mark).toFixed(1),
    delta: raw[i] ? +raw[i].delta.toFixed(3) : null,
    moved: raw[i] ? +raw[i].moved.toFixed(2) : null,
  }));
  const winEnd = cap.nominal + FILM_GRACE;
  const win = all.filter((f) => f.t >= 0 && f.t <= winEnd && f.delta !== null);
  const after = all.filter((f) => f.t > winEnd && f.delta !== null);

  let ok = true;
  const F = (m) => { ok = fail(m); };
  log(`film        ${sc.label}${cap.note ? "  (" + cap.note + ")" : ""}`);
  log(`window      0 to +${Math.round(cap.nominal)}ms nominal, judged to +${Math.round(winEnd)}ms (grace ${FILM_GRACE}ms)`);

  if (sc.judge === "quiet") {
    /* The negative control. A register whose signature is `still` must not be
       driving the idle clock, and the screencast only speaks when the picture
       changes — so the evidence for "still" is the absence of frames. */
    const tot = win.reduce((p, c) => p + c.delta, 0);
    log(`frames      ${win.length} presented in the window (a still register should present almost none)`);
    log(`motion      total delta ${f2(tot)}, peak ${f2(Math.max(0, ...win.map((f) => f.delta)))}`);
    if (win.length > 6) F(`a register declared "still" presented ${win.length} frames — something is repainting`);
  } else if (!win.length) {
    F("no frames were presented inside the window — nothing moved at all");
  } else {
    /* ── THE BACKGROUND IS SUBTRACTED BEFORE THE MOTION IS JUDGED ──────────
       The night sky never stops: 760 stars scintillate and a meteor clock
       ticks, so every frame carries a small delta whether or not the thing
       being filmed is happening. Left in, that floor is a slow poison — it
       adds a wide, flat, evenly-spread pedestal to the profile, which is
       exactly the shape a gradient has. Measured on the deliberately snapped
       build: with the floor left in, the motion centroid of a flight that
       took ONE frame reads +196ms, 17% of nominal, and passes for a tween.

       The floor is measured from this run, not assumed: it is the median
       delta of the frames AFTER the window, which is the view carrying on
       doing whatever it does when nothing is being asked of it. Tween scenes
       only — for a `loop` scene the background IS the subject. */
    const floor = sc.judge === "tween" && after.length ? med(after.map((f) => f.delta)) : 0;
    const adj = win.map((f) => ({ t: f.t, d: Math.max(0, f.delta - floor) }));
    const total = adj.reduce((p, c) => p + c.d, 0);
    const peak = Math.max(...adj.map((f) => f.d));
    const peakShare = peak / Math.max(1e-9, total);
    /* Timed from the FIRST PRESENTED FRAME, not from the action. The gap
       between those two is the compositor's and ours — measured at 90-160ms
       here while the app's own first paint lands at +26ms — and anchoring the
       centroid to the action would fold that latency into every scene, which
       on the snapped build put a one-frame flight's centre of mass at 15% of
       nominal and let it pass. Relative to the motion actually observed, the
       same flight reads 1%. */
    const t0w = win[0].t;
    const centroid = adj.reduce((p, c) => p + (c.t - t0w) * c.d, 0) / Math.max(1e-9, total);
    const sorted = [...adj].sort((a, b) => b.d - a.d);
    let acc = 0, to50 = 0;
    for (const f of sorted) { acc += f.d; to50++; if (acc >= total / 2) break; }
    const dts = win.slice(1).map((f, i) => f.t - win[i].t);
    const gap = Math.max(0, ...dts), gm = med(dts);
    const span = win[win.length - 1].t - win[0].t;
    /* The app's own paints, over the same window. A hole in the presented
       frames that is NOT a hole here belongs to the compositor or to this
       harness; a hole in both is a stall in the product. */
    const pw = (cap.paints || []).filter((p) => p.t >= 0 && p.t <= winEnd);
    const pdts = pw.slice(1).map((p, i) => p.t - pw[i].t);
    const pgap = Math.max(0, ...pdts);
    const pcost = Math.max(0, ...pw.map((p) => p.cost));

    log(`frames      ${win.length} presented over ${Math.round(span)}ms (${f1((win.length / Math.max(1, span)) * 1000)} fps under capture)`);
    /* sky.lastForm describes the last RE-FORM, so it is only this scene's
       flight when this scene caused one. On a meteor it is whatever flight
       brought the world in, and printing it there would be a stale number
       wearing this scene's label. */
    if (lastForm && sc.form) {
      const lf = JSON.parse(lastForm);
      log(`app's own   ${lf.frames} frames in ${Math.round(lf.ms)}ms, mean ${f2(lf.mean)}ms worst ${f2(lf.worst)}ms per frame  [sky.lastForm, uninstrumented]`);
    }
    log(`paints      ${pw.length} skyDraw calls = ${f1((pw.length / Math.max(1, winEnd)) * 1000)}/s, first at +${pw.length ? Math.round(pw[0].t) : "-"}ms, worst single draw ${f1(pcost)}ms, worst paint-to-paint ${Math.round(pgap)}ms`);
    log(`gaps        first presented frame +${Math.round(win[0].t)}ms, then median ${Math.round(gm)}ms, worst ${Math.round(gap)}ms`);
    log(`background  ${f2(floor)} median delta after the window — the view's own weather, subtracted below`);
    log(`delta       raw median ${f2(med(win.map((f) => f.delta)))}; above background: peak ${f2(peak)}, peak share ${f2(peakShare * 100)}% of the window's motion`);
    log(`spread      half the motion is in ${to50} of ${win.length} frames; centroid +${Math.round(centroid)}ms into the observed motion = ${f1((100 * centroid) / cap.nominal)}% of nominal`);
    log(`moved       peak ${f2(Math.max(...win.map((f) => f.moved)))}% of pixels in one frame, median ${f2(med(win.map((f) => f.moved)))}% in window against ${f2(med(after.map((f) => f.moved)))}% after it`);
    log(`after       ${after.length} frames past the window, median delta ${f2(med(after.map((f) => f.delta)))}`);
    log(`profile     ${sparkline(win, 0, winEnd)}`);

    if (win.length < 8) F(`only ${win.length} frames were presented across a ${cap.nominal}ms motion`);
    if (peakShare > 0.5) F(`one frame carries ${f1(peakShare * 100)}% of the motion — that is a snap, not a tween`);
    if (sc.judge === "tween") {
      if (centroid < cap.nominal * 0.12) F(`motion centroid is +${Math.round(centroid)}ms into a ${cap.nominal}ms motion — the picture jumped and then sat still`);
      if (to50 < 3) F(`half the motion is in ${to50} frame(s) — no gradient`);
      /* THREE GAP THRESHOLDS, LOOSENING AS THE BLAME MOVES AWAY FROM THE APP.
         A single draw's cost is the app's own work and nothing else, so it is
         held tightest: 60ms is a visible hitch on any machine. Paint-to-paint
         adds rAF scheduling, which this container throttles to 20-60ms under
         capture all by itself, so only a quarter-second freeze is chargeable.
         The presented gap adds the compositor and our own screencast on top.
         None of these certify a frame RATE — see SKILL.md; they catch a
         freeze. Smoothness is the delta profile's shape, above. */
      if (pcost > 60) F(`one skyDraw took ${f1(pcost)}ms — a hitch the reader sees whatever the machine`);
      if (pgap > 250) F(`the app went ${Math.round(pgap)}ms without a paint inside the flight — a freeze, not container noise`);
      if (gap > 350) F(`a ${Math.round(gap)}ms gap between presented frames, with the app's worst paint gap at ${Math.round(pgap)}ms`);
    }
  }

  writeFileSync(join(FILMS, slug + ".json"), JSON.stringify({
    scene: name, arg: arg || null, label: sc.label, nominal: cap.nominal, note: cap.note || null,
    capture: { w: FILM_W, h: FILM_H, quality: FILM_Q, analysed: [ANA_W, ANA_H] },
    lastForm: lastForm ? JSON.parse(lastForm) : null, frames: all, paints: cap.paints || [],
  }, null, 1) + "\n");

  if (win.length) {
    const peak = Math.max(...win.map((f) => f.delta));
    const step = winEnd / STRIP_CELLS, sel = [];
    for (let i = 0; i < STRIP_CELLS; i++) {
      const want = i * step;
      let best = null, bd = Infinity;
      for (let k = 0; k < all.length; k++) {
        const d = Math.abs(all[k].t - want);
        if (d < bd && all[k].t >= -50) { bd = d; best = k; }
      }
      if (best === null) continue;
      /* A repeated frame is not a bug in the sampler, it is the answer: no new
         frame was presented in this slice. Say so on the cell rather than
         quietly dropping it, because that is what a stall looks like. */
      const dup = sel.length && sel[sel.length - 1].idx === best;
      sel.push({ idx: best, data: cap.frames[best].data, want: Math.round(want), t: Math.round(all[best].t),
        delta: f2(all[best].delta ?? 0), moved: f2(all[best].moved ?? 0),
        peak: all[best].delta === peak, dup });
    }
    /* The pre-roll is 500ms of a picture standing still; showing it would
       spend a third of the plot on nothing. */
    const series = all.filter((f) => f.delta !== null && f.t >= -160);
    await strip(browser, series, sel,
      { title: sc.label, sub: `${ARTIFACT.split("/").pop()} — nominal ${cap.nominal}ms, ${win.length} frames in window, peak delta ${f2(peak)}`,
        nominal: cap.nominal, t0: -160, t1: all.length ? all[all.length - 1].t : winEnd,
        peak: Math.max(...series.map((f) => f.delta)) },
      join(FILMS, slug + "-strip.png"));
  }

  await browser.close();

  /* Pass two, unless someone is iterating on the numbers and does not want to
     pay for it. The frame counts of the two passes are printed together: the
     gap between them IS the cost of recording, and it is the reason they are
     not the same run. */
  let vid = null;
  if (process.env.ATLAS_FILM_VIDEO !== "0") {
    vid = await recordPass(sc, slug);
    if (vid.errors.length) { log("console errors (recording pass):\n  " + vid.errors.join("\n  ")); F(`${vid.errors.length} console error(s) while recording`); }
    if (lastForm && vid.lastForm) {
      const a = JSON.parse(lastForm);
      log(`recorder    the app painted ${a.frames} frames measuring and ${vid.lastForm.frames} while recording — recordVideo costs ${f1(100 - (100 * vid.lastForm.frames) / Math.max(1, a.frames))}% of the frame rate, which is why these are two passes`);
    }
  }

  log(`wrote       ${vid && vid.path ? vid.path : "(no video — ATLAS_FILM_VIDEO=0)"}`);
  log(`            ${join(FILMS, slug + "-strip.png")}`);
  log(`            ${join(FILMS, slug + ".json")}`);
  if (errors.length) { log("console errors:\n  " + errors.join("\n  ")); F(`${errors.length} console error(s)`); }
  else log("console     clean");
  log(ok ? `\nFILM PASS — ${sc.label}\n` : `\nFILM FAIL — ${sc.label}\n`);
  return ok;
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
else if (cmd === "film") {
  if (args[0] === "all") {
    /* The three the project cannot afford to get wrong: the flight in, the
       flight back, and the one thing on screen that moves on its own. */
    let all = true;
    for (const s of ["reform", "return", "meteor"]) all = (await cmdFilm(s, args[1])) && all;
    log(all ? "ALL FILMS PASS" : "ALL FILMS: at least one FAIL");
  } else await cmdFilm(args[0], args[1], args[2]);
} else {
  console.error("usage: driver.mjs smoke | shot <route> [name] | eval <js> | repl\n" +
    "       driver.mjs film <scene> [world] [name]\n" +
    "         scenes: reform | return | meteor | worlds | still | pulse | drift | flicker | all");
  process.exit(2);
}
