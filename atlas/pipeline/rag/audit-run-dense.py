#!/usr/bin/env python3
"""audit-run-dense.py — run the dense side over the 30 audit queries and dump a
FULL score vector per query, in the SAME film-key order the incumbent dumped.

Two indexes are run, and both belong in the report:

  rag-index.npz      the article as written — 512-token chunks fed to a model
                     configured at max_seq_length=256, so 70% of chunks are
                     silently truncated and the encoder reads 67% of the text.
  rag-index-256.npz  the same splitter sized to the model. Nothing is lost.

Reporting only the first would score an article-config bug as a property of
dense retrieval; reporting only the second would score something the article
does not actually say. So: both, always, side by side.

Output: out/rag-audit-dense.json (same schema as rag-audit-atlas.json's runs[],
keyed by config).
"""
import json, os, sys, time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "out")
sys.path.insert(0, HERE)
from query import RagIndex, SANITY, NEGATION_CUES

Q = json.load(open(os.path.join(HERE, "audit-queries.json")))
SHARED = json.load(open(os.path.join(HERE, "bakeoff-queries.json")))
mine = [q["q"] for q in Q["queries"] if q.get("sanity")]
theirs = [s["q"] for s in SHARED["sanity"]]
for i in range(3):
    if not (mine[i] == theirs[i] == SANITY[i]):
        sys.exit("SANITY DRIFT at %d: %r / %r / %r" % (i, mine[i], theirs[i], SANITY[i]))

# The key order the incumbent dumped. Both sides must index the same vector or
# every correlation below is a correlation between two shuffles.
atlas = json.load(open(os.path.join(OUT, "rag-audit-atlas.json")))
KEYS = atlas["keys"]

result = {"side": "dense", "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
          "keys": KEYS, "configs": {}}

CONFIGS = [("article", "rag-index.npz"), ("native256", "rag-index-256.npz")]
# The rating-ablated build, when audit-ablate-rating.py has made it. It is the
# only way to tell a fame correlation the rating CAUSED from one it merely
# accompanies, so it is run as a full third side rather than spot-checked.
if os.path.exists(os.path.join(OUT, "rag-index-norating.npz")):
    CONFIGS.append(("article_norating", "rag-index-norating.npz"))

for cfg, fn in CONFIGS:
    t0 = time.time()
    R = RagIndex(os.path.join(OUT, fn))
    load_ms = (time.time() - t0) * 1000
    pos = {f["key"]: i for i, f in enumerate(R.films)}
    missing = [k for k in KEYS if k not in pos]
    tiers = [R.films[pos[k]]["textTier"] if k in pos else "absent" for k in KEYS]

    runs, lat = [], []
    for q in Q["queries"]:
        r = R.search(q["q"], k=len(R.films), docs_k=0)
        lat.append(r["ms"])
        by = {x["key"]: x["score"] for x in r["results"]}
        runs.append({
            "id": q["id"], "tag": q["tag"], "q": q["q"],
            "ms": round(r["ms"], 2),
            # -1.0 marks a film this index does not contain at all, so the audit
            # can tell "ranked last" from "cannot be returned". A cosine is
            # never below -1, so the sentinel cannot collide with a real score.
            "scores": [round(by.get(k, -1.0), 6) for k in KEYS],
            "negationRisk": bool(NEGATION_CUES.search(q["q"])),
        })
        sys.stderr.write(".")
    sys.stderr.write("\n")

    bench = []
    for _ in range(3):
        for q in Q["queries"]:
            bench.append(R.search(q["q"], k=10)["ms"])
    bench.sort()
    result["configs"][cfg] = {
        "index": fn,
        "indexBytes": os.path.getsize(os.path.join(OUT, fn)),
        "meta": R.meta if hasattr(R, "meta") else None,
        "nFilmsIndexed": len(R.films),
        "missingFromIndex": missing,
        "textTier": tiers,
        "loadMs": round(load_ms, 1),
        "latency": {
            "warmMeanMs": round(sum(bench) / len(bench), 2),
            "warmMedianMs": round(bench[len(bench) // 2], 2),
            "warmMinMs": round(bench[0], 2),
            "warmMaxMs": round(bench[-1], 2),
            "n": len(bench),
        },
        "runs": runs,
    }
    print("%s: %d films, %d missing, warm mean %.2f ms" %
          (cfg, len(R.films), len(missing), result["configs"][cfg]["latency"]["warmMeanMs"]))

with open(os.path.join(OUT, "rag-audit-dense.json"), "w") as fh:
    json.dump(result, fh)
print("wrote out/rag-audit-dense.json")
