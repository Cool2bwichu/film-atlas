#!/usr/bin/env python3
"""harvest-native.py — native-language Wikipedia plot (and criticism) sections
for the quiet half of the corpus.

WHY THIS FILE EXISTS
--------------------
docs/specs/source-survey-2.md measured that the 663 films with no admitted
English plot are not quiet everywhere — they are quiet *in English*. 95% of the
non-English ones have an article in their own language, and most of those carry
a plot section. Woman of Rome (1954): English plot 386 chars, withheld below the
evidence floor; the Italian `Trama` is 3,172.

WHAT IT REFUSES TO DO
---------------------
  - It does not write into static/corpus.json. Same rule as plots.json: SCORER
    INPUT ONLY. The shipped payload is already 13 MB and none of this text is
    needed at runtime.
  - It does not lower the evidence floor. A native plot is measured against the
    same 1,500 chars by the same stripper — the Python port is verified
    char-for-char against the JS by verify-stripper.py (2197/2197 identical), so
    a native plot char is the same unit as an English one.
  - It does not admit a source whose length is a fame gradient without saying
    so. GATE 1 is re-run on the native variable against the same 60-day
    en.wikipedia pageview window plot-source.js used, and the number is printed
    whether it flatters this harvest or not.

STAGES — all cached to disk, all resumable, paced at ~1 req/s
  1 sitelinks  Wikidata wbgetentities, 50 QIDs/call
  2 langcodes  P424 for every P364 language QID occurring in the quiet half
  3 wikitext   per-wiki action API, 20 titles/call
  4 extract    plot / overview / criticism via native-headings.json
  5 control    the same harvest on a corpus-wide random sample, so the native
               fame shape can be measured without the quiet half's selection
  6 measure    floor crossings, fame shape, coverage by region and by wiki

  python3 harvest-native.py                 # everything
  python3 harvest-native.py --stage fetch   # network only
  python3 harvest-native.py --no-control    # skip stage 5 (the fame control)

The heading map lives in native-headings.json and is built by native-headings.py,
which prints the per-wiki evidence table that map is defended with.
"""
import argparse
import collections
import hashlib
import json
import math
import os
import re
import statistics
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from native_wiki import (cache_path, cached, get, list_ratio, norm_heading,
                         parse_sections, strip_wikitext)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
OUT = os.path.join(HERE, "out")
CACHE_WD = os.path.join(HERE, ".cache-native-wd")
CACHE_WT = os.path.join(HERE, ".cache-native-wt")
CACHE_EN = os.path.join(HERE, ".cache-plots")     # written by plot-source.js
CACHE_VIEWS = os.path.join(HERE, ".cache-views")  # shared with plot-source.js
CACHE_NVIEWS = os.path.join(HERE, ".cache-native-views")
HEADING_MAP = os.path.join(HERE, "native-headings.json")
OUT_FILE = os.path.join(OUT, "native-plots.json")
REPORT_FILE = os.path.join(OUT, "native-plots.report.json")

PLOT_FLOOR_CHARS = 1500          # identical to plot-source.js
PACE = 1.1                       # Wikimedia rate-limits above ~1 req/s
CONTROL_N = 420                  # corpus-wide random sample for the fame shape
GATE1_MAX_RHO = 0.45             # plot-source.js threshold, unchanged

# Language QIDs with no P424 on Wikidata that nonetheless have an obvious wiki.
# Every entry was printed as "UNMAPPED" by a real run of this script against
# this corpus — none is speculative.
LANG_OVERRIDES = {
    "Q9192": "zh", "Q727694": "zh", "Q7850": "zh", "Q7033959": "zh",
    "Q36236": "zh", "Q56475": "zh", "Q36778": "zh",
}

# Principal language of a country, for silent films and films whose P364 is
# missing. Built from the country QIDs that actually occur in the quiet half.
# Anglophone countries map to None: there is no native article to gain.
COUNTRY_LANG = {
    "Q30": None, "Q16": None, "Q145": None, "Q408": None, "Q664": None, "Q27": None,
    "Q38": "it", "Q142": "fr", "Q183": "de", "Q40": "de", "Q39": "de",
    "Q34": "sv", "Q35": "da", "Q20": "no", "Q33": "fi", "Q189": "is",
    "Q29": "es", "Q96": "es", "Q414": "es", "Q298": "es", "Q717": "es", "Q736": "es",
    "Q77": "es", "Q419": "es", "Q739": "es", "Q750": "es", "Q733": "es",
    "Q45": "pt", "Q155": "pt", "Q31": "nl", "Q55": "nl",
    "Q36": "pl", "Q213": "cs", "Q33946": "cs", "Q214": "sk", "Q28": "hu",
    "Q218": "ro", "Q219": "bg", "Q403": "sr", "Q83286": "sr", "Q224": "hr",
    "Q159": "ru", "Q15180": "ru", "Q212": "uk", "Q211": "lv", "Q37": "lt", "Q191": "et",
    "Q41": "el", "Q43": "tr", "Q794": "fa", "Q801": "he", "Q79": "ar", "Q262": "ar",
    "Q17": "ja", "Q884": "ko", "Q148": "zh", "Q865": "zh", "Q8646": "zh",
    "Q668": "hi", "Q843": "ur", "Q902": "bn", "Q881": "vi", "Q869": "th",
    "Q252": "id", "Q928": "tl", "Q1049": "ar", "Q1025": "ar", "Q1032": "fr",
    "Q1008": "fr", "Q1027": "fr", "Q790": "fr", "Q962": "fr", "Q1041": "fr",
    "Q1039": "pt", "Q1029": "pt", "Q265": "uz", "Q232": "kk", "Q863": "tg",
    "Q222": "sq", "Q221": "mk", "Q225": "bs", "Q215": "sl", "Q347": "de", "Q235": "fr",
}

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


