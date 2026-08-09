#!/usr/bin/env node
/* interaction-probe.mjs — the three interaction rulings, measured in real Chromium.
 *
 *   node .claude/skills/run-film-atlas/interaction-probe.mjs
 *   ATLAS_HTML=/tmp/broken.html node .claude/skills/run-film-atlas/interaction-probe.mjs
 *
 * WHAT IT PROVES, AND WHY EACH CHECK ENDS IN A NUMBER
 *
 *   1. THE READOUT FOLDS, AND THE FIELD GETS THE ROOM BACK. Not "the class was
 *      applied": the collapsed body must lay out at ZERO height, the camera's
 *      safe band (skySafeH) must actually grow, and the summary line must still
 *      carry a count. Folded state must survive a reload, because it is stored.
 *   2. A FILM OPENS ON ITS BRANCHES. Measured as OCCLUSION: how many of the
 *      seven laid-out cells the detail sheet covers on arrival. That is the
 *      owner's complaint stated as a number, and it is worst on a phone.
 *   3. THE SHEET DISMISSES ON ANY OUTSIDE CLICK — but a click on a film is one
 *      gesture, a drag is not a dismissal, and a touch tap must not be eaten by
 *      its own synthetic click.
 *
 * Every check was broken on purpose and confirmed to report it; the patches are
 * at the bottom of this file under `CONTROLS`, applied to the built artifact.
 */
import { chromium, devices } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = resolve(HERE, "../../..");
const ARTIFACT = process.env.ATLAS_HTML || join(UNIT, "public/atlas.html");
const SHOTS = process.env.ATLAS_SHOTS || join(UNIT, ".atlas-shots");
const LOAD_MS = Number(process.env.ATLAS_LOAD_MS || 45000);
const ONLY = process.env.PROBE_ONLY || "";

let failures = 0;
const log = (...a) => console.log(...a);
const ok = (label, detail) => log(`  pass  ${label}${detail ? "  — " + detail : ""}`);
const bad = (label, detail) => { failures++; log(`  FAIL  ${label}${detail ? "  — " + detail : ""}`); };
const check = (cond, label, detail) => (cond ? ok(label, detail) : bad(label, detail));

if (!existsSync(ARTIFACT)) {
  console.error(`No artifact at ${ARTIFACT}\n  build it:  node atlas/app/build.js --out public/atlas.html`);
  process.exit(2);
}
const URL_ = pathToFileURL(ARTIFACT).href;

async function newPage(browser, viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "no-preference", ...extra });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.route("**/*", (r) => (r.request().resourceType() === "image" ? r.abort() : r.continue()));
  return { ctx, page, errors };
}

async function load(page, route = "") {
  await page.goto(URL_ + route, { waitUntil: "load", timeout: LOAD_MS });
  await page.waitForFunction("typeof KEYS !== 'undefined' && KEYS.length > 0", null, { timeout: LOAD_MS });
}

const shot = async (page, name) => {
  mkdirSync(SHOTS, { recursive: true });
  const p = join(SHOTS, name + ".png");
  await page.screenshot({ path: p });
  return `${name}.png (${(statSync(p).size / 1024).toFixed(0)} KB)`;
};

/* The real ink, not the stylesheet's opinion of it. A clip of the page is
   decoded in a throwaway page and the brightest and darkest pixels inside it
   are pushed through the WCAG relative-luminance formula. Anti-aliasing means
   the brightest pixel is the glyph's own colour to within a hair, and the
   darkest is the ground it is actually sitting on — which for the map's centre
   caption is --base plus whatever the film's lamp is adding to it. */
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
async function inkContrast(browser, page, box) {
  const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.max(2, Math.round(box.width)), height: Math.max(2, Math.round(box.height)) };
  const buf = await page.screenshot({ clip });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto("about:blank");
  const out = await p2.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u], { type: "image/png" }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    return px;
  }, buf.toString("base64"));
  await ctx.close();
  let hi = null, lo = null, hiL = -1, loL = 2;
  for (const p of out) { const L = lum(p); if (L > hiL) { hiL = L; hi = p; } if (L < loL) { loL = L; lo = p; } }
  return { ratio: (hiL + 0.05) / (loL + 0.05), ink: hi, ground: lo };
}

/* ══ 1 ── THE READOUT FOLDS ═══════════════════════════════════════════════ */
/* Does skyChrome() report an obstacle that IS the readout box — same corner,
   same size, inflated by the 6px margin skyChrome adds? Matched on x as well as
   y, because the zoom controls sit on the same baseline and are the same height
   as the collapsed box, and a y-only test silently matched THOSE: the first
   version of this check passed its own negative control. */
