#!/usr/bin/env python3
"""hybrid.py — the three hybrids, built and measured on the frozen 30-query audit.

The bake-off's two pure sides are already dumped as FULL 2,204-wide score vectors
per query, on an identical key order, for the identical 30 query strings:

    out/rag-audit-atlas.json    match.js + query-parse.js   (+ unread spans)
    out/rag-audit-dense.json    MiniLM over the article blob (3 configs)

So every hybrid here is a function of two frozen vectors. Nothing is re-scored,
nothing is re-parsed, and neither pure side can drift between its own row and the
hybrid rows built on top of it. The one exception is hybrid C, which by
construction needs an embedding of text no one has embedded yet (the parser's
unread spans); it calls the same RagIndex the dense side ran.

THE HYBRIDS
-----------
  A  DENSE PROPOSES, VOCABULARY CONFIRMS
     dense top-N candidates, re-ordered by the closed vocabulary's score.
     Variant A-veto additionally DROPS a candidate the vocabulary scores below a
     floor, which is what makes it a confirmation rather than a re-weighting.

  B  VOCABULARY SELECTS, DENSE ORDERS
     the vocabulary picks the family, dense similarity orders inside it. The
     family is a SCORE BAND, not a top-N slice: taking "the top 25" out of a
     1,346-film tie would be taking 25 alphabetical accidents, so the band is
     grown until it holds at least N films and every film tied at the boundary
     comes with it.

  C  DENSE ONLY FOR WHAT THE PARSER COULD NOT READ
     query-parse.js reports the spans it failed to place. Embed ONLY those, and
     blend with the vocabulary score using the parser's OWN read fraction as the
     weight: a sentence read 100% is pure incumbent, a sentence read 0% is pure
     dense, and everything between is mixed in the proportion the parser itself
     reports. The weight is therefore not a tuned hyperparameter.

  D  RECIPROCAL RANK FUSION — the dumb baseline, present so the three clever
     hybrids have to beat something other than the pure sides. A hybrid that
     cannot beat RRF is not earning its complexity.

SCALES ARE NOT COMPARABLE, SO RANKS ARE USED. An atlas clause score is 0..1 with
huge tie plateaus; a cosine is ~0.2..0.55 with none. Averaging them directly
would let the cosine's spread dominate. Every blend below therefore runs on
tie-averaged rank percentiles, which is scale-free and preserves the incumbent's
tie structure instead of silently breaking it.

Writes: out/rag-hybrid.json
"""
from __future__ import annotations

import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "out")
STATIC = os.path.join(os.path.dirname(os.path.dirname(HERE)), "static")
sys.path.insert(0, HERE)

DENSE_CONFIG = "native256"   # dense's BEST case, per the config comparison
ABSENT = -1.0                # sentinel used by audit-run-dense.py


# ─────────────────────────────────────────────────────────────── load the frozen
def load():
    A = json.load(open(os.path.join(OUT, "rag-audit-atlas.json")))
    D = json.load(open(os.path.join(OUT, "rag-audit-dense.json")))
    T = json.load(open(os.path.join(OUT, "rag-attr-table.json")))
    F = json.load(open(os.path.join(OUT, "rag-audit-facts.json")))["films"]
    M = json.load(open(os.path.join(HERE, "hybrid-measures.json")))

    assert A["keys"] == D["keys"], "the two sides were dumped on different key orders"
    keys = A["keys"]
    aq = {r["id"]: r for r in A["runs"]}
    dq = {c: {r["id"]: r for r in D["configs"][c]["runs"]} for c in D["configs"]}
    for qid in aq:
        assert aq[qid]["q"] == dq[DENSE_CONFIG][qid]["q"], f"{qid}: query strings differ"

    corpus = json.load(open(os.path.join(STATIC, "corpus.json")))["films"]
    plots = json.load(open(os.path.join(OUT, "plots.json")))["films"]
    text = {}
    for k in keys:
        p = (plots.get(k) or {}).get("plot") or ""
        text[k] = p if p else ((corpus.get(k) or {}).get("description") or "")

    return dict(A=A, D=D, T=T, F=F, M=M, keys=keys, aq=aq, dq=dq,
                meta=corpus, text=text, plots=plots)


