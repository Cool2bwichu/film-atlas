# The visual architecture — decision

**Decided 2026-08-10. Status: settled. Nothing built yet.**

Four visual architectures were generated independently against one brief — *go
beyond the night sky* — and each was prototyped over the real 2,204-film corpus
before anyone argued about it. This document picks one, says why the other
three lost, records every cost I measured myself, and lists what the winner
does not solve.

If you are arriving cold: read `atlas/DESIGN.md` first, particularly **The
night sky**, **Colour at field scale is a data channel**, and **Open questions
2**. This document is a reply to those three sections.

---

## The decision

> **THE TRANSPORT.** The atlas is already a century laid out left to right, and
> it has never been played. Give it a transport — a footage track under the
> field, a playhead, and a run — and the constellation becomes what it always
> was: a reel that has already run to the end. The resting picture is the last
> frame.

One mechanism is grafted from the runner-up, named and justified in **The one
graft** below. Nothing else is taken from the losers. This is not a hybrid.

**Prototype:** `/tmp/atl/transport.html` (source `/tmp/atl/transport.tpl.html`).
**Screenshots:** `/tmp/atl/shots/` — start with `filmstrip.png`, which is the
whole argument in one image.

---

## First: the discovery moved, and that is why the decision is what it is

Three of the four architectures rest on one fact. The layout solver is called
with films and edges and **nothing else** — no years, no degree, no ranking
(`atlas/app/build.js`, "THE CONSTELLATION'S LAYOUT IS SOLVED HERE, ONCE"). Yet
the constellation comes out sorted by time, west to east, because influence
flows forward and the solver is pulling on edges that mostly point that way.
Nobody designed it. It is the corpus confessing through the physics.

That is true. It is **weaker than the proposals were told**, and it moved
between the prototypes being built and this decision being written.

| | corr(year, x) | mean \|Δyear\| to nearest neighbour | vs shuffled control | ratio |
|---|---|---|---|---|
| Layout the four prototypes were built on (9 Aug, morning) | **+0.612** | 17.2 yr | 26.8 yr | 0.643 |
| Layout at HEAD, today | **+0.448** | 22.5 yr | 27.1 yr | **0.832** |

Commit `e49de94`, "In flight: the restWeak scale fix applied, layouts
rebaking", landed on the evening of 9 August and moved **every position in the
corpus** — 2,204 of 2,204 differ. It did not bump `LAYOUT_ALGORITHM_VERSION`
(still `sky-fr-bh-v1`), so `layoutVersion` still reads
`layout-1f25a90c58b53266` on both sides of a layout that is completely
different. *That is a separate bug and somebody should file it.* Its
consequence here is that the prototypes' headline number was measured on a
layout that no longer exists.

What survives at HEAD, and what does not:

- **The global drift survives, comfortably.** Decade medians of x run 0.29
  (1920s) → 0.38 (1950s) → 0.44 (1970s) → 0.59 (1990s) → 0.68 (2020s),
  monotone from 1960 on. The 5-year-window centroid walks **1.897 world units**
  across a box 1.0 wide, from (0.29, 0.69) in 1918 to (0.70, 0.50) in 2024. The
  century really does cross the plate.
- **The local reading does not.** Your nearest neighbour on the plate is on
  average **22.5 years** away from you, against 27.1 for a random shuffle. Read
  a film's year off its x position and your RMSE is **20.9 years** against a
  corpus SD of 23.4 — knowing where a film sits tells you almost nothing about
  when it was made. r² = 0.201.

Compare the number DESIGN.md already uses to kill things: nearest-neighbour
hue difference is 0.979 of random, "no spatial information whatsoever". Year at
0.832 is *not* that — it is real signal. But it is a **low-frequency** fact,
and it degraded by more than a third when one constant in the solver was
corrected.

**This is the whole decision in one sentence:** an architecture that reads the
drift as a soft aggregate is robust to that, and an architecture that turns
year into a per-film geometric coordinate is hostage to a constant in
`layout-sky.js`.

---

## The four, scored

Scoring is against the five tests the brief set. The night sky is the bar
because it passed all five.

| | 1. reveals what it *was* | 2. needs the graph | 3. cost at rest | 4. honest | 5. solves the resting atlas |
|---|---|---|---|---|---|
| **THE TRANSPORT** | **yes — twice** | **yes, wholly** | **1.41 ms — no change** | **yes** | reframes it; weather on demand, free |
| THE GATE | yes | **no** | **16.2 ms — 11.6×** | yes | lights it; adds no information |
| THE APERTURE | partly | partly | 1.47 ms (rest untouched) | yes | **no — leaves it alone** |
| RELIEF | no | weakly | 1.91 ms + 86 ms rebuild | **no** | yes, with a fiction |

