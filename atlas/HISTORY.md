# HISTORY.md — the narrative record

Why decisions were made, what was tried and rejected, and the bugs that cost
real time. Read this when you are about to redo something, not before every
task. STATE.md is the short version and is the one to keep current.

---

# STATE.md — build status, evidence, and open problems

Written honestly. Where something is unverified it says so.

## Architecture

Single-file React component (~1150 lines). The lineage source is now pluggable:

```
seed title
  → lineage source  → JSON: typed connections, each with a claim,
  │                   strength, confidence, basis, and a two-colour palette
  ├─ Claude API     (live, costs tokens, open world)
  └─ corpus.json    (baked, costs nothing, closed world)   ← preferred
  → TMDB (optional) → poster, if a key is present and the runtime allows it
  → generated cell  → deterministic composition when there is no poster
  → d3-force layout, 340 ticks, precomputed
  → SVG render: per-node duotone filter, CSS-transitioned positions
```

Key modules: `duotoneRamp()` builds the posterize+duotone `tableValues`;
`relax()` runs the force layout; `boxSeparation()` resolves cell+caption
rectangles; `genCell()` composes artwork when no poster exists; `depthMap()`
is a BFS from the focused node driving rack focus; `hydrate()` resolves one
film. `static/resolver.js` is the token-free lineage source.

## Verified — with evidence

Headless Chromium at 1440×900, 900×820, 390×780, driving the real component
through the real code path (only network responses stubbed). Re-measured after
every change below; `validation/harness/probe.py` produces these numbers and
prints PASS/FAIL rather than requiring interpretation.

| Claim | Evidence |
|---|---|
| SVG duotone filters apply to cross-origin images with no CORS grant | Images from a second origin with no ACAO header; canvas readback threw `TAINTED_CROSS_ORIGIN`, proving genuine cross-origin; all 7 cells still filtered |
| Rack focus falloff is correct | Focusing a leaf in a star topology: 1 cell `none`, 1 at `blur(1.2px)`, 5 at `blur(3.4px)` |
| No overlap or clipping at any of the three sizes | 0 cell-vs-cell, 0 caption-vs-caption, 0 caption-vs-cell pairs; 0 clipped; measured with the panel both closed and open |
| Legend clears the panel | 0px occlusion with panel open at 1440 and 900. Regression-tested: restoring the old `right: 372` offset makes the probe report `legend 25px` at both sizes |
| The relationship key is reachable at every size | Always-on legend ≥720px, `Key` control below it |
| Graceful degradation when posters are blocked | Blocked run: 0 `<image>` elements, 7 generated cells, 7 captions |
| A CSP refusal is identified as such | Harness served behind `img-src 'self' data:`; app reported `CSP: img-src refused http://localhost:8001` plus the policy verbatim, and relabelled its own diagnostic control |
| Frame time under blur load | 15.9ms (~63fps) at 7 nodes with posters |
| Local build compiles | `npm install && vite build` → 597 modules, 215.21 kB, 71.29 kB gzipped |
| Corpus build runs with no network at all | 233 kB single file; draws Solaris → 2001 / Arrival / Stalker with zero fetches leaving the page |

## Corrections to earlier claims in this file

- Mobile overlap was recorded as "2 pairs / 5px". Reproduced at **6 pairs /
  15px**, deterministic across three runs. The earlier figure understated it.
- The old probe measured `.node-g` group boxes, which conflates a cell with its
  caption. The real defect was a caption lying across a *neighbouring cell*;
  cell-vs-cell and caption-vs-caption were both clean throughout. A probe that
  measures only one class passes an unreadable screen.
- `05-claim-card.png` does not show a claim card. It shows the film panel.
  Whatever it was meant to evidence, it does not.

## Fixed since the last handoff

1. **CSP forensics.** A `securitypolicyviolation` listener reports the violated
   directive, the refused origin, and the policy text. Silence is evidence too:
   if posters fail and nothing fires, CSP is exonerated.
2. **Legend occlusion.** Panel width is derived from `PANEL_CONTENT_W +
   padding + border` rather than the content width alone; the panel is not
   `border-box`, which is where the 25px came from.
3. **Caption collisions.** Captions counter-scale by `1/S`, so on a phone a
   title occupies ~1.67× its desktop width in graph space while `forceCollide`
   knew nothing about it. Titles now wrap instead of truncating, and
   `boxSeparation()` resolves the true rectangle — a cell with a caption
   beneath it is ~140×244 in graph units, and no circle models that.
4. **The relationship key on mobile.** Was `{!narrow && …}`, i.e. the five
   typed relationships rendered as unlabelled coloured dashes on a phone.
   Now behind a `Key` control — an overlay, so it costs the layout nothing.
5. **Record vs reading.** Edges carry a `basis`, surfaced in the panel. A
   shared cinematographer is checkable; a rhyme between two framings is an
   argument. One confidence percentage flattened those into a single scale.
6. **TMDB key is no longer a precondition.** Lineage never came from TMDB —
   only photography did. The map draws without a key and upgrades if one
   arrives.
7. **The generated cell is composed, not defaulted.** Four deterministic
   compositions (horizon, aperture, column, eclipse) seeded by a hash of the
   film id, drawn in that film's own two colours.

## The poster fork is closed

