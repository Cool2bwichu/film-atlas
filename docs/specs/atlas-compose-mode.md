# ATLAS — Compose Mode

**Third spec. Suggested home: `docs/specs/atlas-compose-mode.md`.**
Depends on `atlas-fingerprint-layer.md` and its v1.1 addendum. Build those first —
compose mode is unimplementable without axes, and trivial once they exist.

---

## 1. The unifying idea

ATLAS has two jobs that look like different products and are not:

- **Browse.** Poster wall → pick a film → radial map of its connections. Wander.
- **Compose.** Choose the qualities you want → get the one film closest to that →
  radial map of other films that answer the same brief differently.

These are the same engine. **The map always centres on a point in fingerprint
space.** In browse mode that point *is* a film. In compose mode it's a point the
user built, and the centre film is whatever sits nearest to it.

Build it that way. One renderer, one distance function, one panel. Compose mode
is a different way of choosing the centre, not a second application.

```
queryPoint  ──┐
              ├──►  nearest film = centre  ──►  ring  ──►  same radial view
film.axes   ──┘
```

---

## 2. What already exists

`static/discovery.json` is nearly this. It carries an inverted index over
`era`, `country`, `genre`, `movement` and `director`, with `filmOrder` and
`keyByFilmId`, and every facet currently sits at `selectable: false` — the
discovery-foundation plan deliberately built the contract and shipped no UI.

Compose mode is that contract turned on, plus three new facet kinds:

| Facet | Kind | Source |
|---|---|---|
| era, country, genre, movement, director | categorical | existing |
| **registers** | categorical | addendum §C |
| **themes** | categorical | fingerprint |
| **axes** | **continuous** | fingerprint |

Continuous facets are new to the format. They need a range selector, not a
posting list — store nothing extra, read `fingerprints.json` directly.

---

## 3. The query object

```json
{
  "v": 1,
  "registers": ["folk-horror"],
  "themes": ["ritual", "the-village"],
  "axes": { "dread": 85, "glare": 80, "urgency": 25 },
  "axisWeights": { "dread": 1.5, "glare": 1.5, "urgency": 0.8 },
  "filters": { "era": ["era:1960-1979", "era:2000-present"], "country": [] },
  "excludeSeen": true
}
```

Only stated axes participate in the distance. A user who names three qualities
is judged on three, not on thirty defaults — otherwise every query returns the
same handful of films sitting nearest the centroid of the corpus.

**Serialise the query into the URL hash.** The project already has hash
navigation. A composed map must be shareable and re-openable; this is one line
of work and it's the difference between a toy and a thing people send each other.

---

## 4. The picker

Thirty sliders is a mixing desk, not a discovery tool. Progressive disclosure,
three tiers:

**Tier 1 — Registers.** Plain-language cards: *Folk horror. Cerebral horror.
Slow cinema. Aching romance. Cyberpunk mood.* Pick one or two. Under the hood
each register sets its own axis ranges. Most users never go past here, and they
get a good answer.

**Tier 2 — Themes.** The closed vocabulary as chips, grouped by family, with
corpus counts shown. Grey out anything the current selection has already reduced
to zero.

**Tier 3 — "More precise".** The axes, as paired-word sliders using the pole
names, never the key: *murk ← → glare*, *ascetic ← → sensual*, *linear ←
→ fractured*. Show only axes the user has opened; default them to inactive, not
to 50.

**Live count, always visible.** "412 films match" → "3 films match" as they
narrow. A user who over-constrains must be able to see it happening rather than
hitting an empty result. When the count hits zero, name the constraint that did
it and offer to relax that one.

---

## 5. Choosing the centre

```
score(film) = 1 - weightedAxisDistance(query.axes, film.axes)
            + 0.25 · themeOverlapIDF(query.themes, film.themes)
            + 0.15 · registerMatch
```

Apply categorical `filters` as hard cuts first, then rank.

**Confidence guard.** Do not return a centre whose `axisConfidence < 0.5`. A
film scored from a two-line stub should not be presented as the definitive
answer to a careful query. Skip to the next best and note it in the panel.

**Tie-breaking.** When the top scores sit within 0.02, prefer the film with more
fingerprint edges — it makes for a better map, and a dead-end centre is a bad
first impression.

---

## 6. The ring — the part that makes this worth building

The obvious implementation is "next eight nearest," and it produces a boring
map: eight films clustered in the same direction, all near-duplicates of the
centre and of each other.

Instead: **each spoke deviates primarily along one of the criteria the user
chose.** Their word for this was *elaborations* — same brief, answered
differently.

```
for each axis a in query.axes (ranked by user weight):
    emit the best film that
      - stays within tolerance on every OTHER stated axis
      - deviates most on a, in whichever direction has candidates
      - is not already placed
```

Fill any remaining slots with best-overall runners-up. Cap at 8.

The result is a map with a **grammar**: every spoke means "same, but ___", and
the user can read the space around their query rather than staring at eight
lookalikes. That legibility is the whole reason to build compose mode instead of
a ranked list.

**Label every spoke with its trade**, rendered from the deviating axis:

> *The Witch* — same dread and ritual, but in murk instead of daylight
> *Picnic at Hanging Rock* — same daylight and dread, gentler
> *Kwaidan* — same ritual, formal instead of naturalistic

Extending from a ring node re-centres on that film and switches to browse mode.
The query stays in the hash so the user can return to it.

---

## 7. "Gorgeous cinematography"

Worth handling explicitly, because it is a different kind of request and the
temptation is to invent an axis for it.

It splits in two:

**The describable part** is already covered — `formalism` (is the frame
arranged?), `ornament` (density of the visual world), `hardness` (contrast),
plus the stills-derived palette. A new `pictorialism` axis would almost
certainly correlate with `formalism` above r = 0.85 and be merged by the
addendum's own gate. Don't add it.

**The evaluative part — "gorgeous" — is a judgment, and it should come from a
record, not from the model's taste.** Harvest cinematography awards and
nominations from Wikidata (`award received` / `nominated for`) in
`harvest-sparql.js`; you are already running SPARQL and this is a small addition
to the query. Then the filter reads *"celebrated cinematography"*, backed by a
citation, instead of *"gorgeous"*, backed by nothing.

The same split applies to any other quality word users will ask for —
*beautifully acted*, *great score*. Describe with axes; evaluate with records.

---

## 8. Browse mode is still the front door

Do not let compose mode become the landing page. Someone with nothing specific
in mind should still meet the poster wall and be able to fall into a film for no
reason. Compose is a door beside it — *"I know what I'm in the mood for"* — not
a gate in front of it.

Both modes end in the same radial view, which is what makes the site coherent
rather than two tools sharing a stylesheet.

---

## 9. Gates

13. **Ring diversity.** For any query with ≥ 3 stated axes, the 8 ring films must
    deviate on at least 3 distinct axes. If they all deviate on one, the
    diversification failed and you have built the boring version.
14. **Round trip.** A query serialised to the hash and reopened must produce a
    byte-identical centre and ring.
15. **No empty dead end.** Every reachable query state either returns films or
    names the constraint that emptied it. Test the over-constrained case
    deliberately.
16. **Centre honesty.** No returned centre has `axisConfidence < 0.5`.
17. **Worked example, end to end.** Query `{registers: [folk-horror], axes:
    {glare: 85, dread: 85}}` must return *Midsommar* as centre and place *The
    Wicker Man* in the ring. If it doesn't, the register rules or the weights
    are wrong — not the fixture.
18. **Real browser at 390 px.** The picker is the hardest thing in this project
    to make work on a phone. Verify by eye; jsdom will tell you it's fine.
