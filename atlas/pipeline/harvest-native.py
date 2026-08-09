#!/usr/bin/env python3
"""harvest-native.py — native-language Wikipedia plot (and criticism) sections
for the quiet half of the corpus.

WHY THIS FILE EXISTS
--------------------
docs/specs/source-survey-2.md measured that the 663 films with no admitted
English plot are not quiet everywhere — they are quiet *in English*. 95% of the
non-English ones have an article in their own language, and 61% of the whole
quiet half has a plot section there. Woman of Rome (1954): English plot 386
chars, withheld below the evidence floor; the Italian `Trama` is 3,172.

WHAT IT DOES NOT DO
-------------------
  - It does not write into static/corpus.json. Same rule as plots.json: SCORER
    INPUT ONLY, the shipped payload is already 13 MB.
  - It does not lower the evidence floor. A native plot is measured against the
    same 1,500 chars, by the same stripper (verified char-for-char against the
    JS in verify-stripper.py), so "admitted" means what it has always meant.

STAGES (all cached to disk, all resumable, ~1 req/s)
  1  sitelinks    Wikidata wbgetentities, 50 QIDs per call
  2  langcodes    P424 (Wikimedia language code) for every P364 language QID
                  that actually occurs in the quiet half
  3  wikitext     per-wiki action API, 20 titles per call
  4  headings     tally every level-2 heading seen, per wiki  -> native-headings.json
  5  extract      plot + criticism sections using that map
  6  measure      floor crossings, fame shape vs pageviews, region/language table

  python3 harvest-native.py --stage fetch      # 1-3, network
  python3 harvest-native.py --stage headings   # 4, offline, writes the tally
  python3 harvest-native.py --stage all        # everything, writes out/native-plots.json
"""
import argparse
import collections
import json
import math
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from native_wiki import (cached, cache_path, get, list_ratio, norm_heading,
                         parse_sections, strip_wikitext)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
OUT = os.path.join(HERE, "out")
CACHE_WD = os.path.join(HERE, ".cache-native-wd")
CACHE_WT = os.path.join(HERE, ".cache-native-wt")
CACHE_VIEWS = os.path.join(HERE, ".cache-views")   # shared with plot-source.js
HEADING_MAP = os.path.join(HERE, "native-headings.json")
OUT_FILE = os.path.join(OUT, "native-plots.json")
REPORT_FILE = os.path.join(OUT, "native-plots.report.json")

PLOT_FLOOR_CHARS = 1500          # identical to plot-source.js
PACE = 1.1                       # Wikimedia rate-limits above ~1 req/s

# Language QIDs with no P424 on Wikidata that nonetheless have an obvious wiki.
# Derived from the languages that actually occur in this corpus, not guessed at
# in general: every entry below was printed by --stage fetch as an unmapped QID.
LANG_OVERRIDES = {
    "Q9192": "zh",     # Mandarin Chinese -> zh.wikipedia
    "Q727694": "zh",   # Standard Chinese
    "Q7850": "zh",     # Chinese
    "Q7033959": "zh",  # Written vernacular Chinese
    "Q36236": "zh",    # Min Nan  (no separate corpus need; zh is the article home)
    "Q56475": "zh",    # Cantonese -> zh (yue.wikipedia exists but is not where these films live)
    "Q7737": "ru",     # Russian (has P424, kept for safety)
}