The recommendation is no longer A or B. Running without a live model means the
corpus ships with the app, and once artwork is generated per film the app has a
complete visual identity with **no third-party image dependency at all** — no
TMDB key, no CSP exposure, no licensing question, nothing that can be refused.
The baked-poster idea (option C) is unnecessary rather than merely unmeasured;
that spike was dropped for this reason, not forgotten. TMDB stays supported as
an optional enhancement for anyone who wants real one-sheets.

## Not verified

- **The live Claude API path.** Still only exists in the artifact runtime.
- **Whether the artifact sandbox is in fact CSP-blocked.** The instrument now
  exists and is proven against a known policy; it has not been run inside the
  artifact. Five minutes of work, and it settles a months-old question.
- **Corpus claim quality at scale.** 67 films now, of which the 147 record
  edges are checkable by construction and the 16 readings are hand-written.
  Whether *generated* readings hold up at 1,000 films is untested and remains
  the main risk to the token-free direction.
- **Behaviour past ~20 nodes.** `boxSeparation` is O(n²) per tick across 340
  ticks; free at 7 nodes, 3.4M comparisons at 100, and will need a quadtree.
- **Fraunces advance-width estimate.** `GLYPH_W = 0.5` reserves space only. It
  holds for the current corpus; a script with different metrics could
  under-reserve.
- **Aesthetic composition of the map itself.** The seven-node map still sits
  right of centre with an empty left third at 1440px. Unresolved, and now more
  visible than it was with real posters.

## The corpus pipeline — built, and what it proved

`pipeline/` builds the record spine from Wikidata with no model involved:
`build-corpus.js` resolves seeds to entities, derives `hand` edges from shared
director / DP / composer / editor and `descent` edges from P144 "based on",
and writes `out/spine.json`. `merge-corpus.js` folds in the hand-written
`static/readings.json` to produce `static/corpus.json`. `validate-corpus.js`
checks schema and graph shape and refuses a record with confidence < 1.

Wikidata rather than TMDB, because it carries the credits *and* needs no key,
which takes the poster key off the critical path entirely.

Measured on 67 seeds: **67/67 resolved, 147 record edges, 0 tokens.**

Three findings that change how the corpus should grow:

1. **Records give depth; readings give reach.** The record-only spine
   fragmented into **12 components** with three orphans. Shared crew builds
   dense neighbourhoods *inside* a tradition and almost never crosses one.
   Adding 16 interpretive edges collapsed it to **a single component of 67**.
   Interpretive edges are therefore structural, not decorative — and
   generation budget should be aimed at pairs in *different* components rather
   than spent uniformly.

2. **The spine finds things a model would not be trusted to assert.** Ugetsu →
   Rashomon → Yojimbo are linked by Kazuo Miyagawa shooting all three: the
   actual connective tissue between Mizoguchi and Kurosawa, discovered
   mechanically and citable to `wikidata:Q2025121`.

3. **Certainty carries little information.** 36% of edges sit at strength 0.82
   because every pair inside one filmography shares the same crew. Distance is
   supposed to encode bond strength (AGENTS.md rule 1); when a third of edges
   share one value it encodes nothing. A director's body of work probably wants
   to collapse to one cluster node rather than draw all pairs. `validate-corpus.js`
   reports this as "strength collapse".

A resolver bug worth remembering: label search returned a genus of molluscs for
"Vertigo" and a video game for "Alien", so the first run silently dropped nine
films — **all of them canonical**, because famous titles have the most rivals
for their name. Fixed with `haswbstatement:P31=Q11424`. A recall bug that fails
hardest on the canon is the worst possible failure distribution for this project.

## Map variety — a fix that only half worked

`pipeline/measure-maps.js` measures the *experience*: for every seed in the
corpus, what fraction of the resulting map is the same director, one edge type,
or interpretive. Nothing in the schema or the graph shape revealed this; the
corpus was connected, well-formed and factually impeccable while producing
maps that were six films by one director.

Measured on the record-first corpus, ranking by strength alone:

| | strength only | strength x surprise |
|---|---|---|
| same director (all 67 films) | 61% | 56% |
| maps that are 100% one director | 26 | 20 |
| avg year span of a map | 19 yrs | 22 yrs |
| **same director (19 films with >=3 cross-director candidates)** | **38%** | **23%** |
| readings surviving into the map (same 19) | 16% | 18% |

`rank()` now scores `strength x surprise`, penalising same-director,
same-decade and the ubiquitous `hand` type, with a two-per-director quota and a
guaranteed interpretive edge. Rashomon now opens on La Jetee rather than five
more Kurosawas; Blade Runner opens on Metropolis and 2001.

**But the headline number barely moved, and the reason matters more than the
fix.** Ranking cannot produce variety the corpus does not contain. Only 37% of
all candidate edges cross a director, and **48 of 67 films have fewer than
three cross-director candidates** while a map wants six links. Seeding 2046
still returns six Wong Kar-wai films because the corpus holds nothing else to
show. On the 19 films where there is an actual choice, the new ranking cuts
same-director share by 40% — so the mechanism is right and the supply is wrong.

`measure-maps.js` currently exits FAIL, correctly. It should stay failing until
the interpretive layer is grown; a green light here would be a lie.

Diagnosis error worth recording: this was first treated as a ranking problem
because the symptom appeared at the ranking layer. It is a corpus composition
problem. The instrument was built before the fix, which is the only reason the
misdiagnosis surfaced within the hour instead of after a redesign.

## The authored layer — written, and what it moved

93 authored edges now sit on the 147-edge record spine. They are split into two
kinds, because one author writing at volume needs the distinction more than a
hand-curated set did:

- **attested** (6) — someone involved said so, with attribution. Lucas on The
  Hidden Fortress; Tarkovsky on 2001; Nolan on 2001; Villeneuve on Lawrence of
  Arabia; Boyle on 2001; Garland on Tarkovsky. Confidence 0.6-0.99: a stated
  influence is evidence, but saying it does not make the structural claim true.
- **reading** (87) — interpretive claims about form. Arguable, and labelled so.

`validate-corpus.js` enforces the tiers: a record below confidence 1.0 is a
category error, an attested claim without attribution is refused, a reading at
confidence 1.0 is refused.

Measured effect on what a viewer actually sees:

| | record-only | + surprise ranking | + authored layer |
|---|---|---|---|
| average map that is the same director | 61% | 56% | **29%** |
| average map that is one edge type | 89% | 89% | **56%** |
| interpretive edges surviving into a map | 13% | 13% | **47%** |
| distinct relationship types per map | 1.46 | 1.46 | **2.81** |
| average year span of a map | 19 yrs | 22 yrs | **49 yrs** |
| maps that are 100% one director | 26 | 20 | **0** |
| average map size | 4.0 | 4.0 | **5.5** |

`measure-maps.js` now prints PASS. Late Spring (1949, Ozu) reaches Portrait of
a Lady on Fire (2019, Sciamma); 2046 reaches Vertigo, La Jetee and Inception.

### Register

Claims are written for someone who has not seen the film. Not simplified —
the specific formal thing is still named — but phrased so a newcomer can
picture it and decide whether to care. "Step-printed slow motion in crowded
corridors" became "crowds smeared into blur while one still figure holds
focus". A good claim should teach you how to watch the film.

### The limitation carried by this layer

These were written from criticism and description, not from having watched the
films. For documented influence that is fine and citable. For fine-grained
formal claims it is a real limit, and some of them will be wrong in ways a
viewer would catch instantly. The confidence values reflect it — the low ones
are low on purpose. `pipeline/write-readings.js` is the single file to edit;
the bench remains for anyone who wants to revise interactively.

### Two visual defects found while checking this work

- **Era palettes collapsed.** Every post-2007 film resolved to the same
  desaturated blue, because the era swatch had almost no chroma and the
  variation only shifted lightness. Rotating hue does nothing to a near-grey.
  Fixed with hue rotation plus saturation floors.
- **Composition picker was biased.** Five of seven cells on a map came out as
  the same crescent: xorshift's first draw is correlated with a poorly mixed
  seed. Fixed with a warm-up and an independently hashed selector. Spread
  across 67 films is now 16 / 16 / 19 / 16.

## The association engine (supersedes the hand-authored spine)

`pipeline/harvest.js` pulls structured attributes from Wikidata; `associate.js`
turns them into typed connections. No model, no hand-written claim, scales to
any corpus size. Claim text is generated from the overlap, so it is true by
construction.

**Rarity is the governing idea.** An association is interesting in proportion
to how rare the shared thing is, so every overlap is weighted by inverse
document frequency. "Both are drama" scores near zero; "Both adapt Dashiell
Hammett" scores near one. This is AGENTS.md rule 1 taken to its conclusion —
the more predictable a connection, the less the map cares.

Measured on 123 films: **1,001 generated edges, 0 tokens.** Found on its own:
A Fistful of Dollars / The Maltese Falcon (both Hammett), Au Hasard Balthazar /
Pickpocket (both Dostoyevsky), Cleo from 5 to 7 / Cries and Whispers (both
about a tumour), The Shining / Blade Runner (Joe Turkel in both). It also
independently rediscovered a pair I had hand-written earlier.

### Four guards, each added after a real failure

- **VACUOUS** — abstract subjects IDF rates as rare in a small corpus but which
  describe nothing ("human nature", "liberty").
- **ADMIN_TYPES** — settings checked against their own Wikidata type, so
  "set in Kyoto" survives and "set in Arizona" does not. Indistinguishable as
  strings; only the type separates them.
- **MAX_EDGES_PER_VALUE** — an attribute explaining more than four pairs is a
  category. Applied to strong signals only: capping the weak ties starves
  exactly the films that have nothing else.
- **raw Q-id filter** — any claim still containing `Q…` is dropped. A missing
  label means we do not know what we are asserting.

### Weak ties are load-bearing

Tuned purely for precision, the engine produced a median degree of 8 and left
**52 of 123 films with six or fewer connections** — a map shows six, so the
first click exhausted them and "Extend from this film" did nothing. That was
the user-visible bug. A network of strong ties is a set of islands; the weak
ones are what a person travels along. Adding two deliberately low-scoring
signals (shared unusual genre; same national cinema within nine years) and
exempting them from the per-value cap took it to **2 films below seven
connections**, median degree far higher, and extend now runs 7 → 13 → 19.

## Fixed: "Extend from this film" did nothing

Three defects stacked:

1. `lookup()` normalised "2001: A Space Odyssey (1968)" to `2001 a space
   odyssey 1968`, matching no key. The seed field passes a bare title; extend
   passes title + year. So every extend resolved to null. Years are now
   stripped and both forms tried — users type them too.
2. `resolve()` had no `exclude`, so it re-ranked the same six candidates, the
   caller filtered them all as duplicates, and nothing was added. Ranking now
   happens among films not yet on the map, which is the actual mechanic of
   exploring outward.
