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

### A route is a reading posture, not a browsing one — settled 2026-08-09

That rule was written for selections and applied one case short. During a
Passage the atlas is still whole, so the strip stayed open — and 28 doors to
somewhere else sat over the top of the chain the reader had just asked for.
Measured overlap of `#sky-worlds` (z 9) on `#sky-readbox`: **520×115px** at
1440×900, **632×139** at 900×820, **366×134** at 390×780, hiding the route's own
title (`8½ → Prince of Darkness · 8 crossings`) and the opening of its first
claim. A reader arriving from a shared `#/passage/a/b` link on a phone got a
list of unattributed sentences beginning at claim three: the panel's top was
**61px above the top of the window**, because the box was bottom-anchored with
no ceiling and 794px of claims will not fit in a 780px phone.

Two answers, because the geometry has to hold even when the posture rule is
overridden by hand:

1. **The strip retracts while a route is live** (`skyPassageStart`), and comes
   back when it is cleared, on the same `!skyFilterOn()` condition
   `skyClearFacets` uses. The tab stays: the doors are one click away, not gone.
2. **The HUD is ceilinged by the strip's own measured leading edge**
   (`.sky-hud{top:var(--worlds-h)}` — the same variable the filter panel already
   sits under) and the claims scroll inside it. So re-opening the strip
   mid-route *moves the reading down* rather than burying it: measured, the
   readout goes 116→231px at desktop and 139→246 on a phone, overlap 0 in both.

Opaque chrome during a route fell **129% → 88%** of the phone viewport (over
100% meant the boxes were overlapping each other), 89.7% → 69.2% at 900×820 and
56.1% → 39.5% at 1440×900. Title and first claim now hit-test to themselves at
all three viewports — `elementFromPoint`, not a screenshot.

**A geometry change is a hit-testing change.** Making the HUD span the field
gave `.sky-hud-main` (`flex:1`) an invisible 366×545 box over the phone's
constellation, inheriting `pointer-events:auto`: a 6×6 grid of taps across the
field hit the canvas **18 times before the change and 0 after**, while every
screenshot stayed perfect. The column is `pointer-events:none` with its printed
children taking their own events back.

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

## The map arrives on the map — settled 2026-08

Opening a film used to draw its radial map **and** open the detail sheet on top
of it. Measured across the seven laid-out cells at arrival, the sheet covered
**6 of 7 at 390×780** — on a phone it is a 72%-tall bottom sheet — and 0 of 7 at
1440×900, where `layout()` already lays the ellipse out to avoid the 370px rail.
So the complaint was real and it was a phone complaint: the reader asks *what is
this film connected to* and gets a wall of text over the answer.

> **Opening a film opens its branches. The sheet is the second gesture, and the
> gesture is the obvious one: the centre poster.**

`presentRadialMap()` no longer calls `openPanel`, and `openMap()` closes any
sheet standing from the film before. Every way in goes through `openMap` — a
ring click, a click in the constellation, the search box, *Surprise me*, *Resume
here* on the thread, `#/film/<key>` and the back button — so **the address and
the gesture cannot mean different things**. Verified for all six.

Four consequences, each of which had to be answered rather than accepted:

- **The claims must still be readable, and on first arrival they are NOT.**
  Measured on arrival: six relationship names are on screen (on the lines at
  1440, in the ring captions on a compact stage) and **not one of them is a
  claim**. The claim tip is hover-only, so on a touch screen there is no claim
  text on screen at all until something is tapped. That is a real reduction and
  it is stated here rather than buried: what mitigates it is that a tap on any
  connected cell opens **that one claim**, a tap on the centre opens **all
  six**, and every ring cell's `aria-label` already carries its own claim
  verbatim, so a keyboard or screen-reader reader never lost them.
- **The affordance had to become visible.** The centre caption carries one slate
  line, `why it connects`, in the interactive accent — 9.1:1 measured off the
  composited page at 1440 and 9.7:1 at 390, against a 4.5:1 floor. It is the one
  piece of type in this project that names a gesture, and it is inside the
  caption box the separation pass already measures, so it can collide with
  nothing. **It is printed only where the ellipse has the height** — see the
  calibration table in `layout()`; printed unconditionally it doubled the map's
  one remaining geometry defect.
- **The arrival still has to be announced.** `#panel` is `aria-live`, so opening
  it *was* the announcement. `#sr-status` now carries the film, the year, the
  count and where the claims are.
- **The poster is the handle in both directions.** Clicking the centre while its
  own sheet is open closes it — otherwise the second click on the centre is the
  one click on this screen that does nothing. On a phone the sheet covers the
  poster it was opened from, which is why the outside tap below is the
  load-bearing dismissal there.

## The sheet dismisses on any outside click — settled 2026-08

The × is not the only way out; Escape and the × both stay. What makes this
invisible rather than infuriating is entirely in what counts as "outside":

- **A click on a film opens that film.** One gesture, not two. `.node` is
  excluded by name, not by timing.
- **A drag is not a dismissal.** The gesture is anchored at `pointerdown` and
  counts only if it ends within 8px of where it started; a gesture that starts
  *inside* the sheet is never a dismissal however far outside it ends.
- **A touch tap fires a synthetic click afterwards.** The constellation's
  ghost-click guard already existed for this, and **its arming was widened from
  one branch to every touch pick.** It was armed only in the pin-then-open
  branch, which left the anchor branch — a second tap on a held film, which
  calls `openMap()` — unguarded; with the sheet no longer opening over the
  arrival, that ghost lands on a ring cell and opens a film nobody chose.
  Reproduced and fixed: three taps on one disc now land on that disc's film with
  `state.sel === null`.
- **Focus lands somewhere.** If the reader was inside the sheet and dismissed it
  on bare ground, focus returns to the film in the map, as the × path does. If
  they clicked something focusable, that thing has focus and moving it again
  would be theft.

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

### The primary key was degree, and that was the founding error on the door — settled 2026-08-09

Both fixes above were right and both were tiebreaks. Nobody looked at the first
key, which was `ADJ[b].length - ADJ[a].length`. The 2026-08-09 review measured
what that cost: rank against degree correlated **−0.679**, the front page's
degree floor was **22**, and only **374 of 2,204 films (17%)** could ever clear
it — with 1,222 films tied at exactly degree 20, separated by nothing but
whether they had a poster. AGENTS rule 1 is written about edge distance, so
this was not a literal breach. It is that rule's own sentence — *"a
degree-weighted graph collapses toward the canon and confirms what the user
already knows"* — enacted on the front door.

