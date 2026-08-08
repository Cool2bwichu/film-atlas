# Atlas Constellation Discovery and Library Growth Design

**Status:** Approved design direction

**Date:** 2026-08-08
**Scope:** Qualify the 2,204-film expansion, turn the constellation into Atlas's primary discovery instrument, preserve exploration trails locally, add deterministic natural-language lenses, and establish a safe path toward a 3,000–5,000-film Core plus a larger Archive.

## 1. Purpose

Atlas is a map of cinematic lineage. Its value is not that it contains a large catalogue of titles. Its value is that it makes a specific, inspectable argument about why films belong near one another and lets a reader follow that argument through cinema.

This design gives the constellation a job before a film is selected. It turns the whole-sky view into an exploratory instrument built around questions, lenses, exact claims, and recoverable journeys. It also defines how the library can grow without allowing shared credits, weak metadata, or sheer volume to overwhelm the authored and interpretive character of the project.

The memorable loop is:

> question → lens → film → claim → re-anchor → trail → deeper question

## 2. Binding product laws

The redesign preserves the settled rules in `atlas/AGENTS.md` and `atlas/DESIGN.md`:

1. Edge distance represents formal bond strength, never popularity or degree.
2. Every edge is one of five typed arguments: `descent`, `rebuttal`, `convergence`, `rhyme`, or `hand`.
3. Confidence and evidence class remain visible. A reading is never presented with a record's authority.
4. Imagery may rack focus; captions and essential type never blur.
5. Film-derived palettes drive the chrome while posters remain in full colour.
6. Runtime behavior is deterministic and requires no model API, search API, private key, or changing external response.
7. Generated film cells remain a designed identity, not a broken-image fallback.
8. Every film remains the same size in the constellation.
9. Canonical sky positions are computed at build time and remain stable between visits for a fixed corpus and layout version. A release that changes the graph or solver publishes a new layout version rather than pretending the old coordinates survived.

The darkroom language remains binding: warm film base, slate metadata, ruled paper, perforated strips, restrained camera motion, zero-radius surfaces, and colour originating from films rather than from generic UI chrome.

## 3. The 2,204-film qualification problem

The prepared expansion is real and technically buildable:

- 2,214 requested seed lines;
- 2,204 harvested and enriched films;
- 8 unresolved titles and 2 duplicate seed entries;
- 2,129 posters;
- 2,195 descriptions;
- 1,839 films with TMDB keywords;
- 21,186 total keywords.

A read-only stress build produced one connected graph with no orphans. The artifact was approximately 7.09 MB raw and 0.90 MB compressed, and the deterministic sky layout completed in approximately 1.74 seconds on the test Mac. That proves technical feasibility, not experience quality.

| Quality signal | 803 films | 2,204-film stress build |
|---|---:|---:|
| Crew among displayed claims | 21.2% | 55.1% |
| Authored among displayed claims | 33.1% | 11.8% |
| Repeated displayed claim text | 3.6% | 11.5% |
| Mean dominant relationship-type share | 56% | 76% |
| Interpretive relationships | 28% | 10% |
| Distinct relationship types per map | 3.02 | 2.11 |
| Same-director displayed claims | 9% | 21% |

None of the roughly 1,402 newcomers touches an authored claim. Structural validation passes while the experience-quality validator fails. The expansion is therefore a qualification target, not an automatic replacement for the 803-film experience.

The table is a preliminary architecture baseline from a read-only temporary build, not the release audit. Phase 1 must regenerate it as a versioned machine-readable baseline manifest containing the Git commit, corpus and source-file hashes, corpus version, resolver and association versions, exact commands and flags, map size, sample definition, artifact paths, UTC timestamp, and hardware as informational context. Quality reports embed or reference that manifest so later results can be reproduced against the same inputs.

Metric terms are fixed as follows:

- A **displayed claim** is one of up to six connections chosen for a film by the production resolver. Its denominator is every such film-to-connection presentation, so one undirected edge may appear in two film maps.
- **Authored among displayed claims** counts displayed connections whose source is not `record`, including `reading` and `attested`.
- **Crew among displayed claims** counts displayed record connections whose signal is `crew`; a superseding authored claim counts as authored rather than crew.
- **Repeated displayed claim text** counts only the second and later exact claim-string occurrence within the same film's six-connection map, divided by all displayed claims.
- **Same director**, **single dominant type**, and **interpretive** are unweighted means of their per-film map shares. Interpretive counts `source === reading`; `attested` does not enter that metric.

## 4. Three linked workstreams

### A. Qualified 2,204-film foundation

Complete palette recovery, stable identity, facet preservation, association rebalancing, provenance, quality measurement, and browser validation. The 803-film experience remains the baseline until the larger corpus passes structural and experiential gates.

### B. Constellation discovery system

Add Generated Programmes, deterministic Ask the Atlas, stable category lenses, connection layers, a film-strip trail, and a locally persisted contact-sheet journal while preserving the current orbit and exact-claim interaction.

### C. Core and Archive scale architecture

Harden ingestion, association indexing, progressive delivery, and admission review before growing toward a 3,000–5,000-film Core and a larger searchable Archive.

Workstream A supplies trustworthy data to B. Workstream B determines which facets and evidence A must preserve. Workstream C begins only after A and B establish measured baselines.

## 5. Experience architecture

### 5.1 Meaningful arrival

