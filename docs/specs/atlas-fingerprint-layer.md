# ATLAS — Fingerprint Layer

**Spec for implementation. Suggested home: `docs/specs/atlas-fingerprint-layer.md`.**

Read `atlas/AGENTS.md` and `atlas/STATE.md` first. This spec adds a layer; it
does not replace the record layer or change the five edge types.

---

## 0. Correct the record before you start

`atlas/STATE.md` is stale and will mislead any agent that reads it. Measured
against `atlas/static/corpus.json` on this branch:

| STATE.md says | Actually |
|---|---|
| 803 films | **2,204** |
| 7,759 connections | **22,004** |
| trivia share 20.9% | **23.3%** (`pipeline/measure-claims.js`) |
| authored layer 803/803 films | **835/2,204 (38%)** |

The 2,204-film graph is live in `corpus.json` and `discovery.json`, despite the
discovery-foundation plan listing "the 803-film release stays the public
baseline" as a hard constraint. **Task 0: update STATE.md to the real numbers and
record whether the promotion was intended.** Do not start Task 1 until this is
done — everything below assumes 2,204.

---

## 1. What this layer is, and why

ATLAS currently answers *"what is this film connected to?"* with records: shared
crew, shared studio, shared genre. Measured, `crew` alone is **40.6%** of what a
reader sees on a map. That layer is true and it is shallow. It tells someone who
just watched *Hereditary* that Ari Aster also made *Midsommar* — which they knew.

The fingerprint layer answers a different question: **"what else feels like
this?"** Mood, tone, light, texture, the sound of the talking, what the film is
preoccupied with. Someone arrives from *Midsommar* and should find *The Wicker
Man* — not because they share a producer (they share nothing) but because both
hold their dread in daylight, inside a ceremony that will not stop.

### The rule that makes it work

**Adjectives do not compare. Coordinates do.**

Do not generate prose mood descriptions per film. The corpus already
demonstrates why: the `subject` field holds 1,050 distinct values, **760 of
which appear on exactly one film**. Free descriptive vocabulary fragments into
singletons, and singletons connect nothing.

Instead: **every film is scored on the same fixed axes, and tagged from the same
closed vocabulary.** Similarity then becomes arithmetic, comparable across the
whole corpus, and — critically — *explainable*, because you can name which axes
matched.

---

## 2. Data model

New file: `atlas/static/fingerprints.json`. Generated, never hand-edited.
Keyed by the same slug key as `corpus.films`, and carrying `filmId` for the
identity system.

```json
{
  "version": "fingerprint-1",
  "axisVersion": "axes-1",
  "vocabVersion": "themes-1",
  "films": {
    "hereditary": {
      "filmId": "film-xxxxxxxxxxxxxxxx",
      "axes": {
        "dread": 94, "cruelty": 78, "irony": 12, "gravity": 91,
        "alienation": 86, "ambiguity": 61,
        "agitation": 44, "urgency": 38, "excess": 66, "chaos": 71,
        "glare": 12, "saturation": 34, "warmth": 41, "ornament": 58, "hardness": 55,
        "restlessness": 31, "intimacy": 74, "cutRate": 29, "formalism": 72,
        "dialogueDensity": 48, "heightenedSpeech": 33,
        "scorePresence": 63, "soundDesign": 81, "loudness": 58
      },
      "axisConfidence": 0.72,
      "themes": ["grief", "inheritance", "family-as-trap", "cult", "ritual",
                 "possession", "the-house"],
      "source": "reading",
      "evidence": [
        "axes: scored from synopsis + 3 critical sources, calibrated against anchors",
        "themes: closed vocabulary v1"
      ],
      "scoredBy": "model:<model-id>",
      "scoredAt": "2026-08-09"
    }
  }
}
```

**`source` is always `reading`.** Never `record`. This layer is interpretation
and must be typographically distinguishable from a Wikidata fact for as long as
the corpus exists (AGENTS rule 3, rule 10). Sub-0.5 `axisConfidence` renders
dashed, same as any other reading.

---

## 3. The axes

24 axes, five groups. Every film scores **0–100 on every axis** — no nulls, no
"not applicable." A film with no score is a film that cannot be compared.

Each axis is written as `low pole ↔ high pole`, with a corpus film fixing each
end. **All anchor films below are verified present in `corpus.json`.** These
anchors are the scoring rubric: they define what 10 and 90 mean.

### A. Affect (6)

