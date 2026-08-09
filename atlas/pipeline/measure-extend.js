#!/usr/bin/env node
/* Measure what the extension sweep actually brought home.
 *
 *   node pipeline/measure-extend.js          # after harvest-sparql.js --extend
 *
 * Three questions, in the order the enrichment report asks them:
 *
 *   1. COVERAGE per property across the whole corpus — and per region and era,
 *      because the report's dominant caveat is that every source collapses
 *      somewhere and the collapse must be mapped, not assumed. A property that
 *      covers 60% of the corpus can still cover 8% of pre-1930 Japan, and only
 *      this table can tell you.
 *   2. COLOUR-PROCESS DETAIL: whether P462's value space carries anything
 *      beyond the colour/black-and-white binary on OUR films.
 *   3. LINEAGE YIELD: how many NEW film-to-film edges the swept lineage
 *      properties would add over the pairs the corpus already connects. The
 *      candidate edges are written to out/lineage-candidates.json with their
 *      wikidata:<QID>#<P> evidence strings so a later associate.js pass can
 *      consume them; this tool never touches corpus.json.
 *
 * Read-only over harvest.json and corpus.json except for that one candidates
 * file. Nothing here is ranking-shaped: counts of facts, never lists of bests.
 */

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "out");
const H = JSON.parse(fs.readFileSync(path.join(OUT, "harvest.json"), "utf8"));
const CORPUS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "static", "corpus.json"), "utf8"));
const L = H.labels || {};

/* ------------------------------------------------------------ region/era */

/* Buckets are coarse on purpose: the question is "where does coverage thin
   out", and eight regions answer it without shredding the sample sizes. A
   co-production counts in every region it belongs to — 794 US films and 487
   French films overlap, and pretending otherwise would hide exactly the
   co-production structure P272/P495 record. */
const REGIONS = {
  ANGLO: ["United States", "United Kingdom", "Canada", "Australia", "New Zealand", "Ireland"],
  WEUR: ["France", "Italy", "Germany", "West Germany", "Weimar Republic", "Spain", "Portugal",
    "Belgium", "Netherlands", "Switzerland", "Austria", "Greece", "Kingdom of Italy", "Luxembourg"],
  NORD: ["Sweden", "Norway", "Denmark", "Finland", "Iceland"],
  EEUR: ["Soviet Union", "Russia", "Poland", "Czechoslovakia", "Czech Republic", "Hungary",
    "Yugoslavia", "Federal Republic of Yugoslavia", "Serbia", "Croatia", "Slovakia", "Slovenia",
    "Romania", "Bulgaria", "Ukraine", "Latvia", "Lithuania", "Estonia", "Georgia", "Armenia",
    "East Germany", "German Democratic Republic", "Bosnia and Herzegovina", "North Macedonia"],
  EASIA: ["Japan", "Empire of Japan", "South Korea", "North Korea", "People's Republic of China",
    "Republic of China", "Hong Kong", "Taiwan", "Mongolia", "Macau"],
  SASIA: ["India", "Thailand", "Philippines", "Vietnam", "Indonesia", "Sri Lanka", "Bangladesh",
    "Nepal", "Malaysia", "Singapore", "Cambodia", "Myanmar", "Laos", "Pakistan", "Bhutan"],
  MEAF: ["Iran", "Israel", "Egypt", "Algeria", "Tunisia", "Morocco", "Senegal", "Mali",
    "Mauritania", "Jordan", "United Arab Emirates", "Lebanon", "Turkey", "Iraq", "Palestine",
    "Saudi Arabia", "Syria", "Burkina Faso", "Chad", "Cameroon", "South Africa", "Nigeria",
    "Ethiopia", "Kenya", "Ivory Coast", "Democratic Republic of the Congo", "Angola", "Mozambique"],
  LATAM: ["Mexico", "Brazil", "Argentina", "Chile", "Cuba", "Colombia", "Peru", "Venezuela",
    "Bolivia", "Uruguay", "Paraguay", "Ecuador", "Guatemala", "Costa Rica", "Dominican Republic"],
};
const REGION_OF = {};
for (const [code, names] of Object.entries(REGIONS)) for (const n of names) REGION_OF[n] = code;
const REGION_CODES = Object.keys(REGIONS);

const ERAS = [
  ["pre-1930", (y) => y < 1930],
  ["1930-49", (y) => y >= 1930 && y <= 1949],
  ["1950-65", (y) => y >= 1950 && y <= 1965],
  ["1966-79", (y) => y >= 1966 && y <= 1979],
  ["1980-99", (y) => y >= 1980 && y <= 1999],
  ["2000+", (y) => y >= 2000],
];