def rank_pct(scores: np.ndarray) -> np.ndarray:
    """Tie-averaged rank percentile in [0,1], 1.0 = best. Ties keep one value,
    so a plateau stays a plateau instead of becoming an alphabetical ramp."""
    n = len(scores)
    order = np.argsort(-scores, kind="stable")
    out = np.empty(n, float)
    i = 0
    srt = scores[order]
    while i < n:
        j = i
        while j + 1 < n and abs(srt[j + 1] - srt[i]) < 1e-9:
            j += 1
        out[order[i:j + 1]] = 1.0 - ((i + j) / 2.0) / max(n - 1, 1)
        i = j + 1
    return out


def order_of(scores: np.ndarray, tiebreak: np.ndarray) -> np.ndarray:
    """Ranked film indices: score desc, then match.js's own localeCompare order."""
    return np.lexsort((tiebreak, -scores))


def tie_widths(scores: np.ndarray, order: np.ndarray) -> dict:
    """Width of the tied band each ranked position sits in."""
    s = scores[order]
    w, i, n = {}, 0, len(order)
    while i < n:
        j = i
        while j + 1 < n and abs(s[j + 1] - s[i]) < 1e-9:
            j += 1
        for x in range(i, j + 1):
            w[int(order[x])] = (j - i + 1, i + 1, j + 1)
        i = j + 1
    return w


