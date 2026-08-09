#!/usr/bin/env node
/* address-probe.mjs — does a re-formed atlas have a working address?
 *
 *   node .claude/skills/run-film-atlas/address-probe.mjs
 *
 * WHAT THIS HAS TO PROVE, AND WHY EACH PART IS HERE.
 *
 *  1. ROUND TRIP. Compose a selection by clicking, read the address the app
 *     wrote, then load that address COLD in a fresh page and compare the two
 *     skies digit for digit: which films are live, where every one of them
 *     sits, and where the camera ended up. Comparing "it looks right" is how
 *     a layout that silently drifts one ULP ships.
 *
 *  2. PAINT. Every restored sky is also measured for ink on the canvas. This
 *     project has shipped a black screen twice past checks that only read the
 *     DOM (atlas/STATE.md, "Traps that have already cost time").
 *
 *  3. THE FALLBACK, BY BREAKING IT. Corrupt the hash ten ways — an unknown
 *     value, a half-valid intersection, a wrong field, an unparseable escape,
 *     a stray path segment, a register named without its prefix, three keys
 *     that are truthy on Object.prototype, and a selection that is valid but
 *     empty in this corpus — and confirm every one lands on the WHOLE atlas
 *     with a notice, never on an empty sky and never on a partial selection
 *     nobody asked for.
 *
 *  4. THE HONESTY LINE. A baked stratum's address promises a byte-identical
 *     picture, so its readout says nothing extra. A live-solved intersection
 *     cannot promise that, so it must say so on the machine reading the link.
 *     Checked in both directions: present when solved, ABSENT when baked —
 *     a caveat printed everywhere is a caveat nobody reads — and in the
 *     announcement as well as in the type, because type is not the whole
 *     audience.
 *
 * Exits non-zero on any failure. */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = resolve(HERE, "../../..");
const ARTIFACT = process.env.ATLAS_HTML || join(UNIT, "public/atlas.html");
const LOAD_MS = Number(process.env.ATLAS_LOAD_MS || 45000);
const SETTLE_MS = Number(process.env.ATLAS_SETTLE_MS || 3200);

if (!existsSync(ARTIFACT)) {
  console.error(`No artifact at ${ARTIFACT}\n  build it:  node atlas/app/build.js --out public/atlas.html`);
  process.exit(2);
}
const URL_BASE = pathToFileURL(ARTIFACT).href;

const log = (...a) => console.log(...a);
let ok = true;
const fail = (m) => { ok = false; console.log("  FAIL  " + m); };
const pass = (m) => log("  ok    " + m);

/* Ink on the real backing store, not on the markup. See driver.mjs. */
const CANVAS_INK = `(() => {
  const c = document.getElementById("sky-c");
  if (!c || !c.width) return { pct: 0 };
  const g = c.getContext("2d", { willReadFrequently: true });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 8) lit++;
  return { pct: +(100 * lit / Math.ceil(d.length / (4 * 37))).toFixed(2) };
})()`;

/* THE FINGERPRINT OF A PICTURE. Positions go out as their shortest exact
   decimal (JSON's double formatting round-trips), so two skies compare as
   strings and a difference in the last bit is a difference here. The camera
   goes with them because "the same films in the same places, framed
   differently" is not the same picture arriving. */
/* Reads only through __ATLAS_SKY__, which returns empty arrays before the sky
   is built. A page that legitimately lands on the WALL must make this report a
   failure, not throw — the first version reached into sky.wy directly and one
   negative control crashed the probe instead of being measured by it. */
