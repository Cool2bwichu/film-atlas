#!/usr/bin/env node
/* measure-consensus.js — is the consensus layer honest?
 *
 *   node pipeline/measure-consensus.js
 *   node pipeline/measure-consensus.js --attrs pipeline/out/consensus.json
 *
 * Four questions, in the order they can kill the layer.
 *
 * 1. ANSWER RATE, and it is read as a claim that has to be DEFENDED RATHER THAN
 *    MAXIMISED. A high rate is the tell for confident invention, not a success.
 *    Reported split three ways — `well` / `outline` / `no` — because they carry
 *    different weight downstream: only `well` declares the closed vocabulary and
 *    so only `well` can produce a known-absent.
 *
 * 2. COVERAGE, by region, era and fame decile. `atlas-fingerprint-DECISION.md`
 *    made the standing rule: a coverage gradient must be REPORTED as one, and a
 *    film without attributes is a film we could not speak to, never a film
 *    without qualities.
 *
 * 3. PER-ATTRIBUTE PREVALENCE against the 5-35% band that replaced the sigma
 *    liveness gate (`axis-gates.js`). Measured over the `well` population only,
 *    because that is the population where absence is a verdict; measuring it
 *    over films whose silence means "no opinion" would deflate every number by
 *    the coverage rate and say nothing about the vocabulary.
 *
 * 4. THE FAME SHAPE — Spearman of `filled` against 60-day Wikipedia pageviews.
 *    The comparison table is the one already measured for the text sources:
 *
 *        shipped description length   0.149   (fame-flat only because truncated)
 *        graph degree                 0.452
 *        TMDB keyword count           0.753
 *        behaviour-bearing chars      0.828
 *        full article prose           0.856
 *
 *    The PREDICTION under test is that consensus is LESS fame-shaped than those,
 *    because it depends on a film being known at all rather than on how much was
 *    written about it — a small film that people saw is knowable; a small film
 *    nobody saw is not, and no amount of Wikipedia prose changes either. That is
 *    a prediction, not a result. This file exists to find out.
 *
 * Pageviews come from `plot-source.js`'s cache and are NEVER fetched, so the
 * number does not depend on the day it ran. The cache window is detected from
 * the files present and printed, because `viewsWindow()` moves with the clock
 * and would silently miss a cache written a few days earlier.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const nodeCrypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(__dirname, "out");
const ps = require("./plot-source.js");

/* Already-measured fame shapes for every other source this project has tried. */
const REFERENCE = [
  ["shipped description length", 0.149],
  ["graph degree", 0.452],
  ["TMDB keyword count", 0.753],
  ["behaviour-bearing chars", 0.828],
  ["full article prose", 0.856],
];

const BAND_LO = 0.05, BAND_HI = 0.35;

/* ---------------------------------------------------------------- pageviews */

/* The cache key is `pv_<windowStart>_<title>` hashed by plot-source's cachePath.
   The window start moves with the clock, so rather than recomputing it we read
   which windows are actually on disk and use the one with the most files. */
function detectWindow(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return null; }
  const tally = new Map();
  for (const n of names) {
    const m = /^pv_(\d{8})_/.exec(n);
    if (m) tally.set(m[1], (tally.get(m[1]) || 0) + 1);
  }
  let best = null;
  for (const [w, c] of tally) if (!best || c > best.count) best = { start: w, count: c };
  return best;
}