# ──────────────────────────────────────────────────────────────── the hybrids
def build_methods(L, unread_scores: dict, attr=None):
    """Every method is qid -> full 2,204-long score vector (higher = better),
    plus a note on how a tie should be read. Pure sides included so the hybrids
    are measured on exactly the same instrument."""
    keys, aq, dq = L["keys"], L["aq"], L["dq"][DENSE_CONFIG]
    n = len(keys)
    tb = np.array([L["T"]["localeOrder"][k] for k in keys], float)

    A = {q: np.array(aq[q]["scores"], float) for q in aq}
    Dn = {q: np.array(dq[q]["scores"], float) for q in aq}
    for q in Dn:                       # absent-from-index sentinel -> worst
        Dn[q][Dn[q] <= ABSENT + 1e-9] = -1.0

    Ar = {q: rank_pct(A[q]) for q in A}
    Dr = {q: rank_pct(Dn[q]) for q in Dn}

    M = {}
    M["PURE-ATLAS"] = dict(scores=A, kind="pure")
    M["PURE-DENSE"] = dict(scores=Dn, kind="pure")

    # ── A: dense proposes, vocabulary confirms ───────────────────────────────
    # Candidates come from dense. Inside the candidate set the vocabulary is the
    # authority; dense only breaks the vocabulary's ties. Non-candidates are
    # pushed below every candidate rather than deleted, so the vector stays
    # 2,204 wide and rank-of-a-watch-film is still answerable.
    for N in (25, 50, 100, 200):
        out = {}
        for q in A:
            cand = np.argsort(-Dn[q], kind="stable")[:N]
            s = np.full(n, -1e9)
            s[cand] = A[q][cand] + 1e-6 * Dr[q][cand]
            out[q] = s
        M[f"A-confirm-{N}"] = dict(scores=out, kind="hybrid",
                                   shape="dense proposes N, vocabulary re-orders")

    # A-veto: the confirmation actually refuses. A candidate the vocabulary
    # scores below the floor is DROPPED, which is the only version that can
    # protect a negation the dense side cannot represent.
    for N, floor in ((50, 0.5), (100, 0.5)):
        out = {}
        for q in A:
            cand = np.argsort(-Dn[q], kind="stable")[:N]
            keep = cand[A[q][cand] >= floor]
            s = np.full(n, -1e9)
            if len(keep):
                s[keep] = A[q][keep] + 1e-6 * Dr[q][keep]
            out[q] = s
        M[f"A-veto-{N}"] = dict(scores=out, kind="hybrid",
                                shape=f"dense proposes N, vocabulary vetoes below {floor}")

    # ── B: vocabulary selects, dense orders ──────────────────────────────────
    # The family is a SCORE BAND grown to at least N, never a top-N slice, so no
    # film enters or leaves the family because of its first letter.
    for N in (25, 50, 100, 200):
        out = {}
        for q in A:
            o = order_of(A[q], tb)
            cut = A[q][o[min(N, n) - 1]]
            fam = np.where(A[q] >= cut - 1e-9)[0]
            s = np.full(n, -1e9)
            s[fam] = Dn[q][fam]
            out[q] = s
        M[f"B-order-{N}"] = dict(scores=out, kind="hybrid",
                                 shape="vocabulary selects the band, dense orders inside it")

    # ── C: dense only for what the parser could not read ─────────────────────
    # Weight is the parser's own read fraction. Not tuned.
    out, mix = {}, {}
    for q in A:
        f = 1.0 - float(aq[q]["read"]["unreadFrac"])      # fraction READ
        u = unread_scores.get(q)
        if u is None:                                     # nothing unread
            out[q], mix[q] = A[q].copy(), dict(read=f, denseWeight=0.0, spans=[])
            continue
        ur = rank_pct(u)
        out[q] = f * Ar[q] + (1.0 - f) * ur
        mix[q] = dict(read=round(f, 3), denseWeight=round(1.0 - f, 3),
                      spans=aq[q]["read"]["unread"])
    M["C-unread"] = dict(scores=out, kind="hybrid", mix=mix,
                         shape="vocabulary on what it read, dense on the unread spans, "
                               "blended by the parser's own read fraction")

    # C-strict: the vocabulary still SELECTS (nothing it scores at zero can be
    # returned), dense-on-unread only orders. Guards the negation C otherwise
    # dilutes.
    out2 = {}
    for q in A:
        u = unread_scores.get(q)
        s = np.full(n, -1e9)
        live = np.where(A[q] > 0)[0]
        if u is None or not len(live):
            out2[q] = A[q].copy()
            continue
        s[live] = 0.5 * Ar[q][live] + 0.5 * rank_pct(u)[live]
        out2[q] = s
    M["C-strict"] = dict(scores=out2, kind="hybrid",
                         shape="vocabulary gates to score>0, then unread-span dense orders")

    # ── B-ship: the only version of B that can actually ship ─────────────────
    # Identical discipline to B, but the dense ordering is a similarity to the
    # query's ATTRIBUTE VECTORS, precomputed at build time, instead of to the
    # visitor's sentence. No runtime encoder. Measured rather than asserted,
    # because "it ships" is worthless if the gain does not survive the change.
    if attr is not None:
        avocab, acos, clauses = attr["vocab"], attr["cos"], attr["clauses"]
        ai = {a: i for i, a in enumerate(avocab)}
        for N in (100, 200):
            out = {}
            for q in A:
                pos = [ai[a] for a in clauses.get(q, {}).get("positive", []) if a in ai]
                o = order_of(A[q], tb)
                cut = A[q][o[min(N, n) - 1]]
                fam = np.where(A[q] >= cut - 1e-9)[0]
                s = np.full(n, -1e9)
                if pos:
                    s[fam] = acos[pos][:, fam].mean(0)
                else:
                    # nothing read -> nothing precomputed to order by. The
                    # shippable hybrid has no answer here, and says so rather
                    # than falling back on a runtime embedding it cannot have.
                    pass
                out[q] = s
            M[f"B-ship-{N}"] = dict(scores=out, kind="hybrid-shippable",
                                    shape="vocabulary selects the band, PRECOMPUTED attribute "
                                          "vectors order it — no runtime encoder")

    # ── D: RRF, the dumb baseline ────────────────────────────────────────────
    for kk in (60,):
        out = {}
        for q in A:
            ra = np.empty(n); ra[order_of(A[q], tb)] = np.arange(n)
            rd = np.empty(n); rd[np.argsort(-Dn[q], kind="stable")] = np.arange(n)
            out[q] = 1.0 / (kk + ra + 1) + 1.0 / (kk + rd + 1)
        M[f"D-rrf-{kk}"] = dict(scores=out, kind="baseline",
                                shape="reciprocal rank fusion, equal weights")

    # Blend baseline: straight mean of rank percentiles.
    M["D-blend"] = dict(scores={q: 0.5 * Ar[q] + 0.5 * Dr[q] for q in A},
                        kind="baseline", shape="mean of rank percentiles")
    return M, tb


# ────────────────────────────────────────────────────────────────── the measures
def spearman(a: np.ndarray, b: np.ndarray) -> float:
    def rk(x):
        o = np.argsort(x, kind="stable"); r = np.empty(len(x), float); r[o] = np.arange(len(x))
        return r
    ra, rb = rk(a), rk(b)
    ra -= ra.mean(); rb -= rb.mean()
    d = np.sqrt((ra ** 2).sum() * (rb ** 2).sum())
    return float((ra * rb).sum() / d) if d else 0.0


