#!/usr/bin/env node
/* build-registers.js — turn the hand-authored rules in registers.json into
 * postings over discovery.json's filmOrder, and decide each register's
 * rendering tier BY MEASUREMENT rather than by assertion.
 *
 *   node pipeline/build-registers.js            # writes static/registers.json
 *   node pipeline/build-registers.js --report   # prints the hygiene table only
 *
 * ── WHY THIS IS A SEPARATE FILE FROM discovery.json ────────────────────────
 *
 * discovery.json is the RECORDED layer: era, country, genre, movement,
 * director, each of them a fact harvested from Wikidata with a provenance
 * trail. A register is DERIVED — it is a rule over themes, evaluated here,
 * and it changes whenever somebody edits registers.json. Merging the two
 * would put a thing that can be argued with inside the file whose contract is
 * that it cannot. They ship side by side and the interface labels them
 * differently, which is AGENTS rule 8 one level up from the edges.
 *
 * ── WHERE THE THEMES COME FROM, AND THE LIMIT THAT CREATES ─────────────────
 *
 * TMDB keywords in pipeline/out/enrich.json, which 1,839 of 2,204 films carry
 * (83.4%). 365 films carry none and are therefore structurally unreachable by
 * any theme rule — not absent because they do not belong to a register, absent
 * because nothing was ever recorded about what they are about. The interface
 * must never present the register list as a partition of the corpus. It is a
 * set of doors, and 46.9% of the atlas is not behind any of them.
 *
 * These are a STAND-IN for the closed theme vocabulary of the fingerprint
 * layer, which does not exist yet. When it lands, `themes_any`/`themes_all`
 * start reading it instead and nothing else in the chain changes.
 *
 * ── THE THREE HYGIENE GATES ────────────────────────────────────────────────
 *
 *   size      >= 8 films. Below that a re-formed constellation is a scatter of
 *             dots, not a picture, and the door promises more than it opens.
 *   share     <= 12% of the corpus. The v1.1 spec's own ceiling: a register
 *             matching a fifth of everything is not a region, it is a mood.
 *   jaccard   < 0.80 against every value of every recorded facet. A register
 *             that is genre:war renamed is not a door, it is a duplicate
 *             control, and the interface would be offering the same picture
 *             twice under two names.
 *
 * ── THE TIER IS MEASURED ───────────────────────────────────────────────────
 *
 * Each film ships a `highlight` measured from its own poster by palette.py.
 * For each register: take the mean of its members' highlights in Oklab, and
 * compare it against the corpus mean in units of the NULL standard deviation —
 * the spread of the same statistic over same-size random samples. That is the
 * only defensible way to say a register "has a colour", and for most of them
 * the honest answer is that it does not.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, "registers.json"), "utf8"));
const CORPUS = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));
const DISCOVERY = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "discovery.json"), "utf8"));
const ENRICH = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "enrich.json"), "utf8"));

const REPORT_ONLY = process.argv.includes("--report");
const OUT = path.join(ROOT, "static", "registers.json");

/* ── colour: sRGB -> Oklab, and back. Oklab because a mean in sRGB is a mean
   of gamma-encoded numbers and lands somewhere neither colour is. ───────── */
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function hexToOklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex([L, a, bb]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(Math.max(0, Math.min(1, linearToSrgb(Math.max(0, Math.min(1, v))))) * 255));
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/* WCAG relative luminance, so an authored hue can be checked against the
   ground it is drawn on before it ships. */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* ── corpus views ───────────────────────────────────────────────────────── */
const KEYS = Object.keys(CORPUS.films);
const N = KEYS.length;
const indexOfKey = new Map();
DISCOVERY.filmOrder.forEach((id, i) => {
  const key = DISCOVERY.keyByFilmId[id];
  if (key) indexOfKey.set(key, i);
});

const facetSets = {};
for (const [field, values] of Object.entries(DISCOVERY.facets.postings)) {
  facetSets[field] = {};
  for (const [value, rows] of Object.entries(values)) {
    const s = new Set();
    for (const i of rows) {
      const key = DISCOVERY.keyByFilmId[DISCOVERY.filmOrder[i]];
      if (key) s.add(key);
    }
    facetSets[field][value] = s;
  }
}

const themesOf = new Map();
for (const key of KEYS) {
  const row = ENRICH[key];
  themesOf.set(key, new Set(((row && row.keywords) || []).map((s) => String(s).toLowerCase())));
}

/* ── rule evaluation ────────────────────────────────────────────────────── */
const anyTheme = (have, want) => want.some((t) => have.has(t));

