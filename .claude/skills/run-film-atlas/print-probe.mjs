#!/usr/bin/env node
/* THE PRINT PROBE — the build gate for Latent Image in the Gate.
 *
 * Everything this feature claims is a claim about PIXELS, so every check here
 * ends in a pixel read out of the real compositor in real Chromium. A markup
 * assertion cannot see any of it: the failure mode this exists to catch is a
 * developed film's colour pool tinting the latent discs sitting inside it,
 * which is valid HTML, a clean console, a plausible screenshot, and a 21x
 * overclaim about what the reader knows.
 *
 *   node .claude/skills/run-film-atlas/print-probe.mjs
 *   ATLAS_HTML=/tmp/broken.html node .../print-probe.mjs      # a negative control
 *   node .../print-probe.mjs --controls                        # build and run all of them
 *
 * The controls are not optional decoration. A guarantee nobody has proved can
 * fail is not a guarantee, and --controls patches the real artifact five ways
 * and requires each patch to be REPORTED by the gate it defeats.
 */
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const ARTIFACT = resolve(process.env.ATLAS_HTML || join(ROOT, "public/atlas.html"));
const SHOTS = resolve(process.env.ATLAS_SHOTS || join(ROOT, ".atlas-shots"));
const LOAD_MS = +(process.env.ATLAS_LOAD_MS || 45000);
const log = (...a) => console.log(...a);
let failures = [];
const fail = (m) => { failures.push(m); log("  FAIL: " + m); return false; };
const ok = (m) => { log("  ok   " + m); return true; };

/* ── the marked sets, chosen to be adversarial rather than flattering ──────
   CANON is the degree-sorted head of the corpus. That is the worst case for
   rule 1 on purpose: if anything in this feature tracks degree, a seen set
   that IS the degree order is where it shows. It is also the realistic case —
   a viewer's history is canon-heavy because that is what people watch.
   RANDOM is a seeded uniform draw, as the control that says how much of any
   effect is the set and how much is the machinery. */
function pickSets(films, adj) {
  const keys = Object.keys(films);
  const deg = Object.fromEntries(keys.map(k => [k, (adj[k] || []).length]));
  const canon = keys.slice().sort((a, b) => deg[b] - deg[a] || (a < b ? -1 : 1));
  let s = 0x5eed >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const rand = keys.slice();
  for (let i = rand.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [rand[i], rand[j]] = [rand[j], rand[i]]; }
  return { canon, rand, deg };
}

const CORPUS = JSON.parse(readFileSync(join(ROOT, "atlas/static/corpus.json"), "utf8"));
const FILM_ID = Object.fromEntries(Object.entries(CORPUS.films).map(([k, f]) => [k, f.filmId]));

async function launch() {
  if (!existsSync(ARTIFACT)) { console.error(`No artifact at ${ARTIFACT}`); process.exit(2); }
  return chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });
}

/* One page, at one viewport, with a preference store planted before any script
   runs. `marks` is a list of corpus KEYS; the store is written in the schema
   the app actually reads (v2, film ids) unless `raw` overrides it. */
async function openSky(browser, { marks = [], viewport = { width: 1440, height: 900 }, reduced = "no-preference", raw = null, route = "#/sky" } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: reduced });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  await page.route("**/*", r => (r.request().resourceType() === "image" ? r.abort() : r.continue()));
  /* The store is planted in the schema the app READS — v2, film ids — and the
     ids are resolved out here from corpus.json rather than inside the page,
     because addInitScript re-runs on every navigation and a store written from
     inside the page is overwritten by the next one. That bug cost a whole run
     that reported zero developed films and every gate green. */
  const ids = marks.map(k => FILM_ID[k] || k);
  await page.addInitScript(([idsIn, rawIn]) => {
    try {
      localStorage.setItem("atlas-preferences-v1", rawIn
        ? JSON.stringify(rawIn)
        : JSON.stringify({ v: 2, seen: idsIn, loved: [], filter: "all", skyFolded: false }));
    } catch (_e) { /* private mode */ }
  }, [ids, raw]);
  await page.goto(pathToFileURL(ARTIFACT).href + (route || ""), { waitUntil: "load", timeout: LOAD_MS });
  await page.waitForFunction("typeof KEYS !== 'undefined' && KEYS.length > 0", null, { timeout: LOAD_MS });
  if (/sky/.test(route || "")) {
    await page.waitForFunction("typeof sky !== 'undefined' && sky.ready && sky.n > 0", null, { timeout: LOAD_MS });
    await page.waitForTimeout(1500);
  }
  return { ctx, page, errors };
}

