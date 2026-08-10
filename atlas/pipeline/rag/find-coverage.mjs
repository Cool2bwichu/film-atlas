#!/usr/bin/env node
/* find-coverage.mjs — what the SHIPPING search answers today, on the 120 queries
 * in find-queries.json. This is the before-number.
 *
 *   node atlas/pipeline/rag/find-coverage.mjs            # -> find-coverage.json
 *   node atlas/pipeline/rag/find-coverage.mjs --break=X  # deliberate breaks
 *
 * ── WHY IT REIMPLEMENTS RATHER THAN DRIVES THE BROWSER ──────────────────────
 * The three typed paths are all in atlas.html and two of them are pure
 * functions of files on disk. Driving a headless browser would measure the same
 * arithmetic through a layer that can fail for its own reasons. So each channel
 * is reproduced here from the SAME source the build ships, and every place the
 * reproduction could drift from the page is named in `fidelity` below.
 *
 * ── THE THREE CHANNELS, AS THE PAGE ORDERS THEM ─────────────────────────────
 *   TITLE   search() in template.html: norm(v), walk SUGGEST_ORDER, the first
 *           eight prefix hits then contained hits, and the list is SLICED TO 4
 *           whenever the find-offer row is present — which is every query of
 *           three characters or more. That 4 is the real cap, not 6.
 *   LOOKUP  lookupMatches(v,3) over pipeline/out/lookup.json. Exact, then
 *           prefix, then contained; sorted by set size; three offered. Clicking
 *           one runs lookupRun, which draws THE WHOLE SET at the centre — so a
 *           lookup answer has no top-10 to truncate and is scored on membership.
 *   LOCAL   buildFind() -> buildParser() + buildMatcher(), the consensus
 *           vocabulary. Reached by the "Draw a constellation from this" row.
 *           ranked() is an ordering, so it IS scored at 10.
 *
 * /api/interpret is NOT run. It costs a model call per query and it only fires
 * when the local reading came back empty, so what is reported for it here is
 * the TRIGGER RATE — how many of the 120 would reach it — which is a fact about
 * the local channel and needs no network.
 *
 * ── HOW A "GOOD" ANSWER IS DEFINED, BEFORE ANY RESULT WAS SEEN ──────────────
 *   hit   — at least one of the query's named films is in the answer.
 *   good  — at least HALF of them (ceil) are. The brief asks for "the expected
 *           films appearing in the top 10", and one lucky film out of five is
 *           not that.
 *   For answerShape 'none' (12 queries) both are inverted: the right answer is
 *   an empty one, so answering at all is the failure and silence is `good`.
 *
 * ── AND WHERE IT RETURNS SOMETHING WORTHLESS ────────────────────────────────
 * A coverage number that only counts hits cannot see the failure the owner
 * would actually meet, which is a confident-looking answer that is nothing.
 * Four detectors, each a countable property of the answer and not a judgement:
 *   alphabet       every film in the top 10 carries the same score, so
 *                  match.js's `scores[b]-scores[a] || a.localeCompare(b)` sorted
 *                  them by name. The picture is an alphabet.
 *   fragment       drawable, but the reading covers under 35% of the sentence
 *                  and no expected film landed. The parser answered a different,
 *                  shorter question.
 *   substring      the lookup answer came from the CONTAINED stage — "war"
 *                  reaching Warwick Davis — and no expected film landed.
 *   false-answer   answerShape 'none' and the channel answered anyway.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "find-coverage.json");

const BREAK = (process.argv.find(a => a.startsWith("--break=")) || "").split("=")[1] || null;
const BREAKS = ["expect-shift", "lookup-off", "local-off", "alphabet-always"];
if (BREAK && !BREAKS.includes(BREAK)) { console.error("unknown break; one of " + BREAKS.join(", ")); process.exit(2); }

/* ═══════════════ SOURCES — all read-only ═══════════════ */
const rd = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const CORPUS    = rd(path.join(ATLAS, "static/corpus.json"));
const DISCOVERY = rd(path.join(ATLAS, "static/discovery.json"));
const LOOKUP    = rd(path.join(ATLAS, "pipeline/out/lookup.json"));
const QS        = rd(path.join(HERE, "find-queries.json"));
const F = CORPUS.films, KEYS = Object.keys(F), E = CORPUS.edges || [];