# A film with no usable P364 (silent cinema, or simply unstated) still has a
# country. This map is built from the country QIDs that ACTUALLY occur in the
# quiet half — printed by --stage fetch — not from a world atlas.
COUNTRY_LANG = {
    "Q30": None, "Q16": None, "Q145": None, "Q408": None, "Q664": None,  # anglophone: no native gain
    "Q38": "it", "Q142": "fr", "Q183": "de", "Q40": "de", "Q39": "de",
    "Q34": "sv", "Q35": "da", "Q20": "no", "Q33": "fi", "Q189": "is",
    "Q29": "es", "Q96": "es", "Q414": "es", "Q298": "es", "Q717": "es", "Q736": "es",
    "Q45": "pt", "Q155": "pt", "Q31": "nl", "Q55": "nl",
    "Q36": "pl", "Q213": "cs", "Q33946": "cs", "Q214": "sk", "Q28": "hu",
    "Q218": "ro", "Q219": "bg", "Q403": "sr", "Q83286": "sr", "Q224": "hr",
    "Q159": "ru", "Q15180": "ru", "Q212": "uk", "Q211": "lv", "Q37": "lt", "Q191": "et",
    "Q41": "el", "Q43": "tr", "Q794": "fa", "Q801": "he", "Q79": "ar", "Q262": "ar",
    "Q17": "ja", "Q884": "ko", "Q148": "zh", "Q865": "zh", "Q8646": "zh",
    "Q668": "hi", "Q843": "ur", "Q902": "bn", "Q881": "vi", "Q869": "th",
    "Q252": "id", "Q928": "tl", "Q1049": "ar", "Q1025": "ar", "Q262": "ar",
    "Q1033": "en", "Q1032": "fr", "Q1008": "fr", "Q1039": "pt", "Q1029": "pt",
    "Q1027": "fr", "Q790": "fr", "Q962": "fr", "Q1041": "fr", "Q1045": "so",
    "Q77": "es", "Q414": "es", "Q419": "es", "Q739": "es", "Q750": "es",
    "Q733": "es", "Q265": "uz", "Q232": "kk", "Q863": "tg", "Q819": "lo",
    "Q424": "km", "Q836": "my", "Q854": "si", "Q222": "sq", "Q221": "mk",
    "Q225": "bs", "Q215": "sl", "Q27": "en", "Q235": "fr", "Q347": "de",
}


# ---------------------------------------------------------------- corpus load

REGION = {
    "Q30": "US/CA", "Q16": "US/CA",
    "Q145": "UK/IE", "Q27": "UK/IE",
    "Q17": "Japan",
    "Q38": "W-Europe", "Q142": "W-Europe", "Q183": "W-Europe", "Q34": "W-Europe",
    "Q39": "W-Europe", "Q29": "W-Europe", "Q31": "W-Europe", "Q55": "W-Europe",
    "Q35": "W-Europe", "Q20": "W-Europe", "Q33": "W-Europe", "Q40": "W-Europe",
    "Q45": "W-Europe", "Q41": "W-Europe",
    "Q36": "E-Europe", "Q15180": "E-Europe", "Q159": "E-Europe", "Q214": "E-Europe",
    "Q213": "E-Europe", "Q28": "E-Europe", "Q218": "E-Europe", "Q403": "E-Europe",
    "Q212": "E-Europe", "Q219": "E-Europe",
    "Q148": "E-Asia", "Q884": "E-Asia", "Q865": "E-Asia", "Q8646": "E-Asia",
    "Q668": "S-Asia", "Q794": "S-Asia", "Q843": "S-Asia", "Q902": "S-Asia",
    "Q96": "LatAm", "Q155": "LatAm", "Q414": "LatAm", "Q298": "LatAm", "Q739": "LatAm",
    "Q408": "Oceania", "Q664": "Oceania",
}


def region_of(rec):
    c = (rec.get("country") or [None])[0]
    return REGION.get(c, "Other")


def load():
    corpus = json.load(open(os.path.join(ROOT, "static", "corpus.json"), encoding="utf-8"))
    harvest = json.load(open(os.path.join(OUT, "harvest.json"), encoding="utf-8"))
    plots = json.load(open(os.path.join(OUT, "plots.json"), encoding="utf-8"))
    quiet = []
    for key, f in corpus["films"].items():
        rec = plots["films"].get(key)
        if rec is not None and rec.get("admitted"):
            continue
        h = harvest["films"].get(key, {})
        quiet.append({
            "key": key,
            "filmId": f.get("filmId"),
            "title": f.get("title"),
            "year": f.get("year"),
            "director": f.get("director"),
            "wikipedia": f.get("wikipedia"),
            "qid": h.get("qid"),
            "language": h.get("language") or [],
            "country": h.get("country") or [],
            "region": region_of(h),
            "enPlotChars": (rec or {}).get("plotChars", 0),
            "enWithheld": (rec or {}).get("withheld", "absent-from-plots.json"),
        })
    return corpus, harvest, plots, quiet