/* ── the readings, all taken inside the page ─────────────────────────────── */

/* Every latent film's COMPOSITED pixel, and every developed one's, in OKLab.
   Sampled from the canvas backing store at the film's own screen position, so
   what is measured is what the compositor produced, not what the draw loop
   intended. */
const SAMPLE = `(() => {
  const c = document.getElementById("sky-c");
  const g = c.getContext("2d", { willReadFrequently: true });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const dpr = sky.dpr, W = c.width, H = c.height;
  const s2l = v => { v/=255; return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
  const lab = (r,g2,b) => {
    const R=s2l(r), G=s2l(g2), B=s2l(b);
    const l=Math.cbrt(0.4122214708*R+0.5363325363*G+0.0514459929*B);
    const m=Math.cbrt(0.2119034982*R+0.6806995451*G+0.1073969566*B);
    const s=Math.cbrt(0.0883024619*R+0.2817188376*G+0.6299787005*B);
    return [0.2104542553*l+0.7936177850*m-0.0040720468*s,
            1.9779984951*l-2.4285922050*m+0.4505937099*s,
            0.0259040371*l+0.7827717662*m-0.8086757660*s];
  };
  const latent=[], developed=[], latentBright=[], latentDeg=[];
  let inked=0, lumSum=0, n=0;
  for (let i=3;i<d.length;i+=4*37){ if (d[i]>8) inked++; n++; }
  for (let i=0;i<d.length;i+=4*37){
    lumSum += 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
  }
  for (let i=0;i<sky.n;i++){
    if (sky.alpha[i]<=0.004) continue;
    const x=Math.round(sky.sx[i]*dpr), y=Math.round(sky.sy[i]*dpr);
    if (x<1||y<1||x>=W-1||y>=H-1) continue;
    const o=(y*W+x)*4;
    const L=lab(d[o],d[o+1],d[o+2]);
    const chroma=Math.hypot(L[1],L[2]);
    const key=sky.keys[i];
    const dev=state.seen.has(key)||state.loved.has(key);
    if (dev) developed.push(chroma);
    else {
      latent.push(chroma);
      /* local brightness for the rule-1 check: read the halo buffer, not the
         disc, so what is correlated against degree is the LIGHT IN THE ROOM
         and not the film's own dot. */
      latentBright.push(0.2126*d[o]+0.7152*d[o+1]+0.0722*d[o+2]);
      latentDeg.push((ADJ[key]||[]).length);
    }
  }
  const q=(a,p)=>{ if(!a.length) return 0; const b=a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(b.length*p))]; };
  return {
    latentN:latent.length, developedN:developed.length,
    latentMaxChroma:latent.length?Math.max(...latent):0,
    latentP99:q(latent,0.99), latentMedian:q(latent,0.5),
    developedMedian:q(developed,0.5),
    inkedPct:+(100*inked/n).toFixed(4),
    meanLum:+(lumSum/n).toFixed(4),
    latentBright, latentDeg,
  };
})()`;

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return num / Math.sqrt((da * db) || 1);
}