The resting constellation leads with three to five Generated Programmes rather than mechanical instructions such as “drag to pan.” These are deterministic, data-derived questions that give the field an immediate purpose.

Example:

> **After neorealism: the city looks back**
>
> 52 films across 11 countries connected by location, non-professional performance, later descent, and rebuttal.

Every programme shows its question, rationale, film count, internal connection count, evidence mix, coverage caveats, and exact lens recipe.

### 5.2 Lens behavior

When a programme or user question activates a lens:

1. matching films retain full film-derived colour;
2. contextual films recede almost completely and become non-interactive;
3. only relationships whose endpoints are both active remain eligible;
4. selected connection layers further restrict those relationships;
5. the camera refits to active bounds without moving that corpus version's canonical positions;
6. the readout reports active films, internal connections, evidence mix, and coverage limitations.

Stable positions preserve spatial memory across lenses.

### 5.3 Anti-circular discovery

Selecting a category must not manufacture its own evidence. A Japanese cinema lens suppresses a country basis. A horror lens suppresses a genre basis. The field instead reveals independent connections: craft, adaptation, descent, rebuttal, subject, setting, or authored rhyme.

This rule also applies to geometry. Pure category co-membership proposals are not canonical relationship edges and never act as springs in the sky solver. They are stored, when useful, as optional category guides. A relationship with several bases may remain only when an independent geometry-eligible basis survives, and its displayed claim must describe that surviving basis.

An advanced **Include category guides** control can show shared membership as a clearly labelled overlay. Guides do not alter canonical positions, relationship counts, or evidence measures and are never presented as arguments. Suppression is the default.

### 5.4 A film in hand

Selecting a film preserves the latest Constellation behavior:

1. the film becomes the anchor;
2. its strongest relevant neighbours remain held open;
3. selecting a neighbour reveals the exact claim, relationship type, signal, confidence, evidence class, and attribution;
4. the user can re-anchor in place or explicitly open the radial lineage map.

The readout distinguishes connections inside the active lens from total known connections.

### 5.5 Film-strip trail

A slim perforated film-strip rail preserves the immediate route.

- The field paints only the live connection.
- Older steps live in the strip rather than accumulating as permanent lines.
- Hovering or focusing an older frame recalls that step only while hover or focus remains, then restores the live state.
- On touch, a tap pins a clearly marked historical preview; **Resume here** forks from it and **Return live** restores the current route.
- The strip can collapse without losing history.

### 5.6 Contact-sheet journal

Longer exploration history folds into a locally stored contact-sheet journal. Users can revisit a film or connection, name a journey, add a private note, fork from an earlier step, save discoveries, export a journey, and clear history.

The journal is private by default and requires no account. It opens as a darkroom drawer on desktop and a bottom sheet on mobile.

### 5.7 Ask the Atlas

Ask the Atlas is a local deterministic interpreter, not a runtime AI call. It maps natural-language questions onto known facets, relationship types, evidence classes, and signals.

Before applying a result, Atlas shows its interpretation. The interpreter:

1. never creates a film, facet, relationship, or claim;
2. returns the same result for the same corpus and query;
3. displays the terms and constraints it applied;
4. refuses unsupported meaning instead of guessing.

Ambiguous questions produce two or three supported interpretations. Unsupported questions identify the unavailable concept and suggest the nearest valid lenses.

### 5.8 Progressive expert depth

The Optical Bench remains available as an inspector, not the front door. **Inspect this lens** reveals the exact facets, relationship layers, evidence classes, counts, and exclusions behind a Generated Programme or Ask result. New readers receive meaning first; expert users retain precise control.

## 6. Lens semantics and sharing

- OR within one facet: France **or** Italy.
- AND between facets: France/Italy **and** 1960–79 **and** crime.
- Year ranges are inclusive.
- A film must satisfy the facet expression to become active.
- An edge must have both endpoints active.
- Relationship layers then filter eligible edges.
- Exact selected-facet bases are suppressed by default; pure co-membership is available only as a labelled category guide.
- Empty and disconnected results are valid designed states.

Optional bridge mode is off by default. When requested, it may reveal a nonmatching film only if qualifying independent relationships connect it to at least two active films. Bridge films are visually marked as context, remain outside active-film counts, and never weaken the selected lens or anti-circular rule.

The URL stores the corpus version, layout version, active lens recipe, programme identifier, anchor film, and inspected neighbour. It does not store private journal notes or full local history. Shared links reconstruct the semantic view, not the user's private memory. If a link opens against a newer layout, Atlas restores the lens and film identities, explains the version change when material, and refits rather than applying stale camera coordinates.

## 7. Visual and responsive system

The constellation remains the stage. Everything else behaves like equipment at its edge.

### Desktop

- A Generated Programme slate occupies one quiet lateral edge.
- Ask the Atlas sits within the existing search language, not in a chatbot panel.
- Claim and evidence readout occupies the opposite edge when a film is in hand.
- The film-strip trail runs along the lower edge.
- The contact sheet opens from the trail as a darkroom drawer.
- Lens controls remain collapsed behind **Inspect this lens**.

### Mobile

- The constellation retains the largest possible uninterrupted stage.
- Ask and the active lens count sit in compact top chrome.
- Exact claims move into a lower catalogue slate.
- The trail becomes a horizontal strip.
- The contact sheet becomes a bottom sheet.
- Desktop side rails are not squeezed into phone width.
- Touch targets remain at least 44px without visually inflating typography.