# ------------------------------------------------------------- stage 1 and 2

def fetch_lang_codes(lang_qids, refresh=False):
    """P424 = Wikimedia language code. Asking Wikidata which wiki a language
    lives in is the only non-guessing way to turn P364 into a wiki host."""
    codes = {}
    qids = sorted(lang_qids)
    for i in range(0, len(qids), 50):
        batch = qids[i:i + 50]
        url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
               "&props=claims|labels&languages=en&ids=" + "|".join(batch))
        d = cached(CACHE_WD, "lang_" + "|".join(batch), lambda: get(url), refresh)
        for q, e in (d.get("entities") or {}).items():
            label = ((e.get("labels") or {}).get("en") or {}).get("value")
            vals = []
            for c in (e.get("claims") or {}).get("P424", []):
                dv = (c.get("mainsnak") or {}).get("datavalue")
                if dv:
                    vals.append(dv["value"])
            codes[q] = {"label": label, "code": vals[0] if vals else LANG_OVERRIDES.get(q)}
        time.sleep(PACE)
    return codes


def fetch_sitelinks(qids, refresh=False):
    out = {}
    qids = [q for q in qids if q]
    for i in range(0, len(qids), 50):
        batch = qids[i:i + 50]
        url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
               "&props=sitelinks&ids=" + "|".join(batch))
        key = "sl_%03d_" % (i // 50) + "|".join(batch)
        fresh = not os.path.exists(cache_path(CACHE_WD, key))
        d = cached(CACHE_WD, key, lambda: get(url), refresh)
        for q, e in (d.get("entities") or {}).items():
            sl = {}
            for site, v in (e.get("sitelinks") or {}).items():
                if site.endswith("wiki") and not site.endswith(("wikiquote", "wikisource",
                                                                "wikinews", "wikivoyage",
                                                                "wikibooks", "wikiversity")):
                    if site in ("commonswiki", "specieswiki", "metawiki"):
                        continue
                    sl[site[:-4].replace("_", "-")] = v["title"]
            out[q] = sl
        if fresh:
            time.sleep(PACE)
        print("  sitelinks %d/%d" % (min(i + 50, len(qids)), len(qids)), flush=True)
    return out


# --------------------------------------------------------------- wiki choice

def native_candidates(film, lang_codes, sitelinks):
    """Ordered list of (wiki, title, why). 'Native' means, in order:
       1. a wiki for a language the film is actually IN (P364), English excluded
          — English is the language it is already quiet in;
       2. failing that, the principal language of its country of origin, for
          silent films and films whose P364 is missing or is English while the
          film is not.
    Anglophone countries map to None: there is no native article to gain."""
    sl = sitelinks.get(film["qid"] or "", {})
    seen = set()
    out = []
    for q in film["language"]:
        code = (lang_codes.get(q) or {}).get("code") or LANG_OVERRIDES.get(q)
        if not code or code == "en" or code in seen:
            continue
        seen.add(code)
        if code in sl:
            out.append({"wiki": code, "title": sl[code], "why": "P364 " + q})
    if not out:
        for c in film["country"]:
            code = COUNTRY_LANG.get(c)
            if not code or code == "en" or code in seen:
                continue
            seen.add(code)
            if code in sl:
                out.append({"wiki": code, "title": sl[code], "why": "country " + c})
    return out


# -------------------------------------------------------------- stage 3 wiki

def wikitext_batch(wiki, titles, refresh=False):
    url = ("https://%s.wikipedia.org/w/api.php?action=query&format=json&formatversion=2"
           "&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles="
           % wiki) + "|".join(urlq(t) for t in titles)
    return cached(CACHE_WT, "wt_%s_" % wiki + "|".join(titles), lambda: get(url), refresh)


def urlq(t):
    import urllib.parse
    return urllib.parse.quote(t, safe="")


def index_wikitext(d):
    by_title, alias = {}, {}
    q = (d or {}).get("query") or {}
    for n in q.get("normalized", []):
        alias[n["from"]] = n["to"]
    for r in q.get("redirects", []):
        alias[r["from"]] = r["to"]
    for p in q.get("pages", []):
        if p.get("missing"):
            by_title[p["title"]] = None
            continue
        rev = (p.get("revisions") or [{}])[0]
        by_title[p["title"]] = ((rev.get("slots") or {}).get("main") or {}).get("content")
    return by_title, alias


def resolve_alias(title, alias):
    t, guard = title, 0
    while t in alias and guard < 5:
        t = alias[t]
        guard += 1
    return t


def fetch_all_wikitext(targets, refresh=False, pace=PACE):
    """targets: list of (wiki, title). Batched 20 per call *within* a wiki."""
    by_wiki = collections.defaultdict(list)
    for wiki, title in targets:
        if title not in by_wiki[wiki]:
            by_wiki[wiki].append(title)
    text = {}
    total = sum(len(v) for v in by_wiki.values())
    done = 0
    for wiki in sorted(by_wiki, key=lambda w: -len(by_wiki[w])):
        titles = by_wiki[wiki]
        for i in range(0, len(titles), 20):
            batch = titles[i:i + 20]
            fresh = not os.path.exists(cache_path(CACHE_WT, "wt_%s_" % wiki + "|".join(batch)))
            try:
                d = wikitext_batch(wiki, batch, refresh)
            except Exception as e:
                print("  !! %s batch failed: %s" % (wiki, e), flush=True)
                if fresh:
                    time.sleep(pace * 3)
                continue
            bt, alias = index_wikitext(d)
            for t in batch:
                r = resolve_alias(t, alias)
                text[(wiki, t)] = bt.get(r, bt.get(t))
            done += len(batch)
            if fresh:
                time.sleep(pace)
        print("  wikitext %s: %d titles (%d/%d)" % (wiki, len(titles), done, total), flush=True)
    return text


# ------------------------------------------------------------------ pageviews

VIEWS_DAYS, VIEWS_LAG = 60, 3


def views_window():
    end = time.time() - VIEWS_LAG * 86400
    start = end - (VIEWS_DAYS - 1) * 86400
    f = lambda t: time.strftime("%Y%m%d", time.gmtime(t))
    return {"start": f(start), "end": f(end)}


def pageviews(title, win, pace=0.4):
    """en.wikipedia pageviews — the same fame instrument plot-source.js used, on
    the same 60-day window, reading the same cache. Fame is measured on the
    English article deliberately: swapping to native-wiki pageviews would change
    the ruler halfway through the comparison."""
    import urllib.parse
    enc = urllib.parse.quote(title.replace(" ", "_"), safe="")
    url = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia"
           "/all-access/user/" + enc + "/daily/" + win["start"] + "/" + win["end"])
    key = "pv_" + win["start"] + "_" + title
    fresh = not os.path.exists(cache_path(CACHE_VIEWS, key))
    try:
        d = cached(CACHE_VIEWS, key, lambda: get(url))
    except Exception:
        return None
    if fresh:
        time.sleep(pace)
    if not d or d.get("__missing") or not d.get("items"):
        return None
    return sum(i.get("views", 0) for i in d["items"])


