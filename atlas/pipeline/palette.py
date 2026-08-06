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
"""

import json, os, sys, hashlib, colorsys, urllib.request, io
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


def fetch(url: str) -> bytes | None:
    key = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".img")
    if key.exists():
        return key.read_bytes()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    except Exception:
        return None
    key.write_bytes(data)
    return data


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
    """Two hue peaks, if the image genuinely has two."""
    if h.size == 0:
        return []
    idx = np.clip((h / 360.0 * bins).astype(int), 0, bins - 1)
    hist = np.bincount(idx, weights=w, minlength=bins)
    # circular smoothing so a peak straddling two bins is not split in half
    hist = np.convolve(np.concatenate([hist[-2:], hist, hist[:2]]),
                       np.array([0.25, 0.5, 1.0, 0.5, 0.25]), mode="same")[2:-2]
    order = np.argsort(hist)[::-1]
    peaks = []
    for i in order:
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
    # keeps the pair from reading as a flat monochrome tint.
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


def main():
    path = OUT / "enrich.json"
    data = json.loads(path.read_text())
    keys = list(data.keys())
    done = measured = achromatic = failed = 0

    for i, k in enumerate(keys):
        rec = data[k]
        p = rec.get("poster")
        if not p or not p.get("url"):
            continue
        blob = fetch(p["url"])
        if not blob:
            failed += 1
            continue
        try:
            img = Image.open(io.BytesIO(blob))
            img.load()
        except Exception:
            failed += 1
            continue
        pal = duotone(img)
        done += 1
        if pal:
            rec["palette"] = pal
            measured += 1
        else:
            achromatic += 1
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(keys)}  measured {measured}", flush=True)

    path.write_text(json.dumps(data, indent=1))
    print(f"\nposters read : {done}")
    print(f"measured     : {measured}   (palette derived from the poster)")
    print(f"achromatic   : {achromatic}   (kept the era palette -- no dominant hue)")
    print(f"unreadable   : {failed}")
    print("\nDONE -- palettes written into pipeline/out/enrich.json")


if __name__ == "__main__":
    main()