function regionsOf(f) {
  const set = new Set();
  for (const c of f.country || []) {
    const code = REGION_OF[L[c] || ""];
    if (code) set.add(code);
  }
  if (!set.size) set.add("OTHER");
  return [...set];
}
const eraOf = (f) => { const e = ERAS.find(([, t]) => f.year != null && t(f.year)); return e ? e[0] : "no-year"; };

/* ------------------------------------------------------- coverage tables */

const FILM_PROPS = [
  ["aspect", "P2061", (f) => f.aspect],
  ["format", "P437", (f) => f.format],
  ["colour", "P462", (f) => f.colour],
  ["language", "P364", (f) => f.language],
  ["filmingLocation", "P915", (f) => f.filmingLocation],
  ["prodDesigner", "P2554", (f) => f.crew.productionDesigner],
  ["artDirector", "P3174", (f) => f.crew.artDirector],
  ["costumeDesigner", "P2515", (f) => f.crew.costumeDesigner],
  ["influencedBy", "P737", (f) => f.influencedBy],
  ["derivativeWork", "P4969", (f) => f.derivativeWork],
  ["afterWorkBy", "P1877", (f) => f.afterWorkBy],
  ["quotesWork", "P6166", (f) => f.quotesWork],
  ["precededBy", "P155", (f) => f.precededBy],
  ["followedBy", "P156", (f) => f.followedBy],
];

const films = Object.entries(H.films);
const N = films.length;
console.log("films: " + N + "\n");

