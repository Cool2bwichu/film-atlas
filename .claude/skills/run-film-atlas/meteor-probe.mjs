#!/usr/bin/env node
/* meteor-probe.mjs — measure and photograph the night sky's meteors in real
 * Chromium. Never jsdom (atlas/STATE.md: it passed a black page twice).
 *
 *   node scratchpad/meteor-probe.mjs                 # against public/atlas.html
 *   ATLAS_HTML=... node scratchpad/meteor-probe.mjs  # negative control
 */
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

const UNIT = "/home/user/film-atlas";
const ART = process.env.ATLAS_HTML || join(UNIT, "public/atlas.html");
const SHOTS = process.env.ATLAS_SHOTS || join(UNIT, ".atlas-shots");
const WORLD = "cold-science-fiction";
mkdirSync(SHOTS, { recursive: true });

const url = pathToFileURL(resolve(ART)).href;
const out = [];
const say = (...a) => { console.log(...a); out.push(a.join(" ")); };

async function openPage(browser, { w = 1440, h = 900, dpr = 2, reduced = "no-preference" } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: reduced,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  await page.route("**/*", r => (r.request().resourceType() === "image" ? r.abort() : r.continue()));
  await page.goto(url + "#/sky", { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("typeof KEYS!=='undefined' && KEYS.length>0", null, { timeout: 60000 });
  await page.waitForFunction("sky.ready && sky.n>0", null, { timeout: 60000 });
  await page.waitForTimeout(1800);
  return { page, ctx, errors };
}

async function chooseWorld(page) {
  await page.evaluate(id => skyWorldChoose(id), WORLD);
  await page.waitForTimeout(1600);
}

/* Wrap skyDraw so every paint is timed at its own call site. A top-level
   function declaration in a classic script is a window property, so the
   assignment is what skyFrame's own `skyDraw()` resolves to. Verified by the
   count being non-zero. */
const INSTRUMENT = `(() => {
  if (window.__drawT) return "already";
  window.__drawT = []; window.__drawMet = [];
  const real = window.skyDraw;
  window.skyDraw = function(){
    const a = performance.now(); real.apply(this, arguments); const b = performance.now();
    window.__drawT.push(b-a); window.__drawMet.push(sky.meteor?1:0);
    return undefined;
  };
  return "wrapped";
})()`;

const stats = a => {
  const s = [...a].sort((x, y) => x - y);
  return { n: a.length, mean: a.reduce((p, c) => p + c, 0) / (a.length || 1), p50: s[s.length >> 1], worst: s[s.length - 1] };
};
const f2 = x => (x === undefined ? "n/a" : x.toFixed(2));

/* ── the star check, and its negative control ─────────────────────────────
   The 40 brightest stars are recomputed from SKY_STARS and the camera, then
   the canvas is sampled at exactly those pixels. It cannot be satisfied by a
   canvas that merely has ink on it, and on the untreated whole atlas — where
   the star block is a branch not taken — it must report ~0.

   IT ASKS FOR THE STAR'S COLOUR AND NOT MERELY FOR BRIGHTNESS, AND THAT IS A
   REPAIR RATHER THAN A LOOSENING. A brightness threshold of 45 was enough
   while the resting atlas was near-black everywhere a star was not. The print's
   integration pass put ambient light across the whole plate, and the negative
   control went from ~0 to 11 of 39 — pixels that are bright because the atlas
   is now lit, not because a star is there — which is the control TELLING you
   it had stopped discriminating. Raising the threshold would have been fitting
   the check to the change. What a star actually is, is #DCE6F2: blue minus red
   of +22, in a page whose whole palette is settled at blue-minus-red NEGATIVE
   (DESIGN.md, "the ground is almost pure black, and it is warm"). So the check
   asks for a COOL bright pixel, which the halation of a warm plate cannot
   counterfeit and a star cannot fail. Measured after the repair: night sky
   39 of 39, whole atlas 1 of 39. */
const STAR_CHECK = `(() => {
  const st=SKY_STARS, cam=sky.cam, w=sky.w, h=sky.h, dpr=sky.dpr;
  const PX=110;
  let pu=(-cam.cx*PX/Math.max(1,w))%1, pv=(-cam.cy*PX/Math.max(1,h))%1;
  if(pu<0)pu+=1; if(pv<0)pv+=1;
  const idx=[...Array(st.N).keys()].sort((a,b)=>st.al[b]-st.al[a]).slice(0,40);
  const c=document.getElementById("sky-c");
  const g=c.getContext("2d",{willReadFrequently:true});
  const d=g.getImageData(0,0,c.width,c.height).data;
  let lit=0, tested=0;
  for(const i of idx){
    let x=st.u[i]+pu; if(x>=1)x-=1;
    let y=st.v[i]+pv; if(y>=1)y-=1;
    x*=w*dpr; y*=h*dpr;
    const px=Math.round(x), py=Math.round(y);
    if(px<2||py<2||px>=c.width-2||py>=c.height-2) continue;
    tested++;
    let best=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const o=((py+dy)*c.width+(px+dx))*4;
      const v=(d[o]+d[o+1]+d[o+2])/3;
      /* bright AND cool: a star is #DCE6F2, b-r = +22, on a page whose ground
         and whose halation are both warm (b-r negative). */
      if(v>=45 && d[o+2]-d[o]>=6 && v>best) best=v;
    }
    if(best>=45) lit++;
  }
  return { tested, lit };
})()`;

async function timeDraws(page, frames, mode) {
  return page.evaluate(async ({ n, mode }) => {
    const t = [];
    for (let i = 0; i < n; i++) {
      if (mode === "meteor") { if (!sky.meteor) sky.meteorAt = performance.now() - 1; }
      if (mode === "quiet") sky.meteorAt = performance.now() + 1e7;
      await new Promise(r => requestAnimationFrame(r));
      const a = performance.now(); window.__realDraw(); const b = performance.now();
      t.push(b - a);
    }
    return t;
  }, { n: frames, mode });
}

async function main() {
  const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });
  let bad = 0;
  const F = m => { console.error("  FAIL: " + m); bad++; };

  /* ══ 1. GEOMETRY OF THE PATH, sampled from the real generator ══════════ */
  {
    const { page, ctx, errors } = await openPage(browser);
    await chooseWorld(page);
    for (const [w, h] of [[1440, 900], [900, 820], [390, 780]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(700);
      const g = await page.evaluate(N => {
        const save = { m: sky.meteor, at: sky.meteorAt };
        const W = sky.w, H = sky.h, D = Math.hypot(W, H);
        const m0 = Math.max(26, 0.028 * D), m1 = Math.max(26, 0.030 * D);
        const r = [];
        for (let i = 0; i < N; i++) {
          sky.meteor = null; sky.meteorAt = 1;
          const m = skyMeteorStep(2, W, H);
          const ex = m.x0 + m.ux * m.len, ey = m.y0 + m.uy * m.len;
          /* head-in-frame share of the LIFE, through the same easing skyDraw
             uses: e = 1-(1-p)^1.22  =>  p = 1-(1-e)^(1/1.22) */
          const pOf = e => 1 - Math.pow(1 - e, 1 / 1.22);
          const share = pOf((m0 + (m.inside * m.len)) / m.len) - pOf(m0 / m.len);
          const inside = (x, y) => x >= 0 && x <= W && y >= 0 && y <= H;
          /* How much of the crossing lands in the band the reader can
             actually see, and the counterfactual: the same path family
             centred on the middle of the CANVAS instead. */
          const band = (() => { const c = skyChrome(); let top = 0, bot = sky.h;
            for (const b of c) { if (b.y + b.h / 2 < sky.h * 0.42) top = Math.max(top, b.y + b.h); else bot = Math.min(bot, b.y); }
            return (bot - top < 140) ? { top: 0, bot: sky.h } : { top, bot }; })();
          const inBand = (x0, y0) => {
            let ta = -Infinity, tb = Infinity;
            const P = [-m.ux, m.ux, -m.uy, m.uy], Q = [x0, W - x0, y0 - band.top, band.bot - y0];
            for (let q = 0; q < 4; q++) {
              const pp = P[q], qq = Q[q];
              if (Math.abs(pp) < 1e-9) { if (qq < 0) return 0; continue; }
              const rr = qq / pp;
              if (pp < 0) { if (rr > tb) return 0; if (rr > ta) ta = rr; }
              else { if (rr < ta) return 0; if (rr < tb) tb = rr; }
            }
            return Math.max(0, tb - ta);
          };
          const shift = sky.h / 2 - (band.top + band.bot) / 2;
          r.push({
            ang: Math.atan2(m.uy, m.ux), len: m.len, ms: m.ms, ins: m.inside, share,
            startIn: inside(m.x0, m.y0), endIn: inside(ex, ey),
            chord: m.inside * m.len,
            vis: inBand(m.x0, m.y0),
            visCanvasCentred: inBand(m.x0, m.y0 + shift),
            band: band.bot - band.top,
          });
        }
        sky.meteor = save.m; sky.meteorAt = save.at;
        return { W, H, D, m0, m1, r };
      }, 20000);

      const R = g.r;
      const bins = new Array(36).fill(0);
      for (const x of R) bins[Math.min(35, Math.floor(((x.ang + Math.PI) / (2 * Math.PI)) * 36))]++;
      const exp = R.length / 36;
      const chi = bins.reduce((p, c) => p + (c - exp) ** 2 / exp, 0);
      const share = stats(R.map(x => x.share));
      const ins = stats(R.map(x => x.ins));
      const ch = stats(R.map(x => x.chord));
      const ms = stats(R.map(x => x.ms));
      const anyIn = R.filter(x => x.startIn || x.endIn).length;

      say(`\n  ${g.W}x${g.H}  (diagonal ${g.D.toFixed(0)}px, margins ${g.m0.toFixed(0)}/${g.m1.toFixed(0)}px)`);
      say(`    direction      uniform over 360 deg, chi2=${chi.toFixed(1)} on 35 df (crit 49.8 at p=.05), 36 bins min ${Math.min(...bins)} max ${Math.max(...bins)}`);
      say(`    chord in frame min ${ch.worst !== undefined ? Math.min(...R.map(x => x.chord)).toFixed(0) : "?"}px  median ${ch.p50.toFixed(0)}px  max ${ch.worst.toFixed(0)}px   (floor 0.75*min(w,h) = ${(0.75 * Math.min(g.W, g.H)).toFixed(0)}px)`);
      say(`    path inside    min ${(Math.min(...R.map(x => x.ins)) * 100).toFixed(1)}%  mean ${(ins.mean * 100).toFixed(1)}% of the path length`);
      say(`    head on screen min ${(Math.min(...R.map(x => x.share)) * 100).toFixed(1)}%  mean ${(share.mean * 100).toFixed(1)}% of its LIFE`);
      say(`    life           ${ms.p50.toFixed(0)}ms median, ${Math.min(...R.map(x => x.ms)).toFixed(0)}-${ms.worst.toFixed(0)}ms`);
      const vis = stats(R.map(x => x.vis)), visC = stats(R.map(x => x.visCanvasCentred));
      say(`    seen band      ${R[0].band.toFixed(0)}px of ${g.H.toFixed(0)}px is not under chrome; crossing inside it: mean ${vis.mean.toFixed(0)}px, ${(100 * R.filter(x => x.vis < 120).length / R.length).toFixed(1)}% under 120px`);
      say(`                   same family centred on the CANVAS instead: mean ${visC.mean.toFixed(0)}px, ${(100 * R.filter(x => x.visCanvasCentred < 120).length / R.length).toFixed(1)}% under 120px  [counterfactual]`);
      say(`    endpoints inside the frame: ${anyIn} of ${R.length}`);

      if (chi > 75) F(`direction not uniform, chi2 ${chi.toFixed(1)}`);
      if (anyIn !== 0) F(`${anyIn} meteors begin or end inside the frame`);
      if (Math.min(...R.map(x => x.share)) < 0.6) F(`a meteor spends under 60% of its life on screen`);
      if (Math.min(...R.map(x => x.chord)) < 0.749 * Math.min(g.W, g.H)) F(`chord floor breached`);
    }
    if (errors.length) F("console: " + errors.join(" | "));
    await ctx.close();
  }

  /* ══ 2. COST ══════════════════════════════════════════════════════════ */
  {
    const { page, ctx, errors } = await openPage(browser);
    await page.evaluate(`window.__realDraw = window.skyDraw`);
    const cost = {};

    /* control first: the untreated whole atlas */
    cost.atlas = await timeDraws(page, 40, "plain");
    const starsOff = await page.evaluate(STAR_CHECK);

    await chooseWorld(page);
    const n = await page.evaluate(() => skyLiveCount());
    cost.quiet = await timeDraws(page, 40, "quiet");
    cost.meteor = await timeDraws(page, 40, "meteor");
    const starsOn = await page.evaluate(STAR_CHECK);

    say(`\n  skyDraw, 1440x900 at dpr 2, software rasteriser, 40 frames each`);
    for (const [k, label] of [["atlas", `whole atlas, no treatment (2204)  [control]`],
                              ["quiet", `night sky, between meteors (${n})`],
                              ["meteor", `night sky, meteor in flight (${n})`]]) {
      const s = stats(cost[k]);
      say(`    ${label.padEnd(42)} mean ${f2(s.mean)} ms   worst ${f2(s.worst)} ms`);
    }
    const mA = stats(cost.atlas).mean, mM = stats(cost.meteor).mean;
    say(`    meteor frame vs untreated whole atlas: ${(mM / mA).toFixed(2)}x`);
    if (mM >= mA) F(`a meteor frame (${f2(mM)}ms) is not cheaper than the untreated atlas (${f2(mA)}ms)`);

    say(`\n  star field painted where the seed says it should be`);
    say(`    night sky      ${starsOn.lit} of ${starsOn.tested} of the 40 brightest stars lit`);
    say(`    whole atlas    ${starsOff.lit} of ${starsOff.tested}   [negative control - the block is not taken]`);
    if (starsOn.tested < 20 || starsOn.lit / starsOn.tested < 0.9) F(`star field not painted (${starsOn.lit}/${starsOn.tested})`);
    if (starsOff.lit / Math.max(1, starsOff.tested) > 0.25) F(`the star check passes on a view with no star field - it proves nothing`);

    /* ── idle draws: the battery budget ─────────────────────────────── */
    const count = async (ms) => {
      await page.evaluate(INSTRUMENT);
      await page.evaluate(`__drawT.length=0; __drawMet.length=0`);
      await page.waitForTimeout(ms);
      return page.evaluate(`({ n: __drawT.length, met: __drawMet.reduce((p,c)=>p+c,0) })`);
    };
    const idleSky = await count(3000);
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { get: () => true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    const idleHidden = await count(3000);
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { get: () => false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { location.hash = "#/"; });
    await page.waitForTimeout(900);
    const idleWall = await count(3000);
    await page.evaluate(() => { location.hash = "#/sky"; });
    await page.waitForTimeout(1600);
    await page.evaluate(() => skyClearFacets());
    await page.waitForTimeout(1600);
    const idleAtlas = await count(3000);

    say(`\n  idle draws in 3 s`);
    say(`    night sky selected, tab visible   ${idleSky.n}   (${idleSky.met} of them with a meteor up)`);
    say(`    same, tab hidden                  ${idleHidden.n}`);
    say(`    view is the wall, not the sky     ${idleWall.n}`);
    say(`    whole atlas, no treatment         ${idleAtlas.n}`);
    if (idleHidden.n !== 0) F(`the clock runs with the tab hidden (${idleHidden.n} draws)`);
    if (idleWall.n !== 0) F(`the clock runs off the sky view (${idleWall.n} draws)`);
    if (idleAtlas.n !== 0) F(`the untreated whole atlas repaints (${idleAtlas.n} draws)`);
    if (idleSky.n < 40) F(`the night sky is not running (${idleSky.n} draws in 3 s)`);
    if (errors.length) F("console: " + errors.join(" | "));
    await ctx.close();
  }

  /* ══ 3. prefers-reduced-motion ════════════════════════════════════════ */
  {
    const { page, ctx, errors } = await openPage(browser, { reduced: "reduce" });
    await chooseWorld(page);
    await page.evaluate(INSTRUMENT);
    const forced = await page.evaluate(() => {
      sky.meteorAt = performance.now() - 1;
      window.__realDraw = window.__realDraw || skyDraw;
      skyDraw();
      return { meteor: !!sky.meteor, step: skyMeteorStep(performance.now(), sky.w, sky.h) };
    });
    await page.evaluate(`__drawT.length=0`);
    await page.waitForTimeout(3000);
    const draws = await page.evaluate(`__drawT.length`);
    const starsRM = await page.evaluate(STAR_CHECK);
    say(`\n  prefers-reduced-motion: reduce`);
    say(`    meteor after forcing one due      ${forced.meteor ? "SPAWNED" : "none"} (skyMeteorStep -> ${forced.step === null ? "null" : "object"})`);
    say(`    idle draws in 3 s                 ${draws}`);
    say(`    static sky still arrives          ${starsRM.lit} of ${starsRM.tested} of the 40 brightest stars lit`);
    if (forced.meteor || forced.step !== null) F("reduced motion still produces a meteor");
    if (draws !== 0) F(`reduced motion still repaints (${draws} draws)`);
    if (starsRM.tested < 20 || starsRM.lit / starsRM.tested < 0.9) F(`reduced motion lost the static sky (${starsRM.lit}/${starsRM.tested})`);
    if (errors.length) F("console: " + errors.join(" | "));
    await ctx.close();
  }

  /* ══ 4. STILL FRAMES ══════════════════════════════════════════════════ */
  const shoot = async (opts, name, want) => {
    const { page, ctx, errors } = await openPage(browser, opts);
    await chooseWorld(page);
    const got = await page.evaluate(async ({ want }) => {
      /* Re-roll the REAL generator until it produces the case being inspected
         — a worst case is selected from the distribution, never hand-built. */
      const W = sky.w, H = sky.h;
      let m = null, tries = 0;
      const cen = (() => {                      /* screen centroid of the live films */
        const k = sky.cam.k, ox = W / 2 - sky.cam.cx * k, oy = H / 2 - sky.cam.cy * k;
        let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < sky.n; i++) if (sky.live[i]) { sx += sky.wx[i] * k + ox; sy += sky.wy[i] * k + oy; n++; }
        return { x: sx / n, y: sy / n, n };
      })();
      for (; tries < 400000; tries++) {
        sky.meteor = null; sky.meteorAt = 1;
        m = skyMeteorStep(2, W, H);
        const ok = want.horiz ? Math.abs(m.uy) < 0.16 : (want.diag ? Math.abs(Math.abs(m.ux) - Math.abs(m.uy)) < 0.12 : true);
        /* perpendicular distance from the constellation's centroid to the path */
        const d = Math.abs((cen.x - m.x0) * m.uy - (cen.y - m.y0) * m.ux);
        if (ok && d < (want.near || 40)) break;
      }
      /* Hold the film nearest the middle of the constellation, so the frame
         being judged has real edges in it — 1.5px, coloured by type, joining
         two discs — for the meteor to be told apart from. */
      if (want.hold) {
        const k = sky.cam.k, ox = W / 2 - sky.cam.cx * k, oy = H / 2 - sky.cam.cy * k;
        let best = null, bd = Infinity;
        for (let i = 0; i < sky.n; i++) {
          if (!sky.live[i]) continue;
          const d = (sky.wx[i] * k + ox - cen.x) ** 2 + (sky.wy[i] * k + oy - cen.y) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        if (best != null) { sky.pinKey = sky.keys[best] || KEYS[best]; skyLabels(sky.pinKey); }
      }
      /* Put it back on the real clock at the requested point in its life and
         paint one real frame, then stop the idle clock so the screenshot is
         exactly that frame rather than whatever lands 200 ms later. */
      m.t0 = performance.now() - m.ms * want.p;
      sky.meteor = m;
      skyDraw(); skyPlaceLabels();
      if (sky.idle) clearTimeout(sky.idle);
      sky.idle = 1;                               /* truthy blocks skyIdleSchedule */
      const blurred = [...document.querySelectorAll("#sky-field *")]
        .filter(e => { const f = getComputedStyle(e).filter; return f && f !== "none" && /blur\(\s*(?!0)/.test(f); }).length;
      return { tries, ang: Math.round(Math.atan2(m.uy, m.ux) * 180 / Math.PI), ms: Math.round(m.ms), inside: +(m.inside * 100).toFixed(1), blurred, labels: sky.labels.length, films: cen.n };
    }, { want });
    await page.screenshot({ path: join(SHOTS, name + ".png") });
    say(`    ${name.padEnd(26)} ${opts.w || 1440}x${opts.h || 900}  ${String(got.ang).padStart(4)} deg  p=${want.p}  life ${got.ms}ms  ${got.inside}% of path in frame  ${got.films} films  ${got.labels} labels  blurred ${got.blurred}`);
    if (got.blurred) F(`${name}: ${got.blurred} blurred elements (rule 4)`);
    if (errors.length) F(`${name} console: ` + errors.join(" | "));
    await ctx.close();
  };

  say(`\n  still frames`);
  await shoot({ w: 1440, h: 900 }, "m1-horizontal-dense", { p: 0.42, horiz: true, near: 30, hold: true });
  await shoot({ w: 1440, h: 900 }, "m2-horizontal-entry", { p: 0.14, horiz: true, near: 30 });
  await shoot({ w: 1440, h: 900 }, "m3-any-direction", { p: 0.35, near: 60 });
  await shoot({ w: 900, h: 820 }, "m4-tablet-diagonal", { p: 0.40, diag: true, near: 60, hold: true });
  await shoot({ w: 390, h: 780 }, "m5-phone", { p: 0.38, near: 60 });

  await browser.close();
  say(`\n${bad ? "METEOR PROBE FAIL (" + bad + ")" : "METEOR PROBE PASS"}`);
  process.exitCode = bad ? 1 : 0;
}
main().catch(e => { console.error(e); process.exit(2); });
