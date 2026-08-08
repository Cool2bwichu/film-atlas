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

/* A FAILURE IS NOT A FACT, AND MUST NOT BE CACHED AS ONE.
 *
 * This used to write `{"__error":"HTTP 401"}` to disk and return it from cache
 * on every subsequent run. One run with a wrong or expired TMDB_KEY therefore
 * zeroed every keyword permanently: reproduced end to end, a bad key gives
 * `tmdb matched: 0/8, keywords: 0`, and the next run with the REAL key gives
 * byte-identical output, because nothing ever asked TMDB again. Fixing the key
 * did not fix the corpus; only deleting the cache did, and nothing told you to.
 *
 * `get()` has already retried anything transient five times with backoff, so an
 * error arriving here is either permanent (a 4xx) or an exhausted retry. Neither
 * is worth preserving. The cost of not caching it is one repeated request per
 * failure on the next run; the cost of caching it is a corpus of holes that look
 * like facts, which is the failure this whole file's retry discipline exists to
 * prevent. An error already on disk from before this fix is likewise treated as
 * a miss rather than an answer, so an existing poisoned cache heals itself. */
async function cached(key, fetcher) {
  const p = cachePath(key);
  if (fs.existsSync(p)) {
    try {
      const hit = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!hit || !hit.__error) return hit;
    } catch (e) { /* refetch */ }
  }
  if (OFFLINE) return null;
  let v = null;
  try { v = await fetcher(); } catch (e) { v = { __error: e.message }; }
  if (!v || !v.__error) fs.writeFileSync(p, JSON.stringify(v));
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

/* A 4xx from TMDB that is not a 404 is a CONFIGURATION fault, not a missing
   film, and it will hit every single film in the run identically: 401 for a key
   that is wrong, expired or has the wrong version, 403 for one that has been
   suspended, 422 for a request TMDB will not parse. Continuing produces a
   corpus with zero keywords and reports success, and `validate-corpus.js`
   cannot see it — an A/B with the keywords removed moved the graph from 7,209
   to 7,219 edges with identical components and orphan counts, because cast and
   genreEra coincidence quietly substitute for the 370 lost keyword edges. So
   the only place this can be caught is here, at the response.

   A `!TMDB_KEY` guard does not cover this and never could: in the 401 case the
   key is set, non-empty, and wrong. 404 stays non-fatal — TMDB returns it for
   an id that has been merged or deleted, which is a fact about one film.

   Never print the URL: for a v3 key the credential is in the query string. */
function tmdbFatal(d, what) {
  if (!d || !d.__error) return d;
  const m = /^HTTP (\d{3})$/.exec(d.__error);
  const code = m ? parseInt(m[1], 10) : 0;
  if (code < 400 || code >= 500 || code === 404) return d;
  const why = code === 401 ? "TMDB rejected the key (wrong, expired, or a v4 token being sent as v3)"
    : code === 403 ? "TMDB forbade the request (key suspended, or out of quota)"
    : code === 429 ? "still rate limited after five backoff retries — raise ATLAS_THROTTLE_MS"
    : "TMDB refused the request";
  console.error("\nFATAL: TMDB returned " + code + " for " + what + ".");
  console.error("  " + why + ".");
  console.error("  Check TMDB_KEY (echo ${#TMDB_KEY} — a v3 key is 32 chars, a v4 token is much longer),");
  console.error("  fix it, and re-run. Cached failures are no longer written, so nothing needs deleting.");
  console.error("  Stopping: a run that continues from here writes a corpus with no keywords at all,");
  console.error("  and every downstream check still passes.");
  process.exit(1);
}