def hash_key(s):
    return hashlib.sha1(("native-wiki:" + s).encode("utf-8")).hexdigest()


# ------------------------------------------------------------------ corpus

def load():
    corpus = json.load(open(os.path.join(ROOT, "static", "corpus.json"), encoding="utf-8"))
    harvest = json.load(open(os.path.join(OUT, "harvest.json"), encoding="utf-8"))
    plots = json.load(open(os.path.join(OUT, "plots.json"), encoding="utf-8"))
    films = []
    for key, f in corpus["films"].items():
        rec = plots["films"].get(key) or {}
        h = harvest["films"].get(key, {})
        films.append({
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
            "enPlotChars": rec.get("plotChars", 0),
            "enAdmitted": bool(rec.get("admitted")),
            "enWithheld": rec.get("withheld", "absent-from-plots.json"),
            "h": hash_key(key),
        })
    quiet = [f for f in films if not f["enAdmitted"]]
    return corpus, harvest, plots, films, quiet


# ------------------------------------------------------------- wikidata

def fetch_lang_codes(lang_qids, refresh=False):
    """P424 = Wikimedia language code. Asking Wikidata which wiki a language
    lives in is the only non-guessing way to turn P364 into a host."""
    codes = {}
    qids = sorted(lang_qids)
    for i in range(0, len(qids), 50):
        batch = qids[i:i + 50]
        url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
               "&props=claims|labels&languages=en&ids=" + "|".join(batch))
        key = "lang_" + "|".join(batch)
        fresh = not os.path.exists(cache_path(CACHE_WD, key))
        d = cached(CACHE_WD, key, lambda: get(url), refresh)
        for q, e in (d.get("entities") or {}).items():
            label = ((e.get("labels") or {}).get("en") or {}).get("value")
            vals = [c["mainsnak"]["datavalue"]["value"]
                    for c in (e.get("claims") or {}).get("P424", [])
                    if (c.get("mainsnak") or {}).get("datavalue")]
            codes[q] = {"label": label, "code": vals[0] if vals else LANG_OVERRIDES.get(q)}
        if fresh:
            time.sleep(PACE)
    return codes


def fetch_sitelinks(qids, refresh=False, quietly=False):
    out = {}
    qids = sorted({q for q in qids if q})
    for i in range(0, len(qids), 50):
        batch = qids[i:i + 50]
        url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
               "&props=sitelinks&ids=" + "|".join(batch))
        key = "sl_" + "|".join(batch)
        fresh = not os.path.exists(cache_path(CACHE_WD, key))
        d = cached(CACHE_WD, key, lambda: get(url), refresh)
        for q, e in (d.get("entities") or {}).items():
            sl = {}
            for site, v in (e.get("sitelinks") or {}).items():
                if not site.endswith("wiki"):
                    continue
                if site in ("commonswiki", "specieswiki", "metawiki"):
                    continue
                sl[site[:-4].replace("_", "-")] = v["title"]
            out[q] = sl
        if fresh:
            time.sleep(PACE)
        if not quietly:
            print("  sitelinks %d/%d" % (min(i + 50, len(qids)), len(qids)), flush=True)
    return out


def native_candidates(film, lang_codes, sitelinks):
    """'Native' means, in order:
       1. a wiki for a language the film is actually IN (P364), English excluded
          — English is the language it is already quiet in;
       2. failing that, the principal language of the country of origin, which
          is what silent films and films with no stated language have.
    Anglophone countries yield nothing: there is no native article to gain."""
    sl = sitelinks.get(film["qid"] or "", {})
    seen, out = set(), []
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


# ------------------------------------------------------------ wiki fetch

def wikitext_batch(wiki, titles, refresh=False):
    url = ("https://%s.wikipedia.org/w/api.php?action=query&format=json&formatversion=2"
           "&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=" % wiki
           ) + "|".join(urllib.parse.quote(t, safe="") for t in titles)
    return cached(CACHE_WT, "wt_%s_" % wiki + "|".join(titles), lambda: get(url), refresh)


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


def fetch_all_wikitext(targets, refresh=False, pace=PACE, label=""):
    """targets: iterable of (wiki, title), batched 20 per call within a wiki."""
    by_wiki = collections.OrderedDict()
    for wiki, title in targets:
        by_wiki.setdefault(wiki, [])
        if title not in by_wiki[wiki]:
            by_wiki[wiki].append(title)
    text, done = {}, 0
    total = sum(len(v) for v in by_wiki.values())
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
                text[(wiki, t)] = bt.get(resolve_alias(t, alias), bt.get(t))
            done += len(batch)
            if fresh:
                time.sleep(pace)
        print("  %swikitext %-6s %3d titles  (%d/%d)" % (label, wiki, len(titles), done, total),
              flush=True)
    return text


def english_wikitext_index():
    """The English plot text for combined-evidence films, read from the cache
    plot-source.js already filled. No network: plots.json nulls the text of a
    withheld film, but the wikitext it was extracted from is still on disk."""
    by_title = {}
    if not os.path.isdir(CACHE_EN):
        return by_title
    for name in os.listdir(CACHE_EN):
        if not name.startswith("wt_"):
            continue
        try:
            d = json.load(open(os.path.join(CACHE_EN, name), encoding="utf-8"))
        except Exception:
            continue
        bt, alias = index_wikitext(d)
        for t, c in bt.items():
            if c:
                by_title[t] = c
        for a, b in alias.items():
            if b in by_title:
                by_title[a] = by_title[b]
    return by_title


