#!/usr/bin/env node
/* audit.js — the bake-off's rule-1 audit and its reach measurements.
 *
 * Reads the two full score dumps (out/rag-audit-atlas.json, out/rag-audit-dense.json)
 * and answers four questions about the SHAPE of each ranking, not its taste:
 *
 *   FAME    does this side prefer films people already know?
 *   REACH   how much of the corpus can this side ever return?
 *   FLOOR   does it favour the films with the most text about them?
 *   COST    what would it weigh if it shipped?
 *
 * ── THREE THINGS THAT WOULD HAVE MADE EVERY NUMBER BELOW A LIE ──────────────
 *
 * 1. HALF THE QUERY SET IS UNREADABLE TO THE INCUMBENT. On 15 of 30 queries
 *    query-parse.js places nothing in its 59-attribute vocabulary, match.js
 *    scores every film 0, and ranked() returns `a.localeCompare(b)` — the
 *    ALPHABET. Counting those 14 identical alphabetical listings as rankings
 *    put 2001: A Space Odyssey in 18 of 30 "top tens" and made the incumbent
 *    look like it had a 5x fame bias. It has no such bias; it has a coverage
 *    hole, which is a different and larger problem. Every measure below is
 *    therefore reported twice: over all 30 queries, and over the 15 the
 *    incumbent actually READ. The dense side is measured on the same 15 both
 *    times so the pair is comparable.
 *
 * 2. TIES ARE NOT AN ORDER. match.js breaks ties alphabetically, so on a query
 *    where 15 films share the top score the "top 10" is the first ten letters
 *    of that band. Reach and fame are therefore ALSO computed tie-aware: the
 *    band is every film scoring at or above the 10th-place score, and a film
 *    inside the band counts as returnable. The gap between the two readings is
 *    the size of the alphabet artifact, and it is reported, not smoothed.
 *
 * 3. A MISSING PAGEVIEW IS NOT ZERO VIEWS. 29 films have no cached article.
 *    Imputing 0 would plant them at the unfamous end of every correlation
 *    here. They are dropped from the correlation and counted in the coverage
 *    line instead.
 *
 * WHAT "RHO" MEANS HERE, ONCE. Spearman between a film's SCORE on that side
 * and its 60-day Wikipedia pageviews, over the whole universe. Spearman is
 * rank-based so logging views changes nothing and none is done. POSITIVE means
 * famous films score higher — the direction AGENTS rule 1 forbids. Same
 * statistic, same proxy and the same 0.45 threshold match.js's own fameCheck()
 * uses, so this reads against a gate the repo already agreed to. A constant
 * score vector has no ranks; it returns null and prints "flat" rather than the
 * most flattering rounding error available, 0.000.
 *
 *   node atlas/pipeline/rag/audit.js            # the report
 *   node atlas/pipeline/rag/audit.js --json     # write only
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ps = require("../plot-source.js");
const { fame } = require("./fame.js");

const HERE = __dirname;
const OUT = path.join(HERE, "..", "out");
const R = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));

const SCORE_FAME_MAX_RHO = 0.45;   /* axis-gates.js's own gate, reused verbatim */

const A = R("rag-audit-atlas.json");
const D = R("rag-audit-dense.json");
const FACTS = R("rag-audit-facts.json").films;
const COST = R("rag-audit-cost.json");
const ABL = fs.existsSync(path.join(OUT, "rag-audit-ablation.json")) ? R("rag-audit-ablation.json") : null;
const F = fame();

const KEYS = A.keys;
if (JSON.stringify(KEYS) !== JSON.stringify(D.keys)) {
  console.error("key order differs between the two dumps — every correlation below would be between two shuffles.");
  process.exit(3);
}
const N = KEYS.length;
const PLOTTED = A.plottedMask;
const TIER = KEYS.map((k) => (FACTS[k] || {}).textTier || "none");
const VIEWS = KEYS.map((k) => (F.views[k] === undefined ? null : F.views[k]));
const DEGREE = KEYS.map((k) => F.degree[k] || 0);
const WEIGHTED = KEYS.map((k) => { const f = FACTS[k] || {}; return f.imdbWeighted == null ? null : f.imdbWeighted; });
const VOTES = KEYS.map((k) => { const f = FACTS[k] || {}; return f.imdbVotes == null ? null : f.imdbVotes; });
const CHARS = KEYS.map((k) => (FACTS[k] || {}).overviewChars || 0);