| Axis key | 0 ↔ 100 | Anchor low | Anchor high |
|---|---|---|---|
| `dread` | ease ↔ dread | *Chungking Express* | *Hereditary* |
| `cruelty` | tenderness ↔ cruelty | *Tokyo Story* | *Come and See* |
| `irony` | sincerity ↔ irony | *The Tree of Life* | *Pierrot le Fou* |
| `gravity` | levity ↔ gravity | *Playtime* | *The Passion of Joan of Arc* |
| `alienation` | communion ↔ isolation | *Yi Yi* | *Jeanne Dielman, 23 quai du Commerce, 1080 Bruxelles* |
| `ambiguity` | resolution ↔ ambiguity | *Goodfellas* | *Mulholland Drive* |

### B. Tempo & energy (4)

| Axis key | 0 ↔ 100 | Anchor low | Anchor high |
|---|---|---|---|
| `agitation` | stillness ↔ agitation | *Stalker* | *Man with a Movie Camera* |
| `urgency` | languor ↔ urgency | *Barry Lyndon* | *Mad Max 2* |
| `excess` | restraint ↔ excess | *Au Hasard Balthazar* | *The Devils* |
| `chaos` | order ↔ chaos | *2001: A Space Odyssey* | *Eraserhead* |

### C. Light & colour (5)

| Axis key | 0 ↔ 100 | Anchor low | Anchor high |
|---|---|---|---|
| `glare` | murk ↔ glare | *The Lighthouse* | *Midsommar* |
| `saturation` | desaturated ↔ saturated | *The Elephant Man* | *The Red Shoes* |
| `warmth` | cool ↔ warm | *Blade Runner* | *In the Mood for Love* |
| `ornament` | austerity ↔ ornament | *The Passion of Joan of Arc* | *Black Narcissus* |
| `hardness` | soft ↔ hard contrast | *Picnic at Hanging Rock* | *The Night of the Hunter* |

### D. Camera & cut (4)

| Axis key | 0 ↔ 100 | Anchor low | Anchor high |
|---|---|---|---|
| `restlessness` | static ↔ restless | *Ugetsu* | *Breathless* |
| `intimacy` | observational distance ↔ intimacy | *Playtime* | *Persona* |
| `cutRate` | long-take ↔ rapid-cut | *Sansho the Bailiff* | *Koyaanisqatsi* |
| `formalism` | naturalist ↔ arranged frame | *The 400 Blows* | *The Shining* |

### E. Sound & speech (5)

| Axis key | 0 ↔ 100 | Anchor low | Anchor high |
|---|---|---|---|
| `dialogueDensity` | sparse ↔ dense | *Le Samouraï* | *Network* |
| `heightenedSpeech` | naturalistic ↔ heightened | *Close-Up* | *The Seventh Seal* |
| `scorePresence` | unscored ↔ wall-to-wall | *The Conversation* | *Vertigo* |
| `soundDesign` | music-forward ↔ sound-design-forward | *Wings of Desire* | *Eraserhead* |
| `loudness` | quiet ↔ loud | *Tokyo Story* | *Apocalypse Now* |

**Axis hygiene.** After scoring, compute the corpus-wide standard deviation of
each axis. Any axis with **σ < 8** is dead — the model is defaulting, not
discriminating — and must be reported, not silently kept. Report it; do not
auto-delete.

---

## 4. Theme vocabulary

**Closed.** A theme tag not in this list is a **build failure**, not a new tag.
This is the single guard against the 760-singleton collapse. Growing the list is
a deliberate human act with a version bump, never a side effect of scoring.

Assign **4–8 tags per film.** Fewer than 4 means the film is under-described;
more than 8 means the tagger is hedging.

```
BODY & MIND
  bodily-transformation  illness  madness  addiction  ageing  desire
  possession  doubling  memory-loss  dreams

FAMILY & INHERITANCE
  grief  inheritance  family-as-trap  parenthood  siblings  childhood
  marriage-decay  abandonment  lineage-curse

POWER & SOCIETY
  class  bureaucracy  surveillance  colonialism  revolution  war
  occupation  propaganda  justice-denied  corruption  imprisonment
  labour

BELIEF
  faith  doubt  ritual  folk-belief  cult  martyrdom  prophecy
  the-sacred  superstition  apocalypse

CRIME & VIOLENCE
  murder  revenge  heist  gang  complicity  guilt  confession
  vigilantism  disappearance  the-hunt

SELF & OTHER
  alienation  loneliness  obsession  jealousy  betrayal  friendship
  first-love  unrequited-love  sexual-awakening  identity-loss

PLACE
  the-house  the-city  the-village  the-land  the-sea  the-road
  wilderness  the-institution  the-border  exile  the-commune

MAKING & SEEING
  performance  the-image  filmmaking  art-and-obsession  authorship
  spectatorship  fame  storytelling

TIME & FATE
  time-loop  prophecy-fulfilled  ageing-out  nostalgia  historical-rupture
  generational-change  the-last-day  inevitability

WORLD & MACHINE
  technology  artificial-life  space  ecological-collapse  contagion
  experiment  the-uncanny  transformation-of-nature
```

