# The RAG bake-off — result

Status: **measured, not merged.** Nothing in `atlas/static/corpus.json` changed.
Nothing new ships. Everything below is derived from build artifacts under
`atlas/pipeline/out/rag-*` and can be re-run.

**Answer in one line:** the article's retrieval half does *not* beat ATLAS's
search overall — the head-to-head is a coin flip — but it decisively beats us on
one specific class of query, the class where our parser currently returns
nothing at all, which is **half of the queries we tested**. It cannot ship as
live search (the encoder is 50× the whole site). Recommendation is
**adopt-at-build-time-only**.

---

## 1. What the article's approach is, and what can survive here

The article builds one text blob per film (title + overview + genres + IMDb
weighted rating), splits it into overlapping chunks, embeds every chunk with the
`all-MiniLM-L6-v2` sentence transformer, and stores the vectors in FAISS. At
query time it embeds the user's sentence, pulls the top *k*=3 nearest chunks by
cosine, and stuffs them into a Gemma 2 prompt that demands exactly three films
with year, lead actor and a reason. A Gradio chat UI with
`ConversationBufferMemory` handles follow-ups.

Split by what can exist inside one vanilla HTML file with no runtime API calls:

| Component | Ships? | Why |
|---|---|---|
| The 9B Gemma 2 model, LangChain, the Gradio UI, conversation memory | **No** | Not arguable. Server-side stack. |
| FAISS as a service | **No** — and no loss | Our vectors are unit-length, so cosine ranking and FAISS's L2 ranking are the *same ordering*. An exact dense matmul over 4,307 chunks runs in 5.8 ms. FAISS's flat index would return identical results; only its IVF/HNSW modes are approximate, and at this size that trades recall for speed nobody needs. |
| Precomputed film vectors | **Yes, int8** | 2,204 × 384 int8 = **795,192 B gzip**, +48% on the current 1,660,679 B payload. Quantising costs nothing measurable: mean rank shift 2.803 of 2,204, top-10 kept 9.97/10, identical #1 on 30/30 queries. |
| **The encoder, for a live search box** | **No** | `model.onnx` is **90,405,214 B raw and 82,861,320 B gzipped** — vectors barely compress. That is **~50× the entire shipped site** (`public/atlas.html`, 1,660,679 B gzip). This is the number that ends the live-search question. |

So the only shippable form of dense retrieval is **precomputed answers to
queries chosen at build time**. An arbitrary sentence typed into a search box
requires the encoder, and the encoder cannot come with us.

---

## 2. Did it win? — no, and the scoreboard that says "nearly" is empty

An 11-query battery came out ATLAS 5, dense 4, 1 draw, 1 both-fail. **That
scoreboard carries no information and should not be quoted.** Bootstrap over
queries puts the margin at +1 with 95% CI **[−5, +7]**; P(dense ≥ ATLAS) = 0.43;
exact sign test on the 9 decisive queries, one-sided **p = 0.50**. A fair coin
produces 5–4 or better half the time. Worse, the per-query winner is perfectly
predicted by query *kind* — every exemplar/mood/negation query went to ATLAS,
every plot-event query went to dense — so the tally is a restatement of the
query mix, not a measurement.

The results that **do** survive resampling are three, and only one of them is
about quality.

### 2a. The durable finding: ATLAS reads nothing on 15 of 30 queries

On the frozen 30-query audit, `query-parse.js` placed **zero spans** for 14
queries and produced a negation-only parse for 1 more. On those 15, `match.js`
scores every film 0.000 and `ranked()` falls through to `a.localeCompare(b)` —
the returned "top 10" is the alphabet. Mean unread fraction across all 30 is
**73.3%**.

| Query tag | n | ATLAS refuses | mean unread |
|---|---|---|---|
| concrete (plot nouns) | 6 | **5** | 95.1% |
| shape | 4 | **3** | 94.0% |
| setting | 4 | 2 | 75.0% |
| tone | 4 | 2 | 75.2% |
| quiet | 3 | 1 | 83.0% |
| mood | 5 | 1 | 63.8% |
| negation | 3 | 1 | 18.8% |
| exemplar | 1 | 0 | 27.3% |

This is a count, not an estimate. It is the single most important number in the
exercise and it is about us, not about the article.

### 2b. Where dense genuinely beats us — it is always the same shape

The sharpest case. **"a film about a musician who is losing their hearing"**

