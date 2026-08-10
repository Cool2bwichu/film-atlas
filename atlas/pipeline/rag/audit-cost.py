#!/usr/bin/env python3
"""audit-cost.py — what the dense side would COST if it shipped, measured.

ATLAS ships one HTML file and makes no runtime API call. So "could this ship"
is not a question about FAISS or LangChain, which obviously cannot. It is two
narrower questions, and they have different answers:

  A. PRECOMPUTED. Run every query at build time, freeze the answers, ship
     numbers. Costs whatever the frozen numbers weigh and nothing at runtime.
  B. LIVE. Let a reader type a sentence the build never saw. That needs the
     ENCODER in the browser to embed the sentence, not just the vectors — and
     that is the number that decides it.

Measured here: raw and gzipped bytes for float32 and int8 film vectors, the
same for the chunk-level index the article actually retrieves over, the encoder
on disk, and the current shipped artifact — plus whether int8 quantisation
changes the RANKING, because a 4x saving that reorders the results is not a
saving.

Writes out/rag-audit-cost.json.
"""
import gzip, json, os, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.dirname(HERE)
OUT = os.path.join(PIPELINE, "out")
ROOT = os.path.dirname(PIPELINE)
sys.path.insert(0, HERE)
from query import RagIndex

MODEL_DIR = os.path.join(PIPELINE, ".cache-rag", "minilm")


def gz(b: bytes) -> int:
    return len(gzip.compress(b, 6))


def quantise_int8(V: np.ndarray):
    """Per-vector symmetric int8. Scale is per row, so a row's unit norm is
    preserved as well as 8 bits allow; a single global scale would be cheaper
    to describe and worse everywhere."""
    scale = np.abs(V).max(axis=1, keepdims=True)
    scale[scale == 0] = 1.0
    Q = np.clip(np.rint(V / scale * 127.0), -127, 127).astype(np.int8)
    return Q, scale.astype(np.float32)


def main():
    res = {}

    # ── the shipped artifact, for scale ──────────────────────────────────────
    shipped = {}
    for label, p in (("public/atlas.html", os.path.join(ROOT, "..", "public", "atlas.html")),
                     ("atlas/static/corpus.json", os.path.join(ROOT, "static", "corpus.json")),
                     ("atlas/static/fingerprints.json", os.path.join(ROOT, "static", "fingerprints.json"))):
        p = os.path.abspath(p)
        if os.path.exists(p):
            raw = open(p, "rb").read()
            shipped[label] = {"bytes": len(raw), "gzipBytes": gz(raw)}
    res["shipped"] = shipped

    # ── the encoder ──────────────────────────────────────────────────────────
    enc = {}
    if os.path.isdir(MODEL_DIR):
        tot = 0
        for fn in os.listdir(MODEL_DIR):
            p = os.path.join(MODEL_DIR, fn)
            n = os.path.getsize(p)
            tot += n
            if fn.endswith(".onnx") or fn == "tokenizer.json":
                enc[fn] = {"bytes": n, "gzipBytes": gz(open(p, "rb").read())}
        enc["totalBytes"] = tot
    res["encoder"] = enc

    # ── the vectors ──────────────────────────────────────────────────────────
    R = RagIndex(os.path.join(OUT, "rag-index.npz"))
    F = R.film_vectors if hasattr(R, "film_vectors") else None
    if F is None:
        for attr in ("filmV", "fvecs", "film_vecs", "FV"):
            if hasattr(R, attr):
                F = getattr(R, attr)
                break
    C = None
    for attr in ("chunk_vectors", "V", "vectors", "chunkV"):
        if hasattr(R, attr):
            C = getattr(R, attr)
            break
    F = np.asarray(F, dtype=np.float32)
    C = np.asarray(C, dtype=np.float32)

    vec = {}
    for label, M in (("filmVectors", F), ("chunkVectors", C)):
        f32 = M.astype(np.float32).tobytes()
        Q, sc = quantise_int8(M)
        i8 = Q.tobytes() + sc.tobytes()
        vec[label] = {
            "rows": int(M.shape[0]), "dim": int(M.shape[1]),
            "float32Bytes": len(f32), "float32GzipBytes": gz(f32),
            "int8Bytes": len(i8), "int8GzipBytes": gz(i8),
            "base64Float32Bytes": (len(f32) + 2) // 3 * 4,
            "base64Int8Bytes": (len(i8) + 2) // 3 * 4,
        }
    res["vectors"] = vec

    # ── does int8 change the ANSWER? ─────────────────────────────────────────
    Q8, sc = quantise_int8(F)
    Fq = (Q8.astype(np.float32) * sc) / 127.0
    Fq /= np.linalg.norm(Fq, axis=1, keepdims=True)
    queries = [q["q"] for q in json.load(open(os.path.join(HERE, "audit-queries.json")))["queries"]]
    rows = []
    for q in queries:
        qv = R.embedder.encode([q])[0]
        qv = np.asarray(qv, dtype=np.float32).reshape(-1)
        qv /= np.linalg.norm(qv)
        a = F @ qv
        b = Fq @ qv
        ra = np.empty(len(a), dtype=np.int32); ra[np.argsort(-a, kind="stable")] = np.arange(len(a))
        rb = np.empty(len(b), dtype=np.int32); rb[np.argsort(-b, kind="stable")] = np.arange(len(b))
        shift = np.abs(ra - rb)
        ta = set(np.argsort(-a, kind="stable")[:10].tolist())
        tb = set(np.argsort(-b, kind="stable")[:10].tolist())
        rows.append({"q": q, "meanAbsRankShift": float(shift.mean()),
                     "maxAbsRankShift": int(shift.max()),
                     "top10Kept": len(ta & tb),
                     "top1Same": bool(np.argmax(a) == np.argmax(b))})
    res["int8Fidelity"] = {
        "note": "film-vector ranking, float32 vs per-row symmetric int8, same 30 queries",
        "meanAbsRankShift": round(float(np.mean([r["meanAbsRankShift"] for r in rows])), 3),
        "maxAbsRankShift": int(max(r["maxAbsRankShift"] for r in rows)),
        "meanTop10Kept": round(float(np.mean([r["top10Kept"] for r in rows])), 2),
        "queriesWithSameTop1": int(sum(1 for r in rows if r["top1Same"])),
        "queries": len(rows),
    }

    json.dump(res, open(os.path.join(OUT, "rag-audit-cost.json"), "w"), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