That is ~100 terms. Expand toward ~150 only from observed need — a tag you
wanted three times and could not express — and bump `vocabVersion`.

---

## 5. Scoring protocol

### 5.1 Calibration comes first

**Do not score 2,204 films before calibration passes.**

1. Mike hand-scores **40 anchor films** on all 24 axes and assigns their themes.
   (The 30 films named as anchors in §3, plus 10 chosen to span the space.)
2. **10 of those 40 are held out** and never shown to the scorer.
3. The scoring prompt receives the 30 visible anchors as few-shot calibration.
4. Score the 10 held-out films. Compute mean absolute error per axis.
5. **Gate: overall MAE ≤ 12 points, and no single axis above MAE 20.**
   If it fails, the axis definitions are ambiguous — fix the definitions, not
   the scores. Re-run.

Store hand scores at `atlas/pipeline/fingerprint-anchors.json`, hand-authored,
committed, and **exempt from regeneration**.

### 5.2 Scoring the corpus

New stage: `atlas/pipeline/fingerprint.js`. Cached and resumable per film, like
every other networked stage.

Input per film: title, year, director, country, Wikipedia description, TMDB
keywords from `pipeline/out/enrich.json`, and genre/subject/movement labels
from `pipeline/out/harvest.json`.

Output: the record in §2.

Requirements on the scorer:

- **Batch 8–12 films per call.** Single-film calls drift toward the middle of
  every scale; a batch forces relative judgment, which is what the axes measure.
- **Return `axisConfidence` per film**, and lower it explicitly when the source
  material is thin. A film with a two-line stub and no criticism must not score
  at the same confidence as *Vertigo*. This is the honesty valve for the long
  tail — 1,369 films currently carry no authored claim, and many are exactly
  this case.
- Never invent a theme tag. Reject and re-prompt on out-of-vocabulary output.
- Model choice: use the strongest available model here. This is low-volume,
  high-stakes-per-token work, and every downstream edge inherits its quality.

### 5.3 Fix the palette source while you are here

`paletteSource` is currently `poster` for most films. Posters are marketing
objects and frequently use colours the film never contains — which makes them
useless as evidence for the `warmth`, `saturation` and `glare` axes.

Pull **TMDB backdrops/stills** (actual frames), sample 5–8 per film, and measure
the palette from those. Keep the poster palette for the poster wall; use the
stills palette for the axes. Record which is which. This upgrades three axes
from guesswork to measurement, and it is a small change to `enrich.js` plus
`palette.py`.

---

## 6. Similarity and edge generation

New stage: `atlas/pipeline/fingerprint-edges.js`, running after
`associate.js` and before `merge-corpus.js`.

### 6.1 Distance

Axis distance is weighted Euclidean over normalised axes:

```
axisSim(A,B) = 1 - sqrt( Σ wᵢ · ((Aᵢ - Bᵢ)/100)² / Σ wᵢ )
```

Default group weights — tune only with measurement, never by feel:

```
Affect          1.4    (the thing people actually mean by "feels like")
Light & colour  1.2
Sound & speech  1.0
Tempo & energy  1.0
Camera & cut    0.8    (craft-legible, less felt by a general viewer)
```

Theme similarity is **IDF-weighted Jaccard** — rare shared tags count, common
ones barely do:

```
idf(t)      = log(N / filmsCarrying(t))
themeSim    = Σ idf(t ∈ A∩B) / Σ idf(t ∈ A∪B)
```

**Rarity guard:** any tag carried by more than **15% of the corpus** contributes
zero. This is the direct fix for the existing genre problem — `drama film`
covers 1,526 of 2,204 films and generates pure noise. Do not let themes repeat
that failure.

```
fingerprintScore = 0.55 · axisSim + 0.45 · themeSim
```

### 6.2 Edge emission

- Emit as type **`rhyme`**. Fingerprint similarity is formal resonance, not
  lineage. **Never emit `descent` or `rebuttal` from this layer** — those remain
  record-only, and the fact that they are currently 1.2% and 0.3% of the graph
  is a separate problem this spec does not solve.
- `source: "reading"`, `confidence = min(axisConfidence_A, axisConfidence_B)`.
- Emit only above `fingerprintScore ≥ 0.72`, capped at **6 fingerprint edges per
  film**, keeping the highest scores. Uncapped, the dense middle of the space
  will swamp every map.
