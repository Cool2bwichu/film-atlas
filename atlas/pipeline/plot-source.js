#!/usr/bin/env node
/* plot-source.js — the PLOT SECTION, and nothing else, as scorer input.
 *
 * WHY THIS FILE EXISTS AT ALL
 *
 * The fingerprint layer needs prose that describes how a film behaves. The
 * shipped 236-char description does not carry it. The obvious fix — drop
 * `exintro=1` and take the whole article — is FORBIDDEN, and the reason is
 * measured, not aesthetic: article length is a fame gradient (rho 0.856 against
 * 60-day Wikipedia pageviews) where the shipped description is fame-flat
 * (0.149) purely because the truncation flattens it. Feeding full articles to
 * the scorer would make the most fame-correlated variable in the pipeline the
 * thing that decides what the graph says, and AGENTS rule 1 forbids popularity
 * entering the graph.
 *
 * The five surviving axes were chosen because a PLOT SUMMARY carries them.
 * So this stage takes the plot section alone: not the lead, not reception, not
 * production, not style. Whether *that* is fame-flat is the open question, and
 * this file answers it before it will write anything — see GATE 1.
 *
 * WHAT IT REFUSES TO DO
 *
 *   - It will not write `out/plots.json` if GATE 1 fails. Not a warning, not a
 *     flag in the output: no file. The build stops.
 *   - Its output is SCORER INPUT ONLY and must never be merged into
 *     `static/corpus.json`. The shipped payload is already 13.4 MB; plot text
 *     would roughly double it, and none of it is needed at runtime.
 *
 * USAGE
 *
 *   node pipeline/plot-source.js --sample 400        # stratified sample, gate, write
 *   node pipeline/plot-source.js --all               # whole corpus
 *   node pipeline/plot-source.js --sample 400 --dry  # measure, never write
 *
 *   # GATE BREAK (this MUST fail, and you should watch it fail):
 *   node pipeline/plot-source.js --sample 400 --gate-source full
 *
 * Every network stage caches to disk and is resumable, like every other
 * networked stage in this pipeline.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const nodeCrypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const CACHE_WIKITEXT = path.join(__dirname, ".cache-plots");
const CACHE_VIEWS = path.join(__dirname, ".cache-views");
const OUT = path.join(__dirname, "out");
const OUT_FILE = path.join(OUT, "plots.json");

const UA = "AtlasFilmLineage/0.3 (corpus pipeline; https://github.com/atlas-film-lineage)";

/* -------------------------------------------------------------- GATE 1 knobs
 *
 * THE THRESHOLD, AND THE DEFENCE OF IT.
 *
 * Two poles are already measured against the same instrument (60-day pageviews,
 * n=2,173): the shipped description at rho 0.149 (fame-FLAT, and the only input
 * the pipeline currently trusts) and full article prose at 0.856 (a fame
 * GRADIENT, and the reason the obvious fix was forbidden).
 *
 * 0.45 is the ceiling, for three reasons that are about this corpus and not
 * about round numbers:
 *
 *  1. It is below the midpoint of the two poles (0.50). A variable above the
 *     midpoint is more like the thing we rejected than the thing we shipped,
 *     and calling that "materially below 0.856" would be a lie by arithmetic.
 *  2. It is at graph degree's 0.452 — the most fame-correlated quantity that
 *     already exists inside the graph, and one AGENTS rule 1 exists to keep out
 *     of edge weighting. A new scorer input may not be MORE fame-loaded than
 *     the worst thing already present.
 *  3. rho^2 at 0.45 is 0.20: at most a fifth of the rank variance in plot length
 *     is shared with fame. Above that, "the scorer had more to read about famous
 *     films" stops being a rounding error and starts being the dominant story of
 *     which films get scored confidently.
 *
 * The gate is one-sided (only high rho is a failure) and is evaluated on the
 * LOWER end of nothing — it uses the point estimate, and additionally reports a
 * bootstrap 95% CI so a marginal pass is visibly marginal rather than silently
 * lucky. If the upper CI bound crosses the threshold the gate reports MARGINAL
 * and still refuses, because a gate that passes on noise is a gate that lies.
 */
const GATE1_MAX_RHO = 0.45;
const GATE1_MIN_N = 120;              // below this the correlation is not worth acting on
const KNOWN_FULL_PROSE_RHO = 0.856;   // measured, DECISION doc
const KNOWN_DESCRIPTION_RHO = 0.149;  // measured, DECISION doc