**The front page is now sorted by what the atlas can SAY about a film.**
Degree appears nowhere in it: not as a key, not as a tiebreak.

`CLAIM_SCORE` counts **authored** edges only — a reading or an attestation,
never a record, because a record is something the atlas looked up and a reading
is something it argued. Each is weighted by its confidence. The best claim
counts whole and every further claim counts **half of the one above it**, so
the series is bounded by twice the best and a film with twenty middling
readings can never overtake a film with one superb one. That bound is the
point: ranked on raw authored *count*, this corpus returns Bicycle Thieves,
Vertigo, Tokyo Story, Persona, In the Mood for Love — the canon again, one rung
down, because a count of readings records where the reading passes spent their
effort and they spent it on famous films.

Three bands, and **only the first is ranked**:

| band | what it is | today | ranked? |
|---|---|---|---|
| head | highest-scoring films carrying ≥1 authored claim at confidence ≥ 0.5 | 120 of 453 eligible | by claim score |
| deal | every other film the atlas has written about | 898 | dealt |
| rest | films it has only recorded | 1,186 | by `BEST_BOND`, poster tiebreak |

- **The head's threshold is AGENTS rule 3's own line.** The front page does not
  lead with a film whose best claim is marked *reading, not record*; those are
  dealt for, below. **Its size is half the wall by construction**, not a tuned
  number — at 10,000 films a proportional head would swallow the whole front
  page and the atlas would be back to a fixed leaderboard.
- **The deal is not ranked, because below the head the score is false
  precision.** A reading's confidence is a hand-set number in steps of 0.05;
  sorting 898 films on its third decimal invents an authority nobody measured.
- **The deal's seed is the corpus version.** Same build, same wall; same corpus,
  same wall for every reader — AGENTS rule 7, not a shuffle that moves under a
  reader's hands on reload. It re-deals **exactly when the corpus learns
  something**, which is the honest trigger: a reading pass changes what the
  atlas can say, so it changes what the atlas leads with. Measured across three
  synthetic corpus versions, a re-deal replaces **98–111 of the 240** tiles.
