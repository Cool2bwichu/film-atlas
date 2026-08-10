#!/usr/bin/env node
/* atlas-side.js — the incumbent's side of the RAG bake-off.
 *
 * ONE function. A plain English sentence in, ranked films with scores out, in
 * the same shape the dense-retrieval side returns, so the two can be diffed
 * without either being reshaped at comparison time.
 *
 *   const { buildAtlasSide } = require("./atlas-side.js");
 *   const A = buildAtlasSide();              // ~200 ms, once
 *   const r = A.search("a film about a friendship that quietly ends", { k: 5 });
 *
 *   r.results   // [{ rank, key, filmId, title, year, score }]
 *   r.read      // what the parser DID and DID NOT understand — see below
 *   r.ms        // wall time for this query alone, build excluded
 *   r.explain(key)
 *
 * There is also a lazy one-liner for callers that do not want to hold a handle:
 *
 *   const { search } = require("./atlas-side.js");
 *   search("something funny and warm for a sunday");   // builds once, memoised
 *
 * CLI:
 *   node atlas/pipeline/rag/atlas-side.js "a slow film about grief"
 *   node atlas/pipeline/rag/atlas-side.js --sanity        # the 3 shared queries
 *   node atlas/pipeline/rag/atlas-side.js --bench         # ms per query
 *   node atlas/pipeline/rag/atlas-side.js --selftest      # incl. the negation wire
 *
 * ── WHAT THIS FILE IS, AND WHAT IT REFUSES TO BE ─────────────────────────────
 *
 * It is a thin, honest adapter over two files that already exist:
 *
 *     query-parse.js  sentence -> clauses, against the 59-attribute closed
 *                     vocabulary, reporting every span it could NOT place
 *     match.js        clauses  -> a 0..1 score for EVERY film, never filtering
 *
 * It adds NO ranking logic of its own. If this file ever starts scoring, the
 * bake-off stops measuring ATLAS and starts measuring this file. The only
 * arithmetic here is sorting and slicing what match.js returned.
 *
 * ── THE FOUR THINGS THAT KEEP THE COMPARISON FAIR ────────────────────────────
 *
 * 1. UNREAD SPANS ARE REPORTED, ALWAYS. `r.read.unread` carries every span of
 *    the reader's sentence the closed vocabulary could not place, and
 *    `r.read.unreadFrac` says how much of the sentence that was. This is the
 *    single most important number on our side of the bake-off, because a
 *    closed vocabulary can only lose on language it never saw. A comparison
 *    that reports our top 5 without reporting that we read three words of a
 *    twelve-word sentence is not a comparison, it is an alibi. On the
 *    friendship query below we read 3 spans and miss 2 — say so out loud.
 *
 * 2. THE NEGATION WIRE IS THE SHIPPED ONE. query-parse.js emits `negate` on a
 *    clause; match.js has never heard of it and reads it as a positive want.
 *    Handing raw clauses to a plain matcher makes "nothing violent" return
 *    Salo and Straw Dogs at 1.000 — the exact inverse of what was typed, with
 *    no error anywhere. So this file builds the matcher over
 *    withComplements(buildTable(...)) and scores parsed.query(), which is
 *    precisely what app/query-runtime.js ships. --selftest proves the wire is
 *    the right way round by checking that the WRONG wiring still inverts.
 *
 * 3. DEGENERACY IS DECLARED, NOT HIDDEN. Three query shapes make our ranking
 *    meaningless, and the shipped runtime refuses all three rather than draw
 *    them. This file does NOT refuse — the bake-off needs a comparable list —
 *    but it sets `r.refusal` so the scorer can decide. Silently ranking a
 *    negation-only query and letting it count as a win would flatter us:
 *    "nothing violent" alone puts 1,346 of 2,204 films at exactly 1.000, and
 *    the "top 5" is then just the alphabet. `r.ties.atTop` counts that.
 *
 * 4. THE UNIVERSE IS SELECTABLE, BECAUSE THE TWO SIDES DO NOT SEE THE SAME
 *    CORPUS. match.js scores all 2,204 films. The dense side can only embed a
 *    film that has plot text, and only 1,541 of 2,204 clear the 1,500-char
 *    evidence floor — so it is structurally blind to 663 films (30.1%).
 *    Ranking us over 2,204 and them over 1,541 compares nothing. Pass
 *    { universe: <Set|array of keys> } to restrict, or use
 *    A.universes.plotted for exactly the set the dense side can see.
 *
 *    Restriction is POST-HOC on purpose: attribute models stay fitted to the
 *    whole corpus, exactly as the dense side's embeddings stay fitted to
 *    whatever it indexed. Re-fitting rarity to the subset would change what a
 *    rare attribute is worth and make the restricted run a different scorer.
 *
 * ── ONE DELIBERATE OMISSION, DECLARED ────────────────────────────────────────
 *
 * app/query-runtime.js also runs a RECORD channel: genre, country, era and
 * director (AGENTS rule 8 record, not reading) ring the films they name. It is
 * NOT wired in here, for two reasons. It lives in a file another workflow owns,
 * and — the reason that matters — it MARKS WITHOUT MOVING. It changes no
 * radius and therefore no rank. Excluding it costs our ranked list nothing.
 * If a future bake-off scores "did the right film get marked", wire it in then
 * and say so.
 *
 * ── LEXICON PROVENANCE ───────────────────────────────────────────────────────
 *
 * Shipped defaults for everything: query-lexicon.json, consensus-vocab.json,
 * questioner-phrasings.json and the three consensus shards, all as they sit in
 * the tree. `r.provenance` records the lexicon path and its sha256 on every
 * result, so a run can prove which lexicon produced it. Pass { lexicon: path }
 * to run a variant. NOTHING IN THE LEXICON WAS ADDED OR EDITED FOR THIS
 * BAKE-OFF — the with/without-variant run exists so that if anyone ever does
 * add an entry, the honest pair of numbers is one flag away.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { buildMatcher, buildTable, readShards, readCorpusKeys } = require("../match.js");
const { withComplements } = require("../questioner.js");
const { buildParser } = require("../query-parse.js");

const HERE = __dirname;
const PIPELINE = path.join(HERE, "..");
const OUT = path.join(PIPELINE, "out");
const ROOT = path.join(PIPELINE, "..");

const RUNTIME = "atlas-side-v1";

/* The three sanity queries both sides run. Written down here rather than passed
   in, so the two harnesses provably use identical strings. Each probes a
   different failure mode; see --sanity for why each was chosen. */
