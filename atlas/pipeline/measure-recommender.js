#!/usr/bin/env node
/* measure-recommender.js — does the shelf obey AGENTS rule 1, or does it just
 * hand you more of the director you already picked?
 *
 *   node pipeline/measure-recommender.js            # 300 profiles, gates, PASS/FAIL
 *   node pipeline/measure-recommender.js --selftest # prove every check can fail
 *   node pipeline/measure-recommender.js --profiles 1000 --json out.json
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * `connections()` — the map view's ranking — carries three devices and a long
 * comment justifying each: SIGNAL_WEIGHT so a shared cinematographer cannot
 * outrank an adaptation, a x0.55 penalty because "same hand is the least
 * surprising link", and a per-director cap with an uncapped second pass. Every
 * one of those was measured into existence.
 *
 * `recommend()`, thirty lines below it in the same file, has none of them. It
 * scores `strength * (authored ? 1.2 : 1)` and takes the top twelve. Nothing in
 * the repository had ever measured it, and raw strength is very nearly a test
 * for "is this a production credit": same-director edges carry median strength
 * 0.699 against 0.558 for everything else, and 3,106 of the corpus's 5,605 crew
 * edges join two films by the same director.
 *
 * So the shelf ranks on filmography. Measured here at HEAD, 300 seeded
 * three-film profiles and 3,600 suggestions: 62.6% share a director with a
 * loved film, against 17.0% for the map view at the same K.
 *
 * ── HOW IT READS THE THING IT MEASURES ──────────────────────────────────────
 *
 * `recommend()`, `connections()` and `sigWeight` are PARSED OUT OF
 * app/template.html and evaluated here, never copied. Same discipline
 * measure-claims.js uses on the ranking table and build-registers.js uses on the
 * palette: a scorer copied into a checker is a scorer that goes stale the moment
 * somebody edits the app, and the checker then certifies code that no longer
 * ships. It also means this tool measures a PROPOSED change to recommend() the
 * moment the change is in the file, with no edit here.
 *
 * ── WHAT IT MEASURES ────────────────────────────────────────────────────────
 *
 *   sameDirector  the share of suggestions that share a director with one of
 *                 the three loved films. This is the whole question. It is
 *                 reported beside the MAP VIEW's own rate on the same corpus
 *                 and the same K, because 0% is not the target — a director
 *                 does make formally similar films — and a number with no
 *                 comparison is a number nobody can act on.
 *
 *   industrial    the share whose "why" line rests on crew or cast. A shelf is
 *                 twelve cards each carrying one claim; if two in three of them
 *                 say "X shot both", the shelf is a credits list.
 *
 *   trivia        measure-claims.js's own set — genreEra, countryEra, genre,
 *                 cast — read out of that file rather than restated here.
 *
 *   worstShelfDir the largest number of films by a single director on one
 *                 shelf, averaged over the profiles. 3.97 of 12 at HEAD.
 *
 *   coverage      distinct films the recommender is capable of ever suggesting.
 *                 A shelf that is more selective is also narrower, and that
 *                 trade has to be visible or the next change buys specificity
 *                 with reach and nobody notices.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const TEMPLATE = path.join(ROOT, "app", "template.html");
const CORPUS = path.join(ROOT, "static", "corpus.json");
const DISCOVERY = path.join(ROOT, "static", "discovery.json");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes("--" + n);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i < 0 ? d : argv[i + 1]; };
const N_PROFILES = parseInt(arg("profiles", "300"), 10);
const PER_SHELF = parseInt(arg("limit", "12"), 10);
const LOVED = parseInt(arg("loved", "3"), 10);

/* ── gates ───────────────────────────────────────────────────────────────────
 *
 * The floor is expressed RELATIVE TO THE MAP VIEW, not as a fixed percentage.
 * The map's own ranking is the policy this project has already argued for and
 * measured; a recommender that draws filmography far harder than the map does
 * is out of step with a decision already taken, and one that draws it at the
 * map's own rate is in step whatever that rate happens to be. A fixed 25% would
 * go stale the moment the corpus or SIGNAL_WEIGHT moved.
 */
const MAX_SAME_DIRECTOR_VS_MAP = 2.0;   /* multiples of the map view's rate  */
const MAX_WORST_SHELF_DIRECTOR = 3.0;   /* films by one director, of PER_SHELF */