### Motion and restraint

- Lens changes rack focus and refit the camera using the existing easing.
- Films do not spring, bounce, or re-solve their positions.
- The active connection uses the established line-drawing grammar.
- Trail recall behaves like a temporary exposure.
- Reduced motion removes travel and staged reveals while preserving meaning.

The design avoids dashboard cards, permanent journey webs, particles, category-sized nodes, generic glow, chat transcripts, floating rounded filter chips, and motion that delays navigation.

## 8. Stable identity and admission manifest

Title-first identity is too fragile beyond a few thousand films. Every film receives a permanent internal ID anchored to a source identity where available.

The versioned manifest records:

```text
film_id
wikidata_qid
canonical_title
alternate_titles
release_year
stable_slug
slug_aliases
admission_cohort
admission_reason
candidate_source
review_status
source_provenance
```

Generated candidates that already have QIDs enter through those QIDs; the pipeline does not discard the identity and ask a title resolver to rediscover it. Correcting a title or year never retargets an authored reading or breaks a saved trail. Old slugs remain deterministic aliases.

A corpus release manifest records `corpus_version`, `layout_version`, schema versions, source hashes, and compatibility aliases. Determinism means identical inputs and versions yield identical positions. It does not promise that adding films or changing relationship weights leaves the old sky untouched.

## 9. Facet architecture

Categories remain separate from relationships. The first facet contract contains year/era, country or national cinema, normalized genre family, movement or tradition, director identity, and language only after it is harvested directly.

| Facet | Current 2,204-film coverage | Product treatment |
|---|---:|---|
| Year | 2,204 | Universal era lens |
| Country | 2,203 | Multi-value cinema lens |
| Director | 2,201 | Stable identity lens after QID normalization |
| Genre | 2,186 | Curated families; broad labels demoted |
| Keywords | 1,839 | Ask/programme ingredient, not primary chrome |
| Setting | 1,528 | Later lens after place normalization |
| Subject | 722 | Sparse advanced ingredient with disclosure |
| Movement | 454 | Special tradition lens with 20.6% coverage disclosed |

Facet values use stable IDs and a global label dictionary. Display labels may change without breaking saved lenses. Genre and country may define membership but remain weak relationship evidence. Movement is expressive but must never appear complete while most films lack the field.

Core admission requires a reviewed state—not invented metadata—for identity, canonical title, release year, origin/country, director attribution, and normalized genre family. Each field contains stable known values or an explicit reviewed state such as `unknown`, `anonymous`, or `uncategorized`. Movement, language, subject, setting, and keywords are optional disclosed fields.

Year/era, origin/country, and normalized genre may launch as broad Core lenses only while at least 95% of Core films have known values; reviewed unknowns remain separately selectable and count against known coverage. Language cannot become a broad launch lens before 90% known coverage. Movement remains a selective tradition lens at any coverage and always displays `known / total`.

## 10. Relationship architecture

Every relationship lives in a versioned manifest with a permanent opaque `edge_id`, permanent film endpoints ordered by ascending film ID, relationship type, signal, confidence, evidence class, one or more structured bases, and one or more exact claim variants. `bases` is a tagged array rather than a single facet field because a relationship may combine several records or rest on an authored observation.

Example relationship fragment:

```json
{
  "edge_id": "rel-000421",
  "endpoints": ["film-000087", "film-001204"],
  "bases": [
    {
      "basisId": "basis-movement-Q12345",
      "kind": "facet",
      "facet": "movement",
      "value": "Q12345",
      "role": "shared-membership",
      "primary": false,
      "geometryEligible": false,
      "contribution": 0.08
    },
    {
      "basisId": "basis-reading-00421",
      "kind": "authored-observation",
      "claimId": "reading-00421",
      "primary": true,
      "geometryEligible": true,
      "contribution": 0.78
    }
  ],
  "claimVariants": [
    {
      "claimId": "claim-000421-a",
      "text": "An exact authored claim.",
      "requiresAll": ["basis-reading-00421"],
      "requiresAny": [],
      "strengthBasisIds": ["basis-reading-00421"],
      "priority": 100
    }
  ]
}
```

Supported basis kinds include `facet`, `credit`, `source-work`, `record-event`, `attested-source`, and `authored-observation`. Every admitted relationship has at least one basis; migration may use an explicit `legacy-unresolved` basis only while review blocks release. Each basis has a stable ID, primary/secondary status, `geometryEligible` flag, provenance, and a quantized contribution in `[0,1]` from the versioned scorer.

After a lens suppresses bases, a claim variant is valid only when all `requiresAll` IDs remain and `requiresAny` is empty or at least one of its IDs remains. Valid variants sort by descending priority, descending number of satisfied required bases, then stable claim ID. Effective visible strength is `min(1, sum(contribution))`, quantized to four decimals, over the selected variant's surviving `strengthBasisIds`. A cached top-level strength may exist for delivery, but it is derived rather than authoritative. If no claim variant survives, the relationship is hidden. Rendering, ranking, readout, and counts all use the same selected variant and effective strength.

The relationship manifest records introduced and revised corpus versions, aliases, status (`active`, `retired`, `superseded`, `split`, or `merged`), and successor IDs. A one-to-one replacement may be a permanent alias. A split never guesses one successor: an old journey shows its preserved claim snapshot and the available successors. A retired relationship with no successor remains a tombstone for journey explanation but cannot render as a live line. A merge lists every predecessor and resolves each to the one active successor.