function membersOf(rule) {
  const out = [];
  for (const key of KEYS) {
    if (rule.genre_any && !rule.genre_any.some((v) => facetSets.genre[v] && facetSets.genre[v].has(key))) continue;
    if (rule.era_any && !rule.era_any.some((v) => facetSets.era[v] && facetSets.era[v].has(key))) continue;
    if (rule.country_any && !rule.country_any.some((v) => facetSets.country[v] && facetSets.country[v].has(key))) continue;
    const have = themesOf.get(key);
    /* movement_any is an OR-branch with the themes, not an AND: a register may
       be reachable either by what a film is about or by a recorded movement it
       belongs to. Surrealism is the case — the movement is a harvested fact for
       36 films and a theme for the rest. */
    const byMovement = rule.movement_any
      ? rule.movement_any.some((v) => facetSets.movement[v] && facetSets.movement[v].has(key))
      : false;
    let byTheme = true;
    if (rule.themes_all) byTheme = rule.themes_all.every((group) => anyTheme(have, group));
    if (byTheme && rule.themes_any) byTheme = anyTheme(have, rule.themes_any);
    if (!rule.themes_all && !rule.themes_any) byTheme = false;
    if (!byTheme && !byMovement) continue;
    out.push(key);
  }
  return out;
}

/* ── the tier measurement ───────────────────────────────────────────────────
   Mean member highlight in Oklab against the corpus mean, in units of the null
   SD of the same statistic over same-size random samples. Seeded, because a
   build that reports a different tier on Tuesday is not a build (rule 7). */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_LAB = KEYS.map((k) => hexToOklab(CORPUS.films[k].highlight));
const corpusMean = ALL_LAB.reduce((acc, v) => [acc[0] + v[0] / N, acc[1] + v[1] / N, acc[2] + v[2] / N], [0, 0, 0]);

const NULL_TRIALS = 400;
function separation(memberKeys) {
  const n = memberKeys.length;
  const lab = memberKeys.map((k) => hexToOklab(CORPUS.films[k].highlight));
  const mean = lab.reduce((acc, v) => [acc[0] + v[0] / n, acc[1] + v[1] / n, acc[2] + v[2] / n], [0, 0, 0]);
  const d = Math.hypot(mean[0] - corpusMean[0], mean[1] - corpusMean[1], mean[2] - corpusMean[2]);
  const rnd = mulberry32(0x5eed ^ n);
  const nulls = [];
  for (let t = 0; t < NULL_TRIALS; t++) {
    let L = 0, A = 0, B = 0;
    for (let i = 0; i < n; i++) {
      const v = ALL_LAB[(rnd() * N) | 0];
      L += v[0] / n; A += v[1] / n; B += v[2] / n;
    }
    nulls.push(Math.hypot(L - corpusMean[0], A - corpusMean[1], B - corpusMean[2]));
  }
  const mu = nulls.reduce((a, b) => a + b, 0) / NULL_TRIALS;
  const sd = Math.sqrt(nulls.reduce((a, b) => a + (b - mu) ** 2, 0) / NULL_TRIALS) || 1e-9;
  return { mean, distance: d, sigma: (d - mu) / sd };
}

/* WHAT "AMPLIFIED" MEANS, EXACTLY: THE DIRECTION IS MEASURED, THE INTENSITY IS
   AUTHORED. The register's members' mean highlight is displaced from the corpus
   mean; the ANGLE of that displacement in the Oklab a/b plane is a real
   measurement, and it is the only part taken. It is applied to the authored
   colour's own lightness and chroma, which were chosen for legibility on
   #08070A and for being distinguishable from the other 27 doors.

   The obvious implementation — take the measured mean and multiply its chroma
   until it is vivid — was built first and is wrong twice over. It clips the
   gamut (cerebral horror came out #ff4353, a colour no poster in the register
   contains), and because the corpus mean sits at hue 42 every register that
   deviates at all deviates the same way: cyberpunk, cold science fiction and
   artificial life all resolved to within 8 degrees of each other, three
   near-identical purples. Three doors that look the same is the failure the
   whole treatment layer exists to fix, and "purple-blue gradient" is on the
   list of things this project will not ship. */
const AMPLIFY_SIGMA = 3.0;
function amplify(mean, authoredHex) {
  const dev = [mean[1] - corpusMean[1], mean[2] - corpusMean[2]];
  const h = Math.atan2(dev[1], dev[0]);
  const [L, a, b] = hexToOklab(authoredHex);
  const c = Math.hypot(a, b);
  return { hex: oklabToHex([L, Math.cos(h) * c, Math.sin(h) * c]),
           degrees: Math.round(((h * 180) / Math.PI + 360) % 360) };
}

/* ── run ────────────────────────────────────────────────────────────────── */
const rows = [];
const postings = {};
const definitions = {};
const rejected = [];