/* ═══════════════ EXPECTATIONS -> CORPUS KEYS ═══════════════ */
const byTitleYear = new Map();
for (const k of KEYS) byTitleYear.set(F[k].title.toLowerCase() + "|" + F[k].year, k);
const parseName = (s) => { const m = s.match(/^(.*) \((\d{4})\)$/); return m ? { t: m[1], y: +m[2] } : null; };
function expectKeys(q, i, all) {
  /* --break=expect-shift hands each query the NEXT query's answer key. If the
     good-rate does not collapse, it is not measuring the match. */
  const src = BREAK === "expect-shift" ? all[(i + 1) % all.length] : q;
  const out = [];
  for (const e of src.expect) {
    const p = parseName(e); if (!p) continue;
    const k = byTitleYear.get(p.t.toLowerCase() + "|" + p.y);
    if (k) out.push(k); else out.push(null);
  }
  if (out.some(x => x === null)) throw new Error(`${q.id}: an expectation does not resolve to a corpus key`);
  return out;
}

/* ═══════════════ CHANNEL 1 — TITLE SUGGESTIONS ═══════════════
   template.html:1818 norm, :2798 SUGGEST_ORDER, :9650 search().
   SUGGEST_ORDER is rebuilt here from corpus.json exactly as the page builds it,
   so WHICH four titles are offered is the page's own answer, not an approximation. */
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const SIGNAL_WEIGHT = { adaptation:1.00, sameAuthor:0.96, keyword:0.88, movement:0.80, setting:0.72,
  subject:0.66, crew:0.60, studio:0.50, genre:0.26, cast:0.24, countryEra:0.13, genreEra:0.12 };
const sigWeight = e => e.source && e.source !== "record" ? 1.0
  : (SIGNAL_WEIGHT[e.signal] !== undefined ? SIGNAL_WEIGHT[e.signal] : 0.5);
const ADJ = {}; KEYS.forEach(k => ADJ[k] = []);
E.forEach((e, i) => { if (ADJ[e.a] && ADJ[e.b]) { ADJ[e.a].push(i); ADJ[e.b].push(i); } });
const BEST_BOND = {}, CLAIM_SCORE = {}, CONFIDENT_CLAIMS = {};
for (const k of KEYS) {
  let best = 0; for (const i of ADJ[k]) { const s = (E[i].strength || 0) * sigWeight(E[i]); if (s > best) best = s; }
  BEST_BOND[k] = best;
  const q = []; let confident = 0;
  for (const i of ADJ[k]) { const e = E[i]; if (!e.source || e.source === "record") continue;
    const c = Number.isFinite(e.confidence) ? e.confidence : 0.4;
    if (c >= 0.5) confident++; q.push((e.strength || 0) * c); }
  q.sort((x, y) => y - x);
  let s = 0; for (let i = 0; i < q.length; i++) s += q[i] / Math.pow(2, i);
  CLAIM_SCORE[k] = s; CONFIDENT_CLAIMS[k] = confident;
}
const dealHash = k => { let h = 2166136261;
  const s = ((CORPUS.meta && CORPUS.meta.corpusVersion) || "atlas") + " " + k;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0; };
const HEAD_RANK = new Map();
KEYS.filter(k => CONFIDENT_CLAIMS[k] >= 1)
  .sort((a, b) => (CLAIM_SCORE[b] - CLAIM_SCORE[a]) || (a < b ? -1 : 1))
  .slice(0, 120).forEach((k, i) => HEAD_RANK.set(k, i));
const wallBand = k => HEAD_RANK.has(k) ? 2 : CLAIM_SCORE[k] > 0 ? 1 : 0;
const SUGGEST_ORDER = KEYS.slice().sort((a, b) =>
     (wallBand(b) - wallBand(a))
  || (CLAIM_SCORE[b] - CLAIM_SCORE[a])
  || (BEST_BOND[b] - BEST_BOND[a])
  || (a < b ? -1 : 1));

