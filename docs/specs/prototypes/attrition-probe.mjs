#!/usr/bin/env node
/*
  attrition-probe — measures the ATTRITION world-process prototype and proves
  its guarantees by breaking them. Run from the repo root:

      node docs/specs/prototypes/attrition-probe.mjs

  Gates (default build):
    G1  idle          0 repaints on either plate over 3s with no event in flight
    G2  cost          field draw + wear rebuild, mean/worst over 40 forced draws
    G3  event         a sparkle event repaints the WEAR plate only — field 0
    G4  luma          wear at ceiling moves composited luma at film centres by
                      no more than the room tint's own under-disc precedent
    G5  independence  tramline x positions consistent with uniform vs the films
    G6  frame-pinned  a pan moves every film and not one scratch
    G7  reduced       reduced motion: no events, no accrual, arrival wear stays
    G8  hidden        hidden tab: no events, no accrual
    G9  ceiling       accrual saturates at 9 tramlines, ink stops moving
    G10 one-shot      exit clears the wear; re-arrival is byte-identical
    G11 rule 4        the caption is DOM, unfiltered, above both plates

  Negative controls (each patches behaviour via a ?break= flag and must be
  REPORTED by the gate it defeats):
    break=graph      tramlines seeded from film positions      -> G5 fires
    break=light      wear composited over the discs            -> G4 fires
    break=unbounded  no accrual ceiling                        -> G9 fires
    break=reduced    events run under reduced motion           -> G7 fires
    break=hidden     events run while hidden                   -> G8 fires
    break=move       films jittered on wear events             -> G6-class fires
*/
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));
const URLBASE = "file://" + path.join(here, "attrition.html");
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const fails = [];
let controlsFailed = 0;
const gate = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch();
async function open(params = "", rm = false) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: rm ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  await page.goto(URLBASE + (params ? "?" + params : ""));
  await page.waitForFunction("!!window.protoAPI");
  return page;
}
const api = (page, expr) => page.evaluate("window.protoAPI." + expr);

console.log("\n== attrition-probe · 1440x900 · dpr 2 · software raster ==\n");