### 1. The one-sentence test

The night sky passed because *the view was already called the constellation*.
The test is whether the architecture is a confession or a costume.

**THE TRANSPORT passes twice over.** The atlas is measurably time-ordered
without ever having been told about time — that is one confession. And the
entire vernacular of this interface is already film: the worlds strip is a roll
of film with sprocket perforations, the trail is a perforated strip, the print
sits in a gate. The one thing every one of those objects has and this interface
lacks is **a way to run it**. Both halves are things the atlas already was.

**THE GATE passes.** "The field is not a canvas, it is the frame the strip
above is holding" is straightforwardly true of the shipped app: there is
already a rail of 28 frames across the top and the field below is one of them.
It even lands DESIGN.md open question 3a, which records that "frame 0 — your
whole plate as a door of its own" was specified and never built. The gate makes
the whole atlas frame 0. That is a genuine structural insight and it is why the
gate is the runner-up on this test and not on the decision.

**THE APERTURE passes only partly, and the flaw is subtle.** DESIGN.md's
thesis is "the interface is a lens; **depth in the graph is depth of field**."
The aperture builds a real lens — and then makes the depth axis the *year*. It
borrows the project's own metaphor and points it at a different variable. A
reader who has learned that blur means graph distance now has to unlearn it.

**RELIEF fails.** A relief map is a costume this atlas has never worn. The
project is called an atlas, but the *view* is called the constellation, and the
constellation is a sky, not terrain. Contours are imported vocabulary.

### 2. Does it need the graph?

The test that killed most of an earlier list: anything that would look
identical applied to a photograph is decoration.

**THE TRANSPORT needs it absolutely.** Films appear when they were made. An
edge appears when its *later* endpoint exists, and it **grows in the direction
the argument runs** — a `descent` reaches forward out of the ancestor, a
`rebuttal` reaches back out of the later film. Watch it run and you see the
five relationship types behave as five different tenses. The prototype's own
legend states the measurement: descent runs forward in **80.6%** of cases,
rebuttal reaches back in **88.2%**, and the three symmetric types sit near
44–46%. Applied to a photograph this is nothing at all. It is the only one of
the four of which that is true.

**THE GATE fails this outright, and admits it on screen.** Its own readout
prints `LOCAL BRIGHTNESS × DEGREE · R = 0.100`. That is the gate certifying
that its lamp carries no graph information — correct under AGENTS rule 1, and
simultaneously a confession that the lamp, the grain, the halo and the
chromatic aberration are a treatment applied to a field of dots. Every one of
them would look identical over a photograph of a crowd.

**RELIEF needs the positions but not the edges.** Contour any three-column
table of x, y, value and you get this picture. The graph is upstream of the
positions, but the architecture never touches it.

**THE APERTURE is in between.** Edges do recede with depth, so the graph is
present. But what the lens is *about* is the year.

### 3. Cost

All figures are mine, measured today in the same headless Chromium at
1440×900, `deviceScaleFactor: 2`, software rasteriser, 60 presented frames per
case, rAF-paced (one draw per presented frame — a synchronous loop measures a
backed-up rasteriser queue, not a frame). Ratios are **within-harness**, which
is what matters; absolute numbers run slightly under DESIGN.md's because it is
a different machine on a different day.

Three independent prototypes agree on the untreated whole-atlas control at
**1.3–1.5 ms**, which is the cross-check that makes the rest of the table
trustworthy. DESIGN.md's own control is 1.93 ms; the night sky it shipped is
1.41 ms.