function titleChannel(v) {
  const n = norm(v);
  const offer = String(v || "").trim().length >= 3;   /* findOfferRow: the row is present */
  if (n.length < 2 && !offer) return { films: [], starts: 0, has: 0, capBinds: false };
  const starts = [], has = [];
  if (n.length >= 2) {
    for (const k of SUGGEST_ORDER) {
      if (k.startsWith(n)) starts.push(k);
      else if (k.includes(n)) has.push(k);
      if (starts.length >= 8) break;
    }
  }
  const all = [...starts, ...has];
  const cap = offer ? 4 : 6;
  return { films: all.slice(0, cap), starts: starts.length, has: has.length, capBinds: all.length > cap };
}

/* ═══════════════ CHANNEL 2 — LOOKUP ═══════════════
   template.html:9531 lookupNorm, :9587 lookupMatches, :9573 lookupFilms. */
const LOOKUP_KINDS = ["person", "genre", "country", "movement", "decade"];
const lookupNorm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
let LOOKUP_INDEX = null;
function lookupIndex() {
  if (LOOKUP_INDEX) return LOOKUP_INDEX;
  LOOKUP_INDEX = new Map();
  for (const kind of LOOKUP_KINDS) {
    const bucket = LOOKUP[kind]; if (!bucket) continue;
    for (const name of Object.keys(bucket)) {
      const n = lookupNorm(name); if (!n) continue;
      let e = LOOKUP_INDEX.get(n); if (!e) LOOKUP_INDEX.set(n, (e = []));
      e.push({ kind, name });
    }
  }
  return LOOKUP_INDEX;
}
function lookupFilms(kind, name) {
  const e = LOOKUP && LOOKUP[kind] && LOOKUP[kind][name];
  if (!e || !e.f) return [];
  const out = []; let at = 0;
  for (const d of e.f) {
    at += d;
    const key = DISCOVERY.filmOrder[at] !== undefined
      ? (DISCOVERY.keyByFilmId[DISCOVERY.filmOrder[at]] || DISCOVERY.filmOrder[at]) : null;
    if (key != null && F[key]) out.push(key);
  }
  return out;
}
function lookupMatches(text, cap) {
  if (BREAK === "lookup-off") return [];
  const n = lookupNorm(text); if (n.length < 3) return [];
  const idx = lookupIndex(), out = [], seen = new Set();
  const push = (hit, mode) => {
    const id = hit.kind + "|" + hit.name; if (seen.has(id)) return; seen.add(id);
    const films = lookupFilms(hit.kind, hit.name);
    if (films.length) out.push({ ...hit, films, mode });
  };
  for (const hit of (idx.get(n) || [])) push(hit, "exact");
  if (out.length < cap) for (const [k, hits] of idx) { if (k.startsWith(n)) for (const h of hits) push(h, "prefix"); if (out.length >= cap * 3) break; }
  if (out.length < cap) for (const [k, hits] of idx) { if (k.includes(n)) for (const h of hits) push(h, "contains"); if (out.length >= cap * 3) break; }
  out.sort((a, b) => b.films.length - a.films.length);
  return out.slice(0, cap);
}

/* ═══════════════ CHANNEL 3 — THE LOCAL VOCABULARY ═══════════════
   buildFind is app/query-runtime.js verbatim, which is what the page inlines.
   THE ALIAS PATH IS DELIBERATELY BROKEN, because that is the shipped state:
   build.js's virtual filesystem ships three JSONs and film-aliases.json is not
   one of them, so in the browser buildTitleIndex's readFileSync throws ENOENT
   and it runs with aliases={}. Pointing node at the real file here would
   measure a parser the reader does not have. The delta is reported separately. */
const { buildFind } = require(path.join(ATLAS, "app/query-runtime.js"));
const t0 = Date.now();
const ENGINE = buildFind({ parser: { aliases: path.join(ATLAS, "pipeline/out/__no-aliases-in-the-browser__.json") } });
const ENGINE_ALIASED = buildFind({});           /* the same engine WITH film-aliases.json */
const buildMs = Date.now() - t0;