/* ------------------------------------------------ THE MINIMUM-EVIDENCE FLOOR
 *
 * MEASURED, n=394 stratified, 2026-08-09. Read this before changing the number.
 *
 * Plot-section length, taken over every film that has an article, scores
 * rho = 0.636 [0.568, 0.699] against 60-day pageviews. That FAILS the gate
 * above, and the failure is real: the same run reproduces both known poles on
 * the same films (shipped description 0.169 vs the DECISION's 0.149; full
 * article prose 0.869 vs 0.856), so the instrument is calibrated and 0.636 is
 * not an artefact.
 *
 * But the gradient has a SHAPE, and the shape is what makes the layer buildable:
 *
 *   fame decile      d1    d2    d3    d4    d5    d6    d7    d8    d9   d10
 *   median plot ch  382  1138  2024  2143  2752  3362  3623  4028  3843  3911
 *
 * The top half is a PLATEAU. Famous films do not get longer plot summaries —
 * Wikipedia's own MOS:FILMPLOT caps them at 400-700 words, and the cap binds.
 * The entire correlation lives in the bottom four deciles, where obscure films
 * get one sentence or nothing at all. This is the opposite of the full-article
 * gradient, which is driven by the famous end growing without limit, and it is
 * why the saturating cap that was the best available fix for full articles
 * (0.522) does nothing here: capping trims the flat end.
 *
 * So the correct instrument is a FLOOR, not a cap. Restricting to films with at
 * least F characters of plot:
 *
 *   F        admitted    rho     95% CI
 *   0          100.0%    0.636   [0.57, 0.70]   <- the literal gate, FAILS
 *   800         83.5%    0.475   [0.38, 0.56]
 *   1200        75.9%    0.381   [0.27, 0.49]   <- point passes, CI crosses
 *   1500        72.6%    0.325   [0.21, 0.43]   <- LOWEST floor fully under 0.45
 *   2000        66.8%    0.230   [0.11, 0.35]
 *   3000        51.5%    0.017   [-0.13, 0.16]
 *
 * 1,500 is chosen as the LOWEST floor whose entire bootstrap 95% CI sits below
 * the threshold — deliberately the most inclusive passing value, not the safest
 * one, because every extra 500 characters of floor buys fame-flatness by
 * deleting the tail this atlas exists to show. Qualitatively 1,500 chars is a
 * full narrative arc with characters, turns and an ending; 138 chars is
 * "A group of wealthy bored figures play a game of murder at a party."
 *
 * WHAT THIS COSTS, STATED PLAINLY: the floor does not make the corpus
 * fame-flat, it converts a score gradient into a COVERAGE gradient. Admitted
 * films per fame decile at F=1500 are 4, 13, 22, 26, 33, 32, 37, 40, 39, 40 out
 * of ~40 each — the layer covers ~10% of the most obscure decile and ~100% of
 * the top three. That bias produces NULLS, not scores, and a null does not
 * enter the graph; a fame-shaped confidence number would. This is the same
 * shape as posters existing for 96.6% of films, and it must be reported, never
 * papered over. The regional cost is sharper than the fame cost and is the one
 * to argue about: films under 800 chars of plot are 30% of W-Europe and 23% of
 * Japan against 5% of US/CA.
 */
const PLOT_FLOOR_CHARS = 1500;

/* A floor high enough to admit only a sliver would pass GATE 1 trivially by
   keeping none of the tail. Below this share the floor has stopped being an
   evidence threshold and become a fame filter, and the gate must refuse. */
const GATE1_MIN_ADMITTED_SHARE = 0.50;

/* 60-day pageview window. Wikimedia's analytics API lags real time by a day or
   two, so the window ends a few days back rather than today. */
const VIEWS_DAYS = 60;
const VIEWS_LAG_DAYS = 3;

/* ------------------------------------------------------------------ plumbing */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function args() {
  const a = process.argv.slice(2);
  const o = { sample: 400, all: false, dry: false, gateSource: "plot", gateMax: GATE1_MAX_RHO,
    floor: PLOT_FLOOR_CHARS, pace: 250, refresh: false };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === "--all") o.all = true;
    else if (k === "--dry") o.dry = true;
    else if (k === "--refresh") o.refresh = true;
    else if (k === "--sample") o.sample = parseInt(a[++i], 10);
    else if (k === "--gate-source") o.gateSource = a[++i];
    else if (k === "--gate-max") o.gateMax = parseFloat(a[++i]);
    else if (k === "--floor") o.floor = parseInt(a[++i], 10);
    else if (k === "--pace") o.pace = parseInt(a[++i], 10);
    else if (k === "--help" || k === "-h") { console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]); process.exit(0); }
    else { console.error("unknown flag: " + k); process.exit(2); }
  }
  if (!["plot", "full", "description"].includes(o.gateSource)) {
    console.error("--gate-source must be plot | full | description");
    process.exit(2);
  }
  return o;
}

function cachePath(dir, key) {
  const safe = key.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
  const h = nodeCrypto.createHash("sha1").update(key).digest("hex").slice(0, 10);
  return path.join(dir, safe + "_" + h + ".json");
}

/* A FAILURE IS NOT A FACT. Errors are never cached — enrich.js learned this the
   expensive way (one bad key permanently zeroed every keyword). */