This contract supports anti-circular filtering without parsing QIDs or category names out of prose. Movement inherited from a director is stored separately from movement declared directly on a film. An exact shared value from any selectable membership facet is a category guide unless an independent relationship basis also survives.

Each layout version also publishes a facet-role eligibility matrix covering every film-membership facet that Generated Programmes or Ask the Atlas may select. The matrix maps a facet to every equivalent relationship basis role and its treatment. An exact positive membership basis for a selectable facet is never geometry-eligible in that layout version; if it is the relationship's only basis, it becomes a category guide.

The initial matrix includes:

| Selectable film facet | Equivalent basis roles excluded from geometry |
|---|---|
| Year or era | Exact year/era co-membership, `countryEra`, and `genreEra` membership components |
| Country or national cinema | Exact country and country-era co-membership |
| Normalized genre | Exact genre and genre-era co-membership |
| Movement or tradition | Shared direct or inherited movement membership; an independent attested lineage or authored observation may remain |
| Director | Same-director credit; other crew roles remain eligible unless they later become selectable facets |
| Language, keyword, setting, subject, or source work when enabled | Exact shared selected value |

Build validation cross-checks every recipe-visible facet against this matrix and fails on a missing equivalent basis role or an undisclosed eligible spring. Making a new film facet selectable therefore requires a reviewed matrix update and a new layout version. Relationship-type and evidence layers are not membership facets: filtering to `descent` or `reading` arguments may legitimately reveal geometry those arguments helped form.

## 11. Association-engine redesign

The current all-pairs engine is acceptable for qualification experiments at 2,204 films but is not the long-term growth architecture. Candidate generation moves to inverted indexes keyed by stable values:

```text
director QID -> film IDs
keyword ID -> film IDs
setting QID -> film IDs
source-work ID -> film IDs
movement ID -> film IDs
```

Machine-generated candidates require a meaningful shared indexed value. Reviewed authored and attested proposals are explicit exceptions: they enter the relationship manifest directly even when their films share no indexed value, then pass the same permanent-endpoint, provenance, deduplication, claim-variant, quality, and geometry validation. Each film maintains a bounded pool of its strongest machine candidates; the engine does not retain an unrestricted global proposal set.

Crew receives explicit controls because a prolific person's filmography must not become a complete clique:

- retain a small number of strongest, chronological, or formally differentiated links within a filmography;
- cap the contribution of any person and role to one film's displayed map;
- preserve useful connections within small filmographies;
- expose a creator's full filmography as a facet or route rather than thousands of duplicate pairwise claims;
- require non-crew diversity when sufficient candidates exist.

Selection remains deterministic, order-independent, and explainable. Rarity no longer depends on total corpus size `N`; a shared value's rarity component is `1 / log2(2 + documentFrequency(value))`, quantized by the versioned scorer. Other score inputs are intrinsic to the pair or shared value. Adding or editing a cohort therefore marks only changed values and every film in their posting lists as association-affected; unrelated old–old candidates do not change merely because the catalogue grew.

Incremental locality is an optimization with a correctness escape hatch, not a promise to preserve stale output. A scorer-schema change, any corpus-wide scoring input, or a connectivity-repair change triggers a full deterministic association rebuild. Every incremental release run compares canonical edge and candidate-pool hashes with a clean rebuild and falls back to the clean result on any mismatch. Global quality reports and the new corpus version's sky layout are always regenerated.

The canonical layout consumes only admitted relationship edges with at least one `geometryEligible` basis. Its spring weight is `min(1, sum(contribution))`, quantized to four decimals, over only those eligible bases. Category guides and `legacy-unresolved` bases never influence position. Build validation fails if a canonical edge has no independent eligible basis, if no claim variant is valid for its geometry-eligible bases, or if runtime selection presents a claim whose required basis was removed by the active lens.

Association output is evaluated twice: first as a structurally valid graph, then as a reading experience. Connectivity never substitutes for variety, specificity, or insight.

## 12. Generated Programme architecture

Generated Programmes are produced at build time from versioned recipes. A recipe defines:

```text
programme_id
title and question template
facet expression
relationship-layer expression
anti-circular exclusions
minimum and maximum film count
minimum internal connection count
evidence and relationship diversity gates
coverage and representation gates
ranking signals
corpus version
```

A candidate programme is admitted only when it passes all of the following:

- 24–120 active films;
- at least `ceil(active films × 1.5)` independent internal relationships after anti-circular suppression, with at least 80% of films touching one;
- at least three of the five relationship types, no one type exceeding 70% of six-connection presentations, and at least 15% authored-reading presentations;
- repeated displayed claim text below 6% and no single director responsible for more than 20% of included films;
- every included film has a known value for each positive defining facet, and global `known / total` coverage is attached to the result;
- any geographic or chronological breadth asserted by the title expressed as an exact recipe gate rather than inferred editorially;
- a film-set Jaccard similarity below 0.80 versus a higher-ranked admitted programme, unless their selected relationship-layer sets differ and their eligible-edge-set Jaccard similarity is below 0.60;
- useful results after exact category guides are suppressed.

These defaults live in a versioned programme-quality profile rather than presenter code. A programme based on a facet with less than 80% corpus coverage is labelled **selective**, shows `known / total` coverage, and may not use language implying a complete survey. Recipe-specific exceptions require an explicit reason and review status in the manifest.