function localChannel(engine, text) {
  if (BREAK === "local-off") return { drawable: false, refusal: "broken", films: [], readings: [] };
  let r;
  try { r = engine.run(text); }
  catch (err) { return { drawable: false, refusal: "threw:" + err.message, films: [], readings: [] }; }
  const readings = r.readings.map(x => ({ said: x.said, terms: x.terms, negate: x.negate }));
  const readChars = r.readings.reduce((a, x) =>
    a + (Number.isFinite(x.start) && Number.isFinite(x.end) ? Math.max(0, x.end - x.start) : 0), 0);
  const readFrac = text.length ? Math.min(1, readChars / text.length) : 0;
  if (!r.drawable) return { drawable: false, refusal: r.refusal ? r.refusal.code : "none",
    films: [], readings, readFrac, marks: (r.marks || []).length };
  const top = r.ranked.slice(0, 10);
  const eps = BREAK === "alphabet-always" ? 1e9 : 1e-12;
  const alphabet = top.length === 10 && Math.abs(r.scores[top[0]] - r.scores[top[9]]) <= eps;
  const ascending = top.every((k, i) => i === 0 || top[i - 1] <= k);
  return {
    drawable: true, refusal: null, films: top, readings, readFrac,
    topScore: r.scores[r.ranked[0]], tenthScore: r.scores[top[9]],
    tiedAtTop: r.coverage.tiedAtTop, alphabet, alphabetAscending: alphabet && ascending,
    marks: (r.marks || []).length, dropped: (r.dropped || []).length,
    blind: r.coverage.blind, thin: r.coverage.thin,
  };
}

/* ═══════════════ SCORING ═══════════════ */
const ceilHalf = n => Math.ceil(n / 2);
function judge(answerFilms, expect, shape) {
  const set = new Set(answerFilms);
  const found = expect.filter(k => set.has(k));
  const answered = answerFilms.length > 0;
  if (shape === "none") return { answered, found: found.length, hit: !answered, good: !answered };
  return { answered, found: found.length, hit: found.length >= 1, good: expect.length > 0 && found.length >= ceilHalf(expect.length) };
}

const rows = [];
for (let i = 0; i < QS.queries.length; i++) {
  const q = QS.queries[i];
  const ex = expectKeys(q, i, QS.queries);
  const T = titleChannel(q.q);
  const Lk = lookupMatches(q.q, 3);
  const Lo = localChannel(ENGINE, q.q);
  const LoA = localChannel(ENGINE_ALIASED, q.q);

  /* The lookup answer the reader gets is the set behind the FIRST name offered
     (the biggest one — lookupMatches sorts on set size). lookupRun draws the
     whole set at the centre, so there is no top-10 to cut: membership is the
     answer. The union of all three names offered is reported alongside as the
     generous reading, since the reader does choose. */
  const lkTop = Lk[0] || null;
  const lkTopFilms = lkTop ? lkTop.films : [];
  const lkUnion = [...new Set(Lk.flatMap(h => h.films))];

  const jT  = judge(T.films, ex, q.answerShape);
  const jL  = judge(lkTopFilms, ex, q.answerShape);
  const jLu = judge(lkUnion, ex, q.answerShape);
  const jV  = judge(Lo.films, ex, q.answerShape);

  const answeredAny = jT.answered || jL.answered || jV.answered;
  const goodAny = q.answerShape === "none"
    ? !answeredAny
    : (jT.good || jL.good || jV.good);
  const hitAny = q.answerShape === "none" ? !answeredAny : (jT.hit || jL.hit || jV.hit);

  /* would /api/interpret be called? template.html:9760 —
     readNothing = !r || !r.drawable || !r.readings.length */
  const interpretFires = !Lo.drawable || !Lo.readings.length;

  rows.push({
    id: q.id, q: q.q, kind: q.kind, answerShape: q.answerShape,
    expect: ex, expectAll: q.expectAll === undefined ? null : q.expectAll,
    title: { films: T.films, n: T.films.length, starts: T.starts, contains: T.has, capBinds: T.capBinds, ...jT },
    lookup: {
      offered: Lk.map(h => ({ kind: h.kind, name: h.name, n: h.films.length, mode: h.mode })),
      answerName: lkTop ? lkTop.kind + ":" + lkTop.name : null,
      answerMode: lkTop ? lkTop.mode : null,
      setSize: lkTopFilms.length, unionSize: lkUnion.length,
      ...jL, unionHit: jLu.hit, unionGood: jLu.good,
    },
    local: {
      drawable: Lo.drawable, refusal: Lo.refusal, readings: Lo.readings,
      readFrac: Lo.readFrac === undefined ? null : +Lo.readFrac.toFixed(3),
      topScore: Lo.topScore === undefined ? null : +Lo.topScore.toFixed(4),
      tenthScore: Lo.tenthScore === undefined ? null : +Lo.tenthScore.toFixed(4),
      tiedAtTop: Lo.tiedAtTop === undefined ? null : Lo.tiedAtTop,
      alphabet: !!Lo.alphabet, alphabetAscending: !!Lo.alphabetAscending,
      top10: Lo.films, ...jV,
    },
    localWithAliases: { drawable: LoA.drawable, refusal: LoA.refusal,
      readings: LoA.readings.length, hit: judge(LoA.films, ex, q.answerShape).hit },
    any: { answered: answeredAny, hit: hitAny, good: goodAny },
    interpretFires,
    /* ── the worthless-answer detectors ── */
    worthless: {
      alphabet: !!Lo.alphabet && !jV.good,
      fragment: Lo.drawable && Lo.readFrac < 0.35 && !jV.hit,
      substring: lkTop !== null && lkTop.mode === "contains" && !jL.hit && q.answerShape !== "none",
      titleSubstring: T.films.length > 0 && !jT.hit && q.answerShape !== "none",
      falseAnswer: q.answerShape === "none" && answeredAny,
      oversizeSet: q.answerShape === "set" && lkTopFilms.length > 0 && q.expectAll
        ? lkTopFilms.length > q.expectAll * 3 : false,
    },
  });
}

