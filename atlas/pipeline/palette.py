#!/usr/bin/env python3
"""Derive each film's duotone pair from its own poster.

    python3 pipeline/palette.py          # reads & rewrites pipeline/out/enrich.json

AGENTS.md rule 5 specifies "duotone from that film's own photography". Until
now no photography existed at build time, so the two colours came from an era
table: a decade-wide default, varied by a hash of the title. Every 1963 film was
a variation on the same amber regardless of whether it was shot in Eastmancolor
or black and white.

With posters resolved at build time the rule can finally be honoured literally.
This reads the poster, finds the colours actually in it, and writes a shadow and
a highlight that the map's posterize+duotone filter ramps between.

WHY HUE HISTOGRAMS AND NOT AVERAGE COLOUR
The mean pixel of almost any poster is a muddy grey-brown, because averaging
opposed hues cancels them. What a viewer registers as "the colour of Suspiria"
is its most saturated region, not its most common one, so hue mass is weighted
by saturation and the near-greys are excluded outright rather than allowed to
outvote a small area of intense red.

BLACK-AND-WHITE POSTERS ARE A REAL CASE, NOT AN EDGE CASE
A third of this corpus predates colour. Those posters have no dominant hue, and
forcing one invents a fact about the film. When the weighted chromatic mass is
below threshold the era palette is kept and `paletteSource` stays "era", so the
distinction between a measured colour and a defaulted one survives into the app
rather than being flattened at build time.

DEPENDENCIES ARE PINNED IN pipeline/requirements.txt
This file measures colours that then ship, so "it runs" is not the bar -- it has
to produce the same colours it produced last time. See the tie-break note in
`dominant_hues` for the specific way an unpinned toolchain used to change them.
"""

import io, json, os, sys, time, hashlib, colorsys
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
CACHE = ROOT / ".cache-posters"
CACHE.mkdir(exist_ok=True)
UA = "AtlasFilmLineage/0.3 (corpus pipeline; https://github.com/atlas-film-lineage)"

# Two independent tests, because they fail independently. A poster can be
# colourful over a small area (a red title on black) or weakly tinted over a
# large one (a sepia scan), and only one number cannot tell those apart from a
# genuine monochrome. The first version multiplied coverage BY saturation into
# a single score, which drove Suspiria -- a poster that is essentially one
# saturated red -- below the floor, because 0.4 saturation over 40% of the
# frame reads as 0.16 and looked like noise.
# The coverage floor is deliberately LOW. Suspiria's poster is white paper with
# a single red splash: roughly 4% of the frame carries hue, and that 4% is the
# entire visual identity of the film. A floor set where "most of the image is
# coloured" would discard exactly the posters with the strongest colour idea.
COVERAGE_FLOOR = 0.035   # share of the image carrying any hue at all
SATURATION_FLOOR = 0.20  # how colourful that part actually is

# FETCHING IS THE STAGE THAT FAILS SILENTLY, SO IT IS THE STAGE THAT IS ARMOURED
#
# A corpus-sized run asks one host (upload.wikimedia.org) for one poster per
# film with nothing between the requests. At ~2,000 films on a cold cache that
# is ~2,000 back-to-back requests, which reads as a scrape rather than a build.
# The consequence of being throttled or blocked is not an error -- it is that
# the affected films keep an era-default palette and the whole loss is reported
# as one summary integer. STATE.md already lists silent palette loss under
# "Traps that have already cost time", so the pause, the retries and the
# per-film failure list below all exist to make that loss impossible to miss.
# Overridable because the right pace depends on how cold the cache is, and the
# defaults are tuned for a warm one. Measured 2026-08-08 on the 803 -> 2,204
# growth run: 1,833 cold fetches at 0.12s produced 295 HTTP 429s -- "your bot is
# making too many requests" -- and 295 films silently kept an era default. The
# backoffs below are also too short once Wikimedia has started throttling: it
# wants the client to stand down for much longer than two seconds. So a first
# cold pass over a big harvest should run ATLAS_PALETTE_THROTTLE=1.5 (and the
# recovery pass that picks up its failures, likewise), while an incremental
# re-run over a warm cache is fine at the default.
THROTTLE_S = float(os.environ.get("ATLAS_PALETTE_THROTTLE", "0.12"))
FETCH_ATTEMPTS = int(os.environ.get("ATLAS_PALETTE_ATTEMPTS", "3"))
BACKOFF_S = tuple(float(s) for s in
                  os.environ.get("ATLAS_PALETTE_BACKOFF", "1.0,2.0").split(","))

