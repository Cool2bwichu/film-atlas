# The predicate layer — trial result

Verdict: **it does not move the numbers, and the failure is not one more run
away.** Crew fell 0.1 points. The proposal's own founding example — *Old Joy*
on *The Banshees of Inisherin* — does not appear on the map at all, and the
reason it does not appear is arithmetically incompatible with the proposal's own
prevalence band. The contract in `proposals/predicate-layer.md` says a field
that does not move those numbers gets deleted. On the measured evidence that is
the right call for **the edge layer**. The tagging underneath it is honest work
and should be kept on disk as a measured result, not merged.

Nothing was merged. `static/corpus.json` is byte-unchanged.

Scope of this document: it reports the 300-film trial (Pass A read → Pass B
mine → Pass C tag → edges → measure). It does not re-derive the baselines it is
judged against; those were measured separately and are named at each use.

---

## 1. Did it move the numbers?

No.

Method, and it matters: **top-six edge slots per film, ranked by raw
`edge.strength` descending, no signal weighting, no repetition decay.** That is
the one rule of four tested that reproduces the recorded baseline
(52.5 / 72.7 / 7.1 / 5.1 / 2.1) to the printed decimal, and
`measure-predicate-trial.js --verify-baseline` asserts all five on every run.
Both sides of the comparison use it.

| | before | after | delta |
|---|---|---|---|
| **crew** | 52.5% | **52.4%** | **−0.1 pt** (6,925 → 6,915 of 13,188 slots) |
| **crew + cast** | 72.7% | **72.6%** | **−0.1 pt** |
| predicate | — | 0.4% | 53 of 13,188 slots |
| trivia share | 23.4% | 23.1% | −0.3 pt |
| repeated-line rate | 25.5% | 25.4% | −0.1 pt |

**27 of 2,204 maps changed at all (1.2%); 7 changed in their top three (0.3%).**
Restricted to the 292 films that carry any predicate edge: crew 50.9 → 50.2,
27 of 292 maps changed (9.2%).

### Why it failed, separated into the two causes

**Scale.** Predicate strength runs 0.2994 / 0.3640 median / 0.5436 max. The
corpus it competes against has crew at median 0.663, keyword 0.628, cast 0.600,
subject 0.720. The strongest predicate edge in the layer outranks **0 of 1,053
keyword edges, 129 of 6,031 cast edges (2.1%), 1,247 of 5,581 crew edges
(22.3%)**. 252 of the 292 tagged films already hold six edges at or above the
predicate maximum, so their maps cannot admit a predicate line at any position.
The ceiling is inherited: `predicate-strength.js` maps surprise onto
`0.40 + min(1, s/6)·0.34` to mirror `associate.js`'s keyword band, but the
maximum surprise the layer ever produces is 3.41 against an `S_CAP` of 6.

**Coverage, which is the harder ceiling.** Forcing every predicate edge to
strength 1.0 — a bound, not a tuning — the layer tops out at **13.2% of visible
slots** and crew falls 52.5 → **45.8%**. 1,912 of 2,204 films carry no tag, and
663 of those (30.1%) sit below `plot-source.js`'s 1,500-char evidence floor and
can never be tagged at any budget.

So the gap between the measured −0.1 pt and the −6.7 pt bound is entirely
scoring, and the gap between −6.7 pt and anything better is coverage. Neither
gap is closed by the run that was performed.

### The other ranking, and why it is not the result

Under `measure-claims.js`'s own app ranking (the source of the on-record
40.3 / 23.0 / 6.3), crew goes **39.0 → 34.5** and 268 maps change. **That
movement is an artifact.** `sigWeight()` in `app/template.html:1830` returns
`1.0` for any edge whose `source !== "record"`; predicate edges declare
`source: "reading"` and inherit it, while crew is multiplied by 0.60 and cast by
0.24. On the tagged cohort under that ranking predicate takes **67.0%** of all
slots, crew falls to 2.5%, and cast, studio, genre, genreEra and countryEra all
go to **0.0%**. That is a takeover produced by an unearned weight, not a layer
earning slots, and it must not be quoted as the trial result.

**Verdict on question 1: fails the contract as written.**

---

## 2. Does it find *Old Joy*?

**No. *Old Joy* is absent from the *Banshees* map entirely.** It is not ranked
low; there is no edge.

*Banshees* carries 70 predicate edges. The top of its map:

```
 1  0.4118  Adua and Her Friends   hidden-life-exposed
 2  0.4068  The Touch              hidden-life-exposed
 3  0.4045  Decalogue V            harm-answered-with-harm
 …
 9  0.3904  Last Tango in Paris    the-bond-ended-without-account
```

Two things are wrong with that list and they are different problems.

**Old Joy is absent because the vocabulary split the situation.** *Banshees*
holds `the-bond-ended-without-account`; *Old Joy* holds
`devotion-that-runs-one-way`. Co-occurrence is an exact id match, so the
intersection is empty. *Old Joy*'s plot section is 1,914 characters — barely
above the floor — and yielded exactly one tag. *Y tu mamá también*, the
proposal's other named answer, is also absent.

**The one half that works:** *Ex Machina*, the fingerprint's #1 at distance 2.8
and the false positive the layer exists to reject, is **also absent**. The layer
correctly declines the edge the fingerprint gets wrong. It just does not produce
the edge the fingerprint misses.

**The map's own lead is inverted.** `hidden-life-exposed` is *Banshees*' **lowest**
tag at centrality **0.28** (Pádraic outing Peadar in the pub). Its spine,
`the-bond-ended-without-account` at centrality **1.0** — the Colm/Pádraic break
that is the entire film — ranks **#9 of 70**. This is the rarity trap in a
mutated form: the lead is chosen as the rarest shared predicate, and centrality
is bounded to `[0.6, 1]` precisely so it cannot overturn that. Aggregate, the
trap is contained — 160 of 282 maps (56.7%) lead with the film's own most
central predicament, median centrality drop 0.00 — but 13 maps drop ≥0.4 and the
worst of the 13 is the proposal's own benchmark film.

### The finding that makes this structural

The two granularity failures bracket the vocabulary from both sides:

- **Too fine.** *Banshees* / *Old Joy* fail to collide. The bond-decay
  neighbourhood is **8 separate ids held by 42 of 304 films**. Collapsed into
  one predicate (a diagnostic, not a merge), *Banshees* would reach 41 films
  including *Old Joy*, and pairs on those situations go 184 → 861. But
  42/304 = **13.8%**, far above the proposal's 0.4–8% band — a genre by its own
  definition.
- **Too coarse.** *The Mirror* / *Days of Thunder* collide on
  `past-laid-on-the-young`, whose label unions two situations ("the injury **or**
  the task"), putting an inherited absent father in the same bucket as a racing
  mentor drilling a chassis.

**The prevalence band and the founding benchmark are in direct arithmetic
conflict.** At a granularity fine enough to stay inside 0.4–8%, the predicate
stops colliding on the pair the layer was written to create. That is not fixed
by more films, more calls, or a rescore.

**Verdict on question 2: the layer's own headline benchmark fails, for a reason
that is not scale.**

---

## 3. Is it redundant with consensus?

**No — this is the one clean positive, and it was tested adversarially.**

Consensus (59 attributes over 2,097 of 2,204 films) was given every advantage:
best of five similarity metrics, ties at the cutoff resolved in its favour,
equal budget, and for the vocabulary test a predictor searched over 59 singles +
1,711 ANDs + 1,711 ORs, **fitted and scored on the same films**.

| test | result |
|---|---|
| pair recovery at equal budget (7,299 pairs from the same 292 films) | **1,580 recovered = 21.6%**, against **1,254 expected at chance — lift 1.26x** |
| restricted to the 219 films consensus knows *well* | 1,035 of 4,185 = 24.7%, lift **1.41x** |
| on the layer's **strongest 500 edges** | **24 of 500 = 4.8%** |
| rank recovery (AUC for predicate partners) | **0.5434** against 0.5 for no information; recall@6 27.4% vs 17.2% chance |
| vocabulary duplication, 85 predicates on ≥6 films | best overfitted predictor **median F1 0.333, max 0.667; 0 of 85 reach 0.70** |
| the obvious duplicate, `story:revenge` × `harm-answered-with-harm` | precision 0.833, **recall 0.161** — a strict small subset |

**1,451 of 7,299 predicate edges (19.9%) join two films consensus fully
described that share not one of its 59 attributes.** And consensus cannot type
an argument at all: the AUC of consensus similarity separating the layer's
rebuttals from its rhymes is **0.4665** — used as a ranker it would push arguing
pairs *down*, because films that argue about a predicament tend to be unlike each
other in tone.

The honest other half: consensus makes pairs the predicates cannot. *The Mirror*
/ *The Tree of Life* is the strongest pair in the whole 292×292 universe (nine
shared attributes) — both films were tagged, five predicates each, disjoint. And
of the 663 films that can never be tagged, **consensus still describes 575**.

**Verdict on question 3: not redundant. The layer carries information nothing
else in the graph has. This does not make the edges good — that is question 4.**

---

## 4. Are the edges good?

**30 edges drawn at random from all 7,299 (mulberry32, seed 20260810 — not the
showcase), both films' plot text read for all 53 films involved:**

- **24 of 30 (80%) survive on fact** — the shared predicament is genuinely
  present in both films at the stated roles.
- **10 of 30 (33%) are edges worth showing a reader.** The remaining 14 are
  literally true and editorially inert: *Once Upon a Time in the West* ↔
  *Rolling Thunder Revue* on wrongful blame, both centralities ≤0.35; *Jolanda,
  the Daughter of the Black Corsair* ↔ *WALL-E* on a concealed thing surfacing.
- **6 of 30 (20%) are stretches**, and 3 fail identically: the tagger matches the
  label's headline clause and drops its qualifying clause ("never made party to",
  "another that person prefers"). That is a systematic failure, not six slips.