const SANITY = [
  "a paranoid film about surveillance and control",
  "a slow quiet film about a friendship that quietly ends",
  "a revenge film that isn't violent",
];

function sha256(p) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 12); }
  catch (e) { return null; }
}

/* ────────────────────────────────────────────────────────────────── the build */

function buildAtlasSide(opts) {
  opts = opts || {};
  const dir = opts.dir || OUT;
  const t0 = Date.now();

  const meta = opts.meta || readCorpusKeys();
  if (!meta) throw new Error("atlas-side: no static/corpus.json — cannot define the film universe");
  const keys = Object.keys(meta);

  /* filmId travels with every result so the dense side, which keys its meta by
     the same plots.json key but also carries filmId, can be joined on either. */
  const filmIds = Object.create(null);
  try {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));
    for (const [k, f] of Object.entries(c.films || {})) filmIds[k] = f.filmId || null;
  } catch (e) { /* filmId is a convenience, not a requirement */ }

  const { files, shards } = readShards(dir);
  const declaring = shards.filter((s) => s.vocabulary).length;
  if (declaring !== 1) {
    throw new Error("atlas-side: exactly one shard may declare a vocabulary, " + declaring + " do. "
      + "Merging them turns honest unknowns into confident zeros.");
  }

  /* THE WIRE. Complement-aware table, so `not:` clauses mean what they say. */
  const plain = buildTable(shards, keys);
  const table = withComplements(plain);
  const matcher = buildMatcher({ table, meta });

  const lexiconPath = opts.lexicon || path.join(PIPELINE, "query-lexicon.json");
  const parser = buildParser(Object.assign({ matcher }, opts.lexicon ? { lexicon: lexiconPath } : {}));

  /* The set of films the dense side can actually see: those with plot text. */
  let plotted = null;
  const universes = {
    get corpus() { return null; },              /* null == every film */
    get plotted() {
      if (plotted) return plotted;
      const p = JSON.parse(fs.readFileSync(path.join(dir, "plots.json"), "utf8")).films || {};
      plotted = new Set();
      for (const [k, rec] of Object.entries(p)) if (rec && rec.plot) plotted.add(k);
      return plotted;
    },
  };

  const provenance = {
    runtime: RUNTIME,
    lexicon: path.relative(ROOT, lexiconPath),
    lexiconSha: sha256(lexiconPath),
    shards: files.map((f) => path.basename(f)),
    vocab: "pipeline/consensus-vocab.json",
    films: keys.length,
    buildMs: Date.now() - t0,
  };

  /* ──────────────────────────────────────────────────────── THE ONE FUNCTION */

  function search(sentence, o) {
    o = o || {};
    const k = o.k === undefined ? 5 : o.k;
    const t = process.hrtime.bigint();

    const parsed = parser.parse(String(sentence == null ? "" : sentence));
    const query = parsed.query();

    /* A sentence with nothing in the vocabulary produces zero clauses, and
       match.js throws on an empty query rather than pretend to rank. That is
       the right call there and the wrong one here: the bake-off needs a
       comparable row for a query we could not read, and "we returned nothing"
       IS our answer. So it is scored as a declared miss, never as a crash and
       never as a silent alphabetical list. */
    const res = query.length ? matcher.score(query) : null;
    const ranked = res ? res.ranked() : [];

    const ms = Number(process.hrtime.bigint() - t) / 1e6;

    /* universe restriction, post-hoc — see header note 4 */
    let uni = o.universe === undefined ? null : o.universe;
    if (typeof uni === "string") uni = universes[uni];
    const inU = uni ? (uni instanceof Set ? (x) => uni.has(x) : (x) => uni.indexOf(x) >= 0) : null;
    const pool = inU ? ranked.filter(inU) : ranked;

    /* TIES ARE AN AMBIGUITY, NOT AN ORDER. match.js breaks a tie
       alphabetically, so a film's rank inside a tied band is an artifact of its
       first letter. On the friendship query Old Joy lands at #24 — tied with 10
       other films at exactly 0.7037, ranks 20-30. Reporting "#24" without
       reporting "one of 11 indistinguishable" would credit this side with a
       precision it does not have, and the bake-off would score a coin flip as a
       hit. Every result therefore carries the width of its own tie band. */
    const tieOf = new Map();
    if (res) {
      let i = 0;
      while (i < pool.length) {
        let j = i;
        while (j + 1 < pool.length && Math.abs(res.scores[pool[j + 1]] - res.scores[pool[i]]) < 1e-9) j++;
        for (let x = i; x <= j; x++) tieOf.set(pool[x], { n: j - i + 1, from: i + 1, to: j + 1 });
        i = j + 1;
      }
    }

    const results = (k < 0 ? pool : pool.slice(0, k)).map((key, i) => ({
      rank: i + 1,
      key,
      filmId: filmIds[key] || null,
      title: (meta[key] || {}).title || key,
      year: (meta[key] || {}).year || null,
      score: res.scores[key],
      tie: tieOf.get(key) || { n: 1, from: i + 1, to: i + 1 },
    }));

    /* ── what we did and did not read ─────────────────────────────────────── */
    const text = parsed.text || "";
    const unreadChars = parsed.unread.reduce((a, u) => a + (u.text || "").length, 0);
    const byKind = Object.create(null);
    for (const u of parsed.unread) byKind[u.kind || "unknown"] = (byKind[u.kind || "unknown"] || 0) + 1;

    const positive = parsed.clauses.filter((c) => !c.negate);
    const read = {
      text,
      readings: parsed.readings.map((r) => ({
        kind: r.kind, said: r.text, label: r.label, terms: r.terms,
        weight: r.weight, negate: !!r.negate,
        film: r.film ? { key: r.film.key, title: r.film.title, year: r.film.year } : undefined,
        widened: r.widened === undefined ? undefined : r.widened,
      })),
      unread: parsed.unread.map((u) => ({ said: u.text, start: u.start, end: u.end, why: u.why, kind: u.kind })),
      unreadSpans: parsed.unread.length,
      unreadChars,
      unreadFrac: text.length ? unreadChars / text.length : 0,
      clauses: parsed.clauses.length,
      positiveClauses: positive.length,
      negatedClauses: parsed.clauses.length - positive.length,
      conflicts: parsed.conflicts || [],
      query,
    };

    /* ── degeneracy, declared ─────────────────────────────────────────────── */
    const first = res ? (res.explain(keys[0]) || {}) : {};
    const denom = first.denom || 0;
    const topScore = res && pool.length ? res.scores[pool[0]] : 0;
    let atTop = 0;
    if (res) for (const key of pool) { if (res.scores[key] >= topScore - 1e-9) atTop++; else break; }

    let refusal = null;
    if (!parsed.clauses.length) {
      refusal = { code: "nothing-read", detail: "No span of that sentence is in the 59-attribute vocabulary. Every film scores 0 and the order below is the alphabet." };
    } else if (!positive.length) {
      refusal = { code: "negation-only", detail: "Only negations were read. The complement of a rare attribute is a common one, so nearly every film satisfies it: " + atTop + " of " + pool.length + " tie at the top." };
    } else if (!(denom > 0)) {
      refusal = { code: "no-denominator", detail: "Every term read is unknown to the corpus, so every film sits at the same distance." };
    }

    return {
      side: "atlas",
      runtime: RUNTIME,
      query: text,
      k,
      ms,
      universe: { name: o.universe ? (typeof o.universe === "string" ? o.universe : "custom") : "corpus", n: pool.length },
      results,
      read,
      ties: { topScore, atTop, degenerate: atTop > Math.max(10, pool.length * 0.02) },
      refusal,
      provenance,
      scores: res ? res.scores : Object.create(null),
      explain: (key) => (res ? res.explain(key) : null),
    };
  }

  return { search, universes, provenance, meta, keys, matcher, parser, filmIds };
}