Programme metrics use the Section 3 definitions with the production resolver restricted to the programme's active mask and up to six connections per film.

The build emits a stable ranked programme library for each corpus version. The resting slate may rotate that library using a stable seed derived from the corpus version and the UTC calendar date; programme membership and claims never change. Tests inject the clock, screenshots use a frozen date, and a missing or invalid clock falls back to corpus-version ranking. Reopening or sharing a programme therefore reconstructs the same lens even after the resting slate rotates.

Human curation can later promote, rename, annotate, sequence, or retire a generated programme without changing the underlying recipe. Generated origin remains visible; editorial intervention does not masquerade as automatic discovery.

## 13. Ask the Atlas interpreter

Ask the Atlas compiles a question into the same lens recipe used by Generated Programmes. Its local vocabulary contains:

- canonical facet labels and aliases;
- relationship-type and signal aliases;
- stable film and creator names;
- years, decades, and named era ranges;
- inclusion, exclusion, conjunction, and alternative terms;
- comparative phrases that the current grammar can honestly support.

The parser is governed by a versioned grammar and alias manifest. It normalizes Unicode, case, whitespace, and punctuation; protects quoted phrases; and uses longest recognized phrase matching. Precedence is:

1. quoted exact film or creator identity;
2. exact canonical labels and their longest multiword aliases;
3. explicit year ranges, decades, and named eras;
4. relationship, signal, and evidence terms;
5. declared stopwords.

`not`, `without`, and `except` exclude the next recognized phrase or explicit group. `or` joins values within one facet; `and` joins facets. A cross-facet `or`, dangling negation, or token that is equally valid as a film identity and a year produces alternative interpretations rather than an implicit choice.

Confidence is a deterministic parse class, not a model probability. Coverage is the share of non-stopword query tokens consumed by recognized phrases:

- **High:** one valid parse, 100% coverage, and no assumption;
- **Medium:** at least 67% coverage and a usable constraint, or two or more equally valid top parses;
- **Low:** less than 67% coverage, no usable constraint, or an unresolved operator.

Candidate parses sort by recognized-token count, total matched-phrase length, fewest assumptions, then stable-ID order. A versioned golden-query corpus fixes expected recipes, confidence, explanation, and collision behavior before UI work begins.

The interpreter returns the parsed recipe, matched phrases, ignored filler, confidence, assumptions, and one-sentence explanation. It has three response modes:

| Confidence | Behavior |
|---|---|
| High | Preview one interpretation and allow immediate application. |
| Medium | Present two or three materially different supported interpretations. |
| Low | Do not apply a lens; identify the unsupported concept and suggest nearby valid questions. |

The grammar never infers taste, sentiment, visual style, or thematic meaning that is absent from the data. A query such as “lonely neon films” can only work when normalized, inspectable motif data exists; otherwise Atlas states which part it cannot read. No claim text is generated from the query.

## 14. Trail and journal model

The live trail is an ordered sequence of meaningful states, not a record of every pointer movement:

```text
journey_id
step_id
timestamp
event_kind
corpus_version
layout_version
film_id
previous_film_id
edge_id
claim_id
edge snapshot: endpoints, type, claim text, evidence class
lens_recipe_id or inline recipe
programme_id
camera state when useful
private note
saved state
```

A step is created when the user applies or clears a lens, chooses a Generated Programme, accepts an Ask interpretation, re-anchors, explicitly saves a discovery, or forks a prior route. Hover, focus preview, temporary neighbour inspection, and camera-only movement do not flood history. Consecutive semantically duplicate states collapse deterministically.

The compact film strip keeps the current journey in memory. The contact-sheet journal persists named journeys, notes, and saved discoveries in local browser storage. Schema versions and migrations are explicit. Users can export a portable JSON journey, import a compatible journey, and clear all local data. Private history never enters the URL, build artifact, analytics, or network requests.

When a journey opens against a newer layout version, film IDs resolve through the identity manifest, edge IDs through the relationship manifest, and lens recipes through versioned facet aliases. A retired or split edge shows its preserved snapshot and successor choices without silently retargeting the historical claim. Camera coordinates are restored only when the recorded layout version still exists; otherwise Atlas refits the semantic state and records that the view moved between editions.

If storage is unavailable or full, the in-session trail continues and Atlas explains that it cannot persist after the tab closes.

## 15. Runtime and build boundaries

The authoritative app remains the existing self-contained vanilla experience. This project does not require a framework rewrite. During development, behavior is separated into testable responsibilities even if the build later inlines modules into one artifact.

Runtime responsibilities:

- `LensEngine`: facet semantics, active masks, anti-circular exclusions, counts, and URL round-trips;
- `AskInterpreter`: deterministic text-to-recipe parsing and explanation;
- `SkyController`: camera fit, drawing, hit testing, keyboard navigation, search, orbit state, and accessible announcements under the active mask;
- `TrailStore`: current journey, persistence, schema migration, import, export, and clearing;
- `AtlasPresenter`: programme slate, lens inspector, claim readout, film strip, contact sheet, and honest states.

Build responsibilities:

- identity and admission manifest;
- normalized facet dictionaries and per-film memberships;
- indexed association generation and claim-quality measurement;
- Generated Programme construction and qualification;
- deterministic sky layout;
- full, packed, and eventually sharded artifacts with semantic parity.

