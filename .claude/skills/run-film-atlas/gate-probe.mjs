#!/usr/bin/env node
/* gate-probe.mjs — ASK THE PAGE WHAT IT DREW.
 *
 *   node .claude/skills/run-film-atlas/gate-probe.mjs
 *   ATLAS_HTML=/tmp/broken.html node .../gate-probe.mjs      # negative control
 *
 * WHY THIS EXISTS.
 * The aperture shipped 317px wrong on every ordinary route into the whole
 * atlas for a day, under a build gate that reported it correct "at three
 * viewports to 0.000px". That gate called skyGate() and compared it with
 * itself, so it proved the function was deterministic and proved nothing about
 * the picture: the drawn rectangle lives in `sky.gate` and in four --ap-*
 * custom properties, and those are what a reader sees.
 *
 * So every number below is read off the LIVE PAGE after it has settled:
 *
 *   drawn    sky.gate            the object skyDraw used
 *   css      --ap-x/y/w/h        what the gate edge is actually painted from
 *   correct  skyGate()           what the chrome on screen says it should be
 *
 * and the run fails if any pair disagrees by more than 1.5px. It also walks a
 * Passage by hand — start, route, override the posture by re-opening the
 * strip, clear — because the strip covering the route's own title was the
 * other defect that a still frame and a DOM assertion both passed.
 *
 * PROVING IT STILL WORKS. Patch the fixed guard back out of a built artifact
 * and re-run; 9 of the 24 routes go red at the drifts recorded in DESIGN.md,
 * "The gate is keyed to the chrome MEASUREMENT":
 *
 *   perl -0pe 's/if \(!sky\.gate \|\| skyGateV!==skyChromeV\) skyGateApply\(\);/
 *              if (!sky.chrome || !sky.gate) skyGateApply();/;
 *              s/  skyGateApply\(\);\n  return out;\n\}/  return out;\n}/' \
 *     public/atlas.html > /tmp/atlas-stalegate.html
 *   ATLAS_HTML=/tmp/atlas-stalegate.html node .../gate-probe.mjs
 *   #   cold #/sky   1004x733 at y=0   vs   687x502 at y=153   drift 316.7
 *   #   GATE FAIL — 9 of 24 routes drew an aperture that is not skyGate()
 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = resolve(HERE, "../../..");
const ARTIFACT = process.env.ATLAS_HTML || join(UNIT, "public/atlas.html");
if (!existsSync(ARTIFACT)) {
  console.error(`No artifact at ${ARTIFACT}\n  build it:  node atlas/app/build.js --out public/atlas.html`);
  process.exit(2);
}
const URL0 = pathToFileURL(ARTIFACT).href;
/* The constellation needs ~1.8s to paint and the arrival fit runs 950ms after
   that; 3.2s is the same settle the design review used. */
const SETTLE = Number(process.env.SETTLE || 3200);
const VIEWPORTS = [[1440,900],[900,820],[390,780]];
const PASSAGE = "#/passage/8/" + encodeURIComponent("prince of darkness");

const READ = `(() => {
  const four = o => o ? {x:o.x,y:o.y,w:o.w,h:o.h} : null;
  const g = window.sky && sky.gate ? four(sky.gate) : null;
  let want = null; try { want = four(skyGate()); } catch (e) {}
  const f = document.querySelector("#sky-field");
  const cs = f ? getComputedStyle(f) : null;
  const px = p => cs ? parseFloat(cs.getPropertyValue(p)) : NaN;
  const css = cs ? {x:px("--ap-x"),y:px("--ap-y"),w:px("--ap-w"),h:px("--ap-h")} : null;
  /* the on-screen extent of every film currently drawn — the ball, whose share
     of the aperture's width is the number the whole defect was visible in */
  let ball = null;
  if (window.sky && sky.n) {
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    const k=sky.cam.k, ox=sky.w/2-sky.cam.cx*k, oy=sky.h/2-sky.cam.cy*k;
    for (let i=0;i<sky.n;i++){
      if (sky.live && sky.live.length && !sky.live[i]) continue;
      const X=sky.wx[i]*k+ox, Y=sky.wy[i]*k+oy;
      if(X<x0)x0=X; if(X>x1)x1=X; if(Y<y0)y0=Y; if(Y>y1)y1=Y;
    }
    ball={w:x1-x0,h:y1-y0};
  }
  const box = s => { const n=document.querySelector(s); if(!n||n.hidden) return null;
    const r=n.getBoundingClientRect();
    return r.width&&r.height?{x:r.x,y:r.y,w:r.width,h:r.height}:null; };
  const names=["header","#sky-worlds","#sky-worlds-tab","#sky-readbox","#sky-stratum",".sky-ctl"];
  const boxes={}; let chrome=0;
  for(const s of names){ boxes[s]=box(s); if(boxes[s]) chrome+=boxes[s].w*boxes[s].h; }
  /* a title nobody can see is not a title: hit-test it rather than trust its box */
  const t=document.querySelector("#sky-read .t");
  let title=null;
  if(t){ const r=t.getBoundingClientRect();
    const hit=document.elementFromPoint(r.left+4,r.top+r.height/2);
    title={text:t.textContent.trim(), onscreen:r.top>=0&&r.bottom<=innerHeight,
           clear:!!hit&&(hit===t||t.contains(hit))}; }
  return {g,want,css,ball,boxes,title,chromePct:100*chrome/(innerWidth*innerHeight),
          route:!!(window.sky&&sky.passage.route)};
})()`;