function loadViews(meta, keys) {
  const win = detectWindow(ps.CACHE_VIEWS);
  if (!win) return { win: null, views: {}, hit: 0 };
  const views = Object.create(null);
  let hit = 0;
  for (const k of keys) {
    const t = meta[k] && meta[k].wikipedia;
    if (!t) continue;
    const p = ps.cachePath(ps.CACHE_VIEWS, "pv_" + win.start + "_" + t);
    if (!fs.existsSync(p)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { continue; }
    if (!d || !Array.isArray(d.items)) continue;
    let s = 0;
    for (const it of d.items) s += it.views || 0;
    if (s > 0) { views[k] = s; hit++; }
  }
  return { win, views, hit };
}

/* ------------------------------------------------------------------- helpers */

function pct(n, d) { return d ? (100 * n / d).toFixed(1) + "%" : "n/a"; }

function table(rows, headers) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => "  " + cells.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join("  ");
  const out = [line(headers), "  " + w.map((x) => "-".repeat(x)).join("  ")];
  for (const r of rows) out.push(line(r));
  return out.join("\n");
}

function decileOf(sortedViews, v) {
  let lo = 0, hi = sortedViews.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedViews[mid] < v) lo = mid + 1; else hi = mid; }
  return Math.min(9, Math.floor(10 * lo / sortedViews.length));
}

/* ---------------------------------------------------------------------- main */

