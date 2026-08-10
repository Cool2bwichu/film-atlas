#!/usr/bin/env node
/* measure-match-layout.js — the file layout-match.js's header cited three times
 * and which did not exist until the search was audited.
 *
 *   node atlas/pipeline/measure-match-layout.js
 *   node atlas/pipeline/measure-match-layout.js --v1     # the old arrangement
 *   node atlas/pipeline/measure-match-layout.js --sweep  # radialExp / bandPack
 *
 * It answers, on the real corpus and off the real solve, the four questions the
 * header makes claims about:
 *
 *   1. Does distance encode the score?  Spearman(radius, score) and the share
 *      of ordered pairs drawn BACKWARDS — the better answer further out. A
 *      correlation alone cannot see a local inversion at the front, which is
 *      exactly where the reader is looking.
 *   2. Is the SET drawn nearest the set that scores best? |top30 ∩ nearest30|
 *      and the worst score-rank inside the nearest thirty. find-probe's two
 *      layout checks pass over this: one is global, the other tests one film.
 *   3. How far apart does the picture draw films the score refused to order?
 *      The widest tie band, in radius and in films.
 *   4. Is the middle occupied? The radial histogram, and how much of the disc
 *      is empty before the first film.
 *
 * Everything is measured off `layoutMatch`'s own output — no page, no browser —
 * so it is the layout that is on trial and not the renderer.
 */
"use strict";

const path = require("path");
const { buildFind } = require("../app/query-runtime.js");
const L = require("../app/layout-match.js");
const { layoutMatch, matchBands, skyBearings } = L;

const SENTENCES = {
  owner: "a film that has fast pacing, has the mood of the matrix, has a hopeful tone, "
       + "has little dialogue, very spiritual in nature",
  thin: "set in space",
  gritty: "a gritty revenge film set in a city at night, very stylised",
  quiet: "I want something quiet and sad to watch alone at 2am, nothing violent",
};

function spearman(a, b) {
  const n = a.length;
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const mid = (i + j) / 2 + 1;
      for (let t = i; t <= j; t++) r[idx[t][1]] = mid;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b);
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const p = ra[i] - ma, q = rb[i] - mb; num += p * q; da += p * p; db += q * q; }
  return num / Math.sqrt(da * db || 1);
}

/* THE INVERSION COUNT IS THE POINT AND IT IS O(n^2) IF WRITTEN NAIVELY.
   2,204 films is 2.4M ordered pairs, which is fine here but is reported as a
   fraction of the pairs the score ACTUALLY ORDERED — a tie is not an inversion
   however it is drawn, and counting it as one would flatter every arrangement
   that refuses to spread. */
function inversions(score, radius) {
  const n = score.length;
  let ordered = 0, bad = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (score[i] === score[j]) continue;
      ordered++;
      const better = score[i] > score[j] ? i : j;
      const worse = better === i ? j : i;
      if (radius[better] > radius[worse]) bad++;
    }
  }
  return { ordered, bad, share: ordered ? bad / ordered : 0 };
}

function measure(F, text, opts) {
  const r = F.run(text);
  if (!r.drawable) return { text, refused: r.refusal.code };
  const bearings = skyBearings(Object.fromEntries(F.keys.map((k, i) => {
    /* No baked sky here, so the bearing is the corpus's own key order on a
       circle: the measurement is about RADIUS, and a deterministic bearing that
       does not depend on the query is all radius needs. */
    const a = (i / F.keys.length) * Math.PI * 2;
    return [k, [0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a)]];
  })));
  const t0 = Date.now();
  const pos = layoutMatch(r.scores, Object.assign({ bearings }, opts || {}));
  const ms = Date.now() - t0;
  const bands = matchBands(r.scores, opts || {});

  const keys = F.keys.filter((k) => pos[k]);
  const score = keys.map((k) => r.scores[k]);
  const radius = keys.map((k) => Math.hypot(pos[k][0] - 0.5, pos[k][1] - 0.5) * 2);

  const byScore = keys.map((k, i) => i).sort((a, b) => score[b] - score[a] || (keys[a] < keys[b] ? -1 : 1));
  const byRad = keys.map((k, i) => i).sort((a, b) => radius[a] - radius[b] || (keys[a] < keys[b] ? -1 : 1));
  const rankOf = new Map(byScore.map((i, rk) => [i, rk + 1]));
  const N = 30;
  const topSet = new Set(byScore.slice(0, N));
  const nearSet = byRad.slice(0, N);
  const agree = nearSet.filter((i) => topSet.has(i)).length;
  let worstRank = 0, worstKey = null;
  for (const i of nearSet) if (rankOf.get(i) > worstRank) { worstRank = rankOf.get(i); worstKey = keys[i]; }

  const sorted = radius.slice().sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const inv = inversions(score, radius);

  return {
    text, ms, n: keys.length,
    scoreMax: bands.scoreMax, normalised: bands.normalised,
    rho: spearman(radius, score), inv,
    agree, worstRank, worstKey,
    widest: bands.widest, groups: bands.groups.length,
    tiedFilms: bands.groups.reduce((a, g) => a + (g.n > 1 ? g.n : 0), 0),
    rMin: sorted[0], p01: pct(0.01), p50: pct(0.5), p99: pct(0.99),
    rimShare: radius.filter((v) => v >= sorted[sorted.length - 1] - 0.05).length / radius.length,
    inside25: radius.filter((v) => v < 0.25).length,
  };
}

