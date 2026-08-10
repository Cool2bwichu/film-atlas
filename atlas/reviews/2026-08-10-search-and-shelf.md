# Design review — the typed search and the shelf — 2026-08-10

The third standing review, run against two features that landed after the
morning's pass: the typed search (`#/find/<sentence>`, a fourth target kind
inside the sky) and the shelf of measured light on the film panel.

Built fresh, and this is the artifact everything below was measured on:

```
public/atlas.html  9871 KB — 2204 films, 22217 edges, 2204 placed
light 1017 of 2204 films measured (46.1%) — 903 from frames, 114 from backdrops,
222 measured monochrome, 1187 with no light at all, 75 KB
typed search consensus-vocab-1 — 59 attributes over 2204 films,
rungs 0.25/0.5/0.6/0.75/1, attrs 39 KB, lexicon+vocab 36 KB, modules 163 KB
```

The shipped harness agrees with itself. `node --test tests/*.test.mjs` 58/58.
`find-probe.mjs` FIND PASS, 53 checks. `search-probe.mjs` SEARCH PASS, 41
checks. `shelf-probe.mjs` SHELF PASS. `transport-probe.mjs` fails only its 5b
section (the transport's own readout collapsing the aperture to 51% at a held
year) — pre-existing, deliberately left, and not counted against this batch,
though finding 8 below is the same disease on the new path.

Everything below was driven in real Chromium at 1440×900, 900×820 and 390×844,
`reducedMotion:"no-preference"`, images blocked so the composed cell renders
(AGENTS rule 9). Screenshots are in `.atlas-shots/`. **Zero page errors were
raised in any state driven — search, refusal, offer, shelf, phone.**

---

## Verdict

**The shelf is ready to be seen. The typed search is not.**

The shelf is the better piece of work by a distance. It is the honest answer to
a question with no lawful answer, its geometry is provably free of the fame
gradient (321.0×171.2 px for all nine films, drift 0.000), its licensing is
enforced rather than asserted (0 mentions of the frame source in the artifact;
`upload.wikimedia.org` and `en.wikipedia.org` the only hosts anywhere), and 8½
draws a grey wedge and a flat neutral because that is what the instrument
found. It has one real defect (finding 4) and one contradiction it prints on
screen (finding 9). Neither stops it shipping.

The typed search has the harder problem, does most of the hard parts right —
the refusal copy is the best writing in this project, the band ordering is real
(The Matrix at radius 0.003, spearman −0.9904, 0.00% inversions), rule 3 is
genuinely drawn (AUC 0.970, measured below), the whole thing is deterministic
to the byte — and then does not deliver the picture the owner asked for.

**The single most important thing still wrong: the answer is not in the
picture.** Everything the reader typed the sentence to find is compressed into
a 28-pixel smudge, unnamed, and the only place it is named is the one list in
this app you cannot click.

---

## Blockers

### 1. The films that answer the sentence are a 28-pixel smudge, and nothing names them

The owner's spec is *"atlas should be able to create a constellation in which
those very films live."* Measured on the owner's own sentence at 1440×900, with
the drawn disc at radius 191.5 px:

| the reader is shown | drawn within |
|---|---|
| the nearest 12 films — every film the readout names | **3.4 px** of the centre |
| the nearest 30 | 7.5 px |
| **the nearest 60** — the band every clause-miss count, every coverage notice and every offer's influx figure is computed over | **14.1 px** |
| the nearest 245 | 48.6 px |

`sky.labels.length` is **0** on arrival, **0** after `FIT`, and **0** at every
zoom I drove (k = 371 → 1,132 → 2,380 → 7,257). The constellation names a film
only on hover, which is the resting atlas's grammar and the wrong grammar for a
result: hovering the exact centre returned *Star Wars: Episode VI*, which is
rank 3, because ranks 1 through 12 share 3.4 px.

Zooming does not rescue it. `+` pivots on the viewport centre while the picture
is centred in the aperture at `cy` 231.5 (screen y ≈ 301), so **three presses
of `+` put the front of the sky off-screen entirely** — the shot shows the
rim arriving at the top-left corner and no answer anywhere in frame.

And the mitigation that would have saved all of this is missing. The readout's
`NEAREST FIRST, AND WHAT EACH ONE MISSES` block — the only surface in the app
that says *The Matrix, 6 of 8, no hopeful, no little dialogue* — contains
**zero interactive elements**: `.find-miss button, .find-miss a` → 0. In a
project whose founding sentence is "each connection carrying a specific,
clickable claim", the five films at the front of a typed reading are the one
list you cannot click, cannot hover into the picture, and cannot open.

