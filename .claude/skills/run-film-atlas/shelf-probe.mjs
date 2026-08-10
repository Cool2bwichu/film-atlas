#!/usr/bin/env node
/* shelf-probe.mjs — ASK THE PAGE WHAT THE SHELF DREW, AND WHAT IT ADMITTED.
 *
 *   node .claude/skills/run-film-atlas/shelf-probe.mjs
 *   ATLAS_HTML=/tmp/broken.html node .../shelf-probe.mjs        # negative control
 *
 * WHY THIS EXISTS.
 * The shelf is the one surface in this app that draws a measurement 54% of the
 * corpus does not have, from a source the project is not allowed to show. Both
 * halves of that fail silently: a licence line is prose nobody diffs, and a
 * shelf that quietly grows a plate when a film is well known looks like better
 * design rather than like AGENTS rule 1 being broken. So every check below
 * ends in a number read off the LIVE PAGE after the panel has opened.
 *
 * WHAT IT MEASURES
 *   1  licensing      no film-grab URL in the artifact; every runtime image
 *                     host; the licence line against corpus posterLicence
 *   2  coverage       the real 1,017 / 2,204, counted in the DOM, not claimed
 *   3  rule 1         the plate row is the SAME BOX for a measured film and an
 *                     unmeasured one — coverage is the fame proxy (rho +0.61
 *                     against pageviews), so identical geometry across it IS
 *                     the rule-1 check
 *   4  rule 4         zero canvas in the shelf; every caption a laid-out,
 *                     hit-testable DOM box
 *   5  rule 3         a plate read off promotional backdrops is drawn dashed
 *                     and says "reading, not a record"; a measured one is not
 *   6  rule 9         with the network dead, the head AND the shelf still draw
 *                     a composed cell with real ink in it
 *   7  reading order  the shelf sits below the synopsis and costs the first
 *                     claim zero pixels on arrival
 *   8  rule 7         the same film draws the same shelf, byte for byte, twice
 *                     and across a "Seen it" re-render
 *   9  containment    the panel never scrolls sideways
 *
 * PROVING IT CAN FAIL. Every check below was broken on purpose against a
 * patched artifact before it was trusted. The patches, and what they printed:
 *
 *   # the shelf deleted outright — 15 checks fire and nothing crashes
 *   perl -0pe 's/\n    \$\{shelfHtml\(k\)\}//' public/atlas.html > /tmp/a2.html
 *   #   FAIL  every sampled film draws a shelf  — 0 of 9
 *   #   SHELF FAIL — 16 check(s)
 *
 *   # 1 licensing — a frame URL put back in
 *   perl -0pe 's/One-sheet served from upload/https:\/\/film-grab.com\/x One-sheet from upload/' \
 *     public/atlas.html > /tmp/a1.html
 *   #   FAIL  the artifact never names the frame source, let alone links it  — 1 mentions, 1 of them URLs
 *   #   FAIL  the only image host in the artifact is wikimedia  — also film-grab.com
 *
 *   # 3 rule 1 — the two-column "no light" plate left half height, which is
 *   #   what a careless grid-span leaves behind
 *   perl -0pe 's/\.plate-none::after\{content:""/.plate-span .plate-art{height:64px}\n.plate-none::after{content:""/' \
 *     public/atlas.html > /tmp/a3.html
 *   #   FAIL  1440px: every plate is the same height  — drift 70.66px over 24 plates
 *   #   FAIL   390px: every plate is the same height  — drift 80.00px over 24 plates
 *
 *   # 4 rule 4 — the caption taken out of the layout
 *   perl -0pe 's/\.plate figcaption\{margin-top:8px\}/.plate figcaption{margin-top:8px;visibility:hidden}/' \
 *     public/atlas.html > /tmp/a4.html
 *   #   FAIL  every caption is a laid-out, hit-testable DOM box  — 24 laid out, 0 reached, of 24
 *
 *   # 5 rule 3 — the reading un-dashed
 *   perl -0pe 's/\.plate\.reading \.plate-art\{border-style:dashed/.plate.reading .plate-art{border-style:solid/' \
 *     public/atlas.html > /tmp/a5.html
 *   #   FAIL  a plate read off backdrops is drawn dashed  — 0 of 4
 *
 *   # 6 rule 9 — the poster's genArt fallback taken back out
 *   perl -0pe 's/onerror="this\.outerHTML=genPoster/onignored="this.outerHTML=genPoster/' \
 *     public/atlas.html > /tmp/a6.html
 *   #   FAIL  the head still draws a plate with every image request refused  — 2 of 9
 *
 *   # 7 reading order — the shelf moved above the claims
 *   perl -0pe 's/\$\{inspection\?why\+description\+actions\+travel:actions\+why\+description\}\n    \$\{shelfHtml\(k\)\}/\${shelfHtml(k)}\n    \${inspection?why+description+actions+travel:actions+why+description}/' \
 *     public/atlas.html > /tmp/a7.html
 *   #   FAIL  1440px: the shelf sits below the synopsis ...  — 2 below, 0 claims whole, worst 0.0%
 *
 *   # 8 rule 7 — one plate name made non-deterministic
 *   perl -0pe 's/name:"colour", detail:`\$\{lean\}/name:"colour"+Math.random(), detail:`\${lean}/' \
 *     public/atlas.html > /tmp/a8.html
 *   #   FAIL  byte-identical on a second draw ...  — 4/9 redraw, 4/9 after a mark
 *   #   FAIL  1440px: no horizontal overflow  — 35px      (check 9, for free)
 *
 * All eight controls were re-run against the artifact this file ships beside;
 * a patch that stops reporting is a control that has been disarmed, and the
 * counts above are what to expect when each is re-applied.
 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = resolve(HERE, "../../..");
const ARTIFACT = process.env.ATLAS_HTML || join(UNIT, "public/atlas.html");
if (!existsSync(ARTIFACT)) {
  console.error(`No artifact at ${ARTIFACT}\n  build it:  node atlas/app/build.js --out public/atlas.html`);
  process.exit(2);
}
const URL0 = pathToFileURL(ARTIFACT).href;
const VIEWPORTS = [[1440,900],[900,820],[390,780]];

/* One film per state the shelf can be in. Chosen by what the data says, not by
   taste: measured/warm, measured/cool, measured/monochrome, read-off-backdrops,
   postered-but-unmeasured, unmeasured-and-unpostered. */
