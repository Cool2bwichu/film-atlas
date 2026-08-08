# Atlas Radial Film Inspection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let readers inspect every film surrounding a radial-map center without changing that web, then travel only through an explicit **Explore this film's web** action, and publish the verified result as version 2 of the existing private Sites reference.

**Architecture:** Add one dependency-free pure intent module that distinguishes center selection, valid ring inspection, and invalid selection; inject it into the existing self-contained HTML build. Keep DOM rendering in `template.html`, where a contextual drawer uses the selected ring edge while the current center, ring, URL, and trail remain stable. Validate the state contract with Node tests and the complete interaction in Chromium before building a clean committed Sites version.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, CommonJS-compatible UMD module, Node 22 built-in test runner, existing vinext build, Playwright CLI, private Sites hosting.

## Global Constraints

- Preserve the current 803-film, 7,759-relationship release corpus; the unfinished 2,204-film enrichment is not part of this feature or deployment.
- Never stage or commit `atlas/pipeline/out/enrich.json`.
- Inspecting a surrounding film must not mutate `state.centre`, `state.ring`, `state.trail`, or `location.hash`.
- The only radial-preview action allowed to recenter is **Explore this film's web**.
- A surrounding-film preview shows only its exact relationship to the current center; it does not render a nested six-film web.
- The center film retains its existing **Why it connects** list, but selecting a row inspects that linked film rather than navigating immediately.
- Selected state uses both an inset keyline and the literal `INSPECTING` slate marker; it cannot depend on color alone.
- The travel control is at least 44 CSS pixels high, works with pointer, touch, and keyboard, and names the selected film accessibly.
- Preview state is temporary and creates no history entry; deliberate travel creates one film-route history entry.
- Preserve the whole-constellation orbit interaction, relationship ranking, claims, evidence semantics, responsive map layout, Seen/Love storage, and existing darkroom visual DNA.
- Add no runtime or production dependency.
- Keep Sites version 1 recoverable; publish the verified feature as a new private version of project `appgprj_6a76ddd13c98819190ac77801dde0473`.

---

### Task 1: Define and inject the radial-selection intent

**Files:**
- Create: `atlas/app/radial-inspection.js`
- Create: `tests/radial-inspection.test.mjs`
- Modify: `atlas/app/template.html:849-856`
- Modify: `atlas/app/build.js:128-141`
- Modify: `tests/rendered-html.test.mjs:1-44`

**Interfaces:**
- Consumes: `{ centreKey: string, ring: Array<{key: string, e: object}>, selectedKey: string }`.
- Produces: `selectRadialFilm(input) -> { kind: "centre"|"inspect"|"missing", selectedKey: string|null, centreKey: string, connection: object|null }`.
- Exposes the same function as `module.exports.selectRadialFilm` under Node and `globalThis.AtlasRadialInspection.selectRadialFilm` in the built browser artifact.

- [ ] **Step 1: Write the failing pure intent tests**

Create `tests/radial-inspection.test.mjs`:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { selectRadialFilm } = require("../atlas/app/radial-inspection.js");

const rebecca = { key: "rebecca", e: { claim: "A precise connection." } };
const oldboy = { key: "oldboy", e: { claim: "A second precise connection." } };

test("a ring film becomes an inspection intent without mutating the web", () => {
  const ring = [rebecca, oldboy];
  const before = structuredClone(ring);
  const result = selectRadialFilm({
    centreKey: "the handmaiden",
    ring,
    selectedKey: "rebecca",
  });

  assert.equal(result.kind, "inspect");
  assert.equal(result.selectedKey, "rebecca");
  assert.equal(result.centreKey, "the handmaiden");
  assert.equal(result.connection, rebecca);
  assert.deepEqual(ring, before);
});

test("the center remains a center-detail intent", () => {
  assert.deepEqual(
    selectRadialFilm({
      centreKey: "the handmaiden",
      ring: [rebecca],
      selectedKey: "the handmaiden",
    }),
    {
      kind: "centre",
      selectedKey: "the handmaiden",
      centreKey: "the handmaiden",
      connection: null,
    },
  );
});