- **2 carry detail absent from the plot section** — *The Shining*'s "by February"
  (the plot says "A month passes") and *Grizzly Man* typed `restored` on a tape
  destroyed "around 2023", from the article's afterword. Recall leaking into a
  pass whose rule is plot text and nothing else.

**The sample is representative, not unlucky.** Layer-wide: **61.3% of edges have
at least one side holding the lead predicate below 0.5 centrality**, only 17.9%
have both sides at ≥0.6, 15.3% are incidental to both. **6,706 of 7,299 (91.9%)
rest on exactly one shared predicate**, where the Poisson tail reduces to a
function of the two films' marginal tag rarities; median surprise 0.731 means
**the median edge documents an overlap ~1 pair in 5.4 would produce by chance**,
and 88.1% sit below 1-in-10.

### What is genuinely strong

The **tagging**, which survived every attack made on it. Across all 1,257 tags:
**92.8% of basis sentences name a proper noun**, median content-word overlap with
the predicate's own label is **0.00**, and **zero tags lift 30%+ of their 8-grams
verbatim from the plot**. The tagger read the plot. The layer is also **fame-blind
where it matters**: edge strength vs mean pageviews is **ρ +0.011 (n=7,127,
p=0.35)**, and predicate degree vs pageviews is **ρ +0.197** against the project's
own `SCORE_FAME_MAX_RHO = 0.45` gate — where corpus degree on the same 296 films
is **+0.468 and fails that gate**. AGENTS rule 1 holds better for the new layer
than for the graph it would join.

### Two defects that are not about individual edges

**Rebuttal typing is at chance.** `OUTCOME_KIND` collapses the 5-value outcome
field to a binary: held 30.6%, broken 62.8%, open 6.6%. Under independence
`2·p(held)·p(broken)` = **38.5%** of edges would type as `rebuttal`. Observed:
2,384 of 7,299 = **32.7%. Ratio to chance 0.85 — slightly below what shuffling
the labels gives.** The type carries no selective information, and the claim
builder prints "and they disagree about it" 2,384 times on that basis. The
earlier report's "22.9x the hand-authored rebuttal stock" is a true count of a
type that selects nothing.

**A third of the layer dies to the proposal's own band.** 2,570 of 7,299 edges
(**35.2%**) lead on one of six predicates above the 0.4–8% band —
`person-used-as-means` (13.0% of the cohort), `the-wrong-person-is-blamed`
(12.0%), `harm-answered-with-harm`, `knower-silenced`, `cost-taken-onto-oneself`,
`will-pressed-into-yielding`. Applying the stated cut deletes a third of the
layer before any quality objection is heard.

**Verdict on question 4: 80% factually sound, ~33% worth a reader's slot. The
tags are good; the edges built on them are mostly weak, and two of the three
things layered on top of them (rebuttal typing, the lead-predicate choice)
select nothing.**

### One methodological defect found while writing this, not previously reported

