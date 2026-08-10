#!/usr/bin/env node
/* search-probe.mjs — ASK THE TYPED SEARCH, IN REAL CHROMIUM, WHAT IT DREW.
 *
 *   node .claude/skills/run-film-atlas/search-probe.mjs
 *   node .claude/skills/run-film-atlas/search-probe.mjs --controls   # break every check on purpose
 *   ATLAS_HTML=/tmp/other.html node .claude/skills/run-film-atlas/search-probe.mjs
 *
 * WHY THIS EXISTS ALONGSIDE find-probe.mjs.
 * find-probe.mjs proves the ENGINE: it runs query-runtime.js in Node, and where
 * it does look at the page it reads the layout's own arrays — sky.wx/sky.wy —
 * back out of it. That is the model marking its own homework: if the layout
 * module and the draw loop disagree, sky.wx says the picture is right and the
 * reader still sees the wrong sky. This probe never reads a position out of the
 * layout. It instruments the 2D context, takes the centre of every disc the
 * page ACTUALLY DREW, fits the constellation's centre to the drawn cloud, and
 * samples the composited canvas to prove there is ink at those coordinates.
 * Every number below therefore comes off the canvas, and the only thing the
 * page's own data is used for is LABELLING a drawn disc with the film it
 * belongs to — an identity, never a position and never a radius.
 *
 * WHAT IT PROVES, AND EVERY CHECK ENDS IN A NUMBER
 *
 *   1. A QUERY NEVER EMPTIES THE WORLD. Live films after every sentence in the
 *      battery, including one made of invented words, against the corpus count
 *      — and, for a drawn reading, the count of discs and the ink measured in
 *      the outermost fifth of the disc, so "the rim is populated" is a pixel
 *      measurement and not a claim about an array.
 *   2. RULE 1 — RADIUS IS A FUNCTION OF MATCH STRENGTH AND OF NOTHING ELSE.
 *      Spearman(drawn radius, score) reported beside Spearman(drawn radius,
 *      60-day pageviews) and Spearman(drawn radius, graph degree). Rule 1 fails
 *      if fame or degree explains the layout. Two sharper forms as well: the
 *      spread of drawn radius INSIDE a group of films tied at one score — a
 *      pure function has none — and the fame/degree correlation inside that
 *      same tie, which is where a fame tie-break would hide from the global
 *      number.
 *   3. THE FOLLOW-UP IS A FUNCTION OF THE SENTENCE. The offer labels are read
 *      out of the DOM for two different sentences and the overlap is counted.
 *   4. WORDS IT COULD NOT PLACE ARE VISIBLE TO THE READER. Planted nonsense is
 *      looked for as rendered text with a box, a size and an opacity, not as a
 *      field on an object; and every content word of the sentence is accounted
 *      for as either read or shown-unread.
 *   5. RULE 3 — THIN DATA MUST NOT LOOK CONFIDENT. Films the corpus never read
 *      are claimed to be drawn hollow. Counted from the draw calls and then
 *      confirmed in pixels: mean centre ink of a hollow disc against mean
 *      centre ink of a filled one, off the composited canvas.
 *   6. RULE 7 — THE SAME SENTENCE DRAWS THE SAME SKY. Two cold loads of the
 *      same address in two fresh contexts, compared as PNG bytes, then as a
 *      256-tile hash grid, then as a luma grid, so a difference is reported as
 *      an area and a magnitude rather than as a boolean.
 *   7. WHAT THE SLATE IS STANDING ON. The readout is opaque standing chrome
 *      and the constellation is behind it, so elementFromPoint is asked at
 *      every film's position at three viewports — which is also the test of
 *      whether that film can be clicked — and the camera's scale is compared
 *      with the fit this frame would give it.
 *   8. THE CONSOLE. Errors that are not the sandbox refusing a poster, and
 *      warnings the page raises about its own picture.
 *
 * EVERY CHECK WAS BROKEN ON PURPOSE FIRST. `--controls` re-runs each one
 * against a deliberately wrong input in the same page and requires it to go
 * red; a check that passes under its own control is not a check. Three of them
 * caught defects in THIS FILE before they caught anything in the app: zeroing
 * sky.alpha and sky.live does not damage a frame at all (skyDraw recomputes
 * both), and an ink threshold of 1 luma called a disc painted in the ground's
 * own colour "inked". The rim controls now paint the films out and move them
 * off the canvas, and the threshold is 25 luma.
 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join, relative } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = resolve(HERE, "../../..");
const require = createRequire(join(UNIT, "package.json"));
const ARTIFACT = process.env.ATLAS_HTML || join(UNIT, "public/atlas.html");
const CONTROLS = process.argv.includes("--controls");
const SETTLE = Number(process.env.SETTLE || 4200);
const VIEW = { width: 1440, height: 900 };

if (!existsSync(ARTIFACT)) {
  console.error(`No artifact at ${ARTIFACT}\n  build it:  node atlas/app/build.js --out public/atlas.html`);
  process.exit(2);
}

let failures = 0, checks = 0, controlsRun = 0, controlsDead = 0;
const say = (s) => console.log(s);
const head = (s) => console.log("\n── " + s + " " + "─".repeat(Math.max(2, 62 - s.length)));
function check(name, ok, note) {
  checks++;
  if (!ok) failures++;
  console.log("  " + (ok ? "pass" : "FAIL") + "  " + name + (note ? "  — " + note : ""));
  return ok;
}
/* A control asserts the OPPOSITE: the same statistic on a broken input must
   land outside the gate. `wouldPass` true means the check could not see the
   damage, which is a defect in the check itself. */
function control(name, wouldPass, note) {
  if (!CONTROLS) return;
  controlsRun++;
  if (wouldPass) { controlsDead++; failures++; }
  console.log("  " + (wouldPass ? "CONTROL DEAD" : "ctl        ") + "  " + name + (note ? "  — " + note : ""));
}

/* ══ THE TWO RIVAL EXPLANATIONS, READ OFF DISK ═══════════════════════════
   Rule 1 is falsifiable only against something that WOULD explain a layout if
   the layout were wrong. Fame is 60-day Wikipedia pageviews out of the pipeline
   cache; degree is the film's edge count in the shipped corpus. Neither is
   available to the page, so neither can be an artefact of asking the page. */
const corpus = JSON.parse(readFileSync(join(UNIT, "atlas/static/corpus.json"), "utf8"));
const KEYS = Object.keys(corpus.films);
const DEGREE = Object.create(null);
for (const k of KEYS) DEGREE[k] = 0;
for (const e of corpus.edges) { if (DEGREE[e.a] !== undefined) DEGREE[e.a]++; if (DEGREE[e.b] !== undefined) DEGREE[e.b]++; }

const ps = require("./atlas/pipeline/plot-source.js");
/* CACHE-ONLY, WINDOW PINNED TO WHAT IS ON DISK. plot-source.js derives the
   window from Date.now(), which walks off the cache the day after it was
   written; find-probe.mjs hit this and reads the window out of the filenames
   instead. Same discipline here. */
const FAME = Object.create(null);
let fameWindow = null, fameHits = 0;
try {
  for (const f of readdirSync(ps.CACHE_VIEWS)) { const m = f.match(/^pv_(\d{8})_/); if (m) { fameWindow = m[1]; break; } }
} catch (_e) { /* no cache */ }
if (fameWindow) {
  for (const k of KEYS) {
    const t = corpus.films[k].wikipedia;
    if (!t) continue;
    const p = ps.cachePath(ps.CACHE_VIEWS, "pv_" + fameWindow + "_" + t);
    if (!existsSync(p)) continue;
    let d; try { d = JSON.parse(readFileSync(p, "utf8")); } catch (_e) { continue; }
    if (!d || !Array.isArray(d.items)) continue;
    let s = 0; for (const it of d.items) s += it.views || 0;
    if (s > 0) { FAME[k] = s; fameHits++; }
  }
}

