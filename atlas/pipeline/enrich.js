#!/usr/bin/env node
/* Enrich harvested films with a poster and a description, at BUILD time.
 *
 *   node pipeline/enrich.js            # -> pipeline/out/enrich.json
 *   node pipeline/enrich.js --in /tmp/harvest-old.json
 *
 * Why this exists, and why it is a pipeline stage rather than app code:
 *
 * Posters previously resolved in the browser, per page load, from the TMDB API
 * using a key the user pasted into localStorage. That made photography a live
 * third-party dependency on the critical path -- a key to obtain, an origin to
 * whitelist, a request that can be refused by CSP, and a different answer on
 * different days. Resolving here instead means the shipped app makes no API
 * call and holds no key: corpus.json carries the URL, and the only thing the
 * browser fetches is an image.
 *
 * Source is Wikipedia rather than TMDB because it needs no key at all. The
 * article is reached through the Wikidata sitelink we already hold rather than
 * by searching Wikipedia for the title -- the same title-collision problem that
 * once resolved "Vertigo" to a genus of molluscs applies with equal force here,
 * and the sitelink is an identity, not a guess.
 *
 * LICENCE PROVENANCE IS RECORDED, NOT ASSUMED. Wikipedia lead images come from
 * two different places and only the URL distinguishes them:
 *
 *   /wikipedia/commons/...  freely licensed or public domain. Safe anywhere.
 *   /wikipedia/en/...       non-free, hosted under Wikipedia's own fair-use
 *                           claim, which does not extend to third parties.
 *
 * Every poster is tagged with which it is, so `licence: "non-free"` can be
 * filtered, reviewed, or replaced with a TMDB equivalent later. Guessing here
 * and hoping would be the easy option and an indefensible one.
 *
 * TMDB remains supported as an optional upgrade: set TMDB_KEY and posters
 * resolve from there first, which is both better artwork (multiple language
 * variants) and cleaner licensing. Absence of the key is not an error.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT = path.join(__dirname, "out");
const CACHE = path.join(__dirname, ".cache-enrich");
const UA = "AtlasFilmLineage/0.3 (corpus pipeline; https://github.com/atlas-film-lineage)";
const THROTTLE_MS = parseInt(process.env.ATLAS_THROTTLE_MS || "260", 10);
const OFFLINE = process.env.ATLAS_OFFLINE === "1";
const TMDB_KEY = process.env.TMDB_KEY || "";
/* Opt-in, not implied by the key. Setting TMDB_KEY used to swap every poster as
   a side effect of asking for anything from TMDB, which made the keyword
   upgrade impossible to take without also re-skinning the app and invalidating
   every palette measured from a Wikipedia poster. Posters now move only when
   asked: TMDB_POSTERS=1. See AGENTS 6b and 6c for what that choice costs. */
const TMDB_POSTERS = process.env.TMDB_POSTERS === "1";

/* Non-English one-sheets are frequently illustration rather than marketing
   photography, which survives the posterize+duotone treatment far better than
   a photographic composite does. Same ordering the app used to apply live. */
const TMDB_LANGS = "en,pl,ja,fr,it,de,cs,hu,es,ru,null";

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cachePath = (k) => path.join(CACHE, k.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 180) + ".json");

function getOnce(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: Object.assign({ "User-Agent": UA, Accept: "application/json" }, headers || {}) }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(getOnce(res.headers.location, headers));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode));
      }
      let b = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (b += c));
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error("bad JSON")); } });
    });
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("timeout")));
  });
}

/* Same retry discipline as wikidata.js, and for the same reason: a throttle is
   not a missing poster, and a run that conflates the two produces a corpus full
   of holes that look like facts. */
async function get(url, headers, attempt) {
  const n = attempt || 0;
  try { return await getOnce(url, headers); }
  catch (e) {
    if (!/HTTP 429|HTTP 5\d\d|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN/.test(e.message) || n >= 5) throw e;
    const wait = Math.round(700 * Math.pow(1.9, n) + Math.random() * 400);
    process.stderr.write("  (retry " + (n + 1) + " in " + wait + "ms: " + e.message + ")\n");
    await sleep(wait);
    return get(url, headers, n + 1);
  }
}

async function cached(key, fetcher) {
  const p = cachePath(key);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { /* refetch */ }
  }
  if (OFFLINE) return null;
  let v = null;
  try { v = await fetcher(); } catch (e) { v = { __error: e.message }; }
  fs.writeFileSync(p, JSON.stringify(v));
  await sleep(THROTTLE_MS);
  return v;
}