3. When extend legitimately finds nothing, the app said nothing. It now says so.

Worth recording: the first fix attempt failed silently because esbuild errored
and the harness kept serving a stale bundle. A build error that does not stop
the test is a test that lies.

## Next work, in order

1. Run the CSP probe inside the artifact. Settles the poster question in one
   page load.
2. ~~Generated readings~~ — done, and by hand rather than by pipeline. At 94
   edges the machinery would have cost more than the writing. Superseded note: The
   measured bottleneck is candidate supply, not selection: 48 of 67 films
   cannot fill a six-link map with anything but their own director's work. An
   offline pass should propose interpretive edges preferentially between films
   with *different* directors and in different components, constrained to
   titles already in the spine, with a refutation pass and a review queue.
   Target: every film carrying at least four cross-director candidates, which
   is what `measure-maps.js` needs to go green honestly.
3. Collapse dense filmography cliques so strength discriminates again.
4. Constellation ↔ Lineage layout morph (chronological x-axis).
5. Two-seed shortest path ("how do you get from Tarkovsky to Villeneuve").
6. Seen/unseen state — unwatched films as latent, undeveloped image.
7. Quadtree in `boxSeparation` before the corpus makes large maps common.

---



---

# Session: posters, descriptions, and 803 films

Three asks: colour via posters, more information per film, more films. All three
landed. What follows is what was measured, and what was not.

## The corpus went from 123 films to 803

`pipeline/seeds.txt` grew from 262 titles to 814, expanded along existing
clusters rather than scattered — the file's own rule, because a film added
beside nothing is an orphan. Kubrick went from 3 of 13 to complete; Bergman from
5 to 15; the Western, silent cinema, Polish and Czech New Wave, Ghibli, and
Chinese-language cinema went from single points to neighbourhoods.

**803 resolved, 8 unresolved, 7,219 generated edges.**

### The harvest had to be rewritten to get there

`harvest.js` makes one REST request per title plus one per referenced person,
place, genre and subject. At 67 films that was fine; at 814 it is roughly 6,000
sequential requests, and Wikidata progressively rate-limits an address over a
long session. Three runs stalled at 121, 125 and 121 films with sustained 429s.
This is the same wall the previous session hit and attributed to bad luck. It is
structural.

`pipeline/harvest-sparql.js` is the replacement: a graph query returns values
*and* their labels together, so ~6,000 requests collapse to ~40 and the entire
label-resolution stage disappears rather than being made faster. It writes a
byte-compatible `harvest.json` — `associate.js` cannot tell which produced it.

`harvest.js` is kept, working, as the fallback. The original comment warning
that query.wikidata.org is often unreachable from restricted networks is a real
risk, and the SPARQL path is not a replacement for that reason. It is also used
in the other direction: SPARQL matches labels and aliases *exactly*, so a seed
whose punctuation differs from Wikidata's ("The Good the Bad and the Ugly")
misses. Those stragglers — 29 of 814 — are handed to the REST resolver, which
ranks fuzzily and recovered 21. Two mechanisms, each covering the other's
failure mode.

**Operational note worth recording:** the sandbox runs under
`bwrap --die-with-parent`, so a detached background process dies with the shell
call that spawned it *if that call times out*. Two harvest runs were killed by
my own polling, not by Wikidata, and the 429s in the log made it look like the
opposite. Every stage is now cached and resumable, and the harvest is run in
short bursts rather than one long background job.

## Posters resolve at build time now, and that closes the poster question

The fork STATE.md described as "closed" in favour of generated artwork was
closed on a false premise: that photography required a live TMDB call, and
therefore a key, a whitelisted origin and a CSP exposure. It required a live
call only because the app was making one.

`pipeline/enrich.js` resolves posters and descriptions during the build from
Wikipedia, reached through the Wikidata sitelink already held — an identity, not
a title search, because the mollusc-genus failure mode applies here with equal
force. The URL is baked into `corpus.json`. **The shipped app makes no API call
and holds no key; the only request left is for an image.**

| | |
|---|---|
| posters | **790 / 803** |
| descriptions | **796 / 803** |
| licence: Commons (free) | 97 |
| licence: non-free fair use | **693** |
| lead image not portrait | 28 (a frame or photo, not a one-sheet — labelled, not rejected) |

**The licence split is the real cost and is not hidden.** Wikipedia hosts
non-free posters under its own fair-use claim, which does not extend to third
parties. `posterLicence` is carried per film so the exposure is auditable and
filterable. This is defensible for a personal or portfolio project and would
need replacing for a commercial one — `TMDB_KEY=... node pipeline/enrich.js`
does exactly that, at build time, with no other change.

## Rule 5 is now literally true for the first time

"Duotone from that film's own photography" was aspirational: no photography
existed at build time, so both colours came from an era table varied by a hash
of the title. Every post-2007 film was a variation on the same blue.

`pipeline/palette.py` reads each poster and derives the pair from the colours
actually in it. **719 of 803 palettes are now measured** (`paletteSource:
"poster"`); the rest keep the era default and say so.

Three failures found by looking rather than by reading numbers, each worth
recording because each looked fine in the statistics:

1. **The chroma metric multiplied coverage by saturation into one score.** A
   moderately saturated poster scored below a floor meant for coverage alone, so
   Suspiria, Chungking Express and The Grandmaster were all classified
   black-and-white. Separated into two independent tests.
