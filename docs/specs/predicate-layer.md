# Proposal — the predicate layer

Status: **prototype run, not merged.** Nothing in `corpus.json` changed.

## The problem, stated as a measurement

ATLAS has two descriptive layers built or specified:

| layer | what it encodes | where |
|---|---|---|
| signature | how the film behaves on screen | `pipeline/signature-schema.md` |
| fingerprint | the film's temperature — dread, cruelty, irony, ambiguity, fracture | `static/fingerprints.json`, 2,198 films |

Neither encodes **what happens between the people in it.** That is the layer a
viewer means when they say two films are related, and its absence is measurable.

Take *The Banshees of Inisherin* and rank all 1,531 fingerprint-scored films by
Euclidean distance in the five-axis space:

```
  1.   2.8   Ex Machina
  2.  11.5   Miller's Crossing
  3.  12.2   A History of Violence
```

*Ex Machina* is the nearest film in the corpus, at a distance of 2.8 out of a
possible ~200. The numbers are not wrong — both are cold, cruel, ironic
two-handers in which someone is shut out — but no viewer asking for films like
*Banshees* wants it.

Meanwhile the two strongest human answers to that question land here:

```
  # 973 of 1531   Y tu mamá también
  #1286 of 1531   Old Joy
```

*Old Joy* — a friendship that ends without either man saying so — sits in the
**bottom 16%** of the corpus by fingerprint distance. This is not a calibration
problem. Distance in a temperature space is measuring a different thing, and
tuning it will not produce these edges, because the information is not present.

## The unit: a relational predicate

Not another vector. A named **predicament**, with roles, an outcome and a
per-film basis. `pipeline/predicates.json` holds a 16-entry seed vocabulary.

```json
{ "id": "bond-severed-unilaterally",
  "label": "One party ends the bond and will not give a reason the other can accept",
  "roles": ["severing", "severed"],
  "axis": "wound",
  "estPrevalence": 0.012 }
```

Per film:

```json
{ "predicate": "bond-severed-unilaterally", "role": "severed",
  "centrality": 1.0, "outcome": "unrestored",
  "basis": "Colm simply informs Padraic that he no longer likes him, and never
            produces a reason Padraic can hold on to." }
```

Four properties earn it its place:

1. **Co-occurrence, not distance.** A predicate is a shared object. Two films at
   opposite ends of the temperature space can land on the same predicament —
   which is precisely the edge that lets a viewer travel out of their tradition,
   and the stated purpose of the authored layer.
2. **The claim writes itself, in register.** Composed from the two `basis`
   sentences, so it names the specific instantiation in each film rather than
   pasting a template. This is the `signature-schema` rule — prose belongs in
   the claim, written afterwards from the agreement — applied to situations.
3. **It generates `rebuttal` edges.** Same predicate, opposed outcome, is a film
   arguing with another film. Those currently have to be hand-authored pair by
   pair; this makes them fall out of the tagging.
4. **It answers the `crew` problem.** 40.3% of what a reader sees is "shares a
   cinematographer". A predicate edge is formal, not industrial, and teaches you
   how to watch the film.

## Order of operations — the rule that must not be broken

```
1. the predicate SELECTS the family     (co-occurrence — a hard filter)
2. the fingerprint ORDERS it            (tonal distance — sort and tiebreak only)
```

Tonal distance must never enter the strength score. If it does, the ranking
collapses back onto the fingerprint and the layer has been rebuilt as the thing
it exists to replace. `associate-predicates.js` enforces this and says so at the
call site. The fingerprint is not wasted by this proposal — it is promoted from
a bad selector to a good sorter.

## Prototype result

```bash
node pipeline/associate-predicates.js --prior --contrast
```

Eight hand-tagged films, 21 edges. With corpus-scale rarity the *Banshees* map
reads:

```
 1. Old Joy                    rhyme · bond-severed-unilaterally · 0.641 · tonal dist 82.4
 2. Jesse James                rhyme · bond-severed-unilaterally · 0.569 · tonal dist 37.9
 3. Y tu mamá también          rhyme · bond-severed-unilaterally · 0.569 · tonal dist 68.1
 4. Withnail and I             rhyme · comedy-that-stops-being-funny · 0.441
 5. The Lighthouse             rhyme · animal-as-hostage · 0.427
```

