#!/usr/bin/env node
/**
 * Pass B, proposal A — turn the hand-clustered phrase table into a predicate vocabulary
 * with MEASURED prevalence.
 *
 * Reads:  pipeline/out/readings-pass-shard{0..3}.json   (Pass A, 300 films, 4 shards)
 *         pipeline/predicate-clusters-propA.tsv          (the editorial clustering)
 * Writes: pipeline/out/predicates-propA.json
 *
 * Nothing here clusters anything. The clustering is the .tsv and it was done by reading
 * the phrases; this file only counts. Two constraints from proposals/predicate-layer.md
 * are load-bearing in what it counts:
 *   - prevalence is a COUNT over the cohort, never `estPrevalence` and never `--prior`;
 *   - a predicate whose films all sit inside ONE reading batch may be an artefact of the
 *     prompt's "reuse the wording" instruction rather than a recurring situation, so the
 *     batch and shard spread of every predicate is reported alongside its prevalence.
 * Batch is reconstructed as floor(position/6) within a shard; verified identical to the
 * `batch` field on the three shards that stamp it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'pipeline/out/predicates-propA.json');
const COHORT_SHARDS = [0, 1, 2, 3].map(i => `pipeline/out/readings-pass-shard${i}.json`);

// The normalisation Pass A's saturation measurements used. Kept identical so the counts
// here are comparable with the reuse numbers already on record.
function n2(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(w => !['a', 'an', 'the'].includes(w)).join(' ');
}
const median = a => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };

// ---- read Pass A -----------------------------------------------------------
const films = [];
const occurrences = [];
COHORT_SHARDS.forEach((rel, shard) => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  j.films.forEach((f, pos) => {
    const batch = `${shard}:${Math.floor(pos / 6)}`;
    if (f.batch !== undefined && f.batch !== Math.floor(pos / 6)) {
      throw new Error(`batch reconstruction disagrees with the stamped batch on ${f.title}`);
    }
    films.push({ title: f.title, year: f.year, shard, batch, scored: (f.predicaments || []).length > 0 });
    (f.predicaments || []).forEach(p => occurrences.push({
      title: f.title, shard, batch, key: n2(p.situation),
      outcome: p.outcome, centrality: p.centrality
    }));
  });
});
const scoring = films.filter(f => f.scored);

// ---- read the editorial clustering ----------------------------------------
const defs = new Map();
const keyToPredicate = new Map();
fs.readFileSync(path.join(ROOT, 'pipeline/predicate-clusters-propA.tsv'), 'utf8')
  .split('\n').filter(l => l.trim() && !l.startsWith('#'))
  .forEach(line => {
    const [id, axis, roles, label, key, surface] = line.split('\t');
    if (!defs.has(id)) defs.set(id, { id, label, roles: roles.split(','), axis, phrases: [] });
    if (keyToPredicate.has(key)) throw new Error(`phrase assigned twice: ${key}`);
    keyToPredicate.set(key, id);
    defs.get(id).phrases.push({ key, surface });
  });

// ---- count -----------------------------------------------------------------
const acc = new Map([...defs.keys()].map(id => [id, {
  films: new Set(), shards: new Set(), batches: new Set(), byBatch: new Map(),
  occ: 0, outcomes: {}, centralities: []
}]));
const unclustered = new Map();
occurrences.forEach(o => {
  const id = keyToPredicate.get(o.key);
  if (!id) {
    if (!unclustered.has(o.key)) unclustered.set(o.key, { phrase: o.key, films: [] });
    unclustered.get(o.key).films.push(o.title);
    return;
  }
  const a = acc.get(id);
  a.films.add(o.title); a.shards.add(o.shard); a.batches.add(o.batch); a.occ++;
  a.byBatch.set(o.batch, (a.byBatch.get(o.batch) || new Set()).add(o.title));
  a.outcomes[o.outcome] = (a.outcomes[o.outcome] || 0) + 1;
  if (typeof o.centrality === 'number') a.centralities.push(o.centrality);
});

// Predicates the clustering was least sure of. This list is EDITORIAL — it is the honest
// record of where the merge was a judgement call, not a computed score. Pass C should
// treat `provisional` predicates as candidates for splitting or deletion, not as settled.
const PROVISIONAL = {
  'used-then-discarded': 'The only predicate over the 8% band, and the widest merge here: institutional disposal ("an institution discards the one who served it") and personal disposal ("someone is wanted only for being useful") were put together. Probably two predicates, or a genre.',
  'betrayed-by-the-closest': 'Merges the intimate betrayal with the planted agent who was never a friend. Those may be different predicaments with different outcomes.',
  'desire-outside-an-intact-bond': 'Merges the affair, the suspicion of an affair, and the wronged spouse\'s answer to it. Arguably three.',
  'partner-displaced-by-newcomer': 'Boundary with the-newcomer-takes-the-place-already-held and the-substitute-lives-the-other-life was drawn by hand and is arbitrary at the edges.',
  'the-newcomer-takes-the-place-already-held': 'See partner-displaced-by-newcomer. Same boundary, drawn the same arbitrary way.',
  'the-substitute-lives-the-other-life': 'See partner-displaced-by-newcomer.',
  'the-one-set-to-protect-does-the-harm': 'May be one predicament with the-protector-hands-the-protected-over rather than two.',
  'the-protector-hands-the-protected-over': 'See the-one-set-to-protect-does-the-harm.',
  'the-verdict-precedes-the-hearing': 'Three predicates sit over one region of the material with this, the-wrong-person-is-blamed and one-cannot-clear-ones-own-name. The cut between them is defensible but not forced by the phrases.',
  'the-wrong-person-is-blamed': 'See the-verdict-precedes-the-hearing.',
  'one-cannot-clear-ones-own-name': 'See the-verdict-precedes-the-hearing.',
  'one-person-acts-through-another': 'Merges the go-between who decides for people with the voiceless person who has to be spoken for. The power runs opposite ways in those two.',
  'intimacy-is-the-price-of-survival': 'Merges the body traded to stay alive with the body traded for advancement. Formally similar, morally not, and a reader may not accept the edge.',
  'old-love-reopened-too-late': 'Overlaps the-place-returned-to-is-gone: both are "returned after the time for it passed".',
  'the-place-returned-to-is-gone': 'See old-love-reopened-too-late.',
  'kin-absent-at-the-moment-of-need': 'This and the-stranger-does-what-kin-will-not are the same situation seen from either side. Kept apart on purpose; that decision is contestable.',
  'the-stranger-does-what-kin-will-not': 'See kin-absent-at-the-moment-of-need.',
  'the-teacher-and-the-one-taught': 'Assembled late from leftovers and heterogeneous inside: handing a craft down, being overtaken, and seeing a gift in someone overlooked.',
  'what-one-holds-the-others-need': 'Assembled late from leftovers. Held together by a shape, not by a situation.',
  'care-given-without-obligation': 'Assembled late from leftovers; three phrases with little in common beyond unpaid care.',
  'certainty-without-proof': 'Heterogeneous: acting on a conviction, misreading what was seen, and learning the truth too late.',
  'the-comfortable-look-away': 'Two phrases. At the floor of the band and may be noise.',
  'deference-owed-to-someone-despised': 'Two phrases. At the floor of the band and may be noise.',
  'held-in-place-with-no-way-forward-or-back': 'Two phrases. At the floor of the band and may be noise.',
  'a-contest-of-nerve-turns-fatal': 'Two phrases. At the floor of the band and may be noise.',
  'child-sold-or-set-to-adult-labour': 'Two phrases. At the floor of the band and may be noise.',
  'a-person-is-taken-away-without-explanation': 'Two phrases, one of them the third-commonest phrase in the whole pass. Thin support for a predicate that should probably be larger.',
  'one-persons-ruin-is-anothers-livelihood': 'Two phrases which are near-paraphrases of each other from two shards. Real, but only two.'
};

const predicates = [...defs.values()].map(d => {
  const a = acc.get(d.id);
  const biggestBatch = Math.max(...[...a.byBatch.values()].map(s => s.size));
  return {
    id: d.id,
    label: d.label,
    roles: d.roles,
    axis: d.axis,
    prevalence: +(a.films.size / scoring.length).toFixed(4), // MEASURED. Denominator = films that scored.
    films: a.films.size,
    occurrences: a.occ,
    distinctPhrases: d.phrases.length,
    shards: a.shards.size,          // of 4 — independent agents, independent processes
    batches: a.batches.size,        // of 52 — independent model calls
    maxBatchShare: +(biggestBatch / a.films.size).toFixed(3),
    outcomes: a.outcomes,
    medianCentrality: median(a.centralities),
    confidence: PROVISIONAL[d.id] ? 'provisional' : 'firm',
    ...(PROVISIONAL[d.id] ? { uncertainty: PROVISIONAL[d.id] } : {}),
    phrases: d.phrases.map(p => p.surface)
  };
}).sort((x, y) => y.films - x.films || x.id.localeCompare(y.id));


// ---- joinability: does clustering actually join films the strings did not? -------------
// Pass A measured that phrase reuse is a property of the reading BATCH: identical strings
// almost never cross a batch, let alone a shard. The only thing that makes Pass B worth
// paying for is whether clustering recovers the co-occurrence those strings could not.
function coOccurrencePairs(keyOf) {
  const groups = new Map();
  occurrences.forEach(o => {
    const k = keyOf(o); if (k === undefined) return;
    if (!groups.has(k)) groups.set(k, new Set());
    groups.get(k).add(o.title);
  });
  const seen = new Set();
  for (const g of groups.values()) {
    const a = [...g];
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) seen.add([a[i], a[j]].sort().join('\u0000'));
  }
  return seen;
}
const batchOf = new Map(films.map(f => [f.title, f.batch]));
const shardOf = new Map(films.map(f => [f.title, f.shard]));
function pairProfile(pairs) {
  let crossBatch = 0, crossShard = 0;
  for (const p of pairs) {
    const [a, b] = p.split('\u0000');
    if (batchOf.get(a) !== batchOf.get(b)) crossBatch++;
    if (shardOf.get(a) !== shardOf.get(b)) crossShard++;
  }
  return {
    pairs: pairs.size,
    crossBatch, crossBatchPct: +(100 * crossBatch / pairs.size).toFixed(1),
    crossShard, crossShardPct: +(100 * crossShard / pairs.size).toFixed(1)
  };
}
const joinability = {
  possiblePairs: scoring.length * (scoring.length - 1) / 2,
  lexical: pairProfile(coOccurrencePairs(o => o.key)),
  clustered: pairProfile(coOccurrencePairs(o => keyToPredicate.get(o.key))),
  note: 'Film pairs that share at least one phrase (lexical) versus at least one predicate ' +
        '(clustered). A pair inside one batch of six is suspect — Pass A showed the prompt\'s ' +
        '"reuse the wording" instruction makes batch-mates agree on strings — so the number ' +
        'that matters is the cross-batch and cross-shard share, not the raw count.'
};


// ---- held-out control ------------------------------------------------------------------
// 51 films were read twice under readings-prompt-2, in different batch company, in separate
// processes. None of the second run's phrases built this vocabulary; they were assigned to it
// afterwards. Pass A measured that the WORDING does not survive re-reading (1.2-4.2% verbatim).
// The only question that matters for Pass B is whether the PREDICATE survives it.
const HOLDOUT = path.join(ROOT, 'pipeline/predicate-holdout-propA.tsv');
let validation = null;
if (fs.existsSync(HOLDOUT)) {
  const held = fs.readFileSync(HOLDOUT, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const [title, situation, predicate] = l.split('\t'); return { title, situation, predicate }; });
  held.forEach(h => { if (h.predicate !== 'NONE' && !defs.has(h.predicate)) throw new Error(`held-out row names an unknown predicate: ${h.predicate}`); });
  const cohortPredicates = new Map(), cohortPhrases = new Map();
  occurrences.forEach(o => {
    if (!cohortPredicates.has(o.title)) { cohortPredicates.set(o.title, new Set()); cohortPhrases.set(o.title, new Set()); }
    const id = keyToPredicate.get(o.key); if (id) cohortPredicates.get(o.title).add(id);
    cohortPhrases.get(o.title).add(o.key);
  });
  const heldPredicates = new Map(), heldPhrases = new Map();
  held.forEach(h => {
    if (!heldPredicates.has(h.title)) { heldPredicates.set(h.title, new Set()); heldPhrases.set(h.title, new Set()); }
    if (h.predicate !== 'NONE') heldPredicates.get(h.title).add(h.predicate);
    heldPhrases.get(h.title).add(n2(h.situation));
  });
  const jaccard = (a, b) => { const u = new Set([...a, ...b]).size; return u ? [...a].filter(x => b.has(x)).length / u : 0; };
  const jP = [], jL = [];
  let agreePred = 0, agreePhrase = 0;
  for (const t of heldPredicates.keys()) {
    const p = jaccard(heldPredicates.get(t), cohortPredicates.get(t) || new Set());
    const l = jaccard(heldPhrases.get(t), cohortPhrases.get(t) || new Set());
    jP.push(p); jL.push(l);
    if (p > 0) agreePred++; if (l > 0) agreePhrase++;
  }
  const landed2 = held.filter(h => h.predicate !== 'NONE');
  const onOwn = landed2.filter(h => (cohortPredicates.get(h.title) || new Set()).has(h.predicate)).length;
  const mean = v => +(100 * v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
  validation = {
    heldOutFilms: heldPredicates.size,
    heldOutPhrases: held.length,
    coverage: {
      landed: landed2.length,
      noneOfThese: held.length - landed2.length,
      noneOfThesePct: +(100 * (held.length - landed2.length) / held.length).toFixed(1),
      note: 'This is the honest coverage figure. The 98.9% in `coverage` above is close to ' +
            'tautological because those phrases built the vocabulary; these did not.'
    },
    replication: {
      phrasesLandingOnAPredicateTheFilmAlreadyCarries: onOwn,
      ofLanded: landed2.length,
      pct: +(100 * onOwn / landed2.length).toFixed(1),
      predicateSetJaccardMeanPct: mean(jP),
      phraseSetJaccardMeanPct: mean(jL),
      filmsAgreeingOnAtLeastOnePredicate: agreePred,
      filmsAgreeingOnAtLeastOneExactPhrase: agreePhrase,
      films: jP.length
    },
    reading: 'Clustering lifts agreement between two independent readings of the same film from ' +
             '1.6% (exact phrase) to 21.8% (predicate set), and from 8 films in 51 to 43 films in 51. ' +
             'That is the result Pass B needed. It is also, in absolute terms, a poor number: two ' +
             'readings of one film agree on roughly a fifth of its predicates, so per-predicate ' +
             'tagging at Pass C will not be stable and any edge resting on a single predicate ' +
             'held by a single reading is weak evidence.',
    limitation: 'The same reader authored the vocabulary and assigned the held-out phrases to it. ' +
                'This measures whether the vocabulary can absorb an independent reading, not ' +
                'whether an independent reader would classify the same way. Only a second ' +
                'annotator, or the Pass C model, can measure that.'
  };
}

const inBand = predicates.filter(p => p.prevalence >= 0.004 && p.prevalence <= 0.08);
const landed = occurrences.length - [...unclustered.values()].reduce((n, u) => n + u.films.length, 0);

const doc = {
  version: 1,
  vocabVersion: 'predicates-propA',
  pass: 'B — canonicalise (proposal A, bottom-up)',
  source: {
    readings: COHORT_SHARDS,
    clustering: 'pipeline/predicate-clusters-propA.tsv',
    promptVersion: 'readings-prompt-2',
    model: 'claude-opus-5'
  },
  about: [
    'A candidate predicate vocabulary clustered bottom-up out of the Pass A readings of a',
    '300-film cohort. Nothing here is merged into corpus.json and nothing here is frozen.',
    'prevalence is MEASURED — films carrying the predicate divided by the 296 films that',
    'returned any predicament. It is not estPrevalence and no --prior was used anywhere.',
    'The denominator is a 300-film cohort, not the corpus: these numbers must be re-measured',
    'after Pass C over all 2,204 before the 0.4-8% band is used to cut anything.',
    'confidence:provisional marks a merge that was a judgement call. Read `uncertainty`.'
  ],
  cohort: {
    filmsAttempted: films.length,
    filmsScoring: scoring.length,
    filmsReturningNothing: films.length - scoring.length,
    returnedNothing: films.filter(f => !f.scored).map(f => f.title),
    predicamentOccurrences: occurrences.length,
    distinctPhrasesN2: new Set(occurrences.map(o => o.key)).size,
    batches: new Set(films.map(f => f.batch)).size
  },
  coverage: {
    phrasesLanded: landed,
    phrasesLandedPct: +(100 * landed / occurrences.length).toFixed(1),
    phrasesNoneOfThese: occurrences.length - landed,
    phrasesNoneOfThesePct: +(100 * (occurrences.length - landed) / occurrences.length).toFixed(1),
    distinctPhrasesClustered: keyToPredicate.size,
    distinctPhrasesNoneOfThese: unclustered.size,
    filmsWithAtLeastOnePredicate: new Set([...acc.values()].flatMap(a => [...a.films])).size,
    note: 'This is Pass B coverage, not Pass C coverage. Every phrase here was generated BY a ' +
          'film in this cohort, so a high landing rate is close to tautological and says nothing ' +
          'about how much of the corpus the vocabulary will cover. The honest "none of these" ' +
          'number is the one Pass C produces when 2,204 films are classified against this frozen list.'
  },
  band: {
    target: [0.004, 0.08],
    inside: inBand.length,
    below: predicates.filter(p => p.prevalence < 0.004).length,
    above: predicates.filter(p => p.prevalence > 0.08).map(p => ({ id: p.id, prevalence: p.prevalence })),
    note: 'Measured against 296 scoring films, so one film is 0.34% and the band floor of 0.4% ' +
          'is reached at two films. At corpus scale the floor is 9 films and most of these ' +
          'predicates will move. Not cut to the band — reported against it.'
  },
  axes: Object.entries(predicates.reduce((a, p) => (a[p.axis] = (a[p.axis] || 0) + 1, a), {}))
    .sort((x, y) => y[1] - x[1]).map(([axis, n]) => ({ axis, predicates: n })),
  joinability,
  validation,
  predicateCount: predicates.length,
  predicates,
  unclustered: [...unclustered.values()].sort((a, b) => b.films.length - a.films.length),
  generated: new Date().toISOString()
};

fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));
console.log(`${predicates.length} predicates -> ${path.relative(ROOT, OUT)}`);
console.log(`joinable pairs: lexical ${joinability.lexical.pairs} (${joinability.lexical.crossShardPct}% cross-shard) -> clustered ${joinability.clustered.pairs} (${joinability.clustered.crossShardPct}% cross-shard)`);
if (validation) console.log(`held-out: ${validation.coverage.noneOfThesePct}% none-of-these, predicate-set agreement ${validation.replication.predicateSetJaccardMeanPct}% vs phrase ${validation.replication.phraseSetJaccardMeanPct}%`);
console.log(`landed ${doc.coverage.phrasesLandedPct}%  none-of-these ${doc.coverage.phrasesNoneOfThesePct}%  in band ${inBand.length}/${predicates.length}`);