# A 404 is still a 404 in four seconds. Retrying every dead poster link three
# times spends minutes across a 2,000-film run for no chance of a different
# answer, so only the statuses that mean "not now" are worth another attempt.
RETRY_STATUS = frozenset((408, 425, 429, 500, 502, 503, 504))

# If this share of the posters we tried to fetch could not be measured, the
# problem is the network or the host and not the corpus. Exit non-zero so a
# scripted run stops here instead of continuing and baking era defaults into
# a couple of thousand films.
FAILURE_ALARM = 0.20


def looks_like_image(data: bytes) -> bool:
    """True only for bytes that begin with a container we can actually decode.

    BYTES THAT ARE NOT AN IMAGE MUST NEVER ENTER THE CACHE.
    An error page is a 200 with HTML in it as far as urlopen is concerned. The
    earlier version wrote whatever came back under the cache key, so 38 bytes of
    HTML became a permanent answer: every later run read it back from cache with
    no revalidation, Image.open raised UnidentifiedImageError, and that film was
    stuck on an era default for the life of the project. Checking the magic
    number costs nothing and turns a permanent failure into a retryable one.
    """
    return (data[:8] == b"\x89PNG\r\n\x1a\n"                       # png
            or data[:3] == b"\xff\xd8\xff"                         # jpeg
            or data[:6] in (b"GIF87a", b"GIF89a")                  # gif
            or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")     # webp
            or data[:2] == b"BM")                                  # bmp


def cache_path(url: str) -> Path:
    return CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".img")


def fetch(url: str):
    """Return (bytes|None, kind, detail).

    `kind` is a short groupable label -- "cache", "fetched", "HTTP 404",
    "network", "not an image" -- so the failure report can bucket 2,000 films
    into a handful of lines instead of printing one integer or 2,000 URLs.
    """
    key = cache_path(url)
    if key.exists():
        return key.read_bytes(), "cache", ""

    data = None
    kind, detail = "no attempt", ""
    for attempt in range(FETCH_ATTEMPTS):
        if attempt:
            time.sleep(BACKOFF_S[min(attempt - 1, len(BACKOFF_S) - 1)])
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            kind, detail = "fetched", ""
            break
        except urllib.error.HTTPError as e:
            kind, detail = "HTTP %d" % e.code, e.reason or ""
            if e.code not in RETRY_STATUS:
                break
        except urllib.error.URLError as e:
            kind, detail = "network", str(e.reason)
        except Exception as e:
            # Socket timeouts and short reads surface here rather than as
            # URLError, and they are exactly the transient class worth retrying.
            kind, detail = "network", "%s: %s" % (type(e).__name__, e)

    # One pause per URL that reached the network, whatever the outcome. Cache
    # hits returned above and never reach this line, so a warm re-run pays
    # nothing for the throttle.
    time.sleep(THROTTLE_S)

    if data is None:
        return None, kind, detail
    if not looks_like_image(data):
        return None, "not an image", "%d bytes, starts %r" % (len(data), data[:12])

    # Atomic, for the same reason the enrich.json write is: an interrupted run
    # otherwise leaves a truncated file under a cache key that is then trusted
    # forever. Same-directory temp so replace() stays a rename, not a copy.
    tmp = key.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.replace(key)
    return data, "fetched", ""


