#!/usr/bin/env python3
"""Scholarship-count prototype (OpenAlex report item: per-film counts of academic
works discussing the film).

INSTRUMENT NOTE, 2026-08-09. The intended instrument is OpenAlex
(title_and_abstract.search, CC0). On this date OpenAlex metered its API:
every list/search request now costs credits ($0.001 per search, free budget
1000 credits = ~100 searches per IP per day, reset midnight UTC) and this
machine's shared egress IP had $0 remaining all day. Entity GETs are free;
nothing count-shaped is. So the prototype runs against OpenAIRE
(api.openaire.eu, free, no key, AND-of-terms search over ~190M aggregated
publications) and the analysis labels every number with its instrument.
The query construction below transfers to OpenAlex unchanged; OpenAlex adds
true quoted-phrase adjacency, which OpenAIRE lacks.

MATCHING. "Vertigo" the film vs vertigo the condition: bare-title counts are
junk (vertigo alone: 36,885; persona alone: 126,176). Every count used is
title-tokens AND director-surname. Measured traps, handled here:
  - OpenAIRE does NOT fold diacritics: "cléo varda"=0, "cleo varda"=10.
    Both raw and ASCII-folded variants are queried; the film gets the max.
  - "8½": the ½ glyph zeroes the query. Numeric/symbol titles go through
    TITLE_ALIASES.
  - Single-letter titles (M): AND-of-terms cannot express them; they are
    flagged unmatchable rather than reported with a garbage count.

Caching mirrors plot-source.js cachePath(): errors are never cached
(A FAILURE IS NOT A FACT), every response is, so reruns are free.

Usage: python3 harvest-scholarship.py <sample.json> <out.json>
  sample.json: [{key,title,year,director,views,forced}, ...]
"""
import hashlib, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

CA = "/root/.ccr/ca-bundle.crt"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache-scholar")
PACE_S = 0.6

# Titles whose canonical form breaks tokenised search; values are the query
# form actually used by scholarship (checked by hand against results).
TITLE_ALIASES = {
    "8½": "otto e mezzo",
    "M": None,          # unmatchable in AND-of-terms search; do not fake it
    "Z": None,
    "Us": None,         # stopword-grade token; surname AND "us" matches everything
}

STOP = {"the", "a", "an", "of", "and", "in", "on", "at", "to", "for", "from", "with"}


def fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")


def tokens(title):
    t = re.sub(r"[^\w\s½]", " ", title, flags=re.UNICODE)
    return [w for w in t.lower().split() if w]


def surname(director):
    if not director:
        return None
    return director.split()[-1].lower()


def cache_path(key):
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", key)[:120]
    h = hashlib.sha1(key.encode()).hexdigest()[:10]
    return os.path.join(CACHE, safe + "_" + h + ".json")


def fetch(url):
    import ssl
    ctx = ssl.create_default_context(cafile=CA)
    req = urllib.request.Request(url, headers={"User-Agent": "atlas-scholarship-prototype"})
    with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
        return json.loads(r.read().decode())


def cached_query(keywords, size=0):
    key = "oaire_%s_s%d" % (keywords, size)
    p = cache_path(key)
    if os.path.exists(p):
        return json.load(open(p))
    url = ("https://api.openaire.eu/search/publications?format=json&size=%d&keywords=%s"
           % (size, urllib.parse.quote(keywords)))
    last = None
    for attempt in range(4):
        try:
            d = fetch(url)
            hdr = d["response"]["header"]
            out = {"keywords": keywords, "total": int(hdr["total"]["$"]),
                   "results": d["response"].get("results")}
            os.makedirs(CACHE, exist_ok=True)
            json.dump(out, open(p, "w"))
            time.sleep(PACE_S)
            return out
        except Exception as e:  # errors are never cached
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("query failed after retries: %s (%s)" % (keywords, last))


def film_queries(f):
    """Return (bare, [disambiguated variants]) or (None, None) if unmatchable."""
    title = f["title"]
    if title in TITLE_ALIASES:
        alias = TITLE_ALIASES[title]
        if alias is None:
            return None, None
        title = alias
    tk = tokens(title)
    content = [w for w in tk if w not in STOP]
    if not content or all(len(w) <= 2 for w in content):
        return None, None
    sn = surname(f.get("director")) or str(f["year"])
    bare = " ".join(tk)
    variants = [" ".join(tk + [sn])]
    folded = fold(" ".join(tk + [sn]))
    if folded != variants[0] and folded.strip():
        variants.append(folded)
    return bare, variants


def one_film(f):
    bare, variants = film_queries(f)
    row = dict(f)
    if variants is None:
        row.update(matchable=False, bare=None, count=None, query=None)
    else:
        b = cached_query(bare)
        best, bestq = -1, None
        for v in variants:
            r = cached_query(v)
            if r["total"] > best:
                best, bestq = r["total"], v
        row.update(matchable=True, bare=b["total"], count=best, query=bestq)
    return row


def main():
    from concurrent.futures import ThreadPoolExecutor
    sample = json.load(open(sys.argv[1]))
    with ThreadPoolExecutor(max_workers=4) as ex:
        out = []
        for i, row in enumerate(ex.map(one_film, sample)):
            out.append(row)
            if (i + 1) % 20 == 0 or i + 1 == len(sample):
                print("  %d/%d %s -> %s" % (i + 1, len(sample), row["title"], row["count"]), flush=True)
    json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
    print("wrote", sys.argv[2])


if __name__ == "__main__":
    main()
