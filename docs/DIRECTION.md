# DIRECTION.md — what ATLAS is becoming

**Provenance.** Authored by the project owner, converged in a working session
with ChatGPT and handed to this repository on 2026-08-08 to be incorporated
into the work. It is the fullest statement of intent the project has, and it
supersedes any narrower framing in `AGENTS.md`, `DESIGN.md` or `STATE.md` where
the two disagree — those files describe rules and state, this describes purpose.

Committed because the last full audit of this project was done in a session and
lost when the session ended. Direction that lives only in a transcript is one
context window away from being gone.

---

## The fundamental idea

**ATLAS is a map of cinematic lineage.**

Not a movie database. Not a Letterboxd clone. Not a recommendation carousel.
Not a giant generic "movies similar to this movie" graph.

The interaction is: choose a film → reveal several meaningful cinematic
relationships → choose one of those films → travel outward → keep building a
path through cinema.

The philosophical shift: model relationships between films as **arguments**,
rather than reducing everything to a similarity score.

> Every film is downstream of another.

> Pick a film and Atlas shows what it descends from, argues with, arrives
> alongside, rhymes with, or shares a creative hand with. Every connection
> carries an actual claim explaining why it exists.

That last sentence is the soul of the project. The graph was never supposed to
say `Blade Runner → Alien: 84% similar`. It was supposed to name the exact
cinematic tissue connecting them.

## The five-relationship grammar — keep it sacred

- **DESCENT** — lineage, influence, adaptation, inherited formal language,
  shared source ancestry.
- **REBUTTAL** — one film pushes against, reverses, critiques or answers
  another film or cinematic idea.
- **CONVERGENCE** — films independently arrive at related territory.
- **RHYME** — a formal, thematic, visual, emotional, structural or conceptual
  echo without necessarily implying influence.
- **HAND** — concrete craft lineage: directors, cinematographers, composers,
  editors, performers, studios, collaborators.

"Similar" is banned as the primary explanation. Similarity collapses dozens of
different relationships into one meaningless bucket. Atlas asks **related
how?**, and every line must answer.

## Relationship TYPE vs relationship CLAIM

The type gives the broad grammar (`RHYMES WITH`). The line itself should be
more specific: *turns on*, *is about*, *shares a place*, *shares a face*,
*shares a house*, *belongs with*, *shares a source*.

Six connections all labelled `RHYMES WITH` makes the taxonomy visible while
hiding the interesting information. **The graph should teach you something
before you click anything.**

## One best-fit connection — curation over bombardment

Atlas should not vomit 40 marginal connections onto the screen because it can.
The ideal is a small handful of unusually good doors, and for each relationship
family the *best defensible representative* — not an arbitrary film clearing a
threshold. Less a network visualisation, more an editorial intelligence system.
The graph underneath may hold enormous numbers of edges; the human should see
only the ones worth seeing.

## The anti-popularity rule

Distance represents the **strength or significance of the cinematic
relationship, not popularity**. Weighting famous or highly-connected films
toward the centre turns the graph into a gravitational popularity well —
everything collapses toward Kubrick, Hitchcock, Scorsese, Spielberg, Kurosawa.
Interesting obscure films become peripheral because nobody has heard of them
rather than because the connection is weak. That destroys what Atlas is for.

Canonical importance may exist; **fame must not masquerade as relational
significance.** A strange 1967 Czech film may sit closer to a 2024 film than
*Citizen Kane* if the cinematic relationship justifies it.

## The evidence philosophy

**Record** is checkable: same cinematographer, same composer, same source
author, documented influence, same studio. **Reading** is interpretive: these
two films treat architectural confinement similarly; this film inverts the
moral logic of another.

The distinction is deliberately visible. Low-confidence readings render dashed
and say *reading, not record*. This is not legalistic bookkeeping — it is
philosophical humility. **Atlas is allowed to think. Atlas is not allowed to
pretend its interpretation is history.**

## The quality standard for a claim

> Could I paste this sentence between ten unrelated films without it becoming
> obviously wrong?

If yes, it is not specific enough. Not *"both feature themes of loneliness"*
but *"both isolate a still figure against moving crowds, making social space
feel physically inaccessible."* Now you can picture it. Now you have learned
something about film form. Now there is a reason to travel that edge.

## The intellectual promise

Find the secret connective tissue of cinema, not metadata overlap.
*The Social Network* ↔ *Uncut Gems* through overlapping verbal pressure and
dialogue as accelerating conflict. *Inception* ↔ *Paprika* through dream
architecture and visualised mental space rather than "science fiction."

## Lessons already paid for