const OWNER = "a film that has fast pacing, has the mood of the matrix, has a hopeful tone, " +
  "has little dialogue, very spiritual in nature";
const SECOND = "a gritty revenge film set in a city at night, very stylised";
const NONSENSE = "zorbnax plughcromulent frobnitz wibbleflum";
const HALF = "zorbnax frobnitz a hopeful tone with little dialogue";
const THIN = "set in space";

say(`artifact ${relative(UNIT, ARTIFACT)}  ${(readFileSync(ARTIFACT).length / 1048576).toFixed(2)} MB`);
say(`rivals   ${KEYS.length} films · degree from ${corpus.edges.length} edges · ` +
  `pageviews for ${fameHits} films${fameWindow ? ` (window ${fameWindow}, cache-only)` : " — NO CACHE"}`);

/* ══ THE INSTRUMENT THAT LIVES IN THE PAGE ═══════════════════════════════
   Wraps the 2D context so every disc is recorded with the centre, radius,
   alpha and — decisively for rule 3 — whether it was FILLED or STROKED. This
   is what the page drew, in the order it drew it. Nothing here reads a
   position out of the layout. */
const SPY = () => {
  const C = CanvasRenderingContext2D.prototype;
  if (C.__spSpy) return;
  C.__spSpy = true;
  /* `on` stays true so the PAGE'S OWN frames are recorded too, not only the
     ones this probe forces. The frame the reader is actually looking at is the
     last one the page drew, and it is a different object from the frame the
     same state draws when something asks for it again — section 6 is about
     exactly that gap, and it can only be measured if both are captured. */
  window.__sp = { on: true, discs: [], last: [], punches: 0 };
  const proto = { beginPath: C.beginPath, arc: C.arc, fill: C.fill, stroke: C.stroke };
  let pending = null;
  C.beginPath = function () { pending = null; return proto.beginPath.call(this); };
  C.arc = function (x, y, r, a, b, cc) { if (window.__sp.on) pending = [x, y, r]; return proto.arc.call(this, x, y, r, a, b, cc); };
  /* A destination-out fill IS NOT A DISC, IT IS AN ERASE. The hollow disc
     punches its own centre out of the plate before the ring is stroked — see
     template.html, "THE HOLE IS PUNCHED, NOT LEFT" — and counting that punch as
     a drawn disc reported 2,600 discs for 2,204 films and 563 strokes against
     1,126 hollow films. The composite operation is recorded so the instrument
     can tell the two apart rather than being fooled by both. */
  C.fill = function (...a) {
    if (window.__sp.on && pending) {
      const op = this.globalCompositeOperation;
      /* A destination-out fill is the film's cell taken OUT of the plate: it
         is the hollow mark itself, not a disc, and below a ~3px disc it is the
         only mark an unread film gets (the ring has no inside left to leave —
         see template.html). It is recorded as its own kind so the instrument
         can count one mark per film and still tell filled from hollow. */
      if (op === "destination-out") window.__sp.discs.push({ x: pending[0], y: pending[1], r: pending[2], kind: "hole", alpha: 1 });
      else window.__sp.discs.push({ x: pending[0], y: pending[1], r: pending[2], kind: "fill", alpha: this.globalAlpha });
      pending = null;
    }
    return proto.fill.call(this, ...a);
  };
  C.stroke = function (...a) {
    if (window.__sp.on && pending) { window.__sp.discs.push({ x: pending[0], y: pending[1], r: pending[2], kind: "stroke", alpha: this.globalAlpha, lw: this.lineWidth }); pending = null; }
    return proto.stroke.call(this, ...a);
  };
  const realDraw = window.skyDraw;
  window.skyDraw = function (...a) {
    window.__sp.discs = [];
    const out = realDraw.apply(this, a);
    window.__sp.last = window.__sp.discs;
    return out;
  };
};

/* THE MEASUREMENT, TAKEN OFF THE CANVAS.
   opts.jitter / opts.shuffle / opts.blind exist for --controls only: they
   damage the measurement, never the page, so a control proves the statistic
   can see the damage without leaving a mutated app behind. */