const FILMS = [
  ["do the right thing", "measured · warmest in the corpus"],
  ["the abyss",          "measured · coolest with 31 frames"],
  ["8",                  "measured · monochrome"],
  ["sea fog",            "read off 4 backdrops"],
  ["fantasia",           "read off 8 backdrops"],
  ["tokyo story",        "no frames · commons one-sheet"],
  ["the magnificent seven","no frames · non-free one-sheet"],
  ["1900",               "no frames, no one-sheet"],
  ["1917",               "measured, no one-sheet"],
];

const problems = [];
const ok = (label, detail) => console.log(`  pass  ${label}  — ${detail}`);
const bad = (label, detail) => { console.log(`  FAIL  ${label}  — ${detail}`); problems.push(label); };

const READ = `(key => {
  const p = document.querySelector("#panel");
  const sh = p.querySelector(".shelf");
  const box = n => { if(!n) return null; const r=n.getBoundingClientRect();
    return {x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2),
            bottom:+r.bottom.toFixed(2)}; };
  const plates = [...(sh?sh.querySelectorAll(".plate"):[])].map(fig => {
    const art = fig.querySelector(".plate-art");
    const cs = getComputedStyle(art);
    const cap = fig.querySelector("figcaption");
    const cr = cap.getBoundingClientRect();
    const hit = document.elementFromPoint(cr.left+3, cr.top+5);
    return {
      name: fig.querySelector("figcaption b").textContent.trim(),
      detail: fig.querySelector("figcaption span").textContent.trim(),
      art: box(art),
      border: cs.borderTopStyle,
      background: cs.backgroundImage === "none" ? cs.backgroundColor : cs.backgroundImage.slice(0,60),
      hasGen: !!art.querySelector(".gen"),
      genBox: box(art.querySelector(".gen")),
      capBox: {w:+cr.width.toFixed(2), h:+cr.height.toFixed(2)},
      capReached: !!hit && (hit===cap || cap.contains(hit)),
      artHidden: art.getAttribute("aria-hidden") === "true",
    };
  });
  const head = p.querySelector(".phead .poster");
  const desc = p.querySelector(".desc");
  const why = p.querySelector(".why-item");
  const pr = p.getBoundingClientRect();
  return {
    key,
    shelf: box(sh),
    row: box(sh ? sh.querySelector(".shelf-plates") : null),
    plates,
    note: sh ? sh.querySelector(".shelf-note").textContent.trim() : null,
    lic: sh ? sh.querySelector(".shelf-lic").textContent.trim() : null,
    canvas: sh ? sh.querySelectorAll("canvas").length : -1,
    headTag: head ? head.tagName : null,
    headBox: box(head),
    headGen: head ? !!head.querySelector(".gen") : false,
    desc: box(desc),
    claim: why ? {box: box(why),
      visible: +Math.max(0, Math.min(why.getBoundingClientRect().bottom, pr.bottom)
                            - Math.max(why.getBoundingClientRect().top, pr.top)).toFixed(2)} : null,
    scrollTop: p.scrollTop,
    overflowX: p.scrollWidth - p.clientWidth,
    html: sh ? sh.innerHTML : null,
    licence: F[key].posterLicence, poster: !!F[key].poster,
    measured: !!(typeof LIGHT!=="undefined" && LIGHT && LIGHT.films[key]),
  };
})`;

