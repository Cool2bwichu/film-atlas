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

**The key lives in the readout.** Five colours were being painted and nothing
said what they were; the resting readout was answering "what am I looking at"
with mouse instructions. It now carries the five relationship names and the
dashed swatch for `reading, not record`, and is replaced by the film's own
details the moment one is in hand.

## Deliberately avoided

The generic AI-design tells: interchangeable rounded cards, purple-blue
gradients, glass panels, glow without a light source, particles, oversized
headings substituting for composition. Zero border radius throughout — this
world is made of film and paper, not plastic.

## Open questions

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
