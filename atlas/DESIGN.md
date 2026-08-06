# DESIGN.md — creative direction

## The thesis

The interface is a **lens**, not a diagram. Every interaction decision follows
from that. Navigation is a focus pull. Nodes are film cells, not cards. Depth
in the graph is depth of field.

The subject is cinema, so the vernacular is the darkroom and the cutting room:
safelight amber, film-base black, perforated strips, screen-printed one-sheets,
slate lettering for metadata.

## Palette

Anchored to *In the Mood for Love* — tungsten and oxblood, deliberately warm
rather than the neutral near-black that dark interfaces default to.

| Token       | Hex       | Role                                              |
|-------------|-----------|---------------------------------------------------|
| `base`      | `#0D0B0A` | Ground. Warm film base, never pure black.          |
| `baseLift`  | `#17130F` | Perforations, raised surfaces.                     |
| `panel`     | `#1C1714` | Detail panel ground.                               |
| `safelight` | `#C87A3C` | **Only** interactive accent. Also `descent` edges. |
| `jade`      | `#4F6E62` | `rebuttal` edges — the cold counter-argument.      |
| `oxblood`   | `#7A2E2C` | `rhyme` edges.                                     |
| `ink`       | `#E8DFD3` | Primary text, warm off-white.                      |
| `muted`     | `#8A7D70` | Slate metadata.                                    |
| `hairline`  | `#2B231D` | Borders.                                           |

The interface deliberately has no accent colour of its own beyond safelight.
Colour on screen comes from the films — each cell is duotoned in its own
photography. The map glows in the colours of cinema.

## Typography

| Role     | Face          | Notes                                                |
|----------|---------------|------------------------------------------------------|
| Display  | Fraunces 300  | Optical serif. Film titles, claims, empty state.      |
| Utility  | IBM Plex Mono | Metadata, legend, labels. Uppercase, `.16em` tracked. |
| UI       | Inter         | Inputs and controls. Quiet by design.                 |

Fraunces at low weight and large optical size is the voice. Plex Mono is the
slate. They should never trade jobs.

## Motion grammar

Everything eases like a camera operator: `cubic-bezier(.22,.61,.36,1)`,
slow lead-in, weighted settle, **no spring or bounce**. Related objects share
one physical world.

- Position changes: 950ms
- Focus/blur transitions: 850ms
- Panel: 600ms
- Node reveal: staggered 85ms per node — the "sonar" wave, which turns API
  latency into the reveal rather than a spinner

Layout is precomputed (340 synchronous d3-force ticks), then animated via CSS
transitions. There is no per-frame React state churn. Keep it that way.

`prefers-reduced-motion` collapses all transitions to ~0ms.

## The signature

Rack focus. The focused cell is sharp; one hop out is slightly soft; two hops
is bokeh; the far map dissolves. It solves the hairball problem — only two
rings are ever legible — and it is the one memorable thing. Everything else
stays quiet in service of it.

## Deliberately avoided

The generic AI-design tells: interchangeable rounded cards, purple-blue
gradients, glass panels, glow without a light source, particles, oversized
headings substituting for composition. Zero border radius throughout — this
world is made of film and paper, not plastic.

## Known open aesthetic question

At seven nodes on a 1440px canvas the map reads sparse. Repulsion
(`forceManyBody(-820)`) is tuned for a map that has been extended once or
twice. Whether to tighten it or enlarge the cells is unresolved and should be
judged against real posters, not the harness's repeated test image.
