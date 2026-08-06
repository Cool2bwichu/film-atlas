/* Wikidata client for the corpus pipeline.
 *
 * Why Wikidata rather than TMDB: it carries director, cinematographer,
 * composer, editor and "based on" as structured statements, needs no API key,
 * and is citable. TMDB remains useful for posters, but posters are optional
 * and lineage is not, so the mechanical spine should not depend on a key the
 * user has to obtain.
 *
 * The SPARQL endpoint is frequently unavailable from restricted networks, so
 * this deliberately uses only the two REST endpoints that are not: the search
 * API and Special:EntityData. That costs one request per entity instead of one
 * query per graph, which is why the disk cache below is not optional.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const UA = "AtlasFilmLineage/0.2 (corpus pipeline; contact: repo owner)";
const CACHE = path.join(__dirname, ".cache");
/* Empirically 120ms still drew 429s; 320ms runs clean. Override with
   ATLAS_THROTTLE_MS when running against a mirror or a local dump. */
const THROTTLE_MS = parseInt(process.env.ATLAS_THROTTLE_MS || "320", 10);
/* ATLAS_OFFLINE=1 builds from the cache alone and skips anything not already
   fetched. Wikidata throttles an address progressively over a long session, so
   a large harvest is naturally done across several runs; offline mode lets you
   produce a complete, working corpus from whatever has landed so far instead
   of waiting for the whole seed list. */
const OFFLINE = process.env.ATLAS_OFFLINE === "1";

/* Properties we read. Anything not listed here is deliberately ignored —
   the spine is built from production facts, not from everything Wikidata
   happens to know. */
const P = {
  instanceOf: "P31",
  director: "P57",
  cinematographer: "P344",
  composer: "P86",
  editor: "P1040",
  screenwriter: "P58",
  publication: "P577",
  basedOn: "P144",
  inspiredBy: "P941",
  country: "P495",
  followedBy: "P156",
  follows: "P155",
  genre: "P136",
  movement: "P135",
  narrativeLocation: "P840",
  mainSubject: "P921",
  cast: "P161",
  author: "P50",
  productionCompany: "P272",
  colour: "P462",
};

/* Q-ids for "film" and the subclasses a feature can be typed as. A Wikidata
   search for a title will happily return an album, a novel or a TV episode
   with the same name, so the type check is load-bearing, not decoration. */
const FILM_TYPES = new Set([
  "Q11424",    // film
  "Q24869",    // feature film
  "Q226730",   // silent film
  "Q506240",   // television film
  "Q202866",   // animated film
  "Q29168811", // animated feature film
  "Q20650540", // live-action/animated film
]);

fs.mkdirSync(CACHE, { recursive: true });

function cachePath(key) {
  return path.join(CACHE, key.replace(/[^A-Za-z0-9_.-]/g, "_") + ".json");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Wikidata returns 429 under sustained sequential load even at a polite
   interval, and a run that gives up on the first one silently produces a
   corpus full of holes — which is exactly what the first run of this pipeline
   did, reporting 40-odd films as "no match" when they were simply throttled.
   A throttle is not a missing film, and the two must never be conflated. */
async function getWithRetry(url, attempt) {
  const n = attempt || 0;
  try {
    return await getOnce(url);
  } catch (e) {
    const retryable = /HTTP 429|HTTP 5\d\d|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN/.test(e.message);
    if (!retryable || n >= 5) throw e;
    const wait = Math.round(700 * Math.pow(1.9, n) + Math.random() * 400);
    process.stderr.write("  (retry " + (n + 1) + " in " + wait + "ms: " + e.message.slice(0, 40) + ")\n");
    await sleep(wait);
    return getWithRetry(url, n + 1);
  }
}

function getOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA, Accept: "application/json" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(getOnce(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode + " for " + url));
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error("bad JSON from " + url)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout: " + url)));
  });
}

const get = getWithRetry;

async function cached(key, fetcher) {
  const p = cachePath(key);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { /* refetch */ }
  }
  if (OFFLINE) throw new Error("offline: not cached");
  const v = await fetcher();
  fs.writeFileSync(p, JSON.stringify(v));
  await sleep(THROTTLE_MS);
  return v;
}

/* Statement-filtered search.
 *
 * wbsearchentities ranks by label match with no type awareness, so "Vertigo"
 * returns a genus of molluscs, a DC Comics imprint and a U2 song before it
 * returns the Hitchcock film — which it never does inside the first seven
 * results. The first run of this pipeline dropped Vertigo, Psycho, Alien,
 * Metropolis and Solaris for exactly this reason, and the failures clustered
 * on the most canonical titles: the more famous the film, the more competing
 * entities share its name. A recall bug that fails hardest on the canon is
 * the worst possible failure distribution for an atlas of cinema.
 *
 * CirrusSearch accepts `haswbstatement:P31=Q11424`, which restricts the query
 * to things typed as films before ranking. Every title above then lands first. */
async function searchFilms(title, limit) {
  const results = [];
  for (const type of ["Q11424", "Q24869", "Q226730"]) {
    const q = encodeURIComponent(title + " haswbstatement:P31=" + type);
    const url = "https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=" +
      q + "&srlimit=" + (limit || 6) + "&format=json";
    let d;
    try { d = await cached("cirrus_" + type + "_" + title, () => get(url)); }
    catch (e) { continue; }
    const hits = ((d.query && d.query.search) || []).map((r) => ({
      id: r.title, label: title, description: String(r.snippet || "").replace(/<[^>]+>/g, ""),
    }));
    for (const h of hits) if (!results.some((r) => r.id === h.id)) results.push(h);
    if (results.length) break;   // the plain film type answers almost every query
  }
  return results;
}