/* Lazy singleton, so `search()` really is one callable function. */
let _default = null;
function search(sentence, o) {
  if (!_default) _default = buildAtlasSide();
  return _default.search(sentence, o);
}

/* ──────────────────────────────────────────────────────────────────── report */

function fmtResult(r, label) {
  const L = [];
  L.push("  " + (label || r.query));
  L.push("    read    : " + (r.read.readings.length
    ? r.read.readings.map((x) => (x.negate ? "NOT " : "") + '"' + x.said + '" -> ' + x.label).join("  |  ")
    : "(nothing)"));
  L.push("    UNREAD  : " + (r.read.unread.length
    ? r.read.unread.map((u) => '"' + u.said + '"').join("  ") + "   (" + r.read.unreadChars + "/" + r.query.length
      + " chars = " + (r.read.unreadFrac * 100).toFixed(0) + "% of the sentence)"
    : "(none — the whole sentence was read)"));
  if (r.refusal) L.push("    REFUSAL : " + r.refusal.code + " — " + r.refusal.detail);
  if (r.ties.degenerate && !r.refusal) L.push("    TIES    : " + r.ties.atTop + " films tie at " + r.ties.topScore.toFixed(3));
  L.push("    " + r.ms.toFixed(1) + " ms over " + r.universe.n + " films (" + r.universe.name + ")");
  for (const x of r.results) {
    L.push("      " + String(x.rank).padStart(2) + ". " + x.score.toFixed(3) + "  "
      + x.title + (x.year ? " (" + x.year + ")" : "")
      + (x.tie.n > 1 ? "   (tied with " + (x.tie.n - 1) + ", ranks " + x.tie.from + "-" + x.tie.to + ")" : "")
      + "   [" + x.key + "]");
  }
  return L.join("\n");
}