2. **The dominant hue was being assigned to the shadow.** Whichever peak was
   brighter in the source became the highlight, which sounds principled and is
   not: on *In the Mood for Love* it handed the highlight to a small gold area
   and pushed the film's red into a near-black shadow. A famously red poster
   rendered olive-and-cream. The highlight is the bright end of the ramp and is
   what a viewer reads as the colour of the map, so it must carry the dominant
   chroma.
3. **A single coverage floor discards posters with the strongest colour idea.**
   Suspiria's poster is white paper with one red splash across ~3% of its area,
   and that splash is the entire design. There are now two ways to qualify:
   broad moderate colour, or a small area of intense colour.

None of these were visible in the pass/fail counts. All three were obvious in a
contact sheet of posters beside their derived swatches.

## The app draws from the corpus now

AGENTS rule 7 ("the corpus is the default") was settled but had never landed in
the component, which still called the model per seed. `window.__ATLAS_LINEAGE__`
is a hook the host runtime installs: the local build fetches `corpus.json` and
installs it in `main.jsx`; the artifact has no corpus, finds no hook, and falls
through to `askClaude` exactly as before. The single-file constraint survives and
there is no second copy of the resolver to drift.

The panel now carries the description, which STATE.md previously flagged as the
missing orientation for anyone landing on a title they do not know.

## Measured

| | 123 films | 803 films |
|---|---|---|
| films | 123 | **803** |
| generated edges | 1,001 | **7,219** |
| same director in a map | 29% | **9%** |
| avg map size | 5.5 | 5.9 |
| distinct types per map | 2.81 | 2.38 |
| avg year span | 49 yrs | 41 yrs |
| maps that are 100% one director | 0 | 3 |
| interpretive edges surviving | 47% | **3%** |
| components | 1 | 4 (800 + 3 orphans) |

`measure-maps.js` **exits FAIL**, and correctly. Same-director share improved by
a factor of three, but interpretive edges collapsed from 47% to 3%.

**This is arithmetic, not a ranking regression.** The 93 authored readings were
written for a 67-film corpus and still cover only those films; they now compete
against 7,219 record edges instead of 1,001. The interpretive layer did not get
worse, it got diluted. It should stay failing until that layer grows — a green
light here would be a lie, and STATE.md already says so.

Orphans: `The Round-Up`, `Earth`, `Elippathayam` — three films sharing nothing
measurable with the corpus. 28 films have fewer than seven connections, down
from 42% of the corpus to 3.5%.

## Verified, and how

| Claim | Evidence |
|---|---|
| Local build compiles | `vite build` → 598 modules, 223.46 kB, 74.31 kB gzipped |
| The corpus answers seeds and extends | `resolver.js` driven in Node against the real corpus: Chinatown, Suspiria, Persona, Sátántangó, Yi Yi, Tokyo Story, Solaris, 2001 — every one seeds 7 nodes and extends 7 → 13 → 19 → 25 |
| Posters and descriptions reach the render path | Same run: 6/6 links carry a poster and a description on every seed tested |
| The duotone treatment works on real posters | 18 posters rendered through a faithful reimplementation of the SVG filter (luminance `feColorMatrix`, 4-step discrete `feComponentTransfer`) at the real 92×138 cell size, and inspected |
| Palettes match their posters | Contact sheet of poster beside derived swatch, inspected across two iterations |

## NOT verified — and this is a real gap

**`validation/harness/probe.py` could not be run.** Headless Chromium needs
`libxdamage1` and this sandbox has no root, so the overlap, clipping, occlusion
and key-reachability measurements were not re-taken at 1440 / 900 / 390.

That matters more than usual here, because this session changed what fills a
cell. Every previous probe ran against generated artwork and TMDB posters at
`w342`. These are Wikipedia images at up to 640px with **28 known
non-portrait lead images**, and a landscape image in a 92×138 portrait cell is
exactly the kind of thing that reflows a caption into a neighbouring cell — the
defect class that survived a previous handoff. **Run `probe.py` before trusting
the layout.** It is the first thing to do, not the last.

Also unverified: behaviour past ~25 nodes (`boxSeparation` remains O(n²) per
tick), and whether generated claim quality holds at 803 films — the corpus is
6.5× larger than anything the claim guards were tuned against.

## Known data defects, found while checking

- **`Suspiria` → `Snow White and the Seven Dwarfs` is typed `descent`** from a
  P144 statement. Suspiria draws on the *fairy tale*; the edge points at the
  1937 Disney film. The claim is a faithful restatement of Wikidata and still
  misleading, which is the honest limit of "true by construction".
- Generated claims stay blunt where the subject is: "Both are about incest"
  (Chinatown / Oldboy) is accurate and tonally unlike the authored readings.
- `corpus.json` is now **3.6 MB** (~1 MB gzipped). Fine for a local build,
  heavy for a phone on a slow connection. Splitting the film index from the edge
  table, or dropping `also[]` alternates, would cut it substantially.

## Next work, in order

1. **Run `probe.py`** on a host with browser dependencies. Nothing else should
   be trusted about the layout until it passes.
2. **Grow the interpretive layer to match the corpus.** This is now the largest
   measured gap. Target pairs in different neighbourhoods, not uniformly.
3. **The entry surface.** Still no door: the site opens on a blank map and a
   text field, and 803 posters is a wall of images worth entering through.
4. Real URLs — `/film/persona` — so a map can be shared.
5. Trim the corpus payload, or split it.
6. Quadtree in `boxSeparation` before large maps are common.