- **Cross-cluster bonus:** if the pair shares no director, no crew member, no
  studio and no country, multiply the score by 1.15 before ranking. These are
  the edges that take a viewer somewhere they would not have gone, which is the
  entire point.

### 6.3 The discriminator — do not skip this

For every emitted edge, record the **3 axes with smallest difference** and the
**2 with largest**:

```json
"matched": ["dread", "ritual-adjacent themes", "gravity"],
"diverged": ["glare", "saturation"]
```

Divergence is not a defect to hide. *Hereditary* and *Midsommar* share dread,
grief and cult while sitting at opposite ends of `glare` — and saying so is more
useful to a viewer than pretending they are the same. The panel should be able
to render "same dread, opposite light."

---

## 7. Claim text

Claims are **rendered from matched axes and shared tags**, not freely generated.
This is what keeps a reading auditable rather than invented (AGENTS rule 3).

Template shape:

```
<shared affect phrase>, <shared theme phrase>. <divergence clause, if strong>
```

Worked example — *Midsommar* ↔ *The Wicker Man*:

> Both hold their dread in full daylight, inside a ceremony that will not stop.

Worked example — *Hereditary* ↔ *Midsommar*:

> The same grief and the same cult, lit from opposite ends: one in shadow, one
> in unbroken white.

A small phrase bank per axis-pole and per theme, composed by rule. Register per
`atlas/AGENTS.md`: written for someone who has not seen the film, naming the
specific formal thing, teaching them how to watch it.

---

## 8. Files and order

```
atlas/pipeline/fingerprint-anchors.json   NEW  hand-authored, never regenerated
atlas/pipeline/theme-vocab.json           NEW  closed list from §4
atlas/pipeline/fingerprint.js             NEW  scores the corpus, cached/resumable
atlas/pipeline/fingerprint-edges.js       NEW  similarity -> rhyme edges
atlas/pipeline/enrich.js                  EDIT stills for palette
atlas/pipeline/palette.py                 EDIT measure from stills, keep poster palette separately
atlas/pipeline/merge-corpus.js            EDIT fold fingerprint edges in
atlas/pipeline/validate-corpus.js         EDIT gates from §9
atlas/static/fingerprints.json            NEW  generated
```

Rebuild order:

```bash
node pipeline/harvest-sparql.js pipeline/seeds.txt
node pipeline/enrich.js
python3 pipeline/palette.py
node pipeline/fingerprint.js            # new — calibration gate must pass first
node pipeline/associate.js
node pipeline/fingerprint-edges.js      # new
node pipeline/merge-corpus.js
node pipeline/validate-corpus.js && node pipeline/measure-maps.js
node pipeline/measure-claims.js
```

---

## 9. Validation gates

Every one of these must fail when deliberately broken before you trust it — per
`atlas/AGENTS.md`, a check you have not seen fail is a check that lies.

1. **Calibration.** Held-out MAE ≤ 12 overall, ≤ 20 on every axis. Hard gate.
2. **Coverage.** All 2,204 films carry all 24 axes and 4–8 in-vocabulary themes.
   Any out-of-vocabulary tag fails the build.
3. **Axis liveness.** Report every axis with σ < 8 across the corpus.
4. **The Hereditary/Midsommar test.** The pair must score high on affect and
   theme while differing on `glare` by **≥ 40 points**. If your system cannot
   express that difference, the axes are not doing their job.
5. **The Midsommar/Wicker Man test.** *The Wicker Man* must appear in
   *Midsommar*'s top 8 fingerprint neighbours. This is the stated product goal;
   it is a pass/fail.
6. **Cross-tradition reach.** ≥ 30% of emitted fingerprint edges must join films
   from different countries. Below that, the layer is re-describing the crew
   graph in prettier language.
7. **Trivia share.** Re-run `measure-claims.js`. It is 23.3% today. Adding a
   layer that does not move it down means the layer is decoration.
8. **Real browser.** 1440, 900, 390 px, panel open and closed. jsdom will
   confirm a black screen renders. It has done so twice on this project.

---

## 10. Do not

- Do not write per-film prose mood descriptions. That is the 760-singleton
  failure with better adjectives.
- Do not let the theme vocabulary grow during scoring.
- Do not mark any of this `record`.
- Do not emit `descent` or `rebuttal` from fingerprints.
- Do not delete the existing weak crew/genre/era edges. Measured: removing them
  makes 42% of films dead ends on first click. Rank them below fingerprint
  edges; never remove them.
- Do not tune the weights in §6.1 before the calibration gate passes. Ranking
  cannot create quality the scores lack — seven ranking policies were already
  measured on this project and all returned the same number.
```
