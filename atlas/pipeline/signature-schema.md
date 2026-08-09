# The cinematic signature — schema

What a deep research pass must produce for each film, and why it is shaped like
this rather than like a profile.

## The rule that determines everything

**The association engine compares fields. It cannot compare essays.**

A beautiful 800-word account of *Kes* produces exactly zero edges. What produces
edges is a *closed vocabulary* two films can agree on. So every field below is
an enum or a small set drawn from an enum — never free prose. Prose belongs in
the claim, which is written afterwards from the agreement, not instead of it.

## The three tests a field must pass

A field earns its place only if it clears all three. Most candidate fields fail
at least one, and cutting them is the work.

1. **Formal, not industrial.** It describes how the film behaves on screen, not
   who was paid to make it. `crew` is already 40.6% of what a reader sees, and
   "shares a cinematographer" is checkable and teaches nothing. The corpus does
   not need more of that.
2. **Discriminating.** A value 80% of films share carries no information. A
   value 2% share may be noise. Target roughly **5–35% prevalence** per value,
   measured after the trial — and a field whose values all land outside that
   band gets cut, not kept out of sentiment.
3. **Sourceable.** Someone can check it. If it cannot be sourced it is not
   deleted — it is demoted to a `reading` with its confidence set accordingly.
   AGENTS rule 8 already draws this line; ingest has to respect it.

## Fields

Every field carries `{ value, confidence, source }`. `source` is a citation or
the literal string `inferred`. `confidence` is 0–1.

### Image
| field | vocabulary |
|---|---|
| `shotLength` | `very-long-take · long · measured · brisk · rapid` |
| `cameraMotion` | `static · pan-tilt · dolly · handheld · steadicam · crane · zoom-led` |
| `framing` | `wide-tableau · medium-dominant · close-dominant · varied` |
| `cameraHeight` | `low · eye · high · overhead · mixed` |
| `colour` | `bw · bw-high-contrast · desaturated · naturalistic · saturated · monochrome-tinted · two-strip · three-strip` |
| `light` | `available · naturalistic · expressionist · high-key · low-key · single-source` |
| `depth` | `deep-focus · shallow · rack-focus-led · flat` |

### Structure
| field | vocabulary |
|---|---|
| `chronology` | `linear · flashback-framed · non-linear · looping · parallel · anthology` |
| `pov` | `single · dual · ensemble · roving · unreliable · omniscient` |
| `narration` | `none · voiceover-protagonist · voiceover-external · intertitles · direct-address` |
| `ending` | `resolved · open · circular · ironic-reversal · abrupt · elegiac` |
| `duration` | `under-80 · 80-110 · 110-150 · 150-200 · over-200` |

### Performance and sound
| field | vocabulary |
|---|---|
| `performance` | `non-professional · naturalistic · stylised · theatrical · deadpan · improvised` |
| `score` | `none · diegetic-only · sparse · continuous · leitmotif · pop-needle-drop · dissonant` |
| `soundDesign` | `naturalistic · designed-foregrounded · silence-used · post-synced · location-sync` |

### Place and making
| field | vocabulary |
|---|---|
| `space` | `location · studio-constructed · single-set · landscape-dominant · urban-street · domestic-interior` |
| `register` | `realist · melodrama · absurdist · satirical · lyrical · documentary-hybrid · genre-formal · essayistic` |

### Free lists, bounded
| field | shape |
|---|---|
| `formalDevices` | ≤ 6 from a **shared controlled list**, grown deliberately and never ad hoc — `long-take-choreography`, `jump-cut`, `freeze-frame`, `split-diopter`, `direct-sound`, `found-footage`, `tableau-staging`, `depth-staging`, `subjective-camera`, `step-printing`, `slow-motion-emphasis`, `static-frontal`, `elliptical-cutting`, `sound-bridge`, `long-lens-compression`, `wide-angle-distortion` |
| `preoccupations` | ≤ 4, controlled list, and deliberately NOT genre or theme-in-general — the thing the film keeps returning to formally |

## What is deliberately absent

- **Genre.** Already in `discovery.json`, already a facet, and already known to
  make bad edges and good terrain. It is not a signature field.
- **Themes as prose.** "Explores alienation" pastes between ten unrelated films
  without becoming wrong — it fails the project's own test for a claim.
- **Quality, rating, importance, influence-score.** Fame must never enter the
  graph (AGENTS rule 1). A signature describes a film; it does not rank it.
- **Anything derivable from credits.** The pipeline already has those and they
  are the problem, not the solution.

## Coverage is honest, not uniform

Canonical films will fill 18 fields; obscure ones may fill 5. **That is the
correct outcome and must not be papered over.** An unfilled field is `null`, not
a guess. Every signature carries `filled` (how many fields), so a downstream
edge can weight agreement by how much was actually known — two films agreeing on
five fields out of six known is much stronger evidence than two agreeing on five
out of eighteen.

## How signatures become edges

Agreement on **rare combinations**, never on single common values. Two films
sharing `colour: naturalistic` is nothing; two sharing
`{ performance: non-professional, space: location, light: available,
soundDesign: location-sync }` is neorealist practice and a real formal bond.

The existing `surprise()` machinery in `associate.js` already does exactly this
job for keywords — a Poisson tail against the overlap the corpus's own
frequencies predict — and it is the one signal STATE.md records as genuinely
scale-free. Signature agreement should route through it rather than inventing a
second scoring path.

## The trial

50 films, chosen as the highest-degree films carrying no authored claim, so the
pass is measured where it would matter most. Success is judged on those films'
maps, against themselves today:

- `crew %` of what a reader sees — currently 40.6% corpus-wide
- trivia share — currently 23.0%
- repeated-line rate — currently 6.3%
- per-field prevalence, to cut the fields that failed test 2

**A field that does not move those numbers gets deleted.** The point of a trial
is that it can fail.
