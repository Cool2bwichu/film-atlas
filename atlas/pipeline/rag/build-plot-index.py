"""Embed every ATLAS plot with MiniLM and bank the vectors for the bake-off.

  python3 atlas/pipeline/rag/build-index.py

Writes to atlas/pipeline/out/:
  rag-chunk-vectors.npy   (n_chunks, 384) float32, unit rows
  rag-chunk-meta.json     {"films":[{filmId,title,year,key,chunks:[i,...]}], "chunkFilm":[filmIdx,...]}
  rag-film-vectors.npy    (n_films, 384) float32, mean of a film's chunks, renormalised

Film-level vector is the mean of its chunk vectors. Retrieval that wants the
article's behaviour should search CHUNKS and take max-over-chunks per film;
the film vector is there for the cheap whole-document comparison.
"""
import json, os, sys, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from embed import Embedder  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "out")
CHUNK_TOKENS, OVERLAP_TOKENS = 256, 30


def main():
    plots = json.load(open(os.path.join(OUT, "plots.json")))["films"]
    emb = Embedder()

    films, chunk_texts, chunk_film = [], [], []
    t0 = time.time()
    for key, rec in plots.items():
        plot = (rec or {}).get("plot")
        if not plot:
            continue
        cs = emb.chunk_text(plot, CHUNK_TOKENS, OVERLAP_TOKENS)
        if not cs:
            continue
        idx = len(films)
        films.append({
            "key": key,
            "filmId": rec.get("filmId"),
            "title": rec.get("title"),
            "year": rec.get("year"),
            "admitted": rec.get("admitted"),
            "plotChars": rec.get("plotChars"),
            "chunks": [len(chunk_texts) + i for i in range(len(cs))],
        })
        chunk_texts.extend(cs)
        chunk_film.extend([idx] * len(cs))
    print(f"chunked {len(films)} films -> {len(chunk_texts)} chunks in {time.time()-t0:.1f}s")

    V = emb.encode(chunk_texts, show_progress=True)
    np.save(os.path.join(OUT, "rag-chunk-vectors.npy"), V)

    F = np.zeros((len(films), V.shape[1]), dtype=np.float32)
    for i, f in enumerate(films):
        F[i] = V[f["chunks"]].mean(axis=0)
    F /= np.clip(np.linalg.norm(F, axis=1, keepdims=True), 1e-12, None)
    np.save(os.path.join(OUT, "rag-film-vectors.npy"), F)

    json.dump({
        "model": emb.model_name, "dim": emb.dim,
        "maxSeqLength": emb.max_seq_length,
        "chunkTokens": CHUNK_TOKENS, "overlapTokens": OVERLAP_TOKENS,
        "nFilms": len(films), "nChunks": len(chunk_texts),
        "films": films, "chunkFilm": chunk_film,
    }, open(os.path.join(OUT, "rag-chunk-meta.json"), "w"))
    print(f"wrote rag-chunk-vectors.npy {V.shape}, rag-film-vectors.npy {F.shape}")


if __name__ == "__main__":
    main()
