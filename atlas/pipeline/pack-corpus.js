#!/usr/bin/env node
/* Compress static/corpus.json into a form small enough to inline in a
 * single-file artifact.
 *
 *   node pipeline/pack-corpus.js [--corpus path] [--degree 8] [--desc 190] [--out path]
 *
 * The artifact runtime ships one file through a conversation, so a 2.8 MB
 * corpus is not an option the way it is for a served build. Everything here is
 * lossless-where-it-matters and lossy only where the loss is invisible:
 *
 *   films are indices, not slugs   edges referenced two ~20-char keys each
 *   types/sources/signals are codes with a legend
 *   strength/confidence round to 2dp   they drive ranking, not arithmetic
 *   poster URLs drop a shared prefix and tracking query
 *   `also[]` alternates are dropped   the panel shows the primary claim
 *   `evidence[]` is dropped           it is a citation the artifact cannot link
 *
 * The one genuinely lossy choice is edge pruning. Median degree is 20 and a map
 * draws six, so most edges are never seen by anyone. Keeping the top N per film
 * -- by strength, but forcing type variety first, because a film whose eight
 * strongest edges are all `hand` becomes a dead end when you extend from it --
 * preserves the experience while removing most of the bytes.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const DEGREE = parseInt(arg("degree", "8"), 10);
const DESC = parseInt(arg("desc", "190"), 10);
const OUT = arg("out", path.join(ROOT, "static", "corpus.packed.json"));
const CORPUS_PATH = path.resolve(arg("corpus", path.join(ROOT, "static", "corpus.json")));

const LIMIT = parseInt(arg("films", "0"), 10);

const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
let keys = Object.keys(corpus.films);

/* Optionally keep only a connected core.
 *
 * The obvious selection -- take the N films with the highest degree -- is
 * wrong, and wrong in a way that looks right in the totals. Degree is measured
 * over the WHOLE corpus, so a film can rank highly on twenty edges and then
 * lose nineteen of them because its neighbours were not selected. The first
 * run of this produced a corpus where Yi Yi survived with zero connections and
 * seeding it drew a single node: a film present in the index and absent from
 * the map. Suspiria was cut outright while films nobody would name survived.
 *
 * What actually matters is how many edges are RETAINED among the selected set,
 * so that is what this maximises: start from the densest film and repeatedly
 * add whichever film has the most connections to the films already chosen.
 * Then drop anything still under-connected and refill, because a film that
 * cannot fill a map is worse than its absence -- it is a dead end wearing the
 * costume of a destination.
 *
 * This is not the degree-weighting AGENTS rule 1 forbids. That rule governs
 * which edges a map draws, where ranking by fame collapses the view toward the
 * canon. This decides which films fit in a size-limited build, and ranking
 * inside whatever survives is untouched.
 */