/* ---------------------------------------------------------------- sitelinks */

/* The Wikidata entity cache from harvest.js already holds sitelinks, because
   Special:EntityData returns the whole entity. Reading them off disk costs no
   requests for the films harvested this way; only the remainder are fetched. */
function sitelinkFromCache(qid) {
  const p = path.join(__dirname, ".cache", "entity_" + qid + ".json");
  if (!fs.existsSync(p)) return undefined;
  try {
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    const e = (d.entities || {})[qid];
    if (!e) return undefined;
    if (!e.sitelinks) return undefined;          // fetched with props=claims|labels
    return (e.sitelinks.enwiki && e.sitelinks.enwiki.title) || null;  // null = genuinely no article
  } catch (e) { return undefined; }
}

async function fetchSitelinks(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 50) {
    const chunk = qids.slice(i, i + 50);
    const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + chunk.join("|") +
      "&props=sitelinks&sitefilter=enwiki&format=json";
    const d = await cached("sitelinks_" + chunk[0] + "_" + chunk.length, () => get(url));
    if (!d || d.__error) continue;
    for (const q of chunk) {
      const e = (d.entities || {})[q];
      out[q] = (e && e.sitelinks && e.sitelinks.enwiki && e.sitelinks.enwiki.title) || null;
    }
  }
  return out;
}

/* ------------------------------------------------------- wikipedia lead data */

/* One request per 20 articles for both the image and the intro text.
 * `exlimit` caps at 20 for non-bot clients, so that is the batch size, not 50.
 * The naive per-film REST call is 500 requests where this is 25. */
async function wikiBatch(titles) {
  const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2" +
    "&prop=pageimages|extracts" +
    "&piprop=thumbnail|original&pithumbsize=640&pilicense=any" +
    "&exintro=1&explaintext=1&exlimit=20" +
    "&redirects=1&titles=" + titles.map(encodeURIComponent).join("|");
  return cached("wiki_" + titles[0] + "_" + titles.length, () => get(url));
}

/* Wikipedia normalises and follows redirects, so the title that comes back is
   not always the title asked for. Build the mapping it reports rather than
   assuming positional correspondence -- otherwise one redirect shifts every
   subsequent film's poster by a place, which is the kind of bug that looks
   like a data problem for a week. */
function indexBatch(d) {
  const byTitle = {};
  if (!d || d.__error || !d.query) return { byTitle: byTitle, alias: {} };
  const alias = {};
  for (const n of d.query.normalized || []) alias[n.from] = n.to;
  for (const r of d.query.redirects || []) alias[r.from] = r.to;
  for (const p of d.query.pages || []) byTitle[p.title] = p;
  return { byTitle: byTitle, alias: alias };
}

function resolveAlias(title, alias) {
  let t = title, guard = 0;
  while (alias[t] && guard++ < 4) t = alias[t];
  return t;
}

/* The only thing separating a freely licensed poster from a non-free one is
   the host path. Nothing in the API response says "fair use". */