The modules share one versioned schema contract. A **packed build** means byte-compressed delivery of the same logical corpus; full, packed, and sharded representations must preserve the same identities, lens memberships, relationship bases, evidence classes, claims, programmes, and canonical positions.

The existing reduced `--films` output is a **sample build**, not a compact release artifact. It is a projection over surviving identities and may recompute layout, counts, and eligible programmes. Sample-build parity covers the retained records, facet meanings, relationship claims, and evidence only; it does not claim global membership, programme, count, or coordinate equality and cannot qualify a release.

## 16. Honest incomplete, empty, and error states

| Situation | Atlas response |
|---|---|
| No films match | Keep the question visible, name the constraints that eliminated the field, and offer the smallest reversible relaxation. |
| Films match but no internal connections survive | Show the films without invented lines; explain that no qualifying internal claims are known and offer optional bridge films or labelled category guides. |
| Active anchor falls outside a new lens | Release the anchor, announce why, preserve it in the trail, and refit the field. |
| Sparse facet coverage | Show the exact known/total coverage before application and keep the caveat in the active-lens readout. |
| Ambiguous Ask query | Preview supported interpretations; do not silently choose. |
| Unsupported Ask concept | Name the unavailable concept and offer nearby vocabulary; do not fabricate a result. |
| Missing poster or palette | Use the designed generated film cell and classify the palette source. |
| Local storage failure | Retain the in-session route and explain that it will not survive the session. |
| Imported journey refers to retired IDs | Resolve permanent aliases where possible and list unresolved steps without retargeting them. |
| Detail or edge shard cannot load | Keep the constellation usable, identify unavailable detail, and offer retry without discarding the journey. |

## 17. Accessibility and responsive requirements

The constellation is canvas-led but not canvas-only.

- Every active film is reachable through a queried or virtualized semantic navigator; every connection exposed for the current anchor is represented in an ordinary semantic list and exact-claim readout.
- Keyboard navigation excludes hidden films and follows a predictable spatial or ranked order.
- Search, film selection, re-anchoring, programme application, trail recall, journal opening, and lens clearing all work without a pointer.
- Focus is visible and restored to the invoking control when drawers or sheets close.
- Live announcements report lens counts, anchor changes, inspected claims, and empty states without narrating continuous camera motion.
- Relationship type, evidence class, selected state, and coverage are never communicated by colour alone.
- Full-colour film cells and film-derived chrome retain sufficient local contrast for labels and focus states.
- Touch targets are at least 44px while the mobile constellation remains visually spacious.
- Reduced motion removes camera travel, stagger, and line-drawing animation while retaining immediate state transitions and trail recall.
- The contact sheet follows logical reading order and supports text scaling without clipping.

The semantic navigator does not create a hidden 2,204–5,000-item DOM. It offers search plus a paged or virtualized result window of at most 50 rendered films, reports total and position through `aria-setsize` and `aria-posinset`, and uses a deterministic title/year order by default with an optional spatial-neighbour order. Under sharding, it searches the complete boot index and loads details on demand, so accessibility does not depend on whether a poster or edge shard is resident.

Desktop, tablet, and phone are separately composed. Mobile may reduce contextual labels and edge density, but it must not change the meaning of the lens or claims.

## 18. Performance and delivery model

Applying a lens is an indexed mask operation:

1. resolve stable facet IDs;
2. combine cached facet bitsets using OR-within and AND-between semantics;
3. derive eligible edges whose endpoints are active;
4. remove exact selected-facet bases unless explicitly restored;
5. rebuild or retrieve a strength-sorted, evidence-stratified visible-edge list;
6. update hit testing, keyboard targets, search, labels, orbit neighbours, counts, and accessibility state from the same mask;
7. fit the camera to active bounds with one similarity scale.

No runtime force solver runs. No arbitrary lens changes canonical coordinates. Expensive work is event-driven, not continuous in the animation loop.

The 2,204-film release may remain a monolithic artifact if browser measurement supports it. Before the Core exceeds roughly 5,000 films, delivery separates into:

- a small boot index containing identity, title aliases, year, top-level facets, palette, and coarse position;
- lazy film-detail shards;
- per-film or locality-based edge-and-evidence shards;
- a Generated Programme manifest;
- optional versioned local caching.

The first meaningful constellation must not wait for every synopsis, poster, or edge claim. Shard failures degrade detail, not navigation or local history.

## 19. Atlas Core and Atlas Archive

Atlas has two honest scale tiers.

### Atlas Core

The Core contains approximately 3,000–5,000 films admitted strongly enough to support the whole-sky experience. Every Core film satisfies the reviewed mandatory-field contract in Section 9, has a viable connection map, qualified imagery treatment, and a defensible reason for admission. Optional sparse facets are never admission requirements. The Core is the authored public face of the Atlas.

### Atlas Archive

The Archive may grow beyond 10,000 films, but it is searchable and progressively revealed rather than rendered as an indiscriminate field of 10,000 simultaneous dots. Archive films enter through a question, lens, creator, route, or search result and load the relevant local neighbourhood. Archive status does not imply the same authored coverage as Core status; that distinction is visible.

Promotion from Archive to Core is a reviewed event with recorded reasons and quality results. Corpus size alone is never a release metric.

## 20. Admission and representation strategy

Growth proceeds in reviewed cohorts of approximately 500–1,000 films. Each cohort has an explicit purpose and distribution audit before admission.