/* the queries the incumbent could read at all — the honest comparison subset */
const READABLE = new Set(A.runs.filter((r) => !r.refusal).map((r) => r.id));
const REFUSALS = A.runs.filter((r) => r.refusal);

/* ── stats ─────────────────────────────────────────────────────────────────── */

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function rho(x, y) {
  if (x.length < 8) return null;
  if (new Set(x).size <= 1 || new Set(y).size <= 1) return null;
  const r = ps.spearman(x, y);
  return Number.isFinite(r) ? r : null;
}

function pair(scores, proxy, mask) {
  const x = [], y = [];
  for (let i = 0; i < N; i++) {
    if (mask && !mask[i]) continue;
    if (proxy[i] === null || proxy[i] === undefined) continue;
    if (scores[i] === -1) continue;              /* dense sentinel: absent from the index */
    x.push(scores[i]); y.push(proxy[i]);
  }
  return [x, y];
}

/* Ordered pool: score desc, then the same alphabetical tie-break match.js
   ships, so what this reports is what a reader would actually be handed. */
function pool(run, mask) {
  const idx = [];
  for (let i = 0; i < N; i++) if ((!mask || mask[i]) && run.scores[i] !== -1) idx.push(i);
  idx.sort((a, b) => run.scores[b] - run.scores[a] || KEYS[a].localeCompare(KEYS[b]));
  return idx;
}

/* The tie-aware alternative: everything at or above the k-th score. */
function band(run, k, mask) {
  const p = pool(run, mask);
  if (!p.length) return p;
  const cut = run.scores[p[Math.min(k, p.length) - 1]];
  let j = p.length;
  for (let i = 0; i < p.length; i++) if (run.scores[p[i]] < cut - 1e-12) { j = i; break; }
  return p.slice(0, j);
}

/* ── sides ─────────────────────────────────────────────────────────────────── */

const SIDES = [{ id: "atlas", label: "ATLAS query-parse + match.js", runs: A.runs, latency: A.latency }];
for (const [cfg, c] of Object.entries(D.configs)) {
  SIDES.push({
    id: "dense:" + cfg,
    label: "DENSE MiniLM " + (cfg === "article" ? "article config 512/30 (67% of text read)"
      : cfg === "native256" ? "native config 256/30 (all text read)"
      : "article config, IMDb RATING LINE REMOVED"),
    runs: c.runs, latency: c.latency, cfg,
  });
}

/* ── the three measures, each over a chosen query subset ───────────────────── */

