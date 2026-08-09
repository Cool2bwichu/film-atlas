---
name: run-film-atlas
description: Build, run, screenshot and drive ATLAS, the cinematic lineage map. Use when asked to run, start, launch, build, test, screenshot, or interact with the atlas app, the constellation, the wall, or a film's map — or to verify a change to atlas/app/template.html renders.
---

# Running ATLAS

ATLAS ships as **one self-contained HTML file**. `atlas/app/build.js` inlines the
corpus, the discovery facets and the baked layouts into `atlas/app/template.html`
and writes `public/atlas.html` (~9 MB). There is no server in the loop: you open
that file over `file://` and the whole app is there.

So the agent path is a **Playwright driver** that opens the artifact in real
Chromium and pokes it. It lives at
`.claude/skills/run-film-atlas/driver.mjs`, and all paths below are relative to
the repo root.

> **Do not verify this app with jsdom.** `atlas/STATE.md` records two handoffs
> that passed a jsdom check while rendering a black screen. Every assertion in
> the driver ends in *ink* — laid-out tile boxes, painted canvas pixels — for
> exactly that reason. See Gotchas.

## Prerequisites

Nothing to install. Node 22 and Chromium are already present, and `playwright`
is in `node_modules`.

```bash
node -v                      # v22.22.2
ls /opt/pw-browsers          # chromium, chromium_headless_shell, ffmpeg
```

`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is already set. **Do not run
`playwright install`.** If `node_modules` is missing, `npm install`.

## Build

```bash
node atlas/app/build.js --out public/atlas.html
```

~13 seconds, of which ~9 is solving the 44 per-stratum constellation layouts.
It prints what it made:

```
public/atlas.html  8989 KB — 2204 films, 22050 edges, 2204 placed
44 strata re-formed — 10140 film placements, 54 KB
```

`public/atlas.html` is gitignored; rebuild it rather than looking for it.

## Run — agent path

### Full smoke, with screenshots

```bash
node .claude/skills/run-film-atlas/driver.mjs smoke
```

Exercises the wall, a film's radial map, the constellation, narrowing the field,
and a Passage route; writes five PNGs to `.atlas-shots/`; exits non-zero on
failure. Verified output:

```
posters     blocked, so generated cells render
wall        240 tiles laid out (240 nodes)
map         "8" -> 23 laid-out nodes, 6 curves, aria-hidden=false
sky         2204 films, canvas 1440x830, ink 11.76%
narrow      genre=genre:drama -> 1552 of 2204 films, ink 6.6%
passage     ["8","prince of darkness"] -> 8 hops, 8 claims in 81ms
console     clean

SMOKE PASS
```

Read the numbers, not just the verdict. `ink 11.76%` is the constellation
actually painting; `ink 0%` is a black page that passes every other check.

### One screenshot of a specific place

```bash
node .claude/skills/run-film-atlas/driver.mjs shot '#/sky' sky-check
node .claude/skills/run-film-atlas/driver.mjs shot '#/film/vertigo' vertigo
```

Routes are the app's real addresses: `#/sky`, `#/film/<key>`,
`#/passage/<a>/<b>`. Keys are corpus keys (`"vertigo"`, `"8"`), not titles.

### Ask the running page a question

```bash
node .claude/skills/run-film-atlas/driver.mjs eval 'KEYS.length + " films, " + E.length + " edges, " + Object.keys(LAYOUT.strata).length + " strata"'
# "2204 films, 22050 edges, 44 strata"
```

Everything in the app's top-level scope is reachable: `F`, `KEYS`, `E`, `ADJ`,
`sky`, `LAYOUT`, `DISCOVERY`, `passageRoute()`, `skyToggleFacet()`,
`skyFacetCounts()`, `connections()`.

### Interactive poking

```bash
printf 'goto #/sky\nink\neval sky.visibleN\nshot repl-sky\nerrors\nquit\n' \
  | node .claude/skills/run-film-atlas/driver.mjs repl
```

Commands: `goto <route>`, `eval <js>`, `shot <name>`, `ink`, `errors`, `quit`.

### Environment

| var | default | why |
|---|---|---|
| `ATLAS_HTML` | `public/atlas.html` | point at another artifact — this is how you run a negative control |
| `ATLAS_SHOTS` | `.atlas-shots` | screenshot directory |
| `ATLAS_POSTERS` | unset (images blocked) | `=1` allows poster requests. Only useful where the hosts resolve; not here |
| `ATLAS_LOAD_MS` | `45000` | load budget for the 9 MB artifact |

## Direct invocation — the corpus pipeline, no browser

Most changes here touch `atlas/pipeline/*.js`, not the view. Those modules are
CommonJS and take plain arguments; there is no init guard to bypass.