**One third of Pass C was produced by a different mechanism than the other two
thirds.** `pipeline/.cache-tags-passc` holds batched responses for **100 of 100
shard-0 films and 1 of 100 shard-1 films**: shard 1 (cohort lines 101–200) was
tagged in-agent rather than through `tag-predicates.js`. It is not a fabrication
— the tags validate and the bases are specific — but it is not the same
instrument, and it shows in the data:

| | films | tags/film | mean centrality | mean basis chars |
|---|---|---|---|---|
| shard 0 (`tag-predicates.js`) | 100 | 4.16 | **0.51** | 203 |
| shard 1 (in-agent) | 100 | 4.34 | **0.61** | 174 |
| shard 2 (`tag-predicates.js`) | 100 | 4.07 | **0.52** | 204 |

Centrality feeds strength directly. Shard 1 supplies **35.6% of all edge
endpoints but 47.3% of the top-500 edge endpoints**, and mean edge strength rises
monotonically with shard-1 endpoints (0.3618 → 0.3682 → 0.3824 for 0, 1, 2
endpoints) on a layer whose entire range is 0.244 wide. Any re-trial must
re-tag shard 1 through the same script as the others.

---

## 5. What did it cost, and what would full-corpus tagging cost?

**Spent.** 266 metered batch model calls survive on disk as cache entries:

| stage | calls | note |
|---|---|---|
| Pass A — read | 71 | 52 for the 300-film cohort (4 shards × 13), 10 for the 60-film gate, 9 exploratory under prompt-1 |
| Pass B — mine | 124 | propB 60, propC 64; propA is deterministic clustering, 0 calls |
| Pass C — tag | 71 | shard 0 (34) + shard 2 (34) + 3 benchmark; **shard 1's 100 films are not in it** — see above |

**Wall time** 11:05 → 16:28 = **5h 23m**, across roughly ten parallel agents.
The cache did not help: `readings.js` keys batches on joined titles sliced from
`plots.json` order after cohort filtering, so re-batching a film into new company
always misses. **0 of 52 Pass A batches hit cache.** Sharded work is not free.

**Payload.** `predicate-edges.json` is 7.2 MB raw; **4.54 MB in corpus-shaped
form (652 bytes/edge, mean claim 502 chars) for 292 films.**

**Full-corpus tagging, projected.**

- `plots.json` admits **1,541 of 2,198 films** above the floor. **663 of 2,204
  (30.1%) can never be tagged at any budget**, and they are disproportionately
  the films now surviving on crew and setting edges.
- Remaining readable films to tag: 1,541 − 300 = **1,241 ≈ 414 more batch calls**
  at the current batch size of 3. Pass A and Pass B do not repeat — the
  vocabulary is frozen — so tagging cost is roughly **6x what Pass C cost**, which
  is affordable.
- **The edges are what does not scale.** Measured pair density is **17.18%** among
  tagged films. At 1,541 readable films that projects to **~204,000 candidate
  edges — 9.3x the entire current 22,050-edge graph — and ~130 MB corpus-shaped**,
  against a corpus already at 13.4 MB and recorded in STATE.md as "genuinely
  heavy on mobile". Any merge needs a per-film cap decided in advance, and the
  cap, not the tagging, then determines what the reader sees.
- The 53 slots won today are the honest denominator for that spend.

---

## 6. Recommendation

**Delete the edge layer as specified. Keep `pipeline/out/predicate-tags.json` on
disk as a measured result and as raw material. Do not spend the 414 calls.**

The reasoning, in the order the evidence forces it:

1. **The contract's own test returns delete.** −0.1 points, one map in eighty.
2. **The contract's test is confounded, and the confound was bounded rather than
   argued.** Forcing strength to 1.0 puts the ceiling at 13.2% of slots and crew
   at 45.8%. So scoring is worth up to 6.6 points and coverage the rest — which
   would ordinarily justify a re-trial.
3. **But the benchmark failure is not in that confound.** *Old Joy* is absent
   because the vocabulary is finer than the resemblance a viewer means, and the
   granularity that would reach it sits at 13.8% prevalence — a genre by the
   proposal's own rule. **The prevalence band and the founding example cannot
   both hold.** More films do not resolve this; more calls do not resolve it;
   rescoring does not resolve it. It is arithmetic and it is already known.
4. Independently, **35.2% of edges die to that same band**, and **rebuttal typing
   is at chance (0.85x)** — so two of the three things built on top of the tags
   select nothing.
