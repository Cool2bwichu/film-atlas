#!/usr/bin/env node
/* fame.js — the popularity proxy the bake-off audits both sides against.
 *
 * AGENTS rule 1 forbids popularity entering what the atlas shows. Auditing that
 * needs a fame number per film that this repo already believes in, not a new one
 * invented for the audit. Two exist:
 *
 *   VIEWS   60-day English Wikipedia pageviews, read straight out of
 *           plot-source.js's own on-disk cache (.cache-views). This is the
 *           proxy match.js's fameCheck() and axis-gates.js both use, at the
 *           same 0.45 rho gate. NOTHING IS FETCHED HERE.
 *   DEGREE  corpus.json edge degree, the fallback named in plot-source.js's own
 *           comment — and the comment also says degree "is mostly ties and
 *           reads flat for anything", so it is reported as a SECOND opinion,
 *           never as the primary.
 *
 * THE STALE WINDOW, DECLARED. viewsWindow() rolls daily. The cache on disk was
 * written at window 20260608; today's key is one day later, so the shipped
 * cache-only reader returns null for every film and match.js's fameCheck()
 * refuses to run. Refusing here too would mean shipping a bake-off with no rule
 * 1 audit at all, which is worse. So this file reads the window THE CACHE
 * ACTUALLY HOLDS, and says so on every result (`window`, `stale`). A fame
 * number from eight weeks of real traffic two days out of date is a fine
 * instrument for "does this ranker prefer famous films"; it is not a fine
 * instrument for anything about today, and nothing here claims it is.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ps = require("../plot-source.js");

const HERE = __dirname;
const ROOT = path.join(HERE, "..", "..");
const CORPUS = path.join(ROOT, "static", "corpus.json");

/* The window the cache holds, discovered from the filenames rather than from
   the clock, so this keeps working when the cache is refreshed. */
function cachedWindow() {
  let files = [];
  try { files = fs.readdirSync(ps.CACHE_VIEWS); } catch (e) { return null; }
  const tally = new Map();
  for (const fn of files) {
    const m = /^pv_(\d{8})_/.exec(fn);
    if (m) tally.set(m[1], (tally.get(m[1]) || 0) + 1);
  }
  if (!tally.size) return null;
  let best = null;
  for (const [w, n] of tally) if (!best || n > best.n) best = { start: w, n };
  return best;
}

function buildFame() {
  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
  const films = corpus.films;
  const win = cachedWindow();
  const today = ps.viewsWindow();

  /* degree, from the shipped edge list */
  const degree = Object.create(null);
  for (const k of Object.keys(films)) degree[k] = 0;
  for (const e of corpus.edges || []) {
    for (const k of [e.a, e.b, e.from, e.to, e.source, e.target]) {
      if (k != null && degree[k] !== undefined) degree[k]++;
    }
  }

  const views = Object.create(null);
  let hit = 0, miss = 0;
  const missed = [];
  if (win) {
    for (const [k, f] of Object.entries(films)) {
      const title = f.wikipedia || f.title;
      if (!title) { miss++; missed.push(k); continue; }
      const p = ps.cachePath(ps.CACHE_VIEWS, "pv_" + win.start + "_" + title);
      if (!fs.existsSync(p)) { miss++; missed.push(k); continue; }
      let d;
      try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { miss++; missed.push(k); continue; }
      if (!d || !Array.isArray(d.items)) { miss++; missed.push(k); continue; }
      let s = 0;
      for (const it of d.items) s += it.views || 0;
      views[k] = s;
      hit++;
    }
  }
  return {
    views, degree,
    window: win ? win.start : null,
    todayWindow: today.start,
    stale: !!(win && win.start !== today.start),
    coverage: { hit, miss, missed: missed.slice(0, 40) },
    n: Object.keys(films).length,
  };
}

let MEMO = null;
function fame() { if (!MEMO) MEMO = buildFame(); return MEMO; }

module.exports = { fame, buildFame, cachedWindow };

if (require.main === module) {
  const F = fame();
  const vals = Object.values(F.views).sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
  console.log("fame proxy: 60-day en.wikipedia pageviews, cache window " + F.window +
    (F.stale ? "  (STALE — today's key is " + F.todayWindow + ", cache-only read of the window on disk)" : ""));
  console.log("coverage: " + F.coverage.hit + "/" + F.n + " films  (" +
    (100 * F.coverage.hit / F.n).toFixed(1) + "%)");
  console.log("views  min " + q(0) + "  p25 " + q(0.25) + "  median " + q(0.5) +
    "  p75 " + q(0.75) + "  p99 " + q(0.99) + "  max " + vals[vals.length - 1]);
  const dv = Object.values(F.degree);
  const uniq = new Set(dv).size;
  console.log("degree distinct values: " + uniq + " over " + dv.length + " films" +
    "  (mean " + (dv.reduce((a, b) => a + b, 0) / dv.length).toFixed(1) + ")");
  if (F.coverage.miss) console.log("missing views for " + F.coverage.miss + " films, e.g. " + F.coverage.missed.slice(0, 6).join(", "));
}