EN_PLOT_HEADINGS = {"plot", "plot summary", "plot synopsis", "synopsis", "story",
                    "storyline", "summary", "narrative", "premise", "plot outline",
                    "the plot"}


def english_plot(wikitext):
    if not wikitext:
        return None
    secs = [s for s in parse_sections(wikitext) if s["level"] == 2]
    best = None
    for s in secs:
        if norm_heading(s["title"]) in EN_PLOT_HEADINGS:
            best = s
            break
    if best is None:
        for s in secs:
            n = norm_heading(s["title"])
            if re.match(r"^plot\b", n) or re.match(r"^synopsis\b", n):
                best = s
                break
    if best is None:
        return None
    t = strip_wikitext(best["body"])
    return t or None


# ------------------------------------------------------------- extraction

def load_heading_map():
    """Merges the verified block with the *Unverified one. The split is kept in
    the file so 'this term was checked against real articles' and 'this term is
    carried for a wiki we have never fetched' cannot be confused; merging here
    means a rerun over a wider corpus still extracts, and `usedUnverified` in
    the report says whether any of it mattered."""
    m = json.load(open(HEADING_MAP, encoding="utf-8"))
    unverified = set()
    for cls in ("plot", "overview", "criticismStems"):
        for wiki, terms in (m.get(cls + "Unverified") or {}).items():
            m.setdefault(cls, {}).setdefault(wiki, [])
            for t in terms:
                if t not in m[cls][wiki]:
                    m[cls][wiki].append(t)
                unverified.add((cls, wiki, t.casefold()))
    m["__unverified"] = unverified
    return m


def classify(wiki, heading_norm, hmap):
    """plot / overview / criticism / None for one normalised heading.

    Plot and overview match exact-or-prefix: 'trama' and 'trama del film' are
    the same section, but substring matching on a stem that short would swallow
    'episodi e trame'. Criticism matches by stem substring because those
    headings genuinely compound in the wild ('accoglienza critica', 'kritik und
    auszeichnungen', 'recepción y críticas')."""
    for cls in ("plot", "overview"):
        for term in hmap.get(cls, {}).get(wiki, []):
            t = term.casefold()
            if heading_norm == t or heading_norm.startswith(t + " ") or \
               (not t.isascii() and heading_norm.startswith(t)):
                return cls, t
    for stem in hmap.get("criticismStems", {}).get(wiki, []):
        if stem.casefold() in heading_norm:
            return "criticism", stem.casefold()
    return None, None


def extract_native(wiki, wikitext, hmap):
    """Returns plot (first match), overview (first), criticism (all, joined),
    plus the section inventory for the audit."""
    secs = [s for s in parse_sections(wikitext) if s["level"] == 2]
    lead = ""
    for s in parse_sections(wikitext):
        if s["level"] == 0:
            lead = strip_wikitext(s["body"])
            break
    found = {"plot": None, "overview": None}
    crit = []
    inventory = []
    for s in secs:
        n = norm_heading(s["title"])
        if not n:
            continue
        cls, term = classify(wiki, n, hmap)
        body = strip_wikitext(s["body"])
        inventory.append({"heading": n, "class": cls, "term": term, "chars": len(body),
                          "list": round(list_ratio(s["body"]), 2)})
        if cls in ("plot", "overview") and found[cls] is None and body:
            found[cls] = {"heading": s["title"], "text": body}
        elif cls == "criticism" and body:
            crit.append({"heading": s["title"], "text": body})
    return {
        "plot": found["plot"],
        "overview": found["overview"],
        "criticism": crit,
        "sections": inventory,
        "sectionCount": len(secs),
        "leadChars": len(lead),
    }


# ------------------------------------------------------------- pageviews

VIEWS_DAYS, VIEWS_LAG = 60, 3


def views_window():
    end = time.time() - VIEWS_LAG * 86400
    start = end - (VIEWS_DAYS - 1) * 86400
    fmt = lambda t: time.strftime("%Y%m%d", time.gmtime(t))
    return {"start": fmt(start), "end": fmt(end)}


def pageviews_wiki(wiki, title, win, pace=0.3):
    """Pageviews on the film's OWN wiki. Without this the native measurement has
    a hole in it: native plot length is flat against *English* pageviews, but
    that could simply mean Italian editors do not track anglophone fame while
    tracking Italian fame perfectly. This asks the question in the language the
    text was written in."""
    enc = urllib.parse.quote(title.replace(" ", "_"), safe="")
    url = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/%s.wikipedia"
           "/all-access/user/%s/daily/%s/%s" % (wiki, enc, win["start"], win["end"]))
    key = "nv_%s_%s_%s" % (wiki, win["start"], title)
    fresh = not os.path.exists(cache_path(CACHE_NVIEWS, key))
    try:
        d = cached(CACHE_NVIEWS, key, lambda: get(url))
    except Exception:
        return None
    if fresh:
        time.sleep(pace)
    if not d or d.get("__missing") or not d.get("items"):
        return None
    return sum(i.get("views", 0) for i in d["items"])


