#!/usr/bin/env python3
"""native-wiki.py — shared fetch/parse layer for the native-language harvest.

Ported deliberately from plot-source.js rather than re-invented: the wikitext
stripper, the balanced-construct removal, the level-2 section split and the
never-cache-a-failure rule are the same code path the English plot harvest was
gated on, so a native plot char count means the same thing as an English one.
The port is *verified*, not assumed — verify-stripper.py re-extracts the English
plot for every film from the existing .cache-plots wikitext and compares char
counts against out/plots.json.

Only two things differ from the JS, both because English is not the world:

  1. normHeading keeps non-ASCII. The JS version does
     `replace(/[^A-Za-z0-9 ]/g, "")`, which turns あらすじ into the empty string
     and would silently classify every Japanese article as headingless.
  2. Level-2 headings are matched on `==...==` exactly as in the JS, but some
     wikis (ja in particular) write `== あらすじ ==` with full-width spaces.
"""
import hashlib
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "AtlasFilmLineage/0.3 (corpus pipeline; https://github.com/atlas-film-lineage)"


# --------------------------------------------------------------------- http

def cache_path(cache_dir, key):
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", key)[:120]
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
    return os.path.join(cache_dir, safe + "_" + h + ".json")


def cached(cache_dir, key, fn, refresh=False):
    """A FAILURE IS NOT A FACT: errors raise and are never written to disk."""
    os.makedirs(cache_dir, exist_ok=True)
    p = cache_path(cache_dir, key)
    if not refresh and os.path.exists(p):
        try:
            with open(p, encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            pass
    v = fn()
    if not (isinstance(v, dict) and v.get("__missing")):
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(v, fh)
    return v


def get_once(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"__missing": True}
        raise RuntimeError("HTTP %d" % e.code)


def get(url, attempt=0):
    """Long backoff on 429/503 — the server telling us the rate is wrong gets a
    much longer sleep than a transient socket error."""
    try:
        return get_once(url)
    except Exception as e:
        msg = str(e)
        throttled = "HTTP 429" in msg or "HTTP 503" in msg
        transient = bool(re.search(r"HTTP 5\d\d|timed out|timeout|reset|EOF|Connection", msg, re.I))
        if (not throttled and not transient) or attempt >= 6:
            raise
        base = 8.0 if throttled else 1.2
        wait = base * (1.8 ** attempt) + 0.5
        print("  (retry %d in %.1fs: %s)" % (attempt + 1, wait, msg), flush=True)
        time.sleep(wait)
        return get(url, attempt + 1)


# ----------------------------------------------------------------- wikitext

def _remove_balanced(s, open_t, close_t):
    out = []
    i = 0
    n = len(s)
    while i < n:
        if s.startswith(open_t, i):
            depth = 1
            j = i + len(open_t)
            while j < n and depth > 0:
                if s.startswith(open_t, j):
                    depth += 1
                    j += len(open_t)
                elif s.startswith(close_t, j):
                    depth -= 1
                    j += len(close_t)
                else:
                    j += 1
            i = j
            continue
        out.append(s[i])
        i += 1
    return "".join(out)


_FILE_RE = re.compile(r"^\[\[\s*(File|Image|Media|Immagine|Bild|Fichier|Datei|Archivo|Ficheiro|"
                      r"ファイル|画像|Fil|Plik|Файл|Soubor|Kép|Kuva|Dosya|Αρχείο|파일|文件|Fitxer)\s*:", re.I)


def _remove_file_links(s):
    out = []
    i = 0
    n = len(s)
    while i < n:
        if s.startswith("[[", i) and _FILE_RE.match(s[i:i + 24]):
            depth = 1
            j = i + 2
            while j < n and depth > 0:
                if s.startswith("[[", j):
                    depth += 1
                    j += 2
                elif s.startswith("]]", j):
                    depth -= 1
                    j += 2
                else:
                    j += 1
            i = j
            continue
        out.append(s[i])
        i += 1
    return "".join(out)


def strip_wikitext(s):
    t = s
    t = re.sub(r"<!--[\s\S]*?-->", "", t)
    t = re.sub(r"<ref[^>]*/>", "", t, flags=re.I)
    t = re.sub(r"<ref[^>]*>[\s\S]*?</ref>", "", t, flags=re.I)
    t = re.sub(r"<(gallery|table|score|math|timeline|imagemap)[^>]*>[\s\S]*?</\1>", "", t, flags=re.I)
    t = _remove_balanced(t, "{|", "|}")
    t = _remove_balanced(t, "{{", "}}")
    t = _remove_file_links(t)
    t = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[(?:https?:|//)[^\s\]]+\s+([^\]]*)\]", r"\1", t)
    t = re.sub(r"\[(?:https?:|//)[^\s\]]+\]", "", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"'''''|'''|''", "", t)
    t = re.sub(r"^[*#:;]+\s*", "", t, flags=re.M)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"')
    t = re.sub(r"&#\d+;", "", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


HEADING_RE = re.compile(r"^(={2,6})[\s　]*(.+?)[\s　]*\1\s*$")


def parse_sections(wikitext):
    """Level-2 headings delimit; level-3+ stay inside their parent, because a
    plot told in parts is still the plot (same rule as plot-source.js)."""
    sections = []
    current = {"title": "__lead__", "level": 0, "lines": []}
    for line in wikitext.split("\n"):
        m = HEADING_RE.match(line)
        if m and len(m.group(1)) == 2:
            sections.append(current)
            current = {"title": m.group(2), "level": 2, "lines": []}
        else:
            current["lines"].append(line)
    sections.append(current)
    return [{"title": s["title"], "level": s["level"], "body": "\n".join(s["lines"])} for s in sections]


_PUNCT = dict.fromkeys(
    i for i in range(0x110000)
    if unicodedata.category(chr(i)).startswith("P") or unicodedata.category(chr(i)).startswith("S")
)


def norm_heading(h):
    """Unicode-preserving heading normaliser. The JS strips [^A-Za-z0-9 ] which
    is correct for English and destroys あらすじ / Сюжет / Οι ρόλοι."""
    t = re.sub(r"<[^>]+>", "", h)
    t = _remove_balanced(t, "{{", "}}")          # == Plot{{Anchor|Synopsis}} ==
    t = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[(?:https?:|//)[^\s\]]+\s*([^\]]*)\]", r"\1", t)
    t = re.sub(r"https?://\S+", " ", t)          # sv: "== Handling<ref>http… ==" bare URLs
    t = re.sub(r"'''''|'''|''", "", t)
    t = t.translate(_PUNCT)
    t = re.sub(r"\s+", " ", t.replace("　", " "))
    return t.strip().casefold()


def list_ratio(body):
    """Share of non-blank lines that are list items. A cast section is a list;
    a plot section is prose. Used to keep 'Cast' out of the plot map."""
    lines = [l for l in body.split("\n") if l.strip()]
    if not lines:
        return 0.0
    listy = sum(1 for l in lines if re.match(r"^\s*[*#]", l))
    return listy / len(lines)