| architecture | state | ms/frame | vs its own control | idle draws in 3 s |
|---|---|---|---|---|
| **TRANSPORT** | **at rest** | **1.41 mean · 1.20 p50 · 3.70 worst** | **1.0×** | **0** |
| TRANSPORT | grazing a year | 1.97 mean · 1.60 p50 | 1.4× | 0 |
| TRANSPORT | **running the century** | **1.28 mean · 2.20 p95 · 3.80 worst** (149 frames) | **0.9×** | n/a |
| GATE | control, gate off | 1.4 p50 | 1.0× | 0 |
| GATE | **at rest, gate on** | **16.2 p50** | **11.6×** | 0 |
| GATE | cold science fiction (59 films) | 14.9 p50 | 10.6× | 0 |
| APERTURE | f/22, flat — its rest state | 1.47 mean · 1.30 p50 | 1.0× | 0 |
| APERTURE | f/2.8, its stated arrival default | 3.85 mean · 4.90 worst | 2.6× | 0 |
| APERTURE | f/1.4 @ 1977 | 3.65 mean · 8.40 worst | 2.5× | 0 |
| RELIEF | relief off | 1.38 mean · 1.30 p50 | 1.0× | 0 |
| RELIEF | relief on, steady state | 1.91 mean · 1.80 p50 | 1.4× | 0 |
| RELIEF | **ground rebuild on every world change** | **85.7 ms** measured end-to-end; the prototype attributes 18.4 to the field, 45.7 to the hillshade and 3.0 to the contours | — | — |

Every one of the four is honest about idle repaints — zero at rest in all four.
That is the project's culture working.

Two readings decide things:

- **THE GATE makes the default view 11.6× more expensive, for a picture that
  carries no new information.** Isolating the passes: switching the halo off
  returns it to 3.8 ms — exactly the control — while leaving the lamp off
  barely moves it (46.5 against 49.4 in the same units). The entire bill is the
  per-disc halo, and the halo is the part that carries nothing. Against the
  standard set by a night sky that is *cheaper* than the view it replaces, this
  is disqualifying on its own.
- **THE TRANSPORT is the only one that is not more expensive than what it
  replaces.** At rest it is the same draw the app already does. Running the
  whole century over 149 presented frames costs *less* per frame than sitting
  still, because most of the reel has fewer films in it. It reproduces the
  night sky's decisive property exactly.

RELIEF's steady state is cheap and I had expected worse; the 19 ms in its own
screenshot is a single cold frame, not a rate. Its real bill is the 85.7 ms
ground rebuild, paid on every one of the 28 re-forms, on top of the 1,150 ms
flight — affordable on this desktop and a genuine question on a phone.

Measured at 390×780 and 900×820, the transport's resting repaint is 2.03 ms and
1.90 ms, console clean.

### 4. Honesty — rules 1 and 8, reduced motion, and arrival

All four arrive under `prefers-reduced-motion`. That test does not separate
them. Two other things do.

**THE TRANSPORT keeps its information out of the motion.** `run()` under
reduced motion jumps straight to the end, draws, and reports `ARRIVED · REDUCED
MOTION`. More important: the whole century stays reachable by **dragging the
track**, which is direct manipulation and not animation. An architecture whose
content *is* an animation would be a fair worry here; this one's content is a
scrubbable instrument, and the run is a convenience on top of it.

Its compliance with the settled rules is written into the source rather than
claimed after the fact: the premiere flare is a function of a film's **age and
nothing else**, so no film is ever brighter for being better connected (rule 1);
edge width is a property of the **type**, identical for every edge of that type
(rule 1); low-confidence edges stay dashed (rule 3); the disc keeps the film's
own measured highlight while the year's colour lights only the room (rule 5 and
"colour at field scale carries the stratum"); the readout is DOM type on its own
opaque ground so nothing can blur (rule 4). And it prints its own tier: *the
decade separates at 9.8 SD — and explains 2.1% of one film's own colour, which
is why it lights the room and never a disc.*

**RELIEF fails honesty, and it is the reason it is not the winner.** It prints,
in the legend, `● RECORDED — ELEVATION IS THE YEAR, AND THE YEAR IS A FACT
ABOUT THE PRINT`. A ● recorded claim, in a project whose entire tier system
exists to stop a chosen quantity being dressed as a measured one. Then hold a
film and it says, in its own words:

> **Un Chien Andalou** — 1928 · the ground under it reads 1996. It sits 68
> years below its own neighbourhood — surrounded by what came after it. No
> contour in this atlas runs as early as 1928.

A contour labelled 1996 with a 1928 film standing on it is a legend that is
wrong about a real film in the corpus, by 68 years. That is not a bug in the
prototype; it is what a smoothed surface must do to a field whose neighbours
differ by 22.5 years. RELIEF is, precisely, *a colour key dressed as a
measurement* — the thing DESIGN.md's three tiers were invented to prevent — in
contour form. Its own readout also reports **98 of 2,204 discs falling under
3:1 on their own ground**, which is 98 known violations of the graphical
contrast floor, shipped to make the terrain visible.

I want to be fair to it: RELIEF is honest *about* its dishonesty, in the
hover text and in the cased-disc count, and that is more integrity than most
prototypes manage. But an architecture that has to keep apologising in the
readout is being asked to carry a claim it cannot support.

