# DESIGN.md — creative direction

Owned by the design authority. When a decision settles, it goes here so the
next session inherits it instead of re-deriving it. Everything below has been
checked against `app/template.html`; where the two disagree, the template wins
and this file is the bug.

## The thesis

The interface is a **lens**, not a diagram. Every interaction decision follows
from that. Navigation is a focus pull. Nodes are film cells, not cards. Depth
in the graph is depth of field.

The subject is cinema, so the vernacular is the darkroom and the cutting room:
warm film base, perforated strips, screen-printed one-sheets, slate lettering
for metadata.

## Palette

Warm near-black rather than the neutral grey dark interfaces default to. The
interface has no accent colour of its own beyond one: colour on screen comes
from the films, each cell carrying its own measured highlight.

**The ground is almost pure black, and it is warm — settled 2026-08.** The
previous values were `#08070A` / `#100E13` / `#15121A`, and every one of them
has **more blue than red**: this table called them a warm film base and the
tokens said violet. `body::before` was worse — a full-viewport wash running
from `#1A1523`, which is a purple gradient, which is on the list of things this
project explicitly will not ship, and which had got in through the background
rather than through the chrome. Measured off the composited page, the resting
field read `(15,14,19)` with a blue-minus-red of **+4**; it now reads
`(11,10,9)`, blue-minus-red **−2**.

| Token         | Hex       | On `--base` | On `--panel` | Role                                   |
|---------------|-----------|-------------|--------------|----------------------------------------|
| `--base`      | `#050404` | —           | —            | Ground. Warm, near-black, never violet. |
| `--lift`      | `#0D0B09` | —           | —            | Raised surfaces, inputs, tiles.         |
| `--panel`     | `#110E0C` | —           | —            | Detail panel ground.                    |
| `--hair`      | `#231F1B` | —           | —            | Borders. Never text.                    |
| `--ink`       | `#F0EAE0` | 17.11:1     | 16.07:1      | Primary text, warm off-white.           |
| `--dim`       | `#A89E95` | 7.79:1      | 7.32:1       | Secondary prose, button labels.         |
| `--faint`     | `#877D75` | 5.09:1      | 4.78:1       | Slate metadata. **The floor, not a mood.** |
| `--accent`    | `#E8C87A` | 12.65:1     | 11.88:1      | The only interactive accent; also `--nc` default. |
| `--accent-dim`| `#8A7440` | 4.54:1      | 4.26:1       | Focus and hover borders (3:1, graphical). |

Edge colours are keyed to type (AGENTS rule 2) and double as the 8.5px label
set in them, so every one clears 4.5:1 — **on `--base` AND on `--panel`, which
is the stricter ground and which this table was not being measured against**:

| Type          | Hex       | On `--base` | On `--panel` |
|---------------|-----------|-------------|--------------|
| `descent`     | `#C9873F` | 6.85:1      | 6.43:1       |
| `rebuttal`    | `#D15D53` | 5.27:1      | 4.95:1       |
| `convergence` | `#4E8C7A` | 5.22:1      | 4.91:1       |
| `rhyme`       | `#9075AF` | 5.22:1      | 4.90:1       |
| `hand`        | `#867C6C` | 4.99:1      | 4.68:1       |

`rebuttal` was `#C8544A` and `rhyme` `#8A6FA8`: **4.26:1 and 4.44:1 on
`--panel`**, a real AA failure on the surface that carries the claim text,
sitting under a comment asserting the opposite. Both lifted without moving hue.

**Contrast is a correctness property here, not a preference — settled 2026-08.**
`--faint` was `#5C5550`, 2.53:1 on `--base`: below the WCAG AA text floor of
4.5 and below even the 3:1 large-text floor, at 8.5–9.5px, and it carried
almost every piece of metadata in the app. Quiet is a ratio, a size and a
tracking decision; it is not a licence to go under the floor.

**The table is now enforced, not asserted.** `pipeline/build-registers.js`
parses `--base` and `--panel` **out of `app/template.html`** — the same
discipline `measure-claims.js` uses on the ranking table, because a copy of a
hex value in a checker is a copy that goes stale the moment somebody darkens
the page — and fails the build if any string drops under its floor on either
ground. Proven by breaking each of the three gated properties in turn.

**Two floors, because there are two kinds of object.** A disc on the canvas is
a graphical object (3:1); an 8.5px glyph is type (4.5:1). Gothic's oxblood is
3.5:1 and the killer's deep red 4.2:1 — right on the canvas, illegal as
lettering — so each register also ships an `inkHue`, the same hue lifted in
**lightness only** until it clears the type floor.

**Perceptual steps, not ratios, between two near-blacks.** The first version of
the surface gate demanded a 1.15 contrast ratio between `--panel` and `--base`
and failed; the gate was wrong, not the palette. The shipped design has always
been 1.084, because the `+0.05` flare term in the WCAG formula swamps any
difference down here and the ratio simply cannot see this distinction. The step
is measured in Oklab lightness: `--panel` sits `+0.058` above `--base`, `--lift`
`+0.042`, and the floor is set below both.

## The room, and the light in it

**The resting constellation is dark. Light arrives when something is being
looked at — settled 2026-08.** `.sky-field::before` burned at `.085` in the
house accent with nothing in hand, which put a permanent amber bloom in the
middle of the frame: a lamp with no light source, lighting nothing. Measured,
it lifted the centre of the field from `(16,14,18)` to `(31,27,26)`. It is now
`opacity:0` and comes on only with `.lit`, which `skyHand` sets when a film or
an anchor is actually held. A field with a lamp in it reads as a space *only
when the lamp is on something*.