/* ── default build ─────────────────────────────────────────────────────── */
{
  const page = await open();
  await api(page, "pause()");

  // G1 idle
  const c0 = await api(page, "counters()");
  await page.waitForTimeout(3000);
  const c1 = await api(page, "counters()");
  gate("G1 idle", c1.wear === c0.wear && c1.field === c0.field,
    `repaints in 3s: wear ${c1.wear - c0.wear}, field ${c1.field - c0.field}`);

  // G2 cost
  const tf = await api(page, "timeField(40)");
  const tw = await api(page, "timeWear(40)");
  gate("G2 cost", mean(tw) < mean(tf),
    `field ${mean(tf).toFixed(2)}ms mean / ${Math.max(...tf).toFixed(1)} worst · ` +
    `wear ${mean(tw).toFixed(2)}ms mean / ${Math.max(...tw).toFixed(1)} worst`);

  // G3 event repaints wear only
  const b0 = await api(page, "counters()");
  await api(page, "forceEvent()");
  await page.waitForTimeout(600);
  const b1 = await api(page, "counters()");
  const wearN = b1.wear - b0.wear, fieldN = b1.field - b0.field;
  gate("G3 event", fieldN === 0 && wearN >= 3 && wearN <= 10,
    `one sparkle event: ${wearN} wear repaints, ${fieldN} field repaints`);

  // G6 frame-pinned (before accruals change the wear)
  const wearA = await api(page, "wearDataURL()");
  const filmsA = await api(page, "filmScreenXY()");
  await api(page, "pan(80,50)");
  const wearB = await api(page, "wearDataURL()");
  const filmsB = await api(page, "filmScreenXY()");
  const dx = mean(filmsA.map((p, i) => filmsA[i][0] - filmsB[i][0]));
  gate("G6 frame-pinned", wearA === wearB && Math.abs(dx - 80) < 0.5,
    `pan(80,50): wear plate ${wearA === wearB ? "unmoved" : "MOVED"}, films moved ${dx.toFixed(1)}px`);
  await api(page, "pan(-80,-50)");

  // G9 ceiling
  let adds = 0;
  while (await api(page, "forceAccrual()")) adds++;
  const tramN = await api(page, "tramCount()");
  const ink1 = await api(page, "inkPct()");
  await api(page, "forceAccrual()"); await api(page, "forceAccrual()");
  const ink2 = await api(page, "inkPct()");
  gate("G9 ceiling", tramN === 9 && ink1 === ink2,
    `${adds} accruals accepted, ${tramN} tramlines, ink ${ink1.toFixed(3)}% then ${ink2.toFixed(3)}%`);

  // G4 luma at films, wear at ceiling vs no wear at all
  const lumaWear = await api(page, "lumaAtFilms()");
  const inkCeil = ink1;
  const ctl = await open("nowear=1");
  const lumaCtl = await api(ctl, "lumaAtFilms()");
  const inkNone = await api(ctl, "inkPct()");
  const dl = lumaWear.map((v, i) => v - lumaCtl[i]);
  const worst = Math.max(...dl.map(Math.abs));
  gate("G4 luma", worst <= 3.0,
    `max |dLuma| at 49 film centres, ceiling wear vs none: ${worst.toFixed(2)} of 255 ` +
    `(ink ${inkNone.toFixed(3)}% -> ${inkCeil.toFixed(3)}%)`);
  await ctl.context().close();

  // G5 independence (at ceiling: 9 tramlines).
  // The null model must be the generator's own: scratches GANG (50% arrive
  // within ±1% of an existing line), so a uniform-independent null is the
  // wrong distribution — the first version of this gate failed an innocent
  // build for exactly that reason. The statistic is "lines sitting dead on a
  // film's x" (within 0.75px), which a graph-seeded build maxes out.
  const tramXs = await api(page, "tramXs()");
  const filmXs = filmsA.map(p => p[0]);
  const ap = await api(page, "ap()");
  const onFilm = xs => xs.filter(x => Math.min(...filmXs.map(f => Math.abs(x - f))) < 0.75).length;
  const simGang = n => {
    const us = [];
    for (let i = 0; i < n; i++) {
      const u = (us.length && Math.random() < 0.5)
        ? Math.min(0.99, Math.max(0.01, us[Math.floor(Math.random() * us.length)] + (Math.random() - 0.5) * 0.02))
        : Math.random();
      us.push(u);
    }
    return us.map(u => ap.x + u * ap.w);
  };
  const observed = onFilm(tramXs);
  const mc = [];
  for (let t = 0; t < 4000; t++) mc.push(onFilm(simGang(tramXs.length)));
  mc.sort((a, b) => a - b);
  const hi = mc[Math.floor(mc.length * 0.995)];
  gate("G5 independence", observed <= hi,
    `${observed} of ${tramXs.length} tramlines within 0.75px of a film; ganged-null 99.5% ceiling ${hi}`);

  // G10 one-shot / determinism
  await api(page, "arriveAgain()");
  const arr1 = await api(page, "wearDataURL()");
  await api(page, "exitWorld()");
  const gone = await page.evaluate(() => {
    const c = document.getElementById("wear");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
    return true;
  });
  await api(page, "arriveAgain()");
  const arr2 = await api(page, "wearDataURL()");
  gate("G10 one-shot", gone && arr1 === arr2,
    `exit leaves a blank plate: ${gone}; second arrival byte-identical: ${arr1 === arr2}`);

  // G11 rule 4
  gate("G11 rule 4", await api(page, "captionSharp()"),
    "caption is DOM, filter:none, above both plates");

  await page.context().close();
}

/* G7 reduced · G8 hidden — their own pages, accelerated clock */
{
  const page = await open("clock=40", true);
  await page.waitForTimeout(4000);                       // 160s of governed time
  const c = await api(page, "counters()");
  const tram = await api(page, "tramCount()");
  gate("G7 reduced", c.events === 0 && c.accruals === 0 && tram === 3,
    `160s governed under reduced motion: ${c.events} events, ${c.accruals} accruals, ${tram} arrival tramlines still standing`);
  await page.context().close();
}
{
  const page = await open("clock=40&hold=1");
  await api(page, "setHidden(true)");
  await api(page, "resume()");
  await page.waitForTimeout(4000);
  const c = await api(page, "counters()");
  gate("G8 hidden", c.events === 0 && c.accruals === 0,
    `160s governed while hidden: ${c.events} events, ${c.accruals} accruals`);
  await page.context().close();
}

