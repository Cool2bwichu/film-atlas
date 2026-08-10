#!/usr/bin/env node
/**
 * associate-predicates.js — turn shared relational predicates into typed edges.
 *
 * WHY THIS EXISTS
 * The fingerprint places a film in a 5-D temperature space and finds its
 * nearest neighbours by distance. That works for "films that feel similarly
 * cold", and it is measurably the wrong instrument for "films about the same
 * thing happening between two people": run `--contrast` and watch it rank
 * Ex Machina as Banshees' closest film in the corpus.
 *
 * A predicate is a shared OBJECT, so films match by co-occurrence. Two films
 * can sit at opposite ends of the temperature space and still land on the same
 * predicament. That is exactly the edge a viewer calls mind-reading.
 *
 * ORDER OF OPERATIONS, and it matters:
 *   1. the predicate SELECTS the family        (co-occurrence — hard filter)
 *   2. the fingerprint ORDERS it               (tonal distance — sort only)
 * Never let step 2 into the strength score. If tonal proximity contributes to
 * strength, the ranking collapses back onto the fingerprint and you have
 * rebuilt the thing this layer exists to replace.
 *
 * RUN
 *   node pipeline/associate-predicates.js            # emit edges + Banshees map
 *   node pipeline/associate-predicates.js --contrast # add the fingerprint-only ranking
 *   node pipeline/associate-predicates.js --film "Old Joy"
 *   node pipeline/associate-predicates.js --out pipeline/out/predicate-edges.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AXES = ['dread', 'cruelty', 'irony', 'ambiguity', 'fracture'];

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = argv.indexOf(name);
  return i === -1 ? dflt : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
};

const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const vocabFile = read('pipeline/predicates.json');
const tagFile = read('pipeline/predicate-tags.seed.json');
const fingerprints = read('static/fingerprints.json');
const corpus = read('static/corpus.json');

const VOCAB = new Map(vocabFile.predicates.map((p) => [p.id, p]));
const BAND = vocabFile.rules.prevalenceBand;

/* ---------- resolve titles against the real corpus ---------- */

const byTitle = new Map();
for (const [key, film] of Object.entries(corpus.films)) {
  byTitle.set(film.title, { key, ...film });
}
const fpByTitle = new Map();
for (const f of Object.values(fingerprints.films)) fpByTitle.set(f.title, f);

const tonal = (title) => {
  const f = fpByTitle.get(title);
  if (!f || !f.axes) return null;
  const v = AXES.map((a) => (f.axes[a] || {}).score);
  return v.some((x) => x == null) ? null : v;
};
const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

/* ---------- load tags, drop anything not actually in the corpus ---------- */

const tags = new Map();   // title -> [tag]
const missing = [];
for (const [title, list] of Object.entries(tagFile.films)) {
  if (!byTitle.has(title)) { missing.push(title); continue; }
  const clean = list.filter((t) => {
    if (!VOCAB.has(t.predicate)) {
      console.warn(`  ! unknown predicate "${t.predicate}" on ${title} — dropped`);
      return false;
    }
    return true;
  });
  tags.set(title, clean);
}

/* ---------- prevalence, and the honest caveat about it ---------- */

const N = tags.size;
const counts = new Map();
for (const list of tags.values()) {
  for (const t of new Set(list.map((x) => x.predicate))) counts.set(t, (counts.get(t) || 0) + 1);
}

/**
 * Rarity. idf normalised to 0..1 over the tagged population.
 * At cohort scale (N≈9) this is a placeholder: it cannot distinguish a genuinely
 * rare predicament from one that simply hasn't been tagged yet. At corpus scale
 * this should route through associate.js's existing surprise() — a Poisson tail
 * against the overlap the corpus's own frequencies predict — which STATE.md
 * records as the one signal that is genuinely scale-free.
 */
const USE_PRIOR = argv.includes('--prior');
const FLOOR_P = 0.002;

const rarity = (pid) => {
  if (USE_PRIOR) {
    const p = Math.max(FLOOR_P, VOCAB.get(pid).estPrevalence ?? 0.03);
    return Math.min(1, Math.log(1 / p) / Math.log(1 / FLOOR_P));
  }
  const n = counts.get(pid) || 1;
  return Math.min(1, Math.log((N + 1) / n) / Math.log(N + 1));
};

const OUTCOME_KIND = { restored: 'held', transfigured: 'held', unrestored: 'broken', fatal: 'broken', ambiguous: 'open' };

/* ---------- build edges ---------- */

const edges = [];
const titles = [...tags.keys()];