---

# The publishable artifact

`artifact/atlas-artifact.jsx` — **329 KB, 340 films, 2,112 connections**, one
file with no imports beyond React and d3, which the artifact runtime provides.

## How it is built

```bash
node pipeline/pack-corpus.js --films 340 --degree 10 --desc 150 \
     --out static/corpus.packed.json
node scripts/build-artifact.js
```

`build-artifact.js` does not rewrite the component. It splices a corpus block in
after the imports which installs `window.__ATLAS_LINEAGE__` — the hook the
component already consults — and inlines `static/resolver.js` with its `export`
keywords stripped. Same component file, same resolver, one extra module-scope
side effect. There is no second copy of anything to drift.

## What the packer does, and the one thing it costs

Films become indices, types and directors become codes, the poster prefix is
factored out, `also[]` and `evidence[]` are dropped, and strengths round to two
decimals. All of that is invisible.

The lossy part is film selection, and getting it right took three attempts —
each of which looked correct in the totals:

1. **Top N by global degree.** A film can rank highly on twenty edges and then
   lose nineteen because its neighbours were not selected. Produced a corpus
   where **Yi Yi survived with zero connections** — present in the index,
   absent from the map — while Suspiria was cut outright.
2. **Greedy growth from the densest film.** Fixed the isolation and collapsed
   the corpus into one tradition: a Chinatown map extended into Wild at Heart,
   The Elephant Man, The Duellists and All the President's Men, an entirely
   Anglo-American run, while Persona, Yi Yi and Sátántangó were cut.
   Connectivity is densest wherever crew is most shared, so maximising it walks
   into New Hollywood and stays. **This is AGENTS rule 1's failure reappearing
   one layer down** — not in which edges a map draws, but in which films the
   corpus contains.
3. **Anchors, exempt from pruning.** Kept the named titles and stranded them:
   Touki Bouki survived with zero surviving edges. An anchor without its
   neighbourhood is a dead end wearing the costume of a destination.

What ships: anchors are a named list plus the best-connected film of each
decade; **each anchor's strongest neighbours are admitted before general growth
begins**; anchors are pruned like anything else if their neighbourhood still
does not survive, and the ones dropped are printed rather than hidden.

Result: minimum degree 6, 9 films below 7, 143 directors, 1916–2023.
**Yi Yi and Touki Bouki are dropped** at this size and the build says so.

## Verified

Bundled with esbuild and executed in a DOM harness:

- renders — `#root` populated, SVG mounted, 2 inputs, 3 buttons, **0 console errors**
- Chinatown, Suspiria, Tokyo Story, Stalker, Persona, Sátántangó, Cléo from 5 to 7,
  Parasite and Beau Travail each seed **6 links** carrying poster, description and palette
- extend chain runs **7 → 13 → 19 → 25 → 31**
- an unknown title returns null rather than a guess
- no `localStorage` or `sessionStorage`; the only `fetch` in the file is the
  model path, unreachable while the corpus hook is installed

## Not verified

**Whether the artifact sandbox serves the poster images.** This is the same CSP
question STATE.md has carried since the beginning, and it is now cheap to
settle: publish it and look. If posters are refused the map draws its composed
cells in each film's colours and names the refused origin in-app, so it
degrades rather than breaks — but the answer is one page load away and worth
taking.

---

# Rewrite: app/ replaces the React component

The previous build rendered a black screen in a real browser. It passed a jsdom
harness, which mounts React and evaluates the DOM but does no layout and no
paint — so it could confirm the app existed and never that anything was
visible. Two handoffs were validated with an instrument structurally incapable
of detecting the failure. The fix was not a better harness; it was opening the
file in a browser and looking at it.

## What changed

`app/template.html` + `app/build.js` produce one self-contained file. No React,
no d3, no bundler, no artifact/local dual build, no generator keeping two copies
in sync. 1.8 MB with the whole corpus, and it opens by double-clicking.

- **A front door.** The wall of posters, ordered by how much the map can *do*
  with a film rather than by fame, with era filters. The old build opened on an
  empty field and a text box, which asks a visitor to already know what they
  want.
- **A radial map instead of a force layout.** Physics gives jitter, unpredictable
  overlap and a different picture every time you ask the same question. A ring
  is stable and legible, and a 12-pass box separation guarantees clearance at
  any viewport — the caption-across-a-neighbour defect that survived two
  handoffs cannot recur, because clearance is measured rather than hoped for.
- **Relationship labels on the lines.** `RHYMES WITH`, `SHARES A HAND`,
  `ARRIVES WITH`. Behind a hover, the map is decorative until interrogated, and
  on a touch screen the one thing that makes it more than a pretty graph would
  never appear at all.
- **The thread.** Every film you pass through stays visible along the bottom and
  is clickable back. It is the record of a journey rather than a history menu,
  and it is the thing that makes another click feel like progress.
- **A recommender.** Loving a film scores every unseen neighbour by summed edge
  strength, so a film sitting between two of your favourites outranks one
  hanging off a single strong edge — and each suggestion carries the claim that
  produced it.
- **Deep links.** `#/film/chinatown` is a real address.

## Deliberate break with AGENTS rule 5

Posters are shown in full colour, not through the posterize+duotone screen
print. The treatment was the old authorship and it muddied 790 real one-sheets
into a single palette. Each film's measured colour now drives its edge, its
glow and its panel accent instead, so the palette work is still load-bearing —
it just stopped being applied to the photography.

