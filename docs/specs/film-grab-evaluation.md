# Film-grab.com as a frames source — evaluation

**Date:** 2026-08-09. **Question:** should the frames measurement (currently TMDB
backdrops) prefer film-grab.com stills where available? Every number below was
measured from this container; nothing is assumed from memory. Working data in the
session scratchpad under `fg/` (`wp-posts.json`, `matched-final.json`,
`fg-frames.json`, `fg-filmvals.json`, contact sheets `sheet-*.png`); the TMDB
baseline is the same session's `frames/` directory (`filmvals.json`,
`analyse.py`, re-run today to confirm its headline numbers).

**Verdict in one line: yes for quality, no for coverage — film-grab is a
strictly better sample of a film's photography than TMDB backdrops (52 curated
frames vs 8 promotional ones, and the promotional bias is measurable), but it
covers 41% of the corpus with a steep fame gradient (9.7% of the quietest fame
quartile, 76.1% of the loudest), so it cannot replace TMDB and does not rescue
the films TMDB misses. Prefer film-grab where present, TMDB elsewhere, publish
the source per film, and calibrate the one axis where the sources systematically
disagree (glare: promotional backdrops read ~0.06 OKLab L brighter).**

---

## 1 · Terms and lawfulness

**robots.txt: permits everything we did.** The entire site is `Allow` except
`/wp-admin/`, and `/wp-admin/admin-ajax.php` — the endpoint galleries actually
load through — is explicitly re-allowed. The WordPress REST API (`/wp-json/`)
is not disallowed and answers normally. No bot-blocking was encountered at any
point: every request in this evaluation returned 200 with an honest UA
(`AtlasFilmLineage/0.3 (corpus research; contact e-mail)`), rate-limited to
~1 request/1.2s for pages and ~1/0.6s+transfer for images. Nothing was evaded;
nothing needed to be.

**No terms-of-use page exists.** `/terms`, `/terms-of-use`, `/faq` are 404.
The privacy policy is Ezoic advertising boilerplate and says nothing about
automated access. The only statement of intent is on the About page:

> "The images are presented under fair use, for education and reference
> purposes only. I don't sell anything on the site, as I know I don't own the
> imagery."