function main() {
  const args = process.argv.slice(2);
  let file = path.join(OUT, "consensus.json");
  for (let i = 0; i < args.length; i++) if (args[i] === "--attrs") file = path.resolve(args[++i]);

  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8")).films;
  const harvest = JSON.parse(fs.readFileSync(path.join(OUT, "harvest.json"), "utf8")).films || {};
  const keys = Object.keys(corpus);
  const meta = {};
  for (const k of keys) meta[k] = { title: corpus[k].title, year: corpus[k].year, wikipedia: corpus[k].wikipedia || null };

  const vocab = doc.vocabulary || [];
  const films = doc.films || {};

  /* Every corpus film gets a row. A film absent from the document is UNKNOWN,
     which is exactly what a failed batch should look like — never a zero that
     pretends to be a verdict. */
  const rows = keys.map((k) => {
    const f = films[k];
    const known = f ? f.known : "missing";
    return {
      key: k,
      title: corpus[k].title,
      year: corpus[k].year,
      known,
      filled: f ? f.filled : 0,
      attrs: (f && f.attrs) || {},
      recall: (f && f.recall) || "",
      region: ps.regionOf(harvest[k]),
      era: ps.eraOf(corpus[k].year),
    };
  });

  const n = rows.length;
  const nWell = rows.filter((r) => r.known === "well").length;
  const nOutline = rows.filter((r) => r.known === "outline").length;
  const nNo = rows.filter((r) => r.known === "no").length;
  const nMissing = rows.filter((r) => r.known === "missing").length;
  const answered = nWell + nOutline;

  console.log("consensus layer — " + path.relative(ROOT, file));
  console.log("  vocabulary " + vocab.length + " attributes   corpus " + n + " films   model " + (doc.model || "?"));
  console.log("");

  /* ── 1. answer rate ────────────────────────────────────────────────────── */
  console.log("1. ANSWER RATE — a high number here is a BUG, not a result");
  console.log(table([
    ["well    (closed vocabulary; silence = no)", nWell, pct(nWell, n)],
    ["outline (positives only; silence = unknown)", nOutline, pct(nOutline, n)],
    ["no      (passed; unknown on everything)", nNo, pct(nNo, n)],
    ["missing (batch failed; unknown)", nMissing, pct(nMissing, n)],
    ["ANSWERED (well + outline)", answered, pct(answered, n)],
  ], ["tier", "films", "share"]));
  const filledAll = rows.map((r) => r.filled);
  const withAttrs = filledAll.filter((x) => x > 0).length;
  const meanWell = nWell ? rows.filter((r) => r.known === "well").reduce((a, r) => a + r.filled, 0) / nWell : 0;
  const meanOut = nOutline ? rows.filter((r) => r.known === "outline").reduce((a, r) => a + r.filled, 0) / nOutline : 0;
  console.log("  films carrying at least one attribute  " + withAttrs + "  " + pct(withAttrs, n));
  console.log("  mean attributes filled — well " + meanWell.toFixed(1) + " of " + vocab.length +
    ",  outline " + meanOut.toFixed(1));
  const demoted = Object.values(films).filter((f) => f.demoted).length;
  console.log("  'well' demoted to 'outline' for supplying no concrete recall: " + demoted);
  console.log("");

  /* ── 2. coverage by stratum ────────────────────────────────────────────── */
  const { win, views, hit } = loadViews(meta, keys);
  console.log("2. COVERAGE — where the layer can and cannot speak");
  for (const [dim, get] of [["region", (r) => r.region], ["era", (r) => r.era]]) {
    const g = new Map();
    for (const r of rows) {
      const kk = get(r);
      if (!g.has(kk)) g.set(kk, { n: 0, well: 0, ans: 0 });
      const e = g.get(kk);
      e.n++;
      if (r.known === "well") e.well++;
      if (r.known === "well" || r.known === "outline") e.ans++;
    }
    const rs = [...g.entries()].sort((a, b) => b[1].n - a[1].n)
      .map(([kk, e]) => [kk, e.n, pct(e.well, e.n), pct(e.ans, e.n)]);
    console.log("  by " + dim + ":");
    console.log(table(rs, [dim, "films", "well", "answered"]));
  }
  console.log("");

  /* ── 3. per-attribute prevalence ───────────────────────────────────────── */
  console.log("3. PER-ATTRIBUTE PREVALENCE over the " + nWell + " 'well' films");
  console.log("   band " + (BAND_LO * 100) + "-" + (BAND_HI * 100) + "% (axis-gates.js pole prevalence, the gate that replaced sigma liveness)");
  const wellRows = rows.filter((r) => r.known === "well");
  const prev = vocab.map((a) => {
    let any = 0, strong = 0, sum = 0;
    for (const r of wellRows) {
      const v = r.attrs[a];
      if (v > 0) { any++; sum += v; }
      if (v >= 0.5) strong++;
    }
    return { a, any, strong, mean: any ? sum / any : 0, p: nWell ? any / nWell : 0, pStrong: nWell ? strong / nWell : 0 };
  }).sort((x, y) => y.p - x.p);

  console.log(table(prev.map((p) => [
    p.a, p.any, (100 * p.p).toFixed(1) + "%", (100 * p.pStrong).toFixed(1) + "%", p.mean.toFixed(2),
    p.p < BAND_LO ? "BELOW" : p.p > BAND_HI ? "ABOVE" : "",
  ]), ["attribute", "films", "any>0", ">=0.5", "mean", "band"]));

  const below = prev.filter((p) => p.p < BAND_LO).length;
  const above = prev.filter((p) => p.p > BAND_HI).length;
  console.log("  in band " + (vocab.length - below - above) + "/" + vocab.length +
    "   below 5% " + below + "   above 35% " + above);
  console.log("");

  /* ── 4. the fame shape ─────────────────────────────────────────────────── */
  console.log("4. FAME SHAPE — Spearman against 60-day en.wikipedia pageviews");
  if (!hit) { console.log("  NO pageview cache found. This is not a pass."); return; }
  console.log("  cache window start " + win.start + ", " + hit + " films with views, never fetched here");

  const kv = rows.filter((r) => views[r.key] !== undefined);
  const y = kv.map((r) => views[r.key]);
  const rhoFilled = ps.spearman(kv.map((r) => r.filled), y);
  const ciFilled = ps.bootstrapCI(kv.map((r) => r.filled), y, 2000, 20260810);
  const tierNum = { missing: 0, no: 0, outline: 1, well: 2 };
  const rhoTier = ps.spearman(kv.map((r) => tierNum[r.known]), y);
  const rhoAnswered = ps.spearman(kv.map((r) => (r.known === "well" || r.known === "outline" ? 1 : 0)), y);

  const kvWell = kv.filter((r) => r.known === "well");
  const rhoWithin = kvWell.length >= 30
    ? ps.spearman(kvWell.map((r) => r.filled), kvWell.map((r) => views[r.key])) : null;

  console.log(table([
    ["filled (headline: attributes per film, 0 when unknown)", rhoFilled.toFixed(4), "[" + ciFilled.map((x) => x.toFixed(3)).join(", ") + "]", kv.length],
    ["known tier (no<outline<well) — the COVERAGE gradient", rhoTier.toFixed(4), "", kv.length],
    ["answered at all (0/1)", rhoAnswered.toFixed(4), "", kv.length],
    ["filled WITHIN 'well' — the STRENGTH gradient", rhoWithin === null ? "n/a" : rhoWithin.toFixed(4), "", kvWell.length],
  ], ["variable", "rho", "ci95", "n"]));

  console.log("  against every other source this project has measured:");
  console.log(table(REFERENCE.concat([["consensus `filled` (this run)", rhoFilled]])
    .sort((a, b) => a[1] - b[1])
    .map(([nm, v]) => [nm, v.toFixed(3)]), ["source", "rho vs pageviews"]));

  const target = 0.856;
  console.log("  prediction was: LESS fame-shaped than full article prose (" + target + ").  " +
    (rhoFilled < target ? "HOLDS" : "DOES NOT HOLD") +
    "   margin " + (target - rhoFilled).toFixed(3));

  /* Coverage by fame decile makes the same number legible as a picture. */
  const sortedViews = Object.values(views).sort((a, b) => a - b);
  const dec = new Array(10).fill(0).map(() => ({ n: 0, well: 0, ans: 0, filled: 0 }));
  for (const r of kv) {
    const d = dec[decileOf(sortedViews, views[r.key])];
    d.n++;
    if (r.known === "well") d.well++;
    if (r.known === "well" || r.known === "outline") d.ans++;
    d.filled += r.filled;
  }
  console.log("  coverage by fame decile (1 = least read on Wikipedia):");
  console.log(table(dec.map((d, i) => [
    "decile " + (i + 1), d.n, pct(d.well, d.n), pct(d.ans, d.n), (d.n ? d.filled / d.n : 0).toFixed(1),
  ]), ["stratum", "films", "well", "answered", "mean filled"]));
  console.log("");

  corroborate(rows, views, sortedViews);
}

