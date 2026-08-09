# ATLAS Data-Layer Enrichment: source-and-schema report

Supplied by the owner, 2026-08-09. Filed verbatim below so future sessions
inherit it. Cross-references against work already done are in the commit
message and in docs/specs/source-survey-2.md when it lands.

---

(Report as supplied — see session transcript for provenance. Key structure:
TL;DR harvest order; 10 detail categories; staged recommendations; traps;
caveats.)

## TL;DR harvest order
1. Wikidata SPARQL for technical facts and lineage properties not yet extracted
2. TSPDT starting-list XLS + Sight & Sound 2022 per-voter ballots (canon standing AND director-stated influence)
3. IMDb non-commercial TSV dumps (build-time only, never republish)
4. Shot-duration data (Cutting Cornell ZIPs, Cinemetrics corroboration) + own Distant-Viewing pass for the visual layer

## The structural truth
The corpus is canon/art-house, half-non-English, one-third-pre-1960 — and that
breaks most movie-data sources, which are richest post-2000 Anglophone.
Wikidata + national film institutes (KMDb, filmportal.de, JMDb/Kinenote, BFI)
are the only things that scale across the whole population.

## Licensing traps for a public repo
- TMDB: personal/non-commercial, logo attribution, NO ML-TRAINING USE, 6-month cache cap. Build-time only.
- IMDb datasets: personal/non-commercial, local copies OK, redistribution NOT granted.
- IMDb connections: not in the dumps at all; scraping violates ToS. The richest lineage source is the least usable.
- Letterboxd, TV Tropes: scraping against ToS.
- Clean to redistribute: Wikidata (CC0), MusicBrainz/Discogs core (CC0), Wikipedia text (CC BY-SA), OpenAlex (CC0), LoC vocabularies (public domain).

## High-value specifics
- Wikidata P-numbers not yet harvested: aspect ratio P2061, original language P364,
  format P437, per-country release P577, filming location P915, narrative location P840,
  box office P2142, budget P2130, distributor P750, certification P1657, EIDR P2704,
  production designer P2554, art director P3174, costume designer P2515, DoP P344,
  editor P1040; lineage: P144 based-on, P737 influenced-by, P941 inspired-by,
  P4969 derivative-work, P1877 after-a-work-by, P6166 quotes-work; P155/P156 series
  position; P69 educated-at, P1066 student-of for makers.
- Discrimination guidance: aspect ratio / negative format / colour-process are GOLD
  (long-tailed); runtime and colour-vs-B&W are near-worthless as similarity features;
  "is canonical" is flat across an all-acclaimed corpus.
- Sight & Sound 2022: 1,639 critic + 480 director published ballots — each a
  structured "person X voted for film Y" edge, citable, the best publishable
  influence signal available.
- TSPDT: downloadable XLS, >26,000 films, ranking HISTORY columns (rare temporal
  signal), joins via embedded IMDb links.
- OpenSubtitles/OPUS: dialogue-density and silence measures, computable — the route
  back for the cut dialogueDensity quality.
- OpenAlex: per-film scholarship counts, CC0, novel discriminating feature.
- Distant Viewing Toolkit / PySceneDetect: compute ASL and frame-colour signatures
  ourselves; Cutting (220 films) and Cinemetrics (~15k noisy, no bulk export,
  degraded 2023-2025) are corroboration, not lookup tables.
- National institutes: KMDb has a real open API; Kinenote/JCDB scrape-only;
  JMDb frozen at 2014.

## Traps / do-not-prioritise
IMDb connections (legal risk), Letterboxd/TV Tropes (ToS), FilmColors/Cinemetrics
as lookup tables (coverage), AFI/MovieLens/TRIPOD (Anglophone-recent skew exactly
where we are thinnest), EIDR paid membership.

## Caveats
Coverage skew is the dominant risk — validate per-source on a stratified sample
of OUR titles before committing engineering effort. The most available fields are
the least discriminating; the most discriminating must be computed. Checkable vs
interpretive must be preserved: technical facts and ballots are records; themes,
form flags and industrial context are readings with sources.