if (LIMIT && LIMIT < keys.length) {
  const adj = {};
  const wt = {};                       // "a|b" -> strength, for picking the best neighbours
  keys.forEach((k) => (adj[k] = []));
  corpus.edges.forEach((e) => {
    if (adj[e.a] && adj[e.b]) {
      adj[e.a].push(e.b); adj[e.b].push(e.a);
      const key = e.a < e.b ? e.a + "|" + e.b : e.b + "|" + e.a;
      wt[key] = Math.max(wt[key] || 0, e.strength || 0);
    }
  });
  const strength = (a, b) => wt[a < b ? a + "|" + b : b + "|" + a] || 0;

  const MIN_DEGREE = 6;   // a map draws six; below this the seed is a stub

  /* ANCHORS EXIST BECAUSE PURE CONNECTIVITY COLLAPSES INTO ONE TRADITION.
   *
   * Growing greedily from the single densest film produced a corpus whose
   * Chinatown map extended into Wild at Heart, The Elephant Man and All the
   * President's Men -- an entirely Anglo-American run -- while Persona, Yi Yi
   * and Satantango were cut. Connectivity is densest inside whichever tradition
   * shares the most crew, so maximising it walks into New Hollywood and stays
   * there. That is AGENTS rule 1's failure reappearing one layer down: not in
   * which edges a map draws, but in which films the corpus contains.
   *
   * Keeping an anchor is not enough on its own. Exempting them from pruning
   * left Touki Bouki in the corpus with zero surviving connections -- a film
   * you can seed and get nothing from, which is worse than its absence. An
   * anchor is only worth keeping WITH ITS NEIGHBOURHOOD, so each one's
   * strongest neighbours are admitted before general growth begins.
   */
  const ANCHORS = [
    "persona", "tokyo story", "yi yi", "satantango", "suspiria", "chinatown",
    "2001 a space odyssey", "stalker", "parasite", "in the mood for love",
    "breathless", "rashomon", "vertigo", "do the right thing", "akira",
    "spirited away", "cleo from 5 to 7", "battleship potemkin", "seven samurai",
    "the passion of joan of arc", "mad max fury road", "beau travail",
    "jeanne dielman", "close up", "touki bouki", "pather panchali",
    "the seventh seal", "citizen kane", "blade runner", "metropolis",
  ];

  const sel = new Set();
  const anchorSet = new Set();
  ANCHORS.forEach((a) => { if (adj[a]) { anchorSet.add(a); sel.add(a); } });

  /* one anchor per decade too, so the spread is not only the named list */
  const byDecade = {};
  for (const k of keys) {
    const d = Math.floor((corpus.films[k].year || 0) / 10) * 10;
    if (!byDecade[d] || adj[k].length > adj[byDecade[d]].length) byDecade[d] = k;
  }
  Object.values(byDecade).forEach((k) => { anchorSet.add(k); sel.add(k); });

  /* admit each anchor's neighbourhood before anything else competes for room */
  for (const a of anchorSet) {
    const nbrs = [...new Set(adj[a])].sort((x, y) => strength(a, y) - strength(a, x));
    for (const n of nbrs.slice(0, MIN_DEGREE + 2)) sel.add(n);
  }

  const internalDeg = (k, set) => adj[k].filter((n) => set.has(n)).length;

  const grow = (target) => {
    const score = {};
    keys.forEach((k) => (score[k] = 0));
    sel.forEach((k) => adj[k].forEach((n) => { if (!sel.has(n)) score[n]++; }));
    while (sel.size < target) {
      let best = null, bestScore = -1;
      for (const k of keys) {
        if (sel.has(k)) continue;
        const sc = score[k] * 1000 + adj[k].length;
        if (sc > bestScore) { bestScore = sc; best = k; }
      }
      if (best === null) break;
      sel.add(best);
      adj[best].forEach((n) => { if (!sel.has(n)) score[n]++; });
    }
  };

  grow(LIMIT);

  /* Prune the under-connected and refill until it settles. Anchors are pruned
     too if their neighbourhood still did not survive -- the exemption is what
     produced the stranded film, and a corpus that quietly contains dead ends is
     worse than one that is honestly smaller. */
  for (let pass = 0; pass < 8; pass++) {
    const weak = [...sel].filter((k) => internalDeg(k, sel) < MIN_DEGREE);
    if (!weak.length) break;
    weak.forEach((k) => sel.delete(k));
    grow(LIMIT);
  }

  const lostAnchors = [...anchorSet].filter((k) => !sel.has(k));
  if (lostAnchors.length) {
    console.log("anchors dropped (neighbourhood did not survive): " + lostAnchors.join(", "));
  }
  keys = keys.filter((k) => sel.has(k));
}
const kept = new Set(keys);
if (LIMIT) corpus.edges = corpus.edges.filter((e) => kept.has(e.a) && kept.has(e.b));

const index = {};
keys.forEach((k, i) => (index[k] = i));

/* ---- prune edges to the top N per film, type-diverse first ---- */
const byFilm = {};
for (const k of keys) byFilm[k] = [];
corpus.edges.forEach((e, i) => {
  if (byFilm[e.a]) byFilm[e.a].push(i);
  if (byFilm[e.b]) byFilm[e.b].push(i);
});

