# ATLAS — Fingerprint Layer, Addendum v1.1

**Applies on top of `atlas-fingerprint-layer.md`. Bump `axisVersion` to
`axes-1.1`, `vocabVersion` to `themes-1.1`, and add `registerVersion:
"registers-1"`.**

Everything in the base spec still stands. This adds what was missing: the
spiritual/emotional register, comedy, the cerebral–visceral distinction,
narrative shape, and — most importantly — a way to express compound labels like
*cerebral horror* and *cyberpunk mood* without fragmenting the vocabulary.

All anchor and example films named below are verified present in
`static/corpus.json`.

---

## A. Sort the request into three kinds of thing

The descriptors people reach for are not one category, and flattening them into
one tag list is how this collapses. Three kinds, three homes:

| Kind | Example | Where it lives |
|---|---|---|
| **Scalar quality** — every film has some amount | *dialogue dense*, *sparse dialogue*, *comedic*, *cerebral*, *spiritual* | **Axis** (§B) |
| **Compound label** — a named region of the space | *cerebral horror*, *cyberpunk mood*, *folk horror*, *family drama*, *surrealism* | **Register** (§C) — derived, never assigned |
| **Documented relation** — a fact about one film citing another | *influenced by* | **Not here.** Record layer, `descent`/`rebuttal` edges, director-keyed research |

**"Influenced by" must not enter the fingerprint.** It is a checkable record with
a citation; the fingerprint is a reading. Collapsing them is exactly the failure
`AGENTS.md` rule 10 forbids, and once they share a field nothing downstream can
tell them apart. It stays in the separate influence pass.

---

## B. New axes → 30 total

Add group F from the earlier note plus four to group A.

### F. Narrative (2) — new group

| Axis key | 0 ↔ 100 | Anchor low | Anchor high |
|---|---|---|---|
| `fracture` | linear ↔ fractured chronology | *Tokyo Story* | *Mulholland Drive* |
| `dreamLogic` | causal ↔ dream logic | *The Conversation* | *Stalker* |

### A. Affect — four additions

| Axis key | 0 ↔ 100 | Anchor low | Anchor high |
|---|---|---|---|
| `transcendence` | worldly ↔ transcendent | *Goodfellas* | *Andrei Rublev* |
| `humour` | humourless ↔ comedic | *Come and See* | *Playtime* |
| `cerebral` | visceral ↔ cerebral | *The Texas Chain Saw Massacre* | *2001: A Space Odyssey* |
| `sensuality` | ascetic ↔ sensual | *Le Samouraï* | *In the Mood for Love* |

**Why these four and not more.** `transcendence` is the only way "spiritual"
becomes comparable — it separates *Andrei Rublev* from *Goodfellas* on a
dimension no other axis touches. `humour` is deliberately distinct from
`gravity`: *Chungking Express* is light without being comedic, and a single axis
cannot say both. `cerebral` is what makes *cerebral horror* computable rather
than a hand-applied label. `sensuality` distinguishes films that are otherwise
adjacent — *In the Mood for Love* and *The Conversation* share restraint,
stillness and longing, and diverge almost entirely here.

### New gate: axis correlation

30 axes is more than this space probably supports, and some of the above will
turn out to be duplicates. After scoring, compute the Pearson correlation
between every axis pair across the corpus.

**Any pair with |r| > 0.85 is one axis wearing two names.** Report every such
pair with a recommendation to merge. Expect to finish somewhere near 22–25 live
axes. Do not auto-merge; surface it for a human call.

This gate plus the σ < 8 liveness gate from the base spec are what keep axis
inflation honest. Add axes freely; let the measurement prune them.

---

## C. Registers — the layer that was missing

*Cerebral horror*, *cyberpunk mood*, *folk horror*, *family drama*, *slow
cinema* — people search and think in these terms, and they are the natural
browsing surface for the site. But they must **not** be a hand-assigned tag
list. Assigned per film by a model, they fragment (*cerebral horror*,
*intellectual horror*, *elevated horror*, *psychological horror* — four labels,
one idea, zero shared edges).

**A register is a named region of the fingerprint space, defined by a rule.**
Computed at build time, never stored per film, never scored.

### Schema

`atlas/pipeline/registers.json`, hand-authored:

```json
{
  "id": "cerebral-horror",
  "label": "Cerebral horror",
  "blurb": "Dread that works on the mind before the body.",
  "requires": { "themes_any": ["the-uncanny", "madness", "possession", "murder"] },
  "axes": {
    "dread":    { "min": 65 },
    "cerebral": { "min": 60 },
    "loudness": { "max": 55 },
    "ambiguity":{ "min": 55 }
  },
  "weight": 1.0
}
```