The score distribution is not the excuse. 81 films sit in the innermost tenth
of the radius against 446 in the outermost, so the layout is doing its job. It
is the *presentation* that never converts a rank into something a reader can
see or touch.

### 2. The `no-reading` shell collides with the century transport, and prints a false sentence

Two of the four refusal codes route through the shell (`under 90 minutes, in
english` and `zorbnax plughcromulent frobnitz`). On both, the page's own
predicate and the page's own DOM disagree:

```
shell state:  skyTpAllowed() === false      #sky-track hidden === false
              TP.live === true              track box 1440 × 75.25 px
```

`skyTpApply()` is never called on the shell path, so the transport stays
mounted and live under a picture it must not be under. Clicking **RUN THE
CENTURY** while the shell is drawn:

- replaces the entire reading with the transport readout,
- prints **"The atlas as it stood in 1959. Nothing has moved"** under a sky in
  which all 2,204 films have been re-arranged by score,
- prints **"424 of 2,204 films"** thirty pixels below a strip still reading
  **"solved here · 2204 films, none removed"**,
- and offers a **BACK TO THE WHOLE ATLAS** button that silently discards the
  reading.

The scrub does the same by hand (dragged to 1960, `TP.t` follows, the reading
survives underneath). Screenshot: `bug-shell-run-century-1440.png`.

It costs the shell its stage as well. Because the 75 px track is still seeded
into `skyChrome()`, the shell's aperture is **441.8 × 322.5 = 142,481 px²**
against the scored query's **544.6 × 397.5 = 216,468 px²** — a **34% smaller
frame for the one query picture in the feature that is actually legible.**

`find-probe.mjs` cannot see this: its transport check (`the century transport
stands down over a match disc`) runs only against a scored query, and its whole
four-refusals section runs in Node against the engine module, never on the
page. That is the exact failure mode AGENTS.md warns about — the module was
asked what it would do, and the page was never asked what it drew.

---

## Major

### 3. The follow-up questions are below four screenfuls of prose

The dynamic follow-up is half of what the owner asked for. It is the last thing
in a scroller nobody will reach.

| viewport | readout content | visible window | screens | offers begin at |
|---|---|---|---|---|
| 1440×900 | 1,430 px / **683 words** | 313 px | **4.6** | +1,188 px |
| 900×820 | 1,382 px | 282 px | 4.9 | +1,141 px |
| **390×844** | **1,740 px** | **177 px** | **9.8** | **+1,392 px** |

For scale, every other state of this readout is 69 words and does not scroll at
all (whole atlas 69 words / 126 px; a world 69 words / 155 px). The query state
is **9.9× the prose of anything else in the app**, in a box that shrank to a
port.

The template's own CSS comment names the cue this design depends on, and the
query state does not print it:

> *"What always says the panel continues is the readout's own '8 CROSSINGS',
> printed above the first claim, and the claim the bottom edge cuts through.
> The rail is the third cue where a platform draws one."*

A Passage prints `8 CROSSINGS`. The whole atlas prints `2204 FILMS · 22217
CONNECTIONS`. The query fold header prints **`YOUR READING`** and no count of
anything. Chromium here draws an overlay scrollbar, so at rest there is no rail
either. Nothing on screen says there are 683 words below the fold.

The prose itself is also stamped, not written: *"Your own words pull apart
here: drop X and N% of the nearest sixty change, yet the films at the front
barely hold it"* appears **three times verbatim** in one readout.

### 4. The shelf's colour plate is clipped for 38.4% of measured colour films, and the caption prints the wrong gain

This is the same rule-8 error the shelf's own note says it fixed on *The
Matrix*, surviving at the other end of the scale.

`plateColour` draws three stops. The centre stop is
`warmth × (chroma90/chroma) × SHELF_GAIN`, capped at `SHELF_CCAP` = 0.155.
Over the 795 non-monochrome films with measured light:

- median `chroma90/chroma` = **2.04**, p90 = 2.56, 13 films at the ×3 ceiling
- so the mid stop's real amplification is a median **7.3×**, up to **10.8×**
- **305 of 795 (38.4%)** of colour plates have their centre stop clamped
- 187 of 795 (23.5%) have an end stop clamped

The four films `DESIGN.md` names as proof that "the measurement speaks" all
draw the same ceiling in the middle of the plate:

| film | warmth | mid stop wants | drawn at | over the cap by |
|---|---|---|---|---|
| Do the Right Thing | +0.0921 | 0.476 | 0.155 | **3.07×** |
| The Abyss | −0.0660 | 0.401 | 0.155 | 2.59× |
| Suspiria | +0.0484 | 0.402 | 0.155 | 2.59× |
| Fantasia | −0.0662 | 0.342 | 0.155 | 2.21× |