**A chosen world tints the room from the centre of its own films.** One soft
radial rise in the register's own hue, anchored in WORLD coordinates at the
centroid of the live films and falling to nothing well before the rim. Measured
at 1440×900, sampling the darkest pixel in a 9×9 patch outward from the
centroid:

| | centre | +120px | +200px | +300px | corner |
|---|---|---|---|---|---|
| *Something is out there* | `(33,15,14)` | `(24,13,11)` | `(14,9,8)` | `(10,8,7)` | 0 |
| *Cyberpunk mood* | `(7,27,40)` | `(9,20,27)` | `(8,12,14)` | `(8,8,8)` | 0 |
| *Faith and its silence* | `(37,32,19)` | `(25,22,15)` | `(15,13,9)` | `(9,8,8)` | 0 |

Anchored in the world, never in the viewport: a gradient pinned to the middle
of the window is a vignette, and a vignette is decoration that happens to be
coloured. This one travels with the camera and sits off to one side when you
pan, which is what makes it read as light coming off the constellation. It
introduces no second colour source — the hue is the register's own, and the
readout is saying in the same breath how much of it was measured.

It is one `drawImage` of a 128px sprite. A full-screen `createRadialGradient`
per frame is 5.2 million gradient texels a frame at dpr 2 in software, for a
wash the owner asked to keep slight.

## Typography

Type is a **system stack on purpose**. A webfont is a network dependency and a
flash of unstyled text, and this file has to work identically from a local
disk, a static host and a sandboxed artifact frame.

| Role     | Stack                                                    | Job |
|----------|----------------------------------------------------------|-----|
| Display  | `Hoefler Text, Baskerville, Palatino Linotype, Constantia, Georgia` | Titles above ~19px, the lede, panel headings. High contrast; used only where thin strokes read as authored. |
| Text serif | `Iowan Old Style, Palatino Linotype, Palatino, Book Antiqua, Georgia, ui-serif` | Claims, synopses, captions under 19px. Sturdy enough to survive 12px under a poster. |
| Sans    | `ui-sans-serif, -apple-system, …`                          | Inputs and controls. Quiet by design. |
| Mono    | `ui-monospace, SFMono-Regular, Menlo, Consolas`            | Slate: metadata, legend, labels. Uppercase, `.2em` tracked. |

The two serifs never trade jobs. Tracking is a hierarchy instrument, not
decoration: display type closes up as it grows (`-.024em`), slate opens up as
it shrinks (`.2em`), and the gap between them is what stops a title and its
year reading as one voice.

## Motion grammar

Everything eases like a camera operator: `cubic-bezier(.22,.61,.36,1)`, slow
lead-in, weighted settle, **no spring or bounce anywhere**.

- `--t-fast` 160ms — hover, tooltip, label
- `--t-mid` 340ms — panel, view crossfade, transform
- `--t-slow` 620ms — node position, node reveal, edge ink
- Node stagger: 55ms per ring node — the "sonar" wave
- Camera moves in the constellation: 950ms travel, 620ms refit, zoom
  interpolated in **log** space (linear zoom lurches)
- One exception to the single curve: a line being drawn is a pen, not a camera
  move, so `--ease-draw` travels closer to constant speed

Layout is precomputed and then animated by CSS transition — no per-frame state
churn. The radial map is a composed ellipse plus a separation pass, not a
force simulation: physics gives jitter and a different picture for the same
question. The constellation's positions are solved **at build time** by
`app/layout-sky.js` (Fruchterman–Reingold, Barnes–Hut) and baked, so the same
corpus draws the same sky twice and "it is over on the left" means something
to a second person.

`prefers-reduced-motion` collapses all transitions and skips camera animation.

## The worlds — the constellation's answer to "what is this for" — settled 2026-08

Open question 1 said the constellation had no job: at the fit zoom it said
nothing the wall did not say better, and at rest it answered *what am I looking
at* with **"drag to pan · scroll to zoom"** — the mechanics of a control where
a reader needs a reason to look. 2,204 dots is not a proposition. *"Show me
folk horror"* is.

**A register is a named region of the atlas, defined by a rule.** 28 of them,
computed at build time by `pipeline/build-registers.js` from
`pipeline/registers.json`, shipped as `static/registers.json` and merged into
the sky's existing facet machinery as a field called `register`. Choosing one
re-forms the atlas into that world's own baked constellation — the same flight,
the same three beats, nothing new in the tween.

### The rule that made them computable, and the line that decides what dies

The fingerprint spec defines its ~43 registers on AXES, and the axis layer was
cut from 24 axes to 5 because 42.7% of films carry no behavioural terms about
light, camera or sound at all. Measured against that spec as written: **3 of 43
computable, 16 partial, 24 dead.**

The registers were re-derived on a **widened rule — themes plus the five
recorded facets, as well as axes.** Themes stand in as TMDB keywords until the
closed vocabulary lands; a theme is evidenced by a plot summary and plot
sections exist for 88.4% of films, where an axis is inferred from one. Under
that rule, rewriting the 43 as 27 candidates and gating them:

| gate | |
|---|---|
| size 8–264 | a stratum under 8 is a scatter, over 12% of the corpus is a mood |
| Jaccard < 0.80 vs **every** recorded facet value | a register that is `genre:war` renamed is a duplicate control, not a door |
| every fixture film in the spec must land in its own register | a rule that misses its own example is wrong |

**28 pass, 0 rejected.** (27 rewritten, plus one the spec did not have.)

> **A register lives if it is about WHAT A FILM IS ABOUT, and dies if it is
> about HOW A FILM BEHAVES.**

That line is the whole finding. *Slow cinema, near-wordless, talk-driven,
deadpan, chamber drama, domestic realism, landscape reverie, visual symphony,
operatic excess, sun-bleached dread, cosmic dread* are all still dead, because
a plot summary never states a cutting rate, a dialogue density or where the
light falls. **"Dialogue rich" is on the dead side**, and no amount of theme
data recovers it — it needs the axis build or a script source. They are absent
rather than faked.

### The limit that must never be hidden

Themes reach 1,839 of 2,204 films (83.4%); **365 carry none at all** and no
theme rule can ever reach them. 1,251 films (56.8%) are behind at least one
door. **The register list is a set of doors and never a partition**, so the
resting readout says so in its own sentence and the whole atlas is one click
from everywhere.

Coverage per register is honest about its own size too: **folk horror is 10
films** in this corpus, and ten films is a real answer to "show me folk
horror". A register is baked down to 8 films where a recorded stratum needs 20,
and that is not a double standard — a genre with 15 films is a thin slice of a
taxonomy, a register with 15 films is the honest size of that region of cinema.

## Colour at field scale is a data channel — a deliberate restatement of AGENTS 5

AGENTS rule 5 says the colour on screen comes from the films, each disc in its
own measured highlight. That is exactly right for the radial map, where one
film lights one room, and it is the best thing in the product.

**At field scale it inverts.** Measured across the solved whole-atlas layout,
the nearest-neighbour hue difference between adjacent discs is **67.6°** against
**69.0°** for a random shuffle — a ratio of **0.979**. Two thousand measured
highlights side by side carry *no spatial information whatsoever*: they are the
generic rainbow rule 5 was written to forbid, arriving through the front door.

> **The film provides the colour when a film is in hand. At field scale colour
> must carry the stratum.**

So a register renders its own field: `hue`, `glow`, `scale`, `edge`, `mono`, and
a **motion signature**. The whole atlas at rest is untouched — per-film
highlights, no glow pass, no idle repaint. A treatment exists only while
exactly one register governs the picture; two registers is an intersection no
single mood describes, and blending them would be the interface asserting
something nobody measured.

### The three tiers, which are what make this cartography rather than decoration

A map's colour key is legitimate. A colour key **dressed as a measurement** is
not, and the only thing between the two is that the interface keeps saying
which it is. `build-registers.js` decides the tier **by measurement** — the
register's mean member highlight against the corpus mean in Oklab, in units of
the null SD of same-size random samples:

| | mark | what it means | count |
|---|---|---|---|
| **recorded** | ● | reports a fact about the print | 1 |
| **amplified** | ◐ | the films measurably separate; the DIRECTION is measured, the intensity is authored | 4 |
| **authored** | ○ | they do not separate; the colour was chosen | 23 |

*The silver print* desaturates because 194 of its films carry a recorded
`black and white` or `silent film` term — and it desaturates each film to **its
own** measured value, so it is 194 prints in 194 greys, not one house grey.
*Cyberpunk mood*, *cold science fiction*, *artificial life* and *cerebral
horror* separate at 3.5–6.8 SD; the readout prints the number and the hue angle
so the claim can be checked rather than believed. Everything else says
**"○ authored · no measured colour separates these films; this one was chosen
for the map"**, in the readout, every time it is on screen.

**Amplify by rotating the authored hue to the measured angle, not by pushing
the measured colour's chroma.** The chroma-gain version was built first and is
wrong twice: it clips (cerebral horror came out `#ff4353`, a colour no poster
in the register contains) and, because the corpus mean sits at hue 42°, every
register that deviates deviates the same way — cyberpunk, cold science fiction
and artificial life all resolved within 8° of each other. Three doors that look
identical is the failure the treatment layer exists to fix.

### What a treatment may not do

- **Rule 1.** `scale` is one number for the whole register, so no disc is ever
  larger for being better connected. `motion.kind: pulse` moves every disc in
  unison for the same reason; `drift` and `flicker` take a phase from the film's
  index in the corpus, which is arbitrary and carries no graph information.
- **Rule 2.** Edge COLOUR is untouched. The five relationship hues are the
  argument's grammar and a mood does not overwrite an argument; a treatment may
  only make those lines brighter or quieter (`edge`, 0.70–1.25).
- **Rule 4.** The glow is painted on the canvas; every caption is DOM type on
  its own opaque ground. Verified: 0 blurred labels at three viewports, with a
  film held so labels actually exist to measure.
- **Two contrast floors, because there are two kinds of object.** A disc is a
  graphical object (3:1); the tier glyph beside a register's name is 8.5px type
  (4.5:1, no exceptions — `--faint` was raised from 2.53:1 for this). Gothic's
  oxblood is 3.4:1 and the killer's deep red 4.1:1: correct on the canvas,
  illegal as lettering. The glyph uses `inkHue` — the same hue lifted in
  **lightness only** until it clears 4.5:1. The build fails if any does not.