def measure(L, M, tb):
    """Every method on every declared measure.

    A REFUSAL IS NOT A RANKING. query-parse.js reads nothing at all in 14 of the
    30 queries; the audit dumps a flat zero vector for those, and sorting a flat
    vector yields an alphabetical list that is not an answer. Any method whose
    live scores are all equal is therefore recorded as NOT ANSWERING rather than
    credited with ten films beginning with a digit. Precision is reported twice
    as a result: over the queries a method answered, and over all of them with a
    refusal scored as zero. The first flatters a method that refuses often, the
    second flatters one that always guesses; neither alone is honest.
    """
    import re
    keys, aq, T, F, MS = L["keys"], L["aq"], L["T"], L["F"], L["M"]
    n = len(keys)
    plotted = np.array([bool(x) for x in L["A"]["plottedMask"]])
    votes = np.array([float((F.get(k) or {}).get("imdbVotes") or 0) for k in keys])
    have_votes = votes > 0
    logv = np.log10(np.maximum(votes, 1))
    kpos = {k: i for i, k in enumerate(keys)}

    facts = {q: re.compile(MS["fact"][q], re.I) for q in MS["fact"] if q.startswith("q")}
    fact_hit = {q: np.array([bool(facts[q].search(L["text"][k])) for k in keys]) for q in facts}
    neg = MS["negation"]
    NEG_PRESENT = 0.5      # below this the attribute is a trace, not a presence

    rows = {}
    for name, mm in M.items():
        S = mm["scores"]
        per = {}
        fact_ans, fact_all, negv, tie1, rhos, seen = [], [], {}, [], [], set()
        answered = 0
        for q in sorted(S):
            s = S[q]
            o = order_of(s, tb)
            live = o[s[o] > -1e8]
            disc = len(live) > 0 and (s[live].max() - s[live].min() > 1e-9)
            r = {"answered": bool(disc), "nLive": int(len(live))}
            if not disc:
                r["note"] = "no discriminating ranking — every candidate scores the same"
                if q in fact_hit:
                    fact_all.append(0.0)
                per[q] = r
                continue
            answered += 1
            top10 = list(live[:10])
            seen.update(int(x) for x in top10)
            tw = tie_widths(s, live)
            r["top10"] = [keys[i] for i in top10]
            r["tie1"] = tw.get(int(live[0]), (1, 1, 1))[0]
            tie1.append(r["tie1"])

            if q in fact_hit:
                lp = [i for i in live if plotted[i]][:10]
                v = round(float(fact_hit[q][lp].mean()), 3) if lp else 0.0
                r["fact"] = v
                r["factTop10"] = [(keys[i], bool(fact_hit[q][i])) for i in lp]
                fact_ans.append(v); fact_all.append(v)

            if q in neg:
                at = neg[q]["attr"]
                v = [(k, (T["films"].get(k) or {}).get(at, 0)) for k in r["top10"]]
                r["negViolations"] = len([k for k, x in v if x >= NEG_PRESENT])
                r["negViolators"] = [k for k, x in v if x >= NEG_PRESENT]
                r["negAnyTrace"] = len([k for k, x in v if x > 0])
                negv[q] = r["negViolations"]

            idx = np.array([i for i in live if have_votes[i]])
            if len(idx) >= 20:
                r["fameRho"] = round(spearman(-np.arange(len(idx), dtype=float), logv[idx]), 3)
                r["fameN"] = int(len(idx))
                rhos.append(r["fameRho"])

            if q in MS["watch"] and q.startswith("q"):
                pos = {int(x): i for i, x in enumerate(live)}
                w = {}
                for wk in MS["watch"][q]:
                    i = kpos.get(wk)
                    if i is None:
                        w[wk] = "not in corpus"
                    elif i in pos:
                        w[wk] = dict(rank=pos[i] + 1, of=len(live), tie=tw.get(i, (1,))[0])
                    else:
                        w[wk] = dict(rank=None, of=len(live),
                                     note="outside this method's candidate set")
                r["watch"] = w
            per[q] = r

        scored = [negv[q] for q in negv if q != "q26"]
        rows[name] = dict(
            kind=mm["kind"], shape=mm.get("shape"),
            answered=answered, ofQueries=len(S),
            factP10_answered=round(float(np.mean(fact_ans)), 3) if fact_ans else None,
            factP10_allQueries=round(float(np.mean(fact_all)), 3) if fact_all else None,
            factAnswered=len(fact_ans), factTotal=len(fact_hit),
            negViolPer10=round(float(np.mean(scored)), 2) if scored else None,
            negPerQuery=negv,
            fameRho=round(float(np.mean(rhos)), 3) if rhos else None,
            fameRhoMax=round(float(np.max(rhos)), 3) if rhos else None,
            meanTie1=round(float(np.mean(tie1)), 1) if tie1 else None,
            medTie1=int(np.median(tie1)) if tie1 else None,
            reach=len(seen), reachCeiling=30 * 10,
            perQuery=per,
        )
    return rows