They differ in *hue* — amber against blue, which is real and is the good part —
and not at all in *amount*. Any film past |warmth| ≈ 0.021 draws the same
maximum, and the median |warmth| in this corpus is 0.0170. The caption says
**"amplified ×3.6"**; the stop that occupies the middle half of the plate is
amplified between 3.6× and 10.8×, and the plate is the loudest, most saturated
rectangle anywhere in an interface whose ground is a warm near-black.

Chroma *is* in the picture. It arrives through the `chroma90/chroma` ratio, and
it drives the plate into a wall.

### 5. Nothing tells anybody the feature exists

The whole typed search is reachable only by a reader who does the unpromised
thing first. Every piece of copy that could invite a sentence invites a title
instead:

- placeholder: **"Name a film…"** — never changes, in any state, at any width
- lede: *"Pick one and Atlas draws what it descends from…"*
- lede foot: *"Press `/` to search — or pick a face"*
- `aria-label` on the box: *"Search the atlas by film title"*

The door is a single row — `◎ Draw a constellation from this` — that appears
below up to six film-title matches after the third character. A reader who
types "a bleak film with little dialogue" finds it. A reader who never tries
does not, and nothing in the interface suggests trying.

### 6. Taking an offer acknowledges itself 784 px away, and the take target has no affordance

`.find-take` and `.find-either` are both `border:0; background:none`. The only
visible edge in an offer row is the `1px solid var(--hair)` that separates
**EITHER** — so the least consequential of the three responses is the only one
that looks like a control, and the primary action is a 300×61 block of prose
whose sole signifier is a colour change on `:hover` (nothing at all on touch).

Taking one works — `taken:[{attr:"mode:spectacle"}]`, the sky re-forms, the top
12 change, the address is preserved. But the confirmation is rendered at the
**top** of the readout (`AND WHAT YOU ADDED / you chose / SPECTACLE`) while the
reader's scroll position, correctly preserved at 784 px, leaves them looking at
a paragraph about something else. Screenshot: `search-offer-taken-1440.png` —
nothing in frame says the click did anything.

### 7. On a phone the reading's own name lays out at 1.6 px

`#sky-stratum` is, in the code's own words, "the one surface that stands for as
long as the state does". At 390 its four children measure:

```
<span>reading</span>                                     45.9 px
<b>a film that has fast pacing, …</b>   scrollWidth 801 →  1.6 px
<span class="n">solved here · 2204 films, none removed</span>  249.4 px
<button>×</button>                                       15.1 px
```

The reader's sentence — the only part of that strip that identifies *this*
state rather than every state — is the sole flexible child, and it is crushed
to nothing so that 249 px of constant boilerplate can be drawn in full. On
screen the strip reads `reading  ⁄  solved here · 2204 films, none removed  ×`.
At 900 it gets 267 px, at 1440 155.6 px; only 390 collapses it, and 390 is
where naming the state matters most.

### 8. The query gives back 222 px of chrome and still draws its picture in a smaller frame than the resting atlas, with 30% of the viewport empty

The query state rolls up the worlds strip (147 px) and hides the transport
(75 px), and its aperture is still **smaller** than the resting one:

| state | aperture | of the 1440×830 canvas | centre y |
|---|---|---|---|
| resting atlas | 584.5 × 426.6 = 249,350 px² | 20.9% | 366.5 |
| **typed reading** | **544.6 × 397.5 = 216,468 px²** | **18.1%** | **231.5** |
| the shell (finding 2) | 441.8 × 322.5 = 142,481 px² | 11.9% | 194.0 |

The cause is the readout growing from 126 px tall to 380 px in the bottom-left,
and the aperture clearing it by going *above* it rather than beside it. The
drawn ink is a 382 × 382 box in the top third of the frame. The rectangle from
x 536 to 1440 and y 500 to 900 — **904 × 400 px, 30.3% of the viewport** —
contains one 220×32 row of zoom buttons and nothing else.

This is the same disease `transport-probe.mjs` 5b is already failing on, on a
new path: a readout that grows takes the picture's room, and the fixed 38vh cap
bounded the damage without removing it.

---

## Minor

### 9. The `mark` plate says "from its poster" on 921 films that have measured light

The shelf's stated argument is *"The poster is what the film was sold as; the
mark is what this atlas holds."* `paletteSource` across the corpus is 1,982
poster / 196 era / 26 curated, and **921 films have both a frame measurement
and a poster-derived mark** — so for those films the mark is a recolouring of
the advertising the shelf exists to move past, and its own caption prints the
contradiction as `MARK / from its poster`, 400 px below the poster it came
from. The panel then repeats it a third time in the metadata row
(`PALETTE — from its poster`). The measurement to draw those marks in the
film's own light is sitting in the same file as the other two plates.