### Motion is a budget, not a freebie

`still` is as expressive as a pulse and costs nothing — gothic, noir, the
institution and faith do not move at all. The idle clock runs **only** while a
register with motion governs the picture, stops when the tab is hidden or the
view is not the sky, is skipped entirely under `prefers-reduced-motion`, and
ticks at **~20 fps** rather than the display's, because every signature is
under 2 Hz. Measured draws in 3 seconds: **drifting 45, whole atlas at rest 0,
a still register 0.**

## The night sky — one register stops being a metaphor

This view has been called the constellation since it was built: the discs are
stars, the edges are the lines somebody drew between them, and none of that was
ever made good on. *Cold science fiction* is where it is — a real star field
behind the films, real scintillation, and a meteor across the frame from time to
time.

**It is spent on exactly one register, and that is the point.** Given to two it
would be a skin; being the only one, it is the moment the map admits what it has
been claiming. It is also the register that earned it: **6.75 SD** of measured
palette separation, the largest in the corpus, so the blue is closer to
reportage than anything else on this screen and the readout says so in the same
breath.

**The background stars are not films, and that is the whole trick.** 2,204 dots
with twinkle on them is still a field of dots; 59 dots in front of 760 faint
ones is a night sky, because the eye reads two populations as two distances. It
also puts the one thing a star chart does that this project may not — vary a dot
by magnitude — where it carries no information at all. Rule 1 governs films;
these are weather, and nothing about them comes from the corpus. They sit **at
infinity**: they translate a fraction of a pan and do not scale with zoom, which
is what stops the layer reading as a texture pasted over the page. Every phase
is an index into a 512-sample table — the answer `skyEase` already reached for —
so not one `Math.sin` runs in a loop of 760.

### The meteors, and the rule that was withdrawn — settled 2026-08

The owner asked for shooting stars that **pass through the entire night sky at
random intervals and in random directions.** All three words moved.

**Full traversal.** A meteor used to start inside the viewport and cover a fixed
third of the diagonal. That was itself the fix for an older bug — a first
version entered from outside at a wide angle and spent most of its life off
screen — and crossing edge to edge keeps that lesson rather than reversing it.
It now enters just off one edge and leaves off another: **83.4% of its life** at
1440×900 has the head inside the frame at worst, 88.5% on average, and **0 of
20,000** sampled paths begin or end inside the frame. The chord is floored at
0.75·min(w,h) so a crossing is never a corner graze, and the family of parallel
chords is centred on the **middle of the visible band**, not of the canvas — the
same correction `skyFitTarget` makes, and worth most on a phone, where crossings
shorter than 120px in the seen band fall from **30.6% to 16.6%**.

**Any direction.** The old angle was confined to 20–40° below horizontal, put
there so a streak could never read as a line drawn on the map. The owner has
ruled the sky unruled; the angle is now uniform over 360° (χ² 30–60 on 35 df
over 20,000 samples at three viewports).

> **The worry the angle rule was protecting was real, so it moved into the
> rendering, where it always belonged.** An angle restriction only ever hid the
> problem for most angles. Rule 1 is now carried by what a meteor *looks like*,
> and the test is a still frame with one crossing the densest part of the field
> parallel to the edges around it.

An edge here is a constant-width 1px stroke (1.5px when its film is held), in
one of five relationship hues, laid down source-over, joining two visible discs,
and motionless. Every one of those is inverted on purpose:

- **Tapered.** Zero width at the tail, 3.4px at the head, drawn as a filled
  wedge rather than a stroke. Nothing else in this grammar changes width along
  its length, so a still frame reads direction of travel off shape alone. The
  taper is **convex, `(1-t)^0.62`, and that is measured rather than preferred**:
  a straight cone falls under a pixel across its back two thirds, the rasteriser
  discards it, and a 165px trail renders as a **68px dash** — stubbier, blunter
  and closer to a mark on the map than the longer streak it replaced.
- **Additive**, in `lighter`, in a white the graph has no way to produce.
- **It has a head and no other end** — a bloom at the leading point, nothing at
  the trailing one. An edge has two identical ends and both are on a disc.
- **It ends in the air.** Both extremes are off-frame by construction.
- **It is underneath** the room tint, the lines and the discs, so a film always
  passes in front of it.
- **The trail is measured in pixels, never as a fraction of the path** —
  16% of the diagonal at entry, 7.5% at burnout. It reaches back off the frame
  rather than being clamped to the start, so the thing arrives already at full
  length: a streak that grows out of a point at the frame edge is a line being
  *drawn*, which is the one thing this may never look like. It is also what
  keeps the fill area per frame independent of how far the meteor travels.

The **structural** guarantee is unchanged and is the one that matters:
`skyMeteorStep` reads the frame and a counter and cannot see `sky.wx`, `sky.at`
or `ADJ`, so a meteor has no way to begin at a film, end at one, or point at
one. That is not a rule anybody has to remember.

**Exponential intervals, not a uniform window.** 5.5–11 s has the same mean as
what ships and reads as a slow metronome — a window that narrow makes every gap
roughly the gap before it and the eye learns the beat inside a minute. Arrivals
independent of each other are Poisson, and Poisson gaps are exponential. The
mean is deliberately held: **8,239 ms against the old 8,250** over 4M samples.
The shape is what changed — median **6.1 s** rather than 8.25, **7.9%** of gaps
under a second (the pair, which is most of what makes a sky feel alive), **9.3%**
over twenty (the dry spell). Floored at 320 ms so a pair is two meteors and not
one forked streak; capped at 26 s because a tail running to a minute is
indistinguishable from the feature being broken.