/* ═══════════════ AGGREGATION ═══════════════ */
function agg(list) {
  const n = list.length;
  const pct = c => n ? +(100 * c / n).toFixed(1) : 0;
  const c = (f) => list.filter(f).length;
  return {
    n,
    answeredAny: c(r => r.any.answered), answeredAnyPct: pct(c(r => r.any.answered)),
    goodAny: c(r => r.any.good), goodAnyPct: pct(c(r => r.any.good)),
    hitAny: c(r => r.any.hit), hitAnyPct: pct(c(r => r.any.hit)),
    lookupAnswered: c(r => r.lookup.answered), lookupGood: c(r => r.lookup.good),
    localDrawable: c(r => r.local.drawable), localGood: c(r => r.local.good),
    titleAnswered: c(r => r.title.answered), titleGood: c(r => r.title.good),
    interpretFires: c(r => r.interpretFires),
    wAlphabet: c(r => r.worthless.alphabet), wFragment: c(r => r.worthless.fragment),
    wSubstring: c(r => r.worthless.substring), wTitleSubstring: c(r => r.worthless.titleSubstring),
    wFalseAnswer: c(r => r.worthless.falseAnswer),
  };
}
const kinds = [...new Set(rows.map(r => r.kind))];
const byKind = {};
for (const k of kinds) byKind[k] = agg(rows.filter(r => r.kind === k));
const overall = agg(rows);
const byShape = {}; for (const s of ["set", "ranking", "none"]) byShape[s] = agg(rows.filter(r => r.answerShape === s));

/* the three worst kinds by good-answer rate; ties broken by n then name so the
   list is the same on every run */
const worst = kinds.map(k => ({ kind: k, ...byKind[k] }))
  .sort((a, b) => a.goodAnyPct - b.goodAnyPct || b.n - a.n || (a.kind < b.kind ? -1 : 1));