### 10. A fixed-height box with 168 px of nothing in it

On `nothing violent` the readout content is **47 words** and the last element
ends **168 px above** the bottom edge of a bordered 342 px frame. `a good
western` leaves 56 px. The 38vh cap is right about the ceiling and wrong to be
a floor: a refusal is two sentences and a chip, and it is drawn inside an empty
rectangle a third of the screen tall.

### 11. The disc's radial light profile is a U, not a falloff

Mean luma per unit area across the query disc, on the composited canvas:

```
r  0.03 → 160.2      r  0.57 → 124.9      r  0.97 → 153.2
```

By fifths, the outer fifth carries **34.2%** of the ink against its 36% of the
area, the inner fifth 4.2% against 4%. The picture distributes its light almost
exactly in proportion to area, which means the brightest continuous feature is
the rim — 446 films in the outermost tenth of the radius, most of them the
396-film tie the readout names. Normalising the radius fixed the hole in the
middle; it did not stop the crowd at the edge from being the strongest graphic
in a picture whose caption says the middle is the point.

### 12. Chip rows wrap raggedly and each `×` is its own bordered cell

At 1440 the five chips lay out one-then-one-then-three across three rows with
each `×` in a separate boxed cell of a different height from its neighbour. It
reads as a table that lost its grid rather than as five tokens. Cosmetic, but
it is the first thing under `WHAT THIS ATLAS READ` and the first thing a reader
looks at after the picture.

---

## What holds up, and should not be traded away in the fixes

- **Rule 3 is genuinely drawn, and I measured it independently.** On `set in
  space`, sampling the composited canvas at each film's own hit-grid
  coordinate: hollow discs read **15.1** luma at the centre against **152.5**
  for filled, over 563 and 1,641 discs, **AUC 0.970** against the stated 0.90
  gate. The hole is really ground out of the plate, and it survives at zoom.
- **The bands are real.** The Matrix at radius 0.003 on the owner's sentence,
  0 films in the innermost 3.7% of the radius jumping their band, 81 films in
  the inner decile against 446 in the outer.
- **Determinism.** Same sentence, typed, cleared and typed again in one
  session: the constellation canvas is **byte-identical** (sha256 match).
- **Licensing is enforced, not asserted.** `grep -c` for the frame source in
  the 9.8 MB artifact returns **0**. The only image hosts anywhere are
  `upload.wikimedia.org` and `en.wikipedia.org`.
- **The refusal writing is the best prose in this project.** *"That is a fence,
  not a place."* *"Nothing here moves the sky, but the record answers."* The
  four refusals each say the true thing in two sentences and stop.
- **The shell is the most legible picture the feature draws** — a hollow ring
  with an empty middle, which says "nothing here answered you" before a word is
  read. Findings 1 and 2 are both, in different ways, about the fact that the
  state which failed is drawn better than the state which succeeded.
- **The shelf's geometry is provably fame-free.** 321.0 × 171.2 px for all nine
  films at 1440 and 900, 342.0 × 180.5 at 390, 0 px of horizontal overflow in
  any panel. The `no light` plate is exactly as tall as a measured one.
- **The shelf's two instruments read apart.** Fantasia's plates are dashed and
  say "a reading, not a record"; Do the Right Thing's are solid. 8½ draws a
  grey step wedge and a flat neutral, which is the strongest thing that
  measurement ever says and it is drawn as such.

---

## What I would do next, in order

1. **Put the answer on screen.** Make `NEAREST FIRST` clickable — hover a name,
   light that film in the picture; click it, open it. Label the top handful on
   the canvas on arrival, at the weight rule 4 already permits. Consider
   arriving zoomed to the front rather than to the whole disc, with the rim
   still one gesture away, since nothing is filtered and the outermost film
   is still there at alpha 1.00 whether or not it is in frame.
2. **Call `skyTpApply()` on every query transition**, including the shell, and
   add the shell to the probe's browser-side checks rather than its Node ones.
3. **Move the offers above the honesty prose**, or print a count in the fold
   header the way a Passage prints `8 CROSSINGS`, or both. 683 words is a
   document; the follow-up is a control, and a control does not live at the end
   of a document.
4. **Fix the colour plate's gain** — either print the true amplification per
   film or drop the `chroma90/chroma` multiplier out of the stop that is
   already at the cap for 38.4% of the corpus.
5. **Change the placeholder.** One line of copy is the whole discoverability
   fix.