function licenceOf(url) {
  if (!url) return null;
  if (/\/wikipedia\/commons\//.test(url)) return "commons";
  if (/\/wikipedia\/[a-z-]+\//.test(url)) return "non-free";
  return "unknown";
}

/* A lead image is not always a poster. A film article can lead with a frame
   grab, a location photograph or a portrait of the director, and those are
   landscape where a one-sheet is portrait. Aspect ratio is the only signal
   available without looking at the picture, so it is used to label rather
   than to reject: a wide image is still better than no image, but it should
   not be described as a poster. */
function shapeOf(w, h) {
  if (!w || !h) return "unknown";
  const r = h / w;
  if (r >= 1.2) return "poster";
  if (r >= 0.95) return "square";
  return "landscape";
}

function firstSentences(text, max) {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  if (!parts) return clean.slice(0, max);
  let out = "";
  for (const p of parts) {
    if (out && (out + p).length > max) break;
    out += p;
    if (out.length > max * 0.6) break;
  }
  return (out || clean.slice(0, max)).trim();
}

/* ------------------------------------------------------------------- TMDB */

/* v3 keys authenticate by query parameter and v4 by bearer header, and the only
   thing that distinguishes them is length. */
function tmdbAuth() {
  const v4 = TMDB_KEY.trim().length > 60;
  return {
    auth: v4 ? { Authorization: "Bearer " + TMDB_KEY.trim() } : {},
    kp: v4 ? "" : "api_key=" + encodeURIComponent(TMDB_KEY) + "&",
  };
}

/* Resolving the film is separated from what we do with it because posters and
   keywords are independent decisions: keywords are always worth having, while
   replacing 790 Wikipedia posters changes the look of the whole app and
   re-dates every measured palette. One search, cached, feeds both. */
async function tmdbMatch(title, year) {
  if (!TMDB_KEY) return null;
  const { auth, kp } = tmdbAuth();
  const s = await cached("tmdb_s_" + title + "_" + (year || ""), () =>
    get("https://api.themoviedb.org/3/search/movie?" + kp + "query=" + encodeURIComponent(title) +
      (year ? "&year=" + year : ""), auth));
  return (s && !s.__error && (s.results || [])[0]) || null;
}

/* Keywords are the reason this file speaks TMDB at all now. Wikidata's genre
   and subject fields are too coarse to discriminate -- "drama film", "1970s" --
   whereas TMDB gives "water rights", "taxidermy", "unreliable narrator", which
   is what the rarity weighting in associate.js needs to produce a claim worth
   reading. See HISTORY, "Claim quality". */
async function tmdbKeywords(hit) {
  if (!TMDB_KEY || !hit) return [];
  const { auth, kp } = tmdbAuth();
  const d = await cached("tmdb_k_" + hit.id, () =>
    get("https://api.themoviedb.org/3/movie/" + hit.id + "/keywords?" + kp, auth));
  if (!d || d.__error) return [];
  return (d.keywords || [])
    .map((k) => String(k.name || "").trim().toLowerCase())
    .filter(Boolean);
}

async function tmdbPoster(hit) {
  if (!TMDB_KEY || !hit) return null;
  const { auth, kp } = tmdbAuth();
  const im = await cached("tmdb_i_" + hit.id, () =>
    get("https://api.themoviedb.org/3/movie/" + hit.id + "/images?" + kp +
      "include_image_language=" + TMDB_LANGS, auth));
  const posters = (im && !im.__error && im.posters) || [];
  const pool = posters.filter((p) => p.iso_639_1 && p.iso_639_1 !== "en");
  const pick = (pool.length ? pool : posters).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))[0]
    || (hit.poster_path ? { file_path: hit.poster_path, iso_639_1: null } : null);
  if (!pick) return null;
  return {
    url: "https://image.tmdb.org/t/p/w500" + pick.file_path,
    full: "https://image.tmdb.org/t/p/w780" + pick.file_path,
    width: 500, height: Math.round(500 * 1.5),
    shape: "poster", licence: "tmdb", source: "tmdb",
    lang: pick.iso_639_1 || null, tmdbId: hit.id,
  };
}

/* -------------------------------------------------------------------- main */