/* ── the gate ─────────────────────────────────────────────────────────────── */
async function run() {
  const browser = await launch();
  log(`artifact    ${ARTIFACT}`);

  /* 0 ── the plate's own arithmetic, asked of the page rather than of a copy
     of the maths in this file. A checker that reimplements develop() is a
     checker that can agree with itself while disagreeing with the app. */
  {
    const { ctx, page, errors } = await openSky(browser, {});
    const r = await page.evaluate(`(() => {
      let mism=0, worstL=0, lumaDrift=0, chr=[];
      const s2l=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
      const L0=hex=>{const n=parseInt(hex.slice(1),16);
        const R=s2l((n>>16)&255),G=s2l((n>>8)&255),B=s2l(n&255);
        const l=Math.cbrt(0.4122214708*R+0.5363325363*G+0.0514459929*B);
        const m=Math.cbrt(0.2119034982*R+0.6806995451*G+0.1073969566*B);
        const s=Math.cbrt(0.0883024619*R+0.2817188376*G+0.6299787005*B);
        return 0.2104542553*l+0.7936177850*m-0.0040720468*s;};
      const luma=css=>{const p=css.split(",").map(Number);return 0.2126*p[0]+0.7152*p[1]+0.0722*p[2];};
      for (const k of KEYS){
        const hex=F[k].highlight;
        if (develop(hex,1)!==hex) mism++;
        worstL=Math.max(worstL,Math.abs(L0(develop(hex,0))-L0(hex)));
        lumaDrift=Math.max(lumaDrift,Math.abs(luma(skyHaloCss(hex,0))-luma(skyHaloCss(hex,1))));
        const lab=skyHexToLab(hex); chr.push(Math.hypot(lab[1],lab[2]));
      }
      chr.sort((a,b)=>a-b);
      return { mism, worstL, lumaDrift, n:KEYS.length,
               chrMedian:chr[chr.length>>1], below05:chr.filter(c=>c<0.05).length };
    })()`);
    log("");
    log("── 1. develop(), asked of the page ─────────────────────────────────");
    log(`  ${r.n} films · developed chroma median ${r.chrMedian.toFixed(4)} · ${r.below05} below 0.05`);
    r.mism === 0 ? ok(`develop(hex,1) reproduces every highlight byte for byte (0 of ${r.n} differ)`)
      : fail(`develop(hex,1) changed ${r.mism} of ${r.n} highlights — a marked film is no longer the atlas that ships`);
    r.worstL <= 0.002 ? ok(`OKLab L preserved to ${r.worstL.toFixed(5)} at worst after 8-bit rounding`)
      : fail(`develop() moved OKLab L by ${r.worstL.toFixed(5)} — a latent film is a different lightness, not a different colour`);
    /* 0.5 of 255 is one 8-bit quantisation step and is the whole of the
       residue: C(t) is a straight line between (Y,Y,Y) and (R,G,B), luma is a
       linear functional, so luma(C(t)) = Y exactly in real arithmetic and the
       only thing between that and the emitted triple is Math.round. */
    r.lumaDrift <= 0.51 ? ok(`the halo's Rec.709 luma is invariant to ${r.lumaDrift.toFixed(3)} of 255 between latent and developed — one rounding step, and it is the whole residue`)
      : fail(`the halo's luma moves by ${r.lumaDrift} between latent and developed — the atlas brightens as you watch`);
    if (errors.length) fail("console: " + errors[0]);
    await ctx.close();
  }

  /* 1 ── the aperture moves no film. */
  {
    const results = [];
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }, { width: 900, height: 820 }]) {
      const { ctx, page } = await openSky(browser, { viewport: vp });
      results.push(await page.evaluate(`(() => {
        const g=skyGate(), b=skySafeBand(), sh=Math.max(140,b.bot-b.top);
        return { w:sky.w, h:sky.h, gw:g.w, gh:g.h, aspect:g.w/g.h,
                 gateMin:Math.min(g.w,g.h), bandMin:Math.min(sky.w,sh),
                 fitK:skyFitK(), camK:sky.cam.k };
      })()`));
      await ctx.close();
    }
    log("");
    log("── 2. the aperture is the edge of the light, not a crop ────────────");
    for (const r of results) {
      log(`  ${r.w}x${r.h}  gate ${r.gw.toFixed(0)}x${r.gh.toFixed(0)} (${r.aspect.toFixed(2)}:1)  fitK ${r.fitK.toFixed(1)}`);
      const d = Math.abs(r.gateMin - r.bandMin);
      d < 0.5 ? ok(`min(gate) === min(canvas, band) to ${d.toFixed(3)}px — the camera is unmoved`)
        : fail(`the aperture changed the fit by ${d.toFixed(2)}px at ${r.w}x${r.h}`);
      (r.aspect > 0.81 && r.aspect < 1.38) ? ok(`aspect ${r.aspect.toFixed(2)} inside [0.82, 1.37] Academy`)
        : fail(`aspect ${r.aspect.toFixed(2)} outside the Academy range`);
    }
  }

  /* 2 ── THE COMPOSITE FLOOR, which is the one this whole object stands on. */
  const adj = {};
  for (const k of Object.keys(CORPUS.films)) adj[k] = [];
  for (const e of CORPUS.edges) { if (adj[e.a]) adj[e.a].push(1); if (adj[e.b]) adj[e.b].push(1); }
  const { canon, rand } = pickSets(CORPUS.films, adj);

  const tiers = [
    { n: 0, set: [], label: "0 films" },
    { n: 40, set: canon.slice(0, 40), label: "40 films, canon-first" },
    { n: 300, set: canon.slice(0, 300), label: "300 films, canon-first" },
    { n: 300, set: rand.slice(0, 300), label: "300 films, random", tag: "rand" },
    { n: 2204, set: canon.slice(), label: "2204 films, the whole plate" },
  ];
  log("");
  log("── 3. the composite floor, and the ink that must not move ──────────");
  log("  marks                       latent    developed   maxChroma  p99     inked%   meanLum");
  const rows = [];
  for (const t of tiers) {
    const { ctx, page, errors } = await openSky(browser, { marks: t.set });
    const r = await page.evaluate(SAMPLE);
    rows.push({ ...t, r, errors });
    log(`  ${t.label.padEnd(26)} ${String(r.latentN).padStart(5)} ${String(r.developedN).padStart(11)}` +
      `   ${r.latentMaxChroma.toFixed(4)}   ${r.latentP99.toFixed(4)}  ${r.inkedPct.toFixed(3)}  ${r.meanLum.toFixed(3)}`);
    if (errors.length) fail("console at " + t.label + ": " + errors[0]);
    await ctx.close();
  }
  const FLOOR = 0.02;
  for (const row of rows) {
    if (!row.set.length || row.r.latentN === 0) continue;
    row.r.latentP99 <= FLOOR
      ? ok(`${row.label}: 99% of latent films composite under OKLab chroma ${FLOOR} (p99 ${row.r.latentP99.toFixed(4)}, developed median ${row.r.developedMedian.toFixed(4)})`)
      : fail(`${row.label}: latent films are taking colour from the pools they sit in — p99 chroma ${row.r.latentP99.toFixed(4)} against a floor of ${FLOOR}. This is the 21x neighbour overclaim arriving through the compositor.`);
  }
  const base = rows[0].r, full = rows[rows.length - 1].r;
  const inkMove = Math.abs(full.inkedPct - base.inkedPct) / Math.max(1e-9, base.inkedPct) * 100;
  const lumMove = Math.abs(full.meanLum - base.meanLum) / Math.max(1e-9, base.meanLum) * 100;
  log("");
  inkMove < 1.0 ? ok(`inked pixels move ${inkMove.toFixed(3)}% from 0 marks to 2,204 — marking cannot brighten the atlas`)
    : fail(`inked pixels move ${inkMove.toFixed(2)}% from 0 to 2,204 marks — the map is a progress bar made of light`);
  lumMove < 2.0 ? ok(`mean luminance moves ${lumMove.toFixed(3)}% from 0 marks to 2,204`)
    : fail(`mean luminance moves ${lumMove.toFixed(2)}% from 0 to 2,204 marks`);

  /* 3 ── RULE 1. Whatever spreads must not correlate with degree, and the
     adversarial case is a seen set that IS the degree order. */
  log("");
  log("── 4. AGENTS rule 1: nothing here may track degree ─────────────────");
  {
    const latent0 = rows[0].r;
    const r0 = pearson(latent0.latentBright, latent0.latentDeg);
    log(`  local brightness vs whole-corpus degree, LATENT field, 2,204 films : r = ${r0.toFixed(4)}`);
    const r40 = pearson(rows[1].r.latentBright, rows[1].r.latentDeg);
    log(`  the same, with the 40 highest-degree films developed              : r = ${r40.toFixed(4)}`);
    const r300 = pearson(rows[2].r.latentBright, rows[2].r.latentDeg);
    log(`  the same, with the 300 highest-degree films developed            : r = ${r300.toFixed(4)}`);
    const worst = Math.max(Math.abs(r0), Math.abs(r40), Math.abs(r300));
    worst < 0.20 ? ok(`worst |r| is ${worst.toFixed(4)} — under the 0.20 ceiling on the most adversarial seen set there is`)
      : fail(`local brightness correlates with degree at r = ${worst.toFixed(3)} — the integration pass has become a popularity gradient`);
  }

  /* 4 ── the idle budget. */
  log("");
  log("── 5. the idle budget ──────────────────────────────────────────────");
  {
    const { ctx, page } = await openSky(browser, { marks: canon.slice(0, 40) });
    await page.evaluate("window.__draws=0; const o=skyDraw; window.skyDraw=function(){window.__draws++; return o.apply(this,arguments);};");
    /* skyDraw is a function declaration so the reference the frame loop holds
       is the binding, not a copy — rebinding it counts every call. */
    await page.waitForTimeout(5000);
    const draws = await page.evaluate("window.__draws");
    draws === 0 ? ok("0 repaints in 5s at rest with 40 films developed")
      : fail(`${draws} repaints in 5s at rest — the plate is running a clock it does not need`);
    /* and the develop itself: bounded, one-shot, and it must actually paint. */
    await page.evaluate(`(() => { window.__draws=0; skyPinKey(sky.keys[7]); window.__draws=0;
      markFilm(sky.keys[7],"seen"); })()`);
    await page.waitForTimeout(2400);
    const dd = await page.evaluate("window.__draws");
    await page.waitForTimeout(1500);
    const after = await page.evaluate("window.__draws");
    (dd > 8) ? ok(`a develop painted ${dd} frames over its 1,600ms`)
      : fail(`a develop painted ${dd} frames — it snapped instead of coming up`);
    (after === dd) ? ok("and 0 more in the 1.5s after it landed")
      : fail(`${after - dd} repaints after the develop landed — it never stopped`);
    await ctx.close();
  }

  /* 5 ── the store, and the black page it has produced twice. */
  log("");
  log("── 6. the store ────────────────────────────────────────────────────");
  {
    const bad = { v: 1, seen: ["constructor", "__proto__", "toString"], loved: ["constructor"], filter: "all", skyFolded: false };
    const { ctx, page, errors } = await openSky(browser, { raw: bad, route: "" });
    const wall = await page.evaluate(`(() => {
      const t=[...document.querySelectorAll("#wall-body .tile")];
      return { laid:t.filter(e=>e.offsetWidth>8&&e.offsetHeight>8).length, seen:state.seen.size, loved:state.loved.size };
    })()`);
    (wall.laid > 100 && wall.seen === 0 && errors.length === 0)
      ? ok(`a store of prototype keys renders ${wall.laid} tiles and lands 0 of them in state.seen`)
      : fail(`prototype keys in the store: ${wall.laid} tiles laid out, ${wall.seen} in state.seen, ${errors.length} console errors`);
    await ctx.close();
  }
  {
    /* the v1 migration, and its loss report */
    const legacy = { seen: ["vertigo", "8", "a-film-that-no-longer-exists"], loved: ["vertigo"], filter: "all" };  /* no v: a v1 store */
    const { ctx, page } = await openSky(browser, { raw: legacy, route: "" });
    const m = await page.evaluate(`({ seen:[...state.seen], loved:[...state.loved], loss:JSON.parse(JSON.stringify(prefLoss)),
      written:JSON.parse(localStorage.getItem("atlas-preferences-v1")||"{}") })`);
    (m.seen.length === 2 && m.loss.seen === 1 && m.loss.from === 1)
      ? ok(`a v1 slug store migrates: 2 of 3 names resolve, 1 loss REPORTED (prefLoss.seen=${m.loss.seen})`)
      : fail(`v1 migration: seen=${JSON.stringify(m.seen)} loss=${JSON.stringify(m.loss)}`);
    await page.evaluate('markFilm("vertigo","seen")');
    const w = await page.evaluate('JSON.parse(localStorage.getItem("atlas-preferences-v1"))');
    (w.v === 2 && typeof w.skyFolded === "boolean" && "filter" in w)
      ? ok("persistPreferences writes v, seen, loved, filter and skyFolded — every field readPreferences reads")
      : fail("persistPreferences dropped a field: " + JSON.stringify(Object.keys(w)));
    await ctx.close();
  }

  /* 6 ── reduced motion keeps the develop, and keeps it short. */
  log("");
  log("── 7. prefers-reduced-motion ───────────────────────────────────────");
  {
    const { ctx, page } = await openSky(browser, { reduced: "reduce", route: "#/sky" });
    const r = await page.evaluate(`(() => new Promise(res=>{
      const k=sky.keys[11];
      markFilm(k,"seen");
      const ms=sky.devMs, ind=sky.devKey!=null;
      setTimeout(()=>res({ms,ind,landed:sky.devKey===null,tone:sky.tone[sky.at[k]],fill:sky.fill[sky.at[k]]}),900);
    }))()`);
    (r.ind && r.ms <= 400) ? ok(`the print still comes up, at ${r.ms}ms rather than 1,600 and with the induction dropped`)
      : fail(`reduced motion: devMs=${r.ms} started=${r.ind}`);
    (r.landed && r.tone === r.fill) ? ok("and it lands fully developed")
      : fail(`reduced motion left the film at ${r.tone} against ${r.fill}`);
    await ctx.close();
  }

  await browser.close();
  log("");
  if (failures.length) { log(`PRINT FAIL — ${failures.length} gate(s)`); process.exit(1); }
  log("PRINT PASS");
}