# ────────────────────────────────────────────── hybrid C needs a new embedding
def unread_vectors(L, cache=os.path.join(OUT, "rag-hybrid-unread.json")):
    """Embed ONLY the spans query-parse.js could not place, and score every film
    against them with the same index and the same max-over-chunks rollup the
    dense side ran. Cached, because it is the one part of this file that touches
    the model."""
    if os.path.exists(cache):
        c = json.load(open(cache))
        if c.get("keys") == L["keys"] and c.get("config") == DENSE_CONFIG:
            return {q: np.array(v, float) for q, v in c["scores"].items()}, c["probe"]

    from query import RagIndex
    R = RagIndex(os.path.join(OUT, "rag-index-256.npz"))
    scores, probe = {}, {}
    for qid, r in sorted(L["aq"].items()):
        spans = [s for s in (r["read"]["unread"] or []) if s and s.strip()]
        if not spans:
            probe[qid] = None
            continue
        text = " ".join(spans)
        probe[qid] = text
        res = R.search(text, k=len(R.films), docs_k=0)
        by = {x["key"]: x["score"] for x in res["results"]}
        scores[qid] = [round(by.get(k, -1.0), 6) for k in L["keys"]]
    json.dump({"note": "dense scores for the parser's UNREAD spans only — hybrid C's input.",
               "config": DENSE_CONFIG, "keys": L["keys"], "probe": probe,
               "scores": scores}, open(cache, "w"))
    return {q: np.array(v, float) for q, v in scores.items()}, probe


def main():
    t0 = time.time()
    L = load()
    us, probe = unread_vectors(L)
    attr = None
    ap = os.path.join(OUT, "rag-attr-vectors.npz")
    if os.path.exists(ap):
        z = np.load(ap, allow_pickle=True)
        cl = json.load(open(os.path.join(OUT, "rag-query-clauses.json")))["queries"]
        akeys = [str(x) for x in z["keys"]]
        # the npz is in index order, the audit is in corpus order — permute, never assume
        assert set(akeys) == set(L["keys"]), "attribute matrix covers a different film set"
        pos = {k: i for i, k in enumerate(akeys)}
        perm = np.array([pos[k] for k in L["keys"]])
        attr = dict(vocab=[str(x) for x in z["vocab"]],
                    cos=np.asarray(z["cos"], float)[:, perm], clauses=cl)
    M, tb = build_methods(L, us, attr)
    rows = measure(L, M, tb)

    out = {
        "note": "the three hybrids, measured against both pure sides and a dumb "
                "fusion baseline on the frozen 30-query audit. Measures were "
                "declared in hybrid-measures.json before any hybrid was run.",
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "denseConfig": DENSE_CONFIG,
        "queries": {q: L["aq"][q]["q"] for q in L["aq"]},
        "unreadProbe": probe,
        "methods": rows,
        "buildSeconds": round(time.time() - t0, 1),
    }
    json.dump(out, open(os.path.join(OUT, "rag-hybrid.json"), "w"), indent=1)

    hdr = "%-18s %6s %9s %9s %8s %8s %7s %6s" % (
        "method", "ans", "FACT/ans", "FACT/all", "NEGVIOL", "fameRho", "tie@1", "reach")
    print(hdr); print("-" * len(hdr))
    for k, v in rows.items():
        g = lambda x, f: "-" if x is None else f % x
        print("%-18s %6s %9s %9s %8s %8s %7s %6d" % (
            k, "%d/%d" % (v["answered"], v["ofQueries"]),
            g(v["factP10_answered"], "%.3f"), g(v["factP10_allQueries"], "%.3f"),
            g(v["negViolPer10"], "%.1f"), g(v["fameRho"], "%+.3f"),
            g(v["meanTie1"], "%.0f"), v["reach"]))
    print(f'\nwrote out/rag-hybrid.json in {out["buildSeconds"]}s')
    return 0


if __name__ == "__main__":
    sys.exit(main())