def pageviews(title, win, pace=0.35):
    """The same fame instrument on the same window plot-source.js used, reading
    the same cache. Fame is measured on the ENGLISH article deliberately:
    swapping to native-wiki pageviews mid-comparison would change the ruler."""
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


# ----------------------------------------------------------------- stats

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
    """The same deterministic xorshift as plot-source.js, so a marginal number
    is reproducible rather than a coin flip that landed well on the day."""
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


def rho_block(pairs, label):
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    if len(xs) < 20:
        return {"label": label, "n": len(xs), "rho": None, "ci95": [None, None]}
    r = spearman(xs, ys)
    ci = bootstrap_ci(xs, ys)
    under = bool(not math.isnan(r) and r <= GATE1_MAX_RHO)
    # 'marginal' is plot-source.js's word for a point estimate under the
    # threshold whose confidence interval still reaches over it. A marginal
    # result is not a pass there and is not treated as one here.
    marginal = bool(under and not math.isnan(ci[1]) and ci[1] > GATE1_MAX_RHO)
    return {"label": label, "n": len(xs),
            "rho": None if math.isnan(r) else round(r, 4),
            "ci95": [None if math.isnan(v) else round(v, 4) for v in ci],
            "underGate": under, "marginal": marginal, "pass": bool(under and not marginal)}


def quantile(xs, q):
    if not xs:
        return float("nan")
    s = sorted(xs)
    i = (len(s) - 1) * q
    lo, hi = math.floor(i), math.ceil(i)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def stratified(films, n):
    """Era x region strata, deterministic hash order — the same construction
    plot-source.js used, so the control sample is reproducible."""
    def era(y):
        if not y:
            return "unknown"
        return ("pre1940" if y < 1940 else "1940s50s" if y < 1960 else
                "1960s70s" if y < 1980 else "1980s90s" if y < 2000 else
                "2000s10s" if y < 2020 else "2020s")
    cells = collections.defaultdict(list)
    for f in films:
        cells[era(f["year"]) + "|" + f["region"]].append(f)
    for v in cells.values():
        v.sort(key=lambda f: f["h"])
    total = len(films)
    keys = sorted(cells)
    take = {k: min(len(cells[k]), max(2, round(len(cells[k]) / total * n))) for k in keys}
    out = []
    for k in keys:
        out.extend(cells[k][:take[k]])
    return out


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="all", choices=["fetch", "extract", "all"])
    ap.add_argument("--pace", type=float, default=PACE)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--no-control", action="store_true")
    opt = ap.parse_args()

    corpus, harvest, plots, films, quiet = load()
    if opt.limit:
        quiet = quiet[:opt.limit]
    print("corpus %d films; quiet half %d (no admitted English plot)" % (len(films), len(quiet)))

    # ---- stages 1-2: language codes and sitelinks ----
    lang_qids = {q for f in quiet for q in f["language"]}
    lang_codes = fetch_lang_codes(lang_qids, opt.refresh)
    unmapped = sorted(q for q, v in lang_codes.items() if not v["code"])
    if unmapped:
        print("  UNMAPPED language QIDs (no P424, no override): " +
              ", ".join("%s=%s" % (q, lang_codes[q]["label"]) for q in unmapped))

    # ---- control sample, drawn BEFORE anything is fetched ----
    control = [] if opt.no_control else [f for f in stratified(films, CONTROL_N)]
    control_only = [f for f in control if f["enAdmitted"]]

    print("sitelinks for %d quiet + %d control films..."
          % (len(quiet), len(control_only)))
    sitelinks = fetch_sitelinks([f["qid"] for f in quiet] + [f["qid"] for f in control_only],
                                opt.refresh)

    for f in quiet + control_only:
        f["candidates"] = native_candidates(f, lang_codes, sitelinks)

    have = [f for f in quiet if f["candidates"]]
    print("native article: %d/%d quiet films (%.1f%%)"
          % (len(have), len(quiet), 100.0 * len(have) / len(quiet)))
    nonen = [f for f in quiet if any((lang_codes.get(q) or {}).get("code") not in (None, "en")
                                     for q in f["language"])]
    nonen_have = [f for f in nonen if f["candidates"]]
    print("  of the %d non-English-language quiet films: %d have one (%.1f%%)"
          % (len(nonen), len(nonen_have), 100.0 * len(nonen_have) / max(1, len(nonen))))
    by_wiki = collections.Counter(f["candidates"][0]["wiki"] for f in have)
    print("  by wiki: " + ", ".join("%s %d" % kv for kv in by_wiki.most_common(40)))

    # ---- stage 3: wikitext ----
    targets = [(f["candidates"][0]["wiki"], f["candidates"][0]["title"]) for f in have]
    ctargets = [(f["candidates"][0]["wiki"], f["candidates"][0]["title"])
                for f in control_only if f["candidates"]]
    print("wikitext: %d quiet + %d control articles at %.1fs pace"
          % (len(targets), len(ctargets), opt.pace))
    text = fetch_all_wikitext(targets, opt.refresh, opt.pace)
    if ctargets:
        text.update(fetch_all_wikitext(ctargets, opt.refresh, opt.pace, label="control "))
    print("  %d/%d articles returned content" % (sum(1 for v in text.values() if v), len(text)))

    if opt.stage == "fetch":
        return

    # ---- stage 4: extraction ----
    hmap = load_heading_map()
    en_index = english_wikitext_index()
    print("English wikitext cache: %d titles (for combined evidence)" % len(en_index))

    def enrich(f):
        f["native"] = None
        if not f.get("candidates"):
            return
        wiki, title = f["candidates"][0]["wiki"], f["candidates"][0]["title"]
        wt = text.get((wiki, title))
        if not wt:
            return
        ex = extract_native(wiki, wt, hmap)
        f["native"] = dict(ex, wiki=wiki, wikiTitle=title, why=f["candidates"][0]["why"])

    for f in quiet + control_only:
        enrich(f)

    for f in quiet:
        wt = en_index.get(f["wikipedia"])
        f["enPlotText"] = english_plot(wt)

    # ---- stage 5: pageviews ----
    win = views_window()
    print("pageviews window %s -> %s" % (win["start"], win["end"]))
    todo = quiet + control_only
    for i, f in enumerate(todo):
        f["views"] = pageviews(f["wikipedia"], win) if f["wikipedia"] else None
        if (i + 1) % 200 == 0 or i + 1 == len(todo):
            print("  en pageviews %d/%d" % (i + 1, len(todo)), flush=True)
    native_pv = [f for f in todo if f.get("native")]
    for i, f in enumerate(native_pv):
        f["nativeViews"] = pageviews_wiki(f["native"]["wiki"], f["native"]["wikiTitle"], win)
        if (i + 1) % 200 == 0 or i + 1 == len(native_pv):
            print("  native-wiki pageviews %d/%d" % (i + 1, len(native_pv)), flush=True)

    # ---- stage 6: measurement ----
    report = measure(quiet, control, plots, hmap, win, opt)

    # ---- write ----
    write_outputs(quiet, report, win, hmap)