const drift = (a,b) => (!a||!b) ? Infinity :
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.w-b.w),Math.abs(a.h-b.h));
const fmt = r => r ? `${Math.round(r.w)}x${Math.round(r.h)} at y=${Math.round(r.y)}` : "—";
function overlap(a,b){ if(!a||!b) return null;
  const w=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x), h=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
  return (w>0&&h>0)?`${Math.round(w)}x${Math.round(h)}`:null; }

const rows=[]; const problems=[];
const pad=(s,n)=>String(s).padEnd(n);

async function run(){
  const browser=await chromium.launch({args:["--disable-gpu","--no-sandbox"]});
  for (const [vw,vh] of VIEWPORTS){
    const ctx=await browser.newContext({viewport:{width:vw,height:vh},reducedMotion:"no-preference"});
    /* posters hang rather than fail in this container; blocking them is what
       makes the generated cells render (AGENTS rule 9) */
    await ctx.route("**/*", r => /^https?:/.test(r.request().url())
      && r.request().resourceType()==="image" ? r.abort() : r.continue());
    const page=await ctx.newPage();
    const settle=async()=>{
      await page.waitForFunction("window.sky && sky.ready && sky.n>0",null,{timeout:60000});
      await page.waitForTimeout(SETTLE);
    };
    const goto=async h=>{ await page.goto(URL0+h,{waitUntil:"domcontentloaded",timeout:60000}); await settle(); };
    const record=async(label,want={})=>{
      const r=await page.evaluate(READ);
      const d=drift(r.g,r.want), dc=drift(r.css,r.want);
      const ov=overlap(r.boxes["#sky-worlds"],r.boxes["#sky-readbox"]);
      const row={vp:`${vw}x${vh}`,label,drawn:fmt(r.g),correct:fmt(r.want),drift:d,css:dc,
        ball:r.ball&&r.want?100*r.ball.w/r.want.w:NaN,overlap:ov,chrome:r.chromePct,title:r.title};
      rows.push(row);
      if (d>1.5||dc>1.5) problems.push(`${row.vp} ${label}: drew ${row.drawn}, chrome says ${row.correct} (${Math.max(d,dc).toFixed(1)}px)`);
      if (want.noOverlap && ov) problems.push(`${row.vp} ${label}: the worlds strip covers ${ov}px of the readout`);
      if (want.title && !(r.title&&r.title.onscreen&&r.title.clear))
        problems.push(`${row.vp} ${label}: the readout's title is ${r.title?(r.title.onscreen?"covered":"off screen"):"absent"}`);
      if (want.chromeUnder && r.chromePct>=want.chromeUnder)
        problems.push(`${row.vp} ${label}: opaque chrome is ${r.chromePct.toFixed(1)}% of the viewport`);
      return r;
    };

    /* every ordinary road into the whole atlas */
    await goto("#/sky");                                await record("cold #/sky");
    await goto("#/");
    await page.evaluate(`document.querySelector("#constellation").click()`);
    await settle();                                     await record("wall -> CONSTELLATION");
    await goto("#/");
    await page.evaluate(`document.querySelector("#sky-lede").click()`);
    await settle();                                     await record("wall -> the lede link");
    await goto("#/sky/world:gothic");                   await record("cold #/sky/world:gothic");
    /* and the in-session round trip through a world */
    await goto("#/sky");
    await page.evaluate(`document.querySelector("#sky-worlds-rail .wframe").click()`);
    await page.waitForTimeout(2400);                    await record("whole -> world");
    await page.evaluate(`(()=>{const t=document.querySelector("#sky-worlds-tab");
      if(t&&!t.hidden) t.click();
      const on=[...document.querySelectorAll("#sky-worlds-rail .wframe")].find(b=>b.classList.contains("on"));
      if(on) on.click();})()`);
    await page.waitForTimeout(2600);                    await record("world -> whole");

    /* A ROUTE IS A READING POSTURE. Four states, each with its own trap. */
    await goto(PASSAGE);
    await record("cold passage link",{noOverlap:true,title:true,chromeUnder:100});
    await page.evaluate(`document.querySelector("#sky-worlds-tab").click()`);
    await page.waitForTimeout(800);
    await record("strip re-opened mid-route",{noOverlap:true,title:true});
    await page.evaluate(`document.querySelector("#sky-worlds-x").click()`);
    await page.waitForTimeout(600);
    await page.evaluate(`skyPassageClear()`);
    await page.waitForTimeout(1000);
    const cleared=await record("route cleared");
    if (!cleared.boxes["#sky-worlds"]) problems.push(`${vw}x${vh} route cleared: the worlds strip did not come back`);
    await ctx.close();
  }
  await browser.close();

  console.log(pad("viewport",10)+pad("route",30)+pad("drawn",22)+pad("correct",22)
    +pad("drift",8)+pad("css",7)+pad("ball%ap",9)+pad("strip/read",12)+"chrome%");
  for (const r of rows) console.log(pad(r.vp,10)+pad(r.label,30)+pad(r.drawn,22)+pad(r.correct,22)
    +pad(r.drift===Infinity?"n/a":r.drift.toFixed(1),8)
    +pad(r.css===Infinity?"n/a":r.css.toFixed(1),7)
    +pad(isNaN(r.ball)?"—":r.ball.toFixed(0)+"%",9)
    +pad(r.overlap||"none",12)+r.chrome.toFixed(1)+"%");
  console.log("");
  if (problems.length){
    for (const p of problems) console.error("FAIL: "+p);
    console.log(`\nGATE FAIL — ${problems.length} problems over ${rows.length} states`);
    process.exitCode=1;
  } else {
    console.log(`GATE PASS — ${rows.length} states, every drawn aperture within 1.5px of skyGate(), `
      +`the route's title clear of the chrome at every viewport`);
  }
}
run().catch(e=>{ console.error(e); process.exit(1); });
