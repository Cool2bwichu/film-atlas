#!/usr/bin/env python3
"""native-headings.py — build the multilingual section-heading map FROM THE
CORPUS, and show the evidence each decision rests on.

THE PROBLEM. English Wikipedia says "Plot". Italian says "Trama", German
"Handlung", Japanese "あらすじ", Swedish "Handling", French "Synopsis" — and
also "Résumé", "Intrigue", "L'histoire". Guessing at all of Wikipedia's
languages from memory produces a list that is both too long (dead weight) and
too short in exactly the places that matter (the wiki nobody thought of).

THE METHOD. Tally every level-2 heading that actually occurs in the 534 native
articles we hold, per wiki, and attach four measurable signals to each:

  n        how many of this wiki's articles carry the heading
  pos      median 0-based index of the heading among that article's level-2s
  chars    median stripped-prose length of its body
  list     median share of body lines that are list items ('*'/'#')

A plot section is frequent, early (pos 0-1), prose-heavy and NOT a list. A cast
section is equally frequent and equally early but is a list (list >= 0.5). A
production/reception section is prose but late. Those three signals separate the
classes without knowing a word of the language — and then the candidates are
read, in the language, before anything enters the map. Both halves are recorded:
`auto` is what the rule selected, `map` is what shipped, and `overrides` lists
every place a human read overruled the rule, with the reason.

  python3 native-headings.py            # print the evidence table
  python3 native-headings.py --write    # write native-headings.json
"""
import argparse
import collections
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from native_wiki import cache_path, list_ratio, norm_heading, parse_sections, strip_wikitext

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE_WT = os.path.join(HERE, ".cache-native-wt")

# --- the automatic rule's thresholds, stated once ---------------------------
PLOT_MIN_N = 2          # a heading seen once is an anecdote, not a pattern
PLOT_MAX_POS = 2        # plot sections come first; pos 0 or 1, allow 2
PLOT_MIN_CHARS = 400    # below this it is a stub heading, not a plot
PLOT_MAX_LIST = 0.35    # cast lists live above this


def load_articles():
    """Re-read the cached native wikitext keyed by (wiki, title)."""
    tgt = json.load(open(os.path.join(OUT, "native-targets.json"), encoding="utf-8"))
    arts = []
    for f in tgt["films"]:
        cands = f.get("candidates") or []
        if not cands:
            continue
        c = cands[0]
        wiki, title = c["wiki"], c["title"]
        p = cache_path(CACHE_WT, "wt_%s_" % wiki + title)
        # batch caches: find the batch file that contains this title
        arts.append((f, wiki, title))
    # index every cached batch once
    text = {}
    for name in os.listdir(CACHE_WT):
        try:
            d = json.load(open(os.path.join(CACHE_WT, name), encoding="utf-8"))
        except Exception:
            continue
        wiki = name[3:].split("_")[0]
        q = (d or {}).get("query") or {}
        alias = {}
        for n in q.get("normalized", []):
            alias[(wiki, n["from"])] = n["to"]
        for r in q.get("redirects", []):
            alias[(wiki, r["from"])] = r["to"]
        for p in q.get("pages", []):
            if p.get("missing"):
                continue
            rev = (p.get("revisions") or [{}])[0]
            c = ((rev.get("slots") or {}).get("main") or {}).get("content")
            if c:
                text[(wiki, p["title"])] = c
        for k, v in alias.items():
            if (k[0], v) in text:
                text[k] = text[(k[0], v)]
    out = []
    for f, wiki, title in arts:
        wt = text.get((wiki, title))
        if wt:
            out.append((f, wiki, title, wt))
    return out


def tally(articles):
    """heading -> stats, per wiki."""
    stats = collections.defaultdict(lambda: collections.defaultdict(
        lambda: {"n": 0, "pos": [], "chars": [], "list": [], "raw": collections.Counter()}))
    for f, wiki, title, wt in articles:
        secs = [s for s in parse_sections(wt) if s["level"] == 2]
        for i, s in enumerate(secs):
            h = norm_heading(s["title"])
            if not h:
                continue
            e = stats[wiki][h]
            e["n"] += 1
            e["pos"].append(i)
            e["chars"].append(len(strip_wikitext(s["body"])))
            e["list"].append(list_ratio(s["body"]))
            e["raw"][s["title"]] += 1
    return stats


def summarise(stats):
    rows = {}
    for wiki, hs in stats.items():
        rr = []
        for h, e in hs.items():
            rr.append({
                "heading": h,
                "raw": e["raw"].most_common(1)[0][0],
                "n": e["n"],
                "pos": statistics.median(e["pos"]),
                "chars": int(statistics.median(e["chars"])),
                "list": round(statistics.median(e["list"]), 2),
            })
        rr.sort(key=lambda r: -r["n"])
        rows[wiki] = rr
    return rows


def auto_plot(rows):
    """The rule, applied blind: frequent + early + prose + not-a-list."""
    picked = {}
    for wiki, rr in rows.items():
        sel = [r for r in rr
               if r["n"] >= PLOT_MIN_N and r["pos"] <= PLOT_MAX_POS
               and r["chars"] >= PLOT_MIN_CHARS and r["list"] <= PLOT_MAX_LIST]
        picked[wiki] = [r["heading"] for r in sel]
    return picked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--wiki", default=None)
    ap.add_argument("--top", type=int, default=14)
    opt = ap.parse_args()

    articles = load_articles()
    print("articles read from cache: %d" % len(articles))
    rows = summarise(tally(articles))
    auto = auto_plot(rows)

    for wiki in sorted(rows, key=lambda w: -sum(r["n"] for r in rows[w])):
        if opt.wiki and wiki != opt.wiki:
            continue
        arts = len({(w, t) for f, w, t, x in articles if w == wiki})
        print("\n=== %s  (%d articles) ===" % (wiki, arts))
        print("   %-34s %4s %5s %7s %6s  %s" % ("heading", "n", "pos", "chars", "list", "auto"))
        for r in rows[wiki][:opt.top]:
            print("   %-34s %4d %5.1f %7d %6.2f  %s"
                  % (r["heading"][:34], r["n"], r["pos"], r["chars"], r["list"],
                     "PLOT?" if r["heading"] in auto[wiki] else ""))

    if opt.write:
        with open(os.path.join(HERE, "native-headings.tally.json"), "w", encoding="utf-8") as fh:
            json.dump({"rows": rows, "auto": auto}, fh, ensure_ascii=False, indent=1)
        print("\nwrote native-headings.tally.json")


if __name__ == "__main__":
    main()