def hue_profile(img: Image.Image):
    """Return (hues, sats, vals, weights) for the chromatic pixels only."""
    img = img.convert("RGB")
    img.thumbnail((120, 180))
    a = np.asarray(img, dtype=np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    v = mx
    d = mx - mn
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0.0)

    h = np.zeros_like(mx)
    nz = d > 1e-6
    # standard RGB->hue, vectorised
    rmax = nz & (mx == r)
    gmax = nz & (mx == g) & ~rmax
    bmax = nz & (mx == b) & ~rmax & ~gmax
    h[rmax] = ((g - b)[rmax] / d[rmax]) % 6
    h[gmax] = ((b - r)[gmax] / d[gmax]) + 2
    h[bmax] = ((r - g)[bmax] / d[bmax]) + 4
    h = h * 60.0

    # Exclude the near-black and blown-out pixels: a poster's border and its
    # specular highlights carry no hue information but plenty of area.
    keep = (s > 0.15) & (v > 0.10) & (v < 0.97)
    w = (s * np.clip(v, 0, 1))[keep]
    return h[keep], s[keep], v[keep], w, int(mx.size)


def dominant_hues(h, w, bins=36):
    """Two hue peaks, if the image genuinely has two.

    AN EMPTY BIN IS NOT A PEAK, AND THE ORDER OVER EQUAL BINS MUST BE THE DATA'S
    Most posters put all their chroma in a handful of adjacent bins: Cold War
    (2018) carries mass in bins 1-7 and *exactly 0.0* in the other 29. The
    earlier version ranked with `np.argsort(hist)[::-1]`, which is an unstable
    sort over a 29-way tie of zeros, then accepted whichever empty bin came out
    first as the second peak. So the film's shadow hue was decided by numpy's
    introsort pivot rather than by the poster: it shipped as 125 (green), and the
    same bytes under numpy 2.4.6 give 325 (magenta). The poster contains neither.
    `Network` (1976) had the same defect -- 115 shipped, 355 now, mass only in
    bins 2-8.

    Both halves of that are fixed here, and they are different problems:

      * `kind="stable"` over `-hist` makes the ordering *total* -- descending by
        mass, ties broken by ascending bin index -- so it is a property of the
        histogram and not of the sort implementation or the numpy version.
      * breaking at zero mass means a hue that is absent from the poster can
        never be reported as one of its two colours. `duotone` already has the
        right answer for a poster with one hue cluster: fall through to
        `h_hi - 24` and rotate, which is what the peaks[1] fallback there is for.

    Measured on a 71-film spread of the shipped corpus: 69 palettes reproduce
    byte-identically, and the 2 that drifted are exactly the 2 with a zero-mass
    second peak. A *relative* floor was considered and rejected -- 18 of the 71
    have a second peak under 2% of the first, they are stable under both
    toolchains, and re-cutting them is a design change, not a determinism fix.
    """
    if h.size == 0:
        return []
    idx = np.clip((h / 360.0 * bins).astype(int), 0, bins - 1)
    hist = np.bincount(idx, weights=w, minlength=bins)
    # circular smoothing so a peak straddling two bins is not split in half
    hist = np.convolve(np.concatenate([hist[-2:], hist, hist[:2]]),
                       np.array([0.25, 0.5, 1.0, 0.5, 0.25]), mode="same")[2:-2]
    order = np.argsort(-hist, kind="stable")
    peaks = []
    for i in order:
        if hist[i] <= 0:
            break                        # order is descending: nothing left carries hue
        centre = (i + 0.5) * 360.0 / bins
        if all(min(abs(centre - p), 360 - abs(centre - p)) > 40 for p in peaks):
            peaks.append(centre)
        if len(peaks) == 2:
            break
    return peaks


def hex_of(hh, ss, ll):
    r, g, b = colorsys.hls_to_rgb((hh % 360) / 360.0, ll, ss)
    return "#%02x%02x%02x" % (int(r * 255 + .5), int(g * 255 + .5), int(b * 255 + .5))