def measure(quiet, control, plots, hmap, win, opt):
    R = {}
    n_quiet = len(quiet)
    with_article = [f for f in quiet if f.get("native")]
    with_plot = [f for f in with_article if f["native"]["plot"]]
    for f in quiet:
        nat = f.get("native")
        f["nativeChars"] = len(nat["plot"]["text"]) if nat and nat["plot"] else 0
        f["overviewChars"] = len(nat["overview"]["text"]) if nat and nat["overview"] else 0
        f["critChars"] = sum(len(c["text"]) for c in nat["criticism"]) if nat else 0
        f["enChars"] = len(f["enPlotText"] or "")
        f["combinedChars"] = f["enChars"] + f["nativeChars"]

    native_ok = [f for f in quiet if f["nativeChars"] >= PLOT_FLOOR_CHARS]
    combined_ok = [f for f in quiet if f["nativeChars"] < PLOT_FLOOR_CHARS
                   and f["combinedChars"] >= PLOT_FLOOR_CHARS and f["nativeChars"] > 0]
    partial = [f for f in quiet if f["nativeChars"] > 0
               and f not in native_ok and f not in combined_ok]
    plus_overview = [f for f in quiet if f["nativeChars"] < PLOT_FLOOR_CHARS
                     and f["nativeChars"] + f["overviewChars"] >= PLOT_FLOOR_CHARS]

    R["quiet"] = {
        "films": n_quiet,
        "withNativeArticle": len(with_article),
        "withNativePlotSection": len(with_plot),
        "withNativeCriticism": sum(1 for f in with_article if f["critChars"] > 0),
        "clearFloorOnNativeAlone": len(native_ok),
        "clearFloorOnCombined": len(combined_ok),
        "clearFloorEitherWay": len(native_ok) + len(combined_ok),
        "belowFloorWithSomeNative": len(partial),
        "stillQuiet": n_quiet - len(native_ok) - len(combined_ok) - len(partial),
        "overviewSensitivity": len(plus_overview),
    }

    chars = sorted(f["nativeChars"] for f in with_plot)
    R["nativePlotChars"] = {
        "n": len(chars),
        "p10": int(quantile(chars, 0.10)), "median": int(quantile(chars, 0.5)),
        "p75": int(quantile(chars, 0.75)), "p90": int(quantile(chars, 0.90)),
        "max": chars[-1] if chars else 0,
    }

    # ---- fame shape ----
    qv = [f for f in quiet if f.get("views") is not None and f.get("native")]
    R["fame"] = {
        "instrument": "Spearman rho vs 60-day en.wikipedia pageviews, %s-%s; "
                      "deterministic bootstrap CI, same code as plot-source.js"
                      % (win["start"], win["end"]),
        "referenceEnglishWholeCorpus": plots["gate1"]["literal"],
        "referenceEnglishOperative": plots["gate1"]["operative"],
        "nativeOnQuiet": rho_block([(f["nativeChars"], f["views"]) for f in qv],
                                   "native plot chars vs views, quiet films with a native article"),
        "englishOnQuiet": rho_block([(f["enChars"], f["views"]) for f in qv],
                                    "English plot chars vs views, same films "
                                    "(ATTENUATED BY CONSTRUCTION: the quiet half is selected "
                                    "on this very variable being under 1,500)"),
    }
    # ---- the control sample: drawn from the WHOLE corpus with no regard to
    # admission, so neither variable is truncated. Quiet members of the sample
    # are the same dict objects already enriched above; admitted members were
    # fetched alongside. English length is read from plots.json plotChars for
    # every film, admitted or withheld, so one ruler measures both groups.
    for f in control:
        nat = f.get("native")
        f["nativeChars"] = len(nat["plot"]["text"]) if nat and nat["plot"] else 0
    cv = [f for f in control if f.get("views") is not None]
    # Films with NO native article carry no information about the native
    # variable and are dropped — the same rule plot-source.js applies to films
    # with no English article. An article with no plot section stays in at 0.
    cvn = [f for f in cv if f.get("native")]
    if len(cvn) >= 20:
        R["control"] = {
            "sampled": len(control),
            "quietMembers": sum(1 for f in control if not f["enAdmitted"]),
            "admittedMembers": sum(1 for f in control if f["enAdmitted"]),
            "withNativeArticle": sum(1 for f in control if f.get("native")),
            "withNativePlot": sum(1 for f in control if f.get("native") and f["native"]["plot"]),
        }
        R["fame"]["englishOnControlAll"] = rho_block(
            [(f["enPlotChars"], f["views"]) for f in cv],
            "SANITY CHECK — English plot chars vs views over the whole control "
            "sample (%d films). Should reproduce the corpus-wide 0.64; if it does "
            "not, the sample is not representative and nothing below means anything."
            % len(cv))
        R["fame"]["nativeOnControl"] = rho_block(
            [(f["nativeChars"], f["views"]) for f in cvn],
            "native plot chars vs views, control films that have a native article "
            "(%d films, no selection on either plot length)" % len(cvn))
        # THE DECIDING CONTROL. Native articles exist mostly for non-English
        # films, so a flat native rho could be an artifact of having dropped the
        # anglophone canon rather than a property of the source. This measures
        # ENGLISH plot length against the same fame instrument on exactly the
        # same films. If English stays steep here, the flatness belongs to the
        # source; if English goes flat here too, it belongs to the sample.
        R["fame"]["englishOnSameControlFilms"] = rho_block(
            [(f["enPlotChars"], f["views"]) for f in cvn],
            "English plot chars vs views, THE SAME %d films" % len(cvn))
        # Same question asked in the film's own language: does the native plot
        # length track fame on the wiki that wrote it?
        cvv = [f for f in cvn if f.get("nativeViews") is not None]
        R["fame"]["nativeVsNativeWikiViews"] = rho_block(
            [(f["nativeChars"], f["nativeViews"]) for f in cvv],
            "native plot chars vs 60-day pageviews ON THE FILM'S OWN WIKI "
            "(%d control films) — the check that native flatness is not just "
            "'these editors ignore anglophone fame'" % len(cvv))
        R["fame"]["englishVsNativeWikiViews"] = rho_block(
            [(f["enPlotChars"], f["nativeViews"]) for f in cvv],
            "English plot chars vs the film's own-wiki pageviews, same %d films "
            "(fame travels: the two audiences are not independent)" % len(cvv))
        R["fame"]["nativeVsEnglishLength"] = rho_block(
            [(f["nativeChars"], f["enPlotChars"]) for f in cvn],
            "native plot chars vs English plot chars (agreement between the two "
            "rulers, not a fame measure)")

        # GATE 1 verdict on the native variable, using plot-source.js's exact
        # arithmetic (threshold 0.45, 'marginal' = CI reaches over it, floored
        # = the source as the scorer would actually receive it). Two instruments,
        # because the answer differs between them and reporting only the
        # flattering one would be the lie this project keeps refusing to tell.
        floored = [f for f in cvn if f["nativeChars"] >= PLOT_FLOOR_CHARS]
        R["gate1Native"] = {
            "threshold": GATE1_MAX_RHO,
            "englishPageviews": {
                "literal": rho_block([(f["nativeChars"], f["views"]) for f in cvn],
                                     "unfloored"),
                "operative": rho_block([(f["nativeChars"], f["views"]) for f in floored],
                                       "floored at %d chars" % PLOT_FLOOR_CHARS),
            },
            "ownWikiPageviews": {
                "literal": rho_block([(f["nativeChars"], f["nativeViews"]) for f in cvv],
                                     "unfloored"),
                "operative": rho_block(
                    [(f["nativeChars"], f["nativeViews"]) for f in cvv
                     if f["nativeChars"] >= PLOT_FLOOR_CHARS],
                    "floored at %d chars" % PLOT_FLOOR_CHARS),
            },
        }

    # ---- coverage by region and by wiki ----
    def table(keyfn, rows):
        t = {}
        for f in rows:
            k = keyfn(f)
            e = t.setdefault(k, {"films": 0, "article": 0, "plot": 0, "criticism": 0,
                                 "clearsFloor": 0, "combined": 0, "chars": []})
            e["films"] += 1
            if f.get("native"):
                e["article"] += 1
                if f["native"]["plot"]:
                    e["plot"] += 1
                    e["chars"].append(f["nativeChars"])
                if f["critChars"]:
                    e["criticism"] += 1
            if f["nativeChars"] >= PLOT_FLOOR_CHARS:
                e["clearsFloor"] += 1
            elif f["nativeChars"] and f["combinedChars"] >= PLOT_FLOOR_CHARS:
                e["combined"] += 1
        for e in t.values():
            cs = sorted(e.pop("chars"))
            e["medianPlotChars"] = int(quantile(cs, 0.5)) if cs else 0
        return dict(sorted(t.items(), key=lambda kv: -kv[1]["films"]))

    R["byRegion"] = table(lambda f: f["region"], quiet)
    R["byWiki"] = table(lambda f: f["native"]["wiki"] if f.get("native") else "(none)", quiet)
    R["byEnWithheld"] = table(lambda f: f["enWithheld"], quiet)

    # ---- heading map audit ----
    seen = collections.Counter()
    for f in quiet + control:
        nat = f.get("native")
        if not nat:
            continue
        for s in nat["sections"]:
            if s["class"]:
                seen[(nat["wiki"], s["class"], s["heading"])] += 1
    used = collections.Counter()
    for (wiki, cls, h), n in seen.items():
        used[(wiki, cls)] += n
    dead = []
    for cls in ("plot", "overview"):
        for wiki, terms in hmap.get(cls, {}).items():
            for t in terms:
                hits = sum(n for (w, c, h), n in seen.items()
                           if w == wiki and c == cls and h.startswith(t.casefold()))
                if hits == 0:
                    dead.append("%s/%s/%s" % (wiki, cls, t))
    misses = []
    for f in quiet:
        nat = f.get("native")
        if not nat or nat["plot"]:
            continue
        big = [s for s in nat["sections"]
               if s["class"] is None and s["chars"] >= 600 and s["list"] < 0.35]
        if big:
            misses.append({"title": f["title"], "wiki": nat["wiki"],
                           "headings": [s["heading"] for s in sorted(
                               big, key=lambda s: -s["chars"])[:4]]})
    used_unverified = collections.Counter()
    for f in quiet + control:
        nat = f.get("native")
        if not nat:
            continue
        for s in nat["sections"]:
            if s.get("term") and (s["class"], nat["wiki"], s["term"]) in hmap["__unverified"]:
                used_unverified["%s/%s/%s" % (nat["wiki"], s["class"], s["term"])] += 1
    R["headingAudit"] = {
        "termsNeverObserved": sorted(dead),
        "usedUnverifiedTerms": dict(used_unverified),
        "articlesWithNoPlotHeadingButLongProse": len(misses),
        "residualExamples": misses[:25],
    }

    # Concrete gainers, so the numbers can be checked against real articles.
    gain = sorted([f for f in quiet if f["nativeChars"] >= PLOT_FLOOR_CHARS],
                  key=lambda f: -(f["nativeChars"] - f["enChars"]))
    R["examples"] = [{
        "title": f["title"], "year": f["year"], "wiki": f["native"]["wiki"],
        "wikiTitle": f["native"]["wikiTitle"],
        "heading": f["native"]["plot"]["heading"],
        "enPlotChars": f["enChars"], "nativePlotChars": f["nativeChars"],
        "enWithheld": f["enWithheld"],
        "opening": f["native"]["plot"]["text"][:160].replace("\n", " "),
    } for f in gain[:20]]
    return R