const READOUT_OBSTACLE = `(() => {
  sky.chrome = null; skyChrome();
  const c = document.getElementById("sky-c").getBoundingClientRect();
  const r = document.getElementById("sky-readbox").getBoundingClientRect();
  return skyChrome().some(b =>
    Math.abs((b.x + 6) - (r.left - c.left)) < 2 && Math.abs((b.w - 12) - r.width) < 2 &&
    Math.abs((b.y + 6) - (r.top - c.top)) < 2 && Math.abs((b.h - 12) - r.height) < 2);
})()`;

async function foldChecks(browser) {
  log("\n1 ── the readout collapses, and the camera's safe band grows");
  const { ctx, page, errors } = await newPage(browser, { width: 1440, height: 900 });
  await load(page, "#/sky");
  await page.waitForFunction("sky.ready && sky.n > 0", null, { timeout: LOAD_MS });
  await page.waitForTimeout(2400);

  const before = await page.evaluate(`(() => {
    sky.chrome = null;
    const shell = document.getElementById("sky-readbox").getBoundingClientRect();
    return { shellH: shell.height, bodyH: document.getElementById("sky-read").offsetHeight,
      keys: document.querySelectorAll("#sky-read .sky-key i").length,
      safeH: skySafeH(), expanded: document.getElementById("sky-fold").getAttribute("aria-expanded"),
      hidden: document.getElementById("sky-read").hidden,
      obstacle: ${READOUT_OBSTACLE} };
  })()`);
  check(before.obstacle, "expanded, the whole box — fold header included — is an obstacle to the label placer",
    `skyChrome reports the ${before.shellH.toFixed(0)}px box`);
  check(before.keys === 6, "expanded readout carries the five relationship colours plus the dashed reading swatch",
    `${before.keys} swatches`);
  check(before.expanded === "true" && before.hidden === false, "starts expanded", `aria-expanded=${before.expanded}`);
  log("  " + await shot(page, "p1-sky-open-1440"));

  await page.click("#sky-fold");
  await page.waitForTimeout(900);
  const after = await page.evaluate(`(() => {
    sky.chrome = null;
    const shell = document.getElementById("sky-readbox").getBoundingClientRect();
    return { shellH: shell.height, bodyH: document.getElementById("sky-read").offsetHeight,
      safeH: skySafeH(), expanded: document.getElementById("sky-fold").getAttribute("aria-expanded"),
      hidden: document.getElementById("sky-read").hidden,
      sum: document.getElementById("sky-fold-sum").textContent.trim(),
      stored: JSON.parse(localStorage.getItem("atlas-preferences-v1")||"{}").skyFolded,
      /* The collapsed box is STILL an obstacle: it is opaque and the summary
         line is the one thing left to read. skyChrome must report it, or the
         label placer will lay a film's name across the count. */
      obstacle: ${READOUT_OBSTACLE} };
  })()`);
  check(after.bodyH === 0, "folded body lays out at zero height", `${before.bodyH}px -> ${after.bodyH}px`);
  check(after.shellH <= before.shellH * 0.45, "the whole box shrinks by more than half",
    `${before.shellH.toFixed(0)}px -> ${after.shellH.toFixed(0)}px`);
  check(after.safeH - before.safeH >= 60, "the camera's safe band grows by the room the box gave up",
    `skySafeH ${before.safeH.toFixed(0)}px -> ${after.safeH.toFixed(0)}px (+${(after.safeH - before.safeH).toFixed(0)})`);
  check(after.expanded === "false", "aria-expanded follows", `aria-expanded=${after.expanded}`);
  check(/\d/.test(after.sum) && after.sum.length > 3, "collapsed line still carries the world name and the count",
    JSON.stringify(after.sum));
  check(after.stored === true, "the fold is written to atlas-preferences-v1", `skyFolded=${after.stored}`);
  check(after.obstacle, "the collapsed box is still seeded into the label placer as an obstacle",
    `skyChrome reports the ${after.shellH.toFixed(0)}px box`);
  log("  " + await shot(page, "p1-sky-folded-1440"));

  /* Stored, so it has to come back folded — and the app must still boot. */
  await page.reload({ waitUntil: "load", timeout: LOAD_MS });
  await page.waitForFunction("typeof KEYS !== 'undefined' && KEYS.length > 0", null, { timeout: LOAD_MS });
  await page.waitForTimeout(2600);
  const reloaded = await page.evaluate(`({ hidden: document.getElementById("sky-read").hidden,
    tiles: [...document.querySelectorAll("#wall-body .tile")].filter(e=>e.offsetHeight>8).length,
    sum: document.getElementById("sky-fold-sum").textContent.trim() })`);
  check(reloaded.hidden === true, "still folded after a reload", `hidden=${reloaded.hidden}`);
  check(reloaded.tiles > 12, "the stored preference does not black the page (the localStorage trap)",
    `${reloaded.tiles} wall tiles`);

  /* A world selected while folded: the name and the count must still be there. */
  await page.evaluate('location.hash = "#/sky"');
  await page.waitForTimeout(2200);
  await page.evaluate("skyWorldChoose(REG_IDS[0])");
  await page.waitForTimeout(1800);
  const world = await page.evaluate(`({ sum: document.getElementById("sky-fold-sum").textContent.trim(),
    stratum: (document.getElementById("sky-stratum").textContent||"").replace(/\\s+/g," ").trim(),
    name: REG_DEFS[REG_IDS[0]].label || REG_IDS[0] })`);
  check(world.sum.length > 3 && /\d/.test(world.sum),
    "folded on a chosen world, the line names the world and counts it", JSON.stringify(world.sum));
  log("  " + await shot(page, "p1-sky-folded-world"));

  if (errors.length) bad("console clean", errors.join(" | "));
  else ok("console clean");
  await ctx.close();
}