5. **Against all of that, the layer is measurably non-redundant** (1.26x lift,
   4.8% recovery on its strongest edges, F1 max 0.667 against an overfitted
   predictor) **and fame-blind** (ρ +0.011 at the edge). That is why the *tags*
   should be kept and the *edges* deleted. Nothing else in the graph knows what
   happens between the people in a film, and 1,257 plot-sourced, proper-noun-bearing
   basis sentences are worth more than the 53 slots they currently win.

### The concrete next step

**Settle the band-versus-benchmark conflict on paper, before any further spend.**
It costs nothing: the diagnostic collapse is already measured (8 ids, 42 of 304
films, 13.8%). The owner has to answer one question — *is the 0.4–8% band a rule
or a guideline?*

- If it is a **rule**, the layer cannot produce its own founding example and the
  edge layer should be deleted outright. This document is the record of why.
- If it is a **guideline**, then before re-tagging anything: re-cut the
  vocabulary at bond-decay granularity, re-tag shard 1 through
  `tag-predicates.js` so all three thirds come from one instrument, recalibrate
  `S_CAP` off `associate.js`'s keyword value, decide a deliberate
  `SIGNAL_WEIGHT.predicate` rather than letting it inherit the authored 1.0, and
  re-run `measure-predicate-trial.js` on the same 300 films. That is a
  measurement, not a run, and it answers whether the −0.1 was scoring or idea
  before another 414 calls are spent.

### The single biggest risk if it proceeds

**It will look like it works.** `sigWeight()` already hands any non-record edge a
weight of 1.0. Merged without a deliberate `SIGNAL_WEIGHT.predicate`, the layer
takes **67.0% of cohort slots**, drives crew to 2.5%, and sends trivia share and
repeated-line rate to exactly **0.0%** — every headline quality number improves at
once and dramatically. What the reader would actually get is maps filled with
1-in-5.4 coincidences, a third of them on predicates the proposal itself calls
genres, 2,384 of them printing "and they disagree about it" on a type that
selects at chance.

STATE.md already records this trap in its own words: *a metric can improve while
the thing it measures gets worse.* This layer is the best-instrumented
opportunity that project has had to fall into it.

---

## Reproducing every number above

```bash
cd atlas
node pipeline/measure-predicate-trial.js --verify-baseline   # §1, and the ceiling
node pipeline/measure-predicate-quality.js                   # §3 fame, strangers, tradition
node pipeline/measure-predicate-vs-consensus.js              # §3 redundancy
node pipeline/measure-predicate-coverage.js --targets        # §4 spread, band
```

Inputs, all under `pipeline/out/`: `readings-pass-shard{0..3}.json` (Pass A, 300
films), `predicates-frozen.json` (predicate-vocab-1.0.0, 175 entries),
`predicate-tags.json` (Pass C, 300 films / 1,257 tags),
`predicate-tags-benchmark.json` (the 4 benchmark films, scored against the
cohort's prevalence and voting in nothing), `predicate-edges.json` (7,299 edges),
`predicate-trial.json`, `predicate-quality.json`, `predicate-vs-consensus.json`.

### What was verified clean, and should not be re-litigated

- **No tonal leak.** Recomputing all 7,299 strengths from stored
  `surprise`/`centrality`/`complementary` alone reproduces the file to a max
  deviation of 7.3e-5. r(strength, tonalDistance) = **−0.016**. The shipped
  selftest rebuilds every strength against a scrambled fingerprint table with
  **0 moved** across 1,160 distinct real tonal values, and all three negative
  controls (`--prove-scorer-guard`, `--prove-nonwritable`, `--prove-leak`) were
  fired and each caught what it was aimed at.
- **`relatives` were never promoted to edges.** Measured at n=357 on one shard:
  49.3% name films absent from the corpus, and reciprocity is **2 pairs in 357
  nominations (1.1%)**. The asymmetry the proposal predicted is real and severe.
- **The seed tags were never read into a prompt or scored against**, `estPrevalence`
  and `--prior` were never used, and no band cut was applied to produce any
  number here.
- **"None of these" is honest about form, not about vocabulary.** 12 of 300 films
  (4.0%) abstained — but that is 7 of 18 documentaries (38.9%) against 5 of 282
  fiction films (1.8%), four of which are non-narrative by construction.
  **Exactly one conventional narrative feature in 282 declined the vocabulary.**
  The 4% cannot be quoted as evidence the vocabulary is honest about its gaps.