const MEASURE = (opts) => {
  const o = opts || {};
  window.__sp.discs = []; window.__sp.on = true;
  /* restored to ON, never to off: the page's own frames have to keep being
     recorded after this call or section 6 cannot see the frame the reader is
     actually looking at. */
  try { skyDraw(); } finally { window.__sp.on = true; }
  const discs = window.__sp.discs;
  /* IDENTITY ONLY. The film a disc belongs to is resolved by matching the drawn
     centre to the camera transform of that film's position — a label. The
     radius below is computed from the DRAWN coordinate and a centre fitted to
     the drawn cloud, never from sky.wx/sky.wy. */
  const k = sky.cam.k, ox = sky.w / 2 - sky.cam.cx * k, oy = sky.h / 2 - sky.cam.cy * k;
  const at = new Map();
  for (let i = 0; i < sky.n; i++) at.set((sky.wx[i] * k + ox).toFixed(3) + "|" + (sky.wy[i] * k + oy).toFixed(3), i);
  /* ONE ROW PER FILM, NOT ONE PER DRAW CALL. An unread film can leave two
     marks — the punched cell and, where there is room, the ring around it — and
     counting both would report 2,600 discs for 2,204 films. A film is HOLLOW if
     any of its marks is a hole or a stroke. */
  const rows = [];
  const byFilm = new Map();
  let unmatched = 0, filled = 0, hollow = 0;
  for (const d of discs) {
    const i = at.get(d.x.toFixed(3) + "|" + d.y.toFixed(3));
    if (i === undefined) { unmatched++; continue; }
    let row = byFilm.get(i);
    if (!row) {
      row = { i, key: sky.keys[i], x: d.x, y: d.y, r: d.r, kind: d.kind, alpha: d.alpha };
      byFilm.set(i, row); rows.push(row);
    }
    if (d.kind !== "fill") { row.kind = "stroke"; row.r = Math.max(row.r, d.r); }
  }
  for (const row of rows) { if (row.kind === "fill") filled++; else hollow++; }
  /* THE CENTRE IS FITTED TO THE DRAWN CLOUD, not assumed to be the middle of
     the viewport and not read off the camera. layoutMatch puts the rim on a
     circle, so the bounding box of what was drawn has that circle's centre in
     it; the residual printed below is what says whether that is true. */
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of rows) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let seed = 20260810;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const p of rows) {
    p.rad = Math.hypot(p.x - cx, p.y - cy);
    if (o.jitter) p.rad += (rnd() - 0.5) * o.jitter;
  }
  if (o.shuffle) {
    const rr = rows.map((p) => p.rad);
    for (let i = rr.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = rr[i]; rr[i] = rr[j]; rr[j] = t; }
    rows.forEach((p, i) => { p.rad = rr[i]; });
  }
  const rads = rows.map((p) => p.rad).sort((a, b) => a - b);
  const rimCut = rads[Math.floor(rads.length * 0.99)];
  const rim = rows.filter((p) => p.rad >= rimCut);
  const rimMean = rim.reduce((s, p) => s + p.rad, 0) / Math.max(1, rim.length);
  const rimSd = Math.sqrt(rim.reduce((s, p) => s + (p.rad - rimMean) ** 2, 0) / Math.max(1, rim.length));

  /* ── INK, SAMPLED OFF THE COMPOSITED CANVAS ─────────────────────────────
     The ground is measured in a corner well outside the disc cloud, because at
     this density a local annulus is other films. Every number below is a luma
     lift over that ground. */
  const c = document.getElementById("sky-c"), g = c.getContext("2d"), dpr = sky.dpr || 1;
  const lumaAt = (px, py, half) => {
    const X = Math.round(px * dpr) - half, Y = Math.round(py * dpr) - half, S = half * 2 + 1;
    if (X < 0 || Y < 0 || X + S > c.width || Y + S > c.height) return null;
    const d = g.getImageData(X, Y, S, S).data;
    let s = 0;
    for (let q = 0; q < d.length; q += 4) s += 0.2126 * d[q] + 0.7152 * d[q + 1] + 0.0722 * d[q + 2];
    return s / (d.length / 4);
  };
  /* THE INK THRESHOLD IS 25 LUMA, AND IT WAS SET BY A CONTROL THAT FAILED TO
     FIRE. At 1 luma, a rim painted in the ground's own colour (#050404, which
     composites to 13 luma at alpha .82) still counted as "inked" and the
     control stayed green. A threshold a blanked disc can clear is not a
     threshold. A real disc at this zoom lands near 150. */
  const INK = 25;
  const groundSpots = [[24, 24], [c.width / dpr - 24, 24], [24, c.height / dpr - 24], [c.width / dpr - 24, c.height / dpr - 24]];
  const grounds = groundSpots.map((p) => lumaAt(p[0], p[1], 3)).filter((v) => v !== null);
  const ground = grounds.reduce((a, b) => a + b, 0) / Math.max(1, grounds.length);

  /* Nearest neighbour, so a disc can be sampled without its neighbours' ink in
     the patch. At this density most discs are 5-7px apart and a 5x5 box would
     otherwise be measuring the crowd. */
  const CELL = 12, grid = new Map();
  for (const p of rows) {
    const gk = ((p.x / CELL) | 0) + "," + ((p.y / CELL) | 0);
    if (!grid.has(gk)) grid.set(gk, []);
    grid.get(gk).push(p);
  }
  const nnOf = (p) => {
    const gx = (p.x / CELL) | 0, gy = (p.y / CELL) | 0;
    let best = Infinity;
    for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) {
      const list = grid.get((gx + a) + "," + (gy + b2));
      if (!list) continue;
      for (const q of list) { if (q === p) continue; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < best) best = d; }
    }
    return best;
  };
  /* EVERY DISC, NOT EVERY THIRD. Sampling 700 of 2,204 starves the minority
     class the moment the layout packs equal scores together: on "set in space"
     it left 3 isolated hollow discs to carry a 0.90 AUC gate, which is not a
     measurement. getImageData at one pixel per film is 2,204 reads and costs
     under 200 ms; the number is worth it. */
  const step = 1;
  let inkedFill = 0, sampledFill = 0, inkedHollow = 0, sampledHollow = 0;
  const inkFill = [], inkHollow = [], ink = [];
  for (let i = 0; i < rows.length; i += step) {
    const p = rows[i];
    const v = lumaAt(p.x, p.y, 0);
    if (v === null) continue;
    const lift = v - ground;
    const mass = lumaAt(p.x, p.y, 2);          /* 5x5 total ink around the disc */
    ink.push([p.key, p.kind === "fill" ? 1 : 0, +lift.toFixed(3),
              mass === null ? null : +(mass - ground).toFixed(3), +nnOf(p).toFixed(2)]);
    if (p.kind === "fill") { sampledFill++; if (lift > INK) inkedFill++; inkFill.push(lift); }
    else { sampledHollow++; if (lift > INK) inkedHollow++; inkHollow.push(lift); }
  }
  /* THE RIM, IN PIXELS. Everything outside 80% of the fitted radius: how many
     discs were drawn there, and how much ink is actually on the plate. */
  const rimBand = rows.filter((p) => p.rad >= rimMean * 0.8);
  let rimInked = 0, rimSampled = 0, rimInkSum = 0;
  const rstep = Math.max(1, Math.floor(rimBand.length / 400));
  for (let i = 0; i < rimBand.length; i += rstep) {
    const v = lumaAt(rimBand[i].x, rimBand[i].y, 0);
    if (v === null) continue;
    rimSampled++;
    const lift = v - ground;
    rimInkSum += lift;
    if (lift > INK) rimInked++;
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  /* Scores are the QUANTITY UNDER TEST, not a position: they come from the
     engine because that is what the layout is supposed to be a function of. */
  const q = sky.query;
  const scores = q && q.r && q.r.scores ? q.r.scores : null;
  const covOf = (key) => {
    if (o.blind) return 1;
    if (!q || !q.r || !q.r.explain) return null;
    const d = q.r.explain(key);
    return d ? d.coverage : null;
  };
  return {
    n: sky.n, drawn: rows.length, unmatched, filled, hollow,
    centre: [cx, cy], rimMean, rimSd, rimN: rim.length,
    distinctDrawRadii: new Set(rows.map((p) => p.r.toFixed(4))).size,
    ground,
    inkFraction: sampledFill ? inkedFill / sampledFill : 0, inkSampled: sampledFill,
    hollowInkFraction: sampledHollow ? inkedHollow / sampledHollow : 0, hollowSampled: sampledHollow,
    inkFilledMean: mean(inkFill), inkHollowMean: mean(inkHollow),
    inkFilledN: inkFill.length, inkHollowN: inkHollow.length, ink,
    drawnDiscR: rows.length ? rows[0].r : 0,
    camK: sky.cam.k, fitK: skyFitK(), safeH: skySafeH(), baseR: skyBaseR(),
    rimBandN: rimBand.length, rimInked, rimSampled, rimInkMean: rimSampled ? rimInkSum / rimSampled : 0,
    rows: rows.map((p) => [p.key, +p.rad.toFixed(6), p.kind === "fill" ? 1 : 0,
                           scores ? scores[p.key] : null, covOf(p.key)]),
  };
};

/* ── correlation, over the pairs both sides have a number for ───────────── */
function rho(rows, pick, other) {
  const xs = [], ys = [];
  for (const r of rows) { const a = pick(r), b = other(r); if (a === null || a === undefined || b === undefined || b === null || Number.isNaN(a) || Number.isNaN(b)) continue; xs.push(a); ys.push(b); }
  return { rho: ps.spearman(xs, ys), n: xs.length };
}
const sig = (v) => (v >= 0 ? "+" : "") + v.toFixed(4);

