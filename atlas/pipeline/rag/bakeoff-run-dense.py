#!/usr/bin/env python3
"""bakeoff-run-dense.py — runs the shared battery through query.py and dumps one
JSON blob in the same shape as bakeoff-run-atlas.js. Adds no scoring of its own.

Runs BOTH indexes: rag-index.npz (article-faithful, 512-token chunks that the
256-token encoder silently truncates) and rag-index-256.npz (same splitter sized
to the model). The bake-off needs both or it cannot tell an article-config bug
from a limit of dense retrieval itself.

For the exemplar queries it ALSO reports neighbours(), the film vector used as
the probe. That is the charitable reading of "films like X" on this side: it
skips the title string entirely and asks the index for the film's own
neighbours, which is the best this architecture can do with an exemplar.
"""
import json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "out")
sys.path.insert(0, HERE)
from query import RagIndex

battery = json.load(open(os.path.join(HERE, "bakeoff-battery.json")))
plotted = None
if "--plotted" in sys.argv:
    p = json.load(open(os.path.join(OUT, "plots.json")))["films"]
    plotted = {k for k, v in p.items() if v and v.get("plot")}

EXEMPLARS = {"D1": "the banshees of inisherin", "P2-exemplar": "stalker"}
dest = next((a for a in sys.argv[1:] if not a.startswith("--")), None)
out = {"side": "dense", "indexes": {}}

for label, fname in (("article", "rag-index.npz"), ("native256", "rag-index-256.npz")):
    R = RagIndex(os.path.join(OUT, fname))
    rows = []
    for spec in battery["queries"]:
        n_all = len(R.films)
        full = R.search(spec["q"], k=n_all, docs_k=3, universe=plotted)
        res = full["results"]
        pos = {r["key"]: r for r in res}
        rank_of = {}
        for w in spec["watch"]:
            hit = pos.get(w)
            rank_of[w] = ({"rank": hit["rank"], "score": hit["score"], "of": len(res)}
                          if hit else {"rank": None, "of": len(res), "note": "key not indexed"})
        row = {
            "id": spec["id"], "q": spec["q"], "ms": full["ms"],
            "universeSize": full["universeSize"],
            "negationRisk": full["negationRisk"],
            "top": [{k: r[k] for k in ("rank", "key", "title", "year", "score", "textTier")}
                    for r in res[:12]],
            "docs": full["docs"],
            "rankOf": rank_of,
        }
        if spec["id"] in EXEMPLARS:
            key = EXEMPLARS[spec["id"]]
            nb = R.neighbours(key, k=12)
            row["neighbours"] = nb
            row["neighbourRankOf"] = {
                w: (lambda t: {"rank": t[0], "score": t[1], "of": t[2]})(R.rank_of_film(key, w))
                for w in spec["watch"] if w != key
            }
        rows.append(row)
    out["indexes"][label] = {"config": R.config, "films": len(R.films),
                             "chunks": int(R.chunk_vectors.shape[0]), "queries": rows}
    print(f"{label}: {len(rows)} queries over {len(R.films)} films", file=sys.stderr)

txt = json.dumps(out, indent=1)
open(dest, "w").write(txt) if dest else print(txt)