async function main() {
  const inArg = process.argv.indexOf("--in");
  const inPath = inArg > -1 ? process.argv[inArg + 1] : path.join(OUT, "harvest.json");
  const harvest = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const films = harvest.films;
  const keys = Object.keys(films);
  console.log("films: " + keys.length + (TMDB_KEY ? "   (TMDB key present)" : "   (no TMDB key -- Wikipedia only)"));

  /* ---- 1. every film's English Wikipedia article, via its Wikidata identity ---- */
  const article = {};
  const needFetch = [];
  for (const k of keys) {
    /* harvest-sparql.js carries the sitelink through from the same query that
       resolved the film, so the common path costs nothing at all here. */
    if (films[k].enwiki !== undefined && films[k].enwiki !== null) { article[k] = films[k].enwiki; continue; }
    const q = films[k].qid;
    const s = sitelinkFromCache(q);
    if (s === undefined) needFetch.push(q);
    else article[k] = s;
  }
  if (needFetch.length) {
    console.log("fetching " + needFetch.length + " sitelinks from Wikidata ...");
    const got = await fetchSitelinks([...new Set(needFetch)]);
    for (const k of keys) if (article[k] === undefined) article[k] = got[films[k].qid] || null;
  }
  const withArticle = keys.filter((k) => article[k]);
  console.log("with an English article: " + withArticle.length + "/" + keys.length);

  /* ---- 2. lead image + intro, 20 articles per request ---- */
  const page = {};
  const batches = [];
  for (let i = 0; i < withArticle.length; i += 20) batches.push(withArticle.slice(i, i + 20));
  let n = 0;
  for (const batch of batches) {
    const d = await wikiBatch(batch.map((k) => article[k]));
    const idx = indexBatch(d);
    for (const k of batch) {
      const t = resolveAlias(article[k], idx.alias);
      const p = idx.byTitle[t];
      if (p) page[k] = p;
    }
    n += batch.length;
    if (n % 100 < 20) process.stdout.write("  wikipedia " + n + "/" + withArticle.length + "\n");
  }

  /* ---- 3. assemble, preferring TMDB when a key is present ---- */
  /* palette.py measures each film's colour FROM its poster and writes the result
     back into this same file. Rewriting enrich.json from scratch therefore
     destroys every measured palette, and the loss is silent: the corpus still
     builds, every film still has a colour, and 745 measured values have quietly
     become era defaults. Carry the palette forward whenever the poster it was
     measured from has not changed. When the poster does change the palette is
     correctly dropped, because it now describes a different image. */
  /* This carries forward exactly one field (`palette`) with one invalidation
     rule (the poster URL it was measured from). If a future stage writes some
     other field into enrich.json the way palette.py does, it will hit the
     same silent-loss bug and need its own version of this block — there is no
     general "carry forward anything externally written, unless its declared
     dependency changed" mechanism here, just this one hand-written case. That
     generalization is worth doing the day a second such field shows up; doing
     it speculatively for a field that doesn't exist yet would be guessing at
     its shape. */
  const prevPath = path.join(OUT, "enrich.json");
  const prev = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, "utf8")) : {};
  const posterUrl = (e) => (e && e.poster && e.poster.url) || null;

  const out = {};
  let posters = 0, commons = 0, nonfree = 0, notPoster = 0, descs = 0, fromTmdb = 0;
  let matched = 0, withKw = 0, kwTotal = 0, keptPalette = 0, lostPalette = 0;

  for (const k of keys) {
    const f = films[k];
    const p = page[k];
    let poster = null;

    const hit = await tmdbMatch(f.title, f.year);
    if (hit) matched++;
    const keywords = await tmdbKeywords(hit);
    if (keywords.length) { withKw++; kwTotal += keywords.length; }

    if (TMDB_POSTERS) {
      const t = await tmdbPoster(hit);
      if (t) { poster = t; fromTmdb++; }
    }

    if (!poster && p) {
      const img = p.original || p.thumbnail;
      const thumb = p.thumbnail || p.original;
      if (thumb && thumb.source) {
        poster = {
          url: thumb.source,
          full: (img && img.source) || thumb.source,
          width: thumb.width || null,
          height: thumb.height || null,
          shape: shapeOf(thumb.width, thumb.height),
          licence: licenceOf(thumb.source),
          source: "wikipedia",
        };
      }
    }

    const description = p ? firstSentences(p.extract, 340) : "";

    if (poster) {
      posters++;
      if (poster.licence === "commons") commons++;
      if (poster.licence === "non-free") nonfree++;
      if (poster.shape !== "poster") notPoster++;
    }
    if (description) descs++;

    out[k] = {
      title: f.title,
      year: f.year,
      qid: f.qid,
      wikipedia: article[k] || null,
      description: description,
      poster: poster,
      keywords: keywords,
      tmdbId: hit ? hit.id : null,
    };

    const old = prev[k];
    if (old && old.palette) {
      if (posterUrl(old) && posterUrl(old) === posterUrl(out[k])) {
        out[k].palette = old.palette;
        keptPalette++;
      } else {
        lostPalette++;
      }
    }
  }

  fs.writeFileSync(path.join(OUT, "enrich.json"), JSON.stringify(out, null, 1));

  console.log("\nposters      : " + posters + "/" + keys.length +
    "   (commons " + commons + ", non-free " + nonfree + (fromTmdb ? ", tmdb " + fromTmdb : "") + ")");
  console.log("not portrait : " + notPoster + "   (lead image is a frame or photo, not a one-sheet)");
  console.log("descriptions : " + descs + "/" + keys.length);
  if (keptPalette || lostPalette) {
    console.log("palettes     : " + keptPalette + " carried forward" +
      (lostPalette ? ", " + lostPalette + " dropped (poster changed) -- re-run palette.py" : ""));
  }
  if (TMDB_KEY) {
    console.log("tmdb matched : " + matched + "/" + keys.length +
      (TMDB_POSTERS ? "" : "   (posters left alone -- set TMDB_POSTERS=1 to swap them)"));
    console.log("keywords     : " + withKw + " films carry any, " + kwTotal + " total, " +
      (withKw ? (kwTotal / withKw).toFixed(1) : "0") + " median-ish per film");
  }
  const missing = keys.filter((k) => !out[k].poster);
  if (missing.length) {
    console.log("\nno image (" + missing.length + "): " + missing.slice(0, 10).map((k) => films[k].title).join(", ") +
      (missing.length > 10 ? ", ..." : ""));
  }
  console.log("\nDONE -- wrote pipeline/out/enrich.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