def write_outputs(quiet, report, win, hmap):
    os.makedirs(OUT, exist_ok=True)
    out = {
        "version": 1,
        "note": "SCORER INPUT ONLY. Native-language Wikipedia plot / overview / "
                "criticism sections for the films with no admitted English plot. "
                "This file must never be merged into static/corpus.json — the shipped "
                "payload is already 13 MB and none of this text is needed at runtime.",
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "<lang>.wikipedia section text (action API, prop=revisions, rvslots=main), "
                  "sitelinks from Wikidata wbgetentities. CC BY-SA, same licence as the "
                  "English plot harvest.",
        "window": win,
        "floor": PLOT_FLOOR_CHARS,
        "headingMap": "native-headings.json",
        "tiers": {
            "native": "native plot section alone clears the 1,500-char floor",
            "combined": "English plot (below floor, text carried here) + native plot clears it",
            "partial": "native plot present but the two together stay under the floor — "
                       "text is withheld, chars recorded, exactly as plot-source.js does",
        },
        "coverage": report["quiet"],
        "films": {},
    }
    for f in quiet:
        nat = f.get("native")
        tier = ("native" if f["nativeChars"] >= PLOT_FLOOR_CHARS else
                "combined" if f["nativeChars"] and f["combinedChars"] >= PLOT_FLOOR_CHARS else
                "partial" if f["nativeChars"] else
                "no-plot-section" if nat else "no-native-article")
        admitted = tier in ("native", "combined")
        rec = {
            "filmId": f["filmId"], "title": f["title"], "year": f["year"],
            "region": f["region"],
            "wiki": nat["wiki"] if nat else None,
            "wikiTitle": nat["wikiTitle"] if nat else None,
            "wikiWhy": nat["why"] if nat else None,
            "nativePlotHeading": nat["plot"]["heading"] if nat and nat["plot"] else None,
            "nativePlotChars": f["nativeChars"],
            "overviewHeading": nat["overview"]["heading"] if nat and nat["overview"] else None,
            "overviewChars": f["overviewChars"],
            "criticismChars": f["critChars"],
            "enPlotChars": f["enChars"],
            "enWithheld": f["enWithheld"],
            "combinedChars": f["combinedChars"],
            "tier": tier,
            "admitted": admitted,
            # GATE 4 (null honesty), same as plot-source.js: text below the floor
            # is not written at all, so the scorer cannot read two sentences and
            # call them evidence. The char count survives so the refusal is
            # auditable and the tail is countable.
            "nativePlot": nat["plot"]["text"] if admitted and nat and nat["plot"] else None,
            "enPlot": f["enPlotText"] if tier == "combined" else None,
            # Criticism is never gated by the plot floor — it is a different
            # register answering a different question, and it is labelled as such.
            "criticism": [{"heading": c["heading"], "text": c["text"]}
                          for c in (nat["criticism"] if nat else [])] or None,
            "overview": (nat["overview"]["text"] if nat and nat["overview"]
                         and nat["overview"]["text"] and f["overviewChars"] >= 400 else None),
        }
        out["films"][f["key"]] = rec
    with open(OUT_FILE, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False)
    print("\nwrote %s (%.2f MB)" % (os.path.relpath(OUT_FILE, ROOT),
                                    os.path.getsize(OUT_FILE) / 1048576.0))

    with open(REPORT_FILE, "w", encoding="utf-8") as fh:
        json.dump({"generated": out["generated"], "window": win,
                   "floor": PLOT_FLOOR_CHARS, "report": report}, fh,
                  ensure_ascii=False, indent=1)
    print("wrote %s" % os.path.relpath(REPORT_FILE, ROOT))
    print_report(report)


