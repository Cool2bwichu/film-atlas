# Source survey 2 — text for the quiet half

**Date:** 2026-08-09. **Question:** which lawful, reachable sources carry keyword-bearing
text (plot detail, themes, descriptive vocabulary) for the corpus films that current
sources miss? Every number below was measured from this container against
`atlas/static/corpus.json` and `atlas/pipeline/out/plots.json` — nothing is assumed from
memory. Working data in the session scratchpad (`quiet-enriched.json`,
`native-sections.json`, `en-beyond.json`, `ml-quiet.json`, `loc-matches.json`,
`crit-matches.json`).

## The quiet half, measured

Operational definition: films with **no admitted Wikipedia plot** (below the 1,500-char
evidence floor or no plot section at all).

- **663 films** of 2,204: 450 below the floor, 207 with no plot section, 6 absent from
  plots.json.
- Shape: W-Europe 350, US/CA 114, Japan 111 · peak decades 1950s (101), 1960s (147),
  1970s (125). Exactly the non-English pre-1990 tail the owner described.
- 482 of the 663 are non-English-language films (Wikidata P364); Italian (134),
  Japanese, French, German, Swedish dominate.

## Headline result

**90% of the quiet half has harvestable text that nothing in the pipeline touches** —
in two places: the *native-language* Wikipedia article, and English Wikipedia's
*category* layer. Union of all four new signals measured below: **624/663 (94%)**.
Only 39 films are quiet everywhere.

---

## Candidate 1 — Native-language Wikipedia plot sections · **HARVEST**

**Reachable:** yes. All language editions returned 200 via `action=parse`
(fr/it/de/ja/sv/… tested); Wikimedia rate-limits at roughly 1 req/s from this
container (429s at 3/s, clean at 1/s with backoff). **Lawful:** CC BY-SA, the same
licence as the plot harvest already shipped.

**Coverage, measured on all 663 (not a sample):**

- 494/663 quiet films (74.5%) have a native-language article — **457/482 (95%) of the
  non-English quiet films**. By wiki: it 128, ja 94, fr 85, de 55, sv 50, zh 22, +18 more.
- Probed every one of the 494 for a plot-like section (Trama / Synopsis / Handlung /
  あらすじ / Handling / …): **406 have one (61% of the whole quiet half)**.
- Size, via section byte offsets (wikitext bytes; ≥1,800 B used as proxy for the
  1,500-char prose floor): **105 clear the floor outright**; median 954 B, p75 1,857 B.
- Combined evidence — thin English plot + native plot — crosses the 1,500-char floor
  for **192 films**, 31 of which currently have *no* plot text at all.
- Language skew is real: it/fr/de carry substantial plots (medians 1,419/1,093/1,861 B);
  **ja and sv are thin** (medians 450/342 B) — Japanese quiet films gain least.

**Bonus in the same fetch:** 271/494 native articles (55%) carry a criticism/analysis
section (Critica, Accueil critique, Kritiken, 作品の評価 …) — native-critic vocabulary on
films English criticism ignores. The prior probe that found "no behaviour terms" tested
neither plot nor these sections.

