#!/usr/bin/env python3
"""audit-ablate-rating.py — the causal half of the rule-1 audit.

AGENTS rule 1 forbids popularity entering what the atlas shows, and the article
puts IMDb's weighted rating INTO the text it embeds. A correlation between the
dense side's ranking and fame tells you the two move together; it does not tell
you the rating line caused it. Genres, era and canon-shaped plot prose could
produce the same correlation with the rating string doing nothing at all.

So: rebuild the article index with the rating line and only the rating line
removed from every blob, everything else byte-identical, and measure how far the
rankings move. Same chunker, same model, same seed-free deterministic encode.

  displacement  mean |rank(with) - rank(without)| over all 2204 films x 30 queries
  top10 churn   how many of each query's top 10 change when the rating goes
  drho          the fame correlation with the rating minus the one without

If displacement is ~0 the rating is inert and the article's ranking is not a
popularity ranking — which is a finding about the ARTICLE'S RETRIEVAL HALF only,
and says nothing about its LLM stage, which reads the rating in the prompt.

Writes out/rag-index-norating.npz and out/rag-audit-ablation.json.
"""
import json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "out")
sys.path.insert(0, HERE)

import build_index_shim as _shim  # noqa: F401  (loader for the hyphenated module)
from build_index_shim import build_blobs, build_config, CONFIGS
from query import RagIndex

CONFIGS["article_norating"] = (512, 30, 256, "rag-index-norating.npz")

RATING_LINE = re.compile(r"^Rating: .*\n?", re.M)


def main():
    recs, stats = build_blobs(verbose=True)
    stripped = 0
    for r in recs:
        new = RATING_LINE.sub("", r["text"])
        if new != r["text"]:
            stripped += 1
        r["text"] = new
        r["blobChars"] = len(new)
    print(f"stripped the Rating line from {stripped}/{len(recs)} blobs", file=sys.stderr)

    t0 = time.time()
    meta = build_config("article_norating", recs, stats, verbose=True)
    meta = {k: v for k, v in meta.items() if k not in ("films", "chunkFilm")}
    meta["ratingLinesStripped"] = stripped
    meta["buildSecondsMeasured"] = round(time.time() - t0, 1)

    # ── measure the displacement ────────────────────────────────────────────
    A = RagIndex(os.path.join(OUT, "rag-index.npz"))
    B = RagIndex(os.path.join(OUT, "rag-index-norating.npz"))
    Q = json.load(open(os.path.join(HERE, "audit-queries.json")))["queries"]

    rows = []
    for q in Q:
        ra = A.search(q["q"], k=len(A.films), docs_k=0)["results"]
        rb = B.search(q["q"], k=len(B.films), docs_k=0)["results"]
        pa = {x["key"]: x["rank"] for x in ra}
        pb = {x["key"]: x["rank"] for x in rb}
        common = [k for k in pa if k in pb]
        disp = [abs(pa[k] - pb[k]) for k in common]
        ta = [x["key"] for x in ra[:10]]
        tb = [x["key"] for x in rb[:10]]
        rows.append({
            "id": q["id"], "q": q["q"],
            "meanAbsRankShift": round(sum(disp) / len(disp), 1),
            "maxAbsRankShift": max(disp),
            "medianAbsRankShift": sorted(disp)[len(disp) // 2],
            "top10Kept": len(set(ta) & set(tb)),
            "top10Identical": ta == tb,
            "top1Same": ta[0] == tb[0],
        })
        sys.stderr.write(".")
    sys.stderr.write("\n")

    summary = {
        "meanAbsRankShift": round(sum(r["meanAbsRankShift"] for r in rows) / len(rows), 1),
        "meanTop10Kept": round(sum(r["top10Kept"] for r in rows) / len(rows), 2),
        "queriesWithIdenticalTop10": sum(1 for r in rows if r["top10Identical"]),
        "queriesWithSameTop1": sum(1 for r in rows if r["top1Same"]),
        "queries": len(rows),
    }
    json.dump({"meta": meta, "summary": summary, "perQuery": rows},
              open(os.path.join(OUT, "rag-audit-ablation.json"), "w"), indent=1)
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