## Verified in a real browser

Opened in Chrome on the user's machine and inspected: the wall paints, the map
draws seven films and six labelled curves, nothing overlaps, the panel no
longer covers the ring. Three defects were found by looking and would not have
been found any other way — the panel overlaying the map, ring nodes colliding
at real viewport heights, and edge labels landing on captions.

Harness checks alongside: 803 films, 7,312 edges, 0 overlapping pairs, 0 nodes
outside the stage, extend runs to 5 films deep, recommender fires, search
returns, 0 console errors.

## Still not verified

Touch behaviour on a real phone, and the app under an artifact runtime's CSP.

---

# Claim quality: what was measured, fixed, and what remains

The map looked robust and was not yet insightful. Measured across 120 seeds,
this is what a reader actually saw on the six lines of a map:

| | before |
|---|---|
| crew overlap | 38% |
| **genre + era ("Both are teen horror film, made 4 years apart")** | **17%** |
| subject | 16% |
| **cast trivia ("Giuliana Calandra appears in both films")** | **15%** |
| authored readings | 3% |
| shared source author / adaptation | 2% |

A third of every map was trivia, and the claims that would make a cinephile sit
up were 5%. They existed and were losing.

## The leak was a rule that looked like variety

Ranking guaranteed one edge of each type. The five types are not equally
informative — measured on this corpus:

```
descent      sameAuthor 46%, authored 30%, adaptation 25%    all good
rhyme        subject 70%, setting 21%                        good
hand         crew 67%, cast 30%                              mixed
convergence  genreEra 51%, countryEra 29%, genre 19%         100% trivia
```

**`convergence` is entirely genre-and-era coincidence.** Guaranteeing one of
every type therefore reserved a seat in every single map for the weakest thing
in the corpus. The rule reads as "show variety" and functioned as a trivia
quota.

Removing it and weighting by signal quality cut the measured trivia share from
54% to 35% on 200 seeds in an isolated harness. In the shipped app the headline
figure moved 36% → 36%, but the composition improved where it matters:
**genreEra fell from 17% to 4%** and subject, studio and authored edges rose.
The remaining share is `genre` and `cast`, which are weaker than crew and
better than era coincidence.

Two false starts worth recording, both of which made it worse and both of which
looked principled:

1. **A hard strong/weak signal partition** with a three-per-signal cap: 36% →
   43%. The cap starved the good bucket and pushed the shortfall into the weak
   one.
2. **Progressive relaxation with tighter caps**: → 46%. Same mechanism.

## Ranking is now at its floor, and the floor is supply

Seven ranking policies were measured across 200 seeds, including hard quotas of
at most one, and zero, trivia edges per map. **Every one returned 36%.** The
quota is never binding: a map wants six links and most films do not have six
non-trivial edges, so the shortfall is filled with whatever remains.

This is the same conclusion `measure-maps.js` reached about map variety and it
generalises: selection cannot produce quality the corpus does not contain. No
further ranking work is worth doing.

## What would actually move it

More discriminating attributes per film. The single highest-value addition is
**TMDB keywords** — "water rights", "unreliable narrator", "amnesia",
"los angeles" — which are far sharper than Wikidata's genre and subject fields
and would feed the existing rarity weighting directly. `pipeline/enrich.js`
already speaks TMDB and takes a key; the keyword endpoint is one more call per
film. There is no film-data connector in the MCP registry (checked), so this is
an API key rather than an integration.

Second: the authored layer still covers only the original 67 films.

---

# Session: environment move, and what the docs were lying about

Picked the project up in a new environment with no conversational context. The
handoff read cleanly, which is the point of it — but three of the things it
asserted were no longer true, and one of them was load-bearing.

## The shipped `atlas.html` was the old React build, and it was black

The file on disk was 4.3 MB and dated before the `app/` rewrite. It threw
`Minified React error #299`, left `#root` empty, and painted nothing — while
logging `corpus loaded — 803 films, 7312 edges` to the console first.

That is worth recording precisely because of how it fails: the data layer
reports complete success and the screen is black. It is the same shape as the
jsdom failure that cost two handoffs, and it survived because the deliverable
was never re-rendered after the rewrite replaced its generator.

`node app/build.js` regenerates it correctly at 2.0 MB. Verified by opening it
in a browser and looking: the wall paints, search resolves *Chinatown*, the map
draws with labelled curves, the panel opens.

## `--films` was broken by a space in the directory path

`app/build.js` shelled out to `pack-corpus.js` through `execSync` with the root
path interpolated unquoted. Under `/Users/.../FIlm Atlas - Claude/` that splits
on the space and dies with `Cannot find module '/Users/mick/Documents/FIlm'`.

The whole-corpus path never showed it, because `--films 0` does not shell out at
all. So the default build worked and the artifact build — the publishable
one — did not, on any checkout whose path contains a space. Now `execFileSync`
with an argv array, which never word-splits. Rebuilt and verified: 436 KB, 220
films, 1,268 edges, renders.

STATE's numbers for that build were right all along. Only the path was broken.

## Three documents disagreed with the code

- **README documented the dead build.** It still described `npm --prefix local
  install && vite build && node scripts/build-single.js` as the way to rebuild
  `atlas.html`. That command regenerates the black-screen React build. STATE
  documented `node app/build.js`. README is read first.