test("a film outside the current web cannot become an inspection", () => {
  assert.deepEqual(
    selectRadialFilm({
      centreKey: "the handmaiden",
      ring: [rebecca],
      selectedKey: "stalker",
    }),
    {
      kind: "missing",
      selectedKey: null,
      centreKey: "the handmaiden",
      connection: null,
    },
  );
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
node --test tests/radial-inspection.test.mjs
```

Expected: FAIL with `Cannot find module '../atlas/app/radial-inspection.js'`.

- [ ] **Step 3: Implement the dependency-free intent module**

Create `atlas/app/radial-inspection.js`:

```js
"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AtlasRadialInspection = api;
})(typeof globalThis === "object" ? globalThis : this, function createApi() {
  function selectRadialFilm({ centreKey, ring, selectedKey }) {
    if (selectedKey === centreKey) {
      return { kind: "centre", selectedKey, centreKey, connection: null };
    }

    const connection = Array.isArray(ring)
      ? ring.find((item) => item && item.key === selectedKey) || null
      : null;

    if (!connection) {
      return { kind: "missing", selectedKey: null, centreKey, connection: null };
    }

    return { kind: "inspect", selectedKey, centreKey, connection };
  }

  return Object.freeze({ selectRadialFilm });
});
```

Insert a single marker immediately after the existing corpus/layout markers in `atlas/app/template.html`:

```html
/* __CORPUS__ */
/* __LAYOUT__ */
/* __RADIAL_INSPECTION__ */
```

In `atlas/app/build.js`, after the layout replacement, inject the module exactly once:

```js
const inspectionMarker="/* __RADIAL_INSPECTION__ */";
if(!html.includes(inspectionMarker)) throw new Error("Atlas template is missing its radial inspection marker");
const inspectionSource=fs.readFileSync(path.join(__dirname,"radial-inspection.js"),"utf8");
html=html.replace(inspectionMarker,inspectionSource);
if(html.includes(inspectionMarker)) throw new Error("Atlas template contains more than one radial inspection marker");
```

- [ ] **Step 4: Protect the generated artifact seam**

Add these assertions to the first rendered-artifact test in `tests/rendered-html.test.mjs` after reading `html`:

```js
assert.match(html, /AtlasRadialInspection/);
assert.match(html, /function selectRadialFilm/);
assert.doesNotMatch(html, /__RADIAL_INSPECTION__/);
assert.equal((html.match(/function selectRadialFilm/g) ?? []).length, 1);
```

- [ ] **Step 5: Run the focused tests and verify green**

Run:

```bash
node --test tests/radial-inspection.test.mjs
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: three radial-intent tests pass; the build succeeds with 803 films and 7,759 edges; all rendered-artifact tests pass.

- [ ] **Step 6: Commit the intent boundary**

```bash
git add atlas/app/radial-inspection.js atlas/app/template.html atlas/app/build.js tests/radial-inspection.test.mjs tests/rendered-html.test.mjs
git commit -m "test: define radial film inspection intent"
```

---

### Task 2: Replace immediate radial traversal with contextual inspection

**Files:**
- Modify: `atlas/app/template.html:296-370`
- Modify: `atlas/app/template.html:1079-1093`
- Modify: `atlas/app/template.html:1476-1644`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `AtlasRadialInspection.selectRadialFilm(...)` from Task 1 and current `state.ring` entries shaped as `{ key, e }`.
- Produces: `openPanel(key, intent|null)`, `syncMapInspection()`, `mapNode(key)`, and `openMap(key, keepTrail, historyMode)` where `historyMode` is `"replace"` by default and `"push"` only for explicit preview travel.
- Stores temporary `state.panelContext`; it is never serialized or persisted.

- [ ] **Step 1: Add the failing generated-contract test**

Add the source-template URL near the existing test constants and the following test to `tests/rendered-html.test.mjs`:

```js
const sourceTemplateUrl = new URL("../atlas/app/template.html", import.meta.url);

test("radial neighbours expose inspection before explicit traversal", async () => {
  const [html, template] = await Promise.all([
    readFile(builtAtlasUrl, "utf8"),
    readFile(sourceTemplateUrl, "utf8"),
  ]);

  assert.match(html, /Connected to/);
  assert.match(html, /Why it appears here/);
  assert.match(html, /Explore this film's web/);
  assert.match(template, /data-act="travel"/);
  assert.match(template, /node\.setAttribute\("aria-pressed",selected\?"true":"false"\)/);
  assert.doesNotMatch(template, /else openMap\(k,true\)/);
});
```

- [ ] **Step 2: Build and verify that the new contract fails for the current behavior**

Run:

```bash
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: FAIL in `radial neighbours expose inspection before explicit traversal` because the drawer copy and travel action do not exist yet.

- [ ] **Step 3: Add the selected visual and travel-control styles**

Add the following rules beside the existing `.node` and `.panel` rules in `atlas/app/template.html`:

```css
.node .inspect-mark{display:none;margin-top:6px;font-family:var(--mono);font-size:7.5px;
  letter-spacing:.19em;text-transform:uppercase;color:var(--ink)}
.node.inspecting .inspect-mark{display:block}
.node.inspecting .frame{
  outline-color:var(--nc,var(--accent));outline-offset:3px;
  box-shadow:inset 0 0 0 1px var(--nc,var(--accent)),0 18px 44px rgba(0,0,0,.72)}
.why-item.inspect-claim{cursor:default;transform:none}
.why-item.inspect-claim:hover{background:none;transform:none}
.panel-travel{width:100%;min-height:44px;margin:5px 0 22px;
  border-color:var(--accent);color:var(--ink);text-align:center}
.panel-travel:hover,.panel-travel:focus-visible{
  background:color-mix(in oklab,var(--accent) 14%,transparent)}
.panel .generated-poster{width:min(100%,200px);aspect-ratio:2/3}
.panel .generated-poster .gen{width:100%;height:100%}
```

Do not add an inspection animation. The existing `@media (prefers-reduced-motion:reduce)` rule already reduces every transition and animation through its `*` selector; Task 3 verifies the new state under that media setting.

- [ ] **Step 4: Add temporary inspection state and node synchronization**

Extend state and add the two small DOM helpers before `openMap`:

```js
const state = {
  view:"wall", centre:null, ring:[], trail:[], drawn:new Set(),
  seen:new Set(preferences.seen), loved:new Set(preferences.loved), filter:preferences.filter,
  sel:null, panelContext:null,
};

function mapNode(key){
  return [...$("#stage").querySelectorAll(".node")].find((node)=>node.dataset.k===key) || null;
}

function syncMapInspection(){
  const active = $("#panel").classList.contains("on") && state.panelContext?.kind==="inspect"
    ? state.sel : null;
  $("#stage").querySelectorAll(".node").forEach((node)=>{
    const selected = node.dataset.k===active;
    node.classList.toggle("inspecting",selected);
    if(node.dataset.i!=="-1") node.setAttribute("aria-pressed",selected?"true":"false");
  });
}
```

- [ ] **Step 5: Make ring selection inspect while keeping center selection unchanged**

Inside `renderMap()`'s `mk` function, give every node a stable key, add the visible marker, and replace the direct `openMap` handler:

```js
n.dataset.i=i;
n.dataset.k=k;
if(i>=0) n.setAttribute("aria-pressed","false");
n.setAttribute("aria-label",i<0
  ? `${f.title}${f.year?`, ${f.year}`:""}. Open film details.`
  : `${f.title}${f.year?`, ${f.year}`:""}. Open film details. ${edgeMeta(conn.e)}: ${conn.e.claim}`);