/* denominators */
const regionN = {}; const eraN = {};
for (const [, f] of films) {
  for (const r of regionsOf(f)) regionN[r] = (regionN[r] || 0) + 1;
  eraN[eraOf(f)] = (eraN[eraOf(f)] || 0) + 1;
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

console.log("== coverage per property (films with >=1 value / " + N + ") ==\n");
console.log("property".padEnd(17) + "P".padEnd(7) + "films".padStart(6) + "%".padStart(5)
  + "stmts".padStart(7) + "distinct".padStart(9));
const covered = {};
for (const [name, p, get] of FILM_PROPS) {
  let withV = 0, stmts = 0;
  const distinct = new Set();
  covered[name] = { region: {}, era: {} };
  for (const [, f] of films) {
    const v = get(f) || [];
    if (!v.length) continue;
    withV++; stmts += v.length;
    for (const x of v) distinct.add(x);
    for (const r of regionsOf(f)) covered[name].region[r] = (covered[name].region[r] || 0) + 1;
    covered[name].era[eraOf(f)] = (covered[name].era[eraOf(f)] || 0) + 1;
  }
  console.log(name.padEnd(17) + p.padEnd(7) + String(withV).padStart(6)
    + String(pct(withV, N)).padStart(5) + String(stmts).padStart(7) + String(distinct.size).padStart(9));
}

const showCols = (title, colKeys, colN, pick) => {
  console.log("\n== " + title + " (% of films in column with >=1 value) ==\n");
  console.log("property".padEnd(17) + colKeys.map((c) => c.padStart(9)).join(""));
  console.log("(films)".padEnd(17) + colKeys.map((c) => String(colN[c] || 0).padStart(9)).join(""));
  for (const [name] of FILM_PROPS) {
    console.log(name.padEnd(17) + colKeys.map((c) => String(pct(pick(name)[c] || 0, colN[c] || 0)).padStart(9)).join(""));
  }
};
showCols("coverage per region", REGION_CODES.concat(regionN.OTHER ? ["OTHER"] : []), regionN, (n) => covered[n].region);
showCols("coverage per era", ERAS.map(([e]) => e), eraN, (n) => covered[n].era);

/* -------------------------------------------------- colour-process detail */

console.log("\n== P462 value space (the colour-process question) ==\n");
const cdist = {};
for (const [, f] of films) for (const v of f.colour || []) cdist[v] = (cdist[v] || 0) + 1;
for (const [q, n] of Object.entries(cdist).sort((a, b) => b[1] - a[1])) {
  console.log(String(n).padStart(6) + "  " + q + "  " + (L[q] || ""));
}

/* -------------------------------------------------------- maker formation */

const directors = new Set();
for (const [, f] of films) for (const d of f.crew.director || []) directors.add(d);
const makers = H.makers || {};
let mEdu = 0, mStu = 0, mInf = 0;
for (const d of directors) {
  const m = makers[d];
  if (!m) continue;
  if (m.educatedAt.length) mEdu++;
  if (m.studentOf.length) mStu++;
  if (m.influencedBy.length) mInf++;
}
console.log("\n== maker formation (across " + directors.size + " directors) ==\n");
console.log("educatedAt  P69   " + String(mEdu).padStart(5) + String(pct(mEdu, directors.size)).padStart(5) + "%");
console.log("studentOf   P1066 " + String(mStu).padStart(5) + String(pct(mStu, directors.size)).padStart(5) + "%");
console.log("influencedBy P737 " + String(mInf).padStart(5) + String(pct(mInf, directors.size)).padStart(5) + "%");

/* ---------------------------------------------------------- lineage yield */

/* A candidate edge is film-to-film, both ends in THIS corpus, not already
   connected by any existing edge of any type. Direction is recorded from the
   property's own semantics: P4969 points at the derivative, so the arrow runs
   value -> subject for descent; P737 the other way around. P1877 is
   person-valued and structurally cannot make a film-film edge — counted
   separately so its absence from the yield is visibly a datatype fact, not a
   harvesting hole. */
const byQid = {};
for (const [k, f] of Object.entries(CORPUS.films)) byQid[f.qid] = k;

const pairKey = (a, b) => (a < b ? a + " " + b : b + " " + a);
const existing = new Set();
for (const e of CORPUS.edges) existing.add(pairKey(e.a, e.b));
console.log("\n== lineage yield vs " + CORPUS.edges.length + " existing corpus edges ==\n");

const LINEAGE = [
  ["influencedBy", "P737", "influenced-by"],
  ["derivativeWork", "P4969", "derivative-work"],
  ["quotesWork", "P6166", "quotes-work"],
  ["precededBy", "P155", "series-follows"],
  ["followedBy", "P156", "series-followed-by"],
];
const candidates = [];
const seen = new Set();
const stats = {};
for (const [field] of LINEAGE) stats[field] = { stmts: 0, inCorpus: 0, outside: 0, dupExisting: 0, fresh: 0 };
for (const [, f] of films) {
  const a = byQid[f.qid] !== undefined ? byQid[f.qid] : null;
  for (const [field, p, kind] of LINEAGE) {
    for (const v of f[field] || []) {
      const s = stats[field];
      s.stmts++;
      const b = byQid[v];
      if (a == null || b === undefined) { s.outside++; continue; }
      if (b === a) continue;
      s.inCorpus++;
      const pk = pairKey(a, b);
      if (existing.has(pk)) { s.dupExisting++; continue; }
      if (seen.has(pk)) continue;                      /* both directions of one series link */
      seen.add(pk);
      s.fresh++;
      candidates.push({
        a: a, b: b, property: p, kind: kind,
        evidence: "wikidata:" + f.qid + "#" + p,
        note: kind === "influenced-by" ? a + " is recorded as influenced by " + b
          : kind === "derivative-work" ? b + " is recorded as a derivative work of " + a
          : kind === "quotes-work" ? a + " is recorded as quoting " + b
          : a + " and " + b + " are recorded as consecutive works in one series",
      });
    }
  }
}
console.log("property".padEnd(16) + "stmts".padStart(7) + "in-corpus".padStart(11)
  + "outside".padStart(9) + "already".padStart(9) + "NEW".padStart(6));
let totalFresh = 0;
for (const [field] of LINEAGE) {
  const s = stats[field];
  totalFresh += s.fresh;
  console.log(field.padEnd(16) + String(s.stmts).padStart(7) + String(s.inCorpus).padStart(11)
    + String(s.outside).padStart(9) + String(s.dupExisting).padStart(9) + String(s.fresh).padStart(6));
}
console.log("\nNEW distinct film-to-film pairs (union, both ends in corpus, not yet connected): "
  + candidates.length);

/* P1877 datatype note */
let afterStmts = 0; const afterFilms = new Set();
for (const [k, f] of films) if ((f.afterWorkBy || []).length) { afterStmts += f.afterWorkBy.length; afterFilms.add(k); }
console.log("(P1877 after-a-work-by: " + afterStmts + " statements on " + afterFilms.size
  + " films — person-valued, feeds sourceAuthors-style association, not film-film edges)");

fs.writeFileSync(path.join(OUT, "lineage-candidates.json"), JSON.stringify({
  note: "Film-to-film edges recorded by Wikidata lineage properties swept 2026-08-09, "
    + "absent from corpus.json. Every entry is a citable record (evidence = statement subject). "
    + "Input for a future associate.js pass; nothing consumes this automatically.",
  caveat: "P155/P156 verified by hand 2026-08-09: statements imported from Russian Wikipedia "
    + "(reference P143, no P179 series qualifier) can encode a director's FILMOGRAPHY in release "
    + "order, not a series — Made in U.S.A 'follows' Masculin Feminin is production chronology "
    + "wearing series clothes. Before shipping a series-position edge, require either a P179 "
    + "qualifier on the statement or a real citation (P854/P248); a bare P143 import does not "
    + "clear the record bar (AGENTS rule 8).",
  generated: new Date().toISOString().slice(0, 10),
  existingEdges: CORPUS.edges.length,
  candidates: candidates,
}, null, 1));
console.log("\nwrote out/lineage-candidates.json (" + candidates.length + " candidates)");