/* ── pull the scorers out of the app ─────────────────────────────────────── */

function extract(src, name, kind) {
  /* Balanced-brace scan from the declaration, so a nested object literal or a
     comment containing a brace cannot truncate the body. */
  const head = kind === "const"
    ? new RegExp("^const " + name + "\\s*=", "m")
    : new RegExp("^function " + name + "\\s*\\(", "m");
  const m = head.exec(src);
  if (!m) throw new Error(`app/template.html no longer declares ${name} in the form this tool reads`);
  const start = m.index;
  if (kind === "const") {
    /* a const arrow/object: run to the terminating semicolon at depth 0 */
    let d = 0;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (c === "{" || c === "(" || c === "[") d++;
      else if (c === "}" || c === ")" || c === "]") d--;
      else if (c === ";" && d === 0) return src.slice(start, i + 1);
    }
  } else {
    let d = 0, seen = false;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (c === "{") { d++; seen = true; }
      else if (c === "}") { d--; if (seen && d === 0) return src.slice(start, i + 1); }
    }
  }
  throw new Error(`could not find the end of ${name} in app/template.html`);
}

function loadApp(corpus, overrideRecommend) {
  const src = fs.readFileSync(TEMPLATE, "utf8");
  const parts = [
    extract(src, "SIGNAL_WEIGHT", "const"),
    extract(src, "sigWeight", "const"),
    extract(src, "connections", "function"),
    overrideRecommend || extract(src, "recommend", "function"),
  ];
  /* SHELF_DIR_CAP is optional: it exists only if the recommender has been given
     a cap. Absent, the sandbox simply does not define it and the shipped
     recommend() never mentions it. */
  let cap = "";
  try { cap = extract(src, "SHELF_DIR_CAP", "const"); } catch (_e) { cap = ""; }

  const F = corpus.films, E = corpus.edges;
  const KEYS = Object.keys(F).sort();
  const ADJ = Object.create(null);
  for (const k of KEYS) ADJ[k] = [];
  E.forEach((e, i) => { if (ADJ[e.a]) ADJ[e.a].push(i); if (ADJ[e.b]) ADJ[e.b].push(i); });

  const state = { loved: new Set(), seen: new Set() };
  const sandbox = { F, E, ADJ, KEYS, state, console };
  vm.createContext(sandbox);
  vm.runInContext(cap + "\n" + parts.join("\n") + "\n", sandbox, { filename: "template.html#scorers" });
  return { F, E, ADJ, KEYS, state, sandbox,
    recommend: sandbox.recommend, connections: sandbox.connections,
    hasCap: Boolean(cap) };
}

/* measure-claims.js owns the definition of trivia. Read it, do not restate it. */
const TRIVIA = (() => {
  const s = fs.readFileSync(path.join(__dirname, "measure-claims.js"), "utf8");
  const m = s.match(/const TRIVIA = new Set\(\[([^\]]*)\]\)/);
  if (!m) throw new Error("measure-claims.js no longer declares TRIVIA in the form this tool reads");
  return new Set(m[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean));
})();

/* ── attributes ──────────────────────────────────────────────────────────── */

/* Set-valued directors from discovery.json, because a co-directed film has
   several. The single `film.director` string reports the same phenomenon a
   little worse (a co-direction reads as "different director"), and two
   documents quoting these numbers will disagree unless they say which they
   used. This one says. */