- ATLAS: `refusal: nothing-read`. Nothing returned.
- Dense: **Sound of Metal #1**, The Last Waltz, Orchestra Rehearsal, The Great Silence, Decalogue X, Shoot the Piano Player, Land of Silence and Darkness, Music in Darkness.

The exactly-right film, first. Three more of the same shape:

| Query | ATLAS | Dense top 5 |
|---|---|---|
| a film built around a game of chess | refuses, 0% read | **The Chess Players**, The Man from London, **Dangerous Moves**, Les Créatures, The Army Game *(only 8 of 2,204 plots mention chess; it found them)* |
| a con artist who is never quite caught | refuses, 0% read | **Nine Queens**, Dr. Mabuse the Gambler, Le deuxième souffle, The Confession, Hard Eight |
| a friendship that ends without either man saying so | refuses, 0% read | Withnail and I, A Brighter Summer Day, Léon Morin Priest, **Close #4**, … **Old Joy #9** |

Fact-precision@10 over the 8 fact-checkable queries: **dense 0.400 vs ATLAS
0.050** over all 8, 0.200 over the 2 it answered. Bootstrapped difference
**+0.350, 95% CI [+0.213, +0.512]**, P(≤0) = 0.000. That interval excludes zero
— but note the measure was declared dense-favouring in advance, and ATLAS scores
0 on 6 of 8 only *because it refuses*, so this is largely 2a restated.

The last row is not title luck. I checked the matched chunks: Old Joy hit the
passage where Kurt says something has *"come between"* the two friends;
Withnail hit *"apologising for coming between them"*; Close hit the Rémi
suicide passage. The right passage of the right film.

### 2c. Where dense loses, and it loses badly

**"a cold austere film that keeps you at arm's length"**

- ATLAS reads one word — *austere* — and that is enough: A Gentle Woman, A Man Escaped, Damnation, Diary of a Country Priest, First Reformed, Ida, Jeanne Dielman, L'Argent (all 1.000, a 22-film tie). The canonical cold-cinema wall.
- Dense: Lumière and Company, Hannibal, **Cold War**, The Runner, Lisbon Story, Brazil, Sympathy for the Devil, Pratidwandi. It read *cold* as temperature.

**"a revenge film that isn't violent"**

- ATLAS: An Actor's Revenge, Les Dames du Bois de Boulogne, The Bride Wore Black (3-way tie at 1.000) — revenge by theatre, by marriage, no blood.
- Dense: **Sympathy for Mr. Vengeance #1**, The End of Violence, An Actor's Revenge, Vengeance Is Mine, Città violenta. The precise inverse of what was typed.

**Negation is structurally impossible for the embedder, not merely weak.** A
query and its own negation embed at **cosine 0.9783**, with 4 of 5 top films
identical and merely reordered. For scale, *"a funny film"* vs *"a sad film"* is
0.7026 — the model separates antonyms far better than it separates a sentence
from its own negation. This cannot be patched. In the article it is papered
over by the Gemma stage, which is the part that cannot ship.

**And "title matching" is the wrong diagnosis — the real one is worse.** An
overview-only counterfactual index (identical splitter, chunk size, encoder,
rollup; 8,502 chunks) with every `Title:`/`Genres:`/`Rating:` line deleted
still returns four *Silence*-titled films for the friendship query, still reads
"films like" as meta-cinema, and swaps *Cold War* for *The World in His Arms*
and *Love Is Colder Than Death*. Stripping titles fixes nothing **and costs
dense its three best results** — Sound of Metal, The Chess Players and Stalker
each fall #1 → #3. The failure is lexical echo in whatever text is embedded,
which cannot be stripped out.

### 2d. The finding that reframes both sides

Six paraphrases of the *same request*, dense side:

| Phrasing | Old Joy | Close | ATLAS reads |
|---|---|---|---|
| a friendship that ends without either man saying so | **#9** | **#4** | 0% — refuses |
| the last time two friends will ever see each other | **#9** | **#3** | 0% — refuses |
| two old friends drift apart on a trip and never say it out loud | **#6** | #18 | 2% — refuses |
| a film about a male friendship quietly dying | #222 | #143 | 20% |
| a slow quiet film about a friendship that quietly ends | #201 | #71 | 50% (Old Joy #24) |
| a story about growing apart from someone you love | #328 | #80 | 10% |

**Adding two adjectives to the same request costs 192 ranks.** Dense retrieval
wins when the sentence describes *events* and collapses when it uses
film-critical *adjectives*. ATLAS is the exact inverse: 0% read on the event
phrasings, awake only once the adjectives arrive.

