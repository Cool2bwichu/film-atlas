# Evaluating *The Ultimate Movie Thesaurus* (Case, Henry Holt, 1996)

**Date:** 2026-08-09. **Question:** what is a professional, pre-algorithmic film
reference taxonomy actually made of, what does it distinguish that we cannot, how much
of our corpus does it reach, and what should we do with it.

**Copyright position, stated first because it constrained the work.** The source is a
copyrighted compilation, © 1996 Christopher Case / Henry Holt. Individual facts are not
copyrightable; the selection and arrangement are. So this document reports *measurements
over* the compilation and quotes short category names illustratively. **Nothing from it
has been written into `atlas/`.** No category list, no film-to-category table, no
similar-films list has been copied into `corpus.json`, `registers.json` or any shipped
artifact. The parse products live in the session scratchpad
(`scratchpad/tw/*.json`) and are not committed. The source file stays in the scratchpad.
The recommendation in §4 is written so that any idea adopted from it is re-derived from
our own evidence, and §4.4 states exactly where that line falls.

---

## 0. What was parsed, and how much to trust it

The supplied file is a 6.30 M-character, 33,234-line OCR conversion of the 1,108-page
scan. It has four usable parts: *Films by Title* (lines 361–17,059), a six-column
*Category List* index, *Category Entries* (category → film list), and two appendices.

| measured | value |
|---|---|
| film-entry anchors (`Title, YEAR, NNNm`) in *Films by Title* | **8,141** (book claims "more than 8,000 film entries"; the author says 5,639 distinct films — the gap is remakes, versions and TV movies filed separately) |
| distinct categories reconstructed | **1,698** (book claims "nearly 1,600") |
| category assignments harvested | **61,358** |
| mean categories per film entry | **9.4** |

**How the vocabulary was reconstructed.** The printed *Category List* is a 6-column
index that OCR read row-wise, interleaving the columns; column reconstruction was tested
and is unreliable (best-fit column count varies 4–8 by page), so it was abandoned. The
vocabulary used here is instead the set of `;`/`:`-delimited segments appearing in the
film entries' category blocks, corroborated against (a) the printed index text and (b)
the `see also` cross-reference lists inside *Category Entries*. Case- and
hyphen-variants were merged. 1,698 against a printed claim of ~1,600 is a good fit; the
residual is OCR spelling variants that survived merging.

**Match precision.** Film matching required our title (or a `film-aliases.json` label)
to sit immediately before a `YEAR NNNm` anchor with the year within ±1. One film per
book entry; collisions resolved in favour of the English title. A random 30-match audit
read clean; one false positive was found in ~50 inspected (*Legend* 1985 matching
"Baby, Secret of the Lost Legend, 1985"). Call precision ≈ 95–98 %.

**Match recall is a floor, not a ceiling.** The OCR mangles titles badly
("Litde Caesar", "\ ictorA ictoria", "Bocaccio 70"), so the counts in §3 undercount. A
fuzzy pass at ratio ≥ 0.88 recovered only 17 more, and a title-mentioned-anywhere pass
95 more, so the undercount is on the order of 10–15 %, not 50 %.

**One thing I could not locate.** The brief refers to "10 mood values". There is no mood
vocabulary anywhere in `atlas/` — `discovery.json` carries `era, country, genre,
movement, director`, and the only `mood` strings in the repo are prose. The comparison
in §2 is therefore against the **28 registers**, the **five qualities** in
`fingerprints.json`, and the **19-family genre facet**. If a mood vocabulary exists
outside the repo, §2 should be re-read against it.

---

## 1. What the taxonomy actually is

Rule-based classification over the 1,698 categories, with the distinctive classes
(formal, reception, plot-shape, period, place, production) given explicit hand-written
membership lists and the remainder split heuristically. Expect ±5 % slippage on the
three large classes; the small distinctive classes were hand-checked and are accurate.