async function cached(dir, key, fn, refresh) {
  fs.mkdirSync(dir, { recursive: true });
  const p = cachePath(dir, key);
  if (!refresh && fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { /* fall through and refetch */ }
  }
  const v = await fn();
  /* A FAILURE IS NOT A FACT (part two). The pageviews endpoint 404s
     intermittently under load — measured at ~10% of calls on a 400-film run,
     on titles that return 200 when asked again a minute later. Caching that
     404 turns a transient throttle into a permanent "this film has no
     audience", and because the drops are load-correlated rather than random
     they silently thin the sample GATE 1 is computed from. */
  if (!v || !v.__missing) fs.writeFileSync(p, JSON.stringify(v));
  return v;
}

function getOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA, Accept: "application/json" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(getOnce(res.headers.location));
      }
      if (res.statusCode === 404) { res.resume(); return resolve({ __missing: true }); }
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
    req.setTimeout(40000, () => req.destroy(new Error("timeout")));
  });
}

/* Long backoff on purpose. A previous run pulled the whole corpus and left
   en.wikipedia throttling this client; the polite recovery is to wait it out,
   not to retry tightly and deepen the hole. 429 gets a much longer sleep than
   a transient 5xx because it is the server telling us the rate is wrong. */
async function get(url, attempt) {
  const n = attempt || 0;
  try { return await getOnce(url); }
  catch (e) {
    const throttled = /HTTP 429|HTTP 503/.test(e.message);
    const transient = /HTTP 5\d\d|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/.test(e.message);
    if ((!throttled && !transient) || n >= 6) throw e;
    const base = throttled ? 8000 : 1200;
    const wait = Math.round(base * Math.pow(1.8, n) + Math.random() * 800);
    process.stderr.write("  (retry " + (n + 1) + " in " + (wait / 1000).toFixed(1) + "s: " + e.message + ")\n");
    await sleep(wait);
    return get(url, n + 1);
  }
}

/* ------------------------------------------------------- wikitext -> sections
 *
 * Wikitext rather than the rendered extract for two reasons: the action API
 * accepts 20 titles per revisions call (110 calls for the whole corpus, ~62s
 * measured) where the REST summary endpoint is one call per film, and the
 * section headings survive intact so "which section is this sentence in" is
 * answerable rather than guessed at from prose shape.
 */

/* Balanced removal. Templates nest ({{Infobox|{{plainlist|...}}}}) and file
   captions contain links, so a non-greedy regex silently eats past the end of
   one construct and into the next. That failure is invisible in aggregate — it
   just makes some plots shorter — which is exactly the kind of quiet damage a
   length-based gate cannot see. */
function removeBalanced(s, open, close) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s.startsWith(open, i)) {
      let depth = 1;
      let j = i + open.length;
      while (j < s.length && depth > 0) {
        if (s.startsWith(open, j)) { depth++; j += open.length; }
        else if (s.startsWith(close, j)) { depth--; j += close.length; }
        else j++;
      }
      i = j;
      continue;
    }
    out += s[i++];
  }
  return out;
}

function removeFileLinks(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("[[", i) && /^\[\[\s*(File|Image|Media)\s*:/i.test(s.slice(i, i + 12))) {
      let depth = 1;
      let j = i + 2;
      while (j < s.length && depth > 0) {
        if (s.startsWith("[[", j)) { depth++; j += 2; }
        else if (s.startsWith("]]", j)) { depth--; j += 2; }
        else j++;
      }
      i = j;
      continue;
    }
    out += s[i++];
  }
  return out;
}