/* ── the page ───────────────────────────────────────────────────────────── */
const URL0 = pathToFileURL(ARTIFACT).href;
const browser = await chromium.launch();
async function fresh(viewport) {
  const ctx = await browser.newContext({ viewport: viewport || VIEW, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const errs = [], warns = [];
  /* A poster that cannot be fetched is the sandbox, not the page: this artifact
     serves runtime <img> from upload.wikimedia.org and there is no network. */
  const NETWORK = /Failed to load resource|net::ERR_/;
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !NETWORK.test(m.text())) errs.push("console: " + m.text());
    if (m.type() === "warning") warns.push(m.text());
  });
  await page.route("**/*", (r) => (r.request().resourceType() === "image" ? r.abort() : r.continue()));
  return { ctx, page, errs, warns };
}
async function open(page, hash) {
  await page.goto(URL0 + hash, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("typeof sky!=='undefined' && sky.ready && sky.n>0", null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE);
  await page.evaluate(SPY);
}
async function find(page, text) {
  await page.evaluate((t) => window.__ATLAS_SKY__.find(t), text);
  await page.waitForTimeout(SETTLE);
}
const readQuery = (page) => page.evaluate(() => {
  const q = window.__ATLAS_SKY__.query(), s = window.__ATLAS_SKY__.state();
  return {
    kind: s.kind, live: s.live, n: s.n, forming: s.forming,
    drawable: q ? q.drawable : null, refusal: q ? q.refusal : null,
    readings: q ? q.readings.length : 0,
    unread: q ? q.unread.map((u) => u.text) : [],
    offers: q ? q.offers.map((o) => o.attr) : [],
    coverage: q ? q.coverage : null,
    top: q ? q.top.slice(0, 3).map((t) => t.key) : [],
    domOffers: [...document.querySelectorAll(".find-take b")].map((n) => n.textContent.trim()),
    domUnread: [...document.querySelectorAll(".find-un b")].map((n) => n.textContent.trim()),
    domChips: [...document.querySelectorAll(".find-chip .said")].map((n) => n.textContent.trim()),
    slate: (document.querySelector("#sky-readbox") || { textContent: "" }).textContent.replace(/\s+/g, " ").trim(),
  };
});

const { ctx: ctxA, page, errs, warns } = await fresh();
await open(page, "#/sky");

/* ══ 1. A QUERY NEVER EMPTIES THE WORLD ══════════════════════════════════ */
head("1. nothing is ever removed, and the rim is populated");
let ownerM = null;
{
  for (const [label, text] of [["the owner's sentence", OWNER], ["a second sentence", SECOND],
                               ["one understood word in nonsense", HALF], ["thin data", THIN]]) {
    await find(page, text);
    const st = await readQuery(page);
    const m = await page.evaluate(MEASURE, {});
    if (text === OWNER) ownerM = m;
    check(`${label}: every film is still in the picture`,
      st.live === st.n && st.n === KEYS.length && m.drawn === KEYS.length && m.unmatched === 0,
      `${st.live} of ${st.n} live, ${m.drawn} discs drawn, ${m.unmatched} unattributable`);
    check(`${label}: the rim carries films and carries ink`,
      m.rimBandN >= 100 && m.rimInked / Math.max(1, m.rimSampled) >= 0.9,
      `${m.rimBandN} discs beyond 80% of the ${m.rimMean.toFixed(1)}px radius, ` +
      `${m.rimInked} of ${m.rimSampled} sampled centres above ground by more than 25 luma ` +
      `(mean lift ${m.rimInkMean.toFixed(1)})`);
    say(`      fit: centre (${m.centre[0].toFixed(1)}, ${m.centre[1].toFixed(1)}), ` +
      `rim radius ${m.rimMean.toFixed(2)}px ±${m.rimSd.toFixed(2)}px over the outer ${m.rimN}, ` +
      `${m.distinctDrawRadii} distinct disc sizes, ground luma ${m.ground.toFixed(2)}`);
  }
  /* THE ABSURD SENTENCE. It is the one the spec names, and the page's answer is
     a refusal rather than a disc, so both halves are measured: what is still on
     screen, and whether the reader is told why. */
  await find(page, NONSENSE);
  const st = await readQuery(page);
  const m = await page.evaluate(MEASURE, {});
  check("an absurd query does not empty the world",
    st.live === KEYS.length && m.drawn === KEYS.length,
    `${st.live} films live, ${m.drawn} discs drawn, kind "${st.kind}", refusal "${st.refusal}"`);
  check("and the absurd words are handed back rather than swallowed",
    st.domUnread.some((u) => /zorbnax/.test(u)) && st.slate.length > 40,
    `${st.domUnread.length} unread block(s), slate ${st.slate.length} characters`);
  check("an absurd query still answers with a constellation, not the resting atlas",
    st.kind === "match",
    `kind "${st.kind}", refusal "${st.refusal}" — the reading is refused and the whole atlas comes back, ` +
    `so distance answers nothing; the owner's rule is that a poor match "can still live in the ` +
    `constellation, just a bit further away"`);
}

/* 1b. THE RIM CONTROLS, RUN FOR REAL IN THE PAGE.
   Two damages, because "the rim is populated" is two claims. Taking the films
   away tests the count; painting them in the ground colour tests the ink. The
   first version of this control zeroed sky.alpha and did NOT fire — skyDraw
   recomputes the alpha column every frame, so the mutation was gone before the
   draw that was supposed to show it. A control that cannot fire is a check
   that is not being tested, which is the whole reason this mode exists. */
if (CONTROLS) {
  await find(page, OWNER);
  const broke = await page.evaluate((M) => {
    const measure = new Function("opts", "return (" + M + ")(opts)");
    const before = measure({});
    const k = sky.cam.k, ox = sky.w / 2 - sky.cam.cx * k, oy = sky.h / 2 - sky.cam.cy * k;
    const cx = before.centre[0], cy = before.centre[1];
    const rim = [];
    for (let i = 0; i < sky.n; i++) {
      const r = Math.hypot(sky.wx[i] * k + ox - cx, sky.wy[i] * k + oy - cy);
      if (r >= before.rimMean * 0.8) rim.push(i);
    }
    /* (a) the ink: the rim films painted in the ground's own colour */
    const tones = rim.map((i) => sky.tone[i]);
    for (const i of rim) sky.tone[i] = "#050404";
    const dark = measure({});
    rim.forEach((i, j) => { sky.tone[i] = tones[j]; });
    /* (b) the count: the rim films moved off the canvas entirely. sky.live and
       sky.alpha are both recomputed inside skyDraw, so neither survives long
       enough to damage a frame — moving the film does. */
    const wx = Float64Array.from(sky.wx);
    for (const i of rim) sky.wx[i] = 1e4;
    const gone = measure({});
    sky.wx.set(wx); skyDraw();
    return { before, dark, gone, rim: rim.length };
  }, MEASURE.toString());
  control("a rim painted in the ground colour is seen as empty",
    broke.dark.rimInked / Math.max(1, broke.dark.rimSampled) >= 0.9,
    `${broke.before.rimInked}/${broke.before.rimSampled} rim centres inked before, ` +
    `${broke.dark.rimInked}/${broke.dark.rimSampled} after ${broke.rim} films were painted out`);
  control("and a rim taken out of the picture is seen as missing",
    broke.gone.drawn === KEYS.length,
    `${broke.before.drawn} discs drawn before, ${broke.gone.drawn} after ${broke.rim} films were dropped`);
}

/* ══ 2. RULE 1 — WHAT THE RADIUS IS A FUNCTION OF ════════════════════════ */
head("2. rule 1 — radius against score, against fame, against degree");
{
  await find(page, OWNER);
  const m = await page.evaluate(MEASURE, {});
  ownerM = m;
  const rows = m.rows.map(([key, rad, fill, score, cov]) => ({ key, rad, fill, score, cov,
    fame: FAME[key] === undefined ? null : FAME[key], deg: DEGREE[key] }));
  check("every disc the correlation uses was found on the canvas",
    m.inkFraction >= 0.95, `${(m.inkFraction * 100).toFixed(1)}% of ${m.inkSampled} sampled FILLED disc centres ` +
    `carry ink above the ${m.ground.toFixed(2)} ground ` +
    `(hollow: ${(m.hollowInkFraction * 100).toFixed(1)}% of ${m.hollowSampled}, and that gap is section 5)`);

  const rScore = rho(rows, (r) => r.rad, (r) => r.score);
  const rFame = rho(rows, (r) => r.rad, (r) => r.fame);
  const rDeg = rho(rows, (r) => r.rad, (r) => r.deg);
  say(`      rho(drawn radius, score)  ${sig(rScore.rho)}   n=${rScore.n}`);
  say(`      rho(drawn radius, fame)   ${sig(rFame.rho)}   n=${rFame.n}   (60-day pageviews)`);
  say(`      rho(drawn radius, degree) ${sig(rDeg.rho)}   n=${rDeg.n}   (corpus edge count)`);
  /* THE READER'S OWN QUESTION, WHICH A CORRELATION DOES NOT ANSWER: pick two
     films off the screen, is the nearer one the better answer? Ordered pairs
     only — a tie cannot be drawn backwards — over a deterministic sample. */
  let seed = 20260810, ordered = 0, wrong = 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 400000; t++) {
    const a = rows[(rnd() * rows.length) | 0], b = rows[(rnd() * rows.length) | 0];
    if (a === b || a.score === null || b.score === null || a.score === b.score) continue;
    ordered++;
    const hi = a.score > b.score ? a : b, lo = hi === a ? b : a;
    if (hi.rad > lo.rad) wrong++;
  }
  check("distance is match strength: the correlation is strong and negative",
    rScore.rho <= -0.80, `rho ${sig(rScore.rho)} against a gate of -0.80; ` +
    `${((wrong / Math.max(1, ordered)) * 100).toFixed(2)}% of ${ordered.toLocaleString("en-US")} ordered pairs ` +
    `are drawn backwards — the better answer is further out ` +
    `(the header's uncited -0.993 is gone; pipeline/measure-match-layout.js exists and --v1 runs the pre-band arrangement as a control)`);
  check("fame does not explain the layout",
    Math.abs(rFame.rho) <= 0.45, `|rho| ${Math.abs(rFame.rho).toFixed(4)} against the 0.45 gate match.js holds the scorer to`);
  check("degree does not explain the layout",
    Math.abs(rDeg.rho) <= 0.45, `|rho| ${Math.abs(rDeg.rho).toFixed(4)} against the same gate`);

  /* THE EXACT FORM. "A pure function of score" is not a correlation, it is an
     identity: two films at one score must be drawn at one radius. */
  const byScore = new Map();
  for (const r of rows) { if (r.score === null) continue; const k = r.score.toFixed(12); if (!byScore.has(k)) byScore.set(k, []); byScore.get(k).push(r); }
  let worstSpread = 0, worstScore = "", ties = 0, tiedFilms = 0;
  for (const [s, list] of byScore) {
    if (list.length < 2) continue;
    ties++; tiedFilms += list.length;
    const lo = Math.min(...list.map((r) => r.rad)), hi = Math.max(...list.map((r) => r.rad));
    if (hi - lo > worstSpread) { worstSpread = hi - lo; worstScore = s; }
  }
  /* THE OLD FORM OF THIS CHECK ASKED FOR SOMETHING THE DESIGN REFUSES TO GIVE
     and could therefore never pass: layout-match.js spreads a tie on purpose,
     its own note in this file said so, and a spread of 0px would draw 396 films
     on one circle. "A tie is drawn at one radius" is not the property that
     protects the reader. THIS is: a tie occupies a BAND, and no film the score
     ordered differently is drawn inside that band. A 396-film ring is honest
     when nothing better and nothing worse is mixed into it, and a lie when a
     film that scored three times higher is drawn among them — which is exactly
     what 13.31% of pairs drawn backwards was, before the bands.

     Two numbers, both hard: how many films from another score are drawn inside
     some tie's radial band, and how wide the widest band is as a share of the
     radius, which is the figure the slate is required to print. */
  /* THE GROUP KEY IS THE STRING, NOT THE NUMBER BACK OUT OF IT. `+s` on a
     12-place round-trip does not always return the double it came from, so
     comparing a row's score to the reparsed key counted 233 of the 396 films
     in the largest tie as intruders INTO THEIR OWN BAND. Membership is decided
     by the same key the grouping used. */
  const groups = [...byScore.entries()]
    .map(([s, list]) => ({ key: s, score: +s, n: list.length,
      lo: Math.min(...list.map((r) => r.rad)), hi: Math.max(...list.map((r) => r.rad)) }))
    .filter((g) => g.n > 1);
  let intruders = 0, worstBand = null;
  for (const g of groups) {
    let bad = 0;
    for (const r of rows) {
      if (r.score === null || r.score.toFixed(12) === g.key) continue;
      /* ONE PIXEL OF TOLERANCE AT EACH EDGE, BECAUSE THE SCREEN IS PIXELS.
         456 distinct scores share a 183px radius, so adjacent bands are
         routinely under a pixel apart and quantisation alone puts a neighbour
         on a band's own edge. That is the raster, not an interleave. A film
         drawn a pixel INSIDE a 22px band is a different claim, and the
         permuted-radius control below puts 226,896 of them there. */
      if (r.rad > g.lo + 1 && r.rad < g.hi - 1) bad++;
    }
    intruders += bad;
    if (bad && (!worstBand || bad > worstBand.bad)) worstBand = { g, bad };
  }
  check("a tie is drawn as a band, and nothing the score ordered is drawn inside it",
    intruders === 0 && worstSpread <= m.rimMean * 0.25,
    `${ties} score ties covering ${tiedFilms} of ${rows.length} films; ${intruders} films from a ` +
    `different score are drawn inside some tie's own radial band` +
    (worstBand ? ` (worst: ${worstBand.bad} inside the ${worstBand.g.n}-film ring at ${worstBand.g.score.toFixed(4)})` : "") +
    `; widest band ${worstSpread.toFixed(2)}px = ${(100 * worstSpread / m.rimMean).toFixed(0)}% of the ` +
    `${m.rimMean.toFixed(0)}px radius, against a 25% gate`);
  /* IF THE SPREAD IS DELIBERATE IT HAS TO BE DISCLOSED, because the reader
     cannot see which films the score declined to order. The slate says so for
     the top tie only. */
  const q = await readQuery(page);
  check("and the reader is told where distance stops meaning anything",
    worstSpread <= 1.0 || /tie, not an order/.test(q.slate),
    `${tiedFilms} films are in ties spread up to ${worstSpread.toFixed(0)}px; the slate's tie sentence ` +
    `covers the top score only, and here ${q.coverage ? q.coverage.tiedAtTop : "?"} film(s) tie at the top, ` +
    `so it is not printed at all`);

  /* AND THE TIE-BREAK ITSELF. If the spread above is non-zero, the only
     question rule 1 has left is what orders it. This is where a fame
     tie-break would sit, invisible to the global number. */
  const big = [...byScore.values()].sort((a, b) => b.length - a.length)[0] || [];
  const tFame = rho(big, (r) => r.rad, (r) => r.fame);
  const tDeg = rho(big, (r) => r.rad, (r) => r.deg);
  check("inside the largest tie, neither fame nor degree orders the radius",
    (Number.isNaN(tFame.rho) || Math.abs(tFame.rho) <= 0.20) &&
    (Number.isNaN(tDeg.rho) || Math.abs(tDeg.rho) <= 0.20),
    `${big.length} films at score ${big.length ? big[0].score.toFixed(4) : "-"}: ` +
    `rho(radius, fame) ${sig(tFame.rho)} (n=${tFame.n}), rho(radius, degree) ${sig(tDeg.rho)} (n=${tDeg.n})`);

  /* SIZE IS THE OTHER HALF OF RULE 1 AND IS REPORTED, NOT ASSUMED. */
  check("disc size does not carry a second, contradicting message",
    m.distinctDrawRadii <= 3,
    `${m.distinctDrawRadii} distinct drawn disc radii across ${m.drawn} films`);

  if (CONTROLS) {
    const sh = await page.evaluate(MEASURE, { shuffle: true });
    const shRows = sh.rows.map(([key, rad, , score]) => ({ key, rad, score, fame: FAME[key] ?? null, deg: DEGREE[key] }));
    control("a shuffled radius fails the score gate",
      rho(shRows, (r) => r.rad, (r) => r.score).rho <= -0.80,
      `rho ${sig(rho(shRows, (r) => r.rad, (r) => r.score).rho)} once the radii are permuted`);
    /* AND THE BAND CHECK CAN SEE THE SAME DAMAGE. A permutation destroys the
       bands without touching the score, so a tie's radial range fills with
       films from every other score — which is what the check exists to catch
       and what it must therefore report when the property is broken. */
    const shBy = new Map();
    for (const r of shRows) { const k = r.score.toFixed(12); if (!shBy.has(k)) shBy.set(k, []); shBy.get(k).push(r); }
    let shIntruders = 0;
    for (const [sc, list] of shBy) {
      if (list.length < 2) continue;
      const lo = Math.min(...list.map((r) => r.rad)), hi = Math.max(...list.map((r) => r.rad));
      for (const r of shRows) if (r.score.toFixed(12) !== sc && r.rad > lo + 1 && r.rad < hi - 1) shIntruders++;
    }
    control("a shuffled radius is seen by the tie-band check",
      shIntruders === 0,
      `${shIntruders} films from another score drawn inside a tie's band once the radii are permuted`);
    /* THE FAME CONTROL IS THE ONE THAT MATTERS: a layout that really did rank
       by fame must trip the fame gate, or the gate is decoration. */
    const famed = rows.filter((r) => r.fame !== null).slice().sort((a, b) => b.fame - a.fame)
      .map((r, i) => ({ ...r, rad: i * 0.16 }));
    control("a fame-ordered layout trips the fame gate",
      Math.abs(rho(famed, (r) => r.rad, (r) => r.fame).rho) <= 0.45,
      `rho ${sig(rho(famed, (r) => r.rad, (r) => r.fame).rho)} when radius IS the fame rank`);
    const degd = rows.slice().sort((a, b) => b.deg - a.deg).map((r, i) => ({ ...r, rad: i * 0.16 }));
    control("a degree-ordered layout trips the degree gate",
      Math.abs(rho(degd, (r) => r.rad, (r) => r.deg).rho) <= 0.45,
      `rho ${sig(rho(degd, (r) => r.rad, (r) => r.deg).rho)} when radius IS the degree rank`);
    const jm = await page.evaluate(MEASURE, { jitter: 6 });
    const jRows = jm.rows.map(([key, rad, , score]) => ({ key, rad, score }));
    const jBy = new Map();
    for (const r of jRows) { if (r.score === null) continue; const k = r.score.toFixed(12); if (!jBy.has(k)) jBy.set(k, []); jBy.get(k).push(r); }
    let jw = 0;
    for (const list of jBy.values()) if (list.length > 1) jw = Math.max(jw, Math.max(...list.map((r) => r.rad)) - Math.min(...list.map((r) => r.rad)));
    control("6px of jitter inside a tie is seen", jw <= 1.0, `widest tie spread ${jw.toFixed(2)}px under jitter`);
  }
}