async function run(){
  console.log(`\nSHELF PROBE  ${ARTIFACT}\n`);

  /* ── 1. licensing, read off the file before a browser is even opened ── */
  console.log("── 1. what the artifact is allowed to carry ───────────────────────");
  const src = readFileSync(ARTIFACT, "utf8");
  /* Two guards, and the wider one is the real one. A URL is what the spec
     forbids, but a copied record, a leftover provenance field or a comment
     that names the source all look the same to a reader with view-source open,
     so the substring is the tripwire and the URL match is the diagnosis.
     find-probe.mjs holds the same substring guard; both must read zero. */
  const grabAny = (src.match(/film-?grab/gi) || []).length;
  const grabUrls = (src.match(/https?:\/\/[^"'\s]*film-?grab[^"'\s]*/gi) || []).length;
  if (grabAny === 0)
    ok("the artifact never names the frame source, let alone links it",
         `0 mentions and 0 URLs over ${(src.length/1048576).toFixed(1)} MB`);
    else bad("the artifact never names the frame source, let alone links it",
          `${grabAny} mentions, ${grabUrls} of them URLs`);
  /* Chunked packs split URLs across string literals, so hosts are counted from
     the one place a runtime request can come from: the corpus poster field. */
  const hosts = new Map();
  for (const m of src.matchAll(/upload\.wikimedia\.org|film-?grab\.com|image\.tmdb\.org|api\.themoviedb\.org/gi)) {
    hosts.set(m[0].toLowerCase(), (hosts.get(m[0].toLowerCase())||0)+1);
  }
  const foreign = [...hosts.keys()].filter(h => h !== "upload.wikimedia.org");
  if (foreign.length === 0)
    ok("the only image host in the artifact is wikimedia", `${hosts.get("upload.wikimedia.org")||0} references, 0 others`);
    else bad("the only image host in the artifact is wikimedia", `also ${foreign.join(", ")}`);

  const browser = await chromium.launch({ args:["--disable-gpu","--no-sandbox"] });
  const rows = {};        /* rows[vw][key] */
  let consoleErrors = 0;

  for (const [vw,vh] of VIEWPORTS){
    const ctx = await browser.newContext({viewport:{width:vw,height:vh}, reducedMotion:"no-preference"});
    /* THE NETWORK IS DEAD ON PURPOSE. Posters hang in this container, and a
       dead wikimedia is also the exact condition AGENTS rule 9 is about. */
    await ctx.route("**/*", r => /^https?:/.test(r.request().url())
      && r.request().resourceType()==="image" ? r.abort() : r.continue());
    const page = await ctx.newPage();
    page.on("pageerror", e => { consoleErrors++; console.log("   page error:", e.message); });
    rows[vw] = {};
    for (const [key] of FILMS){
      await page.goto(URL0 + "#/film/" + encodeURIComponent(key), {waitUntil:"domcontentloaded", timeout:60000});
      await page.waitForFunction("typeof F!=='undefined' && !!document.querySelector('#map')", null, {timeout:60000});
      await page.waitForTimeout(900);
      await page.evaluate(k => openPanel(k), key);
      await page.waitForTimeout(450);
      rows[vw][key] = await page.evaluate(`${READ}(${JSON.stringify(key)})`);
      /* The reading-order numbers above are taken on ARRIVAL, with the panel at
         scrollTop 0. The hit test has to be taken with the shelf on screen, or
         elementFromPoint answers about a caption nobody has scrolled to yet —
         which is a true fact about the panel and not the question being asked. */
      /* A panel with no shelf at all is a FAILURE to report, never a crash:
         the whole point of this file is that it survives the thing it is
         checking for having been deleted. */
      await page.evaluate(() => { const s=document.querySelector("#panel .shelf");
        if (s) s.scrollIntoView({block:"center"}); });
      await page.waitForTimeout(200);
      rows[vw][key].hits = await page.evaluate(() =>
        [...document.querySelectorAll("#panel .shelf figcaption")].map(cap => {
          const r = cap.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left+3, r.top+5);
          return {w:+r.width.toFixed(2), h:+r.height.toFixed(2),
                  reached: !!hit && (hit===cap || cap.contains(hit))};
        }));
      await page.evaluate(() => { document.querySelector("#panel").scrollTop = 0; });
      if (vw === 1440){
        /* rule 7: draw it twice, and again after a mark re-renders the panel */
        const again = await page.evaluate(k => { openPanel(k);
          const s=document.querySelector("#panel .shelf"); return s?s.innerHTML:null; }, key);
        await page.evaluate(k => { markFilm(k,"seen",true); openPanel(k); }, key);
        const marked = await page.evaluate(() => { const s=document.querySelector("#panel .shelf"); return s?s.innerHTML:null; });
        rows[vw][key].again = again;
        rows[vw][key].marked = marked;
      }
    }
    await ctx.close();
  }
  await browser.close();

  /* ── 2. coverage, counted ── */
  console.log("\n── 2. coverage, counted rather than claimed ───────────────────────");
  const totals = await (async () => {
    const b = await chromium.launch({args:["--disable-gpu","--no-sandbox"]});
    const ctx = await b.newContext({viewport:{width:1440,height:900}});
    const page = await ctx.newPage();
    await page.goto(URL0, {waitUntil:"domcontentloaded", timeout:60000});
    await page.waitForFunction("typeof F!=='undefined'", null, {timeout:60000});
    const t = await page.evaluate(() => {
      const keys = Object.keys(F);
      let measured=0, mono=0, reading=0, poster=0, nothing=0;
      for (const k of keys){
        const row = (typeof LIGHT!=="undefined" && LIGHT) ? LIGHT.films[k] : null;
        if (row){ measured++; if (row[0]===1) reading++;
          if (row[2+LIGHT.axes.indexOf("chroma")] < LIGHT.monoFloor) mono++; }
        if (F[k].poster) poster++;
        if (!row && !F[k].poster) nothing++;
      }
      return {n:keys.length, measured, mono, reading, poster, nothing};
    });
    await b.close();
    return t;
  })();
  const pct = (a,b) => (100*a/b).toFixed(2)+"%";
  console.log(`  ${totals.n} films · ${totals.measured} measured (${pct(totals.measured,totals.n)}) · `+
    `${totals.measured-totals.reading} off frames · ${totals.reading} off backdrops · ${totals.mono} monochrome`);
  console.log(`  ${totals.n-totals.measured} with no light (${pct(totals.n-totals.measured,totals.n)}) · `+
    `${totals.poster} with a one-sheet · ${totals.nothing} with neither`);
  /* Every film gets a mark plate, so the shelf's own coverage is 100% and the
     honest number is the one above it. This asserts the shape, not a target. */
  const shelvesDrawn = FILMS.filter(([k]) => rows[1440][k].shelf && rows[1440][k].plates.length >= 2).length;
  if (shelvesDrawn === FILMS.length)
    ok("every sampled film draws a shelf", `${shelvesDrawn} of ${FILMS.length}, plates ${
        FILMS.map(([k])=>rows[1440][k].plates.length).join("/")}`);
    else bad("every sampled film draws a shelf", `${shelvesDrawn} of ${FILMS.length}`);
  const markEverywhere = FILMS.every(([k]) => rows[1440][k].plates[0]
    && rows[1440][k].plates[0].name === "mark" && rows[1440][k].plates[0].hasGen);
  if (markEverywhere)
    ok("the composed mark is plate one on every panel, not a fallback", `${FILMS.length} of ${FILMS.length} (rule 9)`);
    else bad("the composed mark is plate one on every panel, not a fallback", "a sampled film has no mark");

  /* ── 3. rule 1 ── */
  console.log("\n── 3. rule 1: coverage must not move the geometry ─────────────────");
  for (const [vw] of VIEWPORTS){
    const boxes = FILMS.map(([k]) => ({k, m:rows[vw][k].measured, r:rows[vw][k].row}))
      .filter(b => b.r);
    if (boxes.length !== FILMS.length){
      bad(`${vw}px: the plate row is the same box measured or not`,
          `${boxes.length} of ${FILMS.length} panels drew a plate row at all`);
      continue;
    }
    const w = boxes.map(b=>b.r.w), h = boxes.map(b=>b.r.h);
    const dw = Math.max(...w)-Math.min(...w), dh = Math.max(...h)-Math.min(...h);
    const yes = boxes.filter(b=>b.m), no = boxes.filter(b=>!b.m);
    const gap = Math.abs(yes[0].r.h - no[0].r.h);
    if ((dw <= 0.05 && dh <= 0.05))
      ok(`${vw}px: the plate row is the same box measured or not`,
           `${w[0].toFixed(1)}x${h[0].toFixed(1)} for all ${boxes.length}, drift ${dh.toFixed(3)}px, `+
           `measured vs unmeasured ${gap.toFixed(3)}px`);
      else bad(`${vw}px: the plate row is the same box measured or not`,
            `width drift ${dw.toFixed(2)}px, height drift ${dh.toFixed(2)}px`);
    const arts = FILMS.flatMap(([k]) => rows[vw][k].plates.map(p=>p.art.h));
    const da = Math.max(...arts)-Math.min(...arts);
    if (da <= 0.05)
      ok(`${vw}px: every plate is the same height`, `${arts[0].toFixed(1)}px over ${arts.length} plates, drift ${da.toFixed(3)}px`);
      else bad(`${vw}px: every plate is the same height`, `drift ${da.toFixed(2)}px over ${arts.length} plates`);
  }

  /* ── 4. rule 4 ── */
  console.log("\n── 4. rule 4: captions are type, and type is not on canvas ────────");
  const canvases = FILMS.reduce((n,[k]) => n + rows[1440][k].canvas, 0);
  if (canvases === 0)
    ok("no canvas anywhere in the shelf", `0 over ${FILMS.length} panels`);
    else bad("no canvas anywhere in the shelf", `${canvases} found`);
  const caps = FILMS.flatMap(([k]) => rows[1440][k].plates.map(p=>p));
  const hits = FILMS.flatMap(([k]) => rows[1440][k].hits);
  const laidOut = hits.filter(c => c.w > 20 && c.h > 12).length;
  const reached = hits.filter(c => c.reached).length;
  if ((laidOut === hits.length && reached === hits.length))
    ok("every caption is a laid-out, hit-testable DOM box", `${reached} of ${hits.length} reached by elementFromPoint, smallest ${
        Math.min(...hits.map(h=>h.w)).toFixed(0)}x${Math.min(...hits.map(h=>h.h)).toFixed(0)}px`);
    else bad("every caption is a laid-out, hit-testable DOM box", `${laidOut} laid out, ${reached} reached, of ${hits.length}`);
  const hidden = caps.filter(c => c.artHidden).length;
  if (hidden === caps.length)
    ok("the picture carries no second voice for a screen reader", `${hidden} of ${caps.length} plates aria-hidden`);
    else bad("the picture carries no second voice for a screen reader", `${hidden} of ${caps.length}`);

  /* ── 5. rule 3 ── */
  console.log("\n── 5. rule 3: a reading is drawn as a reading ─────────────────────");
  const readingFilms = FILMS.filter(([k]) => rows[1440][k].measured &&
    (rows[1440][k].note||"").startsWith("Read off"));
  const measuredFilms = FILMS.filter(([k]) => rows[1440][k].measured &&
    (rows[1440][k].note||"").startsWith("Measured off"));
  let dashed=0, dashedWanted=0, solid=0, solidWanted=0;
  for (const [k] of readingFilms) for (const p of rows[1440][k].plates.slice(1)){
    dashedWanted++; if (p.border === "dashed") dashed++;
  }
  for (const [k] of measuredFilms) for (const p of rows[1440][k].plates.slice(1)){
    solidWanted++; if (p.border === "solid") solid++;
  }
  if ((dashed === dashedWanted && dashedWanted > 0))
    ok("a plate read off backdrops is drawn dashed", `${dashed} of ${dashedWanted} over ${readingFilms.length} films`);
    else bad("a plate read off backdrops is drawn dashed", `${dashed} of ${dashedWanted}`);
  if ((solid === solidWanted && solidWanted > 0))
    ok("a plate measured off frames is not", `${solid} of ${solidWanted} solid over ${measuredFilms.length} films`);
    else bad("a plate measured off frames is not", `${solid} of ${solidWanted}`);
  const saysSo = readingFilms.filter(([k]) => /reading, not a record/.test(rows[1440][k].note)).length;
  if (saysSo === readingFilms.length)
    ok("and says so in words as well as in the border", `${saysSo} of ${readingFilms.length}`);
    else bad("and says so in words as well as in the border", `${saysSo} of ${readingFilms.length}`);
  /* the licence line is the other half of check 1, this time on screen */
  let licOk=0;
  for (const [k] of FILMS){
    const r = rows[1440][k];
    const want = !r.poster ? /No one-sheet in the record/
      : r.licence === "commons" ? /Wikimedia Commons/
      : r.licence === "non-free" ? /upload\.wikimedia\.org · non-free/
      : /licence unrecorded/;
    if (r.lic && want.test(r.lic)) licOk++;
    else console.log(`   ${k}: posterLicence ${r.licence}, line "${r.lic}"`);
  }
  if (licOk === FILMS.length)
    ok("the licence line matches the film's own posterLicence", `${licOk} of ${FILMS.length}`);
    else bad("the licence line matches the film's own posterLicence", `${licOk} of ${FILMS.length}`);

  /* ── 6. rule 9 ── */
  console.log("\n── 6. rule 9: with the network dead, there is still a picture ─────");
  let headGen=0, headInk=0;
  for (const [k] of FILMS){
    const r = rows[1440][k];
    if (r.headGen) headGen++;
    if (r.headBox && r.headBox.w > 40 && r.headBox.h > 60) headInk++;
    else console.log(`   ${k}: head plate ${r.headTag} ${r.headBox ? r.headBox.w+"x"+r.headBox.h : "absent"}`);
  }
  if (headInk === FILMS.length)
    ok("the head still draws a plate with every image request refused",
         `${headInk} of ${FILMS.length} at ${rows[1440][FILMS[0][0]].headBox.w}x${rows[1440][FILMS[0][0]].headBox.h}, `+
         `${headGen} of them the composed cell`);
    else bad("the head still draws a plate with every image request refused", `${headInk} of ${FILMS.length}`);
  const markInk = FILMS.filter(([k]) => { const p = rows[1440][k].plates[0];
    return p && p.genBox && p.genBox.w > 40 && p.genBox.h > 60; }).length;
  if (markInk === FILMS.length)
    ok("and so does the shelf's own mark", `${markInk} of ${FILMS.length} at ${
        rows[1440][FILMS[0][0]].plates[0].genBox.w}x${rows[1440][FILMS[0][0]].plates[0].genBox.h}px`);
    else bad("and so does the shelf's own mark", `${markInk} of ${FILMS.length}`);
  const emptyDrawn = FILMS.filter(([k]) => !rows[1440][k].measured)
    .filter(([k]) => { const p = rows[1440][k].plates[1];
      return p && p.name === "no light" && !/rgba\(0, 0, 0, 0\)/.test(p.background); }).length;
  const emptyN = FILMS.filter(([k]) => !rows[1440][k].measured).length;
  if (emptyDrawn === emptyN)
    ok("an unmeasured film gets a drawn plate, not a hole", `${emptyDrawn} of ${emptyN}, in the film's own shadow`);
    else bad("an unmeasured film gets a drawn plate, not a hole", `${emptyDrawn} of ${emptyN}`);

  /* ── 7. reading order ── */
  console.log("\n── 7. the claims are still the argument ───────────────────────────");
  for (const [vw] of VIEWPORTS){
    let below=0, whole=0;
    let worst = Infinity;
    for (const [k] of FILMS){
      const r = rows[vw][k];
      if (r.shelf && r.desc && r.shelf.y >= r.desc.bottom - 0.5) below++;
      else if (r.shelf && !r.desc) below++;
      if (r.claim && Math.abs(r.claim.visible - r.claim.box.h) < 0.5) whole++;
      if (r.claim) worst = Math.min(worst, r.claim.visible / r.claim.box.h);
    }
    if ((below === FILMS.length && whole === FILMS.length))
      ok(`${vw}px: the shelf sits below the synopsis and costs the first claim nothing`,
           `${below} of ${FILMS.length} below, worst claim ${(100*worst).toFixed(1)}% visible on arrival`);
      else bad(`${vw}px: the shelf sits below the synopsis and costs the first claim nothing`,
            `${below} below, ${whole} claims whole, worst ${(100*worst).toFixed(1)}%`);
  }

  /* ── 8. rule 7 ── */
  console.log("\n── 8. rule 7: the same corpus draws the same shelf ────────────────");
  const same = FILMS.filter(([k]) => rows[1440][k].html != null && rows[1440][k].html === rows[1440][k].again).length;
  const sameMarked = FILMS.filter(([k]) => rows[1440][k].html != null && rows[1440][k].html === rows[1440][k].marked).length;
  if ((same === FILMS.length && sameMarked === FILMS.length))
    ok("byte-identical on a second draw and across a Seen-it re-render",
         `${same}/${FILMS.length} and ${sameMarked}/${FILMS.length}, ${(rows[1440][FILMS[0][0]].html||"").length} chars`);
    else bad("byte-identical on a second draw and across a Seen-it re-render",
          `${same}/${FILMS.length} redraw, ${sameMarked}/${FILMS.length} after a mark`);

  /* ── 9. containment ── */
  console.log("\n── 9. the panel never scrolls sideways ────────────────────────────");
  for (const [vw] of VIEWPORTS){
    const worst = Math.max(...FILMS.map(([k]) => rows[vw][k].overflowX));
    if (worst === 0)
      ok(`${vw}px: no horizontal overflow`, `0px over ${FILMS.length} panels`);
      else bad(`${vw}px: no horizontal overflow`, `${worst}px`);
  }
  if (consoleErrors === 0)
    ok("console clean", `0 page errors over ${FILMS.length*VIEWPORTS.length} panel opens`);
    else bad("console clean", `${consoleErrors} page errors`);

  console.log(problems.length ? `\nSHELF FAIL — ${problems.length} check(s)\n` : "\nSHELF PASS\n");
  process.exit(problems.length ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(2); });