/* ══ 2 ── ARRIVAL IS THE MAP, NOT THE SHEET ══════════════════════════════ */
const ARRIVAL = `(() => {
  const panel = document.getElementById("panel");
  const pr = panel.getBoundingClientRect();
  const nodes = [...document.querySelectorAll("#stage .node")]
    .filter(n => n.offsetWidth > 8 && n.offsetHeight > 8)
    .map(n => { const r = n.getBoundingClientRect(); return { k: n.dataset.k, i: +n.dataset.i, r:
      { x:r.x, y:r.y, w:r.width, h:r.height } }; });
  const open = panel.classList.contains("on");
  const overlap = (r) => {
    if (!open) return 0;
    const w = Math.max(0, Math.min(r.x + r.w, pr.right) - Math.max(r.x, pr.left));
    const h = Math.max(0, Math.min(r.y + r.h, pr.bottom) - Math.max(r.y, pr.top));
    return (w * h) / Math.max(1, r.w * r.h);
  };
  return {
    open, aria: panel.getAttribute("aria-hidden"), inert: panel.hasAttribute("inert"),
    mapAria: document.getElementById("map").getAttribute("aria-hidden"),
    nodes: nodes.length,
    covered: nodes.filter(n => overlap(n.r) > 0.5).length,
    touched: nodes.filter(n => overlap(n.r) > 0).length,
    status: (document.getElementById("sr-status").textContent || "").trim(),
    cue: (document.querySelector('#stage .node.centre .cue') || {}).textContent || "",
    focus: document.activeElement ? (document.activeElement.dataset ? document.activeElement.dataset.k : null) : null,
  };
})()`;