function directorSets(discovery) {
  const out = Object.create(null);
  const post = discovery.facets.postings.director;
  for (const v of Object.keys(post)) {
    for (const oi of post[v]) {
      const k = discovery.keyByFilmId[discovery.filmOrder[oi]];
      (out[k] || (out[k] = new Set())).add(v);
    }
  }
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── the runs ────────────────────────────────────────────────────────────── */

function profiles(KEYS, n, size) {
  const rnd = mulberry32(0x5eed);
  const out = [];
  while (out.length < n) {
    const s = new Set();
    while (s.size < size) s.add(KEYS[(rnd() * KEYS.length) | 0]);
    out.push([...s]);
  }
  return out;
}

function edgeFor(app, a, b) {
  for (const i of app.ADJ[a] || []) {
    const e = app.E[i];
    if (e.a === b || e.b === b) return e;
  }
  return null;
}

function measureShelf(app, dirSet, opts) {
  const o = Object.assign({ profiles: N_PROFILES, per: PER_SHELF, loved: LOVED }, opts || {});
  const shares = (a, b) => {
    const A = dirSet[a], B = dirSet[b];
    if (!A || !B) return false;
    for (const v of A) if (B.has(v)) return true;
    return false;
  };
  const bySignal = Object.create(null), byType = Object.create(null);
  const covered = new Set();
  let n = 0, sameDir = 0, short = 0, worstSum = 0;

  for (const p of profiles(app.KEYS, o.profiles, o.loved)) {
    app.state.loved = new Set(p);
    app.state.seen = new Set();
    const recs = app.recommend(o.per);
    if (recs.length < o.per) short++;
    const tally = Object.create(null);
    for (const r of recs) {
      n++;
      covered.add(r.key);
      if (p.some((L) => shares(L, r.key))) sameDir++;
      const t = (r.why && r.why.type) || "?";
      byType[t] = (byType[t] || 0) + 1;
      /* `why` deliberately carries only claim and type, so the signal is read
         back off the edge itself rather than requiring a change to the app. */
      const e = r.why ? edgeFor(app, r.why.from, r.key) : null;
      const sig = e ? (e.source && e.source !== "record" ? "authored" : e.signal) : "?";
      bySignal[sig] = (bySignal[sig] || 0) + 1;
      const d = app.F[r.key].director;
      if (d) tally[d] = (tally[d] || 0) + 1;
    }
    worstSum += Math.max(0, ...Object.values(tally));
  }
  const share = (k) => (bySignal[k] || 0) / n;
  const trivia = Object.keys(bySignal).filter((k) => TRIVIA.has(k))
    .reduce((s, k) => s + bySignal[k], 0) / n;
  return { suggestions: n, profiles: o.profiles, short,
    sameDirector: sameDir / n, trivia,
    industrial: share("crew") + share("cast"),
    authored: share("authored"),
    hand: (byType.hand || 0) / n,
    worstShelfDirector: worstSum / o.profiles,
    coverage: covered.size, bySignal, byType };
}

/* The map view, measured the same way and at the same K, so sameDirector has
   something to be compared against. connections() is the app's own function. */
function measureMap(app, dirSet, opts) {
  const o = Object.assign({ seeds: N_PROFILES * 3, per: PER_SHELF }, opts || {});
  const shares = (a, b) => {
    const A = dirSet[a], B = dirSet[b];
    if (!A || !B) return false;
    for (const v of A) if (B.has(v)) return true;
    return false;
  };
  const rnd = mulberry32(0x5eed);
  const bySignal = Object.create(null);
  let n = 0, sameDir = 0;
  for (let t = 0; t < o.seeds; t++) {
    const seed = app.KEYS[(rnd() * app.KEYS.length) | 0];
    for (const c of app.connections(seed, o.per)) {
      n++;
      if (shares(seed, c.key)) sameDir++;
      const sig = c.e.source && c.e.source !== "record" ? "authored" : c.e.signal;
      bySignal[sig] = (bySignal[sig] || 0) + 1;
    }
  }
  const trivia = Object.keys(bySignal).filter((k) => TRIVIA.has(k))
    .reduce((s, k) => s + bySignal[k], 0) / n;
  return { lines: n, sameDirector: sameDir / n, trivia,
    industrial: ((bySignal.crew || 0) + (bySignal.cast || 0)) / n };
}

const pc = (v) => (v * 100).toFixed(1) + "%";

function print(label, r) {
  console.log("\n" + label);
  console.log("  suggestions                      : " + r.suggestions +
    " over " + r.profiles + " profiles (" + r.short + " came back short)");
  console.log("  share a director with a loved film: " + pc(r.sameDirector));
  console.log("  type = hand                      : " + pc(r.hand));
  console.log("  industrial signal (crew + cast)  : " + pc(r.industrial));
  console.log("  trivia signal                    : " + pc(r.trivia));
  console.log("  authored claim carries the why   : " + pc(r.authored));
  console.log("  most films by one director, per shelf: " + r.worstShelfDirector.toFixed(2) +
    " of " + PER_SHELF);
  console.log("  distinct films ever suggested    : " + r.coverage);
  console.log("  signals: " + Object.entries(r.bySignal).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, c]) => k + " " + pc(c / r.suggestions)).join("  "));
}

