#!/usr/bin/env node
/* Harvest film attributes from Wikidata.
 *
 *   node pipeline/harvest.js pipeline/seeds.txt     # -> pipeline/out/harvest.json
 *
 * Resolution is one request per title (CirrusSearch, type-filtered). Everything
 * after that is batched 50 at a time, which is the only reason a corpus of
 * several hundred films is practical: the naive version needs one request per
 * film plus one per referenced person, genre, place and subject, and there are
 * thousands of those.
 *
 * Interrupted runs resume from pipeline/.cache — rerun until it prints DONE.
 */

const fs = require("fs");
const path = require("path");
const wd = require("./wikidata");
const { addDirectMovement, addInheritedMovement } = require("./movement-provenance");

const OUT = path.join(__dirname, "out");

const ERA = [
  { until: 1929, shadow: "#12161A", highlight: "#C3CBD2" },
  { until: 1949, shadow: "#14150F", highlight: "#C8BE9E" },
  { until: 1965, shadow: "#161310", highlight: "#C9B486" },
  { until: 1979, shadow: "#1A1410", highlight: "#D8A75E" },
  { until: 1992, shadow: "#0C141C", highlight: "#5FB7C9" },
  { until: 2006, shadow: "#1B1016", highlight: "#D98CA6" },
  { until: 9999, shadow: "#101A20", highlight: "#7FA6B8" },
];

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function toHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function toHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const seg = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h / 60) % 6];
  return "#" + seg.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
/* Era sets the family, the film varies within it. Saturation floors matter:
   rotating the hue of a near-grey changes nothing, which once left every
   post-2007 film the same blue. */
function palette(key, year) {
  const era = ERA.find((e) => (year || 2000) <= e.until) || ERA[ERA.length - 1];
  const h = hash32(key);
  const hueShift = (h % 47) - 23;
  const satShift = (((h >> 8) % 21) - 8) / 100;
  const litShift = (((h >> 16) % 15) - 7) / 200;
  const mk = (hex, lMul, floor) => {
    const [hh, ss, ll] = toHsl(hex);
    return toHex(hh + hueShift, Math.max(floor, Math.min(0.62, ss + satShift)),
      Math.max(0.03, Math.min(0.88, ll + litShift * lMul)));
  };
  return { shadow: mk(era.shadow, 0.5, 0.16), highlight: mk(era.highlight, 1, 0.24) };
}

const slugKey = (t) => String(t).toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function parseSeeds(text) {
  return text.split("\n").map((l) => l.trim()).filter((l) => l && l[0] !== "#")
    .map((l) => {
      const m = l.match(/^(.*?)\s*\((\d{4})\)\s*$/);
      return m ? { title: m[1].trim(), year: parseInt(m[2], 10) } : { title: l, year: null };
    });
}

const ROLE_PROP = {
  director: wd.P.director, cinematographer: wd.P.cinematographer,
  editor: wd.P.editor, composer: wd.P.composer, screenwriter: wd.P.screenwriter,
};