**What the site is.** A single curator (Dawn, a working cinematographer) has
hand-picked every frame since 2010 — nearly 4,000 films, ~50–65 stills each,
chosen explicitly as photography reference ("a love letter to lighting,
composition"). The About page is emphatic that FilmGrab itself is
"❌ Scraped ❌ AI anything" — that describes how *she* builds the archive, not
a visitor policy, but it states an ethos and it deserves respect in how we
behave: low volume, one pass, cached forever, never mirrored.

**Is measured-derivatives use defensible? Yes, on three separate grounds.**

1. **What we store is not the work.** Per-film colour statistics (median OKLab
   luminance, chroma, warmth, contrast — seven floats and a count) are
   unprotectable facts *about* the films. No image, no thumbnail, no
   reconstruction is stored in or served from the repo. This is the same
   posture the poster palette work already ships under, and it is far less
   exposed than the posters themselves (which we display; corpus rule 6c
   records that licence per film).
2. **The frames were never film-grab's property to licence.** The underlying
   stills are the studios' copyrighted frames, reproduced by the site under its
   own fair-use claim. Film-grab holds at most a curatorial selection; our
   derived numbers do not reproduce the selection either (we measure, we don't
   republish which frames she chose).
3. **Non-expressive intermediate copying** — downloading a copy solely to
   compute statistics and then discarding it from any published artifact — is
   the fact pattern courts have consistently treated as transformative
   (search-engine and text-mining line of cases). There is no market
   substitution: nobody visits film-grab for a median chroma value.

**The honest cost to the site and the mitigation.** The site is one person's
ad- (Ezoic) and Patreon-funded labour. Direct image fetches bypass ad
impressions. The full harvest below is ~900 post-page views and ~25–40k image
fetches, one time — against 186M lifetime views, negligible load, and the site
itself offers a per-gallery "download gallery" ZIP button, so per-film bulk
download is an intended user affordance, not a loophole. Still: the owner
should consider (a) a one-line courtesy e-mail to the curator describing the
project, and/or (b) a Patreon contribution. Both are cheap and match how the
Criterion block was handled — by respecting the human on the other end.

## 2 · Coverage, measured not assumed

Method: the full post index was taken from the WordPress REST API (4,105
posts, 42 requests) with per-post year categories (film-grab categorises every
film by year, director, DP). Matching against `corpus.json` used normalised
titles plus the Wikidata alias table (`pipeline/out/film-aliases.json`),
parenthetical dual titles ("Contempt (Le Mépris)"), title-embedded years
("Suspiria (2018)"), and a **year gate of ±1** — a 40-film random audit of
title-only matching found 39/40 correct with one remake trap (Godard's vs
Linklater's *Nouvelle Vague*), so every match except 15 year-less posts is
year-verified. Residual fuzzy scan (Jaccard ≥ 0.6, same year) finds ~7 true
matches the matcher still misses (spelling variants like "In A Year Of
Thirteen Moons"), so true coverage is ~911, ±0.3%.

| population | on film-grab |
|---|---|
| whole corpus (2,204) | **904 = 41.0%** |
| loud half (1,541 admitted plots) | 800 = **51.9%** |
| **quiet half (663 no-plot films)** | **104 = 15.7%** |
| TMDB zero usable backdrops (158) | 16 = 10.1% |
| TMDB ≤3 usable backdrops (553) | 55 = 9.9% |
| TMDB ≤7 usable backdrops (860) | 112 = 13.0% |

**The cinephile-canon hypothesis is wrong for our corpus.** Coverage by
60-day-pageview fame quartile: **9.7% → 27.2% → 51.7% → 76.1%** from quietest
to loudest. Median pageviews of covered films 27,122 vs 2,269 uncovered.
Film-grab's canon is the cinephile canon, but our quiet half is *below* the
cinephile canon — quiet-half coverage by region: Japan **8/111**, W-Europe
67/350, E-Asia 1/24, S-Asia 0/13, LatAm 0/5. The site's ~4,000 films simply
are not the 1950s–70s non-anglophone tail this corpus is quiet in.

**What film-grab therefore is:** not a coverage fix but a quality upgrade for
the covered set, plus a small genuine rescue: 16 films measurable that TMDB
cannot measure at all, and 96 covered films currently below the 8-frame cap
get topped up to 40+. Combined pipeline yield (FG where present, else TMDB):
**1,456 films (66.1%) with ≥8 frames**, 2,062 (93.6%) with at least one.

## 3 · Sample quality, on 18 dual-measured films

Method: 18 films from the prior TMDB-measured sample (110 overlap; 6
black-and-white by Wikidata P462, 12 colour spanning the chroma range), 40
hash-ordered full-size stills each (720 images, zero fetch failures),
measured by **the identical pipeline** — same OKLab code (`frames/measure.py`
loaded verbatim), same matte trim, same synthetic/flatlit/dup filters, same
thresholds, same per-film aggregation. Any disagreement is the source.

**Filter yield.** 720 images → 7 synthetic (title-card frames on black — the
curator includes each film's title card; the existing filter catches them),
0 flatlit, 1 dup: **1.1% rejected vs 1.5% on TMDB**, and none of TMDB's
promotional-composite failure modes. The source is essentially pure frames.

**The black-and-white anchors are perfect.** All 6 b&w films measure chroma
**exactly 0.0000** from film-grab, as from TMDB backdrops (the prior frames
run called only 2 b&w films chromatic where posters failed every single one).
The curator grabs true grayscale frames.

**Cross-source agreement (Spearman across 18 films):**

| measure | ρ(FG, TMDB) | median Δ (FG−TMDB) | reading |
|---|---|---|---|
| chroma | **+0.889** | −0.000 | agree |
| chroma90 | **+0.884** | −0.002 | agree |
| warmspread | +0.816 | −0.003 | agree |
| hardness | +0.593 | +0.004 | agree, both noisy |
| warmth | +0.548 | −0.003 | agree, promo warmer on 16/18 |
| glare | **+0.323** | **−0.064** | disagree: FG darker on 12/18 |
| Lrange | +0.267 | −0.057 | disagree, same direction |

**Where they disagree, film-grab is right.** The glare gap was spot-checked by
eye on the three largest disagreements (contact sheets in scratchpad):

- *Seven Samurai* (FG 0.29 vs TMDB 0.48): TMDB's 8 include posed publicity
  shots and bright hillside plates; FG's 40 include the night interiors, rain
  and shadowed faces the film actually lives in.
- *Cosmopolis* (0.17 vs 0.28): TMDB includes two graded publicity stills
  (Pattinson posed against the white limo in daylight); the film is mostly
  dark limo interior, which FG shows.
- *The Assassin* (warmth +0.02 vs +0.07): TMDB's 8 are dominated by the warm
  red court close-ups; FG's 40 span the b&w prologue, the misty green
  landscapes *and* the red interiors — the film's actual range. Same story on
  Lrange.

This is the expected direction: distributor backdrops are chosen to be bright,
legible and warm; a cinematographer's grabs are chosen to represent the
photography. The promotional bias in TMDB is small on chroma but systematic
on luminance.

**The feared curator bias toward pretty/colourful frames does not appear.**
On the 12 colour films FG chroma is *lower* than TMDB's for 7/12 (median
−0.0013); FG is darker, not prettier. Against ground truth (the b&w test) it
is exact. The curator's bias, to the extent one exists, is toward
*representative* frames — which is the estimand.

**Reliability scales with the frame count.** Split-half (20v20 frames, n=18
films): glare 0.83, Lrange 0.94, warmth 0.94, chroma90 0.98, hardness 0.74 —
against the TMDB 4v4 halves' 0.59, 0.57, 0.74, 0.93, 0.10. Hardness
(frame-to-frame luminance contrast), unusable from 8 backdrops, becomes a
real measure at 40 frames.

## 4 · Verdict and plan

**Prefer film-grab where available, TMDB elsewhere — with the source published
per film and one calibration.** Specifically:

1. **Harvest**: the 904 matched films (match table already built,
   `matched-final.json`). Per film: 1 post page + 1 admin-ajax gallery call +
   32 stills (hash-ordered; split-half says 32 is past the reliability knee
   for every measure). ≈ 31k requests, ≈ 8.5 GB, **≈ 7–8 hours at the 1/0.7s
   pace used today** — run once, resumable, cached. Full galleries (~62
   stills avg in the sample) would be ~15 GB / ~13 h and buy little.
2. **Storage**: derived numbers only in the repo — per film: 7 aggregates,
   frame count, source (`film-grab`/`tmdb`), gallery URL as provenance;
   ~250 bytes/film, ~230 KB JSON in `pipeline/out/`. Images and per-frame
   stats stay in the out-of-repo cache and are deletable after measurement.
   Nothing rehosted, no image URL served at runtime (AGENTS 6b posture:
   build-time only).
3. **The calibration, stated as a cost.** Mixing sources makes *glare* read
   ~0.064 L darker on FG films, and FG films are the famous ones — an
   uncorrected mix would put a fame-correlated artifact into the exact axis
   set that passed the fame-flatness test (worst axis ρ +0.242, re-verified
   today). The 110 dual-measured films (extendable to a few hundred cheaply)
   give the per-axis offset; apply it to the TMDB side (FG is the truer
   instrument) or regress it out, and re-run the fame-flatness table on the
   mixed measurement before shipping. Chroma, warmth and the spread measures
   mix safely as-is.
4. **What this does not fix, said plainly.** The quiet half stays quiet:
   15.7% film-grab coverage, Japan 8/111. Like the 1,500-char plot floor,
   preferring film-grab converts a quality gradient into a *precision*
   gradient that favours the canon — famous films get 40-frame measurements,
   quiet films keep 8-frame ones, and 142 films still have no frames at all.
   Wherever frame-derived numbers are shown or compared, the per-film source
   and frame count must travel with them.
5. **Courtesy**: before the full harvest, the owner should consider a short
   e-mail to the curator and/or a Patreon contribution. The site's robots.txt
   permits the access; its economics and its author's stated ethos are the
   reason to be better than merely permitted.