Speed is held roughly constant (1,500 px/s) rather than lifetime, so a short
crossing on a phone is not a slow one: a meteor is recognised by how fast it
moves far more than by how long it lasts. Life is 430–1,100 ms.

### Measured cost — the part that decides whether this ships

`skyDraw`, real Chromium at devicePixelRatio 2, 1440×900, software rasteriser,
40 frames each:

| | mean | worst |
|---|---|---|
| whole atlas, no treatment (2,204) *(control)* | 1.93 ms | 2.7 ms |
| night sky, between meteors (59) | 1.33 ms | 2.2 ms |
| night sky, **meteor in flight** (59) | 1.43 ms | 3.6 ms |

A full-diagonal crossing costs **+0.10 ms** over the same frame with no meteor
in it, and the whole thing is **0.74×** the untreated whole atlas. The reason a
three-times-longer path did not cost three times more is the trail being fixed
in pixels rather than scaled to the travel.

The clock is bounded by arithmetic rather than by hope: it lifts from ~20 fps to
~45 only while one is in flight — 0.43–1.1 s against a mean gap of 8.2 s, so
**under 10%** of the clock — and at 45 fps the head moves ~33 px a frame inside a
trail 90–265 px long, so consecutive frames overlap several times over and the
streak never dashes. Measured idle draws in 3 s: **night sky selected 62, tab
hidden 0, view is the wall 0, whole atlas 0.** Under
`prefers-reduced-motion`: **no meteor at all** (`skyMeteorStep` returns null even
when one is forced due), **0 idle draws**, and the static sky still arrives —
39 of the 39 brightest stars lit where the seed says they should be.

**Every one of those checks was broken on purpose and confirmed to report it**
(`.claude/skills/run-film-atlas/meteor-probe.mjs`, negative controls built by patching the artifact): the old
20–40° wedge → χ² 333,304; negative margins → 20,000 of 20,000 endpoints inside
the frame; no chord floor → a meteor visible 0% of its life; `skyReduced()`
removed from the meteor step → "reduced motion still produces a meteor"; the
`view === "sky" && !hidden` guard removed → 63 draws with the tab hidden. The
off-view check needed **two** breaks to fire, because `skyExit()` cancels the
timer unconditionally as well — two independent mechanisms, which is why it is
the one guard a single edit cannot defeat.

## The worlds strip — a contact sheet of one negative

Across the top of the field, printed the way the thread is: perforations as the
rail's own background so they stay registered while the frames travel past,
frame lines between cells, no radius. It **unspools** — the rail translates in
from the left on the camera curve — and that is the one piece of literal
apparatus in the project, here because this is the moment the reader is handed
the whole atlas and needs to be told it is a machine with doors.

**Each frame is the whole atlas with that register exposed on it.** The first
version drew each register's own re-formed constellation — the exact layout the
door flies to. It was honest and useless: the solver normalises every stratum
into the same box, so 28 frames came out as 28 discs of the same size differing
only in colour and in a density the count beside them already prints. **A
thumbnail redundant with its own caption is not worth 66 pixels.** Drawn
instead as one negative exposed in 28 places, every frame is a different
picture and the difference is information nothing else in the app can show:
whether a world is one tight knot or scattered through everything.

**Grazing a frame lights that world where it actually is** — its films come up
in its colour at their current positions, everything else recedes, lines
included. That is the project's own rack focus asked of a SET rather than of
one film, and it lets you see the dispersion before spending a re-form.

The strip is the **arrival state, not permanent chrome**: it rolls up the moment
a world is chosen, leaving a printed tab, and comes back with the whole atlas.
147px on desktop, 134px on a phone (17% of the viewport), and the field
visibly opens out when it retracts.

**Fit means the part you can see, and the chrome is no longer all at the
bottom.** `skySafeH` took the minimum top edge of every chrome box, which
collapses to the strip's own top edge the moment the strip exists — the atlas
fitted itself to a 140px floor and parked under the index. The safe band is now
computed from both directions and the camera centres on ITS middle. The arrival
fit also **waits for the strip to be measured**: taken a frame early it is a
fit to a viewport 147px taller than the one that exists, and the camera lands
1.5× inside its own fit — the whole atlas drawn as though zoomed in, on the one
view that should read as zoomed out. Verified by negative control: with the
strip removed from the chrome list, **137 films (6.2%) sit under the index**;
with it, 0 at all three viewports.

### Measured cost

`skyDraw`, real Chromium at devicePixelRatio 2, 1440×900, software rasteriser
(no GPU in the sandbox), 40 frames each:

| | mean | worst |
|---|---|---|
| whole atlas, no treatment (2,204) *(control)* | 1.91 ms | 2.5 ms |
| family as a trap — still, glow .35 (194) | 1.37 ms | 2.1 ms |
| noir fatalism — still, glow .35 (167) | 1.31 ms | 2.1 ms |
| cyberpunk — drift, glow 1.0 (47) | 1.24 ms | 2.1 ms |
| whole atlas + strip preview of 194 | 2.92 ms | 6.9 ms |

