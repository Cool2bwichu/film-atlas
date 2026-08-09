# The remaining world processes — attrition, sweep, separate, kindle

Specified 2026-08-09, to the register DESIGN.md's night-sky and develop sections
set: measured costs, negative controls, reduced-motion paths, idle budgets.
`atlas/app/template.html` is owned by other agents at time of writing, so this
file plus the standalone prototype are the deliverable; every number below is
either **measured in the prototype** (`docs/specs/prototypes/attrition.html`,
probe alongside it) or explicitly marked a **budget** to be measured at
integration. Nothing here is an estimate wearing a measurement's clothes.

## What a process is

Six were named for the 28 worlds. Two exist: **project** — the night sky, cold
science fiction, the view admitting it has called itself a constellation all
along — and **develop** — the silver print, 194 films desaturated each to its
own measured grey because the record says monochrome. A process is the moment a
register stops being a colour key and becomes **apparatus**: the treatment layer
(`hue`/`glow`/`scale`/`edge`/`motion`) says what a world looks like; a process
says what the room IS while that world governs the picture.

The discipline is the skyNote's: **a process is spent on exactly one register,
and that is what makes it legible.** Given to two it is a skin.

### The laws every process obeys (the night sky's own, restated as law)

1. **One-shot on arrival.** The process's state is fully established by the end
   of the arrival flight. What an address restores is the arrival state — no
   process writes to the URL, ever ("the address names the SELECTION, never the
   picture").
2. **Zero idle repaints unless argued** — argued means: a stated event model,
   a stated per-event draw count, a stated share of the idle clock, and a
   measured draws-in-N-seconds figure with the tab-hidden and off-view
   controls at 0.
3. **Path from the frame, never the graph.** The process's step function reads
   frame geometry, a seed and a counter. It may read what the SELECTION already
   publishes as a set (count, centroid, extent — the room tint's own anchor);
   it may never read a film's position, identity, degree or edges. In the
   template this is lexical — the function has no `sky.wx`/`sky.at`/`ADJ` in
   scope, the same structural guarantee `skyMeteorStep` carries — and the probe
   backs it with a statistical gate.
4. **Rule 1**: nothing the process draws varies per film by anything the corpus
   knows. **Rule 2**: the five edge hues are untouched; a process may not split,
   recolour or restyle an argument. **Rule 4**: captions are DOM type on their
   own ground above every process layer; no process pixel ever touches type.
5. **A process lives only while its register GOVERNS** (`sky.treat`), never
   during a strip graze (`previewSet` is a question, not a decision), and it is
   suspended while a route is live, exactly as the halo pass is — a Passage
   dims the field to ground and a process at full strength over a dimmed field
   would outrank the subject.
6. **Reduced motion**: anything that translates, scales or flickers is dropped
   entirely, never shortened; the process's *state* still arrives — someone who
   asked for less motion did not ask for less atlas. (The develop's
   chroma-only retained exception is narrow and stays narrow.)
7. **Honesty tier in the readout, every time it is on screen.** All four
   registers below measure `authored` (σ 0.41, −0.86, −0.36, −0.62): every one
   prints the ○ authored line, plus one sentence saying what the process is and
   is not claiming.
8. **Every guarantee is broken on purpose and confirmed to report** — negative
   controls built by patching, the meteor probe's method.

---

## ATTRITION — war as attrition · 49 films · ○ authored (σ 0.41) · PROTOTYPED

**The claim.** The night sky made "constellation" literal for the register that
earned it by measurement; attrition makes the register's own name literal for
the one whose subject is wear as method. The world is shown on a release print
near the end of its run — and the wear *accrues while you hold the world open*:
slow, bounded, sombre, and entirely on the print, never on any film. Not the
campaign — the mud, the waiting, and what it does to a face; the register's
blurb, performed by the apparatus.

**What it must not claim**, and says so: these films' prints are not damaged —
that would be a false record. The readout prints:

> **WAR AS ATTRITION · 49 FILMS · ○ AUTHORED** — No measured colour separates
> these films; this one was chosen for the map. The wear is on the *print*, not
> in the films — it accrues while this room stays open, it touches no disc and
> no caption, and it resets at the door.

### Structure: the process owns a plate of its own

A second canvas, `#sky-wear`, sits **behind** `#sky`, same size,
`pointer-events:none`, populated only while this register governs. Everything
the graph draws composites over it; DOM type sits over both. Consequences that
are structural rather than disciplined:

- The process **cannot repaint the film layer** — it never touches that canvas.
  Measured: 60s at rest, **0 field repaints** while the wear plate ran its
  events.
- Wear is **pinned to the frame** (gate space), like the grain tile: a pan or
  zoom moves every film and not one scratch. A scratch that travelled with the
  films would be a line on the map. Measured: pan(80,50) → wear plate
  byte-identical, films moved 80.0px.
- Painter's order does the masking: scratches pass **under** discs, lines and
  the room tint without the generator knowing where any film is.

### The vocabulary, each element grounded in real print damage

- **Tramlines** — continuous base scratches in the direction of film travel
  (vertical in the gate), 0.7–1.5px, alpha 0.05–0.10, in the lamp seen through
  a scratch: warm ivory `rgb(237,231,215)`, never the register hue (a scratch
  is not pigment, it is the lamp getting through). Each line **weaves** slightly
  and is **intermittent along its run** (alpha modulated by a low-frequency
  seeded envelope) — an unbroken even stroke reads as a chart gridline, which
  is a mark ON the map; intermittency is what says damage rather than rule.
  Scratches **gang**: after the first, half arrive within a few px of an
  existing line. A worn print wears in bands, not on a ruled grid.
- **Sparkle** — transient positive dirt: 2–5 bright specks, 0.8–1.8px, sharp
  attack and linear decay over 90–140ms, then gone. Gaps are **exponential**
  (mean 7s, floor 0.9s, cap 26s) — the meteor's own argument: arrivals
  independent of each other are Poisson, and Poisson gaps are exponential; a
  uniform window is a metronome the eye learns inside a minute.
- **The accrual** — the attrition itself: one new tramline per 45s of governed
  time, to a **hard ceiling of 9** (3 at arrival + 6 accrued), after which the
  clock stops entirely. Attrition saturates; it never destroys the map. Wear is
  session posture, not state: leaving the world clears the plate, and the next
  arrival is byte-identical to the last (measured) — same corpus, same door,
  same print, for every reader.
- **Considered and refused: the splice.** A missing-frame jump would translate
  the whole field — it moves films (rule 1 by side effect), it is vestibular
  motion, and "the aperture moves no film" already rules it. A frozen wear
  pattern and a passing fleck are damage; a jump is the app stuttering.

### The register's treatment changes with it

`war-as-attrition` currently ships `pulse .08/.18` — a placeholder breath that
runs the idle clock at ~20fps whenever the world is on screen. The process
replaces it: `motion.kind: "still"` in `pipeline/registers.json`, plus the wear
plate. A worn print does not breathe; it runs. That swap pays for the process's
entire budget many times over — see the cost table: today's pulse is ~1,200
field repaints per minute; attrition is ~41 wear-plate repaints per minute and
**zero** field repaints.

### Idle budget (argued, per law 2, and measured)

Event model: sparkle events at exponential gaps (mean 7s) × ~6 wear-plate
repaints per event at ~45fps for ≤140ms, plus ≤6 accrual repaints in the
lifetime of a visit, plus nothing. Between events both plates are silent.
Hidden tab, reduced motion, other view, route live: the scheduler skips.

### Measured — prototype, real Chromium, 1440×900, dpr 2, software raster

| | |
|---|---|
| field draw (49 films, edges, halos, room), mean/worst of 40 | **0.34–0.52ms / ≤5.3ms** |
| wear plate rebuild, mean/worst of 40, wear at ceiling | **0.30ms / 1.5ms** |
| idle repaints in 3s, no event in flight | **0 wear, 0 field** |
| one sparkle event | **6–7 wear repaints, 0 field repaints** |
| 60s at rest | **41 wear repaints / 7 events / 1 accrual / 0 field** |
| luma at 49 film centres, ceiling wear vs no wear | **max Δ 1.00 of 255** (the room tint's own under-disc precedent is ~2–3 levels) |
| ink, no wear → ceiling | 1.956% → **2.336%** and stationary thereafter |
| ceiling | 6 accruals accepted, 7th refused, **9 tramlines** |
| exit → re-arrival | plate cleared to blank; second arrival **byte-identical** |
| pan(80,50) | wear unmoved, films 80.0px |
| reduced motion, 160s governed | **0 events, 0 accruals**, 3 arrival tramlines standing |
| hidden, 160s governed | **0 events, 0 accruals** |
| caption | DOM, `filter:none`, above both plates |

### Negative controls — each patched in, each REPORTED (probe output verbatim)

| break | reported by |
|---|---|
| tramlines seeded from film positions | independence gate: **9 of 9 dead on a film** vs ganged-null ceiling 3 |
| wear composited over the discs | luma gate: **Δ 6.86** against a 3.0 floor |
| no accrual ceiling | **15 tramlines** after 12 accruals |
| events under reduced motion | **27 events, 3 accruals** where 0 is the gate |
| events while hidden | **27 events, 3 accruals** where 0 is the gate |
| films jittered on wear events | **0.42px** worst displacement where 0.05 is the gate |

**One gate convicted an innocent build, and the gate was wrong** — recorded
because it is the class of error DESIGN.md keeps finding: the first
independence gate compared scratch positions against a *uniform-independent*
null, and the ganging (a deliberate, graph-blind design property) failed it at
2.4px mean nearest-film distance. The null must model the generator's own
clustering; the corrected statistic is "lines sitting dead on a film's x"
against a ganged-null Monte Carlo, which the graph-seeded build maxes out at
9 of 9 and the innocent build passes at its null ceiling.

### Template integration (apply when the file frees)

1. `#sky-wear` canvas behind `#sky`, sized with it, cleared by `skyExit()` and
   by any re-form away from this register.
2. `skyWearArrive()/skyWearBuild()/skyWearStep()` — lexical scope containing
   no `sky.wx`, `sky.at`, `ADJ`, `F`. Seeded from the corpus-version constant.
3. Scheduler joins `skyMotionOn()`'s guards (view, hidden, reduced, route) and
   uses its own `setTimeout` chain, not the 20fps idle clock — between events
   there is nothing to tick for.
4. `registers.json`: `war-as-attrition.motion` → `still`.
5. Probe: port `attrition-probe.mjs` gates onto the built artifact the way
   `meteor-probe.mjs` runs (patch-based negative controls included). Re-measure
   the cost table on the real page; the prototype numbers above stand for the
   process, not for the integration.

---

## SWEEP — paranoid thriller · 106 films · ○ authored (σ −0.86) · SPECIFIED

**The claim.** A *sweep* is what you do to a room you believe is listened to —
and what a searchlight does. The register whose blurb is "somebody is
listening, and the film will not tell you who" gets the one process that is an
event with no consequence: at long, unlearnable intervals a soft beam crosses
the field, **under** every film, finds nothing, changes nothing, and is gone.
The paranoia is exactly that it carries no information — rule 1 by
construction, made into the mood itself.

**Form.** A soft-edged band of light from a pivot **off-frame** (never inside),
crossing the entire visible band edge to edge (the meteor's full-traversal
lesson), angular speed near-constant, life 1.5–3s. Drawn as one pre-rendered
128px wedge sprite, rotated and blitted — never a per-frame gradient. Colour:
the register hue lifted toward ivory, additive, peak ground lift ≤ a dozen
levels (the room tint's own ceiling). It passes **beneath** the room tint, the
lines and the discs: the beam lights the room; the films stand against it in
silhouette and keep their own light. A film never brightens — the develop's
invariant, arriving from the other side: **surveillance may not add one photon
to a film.**

**What keeps it from reading as an edge or a meteor**: it is a band, not a
stroke; it is bounded by soft penumbrae, not ends; it rotates about a point the
frame cannot show; and it is under everything, where the meteor is also under
everything but white, tapered and fast where this is broad, tinted and slow.

**Event model / idle budget.** Exponential gaps, mean 18s, floor 2s, cap 60s —
sparser than meteors because a beam is a larger object and twice the presence
per event. In flight the idle clock stays at the standing ~20fps (a 200px-soft
band moving ~600px/s overlaps itself many times over at 20fps; it does not need
the meteor's 45fps lift). Share of clock: 1.5–3s per mean 18s ≈ **≤12%**.
Between beams, while the register is otherwise `flicker`, the existing
treatment clock applies unchanged; the beam adds **one sprite blit** to frames
that were being drawn anyway. **Budget** (to measure at integration, not
asserted): beam-in-flight frame ≤ +0.2ms over the same frame without it; draws
in 3s between beams identical to the shipped flicker register; tab hidden /
other view / route live: 0.

**Reduced motion:** no beam, ever (it is translation). The register arrives
static, exactly as the meteor path does under RM.

**Honesty readout:**
> ○ AUTHORED — no measured colour separates these films; this one was chosen
> for the map. The sweep is the room's, not any film's: it crosses under every
> film, finds nothing, and leaves the picture exactly as it found it.

**Negative controls (build with the probe, patch-based):** pivot seeded from a
film's position → chord-to-nearest-disc distribution gate; beam drawn over
discs → luma-at-films gate (≤1 of 255, prototype-calibrated); uniform interval
window → exponential-gap KS gate (the meteor's χ² method); RM still sweeps →
0-event gate; hidden still sweeps → 0-draw gate; beam pixels within the caption
box → rule 4 DOM assertion plus pixel check; "finds nothing" is testable — the
frame after a completed sweep must be byte-identical to the frame before it.

---

## SEPARATE — marriage in decay · 120 films · ○ authored (σ −0.36) · SPECIFIED

**The claim.** *Separation* is the darkroom word — the two colour records a
print is made from — and the register's word: two people at close range, and
the years of evidence between them. The pun is load-bearing, which is why this
register and not dream-logic (whose uncanny is already carried by drift and
violet, and where a permanent misregistration would read as error rather than
as the fact the register names). The world prints from **two records** — a
warm record and a cool record — that are **out of register by a hair, and never
close.**

**Form.** Everything the *register* owns — discs, halos, room tint — is drawn
twice, as two channel-plates whose additive sum reconstructs the original
colour exactly: plate A `(R, G/2, 0)`, plate B `(0, G/2, B)`, composited
`lighter`. Offsets: A at `(+d, 0)`, B at `(−d, 0)`, **one `d` for the whole
field** (rule 1: no film is more separated than another — the value is a
property of the register, like `scale`). On arrival the plates start ~6px apart
and pull to a residual `d ≈ 0.8px` over the flight's last beat, on the camera
curve; the residual **never** closes.

**The one per-film response, and why it is legal:** the plates of the film in
hand close to zero over `--t-fast` while it is held, and reopen on release.
Keyed to the reader's hand — the same input rack focus already answers — never
to the graph. At close range, briefly, the records align; step back and the
distance returns. That is the register's whole subject, in one gesture the
interface already owns.

**What is NOT split — and this is the teaching:** the edge lines. Rule 2 says
the five hues are the argument's grammar, so the claims hold in perfect
register while the world around them separates. *The marriage separates; the
arguments do not.* Captions are DOM and never fringe (rule 4).

**The invariant, exact by the develop's own argument:** canvas `lighter`
compositing is additive in channels and the split is a partition of channels,
so at `d = 0` the two plates reproduce the unsplit frame **exactly** — 0 pixels
differ, no appeal to colour science. That is the gate that makes the residual
an authored quantity riding on a lossless mechanism rather than a filter.

**Idle budget: zero.** The residual is static state; holds repaint on
interaction exactly as holds already do. One-shot on arrival; an address
restores the residual state directly.

**Reduced motion:** the convergence tween is dropped (it is translation); the
world arrives at the residual. The held-film closing is a 160ms sub-pixel
translation — dropped too; under RM the held film simply shows its plates
closed, instantly.

**Cost budget** (to measure): the disc+halo pass runs twice over 120 films
while this world governs — against the shipped table (194-film register:
1.37ms mean) the doubling bounds at roughly +0.5ms on governed frames only,
and governed frames at rest are zero because the register's shipped `pulse`
should move to `still` with the process for the same reason as attrition's.
Measure at integration; the number above is a bound argued from the shipped
table, not a measurement.

**Honesty readout:**
> ○ AUTHORED — no measured colour separates these films; the two records are
> the map's own. They print a hair out of true and do not close; the
> connections between films hold in register. The film in your hand aligns
> while you hold it.

**Negative controls:** `d=0` reconstruction not byte-identical → invariant
gate; edges split → edge-pixel hue gate; caption fringed → rule 4 pixel check
on the caption box; per-film `d` (seeded by degree or anything else) →
cross-correlation offset per disc must have variance 0; held-film closing
leaking to neighbours → only the held disc's plates close; RM still tweens →
0-motion gate; idle repaints at rest → 0 gate.

---

## KINDLE — folk horror · 10 films · ○ authored (σ −0.62) · SPECIFIED

**The claim.** The smallest register in the corpus — ten films, printed on
screen as an honest count — gets the one process that is an arrival and nothing
else. Folk horror's vocabulary is the bonfire, midsummer, the harvest festival,
the witch burning; its blurb is "dread grown out of a place." **Kindle**: on
choosing the world, the room light does not fade in — it *catches*. An ember at
the centroid of the films' own positions takes, spreads, over-swells once or
twice, and settles into exactly the standing room tint. The dread grows out of
the place the films stand on, once, at the door.

**Form.** The existing room sprite mechanism, unchanged, with an ignition
envelope over the arrival flight plus ~400ms: radius from 0.12× to the standing
0.11·k; hue travelling ember oxblood → the register's authored gold `#C8A24A`;
alpha overshooting to ~0.26 once on a seeded 2–3 lobe envelope before settling
at the standing 0.20. **One envelope for the whole room** — no per-film flame,
no disc flares (rule 1); the anchor is the centroid the room tint already owns
(a property of the selection, law 3's carve-out). Under everything the graph
draws, as the room already is.

**One-shot, structurally:** the envelope is a function of flight progress, not
of a clock that survives the flight. After settle the picture is
**byte-identical to the un-kindled standing room** — that equality is the
primary gate. Kindle adds ~12 draws once (the +400ms settle at the flight's
own frame rate); idle repaints thereafter: 0. Re-fires only on re-arrival
through the door, never on pan, zoom, fold, or resize.

**Reduced motion:** arrives lit — the standing tint, no ignition. Less motion,
not less atlas.

**Cost budget** (to measure with a `film reform folk-horror` scene): the
ignition rides frames the flight already paints; the marginal cost is the
+400ms settle, ~12 draws of a 10-film field (the cheapest field in the
corpus), then silence. Draws in 3s after settle: 0, gated.

**Honesty readout:**
> ○ AUTHORED — no measured colour separates these ten films; this fire was lit
> for the map. It catches once, at the door, from the middle of where these
> films stand, and then it is only the room's light.

**Negative controls:** settled frame differs from the standing room → byte
gate; ignition re-fires on pan/fold/resize → draws-after-settle gate; RM still
ignites → gate; any disc's luma during ignition exceeds its standing-room value
→ per-film flare gate; envelope seeded per film → one-curve assertion.

---

## Order of application, and what each buys

**attrition first** — it is prototyped, measured, and it *reduces* the shipped
idle cost of its register while giving the project the sombre proof the
register-list review asked for: that this vocabulary can mourn, not just
glitter. Then **kindle** (smallest surface, zero idle, one gate), **separate**
(the exact-reconstruction invariant makes it cheap to verify), **sweep** last
(the only one that adds a recurring event to a register that already flickers,
so it carries the most idle-budget argument).

Each lands as: template change + `registers.json` motion change where named +
its probe ported onto the built artifact with patch-based negative controls,
per the meteor probe's method. No process ships without its probe failing on
the broken build first.