def duotone(img: Image.Image):
    h, s, v, w, total = hue_profile(img)
    coverage = h.size / max(total, 1)
    sat_mean = float(np.average(s, weights=w)) if h.size else 0.0
    if h.size == 0:
        return None

    # Two ways to qualify, because colour identity arrives in two shapes.
    # Either enough of the frame is coloured, or a smaller part of it is
    # *intensely* coloured -- Suspiria's poster is white paper carrying one
    # red splash across about 3% of its area, and that splash is the whole
    # design. A single coverage floor calls that a black-and-white poster.
    broad = coverage >= COVERAGE_FLOOR and sat_mean >= SATURATION_FLOOR
    vivid = coverage >= 0.012 and sat_mean >= 0.55
    if not (broad or vivid):
        return None                      # achromatic: keep the era palette

    peaks = dominant_hues(h, w)
    if not peaks:
        return None

    def near(centre, deg=30):
        return np.minimum(np.abs(h - centre), 360 - np.abs(h - centre)) < deg

    def stats(centre):
        m = near(centre)
        if not m.any():
            return 0.0, 0.5, 0.0
        return float(w[m].sum()), float(np.average(v[m], weights=w[m])), float(np.average(s[m], weights=w[m]))

    # THE DOMINANT HUE BECOMES THE HIGHLIGHT, NOT THE SHADOW.
    #
    # The highlight is what a viewer reads as "the colour of this map" -- it is
    # the bright end of the ramp and occupies the lit areas of every cell. An
    # earlier version assigned whichever peak was brighter in the source, which
    # sounds principled and is not: on In the Mood for Love it handed the
    # highlight to a small gold area and pushed the film's red into a near-black
    # shadow, so a famously red poster rendered olive-and-cream. Identity lives
    # in the dominant chroma, so that is what the ramp must carry.
    h_hi = peaks[0]
    mass_hi, _, sat_hi = stats(h_hi)

    # The shadow wants a related but distinct hue. A genuine second peak is a
    # relationship the poster actually contains; failing that, a small rotation
    # keeps the pair from reading as a flat monochrome tint. `dominant_hues`
    # now only returns a second peak that carries real mass, so this branch is
    # reached whenever the poster has one hue cluster rather than two -- which
    # is the correct reading of a poster like Cold War's.
    h_lo = peaks[1] if len(peaks) > 1 else (h_hi - 24)
    _, _, sat_lo = stats(h_lo) if len(peaks) > 1 else (0, 0, sat_hi)

    sat_hi = float(np.clip(sat_hi * 1.15, 0.42, 0.86))
    sat_lo = float(np.clip((sat_lo or sat_hi) * 0.85, 0.24, 0.62))

    # Lightness is fixed rather than measured: the ramp needs a guaranteed
    # contrast range regardless of how bright the source happened to be, and a
    # poster shot on a dark background would otherwise produce two dark colours
    # and a cell with no legibility at all.
    highlight = hex_of(h_hi, sat_hi, 0.58)
    shadow = hex_of(h_lo, sat_lo, 0.10)
    return {"shadow": shadow, "highlight": highlight,
            "hues": [round(h_lo % 360, 1), round(h_hi, 1)],
            "coverage": round(coverage, 3), "saturation": round(sat_mean, 3)}


