# AGENTS.md — operating contract for ATLAS

Read this before writing code. It encodes decisions that are settled, not open
for re-litigation, and the standards this project is held to.

## The project in one line

ATLAS is a map of cinematic lineage. You name a film; it draws what that film
descends from, argues with, and rhymes with — each connection carrying a
specific, clickable claim.

## Settled decisions — change these only if explicitly asked

1. **Edge distance encodes formal bond strength, never popularity or node
   degree.** This was the founding correction. A degree-weighted graph collapses
   toward the canon and confirms what the user already knows. If you find
   yourself weighting by fame, stop.

2. **Every edge is a typed argument with evidence.** Five types only:
   `descent`, `rebuttal`, `convergence`, `rhyme`, `hand`. Vague "similarity" is
   banned. Each edge carries a `claim` string naming the specific formal link.

3. **Confidence is displayed, not hidden.** Claims below 0.5 confidence render
   dashed and are labelled "reading, not record". The model invents lineages;
   the interface must never launder that into apparent fact. Do not remove this
   for visual cleanliness.

4. **Captions never blur.** The imagery racks focus by graph distance; type
   stays sharp at every depth. This was a bug fix after a real usability
   failure — an earlier build gated titles behind focus and made the map
   unreadable. Depth controls label *weight*, never label *existence*.

5. **Posters are shown in full colour; the measured palette drives the
   chrome, not the photography.** This reverses the original rule, which
   applied a posterize + duotone screen print to every image. That treatment
   muddied 790 real one-sheets into one palette and was the weaker choice —
   see HISTORY, "Deliberate break with AGENTS rule 5". The per-film colour
   measured by `pipeline/palette.py` is still load-bearing: it drives each
   film's edge, glow and panel accent. Do not reintroduce the duotone on
   imagery, and do not delete the palette work because the posters no longer
   use it.

6. **No fan/alternative poster art.** Mondo, Olly Moss, Poster Posse and
   similar are individually copyrighted commercial artwork with no licensed
   source. The non-English official posters TMDB holds (Polish, Czech,
   Japanese) provide the illustrated quality legitimately.

6b. **Photography is resolved at BUILD time, never at runtime.** Posters live
   in `corpus.json` as URLs, put there by `pipeline/enrich.js`. Do not
   reintroduce a per-page-load poster search: it makes artwork depend on a key
   the user must obtain, an origin CSP can refuse, and an API that can rate-limit
   — and it returns a different answer on different days. The shipped app makes
   no API call and holds no credential. TMDB stays supported as a build-time
   upgrade (`TMDB_KEY=...`), not as a runtime dependency.

6c. **Poster licence is recorded per film and must stay that way.** Wikipedia
   serves freely licensed images from `/wikipedia/commons/` and non-free
   fair-use ones from `/wikipedia/en/`, and only the URL distinguishes them.
   `posterLicence` carries which. Most of this corpus is `non-free`, which is
   defensible for a personal project and not for a commercial one. Do not drop
   the field to tidy the schema — it is the only thing that makes the exposure
   auditable.

7. **Lineage source is pluggable; the corpus is the default.** Running the map
   from a live model call per seed is expensive and re-rolls the graph on every
   request. A baked corpus costs nothing at runtime, returns the same answer
   twice, and — decisively — can be corrected. Do not reintroduce a per-request
   model call as the primary path.

8. **`record` and `reading` are different kinds of claim.** A shared
   cinematographer is checkable against credits. A rhyme between two framings
   is an argument. Do not collapse them back into a single confidence number,
   and do not let a generated reading be presented with a record's authority.

9. **The generated cell is not a fallback.** With no TMDB dependency it is the
   visual identity. It is composed, deterministic per film, and drawn in that
   film's own colours. Do not replace it with a grey placeholder or a spinner.

## Quality bar

- No fabricated APIs, package behavior, test results, or claims of completion.
- Do not report something as working without evidence. "It builds" is not
  "it works".
- Preserve existing behavior unless changing it is the task.
- Do not silently drop features, visual details, or edge cases to simplify
  implementation.
- State remaining uncertainty plainly rather than burying it under optimism.

## Validation expectations

Visual work is not done when the elements are present. Before declaring a
visual change complete, render it and inspect at desktop / tablet / mobile.
`validation/harness/probe.py` drives the real component with stubbed network
responses and prints PASS/FAIL. It measures cell-vs-cell, caption-vs-caption,
caption-vs-cell, chrome-vs-panel occlusion, clipping, and key reachability, at
three sizes with the panel both open and closed.

Measuring one class of overlap is not measuring overlap. The 390px defect that
survived the last handoff was a caption lying across a *neighbouring* cell
while cell-vs-cell and caption-vs-caption were both clean. When you add a check,
prove it can fail: break the thing deliberately, confirm the probe reports it,
then fix it again.

## Style

Complete runnable code, not fragments. Comments explain intent and non-obvious
constraints; they do not narrate straightforward lines.