A film carries a register when it satisfies every constraint. Assign at most
**3 registers per film**, ranked by margin (how far inside the region it sits).
Films matching none carry none — that is fine and honest.

### Why this is the right shape

- **No scoring cost.** Registers are free once axes exist.
- **Cannot fragment.** The list is closed and small.
- **Auditable.** You can show *why* a film is cerebral horror — the four numbers
  are right there. Nothing else in the project can do that.
- **Correctable in one place.** If *The Wicker Man* isn't landing in folk
  horror, you edit one rule, not 2,204 records.
- **Doubles as navigation.** Each register is a browsable page: every film in
  the region, which is exactly the "I want more like this, but as a category"
  request.

### Starter register list (~46)

Tune thresholds after the anchor scoring lands. Example films are verified in
corpus and should be used as fixtures in tests.

**Horror & dread**
| Register | Shape | Fixtures |
|---|---|---|
| Cerebral horror | dread↑ cerebral↑ loudness↓ ambiguity↑ | *Cure*, *Don't Look Now* |
| Folk horror | dread↑ + `folk-belief`/`ritual` + `the-village`/`the-land` | *The Wicker Man*, *The Witch*, *Midsommar* |
| Sun-bleached dread | dread↑ **glare↑** | *Midsommar*, *Picnic at Hanging Rock* |
| Gothic murk | dread↑ glare↓ ornament↑ | *Suspiria*, *Black Narcissus* |
| Body horror | dread↑ cerebral↓ + `bodily-transformation` | *Videodrome*, *Possession* |
| Cosmic dread | dread↑ transcendence↑ ambiguity↑ | *Stalker*, *Under the Skin* |
| Slasher tension | dread↑ urgency↑ cerebral↓ | *Halloween*, *The Texas Chain Saw Massacre* |
| Haunted house | dread↑ + `the-house` | *The Shining*, *Hereditary* |

**Mind & meaning**
| Register | Shape | Fixtures |
|---|---|---|
| Philosophical | cerebral↑ dialogueDensity↑ transcendence↑ | *The Seventh Seal*, *Solaris* |
| Spiritual austerity | transcendence↑ ornament↓ excess↓ | *Au Hasard Balthazar*, *Andrei Rublev* |
| Surrealism | dreamLogic↑ fracture↑ chaos↑ | *Eraserhead*, *Mulholland Drive* |
| Metafiction | + `filmmaking`/`the-image`/`storytelling`, fracture↑ | *Close-Up*, *Persona* |
| Slow cinema | agitation↓ cutRate↓ urgency↓ dialogueDensity↓ | *Jeanne Dielman, 23 quai du Commerce, 1080 Bruxelles*, *Stalker* |
| Absurdist | humour↑ dreamLogic↑ irony↑ | *Playtime*, *Daisies* |

**Intimate & domestic**
| Register | Shape | Fixtures |
|---|---|---|
| Family drama | gravity↑ intimacy↑ + `family-as-trap`/`parenthood`/`siblings` | *Tokyo Story*, *Yi Yi* |
| Marriage in decay | + `marriage-decay`, cruelty↑ dialogueDensity↑ | *Scenes from a Marriage*, *Cries and Whispers* |
| Chamber drama | intimacy↑ agitation↓ dialogueDensity↑ ornament↓ | *Persona*, *Autumn Sonata* |
| Coming of age | + `childhood`/`sexual-awakening`, warmth↑ | *The 400 Blows*, *A Brighter Summer Day* |
| Aching romance | sensuality↑ gravity↑ + `unrequited-love`/`first-love` | *In the Mood for Love*, *Happy Together* |
| Domestic realism | formalism↓ excess↓ heightenedSpeech↓ | *A Separation*, *Late Spring* |

**City, crime & paranoia**
| Register | Shape | Fixtures |
|---|---|---|
| Paranoid thriller | dread↑ cerebral↑ + `surveillance`/`corruption` | *The Conversation*, *The Parallax View* |
| Noir fatalism | glare↓ hardness↑ ambiguity↑ + `guilt`/`betrayal` | *The Third Man*, *Chinatown* |
| Cool crime procedural | excess↓ dialogueDensity↓ agitation↓ + `heist`/`gang` | *Le Cercle Rouge*, *Rififi* |
| Street violence | urgency↑ agitation↑ cruelty↑ | *Goodfellas*, *City of God* |
| Bureaucratic dread | + `bureaucracy`/`the-institution`, glare↓ humour↑ | *Brazil*, *Ikiru* |