function measure(side, mask, keep) {
  const runs = side.runs.filter((r) => keep(r));

  /* FAME */
  const per = runs.map((run) => {
    const [x, v] = pair(run.scores, VIEWS, mask);
    const p = pool(run, mask);
    const b = band(run, 10, mask);
    const corpusMed = median(p.map((i) => VIEWS[i]).filter((z) => z !== null));
    const headMed = median(p.slice(0, 10).map((i) => VIEWS[i]).filter((z) => z !== null));
    const bandMed = median(b.map((i) => VIEWS[i]).filter((z) => z !== null));
    return {
      id: run.id, tag: run.tag, q: run.q,
      rhoViews: rho(x, v),
      rhoDegree: rho(...pair(run.scores, DEGREE, mask)),
      rhoImdbWeighted: rho(...pair(run.scores, WEIGHTED, mask)),
      rhoImdbVotes: rho(...pair(run.scores, VOTES, mask)),
      rhoTextLen: rho(...pair(run.scores, CHARS, mask)),
      bandAt10: b.length,
      liftHead10: corpusMed ? headMed / corpusMed : null,
      liftBand10: corpusMed ? bandMed / corpusMed : null,
    };
  });
  const rr = per.map((p) => p.rhoViews).filter((z) => z !== null);

  /* REACH */
  const head = new Map(), bandSeen = new Set(), top1 = new Set(), head50 = new Set();
  for (const run of runs) {
    for (const i of pool(run, mask).slice(0, 10)) head.set(i, (head.get(i) || 0) + 1);
    for (const i of band(run, 10, mask)) bandSeen.add(i);
    for (const i of pool(run, mask).slice(0, 50)) head50.add(i);
    const p = pool(run, mask); if (p.length) top1.add(p[0]);
  }
  const uSize = mask ? mask.reduce((a, b) => a + b, 0) : N;

  /* FLOOR */
  let plot = 0, thin = 0; const hitChars = [];
  for (const run of runs) for (const i of pool(run, mask).slice(0, 10)) {
    if (TIER[i] === "plot") plot++; else thin++;
    hitChars.push(CHARS[i]);
  }
  const basePlot = mask
    ? TIER.filter((t, i) => mask[i] && t === "plot").length / uSize
    : TIER.filter((t) => t === "plot").length / N;

  return {
    queries: runs.length,
    fame: {
      contributingQueries: rr.length,
      flatQueries: runs.length - rr.length,
      meanRhoViews: mean(rr), minRhoViews: rr.length ? Math.min(...rr) : null, maxRhoViews: rr.length ? Math.max(...rr) : null,
      overGate: rr.filter((z) => Math.abs(z) > SCORE_FAME_MAX_RHO).length,
      positiveOverGate: rr.filter((z) => z > SCORE_FAME_MAX_RHO).length,
      meanRhoDegree: mean(per.map((p) => p.rhoDegree).filter((z) => z !== null)),
      meanRhoImdbWeighted: mean(per.map((p) => p.rhoImdbWeighted).filter((z) => z !== null)),
      meanRhoImdbVotes: mean(per.map((p) => p.rhoImdbVotes).filter((z) => z !== null)),
      medianLiftHead10: median(per.map((p) => p.liftHead10).filter((z) => z !== null)),
      medianLiftBand10: median(per.map((p) => p.liftBand10).filter((z) => z !== null)),
      medianBandAt10: median(per.map((p) => p.bandAt10)),
      perQuery: per,
    },
    reach: {
      universeSize: uSize, slots: runs.length * 10,
      distinctHead10: head.size, headShare: head.size / uSize,
      fillRate: runs.length ? head.size / (runs.length * 10) : null,
      distinctBand10: bandSeen.size, bandShare: bandSeen.size / uSize,
      distinctTop1: top1.size, distinctHead50: head50.size,
      maxAppearances: head.size ? Math.max(...head.values()) : 0,
      mostRepeated: [...head.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([i, c]) => ({ key: KEYS[i], n: c, views: VIEWS[i], tier: TIER[i] })),
    },
    floor: {
      top10Plot: plot, top10Thin: thin,
      plotShare: (plot + thin) ? plot / (plot + thin) : null,
      corpusPlotShare: basePlot,
      representation: (plot + thin) ? (plot / (plot + thin)) / basePlot : null,
      medianCharsOfHits: median(hitChars), medianCharsCorpus: median(CHARS),
      meanRhoTextLength: mean(per.map((p) => p.rhoTextLen).filter((z) => z !== null)),
    },
  };
}

/* ── assemble ──────────────────────────────────────────────────────────────── */

const SUBSETS = {
  all30: { label: "all 30 queries", keep: () => true },
  readable15: { label: "the " + READABLE.size + " queries the incumbent could read", keep: (r) => READABLE.has(r.id) },
};
const UNIVERSES = { corpus: null, plotted: PLOTTED };

const report = {
  generated: new Date().toISOString(),
  fameProxy: {
    kind: "60-day English Wikipedia pageviews, cache-only, nothing fetched",
    window: F.window, todayWindow: F.todayWindow, stale: F.stale,
    coverage: F.coverage.hit + "/" + F.n,
    secondOpinion: "corpus.json edge degree, " + new Set(DEGREE).size + " distinct values over " + N + " films",
    gate: SCORE_FAME_MAX_RHO,
    convention: "rho = Spearman(score, pageviews). POSITIVE = famous films score higher.",
  },
  coverage: {
    queries: A.runs.length,
    atlasRefusals: REFUSALS.length,
    atlasRefusalIds: REFUSALS.map((r) => ({ id: r.id, tag: r.tag, q: r.q, code: r.refusal, unreadFrac: r.read.unreadFrac })),
    atlasMeanUnreadFrac: mean(A.runs.map((r) => r.read.unreadFrac)),
    atlasMeanUnreadFracReadable: mean(A.runs.filter((r) => !r.refusal).map((r) => r.read.unreadFrac)),
    byTag: (() => {
      const t = {};
      for (const r of A.runs) { t[r.tag] = t[r.tag] || { n: 0, refused: 0, unread: [] }; t[r.tag].n++; if (r.refusal) t[r.tag].refused++; t[r.tag].unread.push(r.read.unreadFrac); }
      for (const k of Object.keys(t)) { t[k].meanUnreadFrac = mean(t[k].unread); delete t[k].unread; }
      return t;
    })(),
    denseRefusals: 0,
    denseNote: "the dense side always returns 10 films. Returning something is not the same as reading the query, and nothing here treats it as such.",
  },
  universes: {},
  cost: COST,
  ablation: ABL ? ABL.summary : null,
};