- **Keyword rarity alone is a terrible measure.** Very rare keywords are often
  garbage incidental metadata — "tea" becomes statistically rare and therefore
  appears significant. Agreement across several meaningful keywords beats one
  bizarrely rare word. *Statistical surprise is useful; semantic coherence
  matters more.*
- **Ranking cannot manufacture intelligence.** If a film has six mediocre
  connections, no ranking invents a seventh brilliant one. The better
  investment is expanding the semantic richness of the films themselves.
- **Forced diversity became a trivia quota.** Guaranteeing one edge per
  relationship family guaranteed one mediocre connection per map, because
  convergence was largely genre/era/country coincidence. **Diversity should
  emerge from quality, not be paid for by lowering the quality floor.**
- **Weak connections have a legitimate purpose.** Delete them all and the graph
  becomes islands where the road ends after one click. Strong edges exist to be
  read; weak edges keep the world traversable. Rank them late; do not let them
  dominate.

## The recommender

Marks films *Seen it* / *Love it*, then sums evidence across favourites rather
than taking the highest single similarity — so a film with medium ties to three
loved films can outrank one with a single strong tie. It identifies films at the
**intersection** of a taste. Every recommendation carries a *because*. No
unexplained black box.

## Intelligence precomputed, not per-click

The runtime should feel extremely intelligent while remaining fast,
deterministic, cheap, inspectable, correctable, and better as the library
grows. Models help **offline** — analysis, classification, candidate
relationship generation, interpretation. The shipped Atlas operates on an
already-intelligent knowledge graph.

    large analysis pass → generate candidate relationships → challenge them
    → assign evidence and confidence → resolve into structured graph
    → serve instantly forever afterward

Expensive thinking once; thousands of interactions cheap. When something is
wrong we **fix the corpus** rather than hoping tomorrow's prompt is better. The
same question gives a stable answer until we deliberately improve the knowledge.

## The visual thesis

**The interface is a lens, not a diagram.** Navigation is a focus pull. Depth
in the graph is depth of field. Films are film cells, not UI cards. The
vocabulary is darkrooms, editing rooms, film stock, contact sheets, safelights,
optical projection, slate typography, paper, one-sheets, analog apparatus —
not generic science-fiction UI.

**Palette**, anchored loosely to *In the Mood for Love*: near-black film-base
brown, warm ivory type, tungsten/safelight orange, oxblood, muted jade, warm
paper/ink neutrals. *A cinematic research instrument built inside an old
projection booth.*

**Film-derived colour.** Atlas does not impose a rainbow; the films provide the
colour. Each poster's measured palette informs the connecting line, local glow,
panel accent, map atmosphere — **the room is lit by the film you are looking
at.** Posters themselves stay full colour; the extracted palette colours the
instrumentation around them.

**Typography**, three voices: *Fraunces* editorial (titles, statements, empty
states); *IBM Plex Mono* as the film slate (years, metadata, relationship
labels); *Inter* for conventional controls.

**No rounded-card soup.** Square-edged. Film, paper, celluloid, print,
mechanical apparatus — not silicone bubbles.

**Rack focus is the signature.** The focused film resolves sharply; one hop is
softer; two hops approach bokeh; distance dissolves. **But text never blurs.**
Imagery may fall out of focus; titles and relationship labels stay readable.
Learned the hard way — an earlier treatment blurred captions and made
navigation gorgeous and useless. *Visual depth may change; semantic
accessibility does not.*

**Motion** is cinematic, not app-y: no springs, no bounce, no elastic
trampolines. Slow lead-in, mass, controlled settle — a deliberate camera
operator. Neighbours arrive in a staggered reveal, like a sonar pulse, so the
map appears to *discover* its surroundings.

## The radial map, and why

The active film centres; strongest connections occupy a stable ring beginning
near 12 o'clock so ranking is visually legible. Predictable enough to build
spatial memory. A live physics simulation looks alive for five minutes and then
irritates, because every identical query yields a different constellation.
**Stable intelligence over decorative physics.**

Relationship labels live **on the paths**, not on hover — if meaning only
appears on hover the idle graph is decoration, and on mobile hover does not
exist. The map must communicate its logic at rest.

The viewport behaves like a flashlight: the database may hold tens of
thousands; the interface creates a small explorable thought-space around the
current film.

## The Thread

Every film travelled through joins a visual strip: *In the Mood for Love →
Vertigo → La Jetée → 12 Monkeys → Brazil*. Not browser history — **a cinematic
thought trail**, clickable backward. Exploration accumulates meaning. You are
not repeatedly opening recommendations; you are tracing a line through film
history and film form.

## The front door