/* ══ 3. THE FOLLOW-UP IS A FUNCTION OF THE SENTENCE ══════════════════════ */
head("3. two sentences, two different follow-ups");
{
  await find(page, OWNER);
  const a = await readQuery(page);
  await find(page, SECOND);
  const b = await readQuery(page);
  await find(page, THIN);
  const c = await readQuery(page);
  say(`      ${JSON.stringify(OWNER.slice(0, 34))}  →  ${a.domOffers.join(" · ") || "(silent)"}`);
  say(`      ${JSON.stringify(SECOND.slice(0, 34))}  →  ${b.domOffers.join(" · ") || "(silent)"}`);
  say(`      ${JSON.stringify(THIN.slice(0, 34))}  →  ${c.domOffers.join(" · ") || "(silent)"}`);
  const overlap = a.offers.filter((x) => b.offers.includes(x));
  check("both sentences are actually asked something",
    a.domOffers.length > 0 && b.domOffers.length > 0,
    `${a.domOffers.length} and ${b.domOffers.length} offers in the DOM`);
  check("and the two rows are different questions",
    a.offers.length > 0 && b.offers.length > 0 && overlap.length <= Math.min(a.offers.length, b.offers.length) / 2,
    `${overlap.length} of ${a.offers.length}/${b.offers.length} shared${overlap.length ? " (" + overlap.join(", ") + ")" : ""}`);
  check("a one-clause sentence is asked something too",
    c.domOffers.length > 0,
    `${c.domOffers.length} offers for ${JSON.stringify(THIN)} — ` +
    `the sentence with the most room left to narrow is the one that gets no follow-up`);
  await find(page, OWNER);   /* the box below is only meaningful under a sentence that got offers */
  const box = await page.evaluate(() => {
    const n = document.querySelector(".find-take");
    if (!n) return null;
    const r = n.getBoundingClientRect(), s = getComputedStyle(n);
    return { w: Math.round(r.width), h: Math.round(r.height), op: +s.opacity, vis: s.visibility };
  });
  check("the offers are real DOM type, not glyphs on the canvas (rule 4)",
    !!box && box.w > 40 && box.h > 8 && box.op > 0.5 && box.vis === "visible",
    box ? `${box.w}x${box.h}px, opacity ${box.op}` : "no .find-take in the DOM");
  control("comparing a sentence with itself gives a full overlap",
    a.offers.filter((x) => a.offers.includes(x)).length <= a.offers.length / 2,
    `${a.offers.length} of ${a.offers.length} shared with itself`);
}

