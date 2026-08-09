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

| Token         | Hex       | On `--base` | Role                                        |
|---------------|-----------|-------------|---------------------------------------------|
| `--base`      | `#08070A` | —           | Ground. Warm film base, never pure black.    |
| `--lift`      | `#100E13` | —           | Raised surfaces, inputs, tiles.              |
| `--panel`     | `#15121A` | —           | Detail panel ground.                         |
| `--hair`      | `#221E28` | —           | Borders. Never text.                         |
| `--ink`       | `#F0EAE0` | 16.8:1      | Primary text, warm off-white.                |
| `--dim`       | `#A89E95` | 7.6:1       | Secondary prose, button labels.              |
| `--faint`     | `#877D75` | 5.0:1       | Slate metadata. **The floor, not a mood.**   |
| `--accent`    | `#E8C87A` | 12.4:1      | The only interactive accent; also `--nc` default. |
| `--accent-dim`| `#8A7440` | 4.5:1       | Focus and hover borders.                     |

Edge colours are keyed to type (AGENTS rule 2) and double as the 8.5px label
set in them, so every one clears 4.5:1 on `--base`:

| Type          | Hex       | Ratio  |
|---------------|-----------|--------|
| `descent`     | `#C9873F` | 6.72:1 |
| `rebuttal`    | `#C8544A` | 4.61:1 |
| `convergence` | `#4E8C7A` | 5.13:1 |
| `rhyme`       | `#8A6FA8` | 4.71:1 |
| `hand`        | `#867C6C` | 4.89:1 |

**Contrast is a correctness property here, not a preference — settled 2026-08.**
`--faint` was `#5C5550`, 2.53:1 on `--base`: below the WCAG AA text floor of
4.5 and below even the 3:1 large-text floor, at 8.5–9.5px, and it carried
almost every piece of metadata in the app — the year under every poster, the
panel's director line, the relationship under every claim, the era chips at
rest. `rebuttal` was 3.77:1 and `hand` 4.38:1 as label text. Quiet is a ratio,
a size and a tracking decision; it is not a licence to go under the floor.
**Any new colour that carries type must be measured against `--base` AND
`--panel` before it ships.** Nothing here is allowed below 4.5:1 for text.

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
1. **The constellation still has no job.** It is legible, it is honest and it
   is beautiful, and at the fit zoom it says nothing the wall does not say
   better — it duplicates "start anywhere" while showing less. Everything it
   knows becomes visible only once a film is in hand. Arrival is the state
   that needs an answer.
2. **The field is an even disc because the corpus is.** 84% of edges are
   convergence + hand, so no tradition separates from any other at low zoom.
   That is the material, not the layout; the layout can only choose whether to
   impose an axis on it. `descent` is 91% forward in time (181 of 199), which
   is the one honest axis available.
3. **Residual geometry.** Across 44 worst-case seeds (longest titles + highest
   degree) at eight viewports: 7 of 704 renders still place a caption on a
   neighbouring poster, all of them at 1024×660 — a 516px stage, shorter than
   a phone's — with 40-plus-character titles. Everything else is clean.