/* Title comparison has to survive the ways two databases legitimately spell the
   same film differently: diacritics (`Cléo from 5 to 7`), punctuation and
   hyphenation (`Blowup` vs TMDB's `Blow-Up`, `8½`), and the leading article one
   side keeps and the other drops (`The Mirror` vs `Mirror`, `The Woman in the
   Dunes` vs `Woman in the Dunes`). NFKD plus combining-mark removal handles the
   accents and also folds `½` to `1⁄2`; the characters that are letters in their
   own right rather than accented Latin — ø, æ, ß, ł — do not decompose at all
   and need the explicit map. Separators are then dropped entirely rather than
   collapsed to spaces so that `Blow-Up` and `Blowup` agree; that is safe
   against the collision this check exists to catch, because `spiderman` still
   does not equal `spider`.

   A title in a non-Latin script normalises to the empty string, which must
   never be treated as agreement — see the `q !== ""` guard at the call site. */
const TITLE_LETTERS = { "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i" };
const LEADING_ARTICLE = new Set(["the", "a", "an", "le", "la", "les", "l", "il", "lo", "gli",
  "el", "los", "las", "der", "die", "das", "den", "det", "en", "ett", "de", "het", "o", "os", "um", "uma"]);

function titleKey(s) {
  const w = String(s || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[øæœßłđðþı]/g, (c) => TITLE_LETTERS[c])
    .replace(/[^a-z0-9]+/g, " ")
    .trim().split(" ").filter(Boolean);
  if (w.length > 1 && LEADING_ARTICLE.has(w[0])) w.shift();
  return w.join("");
}

function releaseYear(r) {
  const m = /^(\d{4})/.exec(String((r && r.release_date) || ""));
  return m ? parseInt(m[1], 10) : null;
}

/* Counted rather than swallowed: a match this code declines is a film that
   silently loses every keyword, which is the same class of quiet loss the rest
   of this file is fighting. The run prints both numbers. */
const tmdbRepicked = [];
const tmdbRejected = [];

/* Resolving the film is separated from what we do with it because posters and
 * keywords are independent decisions: keywords are always worth having, while
 * replacing 790 Wikipedia posters changes the look of the whole app and
 * re-dates every measured palette. One search, cached, feeds both.
 *
 * TMDB RANKS BY POPULARITY, SO results[0] IS THE MOST FAMOUS FILM MATCHING THE
 * QUERY, NOT THE FILM ASKED FOR. Taking it unverified has a specific damaging
 * shape: `Spider (2002)` resolves to `Spider-Man (2002)` — same year, so
 * `&year=` cannot help — and hands that film's seventeen keywords to a
 * Cronenberg chamber piece. associate.js then emits them as source:"record",
 * confidence:1.0: *"Both turn on superhero, secret identity and super
 * villain"*, about a film that turns on none of them. That is AGENTS rule 8
 * broken by a bad match rather than by a bad reading, and it is worse than a
 * weak claim because it arrives with a record's authority. Two more of the same
 * defect, both measured against live TMDB: `The Mirror (1975)` resolves to `The
 * Broken Mirror (1975)` — Tarkovsky's film is ranked LAST of the six results —
 * and `Dreams (1990)` resolves to `Field of Dreams (1989)`, with Kurosawa's
 * film at rank 2. Popularity ranking buries exactly the corpus this map is for.
 *
 * The rule is deliberately ASYMMETRIC, because a false rejection costs a film
 * every keyword it has. Only a demonstrably better candidate — one agreeing on
 * both title and year — displaces results[0]. When nothing in the response is
 * spelled like the film we asked for there is no rival to prefer, so TMDB's own
 * ranking stands: that is the `12 Monkeys` → `Twelve Monkeys`, `Blowup` →
 * `Blow-Up`, `The Woman in the Dunes` → `Woman in the Dunes`, `Star Wars:
 * Episode IV – A New Hope` → `Star Wars` case, all of them correct matches
 * under a different spelling, all measured from the cached searches on disk.
 *
 * The date is the second half, and it is not redundant with the `&year=` in the
 * query: TMDB's year filter matches ANY release a film has in that year, so
 * `Prison (1948)` came back holding one result — `Random Harvest (1942)`, an
 * unrelated Ronald Colman melodrama, which the old code took and would have
 * described as a record. Tolerance is ±1 year because Wikidata dates a film by
 * first publication and TMDB by primary release, and a festival premiere in
 * December routinely straddles the new year. Measured across 174 real searches:
 * 165 agreed exactly, 7 differed by one, and only two differed by more.
 *
 * ONE OF THOSE TWO IS A FALSE REJECTION AND IS THE PRICE OF THIS RULE.
 * `Allemagne 90 neuf zéro (1991)` is on TMDB as `Allemagne année 90 neuf zéro`,
 * released 1993-01-15 after a Venice premiere in 1991 — a real film, refused on
 * a two-year gap plus a one-word title difference. It loses only its keywords,
 * not its place in the graph, and the trade is taken deliberately: a film with
 * no keywords is a gap, while a film with someone else's keywords is a false
 * record-tier claim, and rule 8 makes those different kinds of wrong. Every
 * rejection is named in the run's output for exactly this reason — the cost is
 * meant to be auditable, not silent.
 *
 * Do not read a rate into those counts. The 174 searches are 116 from the
 * current corpus (1 correction, 0 rejections) plus 58 chosen for being hard —
 * one-word titles and non-ASCII titles from the expansion list, the two classes
 * most likely to collide (2 corrections, 2 rejections). The second half is an
 * adversarial sample, not a random one, and overstates both numbers.
 *
 * Rejected as too clever, on measurement: letting a fuzzy token overlap rescue
 * the `Allemagne` case would need a threshold that separates it (4 of 5 words
 * shared) from `Spider` against `Spider-Man` (1 of 1 shared, and wrong). Any
 * such threshold would be fitted to two observations. */