/* ── 5. is the concrete-recall toll being PAID or FAKED? ────────────────────
 *
 * The gate's whole strength is that claiming `well` costs one specific thing
 * from the film. That is only a cost if the specifics are real. This checks them
 * against a source the scorer never saw: the Wikipedia plot sections harvested
 * by plot-source.js, which were deliberately withheld from the prompt.
 *
 * Absence of a match is NOT evidence of invention — a recall like "sepia
 * monochrome scope" is a true fact about a film that no plot summary states, and
 * the good recalls are frequently exactly that kind. So the raw rate is
 * uninterpretable on its own. What is interpretable is the CONTRAST against a
 * shuffled null: the same recall strings scored against a different film's plot.
 * Whatever generic-word leakage inflates the matched rate inflates the shuffled
 * rate identically, so the gap is the grounding.
 *
 * And the number that actually answers the owner's question is the gap BY FAME
 * DECILE. If the model is recalling famous films and confabulating obscure ones,
 * the gap collapses at the bottom of the distribution. If the gap is flat, the
 * `well` verdicts are the same kind of claim all the way down.
 */

const STOP = new Set(("the a an and or but of to in on at by for with from as is are was were be been it its his her their they them he she " +
  "that this these those into over under after before while when where who whom which what not no nor so than then there here " +
  "one two three own out up down off again very just also only more most other some such own same too can will would could should " +
  "him himself herself itself themselves about across against along among around behind below beneath beside between beyond during " +
  "except inside near outside since through throughout toward towards until upon within without film films movie scene scenes shot " +
  "shots story character characters man woman men women boy girl father mother son daughter family life death time year years day days " +
  "night nights end ends final finally later first last long back home house room city town people").split(/\s+/));

