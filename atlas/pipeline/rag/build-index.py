#!/usr/bin/env python3
"""build-index.py — the article's retrieval half, reproduced over the real ATLAS corpus.

    python3 atlas/pipeline/rag/build-index.py              # article + native configs
    python3 atlas/pipeline/rag/build-index.py --config article
    python3 atlas/pipeline/rag/build-index.py --config all # adds the 512-full control

WHAT THE ARTICLE SPECIFIES, AND WHAT THAT MEANS HERE
----------------------------------------------------
The article merges each dataset row into one text blob (title + overview +
genres + IMDb weighted rating), splits it with LangChain's
RecursiveCharacterTextSplitter at 512 tokens / 30 overlap, embeds the chunks
with all-MiniLM-L6-v2, and puts them in FAISS for top-k cosine retrieval.

Everything above the LLM is reproduced. The Gemma 2 generation step, LangChain
and the Gradio UI are not — ATLAS ships one vanilla HTML file with no runtime
API calls, so the only part of this stack that could ever ship is the retrieval,
computed at build time. This file is that part.

FOUR PLACES THIS DEVIATES, ALL OF THEM DELIBERATE AND ALL OF THEM RECORDED
--------------------------------------------------------------------------
1. NO FAISS. faiss is not installed. Vectors here are L2-normalised, so cosine
   is a dot product and ||a-b||^2 == 2 - 2*cos: ranking by L2 and by cosine are
   the same ordering. A dense (n,384) @ (384,) matmul over ~8k chunks is ~1 ms
   in numpy. That is not an approximation of FAISS — it is exact, and equals
   what FAISS's *flat* index would return; FAISS's IVF/HNSW indexes are the
   approximate ones, and at this corpus size they would only lose recall for
   speed nobody needs. So: exact numpy, and it is the more accurate choice.

2. THE 512-TOKEN CHUNK IS A TRAP, AND WE MEASURE IT RATHER THAN QUIETLY FIX IT.
   all-MiniLM-L6-v2 is configured (sentence_bert_config.json) with
   max_seq_length=256. Feed it a 512-token chunk and sentence-transformers
   silently truncates to 256 — the second half of every chunk is embedded by
   nobody. Running the article as written therefore throws away text. So this
   builds BOTH:
     config "article" — chunk 512/30, encode at 256. Faithful, including the
                        truncation. `wordpieceCoverage` reports what was lost.
     config "native"  — chunk 256/30, encode at 256. Same splitter, chunk sized
                        to the model, nothing discarded.
   The bake-off needs both or it cannot tell an article-config bug from a
   dense-retrieval limit. `--config all` adds "full512" (chunk 512, encode 512,
   which the BERT graph does allow) as a third control.

3. THE SPLITTER IS OURS, AND MEASURES WORDPIECES. embed.chunk_text() implements
   RecursiveCharacterTextSplitter's semantics — descend a separator ladder
   ("\\n\\n", "\\n", ". ", " "), pack pieces greedily up to the budget, recurse
   into any piece that overflows, hard-cut mid-word only as a last resort, then
   prepend the previous chunk's tail as overlap. It differs from LangChain's in
   one way that matters: LangChain's chunk_size counts CHARACTERS unless you
   hand it a token length_function, and this counts real BERT wordpieces. That
   is the stricter reading of "512-token chunks".

4. THE CORPUS IS NOT THE ARTICLE'S. No TMDB overview column exists here, so:
   overview := plots.json plot text where a film clears the 1,500-char evidence
   floor (1,541 films), else corpus.json's Wikipedia lead paragraph (a real
   overview, just short). EVERY film in the corpus gets indexed and carries a
   `textTier` saying which it got — nothing is silently dropped, which is what
   the brief asked for and which also removes the 1,541-vs-2,204 universe
   asymmetry the incumbent's side had to work around.

DIRECTOR IS DELIBERATELY NOT IN THE BLOB. The article's row is title + overview
+ genres + rating. ATLAS knows the director of all 2,204 films and adding it
would plainly help retrieval — which is exactly why it stays out. This measures
the article, not an improved version of it.

THE RATING IS REAL. Joined from IMDb's public title.ratings.tsv via
out/imdb-ids.json: 2,195 of 2,204 films get a genuine averageRating and
numVotes. The blob carries the Bayesian weighted rating the article ranks on
(the IMDb Top-250 formula, m=25000 votes prior). numVotes is kept in the meta
for every film SO THAT THE FAME CORRELATION CAN BE MEASURED — AGENTS rule 1
forbids popularity entering what the atlas shows, and a retrieval scheme that
turns out to rank on fame is disqualified no matter how well it scores.

WRITES (all under out/rag-*, nothing merged into static/corpus.json):
    rag-index.npz            config "article"  (the faithful one)
    rag-index-256.npz        config "native"
    rag-index-512full.npz    config "full512"  (only with --config all)
    rag-index.meta.json      human-readable meta for the faithful build
    rag-imdb-ratings.json    cached IMDb join, so the build is offline-repeatable

Each .npz holds: chunk_vectors (n,384) f32 | chunk_film (n,) i32 | film_vectors
(nf,384) f32 | meta (0-d json string). Read it with query.py, or np.load(...,
allow_pickle=False) and json.loads(str(z["meta"])).
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import os
import subprocess
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.dirname(HERE)
ATLAS = os.path.dirname(PIPELINE)
OUT = os.path.join(PIPELINE, "out")
STATIC = os.path.join(ATLAS, "static")

sys.path.insert(0, HERE)
from embed import Embedder  # noqa: E402

RATINGS_CACHE = os.path.join(OUT, "rag-imdb-ratings.json")
RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz"
CA_BUNDLE = "/root/.ccr/ca-bundle.crt"

# IMDb's own Top-250 weighting: WR = (v/(v+m))R + (m/(v+m))C
VOTE_PRIOR_M = 25000

CONFIGS = {
    #  name        chunk_tokens  overlap  max_seq_length  outfile
    "article": (512, 30, 256, "rag-index.npz"),
    "native": (256, 30, 256, "rag-index-256.npz"),
    "full512": (512, 30, 512, "rag-index-512full.npz"),
}


# ── inputs ──────────────────────────────────────────────────────────────────

def load_imdb_ratings(verbose: bool = True) -> dict:
    """qid -> {rating, votes}. Cached; fetches IMDb's public dataset once.

    Network goes through the agent proxy with the supplied CA bundle. TLS
    verification is never disabled and HTTPS_PROXY is never unset."""
    if os.path.exists(RATINGS_CACHE):
        return json.load(open(RATINGS_CACHE))

    ids = json.load(open(os.path.join(OUT, "imdb-ids.json")))
    want = {}
    for qid, tts in ids.items():
        for tt in (tts or []):
            want.setdefault(tt, qid)

    if verbose:
        print(f"  fetching {RATINGS_URL} ...", file=sys.stderr)
    cmd = ["curl", "-sS", "--fail", "--cacert", CA_BUNDLE, RATINGS_URL]
    blob = subprocess.run(cmd, capture_output=True, check=True).stdout
    text = gzip.decompress(blob).decode("utf-8", "replace")

    out = {}
    rd = csv.reader(io.StringIO(text), delimiter="\t")
    next(rd, None)
    for row in rd:
        if len(row) < 3:
            continue
        tt, avg, nv = row[0], row[1], row[2]
        qid = want.get(tt)
        if qid is None:
            continue
        try:
            out[qid] = {"rating": float(avg), "votes": int(nv), "tconst": tt}
        except ValueError:
            continue
    json.dump(out, open(RATINGS_CACHE, "w"))
    if verbose:
        print(f"  IMDb ratings joined for {len(out)} of {len(ids)} qids", file=sys.stderr)
    return out


def genre_label(qid: str, labels: dict) -> str:
    lab = (labels.get(qid) or "").strip()
    if not lab:
        return ""
    for suffix in (" film", " movie"):
        if lab.endswith(suffix):
            lab = lab[: -len(suffix)]
    return lab.strip()


def build_blobs(verbose: bool = True) -> tuple[list[dict], dict]:
    """One article-style text blob per film, for EVERY film in the corpus."""
    corpus = json.load(open(os.path.join(STATIC, "corpus.json")))["films"]
    plots = json.load(open(os.path.join(OUT, "plots.json")))["films"]
    harvest = json.load(open(os.path.join(OUT, "harvest.json")))
    hfilms, labels = harvest["films"], harvest["labels"]
    ratings = load_imdb_ratings(verbose=verbose)

    rated = [r["rating"] for r in ratings.values()]
    C = sum(rated) / len(rated) if rated else 0.0  # prior mean for the Bayesian WR

    recs = []
    for key in sorted(corpus):
        film = corpus[key]
        prec = plots.get(key) or {}
        qid = film.get("qid")

        plot = (prec.get("plot") or "").strip()
        desc = (film.get("description") or "").strip()
        if plot:
            overview, tier = plot, "plot"
        elif desc:
            overview, tier = desc, "description"
        else:
            overview, tier = "", "none"

        genres = [g for g in (genre_label(q, labels)
                              for q in ((hfilms.get(key) or {}).get("genre") or [])) if g]

        r = ratings.get(qid) if qid else None
        weighted = None
        if r:
            v, R = r["votes"], r["rating"]
            weighted = round((v / (v + VOTE_PRIOR_M)) * R + (VOTE_PRIOR_M / (v + VOTE_PRIOR_M)) * C, 2)

        # ── the article's blob: title + genres + rating + overview ──
        parts = [f"Title: {film.get('title')} ({film.get('year')})"]
        if genres:
            parts.append(f"Genres: {', '.join(genres)}")
        if r:
            parts.append(
                f"Rating: {r['rating']}/10 from {r['votes']} votes "
                f"(weighted {weighted}/10)"
            )
        if overview:
            parts.append(f"Overview: {overview}")
        blob = "\n".join(parts)

        recs.append({
            "key": key,
            "filmId": film.get("filmId"),
            "qid": qid,
            "title": film.get("title"),
            "year": film.get("year"),
            "director": film.get("director"),   # meta only — NOT in the blob
            "genres": genres,
            "imdbRating": r["rating"] if r else None,
            "imdbVotes": r["votes"] if r else None,
            "imdbWeighted": weighted,
            "textTier": tier,
            "overviewChars": len(overview),
            "blobChars": len(blob),
            "text": blob,
        })

    stats = {
        "films": len(recs),
        "tierPlot": sum(1 for r in recs if r["textTier"] == "plot"),
        "tierDescription": sum(1 for r in recs if r["textTier"] == "description"),
        "tierNone": sum(1 for r in recs if r["textTier"] == "none"),
        "withRating": sum(1 for r in recs if r["imdbRating"] is not None),
        "withGenres": sum(1 for r in recs if r["genres"]),
        "ratingPriorC": round(C, 4),
        "votePriorM": VOTE_PRIOR_M,
    }
    return recs, stats


# ── the build ───────────────────────────────────────────────────────────────

def build_config(name: str, recs: list[dict], corpus_stats: dict,
                 verbose: bool = True) -> dict:
    chunk_tokens, overlap, max_seq, outfile = CONFIGS[name]
    t_start = time.time()

    emb = Embedder(max_seq_length=max_seq)

    if verbose:
        print(f"\n[{name}] chunk {chunk_tokens}/{overlap}, encode at {max_seq} wordpieces",
              file=sys.stderr)

    # -- chunk --
    t0 = time.time()
    chunk_texts, chunk_film, films = [], [], []
    for rec in recs:
        cs = emb.chunk_text(rec["text"], chunk_tokens, overlap) or [rec["text"]]
        idx = len(films)
        f = {k: rec[k] for k in (
            "key", "filmId", "qid", "title", "year", "director", "genres",
            "imdbRating", "imdbVotes", "imdbWeighted", "textTier",
            "overviewChars", "blobChars")}
        f["chunks"] = [len(chunk_texts) + i for i in range(len(cs))]
        films.append(f)
        chunk_texts.extend(cs)
        chunk_film.extend([idx] * len(cs))
    t_chunk = time.time() - t0

    # -- how much of each chunk the encoder will actually read --
    t0 = time.time()
    tok = [emb.token_count(c) for c in chunk_texts]
    seen = sum(min(t, max_seq) for t in tok)
    total = sum(tok)
    over = sum(1 for t in tok if t > max_seq)
    t_measure = time.time() - t0

    # -- embed --
    t0 = time.time()
    V = emb.encode(chunk_texts, show_progress=verbose)
    t_embed = time.time() - t0

    # -- film vectors: mean of a film's chunks, renormalised --
    F = np.zeros((len(films), V.shape[1]), dtype=np.float32)
    for i, f in enumerate(films):
        F[i] = V[f["chunks"]].mean(axis=0)
    F /= np.clip(np.linalg.norm(F, axis=1, keepdims=True), 1e-12, None)

    build_s = time.time() - t_start
    meta = {
        "config": name,
        "model": emb.model_name,
        "dim": emb.dim,
        "chunkTokens": chunk_tokens,
        "overlapTokens": overlap,
        "maxSeqLength": max_seq,
        "nFilms": len(films),
        "nChunks": len(chunk_texts),
        "chunksPerFilm": round(len(chunk_texts) / max(len(films), 1), 2),
        "maxChunksOnAFilm": max((len(f["chunks"]) for f in films), default=0),
        "wordpieceCoverage": {
            "chunkWordpieces": total,
            "wordpiecesEncoded": seen,
            "fractionEncoded": round(seen / max(total, 1), 4),
            "chunksOverCeiling": over,
            "fractionOfChunksTruncated": round(over / max(len(chunk_texts), 1), 4),
        },
        "timings": {
            "chunkSeconds": round(t_chunk, 1),
            "tokenMeasureSeconds": round(t_measure, 1),
            "embedSeconds": round(t_embed, 1),
            "buildSeconds": round(build_s, 1),
            "chunksPerSecond": round(len(chunk_texts) / max(t_embed, 1e-9), 1),
        },
        "corpus": corpus_stats,
        "exactSearch": "numpy dense matmul, exact cosine (unit rows) — not FAISS-approximate",
        "films": films,
        "chunkFilm": chunk_film,
    }

    path = os.path.join(OUT, outfile)
    np.savez(
        path,
        chunk_vectors=V,
        chunk_film=np.asarray(chunk_film, dtype=np.int32),
        film_vectors=F,
        meta=np.array(json.dumps(meta)),
    )
    meta["indexBytes"] = os.path.getsize(path)
    meta["indexPath"] = path

    # rewrite so indexBytes lands inside the npz too
    np.savez(
        path,
        chunk_vectors=V,
        chunk_film=np.asarray(chunk_film, dtype=np.int32),
        film_vectors=F,
        meta=np.array(json.dumps(meta)),
    )

    if verbose:
        wc = meta["wordpieceCoverage"]
        print(f"[{name}] {len(films)} films, {len(chunk_texts)} chunks, "
              f"{meta['indexBytes']/1e6:.1f} MB, {build_s:.1f}s build", file=sys.stderr)
        print(f"[{name}] encoder read {wc['fractionEncoded']*100:.1f}% of chunk wordpieces "
              f"({wc['chunksOverCeiling']} of {len(chunk_texts)} chunks truncated)",
              file=sys.stderr)
    return meta


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="article,native",
                    help="comma list of %s, or 'all'" % ",".join(CONFIGS))
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    names = list(CONFIGS) if args.config == "all" else [
        c.strip() for c in args.config.split(",") if c.strip()]
    for n in names:
        if n not in CONFIGS:
            raise SystemExit(f"unknown config {n!r}; pick from {list(CONFIGS)}")

    verbose = not args.quiet
    t0 = time.time()
    recs, stats = build_blobs(verbose=verbose)
    if verbose:
        print(f"blobs: {stats['films']} films "
              f"({stats['tierPlot']} full plot, {stats['tierDescription']} thin, "
              f"{stats['tierNone']} title-only), "
              f"{stats['withRating']} rated, {stats['withGenres']} with genres "
              f"[{time.time()-t0:.1f}s]", file=sys.stderr)

    metas = [build_config(n, recs, stats, verbose=verbose) for n in names]

    if "article" in names:
        m = dict(metas[names.index("article")])
        m.pop("films", None)
        m.pop("chunkFilm", None)
        json.dump(m, open(os.path.join(OUT, "rag-index.meta.json"), "w"), indent=2)

    print(json.dumps([
        {k: v for k, v in m.items() if k not in ("films", "chunkFilm")}
        for m in metas
    ], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
