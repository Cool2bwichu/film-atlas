# Fingerprint layer — the decision, and the measurements that forced it

Verdict: **build it, at roughly a fifth of the size the spec describes, and not
until the source is fixed.** `atlas-fingerprint-layer.md` stays the home
document, heavily amended. `atlas/pipeline/signature-schema.md` is
**superseded, not deleted** — its three admission tests move into the amended
spec; its trial result belongs in HISTORY.md.

**24 axes → 5**: `dread`, `cruelty`, `irony`, `ambiguity`, `fracture`, plus the
closed theme vocabulary.

## Why 5 and not 24 — the deciding number

Behavioural (not credit-shaped) grounding, measured across the whole corpus by
fetching and stripping every article, not a sample:

| group | films with ≥1 term | with ≥2 |
|---|---|---|
| light | 25.0% | 8.5% |
| camera | 15.9% | 5.5% |
| sound | 46.3% | 18.8% |

**927 films (42.7%) have zero behavioural terms across light + camera + sound
combined.** And credit terms outnumber behaviour terms for light (32.6% vs
25.0%) and camera (19.1% vs 15.9%) — **the article is more likely to name the
cinematographer than to describe the photography.** Scoring the 5 light and 4
camera axes from this material re-encodes the crew graph through the exact
channel the layer exists to escape. The 4 tempo axes are the next weakest
(32.7% any, 12.4% ≥2).

What survives is what a plot summary reliably carries. Plot sections are
present on 88.4% of films, reception on 74.8%, style/themes/analysis on only
35.7%.

## The fix inverts its own safety argument

Dropping `exintro=1` does buy 22× more text (behaviour-bearing prose: median
5,158 chars against a 236-char shipped description). It also destroys the one
fame-flat input the pipeline has. Spearman against 60-day Wikipedia pageviews,
n=2,173 — a real external fame instrument rather than graph degree:

| variable | ρ vs pageviews |
|---|---|
| shipped description length | **0.149** |
| graph degree | 0.452 |
| TMDB keyword count | 0.753 |
| behaviour-bearing chars | **0.828** |
| full article prose | **0.856** |

The shipped description is fame-flat *only because the truncation flattens it*.
Every candidate `axisConfidence` inherits the correlation: raw chars 0.828,
sections-present 0.694, groups-grounded 0.720, best case (saturating cap at
1,200 chars) 0.522. **There is no formulation of axisConfidence from full
articles that is as fame-flat as what ships today**, and the spec wires
axisConfidence straight into edge confidence, which AGENTS rule 1 forbids.

Graph degree was the wrong instrument for this all along: 83.5% of films sit at
degree 20, 21 or 22 because of the edge budget, so any Spearman against it is
dominated by ties. Pageviews sharpens the earlier conclusions rather than
reversing them — keyword availability is a fame gradient, and worse than first
measured (0.753, not 0.323).

## The spec's flagship example is not in the spec's own proposed source

Searching the full Wikipedia articles for light-behaviour sentences:
*Midsommar* returns a costume ("the Hargato dress in white"), a political
reading, and a Snow White comparison. *The Wicker Man* returns one hit, about a
metal EP called "The White". **Neither article states the film is shot in
daylight.**

So "Both hold their dread in full daylight" — and validation gates 4 and 5,
which are the product promise — would be scored from **model recall, not from
supplied evidence**, while `axisConfidence` read HIGH because the article is
long. That is the failure mode the whole layer was designed to avoid, arriving
through the front door.

## Two gates in the spec cannot fail as written

- **σ < 8 liveness.** An 85%-defaulted axis still scores σ = 11.2. A pure
  horror-flag axis scores σ = 11.5. Both pass. Replaced with **pole prevalence:
  5–35% at each pole.**
- **Emission at `fingerprintScore ≥ 0.72`** is biased toward ignorance. A pair
  10 points apart on average — defaulted scores with jitter — needs `themeSim`
  of only 0.50, or **0.29** once the 1.15× cross-cluster bonus applies. A
  genuinely distinct, well-scored pair 30 points apart needs 0.74, or 0.54.
  **Films the scorer knew nothing about clear the gate more easily than films
  it knew well**, and because obscure films share no director, crew, studio or
  country they collect the cross-cluster bonus preferentially. Gate 6 (≥30%
  cross-country edges) would read that noise as success.

## Two record-tier fields are free and unharvested

On a 100-film fame-stratified Wikidata sample: **P2047 duration present on
98%**, **P462 colour on 94%** (28 of them black-and-white). Neither is in
`harvest.json`. Both are checkable, fame-flat and free, and they move
`saturation` and part of the tempo group from reading to record.

## What the description actually is

Mean 235 chars, of which a templated "X is a YEAR COUNTRY GENRE film…" lead
sentence is **55.0% of all characters**; for 620 films (28.2%) it is over 85%
of the entire text; 27.8% are a single sentence. Mean residual non-template
content: **106 characters**. The director's surname appears in **91.8%** of
them. The real truncation ceiling is ~204 chars, not 340 — `firstSentences`
breaks at `max * 0.6`.

## The human artifact: 20 minutes, once, blocking

Not 40 films hand-scored on 24 axes. **Five ordinal ladders**, one per
surviving axis: 5 films ordered low→high on that axis alone. Films 1 and 5 are
the spec's own §3 anchors, already verified present. Films 2–4 are proposed by
a model that is *not* the scorer and withheld from the scoring prompt. The
owner audits a proposed order rather than inventing numbers.

Ordinal constraints are most of the information in an absolute score and cost a
fraction of the effort — "Come and See scores above Tokyo Story on cruelty" is
cheap to confirm and hard to get wrong.

## Held-out films must be stratified

The 40 anchors are all canonical, so they carry the richest articles in the
corpus. Sampled full-article length: anchors median 28,026 chars (min 15,582)
against a long-tail median of 5,834 (max 8,974) — the distributions barely
overlap. A gate calibrated only on anchors passes on exactly the films where
scoring is easiest and says nothing about the 1,324. Hold out a stratified set
and report MAE per stratum.

---

## OWNER DECISION, 2026-08-09: the 1,500-character floor is accepted

Gate 1 failed as written — Spearman(plot-section chars, 60-day pageviews) =
0.6374 against an adopted 0.45 threshold. The remedy, a 1,500-character
minimum-evidence floor, brings it to 0.325 with the whole bootstrap CI under
threshold, and admits 72.6% of films that have an article.

**The owner has accepted it, with the cost stated rather than buried.** What
the floor does is not make the source fame-flat; it converts a *score* gradient
into a *coverage* gradient. Films below the floor are written `plot: null` with
a `withheld` reason, so the scorer physically cannot read a two-sentence plot
and call it evidence. A null does not enter the graph. A fame-shaped confidence
number would.

**The cost is regional and it is the part to keep watching:**

| | admitted |
|---|---|
| US / Canada | 85% |
| UK / Ireland | 94% |
| South Asia | 86% |
| Eastern Europe | 71% |
| Western Europe | 59% |
| Japan | 57% |

Films under 800 characters of plot are 30% of Western Europe and 23% of Japan
against 5% of US/Canada. So the axis layer will describe the anglophone canon
well and Ozu's neighbours less well, and every downstream number — prevalence,
pole balance, edge emission — inherits that shape.

**What follows from accepting it.** The floor is a coverage statement and must
be reported as one wherever axes are shown: a film without axes is a film the
evidence did not support, not a film without qualities. Any later interface
that ranks or compares on axes has to say how many films it silently excluded.
And if a better source of critical writing ever lands, the floor is the first
thing to re-measure — it exists because of what Wikipedia is, not because of
what the axes need.