The same effect, on a query where dense looked simply incompetent: it failed
*"kitchen sink realism about dockworkers and a wildcat strike"* (Strike #102,
Harlan County USA #232, top-10 of Ladykillers/Goonies/Texas Chain Saw) but on
the plain-noun rephrasing *"workers go on strike against the factory owners"*
returned **Harlan County USA #1, Strike #2**. Dense is not good at "concrete
nouns" — it is good at **nouns that appear in Wikipedia plot prose**, and blind
to the register in which people describe films.

**The two sides are not competing. They read different halves of the same
sentence.** Mean top-10 overlap across the battery is **0.6 of 10** — they
essentially never return the same films.

---

## 3. The Banshees test

Ranking by distance in the five-axis fingerprint space put **Ex Machina 2nd**
from The Banshees of Inisherin and buried Old Joy near the bottom. I recomputed
this from `atlas/static/fingerprints.json` rather than inheriting it: over the
**1,532 films carrying all five axes**, Ex Machina is **#2 at L2 = 2.828** (the
next neighbour, Miller's Crossing, is at 11.533 — Ex Machina is four times
closer than anything else) and **Old Joy is #1287, the 84.0th percentile**. The
brief's figure of #1291 of 2,197 counts a different film set; both say the same
thing. The question was whether MiniLM plot embeddings fail the same way.

### On the exemplar form — *"films like The Banshees of Inisherin"*

**ATLAS top 10:** The Banshees of Inisherin (self) · The Last Picture Show ·
Amarcord · Fiddler on the Roof · The Music Man · Mystery, Alaska · The Wailing ·
Werckmeister Harmonies · An Elephant Sitting Still · Leviathan

**Dense top 10:** The Banshees of Inisherin (self) · Life, and Nothing More… ·
Lumière and Company · Hyènes · Koyaanisqatsi · Subarnarekha · The Act of Killing
· Napoléon · The Voyeur · This Is Not a Film

| | ATLAS | dense (native) | fingerprint prior |
|---|---|---|---|
| **Old Joy** | #1505 / 2204 — **inside a 77-film tie**, ranks 1464–1540 | #1945 / 2204, cos 0.1108 | **#1287 / 1532** |
| **Ex Machina** | #1734 / 2204 — **score 0.000, inside a 613-film tie**, ranks 1592–2204 | #1925 / 2204, cos 0.1136 | **#2 / 1532**, L2 2.828 |

**Read the Ex Machina row carefully.** On the dense side the demotion is real —
a genuine cosine, a genuine rank. **On the ATLAS side it is an artifact:** Ex
Machina scores exactly 0.000, along with 612 other films, and its rank is its
alphabetical position inside that zero band. So *"the fingerprint failure is not
repeated"* is true of dense retrieval and **meaningless as stated of ATLAS**.
Whoever repeats that claim should attach this caveat.

As percentiles from Banshees: Old Joy sits at **84.0%** under fingerprint
distance, **68.3% under ATLAS** (inside the 77-film tie) and **88.2% under
dense**. On the
exemplar form the dense side is **worse than the baseline it was brought in to
beat**, and ATLAS's improvement is a tie band, not an identification.

**Both sides also miss the two obvious answers.** *In Bruges* and *Three
Billboards Outside Ebbing, Missouri* — same writer-director, same register of
profane comic bleakness — are both in the corpus and neither appears in either
top 10. ATLAS: Three Billboards #17, In Bruges #206. Dense: In Bruges #56,
Three Billboards #2180.

**And ATLAS's win here is a small-town query in disguise.** The exemplar path
collapses Banshees to four attributes dominated by `setting:small-town` at
weight 1.0 (then `tone:bleak` 0.75, `tone:comic` 0.5, `mood:elegiac` 0.25).
Consequence: *"films like The Banshees of Inisherin"* shares **9 of its top 20**
with the bare query *"a small town film"*, whose own top 5 is Amarcord /
Fiddler on the Roof / Mystery, Alaska / Shadow of a Doubt / Banshees. Fiddler
#4 and The Music Man #5 are not stray errors — they are what the query became.
ATLAS did not model Banshees; it modelled "small town, a bit bleak, a bit
funny", and got lucky that the corpus's best small-town elegy is the right
answer.

### On the plain-language form