| class | categories | % of vocab | assignments | % of mass |
|---|---:|---:|---:|---:|
| **motif / concrete situation** | 591 | 34.8 % | 11,102 | 18.1 % |
| **character type / people** | 397 | 23.4 % | 13,394 | 21.8 % |
| **genre & sub-genre** | 165 | 9.7 % | 17,257 | 28.1 % |
| **theme (abstract)** | 128 | 7.5 % | 4,986 | 8.1 % |
| **setting — place** | 128 | 7.5 % | 3,242 | 5.3 % |
| **plot shape** | 96 | 5.7 % | 2,903 | 4.7 % |
| **formal / structural** | 72 | 4.2 % | 2,355 | 3.8 % |
| **setting — period** | 48 | 2.8 % | 1,099 | 1.8 % |
| **reception / critical fate** | 39 | 2.3 % | 3,546 | 5.8 % |
| **production / provenance** | 34 | 2.0 % | 1,474 | 2.4 % |

Representative samples (counts are films carrying the category, book-wide):

- **genre** — `ROMANCE (1511)`, `MELODRAMA (741)`, `COMEDY DRAMA (563)`,
  `Romantic Comedy (550)`, `Screwball Comedy (120)`, `Film Noir (68)`,
  `Film Noir-Modern (52)`, `Westerns-Spaghetti (11)`, `Erotic Thriller (28)`.
  The book's top-level genres are shouted in caps and a film usually carries three.
- **plot shape** — `Fish out of Water Stories (173)`, `Race Against Time (118)`,
  `Turning the Tables (78)`, `Starting Over (138)`, `Rags to Riches (38)`,
  `Riches to Rags (27)`, `Deaths-One by One (15)`, `Illusions Destroyed (31)`,
  `Snobs vs. Slobs (24)`, `Enemies Unite (7)`, `One Last Chance (…)`,
  `Murphy's Law Stories (7)`.
- **formal / structural** — `Multiple Stories (166)`, `Episodic Stories (137)`,
  `Flashbacks (88)`, `Narrated Films (81)`, `Interwoven Stories (68)`,
  `Stagelike Films (55)`, `Slice of Life Stories (34)`, `One Day Stories (28)`,
  `Lyrical Films (26)`, `Multiple Performances (25)`, `Epistolaries (15)`,
  `Improvisational Films (7)`, `Monologues-Interior (3)`.
- **reception / critical fate** — `Hidden Gems (529)`, `Forgotten Films (466)`,
  `Cult Films (242)`, `Coulda Been Great (225)`, `Coulda Been Good (174)`,
  `Curiosities (164)`, `Sleeper Hits (156)`, `Good Premise Unfulfilled (128)`,
  `Camp (119)`, `Faded Hits (116)`, `Flops-Major (105)`, `Underrated (102)`,
  `Quiet Little Films (97)`, `Ahead of Its Time (79)`, `Unintentionally Funny (75)`,
  `Time Capsules (102)`.
- **the long tail is gloriously specific** — `Shelley Winters Drowns`,
  `Cattle Herded by Barbara Stanwyck`, `Octopi-Angry`, `Crying in Baseball`,
  `Parents are Gone from Chicago`, `Detectives-Matrimonial`, `Affair Lairs`,
  `Nerds & Babes`. Roughly a third of the vocabulary is this: single-observation
  categories built because one editor noticed a recurrence.

### 1.1 The finding that matters most

**Almost nothing in this taxonomy is about how a film is shot, lit, cut or paced.**
A regex over the full vocabulary for camera / light / colour / pace / cutting / lens /
focus / take-length / grain terms returns **zero categories about photography or
tempo**. The only near-hits are `Black & White Together` (which is about race, not the
print), `Silent Films` and `Silent Film Era` (a record fact about the print),
`Scenery-Outstanding` and `Production Design-Outstanding` (craft-award shaped),
`Special Effects`, `3-D Movies`, and `Music Video Style` (14 films).

That is 1,698 categories built over several years by a film-school-trained editor with
no algorithm, no source constraint, and total freedom — and **~0.3 % of the mass** is
about behaviour of the image. What he *did* encode structurally is the *shape of the
telling*: `Multiple Stories`, `Episodic Stories`, `Flashbacks`, `Interwoven Stories`,
`One Day Stories`, `Parallel Stories`, `Narrated Films` — about 500 assignments.