**Concrete example (quiet film):** *Woman of Rome* (La romana, 1954) — English plot
section 386 chars, withheld below-evidence-floor. Italian `Trama`: **3,172 chars** of
full plot breakdown ("Roma, 1935. La giovane ed avvenente Adriana Silenzi viene indotta
dalla madre vedova a lavorare come modella… Astarita, un importante gerarca fascista…").
Others: *Kings of the Road* de 9,400 B (en: 988 chars), *Il Divo* it 6,494 B (en: 711),
*A Generation* pl 3,026 B (en: 877), *La Ronde* fr 19,616 B (en: 1,093).

**Honest cost:** ~500–1,000 API calls at 1 req/s ≈ under an hour of wall time; the
text is non-English, so theme extraction must either run multilingual (the model reads
Italian/French/German fine) or pay a translation step. The floor question needs a
decision: only 105 films cross 1,500 chars on native text alone; a combined-evidence
rule admits 192; treating any native plot as partial evidence reaches 406. And it does
little for the 111 quiet Japanese films — ja plot sections are short.

---

## Candidate 2 — English Wikipedia categories · **HARVEST (near-free)**

**Reachable/lawful:** same API, same licence; never harvested (grep of
`atlas/pipeline/*.js` confirms — only P921 main-subject comes from Wikidata).

**Coverage, measured on all 662 quiet articles + 250-film loud control:**

- Keyword-shaped categories ("Films about X", "Films set in Y", "Films based on Z",
  "Documentary films about W"): **479/662 quiet films (72%), mean 2.6 per film**
  (loud control: 94%, mean 5.6 — fame-tilted but far flatter than TMDB reviews'
  re-covering of the canon).
- Strict "Films about" thematic cats alone: 40% of quiet (72% loud).
- Median 13 non-hidden categories per quiet film; the rest carry provenance that is
  still facet-shaped (Films scored by Ennio Morricone, Films set in Rome, Films based
  on Japanese novels).

**Concrete examples (quiet films):** *Scenes from a Marriage* → Films about adultery /
abortion / domestic violence / divorce / marriage. *Nanook of the North* → Documentary
films about animal hunting / Inuit in Canada / hunter-gatherers. *Meghe Dhaka Tara* →
Films about poverty in India. *The Wind Will Carry Us* → Films about spirituality.

These are human-curated, exactly keyword-shaped, in the searcher's own vocabulary, and
they exist precisely where prose fails — a film too obscure for a Themes section still
gets categorised. **Cost: one `prop=categories` call per film (or one categorylinks
dump), effectively free, English-only pipeline.**

## Candidate 3 — English Wikipedia analysis/style/themes sections · marginal

Measured on the same probe: any analysis-ish section (themes, style, analysis,
interpretation, reception, legacy) — quiet 51% vs loud 94%. But *proper*
Themes/Style/Analysis sections: **quiet 6% vs loud 27%** — the assumption in the brief
was right, not wrong: the ~36% share collapses to 6% on the quiet half. What the quiet
half has is short Reception/Legacy sections (critic-quote vocabulary). Worth folding
into whatever fetch happens anyway; not worth a dedicated harvest.

---

## Owner-pointed sources

### LOC National Film Registry essays · lawful and lovely, wrong hemisphere

- **Reachable:** yes — index page 200 (182 KB), essay PDFs 200; robots.txt permits
  `/programs/…` (Crawl-Delay 5). **403 essays** currently linked.
- **Lawful — best terms of any critical source, read on the index page itself:**
  "Educators, screening programmers, writers and others are encouraged to utilize
  these essays freely, citing the source accordingly."
- **Kind of text:** commissioned scholarly essays, SoC-register. *Nanook of the North*
  essay (Zimmermann & Zimmermann Auyash): 8,098 chars — "a Rosetta stone for debates
  about documentary ethics, representation, ethnography, orientalism."
- **Overlap, the caveat that decides it:** **56/2,204 corpus matches. 4 in the quiet
  half** (High School, Intolerance, Nanook, Woodstock). 47 of the 56 already have an
  SoC essay. The Registry is American by mandate; the quiet half is European/Japanese.
- **Verdict:** closes nothing for the quiet half. A ~9-film micro-harvest (matches
  lacking SoC essays) is defensible as a freebie; do not budget real effort.

### Criterion essays · right films, closed door

- **Reachable: no.** `criterion.com` HTML pages return **403 at the edge from this
  container** (essay index, film pages, terms page — plain and browser UA alike).
  robots.txt itself is permissive and the sitemaps host is open, so the block is CDN
  bot-protection, not policy-by-robots. Terms could not be read (403); Wayback was
  throttled (429) from here.
- **Overlap, measured from the open sitemap** (1,712 film pages, slug-normalized title
  match): **406 corpus films; 62 in the quiet half; 36 of those lack an SoC essay
  about them** — Killer of Sheep, Touki Bouki, Mandabi, Sambizanga, Jeanne Dielman,
  Black God White Devil, Tokyo Olympiad… exactly the right films, and the largest
  non-SoC critical coverage found today. (Slug matching has no year check; a few false
  positives possible; the shape is robust.)
- **Verdict: park.** The material is the best-matched commissioned prose after SoC,
  but the site actively refuses automated access and its terms are unread. Per the
  survey's own rule — say so and stop. If the owner wants it, the route is a request
  to Criterion or a manual/browser session, not a harvest from here.

### rogerebert.com · untestable from this container

- **Reachable: no — 403 Forbidden on every request tested**, including `robots.txt`
  and the homepage, with both a plain and a browser User-Agent. The block is at the
  CDN edge and precedes any terms question.
- Terms could not be read by any lawful route: direct 403, Wayback availability API
  429 (persisted over ~20 min of polling), CDX API timeout.
- Coverage, fame shape, and the comments question are therefore **unmeasured, not
  presumed** — but note the prior: TMDB viewer comments measured 0.717 fame-shaped
  with near-zero behavioural vocabulary, and Ebert's corpus is distribution-filtered
  (what opened in Chicago). The Great Movies set (~400 films) is canon by definition —
  the part of the corpus already best covered.
- **Verdict: stop.** A site that 403s robots.txt is refusing automated access; do not
  harvest first and check later.

**The pattern across the owner's four suggestions** (MovieSum aside): all point at
commissioned critical prose, which matches the day's measurements — critics flat,
viewers fame-shaped. But the three new ones either re-cover the canon (LOC, Ebert's
Great Movies) or are unreachable/unread-terms (Criterion, Ebert). For the *uncovered*
corpus specifically, none of them beats what the two Wikipedia layers deliver.

---

## Closed candidates (tested, with responses)

| Source | Tested result | Why closed |
|---|---|---|
| **IMDb bulk datasets** (datasets.imdbws.com) | 200; headers of all five files read | Carries `genres` (3 max, coarse), akas, crew, principals, ratings. **No keywords, no plots, no text.** Nothing we lack. |
| **MovieLens 25M tag genome** | 200; full dataset downloaded, joined on IMDb IDs | Genome covers **118/659** quiet films (18%), and those are the famous end (Intolerance, Fantasia). User tags on quiet films are metadata, not themes ("Criterion", "DVD-Video"). Licence research-only, no redistribution. Fame-shaped; closed. |
| **DBpedia** (en + chapters) | SPARQL and `/data/` both **503** repeatedly; fr chapter TLS cert **expired** | Also substantively empty for us: abstracts are lead sections (we have the en lead as `description`); plot sections are not in DBpedia. |
| **Wikiquote** | 200; sitelinks measured corpus-wide | **3** quiet films have an en Wikiquote page; 84 in any language. Dialogue register, not theme register. Sample (*Sans Soleil*) is lovely but coverage is nil. |
| **Commons categories** | 200; sample fetched | 115/663 quiet films have a Commons category; contents are provenance (year, country, director, PD status), zero thematic vocabulary. |

---

## Ranked shortlist

**1. Native-language Wikipedia — plot + criticism sections.** The only source found
that reaches the quiet half *because* it is quiet in English: 61% of the quiet half
gains plot text, 105 films cross the evidence floor outright, 192 on combined
en+native evidence, and 55% of the articles add native-critic vocabulary. This is the
owner's "entire breakdown of what happens in a film", in the film's own language.
Cost: an evening of paced API calls plus a multilingual-extraction decision; weakest
for Japan/Sweden.

**2. English Wikipedia categories, whole corpus.** 72% of the quiet half carries
human-curated keyword categories (mean 2.6 each) that were never harvested; free to
fetch; flatter than any viewer source measured. Not prose — it feeds the keyword/facet
layer, not the plot layer — which is exactly the gap TMDB keywords leave on the 16.6%
uncovered.

Below the line: LOC micro-harvest (9 films, free, lawful) whenever convenient;
Criterion parked pending access; Ebert closed at the door.

**The residual finding:** after both harvests, **39 films (6% of the quiet half) are
quiet everywhere** — no native article, no plot anywhere, no keyword categories, no
criticism sections: Fårö Document, Incident at a Corner, Dear Summer Sister, Industrial
Symphony No. 1, Bushido Samurai Saga… For these, the record layer (credits, movement,
duration, colour) is the honest ceiling, and the interface's "reading, not record"
distinction is doing exactly the work it was designed for.

## Method caveats

- Plot-section size is measured in **wikitext bytes** via section byte offsets
  (markup inflates prose by ~20–40%); 1,800 B was used as the floor proxy. A real
  harvest should strip markup and apply the true 1,500-char rule.
- Native-plot detection used per-language heading lists (Trama/Synopsis/Handlung/
  あらすじ/…); unusual headings undercount slightly, so the 61% is a floor.
- LOC/Criterion matching is normalized-title matching (Criterion without years);
  counts are ±a few films, shapes are decisive.
- Loud control for the category/section comparison was a random 250-film sample
  (seed 42) of the 1,541 admitted films.