A treatment is **cheaper than the untreated whole atlas**, because a register
is a fraction of it. The one case that costs more is the strip preview, which
draws 2,204 discs plus 194 halos and is still inside a frame. The halo is a
pre-rendered 64px sprite blitted with `lighter`, never a `createRadialGradient`
inside the loop; the 28 miniatures are drawn once at mount over a shared ground
raster and are static bitmaps afterwards.

## The signature

Rack focus. The focused cell is sharp; one hop out is slightly soft; two hops
is bokeh; the far map dissolves. It solves the hairball problem — only two
rings are ever legible — and it is the one memorable thing. Everything else
stays quiet in service of it. Type never participates: imagery racks focus by
graph distance, captions stay sharp at every depth (AGENTS rule 4).

## Responsive law: three scarcities, three answers — settled 2026-08

A single width test was standing in for three different questions, and each
one fails on a viewport the others cannot see. `layout()` now asks them
separately:

- **`narrow` (W < 620)** — how big a poster can be.
- **`compact` (W < 500, or cells at phone size on a short stage)** — whether a
  floating edge label has anywhere to stand. Decided **after** cell size,
  because cell size is what decides it: at 1024×660 with the panel open the
  stage is 654px wide and the cells are the same 70px a phone gets, and 97 of
  196 worst-case renders put a label across a title. Below it, the
  relationship moves into the ring film's own caption, where the separation
  pass already guarantees it clearance.
- **`widecap` (compact, or H < 620)** — purely vertical, and invisible to any
  width test. At 1280×700 — an ordinary laptop window whose stage is *shorter
  than a phone's* — a long title set in a 104px gutter is seven lines reaching
  onto whatever is below it. Captions are allowed to run wider than the image
  they sit under; the ellipse has horizontal room at top and bottom, where it
  is most needed.

**Never assume a caption's height.** The old budget was a flat `w*1.5+34` — a
poster plus exactly one line — and every geometry decision downstream inherited
that lie. Widths are written first and heights read back, with
`transitionProperty` suppressed across the one forced reflow so the measurement
is of the new width and not of a width halfway through animating to it.

**A ruled label cannot reach a 44px touch target by growing.** The chip and the
"see the whole atlas" link are underlined words and the underline *is* the
state, so min-height and padding alike drag the rule away from the word. The
target grows invisibly through a centred `::after` overlay; the row gap opens
to match, or two 44px targets on a 36px pitch make the row above eat the row
below.

## The panel: reading order is an argument — settled 2026-08

Name, face, what you can do about it, then **Why it connects**, then the
synopsis, then the filing rows. The claims are the only thing in this product
that is not already on a hundred other film sites, and a full-width one-sheet
was pushing them 98px below the fold on a 1440×900 desktop and 526px below it
on a phone. The poster is capped, and on a phone the head becomes a catalogue
card — plate left, name right — which puts two whole claims on the first
screen.

## The wall: what decides the front page

The wall shows the first 240 films, so the behaviour **at the cut** is the
front door of the project. Two things were deciding it that should not have
been, both fixed 2026-08:

- A poster was worth three connections in the score. AGENTS rule 9 says the
  generated cell *is* a film's visual identity; a three-edge handicap says the
  opposite. The poster is a tiebreak.
- Ties broke on year. 250 films tie at the cut and 34 fit; ranked by year those
  34 had a median of **2019** against **1986** for the pool they came from. A
  lineage atlas whose front page silently advertises the last five years is
  making the exact error AGENTS rule 1 forbids one level down. Ties now break
  on the strongest single claim a film carries. Front-page median year moved
  1983 → 1977 against a corpus median of 1979.

## The constellation