**This corroborates `atlas-fingerprint-DECISION.md` from an independent direction.** The
5-axis cut was justified on source scarcity (42.7 % of films carry no behavioural term
in prose). This says the cut is also *editorially* right: professional film reference
practice, unconstrained by sources, does not categorise on light, camera or pace either.
It does categorise on narrative order — and `fracture` is precisely the one of our five
qualities that has a direct 1996 analogue. That is a small but real validation of which
five survived.

### 1.2 The two axes he has that we do not have at all

1. **Reception / critical fate** — 39 categories, 3,546 assignments (5.8 % of mass),
   a bigger channel than his entire place vocabulary. `Hidden Gems`, `Forgotten Films`,
   `Coulda Been Great`, `Faded Hits`, `Sleeper Hits`, `Ahead of Its Time`,
   `Time Capsules`, `Quiet Little Films`. This is a whole dimension: not what the film
   is, but *what happened to it*, and how the reader should calibrate expectation.
2. **Plot shape as a first-class facet** — 96 categories, 2,903 assignments. Not
   "what it is about" but "what motion the story makes". Our registers explicitly
   refuse this territory (`registers.json`: "a register lives if it is about WHAT A FILM
   IS ABOUT, and dies if it is about HOW A FILM BEHAVES"). His `Fish out of Water
   Stories` (173 films) is an *aboutness-neutral* shape that crosses every genre.

---

## 2. What it distinguishes that we cannot — ranked by reader value

Measured against the 573-film overlap (§3): for each book category with ≥ 12 overlapping
films, the best F1 achievable by any of our 28 registers or 19 genre facets.

| category class | n tested | mean best F1 | share below 0.15 |
|---|---:|---:|---:|
| genre | 39 | 0.314 | 8 % |
| production | 6 | 0.211 | 50 % |
| motif | 9 | 0.190 | 33 % |
| formal | 6 | 0.189 | 33 % |
| people | 13 | 0.187 | 46 % |
| theme | 8 | 0.176 | 38 % |
| reception | 8 | 0.168 | 38 % |
| plot shape | 4 | 0.156 | 50 % |
| place | 2 | 0.118 | 100 % |

We can reproduce his genre layer and nothing else. Ranked by how much a searcher would
miss, most useful first:

1. **Reception / critical fate.** *"Show me the hidden gems."* This is the single most
   common thing a person actually wants from a film reference and we have no channel for
   it at all. Best F1 of any register against `Hidden Gems` (38 overlapping films) is
   **0.14**. It is also the one thing AGENTS rule 1 makes dangerous — "hidden gem" is a
   fame statement, and the whole project is built on refusing to weight by fame. But
   note what he actually encodes: not *unpopular*, but *popular ≠ good* — `Faded Hits`,
   `Coulda Been Great`, `Underrated`, `Ahead of Its Time` are all statements about the
   *gap* between reception and quality, which is orthogonal to degree and would not
   collapse the graph toward the canon. Worth a hard think, not an automatic no.
2. **Plot shape.** `Fish out of Water Stories`, `Race Against Time`,
   `Turning the Tables`, `Rags to Riches`, `Deaths-One by One`, `Illusions Destroyed`.
   Best F1 across the four testable ones: **0.156**. These are genuinely derivable from
   the plot sections we already harvested and already gate at 1,500 characters — a plot
   summary states a shape far more reliably than it states a cutting rate. This is the
   most *actionable* gap.
3. **Narrative structure as a facet.** `Multiple Stories`, `Episodic Stories`,
   `Interwoven Stories`, `One Day Stories`, `Stagelike Films`, `Narrated Films`. We have
   `fracture` as a 0–100 reading on 1,541 films but no *named region* for it, and a
   score is not a door. `Multiple Stories` (17 overlapping films) has best F1 **0.15**.
4. **Relationship-configuration categories.** `Fathers & Sons`, `Mothers & Daughters`,
   `Friendships-Male`, `Men Fighting Over Women`, `Teachers & Students`,
   `Romance-Older Women/Younger Men`. We collapse all of these into `family-as-trap`
   and `marriage-in-decay`. He has ~40 of them and they are exactly how people describe
   films to each other. `Friendships-Male`: best F1 **0.15**.
5. **Setting-as-texture, not setting-as-country.** `Small-town Life`, `Suburban Life`,
   `Inner City Life`, `Rural Life`, `Boardinghouses`, `Country Club Life`,
   `Mining Towns`. Our `country` facet is a passport; his is a *milieu*. Both testable
   place categories score below 0.15.
6. **Tone-of-comedy resolution.** `Black Comedy`, `Comedy-Morbid`, `Comedy of Manners`,
   `Comedy of Errors`, `Farce`, `Screwball`, `Camp`, `Comedy-Light`, `Comedy-Slapstick`,
   `Tragi-Comedy`. Our genre facet has one `comedy` bucket. `irony` is a number, not a
   door.
7. **Character-type as an entry point.** `Feisty Females`, `Eccentric People`,
   `Free Spirits`, `Stern Men`, `Drifters`, `Nerds`, `Elderly Women`. 397 categories,
   21.8 % of his mass, and our only comparable thing is whatever leaks into a register
   rule.

Two things he has that we should *not* want: the fame appendices (box-office ratings,
star ratings by year), and the credit-provenance categories (`Female Screenwriters`,
`Writer-Directors`, `Black Directors`) — the latter are real facets but they are the
crew graph, which the fingerprint layer exists to escape.

---

## 3. How much of our corpus it reaches

Matched by title + year against our 2,204 films and the 53k-label alias table.

| | count | share |
|---|---:|---|
| corpus | 2,204 | |
| corpus films released ≤ 1996 (the book's ceiling) | 1,640 | 74.4 % of corpus |
| **corpus films with their own entry in the book** | **573** | **26.0 % of corpus; 34.9 % of the pre-1997 corpus** |
| corpus films mentioned anywhere (entry, similar-films list, or category list) | 668 | 30.3 % |
| **quiet-half films with their own entry** | **59** | **8.9 % of the 663; 10.6 % of the 559 pre-1997 quiet films** |
| quiet-half films mentioned anywhere | 84 | 12.7 % |

Coverage by region — the shape is exactly what the brief predicted:

| region | entries / corpus | entries / pre-1997 corpus |
|---|---:|---:|
| US / Canada | 333 / 780 (42.7 %) | 67.5 % |
| UK / Ireland | 37 / 90 (41.1 %) | 51.4 % |
| W-Europe | 151 / 755 (20.0 %) | 23.2 % |
| E-Europe | 10 / 73 (13.7 %) | 15.9 % |
| Japan | 21 / 299 (7.0 %) | 9.2 % |
| E-Asia | 3 / 92 (3.3 %) | 7.7 % |
| S-Asia | 2 / 57 (3.5 %) | 4.3 % |

Spot-checks confirm the shape rather than the parse: *Rashomon*, *Tokyo Story*,
*Seven Samurai*, *Ikiru*, *Yojimbo*, *Ugetsu*, *Persona*, *The 400 Blows*,
*Battleship Potemkin* are all present. *Late Spring*, *Sansho the Bailiff*,
*Pather Panchali*, *Andrei Rublev*, *Come and See*, *Jeanne Dielman*, *Touki Bouki*,
*Killer of Sheep*, *Mandabi*, *Sambizanga* are all absent. It knows the export canon and
nothing behind it.

**Against the brief's own test:** it reaches **573 films we already understand well**
(of the 573, 514 have an admitted plot) and **59 films we know little about**. The
brief's threshold for "also a validation set" was 300 quiet films. It reaches 59.
**On the quiet half it is not a validation set and cannot be made into one.** The 59 it
does reach are the American and Western-European end of the quiet half — *Burden of
Dreams*, *Kings of the Road*, *Last Year at Marienbad*, *The State of Things*,
*Day for Night*, *Scenes from a Marriage*, *Nanook of the North* — plus a handful of
genuinely obscure American programme pictures. Japan contributes 3 quiet films; South
Asia 1.

---

## 4. What to do with it

**Recommendation: (c) both — but validation first and taxonomy second, because
validation has already produced results and taxonomy is a proposal.** The specific
finding that changes the priority is §4.2: the book's *similar films* lines are a
human-curated relatedness ground truth for exactly the thing ATLAS ships, and we have
never had one.

### 4.1 Validation result 1 — do our registers mean anything to a human editor?

For each register, take its members inside the 573-film overlap, and measure the **mean
pairwise Jaccard of their book categories** against a permutation null of same-size
random samples from the overlap. Run twice: once over all book categories, once with
genre, reception and production categories stripped out, so that agreement cannot come
from both parties saying "sci-fi" or "French film".

Baseline mean pairwise Jaccard (subject vocabulary only): **0.0062**.

| register | n | within | ratio | z |
|---|---:|---:|---:|---:|
| artificial-life | 10 | 0.0636 | 10.7× | **13.7** |
| cyberpunk-mood | 17 | 0.0339 | 5.5× | **10.5** |
| cold-science-fiction | 16 | 0.0332 | 5.4× | **9.7** |
| faith-and-silence | 27 | 0.0214 | 3.5× | **9.3** |
| the-killer-outside | 28 | 0.0204 | 3.4× | **8.6** |
| the-professional-job | 34 | 0.0179 | 2.9× | **8.5** |
| coming-of-age | 29 | 0.0179 | 2.9× | **7.0** |
| dream-logic | 43 | 0.0142 | 2.3× | **6.7** |
| marriage-in-decay | 49 | 0.0125 | 2.0× | **5.5** |
| cerebral-horror | 39 | 0.0130 | 2.1× | **5.4** |
| paranoid-thriller | 40 | 0.0126 | 2.1× | **4.5** |
| noir-fatalism | 70 | 0.0098 | 1.6× | **4.3** |
| films-about-films | 17 | 0.0164 | 2.8× | **4.2** |
| after-the-end | 29 | 0.0121 | 2.0× | **3.7** |
| melancholy-drift | 38 | 0.0111 | 1.8× | **3.6** |
| dystopian-satire | 29 | 0.0119 | 1.9× | **3.4** |
| war-as-attrition | 22 | 0.0127 | 2.1× | **3.3** |
| family-as-trap | 50 | 0.0096 | 1.6× | **3.3** |
| body-horror | 17 | 0.0122 | 1.9× | 2.1 |
| new-wave-restlessness | 44 | 0.0085 | 1.4× | 1.8 |
| silver-print | 88 | 0.0073 | 1.2× | 1.5 |
| aching-romance | 28 | 0.0087 | 1.4× | 1.2 |
| gothic | 27 | 0.0081 | 1.3× | 1.0 |
| the-institution | 27 | 0.0076 | 1.2× | 0.8 |
| argument-as-plot | 23 | 0.0072 | 1.2× | 0.6 |

**18 of 25 testable registers clear z > 3 on subject vocabulary alone.** That is a real
external check and it passes. Independently, 23 of 26 have at least one book category
enriched at lift ≥ 2 and p < 10⁻³ — e.g. `faith-and-silence` → `Religion` (×15.8,
p = 6.6e-10), `the-killer-outside` → `Serial Killers` (×10.3), `coming-of-age` →
`Coming of Age` (×7.9), `melancholy-drift` → `Road Movies` (×8.8),
`the-professional-job` → `Mob Wars` (×16.9).

**The five that do not clear, and what each means:**

- **`silver-print` (z 1.5)** — expected and fine. It is a fact about the print, not a
  subject; its films have nothing thematic in common and the register file already says
  so (`tier: recorded`). This is a *pass* disguised as a fail.
- **`new-wave-restlessness` (z 1.8 on subject, z 13.8 on all vocabulary)** — its whole
  coherence is carried by the single category `French Films` (×8.3, 22 of 46 members).
  It is a movement register defined on movement, so this is honest, but it means the
  register is currently a nationality label with a better name.
- **`argument-as-plot` (z 0.6), `the-institution` (z 0.8)** — these look like genuine
  failures. Neither has a single book category at lift ≥ 3 with p < 10⁻³.
  `the-institution` is the only register in the corpus whose within-similarity is
  *below* baseline on the full vocabulary (ratio 0.91). Both are rules over abstract
  nouns (`bureaucracy`, `existentialism`, `moral dilemma`) and both may be collecting
  films that share a keyword vocabulary and nothing a reader would recognise. **These
  two should be re-examined regardless of what else is decided.**
- **`gothic` (z 1.0), `aching-romance` (z 1.2)** — weak, and `aching-romance`'s only
  strong signal is the generic `ROMANCE` (×2.6). Both are worth an audit but neither is
  clearly broken.

**And one structural finding.** Cosine similarity between registers' book-category
profiles:

| pair | cosine | member Jaccard |
|---|---:|---:|
| after-the-end ~ cyberpunk-mood | 0.900 | 0.48 |
| artificial-life ~ cyberpunk-mood | 0.878 | 0.50 |
| artificial-life ~ cold-science-fiction | 0.851 | 0.44 |
| cyberpunk-mood ~ dystopian-satire | 0.840 | 0.44 |
| after-the-end ~ artificial-life | 0.809 | 0.26 |
| cold-science-fiction ~ cyberpunk-mood | 0.801 | 0.32 |

**Our five science-fiction registers are one register to a human editor.** Every one of
them tops out on the same four categories (`SCI-FI`, `Futuristic Films`, `Androids`,
`Outer Space Movies`), and they share up to half their members. The honest caveat: this
may be *his* lack of resolution rather than *our* lack of distinction — he has four SF
categories and we have five registers, so the test cannot distinguish "our five are
spurious" from "his four are coarse". But the membership Jaccards of 0.44–0.50 are ours,
not his, and they are high enough to look at on their own. Compare
`noir-fatalism ~ paranoid-thriller` at cosine 0.76 with member Jaccard 0.17 — profiles
that look alike but memberships that genuinely differ. The SF cluster does not have that
property.

### 4.2 Validation result 2 — the similar-films lines, and why they change the priority

Every entry carries a parenthetical list of similar films: *"(Mulholland Falls; The Big
Sleep; Farewell, My Lovely; Murder, My Sweet; Kiss Me Deadly)"* under *Chinatown*.
That is a human-curated, hand-argued relatedness judgement — **the same object ATLAS
ships as an edge**, made by a professional in 1996 with no graph.

Extracting those lines from every entry we could identify as a corpus film, and keeping
only pairs where both endpoints resolve unambiguously to a corpus film:

| | value |
|---|---:|
| book similar-film pairs landing on two corpus films | **216** |
| of those, already present in our edge set | **98 = 45.4 %** |
| random pairs from the same film pool present in our edge set | **1.85 %** |
| **lift** | **24.5×** |

**Our edge set independently reproduces nearly half of a human editor's similarity
judgements, at 24.5× chance.** No comparable check has ever been run on this graph.
Examples we get right: *Throne of Blood ↔ Yojimbo*, *Taxi Driver ↔ The King of Comedy*,
*Tristana ↔ Viridiana*, *Bob le flambeur ↔ Rififi*, *Burden of Dreams ↔ Fitzcarraldo*,
*Alphaville ↔ Fahrenheit 451*, *Alien ↔ The Thing*.

The 118 misses are the more interesting half, because they read as *our* failures rather
than his eccentricities: *Amarcord ↔ I Vitelloni*, *Amarcord ↔ La Strada*,
*Autumn Sonata ↔ Persona*, *Another Woman ↔ Wild Strawberries*,
*The Seventh Seal ↔ Winter Light*, *Goodfellas ↔ Mean Streets*,
*Rear Window ↔ The Conversation*, *A Woman Is a Woman ↔ Breathless*,
*A Clockwork Orange ↔ Full Metal Jacket*, *Face to Face ↔ Scenes from a Marriage*.
A striking share of them are **a director's own successive films** — the
self-rhyme our edge budget appears to suppress. Caveats: title-only resolution produces
occasional collisions (one miss pairs *Another Woman* with *Gloria* 1999, where the book
plainly meant *Gloria* 1980), and 216 pairs is a small sample.

### 4.3 So: (c), weighted

**Do (b) now, as a standing measurement, not a one-off.** Three checks, all already
implemented in the scratchpad and cheap to re-run:

1. **Register coherence z** against the human subject vocabulary — a regression test for
   `registers.json`. Any edit that drops a register below z = 3 is a signal.
2. **Register profile cosine** — a duplication check that `build-registers.js`'s
   facet-Jaccard gate cannot make, because it only compares registers against *recorded
   facets*, never against each other. The SF collapse is invisible to the current gates.
3. **Edge agreement rate** — 45.4 % against a 1.85 % baseline is now a number to hold or
   beat. It is the first external evidence that the edges are not merely internally
   consistent.

**Then do (a), narrowly.** Two proposals only, both re-derived from our own data:

- **A plot-shape facet.** His 96 shape categories are the one class of distinction that
  is both absent from our vocabulary and derivable from what we already harvested — a
  1,500-character plot section states "a stranger arrives in a place where he does not
  belong" far more reliably than it states an aspect ratio. Design it as registers
  (rules over our own theme vocabulary), not as per-film tags, per the standing rule.
- **A decision about reception.** Not an adoption — a decision. `Hidden Gems` is the
  most useful thing in this book and the most dangerous thing to import. Someone should
  write down whether *reception-vs-quality gap* is admissible under AGENTS rule 1, and
  if the answer is no, say so once and stop revisiting it.

**And two things to act on immediately, independent of everything above:** re-examine
`argument-as-plot` and `the-institution` (§4.1), and look at whether the five SF
registers should be three.

**What not to do.** Do not build the reception layer from his labels. Do not import his
similar-film pairs as edges. Do not adopt his category list as a vocabulary. See §4.4.

### 4.4 Where the copyright line falls, precisely

The distinction that governs every use above is **measurement versus transcription**.

- Computing "45.4 % of his pairs are already our edges" is measurement. It produces a
  number, and the number is ours.
- Reading his 118 missing pairs and adding those 118 edges to `corpus.json` is
  transcription of his selection, and is out of bounds — even though each individual
  pair is an uncopyrightable fact, because it is *his set* of them we would be copying.
- What is in bounds is using the miss list as a **diagnostic**: it says our graph
  under-connects a director's successive films. That is a description of a defect in our
  pipeline. Fixing the pipeline so that *our own* sources emit those edges, and getting
  *Amarcord ↔ I Vitelloni* for a reason we can state and cite, is our work and our
  claim. If the fix is real it will also emit pairs he never listed.
- Same rule for the taxonomy: "the professional reference devotes 96 categories to plot
  shape and 0 to cinematography" is a measurement about the field. "Add
  `Fish out of Water Stories` to `registers.json`" is transcription. A plot-shape
  register named in our own words, with a rule over our own theme vocabulary, evaluated
  by `build-registers.js` against our own films, is not.

The scratchpad parse (`vocab2.json`, `assign3.json`, `missing_pairs.json`) is working
data for these measurements. It should not be committed and should not be treated as a
source for anything shipped.

---

## Method caveats

- Category vocabulary is reconstructed from film-entry category blocks, not from the
  printed index; 1,698 against a printed ~1,600 implies residual OCR variants survived
  merging, which inflates the vocabulary count by a few percent and slightly deflates
  per-category counts.
- Category classification in §1 is rule-based with hand-written lists for the six small
  distinctive classes and heuristics for motif / people / theme. The three large classes
  carry an estimated ±5 % misclassification; the small classes were read in full.
- Film matching precision ≈ 95–98 % (audited); recall undercounts by an estimated
  10–15 % because of OCR damage to titles. All §3 figures are floors.
- The 573-film overlap is fame-skewed by construction (it is the intersection of two
  canons), so §4.1's coherence figures describe how our registers behave *on canonical
  films* and say nothing about the long tail. This is the same stratification problem
  `atlas-fingerprint-DECISION.md` flags for the axis anchors.
- Edge-agreement pairs use title-only resolution for the similar-films lists, dropping
  ambiguous titles; a small number of year collisions survive.
- Permutation nulls used 300 resamples; z-values above ~10 are reported as
  "large", not as calibrated tail probabilities.