/* ── selftest ────────────────────────────────────────────────────────────── */

/* Both gates are relative or structural, so both can be driven to failure by a
   planted recommender rather than by an argument that they would fire. */
function selftest(corpus, discovery) {
  const dirSet = directorSets(discovery);
  console.log("── SELFTEST: the gates, deliberately broken ────────────────────────");

  const shipped = loadApp(corpus);
  const truth = measureShelf(shipped, dirSet);
  const map = measureMap(shipped, dirSet);
  console.log("\ncontrol (the shipped recommender)");
  console.log("  sameDirector " + pc(truth.sameDirector) + "   map view " + pc(map.sameDirector) +
    "   ratio " + (truth.sameDirector / map.sameDirector).toFixed(2) + "x" +
    "   worst shelf " + truth.worstShelfDirector.toFixed(2));

  /* 1. A recommender that suggests the loved films' own director and nothing
        else. sameDirector must saturate and the shelf gate must fail. */
  const packed = `function recommend(limit){
    const loved=[...state.loved]; if(!loved.length) return [];
    const dirs=new Set(loved.map(L=>F[L].director).filter(Boolean));
    const out=[];
    for(const k of KEYS){ if(out.length>=(limit||18)) break;
      if(state.loved.has(k)) continue;
      if(dirs.has(F[k].director)) out.push({key:k,score:1,why:{from:loved[0],claim:"",type:"hand"}}); }
    for(const k of KEYS){ if(out.length>=(limit||18)) break;
      if(state.loved.has(k)||dirs.has(F[k].director)) continue;
      out.push({key:k,score:0,why:{from:loved[0],claim:"",type:"hand"}}); }
    return out; }`;
  const packedApp = loadApp(corpus, packed);
  const packedR = measureShelf(packedApp, dirSet);
  console.log("\n1. a recommender that hands back the loved films' own director first");
  console.log("  sameDirector " + pc(packedR.sameDirector) + "   worst shelf " +
    packedR.worstShelfDirector.toFixed(2) + " of " + PER_SHELF);

  /* 2. A recommender that ignores the profile entirely: every statistic must
        fall to what the corpus alone would give. */
  const blind = `function recommend(limit){
    const loved=[...state.loved]; if(!loved.length) return [];
    let h=0; for(const L of loved){ for(let i=0;i<L.length;i++) h=(h*31+L.charCodeAt(i))>>>0; }
    const out=[]; for(let t=0;t<(limit||18);t++){ h=(h*1103515245+12345)>>>0;
      const k=KEYS[h%KEYS.length]; if(state.loved.has(k)) continue;
      out.push({key:k,score:0,why:{from:loved[0],claim:"",type:"hand"}}); }
    return out; }`;
  const blindR = measureShelf(loadApp(corpus, blind), dirSet);
  console.log("\n2. a recommender that ignores the graph (random films)");
  console.log("  sameDirector " + pc(blindR.sameDirector) + "   worst shelf " +
    blindR.worstShelfDirector.toFixed(2));

  /* The ceiling is COMPUTED, not guessed. The packed control reads 87.2%, and a
     hand-picked 0.90 threshold would have called that a failed control — which
     is exactly the mistake this whole workflow exists to stop. 87.2% IS
     saturation: 483 of 758 directors have a single film in this corpus, so many
     profiles simply do not have twelve films by their own directors to give.
     Compute how many slots CAN be filled and assert against that. */
  const ceiling = (() => {
    const shares2 = (a, b) => {
      const A = dirSet[a], B = dirSet[b];
      if (!A || !B) return false;
      for (const v of A) if (B.has(v)) return true;
      return false;
    };
    let avail = 0, slots = 0;
    for (const p of profiles(shipped.KEYS, N_PROFILES, LOVED)) {
      let c = 0;
      for (const k of shipped.KEYS) {
        if (p.includes(k)) continue;
        if (p.some((L) => shares2(L, k))) c++;
      }
      avail += Math.min(PER_SHELF, c);
      slots += PER_SHELF;
    }
    return avail / slots;
  })();
  console.log("\n  the achievable ceiling for sameDirector on these profiles: " + pc(ceiling));

  const checks = [
    ["sameDirector saturates on a director-packed recommender",
      packedR.sameDirector > ceiling * 0.95],
    ["the director-packed recommender FAILS the shipped ratio gate",
      packedR.sameDirector / map.sameDirector > MAX_SAME_DIRECTOR_VS_MAP],
    ["the director-packed recommender FAILS the worst-shelf gate",
      packedR.worstShelfDirector > MAX_WORST_SHELF_DIRECTOR],
    ["sameDirector collapses to ~chance when the graph is ignored", blindR.sameDirector < 0.05],
    ["the graph-blind recommender PASSES the ratio gate it should pass",
      blindR.sameDirector / map.sameDirector <= MAX_SAME_DIRECTOR_VS_MAP],
    ["the map view is measured and is not itself saturated", map.sameDirector < 0.35],
    ["the shipped recommender is measurably worse than the map view",
      truth.sameDirector > map.sameDirector],
  ];
  console.log("\n── assertions ─────────────────────────────────────────────────────");
  let bad = 0;
  for (const [name, ok] of checks) { console.log((ok ? "  ok   " : "  FAIL ") + name); if (!ok) bad++; }
  console.log();
  if (bad) { console.log(`SELFTEST FAIL — ${bad} of ${checks.length} controls did not behave`); process.exit(1); }
  console.log(`SELFTEST PASS — ${checks.length} controls, every gate demonstrably breakable`);
}

