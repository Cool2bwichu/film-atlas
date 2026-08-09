#!/usr/bin/env python3
"""verify-stripper.py — proof that the Python port of plot-source.js's wikitext
stripper produces the same numbers as the JS it was ported from.

Reads the already-cached English wikitext in .cache-plots, re-extracts the plot
section with the Python code in native-wiki.py, and compares plotChars against
out/plots.json (written by the JS). No network. If the port drifted, native plot
lengths would not be comparable to English ones and every measurement in the
native harvest would be against a moved ruler.
"""
import json
import re
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from native_wiki import parse_sections, norm_heading, strip_wikitext

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache-plots")

PLOT_HEADINGS = {
    "plot", "plot summary", "plot synopsis", "synopsis", "story", "storyline",
    "summary", "narrative", "premise", "plot outline", "the plot",
}


def js_norm_heading(h):
    """The JS normHeading, character for character: strip tags, then delete
    everything outside [A-Za-z0-9 ]."""
    t = re.sub(r"<[^>]+>", "", h)
    t = re.sub(r"[^A-Za-z0-9 ]", "", t)
    return t.strip().lower()


def extract_plot_en(wikitext, norm):
    sections = parse_sections(wikitext)
    best = None
    for s in sections:
        if s["level"] != 2:
            continue
        if norm(s["title"]) in PLOT_HEADINGS:
            best = s
            break
    if best is None:
        for s in sections:
            if s["level"] != 2:
                continue
            n = norm(s["title"])
            if re.match(r"^plot\b", n) or re.match(r"^synopsis\b", n):
                best = s
                break
    if best is None:
        return None
    txt = strip_wikitext(best["body"])
    return txt or None


def main():
    plots = json.load(open(os.path.join(HERE, "out", "plots.json"), encoding="utf-8"))
    by_title = {}
    for name in os.listdir(CACHE):
        if not name.startswith("wt_"):
            continue
        try:
            d = json.load(open(os.path.join(CACHE, name), encoding="utf-8"))
        except Exception:
            continue
        q = (d or {}).get("query") or {}
        alias = {}
        for n in q.get("normalized", []):
            alias[n["from"]] = n["to"]
        for r in q.get("redirects", []):
            alias[r["from"]] = r["to"]
        for p in q.get("pages", []):
            if p.get("missing"):
                continue
            rev = (p.get("revisions") or [{}])[0]
            content = ((rev.get("slots") or {}).get("main") or {}).get("content")
            if content:
                by_title[p["title"]] = content

    same = diff = missing = 0
    worst = []
    rescued = []
    for key, rec in plots["films"].items():
        title = rec["wikipedia"]
        wt = by_title.get(title)
        if wt is None:
            missing += 1
            continue
        got = extract_plot_en(wt, js_norm_heading)
        got_n = len(got) if got else 0
        want = rec["plotChars"]
        if got_n == want:
            same += 1
        else:
            diff += 1
            worst.append((abs(got_n - want), title, want, got_n))
        uni = extract_plot_en(wt, norm_heading)
        if (len(uni) if uni else 0) != got_n:
            rescued.append((title, got_n, len(uni) if uni else 0))
    worst.sort(reverse=True)
    print("compared        %d" % (same + diff))
    print("not in cache    %d  (batch caches are keyed by title list; a film whose"
          " batch was refreshed under a different grouping is not re-checkable here)" % missing)
    print("identical chars %d  (%.2f%%)  [JS heading rule, JS stripper vs Python stripper]"
          % (same, 100.0 * same / max(1, same + diff)))
    print("differing       %d" % diff)
    for d, t, want, got in worst[:15]:
        print("   %-45s js=%-6d py=%-6d  delta=%d" % (t[:45], want, got, got - want))
    print("\nheading-rule delta (unicode-preserving norm vs the JS ASCII strip): %d film(s)"
          % len(rescued))
    for t, a, b in rescued[:10]:
        print("   %-45s js-rule=%-6d unicode-rule=%d" % (t[:45], a, b))


if __name__ == "__main__":
    main()