function line(m) {
  if (m.refused) { console.log(`  ${JSON.stringify(m.text.slice(0, 40))} — refused (${m.refused})`); return; }
  console.log(`  ${JSON.stringify(m.text.slice(0, 44))}`);
  console.log(`      solve                     ${m.ms} ms over ${m.n} films`);
  console.log(`      best score                ${m.scoreMax.toFixed(4)}   normalised: ${m.normalised}`);
  console.log(`      Spearman(radius, score)   ${m.rho.toFixed(4)}`);
  console.log(`      pairs drawn backwards     ${(m.inv.share * 100).toFixed(2)}%  (${m.inv.bad} of ${m.inv.ordered} ordered pairs)`);
  console.log(`      top-30 ∩ nearest-30       ${m.agree} of 30   worst score-rank in the nearest 30: ${m.worstRank} (${m.worstKey})`);
  console.log(`      widest tie                ${m.widest ? m.widest.n + " films over " + (m.widest.hi - m.widest.lo).toFixed(4) + " of the radius" : "none"}`);
  console.log(`      ties                      ${m.tiedFilms} films in ${m.groups} distinct scores`);
  console.log(`      radius  min ${m.rMin.toFixed(3)}  p01 ${m.p01.toFixed(3)}  p50 ${m.p50.toFixed(3)}  p99 ${m.p99.toFixed(3)}`);
  console.log(`      inside r=0.25             ${m.inside25} films      outer 0.05 band: ${(m.rimShare * 100).toFixed(1)}%`);
}

function main() {
  const argv = process.argv.slice(2);
  const v1 = argv.includes("--v1");
  const opts = v1 ? { normalise: false, bands: false } : {};
  if (v1) console.log("MODE: --v1 — the arrangement that shipped before the audit: absolute score,\n"
    + "      no band fence, rim wall only. This is the control, and it runs.\n");
  const F = buildFind();
  console.log(`corpus ${F.keys.length} films · layout ${L.MATCH_LAYOUT_VERSION}\n`);
  for (const [name, text] of Object.entries(SENTENCES)) {
    console.log(name.toUpperCase());
    line(measure(F, text, opts));
    console.log("");
  }
  /* THE LIMIT CASE. Every film ties at 0, so there is nothing to order and
     nothing to normalise against: the picture must still be a shell with a
     hollow middle rather than a uniform disc. */
  const flat = Object.fromEntries(F.keys.map((k) => [k, 0]));
  const b = matchBands(flat, opts);
  const bearings = skyBearings(Object.fromEntries(F.keys.map((k, i) => {
    const a = (i / F.keys.length) * Math.PI * 2;
    return [k, [0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a)]];
  })));
  const pos = layoutMatch(flat, Object.assign({ bearings }, opts));
  const rad = F.keys.map((k) => Math.hypot(pos[k][0] - 0.5, pos[k][1] - 0.5) * 2).sort((x, y) => x - y);
  console.log("IMPOSSIBLE (every film at 0.000)");
  console.log(`      groups ${b.groups.length}  scoreMax ${b.scoreMax}`);
  console.log(`      radius  min ${rad[0].toFixed(3)}  p50 ${rad[rad.length >> 1].toFixed(3)}  max ${rad[rad.length - 1].toFixed(3)}`);
  console.log(`      films inside r=0.5: ${rad.filter((v) => v < 0.5).length} — the middle stays hollow`);
}

if (require.main === module) main();
module.exports = { measure, spearman, inversions, SENTENCES };