const REPORT = {
  version: 1,
  name: "find-coverage-1.0.0",
  generated: new Date().toISOString(),
  break: BREAK,
  measures: "atlas/pipeline/rag/find-queries.json (" + QS.name + "), 120 queries, against the search that ships today",
  corpus: { films: KEYS.length, corpusVersion: CORPUS.meta && CORPUS.meta.corpusVersion },
  engine: { version: ENGINE.version, buildMs, lookupNames: LOOKUP_KINDS.reduce((a, k) => a + Object.keys(LOOKUP[k] || {}).length, 0) },
  fidelity: [
    "TITLE: SUGGEST_ORDER is rebuilt from corpus.json edges exactly as template.html:2798 builds it (wallBand, CLAIM_SCORE, BEST_BOND, dealHash, HEAD_RANK). The list is cut to 4, not 6, because findOfferRow returns a row for every query of 3+ characters and search() slices to 4 when it does.",
    "LOOKUP: lookupNorm / lookupIndex / lookupFilms / lookupMatches are transcribed from template.html:9531-9600 and read pipeline/out/lookup.json, the same file build.js packs.",
    "LOCAL: app/query-runtime.js is required directly — the page inlines this exact source. The alias path is pointed at a file that does not exist, because build.js ships only consensus-vocab, query-lexicon and questioner-phrasings to the browser's virtual filesystem, so the shipped buildTitleIndex runs with aliases={}. localWithAliases re-runs every query with the real file to price that gap.",
    "NOT RUN: /api/interpret. It needs a model call per query and it fires only when the local reading is empty, so what is reported is its trigger rate, which is a property of the local channel.",
    "NOT RUN: the layout. Whether a set of films is drawn well is layout-match.js's business; this measures what reaches it.",
  ],
  definitions: {
    answered: "the channel returned at least one film",
    hit: "at least one of the query's named films is in the answer",
    good: "at least ceil(n/2) of the query's named films are in the answer. For answerShape 'none' both are inverted — silence is the right answer.",
    "lookup top-10": "there is none. lookupRun draws the whole set at the centre with score 1, so a lookup answer is scored on membership and its size is reported alongside.",
    "local top-10": "ranked().slice(0,10) — match.js's own ordering.",
    alphabet: "all ten films in the local top 10 carry the same score, so match.js:648 `scores[b]-scores[a] || a.localeCompare(b)` ordered them by name",
    fragment: "drawable, the reading covers under 35% of the typed characters, and no expected film landed",
    substring: "the lookup answer came from the CONTAINED stage and no expected film landed",
    falseAnswer: "answerShape is 'none' and some channel answered anyway",
  },
  overall, byShape, byKind,
  worstThreeKinds: worst.slice(0, 3).map(w => ({ kind: w.kind, n: w.n, goodAnyPct: w.goodAnyPct, hitAnyPct: w.hitAnyPct, answeredAnyPct: w.answeredAnyPct })),
  aliasDelta: {
    what: "queries whose local reading changes if film-aliases.json were shipped to the browser",
    drawableNow: rows.filter(r => r.local.drawable).length,
    drawableWithAliases: rows.filter(r => r.localWithAliases.drawable).length,
    changed: rows.filter(r => r.local.drawable !== r.localWithAliases.drawable).map(r => r.id),
  },
  queries: rows,
};

fs.writeFileSync(OUT, JSON.stringify(REPORT, null, 1));

/* ═══════════════ STDOUT ═══════════════ */
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(`\nFIND COVERAGE — ${rows.length} queries, ${KEYS.length} films${BREAK ? "   [BREAK=" + BREAK + "]" : ""}`);
console.log(`engine ${ENGINE.version}, built in ${buildMs} ms\n`);
console.log(pad("kind", 16) + lpad("n", 4) + lpad("any", 6) + lpad("good", 7) + lpad("hit", 6)
  + lpad("look", 7) + lpad("local", 7) + lpad("title", 7) + lpad("alpha", 7) + lpad("frag", 6) + lpad("sub", 5) + lpad("intp", 6));
const line = (name, a) => console.log(pad(name, 16) + lpad(a.n, 4) + lpad(a.answeredAnyPct + "%", 6)
  + lpad(a.goodAnyPct + "%", 7) + lpad(a.hitAnyPct + "%", 6)
  + lpad(a.lookupGood + "/" + a.lookupAnswered, 7) + lpad(a.localGood + "/" + a.localDrawable, 7)
  + lpad(a.titleGood + "/" + a.titleAnswered, 7)
  + lpad(a.wAlphabet, 7) + lpad(a.wFragment, 6) + lpad(a.wSubstring, 5) + lpad(a.interpretFires, 6));
for (const k of kinds) line(k, byKind[k]);
console.log("-".repeat(84));
for (const s of ["set", "ranking", "none"]) line("shape:" + s, byShape[s]);
console.log("-".repeat(84));
line("ALL", overall);
console.log(`\nworst three kinds by good-answer rate:`);
for (const w of worst.slice(0, 3)) console.log(`  ${pad(w.kind, 16)} ${lpad(w.goodAnyPct + "%", 6)} good   ${lpad(w.hitAnyPct + "%", 6)} hit   ${lpad(w.answeredAnyPct + "%", 6)} answered   (n=${w.n})`);
console.log(`\nwritten ${path.relative(process.cwd(), OUT)}`);
