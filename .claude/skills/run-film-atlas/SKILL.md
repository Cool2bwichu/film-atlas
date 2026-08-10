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

### Does a re-formed atlas survive being sent to someone

```bash
node .claude/skills/run-film-atlas/address-probe.mjs
```

Routes are real addresses, and a selection is one of them: `#/sky/world:gothic`,
`#/sky/genre:drama+era:1960-1979`. The probe composes a selection by clicking,
reads the address the app wrote, cold-loads it in a fresh page and compares the
two skies digit for digit — membership, every position, and the camera — for a
register, a recorded stratum and a live-solved intersection. Then it corrupts
the hash ten ways and confirms each one lands on the **whole** atlas with the
notice shown, never on an empty sky and never on half a selection. It also
checks the honesty line in both directions: a baked address carries no engine
caveat, a solved one must — including the case a flag in the URL would get
wrong, a **one-token** address for a value too small to have been baked.

~5 min; every restored sky is measured for ink as well, for the reason above.
Nine negative controls are recorded in `atlas/DESIGN.md`, "The address".

### Is the aperture on screen, and is the route's own title readable

```bash
node .claude/skills/run-film-atlas/gate-probe.mjs
```

**Asks the page what it drew, not the model what it would draw.** Reads
`sky.gate` and the four `--ap-*` custom properties off the live page and
compares both against a fresh `skyGate()` on that same page, at nine states ×
three viewports: cold `#/sky`, the `CONSTELLATION` button, the lede link, a cold
world address, the round trip into a world and back, and a Passage — arriving,
with the strip re-opened by hand over it, and cleared.

This exists because the aperture shipped **317px wrong on every ordinary route
into the whole atlas** under a build gate that called `skyGate()` and compared
it with itself. That check proved the function was deterministic; it could not
see that the rectangle on screen was a different rectangle. ~4 min.

It also fails on chrome that eats the reading: the worlds strip overlapping the
readout at all, the Passage title being covered or off-window (hit-tested with
`elementFromPoint`, not inferred from a box), opaque chrome at or over 100% of a
phone viewport, and the strip failing to come back when a route is cleared.

**Proven by breaking it** — the exact patch is in the file's own header; it puts
9 of the 27 states back over the line at 316.7 / 293.8 / 176.4px.

### Does the century run, and does it cost the resting atlas anything

```bash
node .claude/skills/run-film-atlas/transport-probe.mjs
node .claude/skills/run-film-atlas/transport-probe.mjs --controls
```