### 5. The resting atlas

DESIGN.md open question 2 still records the default view — the one every reader
sees first — as an unsolved even disc with no weather. This test asks whether
the architecture solves that or adds a 29th world.

- **THE APERTURE adds a mode.** Its rest state is f/22, which is the current
  even disc, pixel for pixel. Opening the lens is something you do.
- **THE GATE changes the resting pixels** — lamp, grain, frame, rim fringing —
  but the change carries no graph information, and its brightest region is the
  centre of the *aperture*, not of the constellation. DESIGN.md already ruled on
  this shape: "a gradient pinned to the middle of the window is a vignette, and
  a vignette is decoration that happens to be coloured." The gate's own readout
  says the lamp is `PINNED TO THE FRAME`. It lights the even disc beautifully;
  it does not give it weather.
- **RELIEF genuinely solves it** — it is the only one that puts real structure
  into the resting picture — and the structure is a fiction at the scale a
  reader reads it.
- **THE TRANSPORT does not change the resting pixels, and answers the question
  a different way.** Two moves:
  1. It gives the rest state a **reason**. The playhead is parked at 2026
     because the reel has run. "Every film in the corpus. This is the picture
     the constellation opens on." The disc stops being an undifferentiated blob
     and becomes the *last frame* — a terminal state, which is a thing you can
     have an attitude about.
  2. It gives the resting atlas **weather on demand at zero idle cost**.
     Grazing the track rack-focuses onto a year: 1968's films come up **where
     they already are**, nothing re-forms, nothing moves. One repaint per
     pointer move, none when the pointer is elsewhere. That is exactly the
     bargain the worlds strip already makes and which DESIGN.md already
     blesses — the same gesture, asked of a year instead of a world.

This is a smaller claim than RELIEF's and it is the one that is true. Open
question 2's own text says the disc is even **because the corpus is** — 84% of
edges are convergence and hand — and that "the layout can only choose whether
to impose an axis on it". The transport refuses to impose one and makes the
drift visible anyway, which is the honest version of the answer.

---

## Why THE TRANSPORT, in one paragraph

It is the only one of the four that needs the edge list; the only one that is
not more expensive than the view it replaces; the only one that uses the
year-drift at the frequency the drift actually exists at, and therefore the
only one whose central mechanism *got better* rather than worse when I
re-measured it against a solver that had changed underneath it (centroid travel
1.65 → 1.897 world units). And it is the only one that turns the five typed
relationships — the founding commitment of this project, `descent`, `rebuttal`,
`convergence`, `rhyme`, `hand` — into something you can watch happen. Run the
reel and a `descent` reaches forward out of an ancestor while a `rebuttal`
reaches back out of a later film, and the difference between an argument that
inherits and an argument that objects becomes a difference you can see rather
than a colour you have to look up. Nothing else in the interface has ever made
that visible.

Look at `/tmp/atl/shots/filmstrip.png`. 1916 is a single glow in the
lower-left. 1926 is a small knot. By 1947 a lit spine has reached across to the
right. By 1979 the plate is full and the connections are arriving faster than
the films. 2026 is the picture the app opens on today, cooled. That is the
century, and the layout drew it without ever being told there was one.

---

## The one graft, and only this one

**From RELIEF: the neighbourhood readout. Not the terrain — the sentence.**

RELIEF's best moment is not its contours, it is what it says when you hold a
film: *"1928 · the ground under it reads 1996. It sits 68 years below its own
neighbourhood."* That is the only mechanism in the losing three that needs the
layout and the corpus together and that tells the truth about the drift instead
of smoothing it away. Under the transport it costs nothing to say honestly,
because the transport already has a year axis on screen to say it on.

Take the film's own year and the **mean year of its graph neighbours**, and mark
both on the transport track when a film is held. The gap between the two ticks
is the reading. Measured over the corpus at HEAD (2,200 films with 3 or more
neighbours):

- median +(−0.6) years, mean absolute gap **5.9 years** — most films sit with
  their own company, which is why the tails mean something
- p05 −12.2, p95 +14.2

and the tails are checkable rather than decorative:

| behind its company (drawn on by what came after) | | ahead of its company (reaching back) | |
|---|---|---|---|
| Snow White and the Seven Dwarfs (1937) | −38.3 | The Other Side of the Wind (2018) | +52.5 |
| City Lights (1931) | −33.0 | Ingmar Bergman's Cinema (2018) | +48.0 |
| Metropolis (1927) | −28.0 | Anatomy of a Fall (2023) | +29.0 |
| Alexander Nevsky (1938) | −28.1 | The Tragedy of Macbeth (2021) | +28.0 |