/* 60s of real time on the default build — the standing event budget */
{
  const page = await open();
  const c0 = await api(page, "counters()");
  await page.waitForTimeout(60000);
  const c1 = await api(page, "counters()");
  console.log(`  --    budget  60s at rest: ${c1.wear - c0.wear} wear repaints across ` +
    `${c1.events - c0.events} sparkle events, ${c1.field - c0.field} field repaints, ` +
    `${c1.accruals - c0.accruals} accruals`);
  gate("G3b field never repaints", c1.field - c0.field === 0,
    "the process cannot touch the graph plate");
  await page.context().close();
}

/* ── negative controls ─────────────────────────────────────────────────── */
console.log("\n== negative controls — each break must be REPORTED ==\n");
const control = (name, ok, detail) => {
  console.log(`  ${ok ? "FIRED" : "NOT-FIRED"}  ${name}  ${detail}`);
  if (!ok) controlsFailed++;
};

{
  const page = await open("break=graph");
  await api(page, "pause()");
  while (await api(page, "forceAccrual()"));
  const tramXs = await api(page, "tramXs()");
  const filmXs = (await api(page, "filmScreenXY()")).map(p => p[0]);
  const on = tramXs.filter(x => Math.min(...filmXs.map(f => Math.abs(x - f))) < 0.75).length;
  control("break=graph -> G5", on === tramXs.length, `${on} of ${tramXs.length} tramlines dead on a film`);
  await page.context().close();
}
{
  const page = await open("break=light");
  await api(page, "pause()");
  while (await api(page, "forceAccrual()"));
  const lumaWear = await api(page, "lumaAtFilms()");
  const ctl = await open("nowear=1");
  const lumaCtl = await api(ctl, "lumaAtFilms()");
  const worst = Math.max(...lumaWear.map((v, i) => Math.abs(v - lumaCtl[i])));
  control("break=light -> G4", worst > 3.0, `max |dLuma| at films ${worst.toFixed(2)} of 255`);
  await ctl.context().close(); await page.context().close();
}
{
  const page = await open("break=unbounded");
  await api(page, "pause()");
  for (let i = 0; i < 12; i++) await api(page, "forceAccrual()");
  const n = await api(page, "tramCount()");
  control("break=unbounded -> G9", n > 9, `${n} tramlines after 12 accruals`);
  await page.context().close();
}
{
  const page = await open("break=reduced&clock=40", true);
  await page.waitForTimeout(4000);
  const c = await api(page, "counters()");
  control("break=reduced -> G7", c.events > 0 || c.accruals > 0,
    `${c.events} events, ${c.accruals} accruals under reduced motion`);
  await page.context().close();
}
{
  const page = await open("break=hidden&clock=40&hold=1");
  await api(page, "setHidden(true)");
  await api(page, "resume()");
  await page.waitForTimeout(4000);
  const c = await api(page, "counters()");
  control("break=hidden -> G8", c.events > 0 || c.accruals > 0,
    `${c.events} events, ${c.accruals} accruals while hidden`);
  await page.context().close();
}
{
  const page = await open("break=move");
  await api(page, "pause()");
  const a = await api(page, "filmScreenXY()");
  await api(page, "forceEvent()");
  await page.waitForTimeout(500);
  const b = await api(page, "filmScreenXY()");
  const moved = Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
  control("break=move -> films moved", moved > 0.05, `worst film displacement ${moved.toFixed(2)}px`);
  await page.context().close();
}

await browser.close();
console.log(`\n${fails.length === 0 && controlsFailed === 0 ? "ATTRITION-PROBE PASS" :
  "ATTRITION-PROBE FAIL"} — ${fails.length} gate failure(s) [${fails.join(", ")}], ` +
  `${controlsFailed} control(s) not fired\n`);
process.exit(fails.length || controlsFailed ? 1 : 0);