The constellation has a footage track, a playhead and a run (DESIGN.md, "The
transport"). This probe asks the page what it DREW rather than what it would
draw: it instruments the 2D context and counts every stroked segment with the
dash state it was laid down under, every filled arc, and every sprite blit with
the alpha and size it carried.

Eight things, each ending in a number:

1. **The resting draw is the draw that shipped** — the canvas is captured at
   rest, the transport is switched off in the page, the canvas is captured
   again, and the two are compared **byte for byte**. Every cost claim rests on
   this, and it is exact where a millisecond measurement is not.
2. **Cost** at rest, grazing and running, against the untreated control
   re-measured in the same page twice, plus idle draws in 3 s in three states.
3. **Rule 1** — at any cursor the corpus takes only five or six distinct AGES,
   so "the strike is a function of age alone" has an exact test: one alpha and
   one size per age group, across degrees 1–34.
4. **Rule 3** — dashed segments counted against what the page's own data says
   must be dashed, at eleven cursors.
5. **Nothing before its time** — every disc matched back to a film and every
   stroked endpoint that lands exactly on a film checked against the cursor.
   Exact float positions, never rounded: rounding to the pixel makes a born and
   an unborn film share a coordinate and the check fires on everything.
6. **Nothing parked under the track**, at three viewports.
7. **Reduced motion** arrives, says so, and the track still scrubs and focuses.
8. **The graft** prints the baked neighbour mean and its `n`.

`--controls` patches the built artifact eight ways — the strike made to depend
on degree, the dash removed, an edge drawn forty years early, a film drawn
before it was made, the resting draw changed, the track dropped from
`skyChrome`, reduced motion made to animate, the graft computed off the plate —
and requires each to be reported by the check it was aimed at. **8 of 8.** ~6
min with controls, ~2 without.

## Film — motion capture, and how to judge it

Everything above ends in a **still**. This app does not: a selection flies
2,204 films between two baked layouts over 1,150 ms, the night sky scintillates
and throws a meteor across the whole frame, the worlds strip unspools, and four
motion signatures (`still` / `pulse` / `drift` / `flicker`) run on the idle
clock. Every animation judgement made on this project before now came from
still frames plus arithmetic — a design pass said so in its own report:
*"Motion smoothness by eye — I inspected still frames and argued the 45 fps
case arithmetically."*

```bash
node .claude/skills/run-film-atlas/driver.mjs film all          # reform, return, meteor
node .claude/skills/run-film-atlas/driver.mjs film transport    # the century, run end to end
node .claude/skills/run-film-atlas/driver.mjs film graze        # the track grazed, judged as a loop
node .claude/skills/run-film-atlas/driver.mjs film reform
node .claude/skills/run-film-atlas/driver.mjs film reform silver-print
node .claude/skills/run-film-atlas/driver.mjs film return
node .claude/skills/run-film-atlas/driver.mjs film meteor
node .claude/skills/run-film-atlas/driver.mjs film worlds       # the strip's 900ms unspool
node .claude/skills/run-film-atlas/driver.mjs film still        # the negative control
node .claude/skills/run-film-atlas/driver.mjs film pulse        # …drift, flicker
```

Each scene writes three files to `.atlas-films/` (gitignored):

| file | what it is |
|---|---|
| `<scene>.webm` | the interaction, recorded by Playwright's `recordVideo` |
| `<scene>-strip.png` | 12 frames sampled evenly **by time**, plus a per-frame delta plot |
| `<scene>.json` | every presented frame — `t`, `delta`, `moved` — and every `skyDraw` |

**A video nobody watches is worse than the still it replaced**, because it
produces the feeling of verification without any. The video is for a human. The
numbers are the verification, and they are measured from the frames the
compositor actually presented.

### Verified output

```
film        re-form into "cold-science-fiction"  (cold-science-fiction)
window      0 to +1150ms nominal, judged to +1350ms (grace 200ms)
frames      39 presented over 1168ms (33.4 fps under capture)
app's own   37 frames in 1157ms, mean 2.91ms worst 15.20ms per frame  [sky.lastForm, uninstrumented]
paints      40 skyDraw calls = 29.6/s, first at +34ms, worst single draw 14.3ms, worst paint-to-paint 67ms
gaps        first presented frame +132ms, then median 26ms, worst 65ms
background  0.06 median delta after the window — the view's own weather, subtracted below
delta       raw median 0.43; above background: peak 6.89, peak share 29.38% of the window's motion
spread      half the motion is in 5 of 39 frames; centroid +311ms into the observed motion = 27.1% of nominal
ends        last frame above 5% of peak is +1249ms = 108.6% of nominal
identical   0 frames were pixel-identical to the one before, 0 of them inside the 1150ms motion itself
moved       peak 19.92% of pixels in one frame, median 0.82% in window against 0.00% after it
after       12 frames past the window, median delta 0.06
profile     ·····█·▂▃·▂·▂·▁·▂·▁▁▁·▁▁▁·▁·▁▁▁▁▁▁·▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁··
flight      the app reports the flight landing at 1157ms against a 1150ms nominal (+0.6%)

FILM PASS — re-form into "cold-science-fiction"
```

### What the numbers mean

Frames come from CDP `Page.startScreencast`, not screenshots — a screenshot
costs 60-150 ms and would sample a 1,150 ms flight eight times. Consecutive
frames are downsampled to 320×200 luma and differenced:

- **delta** — mean absolute luma difference per pixel, 0-255. The frame's motion.
- **moved** — share of pixels that changed by more than 8. Separates a whole
  field sliding from a meteor crossing an otherwise still one.

| reading | what it catches | healthy re-form | snapped build |
|---|---|---|---|
| **peak share** | largest single frame's delta over the total. A tween spreads its motion | 29% | **99%** |
| **spread / to 50%** | how many frames account for half the motion | 5 of 39 | **1 of 22** |
| **centroid** | centre of mass of the motion, timed from the first presented frame, as a share of nominal | 27% | **0.4%** |
| **flight** | `sky.lastForm.ms` — the app's own landing time against nominal | +0.6% | — |
| **paints / gaps** | worst single `skyDraw`, worst paint-to-paint, worst presented gap | 14ms / 67ms / 65ms | — |
| **identical** | frames pixel-identical to the one before, *inside* the motion | 0 | — |

The **profile** is one column per equal slice of the window, height scaled to
peak. `·` is a slice with **no presented frame in it** — the shape a dropped
frame makes. Read the profile before the verdict: a healthy re-form is a spike
at the click (the chrome changes at once, by design) decaying into a long low
tail; the whole-atlas return is a proper ease that builds to a peak near 885 ms
and falls.

Two things that are subtracted or timed away rather than left to mislead:

- **background** — the night sky never stops (760 stars scintillate, a meteor
  clock ticks), so every frame carries a floor. Measured from this run as the
  median delta of the frames *after* the window and subtracted before judging.
  Left in, it adds a wide flat pedestal — exactly the shape a gradient has.
  With the floor in, a flight that took **one frame** scored a centroid at 17%
  of nominal and passed for a tween.
- **the centroid is timed from the first presented frame**, not from the
  action. The gap between those is the compositor's and ours — 90-160 ms, while
  the app's own first paint lands at +26 ms.

### Why there are two passes

**Measured, because it was going to be assumed otherwise: recording the video
costs the thing being filmed a chunk of its frame rate.** Same machine, same
scene, reading the app's own `sky.lastForm.frames`: 43 frames for the re-form
with `recordVideo` off, 22 with it on. The cost is not a constant — it ran
0-71% across a dozen runs, and the command prints it each time on the
`recorder` line — but it is never negligible. Playwright's recorder is itself a
screencast plus an ffmpeg encode, so with our screencast up there are two of
them competing with the page's rAF. Filming and measuring in one pass would
make the harness the largest source of jank in its own report.

So the scene is driven twice — screencast alone for the numbers, `recordVideo`
alone for the video — and `Math.random` is replaced by a seeded PRNG *at the
moment the action fires* so both passes film the same event. That is also what
makes `film meteor` reproducible: the same 1,167 px path, run after run. The
generator is untouched; it draws the same angle twice. (Seeding it any earlier
is a bug I already made: the 500 ms pre-roll advanced the stream and the two
passes filmed different meteors.)

**The video opens with the page load and the scene's setup.** The command
prints where the action is — `the action begins about 3.4s in` — rather than
trimming and depending on the bundled ffmpeg's keyframes.

### Proving it by breaking it

All three failure modes the command claims to catch were produced deliberately
against the real artifact and confirmed to fail:

```bash
# 1. IT SNAPS — force the tween's progress to 1
sed 's|const p=Math.min(1,(now-fm.t0)/fm.ms);|const p=1;|' public/atlas.html > /tmp/atlas-snap.html
ATLAS_HTML=/tmp/atlas-snap.html node .claude/skills/run-film-atlas/driver.mjs film reform
#   app's own   1 frames in 11ms
#   delta       above background: peak 6.12, peak share 99.17%
#   spread      half the motion is in 1 of 22 frames; centroid +5ms = 0.4% of nominal
#   profile     ···█▁·▁··▁·▁·▁·▁··▁··▁·▁··▁··▁··▁··▁·▁··▁···▁▁··▁·▁·▁··▁
#   FAIL: one frame carries 99.2% of the motion — that is a snap, not a tween
#   FAIL: motion centroid is +5ms into a 1150ms motion
#   FAIL: half the motion is in 1 frame(s) — no gradient
#   FAIL: the flight landed at 18ms against a nominal 1150ms

# 2. IT FINISHES EARLY — land the flight at 45% of its stated duration
sed 's|/fm.ms);|/(fm.ms*0.45));|' public/atlas.html > /tmp/atlas-early.html
ATLAS_HTML=/tmp/atlas-early.html node .claude/skills/run-film-atlas/driver.mjs film reform
#   ends        last frame above 5% of peak is +591ms = 51.4% of nominal
#   flight      the app reports the flight landing at 519ms against a 1150ms nominal (-54.9%)
#   FAIL: the flight landed at 519ms — it did not run its stated duration

# 3. IT STALLS — block the main thread for 320ms once, mid-flight
#   (append to skyFormStep's `p`:  if(p>0.42&&p<0.52&&!window.__stall){...busy wait...})
#   paints      worst paint-to-paint 346ms
#   gaps        worst 332ms
#   profile     ····█▂·▂▂·▁▁▁▁·▁▁▁▁▁▁▁·············▁▂▁▁▁·▁▁▁▁▁▁▁▁▁▁▁·▁··
#   FAIL: the app went 346ms without a paint inside the flight — a freeze, not container noise
```

**Each break is caught by a different subset, which is why all six readings
stay.** The snap trips four of them. The early landing trips exactly one — the
flight's own duration — because a tween cut short still paints a decelerating
curve into whatever time it is given, and the pixel readings cannot tell that
from a hard ease. The stall trips exactly one too, the gap check: the stalled
build's peak share, centroid, spread, identical-frame count **and** landing time
were all healthy — it landed at 1151 ms against 1150. The filmstrip labels the
same hole in words: *"+675ms no new frame — still showing +528ms"*.

**`film transport` is the scene this harness exists for.** A still frame of the
reel is worthless — every frame of it is a legitimate picture — and the two ways
it can be broken are exactly the two named above. Both were produced against the
real artifact and confirmed:

```bash
# IT SNAPS — force the cursor to the end on the first step
sed 's|const p=Math.min(1,(now-TP.runT0)/ms);|const p=1;|' public/atlas.html > /tmp/atlas-tp-snap.html
ATLAS_HTML=/tmp/atlas-tp-snap.html node .claude/skills/run-film-atlas/driver.mjs film transport
#   FAIL: only 1 frames were presented across a 6900ms motion
#   FAIL: motion centroid is +0ms — the picture jumped and then sat still
#   FAIL: half the motion is in 1 frame(s) — no gradient
#   FAIL: 1 frame(s) inside the flight were pixel-identical to the one before

# IT STALLS — 340ms of busy-wait once, mid-run (appended to skyTpStep's `p`)
#   FAIL: the app went 381ms without a paint inside the flight
#   profile     █▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁··▃▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▅
```

Healthy, for comparison: **161 presented frames over 6,945 ms, peak share 8.8%,
half the motion over 40 frames, centroid 53.2% of nominal, 0 identical frames,
worst single draw 9.1 ms, worst paint-to-paint 88 ms, 0 frames after the
window.** `film graze` is judged as a **loop** and not as a tween on purpose:
a graze is a sequence of discrete repaints, one per pointer move and none in
between, so "half the motion is in 2 frames" is the gesture working. What that
scene films is the flat stretches — the zero idle draws, on video.

`film still` is the standing negative control and needs no patched artifact: a
register whose signature is `still` must not be repainting, the screencast only
speaks when the picture changes, so the evidence is **0 frames presented**. It
reports exactly that.

### Reading the filmstrip

Cells are sampled by **time**, not by index, so a stall renders as two adjacent
cells that look identical and say so. The peak-delta cell is outlined in gold, a
repeated cell in orange. Under them, one bar per presented frame at its real
timestamp — a gap in the bars is a gap in the frames — with the subtracted
background drawn as a dashed line.

### Environment — every command, not just `film`

| var | default | why |
|---|---|---|
| `ATLAS_HTML` | `public/atlas.html` | point at another artifact — this is how you run a negative control |
| `ATLAS_SHOTS` | `.atlas-shots` | screenshot directory |
| `ATLAS_FILMS` | `.atlas-films` | video / filmstrip / frame-data directory |
| `ATLAS_FILM_VIDEO` | `1` | `=0` skips the recording pass. Halves the runtime while you iterate on the numbers |
| `ATLAS_FILM_W` | `640` | screencast frame width. Larger costs the page frames |
| `ATLAS_FILM_ANA` | `320` | width the frames are differenced at. See the meteor note in Gotchas before changing it |
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
  each and there is no cleanup — delete the directory when you are done. The
  same goes for `.atlas-films/`, where each scene costs ~1.5 MB.

- **`film` filters nothing for you: posters are blocked here too,** so what you
  are watching is the app on its own generated cells (AGENTS rule 9), not a
  degraded version of it. That is the honest picture in this container and the
  only one available — see the two poster gotchas above.

- **`film` frame counts fall when the container is busy.** The same re-form has
  presented 46 frames on an idle box and 21 while three other Chromium
  instances were running; the app's own `sky.lastForm.frames` moves with it, so
  the two agree and neither is lying. The *shape* readings — peak share,
  spread, centroid — held steady across all of it, which is why they are the
  gates and the frame rate is not. If `frames` comes back under ~15, stop
  everything else and re-run before drawing a conclusion.

- **`film` certifies no frame RATE.** The design note in `template.html` claims
  the sky's idle clock lifts to ~45 fps while a meteor is in flight. Measured
  here: the app painted 20 frames in 778 ms = 20.4/s, and paint-to-paint under
  capture runs 20-60 ms on a clock asking for 22. Screencast and software
  rasterisation both cost the page, so that number is a floor on a loaded
  container, not a refutation. The three gap thresholds loosen as blame moves
  away from the app — 60 ms for one `skyDraw` (pure app work), 250 ms
  paint-to-paint (adds rAF scheduling), 350 ms presented (adds the compositor
  and us) — and they catch a *freeze*, not a fps target.

- **The `pulse` signature is worth a look, and `film pulse` is how to look.**
  Measured on `marriage-in-decay` (depth 0.16): the app painted 42 frames in
  2.4 s and **29 of them were pixel-identical to the frame before** — the same
  result at 320×200 and at the full 640×400 capture, so it is not the
  downsample. `drift` and `flicker` over the same window have zero identical
  frames and spread their motion over ~20 of 42. This is an observation, not a
  verdict: a sub-quantisation change would be invisible to a JPEG and still
  visible on a real display. It is exactly what a still frame cannot tell you.

- **Do not change `ATLAS_FILM_ANA` to "get more detail".** It was tried. At the
  full 640×400 each of the 760 scintillating stars moves its own pixel past the
  `moved` threshold, and the background rises to meet the streak: 0.16% of
  pixels moved during a meteor against 0.08% with none. Averaged to 320×200 the
  stars fall under the threshold and a 1,200 px streak does not — 0.11% against
  0.00%. The downsample is a low-pass filter that separates weather from event.

## Troubleshooting

| symptom | cause and fix |
|---|---|
| `No artifact at .../public/atlas.html` | never built. `node atlas/app/build.js --out public/atlas.html` |
| `Error: Atlas template is missing its sky solver marker` | `build.js` expects a `/* __... */` marker `template.html` does not have. The two files are edited together; you are mid-edit or on a half-applied change |
| `SMOKE FAIL: constellation painted 0% ink` | the sky is not drawing. Console is often clean and the screenshot is still ~1.2 MB — neither tells you anything. Check `skyDraw`/`skyBuild` |
| `SMOKE FAIL: wall rendered 0 laid-out tiles` | `renderWall()` threw or bailed. A corrupted `atlas-preferences-v1` in localStorage has done this before |
| `ERR_MODULE_NOT_FOUND: playwright` | you ran the driver from outside the repo. See Gotchas |
| smoke times out at 45s | the artifact is ~9 MB and parses on load; raise `ATLAS_LOAD_MS` before assuming a hang |
| `FILM FAIL: only N frames were presented` | either the motion never happened, or the box is loaded. Check `paints` on the same line: paints high and frames low is the container, both low is the app |
| `film meteor` throws `no meteor spawned` | `skyMeteorStep` returned null. Either the night-sky world is not selected or the context came up under `prefers-reduced-motion`, which kills meteors by design |
| the video is 9s of the front door | recording starts at page load; the printed `the action begins about Ns in` is where to scrub to |
| `film <name>` says unknown scene | scenes are `reform`, `return`, `transport`, `graze`, `develop`, `meteor`, `worlds`, `still`, `pulse`, `drift`, `flicker`, `all`. A world id is the second argument, not the first |

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

The same argument, one dimension further along, is why `film` exists. **All
three broken artifacts above pass `smoke`** — verified, not assumed:

```
ATLAS_HTML=/tmp/atlas-snap.html  node .../driver.mjs smoke   # SMOKE PASS, ink 5.86% / 17.59%, console clean
ATLAS_HTML=/tmp/atlas-stall.html node .../driver.mjs smoke   # SMOKE PASS, ink 5.77% / 16.36%, console clean
ATLAS_HTML=/tmp/atlas-early.html node .../driver.mjs smoke   # SMOKE PASS, ink 5.77% / 16.36%, console clean
```

Same tile counts, same curves, same ink, clean console, correct final
screenshot. The whole re-form can be destroyed and every check that existed
before `film` reports the app as healthy, because all of them look at where the
picture *ended up*. See "Proving it by breaking it" for what each one moved.
