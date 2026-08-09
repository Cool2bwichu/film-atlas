#!/usr/bin/env node
/* Harvest film attributes from Wikidata via SPARQL.
 *
 *   node pipeline/harvest-sparql.js pipeline/seeds.txt   # -> pipeline/out/harvest.json
 *
 * WHY THIS EXISTS ALONGSIDE harvest.js
 *
 * harvest.js talks to the REST APIs, one request per title plus one per
 * referenced person, place, genre and subject. At 67 films that was fine. At
 * 814 it is roughly 6,000 sequential requests, and Wikidata progressively
 * rate-limits a single address over a long session: the last two runs stalled
 * at 121 and 125 films with sustained 429s. A throttle is not a missing film,
 * but a harvest that cannot finish is a corpus that cannot grow.
 *
 * The original client deliberately avoided SPARQL on the grounds that
 * query.wikidata.org is often unreachable from restricted networks. That is a
 * real risk and the reason harvest.js is kept, working, as the fallback. But
 * when the endpoint IS reachable it collapses ~6,000 requests into ~40, because
 * a graph query returns the whole neighbourhood — values AND their labels — in
 * one response. The label-resolution stage disappears entirely rather than
 * being made faster.
 *
 * Output is byte-compatible with harvest.js: { films, labels, placeTypes }.
 * associate.js cannot tell which one produced it, which is the point — the
 * transport changed, the corpus definition did not.
 *
 * One extra field is carried that the REST path could not cheaply provide:
 * films[k].enwiki, the English Wikipedia article title, taken from the sitelink
 * in the same query. enrich.js uses it to fetch posters without having to ask
 * Wikidata a second time.
 *
 * THREE FIELDS ONLY THIS PATH PRODUCES. `enwiki`, `runtime`/`runtimeCuts`
 * (P2047) and `colour` (P462) are absent from a harvest.js-produced file. The
 * "byte-compatible" promise above is about the SHAPE consumers read — films,
 * labels, placeTypes — not about every key inside a film. Anything downstream
 * that reads these must treat them as optional: `runtime` is null when Wikidata
 * has no usable duration, and `colour` is [] when it records no P462. Do not
 * write a consumer that assumes they are always there, because the REST
 * fallback exists precisely for the runs where the endpoint is unreachable.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");
const { addDirectMovement, addInheritedMovement } = require("./movement-provenance");

const OUT = path.join(__dirname, "out");
const CACHE = path.join(__dirname, ".cache-sparql");
const UA = "AtlasFilmLineage/0.3 (corpus pipeline; https://github.com/atlas-film-lineage)";
const ENDPOINT = "https://query.wikidata.org/sparql";
const THROTTLE_MS = parseInt(process.env.ATLAS_THROTTLE_MS || "900", 10);
const CHUNK = parseInt(process.env.ATLAS_CHUNK || "120", 10);

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const FILM_TYPES = ["Q11424", "Q24869", "Q226730", "Q202866", "Q29168811", "Q20650540", "Q506240"];
const TYPE_VALUES = FILM_TYPES.map((q) => "wd:" + q).join(" ");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

/* ------------------------------------------------------------- transport */

/* POST, because a query listing 120 titles blows past any sane URL length and
   a 414 from a proxy is indistinguishable from a malformed query. */
function post(query) {
  const body = "query=" + encodeURIComponent(query) + "&format=json";
  return new Promise((resolve, reject) => {
    const req = https.request(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        "Accept": "application/sparql-results+json",
        "Accept-Encoding": "gzip",
      },
    }, (res) => {
      const chunks = [];
      /* `res` needs its own error handler even though the gunzip below has one:
         .pipe() does not forward a source error to its destination. On a socket
         reset mid-body -- or after a complete body has arrived but before the
         connection closes -- `res` emits "error" with zero listeners, the gunzip
         emits neither "end" nor "error", and this promise never settles. The
         process then hangs forever with no output and no exception, and
         req.setTimeout does not rescue it: that arms an inactivity timer on a
         socket that has already been destroyed. WDQS answers this pipeline with
         content-encoding: gzip, so the piped branch -- the one where the
         handler is missing -- is the live branch on every one of the ~290
         queries a full harvest makes. */
      res.on("error", reject);
      const stream = /gzip/.test(res.headers["content-encoding"] || "") ? res.pipe(zlib.createGunzip()) : res;
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode + ": " + text.slice(0, 120)));
        try { resolve(JSON.parse(text)); } catch (e) { reject(new Error("bad JSON: " + text.slice(0, 120))); }
      });
      stream.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

/* The query service enforces a 60s wall-clock limit and returns 429 with a
   Retry-After under load. Both are retryable; a malformed query is not, and
   retrying it five times only wastes a minute — so only transport-shaped
   failures are retried. */