/* ══ 4. WORDS IT COULD NOT PLACE ARE VISIBLE ═════════════════════════════ */
head("4. the words it could not place are shown to the reader");
{
  await find(page, HALF);
  const st = await readQuery(page);
  const seen = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll("#sky-readbox *")) {
      const t = (n.textContent || "").toLowerCase();
      if (!/zorbnax|frobnitz/.test(t)) continue;
      if (n.children.length) continue;
      const r = n.getBoundingClientRect(), s = getComputedStyle(n);
      out.push({ text: n.textContent.trim().slice(0, 48), w: Math.round(r.width), h: Math.round(r.height),
        op: +s.opacity, vis: s.visibility, disp: s.display, color: s.color,
        onScreen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight });
    }
    return out;
  });
  const live = seen.filter((s) => s.onScreen && s.op > 0.15 && s.vis === "visible" && s.disp !== "none");
  check("planted nonsense is rendered, with a box and an opacity",
    live.length > 0 && live.some((s) => /zorbnax/.test(s.text.toLowerCase())),
    live.length ? `${live.length} node(s): ` + live.map((s) => `${JSON.stringify(s.text)} ${s.w}x${s.h}px op ${s.op} ${s.color}`).join(" · ")
      : `${seen.length} matching nodes, none visible`);
  /* THE ACCOUNTING. Every content word of the sentence is either inside a chip
     the atlas says it read, or inside the block it says it could not place.
     Anything in neither was swallowed. */
  const acct = await page.evaluate((text) => {
    const stop = new Set(["a", "an", "the", "of", "in", "at", "on", "to", "and", "or", "with", "that", "has", "have",
                          "is", "it", "i", "for", "but", "film", "films", "movie", "something", "very", "more", "less", "want"]);
    const said = [...document.querySelectorAll(".find-chip .said")].map((n) => n.textContent.toLowerCase()).join(" ");
    const un = [...document.querySelectorAll(".find-un")].map((n) => n.textContent.toLowerCase()).join(" ");
    const marks = [...document.querySelectorAll(".find-mark")].map((n) => n.textContent.toLowerCase()).join(" ");
    const shown = said + " " + un + " " + marks;
    const words = text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
    const missing = [...new Set(words.filter((w) => !stop.has(w) && !shown.includes(w)))];
    return { words: words.length, missing };
  }, HALF);
  check("no content word of the sentence vanishes without a trace",
    acct.missing.length === 0,
    `${acct.missing.length} of ${acct.words} words appear in neither a chip nor the unread block` +
    (acct.missing.length ? ": " + acct.missing.map((w) => JSON.stringify(w)).join(", ") : ""));
  control("hiding the unread block is seen",
    await page.evaluate(() => {
      const n = document.querySelector(".find-unread");
      if (!n) return true;
      n.style.display = "none";
      const nodes = [...document.querySelectorAll("#sky-readbox *")].filter((x) => /zorbnax/i.test(x.textContent) && !x.children.length);
      const vis = nodes.filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length;
      n.style.display = "";
      return vis > 0;
    }), "display:none on .find-unread leaves no visible node carrying the word");
}