**Future & machine**
| Register | Shape | Fixtures |
|---|---|---|
| Cyberpunk mood | warmth↓ glare↓ + `technology`/`the-city`, alienation↑ | *Blade Runner*, *Akira*, *Ghost in the Shell* |
| Cold science fiction | cerebral↑ transcendence↑ loudness↓ + `space`/`experiment` | *2001: A Space Odyssey*, *Solaris* |
| Dystopian satire | humour↑ irony↑ + `bureaucracy`/`propaganda` | *Brazil*, *Dr. Strangelove* |
| Post-apocalypse | + `apocalypse`/`the-road`, saturation↓ | *Mad Max 2*, *12 Monkeys* |
| Artificial life | + `artificial-life`/`identity-loss`, cerebral↑ | *Blade Runner*, *Ghost in the Shell* |

**Scale & spectacle**
| Register | Shape | Fixtures |
|---|---|---|
| Epic gravity | gravity↑ ornament↑ urgency↓ runtime long | *Barry Lyndon*, *Andrei Rublev* |
| War as attrition | cruelty↑ loudness↑ + `war` | *Come and See*, *Apocalypse Now* |
| Wilderness obsession | + `wilderness`/`obsession`, excess↑ | *Aguirre, the Wrath of God*, *Fitzcarraldo* |
| Visual symphony | dialogueDensity↓ cutRate↑ transcendence↑ | *Koyaanisqatsi*, *Man with a Movie Camera* |
| Landscape reverie | agitation↓ warmth↑ transcendence↑ | *Days of Heaven*, *The Tree of Life* |

**Voice & tone**
| Register | Shape | Fixtures |
|---|---|---|
| Talk-driven | dialogueDensity↑ agitation↓ formalism↓ | *Network*, *The Mother and the Whore* |
| Near-wordless | dialogueDensity↓ soundDesign↑ | *Le Samouraï*, *Under the Skin* |
| Deadpan | humour↑ excess↓ agitation↓ | *Playtime*, *Stroszek* |
| Operatic excess | excess↑ loudness↑ ornament↑ | *The Devils*, *The Red Shoes* |
| Restless new wave | restlessness↑ irony↑ formalism↓ | *Breathless*, *Pierrot le Fou* |
| Heightened theatre | heightenedSpeech↑ formalism↑ ornament↑ | *The Seventh Seal*, *The Passion of Joan of Arc* |
| Sardonic crime comedy | humour↑ cruelty↑ irony↑ | *The Big Lebowski*, *The Long Goodbye* |
| Melancholy drift | gravity↑ urgency↓ alienation↑ warmth↓ | *Paris, Texas*, *Wings of Desire* |

**Register hygiene.** After the first build, report: registers matching **zero**
films (rule too tight), and registers matching **more than 12%** of the corpus
(rule too loose). Both are bugs in the rule, not in the corpus.

---

## D. Derived badges

Do not store *dialogue dense* or *sparse dialogue* as tags — they are already
axis extremes. Render them from the axes at display time:

```
dialogueDensity ≥ 80  →  "dialogue-dense"
dialogueDensity ≤ 20  →  "near-wordless"
cutRate         ≤ 20  →  "long-take"
agitation       ≤ 20  →  "still"
glare           ≥ 80  →  "daylight"
glare           ≤ 20  →  "murk"
saturation      ≤ 20  →  "desaturated"
humour          ≥ 75  →  "comedic"
cerebral        ≥ 75  →  "cerebral"
transcendence   ≥ 75  →  "spiritual"
sensuality      ≥ 75  →  "sensual"
dreamLogic      ≥ 75  →  "dream-logic"
```

One source of truth, no drift, and the badge and the number can never disagree.

---

## E. What this changes in the panel

The film panel should now open with **registers + badges + palette**, before any
edge. That is the "learn what this film feels like" surface, and it works for
every film in the corpus including the 1,369 with no authored claim:

> **Hereditary** (2018)
> *Haunted house · Cerebral horror*
> murk · desaturated · still · dread
> grief, inheritance, family-as-trap, cult

Palette swatches come from the stills-derived measurement (base spec §5.3), not
the poster.

---

## F. Added gates

9. **Axis correlation.** Report every pair |r| > 0.85. Human decides merges.
10. **Register coverage.** Report registers matching 0 films or > 12% of corpus.
11. **Register fixtures.** Every fixture film named in §C must actually receive
    its register. A rule that does not capture its own example is wrong — fix
    the thresholds, not the fixture list.
12. **Badge/number agreement.** Assert no film displays a badge its axis score
    does not support. Break it deliberately once and confirm the check fires.