async function sparql(label, query, attempt) {
  const key = path.join(CACHE, label + "_" + hash(query) + ".json");
  if (fs.existsSync(key)) {
    try { return JSON.parse(fs.readFileSync(key, "utf8")); } catch (e) { /* refetch */ }
  }
  const n = attempt || 0;
  try {
    const d = await post(query);
    const rows = (d.results && d.results.bindings) || [];
    fs.writeFileSync(key, JSON.stringify(rows));
    await sleep(THROTTLE_MS);
    return rows;
  } catch (e) {
    /* Matched against the code as well as the message. A mid-body socket reset
       arrives as { code: "ECONNRESET", message: "aborted" } -- the message
       alone matches none of these alternatives, so testing it on its own
       classifies the single most common transport failure on this route as
       permanent and returns null. That would convert the hang fixed in post()
       into something quieter and worse: a resolve chunk of up to CHUNK seeds
       dropped after one attempt. */
    const retryable = /HTTP 429|HTTP 5\d\d|timeout|ECONNRESET|ECONNABORTED|ETIMEDOUT|EPIPE|EAI_AGAIN|ERR_STREAM_PREMATURE_CLOSE|socket hang up/
      .test((e.code || "") + " " + e.message);
    if (!retryable || n >= 4) { process.stderr.write("  ! " + label + ": " + e.message.slice(0, 90) + "\n"); return null; }
    const wait = Math.round(2000 * Math.pow(1.8, n) + Math.random() * 800);
    process.stderr.write("  (retry " + (n + 1) + " in " + wait + "ms: " + e.message.slice(0, 50) + ")\n");
    await sleep(wait);
    return sparql(label, query, n + 1);
  }
}

const qid = (uri) => (uri || "").replace("http://www.wikidata.org/entity/", "");
const cell = (row, k) => (row[k] ? row[k].value : null);

/* ------------------------------------------------------------- palette */
/* Unchanged from harvest.js -- era sets the family, the film varies within it.
   Duplicated rather than imported because harvest.js is a script, not a module,
   and splitting it into one would be a refactor this change does not need. */
const ERA = [
  { until: 1929, shadow: "#12161A", highlight: "#C3CBD2" },
  { until: 1949, shadow: "#14150F", highlight: "#C8BE9E" },
  { until: 1965, shadow: "#161310", highlight: "#C9B486" },
  { until: 1979, shadow: "#1A1410", highlight: "#D8A75E" },
  { until: 1992, shadow: "#0C141C", highlight: "#5FB7C9" },
  { until: 2006, shadow: "#1B1016", highlight: "#D98CA6" },
  { until: 9999, shadow: "#101A20", highlight: "#7FA6B8" },
];
function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function toHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function toHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const seg = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h / 60) % 6];
  return "#" + seg.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
function palette(key, year) {
  const era = ERA.find((e) => (year || 2000) <= e.until) || ERA[ERA.length - 1];
  const h = hash32(key);
  const hueShift = (h % 47) - 23;
  const satShift = (((h >> 8) % 21) - 8) / 100;
  const litShift = (((h >> 16) % 15) - 7) / 200;
  const mk = (hex, lMul, floor) => {
    const [hh, ss, ll] = toHsl(hex);
    return toHex(hh + hueShift, Math.max(floor, Math.min(0.62, ss + satShift)),
      Math.max(0.03, Math.min(0.88, ll + litShift * lMul)));
  };
  return { shadow: mk(era.shadow, 0.5, 0.16), highlight: mk(era.highlight, 1, 0.24) };
}

const slugKey = (t) => String(t).toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function parseSeeds(text) {
  return text.split("\n").map((l) => l.trim()).filter((l) => l && l[0] !== "#")
    .map((l) => {
      const m = l.match(/^(.*?)\s*\((\d{4})\)\s*$/);
      return m ? { title: m[1].trim(), year: parseInt(m[2], 10) } : { title: l, year: null };
    });
}

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

/* --------------------------------------------------------------- resolve */

/* Two Wikidata items can share a title AND a release year. "Duel" (1971) is
   both Spielberg's TV movie and Chang Cheh's wuxia film; "Earth" (1930) is both
   Dovzhenko's and a Macedonian short. Taking whichever row the endpoint
   happened to return first is not a choice, it is a coin flip -- and it has
   already put the wrong film under two shipped corpus keys. Being wrong once is
   the smaller half of the problem: an unordered pick means a resume or a re-run
   can flip the coin the other way and swap the film out from under an existing
   slug, taking that slug's authored readings with it.

   So the pick is ordered, and the order is:

     1. an English Wikipedia sitelink beats none. A film with an en.wikipedia
        article is the film an English-language seed list means. Measured
        against live WDQS on 2026-08-08 this alone decides Earth (Q55188 over
        the sitelink-less Q12280475), Titanic, The Witch and Happy Together.
     2. an exact rdfs:label match beats an alias hit. The query deliberately
        reaches films through skos:altLabel as well (see resolveTitles), which
        is how the seed "Duel" also matches a film LABELLED "The Duel"; the film
        whose own label is the seed is the better reading of it. Measured: this
        decides Duel (Q583407 over Q17498893) and War of the Worlds (Spielberg's
        Q202028 over the Asylum mockbuster Q1788591).
     3. lowest QID, and say so. What survives both rules is a genuine tie
        between two real films and no rule breaks it honestly. The warning is
        the point: it tells a human which lines to settle in qid-overrides.json.

   `ORDER BY ?f` on the query is belt-and-braces on top of this sort -- the sort
   alone is a total order, so it decides the pick either way. The clause earns
   its place by making the CACHED response bytes reproducible, so a warm-cache
   resume and a cold run agree byte for byte instead of merely agreeing on the
   winner. */