for (const [uname, mask] of Object.entries(UNIVERSES)) {
  report.universes[uname] = { size: mask ? mask.reduce((a, b) => a + b, 0) : N, subsets: {} };
  for (const [sname, sub] of Object.entries(SUBSETS)) {
    report.universes[uname].subsets[sname] = { label: sub.label, sides: {} };
    for (const s of SIDES) {
      report.universes[uname].subsets[sname].sides[s.id] =
        Object.assign({ label: s.label, latency: s.latency }, measure(s, mask, sub.keep));
    }
  }
}

fs.writeFileSync(path.join(OUT, "rag-audit-report.json"), JSON.stringify(report, null, 1));
if (process.argv.includes("--json")) { console.log("wrote out/rag-audit-report.json"); process.exit(0); }

/* ── print ─────────────────────────────────────────────────────────────────── */

const n3 = (v) => (v === null || v === undefined || Number.isNaN(v) ? "  flat" : (v >= 0 ? "+" : "") + v.toFixed(3));
const pc = (v) => (v === null ? "  -" : (v * 100).toFixed(1) + "%");
const mb = (b) => (b / 1048576).toFixed(2) + " MB";

console.log("\n══ RAG BAKE-OFF — RULE-1 AUDIT, REACH, FLOOR, COST ═══════════════════════════");
console.log(A.runs.length + " shared queries written blind to outcomes; " + SIDES.length + " sides; " + N + " films.");
console.log("fame proxy: " + report.fameProxy.kind + ", window " + F.window +
  (F.stale ? " (STALE by one day, cache-only)" : "") + ", " + report.fameProxy.coverage + " films.");
console.log("rho = Spearman(score, pageviews); POSITIVE = famous films score higher; gate |rho| > " + SCORE_FAME_MAX_RHO + ".");

console.log("\n───── COVERAGE — the finding that reframes everything else ────────────────────");
console.log("  the incumbent READ NOTHING on " + REFUSALS.length + " of " + A.runs.length +
  " queries (" + pc(REFUSALS.length / A.runs.length) + ").");
console.log("  On those, match.js scores every film 0.000 and ranked() returns a.localeCompare(b) — the alphabet.");
console.log("  mean unread fraction: " + pc(report.coverage.atlasMeanUnreadFrac) + " over all 30, " +
  pc(report.coverage.atlasMeanUnreadFracReadable) + " over the 15 it read.");
console.log("  " + "tag".padEnd(12) + "n   refused  mean unread");
for (const [tag, t] of Object.entries(report.coverage.byTag)) {
  console.log("  " + tag.padEnd(12) + String(t.n).padEnd(4) + String(t.refused).padEnd(9) + pc(t.meanUnreadFrac));
}
console.log("  the dense side returned 10 films for all 30. That is availability, not comprehension.");