Future cohorts deliberately broaden:

- underrepresented national and regional cinemas;
- documentary and nonfiction traditions;
- animation;
- experimental and artists' film;
- shorts;
- early cinema;
- independent and low-budget movements;
- films poorly represented by English-language knowledge infrastructure.

The admission system preserves the candidate source and reason, supports multilingual Wikipedia sitelinks and Wikidata descriptions, and does not require an English Wikipedia article as a universal gate. It caps the influence of any one director, crew lineage, country, era, or source list. Shared-crew expansion remains one signal among several, never the recursive definition of relevance.

Every cohort is evaluated globally and within meaningful regional, era, and form lenses. A superficially balanced total cannot hide a weak or mechanically connected subgroup.

## 21. Authored insight strategy

Authored readings remain human acts. Atlas does not bulk-generate interpretive claims and label them editorial depth.

New authored work is targeted where it changes the experience most:

- hand- or crew-dominated maps;
- thin regional, era, movement, and form lenses;
- important bridges between traditions;
- films whose mechanical neighbours fail to explain their formal significance;
- Generated Programmes that are structurally rich but conceptually mute.

Attested claims require an inspectable source URL or bibliographic reference, not attribution prose alone. Authored claims retain author, review state, source notes where applicable, review date, and revision history.

Coverage is measured by substantial lens as well as corpus-wide. The original canon must not receive all interpretive attention while newly admitted cinemas receive only mechanical credits.

## 22. Rights and provenance

The current expansion's media cannot be described collectively as cleared or “properly licensed.” Its poster pool includes a large majority of non-free Wikipedia images, a smaller Commons set with per-file obligations, and films with no image. Before public or commercial scaling, every retained asset uses a provenance record containing:

```text
source provider
source asset ID
source page
creator or rightsholder when available
exact license
license URL
required attribution
commercial-use status
retrieved-at timestamp
local review status and notes
```

The same discipline applies to synopsis extracts, keyword sources, and other imported metadata. Product copy distinguishes source, licence, permission, and local review; it never converts a provider category into a legal conclusion.

Unresolved rights do not block local engineering experiments, but they do block a public or commercial release that depends on those assets. The generated film cell remains a first-class visual option, not a shame state.

## 23. Qualification gates

The 2,204-film corpus can replace the 803-film baseline only after all of these gates pass:

### Structural and identity gates

- exactly one intended connected component;
- zero structural orphans;
- at least 99% of films can fill a six-connection map;
- no unexplained identity move, slug retargeting, or authored-claim endpoint change;
- every dropped authored claim is explicitly reviewed;
- unresolved seed identities are resolved or deliberately retired with a reason.

### Map-experience gates

The repository's existing thresholds remain absolute failure cliffs:

- mean same-director share below 35%;
- mean dominant relationship-type share below 72%;
- interpretive relationships above 15%;
- displayed crew relationships below 40%;
- repeated displayed claim text below 6%;
- no substantial era, region, form, or launch lens crosses an absolute floor solely while the global average passes.

Passing those floors is necessary but not sufficient to replace the stronger 803-film experience. Promotion also uses the frozen baseline's unrounded values and permits no more than these corpus-wide regressions:

- same-director share: baseline plus 5 percentage points;
- mean dominant-type share: baseline plus 5 percentage points;
- interpretive share: baseline minus 5 percentage points;
- authored among displayed claims: baseline minus 5 percentage points;
- displayed crew share: baseline plus 5 percentage points;
- repeated displayed claim text: baseline plus 1 percentage point.

Using the rounded evidence in Section 3, those correspond approximately to 14%, 61%, 23%, 28.1%, 26.2%, and 4.6%. The generated manifest, not the rounded prose, supplies executable limits. The surviving 803-film cohort is also measured inside the expanded graph and may regress by no more than 2 percentage points on any of these measures.

A **substantial lens** contains at least 30 active films and 60 qualifying independent internal relationships after anti-circular suppression. Each substantial launch lens and every Generated Programme receives its own six-connection map report. It must pass the absolute floors; where a directly comparable 803-film lens baseline exists, the same regression budget applies.

These thresholds are release floors, not optimization targets. Representative maps and programmes must still be read by a human reviewer for specificity, variety, and usefulness.

### Data, visual, and delivery gates

- every palette failure is resolved or explicitly classified, with no unexplained unreadable source;
- facet coverage and provenance are measured and surfaced honestly;
- full, packed, and sharded representations preserve semantic parity where each exists;
- deterministic rebuilds produce stable identities, memberships, programmes, and positions;
- production build, automated checks, real-browser interaction checks, accessibility checks, and representative device checks pass;
- poster rendering and generated-cell rendering are both inspected rather than inferred from a build result.

## 24. Test and validation strategy

Validation is layered because no single passing command proves that the Atlas works.

### Data and identity tests

- manifest uniqueness, permanent IDs, slug aliases, and title/year correction behavior;
- permanent relationship IDs, canonical endpoint order, one-to-one aliases, retirement tombstones, and split/merge journey behavior;
- authored endpoints and saved-journey resolution across corpus versions;
- normalized facet IDs, multi-value membership, coverage totals, and inherited/direct movement distinction;
- provenance field completeness by asset policy.

### Association and quality tests

