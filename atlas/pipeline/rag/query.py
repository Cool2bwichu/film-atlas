#!/usr/bin/env python3
"""query.py — the dense side of the RAG bake-off. Sentence in, ranked films out.

    import sys; sys.path.insert(0, "/home/user/film-atlas/atlas/pipeline/rag")
    from query import RagIndex
    R = RagIndex()                                    # ~0.6s, once
    r = R.search("a film about a friendship that quietly ends", k=5)

    r["results"]   # [{rank, key, filmId, title, year, score}]  <- same shape as atlas-side.js
    r["ms"]        # wall time for this query alone, load excluded
    r["docs"]      # the article's actual retrieval unit: the top-k CHUNKS
    R.explain(key) # which chunk of that film matched, and its text

CLI:
    python3 atlas/pipeline/rag/query.py "a slow film about grief"
    python3 atlas/pipeline/rag/query.py --sanity      # the 3 shared queries
    python3 atlas/pipeline/rag/query.py --bench       # ms per query
    python3 atlas/pipeline/rag/query.py --discriminating   # Banshees / Old Joy / Ex Machina

RETRIEVAL IS THE ARTICLE'S, EXACTLY
-----------------------------------
The article embeds the query, takes the top k=3 nearest CHUNKS out of FAISS, and
stuffs those into the prompt. So the retrieval unit is the chunk, not the film,
and a film's score is the best score any of its chunks got — max-over-chunks.
`rollup="max"` is that. `rollup="mean"` scores the film's mean vector instead
(cheaper, blurrier); it is offered only because the bake-off may want to know
whether the difference matters, and it is NOT what the article does.

Because vectors are L2-normalised, cosine is a plain dot product, and ranking by
cosine is identical to ranking by the L2 distance FAISS would use
(||a-b||^2 = 2 - 2*cos). The matmul is exact — no FAISS approximation, and none
needed at ~8k chunks.

SCORES ARE RAW COSINES, NOT CALIBRATED. A cosine of 0.42 does not mean "42%
match" and is not comparable to the incumbent's 0..1 clause score. Compare
RANKINGS between the two sides, never raw numbers.

WHAT THIS SIDE CANNOT DO, STATED UP FRONT
-----------------------------------------
No negation. "a revenge film that isn't violent" embeds almost identically to
"a revenge film that is violent" — bag-of-meaning has no operator for "not", so
the retrieval returns the violent ones. `r["negationRisk"]` flags a query
carrying a negation cue so a scorer never counts that as a fair win or loss
without knowing. The incumbent's query-parse.js does handle negation; this is a
real asymmetry and it belongs in the report, not in a footnote.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.dirname(HERE)
OUT = os.path.join(PIPELINE, "out")
sys.path.insert(0, HERE)

DEFAULT_INDEX = os.path.join(OUT, "rag-index.npz")

# The three sanity queries both sides run, copied verbatim from atlas-side.js so
# the two harnesses provably use identical strings.
SANITY = [
    "a paranoid film about surveillance and control",
    "a slow quiet film about a friendship that quietly ends",
    "a revenge film that isn't violent",
]

NEGATION_CUES = re.compile(
    r"\b(?:not|non|no|never|without|isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t|"
    r"avoid|except|less|least|free of|other than)\b", re.I)


class RagIndex:
    """Exact cosine retrieval over the chunk vectors built by build-index.py."""

    def __init__(self, path: str = DEFAULT_INDEX, embedder=None):
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"missing {path}. Build it with:\n"
                f"  python3 atlas/pipeline/rag/build-index.py")
        z = np.load(path, allow_pickle=False)
        self.path = path
        self.chunk_vectors = z["chunk_vectors"]
        self.chunk_film = z["chunk_film"]
        self.film_vectors = z["film_vectors"]
        self.meta = json.loads(str(z["meta"]))
        self.films = self.meta["films"]
        self.config = self.meta["config"]

        if embedder is None:
            from embed import Embedder
            embedder = Embedder(max_seq_length=self.meta["maxSeqLength"])
        self.embedder = embedder

        # chunk texts are not stored in the npz (they are 30 MB of duplicate
        # prose); explain() re-derives the one it needs, lazily.
        self._blobs = None

    # -- retrieval ------------------------------------------------------

    def search(self, query: str, k: int = 5, docs_k: int = 3,
               rollup: str = "max", universe=None) -> dict:
        """Rank films for a plain English sentence.

        k        how many films to return
        docs_k   how many raw CHUNKS to report as r["docs"] — the article's k=3
        rollup   "max" (article behaviour) or "mean" (film mean vector)
        universe optional iterable of film keys to restrict to, so both sides
                 of the bake-off can be scored over the same set of films
        """
        t0 = time.perf_counter()
        q = self.embedder.encode([query])[0]

        if rollup == "mean":
            film_scores = self.film_vectors @ q
            best_chunk = np.full(len(self.films), -1, dtype=np.int64)
        else:
            sims = self.chunk_vectors @ q
            film_scores = np.full(len(self.films), -np.inf, dtype=np.float32)
            best_chunk = np.full(len(self.films), -1, dtype=np.int64)
            np.maximum.at(film_scores, self.chunk_film, sims)
            # recover which chunk won each film
            order = np.argsort(sims)  # ascending; last write per film wins
            best_chunk[self.chunk_film[order]] = order

        keep = np.arange(len(self.films))
        if universe is not None:
            uni = set(universe)
            keep = np.array([i for i, f in enumerate(self.films) if f["key"] in uni],
                            dtype=np.int64)

        ranked = keep[np.argsort(-film_scores[keep], kind="stable")][:k]
        results = []
        for rank, i in enumerate(ranked, 1):
            f = self.films[int(i)]
            results.append({
                "rank": rank,
                "key": f["key"],
                "filmId": f["filmId"],
                "title": f["title"],
                "year": f["year"],
                "score": round(float(film_scores[i]), 4),
                "textTier": f["textTier"],
                "imdbVotes": f["imdbVotes"],
                "chunk": int(best_chunk[i]) if best_chunk[i] >= 0 else None,
            })

        docs = []
        if rollup != "mean" and docs_k:
            top = np.argsort(-sims)[:docs_k]
            for rank, ci in enumerate(top, 1):
                f = self.films[int(self.chunk_film[ci])]
                docs.append({
                    "rank": rank, "chunk": int(ci), "score": round(float(sims[ci]), 4),
                    "key": f["key"], "title": f["title"], "year": f["year"],
                })

        return {
            "query": query,
            "runtime": f"rag-dense-{self.config}",
            "rollup": rollup,
            "results": results,
            "docs": docs,
            "negationRisk": bool(NEGATION_CUES.search(query)),
            "universeSize": int(len(keep)),
            "ms": round((time.perf_counter() - t0) * 1000, 2),
        }

    def rank_of(self, query: str, key: str, rollup: str = "max") -> tuple:
        """(rank, score, n) for one film — for the discriminating test."""
        r = self.search(query, k=len(self.films), docs_k=0, rollup=rollup)
        for row in r["results"]:
            if row["key"] == key:
                return row["rank"], row["score"], len(r["results"])
        return None, None, len(r["results"])

    def neighbours(self, key: str, k: int = 8, rollup: str = "max") -> list:
        """Nearest films to a film — exemplar-style query, film as the probe."""
        idx = {f["key"]: i for i, f in enumerate(self.films)}[key]
        q = self.film_vectors[idx]
        if rollup == "mean":
            s = self.film_vectors @ q
        else:
            sims = self.chunk_vectors @ q
            s = np.full(len(self.films), -np.inf, dtype=np.float32)
            np.maximum.at(s, self.chunk_film, sims)
        s[idx] = -np.inf
        return [{"rank": r, "key": self.films[i]["key"], "title": self.films[i]["title"],
                 "year": self.films[i]["year"], "score": round(float(s[i]), 4)}
                for r, i in enumerate(np.argsort(-s)[:k], 1)]

    def rank_of_film(self, key: str, target: str, rollup: str = "max") -> tuple:
        n = len(self.films)
        rows = self.neighbours(key, k=n, rollup=rollup)
        for row in rows:
            if row["key"] == target:
                return row["rank"], row["score"], n
        return None, None, n

    # -- provenance -----------------------------------------------------

    def _load_blobs(self):
        if self._blobs is None:
            # build_blobs lives in build-index.py, whose hyphenated name is not
            # importable; load it by path.
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                "rag_build_index", os.path.join(HERE, "build-index.py"))
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            recs, _ = mod.build_blobs(verbose=False)
            self._blobs = {r["key"]: r["text"] for r in recs}
        return self._blobs

    def explain(self, key: str, query: str = None) -> dict:
        """What text of this film the index actually holds, and (with a query)
        which chunk matched and how well."""
        idx = {f["key"]: i for i, f in enumerate(self.films)}[key]
        f = self.films[idx]
        blobs = self._load_blobs()
        chunks = self.embedder.chunk_text(
            blobs[key], self.meta["chunkTokens"], self.meta["overlapTokens"]) or [blobs[key]]
        out = {
            "key": key, "title": f["title"], "year": f["year"],
            "textTier": f["textTier"], "overviewChars": f["overviewChars"],
            "genres": f["genres"], "imdbRating": f["imdbRating"],
            "imdbVotes": f["imdbVotes"], "nChunks": len(f["chunks"]),
            "wordpiecesPerChunk": [self.embedder.token_count(c) for c in chunks],
            "maxSeqLength": self.meta["maxSeqLength"],
        }
        if query:
            q = self.embedder.encode([query])[0]
            sims = self.chunk_vectors[f["chunks"]] @ q
            b = int(np.argmax(sims))
            out["bestChunk"] = b
            out["bestChunkScore"] = round(float(sims[b]), 4)
            out["bestChunkText"] = chunks[b][:600] if b < len(chunks) else None
        return out


_SHARED = None


def get_index(path: str = DEFAULT_INDEX) -> RagIndex:
    global _SHARED
    if _SHARED is None or _SHARED.path != path:
        _SHARED = RagIndex(path)
    return _SHARED


def search(query: str, **kw) -> dict:
    return get_index().search(query, **kw)


# ── CLI ─────────────────────────────────────────────────────────────────────

def _print_run(r):
    flag = "  [NEGATION — dense retrieval has no operator for 'not']" if r["negationRisk"] else ""
    print(f"\n  QUERY: {r['query']}{flag}")
    print(f"  {r['runtime']}  rollup={r['rollup']}  {r['ms']} ms  "
          f"over {r['universeSize']} films")
    for x in r["results"]:
        tier = "" if x["textTier"] == "plot" else f"  <{x['textTier']}>"
        print(f"    {x['rank']}. {x['score']:.4f}  {x['title']} ({x['year']}){tier}")


def main(argv):
    args = list(argv)
    path = DEFAULT_INDEX
    if "--index" in args:
        i = args.index("--index")
        path = args[i + 1]
        del args[i:i + 2]
    rollup = "max"
    if "--rollup" in args:
        i = args.index("--rollup")
        rollup = args[i + 1]
        del args[i:i + 2]

    t0 = time.time()
    R = RagIndex(path)
    load_s = time.time() - t0
    m = R.meta
    print(f"index {os.path.basename(path)}: config={m['config']} "
          f"{m['nFilms']} films / {m['nChunks']} chunks / dim {m['dim']} / "
          f"{m.get('indexBytes',0)/1e6:.1f} MB  (loaded in {load_s:.2f}s)")

    if "--sanity" in args:
        for q in SANITY:
            _print_run(R.search(q, k=5, rollup=rollup))
        return 0

    if "--bench" in args:
        qs = SANITY * 10
        R.search("warm up", k=5)
        t0 = time.perf_counter()
        for q in qs:
            R.search(q, k=5, rollup=rollup)
        per = (time.perf_counter() - t0) / len(qs) * 1000
        # split embed vs matmul
        t0 = time.perf_counter()
        for q in qs:
            R.embedder.encode([q])
        emb_ms = (time.perf_counter() - t0) / len(qs) * 1000
        print(f"\n  {len(qs)} queries: {per:.2f} ms/query total "
              f"({emb_ms:.2f} ms embed + {per-emb_ms:.2f} ms search)")
        return 0

    if "--discriminating" in args:
        probe = "the banshees of inisherin"
        for target, label in (("old joy", "OLD JOY (the friendship that quietly ends)"),
                              ("ex machina", "EX MACHINA (the cold ironic two-hander)")):
            for ru in ("max", "mean"):
                rank, score, n = R.rank_of_film(probe, target, rollup=ru)
                print(f"  BANSHEES -> {label}: rank {rank}/{n} (cos {score}) [{ru}]")
        print("\n  nearest to BANSHEES (max-over-chunks):")
        for x in R.neighbours(probe, k=8):
            print(f"    {x['rank']}. {x['score']:.4f}  {x['title']} ({x['year']})")
        return 0

    q = " ".join(a for a in args if not a.startswith("--"))
    if not q:
        print(__doc__)
        return 0
    _print_run(R.search(q, k=8, rollup=rollup))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
