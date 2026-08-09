#!/usr/bin/env node
/* The six frames the whole object is judged on: 0, 40 and 300 developed films,
 * at 1440x900 and at 390x780. The marked sets are the degree-sorted head of the
 * corpus — a canon-heavy history, which is both the realistic case and the
 * adversarial one for AGENTS rule 1.
 *
 *   node .claude/skills/run-film-atlas/print-shots.mjs
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, statSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const ARTIFACT = resolve(process.env.ATLAS_HTML || join(ROOT, "public/atlas.html"));
const OUT = resolve(process.env.ATLAS_SHOTS || join(ROOT, ".atlas-shots"));
const CORPUS = JSON.parse(readFileSync(join(ROOT, "atlas/static/corpus.json"), "utf8"));

const deg = {};
for (const k of Object.keys(CORPUS.films)) deg[k] = 0;
for (const e of CORPUS.edges) { if (e.a in deg) deg[e.a]++; if (e.b in deg) deg[e.b]++; }
const canon = Object.keys(CORPUS.films).sort((a, b) => deg[b] - deg[a] || (a < b ? -1 : 1));
const idOf = k => CORPUS.films[k].filmId;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });

for (const vp of [{ width: 1440, height: 900, tag: "1440x900" }, { width: 390, height: 780, tag: "390x780" }]) {
  for (const n of [0, 40, 300]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.route("**/*", r => (r.request().resourceType() === "image" ? r.abort() : r.continue()));
    const seen = canon.slice(0, n).map(idOf);
    await page.addInitScript(s => {
      try { localStorage.setItem("atlas-preferences-v1", JSON.stringify({ v: 2, seen: s, loved: [], filter: "all", skyFolded: false })); } catch (_e) {}
    }, seen);
    await page.goto(pathToFileURL(ARTIFACT).href + "#/sky", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("typeof sky !== 'undefined' && sky.ready && sky.n > 0", null, { timeout: 60000 });
    await page.waitForTimeout(2200);
    const name = `print-${String(n).padStart(4, "0")}-${vp.tag}.png`;
    await page.screenshot({ path: join(OUT, name) });
    const m = await page.evaluate(`(() => {
      const c=document.getElementById("sky-c");
      const g=c.getContext("2d",{willReadFrequently:true});
      const d=g.getImageData(0,0,c.width,c.height).data;
      let lit=0,lum=0,tot=0;
      for(let i=0;i<d.length;i+=4*37){ if(d[i+3]>8) lit++; lum+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; tot++; }
      return { ink:+(100*lit/tot).toFixed(3), lum:+(lum/tot).toFixed(3), seen:state.seen.size, w:c.width, h:c.height };
    })()`);
    console.log(`${name.padEnd(28)} seen ${String(m.seen).padStart(4)}  ink ${m.ink}%  meanLum ${m.lum}  ${(statSync(join(OUT, name)).size / 1024).toFixed(0)} KB`);
    await ctx.close();
  }
}
await browser.close();