function stripWikitext(s) {
  let t = s;
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<ref[^>]*\/>/gi, "");
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  t = t.replace(/<(gallery|table|score|math|timeline|imagemap)[^>]*>[\s\S]*?<\/\1>/gi, "");
  t = removeBalanced(t, "{|", "|}");
  t = removeBalanced(t, "{{", "}}");
  t = removeFileLinks(t);
  t = t.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1");
  t = t.replace(/\[\[([^\]]*)\]\]/g, "$1");
  t = t.replace(/\[(?:https?:|\/\/)[^\s\]]+\s+([^\]]*)\]/g, "$1");
  t = t.replace(/\[(?:https?:|\/\/)[^\s\]]+\]/g, "");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/'''''|'''|''/g, "");
  t = t.replace(/^[*#:;]+\s*/gm, "");
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#\d+;/g, "");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/* Heading names that mean "this is what happens in the film". Deliberately
   conservative: "Cast", "Production", "Reception", "Themes" and "Analysis" are
   NOT plot, and "Themes"/"Analysis" in particular are the sections whose 35.7%
   presence rate is itself a fame gradient — pulling them in through a generous
   synonym list would reintroduce exactly what GATE 1 is testing for. */
const PLOT_HEADINGS = [
  "plot", "plot summary", "plot synopsis", "synopsis", "story", "storyline",
  "summary", "narrative", "premise", "plot outline", "the plot",
];

function normHeading(h) {
  return h.replace(/<[^>]+>/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().toLowerCase();
}

/* Returns { sections: [{title, level, body}], plot: string|null, plotHeading }
   Level-2 headings delimit; level-3+ stay inside their parent, because a plot
   told in parts ("=== Part one ===") is still the plot. */
function parseSections(wikitext) {
  const lines = wikitext.split("\n");
  const sections = [];
  let current = { title: "__lead__", level: 0, lines: [] };
  for (const line of lines) {
    const m = /^(={2,6})\s*(.+?)\s*\1\s*$/.exec(line);
    if (m && m[1].length === 2) {
      sections.push(current);
      current = { title: m[2], level: 2, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections.map((s) => ({ title: s.title, level: s.level, body: s.lines.join("\n") }));
}

function extractPlot(wikitext) {
  const sections = parseSections(wikitext);
  const titles = sections.filter((s) => s.level === 2).map((s) => s.title);
  let best = null;
  for (const s of sections) {
    if (s.level !== 2) continue;
    const n = normHeading(s.title);
    if (PLOT_HEADINGS.includes(n)) { best = s; break; }
  }
  if (!best) {
    /* One fallback only, and a strict one: "Plot" as the first word of a
       heading ("Plot and background"). Anything looser starts collecting
       "Plot holes" and "Reception of the plot". */
    for (const s of sections) {
      if (s.level !== 2) continue;
      const n = normHeading(s.title);
      if (/^plot\b/.test(n) || /^synopsis\b/.test(n)) { best = s; break; }
    }
  }
  const full = stripWikitext(sections.map((s) => s.body).join("\n"));
  if (!best) return { plot: null, plotHeading: null, sectionTitles: titles, fullChars: full.length };
  const plot = stripWikitext(best.body);
  return {
    plot: plot.length ? plot : null,
    plotHeading: best.title,
    sectionTitles: titles,
    fullChars: full.length,
  };
}

/* --------------------------------------------------------------- wiki fetch */

async function wikitextBatch(titles, refresh) {
  const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2" +
    "&prop=revisions&rvprop=content&rvslots=main&redirects=1" +
    "&titles=" + titles.map(encodeURIComponent).join("|");
  return cached(CACHE_WIKITEXT, "wt_" + titles.join("|"), () => get(url), refresh);
}

function indexWikitext(d) {
  const byTitle = {};
  const alias = {};
  if (!d || !d.query) return { byTitle, alias };
  for (const n of d.query.normalized || []) alias[n.from] = n.to;
  for (const r of d.query.redirects || []) alias[r.from] = r.to;
  for (const p of d.query.pages || []) {
    if (p.missing) { byTitle[p.title] = null; continue; }
    const rev = (p.revisions || [])[0];
    const content = rev && rev.slots && rev.slots.main ? rev.slots.main.content : null;
    byTitle[p.title] = content || null;
  }
  return { byTitle, alias };
}

function resolveAlias(title, alias) {
  let t = title, guard = 0;
  while (alias[t] && guard++ < 5) t = alias[t];
  return t;
}

/* ---------------------------------------------------------- pageviews (fame)
 *
 * The external fame instrument. Deliberately NOT graph degree: 83.5% of this
 * corpus sits at degree 20-22 because of the edge budget, so a Spearman against
 * degree is mostly ties and reads flat for anything.
 */
function viewsWindow() {
  const end = new Date(Date.now() - VIEWS_LAG_DAYS * 86400000);
  const start = new Date(end.getTime() - (VIEWS_DAYS - 1) * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return { start: fmt(start), end: fmt(end) };
}

async function pageviews(title, win, refresh) {
  const enc = encodeURIComponent(title.replace(/ /g, "_"));
  const url = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia" +
    "/all-access/user/" + enc + "/daily/" + win.start + "/" + win.end;
  let d = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    d = await cached(CACHE_VIEWS, "pv_" + win.start + "_" + title, () => get(url), refresh && attempt === 0);
    if (d && !d.__missing) break;
    await sleep(1500 * (attempt + 1));
  }
  if (!d || d.__missing || !d.items) return null;
  return d.items.reduce((a, i) => a + (i.views || 0), 0);
}

/* --------------------------------------------------------- rank correlation */

function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(a, b) {
  const n = a.length;
  if (n < 3) return NaN;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : NaN;
}

function spearman(x, y) {
  return pearson(ranks(x), ranks(y));
}

/* Deterministic bootstrap so a marginal pass is reproducible rather than a coin
   flip that happened to land the right way on the day someone ran it. */
function bootstrapCI(x, y, iters, seed) {
  let s = seed >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const n = x.length;
  const out = [];
  for (let it = 0; it < iters; it++) {
    const bx = new Array(n), by = new Array(n);
    for (let i = 0; i < n; i++) { const k = Math.floor(rnd() * n); bx[i] = x[k]; by[i] = y[k]; }
    const r = spearman(bx, by);
    if (!Number.isNaN(r)) out.push(r);
  }
  out.sort((a, b) => a - b);
  if (!out.length) return [NaN, NaN];
  return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]];
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/* ------------------------------------------------------------ stratification
 *
 * The sample must span fame, era and country, and fame is not knowable before
 * the pageviews are fetched. So era x region is stratified by construction with
 * proportional allocation and a floor per region, and the fame spread of the
 * resulting sample is REPORTED after the fact rather than assumed. A sample
 * that turned out to be all canon would show up as a compressed pageview range,
 * and the report prints the deciles so it cannot hide.
 */
const REGION = {
  Q30: "US/CA", Q16: "US/CA",
  Q145: "UK/IE", Q27: "UK/IE",
  Q17: "Japan",
  Q38: "W-Europe", Q142: "W-Europe", Q183: "W-Europe", Q34: "W-Europe", Q39: "W-Europe",
  Q29: "W-Europe", Q31: "W-Europe", Q55: "W-Europe", Q35: "W-Europe", Q20: "W-Europe",
  Q33: "W-Europe", Q40: "W-Europe", Q45: "W-Europe", Q41: "W-Europe",
  Q36: "E-Europe", Q15180: "E-Europe", Q159: "E-Europe", Q214: "E-Europe", Q213: "E-Europe",
  Q28: "E-Europe", Q218: "E-Europe", Q403: "E-Europe", Q212: "E-Europe", Q219: "E-Europe",
  Q148: "E-Asia", Q884: "E-Asia", Q865: "E-Asia", Q8646: "E-Asia",
  Q668: "S-Asia", Q794: "S-Asia", Q843: "S-Asia", Q902: "S-Asia",
  Q96: "LatAm", Q155: "LatAm", Q414: "LatAm", Q298: "LatAm", Q739: "LatAm",
  Q408: "Oceania", Q664: "Oceania",
};

function regionOf(rec) {
  const c = (rec && rec.country && rec.country[0]) || null;
  return (c && REGION[c]) || "Other";
}

function eraOf(year) {
  if (!year) return "unknown";
  if (year < 1940) return "pre1940";
  if (year < 1960) return "1940s50s";
  if (year < 1980) return "1960s70s";
  if (year < 2000) return "1980s90s";
  if (year < 2020) return "2000s10s";
  return "2020s";
}

/* Hash-ordered, not RNG-ordered: the same corpus yields the same sample on
   every machine and every rerun, so a gate number is reproducible and a cache
   built by one run is reused by the next. */
function hashKey(s) {
  return nodeCrypto.createHash("sha1").update("plot-source:" + s).digest("hex");
}

function stratifiedSample(films, n) {
  const cells = new Map();
  for (const f of films) {
    const key = eraOf(f.year) + "|" + f.region;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(f);
  }
  for (const list of cells.values()) list.sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));

  const total = films.length;
  const keys = [...cells.keys()].sort();
  const take = new Map();
  let assigned = 0;
  for (const k of keys) {
    const size = cells.get(k).length;
    /* floor of 2 so a small cell (Oceania in the 1940s) is represented at all;
       a stratum that is present in the corpus and absent from the sample is a
       silent coverage hole. */
    const want = Math.min(size, Math.max(2, Math.round((size / total) * n)));
    take.set(k, want);
    assigned += want;
  }
  /* Trim or top up largest-first to land on n exactly. */
  while (assigned > n) {
    const k = keys.slice().sort((a, b) => take.get(b) - take.get(a))[0];
    if (take.get(k) <= 2) break;
    take.set(k, take.get(k) - 1); assigned--;
  }
  while (assigned < n) {
    const k = keys.slice().sort((a, b) => (cells.get(b).length - take.get(b)) - (cells.get(a).length - take.get(a)))[0];
    if (take.get(k) >= cells.get(k).length) break;
    take.set(k, take.get(k) + 1); assigned++;
  }
  const out = [];
  for (const k of keys) out.push(...cells.get(k).slice(0, take.get(k)));
  return out;
}

/* --------------------------------------------------------------------- main */

async function main() {
  const opt = args();

  const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));
  const harvestPath = path.join(OUT, "harvest.json");
  const harvest = fs.existsSync(harvestPath) ? JSON.parse(fs.readFileSync(harvestPath, "utf8")) : { films: {} };

  const films = [];
  for (const [key, f] of Object.entries(corpus.films)) {
    if (!f.wikipedia) continue;
    const rec = harvest.films[key] || {};
    films.push({
      key,
      filmId: f.filmId,
      title: f.title,
      year: f.year,
      director: f.director || null,
      wikipedia: f.wikipedia,
      description: f.description || "",
      region: regionOf(rec),
      country: (rec.country && rec.country[0]) || null,
      h: hashKey(key),
    });
  }
  const skipped = Object.keys(corpus.films).length - films.length;

  const chosen = opt.all ? films.slice() : stratifiedSample(films, Math.min(opt.sample, films.length));
  console.log("corpus " + Object.keys(corpus.films).length + " films, " + films.length +
    " with an en.wikipedia title (" + skipped + " without)");
  console.log("selected " + chosen.length + (opt.all ? " (--all)" : " by stratified sample over era x region"));

  /* ---- 1. wikitext, 20 titles per call, cached per batch ---- */
  const wikitext = new Map();
  const batches = [];
  for (let i = 0; i < chosen.length; i += 20) batches.push(chosen.slice(i, i + 20));
  let bn = 0;
  for (const batch of batches) {
    bn++;
    const titles = batch.map((f) => f.wikipedia);
    const before = fs.existsSync(cachePath(CACHE_WIKITEXT, "wt_" + titles.join("|")));
    const d = await wikitextBatch(titles, opt.refresh);
    const { byTitle, alias } = indexWikitext(d);
    for (const f of batch) {
      const resolved = resolveAlias(f.wikipedia, alias);
      /* The pageviews API does NOT follow redirects: asking it for a redirect
         title returns 404, which arrives as "no fame data" and quietly drops the
         film from GATE 1. Those drops are not random — redirect titles skew to
         non-English and alternate-title films, exactly the obscure tail the gate
         is supposed to speak for. Carry the canonical title forward. */
      f.canonical = resolved;
      wikitext.set(f.key, byTitle[resolved] !== undefined ? byTitle[resolved] : (byTitle[f.wikipedia] || null));
    }
    if (bn % 5 === 0 || bn === batches.length) process.stdout.write("  wikitext " + bn + "/" + batches.length + "\n");
    if (!before) await sleep(opt.pace);
  }

  /* ---- 2. plot extraction ---- */
  const rows = [];
  let noArticle = 0, noPlot = 0;
  for (const f of chosen) {
    const wt = wikitext.get(f.key);
    if (!wt) {
      noArticle++;
      rows.push(Object.assign({}, f, { plot: null, plotChars: 0, fullChars: 0, sectionTitles: [], plotHeading: null }));
      continue;
    }
    const ex = extractPlot(wt);
    if (!ex.plot) noPlot++;
    rows.push(Object.assign({}, f, {
      plot: ex.plot,
      plotChars: ex.plot ? ex.plot.length : 0,
      plotWords: ex.plot ? ex.plot.split(/\s+/).length : 0,
      fullChars: ex.fullChars,
      sectionTitles: ex.sectionTitles,
      plotHeading: ex.plotHeading,
    }));
  }

  /* ---- 3. pageviews ---- */
  const win = viewsWindow();
  console.log("pageviews window " + win.start + " -> " + win.end + " (" + VIEWS_DAYS + " days)");
  let pn = 0;
  for (const r of rows) {
    pn++;
    const t = r.canonical || r.wikipedia;
    const before = fs.existsSync(cachePath(CACHE_VIEWS, "pv_" + win.start + "_" + t));
    try { r.views = await pageviews(t, win, opt.refresh); }
    catch (e) { r.views = null; process.stderr.write("  pageviews failed " + t + ": " + e.message + "\n"); }
    if (pn % 50 === 0 || pn === rows.length) process.stdout.write("  pageviews " + pn + "/" + rows.length + "\n");
    if (!before) await sleep(Math.max(60, Math.round(opt.pace / 2)));
  }

  /* ---- 4. GATE 1 ---- */
  const gate = runGate1(rows, opt);
  printReport(rows, gate, opt, win);

  if (opt.dry) {
    console.log("\n--dry: nothing written.");
    process.exit(gate.pass ? 0 : 1);
  }

  if (!gate.pass) {
    console.error("\nGATE 1 FAILED — REFUSING TO WRITE " + path.relative(ROOT, OUT_FILE) + ".");
    console.error("The scorer input would carry a fame gradient, and AGENTS rule 1 forbids");
    console.error("popularity entering the graph. Nothing downstream may run on this source.");
    /* Do not leave a stale file behind pretending to be this run's output. */
    if (fs.existsSync(OUT_FILE)) {
      fs.renameSync(OUT_FILE, OUT_FILE + ".rejected-" + Date.now());
      console.error("An existing plots.json was moved aside, not reused.");
    }
    process.exit(1);
  }

  /* ---- 5. write ---- */
  fs.mkdirSync(OUT, { recursive: true });
  const out = {
    version: 1,
    note: "SCORER INPUT ONLY. Plot sections for the axis scorer. This file must " +
      "never be merged into static/corpus.json — the shipped payload is already 13.4 MB " +
      "and none of this text is needed at runtime.",
    generated: new Date().toISOString(),
    source: "en.wikipedia plot section (action API, prop=revisions, rvslots=main)",
    window: win,
    gate1: gate,
    floor: opt.floor,
    coverage: {
      selected: rows.length,
      withArticle: rows.length - noArticle,
      withPlot: rows.filter((r) => r.plot).length,
      admitted: rows.filter((r) => r.plotChars >= opt.floor && r.plot).length,
      noArticle,
      noPlot,
    },
    films: {},
  };
  /* GATE 4 (null honesty) is enforced HERE, at the source, not left to the
     scorer's good behaviour. A film below the evidence floor is written with
     `plot: null` and a reason: the scorer physically cannot read a two-sentence
     plot and call it evidence for five axes, because the two sentences are not
     in the file. A withheld film is not a missing film — plotChars survives so
     the refusal is auditable and the tail is countable. */
  for (const r of rows) {
    const admitted = !!r.plot && r.plotChars >= opt.floor;
    out.films[r.key] = {
      filmId: r.filmId,
      title: r.title,
      year: r.year,
      wikipedia: r.wikipedia,
      region: r.region,
      plotHeading: r.plotHeading,
      plotChars: r.plotChars,
      plotWords: r.plotWords || 0,
      admitted,
      withheld: admitted ? null : (!r.plot ? (r.fullChars ? "no-plot-section" : "no-article") : "below-evidence-floor"),
      plot: admitted ? r.plot : null,
    };
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(out));
  console.log("\nwrote " + path.relative(ROOT, OUT_FILE) + " (" + (fs.statSync(OUT_FILE).size / 1048576).toFixed(2) + " MB)");
}

function gateVariable(rows, which) {
  if (which === "full") return rows.map((r) => r.fullChars || 0);
  if (which === "description") return rows.map((r) => (r.description || "").length);
  return rows.map((r) => r.plotChars || 0);
}

function measureRho(rows, which, gateMax) {
  const x = gateVariable(rows, which);
  const y = rows.map((r) => r.views);
  const rho = spearman(x, y);
  const ci = rows.length >= 20 ? bootstrapCI(x, y, 2000, 0x5eed1234) : [NaN, NaN];
  const under = rho <= gateMax;
  return {
    n: rows.length,
    rho: Number.isFinite(rho) ? Number(rho.toFixed(4)) : null,
    ci95: ci.map((v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null)),
    under,
    marginal: under && Number.isFinite(ci[1]) && ci[1] > gateMax,
  };
}

function runGate1(rows, opt) {
  /* Films with no article at all carry no information about either variable and
     are excluded. Films with an article but NO plot section STAY IN at length 0,
     because "the scorer got nothing" is a real and fame-correlated outcome and
     dropping it would flatter the gate. */
  const usable = rows.filter((r) => r.views != null && r.fullChars > 0);
  const admitted = usable.filter((r) => r.plotChars >= opt.floor);

  /* TWO NUMBERS, ALWAYS BOTH REPORTED.
   *
   * `literal` is the gate exactly as the decision phrases it — every film with
   * an article, no floor. On this corpus it FAILS, and no arrangement of this
   * file is allowed to hide that. `operative` is the same measurement on the
   * source as it will actually be handed to the scorer, i.e. after below-floor
   * films are withheld as null. The build proceeds on `operative`; the report
   * leads with `literal` so nobody can read a PASS without also reading the
   * unfloored number it was bought with. */
  const literal = measureRho(usable, opt.gateSource, opt.gateMax);
  const operative = opt.floor > 0 ? measureRho(admitted, opt.gateSource, opt.gateMax) : literal;

  const share = usable.length ? admitted.length / usable.length : 0;
  const enough = operative.n >= GATE1_MIN_N;
  const shareOk = opt.floor === 0 || share >= GATE1_MIN_ADMITTED_SHARE;

  return {
    variable: opt.gateSource === "plot" ? "plot-section chars" :
      opt.gateSource === "full" ? "full article prose chars" : "shipped description chars",
    floor: opt.floor,
    threshold: opt.gateMax,
    referenceFullProse: KNOWN_FULL_PROSE_RHO,
    referenceDescription: KNOWN_DESCRIPTION_RHO,
    literal,
    operative,
    admittedShare: Number(share.toFixed(4)),
    minAdmittedShare: GATE1_MIN_ADMITTED_SHARE,
    enoughData: enough,
    shareOk,
    pass: enough && shareOk && operative.under && !operative.marginal,
  };
}

function printReport(rows, gate, opt, win) {
  const withArticle = rows.filter((r) => r.fullChars > 0);
  const withPlot = rows.filter((r) => r.plot);
  const plotChars = withPlot.map((r) => r.plotChars).sort((a, b) => a - b);

  console.log("\n=== plot source ===");
  console.log("selected            " + rows.length);
  console.log("article fetched     " + withArticle.length);
  console.log("plot section found  " + withPlot.length +
    "  (" + (100 * withPlot.length / rows.length).toFixed(1) + "% of selected, " +
    (100 * withPlot.length / Math.max(1, withArticle.length)).toFixed(1) + "% of articles)");
  if (plotChars.length) {
    console.log("plot chars  p10 " + Math.round(quantile(plotChars, 0.10)) +
      "  median " + Math.round(quantile(plotChars, 0.5)) +
      "  p90 " + Math.round(quantile(plotChars, 0.90)) +
      "  min " + plotChars[0] + "  max " + plotChars[plotChars.length - 1]);
  }

  const noViews = rows.filter((r) => r.views == null);
  if (noViews.length) {
    console.log("no pageview data   " + noViews.length + "  " +
      noViews.slice(0, 6).map((r) => r.canonical || r.wikipedia).join(", "));
  }
  const views = rows.filter((r) => r.views != null).map((r) => r.views).sort((a, b) => a - b);
  if (views.length) {
    console.log("60d pageviews  p10 " + Math.round(quantile(views, 0.1)) +
      "  median " + Math.round(quantile(views, 0.5)) +
      "  p90 " + Math.round(quantile(views, 0.9)) +
      "  min " + views[0] + "  max " + views[views.length - 1]);
  }

  /* The cost of the floor, printed next to the benefit of it. A coverage table
     is the only thing that stops "GATE 1 PASS" from reading as "the tail is
     fine". */
  const usable = rows.filter((r) => r.views != null && r.fullChars > 0);
  if (gate.floor > 0 && usable.length >= 30) {
    const sorted = usable.slice().sort((a, b) => a.views - b.views);
    const cuts = [];
    for (let d = 1; d < 10; d++) cuts.push(sorted[Math.floor(sorted.length * d / 10)].views);
    const dec = (r) => { let d = 0; while (d < 9 && r.views >= cuts[d]) d++; return d; };
    const tot = new Array(10).fill(0), adm = new Array(10).fill(0);
    for (const r of usable) { const d = dec(r); tot[d]++; if (r.plotChars >= gate.floor) adm[d]++; }
    console.log("\nadmitted by fame decile (obscure -> famous), floor " + gate.floor + " chars");
    console.log("  " + adm.map((a, i) => (a + "/" + tot[i])).join("  "));
    const reg = {};
    for (const r of usable) {
      reg[r.region] = reg[r.region] || [0, 0];
      reg[r.region][1]++;
      if (r.plotChars >= gate.floor) reg[r.region][0]++;
    }
    console.log("admitted by region");
    for (const [k, [a, b]] of Object.entries(reg).sort()) {
      console.log("  " + k.padEnd(9) + " " + String(a).padStart(3) + "/" + String(b).padEnd(4) +
        " " + (100 * a / b).toFixed(0) + "%");
    }
  }

  const line = (label, m) => console.log("  " + label.padEnd(34) + "rho " + String(m.rho).padStart(7) +
    "   95% CI [" + m.ci95[0] + ", " + m.ci95[1] + "]   n=" + m.n);

  console.log("\n=== GATE 1  fame-flatness ===");
  console.log("variable            " + gate.variable);
  console.log("threshold           <= " + gate.threshold +
    "   (full prose " + gate.referenceFullProse + ", shipped description " + gate.referenceDescription + ")");
  console.log("window              " + win.start + " -> " + win.end);
  line("LITERAL (no floor)", gate.literal);
  console.log("        " + (gate.literal.under && !gate.literal.marginal ? "under threshold" : "OVER THRESHOLD — the unfloored source is NOT fame-flat"));
  if (gate.floor > 0) {
    line("OPERATIVE (floor " + gate.floor + " chars)", gate.operative);
    console.log("        admitted " + (100 * gate.admittedShare).toFixed(1) + "% of films with an article" +
      " (must be >= " + (100 * gate.minAdmittedShare).toFixed(0) + "%)");
  }
  console.log("VERDICT             " + (gate.pass ? "PASS" :
    !gate.enoughData ? "FAIL (n < " + GATE1_MIN_N + ")" :
    !gate.shareOk ? "FAIL (floor admits only " + (100 * gate.admittedShare).toFixed(1) + "% — that is a fame filter, not an evidence floor)" :
    gate.operative.marginal ? "FAIL (marginal: CI upper bound crosses threshold)" : "FAIL"));
}

/* Exported so `axis-gates.js` runs GATE 1 from the same code that enforces it.
   A gate implemented twice is a gate that disagrees with itself. */
module.exports = {
  spearman, ranks, pearson, bootstrapCI, quantile,
  extractPlot, parseSections, stripWikitext,
  stratifiedSample, regionOf, eraOf, hashKey,
  wikitextBatch, indexWikitext, resolveAlias, pageviews, viewsWindow,
  runGate1, gateVariable, cachePath,
  CACHE_WIKITEXT, CACHE_VIEWS, OUT_FILE,
  GATE1_MAX_RHO, GATE1_MIN_N, KNOWN_FULL_PROSE_RHO, KNOWN_DESCRIPTION_RHO,
};

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