/* ────────────────────────────────────────────────────────────────── selftest */

function selftest() {
  let ok = true;
  const say = (pass, msg) => { console.log((pass ? "  ok   " : "  FAIL ") + msg); if (!pass) ok = false; };
  const A = buildAtlasSide();

  const r = A.search("a paranoid film about surveillance and control", { k: 5 });
  say(r.results.length === 5, "returns k results");
  say(r.results.every((x) => x.score >= 0 && x.score <= 1), "scores are 0..1");
  say(r.results.every((x, i) => i === 0 || x.score <= r.results[i - 1].score), "results are sorted descending");
  say(r.ms > 0 && r.ms < 5000, "ms is reported (" + r.ms.toFixed(1) + ")");
  say(Array.isArray(r.read.unread), "unread spans are reported");

  /* THE NEGATION WIRE. This check is only meaningful if the WRONG wiring still
     fails, so prove both directions rather than asserting one. */
  const neg = A.search("a revenge film that isn't violent", { k: 60 });
  const negTitles = neg.results.map((x) => x.title.toLowerCase());
  const nasty = ["salo", "salò", "straw dogs", "saving private ryan", "irreversible"];
  const leaked = negTitles.filter((t) => nasty.some((n) => t.includes(n)));
  say(leaked.length === 0, "negation is not inverted: no " + nasty.join("/") + " in top 60"
    + (leaked.length ? " — LEAKED " + leaked.join(", ") : ""));

  /* the deliberate break: score the same parse through a PLAIN table and
     confirm the inversion reappears. If this does not fail, the check above
     was never able to fail either. */
  const { shards } = readShards(OUT);
  const plainMatcher = buildMatcher({ table: buildTable(shards, A.keys), meta: A.meta });
  const p2 = A.parser.parse("a revenge film that isn't violent");
  const bad = plainMatcher.score(p2.clauses.map((c) => ({ anyOf: c.anyOf, weight: c.weight, label: c.label })));
  const badTop = bad.ranked().slice(0, 60).map((k) => (A.meta[k].title || "").toLowerCase());
  const badLeak = badTop.filter((t) => nasty.some((n) => t.includes(n)));
  say(badLeak.length > 0, "the WRONG wiring still inverts (proves the check above can fail): "
    + (badLeak.join(", ") || "NOTHING LEAKED — the check is vacuous"));

  /* universe restriction */
  const full = A.search("a film about coming home", { k: -1 });
  const sub = A.search("a film about coming home", { k: -1, universe: "plotted" });
  say(sub.universe.n < full.universe.n, "plotted universe is smaller (" + sub.universe.n + " < " + full.universe.n + ")");
  const pl = A.universes.plotted;
  say(sub.results.every((x) => pl.has(x.key)), "restricted results are all inside the universe");
  say(full.results.filter((x) => pl.has(x.key)).map((x) => x.key).join() === sub.results.map((x) => x.key).join(),
    "restriction is pure filtering — it never reorders");

  /* tie bands are reported, and they can be wide */
  const fr = A.search("a slow quiet film about a friendship that quietly ends", { k: -1 });
  const oj = fr.results.find((x) => x.key === "old joy");
  say(!!oj && oj.tie.n > 1, "a tied result declares its band width (Old Joy: #" + (oj ? oj.rank : "?")
    + ", one of " + (oj ? oj.tie.n : "?") + " at the same score)");
  say(fr.results.every((x) => x.rank >= x.tie.from && x.rank <= x.tie.to), "tie bands contain their own members");

  /* nothing-read is declared, not silently ranked */
  const junk = A.search("zzzz qqqq wwww");
  say(junk.refusal && junk.refusal.code === "nothing-read", "an unreadable sentence is declared, not ranked");

  console.log(ok ? "\nselftest OK" : "\nselftest FAILED");
  return ok;
}