The two films the fingerprint buried at #1286 and #973 are now first and third,
and they arrive with a claim that names why.

**Run it without `--prior` first.** At cohort scale the ranking is wrong — *Old
Joy* falls to fifth — because `bond-severed-unilaterally` is in six of eight
films and idf punishes it, while an accidentally-rare predicate wins. This is
the trap STATE.md already records for keywords: *rarity is the wrong test when
the population was assembled because of the thing you are measuring*. It is
recorded here because it will recur on the first real tagging pass if the pass
is run on a themed cohort rather than the whole corpus.

## The hard part, named in advance

**A vocabulary is only useful if it collides.** Free extraction over 2,204 films
produces ~20,000 unique phrasings of the same handful of situations and
therefore zero edges. Three passes, not one:

- **A — propose.** Free extraction over ~300 films from `pipeline/out/plots.json`.
- **B — canonicalise.** Cluster, cut by hand to ~120–250 predicates. This is
  editorial work and cannot be skipped. Precedent exists in
  `harvest-critic-vocab.js` / `consensus-vocab.json`.
- **C — tag.** Re-run all 2,204 against the frozen list, with "none of these"
  a first-class answer. Coverage should be honest and uneven, per
  `signature-schema.md`.

Prevalence band **0.4%–8%**, tighter than the signature schema's 5–35%: a
situation held by a third of the corpus is a genre. Measure after C, cut then.

## Consequence for the app: the question becomes an input

Two questions about the same film returned two disjoint families in the
conversation that prompted this — *plot mechanics* gave The Duellists, *the
wound* gave Old Joy. The radial map currently assumes one neighbourhood per
film. Each predicate a film carries is a **door**: name it in the panel, and
clicking it re-forms the map around that predicament. The address grammar
already serialises re-formed atlases (`#/sky/genre:drama+era:1960-1979`), so
`#/map/inisherin/via:bond-severed-unilaterally` costs nothing architecturally.

`questioner.js` was not read before writing this and may already be half of it.

## Revision — the vocabulary is MINED, not authored

The original plan authored ~200 predicates first, then classified 2,204 films
against them. That is the wrong order. A vocabulary written in advance describes
the films its author had in mind; the reuse measurement showed it directly —
16 predicates authored around one film's family, and the second family reused
exactly one of them.

Invert it. `pipeline/readings.js` runs a generative pass first: per film, an
"engine" paragraph and 3-6 predicaments phrased as free text, read from the
plot section and nothing else. The controlled vocabulary is then **clustered out
of 2,204 readings**, so it describes the corpus rather than its author, and the
prevalence band becomes a measurement instead of a guess. Only then does the
closed-vocabulary re-tag run — and at that point tagging is classification, not
generation, so collision is guaranteed by construction rather than hoped for.

### `relatives` is not an edge list

The reading pass also asks each film which other films it brings to mind. Those
are NOT edges. A graph built from what a model names is asymmetric and
popularity-biased: canonical films are named constantly and never do the naming,
so the tail of the corpus accumulates readings that nothing points at — the
dead-end problem returning through a door AGENTS rule 1 does not cover.

Measured on 47 unprompted recommendations: **43% named films absent from the
corpus**, and **zero came from E-Asia, S-Asia or Oceania**, which are 7% of it.

Two legitimate uses, both narrow:

- **Reciprocal** naming (A names B and B names A) is symmetric, and is a
  candidate edge at low confidence, ranked below co-occurrence.
- Named films **not in the corpus** are a frequency-ranked wishlist for
  `seeds.txt`. This is the pass's most valuable by-product: the corpus is missing
  Paper Moon, The Talented Mr. Ripley, Mikey and Nicky, Calvary, Six Degrees of
  Separation and Gattaca, every one of which surfaced this way.

### The corpus grows from the same pass

`pipeline/wishlist.js` turns the nominations into seed candidates. Two rules,
both inherited from `expand-seeds.js`, which already refuses reputation-driven
growth because "reputation is uncorrelated with whether a film has a formal tie
to anything already in the corpus".

A predicate nomination is not reputation — it arrives with a stated reason
naming a shared predicament, which is a connection-density signal on a different
axis from the shared-hand signal. So it qualifies under the seeds.txt rule. But:

- **Rank by distinct nominators x distinct reasons, never raw frequency.** Named
  nine times for one situation is one connection repeated; named three times
  across three situations is embedded. Same device expand-seeds.js uses.