/* ── main ────────────────────────────────────────────────────────────────── */

function main() {
  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
  const discovery = JSON.parse(fs.readFileSync(DISCOVERY, "utf8"));
  console.log("measure-recommender.js — the shelf, measured against the map's own policy");
  console.log("corpus " + corpus.meta.corpusVersion +
    " / recommend() and connections() read live out of app/template.html");

  if (flag("selftest")) { selftest(corpus, discovery); return; }

  const t0 = Date.now();
  const dirSet = directorSets(discovery);
  const app = loadApp(corpus);
  const shelf = measureShelf(app, dirSet);
  const map = measureMap(app, dirSet);

  print("THE SHELF — recommend(" + PER_SHELF + ") over " + N_PROFILES + " seeded " +
    LOVED + "-film profiles", shelf);
  console.log("\nTHE MAP — connections(" + PER_SHELF + ") over " + map.lines + " lines, for comparison");
  console.log("  share the seed's director        : " + pc(map.sameDirector));
  console.log("  industrial signal (crew + cast)  : " + pc(map.industrial));
  console.log("  trivia signal                    : " + pc(map.trivia));

  const ratio = shelf.sameDirector / map.sameDirector;
  console.log("\n── gates ───────────────────────────────────────────────────────────");
  console.log("sameDirector vs the map view : " + ratio.toFixed(2) + "x   (ceiling " +
    MAX_SAME_DIRECTOR_VS_MAP.toFixed(2) + "x)");
  console.log("worst shelf, one director    : " + shelf.worstShelfDirector.toFixed(2) +
    " of " + PER_SHELF + "   (ceiling " + MAX_WORST_SHELF_DIRECTOR.toFixed(2) + ")");
  console.log("recommend() carries a director cap: " + (app.hasCap ? "yes" : "no"));

  const fails = [];
  if (!(ratio <= MAX_SAME_DIRECTOR_VS_MAP)) {
    fails.push(`the shelf draws filmography ${ratio.toFixed(2)}x as hard as the map view, ` +
      `ceiling ${MAX_SAME_DIRECTOR_VS_MAP}x — recommend() is not using SIGNAL_WEIGHT`);
  }
  if (!(shelf.worstShelfDirector <= MAX_WORST_SHELF_DIRECTOR)) {
    fails.push(`the average shelf gives ${shelf.worstShelfDirector.toFixed(2)} of its ` +
      `${PER_SHELF} cards to one director, ceiling ${MAX_WORST_SHELF_DIRECTOR}`);
  }

  const JSON_OUT = arg("json", null);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ shelf, map, ratio }, null, 2) + "\n");
  console.log("\nmeasured in " + ((Date.now() - t0) / 1000).toFixed(1) + "s");

  if (fails.length) {
    console.log("\nFAIL");
    for (const f of fails) console.log("  " + f);
    console.log("\n  atlas/proposals/recommender-rule1.patch is the measured fix, unapplied.");
    process.exit(1);
  }
  console.log("\nPASS — the shelf ranks like the map view does");
}

main();
