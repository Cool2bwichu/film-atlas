# Route 1 — the encoder as a dictionary

**Question.** Dense retrieval could not ship because MiniLM costs 87 MB to embed a
typed sentence, against a whole site of 1.66 MB gzipped. A model2vec *static*
model replaces the transformer with a lookup table: every wordpiece has one
vector, a sentence is those vectors averaged, no attention and no layers. Does
that keep enough of the quality to be worth shipping?

**Answer: it works, and it buys the half we already had a plan for rather than
the half we wanted.**

## What was measured

Two static models against the banked MiniLM vectors over the same 1,541 films,
twelve queries split into two kinds: CONCRETE (things that happen — "workers go
on strike against the factory owners") and ABSTRACT (things a film is about —
"a friendship that ends without either man saying so"). Agreement is top-10
overlap with MiniLM on the same query.

| dims | concrete | abstract | Old Joy for the friendship query | 8k-vocab int8, gz |
|---|---|---|---|---|
| 256 | 5.2/10 | 1.2/10 | #69 | 1,521 KB |
| **192** | **5.3/10** | **1.2/10** | **#74** | **1,163 KB** |
| 128 | 4.8/10 | 0.7/10 | #104 | 792 KB |
| 96 | 4.3/10 | 0.3/10 | #201 | 601 KB |
| 64 | 3.5/10 | 0.3/10 | #262 | 406 KB |

MiniLM's own answer on that query is Old Joy **#9**, Close #4, Withnail #1.

## Three things this settled

**1. 256 -> 192 dimensions is free.** Concrete agreement goes UP (5.2 -> 5.3),
abstract is identical, Old Joy moves 69 -> 74, and it saves 358 KB. Below 192 it
falls apart quickly: at 128 the abstract half nearly halves and Old Joy doubles.
So 192 is the knee and there is no reason to ship 256.

**2. The first cheap model was too small, and that was a confound, not a
verdict.** potion-base-2M is 64 dimensions against MiniLM's 384. At 64 dims Old
Joy sits at #262 and the abstract overlap is 0.3/10 — which reads as "static
embeddings cannot do this" and is really "64 dimensions cannot do this". The
256-dim model recovers most of the concrete half. Worth stating because the
first measurement pointed at the wrong conclusion.

**3. Chunking is not the mechanism.** MiniLM chunks plots and takes the best
passage; the first static pass averaged whole plots. Giving static the same
chunking made it WORSE (Old Joy 273 -> 425 at 64 dims), so the gap is
composition, not granularity. Averaging "friendship / ends / without / saying"
gives a generic vector about people, which is why it returns The Crowd and
Decalogue rather than Old Joy.

## What it costs and what it buys

Best shippable configuration is potion-8M truncated to 192 dims, vocabulary
trimmed to the 8,000 wordpieces that cover 94.2% of the corpus, int8:

* encoder **1,163 KB gz**, film vectors at 192d int8 a further ~330 KB gz
* against a site that is **1,660 KB gz** today — so it roughly DOUBLES it
* embedding a query: a token lookup and a mean, microseconds, ~40 lines of JS
* embedding the whole corpus: **1.0 s**, against 150 s for MiniLM
* it also reaches **2,198 films** rather than MiniLM's 1,541, because with no
  sequence limit it does not need the 1,500-char chunking floor

For that it delivers the CONCRETE half at 5.3/10 agreement and the ABSTRACT half
at 1.2/10. The abstract half was the entire reason dense retrieval was
interesting — it is what found Old Joy at #1 in the C-unread hybrid — and a
dictionary cannot do it, at any size tested.

## Recommendation

**Do not ship it as the search.** Ship it, if at all, as the fallback for what
the closed vocabulary admits it could not read — which is 15 of 30 ordinary
queries, and 5 of 6 concrete-plot-noun ones, exactly the shape static is good
at. Lazy-load it on the first typed sentence so the artifact stays 1.66 MB and
the vocabulary path answers instantly with no download at all.

That is the C-unread hybrid in a form that can actually exist. It does not
recover Old Joy, and nothing that fits in this budget does.
