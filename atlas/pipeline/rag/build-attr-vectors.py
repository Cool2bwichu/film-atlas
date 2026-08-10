#!/usr/bin/env python3
"""build-attr-vectors.py — the BUILD-TIME half of dense retrieval.

The encoder is 90 MB and cannot ship. Film vectors (2,204 x 384, 855 KB int8)
CAN. The asymmetry that follows is the whole shipping story: a published page can
hold what every film means, but not the thing that turns a visitor's sentence
into a vector. So the only dense retrieval that ships is retrieval whose QUERY
side is finite and known before the page is built.

Two such query sides exist in ATLAS:

  the 59 attributes   — embedded here, from questioner-phrasings.json, which is
                        reader-facing prose and, unlike consensus-vocab.json's
                        glosses, names no example films. A gloss reading
                        "Whiplash, Mad Max: Fury Road" would embed those two
                        titles into the attribute and quietly hand the ranking
                        back to title matching, which is the exact failure this
                        bake-off exists to catch.
  the 2,204 films     — already embedded; film-to-film cosine is the "films like
                        X" path and needs no new vectors at all.

Writes out/rag-attr-vectors.npz: attribute vectors, and the 59 x 2,204 cosine
matrix that is the actual shippable artifact.
"""
import json, os, sys, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.dirname(HERE)
OUT = os.path.join(PIPELINE, "out")
sys.path.insert(0, HERE)

def main():
    ph = json.load(open(os.path.join(PIPELINE, "questioner-phrasings.json")))["questions"]
    vocab = [a["id"] for a in json.load(open(os.path.join(PIPELINE, "consensus-vocab.json")))["attributes"]]
    missing = [a for a in vocab if a not in ph]
    if missing:
        sys.exit("no reader phrasing for: %s" % missing)

    # label + question. Title-free by construction.
    texts = ["%s. %s" % (ph[a]["label"], ph[a]["q"]) for a in vocab]

    from query import RagIndex
    R = RagIndex(os.path.join(OUT, "rag-index-256.npz"))
    keys = [f["key"] for f in R.films]
    FV = np.asarray(R.film_vectors, np.float32)   # already unit-length in the npz

    from embed import Embedder
    t0 = time.time()
    AV = Embedder().encode(texts)
    ms = (time.time() - t0) * 1000

    cos = AV @ FV.T                       # 59 x 2204, both sides unit-length
    np.savez_compressed(os.path.join(OUT, "rag-attr-vectors.npz"),
                        vocab=np.array(vocab), keys=np.array(keys),
                        attrVectors=AV.astype(np.float32), cos=cos.astype(np.float32),
                        texts=np.array(texts))
    p = os.path.join(OUT, "rag-attr-vectors.npz")
    print("rag-attr-vectors.npz: %d attributes x %d films, %.1f KB on disk, embed %.0f ms"
          % (len(vocab), len(keys), os.path.getsize(p) / 1024, ms))
    print("shippable payload if quantised int8: %.0f KB (59x2204 matrix alone)"
          % (len(vocab) * len(keys) / 1024))
    for a in ("mood:paranoid", "pace:contemplative", "texture:graphic-violence"):
        i = vocab.index(a)
        top = np.argsort(-cos[i])[:5]
        print("  %-26s %s" % (a, ", ".join(keys[j] for j in top)))
    return 0

if __name__ == "__main__":
    sys.exit(main())