- **A nomination is a candidate, not an admission.** Harvest it, run readings.js
  on it, and keep it only if its OWN reading co-occurs with something already
  present. That converts a one-directional claim into a symmetric checkable one.
  A nomination that fails this was the model reaching for a famous title.

The tool prints the region profile of the *nominating* films so the inherited
skew is visible before a harvest runs. It cannot correct it — it does not know
an absent film's region — so every expansion batch needs a deliberate
counterweight drawn from expand-seeds.js.

**Ordering matters.** Films added in round two have no readings, so they cannot
nominate, and the vocabulary must be clustered over the *expanded* corpus or the
new arrivals get classified against a list that never saw them. Sequence is:
read -> nominate -> harvest -> read the new films -> cluster -> re-tag everything.

### Coverage ceiling

**657 films (30%) sit below plot-source.js's evidence floor** and cannot be read
at any budget. They are disproportionately the films currently surviving on crew
and setting edges. Measure the trial on the readable and unreadable cohorts
separately, or the numbers will flatter the corpus-wide experience.

## Iterating the expansion — it converges, and that is the problem

Each round reads the new films, they nominate, some nominations are new. That is
a branching process with reproduction number R = (nominations per film) x
(novelty rate r). r was 0.43 on the only real sample available, and it falls
every round as the corpus already contains more of what the pass reaches for. So
the process is **self-limiting** — it does not explode, it converges.

It converges to the closure of what the model reaches for. That set is
measurably concentrated: 0 of 47 unprompted recommendations came from E-Asia,
S-Asia or Oceania, which are 7% of the corpus. **Iteration does not dilute that
bias, it launders it** — round five looks organic and self-generated while
carrying the same skew with thousands of films of apparent evidence behind it.

Three consequences, in order of how soon they bite.

1. **Rounds 2+ must be demand-driven, not supply-driven.**
   `wishlist.js` collects what the pass reached for; that is right for round one
   and wrong afterwards. `measure-predicate-coverage.js` asks the opposite
   question — which predicaments does the corpus hold too few films for, across
   too few traditions, across too short a span — and emits targeted questions
   that can be pointed at a named region. That is the only mechanism here that
   pushes AGAINST the inherited skew instead of compounding it.

2. **Later rounds add unreadable films.** Nominations get more obscure each
   round, and 30% of the corpus already sits below plot-source.js's evidence
   floor. An admitted film with no plot section can never be tagged, so it
   survives on crew and setting edges — which manufactures the exact trivia
   problem this layer exists to fix. **Probe for an above-floor plot section
   before harvesting, not after.**

3. **Delivery breaks before the method does.** The corpus is 13.4 MB at 2,204
   and was 3.6 MB at 803 — roughly 6.1 kB per film, already "genuinely heavy on
   mobile". Projected at r falling from 0.43:

   | round | corpus | new | payload |
   |---|---|---|---|
   | 0 | 2,204 | — | 13.4 MB |
   | 2 | 3,257 | 532 | 19.9 MB |
   | 4 | 4,349 | 550 | 26.5 MB |
   | 6 | 5,470 | 564 | 33.4 MB |

   Round 2 is affordable. Round 4 is not, on the current single-artifact
   delivery. Streaming or sharding has to land before round three, and every
   round silently re-tunes every `floorIdf` calibrated at N=803.

**Stopping rule.** Not "no more nominations" — that is the fixed point and it
lies past the useful point. Stop when a round's new films stop appearing in
maps: run `measure-maps.js` over a sample after each round and record what share
of the newly added films reach any film's top six. When that falls below ~15%,
the round added weight rather than reach.

## Phases

1. ~~Seed vocabulary, hand tags, engine, contrast measurement.~~ Done.
1b. ~~Stratified cohort sampler, reading pass.~~ Built, dry-run only.
2. Pass A/B/C on a 300-film cohort; measure `crew %`, trivia share, repeated-line
   rate against today's 40.3 / 23.0 / 6.3. **A field that does not move those
   numbers gets deleted** — same trial contract as the signature schema.
3. Route strength through `associate.js`'s `surprise()` instead of the local idf,
   so it is scale-free before the corpus grows again.
4. Doors in the panel; `via:` in the address.
5. Full corpus tagging, and only then merge into `corpus.json`.