async function tmdbMatch(title, year) {
  if (!TMDB_KEY) return null;
  const { auth, kp } = tmdbAuth();
  const s = await cached("tmdb_s_" + title + "_" + (year || ""), () =>
    get("https://api.themoviedb.org/3/search/movie?" + kp + "query=" + encodeURIComponent(title) +
      (year ? "&year=" + year : ""), auth));
  tmdbFatal(s, 'the search for "' + title + '"');
  const results = (s && !s.__error && s.results) || [];
  if (!results.length) return null;

  const q = titleKey(title);
  const titleAgrees = (r) => q !== "" && (titleKey(r.title) === q || titleKey(r.original_title) === q);
  /* An unknown year on either side cannot disagree, and must not be read as
     disagreement — only a known conflict rejects. */
  const yearAgrees = (r) => {
    const ry = releaseYear(r);
    return !year || ry === null || Math.abs(ry - year) <= 1;
  };

  const best = results.find((r) => titleAgrees(r) && yearAgrees(r));
  if (best) {
    if (best !== results[0]) {
      tmdbRepicked.push(title + " (" + year + "): #1 was " + results[0].title +
        " [" + releaseYear(results[0]) + "], took " + best.title + " [" + releaseYear(best) + "]");
    }
    return best;
  }
  if (!results.some(titleAgrees)) {
    if (yearAgrees(results[0])) return results[0];
    tmdbRejected.push(title + " (" + year + "): only " + results[0].title + " [" + releaseYear(results[0]) + "]");
    return null;
  }
  tmdbRejected.push(title + " (" + year + "): this title exists on TMDB only at " +
    results.filter(titleAgrees).map(releaseYear).join(", "));
  return null;
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
  tmdbFatal(d, "the keywords of " + (hit.title || hit.id));
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
  tmdbFatal(im, "the images of " + (hit.title || hit.id));
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
  let matched = 0, withKw = 0, kwTotal = 0, keptPalette = 0, lostPalette = 0, keptKw = 0;

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

    /* Running without a key is a supported mode (AGENTS 6b — "absence of the
       key is not an error"), but it must not be a destructive one. Nothing was
       asked of TMDB this run, so `[]` here is not the finding "this film has no
       keywords", it is "this run did not look" — and writing it deletes 11,757
       keywords across 779 films with no message, exactly the way rewriting the
       file from scratch used to delete every measured palette. Carry them
       forward instead, on the same terms as the palette: same film key, and the
       tmdbId that produced them travels with them so the pair stays coherent.
       When the key IS present the fetched answer always wins, including when it
       is legitimately empty. */
    if (!TMDB_KEY && old && (old.keywords || []).length) {
      out[k].keywords = old.keywords;
      out[k].tmdbId = old.tmdbId || null;
      keptKw++;
    }
  }

  /* REFUSE TO OVERWRITE A COLLAPSE.
   *
   * A run that produces drastically fewer keywords than the file it is about to
   * replace has not enriched anything — it has found a new way to fail quietly,
   * and the write is irreversible. The measured precedent: a wrong TMDB_KEY
   * gave every film `[]`, and the rebuilt corpus differed by ten edges with
   * identical component and orphan counts, so every downstream check passed.
   * The fatal 4xx path above catches the known cause; this catches the ones not
   * yet met (an empty-but-200 response, a search API change, a truncated run),
   * because the cost asymmetry is extreme — a false stop costs one re-run, a
   * missed collapse costs the keyword signal and is invisible.
   *
   * Counted over the films present on BOTH sides, and by films-with-keywords
   * rather than by total keywords. Comparing whole-file totals looks simpler and
   * is wrong twice over: `--in` a subset harvest legitimately produces a smaller
   * file and would be refused, while the harvest that grows 803 → 2,200 changes
   * the denominator under the threshold. Only "films that had keywords and were
   * looked at again" is a like-for-like question. A film whose key changed is
   * outside the comparison because nothing could have been carried forward for
   * it either.
   *
   * The residual hole, stated because it is not covered: if the old films are
   * served from cache while every NEW film fails, the shared set is intact and
   * this stays quiet. Read `tmdb matched` against the film count for that one —
   * an expansion that reports keywords for roughly the old corpus size has
   * failed even though this check passes. */
  const shared = keys.filter((k) => prev[k] && (prev[k].keywords || []).length);
  const kept = shared.filter((k) => (out[k].keywords || []).length);
  if (shared.length > 50 && kept.length < shared.length * 0.5) {
    console.error("\nREFUSED: " + shared.length + " of the films in this run carried keywords in " +
      "pipeline/out/enrich.json; after this run only " + kept.length + " still would.");
    console.error("  Not overwriting it. " + (TMDB_KEY
      ? "TMDB answered " + matched + "/" + keys.length + " searches this run — check TMDB_KEY."
      : "TMDB_KEY is not set, so nothing was fetched and nothing could be carried forward."));
    console.error("  If the loss is intended, move pipeline/out/enrich.json aside and re-run.");
    process.exit(1);
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
    /* Both of these are corrections to TMDB's popularity ranking, and both are
       worth reading: a re-pick is a wrong claim avoided, a rejection is a film
       that lost its keywords to buy that. Print samples, not just counts —
       a summary integer is how the palette loss stayed invisible for a month. */
    if (tmdbRepicked.length) {
      console.log("tmdb re-pick : " + tmdbRepicked.length + " searches where the top-ranked result was a different film");
      for (const line of tmdbRepicked.slice(0, 12)) console.log("               " + line);
      if (tmdbRepicked.length > 12) console.log("               ... and " + (tmdbRepicked.length - 12) + " more");
    }
    if (tmdbRejected.length) {
      console.log("tmdb rejected: " + tmdbRejected.length + " searches with no result at this title and year (these films get no keywords)");
      for (const line of tmdbRejected.slice(0, 12)) console.log("               " + line);
      if (tmdbRejected.length > 12) console.log("               ... and " + (tmdbRejected.length - 12) + " more");
    }
  } else if (keptKw) {
    console.log("keywords     : " + keptKw + " films carried forward from the previous run (no TMDB_KEY set -- nothing was fetched)");
  }
  const missing = keys.filter((k) => !out[k].poster);
  if (missing.length) {
    console.log("\nno image (" + missing.length + "): " + missing.slice(0, 10).map((k) => films[k].title).join(", ") +
      (missing.length > 10 ? ", ..." : ""));
  }
  console.log("\nDONE -- wrote pipeline/out/enrich.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