/* ── the negative controls ────────────────────────────────────────────────
   Each one patches the real artifact so that exactly one guarantee is false,
   and requires the gate that guards it to say so. A control that passes is a
   check that is not checking. */
const CONTROLS = [
  {
    name: "the pool composites OVER the discs",
    why: "the composite floor must report ~1,000 latent films taking colour",
    /* The buffer is blitted a SECOND time, after the disc loop. That is the
       real defect this floor exists to stop, expressed as literally as it can
       be: a developed film's pool reaching the latent discs standing in it. */
    patch: s => s.replace(
      "  ctx.globalAlpha=0.82;\n\n  /* THE ROUTE ITSELF",
      "  if (integrate && sky.glow && sky.halo){ ctx.globalCompositeOperation=\"lighter\";" +
      " ctx.globalAlpha=1; ctx.drawImage(sky.halo,0,0,w,h); ctx.globalCompositeOperation=\"source-over\"; }\n" +
      "  ctx.globalAlpha=0.82;\n\n  /* THE ROUTE ITSELF"
    ),
  },
  {
    name: "the halo carries the film's colour at full chroma whether or not it is developed",
    why: "the luma-invariance gate must report a drift",
    patch: s => s.replace(
      "return Math.round(Y+t*(r-Y))+\",\"+Math.round(Y+t*(g-Y))+\",\"+Math.round(Y+t*(b-Y));",
      "return r+\",\"+g+\",\"+b;"
    ),
  },
  {
    name: "develop() scales L as well as a and b",
    why: "the L-preservation gate must report it",
    patch: s => s.replace(
      "const rgb=skyLabToRgb(lab[0],lab[1]*t,lab[2]*t);",
      "const rgb=skyLabToRgb(lab[0]*(0.7+0.3*t),lab[1]*t,lab[2]*t);"
    ),
  },
  {
    name: "the store validates with F[k] instead of hasOwnProperty",
    why: "the black-page control must report a store of prototype keys reaching state.seen",
    patch: s => s.replace(
      "if (key!=null && typeof key===\"string\" && Object.prototype.hasOwnProperty.call(F,key)) out.push(key);",
      "if (key!=null && typeof key===\"string\" && F[key]) out.push(key);"
    ).replace(
      "} else if (Object.prototype.hasOwnProperty.call(F,raw)) key=raw;",
      "} else if (F[raw]) key=raw;"
    ),
  },
  {
    name: "the develop snaps instead of coming up",
    why: "the develop's frame count must report a snap",
    patch: s => s.replace(
      "const raw=Math.min(1,(now-sky.devT0)/Math.max(1,sky.devMs));",
      "const raw=1;"
    ),
  },
  {
    name: "a mark makes the disc brighter",
    why: "the ink-invariance gate must report the atlas brightening",
    patch: s => s.replace(
      "ctx.globalAlpha = (hasRoute ? 0.07 : inPreview ? 0.82 : 0.16) * a;",
      "ctx.globalAlpha = (hasRoute ? 0.07 : inPreview ? 0.82 : 0.16) * a * ((state.seen.has(sky.keys[i])||state.loved.has(sky.keys[i]))?1.22:1);"
    ),
  },
];