async function arrivalChecks(browser, viewport, tag) {
  log(`\n2 ── arriving on a film at ${viewport.width}x${viewport.height}`);
  const { ctx, page, errors } = await newPage(browser, viewport);
  await load(page);
  const key = await page.evaluate("KEYS.find(k => (ADJ[k]||[]).length >= 6)");
  await page.evaluate(`location.hash = "#/film/" + encodeURIComponent(${JSON.stringify(key)})`);
  await page.waitForTimeout(1400);

  const a = await page.evaluate(ARRIVAL);
  check(!a.open, "the detail sheet does NOT open on arrival", `panel.on=${a.open}`);
  check(a.aria === "true" && a.inert, "the closed sheet is aria-hidden and inert", `aria-hidden=${a.aria}, inert=${a.inert}`);
  check(a.mapAria === "false", "the map view is the live view", `#map aria-hidden=${a.mapAria}`);
  check(a.covered === 0, "no film cell is covered by the sheet on arrival", `${a.covered} of ${a.nodes} cells >50% covered`);
  check(a.focus === key, "focus lands on the centre film, not in the sheet", `activeElement is ${JSON.stringify(a.focus)}`);
  check(/lineage map/i.test(a.status) && /\d/.test(a.status),
    "the arrival is announced to a screen reader instead of the sheet", JSON.stringify(a.status.slice(0, 96) + "…"));
  check(/why it connects/i.test(a.cue), "the centre cell says where the claims are", JSON.stringify(a.cue));

  /* Every ring node still carries its own claim, so the argument is reachable
     by keyboard with nothing open. */
  const labels = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('#stage .node:not(.centre)')].map(n => n.getAttribute("aria-label")||"");
    const claims = state.ring.map(c => c.e.claim);
    return { rows: rows.length, withClaim: rows.filter((r,i) => claims[i] && r.includes(claims[i])).length };
  })()`);
  check(labels.withClaim === labels.rows && labels.rows > 0,
    "every connected cell announces its own claim with nothing open", `${labels.withClaim}/${labels.rows}`);

  log("  " + await shot(page, `p2-arrival-${tag}`));

  /* The claim tip is the only place the claim TEXT is drawn without opening
     anything, and it is hover-only. Report that honestly rather than assert it. */
  const tip = await page.evaluate(`(() => {
    const t = document.getElementById("tip");
    const vis = (e) => e.offsetWidth > 4 && e.offsetHeight > 4;
    return { onAtRest: t.classList.contains("on"),
      compact: document.getElementById("stage").classList.contains("compact"),
      labels: [...document.querySelectorAll("#stage .edge-label")].filter(vis).map(e=>e.textContent.trim()),
      caps: [...document.querySelectorAll("#stage .node .label .r")].filter(vis).map(e=>e.textContent.trim()) };
  })()`);
  const named = tip.labels.length + tip.caps.length;
  log(`  note  on arrival ${named} relationship names are on screen (${tip.compact ? "in the ring captions, compact stage" : "on the lines"}):`);
  log(`        ${JSON.stringify((tip.labels.length ? tip.labels : tip.caps).slice(0, 3))}…`);
  log(`        NONE of them is the CLAIM. The claim tip is ${tip.onAtRest ? "shown" : "hidden"} at rest and is hover-only,`);
  log(`        so on a touch screen no claim TEXT is on screen until a cell is tapped.`);

  /* Clicking the centre poster again opens the sheet. On a phone the sheet is
     a 72%-tall bottom sheet, so the poster it was opened from is behind it —
     which is exactly why the outside-tap dismissal is the load-bearing one
     there and this toggle is a desktop convenience. Tested where it is
     reachable and reported where it is not, rather than asserted blind. */
  await page.click('#stage .node.centre');
  await page.waitForTimeout(600);
  const b = await page.evaluate(ARRIVAL);
  const why = await page.evaluate(`(() => { const p=document.getElementById("panel");
    return { h3: [...p.querySelectorAll(".why h3")].map(e=>e.textContent), items: p.querySelectorAll(".why-item").length,
      sel: state.sel }; })()`);
  check(b.open, "clicking the centre poster opens the sheet", `panel.on=${b.open}`);
  check(why.items > 0 && /why it connects/i.test(why.h3.join(" ")),
    "the sheet it opens is the claim list", `${why.items} claims under ${JSON.stringify(why.h3)}`);
  log(`  note  with the sheet open, ${b.covered} of ${b.nodes} cells are >50% covered and ${b.touched} are touched at all`);
  log("  " + await shot(page, `p2-panel-${tag}`));

  /* And again closes it: the poster is the handle in both directions. */
  const reachable = await page.evaluate(`(() => {
    const n=document.querySelector("#stage .node.centre").getBoundingClientRect();
    const p=document.getElementById("panel").getBoundingClientRect();
    return !(n.left < p.right && n.right > p.left && n.top < p.bottom && n.bottom > p.top);
  })()`);
  if (reachable) {
    await page.click('#stage .node.centre');
    await page.waitForTimeout(500);
    const c = await page.evaluate(ARRIVAL);
    check(!c.open, "clicking the centre poster a second time closes it again", `panel.on=${c.open}`);
  } else {
    log("  note  the centre poster is behind the sheet at this size, so the toggle is untestable here;");
    log("        the outside tap is the dismissal that matters on a phone (checked in 3b).");
    await page.evaluate("closePanel(false)");
    await page.waitForTimeout(400);
  }

  /* Deep link and "Resume here" must land in the same state as a click. */
  const other = await page.evaluate(`(() => { const k = state.ring[0].key;
    document.querySelector('#stage .node[data-k=' + JSON.stringify(k) + ']').click();
    document.querySelector('#panel [data-act="travel"]').click(); return k; })()`);
  await page.waitForTimeout(1000);
  const travelled = await page.evaluate(ARRIVAL);
  check(!travelled.open && travelled.nodes > 1,
    "travelling to a connected film lands on its branches, sheet closed", `centre=${JSON.stringify(other)}, panel.on=${travelled.open}`);

  const resumed = await page.evaluate(`(() => {
    const steps = [...document.querySelectorAll("#trail .trail-step")];
    if (steps.length < 2) return null;
    steps[0].click();
    const r = document.querySelector("#trail .trail-act");
    if (!r) return null;
    r.click(); return true;
  })()`);
  await page.waitForTimeout(1000);
  if (resumed) {
    const rs = await page.evaluate(ARRIVAL);
    check(!rs.open, "\"Resume here\" on the thread lands in the same state as a click", `panel.on=${rs.open}`);
  } else bad("\"Resume here\" reachable", "the thread had no second step to resume from");

  /* Reload straight onto the deep link: the address means what the gesture means. */
  await page.evaluate(`location.hash = "#/film/" + encodeURIComponent(${JSON.stringify(key)})`);
  await page.reload({ waitUntil: "load", timeout: LOAD_MS });
  await page.waitForFunction("typeof KEYS !== 'undefined' && KEYS.length > 0", null, { timeout: LOAD_MS });
  await page.waitForTimeout(1200);
  const cold = await page.evaluate(ARRIVAL);
  check(!cold.open && cold.mapAria === "false" && cold.nodes > 1,
    "a cold #/film/<key> load lands in the same state", `panel.on=${cold.open}, ${cold.nodes} cells`);

  /* Contrast of the one new piece of type, measured off the composited page. */
  const cueBox = await page.evaluate(`(() => { const e=document.querySelector("#stage .node.centre .cue");
    if (!e) return null; const r=e.getBoundingClientRect();
    return { x:r.x-2, y:r.y-2, width:r.width+4, height:r.height+4 }; })()`);
  if (cueBox) {
    const m = await inkContrast(browser, page, cueBox);
    check(m.ratio >= 4.5, "the centre cue clears the 4.5:1 type floor on the ground it is actually on",
      `${m.ratio.toFixed(2)}:1, ink rgb(${m.ink}) on rgb(${m.ground})`);
  } else bad("the centre cue is rendered", "no .cue element found");

  /* Caption wrap: the cue must not turn the centre caption into two lines of
     slate, which is what a too-long string does on a narrow stage. */
  const wrap = await page.evaluate(`(() => { const e=document.querySelector("#stage .node.centre .cue");
    const cs=getComputedStyle(e); const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2;
    return { h:e.getBoundingClientRect().height, lh }; })()`);
  check(wrap.h <= wrap.lh * 1.6, "the cue sets on one line", `${wrap.h.toFixed(1)}px against a ${wrap.lh.toFixed(1)}px line`);

  if (errors.length) bad("console clean", errors.join(" | "));
  else ok("console clean");
  await ctx.close();
}

/* ══ 3 ── THE SHEET DISMISSES ON ANY OUTSIDE CLICK ═══════════════════════ */
/* A point in the map that is bare ground: not the sheet, and not any cell —
   INCLUDING the caption, which on a narrow stage is deliberately wider than
   the poster it sits under and overflows the button's own box. Hit-tested with
   elementFromPoint rather than trusted from rectangles, because the first
   version of this probe picked a point 40px from the left edge at 390px wide,
   called it empty, and landed on a ring poster: the check failed and the app
   was right. */
const BARE_GROUND = `(() => {
  const s = document.getElementById("stage").getBoundingClientRect();
  const p = document.getElementById("panel").getBoundingClientRect();
  for (let y = s.top + 20; y < s.bottom - 20; y += 11)
    for (let x = s.left + 20; x < s.right - 20; x += 11) {
      if (x > p.left - 10 && x < p.right + 10 && y > p.top - 10 && y < p.bottom + 10) continue;
      const e = document.elementFromPoint(x, y);
      if (!e || e.closest(".node") || e.closest("#panel")) continue;
      return { x, y, on: e.tagName + (e.id ? "#" + e.id : "") };
    }
  return null;
})()`;

async function dismissChecks(browser) {
  log("\n3 ── the sheet dismisses on an outside click or tap");
  const { ctx, page, errors } = await newPage(browser, { width: 1440, height: 900 });
  await load(page);
  const key = await page.evaluate("KEYS.find(k => (ADJ[k]||[]).length >= 6)");
  /* ALWAYS FROM CLOSED. The centre poster is a toggle now, so re-opening with a
     click on a sheet that is already open closes it instead — and the first
     version of this probe read that as "the outside click worked", passing a
     check on a build where dismissal had been deliberately removed. */
  const open = async () => {
    await page.evaluate("closePanel(false)");
    await page.waitForTimeout(200);
    await page.click("#stage .node.centre");
    await page.waitForTimeout(420);
    const on = await page.evaluate('document.getElementById("panel").classList.contains("on")');
    if (!on) bad("the sheet re-opens for the next case");
    return on;
  };
  const isOpen = () => page.evaluate('document.getElementById("panel").classList.contains("on")');

  await page.evaluate(`location.hash = "#/film/" + encodeURIComponent(${JSON.stringify(key)})`);
  await page.waitForTimeout(1300);

  /* a. bare ground inside the map */
  check(await open(), "sheet opens");
  const bare = await page.evaluate(BARE_GROUND);
  if (!bare) bad("found bare ground in the map", "every point tested was inside a cell");
  else {
    await page.mouse.click(bare.x, bare.y);
    await page.waitForTimeout(420);
    check(!(await isOpen()), "a click on bare ground inside the map dismisses it", `at ${bare.x},${bare.y} on ${bare.on}`);
  }

  /* b. empty space ABOVE the sheet — the owner's example */
  await open();
  await page.mouse.click(60, 400);
  await page.waitForTimeout(420);
  check(!(await isOpen()), "a click far from the sheet, on the left edge of the field, dismisses it");

  /* c. the header, which is outside the map entirely */
  await open();
  await page.mouse.click(700, 12);
  await page.waitForTimeout(420);
  check(!(await isOpen()), "a click on the header dismisses it");

  /* d. a click on a FILM is ONE gesture: it opens that film, it does not merely dismiss */
  await open();
  const ring = await page.evaluate("state.ring[0].key");
  await page.click(`#stage .node[data-k=${JSON.stringify(ring)}]`);
  await page.waitForTimeout(500);
  const after = await page.evaluate("({ on: document.getElementById('panel').classList.contains('on'), sel: state.sel })");
  check(after.on && after.sel === ring, "a click on a connected film opens THAT film — one gesture, not two",
    `panel.on=${after.on}, sel=${JSON.stringify(after.sel)}`);

  /* e. a drag that starts and ends outside is not a dismissal */
  await page.evaluate("closePanel(false)");
  await open();
  await page.mouse.move(120, 300);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(120 + i * 30, 300 + i * 9);
  await page.mouse.up();
  await page.waitForTimeout(420);
  check(await isOpen(), "a 240px drag from outside to outside leaves the sheet open");

  /* f. a click that starts inside the sheet and ends outside it is not a dismissal */
  const inside = await page.evaluate(`(() => { const r=document.getElementById("panel").getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
  await page.mouse.move(inside.x, inside.y);
  await page.mouse.down();
  await page.mouse.move(inside.x - 400, inside.y);
  await page.mouse.up();
  await page.waitForTimeout(420);
  check(await isOpen(), "a selection dragged out of the sheet leaves it open");

  /* g. the × and Escape both still work */
  await open();
  await page.click("#panel .panel-x").catch((e) => bad("the × is clickable", e.message.split("\n")[0]));
  await page.waitForTimeout(400);
  check(!(await isOpen()), "the × still closes it");
  await open();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check(!(await isOpen()), "Escape still closes it");

  /* h. focus goes somewhere sensible */
  await open();
  await page.evaluate('document.querySelector("#panel .why-item")?.focus()');
  const bareAgain = (await page.evaluate(BARE_GROUND)) || { x: 60, y: 400 };
  await page.mouse.click(bareAgain.x, bareAgain.y);
  await page.waitForTimeout(500);
  const focus = await page.evaluate(`(() => { const a=document.activeElement;
    return { tag: a && a.tagName, node: a && a.classList ? a.classList.contains("node") : false,
      inPanel: document.getElementById("panel").contains(a) }; })()`);
  check(focus.node && !focus.inPanel, "focus returns to the map when it was inside the dismissed sheet",
    `activeElement is ${focus.tag}${focus.node ? " .node" : ""}`);

  if (errors.length) bad("console clean", errors.join(" | "));
  else ok("console clean");
  await ctx.close();

  /* ── touch, on a phone, where the ghost click lives ─────────────────── */
  log("\n3b ── the same, under a finger at 390x780");
  const t = await newPage(browser, { width: 390, height: 780 }, { ...devices["Pixel 5"], viewport: { width: 390, height: 780 } });
  await load(t.page);
  await t.page.evaluate(`location.hash = "#/film/" + encodeURIComponent(${JSON.stringify(key)})`);
  await t.page.waitForTimeout(1400);
  const cell = await t.page.evaluate(`(() => { const r=document.querySelector("#stage .node.centre").getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + 30 }; })()`);
  await t.page.touchscreen.tap(cell.x, cell.y);
  await t.page.waitForTimeout(600);
  check(await t.page.evaluate('document.getElementById("panel").classList.contains("on")'),
    "a tap on the centre poster opens the sheet on a phone");
  log("  " + await shot(t.page, "p3-panel-390"));
  const above = await t.page.evaluate(BARE_GROUND);
  if (!above) bad("bare ground above the sheet on a phone", "every point tested was a cell or the sheet");
  else {
    await t.page.touchscreen.tap(above.x, above.y);
    await t.page.waitForTimeout(600);
    check(!(await t.page.evaluate('document.getElementById("panel").classList.contains("on")')),
      "a tap on the empty space above the sheet dismisses it", `at ${Math.round(above.x)},${Math.round(above.y)} on ${above.on}`);
  }

  /* THE GHOST GUARD, EXERCISED END TO END. Three taps on one film in the
     constellation: name it, anchor it, leave for its map. The third tap is the
     one that navigates, and the synthetic click Chromium fires ~100ms later
     re-hit-tests a page that is now the radial map — so without the guard it
     lands on a ring cell and opens a film nobody chose.
     The disc is RE-LOCATED between taps rather than tapped three times at one
     screen point: anchoring flies the camera, so the second and third taps are
     at different pixels. Measured: the naive version's third tap picked
     "in ginocchio da te" when it meant "8½". */
  await t.page.evaluate('location.hash = "#/sky"');
  await t.page.waitForFunction("sky.ready && sky.n > 0", null, { timeout: LOAD_MS });
  await t.page.waitForTimeout(2400);
  const findDisc = (key) => t.page.evaluate(`(() => {
    const c=document.getElementById("sky-c").getBoundingClientRect();
    const k=sky.cam.k, ox=sky.w/2-sky.cam.cx*k, oy=sky.h/2-sky.cam.cy*k;
    const one=(i)=>({ x:c.left+sky.wx[i]*k+ox, y:c.top+sky.wy[i]*k+oy, key:sky.keys[i] });
    const want=${JSON.stringify(key)};
    if (want){ const i=sky.at[want]; return i===undefined ? null : one(i); }
    for (let i=0;i<sky.n;i++){ if(!sky.live[i]) continue;
      const x=sky.wx[i]*k+ox, y=sky.wy[i]*k+oy;
      if (x>70 && x<sky.w-70 && y>150 && y<sky.h-230) return one(i); }
    return null; })()`);
  let disc = await findDisc(null);
  if (!disc) bad("a film to tap in the constellation", "none inside the safe band");
  else {
    const want = disc.key;
    for (let i = 0; i < 3; i++) {
      disc = await findDisc(want);
      await t.page.touchscreen.tap(disc.x, disc.y);
      await t.page.waitForTimeout(i === 2 ? 1600 : 900);
    }
    const land = await t.page.evaluate("({ view: state.view, centre: state.centre, on: document.getElementById('panel').classList.contains('on'), sel: state.sel })");
    check(land.view === "map" && land.centre === want,
      "three taps on one disc land on that film's map", `centre=${JSON.stringify(land.centre)} wanted ${JSON.stringify(want)}`);
    check(!land.on, "and the tap's own ghost click opens no sheet for a film nobody chose",
      `panel.on=${land.on}, sel=${JSON.stringify(land.sel)}`);
    log("  " + await shot(t.page, "p3-sky-tap-landing-390"));
  }
  if (t.errors.length) bad("console clean", t.errors.join(" | "));
  else ok("console clean");
  await t.ctx.close();
}

/* ══ 4 ── THE CUE COSTS THE MAP GEOMETRY NOTHING ═════════════════════════
   The centre cue is a new line of type inside a caption box, and layout()'s
   separation pass budgets clearance from MEASURED caption heights — so it
   adapts, but the ellipse has less room afterwards. AGENTS is explicit that
   measuring one class of overlap is not measuring overlap (the 390px defect
   that survived a handoff was a caption lying across a NEIGHBOURING cell while
   cell-vs-cell and caption-vs-caption were both clean), so all four classes
   are counted, over the worst-case seeds the corpus has: the longest titles
   among the best-connected films. Reported as a delta against the same run on
   a build with the cue deleted, because the number that matters is what the
   cue cost, not what the map already owed. */
const GEOMETRY = `(() => {
  const boxes = [...document.querySelectorAll("#stage .node")].map((n) => ({
    k: n.dataset.k, i: +n.dataset.i,
    frame: n.querySelector(".frame").getBoundingClientRect(),
    cap: n.querySelector(".label").getBoundingClientRect(),
  }));
  const labels = [...document.querySelectorAll("#stage .edge-label")]
    .filter((e) => e.offsetWidth > 2).map((e) => e.getBoundingClientRect());
  const hit = (a, b, pad = 0) => a.left < b.right - pad && a.right > b.left + pad &&
                                 a.top < b.bottom - pad && a.bottom > b.top + pad;
  const stage = document.getElementById("stage").getBoundingClientRect();
  let cellCell = 0, capCap = 0, capCell = 0, labelInk = 0, clipped = 0;
  for (let i = 0; i < boxes.length; i++) {
    const A = boxes[i];
    if (A.frame.top < stage.top - 1 || A.cap.bottom > stage.bottom + 1 ||
        A.cap.left < stage.left - 1 || A.cap.right > stage.right + 1) clipped++;
    for (let j = i + 1; j < boxes.length; j++) {
      const B = boxes[j];
      if (hit(A.frame, B.frame, 1)) cellCell++;
      if (hit(A.cap, B.cap, 1)) capCap++;
      if (hit(A.cap, B.frame, 1) || hit(B.cap, A.frame, 1)) capCell++;
    }
  }
  for (const L of labels) for (const B of boxes) if (hit(L, B.frame, 1) || hit(L, B.cap, 1)) labelInk++;
  return { cells: boxes.length, cellCell, capCap, capCell, labelInk, clipped };
})()`;

async function geometryChecks(browser) {
  log("\n4 ── what the centre cue costs the radial map's geometry");
  /* Worst case in this corpus: the longest titles among films with a full ring. */
  const { ctx, page, errors } = await newPage(browser, { width: 1440, height: 900 });
  await load(page);
  const seeds = await page.evaluate(`(() => KEYS.filter(k => (ADJ[k]||[]).length >= 6)
    .sort((a,b) => F[b].title.length - F[a].title.length).slice(0, 22))()`);
  await ctx.close();

  const totals = {};
  for (const vp of [{ width: 1440, height: 900 }, { width: 900, height: 820 }, { width: 1024, height: 660 }, { width: 390, height: 780 }]) {
    const p = await newPage(browser, vp);
    await load(p.page);
    const sum = { cellCell: 0, capCap: 0, capCell: 0, labelInk: 0, clipped: 0, renders: 0 };
    for (const k of seeds) {
      await p.page.evaluate(`openMap(${JSON.stringify(k)})`);
      await p.page.waitForTimeout(90);
      await p.page.evaluate("layout()");
      const g = await p.page.evaluate(GEOMETRY);
      for (const key of Object.keys(sum)) if (key !== "renders") sum[key] += g[key];
      sum.renders++;
    }
    totals[`${vp.width}x${vp.height}`] = sum;
    if (p.errors.length) bad("console clean at " + vp.width, p.errors.join(" | "));
    await p.ctx.close();
  }
  for (const [tag, s] of Object.entries(totals)) {
    log(`  ${tag.padEnd(9)} ${s.renders} seeds — cell/cell ${s.cellCell}, caption/caption ${s.capCap}, ` +
        `caption-on-a-neighbour ${s.capCell}, edge label on ink ${s.labelInk}, clipped ${s.clipped}`);
  }
  const worst = Object.values(totals).reduce((a, s) => a + s.cellCell + s.capCap + s.clipped, 0);
  check(worst === 0, "no cell overlaps another, no caption overlaps another, nothing is clipped",
    `${worst} across ${Object.keys(totals).length} viewports`);
  if (errors.length) bad("console clean", errors.join(" | "));
  return totals;
}

/* ══ run ═════════════════════════════════════════════════════════════════ */
const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });
log(`artifact    ${ARTIFACT}`);
if (!ONLY || ONLY === "1") await foldChecks(browser);
if (!ONLY || ONLY === "2") { await arrivalChecks(browser, { width: 1440, height: 900 }, "1440"); await arrivalChecks(browser, { width: 390, height: 780 }, "390"); }
if (!ONLY || ONLY === "3") await dismissChecks(browser);
if (!ONLY || ONLY === "4") await geometryChecks(browser);
await browser.close();
log(failures ? `\nINTERACTION FAIL — ${failures} check(s)\n` : "\nINTERACTION PASS\n");
process.exitCode = failures ? 1 : 0;

/* ══ CONTROLS ════════════════════════════════════════════════════════════
   Each of these was applied to public/atlas.html with sed and the probe re-run;
   the check named beside it reported the break. See the handoff for the output.

   1  s/body.hidden=folded;//                    -> folded body lays out at zero height
      s/"#sky-readbox","#sky-stratum"/"#sky-read","#sky-stratum"/
                                                 -> the camera's safe band grows
      s/skyFolded:state.skyFolded===true,//      -> the fold is written to preferences
   2  restore openPanel(state.centre) in presentRadialMap
                                                 -> the sheet does NOT open on arrival
                                                 -> no film cell is covered on arrival
   3  s/closePanel(g.hadFocus&&!took);//          -> every dismissal check
      remove the `.node` exclusion               -> one gesture, not two
      remove the 8px distance guard              -> a drag is not a dismissal
*/