```bash
node -e 'const C=require("./atlas/static/corpus.json");
  console.log(Object.keys(C.films).length, C.edges.length)'          # 2204 22050

node atlas/pipeline/measure-claims.js                                # trivia / crew / repeated
node atlas/pipeline/validate-corpus.js atlas/static/corpus.json      # components, orphans
node -e 'const {layout}=require("./atlas/app/layout-sky.js"); /* films, edges -> {key:[x,y]} */'
node -e 'const {strataLayouts}=require("./atlas/app/layout-strata.js");
  const {report}=strataLayouts(require("./atlas/static/corpus.json"),
                               require("./atlas/static/discovery.json"));
  console.log(report.length, "strata")'                              # 44 strata
```

## Test

```bash
node --test tests/*.test.mjs        # 52 pass, 0 fail  — the fast loop
npm run test:atlas-engine           # EXITS 1 TODAY, on purpose. See Gotchas
npm test                            # full vinext build + both of the above
```

## Gotchas

- **Posters hang; they never fail.** Measured: the page issues 239 image
  requests to `upload.wikimedia.org` and gets back **0 responses and 0
  failures**. Direct navigation to the same URL from Chromium returns
  `ERR_CONNECTION_RESET` — even with `--proxy-server=$HTTPS_PROXY` — while
  `curl` on the same host returns HTTP 200 in 0.29s. Do not spend time trying
  to make posters load in this container; they cannot.

- **That hang hides the app's real artwork, and looks like a bug.** The
  fallback to the generated cell is wired to the image's `onerror`
  (`onerror="this.outerHTML=genArt(k)"` in `template.html`). A request that
  *hangs* never fires `onerror`, so the cell never renders and every tile stays
  an empty frame — the wall screenshots as a grid of dark rectangles and looks
  broken. **The driver blocks image requests by default**, which makes them
  fail instantly, which fires `onerror`, which renders the generated cells. That
  is the app's actual visual identity (AGENTS rule 9) and you cannot see it any
  other way here.

- **Blocking images creates 142 console errors of your own.** They are
  `Failed to load resource`, they are ours, and the driver filters exactly that
  string while `ATLAS_POSTERS` is unset. Do not widen that filter — one real
  `pageerror` buried under 142 of ours is how a regression ships.

- **`npm run test:atlas-engine` exits 1 right now and that is not your
  checkout.** `measure-maps.js` reports interpretive edges at 11% against a 15%
  target. It is open problem 2 in `atlas/STATE.md`: the corpus grew 2.7x and the
  authored layer did not follow. `validate-corpus.js` and `measure-claims.js`
  both pass. Do not "fix" the target.

- **`npm test` runs a full vinext/Cloudflare build first.** For anything
  touching the atlas that is wasted minutes — use `node --test tests/*.test.mjs`
  and `node atlas/app/build.js` directly.

- **A driver outside the repo cannot resolve `playwright`.** Running the same
  script from `/tmp` dies with `ERR_MODULE_NOT_FOUND: Cannot find package
  'playwright'`. That is why it lives in `.claude/skills/run-film-atlas/`
  inside the unit. Keep it there, or set `NODE_PATH`.

- **The constellation needs ~1.8s after `#/sky` before it has painted.** The
  driver waits. If you write your own check, wait on
  `sky.ready && sky.n > 0`, not on a fixed short timer.

- **Screenshots land in `.atlas-shots/`,** which is gitignored. They are ~1 MB
  each and there is no cleanup — delete the directory when you are done.

## Troubleshooting

| symptom | cause and fix |
|---|---|
| `No artifact at .../public/atlas.html` | never built. `node atlas/app/build.js --out public/atlas.html` |
| `Error: Atlas template is missing its sky solver marker` | `build.js` expects a `/* __... */` marker `template.html` does not have. The two files are edited together; you are mid-edit or on a half-applied change |
| `SMOKE FAIL: constellation painted 0% ink` | the sky is not drawing. Console is often clean and the screenshot is still ~1.2 MB — neither tells you anything. Check `skyDraw`/`skyBuild` |
| `SMOKE FAIL: wall rendered 0 laid-out tiles` | `renderWall()` threw or bailed. A corrupted `atlas-preferences-v1` in localStorage has done this before |
| `ERR_MODULE_NOT_FOUND: playwright` | you ran the driver from outside the repo. See Gotchas |
| smoke times out at 45s | the artifact is ~9 MB and parses on load; raise `ATLAS_LOAD_MS` before assuming a hang |

## Proving a check still works

The checks are only worth their runtime if they fail on a broken page. Both were
verified by breaking the artifact and re-running:

```bash
sed 's/^function skyDraw(){$/function skyDraw(){ return;/' public/atlas.html > /tmp/broken.html
ATLAS_HTML=/tmp/broken.html node .claude/skills/run-film-atlas/driver.mjs smoke
#   sky   2204 films, canvas 1440x830, ink 0%
#   FAIL: constellation painted 0% ink
```

That broken page produced **zero console errors** and a **1,223 KB screenshot**.
"No errors" and "a screenshot exists" both passed it. Only the ink check caught
it — which is the whole argument for measuring paint rather than markup.