for (const reg of RULES.registers) {
  const members = membersOf(reg);
  const set = new Set(members);
  let worstJ = 0, worstV = "—";
  for (const field of ["genre", "country", "era", "movement"]) {
    for (const [value, fs2] of Object.entries(facetSets[field])) {
      if (fs2.size < 10) continue;
      let inter = 0;
      for (const k of set) if (fs2.has(k)) inter++;
      const j = inter / (set.size + fs2.size - inter);
      if (j > worstJ) { worstJ = j; worstV = field + "=" + value; }
    }
  }
  const fail = [];
  if (members.length < RULES.gates.minFilms) fail.push(`only ${members.length} films`);
  if (members.length / N > RULES.gates.maxShare) fail.push(`${(members.length / N * 100).toFixed(1)}% of corpus`);
  if (worstJ >= RULES.gates.maxFacetJaccard) fail.push(`duplicates ${worstV} at J=${worstJ.toFixed(2)}`);

  const treat = Object.assign({}, RULES.treatments[reg.id]);
  const sep = members.length ? separation(members) : { sigma: 0, mean: corpusMean, distance: 0 };
  let tier = treat.tier || (sep.sigma >= AMPLIFY_SIGMA ? "amplified" : "authored");
  const authoredHue = treat.hue;
  let devDeg = null;
  if (tier === "amplified") {
    const amp = amplify(sep.mean, authoredHue);
    treat.hue = amp.hex;
    treat.authoredHue = authoredHue;
    treat.measuredHueDeg = amp.degrees;
    devDeg = amp.degrees;
  }
  treat.tier = tier;
  treat.sigma = Number(sep.sigma.toFixed(2));

  rows.push({
    id: reg.id, label: reg.label, n: members.length, share: members.length / N,
    worstJ, worstV, fail, tier, sigma: sep.sigma, hue: treat.hue, devDeg,
    onBase: contrast(treat.hue, "#08070A"),
  });

  if (fail.length) { rejected.push({ id: reg.id, why: fail }); continue; }

  postings[reg.id] = members.map((k) => indexOfKey.get(k)).filter((i) => i !== undefined).sort((a, b) => a - b);
  definitions[reg.id] = {
    label: reg.label,
    blurb: reg.blurb,
    count: postings[reg.id].length,
    treatment: treat,
  };
}

/* ── the hygiene report ─────────────────────────────────────────────────── */
const pad = (s, n) => String(s).padEnd(n);
console.log(`registers ${RULES.version} — corpus ${N} films\n`);
console.log(pad("register", 24) + pad("films", 7) + pad("share", 8) + pad("tier", 11) +
  pad("sigma", 8) + pad("hue", 10) + pad("on base", 9) + "gate");
console.log("-".repeat(104));
for (const r of rows) {
  console.log(pad(r.label, 24) + pad(r.n, 7) + pad((r.share * 100).toFixed(1) + "%", 8) +
    pad(r.tier, 11) + pad(r.sigma.toFixed(1), 8) + pad(r.hue, 10) +
    pad(r.onBase.toFixed(1) + ":1", 9) + (r.devDeg !== null ? "measured hue " + r.devDeg + "deg  " : "") +
    (r.fail.length ? "REJECTED — " + r.fail.join("; ") : "ok"));
}
console.log("-".repeat(104));
const covered = new Set();
for (const list of Object.values(postings)) for (const i of list) covered.add(i);
console.log(`${Object.keys(postings).length} registers shipped, ${rejected.length} rejected`);
console.log(`coverage: ${covered.size} of ${N} films (${(covered.size / N * 100).toFixed(1)}%) are behind at least one door`);
const noThemes = KEYS.filter((k) => !themesOf.get(k).size).length;
console.log(`${noThemes} films (${(noThemes / N * 100).toFixed(1)}%) carry no themes at all and no theme rule can reach them`);
const tiers = rows.filter((r) => !r.fail.length).reduce((a, r) => (a[r.tier] = (a[r.tier] || 0) + 1, a), {});
console.log("tiers:", JSON.stringify(tiers));
const dim = rows.filter((r) => !r.fail.length && r.onBase < 3);
if (dim.length) console.log("WARNING — hues under 3:1 on --base:", dim.map((r) => r.label + " " + r.onBase.toFixed(1)).join(", "));

if (REPORT_ONLY) process.exit(0);

const out = {
  version: RULES.version,
  corpusVersion: CORPUS.meta.corpusVersion,
  identityVersion: DISCOVERY.identityVersion,
  layoutVersion: DISCOVERY.layoutVersion,
  source: "themes (TMDB keywords) + recorded facets — see pipeline/registers.json",
  themeCoverage: Number(((N - noThemes) / N).toFixed(4)),
  motionKinds: RULES.motionKinds,
  definitions,
  postings,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`\nwrote ${path.relative(ROOT, OUT)} — ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