async function runControls() {
  const src = readFileSync(resolve(join(ROOT, "public/atlas.html")), "utf8");
  mkdirSync("/tmp/print-controls", { recursive: true });
  const results = [];
  for (const c of CONTROLS) {
    const out = c.patch(src);
    if (out === src) { results.push({ ...c, applied: false }); log(`SKIP (patch did not apply): ${c.name}`); continue; }
    const p = `/tmp/print-controls/${c.name.replace(/[^a-z]+/gi, "-")}.html`;
    writeFileSync(p, out);
    results.push({ ...c, applied: true, path: p });
  }
  log("");
  log("═══ NEGATIVE CONTROLS ═══════════════════════════════════════════════");
  for (const c of results) {
    if (!c.applied) continue;
    log("");
    log(`BREAK: ${c.name}`);
    log(`  expect: ${c.why}`);
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, ATLAS_HTML: c.path }, encoding: "utf8", timeout: 900000,
    });
    const outText = (r.stdout || "") + (r.stderr || "");
    const fails = outText.split("\n").filter(l => l.includes("FAIL:"));
    if (r.status === 0) log("  *** THE CONTROL PASSED — the check is not checking ***");
    else { log(`  REPORTED (${fails.length} gate(s)):`); for (const f of fails.slice(0, 4)) log("   " + f.trim()); }
  }
}

if (process.argv.includes("--controls")) await runControls();
else await run();