async function main() {
  const seeds = parseSeeds(fs.readFileSync(process.argv[2] || path.join(__dirname, "seeds.txt"), "utf8"));
  console.log("seeds: " + seeds.length);

  /* ---- 1. resolve titles (one request each, cached) ---- */
  const resolved = {};
  const unresolved = [];
  let done = 0;
  for (const s of seeds) {
    let hit = null;
    try { hit = await wd.resolveFilm(s.title, s.year); }
    catch (e) { unresolved.push(s.title + " (fetch failed: " + e.message.slice(0, 30) + ")"); continue; }
    if (!hit) { unresolved.push(s.title + (s.year ? " (" + s.year + ")" : "")); continue; }
    const key = slugKey(hit.label || s.title);
    if (!resolved[key]) resolved[key] = hit;
    done++;
    if (done % 25 === 0) process.stdout.write("  resolved " + done + "/" + seeds.length + "\n");
  }
  console.log("resolved: " + Object.keys(resolved).length + " unique films");

  /* ---- 2. read attributes off the already-fetched film entities ---- */
  const films = {};
  const referenced = new Set();
  const sourceWorks = new Set();

  for (const [key, hit] of Object.entries(resolved)) {
    const e = hit.ent;
    const ids = (prop) => wd.claimIds(e, prop);
    const crew = {};
    for (const [role, prop] of Object.entries(ROLE_PROP)) {
      const v = ids(prop);
      if (v.length) crew[role] = v;
    }
    const year = hit.year || null;
    const pal = palette(key, year);
    const rec = {
      title: hit.label || key, year: year, qid: hit.qid, director: "",
      shadow: pal.shadow, highlight: pal.highlight, paletteSource: "era",
      crew: crew,
      genre: ids(wd.P.genre),
      movementDirect: [], movementInherited: [], movement: [],
      setting: ids(wd.P.narrativeLocation),
      subject: ids(wd.P.mainSubject),
      cast: ids(wd.P.cast).slice(0, 12),
      studio: ids(wd.P.productionCompany),
      country: ids(wd.P.country),
      basedOn: ids(wd.P.basedOn).concat(ids(wd.P.inspiredBy)),
      sourceAuthors: [],
    };
    ids(wd.P.movement).forEach((movementQid) => addDirectMovement(rec, movementQid));
    films[key] = rec;
    [].concat(rec.genre, rec.movement, rec.setting, rec.subject, rec.cast, rec.studio,
      Object.values(crew).flat()).forEach((q) => referenced.add(q));
    rec.basedOn.forEach((q) => sourceWorks.add(q));
  }

  /* ---- 3. the works films are based on, so we can learn their authors ---- */
  console.log("fetching " + sourceWorks.size + " source works ...");
  const works = await wd.entities([...sourceWorks]);
  for (const rec of Object.values(films)) {
    for (const q of rec.basedOn) {
      const w = works[q];
      if (!w) continue;
      const authors = wd.claimIds(w, wd.P.author);
      authors.forEach((a) => { rec.sourceAuthors.push(a); referenced.add(a); });
    }
  }

  /* ---- 4. a director's declared movement counts for their films ---- */
  const directors = new Set();
  Object.values(films).forEach((f) => (f.crew.director || []).forEach((q) => directors.add(q)));
  console.log("fetching " + directors.size + " directors ...");
  const dirEnts = await wd.entities([...directors]);
  for (const rec of Object.values(films)) {
    for (const q of rec.crew.director || []) {
      const d = dirEnts[q];
      if (!d) continue;
      wd.claimIds(d, wd.P.movement).forEach((m) => {
        addInheritedMovement(rec, m, q);
        referenced.add(m);
      });
    }
  }

  /* ---- 4b. what kind of place is each setting? ----
     "Both set in Arizona" is administrative trivia; "both set in Kyoto" is a
     fact about the film's world. The label alone cannot tell them apart, so
     read each place's own type and let the engine drop the regions. */
  const places = new Set();
  Object.values(films).forEach((f) => (f.setting || []).forEach((q) => places.add(q)));
  console.log("fetching " + places.size + " settings ...");
  const placeEnts = await wd.entities([...places]);
  const placeTypes = {};
  for (const q of places) {
    const e = placeEnts[q];
    placeTypes[q] = e ? wd.claimIds(e, wd.P.instanceOf) : [];
  }

  /* ---- 5. one batched pass for every label the engine will need ---- */
  console.log("fetching " + referenced.size + " labels ...");
  const labels = await wd.labels([...referenced]);
  for (const rec of Object.values(films)) {
    rec.director = (rec.crew.director || []).map((q) => labels[q] || q).filter(Boolean).join(", ");
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "harvest.json"),
    JSON.stringify({ films: films, labels: labels, placeTypes: placeTypes }, null, 1));

  const missingLabels = [...referenced].filter((q) => !labels[q]).length;
  console.log("\nfilms      : " + Object.keys(films).length);
  console.log("labels     : " + Object.keys(labels).length + (missingLabels ? "  (" + missingLabels + " unresolved)" : ""));
  if (unresolved.length) {
    console.log("unresolved : " + unresolved.length);
    unresolved.slice(0, 12).forEach((u) => console.log("   - " + u));
    if (unresolved.length > 12) console.log("   ... and " + (unresolved.length - 12) + " more");
  }
  console.log("\nDONE — wrote pipeline/out/harvest.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
