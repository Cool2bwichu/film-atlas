#!/usr/bin/env node
/* build-lookup.js — the index that lets the search box answer "matt damon".
 *
 *   node pipeline/build-lookup.js        # -> pipeline/out/lookup.json
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The typed search was built on the consensus layer: 59 attributes describing
 * what a film is LIKE. It is good at that and it is the only thing it can see.
 * So the atlas, which holds cast for 2,080 of its films and genre for 2,186,
 * answers "matt damon" and "heist films" with nothing at all — while its own
 * harvest knows he is in eleven of them and that twenty-two are heists.
 *
 * The record layer was never shipped to the browser. corpus.json carries title,
 * year, director-as-a-string and colour; the people, the genres, the countries
 * and the movements stay in pipeline/out/harvest.json and never reach a reader.
 * That is the whole defect. It is not a ranking problem and no amount of
 * embedding fixes it: the data was not in the room.
 *
 * ── WHAT IT EMITS ───────────────────────────────────────────────────────────
 *
 * One posting list per NAMED THING, in the corpus's own film order so the
 * numbers stay small and delta-encode well:
 *
 *   person    cast and every crew role, with the roles they are held for
 *   genre     the full 258, not discovery.json's 19 collapsed buckets — the
 *             difference between "crime" and "heist film" is the entire
 *             difference between a facet and an answer
 *   country   by label rather than by Q-number
 *   movement  ditto
 *   decade    cheap, and people type "80s films"
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 *
 * It is not a ranking and it must never become one. A person or a genre is a
 * SET: every film in it belongs equally, and the atlas already knows how to
 * draw a set — that is what the worlds strip does. Sorting that set by fame
 * would be rule 1 broken through a side door, so the postings stay in corpus
 * order and the caller is left to place them.
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "out");
const harvest = JSON.parse(fs.readFileSync(path.join(OUT, "harvest.json"), "utf8"));
const discovery = JSON.parse(fs.readFileSync(path.join(__dirname, "../static/discovery.json"), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, "../static/corpus.json"), "utf8"));

const R = harvest.films || harvest;
const L = harvest.labels || {};
const lab = (id) => L[id] || id;
const films = corpus.films || corpus;

/* Film order is discovery's, so a posting is an index into a list the app
   already has rather than a second copy of every key. */
const order = discovery.filmOrder || Object.keys(films);
const keyByFilmId = discovery.keyByFilmId || {};
const idx = new Map();
order.forEach((filmId, i) => {
  const key = keyByFilmId[filmId] || filmId;
  idx.set(key, i);
});

const add = (bucket, name, i, role) => {
  if (!name || i === undefined) return;
  const s = String(name).trim();
  if (!s || s.length > 80) return;
  let e = bucket.get(s);
  if (!e) bucket.set(s, (e = { films: [], roles: new Set() }));
  if (e.films[e.films.length - 1] !== i) e.films.push(i);
  if (role) e.roles.add(role);
};

const person = new Map(), genre = new Map(), country = new Map(),
      movement = new Map(), decade = new Map();

for (const key of Object.keys(R)) {
  const i = idx.get(key);
  if (i === undefined) continue;         /* harvested but not admitted */
  const f = R[key];
  for (const c of f.cast || []) add(person, lab(c), i, "cast");
  const crew = f.crew || {};
  for (const role of Object.keys(crew))
    for (const p of crew[role] || []) add(person, lab(p), i, role);
  for (const g of f.genre || []) add(genre, lab(g), i);
  for (const c of f.country || []) add(country, lab(c), i);
  for (const m of f.movement || []) add(movement, lab(m), i);
  const y = f.year || (films[key] && films[key].year);
  if (y) add(decade, `${Math.floor(y / 10) * 10}s`, i);
}

/* Delta-encode: postings are ascending, and the gaps are far smaller than the
   indices. Costs one running sum on the way back in. */
const pack = (bucket, withRoles) => {
  const out = {};
  for (const [name, e] of bucket) {
    const d = []; let prev = 0;
    for (const v of e.films) { d.push(v - prev); prev = v; }
    out[name] = withRoles && e.roles.size
      ? { f: d, r: [...e.roles].sort() }
      : { f: d };
  }
  return out;
};

const doc = {
  version: 1,
  note: "Posting lists into discovery.filmOrder. Deltas, not absolute indices. "
      + "A set, never a ranking — see the header on build-lookup.js.",
  generated: new Date().toISOString(),
  n: order.length,
  person: pack(person, true),
  genre: pack(genre),
  country: pack(country),
  movement: pack(movement),
  decade: pack(decade),
};

fs.writeFileSync(path.join(OUT, "lookup.json"), JSON.stringify(doc));
const kb = (o) => (Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(0);
console.log(`lookup.json — ${order.length} films`);
for (const k of ["person", "genre", "country", "movement", "decade"])
  console.log(`  ${k.padEnd(9)} ${String(Object.keys(doc[k]).length).padStart(6)} names  ${kb(doc[k]).padStart(6)} KB`);
console.log(`  TOTAL ${kb(doc)} KB raw`);
