#!/usr/bin/env python3
"""diagnose.py — the three measurements that decide whether the article's
retrieval is allowed anywhere near ATLAS, run against the built index.

    python3 atlas/pipeline/rag/diagnose.py

1. TITLE LEAKAGE. The blob starts "Title: X (year)". If ranking by the cosine
   of the query against the TITLE LINE ALONE reproduces the full index's top
   hits, then this is lexical title matching wearing a semantic costume, and
   the plot text is decoration.

2. FAME CORRELATION. AGENTS rule 1 forbids popularity entering what the atlas
   shows. The article ranks partly on IMDb weighted rating and that rating is
   inside the embedded text. Correlate retrieved rank against log10(votes).

3. THIN-TIER BIAS. 657 films have only a ~230-char Wikipedia lead instead of a
   plot. A short blob is dominated by the title/genre/rating boilerplate, which
   may make thin films score spuriously high. Compare their share of the top-k
   against their 29.8% share of the corpus.

Also prints the article-config vs native-config top-5 diff, so the bake-off can
pick an index knowing what the 512-token truncation cost.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from query import RagIndex, SANITY  # noqa: E402

# A spread of plain requests a reader might actually type. The 3 shared sanity
# queries first, then nine more covering mood, subject, register and era, so the
# fame correlation is not measured off three strings.
QUERIES = SANITY + [
    "a film about grief and losing a parent",
    "something funny and warm for a sunday afternoon",
    "a bleak film about poverty and work",
    "a marriage falling apart over one long night",
    "a film about memory and how unreliable it is",
    "a heist that goes wrong",
    "a coming of age story in a small town",
    "a film about faith and doubt",
    "a war film told from the losing side",
]


def stem(w: str) -> str:
    for suf in ("ness", "ing", "ly", "es", "ed", "s"):
        if len(w) > 4 and w.endswith(suf):
            return w[: -len(suf)]
    return w


STOP = set("a an the and or of about that is isn't not with for from in on to it "
           "film films movie something someone his her their".split())


def content_words(q: str) -> set:
    return {stem(w) for w in re.findall(r"[a-z']+", q.lower()) if w not in STOP and len(w) > 2}


def spearman(a, b) -> float:
    def rank(x):
        order = np.argsort(np.argsort(np.asarray(x, dtype=float)))
        return order.astype(float)
    ra, rb = rank(a), rank(b)
    ra -= ra.mean(); rb -= rb.mean()
    d = math.sqrt(float((ra ** 2).sum()) * float((rb ** 2).sum()))
    return float((ra * rb).sum() / d) if d else 0.0


def main():
    R = RagIndex()
    films = R.films
    n = len(films)
    emb = R.embedder

    print(f"index: {R.config}  {n} films  {R.meta['nChunks']} chunks\n")

    # ── 1. title leakage ────────────────────────────────────────────────
    print("=" * 72)
    print("1. TITLE LEAKAGE — does the title line alone reproduce the ranking?")
    print("=" * 72)
    title_lines = [f"Title: {f['title']} ({f['year']})" for f in films]
    TV = emb.encode(title_lines)

    for q in SANITY:
        full = R.search(q, k=10, docs_k=0)
        full_top = [x["key"] for x in full["results"]]
        qv = emb.encode([q])[0]
        ts = TV @ qv
        title_top = [films[i]["key"] for i in np.argsort(-ts)[:10]]
        overlap5 = len(set(full_top[:5]) & set(title_top[:5]))
        overlap10 = len(set(full_top) & set(title_top))
        cw = content_words(q)
        hits = sum(1 for x in full["results"][:10]
                   if cw & {stem(w) for w in re.findall(r"[a-z']+", (x["title"] or "").lower())})
        base = sum(1 for f in films
                   if cw & {stem(w) for w in re.findall(r"[a-z']+", (f["title"] or "").lower())})
        print(f"\n  {q!r}")
        print(f"    top-5 shared with TITLE-ONLY ranking:  {overlap5}/5")
        print(f"    top-10 shared with TITLE-ONLY ranking: {overlap10}/10")
        print(f"    top-10 whose TITLE contains a query content word: {hits}/10"
              f"   (corpus base rate {base}/{n} = {base/n*100:.1f}%)")
        print(f"    title-only top-5: " +
              ", ".join(f"{films[i]['title']}" for i in np.argsort(-ts)[:5]))

    # ── 2. fame correlation ─────────────────────────────────────────────
    print("\n" + "=" * 72)
    print("2. FAME CORRELATION — does retrieval rank on popularity?")
    print("=" * 72)
    votes = np.array([f["imdbVotes"] or 0 for f in films], dtype=float)
    have = votes > 0
    logv = np.log10(np.where(have, votes, 1))
    corpus_med = float(np.median(logv[have]))

    rhos, top20_med = [], []
    for q in QUERIES:
        r = R.search(q, k=n, docs_k=0)
        keys = {f["key"]: i for i, f in enumerate(films)}
        idx = np.array([keys[x["key"]] for x in r["results"]])
        ranks = np.arange(1, len(idx) + 1)
        m = have[idx]
        rhos.append(spearman(ranks[m], logv[idx][m]))
        top20_med.append(float(np.median(logv[idx[:20]][have[idx[:20]]])))

    rho = float(np.mean(rhos))
    print(f"\n  Spearman(rank, log10 votes) averaged over {len(QUERIES)} queries: {rho:+.3f}")
    print("    (negative == famous films rank HIGHER, since rank 1 is best)")
    print(f"  median log10(votes): corpus {corpus_med:.2f} "
          f"({10**corpus_med:,.0f} votes)  vs  top-20 {np.mean(top20_med):.2f} "
          f"({10**float(np.mean(top20_med)):,.0f} votes)")
    lift = 10 ** (float(np.mean(top20_med)) - corpus_med)
    print(f"  fame lift of the top 20: {lift:.2f}x the corpus median vote count")
    print(f"  per-query rho range: {min(rhos):+.3f} .. {max(rhos):+.3f}")

    # ── 3. thin-tier bias ───────────────────────────────────────────────
    print("\n" + "=" * 72)
    print("3. THIN-TIER BIAS — do short-blob films crowd the top?")
    print("=" * 72)
    tiers = [f["textTier"] for f in films]
    share = sum(1 for t in tiers if t != "plot") / n
    counts = {"plot": 0, "description": 0, "none": 0}
    K = 10
    for q in QUERIES:
        for x in R.search(q, k=K, docs_k=0)["results"]:
            counts[x["textTier"]] += 1
    tot = sum(counts.values())
    thin = (counts["description"] + counts["none"]) / tot
    print(f"\n  corpus:  {share*100:.1f}% of films are thin "
          f"(description-only or no text)")
    print(f"  top-{K}:  {thin*100:.1f}% of retrieved films are thin "
          f"({counts['description']+counts['none']} of {tot} slots over {len(QUERIES)} queries)")
    print(f"  over-representation: {thin/share:.2f}x")
    print(f"  breakdown: {counts}")

    # ── 4. article vs native ────────────────────────────────────────────
    alt = os.path.join(os.path.dirname(HERE), "out", "rag-index-256.npz")
    if os.path.exists(alt):
        print("\n" + "=" * 72)
        print("4. ARTICLE (512 chunk, 256 ceiling) vs NATIVE (256 chunk, nothing lost)")
        print("=" * 72)
        R2 = RagIndex(alt, embedder=emb)
        for q in SANITY:
            a = [x["key"] for x in R.search(q, k=5, docs_k=0)["results"]]
            b = [x["key"] for x in R2.search(q, k=5, docs_k=0)["results"]]
            print(f"\n  {q!r}")
            print(f"    top-5 agreement: {len(set(a)&set(b))}/5")
            print(f"    native top-5: " + ", ".join(
                f"{x['title']}" for x in R2.search(q, k=5, docs_k=0)["results"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