def report(keys, done, measured, achromatic, carried, failures, from_cache, from_net):
    """Print the run in a form where a per-film loss cannot hide in an integer.

    The defect being fixed here is that a film which lost its measured palette
    surfaced only as `unreadable: 1` in a summary -- indistinguishable, to a
    reader, from a rounding error. So: the counts still lead, but every film
    that is NOT on a palette measured from this run's bytes is named, bucketed
    by cause, and the "carried forward from an earlier run" case is separated
    from the "measured just now" case rather than both reading as a colour.
    """
    era_default = len(keys) - measured - carried
    print(f"\nposters read : {done}   (bytes fetched or cached, and decoded)")
    print(f"  from cache : {from_cache}")
    print(f"  fetched    : {from_net}")
    print(f"measured     : {measured}   (palette derived from THIS run's poster bytes)")
    print(f"achromatic   : {achromatic}   (no dominant hue -- the era default is the right answer)")
    print(f"unreadable   : {len(failures)}   (poster present, no palette could be taken)")
    print(f"carried fwd  : {carried}   (kept a palette measured by an EARLIER run, not re-measured)")
    print(f"era default  : {era_default}   (film ends with no palette at all)")

    if failures:
        buckets = {}
        for key, kind, detail, url in failures:
            buckets.setdefault(kind, []).append((key, detail, url))
        print(f"\nPOSTERS THAT COULD NOT BE MEASURED -- {len(failures)} "
              f"film{'' if len(failures) == 1 else 's'} NOT on a measured palette:")
        for kind in sorted(buckets, key=lambda k: (-len(buckets[k]), k)):
            rows = buckets[kind]
            print(f"  {kind}  ({len(rows)})")
            # Bounded per bucket so a total network outage cannot bury the
            # counts above under two thousand lines, but every distinct cause
            # still gets named and shown.
            for key, detail, url in rows[:40]:
                print(f"    {key:<38} {url}" + (f"   [{detail}]" if detail else ""))
            if len(rows) > 40:
                print(f"    ... and {len(rows) - 40} more with this cause")

    attempted = done + len(failures)
    if attempted and len(failures) >= FAILURE_ALARM * attempted:
        print(f"\n!! {len(failures)} of {attempted} posters ({100.0 * len(failures) / attempted:.0f}%) "
              f"could not be measured.")
        print("!! At that rate the cause is the host, the network or the poster URLs --")
        print("!! not a property of the films. The palettes written above are incomplete;")
        print("!! the cache is warm, so fix the cause and re-run. This stage is resumable")
        print("!! and only the films listed above will be re-requested.")
        return 1
    return 0


def main():
    path = OUT / "enrich.json"
    data = json.loads(path.read_text())
    keys = list(data.keys())
    done = measured = achromatic = from_cache = from_net = 0
    failures = []                       # (film key, cause, detail, url)

    for i, k in enumerate(keys):
        rec = data[k]
        p = rec.get("poster")
        if not p or not p.get("url"):
            continue
        url = p["url"]
        blob, kind, detail = fetch(url)
        if kind == "cache":
            from_cache += 1
        elif kind == "fetched":
            from_net += 1
        if not blob:
            failures.append((k, kind, detail, url))
            continue
        try:
            img = Image.open(io.BytesIO(blob))
            img.load()
        except Exception as e:
            # A blob that passed the magic-number gate and still will not decode
            # is truncated or corrupt. Evict it: leaving it in place is the same
            # permanent-failure bug as caching an error page, just arrived at by
            # a different route (an interrupted download, or a file written by a
            # build that predates looks_like_image).
            cache_path(url).unlink(missing_ok=True)
            failures.append((k, "undecodable", type(e).__name__, url))
            continue
        pal = duotone(img)
        done += 1
        if pal:
            rec["palette"] = pal
            measured += 1
        else:
            achromatic += 1
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(keys)}  measured {measured}  unreadable {len(failures)}", flush=True)

    # Every film that still has a palette this run did not write is carrying one
    # forward: no poster, an unreadable poster, or an achromatic poster over a
    # record that was measured before. Counted here rather than inside the loop
    # so the definition is exactly "present at the end, not measured now".
    carried = sum(1 for k in keys if "palette" in data[k]) - measured

    # Atomic: this is a 2.5 MB rewrite of the file every later stage reads, and
    # a half-written enrich.json is not a smaller corpus, it is a broken one.
    tmp = path.with_suffix(".json.part")
    tmp.write_text(json.dumps(data, indent=1))
    tmp.replace(path)

    print("\nDONE -- palettes written into pipeline/out/enrich.json")
    # Reported last so that when the alarm fires it is the final thing on screen
    # rather than something a "DONE" scrolls past.
    return report(keys, done, measured, achromatic, carried, failures, from_cache, from_net)


if __name__ == "__main__":
    sys.exit(main())