- **AGENTS rule 5 was reversed by HISTORY and never updated.** The rule mandated
  posterize + duotone on all imagery; the rewrite deliberately went to full
  colour and said so here. An agent told to read AGENTS first would have
  "restored" the treatment as a bug fix.
- **README's own briefing examples pointed at `local/` and a Constellation morph**
  that is not what STATE item 3 says any more.

All three are corrected. `artifact/`, `local/` and `scripts/` are now labelled
dead code in both README and STATE rather than presented as live paths.

The generalisable bit: this package keeps its narrative honestly and its
*instructions* went stale, because a rewrite updated the file describing what
changed and not the file telling you what to run. STATE and HISTORY were
accurate. README, the entry point, was not.

## Also

Put the whole thing under git, which it had not been. `.env` is ignored; the
poster corpus, the pipeline caches and the validation screenshots are tracked,
because re-harvesting them costs ~40 SPARQL queries and they are the evidence
behind STATE's claims.

---

# TMDB keywords: the number improved before the map did

STATE item 1 said the corpus was supply-limited and named TMDB keywords as the
single highest-value addition. That was correct. Getting there took one wrong
turn that is worth more than the result.

## Keywords are in

`enrich.js` fetches `/movie/{id}/keywords` alongside the search it already did,
so it is one extra cached call per film. 794/803 films matched TMDB, 779 carry
keywords, 11,757 in total, ~15 per film.

Poster replacement moved behind `TMDB_POSTERS=1`. Setting a key used to swap all
790 posters as a side effect, which made the keyword upgrade impossible to take
without also re-skinning the app and invalidating every measured palette. Two
independent decisions now have two switches.

## Rarity is the wrong test for a keyword, and it is the wrong test loudly

The first build reused the rarity weighting every other signal uses. The trivia
share fell 36.1% → 9.0% and the maps got worse:

```
Chinatown   -> Both turn on frustrated.
Tokyo Story -> Both turn on tea.          (with Brazil)
Tokyo Story -> Both turn on peace.        (with I Am Cuba)
Suspiria    -> Both turn on young woman.
```

Tokyo Story lost every Ozu and Japanese-cinema link to make room for those.

Measured on this corpus, "tea", "peace" and "young woman" occur twice each and
score idf 0.896. "neo-noir" occurs thirty times and scores 0.491. **A rare TMDB
keyword is usually rare because it is an incidental tag nobody else attracted,
not because it is distinctive** — the exact inverse of a Wikidata subject, where
rarity does track specificity. Ranking by rarity therefore selected precisely
the worst keywords, and raising the floor would have made it worse.

What separates signal from noise is agreement. 5,000 pairs share two keywords
and include "both turn on tea"; 816 share three and are almost all real:

```
Close Encounters / E.T.        flying saucer, alien, alien contact
Hereditary / Don't Look Now    funeral, loss of loved one, grieving
Ugetsu / Rashomon              japan, samurai, black and white, jidaigeki
Spartacus / Gladiator          gladiator, roman empire, slavery, ancient rome
```

So the rule is a minimum of three shared keywords, weighted by how many agree,
with rarity demoted to a tiebreak. 390 edges, 30.4% trivia, and Hereditary now
draws The Babadook, Rosemary's Baby, The Exorcist and The Wailing.

`MAX_EDGES_PER_VALUE` had to move with it: capping each keyword separately
treats "japan" as the claim and cost 1,105 candidate pairs all but 207 of their
edges. The cap now applies to the combination, which is what justifies the edge.

## The lesson is about the instrument, not the keywords

9.0% was not a lie; it was an honest measurement of the wrong thing.
`measure-claims.js` classifies trivia by SIGNAL, and the trivia had moved inside
a signal the list called good. Every guard in this project — the type quota, the
degree weighting, jsdom — has failed the same way: an instrument that cannot
observe the failure it is pointed at reports success.

The only reason it was caught is that the sampled maps were read. That step is
not optional and no aggregate replaces it.

`measure-claims.js` is now a permanent tool rather than the throwaway harness
the 36% came from. It reproduces the app's ranking exactly and fails loudly if
its weight table drifts from `app/template.html`. Its baseline against the
pre-keyword corpus is 36.1%, which is how we know it reproduces the documented
number and not some neighbouring one.

## Two bugs found on the way

**`enrich.js` silently destroyed 745 measured palettes.** `palette.py` writes
into `enrich.json`; `enrich.js` rewrites that file from scratch. Nothing errors,
the corpus still builds, and every film still has a colour — an era default
where a measured one used to be. It now carries palettes forward when the poster
URL has not changed, and prints the count so the loss cannot be silent again.

**Readings and records collided on the same pair.** `merge-corpus.js` appended
authored edges without checking whether the spine already covered that pair,
breaking the one-edge-per-pair guarantee `associate.js` maintains. The app walks
an adjacency list, so the same film appeared twice on a ring. Worse, the record
usually won on score: Alien -> Sunshine was about to show "Both turn on space
suit and space marine" instead of "a working crew rather than heroes, undone in
corridors" — precisely the collapse AGENTS rule 8 forbids. Readings now supersede
records on a shared pair and keep the record claim on `alsoRecord`.

`validate-corpus.js` had been keyed on pair+type, so it saw 5 of the 17 real
collisions and stayed quiet about the rest. Keyed on the pair alone it catches
all of them; the check was verified by deliberately reinjecting a cross-type
duplicate and confirming it reports.