const qnum = (q) => parseInt(String(q).slice(1), 10) || 0;
function betterCandidate(a, b) {
  if (!!a.article !== !!b.article) return a.article ? -1 : 1;
  if (a.exact !== b.exact) return b.exact - a.exact;
  return qnum(a.qid) - qnum(b.qid);
}

/* Hand-pinned resolutions for the ties rule 3 cannot break, and for any film
   the rules get wrong. Keyed by the seed line lowercased -- "duel (1971)" --
   because that is the string a human is looking at when they decide. A missing
   file means no overrides: this is a correction sheet, not a dependency, and
   the resolver must work without it. */
function loadOverrides() {
  const p = path.join(__dirname, "qid-overrides.json");
  if (!fs.existsSync(p)) return {};
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const map = {};
  for (const k of Object.keys(raw)) {
    if (k[0] === "_") continue;                       /* "_note" and friends */
    map[k.toLowerCase()] = typeof raw[k] === "string" ? raw[k] : raw[k].qid;
  }
  return map;
}
const seedLine = (s) => (s.title + (s.year ? " (" + s.year + ")" : "")).toLowerCase();

/* Slug disambiguation, FIRST WINS.
   slugKey() keys on the title alone, so Psycho (1960) and Psycho (1998) claim
   the same key -- and the loser used to disappear without a line of output, 27
   films across the merged seed list. First-wins is the load-bearing half of the
   rule, not an implementation detail: the film already in the corpus keeps its
   bare slug, so no existing key is renamed, no hand-written Hitchcock reading
   is re-targeted onto Van Sant's remake (AGENTS rule 8), and no saved
   "#/film/psycho" URL changes meaning. The newcomer takes "psycho 1998", which
   is the shape of keys this corpus already carries ("2001 a space odyssey",
   "8") and which the app's hash route round-trips through
   encodeURIComponent/decodeURIComponent.

   Returns key:null only when title, year AND film all collide. That is a
   genuine loss; the caller reports it rather than swallowing it. */
function claimKey(out, base, filmQid, year) {
  if (!out[base]) return { key: base, status: "new" };
  if (out[base].qid === filmQid) return { key: base, status: "dupe" };
  const alt = base + " " + (year || "x");
  if (!out[alt]) return { key: alt, status: "renamed" };
  if (out[alt].qid === filmQid) return { key: alt, status: "dupe" };
  return { key: null, status: "collided" };
}

/* Matching on rdfs:label alone loses every film the seed list spells without
   diacritics -- "La Jetee" is labelled "La Jetée" -- so skos:altLabel is
   included, which is where Wikidata keeps exactly those variants. Type and
   year still do the discriminating: the mollusc-genus failure mode is a
   property of unfiltered label search, not of which label field is read. */
/* ?exact IS BOUND BY A `VALUES` PAIR, NOT BY TWO `BIND`s INSIDE A UNION, AND
   THAT IS A PERFORMANCE CONSTRAINT RATHER THAN A STYLE CHOICE.

   The obvious way to record which label field matched is
     { ?f rdfs:label ?match . BIND(1 AS ?exact) }
     UNION { ?f skos:altLabel ?match . BIND(0 AS ?exact) }
   and it is correct. It is also fatal here: a BIND inside a UNION branch
   changes Blazegraph's join plan, and at the real CHUNK of 120 seed titles the
   query stops finishing. Measured against live WDQS, interleaved on the same
   chunk of seeds-expansion.txt so a load blip cannot explain it:

     this form (VALUES pair)            200 in  1.7s / 2.3s, 475 KB
     BIND-inside-UNION form             502 after 39.3s, then 504 after 65.5s
     pre-?exact form (no BIND at all)   200 in  1.2s

   The responses carry Wikimedia's own edge headers, so this is WDQS's 60 s
   limit, not the proxy. It is data-dependent as well as size-dependent -- it
   also fires at 20 titles -- which is exactly why a 6- or 19-title smoke test
   passes and hides it. Through the pipeline the consequence is silent: five
   attempts and ~350 s burned per chunk, then the chunk is recorded as
   "unresolved", the seed accounting balances because unresolved is a legitimate
   bucket, and the run writes a harvest.json with zero films.

   The two forms are equivalent, not merely similar. On the same 120 titles both
   return 639 rows and the same 279 distinct (match, film) pairs -- 0 added, 0
   dropped -- with ?exact bound on 639 of 639 rows, so the exact-label tier of
   the ranking below reads the same input either way.

   If ?exact ever needs a third source, extend the VALUES pair. Do not reach for
   BIND. */