def print_report(R):
    q = R["quiet"]
    print("\n=== what the native harvest bought the quiet half ===")
    print("quiet films                       %d" % q["films"])
    print("  with a native-language article  %d  (%.1f%%)"
          % (q["withNativeArticle"], 100.0 * q["withNativeArticle"] / q["films"]))
    print("  with a native PLOT section      %d  (%.1f%%)"
          % (q["withNativePlotSection"], 100.0 * q["withNativePlotSection"] / q["films"]))
    print("  with native criticism prose     %d  (%.1f%%)"
          % (q["withNativeCriticism"], 100.0 * q["withNativeCriticism"] / q["films"]))
    print("clear the 1,500-char floor")
    print("  on the native plot alone        %d" % q["clearFloorOnNativeAlone"])
    print("  on English + native combined    %d" % q["clearFloorOnCombined"])
    print("  either way                      %d  (%.1f%% of the quiet half)"
          % (q["clearFloorEitherWay"], 100.0 * q["clearFloorEitherWay"] / q["films"]))
    print("  native text present but short   %d  (withheld, chars recorded)"
          % q["belowFloorWithSomeNative"])
    print("  no native plot text at all      %d" % q["stillQuiet"])
    print("  [sensitivity] +overview would add %d more" % q["overviewSensitivity"])

    c = R["nativePlotChars"]
    print("\nnative plot chars  p10 %d  median %d  p75 %d  p90 %d  max %d  (n=%d)"
          % (c["p10"], c["median"], c["p75"], c["p90"], c["max"], c["n"]))

    print("\n=== fame shape (AGENTS rule 1) ===")
    f = R["fame"]
    ref = f["referenceEnglishWholeCorpus"]
    print("English plot chars, whole corpus     rho %.4f  ci %s  n=%d   [plots.json]"
          % (ref["rho"], ref["ci95"], ref["n"]))
    for k in ("englishOnControlAll", "nativeOnControl", "englishOnSameControlFilms",
              "nativeVsNativeWikiViews", "englishVsNativeWikiViews",
              "nativeOnQuiet", "englishOnQuiet", "nativeVsEnglishLength"):
        b = f.get(k)
        if not b:
            continue
        print("%-36s rho %s  ci %s  n=%d"
              % (k, ("%.4f" % b["rho"]) if b["rho"] is not None else "n/a", b["ci95"], b["n"]))
        print("      %s" % b["label"])

    print("\n=== coverage by region ===")
    print("  %-10s %6s %8s %6s %7s %9s %8s" %
          ("region", "films", "article", "plot", "critic", "clearFloor", "medChars"))
    for k, v in R["byRegion"].items():
        print("  %-10s %6d %8d %6d %7d %9d %8d"
              % (k, v["films"], v["article"], v["plot"], v["criticism"],
                 v["clearsFloor"] + v["combined"], v["medianPlotChars"]))

    print("\n=== coverage by wiki ===")
    print("  %-10s %6s %6s %7s %9s %8s" %
          ("wiki", "films", "plot", "critic", "clearFloor", "medChars"))
    for k, v in list(R["byWiki"].items())[:16]:
        print("  %-10s %6d %6d %7d %9d %8d"
              % (k, v["films"], v["plot"], v["criticism"],
                 v["clearsFloor"] + v["combined"], v["medianPlotChars"]))

    g = R.get("gate1Native")
    if g:
        print("\n--- GATE 1 verdict on native plot length (threshold rho <= %.2f) ---"
              % g["threshold"])
        for inst in ("englishPageviews", "ownWikiPageviews"):
            for which in ("literal", "operative"):
                b = g[inst][which]
                if b["rho"] is None:
                    continue
                print("  %-18s %-10s rho %.4f ci %s n=%-4d %s"
                      % (inst, which, b["rho"], b["ci95"], b["n"],
                         "PASS" if b["pass"] else ("MARGINAL" if b["marginal"] else "FAIL")))

    print("\n=== biggest gains (native plot vs the withheld English one) ===")
    for e in R.get("examples", [])[:10]:
        print("  %-32s %-3s %-16s en %5d -> native %6d  %s"
              % (e["title"][:32], e["wiki"], e["heading"][:16], e["enPlotChars"],
                 e["nativePlotChars"], e["enWithheld"]))

    a = R["headingAudit"]
    print("\n=== heading-map audit ===")
    print("terms in the map never observed in this corpus: %d" % len(a["termsNeverObserved"]))
    if a["termsNeverObserved"]:
        print("  " + ", ".join(a["termsNeverObserved"][:40]))
    print("extractions that relied on an UNVERIFIED term: %d  %s"
          % (sum(a["usedUnverifiedTerms"].values()), a["usedUnverifiedTerms"] or ""))
    print("articles with NO plot heading but >=600 chars of unclassified prose: %d"
          % a["articlesWithNoPlotHeadingButLongProse"])
    for m in a["residualExamples"][:12]:
        print("  %-34s %-4s %s" % (m["title"][:34], m["wiki"], " | ".join(m["headings"])))


if __name__ == "__main__":
    main()