One disc per film in that film's own measured highlight; **size is identical
for every film at every moment** (AGENTS rule 1 — a field that draws the
well-connected larger is a popularity chart wearing a star map's clothes).

**Disc size is a question about room, not about N — settled 2026-08.** The
solver normalises into a fixed box, so the median gap between two films is
`0.669/√N` world units at every corpus size measured: density is a property of
the frame, not of the solver. At 803 films that is 8.5px on a phone at the fit
zoom; at 2,008 it is 5.4px and 24% of discs merge. Scaling the radius by
`√(803/N)` is the arithmetic answer and it is wrong, because it also shrinks the
desktop disc, where 11.4px of gap has no problem to solve. The base is tied to
the gap **in pixels** and capped at the value tuned for today, so it gives
ground only where there is genuinely no room: 24.0% → 0.3% on a phone at 2,008
films, with desktop and tablet unchanged.

**Fit means the part you can see.** The readout and the zoom controls are
opaque overlays; fitting to the canvas parked 5.7% of the corpus underneath
them at 390×780. The camera fits and centres on the visible rectangle — the
same correction `layout()` already makes for the detail panel.

**Narrowing re-forms it** — see "The atlas re-forms" above. The note in that
section supersedes anything here that reads as though a filter dims.

**The key lives in the readout.** Five colours were being painted and nothing
said what they were; the resting readout was answering "what am I looking at"
with mouse instructions. It now carries the five relationship names and the
dashed swatch for `reading, not record`, and is replaced by the film's own
details the moment one is in hand.

## The atlas re-forms — settled 2026-08

**The films move.** Narrowing used to dim: every film kept its whole-atlas
position and anything outside the selection dropped to 9% alpha, on the
argument that a film's place is the one thing the sky promises to a second
person. The owner overruled it — *"yea let the atlas change"* — and the
argument for dimming was answered rather than ignored: **every stratum's
constellation is solved at build time and baked** (`app/layout-strata.js`, 44
strata, 54 KB), so "Japanese cinema sits in a long arc" is still something one
person can say to another. It is now a statement about that stratum's own sky
rather than about a slice of the whole one.

### Density is the invariant; extent is the variable

Every solved layout — the whole atlas, every stratum, every live solve —
normalises into the same [0,1] box. Dropped in unchanged, a 152-film stratum
would spread 152 films across the space 2,204 occupy and narrowing would read
as *blowing the atlas up*. So a re-formed constellation is scaled about the
centre by **√(N/N_all)**, and that factor is arithmetic rather than taste: the
solver's median nearest-neighbour distance is `0.669/√N` world units at every
corpus size measured, so the scale makes it `0.669/√N_all` — identical to the
whole atlas's.

> **At its fitted zoom, every re-formed sky has the same star spacing in pixels
> as the whole atlas does.** Narrowing never changes the density of the field.
> It changes its extent, and the extent is honestly the size of the selection.

That is also the "grow and shrink" the feature was asked for, and it is not a
rule 1 problem: the factor is a property of the SELECTION — a number already
printed beside it — applied identically to every film in it.

### The flight, in three beats

1. **0 → 0.34 · the field clears.** Films outside the selection travel outward
   along their own radius from the centre of the world and fade to nothing.
   Their destination is computed from their HOME position, never from where
   they currently are, so repeated re-forms cannot walk a film to infinity and
   a film that leaves and returns retraces its own path. Their *lines* go
   first (gone by 0.26): a stretched line is a much bigger object than the disc
   at either end of it.
2. **0.13 → 1.0 · the survivors travel.** Staggered by distance from the point
   the camera is looking at, so the change starts under your eye and rolls
   outward — the same sonar wave the radial map's ring reveal uses. The
   stagger carries no graph information: it depends on where the camera happens
   to be, never on degree, strength or year. Survivors are held for the first
   eighth so the atlas is seen to empty *around* them.
3. **0.28 → 1.0 · the camera closes.** Closing in it LAGS, so the atlas is
   seen to gather before the frame closes on it; opening out it LEADS, so the
   frame is already wide when the films reach the edges of it.

Total 1,150 ms. Edges redraw live throughout — watching a bond stretch and
re-settle is most of what makes a re-form legible as the same graph seen
differently.

**"Out" means gone, and that is a reversal.** Faint ground was meaningful when
the survivors stayed put: the dim dots were the rest of a layout the bright
ones still belonged to. Once the survivors move, a dim dot is a coordinate in a
layout nothing on screen is using — two pictures superimposed, distinguishable
only by brightness. Better gone, and one click from coming back.

`prefers-reduced-motion` **still changes state**; it simply arrives instead of
flying. Someone who asked for less motion did not ask for less atlas.

### The intersection path

One selected value re-forms into a baked constellation. Two or more has no
baked answer and cannot have one — there are combinatorially many and they are
small — so the app solves them live with **`layout-sky.js` embedded verbatim by
the build** (`/* __SKY_SOLVER__ */`, the same discipline `radial-inspection.js`
ships under). Not a second hand-written solver: a second copy of a force solver
is a copy that drifts, and the day it drifts an intersection stops being drawn
by the same rules as the stratum it sits inside.

Measured on this corpus: median intersection 31 films / 30 ms, p90 116 / 76 ms,
worst reachable in two clicks 518 / ~490 ms. Above roughly a frame the readout
and the standing strip say *"solving N films…"* on the frame before the solve
runs, exactly as `sky.passage.pending` already does.

**The rule 7 caveat, which is real.** The baked strata are data and are
identical on every machine. A *live* solve is identical for a given reader on a
given engine — verified byte-identical across two fresh page loads for both
paths — but is not guaranteed identical between JS engines, because ECMAScript
does not require `Math.pow`/`cos`/`sin` to be correctly rounded and **a force
solve is chaotic**. Measured: the browser and Node disagree by mean 3.1e-2 per
film, and perturbing a single edge strength by ONE ULP in Node produces mean
3.3e-2 — the same magnitude. So the disagreement is exactly "one ulp of input",
which is the best two implementations can do. This is why baking is the right
call for a stronger reason than performance, and it is a live argument against
ever computing a shareable position at runtime.

### What the reader is told

A re-formed atlas is a different picture of the same corpus and that must not
be silent. Three places, because the readout is taken over the moment a film is
in hand:

- **`#sky-stratum`**, a standing slate strip above the readout: `RE-FORMED ·
  DRAMA · 1552 / 2204`, with the way back printed as a mark. It persists for as
  long as the state does.
- **The resting readout**: *"These 488 films have been placed again, against
  only each other. Your selection chose who is here; the connections still
  choose where — these are not their places in the whole atlas."*
- **The panel that caused it**, in prose, at the moment it becomes true.

AGENTS rule 8 governs the voice. The strip is slate lettering and says what the
picture IS — a filing fact and a count. It never says why two films in it are
near each other; that answer stays on the edges, where it is argued.

The same honesty runs one level down: a film's readout says **"4 of 20
connections here"** once the atlas is re-formed. `ADJ[key].length` is its degree
in the whole corpus, and printing that under a stratum reads "20 connections"
while one line is drawn.

### Ink, disc and budget follow the picture, not the corpus

The same correction, one level down, and it was a real defect until the small
strata made it visible. Line alpha, disc radius and the edge budget were all
keyed to `k / skyFitK()` — zoom measured against **the whole atlas's** fit. A
12-film sky is displayed at 13× that zoom, so it was drawn as though deeply
pushed in: near-invisible lines (alpha 0.15 against 0.34) and fattened dots,
on the view with the most room in the atlas.

`sky.extent` is now the world span of what is on screen and zoom is measured
against *its* fit, so **a re-formed stratum at rest is inked and dotted exactly
the way the whole atlas at rest is** — the same invariant as the density scale,
carried through to the ink. The extent is interpolated on the camera's clock
during a flight so nothing snaps on the first frame.

The budget is likewise a share of the connections **in the picture**. Drawing a
prefix of the stratified order is how the whole atlas avoids being a grey wash;
a 200-edge stratum has no wash to avoid, and the absolute prefix was hiding
most of it. Below the floor the whole order is scanned and the per-edge
liveness test does the work.

### Measured cost

Frame intervals, real Chromium at devicePixelRatio 2, 1440×900, software
rasteriser (no GPU in the sandbox), with the two shipped animations as
controls:

| | fps | mean JS/frame | worst frame |
|---|---|---|---|
| pan drag, 2,204 films *(control, existing)* | 26.7 | — | — |
| camera-only 620 ms move *(control, existing)* | 25.4 | — | — |
| re-form → drama (1,552) | 33.3 | 2.32 ms | 6.5 ms |
| re-form → whole atlas (2,204) | 36.9 | 2.00 ms | 5.2 ms |
| re-form → horror (164) | 47.5 | 0.89 ms | 4.8 ms |
| live solve, drama × 1960–79 (488) | — | 1.29 ms | 5.7 ms + **430 ms solve** |

**The re-form is faster than the camera move it replaces**, because the budget
is now right-sized for the picture. At dpr 1 everything holds 57–61 fps; the
dpr-2 numbers are dominated by rasterising 2,204 arcs at 2880×1800 in software
and are a property of the harness, not of the tween. The tween's own JS cost —
2,204 position writes and two eased interpolations each — is ~0.3 ms/frame.
`skyEase` is a Newton solve and would have been called 4,408 times a frame for
a fixed curve, so the form loop reads a 513-sample table instead.

Verified in a real browser at 1440×900, 900×820 and 390×780, panel open and
closed: zero labels over chrome, zero label collisions, zero blurred labels
(rule 4), every new piece of type at or above 5.0:1 on its own ground, the
clear mark reaching 44 px on a coarse pointer, and no console errors.

## Deliberately avoided

The generic AI-design tells: interchangeable rounded cards, purple-blue
gradients, glass panels, glow without a light source, particles, oversized
headings substituting for composition. Zero border radius throughout — this
world is made of film and paper, not plastic.

## Open questions

0. **A re-formed atlas has no address.** `#/sky` and `#/passage/a/b` are real
   URLs; a selection is not. The whole point of the feature is that people
   arrive at configurations worth showing someone, and right now they cannot.
   `#/sky/genre:drama+era:1960-1979` is cheap for the baked path and honest for
   it too; for a live-solved intersection it would promise a picture the
   caveat above says may differ slightly on another engine, so a shared
   intersection would need to say so or be refused.
1. ~~**The constellation still has no job.**~~ **Answered by the worlds — see
   "The worlds" above.** What survives of it: the strip is an index of 28 doors
   and 43% of the corpus is behind none of them. That is stated on screen but
   not solved, and the honest fix is more themes, not more rules — a rule
   invented to catch the remainder would be a rule fitted to a gap rather than
   to cinema.
2. **The field is an even disc because the corpus is.** 84% of edges are
   convergence + hand, so no tradition separates from any other at low zoom.
   That is the material, not the layout; the layout can only choose whether to
   impose an axis on it. `descent` is 91% forward in time (181 of 199), which
   is the one honest axis available. **The registers give the disc regions
   without imposing an axis on it** — grazing the strip shows that folk horror
   is a corner and family drama is weather across the whole plate — but only
   while a frame is being grazed. At rest the disc is still even.
3. **Residual geometry.** Across 44 worst-case seeds (longest titles + highest
   degree) at eight viewports: 7 of 704 renders still place a caption on a
   neighbouring poster, all of them at 1024×660 — a 516px stage, shorter than
   a phone's — with 40-plus-character titles. Everything else is clean.
4. **A world has no address either.** Same shape as question 0 and cheaper:
   every register is a baked stratum, so `#/sky/world:gothic` promises a
   picture that is byte-identical on every machine. The strip is now the best
   thing in the view to arrive *at*, and you cannot send anyone to one.
5. **Twenty-eight doors is near the ceiling for one flat rail.** It is 3,300px
   of horizontal scroll at 1440, and an index stops being an index somewhere
   around forty. The spec already groups registers into families — horror &
   dread, mind & meaning, city & crime, future & machine — and the next form is
   probably one family at a time, which is also how the strip earns a second
   row of information without getting taller.
6. **The strip is where a world can be seen but not read.** A frame says a
   name, a count and a distribution. It does not say *which* films, and the one
   question a grazed frame provokes — "what is that knot in the corner?" — has
   no answer short of committing to the re-form. Three named fixture films per
   frame would answer it in the space the blurb currently spends on a `title`
   attribute nobody sees on a phone.
