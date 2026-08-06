# pipeline — building the corpus

No language model runs in this directory.

    node pipeline/harvest.js pipeline/seeds.txt    # Wikidata -> out/harvest.json
    node pipeline/associate.js                     # harvest  -> out/spine.json
    node pipeline/merge-corpus.js                  # + readings -> static/corpus.json
    node pipeline/validate-corpus.js static/corpus.json
    node pipeline/measure-maps.js

## The association engine

`associate.js` builds typed connections between every pair of films from
structured attributes: shared crew, credited adaptations, the author of a
shared source work, declared art movement, main subject, narrative setting,
cast, unusual genre within a narrow window of years, and production company.

Claim text is generated from the overlap, so it is true by construction —
"Both adapt work by Dashiell Hammett" is a restatement of the data, not a
sentence anyone wrote. `confidence` is therefore 1.0 (the overlap is certain)
while `strength` carries how much that overlap actually binds the two films.
Different questions; the schema already separates them.

### Rarity is the whole idea

An association is interesting in proportion to how rare the shared thing is.
"Both are drama" is noise. "Both adapt Dostoyevsky" is a discovery. Every
shared value is weighted by inverse document frequency across the corpus, so
the engine's sense of what matters improves as the corpus grows.

Three guards stop the arithmetic producing rubbish:

- **VACUOUS** — abstract subjects ("human nature", "liberty", "memory") that
  IDF rates as rare in a small corpus but which describe nothing.
- **ADMIN_TYPES** — settings are checked against their own Wikidata type, so
  "both set in Kyoto" survives and "both set in Arizona" does not. The labels
  are indistinguishable as strings; only the type tells them apart.
- **MAX_EDGES_PER_VALUE** — an attribute explaining more than two pairs is a
  category, not a connection. "New Hollywood" once produced six identical
  edges.

Any claim still containing a raw `Q…` id is dropped: an unresolved label means
we do not actually know what we are asserting they share.

## Throttling and resume

Wikidata throttles progressively over a long session. Everything is cached in
`pipeline/.cache`, so an interrupted harvest resumes; `ATLAS_THROTTLE_MS`
tunes politeness (320 default, 800 when the API is annoyed). `ATLAS_OFFLINE=1`
builds from the cache alone and skips anything not yet fetched — useful for
producing a complete working corpus mid-harvest instead of waiting.

## Records vs authored

| File | Written by | Contains |
|---|---|---|
| `out/spine.json` | `associate.js` | generated records with Wikidata evidence |
| `../static/readings.json` | by hand | attested + interpretive claims |
| `../static/corpus.json` | `merge-corpus.js` | what the app loads |

`merge-corpus.js` refuses to run if `readings.json` marks an edge as a record.
Generated breadth, authored depth — and never the two confused.

## Two instruments

`validate-corpus.js` asks whether the graph is sound. `measure-maps.js` asks
whether the maps are varied — same-director share, type spread, era span. A
corpus can pass the first completely while every map it produces is dull.

---

## Stages, in order

| Stage | What it does | Needs network |
|---|---|---|
| `harvest-sparql.js` | Resolves seeds to Wikidata entities and pulls every attribute, values and labels together, in ~40 queries. Falls back to the REST resolver for titles whose punctuation differs from Wikidata's. | yes |
| `harvest.js` | The original REST path. Kept as a fallback for networks where `query.wikidata.org` is unreachable. Far slower; rate-limits hard past a few hundred titles. | yes |
| `enrich.js` | Poster URL + description per film, from Wikipedia via the Wikidata sitelink. Optional TMDB upgrade with `TMDB_KEY`. Records poster licence provenance. | yes |
| `palette.py` | Reads each poster and derives its duotone pair. Needs `pillow` and `numpy`. | yes (images) |
| `associate.js` | The association engine. Folds in `enrich.json` if present. | no |
| `merge-corpus.js` | Adds the authored readings, writes `static/corpus.json`. | no |
| `validate-corpus.js` | Schema and graph shape. Refuses a record below confidence 1. | no |
| `measure-maps.js` | Measures the *experience*: same-director share, type variety, year span. | no |

Every networked stage caches to disk (`.cache`, `.cache-sparql`, `.cache-enrich`,
`.cache-posters`) and is resumable. Interrupt and re-run freely.

`enrich.json` is optional by design: without it `associate.js` produces exactly
the corpus it did before, so a poster outage can never block a spine rebuild.