Metropolis at −28 because everything descends from it; *The Other Side of the
Wind* at +52.5 because it is a 1970s film released in 2018 and its lineage
knows it. That is a real fact about a film's position in cinema, computed from
the graph and the year and nothing else, and it is a per-film statement the
transport otherwise cannot make.

**Conditions on the graft.** It is a mean, not a degree weighting, so it is
rule-1 clean — but it is noisy at low degree. Set a floor (3 neighbours
minimum, which already excludes 4 films) and print `n` in the readout. Bake the
number at build time; it is one float per film.

**Nothing else is grafted.** Not the gate's lamp, not its frame, not the
aperture's bokeh, not RELIEF's contours or hillshade. Each of those is the part
of its architecture that fails one of the five tests, and pulling them in is
how a coherent idea becomes a feature list.

---

## What it would take to build

Roughly in dependency order. None of it is speculative — every piece exists in
some form in the prototype or in the shipped app.

1. **Bake the ordering.** Films sorted by year, edges sorted by the year of
   their *later* endpoint (the moment the connection becomes *makeable* — the
   prototype is emphatic that using the earlier endpoint kills the last third
   of the run, because 26% of this corpus's lineage arrives after 2003). Two
   sorted index arrays and one float per film for the graft. Build-time, small.
2. **The track.** 92 px of chrome at the bottom of the sky view: hairline rail,
   decade ticks, a year histogram of the corpus, a playhead. Pure DOM. Owns the
   scrub, the graze and the run.
3. **Three states in the existing draw.** `rest` (playhead at the end — the
   current picture, unchanged), `graze` (rack-focus onto a ±2-year window, one
   repaint per pointer move), `run` (advance the cursor on rAF, draw films born
   and edges inked). The prototype's `draw()` is ~200 lines and is the model.
4. **Reduced motion.** `run()` arrives at the end immediately and says so; the
   track stays fully scrubbable. Already implemented in the prototype.
5. **Address.** `#/sky/year:1968` for a grazed year, following the grammar
   DESIGN.md's "The address" already settled. The transport is a state that
   lasts until the next click, which is exactly the second grammar open
   question 0 says is missing.
6. **The responsive law — the real work.** See below.
7. **Probes before it ships,** in the culture of `meteor-probe.mjs`: prove idle
   draws are 0 at rest and 0 with the tab hidden; prove the strike curve is a
   function of age alone by breaking it to depend on degree and confirming the
   check fires; prove edges never appear before their later endpoint; prove
   dashed low-confidence edges stay dashed at every cursor position.

---

## What this does NOT solve, and the risks

**Stated plainly, because the next person deserves it.**

1. **The resting picture is still an even disc.** The transport reframes it and
   makes weather available on a gesture; it does not put structure into the
   pixels. DESIGN.md open question 2 stays open. If that is unacceptable, the
   honest options are a different layout or a different corpus, not a treatment.

2. **The phone layout is broken in the prototype and is the biggest build
   risk.** I ran it at 390×780 myself: the readout panel and the tense key
   overlap each other and occlude the top half of the field
   (`tran-phone-graze.png` in this session's scratchpad). The *instrument*
   survives — histogram, decade ticks and playhead are all legible at 390 wide,
   and the repaint is 2.03 ms — but the two absolutely-positioned panels do not
   reflow. And there is a budget problem behind it: the worlds strip already
   owns 152 px at the top, and 92 px more at the bottom is 244 px of a 780 px
   phone. DESIGN.md's responsive law has three answers for three scarcities;
   this needs the third one and nobody has written it. **The proposing agent
   never shot a phone.**

3. **The transport does not know about the 28 worlds.** It is built for the
   whole atlas only. "Play folk horror" — ten films over 22 years — is an
   obvious question with no answer, and re-forming into a world while the reel
   is mid-run is undefined. The two most-used mechanisms in the app currently
   do not compose.

4. **It inherits a real dependency on a soft number.** corr(year, x) = +0.448
   today and was +0.612 yesterday. The transport degrades gracefully where the
   others do not — a broad glow whose centroid drifts stays legible as the
   correlation weakens, where a contour line or a focus plane does not — but if
   the solver is corrected again and the correlation goes to 0.2, the reel will
   still run and the sweep will be less legible. **Add corr(year, x) to
   `measure-layout.js` and print it in the layout gate**, so a solver change
   that flattens the century is visible in CI instead of in a screenshot three
   weeks later.

5. **`layoutVersion` does not cover the solver's output.** Commit `e49de94`
   moved all 2,204 positions while `layoutVersion` and
   `LAYOUT_ALGORITHM_VERSION` both stayed put. Any promise that an address
   returns a byte-identical picture is currently unenforced. This is not the
   transport's problem, but the transport's addresses will inherit it.

6. **The year is not evenly distributed and the reel is lumpy.** 1916–1940 is
   99 films; the 1960s alone are 374. A linear run spends its first seconds on
   almost nothing. The prototype scales run time by the remaining span, which
   helps and does not fix it. Whether the transport should run in *film time*
   or *wall time* is unresolved and is a design question, not an engineering
   one.

7. **The graft is thin at low degree.** 4 films have fewer than 3 neighbours
   and get no residual at all; films at 3 or 4 neighbours get a noisy one. Print
   `n`, or suppress it below a floor.

---

## What I rejected, in one line each

- **THE GATE** — the best *reading* of the four, and the most beautiful still
  image: the field really is a frame the strip is holding, and it lands the
  unbuilt "frame 0" from open question 3a. But it makes the default view
  **11.6× more expensive** for a picture that carries no graph information —
  its own readout certifies the lamp at r = 0.100 against degree — and every
  pixel of it would look identical over a photograph. The bar was *cheaper than
  what it replaces*, and this is eleven times dearer.
- **THE APERTURE** — a real lens, honest, cheap at rest, and its rack focus
  from 1931 to 2019 is the clearest single demonstration that the century
  crosses the plate. It loses because it repurposes DESIGN.md's own metaphor —
  *depth in the graph is depth of field* — to carry the year instead, at 2.6×
  cost the moment it opens, while leaving the resting atlas exactly as it found
  it. It is a 29th world, and a very good one.
- **RELIEF** — the only one that puts structure into the resting picture, and
  it puts a fiction there. Elevation is a smoothed year over a field whose
  neighbours differ by 22.5 years, so it stands *Un Chien Andalou* (1928) on
  ground reading 1996 and labels the legend `● RECORDED`. It also casts 98
  discs under the 3:1 contrast floor and costs 85.7 ms of ground rebuild per
  re-form. Its idea was strongest on the layout it was built on and weakened by
  a third overnight.

---

## Reproducing every number in this document

The four prototypes and their screenshots are on disk under `/tmp` and are not
in the repository — **copy anything you still need before this machine is
recycled**:

```
/tmp/atl/        THE TRANSPORT   transport.html, transport.tpl.html, shots/, transport-run.webm
/tmp/gate/       THE GATE        gate.html, gate-src.html, shot-*.png, pull-down.webm
/tmp/aperture/   THE APERTURE    aperture.html, proto.tpl.html, shots/, final.txt
/tmp/relief/     RELIEF          relief.html, shots/
```

Each prototype exposes a measurement hook: `window.__T` (transport),
`window.__bench` / `window.__draws` (gate), `window.ATL` (aperture),
`window.__relief` (relief). All four report their own per-draw milliseconds, so
the ratios above are within-harness and comparable.

- **corr(year, x), the nearest-neighbour year test, the centroid travel and the
  neighbourhood residual** were computed by extracting `LAYOUT`, `DISCOVERY` and
  `CORPUS` from a fresh `node atlas/app/build.js` artifact — they are chunked
  `JSON.parse([...].join(""))` blocks in the built HTML — and are reproducible
  from any build at this commit. Build time ~14 s. Note that a build writes
  `atlas/pipeline/out/frame-measures.json`; revert it if you were not intending
  to change it.
- **Frame costs** were measured with Playwright's bundled Chromium at 1440×900,
  dpr 2, rAF-paced, 60 frames per case, with the untreated control re-measured
  inside the same page as its treatment.
- **The RELIEF report survives** at
  `/tmp/claude-0/-home-user-film-atlas/3a394c7e-a9b1-54c8-925e-faea85bfde9d/tasks/bj2vz3pp9.output`.
  The other three architects' written reports were lost when the parent run
  died — the workflow record at
  `~/.claude/projects/-home-user-film-atlas/3a394c7e-a9b1-54c8-925e-faea85bfde9d/workflows/wf_06d64166-455.json`
  has `status: killed` and a null result. This decision was therefore made from
  the prototypes and the screenshots rather than from the reports, which is the
  better evidence anyway.