for (let i = 0; i < titles.length; i++) {
  for (let j = i + 1; j < titles.length; j++) {
    const A = titles[i], B = titles[j];
    const shared = [];

    for (const ta of tags.get(A)) {
      for (const tb of tags.get(B)) {
        if (ta.predicate !== tb.predicate) continue;
        const pred = VOCAB.get(ta.predicate);
        const centrality = Math.min(ta.centrality, tb.centrality);

        // Complementary roles (one severing, one severed) are a stronger bond
        // than two films occupying the same seat.
        const roleful = pred.roles.length > 0 && ta.role && tb.role;
        const complementary = roleful && ta.role !== tb.role;
        const roleFactor = complementary ? 1.15 : 1.0;

        // STRENGTH DELIBERATELY EXCLUDES TONAL DISTANCE. See header.
        const strength = Math.min(0.95, rarity(ta.predicate) * centrality * roleFactor);

        const kindA = OUTCOME_KIND[ta.outcome], kindB = OUTCOME_KIND[tb.outcome];
        const type = (kindA !== kindB && kindA !== 'open' && kindB !== 'open') ? 'rebuttal' : 'rhyme';

        shared.push({ pred, ta, tb, strength, type, centrality, complementary });
      }
    }
    if (!shared.length) continue;

    shared.sort((x, y) => y.strength - x.strength);
    const lead = shared[0];
    const va = tonal(A), vb = tonal(B);
    const tonalDistance = va && vb ? +dist(va, vb).toFixed(1) : null;

    const claim = lead.type === 'rebuttal'
      ? `Both turn on ${lower(lead.pred.label)}, and they disagree about it. ${lead.ta.basis} ${lead.tb.basis}`
      : `Both turn on ${lower(lead.pred.label)}. ${lead.ta.basis} ${lead.tb.basis}`;

    edges.push({
      a: byTitle.get(A).key,
      b: byTitle.get(B).key,
      aTitle: A,
      bTitle: B,
      type: lead.type,
      signal: 'predicate',
      predicate: lead.pred.id,
      axis: lead.pred.axis,
      strength: +lead.strength.toFixed(3),
      confidence: 0.55,
      source: 'reading',
      claim,
      shared: shared.length,
      alsoShares: shared.slice(1).map((s) => s.pred.id),
      tonalDistance,
      aId: byTitle.get(A).id || null,
      bId: byTitle.get(B).id || null,
    });
  }
}

function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

/* ---------- report ---------- */

const line = (c = '─') => console.log(c.repeat(78));
const focus = typeof flag('--film') === 'string' ? flag('--film') : 'The Banshees of Inisherin';

console.log('');
line('═');
console.log(`  PREDICATE LAYER — seed cohort of ${N} films, ${edges.length} edges`);
if (missing.length) console.log(`  not in corpus, skipped: ${missing.join(', ')}`);
line('═');

console.log('\nPREVALENCE (band ' + BAND[0] + '–' + BAND[1] + ' at corpus scale; meaningless at N=' + N + ', printed to show the check exists)');
[...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([pid, n]) => {
  console.log(`  ${String(n).padStart(2)}/${N}  ${pid}`);
});

const mine = edges
  .filter((e) => e.aTitle === focus || e.bTitle === focus)
  .sort((a, b) => b.strength - a.strength || (a.tonalDistance ?? 999) - (b.tonalDistance ?? 999));

console.log(`\n\nMAP FOR: ${focus}`);
line();
mine.forEach((e, i) => {
  const other = e.aTitle === focus ? e.bTitle : e.aTitle;
  console.log(`\n ${i + 1}. ${other}`);
  console.log(`    ${e.type.toUpperCase()} · via ${e.predicate} · axis:${e.axis} · strength ${e.strength} · shares ${e.shared}`);
  console.log(`    tonal distance ${e.tonalDistance ?? 'n/a'}  ${e.tonalDistance > 60 ? '← the fingerprint would never have found this' : ''}`);
  console.log(wrap(`    "${e.claim}"`, 76));
});

function wrap(s, w) {
  const words = s.split(' '); const out = []; let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > w) { out.push(cur); cur = '    ' + word; }
    else cur = (cur ? cur + ' ' : '') + word;
  }
  if (cur.trim()) out.push(cur);
  return out.join('\n');
}

if (argv.includes('--contrast')) {
  const base = tonal(focus);
  const all = [];
  for (const f of Object.values(fingerprints.films)) {
    if (f.title === focus) continue;
    const v = tonal(f.title);
    if (v) all.push([dist(base, v), f.title]);
  }
  all.sort((a, b) => a[0] - b[0]);
  console.log(`\n\nCONTRAST — what the fingerprint alone returns for ${focus} (${all.length} scored films)`);
  line();
  all.slice(0, 8).forEach(([d, t], i) => console.log(`  ${String(i + 1).padStart(2)}. ${d.toFixed(1).padStart(5)}  ${t}`));
  console.log('\n  and where the predicate layer\'s answers sit in that same ranking:');
  const rank = new Map(all.map(([, t], i) => [t, i + 1]));
  mine.forEach((e) => {
    const other = e.aTitle === focus ? e.bTitle : e.aTitle;
    const r = rank.get(other);
    console.log(`      ${r ? '#' + String(r).padStart(4) + ' of ' + all.length : '  unscored'}   ${other}`);
  });
}

const out = flag('--out');
if (typeof out === 'string') {
  fs.writeFileSync(path.join(ROOT, out), JSON.stringify({
    version: 1, vocabVersion: vocabFile.vocabVersion, source: 'reading',
    note: 'Predicate edges. Readings, not records. Strength excludes tonal distance by design.',
    generated: new Date().toISOString(), edges,
  }, null, 1));
  console.log(`\n\nwrote ${edges.length} edges -> ${out}`);
}
console.log('');