async function resolveTitles(seeds, stats) {
  const overrides = loadOverrides();
  const byTitle = {};
  const groups = chunks(seeds, CHUNK);
  let i = 0;
  for (const g of groups) {
    const values = g.map((s) => '"' + esc(s.title) + '"@en').join(" ");
    const q = `
SELECT ?match ?f ?fLabel ?year ?article ?exact WHERE {
  VALUES ?match { ${values} }
  VALUES ?type { ${TYPE_VALUES} }
  VALUES (?lp ?exact) { (rdfs:label 1) (skos:altLabel 0) }
  ?f ?lp ?match .
  ?f wdt:P31 ?type .
  OPTIONAL { ?f wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?article schema:about ?f ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?f`;
    const rows = await sparql("resolve_" + i, q);
    i++;
    /* A null here is five failed attempts, not an empty answer, and it takes up
       to CHUNK seeds with it. Downstream those seeds are indistinguishable from
       films Wikidata does not have, so say it out loud at the only place that
       still knows the difference. */
    if (!rows) {
      stats.chunkFailures++;
      process.stderr.write("  !! resolve chunk " + i + "/" + groups.length + " FAILED after retries -- "
        + g.length + " seeds were never asked about\n");
    }
    for (const r of rows || []) {
      const t = cell(r, "match");
      const q2 = qid(cell(r, "f"));
      if (!t || !q2) continue;
      (byTitle[t] = byTitle[t] || {});
      const rec = byTitle[t][q2] = byTitle[t][q2] || { qid: q2, label: cell(r, "fLabel"), years: [], article: null, exact: 0 };
      /* One item can arrive on both UNION branches (label and alias spelled the
         same); the exact-label branch is the one that should count. */
      rec.exact = Math.max(rec.exact, parseInt(cell(r, "exact") || "0", 10) || 0);
      const y = cell(r, "year");
      if (y && rec.years.indexOf(+y) < 0) rec.years.push(+y);
      const a = cell(r, "article");
      if (a && !rec.article) rec.article = decodeURIComponent(a.split("/wiki/")[1] || "").replace(/_/g, " ");
    }
    process.stdout.write("  resolved batch " + i + "/" + groups.length + "\n");
  }

  /* A film's publication dates include festival premieres and later national
     releases, so a seed year can legitimately match any of them. Earliest is
     the canonical year, but the match must consider all of them or Parasite
     (2019 Cannes, 2019 KR, 2020 US) resolves inconsistently. */
  const out = {};
  const unresolved = [];
  const collided = [];
  for (const s of seeds) {
    const cands = Object.values(byTitle[s.title] || {}).sort(betterCandidate);
    /* Sorted so the "found N, years ..." line written into unresolved.txt --
       a git-tracked file -- is the same text on every run. */
    for (const c of cands) c.years.sort((x, y) => x - y);
    if (!cands.length) { unresolved.push(s.title + (s.year ? " (" + s.year + ")" : "")); continue; }

    let pick = null;
    const forced = overrides[seedLine(s)];
    if (forced) {
      pick = cands.find((c) => c.qid === forced) || null;
      if (pick) stats.overridden++;
      else console.warn("  !! override " + seedLine(s) + " -> " + forced
        + " matched none of " + cands.length + " candidates; falling through to the ranked pick");
    }
    if (!pick && s.year) {
      const exactYear = cands.filter((c) => c.years.indexOf(s.year) > -1);
      pick = exactYear[0] || cands.find((c) => c.years.some((y) => Math.abs(y - s.year) <= 1)) || null;
      if (!pick) { unresolved.push(s.title + " (" + s.year + " — found " + cands.length + ", years " +
        cands.map((c) => c.years[0]).join("/") + ")"); continue; }
      if (exactYear.length > 1) {
        stats.ambiguous++;
        /* Two real films, same title, same year, and rules 1 and 2 separated
           neither. The QID tiebreak keeps the run repeatable but it is not an
           answer -- a person has to look at these. */
        const runnerUp = exactYear[1];
        if (!!pick.article === !!runnerUp.article && pick.exact === runnerUp.exact) {
          stats.tied++;
          console.warn("  !! ambiguous " + s.title + " (" + s.year + ") -> " + pick.qid
            + " by lowest QID; also " + exactYear.slice(1).map((c) => c.qid).join(", ")
            + "  [settle it in pipeline/qid-overrides.json]");
        }
      }
    } else if (!pick) {
      pick = cands[0];
    }

    const year = pick.years.length ? Math.min.apply(null, pick.years) : null;
    const base = slugKey(pick.label || s.title);
    const claim = claimKey(out, base, pick.qid, year);
    if (claim.status === "dupe") { stats.dupe++; continue; }
    if (claim.status === "collided") {
      stats.collided++;
      collided.push(s.title + (s.year ? " (" + s.year + ")" : "")
        + " — key collision: \"" + base + "\" and \"" + base + " " + (year || "x") + "\" both taken");
      continue;
    }
    if (claim.status === "renamed") stats.renamed++;
    out[claim.key] = { qid: pick.qid, label: pick.label || s.title, year: year, article: pick.article };
  }
  return { films: out, unresolved: unresolved, collided: collided };
}