Ask the same thing without the exemplar and without adjectives — *"a friendship
that ends without either man saying so"* — and dense does what fingerprint
distance could not: **Old Joy #9, Close #4, Ex Machina #1009**. ATLAS returns
nothing.

**Verdict on the discriminating test: dense does not repeat the fingerprint's
specific failure, and on the right phrasing it fixes it — but only on that
phrasing.** Add adjectives and it degrades to #201 behind four films titled
*Silence*. Use the exemplar form and it is worse than the fingerprint baseline.
This is equivocal and must be written as equivocal.

---

## 4. Rule 1 — and the answer is not the one we were braced for

> **Settled decision 1.** Edge distance encodes formal bond strength, never
> popularity or node degree. If you find yourself weighting by fame, stop.

Proxy: 60-day English Wikipedia pageviews from `plot-source.js`'s own cache,
2,175/2,204 films, **nothing fetched**. Window 20260608 against today's key
20260609, so `match.js`'s cache-only reader correctly refuses; the window on
disk was read and is labelled stale. The 29 films with no cached article are
**dropped, never imputed as 0** — zeroing them would plant them at the
unfamous end of every correlation here. Convention: **positive rho = famous
films score higher**. Gate: |rho| > 0.45.

**The article's IMDb rating term does not disqualify its ranking.** Correlational:
rho(dense score, IMDb weighted rating) = **+0.009**, rho(score, votes) =
**+0.008**. Causal, which is the one that matters — the index was rebuilt with
*only* the `Rating: x/10 from N votes` line removed from 2,195 of 2,204 blobs:
fame rho moves **−0.072 → −0.114**, so the rating line contributes **+0.042 of
fame correlation against a 0.45 gate**. It is not inert (removing it shifts
films by a mean 125.4 ranks and changes #1 on 9 of 30 queries) — it simply does
not point at fame. Embedding the string *"Rating: 7.8/10 from 412933 votes"*
barely moves a 384-dimensional sentence vector.

**Rule 1 would be tripped by the article's LLM stage, not its retrieval stage** —
Gemma reads the rating inside the prompt and is asked to justify its picks. That
stage cannot ship here regardless.

**The uncomfortable half.** Whole-corpus rho over the 15 queries ATLAS actually
read: **ATLAS −0.353** (all 15 negative), dense article −0.003, dense native
+0.116. By the repo's own statistic and its own gate, both sides pass and ATLAS
passes harder. But a reader sees the head, not the tail, and at the head the
order reverses:

| | tie-aware head-band lift vs corpus median pageviews |
|---|---|
| **ATLAS** | **2.96× [95% CI 2.16 – 4.50]** |
| dense (article) | 0.96× [0.55 – 1.91] |
| dense (native) | 1.01× [0.48 – 1.83] |

With IMDb votes as an independent proxy the gap is wider — ATLAS 4.03× vs dense
1.47×, bootstrapped difference **+2.56× [95% CI +1.13, +5.16]**, excluding zero.
**Dense retrieval is fame-neutral at the head. We are not.**

I chased the mechanism rather than leaving it as a coincidence:

1. The evidence base is fame-shaped: rho(attributes filled, pageviews) = **+0.6107** over 2,175 films.
2. The scorer rewards **sparsity**: rho(match score, attributes filled) = **−0.5124**. This is where our flattering negative corpus-wide rho comes from — and it is not a virtue. A film we know nothing about clears a one-clause query by default.
3. Control for it: inside the 1,640 films with all 59 attributes filled, ATLAS's head lift falls **2.96× → 1.37× [95% CI 1.00 – 2.08]**. Coverage is most of the route; the CI's lower bound touches 1.00, so what remains is not distinguishable from none.

Attribute coverage is bimodal, not graded: 1,640 films have all 59, the p25 film
has 7, and **107 films (4.9%) have zero** — they can never exceed 0.000 for any
query ever asked.

Two gate breaches, both on the same query and both sides: q09 *"a story told out
of order that only makes sense at the end"* gives dense **+0.462** and is
ATLAS's worst head lift at **17.22×**. A second dense query sits just under at
q30 **+0.427**. That query is a fame magnet; the ranker is not.

---

## 5. The hybrid — one combination beats both, and it cannot ship

Three hybrid shapes, twelve parameterisations, two shippable variants and two
dumb fusion baselines, measured on the frozen 30-query audit with measures
declared in `hybrid-measures.json` **before any hybrid ran**.

| method | answered | FACT@10 (all 30) | neg. violations /10 | fame rho mean | fame max | reach |
|---|---|---|---|---|---|---|
| PURE-ATLAS | 16/30 | 0.050 | 3.5 | −0.297 | +0.195 | 148 |
| PURE-DENSE | 30/30 | 0.400 | 3.5 | +0.070 | **+0.472 breach** | 215 |
| **A-confirm-25** *(dense proposes, vocabulary confirms)* | **30/30** | **0.375** | **1.0** | **−0.069** | **+0.288** | 221 |
| **C-unread** *(dense only on the spans the parser could not read)* | **30/30** | **0.400** | 3.5 | −0.024 | +0.376 | **241** |
| B-order-200 | 30/30 | 0.375 | 1.0 | +0.078 | **+0.528 breach** | 226 |
| **B-ship-100** *(precomputed, the only shippable one)* | **15/30** | **0.062** | 3.0 | +0.238 | **+0.529 breach** | 125 |
| D-rrf-60 *(dumb fusion baseline)* | 30/30 | 0.275 | 2.0 | −0.044 | +0.297 | 188 |

**All three clever shapes beat the dumb reciprocal-rank-fusion baseline (0.275).**
Two results stand out.

**C-unread is the first method in the project to find Old Joy.** On *"a slow
quiet film about a friendship that quietly ends"* it returns **Old Joy #1 of
2,204, tie width 1**, with Close #6 and Ex Machina #863. Top 5: old joy, the
tree of life, three times, stalker, still life. Compare every predecessor:
fingerprint #1287; pure dense #201 (behind four films titled *Silence*); pure
ATLAS #24 inside an 11-film tie; the dense probe alone #10. **Neither half alone
reaches #1 — the blend beats both of its own components.** The mechanism is
explicable rather than lucky: the parser consumes *slow/quiet/quietly*, so those
tokens never reach the embedder, and they were exactly what pulled the
*Silence*-titled films. Same story on surveillance — The Conversation **#1 of
2,204** vs dense #5 and ATLAS #10-inside-a-15-film-tie.

**A-confirm-25 is the best all-rounder, and it fixes negation for both sides.**
On *"a revenge film that isn't violent"*, films in the top 10 carrying
`texture:graphic-violence` ≥ 0.5: **pure ATLAS 7/10** — the worst of everything,
because a fence gives partial credit and Gladiator, Get Carter and Death Rides a
Horse all land at 0.967 — pure dense 4/10, **A-confirm-25 2/10**. It also never
approaches the fame gate (max +0.288).

**And now the part that decides it.** C-unread and A-confirm both embed an
arbitrary runtime string, so both need the 82.9 MB encoder. **Neither can ship.**
The one hybrid that *can* — B-ship, ordering by 59 precomputed attribute vectors,
0.014 ms, no encoder — is the **worst** of the family: 15/30 answered, FACT@10
0.062, and it **breaches the fame gate at +0.529**. Its precomputed vector for
`texture:graphic-violence` returns The End of Violence / 11'09"01 / The Last
Metro / Sympathy for the Devil — the lexical-echo failure reproduced *inside the
build artifact*, where we can no longer see it happening.

On the fully shippable exemplar path (film vectors, no encoder), **no method
finds Old Joy**: vocabulary-only #1505 in a 77-film tie, film-vector cosine
#802, vocabulary-selects-then-vector-orders excludes it entirely at N=100/200/400,
fingerprint prior #1287.

---

## 6. Recommendation — **adopt-at-build-time-only**

Not adopt: live dense search needs an 82,861,320 B gzipped encoder against a
1,660,679 B site. Not adopt-as-hybrid: the two hybrids that win need the same
encoder, and the hybrid that ships is worse than either pure side *and* breaches
Rule 1. Not reject either — the refusal rate is real, dense's wins on it are
real, and rejecting outright would throw away a working build-time instrument.

**What to adopt:** run the embedder offline, over the spans `query-parse.js`
reports as unread, to **widen the 59-attribute vocabulary** with the story
shapes that keep coming back unreadable. At that point C-unread's advantage
collapses into the vocabulary itself, which ships at zero runtime cost.

**Cost.** Payload: **+0 bytes** if only the lexicon widens. If precomputed film
vectors are ever wanted for the exemplar path, +795,192 B gzip (+48%) at int8,
near-lossless. Build: **211.6 s** for the native index (a one-time 90.4 MB
build-only dependency; `pip install onnxruntime tokenizers`, 69 MB, no torch),
5.1 s for the hybrid pass, ~7 ms to embed one probe. Nothing is fetched at
runtime and no API key is involved.

**The single biggest risk: lexical echo laundered into the build artifact.**
B-ship already demonstrates it — `texture:graphic-violence` resolving to *The
End of Violence* and *The Last Metro* is title matching, and once it is baked
into a vocabulary entry nobody sees it happen. **Mitigation is non-negotiable:
any candidate phrase→attribute association mined from the embedder must be
confirmed against existing consensus evidence and hand-adjudicated. Cosine alone
must never create a vocabulary entry.**

**Two defects in our own search that this exercise found, worth more than the
verdict and independent of whether any of this proceeds:**

1. **`query-parse.js` refuses on 50% of ordinary queries** (15/30), and the refusal is silent — `match.js` returns an alphabetical list that looks like an answer. At minimum, surface it.
2. **`match.js` breaks ties alphabetically**, so the shipped "best match" is decided by first letter across bands up to 45 films wide (median band at rank 10 across the readable queries: 21 films). *2001: A Space Odyssey* heads a 45-film tie on q28 purely on the alphabet.

**Fairness note, for the record.** The lexicon was not tuned to these queries:
re-running the battery against the pre-11:24 lexicon moves Old Joy #24 → #23
with the top 3 unchanged and D1/P1/q27/q28/q29 byte-identical. The dense side was
if anything favoured — the reported figures use the *native 256* config, which
is dense's better one, and director was deliberately excluded from the blob
though it would have helped. One overstatement to retract: the audit's claim
that queries were *"frozen before the first run"* is contradicted by timestamps
(both indexes existed at 11:34/11:38 and `diagnose.py` printed top-5s at 11:40,
before either query set was written at 11:45/11:46). A held-out set argues
against actual tuning — ATLAS refuses on 3/9 of `diagnose.py`'s earlier queries
vs 15/30 on the audit set, the opposite direction — but the claim outran the
evidence and should not be repeated.

---

## 7. What would change the answer

**The experiment worth running next, in priority order:**

1. **Does a widened vocabulary close the refusal rate without importing lexical echo?** Take the ~16 unread probes that are grammatical sentences carrying film content (*"a film about a heist that goes wrong"*, *"a courtroom film about a man convicted of something he did not do"*, *"a film about a musician who is losing their hearing"*), mine candidate attributes from dense retrieval, **hand-adjudicate every one against consensus evidence**, and re-run the frozen 30. **Success criteria, declared now:** refusals fall from 15/30 to under 5/30; FACT@10 over all 30 rises from 0.050 toward dense's 0.400; fame rho stays negative and the head-band lift does not rise above today's 2.96×. If that holds, the article's stack has paid for itself as a build-time instrument and never needs to ship. If refusals fall but the head lift rises, we imported the echo and should stop.
2. **Watch for the debris case.** 9 of the 30 unread probes are contentless grammatical fragments — *"anywhere in it"*, *"in winter"*, *"a film set almost entirely in"*, *"but warmer"* — and 3 more are mangled by phrase removal. C-unread's failure mode is feeding these to the embedder as if they were sentences. Any gate must be keyed on the probe being a *sentence*, not merely on `unreadFrac`.
3. **A smaller encoder would reopen live search.** At 82.9 MB gzip it is closed. An int8/distilled encoder in the 5–10 MB range would make a live dense search box arguable for the first time; nothing below that threshold changes the arithmetic.
4. **Fix the alphabetical tie-break first.** Several conclusions above are limited by tie bands rather than by any retrieval method, and this is cheap.
5. **Re-run the Banshees test once In Bruges and Three Billboards are reachable.** Both are in the corpus, neither is in either top 10, and until a method finds them the exemplar path is not solved by anyone — including the incumbent.

---

### Files

Build: `atlas/pipeline/rag/embed.py`, `build-index.py`, `query.py`,
`atlas-side.js`, `hybrid.py`, `audit.js`, `diagnose.py`.
Frozen query sets: `bakeoff-queries.json`, `bakeoff-battery.json`,
`audit-queries.json`, `hybrid-measures.json`.
Artifacts: `atlas/pipeline/out/rag-*` (index 13.2 MB article / 20.6 MB native,
score dumps, cost and fame JSON).

Boundaries respected: `atlas/app/template.html`, `atlas/app/build.js`,
`atlas/pipeline/predicate*`, `readings*`, `wishlist*` and
`atlas/static/corpus.json` were not touched.