/* ────────────────────────────────────────────────────────────────────── main */

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) process.exit(selftest() ? 0 : 1);

  if (argv.includes("--sanity")) {
    const A = buildAtlasSide();
    const uni = argv.includes("--plotted") ? "plotted" : undefined;
    console.log("ATLAS SIDE — the three shared sanity queries");
    console.log("lexicon " + A.provenance.lexicon + " @" + A.provenance.lexiconSha
      + "   build " + A.provenance.buildMs + " ms   universe "
      + (uni === "plotted" ? "plotted (dense-visible only)" : "corpus (all " + A.keys.length + ")") + "\n");
    for (const q of SANITY) {
      console.log(fmtResult(A.search(q, { k: 5, universe: uni })) + "\n");
    }
    return;
  }

  if (argv.includes("--fame")) {
    /* AGENTS rule 1 baseline, so the dense side has something to be judged
       against. match.js's own fameCheck() is cache-only and keys the cache by
       TODAY's 60-day window; that window rolls daily and the cache in the tree
       is one day behind, so fameCheck() correctly refuses to run and says so.
       Rather than fetch (forbidden, and it would make the number depend on the
       day) this reads the window the cache ACTUALLY holds and reuses
       plot-source.js's own spearman/bootstrapCI — same statistic, stated
       window. It is labelled, not laundered. */
    const ps = require("../plot-source.js");
    const A = buildAtlasSide();
    const dirV = ps.CACHE_VIEWS;
    const names = fs.readdirSync(dirV).filter((n) => n.startsWith("pv_"));
    const stamp = names.length ? names[0].split("_")[1] : null;
    const views = Object.create(null);
    for (const key of A.keys) {
      const t = A.meta[key] && A.meta[key].wikipedia;
      if (!t) continue;
      const f = ps.cachePath(dirV, "pv_" + stamp + "_" + t);
      if (!fs.existsSync(f)) continue;
      let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { continue; }
      if (!d || !Array.isArray(d.items)) continue;
      views[key] = d.items.reduce((a, it) => a + (it.views || 0), 0);
    }
    console.log("RULE 1 — atlas-side score vs 60-day Wikipedia pageviews");
    console.log("  cache window " + stamp + " (today's key is " + ps.viewsWindow().start
      + "; cache is stale by a day, so this is read at the cached window, never fetched)");
    console.log("  gate |rho| <= " + require("../match.js").SCORE_FAME_MAX_RHO
      + "   films with pageviews: " + Object.keys(views).length + "\n");
    let worst = 0;
    for (const q of SANITY) {
      const r = A.search(q, { k: -1 });
      if (!r.results.length) { console.log("  " + q + "\n    (nothing read — no ranking to correlate)\n"); continue; }
      const xs = [], ys = [], cx = [];
      for (const key of A.keys) {
        if (views[key] === undefined) continue;
        xs.push(r.scores[key]); ys.push(views[key]);
        const e = r.explain(key); cx.push(e ? e.coverage : 0);
      }
      const rho = ps.spearman(xs, ys);
      const ci = ps.bootstrapCI(xs, ys, 2000, 20260809);
      worst = Math.max(worst, Math.abs(rho));
      console.log("  " + q);
      console.log("    " + (Math.abs(rho) <= 0.45 ? "PASS" : "FAIL") + "  rho(score, views) = " + rho.toFixed(4)
        + "  ci95 [" + ci.map((x) => x.toFixed(3)).join(", ") + "]  n=" + xs.length);
      console.log("    rho(coverage, views) = " + ps.spearman(cx, ys).toFixed(4)
        + "   <- the variable match.js deliberately refuses to multiply by\n");
    }
    console.log("  worst |rho| across the three: " + worst.toFixed(4));
    console.log("  A genuine popularity gradient is positive for EVERY query, because it");
    console.log("  comes from the scorer. A sign that flips is a property of the query.");
    return;
  }

  if (argv.includes("--bench")) {
    const A = buildAtlasSide();
    const battery = SANITY.concat([
      "something funny and warm for a sunday", "bleak, slow, and beautiful to look at",
      "a film about coming home", "menacing, set in a small town", "something like blade runner",
      "melancholy, city at night", "in space, makes you think", "grief, contemplative, painterly",
      "a slow burn about obsession", "survival in the wilderness", "austere, spiritual, wordless",
    ]);
    for (const q of battery) A.search(q, { k: 5 });          /* warm */
    const ts = [];
    for (const q of battery) { const r = A.search(q, { k: 5 }); ts.push(r.ms); }
    ts.sort((a, b) => a - b);
    const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
    console.log("build      " + A.provenance.buildMs + " ms (once)");
    console.log("n queries  " + ts.length);
    console.log("mean       " + mean.toFixed(1) + " ms");
    console.log("median     " + ts[ts.length >> 1].toFixed(1) + " ms");
    console.log("min/max    " + ts[0].toFixed(1) + " / " + ts[ts.length - 1].toFixed(1) + " ms");
    return;
  }

  const q = argv.filter((a) => !a.startsWith("--")).join(" ");
  if (!q) {
    console.log("usage: node atlas/pipeline/rag/atlas-side.js \"a sentence\"");
    console.log("       node atlas/pipeline/rag/atlas-side.js --sanity [--plotted]");
    console.log("       node atlas/pipeline/rag/atlas-side.js --bench | --selftest");
    return;
  }
  const A = buildAtlasSide();
  const kArg = argv.indexOf("--top");
  const k = kArg >= 0 ? Number(argv[kArg + 1]) : 5;
  console.log(fmtResult(A.search(q, { k, universe: argv.includes("--plotted") ? "plotted" : undefined })));
}

module.exports = { buildAtlasSide, search, SANITY, selftest };

if (require.main === module) main();