# ------------------------------------------------------------------- stats

def ranks(xs):
    idx = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(idx):
        j = i
        while j + 1 < len(idx) and xs[idx[j + 1]] == xs[idx[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1
        for k in range(i, j + 1):
            r[idx[k]] = avg
        i = j + 1
    return r


def pearson(a, b):
    n = len(a)
    if n < 3:
        return float("nan")
    ma, mb = sum(a) / n, sum(b) / n
    num = da = db = 0.0
    for x, y in zip(a, b):
        dx, dy = x - ma, y - mb
        num += dx * dy
        da += dx * dx
        db += dy * dy
    return num / math.sqrt(da * db) if da and db else float("nan")


def spearman(x, y):
    return pearson(ranks(x), ranks(y))


def bootstrap_ci(x, y, iters=2000, seed=0x5eed1234):
    """Same deterministic xorshift as plot-source.js so a marginal number is
    reproducible rather than a coin flip."""
    s = seed & 0xFFFFFFFF

    def rnd():
        nonlocal s
        s ^= (s << 13) & 0xFFFFFFFF
        s ^= s >> 17
        s ^= (s << 5) & 0xFFFFFFFF
        s &= 0xFFFFFFFF
        return s / 4294967296.0

    n = len(x)
    out = []
    for _ in range(iters):
        bx, by = [], []
        for _ in range(n):
            k = int(rnd() * n)
            bx.append(x[k])
            by.append(y[k])
        r = spearman(bx, by)
        if not math.isnan(r):
            out.append(r)
    out.sort()
    if not out:
        return [float("nan"), float("nan")]
    return [out[int(len(out) * 0.025)], out[int(len(out) * 0.975)]]


def quantile(sorted_xs, q):
    if not sorted_xs:
        return float("nan")
    i = (len(sorted_xs) - 1) * q
    lo, hi = math.floor(i), math.ceil(i)
    return sorted_xs[lo] + (sorted_xs[hi] - sorted_xs[lo]) * (i - lo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="all",
                    choices=["fetch", "headings", "extract", "all"])
    ap.add_argument("--pace", type=float, default=PACE)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--refresh", action="store_true")
    opt = ap.parse_args()

    corpus, harvest, plots, quiet = load()
    if opt.limit:
        quiet = quiet[:opt.limit]
    print("quiet half: %d films (no admitted English plot)" % len(quiet))

    lang_qids = {q for f in quiet for q in f["language"]}
    print("language QIDs in the quiet half: %d" % len(lang_qids))
    lang_codes = fetch_lang_codes(lang_qids, opt.refresh)
    unmapped = sorted(q for q, v in lang_codes.items() if not v["code"])
    if unmapped:
        print("  UNMAPPED languages (no P424, no override): " +
              ", ".join("%s=%s" % (q, lang_codes[q]["label"]) for q in unmapped))

    print("sitelinks...")
    sitelinks = fetch_sitelinks([f["qid"] for f in quiet], opt.refresh)

    targets = []
    for f in quiet:
        f["candidates"] = native_candidates(f, lang_codes, sitelinks)
        for c in f["candidates"][:1]:      # one native article per film
            targets.append((c["wiki"], c["title"]))
    have = sum(1 for f in quiet if f["candidates"])
    print("native article found for %d/%d quiet films" % (have, len(quiet)))
    by_wiki = collections.Counter(f["candidates"][0]["wiki"] for f in quiet if f["candidates"])
    print("  by wiki: " + ", ".join("%s %d" % kv for kv in by_wiki.most_common(30)))

    countries_no_native = collections.Counter(
        (f["country"] or ["?"])[0] for f in quiet if not f["candidates"])
    print("  no native candidate, by country: " +
          ", ".join("%s %d" % kv for kv in countries_no_native.most_common(12)))

    if opt.stage == "fetch" or opt.stage in ("headings", "extract", "all"):
        print("wikitext (%d articles, %.1fs pace)..." % (len(targets), opt.pace))
        text = fetch_all_wikitext(targets, opt.refresh, opt.pace)
        got = sum(1 for v in text.values() if v)
        print("  fetched %d/%d articles with content" % (got, len(text)))

    state = {"quiet": quiet, "lang_codes": lang_codes, "sitelinks_n": len(sitelinks)}
    with open(os.path.join(OUT, "native-targets.json"), "w", encoding="utf-8") as fh:
        json.dump({"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "films": [{k: v for k, v in f.items()} for f in quiet],
                   "langCodes": lang_codes}, fh, ensure_ascii=False)
    print("wrote out/native-targets.json")
    return state


if __name__ == "__main__":
    main()