function contentTokens(s) {
  const out = new Set();
  for (const raw of String(s).split(/[^A-Za-zÀ-ÿ'’-]+/)) {
    const w = raw.toLowerCase().replace(/['’-]+$/, "");
    if (w.length < 5) continue;
    if (STOP.has(w)) continue;
    out.add(w);
  }
  return [...out];
}

function corroborate(rows, views, sortedViews) {
  let plots;
  try { plots = JSON.parse(fs.readFileSync(path.join(OUT, "plots.json"), "utf8")).films || {}; }
  catch (e) { console.log("5. RECALL CORROBORATION — plots.json unreadable, skipped"); return; }

  const text = new Map();
  for (const [k, p] of Object.entries(plots)) {
    if (p && p.admitted && typeof p.plot === "string" && p.plot.length > 400) text.set(k, p.plot.toLowerCase());
  }

  const subjects = rows.filter((r) => r.known === "well" && r.recall && text.has(r.key));
  if (subjects.length < 40) { console.log("5. RECALL CORROBORATION — only " + subjects.length + " scorable, skipped"); return; }

  const pool = subjects.map((r) => r.key);
  const scoreAgainst = (recall, key) => {
    const toks = contentTokens(recall);
    if (!toks.length) return null;
    const t = text.get(key);
    let hit = 0;
    for (const w of toks) if (t.includes(w)) hit++;
    return hit / toks.length;
  };

  const matched = [], shuffled = [];
  for (let i = 0; i < subjects.length; i++) {
    const r = subjects[i];
    const m = scoreAgainst(r.recall, r.key);
    /* Deterministic derangement: every recall is scored against a DIFFERENT
       film's plot. Offsets are coprime-ish with the pool so no recall lands on
       its own film, and the same run gives the same null twice. */
    let j = (i + 1 + (i % 7)) % pool.length;
    if (j === i) j = (i + 1) % pool.length;
    const s = scoreAgainst(r.recall, pool[j]);
    if (m === null || s === null) continue;
    matched.push(m); shuffled.push(s);
    r._corr = m; r._null = s;
  }

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  console.log("5. RECALL CORROBORATION — 'well' recall strings against the plot text the prompt never saw");
  console.log("   n=" + matched.length + " of " + rows.filter((r) => r.known === "well").length +
    " 'well' films (the rest have no admitted plot — the 1,500-char floor, which is itself fame-shaped)");
  console.log("   mean content-word overlap: matched " + mean(matched).toFixed(3) +
    "   shuffled null " + mean(shuffled).toFixed(3) +
    "   lift " + (mean(matched) / Math.max(1e-9, mean(shuffled))).toFixed(2) + "x");
  console.log("   share of recalls with zero overlap: matched " +
    (100 * matched.filter((x) => x === 0).length / matched.length).toFixed(1) + "%   null " +
    (100 * shuffled.filter((x) => x === 0).length / shuffled.length).toFixed(1) + "%");

  const dec = new Array(10).fill(0).map(() => ({ n: 0, m: 0, s: 0 }));
  for (const r of subjects) {
    if (r._corr === undefined || views[r.key] === undefined) continue;
    const d = dec[decileOf(sortedViews, views[r.key])];
    d.n++; d.m += r._corr; d.s += r._null;
  }
  console.log("   by fame decile — a collapsing gap at the bottom would be the invention gradient:");
  console.log(table(dec.map((d, i) => [
    "decile " + (i + 1), d.n,
    d.n ? (d.m / d.n).toFixed(3) : "-", d.n ? (d.s / d.n).toFixed(3) : "-",
    d.n && d.s ? (d.m / d.s).toFixed(2) + "x" : "-",
  ]), ["stratum", "n", "matched", "null", "lift"]));
}

if (require.main === module) main();