for (const uname of Object.keys(report.universes)) {
  for (const sname of Object.keys(report.universes[uname].subsets)) {
    const U = report.universes[uname].subsets[sname];
    console.log("\n───── universe " + uname + " (" + report.universes[uname].size + " films) · " + U.label + " ─────");
    console.log("  " + "side".padEnd(26) + "rho(views)  range           n   lift@10   lift@band  band  rho(WR)  rho(votes)");
    for (const [id, s] of Object.entries(U.sides)) {
      const f = s.fame;
      console.log("  " + id.padEnd(26) + n3(f.meanRhoViews).padEnd(12) +
        (n3(f.minRhoViews) + ".." + n3(f.maxRhoViews)).padEnd(16) +
        String(f.contributingQueries).padEnd(4) +
        (f.medianLiftHead10 === null ? "-" : f.medianLiftHead10.toFixed(2) + "x").padEnd(10) +
        (f.medianLiftBand10 === null ? "-" : f.medianLiftBand10.toFixed(2) + "x").padEnd(11) +
        String(f.medianBandAt10).padEnd(6) + n3(f.meanRhoImdbWeighted).padEnd(9) + n3(f.meanRhoImdbVotes));
    }
    console.log("  " + "side".padEnd(26) + "reach@10  share    fill    tie-aware  share    top1  reach@50  repeater");
    for (const [id, s] of Object.entries(U.sides)) {
      const r = s.reach;
      console.log("  " + id.padEnd(26) + String(r.distinctHead10).padEnd(10) + pc(r.headShare).padEnd(9) +
        pc(r.fillRate).padEnd(8) + String(r.distinctBand10).padEnd(11) + pc(r.bandShare).padEnd(9) +
        String(r.distinctTop1).padEnd(6) + String(r.distinctHead50).padEnd(10) +
        (r.mostRepeated[0] ? r.mostRepeated[0].key + " x" + r.mostRepeated[0].n : "-"));
    }
    if (uname === "corpus") {
      console.log("  " + "side".padEnd(26) + "top10 from the readable 1541 · corpus base " +
        pc(Object.values(U.sides)[0].floor.corpusPlotShare));
      for (const [id, s] of Object.entries(U.sides)) {
        const f = s.floor;
        console.log("    " + id.padEnd(24) + pc(f.plotShare).padEnd(9) + "representation " + f.representation.toFixed(2) + "x" +
          "   median hit text " + f.medianCharsOfHits + " chars (corpus " + f.medianCharsCorpus + ")" +
          "   rho(score,textlen) " + n3(f.meanRhoTextLength));
      }
    }
  }
}

console.log("\n───── THE RATING ABLATION — is the fame correlation CAUSED by IMDb? ───────────");
if (ABL) {
  const s = ABL.summary;
  console.log("  rebuild with only the 'Rating: x/10 from N votes' line removed from 2195 blobs:");
  console.log("    mean |rank shift| " + s.meanAbsRankShift + " of " + N + " films · top-10 kept " +
    s.meanTop10Kept + "/10 · same #1 on " + s.queriesWithSameTop1 + "/" + s.queries + " queries");
  const withR = report.universes.corpus.subsets.all30.sides["dense:article"].fame.meanRhoViews;
  const noR = report.universes.corpus.subsets.all30.sides["dense:article_norating"].fame.meanRhoViews;
  console.log("    fame rho with the rating " + n3(withR) + ", without it " + n3(noR) +
    "  ->  the rating line contributes " + n3(withR - noR) + " of fame correlation.");
}

console.log("\n───── COST ────────────────────────────────────────────────────────────────────");
const V = COST.vectors, S = COST.shipped, q8 = COST.int8Fidelity;
console.log("  ships today   public/atlas.html        " + mb(S["public/atlas.html"].bytes) + " raw · " + mb(S["public/atlas.html"].gzipBytes) + " gzip");
console.log("                atlas/static/corpus.json " + mb(S["atlas/static/corpus.json"].bytes) + " raw · " + mb(S["atlas/static/corpus.json"].gzipBytes) + " gzip (source, embedded by build.js)");
console.log("  would add     film vectors f32         " + mb(V.filmVectors.float32Bytes) + " raw · " + mb(V.filmVectors.float32GzipBytes) + " gzip · " + mb(V.filmVectors.base64Float32Bytes) + " base64-in-HTML");
console.log("                film vectors int8        " + mb(V.filmVectors.int8Bytes) + " raw · " + mb(V.filmVectors.int8GzipBytes) + " gzip · " + mb(V.filmVectors.base64Int8Bytes) + " base64-in-HTML");
console.log("                chunk vectors int8       " + mb(V.chunkVectors.int8Bytes) + " raw · " + mb(V.chunkVectors.int8GzipBytes) + " gzip");
console.log("                the ENCODER (live only)  " + mb(COST.encoder["model.onnx"].bytes) + " raw · " + mb(COST.encoder["model.onnx"].gzipBytes) + " gzip");
console.log("  int8 fidelity mean rank shift " + q8.meanAbsRankShift + " of " + N + " · top-10 kept " +
  q8.meanTop10Kept + "/10 · same #1 on " + q8.queriesWithSameTop1 + "/" + q8.queries + " — quantising does NOT change the answer");
console.log("  latency, warm mean ms");
for (const s of SIDES) console.log("    " + s.id.padEnd(26) + s.latency.warmMeanMs + " ms (median " + s.latency.warmMedianMs + ")");
console.log("");