async function search(title, limit) {
  const url = "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=" +
    encodeURIComponent(title) + "&language=en&type=item&limit=" + (limit || 7) + "&format=json";
  const d = await cached("search_" + title, () => get(url));
  return (d.search || []).map((r) => ({ id: r.id, label: r.label, description: r.description || "" }));
}

/* Batch entity fetch — up to 50 ids per request.
   One-at-a-time fetching is fine for 67 films and hopeless for several hundred
   plus the thousands of genre / subject / person entities they reference. */
async function entities(qids) {
  const out = {};
  const need = [];
  for (const q of qids) {
    const p = cachePath("entity_" + q);
    if (fs.existsSync(p)) {
      try {
        const d = JSON.parse(fs.readFileSync(p, "utf8"));
        const e = (d.entities || {})[q];
        if (e) { out[q] = e; continue; }
      } catch (err) { /* refetch */ }
    }
    need.push(q);
  }
  for (let i = 0; OFFLINE ? false : i < need.length; i += 50) {
    const chunk = need.slice(i, i + 50);
    const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" +
      chunk.join("|") + "&props=claims|labels&languages=en&format=json";
    let d;
    try { d = await get(url); } catch (e) { continue; }
    for (const q of chunk) {
      const ent = (d.entities || {})[q];
      if (!ent) continue;
      out[q] = ent;
      fs.writeFileSync(cachePath("entity_" + q), JSON.stringify({ entities: { [q]: ent } }));
    }
    await sleep(THROTTLE_MS);
  }
  return out;
}

/* Labels only, for the thousands of genre/subject/place entities an
   attribute-based engine references but never needs claims from. */
async function labels(qids) {
  const out = {};
  const need = [];
  for (const q of qids) {
    const p = cachePath("label_" + q);
    if (fs.existsSync(p)) {
      try { out[q] = JSON.parse(fs.readFileSync(p, "utf8")).v; continue; } catch (e) { /* refetch */ }
    }
    need.push(q);
  }
  for (let i = 0; OFFLINE ? false : i < need.length; i += 50) {
    const chunk = need.slice(i, i + 50);
    const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" +
      chunk.join("|") + "&props=labels&languages=en&format=json";
    let d;
    try { d = await get(url); } catch (e) { continue; }
    for (const q of chunk) {
      const ent = (d.entities || {})[q];
      const v = (ent && ent.labels && ent.labels.en && ent.labels.en.value) || null;
      out[q] = v;
      fs.writeFileSync(cachePath("label_" + q), JSON.stringify({ v: v }));
    }
    await sleep(THROTTLE_MS);
  }
  return out;
}

async function entity(qid) {
  const d = await cached("entity_" + qid, () =>
    get("https://www.wikidata.org/wiki/Special:EntityData/" + qid + ".json"));
  const ents = d.entities || {};
  return ents[qid] || Object.values(ents)[0] || null;
}

function claimIds(ent, prop) {
  const cs = (ent.claims && ent.claims[prop]) || [];
  const out = [];
  for (const s of cs) {
    if (s.rank === "deprecated") continue;
    const v = s.mainsnak && s.mainsnak.datavalue && s.mainsnak.datavalue.value;
    if (v && v.id) out.push(v.id);
  }
  return out;
}

function earliestYear(ent) {
  const cs = (ent.claims && ent.claims[P.publication]) || [];
  let best = null;
  for (const s of cs) {
    if (s.rank === "deprecated") continue;
    const v = s.mainsnak && s.mainsnak.datavalue && s.mainsnak.datavalue.value;
    if (!v || !v.time) continue;
    const y = parseInt(String(v.time).replace(/^\+/, "").slice(0, 4), 10);
    if (!isNaN(y) && (best === null || y < best)) best = y;
  }
  return best;
}

function label(ent) {
  return (ent.labels && ent.labels.en && ent.labels.en.value) || null;
}

function isFilm(ent) {
  return claimIds(ent, P.instanceOf).some((q) => FILM_TYPES.has(q));
}

/* Resolve a title to a film entity. Prefers a year match when one is supplied,
   because "Solaris" is three films and the search API does not know which one
   the corpus means. Returns null rather than a guess when nothing types as a
   film — an unresolved title is a better outcome than a wrong one. */
async function resolveFilm(title, year) {
  /* statement-filtered first; fall back to the label search only if the
     Cirrus index returns nothing at all */
  let hits = await searchFilms(title);
  if (!hits.length) hits = await search(title);
  const checked = [];
  for (const h of hits) {
    const ent = await entity(h.id);
    if (!ent || !isFilm(ent)) continue;
    checked.push({ qid: h.id, ent: ent, year: earliestYear(ent), label: label(ent) });
  }
  if (!checked.length) return null;
  if (year) {
    const exact = checked.find((c) => c.year === year);
    if (exact) return exact;
    const near = checked.find((c) => c.year && Math.abs(c.year - year) <= 1);
    if (near) return near;
    /* A year was specified and nothing matches it. Refuse rather than return
       a different film that happens to share the title. */
    return null;
  }
  return checked[0];
}

module.exports = { P, search, searchFilms, entity, entities, labels, claimIds, earliestYear, label, isFilm, resolveFilm, FILM_TYPES };