- **The poster has no job in the head or the deal.** Letting artwork jump the
  queue inside a dealt band would reinstate the three-edge handicap in a new
  costume. It costs nothing measurable: **236 of 240** front-page films have a
  poster against a corpus rate of 96.6%, and the four that do not (Chronique
  d'un été, A Confucian Confusion, Sambizanga, Siegfried) render as generated
  cells with their captions permanently on, which reads as intentional rather
  than as a hole.

Measured, old → new, on 2,204 films:

| | old | new |
|---|---|---|
| rank vs degree, Pearson | **−0.679** | **−0.265** |
| front-page mean degree | 24.19 | 21.91 (corpus 20.16) |
| front-page degree floor | 22 | **1** |
| corpus that can reach the front page | 374 (**17.0%**) | 1,018 (**46.2%**) |
| distinct cinemas on the front page | 33 | **40** of 73 |
| American share | 38.3% | **32.1%** (corpus 32.8%) |
| distinct directors | 147 | 148 (top director 9 → 8) |
| median year | 1973 | 1973 (corpus 1977) |

The residual −0.265 is **not a sort key**. It is a property of the pool: films
the reading passes wrote about happen to average 20.93 connections against
19.50 for the ones they did not. That is a fact about where the writing went,
and the honest fix for it is more readings on thin films, not a term in the
sort.

**The wall deals; search does not.** The suggestion list walks its own
`SUGGEST_ORDER` — same bands, same claim ranking, no deal. It stops at the
first eight prefix matches, so the order decides *which* eight a reader is
offered, and an autocomplete that returns a different eight after a corpus
update is a worse instrument than one that is merely imperfect.

The lede says the one sentence a reader needs for any of this to be legible:
*"The wall below leads with the films it has the most to say about."* It is in
the serif with the rest of the prose, not in the slate — see the standing note
that the slate is for metadata, labels and legends, never for argument.

### *Surprise me* has no floor — settled 2026-08-09

It drew from `WALL_ORDER.slice(0, 260)`, on the argument that landing on a dead
end feels empty. Measured, that argument cost the whole idea: pool mean degree
**24.0** against a corpus mean of 20.2, a floor of 22, and **500 presses
returned 223 distinct films out of 2,204**. The one button in this product
labelled serendipity could not show you a film outside the best-connected 11.8%
of the atlas.

It is now **uniform over every film**. Measured by clicking the real button 500
times in Chromium: **442 distinct films**, mean degree **20.11** against a
corpus mean of 20.16, degrees **2–37**, median year 1977 (corpus 1977), and
only 55 of the 442 were in the old pool at all. The dead-end worry was
overstated — the thinnest film in the corpus has one connection, not none, and
14 films in 2,204 have fewer than six. *The Round-Up* at degree 1 renders one
dashed convergence to *The Ascent*, labelled and readable. A map with one line
on it is a real answer and a truer one than never being shown.

**The only weight is the reader's own.** A film already marked is not a
surprise, so a marked draw gets **one** re-roll — once, never a loop, because a
reader who has marked half the atlas must not be made to wait for the button.
With nothing marked, which is every first press, this is exactly uniform.
Measured with 300 films marked seen: the button landed on a marked film **12
times per 500** against **68** expected under uniform, and distinct reach went
up rather than down (447).

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

### The readout collapses, and that is a change to the picture — settled 2026-08

Carrying the key, the count and the re-form sentence makes it the largest opaque
object in the field, on the edge a phone has least of: **155px at 1440×900 and
30% of the viewport at 390×780 with a world chosen.** It is not decoration to
fold it away, because `skyChrome()` seeds it into the label placer *and* into
the camera's safe band — so collapsing it hands the constellation real room.
Measured, folding it:

| | box | `skySafeH` |
|---|---|---|
| 1440×900, whole atlas | 155px → 29px | 502px → **627px** |
| 390×780, a world chosen | 30% of the viewport → 6% | 286px → **474px** |

The camera re-fits on the fold, exactly as it does when the worlds strip rolls
up, and only when nothing else owns it — a reader who has panned somewhere has
said where they want to be, and a fold is not a request to be moved.

**Folded means folded.** No state re-opens it behind the reader's back. That
costs the readout's buttons (*Open its map*, *Route from here…*) one tap while
it is down, and the alternative — springing open whenever a film is in hand —
makes the box flicker under a mouse crossing the field, which is the thing the
fold exists to stop. Nothing becomes unreachable: a second tap on a held film
still opens its map, Escape still releases, and the collapsed line names
whatever the body is holding.

**The collapsed line is the whole orientation, so it carries the count** —
`THE WHOLE ATLAS · 2204 FILMS`, `THE SILVER PRINT · 194 FILMS`, the film's title
when one is in hand, `PASSAGE · 3 CROSSINGS` mid-route. Expanded it drops the
count, because the body underneath and the stratum strip above both already
print one and a third copy is a number nobody asked twice for.

Remembered in `atlas-preferences-v1` as `skyFolded`, read back with `=== true`
rather than a truthy test — the same discipline as the `hasOwnProperty` filter
on `seen`/`loved`, and for the same reason: this store is hand-editable and a
boolean preference must never arrive as a string.

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

#### A route dims the lines with the discs — settled 2026-08-09

The disc pass took everything off a Passage to `0.07` and the edge pass, 140
lines earlier, had **no route term at all** — so a route erased the *subject*
and kept the connective tissue at full weight, which is the signature running
backwards. On screen: a grey cobweb with eight lit dots in it. Measured on the
composited canvas at 1440×900, effective-luma thresholds on the canvas's own
pixels:

| | ink | bright (>28) | the route itself (>90) |
|---|---|---|---|
| resting whole atlas | 13.21% | 8.64% | 1.969% |
| a route, before | 5.11% | 2.35% | 0.161% |
| a route, after | 4.45% | **0.21%** | 0.155% |

The route was **6.9% of the bright ink** on its own view and is now **74%** of
it, while total ink moves only 13% — the ground recedes to ground and is not
deleted, which is what the disc pass's own comment asks for ("the route only
means something against the atlas it crosses"). The factor is `0.15`, not the
disc pass's own `0.085`: the strip preview already concedes its lines the same
~1.7× (0.34 against the discs' 0.195), and for the same reason.

The term is read through `roomRoutedEarly()` rather than the `hasRoute` const,
which is 140 lines below the edge pass — a temporal dead zone that has already
shipped once here as a throw leaving a cleared canvas and a clean console.

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

### The address — settled 2026-08

A re-formed atlas now has a URL. `#/sky/world:gothic`,
`#/sky/genre:drama+era:1960-1979`. Recorded facet values already carry their
field in their id, so a token *is* the value; register ids do not, so theirs
takes a `world:` prefix — the word on screen rather than `register`, the word
in the data. Tokens are sorted, so one selection has one address however it
was clicked.

> **The address names the SELECTION, never the picture.**

That one line settles everything else. A selection is a handful of stable ids
and set arithmetic over baked posting lists — no float touches it — so the
membership an address restores is exact on every machine. The positions are
then recomputed on arrival, by whatever means the receiving artifact has.
Nothing about how the sender's machine drew it is serialised, because the
receiver can work that out for itself and a copy of a derived fact goes stale.

**Rule 7, and what is done about it.** A register or a recorded stratum has a
baked layout, so its address promises a byte-identical picture and the
interface adds no caveat. An intersection is solved live and two engines
disagree by about one ULP of input, so it **is** still serialised — refusing
would make the feature's best output unsendable — and the picture it restores
says so: the strip reads `SOLVED HERE` instead of `RE-FORMED`, and the readout
separates the two halves rather than hedging both. *Who* is in it is exact;
*where* each film sits is this engine's answer, worth about 3% of the field.
That sentence is computed from `sky.formKind` on the machine reading the link,
never carried in it — so it is right for a stale address, and right for the
case a flag in the URL would miss, a single stratum too small to have been
baked.

**A stale link falls to the whole atlas, and says which names it dropped.**
All of the tokens or none: honouring the half that still resolve would draw a
selection neither person asked for, under the sender's link, with a count that
looks authoritative. A selection that is valid but empty in this corpus falls
back too — an empty sky is an honest answer to a *click*, because you watched
it empty and can undo it, and a dead end when it arrives from a link.
`#/passage` still falls to the wall instead, and correctly: half a route is
nothing, where half an atlas is the atlas.

**One selection had two cameras, and that is what an address exposed.** The
strip is 147 px of the top of the field and `skyFormTo` fits the camera to the
chrome at the moment it is called, so retracting the strip *after* applying a
selection fitted the frame with the index in it and then removed the index —
the door landed at k=1418 where its own fit is k=1795, the atlas drawn 1.27×
outside itself on the view whose whole job is to be fitted to the part you can
see. The filter panel did not retract the strip at all, so the same selection
had two chromes. The strip is now open **iff the atlas is whole**, at every
control, and it moves *before* the flight is fitted. Camera moves also land on
their target rather than on `exp(log(target))`: one ULP, invisible on screen,
and the difference between two routes to one picture agreeing and not.

**One token is not the same question as "is this baked", which is the case a
flag in the URL would get wrong.** `#/sky/country:Q28` is Hungary, sixteen
films, under the twenty-film bake floor — a single-value address that is
nevertheless solved live, and it prints `SOLVED HERE` because the sentence is
keyed to how the picture was made rather than to how many words are in the
link.

**The caveat and the fallback are spoken as well as printed.** `#sr-status`
had been announcing "the whole atlas, re-formed" over a stale link, which is
true and is not the news; and announcing a live-solved intersection with no
mention that it was solved here, which made the announcement the one surface
in the app that overstated. Both now carry it.

Verified in real Chromium (`.claude/skills/run-film-atlas/address-probe.mjs`):
compose by clicking, read the address, cold-load it in a fresh page, and
membership, every position and the camera compare identical for a register, a
recorded stratum and a live-solved intersection alike; every restored sky was
measured for ink. Ten corrupted addresses all land on the whole atlas with
the notice shown. Also at 900×820 and 390×780, under `prefers-reduced-motion`,
and across hash-to-hash moves inside one session.

**Every guarantee was broken on purpose and confirmed to report it** (negative
controls built by patching the artifact, the way the meteor probe's are):
all-or-none dropped → a half-valid link restored a selection nobody sent; the
empty-selection fallback removed → a valid-but-empty address opened an empty
sky; the caveat never printed → the intersection lost it; the caveat always
printed → both baked cases carried one that is not true; `.sort()` deleted →
two genres clicked in two orders gave two different links; the route-clear
writing a bare `#/sky` again → a world's address lost while the world was on
screen; `#/sky` no longer clearing → 194 films on screen under a link
promising 2,204; the camera landing at `exp(log(fit))` → camera differs on
both baked cases; the click paths retracting the strip after the fit → camera
differs on both baked cases; the whole branch removed from `fromHash` → every
address lands on the wall; and, on a deliberately unplaceable layout, the
`sky.ready` guard removed → an uncaught `Cannot read properties of null`
during load.

**Two controls did not fire, and both were the check's fault rather than the
code's.** Reverting only `skyRestoreSelection`'s chrome-then-camera order left
the camera correct, because `skyWorldsOpen`'s arrival re-fit corrects it
independently — the restore path is protected twice and one edit cannot defeat
it, the same structure as the meteor's off-view guard, and the control that
does isolate it is the one on the click paths, which have no second mechanism.
Deleting `.sort()` also passed at first: the check compared a genre against an
era, and `skySelected()` already walks the facets in a fixed order, so it was
testing an ordering nothing could disturb. Two values in **one** facet is the
only case that can fail, because a facet's selection is an insertion-ordered
Set. A third control crashed the probe instead of failing it — the snapshot
reached into `sky.wy` and a page that lands on the wall has none — which is
its own lesson: a check that throws cannot tell you which of the two things
broke.

## The transport — the century, and a way to run it — settled 2026-08-10

The atlas was already a century laid out left to right and it had never been
played. `app/layout-sky.js` is handed films and edges and **nothing else** — no
years, no degree, no ranking — and the constellation still comes out sorted by
time, west to east, because influence runs forward and the springs mostly point
that way. Nobody designed that. It is the corpus confessing through the physics,
and it was the one thing this view knew and could not say.

> **A footage track under the field, a playhead, and a run. The resting
> constellation is the last frame of a reel that has already run.**

The full argument, the three architectures this beat and the costs measured for
each, are in `docs/specs/visual-architecture-decision.md`. What follows is what
shipped and what it is held to.

### It reads the year as a low-frequency aggregate, and never as a coordinate

This is the rule the whole design turns on. Measured at HEAD by
`pipeline/measure-layout.js`, which now reports it in the layout gate:

| | |
|---|---|
| corr(year, x) | **+0.448** |
| best axis, swept over rotation | **−0.474 at 161°** |
| five-year centroid: net drift / path length | **0.382** / 1.797 world units, in a box 1.0 wide |
| mean \|Δyear\| to a nearest neighbour, as a share of a shuffled control | **0.845** (1.000 = no local signal) |

The first three say the century really does cross the plate. The fourth says
your nearest neighbour is on average 22.5 years away from you against 27.1 for a
shuffle, and reading a year off one film's x has an RMSE of **20.9 years**
against a corpus SD of 23.4 — r² = 0.201.

> **Nothing in this view may ever print or imply a year from a position.**

So the light of a year is a broad wash at the centroid of the films actually
striking, and it is never a front, never a contour and never a focus plane. An
architecture that turned the year into a per-film geometric coordinate was
built, measured and rejected for standing *Un Chien Andalou* (1928) on ground
reading 1996. `measure-layout.js --selftest` now carries three controls for
these numbers, because the correlation fell from +0.612 to +0.448 across one
solver retune and nothing noticed for three weeks.

### The five typed relationships become five tenses, and the corpus decides which

An edge appears when its **later** endpoint exists — the moment the connection
becomes *makeable* — and it is drawn as a line **travelling**, in the direction
its own type was recorded to run. Using the earlier endpoint was tried in the
prototype and kills the last third of the run: 26% of this corpus's lineage
arrives after 2003.

`edge.from` has **three** values and one of them is `"none"`:

| type | edges | carry a recorded direction | of those, run forward |
|---|---|---|---|
| `descent` | 315 | **233** | **94.0%** |
| `rebuttal` | 110 | **110** | 11.8% — i.e. **88.2% reach back** |
| `convergence` | 7,584 | 22 | — |
| `rhyme` | 2,178 | 9 | — |
| `hand` | 12,030 | 0 | — |

**The prototype's headline 80.6% was that third value being swallowed.** It read
`from === "a" ? a : b`, which turns every `"none"` into `"b"` and invents an
ancestor for 82 of the 315 descents. A descent whose ancestor the corpus does
not record is drawn symmetrically here, like everything else, and left out of
the percentage — and the readout prints the denominator so the claim can be
checked rather than believed. The three symmetric types are symmetric because
the corpus records a direction for **31 of their 21,792 edges**. That is a
better reason than a coin flip and it is the reason the key gives.

### What it is not allowed to do

- **Rule 1.** The premiere flare is `skyTpStrike(age)` — a function of age and
  of nothing else. At any cursor the corpus takes only five or six distinct
  ages, so "a function of age alone" has an exact test rather than a statistical
  one: `transport-probe.mjs` records every sprite blit and requires **one alpha
  and one size per age group**, measured across degrees 1–34. Edge width is a
  property of the **type** — 2px directed, 1.15px symmetric, identical for every
  edge of that type.
- **Rule 3.** A sub-0.5 claim is dashed at every cursor position. Checked by
  instrumenting the 2D context, counting stroked segments by the dash state they
  were laid down under, and comparing with what the page's own data says must be
  dashed. Eleven cursors, 11/11.
- **Rule 4.** The readout is DOM type on its own opaque ground; the canvas never
  touches a glyph, so nothing can blur however fast the reel runs.
- **Rule 5.** The disc keeps the film's own measured highlight. The year's
  colour lights the **room** and never a disc — see the tier below.
- **Rule 7.** Both time constants are measured in **years, never seconds**, so
  the picture at 1968.0 is the same picture whether you ran there at speed,
  dragged there by hand or arrived by keyboard, on every machine.

### The year's light prints its own tier, and it is ◐ amplified

Computed at build time with `build-registers.js`'s own instruments, over the
1,982 poster-measured films only — a film whose palette came from an era default
cannot be evidence about its era:

- the best-separating decade sits **4.99 null SD** off the corpus mean;
- the decade explains **2.1%** of an individual film's own colour.

So the **direction is measured and the intensity is authored** (chroma ×3.6, hue
never rotated), which is `amplified` word for word. The prototype printed
`● RECORDED`, and that is an overclaim by one tier: `recorded` is reserved for a
fact about the print itself, the way the silver print's films *are* monochrome
on the record. A wash over a population **is** a mean; a disc is one film. That
is the whole reason the light may touch the room and may never touch a disc, and
the readout says it in those words every time it is on screen.

### The one graft, and it is a sentence rather than a picture

A film's own year minus the **mean** year of its graph neighbours, baked one
float per film. Negative means its company arrived after it. *Snow White*
scores −38.3 over 20 connections, *The Other Side of the Wind* +52.5 over 22 —
a 1970s film released in 2018 whose lineage knows it. A mean and not a degree
weighting, so a film with forty neighbours and one with four are read the same
way; floored at three neighbours, which excludes 4 films of 2,204, and `n` is
printed beside it. Both years are marked on the track and the gap between the
two marks is the reading.

### Cost — the property that decided whether it ships

The bar is the night sky's: *not more expensive than the view it replaces.*
Measured by `transport-probe.mjs` in real Chromium at 1440×900, rAF-paced, with
the untreated control re-measured in the same page, twice, round the treatments:

| | ms/frame | vs control |
|---|---|---|
| control, transport switched off | 1.11–1.24 mean · 1.05–1.20 p50 | 1.00× |
| **at rest** | **1.19–1.31 mean · 1.20 p50** | **0.98–1.14×** |
| grazing a year | 1.75–2.14 mean · 1.70–1.90 p50 | 1.55–1.86× |
| **running the century** (150 frames) | **1.00–1.12 mean · 1.5–2.1 p95** | **0.81–0.94×** |

Ranges over five runs, because this is a 1.1 ms measurement in a container that
is also rasterising in software: quoting one run's third digit here would be
inventing precision. The ratios hold their shape across all of them.

Idle draws in 3 s: **0 at rest, 0 while a year is held lit, 0 after the reel has
run.** Running costs *less* per frame than sitting still, because most of the
reel has fewer films in it.

**The resting claim is exact rather than statistical.** `skyTpFrame()` returns
null the moment the cursor is parked at the end with nothing grazed, so the
resting draw is the draw that shipped — and the probe proves it by capturing the
canvas, switching the transport off in the page, capturing again, and comparing
**byte for byte**. 495 KB of PNG, identical.

The graze is the one state that costs more than the control, and it is the same
bill the worlds strip's own preview already pays for the identical gesture
(2.92 against a 1.91 control, 1.53×, and blessed above). It is paid only while a
pointer is on the track, one repaint per move.

`driver.mjs film transport` runs the reel under the screencast: **161 presented
frames over 6,945 ms, peak share 8.8%, half the motion spread over 40 frames,
centroid at 53.2% of nominal, 0 identical frames, worst single draw 9.1 ms,
worst paint-to-paint 88 ms, 0 frames after the window.** Forcing the cursor to 1
reports a snap on four readings; a 340 ms busy-wait mid-run is caught by the gap
check alone and draws a hole in the profile.

### What it costs the resting picture, stated rather than buried

The track is **opaque standing chrome**, so it is seeded into `skyChrome()` and
the camera fits above it — "fit means the part you can see" does not stop
applying because the chrome is new. That is real band:

| | safe band before | after | the track |
|---|---|---|---|
| 1440×900 | 501.6 px | **426.6 px** | 75 px |
| 900×820 | 438.3 px | **346.6 px** | 75 px |
| 390×780 | 299.2 px | **237.2 px** | 62 px |

Resting ink at 1440×900 goes **13.14% → 9.58%**, measured by `driver.mjs smoke`
on both builds. (900×820 loses 92 px rather than 75 because the readout rewraps
at that width; the track itself is the same 75 px.)

75 px on a desktop and 62 px on a phone. It is less than the worlds strip's 147
px and it is the same kind of bargain: the strip gave the constellation a job,
this gives it a century. The number is here so the next person can decide it was
worth it rather than discover it.

**The phone needed two more answers, and one of them was a bug this exposed.**

1. **The readout is capped on a phone.** DESIGN's own rule already said the
   readout gives up the field before the constellation does; until now it gave
   up nothing. With a film in hand at 390×780 the box measured 265–304 px of a
   659 px field, leaving the camera's safe band at 133 px — thirteen under
   `skySafeBand`'s 140 px floor is a **collapse**, and a collapsed band is one
   that no longer corrects for chrome at all. 62 px of transport pushed it over.
   `.sky-readbox:not(.route)` is now capped at `min(30vh, 204px)` and scrolls; a
   Passage is exempt, because there the claims *are* the content.
2. **Every camera move onto a single film now centres on the visible band.**
   `skyFitCam` has always applied that correction for the whole atlas;
   `skyOrbit`, `skyFocus` and `skyStep` centred on the middle of the **canvas**,
   which is a different point whenever the chrome is asymmetrical — and it has
   never been symmetrical. It only became visible when the band collapsed:
   anchoring a film parked it 45 px inside the readout, and the third tap of the
   anchor-then-open gesture landed on `#sky-read` instead of on the film.
   `elementFromPoint`, not a screenshot. One rule, `skyCentreOn`, every caller.

### What it does not solve

- **It stands only while the atlas is whole**, on the same condition the worlds
  strip uses. A re-formed sky is a different set of films in different places;
  *"play folk horror"* — ten films over twenty-two years — is a real question
  with no answer here, and re-forming mid-run is undefined. Retracting says so;
  composing the two badly would not.
- **The resting picture is still an even disc.** Open question 2 stays open. The
  transport reframes it — the playhead is parked at 2026 *because the reel has
  run*, which is a terminal state a reader can have an attitude about — and it
  gives the resting atlas weather on demand at zero idle cost. It does not put
  structure into the pixels.
- **There is no `#/sky/year:1968` address.** The transport is a state that lasts
  until the next click, which is exactly the second grammar open question 0 says
  is missing, and the address machinery carries nine negative controls that a
  new token class would have to be re-proved against. Not built; worth saying
  out loud.
- **The reel is lumpy and that is the corpus.** 1916–1940 is 99 films and the
  1960s alone are 374, so a linear run spends its first seconds on almost
  nothing. The census printed under the rail is that rhythm drawn flat rather
  than smoothed away. Whether the reel should run in *film time* or *wall time*
  is unresolved and is a design question.

## The print in the gate — Latent Image, settled 2026-08

ATLAS is one photographic print of the whole of cinema, held in a projector
gate with a single lamp behind it.

**The negative is the corpus and it is identical for everyone.** 2,204 films,
positions solved from bond strength at build time, each holding the tonal value
measured from its own photography — complete before anyone arrives and complete
for a reader who never marks a thing. What the beam passes through is **dye**,
and the dye is the only thing on the plate that is anybody's.

> **A film you have not marked is silver: exact size, exact place, exact
> lightness, missing only its colour.**

So the apparatus is what the atlas IS, and the dye is whose it is. Both were
already here — the corpus's own measured highlights, and a layout the solver
had already normalised — and neither is a layer over the other.

### develop() moves one quantity, and it is chroma

`develop(hex, t)` converts a film's measured highlight to OKLab, scales `a` and
`b` by `t`, and converts back. `L` is untouched. Measured on the shipped
corpus, asked of the running page rather than of a copy of the maths:

| | |
|---|---|
| `develop(hex, 1)` reproduces the film's own hex | **0 of 2,204 differ** |
| OKLab `L` after the round trip at `t = 0` | within **0.00167** at worst; that residue is the 8-bit sRGB encode |
| developed chroma, median | 0.1355 |
| films whose developed colour is below chroma 0.05 | **44**, every one of them from the 222 with a curated or era-default palette; **0 of 1,982 poster-measured films** |

`t` is read from `state.seen` / `state.loved` and from nothing else. It is not
a function of degree, of strength, of year, or of any neighbour.

> **Development does not propagate. You do not half-know *Sansho the Bailiff*
> because you have seen *Ugetsu*.**

### The integration pass — where the colour nobody measured lives

DESIGN measured per-film hue at field scale at **0.979x a shuffle** and
concluded, correctly, that 2,204 measured highlights side by side carry no
spatial information. That conclusion is about *per-film* colour. A projector
integrates: every film throws light into the emulsion around it, and the
integral of noise is not noise. One 16px sprite per emission colour, blitted
additively into a buffer at **0.24 of the device raster**, beneath everything
the graph draws.

**The kernel is measured in film gaps, not in pixels.** 2.9 gaps of diameter is
6.6 gap-areas, which at the solver's own `0.669/√N` spacing is about 25 films —
the same 25 at every viewport and every zoom. It was 22 CSS px flat first,
which is right on a desktop (the median gap at the fit zoom is 6.6px there) and
wrong on a phone, where it covered 31 gaps over a disc half the radius: the
measured result was a washed-out silver ball, **23.4% ink at 390×780 against
13.6% at 1440×900**. In gaps, both viewports draw the same print.

### The one invariant this whole object stands on

> **A latent film's halo carries identical luminance to a developed one and
> differs only in chroma.**

The emission colour is a straight line between the film's own grey-at-its-own-
luma and the film's own colour:

    C(t) = (1−t)·(Y,Y,Y) + t·(R,G,B),   Y = 0.2126R + 0.7152G + 0.0722B

Rec.709 luma is a **linear functional** of the channel triple and canvas
compositing is additive in exactly those channels, so `luma(C(t)) = Y` for
every `t`, exactly, with no appeal to anybody's colour science. Both endpoints
are in gamut and so is every point between them. Measured drift: **0.5 of 255**,
one rounding step, and that is the whole residue.

That is what makes marking a film unable to add one photon to the atlas.

### The composite floor, and the number it is guarding

The integration buffer composites **strictly beneath** the discs, and the disc
loop reads `sky.tone[]` and nothing else. The kernel covers ~25 films and the
corpus's mean degree is 20.16 — the same number — so a pool that was allowed to
tint the latent discs standing inside it would colour about a thousand film
positions from forty marks. That is the 21x neighbour overclaim arriving
through the compositor instead of through a spread rule.

`print-probe.mjs` samples **every latent film's composited pixel** and requires
OKLab chroma ≤ 0.02:

| marks | latent | developed | latent p99 chroma | developed median | ink | mean luma | luma at the films |
|---|---|---|---|---|---|---|---|
| 0 | 2,204 | 0 | 0.0067 | — | 13.206% | 20.927 | 154.304 |
| 40, canon-first | 2,164 | 40 | 0.0067 | 0.1137 | 13.206% | 20.925 | 154.152 |
| 300, canon-first | 1,904 | 300 | 0.0067 | 0.1267 | 13.206% | 20.887 | 152.813 |
| 300, random | 1,904 | 300 | 0.0071 | 0.1288 | 13.206% | 20.885 | 152.780 |
| 2,204 | 0 | 2,204 | — | — | 13.206% | 20.633 | 143.063 |

**Inked pixels move 0.000% from zero marks to 2,204.** The light at the films
moves **−7.3%**, downward, and that is arithmetic rather than a concession:
OKLab `L` is exactly preserved, and OKLab `L` and Rec.709 luma disagree about a
chromatic colour — a colour is the darker of the two at equal perceptual
lightness. The ceiling on that reading is therefore **one-sided**: a mark may
not add light; getting darker is what a dye does.

### No denominator. Anywhere. Ever.

No counter, no percentage, no "n of 2,204", no total, no remaining, no streak,
no `seenAt` rendered as a timeline. The existing "For you *n*" header is the
pattern not to extend.

A sentence *was* written into the resting readout — shown only once at least
one film was marked — explaining that marked films hold their own colour and
the rest stay silver. **It changed the height of the readout**, `skyChrome()`
seeds the readout into the camera's safe band, and the arrival fit came back
smaller: measured, ink fell **13.578% → 10.779%** at 1440×900 and **23.414% →
13.859%** at 390×780 between zero marks and forty. *The atlas got smaller
because the reader had watched forty films.* That is the same defect as a mark
adding light, arriving through a paragraph instead of a pixel, and it is why
"nothing is dimmed, removed, resized or moved" has to be checked rather than
asserted. The explanation lives on the **film** readout instead, which is about
one film and appears the same way whatever the reader has marked.

### The gate

Four physical objects, none of which knows anything about any film, all of them
static CSS at **zero repaints**:

- **The lamp**, behind the print, pinned to the FRAME. Distinct from
  `.sky-field::before`, which is the film in hand lighting the room and is
  pinned to that film. The anchor is what tells you which light is which.
- **The gate edge**: a **1.37 Academy** aperture inscribed in the band the
  camera already fits to (clamped to [0.82, 1.37] and fitted to the band), hard
  crop outside, soft falloff inside. It replaces the old full-bleed radial
  vignette — a gate has a *shape*, and the shape is a rectangle.
- **The grain**, a 96px tile seeded once from a fixed PRNG, tiled in frame
  space, under the label layer (AGENTS rule 4).

**The aperture moves no film and changes no camera.** By construction
`min(gate.w, gate.h) === min(canvas.w, band.h)`, which is the quantity
`skyFitK()` already uses. Verified at three viewports to **0.000px**.

#### The gate is keyed to the chrome MEASUREMENT — settled 2026-08-09

That "verified to 0.000px" was true of `skyGate()` and false of the picture,
for a day. The perf guard added with the query sky read
`if (!sky.chrome || !sky.gate) skyGateApply()`, and **`sky.chrome` does not go
cold where you would think**: `skyPlaceLabels`, `skyFitCam` and `skyClampK` all
call `skyChrome()` themselves, so an invalidation raised between two frames was
routinely consumed by one of them before the next `skyDraw` — the cache came
back warm and correct and the gate stayed stale. Measured on the live page
(`sky.gate`, not `skyGate()`), a cold `#/sky` drew **1004×733 at y=0** against a
correct **687×502 at y=153**: 317px out at 1440×900, 294 at 900×820, 176 at
390×780, and the same on a cold `#/sky/world:*`. The atlas filled **45%** of its
aperture's width instead of **66%** — the whole-atlas view read as a dot in a
black room, which nobody had chosen.

The fix is two counters. `skyChromeV` increments every time the chrome is
actually measured; `skyGateV` records which measurement `sky.gate` came from;
`skyDraw` compares them — one integer compare per frame, no layout read, so the
0.18ms/frame cost that motivated the guard is still not paid. And
`skyChrome()` applies the gate itself on the frame it measures, because a view
can be re-measured and then never painted again (a cold world address retracts
the strip after its last draw).

One consequence, deliberate: with the Passage readout now correctly measured
(it never invalidated `sky.chrome` before, so the band was computed from a
readout five times shorter than the one on screen), the leftover band during a
route falls under `skySafeBand`'s 140px floor and the aperture opens to the
whole canvas. That is the existing fallback doing its job and it is the kind
outcome — the alternative is a 396×289 aperture inscribed in the sliver beside
the panel, with the gate's crop shadow lying across the route, because nothing
re-fits the camera for a Passage. **The gate closes down to what the chrome
leaves until there is nothing to leave, and then it stops pretending.**

**Verified by asking the page, and by re-breaking it.** `.judge/gate-probe.mjs`
walks eight routes into the sky × three viewports and compares `sky.gate` and
the four `--ap-*` custom properties against a fresh `skyGate()` on the same
page: 24/24 within **0.0px**. Restoring the old guard in the built artifact puts
9 of those 24 back over the line at exactly the drifts above. *A gate check that
calls `skyGate()` is a check that the function is deterministic. It is not a
check that the aperture is on screen.*

### Marking, and the develop

`markFilm()` is the one route in, because there are now four ways: the panel's
two buttons, and **`s` / `l` on the focused film in all three views**. Until
this the entire feature was fed by two buttons that exist only inside a panel
that opens on the *second* gesture of the map view, with no keyboard path and
no way to mark from the wall or the constellation at all.

The develop is **1,600ms**, `--ease-develop` `cubic-bezier(.48,.02,.26,1)`,
with **140ms of induction at the head where nothing happens** — a print does
not switch on. Chroma is the only animating quantity. Only the ~22px kernel
around the developing film is re-integrated (a dirty rect), never the frame.
Un-marking arrives rather than reversing: it is a correction, not a gesture.

Under `prefers-reduced-motion` it is **retained at `--t-mid` with the induction
dropped**. Narrow, argued exception: it contains no translation, no scale and
no parallax, and the setting protects against vestibular motion. Anything
future that MOVES is dropped entirely rather than shortened.

**The seen ring is gone**, and its absence is the feature: a seen film is
already holding its own colour where every latent film holds silver, so a ring
was the same fact drawn twice — and it was an unbounded O(|seen|) second pass
per frame. `ringed()`'s refill also ran at `globalAlpha` **1** while every other
disc ran at 0.82, so a marked film was literally the brightest thing on the
plate and ignored the preview dim; it now takes the same alpha the disc pass
gives that film. **Loved keeps its gold ring**: development is a property of the
image, love is a chinagraph mark on the print.

The wall and the map sign the same way — `.tile.developed::after` and
`.node.developed .frame::after`, the rule the tile already draws on hover, in
that film's own measured highlight, standing at rest. The 6px gold dot is gone
from *seen* and survives for *loved* only. **A wall with nothing marked is
pixel-identical to the wall that shipped.**

`@keyframes resolve` lost its `saturate(.35)`. Desaturation is now the
vocabulary of *undeveloped* everywhere else in this application, so an arriving
poster fading up out of grey was saying, in the project's own new grammar, "you
have not seen this" about a film the reader had just opened.

### What is NOT claimed

- **No regional-weather sentence ships.** The integral genuinely carries colour
  a single highlight does not, but at a few hundred marks that statistic is
  about the reader's subset and not about cinema. The sentence is gated on a
  Moran's I of the *integrated field* clearing degree's own 0.115 control, and
  that has not been measured.
- **Inside a chosen world the integration pass is off.** DESIGN rules that at
  field scale colour carries the stratum, and two chroma channels cannot own one
  disc. The discs stay the world's; the plate is yours everywhere else, which is
  the state the atlas rests and arrives in.

### AGENTS rule 1, measured on the most adversarial history there is

The seen sets in the gate are the **degree-sorted head of the corpus** — a
history that *is* the degree order, which is both the realistic canon-heavy case
and the worst case for this rule. Local composited brightness against
whole-corpus degree, on a latent field:

| | r |
|---|---|
| 2,204 films, nothing developed | **−0.009** |
| the 40 highest-degree films developed | **−0.040** |
| the 300 highest-degree films developed | **−0.051** |

Ceiling 0.20. And the reason nothing here *can* become a popularity gradient is
a property of this corpus, verified rather than inherited: **2,204 films, 22,217
edges, median degree 20, mean 20.161, 55.4% at exactly 20, 82.0% in 20–22, 8.2%
below 19, max 41 on one film, CV 0.146.** The distribution is near-regular;
there is no hub structure to amplify. We propagate through nothing anyway.

### Six negative controls, and two of them caught the checks rather than the code

`print-probe.mjs --controls` patches the real artifact and requires each patch
to be reported by the gate it defeats.

| break | reported |
|---|---|
| development spreads one hop through the graph | latent p99 chroma **0.106** against a floor of 0.02, at 40 marks |
| `develop()` scales L as well as a and b | L moved 0.274; light at the films **+46.4%** |
| the halo carries full chroma whether or not developed | **2,202 latent halos carry a hue** |
| the store validates with `F[k]` instead of `hasOwnProperty` | **0 tiles laid out**, 3 prototype keys in `state.seen`, 1 console error |
| the develop snaps | painted **1 frame** |
| a marked film glows | light at the films **+22.4%** |

**Two controls passed at first, and both were the check's fault.** A halo that
ignored `t` altogether was trivially luma-invariant — and was also the whole
plate showing everybody's colour before a single mark; the gate now asks
separately that a latent halo be *grey*. And a build that multiplied a marked
disc's alpha by 1.22 passed everything, because 0.82 × 1.22 clamps to 1 and a
disc at alpha 1 *replaces* the halation behind it: the "brighter" build measured
1.1 points **darker** at the films. A control has to be checked for doing what
its name says, exactly like the checks it is testing. The replacement draws an
additive glow on marked films and is caught at +22.4%.

A seventh control is kept deliberately **expecting to pass**: blitting the
buffer a second time *over* the discs. Measured, the ordering alone is worth
p99 chroma **0.0174** — under the floor. That is a finding, not a pass. The
floor is guarding against dye reaching a neighbour, which is the first control;
the ordering is worth about a third of it, and keeping this control is what
stops that sentence being a guess.

### The store keys on filmId

A corpus key is a slug and slugs mutate between releases: `earth` once meant a
1930 Macedonian short. Against the frozen 803-film cohort, 802 of 803 keys
resolve and exactly one is **silently retargeted** — a reader's record of one
film quietly becomes a record of a different one. `filmId` is present and
distinct on 2,204 of 2,204 and `discovery.json`'s `keyByFilmId` agrees on all
2,204. A v1 store is read as slugs, migrated, and **anything that no longer
resolves is counted in `prefLoss`** rather than swallowed.

`persistPreferences()` now writes five keys — `v`, `seen`, `loved`, `filter`,
`skyFolded`. It does not merge, it replaces: **a field that is read and not
written here is destroyed by the first toggle of any other preference.**

### Cost

The develop is the only continuous thing this feature adds, and it is bounded to
one film, to 1,600ms, and to the constellation actually being on screen.
Measured in this container: **0 repaints in 5s at rest with 40 films developed**,
25 frames over the develop, **0 more in the 1.5s after it landed**.

`film develop` is a new scene and it needed a new channel. Luma is the right
measure for a field sliding or a streak crossing; it is the **wrong** measure
for a develop, and that is not a defect in either — a develop moves chroma at
constant luminance by construction, so a luma delta of exactly 0.00 across the
whole gesture is the invariant being confirmed rather than the motion being
missed. The first version of the scene reported delta 0.00 on every frame and
then failed on four "pixel-identical" frames that were all painted and all
different. `channel: "chroma"` differences |R−G| + |G−B| instead. Its
identical-frame check is opted out **for that scene only**, with the reason
written down: the gesture opens with 140ms in which nothing changes on purpose,
and a JPEG screencast subsamples and quantises chroma. The curve itself is
gated on the app's own clock in `print-probe.mjs`.

## Deliberately avoided

The generic AI-design tells: interchangeable rounded cards, purple-blue
gradients, glass panels, glow without a light source, particles, oversized
headings substituting for composition. Zero border radius throughout — this
world is made of film and paper, not plastic.

## Open questions

0. ~~**A re-formed atlas has no address.**~~ **Answered — see "The address"
   above.** What survives of it: a passage composed *inside* a re-formed sky
   still serialises as `#/passage/a/b`, which is a route through the whole
   atlas. Choosing a selection clears the route, so the pair only exists in one
   direction, and the fix is a second grammar for a state that lasts until the
   next click. Not worth it yet; worth saying out loud.
1. ~~**The constellation still has no job.**~~ **Answered by the worlds — see
   "The worlds" above.** What survives of it: the strip is an index of 28 doors
   and 43% of the corpus is behind none of them. That is stated on screen but
   not solved, and the honest fix is more themes, not more rules — a rule
   invented to catch the remainder would be a rule fitted to a gap rather than
   to cinema.
2. **The field is an even disc because the corpus is.** 84% of edges are
   convergence + hand, so no tradition separates from any other at low zoom.
   That is the material, not the layout; the layout can only choose whether to
   impose an axis on it. `descent` is the one honest axis available, and the
   figure this entry used to quote — 91% forward of 199 — is two corpora out of
   date and was counting edges whose direction the corpus does not record. It is
   **94.0% forward of the 233 descents that carry a recorded `from`**, of 315;
   see "The transport" above for why the other 82 are not counted. **The registers give the disc regions
   without imposing an axis on it** — grazing the strip shows that folk horror
   is a corner and family drama is weather across the whole plate — but only
   while a frame is being grazed. At rest the disc is still even.
   **The transport gives the resting disc a REASON rather than a texture —
   see "The transport" above.** The playhead is parked at 2026 because the reel
   has run, so the picture is the last frame of something rather than an
   undifferentiated blob, and grazing the track lights any year where it
   already is at zero idle cost. The pixels at rest are unchanged, byte for
   byte. That is a smaller claim than putting structure into them and it is the
   one that is true; this question stays open, and the honest options for it are
   still a different layout or a different corpus, not a treatment.

3a. **The strip's ground is your plate, and the frames are still the register's.**
   `skyMiniGroundCanvas` draws the whole atlas underneath every one of the 28
   frames, so developing it develops all 28 for the cost of one pass — silver
   where you have not watched, the film's own dye where you have — and a mark
   rebuilds it once, on the gesture, never on a clock. Same alpha and the same
   one pixel either way: a mark may not make a dot brighter or bigger anywhere
   in this application, and a 66px thumbnail is exactly where that would be
   easiest to break quietly. What is NOT built is the spec's frame 0, "your
   whole plate" as a door of its own, and the reason is the channel collision
   this file already rules on — the register owns a frame's chroma, and a
   second chroma channel in 66px is the thing the cut list forbids.

3. **Residual geometry, and it now has a second victim.** Across 44 worst-case
   seeds (longest titles + highest degree) at eight viewports: 7 of 704 renders
   still place a caption on a neighbouring poster, all of them at 1024×660 — a
   516px stage, shorter than a phone's — with 40-plus-character titles.
   Everything else is clean.

   **Re-measured 2026-08 as overlapping PAIRS over the 22 longest titles:** 0 at
   1440×900, 1 at 900×820, **16 at 1024×660**, 0 at 390×780. That 1024×660
   number is now a budget other things have to fit inside: the centre's
   `why it connects` cue was gated on measured room precisely because printing
   it unconditionally took it to 33. Anything else that wants a line of type in
   a caption faces the same bill, and the honest fix is still the one this entry
   has always implied — the ellipse cannot separate seven boxes on a 516px
   stage, so that stage needs a different arrangement, not a smaller font.
4. ~~**A world has no address either.**~~ **Answered — `#/sky/world:gothic`,
   see "The address" above.** It promises a byte-identical picture and carries
   no caveat, because a register is a baked stratum.
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