n.innerHTML=`<div class="frame">${art(k,"",i<0?"high":"auto")}${
  state.seen.has(k)||state.loved.has(k)?'<span class="seen"></span>':""}</div>
  <div class="label"><span class="t">${esc(f.title)}</span>
  <span class="y">${f.year||""}</span>${
    i<0?"":`<span class="r">${esc(edgeMeta(conn.e))}</span>
      <span class="inspect-mark" aria-hidden="true">inspecting</span>`}</div>`;

n.onclick=()=>{
  const intent=AtlasRadialInspection.selectRadialFilm({
    centreKey:state.centre,ring:state.ring,selectedKey:k,
  });
  if(intent.kind==="centre") openPanel(k);
  else if(intent.kind==="inspect") openPanel(k,intent);
};
```

Call `syncMapInspection()` at the end of `renderMap()` after all seven nodes exist.

- [ ] **Step 6: Render the contextual drawer and explicit travel action**

Change the panel signature to `openPanel(k, context=null)` and use this structure before assigning `p.innerHTML`:

```js
function openPanel(k, context=null){
  const inspection = context?.kind==="inspect" && context.centreKey===state.centre
    ? context : null;
  state.sel=k;
  state.panelContext=inspection;
  const f=F[k], p=$("#panel");
  p.style.setProperty("--accent",f.highlight);
  const actions=`<div class="acts">
    <button class="btn${state.seen.has(k)?" on":""}" data-act="seen"
      aria-pressed="${state.seen.has(k)?"true":"false"}">Seen it</button>
    <button class="btn${state.loved.has(k)?" on":""}" data-act="loved"
      aria-pressed="${state.loved.has(k)?"true":"false"}">Love it</button>
  </div>`;
  const description=f.description?`<p class="desc">${esc(f.description)}</p>`:"";
  const why=inspection
    ? `<div class="why"><h3>Why it appears here</h3>
        <div class="why-item inspect-claim" style="--wc:${meta(inspection.connection.e.type).color}">
          <div class="c">${esc(inspection.connection.e.claim)}</div>
          <div class="m">${edgeMeta(inspection.connection.e)} · ${esc(F[state.centre].title)}${
            inspection.connection.e.source&&inspection.connection.e.source!=="record"
              ? " · "+claimStatus(inspection.connection.e):""}</div>
          ${inspection.connection.e.source==="attested"&&inspection.connection.e.attribution
            ? `<div class="src">${esc(inspection.connection.e.attribution)}</div>`:""}
        </div></div>`
    : `<div class="why"><h3>Why it connects</h3>${state.ring.map((c)=>
        `<button type="button" class="why-item" data-k="${esc(c.key)}"
          style="--wc:${meta(c.e.type).color}">
          <div class="c">${esc(c.e.claim)}</div>
          <div class="m">${edgeMeta(c.e)} · ${esc(F[c.key].title)}${
            c.e.source&&c.e.source!=="record"?" · "+claimStatus(c.e):""}</div>
          ${c.e.source==="attested"&&c.e.attribution
            ? `<div class="src">${esc(c.e.attribution)}</div>`:""}
        </button>`).join("")}</div>`;
  const travel=inspection
    ? `<button class="btn panel-travel" type="button" data-act="travel"
        aria-label="Explore ${esc(f.title)}'s web">Explore this film's web</button>`:"";

  p.innerHTML=`
    <button class="panel-x" aria-label="Close">&times;</button>
    <div class="phead"><div class="pmeta">
      <div class="slate">${inspection?`Connected to ${esc(F[state.centre].title)}`:"film"}</div>
      <h2>${esc(f.title)}</h2>
      <div class="by">${f.year||""}${f.director?"  ·  "+esc(f.director):""}</div>
    </div>${f.poster
      ? `<img class="poster" src="${esc(f.poster)}" alt="" decoding="async">`
      : `<div class="poster generated-poster" aria-hidden="true">${genArt(k)}</div>`}</div>
    ${inspection?why+description+actions+travel:actions+why+description}
    <div class="row"><span>connections</span><span>${ADJ[k].length}</span></div>
    <div class="row"><span>palette</span><span>${f.paletteSource==="poster"?"from its poster":
      f.paletteSource==="curated"?"observed":"era default"}</span></div>
    ${f.wikipedia?`<div class="row"><span>read more</span><span><a style="color:var(--accent)"
      target="_blank" rel="noopener"
      href="https://en.wikipedia.org/wiki/${encodeURIComponent(f.wikipedia.replace(/ /g,"_"))}">Wikipedia</a></span></div>`:""}`;
```

After opening the panel, call `syncMapInspection()`. Make center-panel relationship rows inspect their films:

```js
p.querySelectorAll(".why-item[data-k]").forEach((row)=>row.onclick=()=>{
  const intent=AtlasRadialInspection.selectRadialFilm({
    centreKey:state.centre,ring:state.ring,selectedKey:row.dataset.k,
  });
  if(intent.kind==="inspect") openPanel(intent.selectedKey,intent);
});
```

Retain the existing panel-open semantics and synchronize selection after the drawer becomes visible:

```js
p.classList.add("on");
p.setAttribute("aria-hidden","false");
p.removeAttribute("inert");
syncMapInspection();
if(state.view==="map") requestAnimationFrame(layout);
```

- [ ] **Step 7: Preserve context across Seen/Love and separate preview from travel history**

Restrict the preference binding so the new travel action can never be mistaken for Love. Before rerendering for Seen/Love, retain `state.panelContext`, rebuild the nodes, then reopen the same drawer:

```js
p.querySelectorAll('[data-act="seen"],[data-act="loved"]').forEach((button)=>button.onclick=()=>{
  const context=state.panelContext;
  const set=button.dataset.act==="seen"?state.seen:state.loved;
  if(set.has(k)) set.delete(k);
  else{
    set.add(k);
    if(button.dataset.act==="loved") state.seen.add(k);
  }
  $("#loved-n").textContent=state.loved.size;
  persistPreferences();
  renderMap();
  openPanel(k,context);
  if(state.view==="wall") renderWall();
});
```

Extend `openMap` and bind the travel button:

```js
function openMap(key, keepTrail, historyMode="replace"){
  if(!F[key]) return;
  state.sel=null;
  state.panelContext=null;
  state.centre=key;
  state.ring=connections(key,6,[key,...(keepTrail?state.trail:[])]);
  if(!keepTrail) state.trail=[];
  if(state.trail[state.trail.length-1]!==key) state.trail.push(key);
  show("map");
  renderMap();
  openPanel(key);
  $("#sr-status").textContent=`${F[key].title}. ${state.ring.length} connected films shown.`;
  requestAnimationFrame(()=>$("#stage").querySelector('.node[data-i="-1"]')
    ?.focus({preventScroll:true}));
  const method=historyMode==="push"?"pushState":"replaceState";
  try{ history[method](null,"","#/film/"+encodeURIComponent(key)); }catch(e){}
}

const travelButton=p.querySelector('[data-act="travel"]');
if(travelButton) travelButton.onclick=()=>openMap(k,true,"push");
```

Keep only one history write in `openMap`; replace the current unconditional `history.replaceState` line rather than adding a second write.

- [ ] **Step 8: Restore focus to the inspected node when the drawer closes**

Replace the focus portion of `closePanel` with:

```js
const returnKey=state.sel;
p.classList.remove("on");
p.setAttribute("aria-hidden","true");
p.setAttribute("inert","");
state.sel=null;
state.panelContext=null;
syncMapInspection();
if(state.view==="map") requestAnimationFrame(layout);
if(restoreFocus){
  requestAnimationFrame(()=>(mapNode(returnKey)||$("#stage").querySelector('.node[data-i="-1"]'))
    ?.focus({preventScroll:true}));
}
```

- [ ] **Step 9: Run focused and full automated checks**

Run:

```bash
node --test tests/radial-inspection.test.mjs
npm run build
node --test tests/rendered-html.test.mjs
npm run lint
npm test
```

Expected: all commands exit 0; the corpus remains 803 films and 7,759 edges; map-quality and claim-quality checks remain PASS.

- [ ] **Step 10: Commit the radial inspection experience**

```bash
git add atlas/app/template.html tests/rendered-html.test.mjs
git commit -m "feat: inspect linked films before changing webs"
```

---

### Task 3: Validate the complete interaction in a real browser

**Files:**
- Inspect: `public/atlas.html`
- Inspect: `dist/client/atlas.html`
- Create locally, do not commit: `output/playwright/radial-inspection/desktop.png`
- Create locally, do not commit: `output/playwright/radial-inspection/mobile.png`

**Interfaces:**
- Consumes: the built radial inspection behavior from Task 2.
- Produces: direct evidence that inspect and travel behave differently across pointer, keyboard, responsive, and reduced-motion states.

- [ ] **Step 1: Confirm the browser runner and start the existing app**

Run:

```bash
command -v npx >/dev/null 2>&1
mkdir -p output/playwright/radial-inspection
curl -fsS 'http://localhost:3000/atlas.html' >/dev/null
```

Expected: `npx` and the local request exit 0. If the local request fails, run `npm run dev` in a retained session, wait for its exact local URL, and rerun the request. Keep that server running through Sites publication.

- [ ] **Step 2: Prove pointer inspection and explicit traversal at 1440×900**

From `output/playwright/radial-inspection/`, use the bundled Playwright wrapper with a named session:

```bash
PWCLI="/Users/mick/.codex/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" --session atlas-radial open 'http://localhost:3000/atlas.html#/film/the%20handmaiden' --headed
"$PWCLI" --session atlas-radial resize 1440 900
"$PWCLI" --session atlas-radial snapshot
```

Then run this behavior assertion:

```bash
"$PWCLI" --session atlas-radial run-code 'const before=await page.evaluate(()=>({centre:document.querySelector(".node.centre .t")?.textContent,ring:[...document.querySelectorAll(".node:not(.centre) .t")].map(n=>n.textContent),hash:location.hash,trail:document.querySelectorAll(".trail-step").length})); await page.getByRole("button",{name:/Rebecca.*Open film details/i}).click(); const preview=await page.evaluate(()=>({centre:document.querySelector(".node.centre .t")?.textContent,ring:[...document.querySelectorAll(".node:not(.centre) .t")].map(n=>n.textContent),hash:location.hash,trail:document.querySelectorAll(".trail-step").length,title:document.querySelector("#panel h2")?.textContent,context:document.querySelector("#panel .slate")?.textContent,why:document.querySelector("#panel .why h3")?.textContent,selected:document.querySelector(".node.inspecting .t")?.textContent})); if(JSON.stringify(preview.ring)!==JSON.stringify(before.ring)||preview.centre!==before.centre||preview.hash!==before.hash||preview.trail!==before.trail||preview.title!=="Rebecca"||!preview.context.includes("The Handmaiden")||preview.why!=="Why it appears here"||preview.selected!=="Rebecca") throw new Error(JSON.stringify({before,preview})); await page.getByRole("button",{name:/Oldboy.*Open film details/i}).click(); if((await page.locator("#panel h2").textContent())!=="Oldboy") throw new Error("second inspection did not replace drawer"); await page.getByRole("button",{name:"Explore Oldboy's web"}).click(); const after=await page.evaluate(()=>({centre:document.querySelector(".node.centre .t")?.textContent,hash:location.hash,trail:document.querySelectorAll(".trail-step").length})); if(after.centre!=="Oldboy"||!after.hash.endsWith("/oldboy")||after.trail!==before.trail+1) throw new Error(JSON.stringify(after)); await page.goBack(); await page.waitForFunction(()=>document.querySelector(".node.centre .t")?.textContent==="The Handmaiden"); if(location.hash!==before.hash) throw new Error(`back restored ${location.hash}`);'
"$PWCLI" --session atlas-radial run-code 'const hash=location.hash; const centre=await page.locator(".node.centre .t").textContent(); await page.locator("#panel .why-item[data-k]").first().click(); const after=await page.evaluate(()=>({hash:location.hash,centre:document.querySelector(".node.centre .t")?.textContent,selected:document.querySelector(".node.inspecting .t")?.textContent,heading:document.querySelector("#panel .why h3")?.textContent})); if(after.hash!==hash||after.centre!==centre||!after.selected||after.heading!=="Why it appears here") throw new Error(JSON.stringify(after));'
```

Expected: command exits 0. Save `desktop.png` and inspect it for a visible `INSPECTING` marker, readable relationship claim, uncut travel button, and no poster/label collisions.

- [ ] **Step 3: Prove keyboard, close-focus, and reduced-motion behavior**

Run:

```bash
"$PWCLI" --session atlas-radial open 'http://localhost:3000/atlas.html#/film/the%20handmaiden'
"$PWCLI" --session atlas-radial run-code 'await page.emulateMedia({reducedMotion:"reduce"}); const target=page.getByRole("button",{name:/Rebecca.*Open film details/i}); await target.focus(); await page.keyboard.press("Enter"); if((await page.locator("#panel h2").textContent())!=="Rebecca") throw new Error("keyboard inspection failed"); await page.keyboard.press("Escape"); const focused=await page.evaluate(()=>document.activeElement?.querySelector(".t")?.textContent); if(focused!=="Rebecca") throw new Error(`focus returned to ${focused}`);'
```

Expected: command exits 0 and Escape returns focus to Rebecca without changing the web.

- [ ] **Step 4: Prove the bottom-sheet composition at 390×780**

Run:

```bash
"$PWCLI" --session atlas-radial resize 390 780
"$PWCLI" --session atlas-radial open 'http://localhost:3000/atlas.html#/film/the%20handmaiden'
"$PWCLI" --session atlas-radial run-code 'await page.getByRole("button",{name:/Rebecca.*Open film details/i}).click(); const box=await page.locator("#panel").boundingBox(); const travel=await page.getByRole("button",{name:"Explore Rebecca's web"}).boundingBox(); if(!box||!travel||box.x<0||box.y<0||box.x+box.width>390.5||box.y+box.height>780.5||travel.height<44) throw new Error(JSON.stringify({box,travel}));'
```

Expected: command exits 0. Save `mobile.png` and inspect it for readable context, claim, synopsis, and travel affordance without horizontal clipping.

- [ ] **Step 5: Check console output and rerun the release gate**

Run:

```bash
"$PWCLI" --session atlas-radial console error
npm run lint
npm test
git diff --check
git status --short
```

Expected: no application console errors; lint and tests exit 0; the only unrelated working-tree entry remains `M atlas/pipeline/out/enrich.json`.

If a browser assertion exposes a defect, add the narrowest failing Node assertion that can represent it, verify the failure, patch `template.html`, rerun Steps 2–5, and amend only the Task 2 feature commit.

---

### Task 4: Publish Sites version 2 and deliver the project overview

**Files:**
- Read: `.openai/hosting.json`
- Modify only in a clean temporary deployment clone: `.openai/hosting.json`
- Package from the clean clone: `dist/`, `dist/.openai/hosting.json`, `dist/server/index.js`

**Interfaces:**
- Consumes: the committed, browser-validated branch head from Tasks 1–3.
- Produces: a new private version of `https://atlas-reference-2026-08-08.cool2bwichu1992.chatgpt.site`, while the original version 1 remains in Sites history.

- [ ] **Step 1: Resolve the exact source commit and create an isolated deployment clone**

Run from the main checkout:

```bash
git status --short
git rev-parse HEAD
atlas_site_tmp=$(mktemp -d /private/tmp/atlas-sites-v2.XXXXXX)
git clone --local --no-hardlinks . "$atlas_site_tmp/site"
git -C "$atlas_site_tmp/site" status --short
```

Expected: the main checkout shows only the known enrichment modification; the clean clone is clean and points at the browser-validated feature commit.

Use `apply_patch` in the clean clone to set only:

```json
{
  "project_id": "appgprj_6a76ddd13c98819190ac77801dde0473",
  "d1": null,
  "r2": null
}
```

- [ ] **Step 2: Rebuild and validate the exact deployable source**

Run inside the clean clone:

```bash
npm ci
npm run lint
npm test
```

Expected: dependency installation, lint, and the complete test suite pass against the clean clone.

- [ ] **Step 3: Commit the exact deployment source**

Run:

```bash
git add .openai/hosting.json
git diff --cached --check
git commit -m "chore: target Atlas reference Sites project"
git status --short
```

Expected: the deployment-only commit contains only `.openai/hosting.json`, and the clone is clean after generated ignored outputs are excluded.

- [ ] **Step 4: Package the validated site with the official helper**

Run:

```bash
/Users/mick/.codex/plugins/cache/openai-bundled/sites/0.1.34/scripts/package-site.sh \
  "$atlas_site_tmp/site" "$atlas_site_tmp/atlas-reference-v2.tar.gz"
```

Expected: the helper confirms `dist/server/index.js`, `dist/client/atlas.html`, and `dist/.openai/hosting.json` are present and emits one archive.

- [ ] **Step 5: Push the exact clean source to the existing Sites repository**

Using the Sites connector:

1. Reuse project `appgprj_6a76ddd13c98819190ac77801dde0473`.
2. Obtain `create_source_repository_write_credential` only if the earlier credential is absent or expired.
3. Push the clean clone's deployment branch with the credential supplied as a per-command HTTP authorization header; do not write it into a remote URL or Git configuration.

Expected: the source push succeeds and returns the exact branch-head SHA used by the next step.

- [ ] **Step 6: Save one Sites version from the pushed source and archive**

Call the connector's version-saving operation once with the pushed branch-head SHA and `atlas-reference-v2.tar.gz`.

Expected: one new version ID is returned for project `appgprj_6a76ddd13c98819190ac77801dde0473`; version 1 remains unchanged.

- [ ] **Step 7: Deploy the saved version privately and wait for its terminal status**

Call `deploy_private_site_version`, poll `get_deployment_status` until it reports `status: "succeeded"` or a terminal failure, and call `open_in_codex` with the exact deployed URL only after success.

Expected: a new private version succeeds at `https://atlas-reference-2026-08-08.cool2bwichu1992.chatgpt.site`; Sites version 1 remains recoverable.

- [ ] **Step 8: Verify the deployed interaction rather than only the deployment status**

Open the deployed URL at `#/film/the%20handmaiden` and repeat the Task 3 pointer assertion against HTTPS. Confirm that inspection retains The Handmaiden's hash and web, and **Explore this film's web** recenters only after activation.

Expected: the deployed behavior matches the locally validated build and no runtime console error appears.

- [ ] **Step 9: Deliver the requested concise overview**

The final response must include:

```text
Updated site: https://atlas-reference-2026-08-08.cool2bwichu1992.chatgpt.site

Changed so far:
- cloned and isolated the latest Film Atlas project;
- audited and preserved the validated 803-film reference;
- mapped the 2,204-film expansion without promoting its unqualified data;
- defined the constellation/lens/trail/library-growth architecture;
- changed radial linked-film clicks from automatic travel to inspection-first exploration.

Work ahead:
- permanent film and relationship identity, reproducible baselines, provenance, facets, and palette recovery;
- rebalance and qualify the 2,204-film association graph;
- add category lenses, Generated Programmes, and deterministic Ask the Atlas;
- add graceful trails and a local contact-sheet journal;
- introduce progressive Core/Archive delivery only after measured need.
```

Confirm the response URL matches the successful deployment result. Report any incomplete qualification honestly; do not describe the 2,204-film corpus as released.