A wall of cinema — posters, faces, years — rather than a blank canvas and
"type a movie", which assumes you already know what you want. **Atlas should
stimulate curiosity before requiring intent.** Search stays simple and
forgiving; *Surprise me* serves the other mode: *take me somewhere*.

## Imagery

Resolve at build time, never per page load — runtime poster search brings API
keys, rate limits, network variance, inconsistent results, CSP problems and a
map whose appearance randomly changes. Official posters, not fan or alternate
art: **Atlas maps cinema, it does not repurpose somebody else's poster-design
portfolio.**

A posterless film gets a deterministic generated cell from its own palette.
**That cell is not an error state** — it belongs to Atlas's visual language, and
it is what lets obscure films exist gracefully.

## Corpus philosophy

Grow breadth **while increasing relational intelligence**. The project breaks if
every new film adds junk edges. Each film eventually needs a richer cinematic
signature than genre/year/director/country/cast — visual language, editing
grammar, dialogue architecture, narrative structure, emotional trajectory,
philosophical concerns, performance texture, sound design, craft ancestry,
documented influences, formal counterpoints.

**That is how Atlas becomes extraordinary rather than merely large.**

## What the association engine becomes

**A film relationship engine, not a movie similarity engine.** For any two
films: What do they share? Where do they diverge? Is the relationship factual or
interpretive? Is influence documented? Does one answer the other? Do they
independently solve the same cinematic problem? Does one inherit the other's
grammar? Do they rhyme visually? Do they share a philosophical tension? Is one a
historical mutation of the other's technique?

## Beyond the radial map — named future modes

- **Passage** — route-finding. *How do I get from Tarkovsky to Villeneuve?* Not
  shortest by edge count; best by explanatory continuity. The interesting part
  is explaining each crossing.
- **Two-seed exploration** — pick two films and ask what exists between them.
  *Persona* and *Mulholland Drive*. *Tokyo Story* and *Aftersun*. Almost no
  ordinary recommendation system handles this gracefully.
- **Published Threads** — paths as cinematic essays. *From German Expressionism
  to Blade Runner. The road from Kurosawa to Star Wars. Women looking back at
  Hitchcock.*
- **Latent Image** — unseen films as undeveloped portions of your map. As you
  watch, parts of the Atlas become exposed, developed, known. Your knowledge of
  cinema becomes something visually developed over time.
- **Contested** — you can push back. *This connection is weak. I don't buy this
  reading.* Rather than pretending one canonical interpretation exists, expose
  where readings differ: **a map of cinematic argument, not classification.**
- **Lineage / constellation geometry** — the map may morph rather than open a
  separate visualisation: ancestors one side, descendants another,
  contemporaries elsewhere.

## What ATLAS must not become

A giant all-at-once graph · a galaxy simulator · a Netflix recommendation page ·
a generic AI chat interface · a trivia network · a popularity visualisation · a
plot-similarity engine · an IMDb replacement · a rating aggregator · a
collection of glass cards · a graph where every connection is "similar to" · an
LLM generating fresh random relationships every click · a system that treats
inference as fact · a poster gallery masquerading as analysis · a thousand-node
hairball because "look how much data we have".

All of these are attractive failure modes.

## The four fronts

**A. Expand the cinematic brain** — grow the library *and* deepen metadata and
interpretation together.
**B. Make the association engine smarter** — structured cinematic signatures,
better candidate generation, models offline, the five families preserved, a
specific explanation demanded for every visible edge.
**C. Elevate the visual system** — keep the darkroom identity, make the graph
itself the interface, strip application chrome until the film network *is* the
UI.
**D. Turn exploration into journeys** — strengthen the Thread, then Passage,
published Threads, two-film routes, Latent Image, Contested.

## The whole thing, in one paragraph

> Film Atlas is an explorable map of cinematic thought. A film is not defined by
> genre or similarity, but by the histories, techniques, people, ideas, images,
> arguments and formal gestures passing through it. The user begins with a film
> and travels through those relationships, every crossing carrying a precise
> explanation and an honest distinction between historical record and
> interpretation. The interface behaves like a cinematic lens: imagery racks in
> and out of focus, the current film illuminates the room, paths accumulate into
> a Thread, and the enormous underlying graph reveals itself only through a few
> meaningful doors at a time. Over time Atlas should become capable not merely
> of recommending films, but of showing how cinema remembers, mutates, argues
> with itself and passes ideas from one generation to another.

**Do not accidentally make it larger while making it less intelligent.** The
magic is not the number of films. The magic is reaching a film you have never
heard of, following one strange line into it, reading the explanation and
thinking: *"Wait. That's true. I never would have connected those two."*