/* ══ 5. RULE 3 — A FILM NOBODY READ MUST NOT LOOK CONFIDENT ══════════════ */
head("5. rule 3 — thin data is drawn thin");
{
  await find(page, THIN);
  const st = await readQuery(page);
  const m = await page.evaluate(MEASURE, {});
  const rows = m.rows.map(([key, rad, fill, score, cov]) => ({ key, rad, fill, score, cov }));
  const blind = rows.filter((r) => r.cov === 0), read = rows.filter((r) => r.cov > 0);
  check("the corpus really does have films it never read for this sentence",
    blind.length > 50, `${blind.length} of ${rows.length} films answer ${JSON.stringify(THIN)} on prior credit alone`);
  check("and every one of them is drawn hollow rather than filled",
    blind.length > 0 && blind.every((r) => r.fill === 0) && read.every((r) => r.fill === 1),
    `${m.hollow} stroked discs against ${blind.length} films with zero coverage; ` +
    `${read.filter((r) => r.fill === 0).length} read films wrongly hollow`);
  /* THE ONLY QUESTION THAT MATTERS IS WHETHER A READER COULD TELL. Measured on
     ISOLATED discs, so the patch is one film's ink and not the crowd's, and
     reported as the separation between the two populations: the share of
     hollow discs that are darker at the centre than the median filled one. A
     hollow that is only hollow in the draw call is not a rule 3 defence. */
  /* AUC: the probability that a hollow disc, picked at random, is darker at the
     centre than a filled one picked at random. 0.5 is two populations a reader
     cannot tell apart at all; 1.0 is a distinction that always reads. */
  const sep = (list) => {
    const fill = list.filter((r) => r[1] === 1 && r[4] >= 6).map((r) => r[2]).sort((a, b) => a - b);
    const holl = list.filter((r) => r[1] === 0 && r[4] >= 6).map((r) => r[2]).sort((a, b) => a - b);
    if (!fill.length || !holl.length) return null;
    let win = 0, tie = 0;
    for (const h of holl) for (const f2 of fill) { if (h < f2) win++; else if (h === f2) tie++; }
    const auc = (win + tie / 2) / (holl.length * fill.length);
    const mf = fill.reduce((a, b) => a + b, 0) / fill.length, mh = holl.reduce((a, b) => a + b, 0) / holl.length;
    const med = fill[fill.length >> 1];
    const below = holl.filter((v) => v < med * 0.5).length;
    return { nf: fill.length, nh: holl.length, meanFill: mf, meanHollow: mh, auc, below, share: below / holl.length };
  };
  const s0 = sep(m.ink);
  check("the difference is on the composited canvas, not only in the draw calls",
    !!s0 && s0.auc >= 0.90,
    s0 ? `isolated discs (nearest neighbour >= 6px): filled centre +${s0.meanFill.toFixed(1)} luma (n=${s0.nf}), ` +
      `hollow +${s0.meanHollow.toFixed(1)} (n=${s0.nh}), AUC ${s0.auc.toFixed(3)} against a 0.90 gate — ` +
      `${(s0.auc * 100).toFixed(0)}% of hollow/filled pairs are the right way round, and ${s0.below} of ${s0.nh} ` +
      `hollow discs are even half as dark at the centre as a median filled one. At a ${m.drawnDiscR.toFixed(2)}px ` +
      `disc the cell is punched out of the plate and the ring is drawn only where it has an inside`
      : "no isolated discs to sample");
  /* AND WHETHER IT EVER BECOMES VISIBLE. Same picture, camera pushed in, so
     the disc is big enough to have an inside. */
  const zoomed = await page.evaluate((M) => {
    const measure = new Function("opts", "return (" + M + ")(opts)");
    const k0 = sky.cam.k;
    sky.cam.k = k0 * 5;
    const out = measure({});
    sky.cam.k = k0; skyDraw();
    return out;
  }, MEASURE.toString());
  const s1 = sep(zoomed.ink);
  say(`      pushed in to a ${zoomed.drawnDiscR.toFixed(2)}px disc the same films separate: ` +
    (s1 ? `filled +${s1.meanFill.toFixed(1)}, hollow +${s1.meanHollow.toFixed(1)}, AUC ${s1.auc.toFixed(3)} ` +
      `(n=${s1.nf}/${s1.nh}) — the grammar is real, it is the resting size that cannot carry it`
      : "no isolated discs"));
  check("and the slate says so in words",
    /hollow/i.test(st.slate) && /READING/i.test(st.slate),
    `slate mentions hollow: ${/hollow/i.test(st.slate)}, says it is a reading: ${/READING/i.test(st.slate)}`);
  /* RULE 3'S OTHER HALF, REPORTED RATHER THAN GATED: an unread film sits at the
     same radius as a read one at the same score, so distance alone states a
     confidence it does not have. The hollow fill is the whole of the defence. */
  const pairScore = new Map();
  for (const r of rows) { const k = r.score.toFixed(9); if (!pairScore.has(k)) pairScore.set(k, { b: 0, r: 0 }); pairScore.get(k)[r.cov === 0 ? "b" : "r"]++; }
  let mixed = 0;
  for (const v of pairScore.values()) if (v.b && v.r) mixed++;
  say(`      ${mixed} score values hold both read and unread films at one radius — ` +
    `the radius cannot tell them apart, and is not asked to`);
  if (CONTROLS) {
    const off = await page.evaluate((M) => {
      const measure = new Function("opts", "return (" + M + ")(opts)");
      const saved = sky.qcov; sky.qcov = null;
      const after = measure({ blind: true });
      sky.qcov = saved; skyDraw();
      return after;
    }, MEASURE.toString());
    control("switching the hollow off is seen in the draw calls and in the pixels",
      off.hollow > 0 && off.inkHollowMean < off.inkFilledMean * 0.6,
      `${off.hollow} stroked discs with sky.qcov nulled, hollow ink ${off.inkHollowMean.toFixed(2)}`);
  }
}