const SNAPSHOT = `(() => {
  const A = window.__ATLAS_SKY__;
  const live = A.liveMask(), keys = A.keys(), pos = A.positions();
  const members = [], places = [];
  for (let i = 0; i < live.length; i++) if (live[i]) { members.push(keys[i]); places.push(pos[i]); }
  const s = A.state();
  return {
    hash: location.hash,
    address: A.address(),
    stale: A.stale(),
    view: state.view,
    n: members.length,
    kind: s.kind,
    forming: s.forming || !!sky.anim,
    /* sorted: membership is a set, and the order sky indices happen to be in
       is not part of what an address promises */
    members: members.slice().sort().join("\\u0000"),
    places: JSON.stringify(places),
    cam: JSON.stringify([sky.cam.cx, sky.cam.cy, sky.cam.k]),
    strip: (document.getElementById("sky-stratum") || {}).textContent || "",
    stripHidden: !!(document.getElementById("sky-stratum") || {}).hidden,
    read: (document.getElementById("sky-read") || {}).textContent || "",
    /* what a reader who is LISTENING is told. The caveat and the fallback are
       both carried by type, and type is not the whole audience. */
    sr: (document.getElementById("sr-status") || {}).textContent || "",
  };
})()`;

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const ours = (t) => /Failed to load resource/i.test(t);
  page.on("console", (m) => { if (m.type() === "error" && !ours(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.route("**/*", (r) => (r.request().resourceType() === "image" ? r.abort() : r.continue()));
  return { page, errors };
}

async function load(browser, hash) {
  const { page, errors } = await newPage(browser);
  await page.goto(URL_BASE + (hash || ""), { waitUntil: "load", timeout: LOAD_MS });
  await page.waitForFunction("typeof KEYS !== 'undefined' && KEYS.length > 0", null, { timeout: LOAD_MS });
  await page.waitForTimeout(SETTLE_MS);
  return { page, errors };
}

const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });

/* ── pick the fixtures out of the artifact itself ─────────────────────────
   Hardcoding "gothic" and "genre:horror" would make this probe a check on
   one corpus edition. It asks the running app instead. */
const { page: scout } = await load(browser, "#/sky");
const FIX = await scout.evaluate(`(() => {
  const reg = Object.keys(FACET_DEFS.register.values)[0];
  const byCount = (field) => [...skyFacetCounts(field).entries()].sort((a,b) => b[1]-a[1]);
  const genre = byCount("genre").find(([v]) => LAYOUT.strata[v]);
  const era   = byCount("era").find(([v]) => LAYOUT.strata[v]);
  /* an intersection with films in it, which the app must solve live */
  const inter = [genre[0], era[0]];
  /* a selection that is spelled correctly and holds nothing in this corpus */
  let empty = null;
  for (const [g] of byCount("genre")) {
    for (const [e] of byCount("era")) {
      const a = skyPostingSet("genre", g), b = skyPostingSet("era", e);
      let n = 0; for (const i of a) if (b.has(i)) n++;
      if (!n) { empty = [g, e]; break; }
    }
    if (empty) break;
  }
  return { reg, genre: genre[0], genreN: genre[1], era: era[0], inter, empty,
           regN: skyPostingSet("register", reg).size };
})()`);
await scout.context().close();
log(`fixtures    world:${FIX.reg} (${FIX.regN})  ${FIX.genre} (${FIX.genreN})  `
  + `intersection ${FIX.inter.join(" x ")}  empty-pair ${FIX.empty ? FIX.empty.join(" x ") : "none found"}`);

/* ── 1 · round trip ───────────────────────────────────────────────────────
   Click it, read the address, load the address cold, compare. */
async function roundTrip(name, clicks, expectAddress) {
  const { page, errors } = await load(browser, "#/sky");
  for (const [field, value] of clicks) {
    await page.evaluate(`skyToggleFacet(${JSON.stringify(field)}, ${JSON.stringify(value)})`);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(SETTLE_MS);
  const composed = await page.evaluate(SNAPSHOT);
  const inkA = await page.evaluate(CANVAS_INK);
  await page.context().close();

  log(`\n${name}`);
  log(`  address   ${composed.hash}   (${composed.n} films, ${composed.kind})`);
  if (composed.hash !== composed.address) fail(`the bar says ${composed.hash} and the app says ${composed.address}`);
  if (expectAddress && composed.hash !== expectAddress) fail(`expected ${expectAddress}, got ${composed.hash}`);
  if (composed.forming) fail("the composed sky was still animating when it was measured");

  const { page: p2, errors: e2 } = await load(browser, composed.hash);
  const restored = await p2.evaluate(SNAPSHOT);
  const inkB = await p2.evaluate(CANVAS_INK);
  await p2.context().close();

  if (restored.view !== "sky") return fail(`a cold load of ${composed.hash} landed on "${restored.view}"`);
  if (restored.stale) return fail(`a cold load of ${composed.hash} reported it as stale: ${restored.stale}`);
  if (restored.forming) fail("the restored sky was still animating when it was measured");

  const cmp = (label, a, b) => a === b
    ? pass(`${label} identical`)
    : fail(`${label} differs\n          composed ${String(a).slice(0, 110)}\n          restored ${String(b).slice(0, 110)}`);
  cmp(`membership (${restored.n} films)`, composed.members, restored.members);
  cmp("every position", composed.places, restored.places);
  cmp("camera        ", composed.cam, restored.cam);
  cmp("address       ", composed.address, restored.address);
  if (composed.n !== restored.n) fail(`${composed.n} films composed, ${restored.n} restored`);
  if (inkB.pct < 0.2) fail(`restored sky painted ${inkB.pct}% ink — this is the black-page failure`);
  else pass(`ink ${inkA.pct}% composed / ${inkB.pct}% restored`);
  for (const e of [...errors, ...e2]) fail("console: " + e);
  return { composed, restored };
}

const rWorld = await roundTrip("world     · a register, baked",
  [["register", FIX.reg]], "#/sky/world:" + FIX.reg);
const rStrat = await roundTrip("stratum   · a recorded facet, baked",
  [["genre", FIX.genre]], "#/sky/" + FIX.genre);
const rInter = await roundTrip("intersect · two values, solved live",
  [["genre", FIX.inter[0]], ["era", FIX.inter[1]]]);

/* ── 2 · the honesty line ─────────────────────────────────────────────── */
log("\nhonesty   · what each address is allowed to promise");
const solvedSays = /solved here/i;
const caveat = /solved here, in this page/i;
for (const [what, r, wantSolved] of [["world", rWorld, false], ["stratum", rStrat, false], ["intersection", rInter, true]]) {
  if (!r) continue;
  const strip = solvedSays.test(r.restored.strip);
  const read = caveat.test(r.restored.read);
  const spoken = /solved in this page/i.test(r.restored.sr);
  if (r.restored.kind !== (wantSolved ? "solved" : "stratum"))
    fail(`${what} restored as kind="${r.restored.kind}", expected ${wantSolved ? "solved" : "stratum"}`);
  if (strip !== wantSolved) fail(`${what}: strip ${strip ? "claims" : "does not say"} "solved here" and it should${wantSolved ? "" : " not"}`);
  else if (read !== wantSolved) fail(`${what}: readout ${read ? "carries" : "omits"} the engine caveat and it should${wantSolved ? "" : " not"}`);
  else if (spoken !== wantSolved) fail(`${what}: the announcement ${spoken ? "carries" : "omits"} the engine caveat and it should${wantSolved ? "" : " not"}`);
  else pass(`${what.padEnd(12)} kind=${r.restored.kind}, caveat ${wantSolved ? "printed and spoken" : "absent from both"}`);
}

/* ── 2b · #/sky means the WHOLE atlas ─────────────────────────────────────
   Not "the sky view, with whatever you were holding". This is the one case a
   cold-load probe cannot see, because a fresh page has nothing to hold: it
   only appears when you navigate from one sky address to another inside a
   session, which is exactly what following two links in a row looks like. */
log("\nwhole     · #/sky puts down whatever the previous address was holding");
{
  const { page, errors } = await load(browser, "#/sky/world:" + FIX.reg);
  const out = await page.evaluate(`(async () => {
    const before = __ATLAS_SKY__.state();
    location.hash = "#/sky";
    await new Promise(r => setTimeout(r, 2600));
    const after = __ATLAS_SKY__.state();
    /* and a route is a held thing too */
    const keys = __ATLAS_SKY__.keys();
    skyPassageStart(keys[0]); skyPassageTo(keys[1]);
    await new Promise(r => setTimeout(r, 900));
    const routed = location.hash;
    location.hash = "#/sky";
    await new Promise(r => setTimeout(r, 1200));
    return { beforeN: before.live, beforeKind: before.kind, afterN: after.live,
             afterKind: after.kind, hash: location.hash, routed,
             passage: !!sky.passage.from };
  })()`);
  await page.context().close();
  if (out.afterKind !== "whole" || out.afterN !== 2204)
    fail(`#/sky after ${out.beforeN} films left ${out.afterN} films, kind="${out.afterKind}"`);
  else if (out.passage) fail(`#/sky left a route drawn (was ${out.routed})`);
  else if (out.hash !== "#/sky") fail(`#/sky rewrote itself to ${out.hash}`);
  else pass(`${out.beforeN} films (${out.beforeKind}) -> #/sky -> ${out.afterN} (${out.afterKind}), route put down`);
  for (const e of errors) fail("console: " + e);
}

/* ── 3 · canonical order ──────────────────────────────────────────────────
   TWO VALUES IN THE SAME FACET, which is the only case that can fail. Across
   facets skySelected() already walks FACET_FIELDS in a fixed order, so the
   first version of this check compared genre+era and passed with the sort
   deleted — it was testing an ordering nothing could disturb. Within one
   facet the selection is a Set and Sets are insertion-ordered, so drama-then-
   horror and horror-then-drama are two different orders of the same thing. */
log("\ncanonical · one selection, one address, whatever order it was clicked");
{
  const { page } = await load(browser, "#/sky");
  const two = await page.evaluate(`[...skyFacetCounts("genre").entries()]
    .sort((a,b) => b[1]-a[1]).slice(0,2).map(r => r[0])`);
  const one = async (order) => page.evaluate(`(() => { skyClearFacets();
    ${order.map(v => `skyToggleFacet("genre", ${JSON.stringify(v)});`).join("")}
    return __ATLAS_SKY__.address(); })()`);
  const a = await one(two);
  const b = await one([...two].reverse());
  await page.context().close();
  if (a === b) pass(`${two.join(" / ")} in both orders -> ${a}`);
  else fail(`click order changed the address: ${a} vs ${b}`);
}

/* ── 4 · a passage inside a world does not eat the world's address ─────── */
log("\npassage   · clearing a route restores the selection's address");
{
  const { page } = await load(browser, "#/sky/world:" + FIX.reg);
  const out = await page.evaluate(`(async () => {
    const before = __ATLAS_SKY__.address();
    const live = __ATLAS_SKY__.liveMask(), keys = __ATLAS_SKY__.keys();
    const inSel = []; for (let i = 0; i < live.length; i++) if (live[i]) inSel.push(keys[i]);
    skyPassageStart(inSel[0]); skyPassageTo(inSel[1]);
    await new Promise(r => setTimeout(r, 700));
    const during = location.hash;
    skyPassageClear();
    await new Promise(r => setTimeout(r, 200));
    return { before, during, after: location.hash };
  })()`);
  await page.context().close();
  if (!/^#\/passage\//.test(out.during)) fail(`a live route addressed itself as ${out.during}`);
  else if (out.after !== out.before) fail(`clearing the route left the address at ${out.after}, not ${out.before}`);
  else pass(`${out.before} -> ${out.during} -> ${out.after}`);
}

/* ── 5 · break it ─────────────────────────────────────────────────────────
   Every one of these is a hash a real link could carry after an edition
   changes, or a hash a person could mistype. */
log("\ncorrupt   · a bad address falls to the WHOLE atlas, never an empty sky");
const corruptions = [
  ["value gone from this edition", "#/sky/genre:nonesuch-1937"],
  ["half of an intersection gone", `#/sky/${FIX.genre}+genre:nonesuch-1937`],
  ["right value, wrong field    ", `#/sky/world:${FIX.genre}`],
  ["unparseable escape          ", "#/sky/%E0%A4%A"],
  ["stray path segment          ", `#/sky/world:${FIX.reg}/zoom`],
  ["register named as a bare id ", `#/sky/${FIX.reg}`],
  /* Every one of these is truthy on an ordinary object literal, so a lookup
     table without Object.hasOwn would take the "this value exists" branch. */
  ["a key off Object.prototype ", "#/sky/genre:constructor"],
  ["__proto__ as a world       ", "#/sky/world:__proto__"],
  ["__proto__ as a field       ", "#/sky/__proto__:x"],
];
if (FIX.empty) corruptions.push(["valid, but empty in this corpus", `#/sky/${FIX.empty[0]}+${FIX.empty[1]}`]);
for (const [what, hash] of corruptions) {
  const { page, errors } = await load(browser, hash);
  const s = await page.evaluate(SNAPSHOT);
  const ink = await page.evaluate(CANVAS_INK);
  await page.context().close();
  const whole = s.view === "sky" && s.n === (await Promise.resolve(s.n)) && s.kind === "whole";
  const problems = [];
  if (s.view !== "sky") problems.push(`landed on "${s.view}"`);
  if (!whole) problems.push(`kind="${s.kind}" — not the whole atlas`);
  if (!s.stale) problems.push("no stale notice: the reader is told nothing");
  if (s.stripHidden) problems.push("the strip is hidden, so nothing on screen names the dropped selection");
  if (!/not in this edition/i.test(s.strip)) problems.push("the strip does not say the link failed");
  if (!/no longer has/i.test(s.read)) problems.push("the readout does not explain the fallback");
  /* skyFormSettled has already announced "the whole atlas, re-formed" by then,
     which is true and is not the news — a listener would be told it worked. */
  if (/re-formed/i.test(s.sr) || !/names a selection/i.test(s.sr))
    problems.push(`the announcement does not say the link failed: "${s.sr.slice(0,60)}"`);
  if (ink.pct < 0.5) problems.push(`painted ${ink.pct}% ink`);
  for (const e of errors) problems.push("console: " + e);
  if (problems.length) fail(`${what}  ${hash}\n          ` + problems.join("\n          "));
  else pass(`${what}  ${hash} -> whole atlas, ${s.n} films, ink ${ink.pct}%, notice shown`);
}

/* ── 6 · the good addresses still work after a bad one, in the same page ── */
log("\nrecovery  · a stale link is an arrival state, not a mode");
{
  const { page, errors } = await load(browser, "#/sky/genre:nonesuch-1937");
  const out = await page.evaluate(`(async () => {
    const stale = __ATLAS_SKY__.stale();
    location.hash = "#/sky/world:" + ${JSON.stringify(FIX.reg)};
    await new Promise(r => setTimeout(r, 2500));
    return { stale, after: __ATLAS_SKY__.stale(), n: __ATLAS_SKY__.state().live,
             kind: __ATLAS_SKY__.state().kind, hash: location.hash };
  })()`);
  await page.context().close();
  if (!out.stale) fail("the stale link did not register as stale at all");
  else if (out.after) fail(`the notice survived a good address: ${out.after}`);
  else if (out.kind !== "stratum" || out.n !== FIX.regN) fail(`recovered to kind=${out.kind}, ${out.n} films (expected stratum, ${FIX.regN})`);
  else pass(`stale -> ${out.hash} -> ${out.n} films, kind=${out.kind}, notice cleared`);
  for (const e of errors) fail("console: " + e);
}

await browser.close();
log(ok ? "\nADDRESS PASS" : "\nADDRESS FAIL");
process.exitCode = ok ? 0 : 1;
