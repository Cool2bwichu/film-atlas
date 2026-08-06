#!/usr/bin/env node
/* Build the record spine of the corpus from Wikidata.
 *
 *   node pipeline/build-corpus.js pipeline/seeds.txt
 *
 * Produces pipeline/out/spine.json: films plus every edge that is a checkable
 * production fact. No language model is involved at any point in this file,
 * which is the entire argument — these edges cost nothing, cannot hallucinate,
 * and carry confidence 1.0 honestly.
 *
 * Interpretive edges live in static/readings.json and are merged separately by
 * merge-corpus.js. Keeping the two apart is not tidiness; it is the guarantee
 * that a generated reading can never be silently promoted to a record.
 */

const fs = require("fs");
const path = require("path");
const wd = require("./wikidata");

const OUT = path.join(__dirname, "out");

/* How much formal weight a shared credit carries.
 *
 * These are not popularity weights (AGENTS.md rule 1) — they rank how strongly
 * a shared role binds two films *formally*. A director carries the most of the
 * frame; a cinematographer nearly as much and sometimes more; an editor shapes
 * rhythm; a composer shapes affect but rarely the image. None reaches the top
 * of the scale, because sharing a crew member is a fact about production, not
 * yet an argument about form — the map should not imply otherwise. */
const ROLE_WEIGHT = {
  director: 0.62,
  cinematographer: 0.58,
  editor: 0.46,
  composer: 0.40,
  screenwriter: 0.44,
};
const ROLE_PROP = {
  director: wd.P.director,
  cinematographer: wd.P.cinematographer,
  editor: wd.P.editor,
  composer: wd.P.composer,
  screenwriter: wd.P.screenwriter,
};
const ROLE_PHRASE = {
  director: "directing",
  cinematographer: "shooting",
  editor: "cutting",
  composer: "scoring",
  screenwriter: "writing",
};

/* Palette. DESIGN.md is explicit that colour should come from the film's own
   photography — but without posters there is no photography to sample, and
   inventing a per-film palette from a hash would be arbitrary noise dressed as
   authorship. The compromise: era decides the family, the film decides the
   variation within it, so the map drifts tonally across film history in a way
   that means something. Flagged as `paletteSource: "era"` so a curated palette
   can override it and so nobody mistakes it for a measurement. */
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
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
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

/* Era sets the family; the film varies inside it. An earlier version shifted
   only lightness, which left every post-2007 film the same desaturated blue —
   Dune, Inception and Sicario were indistinguishable on the map. Rotating hue
   as well as lightness keeps the era legible while giving each film its own
   colour, which is what DESIGN.md asks of a cell. */
function palette(key, year) {
  const era = ERA.find((e) => (year || 2000) <= e.until) || ERA[ERA.length - 1];
  const h = hash32(key);
  const hueShift = ((h % 47) - 23);            /* +/- 23 degrees within the family */
  const satShift = (((h >> 8) % 21) - 8) / 100;
  const litShift = (((h >> 16) % 15) - 7) / 200;
  /* Saturation floors matter more than they look: rotating the hue of a
     near-grey changes nothing on screen, which is how the first attempt left
     four contemporary films identical. Keep enough chroma for the rotation to
     be visible while staying inside the film-base palette. */
  const mk = (hex, lMul, satFloor) => {
    const [hh, ss, ll] = toHsl(hex);
    return toHex(hh + hueShift,
      Math.max(satFloor, Math.min(0.62, ss + satShift)),
      Math.max(0.03, Math.min(0.88, ll + litShift * lMul)));
  };
  return { shadow: mk(era.shadow, 0.5, 0.16), highlight: mk(era.highlight, 1, 0.24) };
}