/* ══ 6. RULE 7 — THE SAME SENTENCE DRAWS THE SAME SKY ════════════════════ */
head("6. rule 7 — determinism, bit for bit");
{
  const SHOT = () => {
    const c = document.getElementById("sky-c"), g = c.getContext("2d");
    const url = c.toDataURL();
    const d = g.getImageData(0, 0, c.width, c.height).data;
    /* A 16x16 hash grid and a coarse luma grid, so a difference is reportable
       as an area and a magnitude rather than as one boolean. */
    const G = 16, tiles = new Array(G * G).fill(0), LW = 96, LH = 56;
    const luma = new Float64Array(LW * LH), lumaN = new Float64Array(LW * LH);
    for (let y = 0; y < c.height; y++) {
      const ty = ((y * G / c.height) | 0) * G, ly = ((y * LH / c.height) | 0) * LW;
      for (let x = 0; x < c.width; x++) {
        const o = (y * c.width + x) * 4;
        const v = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
        const ti = ty + ((x * G / c.width) | 0);
        tiles[ti] = ((tiles[ti] ^ v) * 16777619) >>> 0;
        const li = ly + ((x * LW / c.width) | 0);
        luma[li] += 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
        lumaN[li]++;
      }
    }
    const L = new Array(LW * LH);
    for (let i = 0; i < L.length; i++) L[i] = lumaN[i] ? luma[i] / lumaN[i] : 0;
    return { url, tiles, luma: L, w: c.width, h: c.height };
  };
  const digest = (s) => createHash("sha256").update(s).digest("hex");
  const compare = (a, b) => {
    const tiles = a.tiles.filter((t, i) => t !== b.tiles[i]).length;
    let worst = 0, cells = 0;
    for (let i = 0; i < a.luma.length; i++) { const d = Math.abs(a.luma[i] - b.luma[i]); if (d > 0.01) cells++; if (d > worst) worst = d; }
    return { tiles, cells, worst, same: a.url === b.url };
  };

  /* (a) THE PICTURE ON SCREEN IS THE PICTURE THE STATE DRAWS. Nothing below
     means anything if the frame the reader is looking at is not the frame this
     state produces — and that is a rule 7 question, not a repaint detail: two
     readers on the same address see different skies depending on whether
     anything happened to force a repaint. */
  await find(page, OWNER);
  const s1 = await page.evaluate(SHOT);           /* as the page left it */
  await page.waitForTimeout(900);
  const idle = await page.evaluate(SHOT);         /* nothing forced: is it even moving? */
  /* the reader's own frame, before anything forces another one */
  const stale = await page.evaluate(() => {
    const L = window.__sp.last;
    let dx = 0;
    return { n: L.length, r: L.length ? L[0].r : 0, moved: dx,
      camK: sky.cam.k, fitK: skyFitK(), safeH: skySafeH(), wouldBe: skyRadius(skyZoomRatio()),
      read: Math.round(document.querySelector("#sky-readbox").getBoundingClientRect().height) };
  });
  await page.evaluate(() => skyDraw());
  const s2 = await page.evaluate(SHOT);           /* the same state, drawn again */
  const cIdle = compare(s1, idle), cAB = compare(s1, s2);
  check("the resting canvas is not animating on its own",
    cIdle.same, `${cIdle.tiles} of 256 tiles differ over 900 idle ms`);
  check("and the frame the reader is looking at is the frame this state draws",
    cAB.same,
    `${cAB.tiles} of 256 tiles change the moment the same state is redrawn, worst ${cAB.worst.toFixed(2)} luma. ` +
    `The frame on screen carries ${stale.n} discs at ${stale.r.toFixed(3)}px; the same state now draws them at ` +
    `${stale.wouldBe.toFixed(3)}px (${(100 * (stale.wouldBe / Math.max(1e-6, stale.r) - 1)).toFixed(0)}% bigger). ` +
    `The camera is still fitted to the band it flew into — k ${stale.camK.toFixed(0)} against a fit of ` +
    `${stale.fitK.toFixed(0)} — with the readout now ${stale.read}px tall and the safe band ${stale.safeH.toFixed(0)}px`);

  /* (b) typed twice in the same page, with the whole atlas in between */
  await page.evaluate(() => { location.hash = "#/sky"; });
  await page.waitForTimeout(SETTLE);
  await find(page, OWNER);
  const s3 = await page.evaluate(SHOT);
  const cA3 = compare(s1, s3);
  check("the same sentence typed twice into the same page draws the same sky",
    cA3.same, `sha ${digest(s1.url).slice(0, 12)} vs ${digest(s3.url).slice(0, 12)}, ` +
    `${cA3.tiles} of 256 tiles differ, ${cA3.cells} of ${96 * 56} luma cells, worst ${cA3.worst.toFixed(3)} luma`);

  /* (c) two cold loads of the same address in two fresh contexts */
  const shots = [];
  for (let i = 0; i < 2; i++) {
    const f = await fresh();
    await open(f.page, "#/find/" + encodeURIComponent(OWNER));
    await f.page.waitForFunction("!window.__ATLAS_SKY__.state().forming", null, { timeout: 30000 }).catch(() => {});
    await f.page.waitForTimeout(1200);
    shots.push(await f.page.evaluate(SHOT));
    await f.ctx.close();
  }
  const cCold = compare(shots[0], shots[1]);
  check("two cold loads of the same address are byte-identical",
    cCold.same,
    `sha ${digest(shots[0].url).slice(0, 12)} vs ${digest(shots[1].url).slice(0, 12)}, ` +
    `${(shots[0].url.length / 1024).toFixed(0)} KB of PNG, ${cCold.tiles} of 256 tiles differ, ` +
    `${cCold.cells} of ${96 * 56} luma cells, worst ${cCold.worst.toFixed(3)} luma`);
  control("half a pixel of camera is seen",
    await page.evaluate((SH) => {
      const shot = new Function("return (" + SH + ")()");
      const a = shot();
      sky.cam.cx += 0.5 / sky.cam.k; skyDraw();
      const b = shot();
      sky.cam.cx -= 0.5 / sky.cam.k; skyDraw();
      return a.url === b.url;
    }, SHOT.toString()), "the comparison is a PNG byte compare, so it cannot miss one");
}

/* ══ 7. THE PICTURE UNDER THE SLATE ══════════════════════════════════════
   AGENTS.md: "Measuring one class of overlap is not measuring overlap." The
   readout is an opaque standing panel and the constellation is behind it, so
   the question is not whether the panel fits the field — find-probe.mjs checks
   that — but how much of the answer it is standing on. Asked of the page
   rather than of a rectangle: elementFromPoint at every disc centre, which is
   also the test of whether that film can be clicked. */
head("7. how much of the constellation the slate is standing on");
{
  for (const vp of [{ width: 1440, height: 900 }, { width: 900, height: 820 }, { width: 390, height: 780 }]) {
    const f = await fresh(vp);
    await open(f.page, "#/find/" + encodeURIComponent(OWNER));
    const st = await f.page.evaluate(() => {
      const c = document.getElementById("sky-c"), base = c.getBoundingClientRect();
      const rb = document.querySelector("#sky-readbox"), rr = rb.getBoundingClientRect();
      const cs = getComputedStyle(rb);
      const k = sky.cam.k, ox = sky.w / 2 - sky.cam.cx * k, oy = sky.h / 2 - sky.cam.cy * k;
      let covered = 0, offCanvas = 0;
      const step = 4;
      let sampled = 0;
      for (let i = 0; i < sky.n; i += step) {
        const x = sky.wx[i] * k + ox + base.left, y = sky.wy[i] * k + oy + base.top;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { offCanvas++; continue; }
        sampled++;
        const el = document.elementFromPoint(x, y);
        if (el && el.id !== "sky-c") covered++;
      }
      return { covered, sampled, offCanvas, panel: cs.backgroundColor, blur: cs.backdropFilter,
        panelBox: [Math.round(rr.width), Math.round(rr.height)],
        canvas: [sky.w, sky.h], camK: +sky.cam.k.toFixed(1), fitK: +skyFitK().toFixed(1) };
    });
    const pct = 100 * st.covered / Math.max(1, st.sampled);
    check(`${vp.width}x${vp.height}: the answer is not behind the panel that describes it`,
      pct <= 10,
      `${st.covered} of ${st.sampled} sampled film positions (${pct.toFixed(1)}%) return the slate rather than ` +
      `the canvas from elementFromPoint — panel ${st.panelBox[0]}x${st.panelBox[1]}px, ` +
      `background ${st.panel}, ${st.offCanvas} films off-screen entirely`);
    check(`${vp.width}x${vp.height}: the constellation uses the room it has`,
      st.camK >= st.fitK * 0.75,
      `camera k ${st.camK} against a fit of ${st.fitK} — the disc is drawn at ` +
      `${(100 * st.camK / st.fitK).toFixed(0)}% of the scale this frame would give it`);
    await f.ctx.close();
  }
}

/* ══ 8. THE CONSOLE ══════════════════════════════════════════════════════ */
head("8. the console");
{
  check("nothing was logged as an error", errs.length === 0,
    errs.length ? errs.slice(0, 3).join(" | ") : "0 errors over the whole run");
  const atlasWarns = warns.filter((w) => /\[atlas\]/.test(w));
  check("and the page raised no warning about its own picture", atlasWarns.length === 0,
    atlasWarns.length ? `${atlasWarns.length}: ` + atlasWarns.slice(0, 2).join(" | ") : `0 of ${warns.length} warnings`);
  control("an injected error is seen",
    await (async () => { const before = errs.length; await page.evaluate(() => console.error("control: deliberate")); await page.waitForTimeout(200); return errs.length === before; })(),
    "the console listener is live");
}

await ctxA.close();
await browser.close();

if (CONTROLS) say(`\ncontrols ${controlsRun} run, ${controlsDead} failed to fire`);
console.log("\n" + (failures ? `SEARCH FAIL — ${failures} of ${checks} check(s)` : `SEARCH PASS — ${checks} checks`));
process.exit(failures ? 1 : 0);