const keep = new Set();
for (const k of keys) {
  const mine = byFilm[k]
    .map((i) => ({ i: i, e: corpus.edges[i] }))
    .sort((x, y) => (y.e.strength || 0) - (x.e.strength || 0));
  const typeSeen = {};
  const chosen = [];
  /* authored readings are scarce and structural -- they are the edges that
     leave a neighbourhood -- so they survive pruning unconditionally */
  for (const c of mine) if (c.e.source !== "record") { chosen.push(c); typeSeen[c.e.type] = 1; }
  for (const c of mine) {
    if (chosen.length >= DEGREE) break;
    if (!typeSeen[c.e.type] && chosen.indexOf(c) === -1) { chosen.push(c); typeSeen[c.e.type] = 1; }
  }
  for (const c of mine) {
    if (chosen.length >= DEGREE) break;
    if (chosen.indexOf(c) === -1) chosen.push(c);
  }
  chosen.forEach((c) => keep.add(c.i));
}

const edges = [...keep].map((i) => corpus.edges[i]);

/* ---- legends ---- */
const legend = (vals) => { const u = [...new Set(vals)].filter(Boolean); const m = {}; u.forEach((v, i) => (m[v] = i)); return { list: u, map: m }; };
const T = legend(edges.map((e) => e.type));
const S = legend(edges.map((e) => e.source));
const G = legend(edges.map((e) => e.signal));
const D = legend(keys.map((k) => corpus.films[k].director));

const PREFIX = "https://upload.wikimedia.org/wikipedia/";
const shortPoster = (u) => (u || "").replace(PREFIX, "~").replace(/\?utm_source[^"]*$/, "");

/* ---- films ---- */
const films = keys.map((k) => {
  const f = corpus.films[k];
  const rec = [
    k,                                   // 0 key
    f.title,                             // 1
    f.year || 0,                         // 2
    D.map[f.director] === undefined ? -1 : D.map[f.director], // 3
    f.shadow, f.highlight,               // 4,5
    shortPoster(f.poster),               // 6
    (f.description || "").slice(0, DESC),// 7
    f.paletteSource === "poster" ? 1 : f.paletteSource === "curated" ? 2 : 0, // 8
    f.filmId,                            // 9 permanent identity
    f.qid,                               // 10 canonical Wikidata identity
    f.posterLicence || "unknown",        // 11 rights metadata
  ];
  return rec;
});

/* ---- edges ---- */
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const packedEdges = edges.map((e) => [
  index[e.a], index[e.b],
  T.map[e.type],
  e.from === "a" ? 1 : e.from === "b" ? 2 : 0,
  r2(e.strength), r2(e.confidence),
  S.map[e.source] === undefined ? 0 : S.map[e.source],
  e.claim || "",
  G.map[e.signal] === undefined ? -1 : G.map[e.signal],
]);

const packed = {
  v: 2,
  note: "Packed by pipeline/pack-corpus.js for the single-file artifact. Unpack with unpack() in the artifact source.",
  meta: corpus.meta,
  posterPrefix: PREFIX,
  types: T.list, sources: S.list, signals: G.list, directors: D.list,
  films: films,
  edges: packedEdges,
};

fs.writeFileSync(OUT, JSON.stringify(packed));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
const orig = (fs.statSync(CORPUS_PATH).size / 1024).toFixed(0);
console.log("films  : " + films.length);
console.log("edges  : " + packedEdges.length + "  (from " + corpus.edges.length + ", top " + DEGREE + " per film)");
const deg = {};
packedEdges.forEach((e) => { deg[e[0]] = (deg[e[0]] || 0) + 1; deg[e[1]] = (deg[e[1]] || 0) + 1; });
const ds = Object.values(deg).sort((a, b) => a - b);
console.log("degree : min " + (ds[0] || 0) + "  median " + ds[Math.floor(ds.length / 2)] + "  max " + ds[ds.length - 1]);
console.log("below 7: " + ds.filter((d) => d < 7).length + " films");
{
  const yrs = films.map((f) => f[2]).filter(Boolean).sort((a, b) => a - b);
  const dirs = new Set(films.map((f) => f[3]));
  console.log("spread : " + yrs[0] + "-" + yrs[yrs.length - 1] + ", " + dirs.size + " directors, median year " + yrs[Math.floor(yrs.length / 2)]);
}
console.log("size   : " + kb + " KB  (from " + orig + " KB)");