/* ------------------------------------------------------------ attributes */

/* One query per property across all films in a chunk, values and labels
   together. The REST path needed a second pass over several thousand entities
   purely to turn Q-ids into words; here the label service does it inline. */
async function fetchProp(name, prop, qids) {
  const rows = [];
  const groups = chunks(qids, CHUNK);
  let i = 0;
  for (const g of groups) {
    const values = g.map((q) => "wd:" + q).join(" ");
    const q = `
SELECT ?f ?v ?vLabel WHERE {
  VALUES ?f { ${values} }
  ?f wdt:${prop} ?v .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
    const r = await sparql(name + "_" + i, q);
    i++;
    if (r) rows.push.apply(rows, r);
  }
  return rows;
}

/* --------------------------------------------------------------- duration
 *
 * P2047 does not go through fetchProp, and the reason is not tidiness — it is
 * that fetchProp reads `wdt:` and would produce a WRONG NUMBER rather than a
 * missing one.
 *
 * A quantity statement carries an amount and a unit, and `wdt:P2047` exposes
 * only the amount. Measured against live WDQS on 2026-08-09 over every
 * Q11424, the units actually in use are:
 *
 *     Q7727  minute  161,134     Q199    "1" (unitless)  24
 *     Q11574 second    1,049     Q11573  metre            3
 *     Q25235 hour        149     six other singletons
 *
 * So roughly 1,200 statements are NOT in minutes. Reading the bare amount
 * turns a 90-minute film recorded in seconds into 5,400 and a 2-hour film
 * recorded in hours into 2 — errors of 60x in both directions, silently, on
 * the exact tail (shorts, silents, hand-entered items) this corpus is full of.
 * Q11573 is worse than a unit error: it is film LENGTH IN METRES entered
 * against the duration property, a different physical quantity wearing the
 * same field.
 *
 * Unitless (Q199) is dropped rather than assumed to be minutes. Twenty-four
 * statements is small enough to guess at and that is exactly why it should not
 * be: a guess here is indistinguishable in the output from a record, which is
 * the AGENTS rule 8 line. A dropped value reads as "Wikidata does not say";
 * a guessed one reads as a fact.
 */
const DURATION_UNITS = { Q7727: 1, Q11574: 1 / 60, Q25235: 60 };

/* Lower median of the distinct minute values, not the mean and not the first.
   A film with several duration statements has several CUTS — theatrical,
   director's, a restoration, a 16-vs-24fps silent transfer — and averaging
   them produces a runtime no print has ever had. The lower median lands on the
   theatrical figure for the common two-statement case (139 / 170 -> 139) and
   resists a single outlying restoration when there are three or more.
   `cuts` ships beside it so the collapse is visible: a reader who needs to
   know that this film's runtime is contested can see it in the record instead
   of trusting a scalar that hides it. */
function pickRuntime(minutes) {
  const distinct = [...new Set(minutes.map((m) => Math.round(m)))].sort((a, b) => a - b);
  if (!distinct.length) return { value: null, cuts: 0 };
  return { value: distinct[Math.floor((distinct.length - 1) / 2)], cuts: distinct.length };
}

/* Statement-level rather than truthy, because rank has to be read: a
   deprecated duration is usually a value an editor has explicitly marked
   WRONG, and `wdt:` would hide that decision by simply not returning it in
   some cases and returning it in others. Preferred wins outright where an
   editor has nominated a canonical runtime; otherwise every non-deprecated
   statement counts and pickRuntime decides. */
async function fetchDuration(qids, stats) {
  const byFilm = {};
  const groups = chunks(qids, CHUNK);
  let i = 0;
  for (const g of groups) {
    const values = g.map((q) => "wd:" + q).join(" ");
    const q = `
SELECT ?f ?v ?unit ?rank WHERE {
  VALUES ?f { ${values} }
  ?f p:P2047 ?st .
  ?st psv:P2047 ?node .
  ?node wikibase:quantityAmount ?v .
  ?node wikibase:quantityUnit ?unit .
  ?st wikibase:rank ?rank .
}`;
    const rows = await sparql("duration_" + i, q);
    i++;
    for (const r of rows || []) {
      const f = qid(cell(r, "f"));
      const rank = cell(r, "rank") || "";
      if (/DeprecatedRank$/.test(rank)) { stats.deprecated++; continue; }
      const unit = qid(cell(r, "unit"));
      const factor = DURATION_UNITS[unit];
      if (!factor) { stats.badUnit++; continue; }
      const amount = parseFloat(cell(r, "v"));
      /* Non-positive and non-finite amounts are corrupt, not short. */
      if (!Number.isFinite(amount) || amount <= 0) { stats.badAmount++; continue; }
      const rec = byFilm[f] = byFilm[f] || { preferred: [], normal: [] };
      rec[/PreferredRank$/.test(rank) ? "preferred" : "normal"].push(amount * factor);
    }
  }
  const out = {};
  for (const f of Object.keys(byFilm)) {
    const rec = byFilm[f];
    out[f] = pickRuntime(rec.preferred.length ? rec.preferred : rec.normal);
  }
  return out;
}

async function main() {
  const seeds = parseSeeds(fs.readFileSync(process.argv[2] || path.join(__dirname, "seeds.txt"), "utf8"));
  console.log("seeds: " + seeds.length);

  const stats = { renamed: 0, dupe: 0, collided: 0, ambiguous: 0, tied: 0, overridden: 0, chunkFailures: 0 };
  const { films: resolved, unresolved, collided } = await resolveTitles(seeds, stats);
  console.log("resolved by SPARQL: " + Object.keys(resolved).length + " films, " + unresolved.length + " unresolved");

  /* ---- fallback for the stragglers ----
     SPARQL matches a label or an alias exactly, so it misses a seed whose
     punctuation differs from Wikidata's -- "The Good the Bad and the Ugly"
     against "The Good, the Bad and the Ugly". Rather than correct seeds one at
     a time forever, hand the remainder to the REST resolver, which ranks
     fuzzily through CirrusSearch and already knows how to refuse a wrong film.
     The volume is small by construction, so the rate limit that makes REST
     unusable for 800 titles is irrelevant for 40. */
  let stillMissing = unresolved;
  if (unresolved.length && process.env.ATLAS_NO_FALLBACK !== "1") {
    const wd = require("./wikidata");
    stillMissing = [];
    let recovered = 0;
    console.log("REST fallback for " + unresolved.length + " unresolved titles ...");
    for (const line of unresolved) {
      const m = line.match(/^(.*?)\s*\((\d{4})/);
      const title = m ? m[1].trim() : line.trim();
      const year = m ? parseInt(m[2], 10) : null;
      let hit = null;
      try { hit = await wd.resolveFilm(title, year); } catch (e) { /* throttled or absent */ }
      if (!hit) { stillMissing.push(line); continue; }
      /* The old code here was `if (resolved[key]) continue;` -- which dropped
         the film from `resolved`, never pushed it to stillMissing, and then let
         the count below report it as recovered. A film could disappear from the
         corpus AND from unresolved.txt in the same statement. Same first-wins
         rule as the SPARQL path, and every outcome lands in a bucket. */
      const base = slugKey(hit.label || title);
      const claim = claimKey(resolved, base, hit.qid, hit.year || year);
      if (claim.status === "dupe") { stats.dupe++; continue; }
      if (claim.status === "collided") {
        stats.collided++;
        collided.push(line + " — key collision on REST recovery: \"" + base + "\" taken");
        continue;
      }
      if (claim.status === "renamed") stats.renamed++;
      const article = (hit.ent && hit.ent.sitelinks && hit.ent.sitelinks.enwiki
        && hit.ent.sitelinks.enwiki.title) || null;
      resolved[claim.key] = { qid: hit.qid, label: hit.label || title, year: hit.year || year, article: article };
      recovered++;
    }
    console.log("  recovered " + recovered + ", still missing " + stillMissing.length);
  }
  const missing = stillMissing.concat(collided);

  const keys = Object.keys(resolved);
  console.log("resolved: " + keys.length + " unique films");

  /* Every seed line ends in exactly one bucket, and the buckets have to add
     back up to the number of lines read. This is the point of the tally: the
     failure it guards against -- a film silently discarded because something
     else already held its slug -- is invisible in every other number the run
     prints, including "resolved: N unique films". Here it is an arithmetic
     error. */
  const accounted = keys.length + stillMissing.length + collided.length + stats.dupe;
  console.log("\nseeds " + seeds.length + " | resolved " + keys.length
    + " | unresolved " + stillMissing.length + " | renamed " + stats.renamed
    + " | dupe " + stats.dupe + " | collided " + stats.collided);
  if (stats.ambiguous) console.log("  same-title-same-year candidates: " + stats.ambiguous
    + " (" + stats.tied + " decided by QID alone, listed above)");
  if (stats.overridden) console.log("  pinned by qid-overrides.json: " + stats.overridden);
  if (stats.chunkFailures) console.log("  FAILED resolve chunks: " + stats.chunkFailures);
  /* A FAILED CHUNK IS A HOLE, AND NOTHING ELSE IN THE RUN CAN SEE IT.

     The accounting assertion below structurally cannot catch this: a chunk that
     five times failed to answer leaves its seeds in the `unresolved` bucket,
     which is a legitimate bucket, so the arithmetic balances perfectly while up
     to CHUNK films are missing. `check-harvest.js` catches only holes that
     swallow one of the films already in the corpus -- a chunk landing entirely
     inside seeds-expansion.txt is 120 NEW films that no downstream check knows
     to expect. And the REST fallback will then be handed those titles, which is
     the rate-limited path this file exists to avoid.

     So the site that knows refuses. Exiting before the property fetches also
     saves the ~250 queries that would decorate a corpus with a hole in it; the
     per-chunk responses that did succeed are already in .cache-sparql/, so a
     re-run resumes rather than restarts. */
  if (stats.chunkFailures) {
    console.error("!! " + stats.chunkFailures + " resolve chunk(s) never answered. Up to "
      + (stats.chunkFailures * CHUNK) + " films are missing from this harvest and nothing "
      + "downstream can tell them from films Wikidata does not have. Re-run to resume "
      + "from .cache-sparql/; nothing has been written.");
    process.exit(1);
  }
  if (accounted !== seeds.length) {
    console.error("!! seed accounting does not balance: " + accounted + " accounted for, "
      + seeds.length + " lines read. A film has been dropped without being counted.");
    process.exit(1);
  }

  const qids = keys.map((k) => resolved[k].qid);
  const labels = {};
  const films = {};
  for (const k of keys) {
    const r = resolved[k];
    const pal = palette(k, r.year);
    films[k] = {
      title: r.label, year: r.year, qid: r.qid, director: "",
      shadow: pal.shadow, highlight: pal.highlight, paletteSource: "era",
      enwiki: r.article || null,
      runtime: null, runtimeCuts: 0,
      crew: {}, genre: [], movementDirect: [], movementInherited: [], movement: [], setting: [], subject: [], cast: [],
      studio: [], country: [], basedOn: [], sourceAuthors: [], colour: [],
    };
  }
  const byQid = {};
  for (const k of keys) byQid[resolved[k].qid] = films[k];

  const PROPS = [
    ["director", "P57", "crew"], ["cinematographer", "P344", "crew"],
    ["editor", "P1040", "crew"], ["composer", "P86", "crew"], ["screenwriter", "P58", "crew"],
    ["genre", "P136", "flat"], ["movement", "P135", "flat"], ["setting", "P840", "flat"],
    ["subject", "P921", "flat"], ["cast", "P161", "flat"], ["studio", "P272", "flat"],
    ["country", "P495", "flat"], ["basedOn", "P144", "flat"], ["inspiredBy", "P941", "flat"],
    /* P462 is a RECORD about the print — Q838368 black-and-white, Q22006653
       colour — and it is the field the `silver-print` register should rest on.
       It currently rests on the TMDB keyword "black and white", which is a
       third-party editorial tag on a film's page, not a property of the
       photography. The poster palette cannot substitute: a source audit
       measured minimum highlight chroma 23.8 across 2,008 films, so no
       achromatic highlight exists in this corpus at all, and monochrome films
       carry slightly HIGHER median poster saturation (0.601 vs 0.568) because
       a one-sheet for a black-and-white film is routinely printed in colour.
       The poster is marketing; P462 is the print. */
    ["colour", "P462", "flat"],
  ];

  for (const [name, prop, kind] of PROPS) {
    const rows = await fetchProp(name, prop, qids);
    let n = 0;
    for (const r of rows) {
      const f = byQid[qid(cell(r, "f"))];
      const v = qid(cell(r, "v"));
      if (!f || !v) continue;
      const lab = cell(r, "vLabel");
      if (lab && !/^Q\d+$/.test(lab)) labels[v] = lab;
      if (kind === "crew") { (f.crew[name] = f.crew[name] || []); if (f.crew[name].indexOf(v) < 0) f.crew[name].push(v); }
      else if (name === "movement") {
        addDirectMovement(f, v);
      } else {
        const target = name === "inspiredBy" ? "basedOn" : name;
        if (f[target].indexOf(v) < 0) f[target].push(v);
      }
      n++;
    }
    console.log("  " + name.padEnd(15) + rows.length + " statements");
  }

  for (const f of Object.values(films)) f.cast = f.cast.slice(0, 12);

  /* ---- runtime ---- */
  const durStats = { deprecated: 0, badUnit: 0, badAmount: 0 };
  const durations = await fetchDuration(qids, durStats);
  let withRuntime = 0, contested = 0;
  for (const k of keys) {
    const d = durations[resolved[k].qid];
    if (!d || d.value == null) continue;
    films[k].runtime = d.value;
    films[k].runtimeCuts = d.cuts;
    withRuntime++;
    if (d.cuts > 1) contested++;
  }
  console.log("  " + "runtime".padEnd(15) + withRuntime + " films (" + contested + " with more than one recorded cut)");
  /* Rejections are printed, never folded into "no duration". A film with a
     metre-valued P2047 is not a film Wikidata is silent about, and the two
     have to stay tellable apart if anyone later asks why coverage is short. */
  if (durStats.deprecated || durStats.badUnit || durStats.badAmount) {
    console.log("  " + "".padEnd(15) + "rejected: " + durStats.deprecated + " deprecated, "
      + durStats.badUnit + " unusable unit, " + durStats.badAmount + " non-positive amount");
  }

  /* ---- authors of the works films adapt ---- */
  const works = [...new Set(Object.values(films).flatMap((f) => f.basedOn))];
  console.log("source works: " + works.length);
  const authorRows = await fetchProp("authors", "P50", works);
  const workAuthors = {};
  for (const r of authorRows) {
    const w = qid(cell(r, "f")), a = qid(cell(r, "v"));
    if (!w || !a) continue;
    (workAuthors[w] = workAuthors[w] || []).push(a);
    const lab = cell(r, "vLabel");
    if (lab && !/^Q\d+$/.test(lab)) labels[a] = lab;
  }
  for (const f of Object.values(films)) {
    for (const w of f.basedOn) for (const a of workAuthors[w] || []) if (f.sourceAuthors.indexOf(a) < 0) f.sourceAuthors.push(a);
  }

  /* ---- a director's declared movement counts for their films ---- */
  const directors = [...new Set(Object.values(films).flatMap((f) => f.crew.director || []))];
  console.log("directors: " + directors.length);
  const dirMoveRows = await fetchProp("dirmovement", "P135", directors);
  const dirMove = {};
  for (const r of dirMoveRows) {
    const d = qid(cell(r, "f")), m = qid(cell(r, "v"));
    if (!d || !m) continue;
    (dirMove[d] = dirMove[d] || []).push(m);
    const lab = cell(r, "vLabel");
    if (lab && !/^Q\d+$/.test(lab)) labels[m] = lab;
  }
  for (const f of Object.values(films)) {
    for (const d of f.crew.director || []) for (const m of dirMove[d] || []) addInheritedMovement(f, m, d);
  }

  /* ---- what kind of place is each setting ----
     "Both set in Arizona" is administrative trivia; "both set in Kyoto" is a
     fact about the film's world, and only the place's own type separates them. */
  const places = [...new Set(Object.values(films).flatMap((f) => f.setting))];
  console.log("settings: " + places.length);
  const placeRows = await fetchProp("placetype", "P31", places);
  const placeTypes = {};
  for (const p of places) placeTypes[p] = [];
  for (const r of placeRows) {
    const p = qid(cell(r, "f")), t = qid(cell(r, "v"));
    if (p && t && placeTypes[p]) placeTypes[p].push(t);
  }

  for (const f of Object.values(films)) {
    f.director = (f.crew.director || []).map((q) => labels[q] || q).filter(Boolean).join(", ");
  }

  fs.writeFileSync(path.join(OUT, "harvest.json"),
    JSON.stringify({ films: films, labels: labels, placeTypes: placeTypes }, null, 1));

  console.log("\nfilms      : " + Object.keys(films).length);
  console.log("labels     : " + Object.keys(labels).length);
  /* unresolved.txt is git-tracked, so a run that resolves everything must
     DELETE it, not skip writing it. Leaving the previous run's list behind
     turns a stale result into committed state that reads as current -- the
     file would still name eight missing films after the run that found them. */
  const unresolvedPath = path.join(OUT, "unresolved.txt");
  if (missing.length) {
    console.log("unresolved : " + missing.length);
    missing.slice(0, 15).forEach((u) => console.log("   - " + u));
    if (missing.length > 15) console.log("   ... and " + (missing.length - 15) + " more");
    fs.writeFileSync(unresolvedPath, missing.join("\n"));
  } else {
    fs.rmSync(unresolvedPath, { force: true });
  }
  console.log("\nDONE -- wrote pipeline/out/harvest.json");
}

/* Exported so a measurement of a harvested field runs the SAME fetcher the
   harvest runs, against the same .cache-sparql/ keys — the reason plot-source.js
   exports runGate1 to axis-gates.js. A field measured by a second copy of the
   query is a field whose coverage number can disagree with the corpus. */
module.exports = { fetchProp, fetchDuration, pickRuntime, sparql, DURATION_UNITS, CHUNK };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