function slugKey(title) {
  return String(title).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseSeeds(text) {
  return text.split("\n").map((l) => l.trim())
    .filter((l) => l && l[0] !== "#")
    .map((l) => {
      const m = l.match(/^(.*?)\s*\((\d{4})\)\s*$/);
      return m ? { title: m[1].trim(), year: parseInt(m[2], 10) } : { title: l, year: null };
    });
}

async function main() {
  const seedFile = process.argv[2] || path.join(__dirname, "seeds.txt");
  const seeds = parseSeeds(fs.readFileSync(seedFile, "utf8"));
  console.log("seeds: " + seeds.length);

  const films = {};      // key -> film record
  const byQid = {};      // qid -> key
  const credits = {};    // key -> { role -> [personQid] }
  const unresolved = [];

  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    process.stdout.write("  [" + (i + 1) + "/" + seeds.length + "] " + s.title + " ... ");
    let hit = null;
    try { hit = await wd.resolveFilm(s.title, s.year); }
    catch (e) { console.log("ERROR " + e.message); unresolved.push(s.title + " (fetch failed)"); continue; }
    if (!hit) { console.log("no film match"); unresolved.push(s.title + (s.year ? " (" + s.year + ")" : "")); continue; }

    const key = slugKey(hit.label || s.title);
    if (films[key]) { console.log("duplicate of " + key); continue; }

    const roles = {};
    for (const role of Object.keys(ROLE_PROP)) {
      const ids = wd.claimIds(hit.ent, ROLE_PROP[role]);
      if (ids.length) roles[role] = ids;
    }
    credits[key] = roles;
    byQid[hit.qid] = key;

    const year = hit.year || s.year || null;
    const pal = palette(key, year);
    films[key] = {
      title: hit.label || s.title,
      year: year,
      director: null,           // filled once person labels are resolved
      qid: hit.qid,
      shadow: pal.shadow,
      highlight: pal.highlight,
      paletteSource: "era",
      basedOn: wd.claimIds(hit.ent, wd.P.basedOn).concat(wd.claimIds(hit.ent, wd.P.inspiredBy)),
    };
    console.log(hit.qid + "  " + (year || "----"));
  }

  /* Resolve person labels once, not once per edge. */
  const people = new Set();
  Object.values(credits).forEach((r) => Object.values(r).forEach((ids) => ids.forEach((q) => people.add(q))));
  console.log("\nresolving " + people.size + " people ...");
  const personName = {};
  for (const q of people) {
    try { const e = await wd.entity(q); personName[q] = wd.label(e) || q; }
    catch (err) { personName[q] = q; }
  }
  for (const key of Object.keys(films)) {
    const dirs = (credits[key].director || []).map((q) => personName[q]).filter(Boolean);
    films[key].director = dirs.join(", ") || "";
  }

  /* ---- hand edges: shared crew ---- */
  const edges = [];
  const keys = Object.keys(films);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      const shared = [];
      for (const role of Object.keys(ROLE_PROP)) {
        const A = credits[a][role] || [], B = credits[b][role] || [];
        for (const q of A) if (B.indexOf(q) > -1) shared.push({ role: role, person: q });
      }
      if (!shared.length) continue;

      /* Strength is the strongest single shared role plus a small increment
         for each additional one — two people in common is a tighter bond than
         one, but four is not four times one. */
      const weights = shared.map((s) => ROLE_WEIGHT[s.role]).sort((x, y) => y - x);
      let strength = weights[0];
      for (let k = 1; k < weights.length; k++) strength += weights[k] * 0.18;
      strength = Math.min(0.82, +strength.toFixed(3));

      /* The claim is assembled from the facts themselves. No model, and no
         adjectives that the data does not support. */
      const byRole = {};
      shared.forEach((s) => { (byRole[s.role] = byRole[s.role] || []).push(personName[s.person] || s.person); });
      const parts = Object.keys(byRole).map((r) => byRole[r].join(" and ") + " " + ROLE_PHRASE[r]);
      const claim = parts.join("; ") + " on both.";

      edges.push({
        a: a, b: b, type: "hand", from: "none",
        strength: strength, confidence: 1.0, source: "record",
        claim: claim.length > 160 ? claim.slice(0, 157) + "..." : claim,
        evidence: shared.map((s) => "wikidata:" + s.person + "#" + s.role),
      });
    }
  }

  /* ---- descent edges: "based on" / "inspired by" pointing at another film ---- */
  for (const key of keys) {
    for (const target of films[key].basedOn) {
      const tk = byQid[target];
      if (!tk || tk === key) continue;   // source outside the universe, or self
      edges.push({
        a: tk, b: key, type: "descent", from: "a",
        strength: 0.9, confidence: 1.0, source: "record",
        claim: films[key].title + " is recorded as based on " + films[tk].title + ".",
        evidence: ["wikidata:" + films[key].qid + "#P144"],
      });
    }
  }

  keys.forEach((k) => { delete films[k].basedOn; });

  fs.mkdirSync(OUT, { recursive: true });
  const spine = {
    version: "spine-" + new Date().toISOString().slice(0, 10),
    generator: "pipeline/build-corpus.js (Wikidata, no model)",
    films: films,
    edges: edges,
  };
  fs.writeFileSync(path.join(OUT, "spine.json"), JSON.stringify(spine, null, 1));

  const hand = edges.filter((e) => e.type === "hand").length;
  console.log("\nfilms resolved : " + keys.length + "/" + seeds.length);
  console.log("hand edges     : " + hand);
  console.log("descent edges  : " + (edges.length - hand));
  if (unresolved.length) {
    console.log("\nunresolved (" + unresolved.length + "):");
    unresolved.forEach((u) => console.log("  - " + u));
  }
  console.log("\nwrote pipeline/out/spine.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