- deterministic, order-independent selection;
- basis contribution aggregation, claim-variant validity after suppression, and geometry exclusion of category guides;
- crew contribution caps and non-crew diversity;
- incremental output equivalence to a clean rebuild;
- claim repetition, relationship/evidence mix, same-director share, orphan/component status, and six-link fill rate;
- the same measures for substantial launch lenses and programmes.

### Lens and interpreter tests

- OR-within and AND-between semantics;
- inclusive date ranges and exclusions;
- both edge endpoints inside the active mask;
- every selectable facet covered by the layout's facet-role matrix, with no exact positive membership basis remaining as an undisclosed spring;
- exact selected-facet membership shown only on request as category guides, never restored as canonical evidence;
- full and packed same-corpus builds yielding identical recipes and memberships, while sample builds preserve only the documented projection contract;
- Ask aliases, ambiguity handling, unsupported terms, explanation text, and deterministic round-trips;
- URL reconstruction of lens, programme, anchor, and inspected neighbour.

### Runtime interaction tests

- hidden films excluded from pointer, touch, keyboard, search selection, labels, and orbit neighbours;
- anchor retention or release when a lens changes;
- empty, single-film, disconnected, and bridge-offer states;
- camera fit to active bounds without X/Y distortion or chrome overlap;
- film-strip recall without permanent line accumulation;
- journal persistence, schema migration, import/export, clearing, private-note exclusion from URLs, and storage failure;
- detail-shard failure without loss of the navigable field or journey.

### Rendered experience review

Inspect the real artifact at representative desktop, tablet, and phone sizes. Review first impression, hierarchy, readable claims, lens discoverability, loading, empty/error states, hover, focus, selection, keyboard order, touch behavior, reduced motion, text scaling, overflow, clipping, contrast, poster quality, generated cells, and sustained pan/zoom smoothness. The missing geometry probe referenced by the repository must be restored or replaced before visual completion is claimed.

## 25. Delivery sequence

Each phase creates a stable checkpoint and is validated before the next one begins.

1. Freeze and record the 803-film and current 2,204-film structural and map-quality baselines.
2. Introduce the QID-first identity/admission manifest and permanent aliases.
3. Re-key reusable palette measurements and the recovery ledger by permanent film ID plus source-asset identity, then finish slow, serial recovery and explicitly classify every remaining source failure.
4. Preserve normalized era, country, genre, movement, and director facets through full and packed same-corpus builds.
5. Add the permanent relationship manifest, structured basis contributions, claim variants, aliases, and stronger evidence provenance.
6. Replace unrestricted all-pairs/crew-clique behavior with indexed, bounded, deterministic candidate generation.
7. Rebalance the 2,204-film maps and add targeted authored or attested bridges until global and lens-specific gates pass.
8. Implement and test the shared `LensEngine` and active-mask contract without changing the visual surface.
9. Add Era, Country, and normalized Genre lenses plus relationship-type layers and anti-circular suppression.
10. Add Movement as a sparse, explicitly covered tradition lens.
11. Add Generated Programmes as the resting constellation's front door.
12. Add deterministic Ask the Atlas using the same recipe contract.
13. Add the film-strip trail, then the local contact-sheet journal and portable journey export.
14. Perform real-browser, responsive, accessibility, performance, and representative editorial review of the complete 2,204-film experience.
15. Promote the qualified expansion only if every release gate passes; otherwise retain the 803-film public baseline while remediation continues.
16. Introduce boot/detail/edge sharding before growth makes the monolith materially slow or unreadable.
17. Admit and audit balanced 500–1,000-film cohorts toward Atlas Core, then open progressive Archive growth.

## 26. Non-goals

This design does not include:

- a runtime LLM, remote search service, or nondeterministic recommendation API;
- a chat transcript as the primary interface;
- a runtime force solver or arbitrary rearrangement of canonical sky positions;
- automatic editorial or interpretive claims;
- a React or framework rewrite of the authoritative app;
- category-sized nodes, popularity encoding, or a permanent web of journey lines;
- rendering a 10,000-film Archive as one simultaneous mobile sky;
- exposing private notes or journeys through shared URLs or network calls;
- claiming public or commercial readiness while required media rights remain unresolved;
- promoting a corpus merely because the build, graph validator, or aggregate averages pass.

## 27. Definition of done

This programme of work is complete when:

1. the 2,204-film corpus satisfies identity, provenance, structural, experiential, visual, browser, accessibility, and performance gates;
2. category lenses and relationship layers preserve stable geography, apply documented semantics, disclose coverage, and avoid circular evidence;
3. Generated Programmes provide meaningful, inspectable arrivals that are stable for a corpus version;
4. Ask the Atlas translates supported questions into the same visible lens recipes locally and refuses unsupported meaning honestly;
5. a selected film retains exact claims and evidence, re-anchoring creates a restrained film-strip route, and longer journeys persist privately in an accessible contact-sheet journal;
6. full, packed, and sharded same-corpus artifacts preserve identity and meaning, sample builds obey their narrower projection contract, and progressive delivery has a measured migration point;
7. representative humans can spend a sustained session discovering films, understanding why they connect, returning to prior paths, and distinguishing records from readings without needing to understand the underlying data model;
8. the result still feels unmistakably like Atlas: quiet, cinematic, spatially grounded, evidence-honest, and designed around learning how films speak to one another.

Passing these conditions qualifies the next Atlas Core release. It does not imply that the Archive, rights review, or authored programme is ever finished; those remain governed, measurable forms of continuing work.
