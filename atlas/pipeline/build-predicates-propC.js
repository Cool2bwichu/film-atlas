#!/usr/bin/env node
/* build-predicates-propC.js — Pass B, PROPOSAL C: anchored on what the atlas cannot say.
 *
 *   node pipeline/build-predicates-propC.js --facts     # no model calls, writes the reachability table
 *   node pipeline/build-predicates-propC.js --induce    # model calls, stage 1
 *   node pipeline/build-predicates-propC.js --merge     # model calls, stage 2
 *   node pipeline/build-predicates-propC.js --assign    # model calls, stage 3
 *   node pipeline/build-predicates-propC.js --measure   # no model calls, writes the deliverable
 *
 * WHAT MAKES THIS PROPOSAL C
 *
 * Proposal A clusters the phrases editorially. Proposal B clusters them by relation shape.
 * This one clusters them too — it has to, the phrases are the only material there is — but it
 * builds the clustering BACKWARDS from the failure the layer exists to fix, and it cuts on
 * that failure rather than on how clean a cluster looks.
 *
 * The failure, measured today: crew is 52.5% of the top-six edge slots a reader actually
 * sees and crew+cast is 72.7%; and the five-axis fingerprint puts Ex Machina 2.8 away from
 * The Banshees of Inisherin while burying Old Joy at #1291 of 2,197. So the atlas can say
 * "shares a person with" and it can say "feels the same temperature as", and it cannot say
 * anything else. A predicate earns its place only if it says something those two cannot.
 *
 * That is made operational in two places:
 *
 *  1. INDUCTION IS FED STRANGERS. The phrases are not grouped at random. Each induction group
 *     is a set of films that are pairwise UNREACHABLE in the current atlas — no edge, no
 *     shared crew, no shared cast, no shared TMDB keyword, no common neighbour, and neither
 *     film inside the other's 200 nearest by five-axis distance. Any family the model finds in
 *     such a group is, by construction, a bond the atlas cannot currently express. Groups are
 *     additionally batch-disjoint: no two phrases in a group come from the same Pass A reading
 *     batch, because all four shard agents measured that within-batch phrase agreement is an
 *     artefact of the reading prompt's own "reuse the wording" instruction (cross-batch string
 *     reuse: 0). Clustering a batch together would recover the prompt, not the corpus.
 *
 *  2. THE CUT IS ON REACH, NOT ON TIDINESS. Every candidate predicate is scored against the
 *     real corpus: how many of the film pairs it proposes are unreachable, how many are
 *     already joined, how far apart its films sit tonally. A clean cluster whose films are
 *     already densely joined adds nothing and is cut. This is the brief's instruction and it
 *     is also proposal phase 2's trial contract: a field that does not move the numbers gets
 *     deleted.
 *
 * WHAT THIS DOES NOT DO, AND WHY
 *
 * Tonal distance is a DIAGNOSTIC here and an ORDERING key, never a strength. No number in the
 * deliverable that could ever be read as edge strength contains a distance term; the proposal
 * forbids it in as many words and says why — the moment distance enters strength, the ranking
 * collapses back onto the fingerprint. What distance is used for is deciding which predicates
 * are worth keeping, which is vocabulary selection, one level up from any edge. That is still
 * distance influencing the layer and it is declared, not hidden: `--measure` prints the
 * distance-blind ranking alongside the distance-aware one so the cost is visible.
 *
 * Prevalence is a COUNT over the 300-film cohort. It is NOT the corpus prevalence the
 * proposal's 0.4%-8% band is defined over — that band can only be measured after Pass C runs
 * over all 2,204. Cohort counts are reported as cohort counts and the band is applied as an
 * advisory flag, never as a silent filter.
 *
 * `pipeline/predicate-tags.seed.json` is never read by this file. It is 18 films tagged from
 * model recall and the proposal forbids using it as exemplars or as ground truth.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'pipeline', 'out');
const CACHE = path.join(ROOT, 'pipeline', '.cache-propC');

const MODEL = 'claude-opus-5';
const PROMPT_VERSION = 'propC-reach-1';
const CONCURRENCY = 4;
const CALL_TIMEOUT_MS = 15 * 60 * 1000;

const F_FACTS = path.join(OUT, 'propC-facts.json');
const F_INDUCE = path.join(OUT, 'propC-induce.json');
const F_VOCAB = path.join(OUT, 'propC-vocab.json');
const F_ASSIGN = path.join(OUT, 'propC-assign.json');
const F_OUT = path.join(OUT, 'predicates-propC.json');

const GROUP_FILMS = 12;      // films per induction group; each is an unreachable clique
const HOLDOUT_EVERY = 7;     // 1 group in 7 is withheld from induction as a generalisation control
const ASSIGN_BATCH = 55;
const TONAL_NEAR_RANK = 200; // "the fingerprint could plausibly have surfaced this pair"

const AXES = ['dread', 'cruelty', 'irony', 'ambiguity', 'fracture'];

/* Structural / catalogue keywords, copied verbatim from associate.js's STOP_KEYWORDS so that
   "shares a keyword" here means exactly what it means to the engine that builds the edges. */
const STOP_KEYWORDS = new Set([
  'based on novel or book', 'based on true story', 'based on play or musical',
  'based on short story', 'based on comic', 'based on manga', 'based on video game',
  'woman director', 'independent film', 'duringcreditsstinger', 'aftercreditsstinger',
  'sequel', 'prequel', 'remake', 'cult film', 'biography', 'silent film',
  'black and white', 'live action', 'anime', 'short film', '3d',
]);

const R = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const hash32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const median = (a) => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const pct = (n, d) => d ? +(100 * n / d).toFixed(2) : 0;

/* ------------------------------------------------------------------ the pool */

function loadPool() {
  const plots = R('pipeline/out/plots.json').films;
  const byTitle = new Map();
  for (const [slug, f] of Object.entries(plots)) if (!byTitle.has(f.title)) byTitle.set(f.title, slug);

  const films = [];
  const phrases = [];
  for (let s = 0; s < 4; s++) {
    const j = R(`pipeline/out/readings-pass-shard${s}.json`);
    j.films.forEach((f, pos) => {
      const batch = f.batch !== undefined ? f.batch : f._batch;
      const reconstructed = Math.floor(pos / 6);
      if (batch !== undefined && batch !== reconstructed) {
        throw new Error(`batch field disagrees with position on ${f.title} (shard ${s})`);
      }
      const slug = byTitle.get(f.title);
      if (!slug) throw new Error(`cohort title not in plots.json: ${f.title}`);
      const fi = films.length;
      films.push({
        fi, title: f.title, slug, year: f.year, shard: s, batch: `${s}:${reconstructed}`,
        engineNull: !f.engine, n: (f.predicaments || []).length,
      });
      (f.predicaments || []).forEach((p, k) => phrases.push({
        i: phrases.length, fi, slug, title: f.title, shard: s, batch: `${s}:${reconstructed}`,
        situation: String(p.situation || '').trim(),
        roles: Object.keys(p.roles || {}),
        outcome: p.outcome, centrality: p.centrality,
        basis: p.basis, k,
      }));
    });
  }
  return { films, phrases };
}

/* ------------------------------------------------- what the atlas can already say */

function buildFacts(films) {
  const corpus = R('static/corpus.json');
  const harvest = R('pipeline/out/harvest.json');
  const enrich = R('pipeline/out/enrich.json');
  const FP = R('static/fingerprints.json').films;

  const slugs = films.map((f) => f.slug);

  /* attribute sets, the same three the brief names */
  const attrs = {};
  for (const s of slugs) {
    const h = harvest.films[s] || {};
    const crew = new Set();
    for (const role of Object.keys(h.crew || {})) for (const q of h.crew[role]) crew.add(q);
    const kw = new Set([...new Set(((enrich[s] && enrich[s].keywords) || [])
      .map((x) => String(x).trim().toLowerCase()))]
      .filter((x) => x && x.length > 2 && !STOP_KEYWORDS.has(x)));
    attrs[s] = { crew, cast: new Set(h.cast || []), kw };
  }

  /* the whole-corpus graph, not the cohort subgraph: a common neighbour outside the cohort
     still means the atlas can route between the two films */
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const e of corpus.edges) { add(e.a, e.b); add(e.b, e.a); }
  const nb = (s) => adj.get(s) || new Set();

  /* current top six by strength — the slots a reader actually sees */
  const inc = new Map();
  for (const e of corpus.edges) for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) {
    if (!inc.has(x)) inc.set(x, []);
    inc.get(x).push({ other: y, strength: e.strength, signal: e.signal });
  }
  const topSix = new Map();
  const slotTally = {};
  const allCrewCast = new Set();   // films whose whole visible map is "shares a person with"
  let slots = 0;
  for (const s of slugs) {
    const es = (inc.get(s) || []).slice().sort((p, q) => q.strength - p.strength).slice(0, 6);
    topSix.set(s, new Set(es.map((e) => e.other)));
    for (const e of es) { const k = e.signal || 'unlabelled'; slotTally[k] = (slotTally[k] || 0) + 1; slots++; }
    if (es.length && es.every((e) => e.signal === 'crew' || e.signal === 'cast')) allCrewCast.add(s);
  }

  /* five-axis distance, and each cohort film's rank list over every scored film in the corpus */
  const scored = Object.keys(FP).filter((k) => FP[k].scored);
  const vec = {};
  for (const k of scored) vec[k] = AXES.map((a) => FP[k].axes[a].score);
  const dist = (a, b) => { let t = 0; for (let i = 0; i < 5; i++) { const d = a[i] - b[i]; t += d * d; } return Math.sqrt(t); };
  const rank = new Map();
  for (const s of slugs) {
    if (!vec[s]) { rank.set(s, new Map()); continue; }
    const arr = scored.filter((o) => o !== s).map((o) => [o, dist(vec[s], vec[o])]).sort((p, q) => p[1] - q[1]);
    const m = new Map();
    for (let i = 0; i < arr.length; i++) m.set(arr[i][0], i + 1);
    rank.set(s, m);
  }

  const overlap = (A, B) => { for (const x of A) if (B.has(x)) return true; return false; };

  /* pair table, indexed by cohort position — 44,850 pairs, bitpacked into one flat array */
  const n = slugs.length;
  const flags = new Uint8Array(n * n);
  const tonal = new Float32Array(n * n);
  const F = { EDGE: 1, ATTR: 2, HOP2: 4, TONAL: 8, TOP6: 16, CREW: 32, CAST: 64, KW: 128 };
  const counts = { pairs: 0, edge: 0, attr: 0, crew: 0, cast: 0, kw: 0, hop2: 0, tonalNear: 0, top6: 0, unreachable: 0, noEdge: 0 };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = slugs[i], b = slugs[j];
      let f = 0;
      if (nb(a).has(b)) f |= F.EDGE;
      const c1 = overlap(attrs[a].crew, attrs[b].crew), c2 = overlap(attrs[a].cast, attrs[b].cast), c3 = overlap(attrs[a].kw, attrs[b].kw);
      if (c1) f |= F.CREW;
      if (c2) f |= F.CAST;
      if (c3) f |= F.KW;
      if (c1 || c2 || c3) f |= F.ATTR;
      if (!(f & F.EDGE)) { for (const x of nb(a)) if (nb(b).has(x)) { f |= F.HOP2; break; } }
      const ra = rank.get(a).get(b), rb = rank.get(b).get(a);
      if (ra !== undefined && rb !== undefined && Math.min(ra, rb) <= TONAL_NEAR_RANK) f |= F.TONAL;
      if (topSix.get(a).has(b) || topSix.get(b).has(a)) f |= F.TOP6;
      const d = (vec[a] && vec[b]) ? dist(vec[a], vec[b]) : -1;
      flags[i * n + j] = flags[j * n + i] = f;
      tonal[i * n + j] = tonal[j * n + i] = d;
      counts.pairs++;
      if (f & F.EDGE) counts.edge++; else counts.noEdge++;
      if (f & F.ATTR) counts.attr++;
      if (f & F.CREW) counts.crew++;
      if (f & F.CAST) counts.cast++;
      if (f & F.KW) counts.kw++;
      if (f & F.HOP2) counts.hop2++;
      if (f & F.TONAL) counts.tonalNear++;
      if (f & F.TOP6) counts.top6++;
      if (!(f & (F.EDGE | F.ATTR | F.HOP2 | F.TONAL))) counts.unreachable++;
    }
  }
  return { n, slugs, flags, tonal, F, counts, slotTally, slots, allCrewCast, missingFingerprint: slugs.filter((s) => !vec[s]) };
}

const unreachable = (facts, i, j) => !(facts.flags[i * facts.n + j] & (facts.F.EDGE | facts.F.ATTR | facts.F.HOP2 | facts.F.TONAL));

/* ------------------------------------------------------------------ groups */

/* Grow one group at a time to full size before starting the next. A group is a clique in the
   unreachable relation with no two films from the same Pass A reading batch; at every step the
   candidate admitted is the one that leaves the most partners still admissible, which is the
   standard greedy for covering a graph with cliques and is what keeps the groups full rather
   than leaving a long tail of twos. Both invariants hold exactly for every group produced —
   nothing is relaxed, and the group count is whatever falls out.
   Deterministic: the seed order and every tiebreak are the project's FNV hash of the slug. */
function buildGroups(films, facts) {
  const order = films.map((f) => f.fi).sort((a, b) =>
    (hash32('propC:' + films[a].slug) - hash32('propC:' + films[b].slug)) || (a - b));
  const compat = (x, y) => films[x].batch !== films[y].batch && unreachable(facts, x, y);
  const left = new Set(order);
  const groups = [];
  while (left.size) {
    const seed = order.find((fi) => left.has(fi));
    left.delete(seed);
    const g = [seed];
    let cands = [...left].filter((c) => compat(c, seed));
    while (g.length < GROUP_FILMS && cands.length) {
      let best = null, bestScore = -1;
      for (const c of cands) {
        let s = 0;
        for (const o of cands) if (o !== c && compat(c, o)) s++;
        if (s > bestScore) { bestScore = s; best = c; }
      }
      g.push(best);
      left.delete(best);
      cands = cands.filter((c) => c !== best && compat(c, best));
    }
    groups.push(g);
  }
  return groups;
}

/* ------------------------------------------------------------------ model call */

function call(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', [
      '-p', '--model', MODEL,
      '--disallowed-tools', 'Bash', 'Read', 'Write', 'Edit', 'WebSearch', 'WebFetch', 'Glob', 'Grep', 'Task',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('model call timed out')); }, CALL_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('model exit ' + code + ': ' + err.slice(0, 400)));
      resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseJson(raw) {
  let t = String(raw).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object in model output');
  return JSON.parse(t.slice(a, b + 1));
}

async function cached(tag, prompt, validate) {
  fs.mkdirSync(CACHE, { recursive: true });
  const key = path.join(CACHE, `${PROMPT_VERSION}-${tag}-${crypto.createHash('sha1').update(prompt).digest('hex').slice(0, 16)}.json`);
  if (fs.existsSync(key)) {
    try { const v = JSON.parse(fs.readFileSync(key, 'utf8')); validate(v); return { v, hit: true }; }
    catch (e) { /* fall through and re-call */ }
  }
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const v = parseJson(await call(prompt));
      validate(v);
      fs.writeFileSync(key, JSON.stringify(v, null, 1));
      return { v, hit: false };
    } catch (e) { last = e; process.stdout.write(`    retry ${tag} (${e.message.slice(0, 90)})\n`); }
  }
  throw last;
}

async function pool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (true) {
      const k = next++;
      if (k >= tasks.length) return;
      results[k] = await tasks[k]();
    }
  }));
  return results;
}

/* ------------------------------------------------------------------ prompts */

const WHAT_A_PREDICATE_IS = `WHAT A PREDICATE IS

A named PREDICAMENT: a situation that holds BETWEEN people, at roughly this grain —

  "one party ends the bond and will not give a reason the other can accept"
  "someone is kept alive by a lie they are not allowed to hear"

It is not a genre, not a subject, not a setting, not a mood, not a theme word. Two tests:

  TOO BROAD — if a third of all films would hold it, it is a genre, not a predicament.
    "a person wants something" and "two people fall in love" fail this.
  TOO NARROW — if it can only be held by films with the same plot furniture, it is subject
    matter. "a gunfighter faces a rival at noon" fails this; "a man's standing depends on
    winning a fight he did not choose" does not.

The one that matters: could this be held at once by a silent comedy, a Japanese period film
and a contemporary documentary, and would naming it teach a viewer how to watch all three?`;

function inducePrompt(group, films, phrases) {
  const lines = [];
  group.forEach((fi, k) => {
    lines.push(`FILM ${String.fromCharCode(65 + k)}`);
    for (const p of phrases) {
      if (p.fi !== fi) continue;
      const roles = p.roles.length ? `  [${p.roles.join(' / ')}]` : '';
      lines.push(`  ${p.i}. ${p.situation}${roles}  -> ${p.outcome}`);
    }
  });
  return `You are mining a controlled vocabulary of relational predicaments out of a film reading pass.

WHAT YOU ARE LOOKING AT

An earlier pass read each film's plot section and named 3-6 predicaments — what the film turns
on at the level of what happens between the people in it. Below are those phrases for ${group.length}
films, with the role names the pass gave the two parties and how the situation came out.

The films are anonymous on purpose. They were also chosen on purpose: no two of them share a
crew member, a cast member or a keyword, neither is connected to the other in the existing
graph even at two hops, and neither sits anywhere near the other in the tonal space that
currently drives recommendations. There is no industrial and no tonal reason for any two of
these films to be related. If two of them are holding the same predicament, that predicament
is the only thing there is.

${WHAT_A_PREDICATE_IS}

WHAT TO DO

Name every predicament you can see recurring ACROSS TWO OR MORE OF THESE FILMS. A family that
lives inside one film is not a family — leave those phrases out. Do not invent a family to
cover a phrase, and do not stretch a family to reach one. Most phrases here will belong to
nothing, and that is the expected answer: coverage is meant to be partial and uneven.

For each family give:
  id      kebab-case, 2-5 words, naming the situation and not the subject
  label   one sentence, present tense, naming what happens between the parties
  roles   exactly two role names, the party who acts and the party acted on
  members the phrase numbers that belong to it, from at least two different films

Never use a proper noun. Never name a genre, a country, a period or a film.

Reply with a single JSON object, no prose, no markdown fence:

{"families":[{"id":"...","label":"...","roles":["...","..."],"members":[12,44]}]}

THE PHRASES

${lines.join('\n')}`;
}

function mergePrompt(items, roundName) {
  const lines = items.map((f) => `  ${f.tmp}. ${f.id} — ${f.label}  [${(f.roles || []).join(' / ')}]  (${f.filmCount} films)`);
  return `You are consolidating a mined vocabulary of relational predicaments.

Several independent passes each read a different set of films and named the predicaments they
saw. They never saw each other's output, so the same predicament has been named many times
under different ids and different wordings. Your job is to fold those into ONE vocabulary.

${WHAT_A_PREDICATE_IS}

WHAT TO DO

Group the entries below by the SITUATION they name, not by the words they use. Two entries
belong together when the same thing is happening between the parties, whatever the wording,
whatever the roles are called and whatever the outcome was. Two entries stay apart when the
relation is genuinely different — "a bond is ended without a reason" and "a bond is ended
because one party has done something unforgivable" are two predicaments, not one.

Do NOT merge on outcome. A predicament that comes out restored in one film and fatal in
another is one predicate held twice, and keeping it as one is what lets the two films argue.

Do NOT merge everything into a handful of large families. A family that would end up holding a
third of all films is a genre and has failed. When in doubt, keep them apart.

An entry that names nothing recurring can be dropped: put its number in "dropped".

For each consolidated predicate give: id (kebab-case, 2-5 words), label (one sentence),
roles (exactly two), and from (the entry numbers folded into it).

Reply with a single JSON object, no prose, no markdown fence:

{"predicates":[{"id":"...","label":"...","roles":["...","..."],"from":[3,17]}],"dropped":[9]}

THE ENTRIES (${roundName})

${lines.join('\n')}`;
}

function assignPrompt(vocab, batch) {
  const v = vocab.map((p) => `  ${p.id} — ${p.label}  [${p.roles.join(' / ')}]`).join('\n');
  const ph = batch.map((p) => `  ${p.i}. ${p.situation}${p.roles.length ? `  [${p.roles.join(' / ')}]` : ''}  -> ${p.outcome}`).join('\n');
  return `You are tagging film readings against a FROZEN vocabulary of relational predicaments.

Each phrase below was written by a pass that read one film's plot section and named a
predicament it turns on. Assign each phrase to the ONE predicate in the vocabulary that names
the same situation, or to null.

"none of these" IS A FIRST-CLASS ANSWER and is expected to be common. Assign null whenever the
phrase names something the vocabulary does not have. Do not reach for the nearest-sounding
entry, do not assign on a shared word, and do not assign because a phrase has to go somewhere.
A wrong tag is worse than no tag: it manufactures a connection between two films that is not
there.

Match on the SITUATION, not the wording and not the outcome. The same predicament assigned in
two films that came out differently is correct and is the point.

THE VOCABULARY

${v}

Reply with a single JSON object, no prose, no markdown fence. One entry per phrase, in order,
"p" being a vocabulary id or null:

{"assignments":[{"i":12,"p":"bond-severed-without-reason"},{"i":13,"p":null}]}

THE PHRASES

${ph}`;
}

/* ------------------------------------------------------------------ stages */

function stageFacts() {
  const { films, phrases } = loadPool();
  const facts = buildFacts(films);
  const groups = buildGroups(films, facts);
  const c = facts.counts;
  const out = {
    version: 1, promptVersion: PROMPT_VERSION, stage: 'facts', generated: new Date().toISOString(),
    note: 'What the current atlas can already say about every pair of cohort films. No model calls. Nothing here is an edge.',
    cohort: { films: films.length, phrases: phrases.length, filmsWithNoPredicaments: films.filter((f) => !f.n).length },
    definitions: {
      edge: 'a connection between the two films exists in static/corpus.json',
      attr: 'the two films share a crew member, a cast member or a non-catalogue TMDB keyword',
      hop2: 'the two films have a common neighbour in the corpus graph',
      tonalNear: `either film is inside the other's ${TONAL_NEAR_RANK} nearest of 1,541 scored films by five-axis Euclidean distance`,
      unreachable: 'none of the four above — the atlas has no route to this pair and no reason to propose one',
    },
    pairs: {
      total: c.pairs,
      edge: c.edge, edgePct: pct(c.edge, c.pairs),
      noEdge: c.noEdge, noEdgePct: pct(c.noEdge, c.pairs),
      sharedCrew: c.crew, sharedCast: c.cast, sharedKeyword: c.kw,
      anyAttr: c.attr, anyAttrPct: pct(c.attr, c.pairs),
      hop2: c.hop2, hop2Pct: pct(c.hop2, c.pairs),
      tonalNear: c.tonalNear, tonalNearPct: pct(c.tonalNear, c.pairs),
      inEachOthersTopSix: c.top6,
      unreachable: c.unreachable, unreachablePct: pct(c.unreachable, c.pairs),
    },
    topSixToday: {
      slots: facts.slots,
      share: Object.fromEntries(Object.entries(facts.slotTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v, facts.slots)])),
      note: 'the 300 cohort films own top-six slots, by signal. The corpus-wide baseline this trial is judged against is crew 52.5%, crew+cast 72.7%.',
    },
    inductionGroups: {
      count: groups.length,
      sizes: groups.map((g) => g.length),
      invariant: 'every group is a clique in the unreachable relation and no two films in a group came from the same Pass A reading batch. Nothing is relaxed.',
      groups: groups.map((g, gi) => ({
        g: gi, heldOut: gi % HOLDOUT_EVERY === HOLDOUT_EVERY - 1,
        films: g.map((fi) => ({ fi, title: films[fi].title, batch: films[fi].batch })),
      })),
    },
    missingFingerprint: facts.missingFingerprint,
  };
  fs.writeFileSync(F_FACTS, JSON.stringify(out, null, 1));
  console.log(`  cohort ${films.length} films, ${phrases.length} phrases`);
  console.log(`  pairs ${c.pairs}: edge ${c.edge} (${pct(c.edge, c.pairs)}%), shared attr ${c.attr} (${pct(c.attr, c.pairs)}%), hop2 ${c.hop2} (${pct(c.hop2, c.pairs)}%), tonally near ${c.tonalNear} (${pct(c.tonalNear, c.pairs)}%)`);
  console.log(`  UNREACHABLE ${c.unreachable} (${pct(c.unreachable, c.pairs)}%) <- the chance baseline every predicate is scored against`);
  console.log(`  ${groups.length} induction groups, sizes ${groups.filter((g) => g.length === GROUP_FILMS).length} full`);
  console.log(`  wrote ${path.relative(ROOT, F_FACTS)}`);
}

async function stageInduce() {
  const { films, phrases } = loadPool();
  const facts = buildFacts(films);
  const groups = buildGroups(films, facts);
  /* a group of one or two films cannot produce a family that spans two films and is not worth
     a call; its phrases are still assigned in stage 3 like everything else */
  const live = groups.map((g, gi) => ({ g, gi, heldOut: gi % HOLDOUT_EVERY === HOLDOUT_EVERY - 1 }))
    .filter((x) => !x.heldOut && x.g.length >= 3);
  console.log(`  ${groups.length} groups, ${live.length} induced, ${groups.length - live.length} held out or too small`);
  if (process.argv.includes('--dry')) {
    const p = inducePrompt(live[0].g, films, phrases);
    console.log(`\n----- group ${live[0].gi}, ${p.length} chars -----\n${p}\n----- end -----`);
    return;
  }

  const byI = new Map(phrases.map((p) => [p.i, p]));
  let done = 0, hits = 0;
  const res = await pool(live.map(({ g, gi }) => async () => {
    const prompt = inducePrompt(g, films, phrases);
    const { v, hit } = await cached(`induce-${gi}`, prompt, (o) => {
      if (!Array.isArray(o.families)) throw new Error('no families array');
      for (const f of o.families) {
        if (!f.id || !f.label || !Array.isArray(f.members)) throw new Error('malformed family');
      }
    });
    if (hit) hits++;
    process.stdout.write(`    group ${gi} -> ${v.families.length} families${hit ? ' (cached)' : ''}  [${++done}/${live.length}]\n`);
    return { gi, families: v.families };
  }), CONCURRENCY);

  /* keep only members that exist and belong to this group's films, and only families that
     still span two or more films after that filtering */
  const groupFilms = new Map(groups.map((g, gi) => [gi, new Set(g)]));
  const families = [];
  let droppedSingleFilm = 0, droppedBadMember = 0;
  for (const { gi, families: fs_ } of res) {
    for (const f of fs_) {
      const members = [];
      for (const m of f.members) {
        const p = byI.get(Number(m));
        if (!p || !groupFilms.get(gi).has(p.fi)) { droppedBadMember++; continue; }
        members.push(p.i);
      }
      const filmSet = new Set(members.map((i) => byI.get(i).fi));
      if (filmSet.size < 2) { droppedSingleFilm++; continue; }
      families.push({
        localId: `g${gi}-${f.id}`, group: gi, id: String(f.id), label: String(f.label),
        roles: Array.isArray(f.roles) ? f.roles.slice(0, 2).map(String) : [],
        members, filmCount: filmSet.size,
      });
    }
  }
  const out = {
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL, stage: 'induce',
    generated: new Date().toISOString(),
    groups: groups.length, induced: live.length, heldOutGroups: groups.length - live.length,
    heldOutFilms: groups.filter((g, gi) => gi % HOLDOUT_EVERY === HOLDOUT_EVERY - 1).flat().map((fi) => films[fi].title),
    cacheHits: hits, poolSize: phrases.length,
    droppedSingleFilm, droppedBadMember,
    localFamilies: families.length, families,
  };
  fs.writeFileSync(F_INDUCE, JSON.stringify(out, null, 1));
  console.log(`  ${families.length} local families (dropped ${droppedSingleFilm} single-film, ${droppedBadMember} bad members)`);
  console.log(`  wrote ${path.relative(ROOT, F_INDUCE)}`);
}

async function stageMerge() {
  const ind = JSON.parse(fs.readFileSync(F_INDUCE, 'utf8'));
  const fams = ind.families;

  /* round 1: chunk the local families and consolidate each chunk. Chunks are interleaved by
     group so no chunk is a run of adjacent induction groups. */
  const CHUNKS = Math.max(2, Math.ceil(fams.length / 60));
  const chunks = Array.from({ length: CHUNKS }, () => []);
  fams.forEach((f, k) => chunks[k % CHUNKS].push(f));
  console.log(`  round 1: ${fams.length} local families -> ${CHUNKS} chunks`);

  const r1 = await pool(chunks.map((chunk, ci) => async () => {
    const items = chunk.map((f, k) => ({ ...f, tmp: k + 1 }));
    const prompt = mergePrompt(items, `chunk ${ci + 1} of ${CHUNKS}`);
    const { v, hit } = await cached(`merge1-${ci}`, prompt, (o) => {
      if (!Array.isArray(o.predicates)) throw new Error('no predicates array');
      for (const p of o.predicates) if (!p.id || !p.label || !Array.isArray(p.from)) throw new Error('malformed predicate');
    });
    process.stdout.write(`    chunk ${ci} -> ${v.predicates.length}${hit ? ' (cached)' : ''}\n`);
    return v.predicates.map((p) => ({
      id: `c${ci}-${p.id}`, label: String(p.label),
      roles: Array.isArray(p.roles) ? p.roles.slice(0, 2).map(String) : [],
      locals: p.from.map((t) => items[Number(t) - 1]).filter(Boolean).map((f) => f.localId),
    })).filter((p) => p.locals.length);
  }), CONCURRENCY);

  const mid = r1.flat();
  const localOf = new Map(fams.map((f) => [f.localId, f]));
  for (const p of mid) p.filmCount = new Set(p.locals.flatMap((l) => (localOf.get(l) || { members: [] }).members)).size;
  console.log(`  round 1 produced ${mid.length} consolidated families`);

  /* round 2: one call over everything round 1 produced, so cross-chunk duplicates fold */
  const items = mid.map((f, k) => ({ ...f, tmp: k + 1, filmCount: f.filmCount }));
  const prompt = mergePrompt(items, 'final consolidation');
  const { v } = await cached('merge2', prompt, (o) => {
    if (!Array.isArray(o.predicates)) throw new Error('no predicates array');
    for (const p of o.predicates) if (!p.id || !p.label || !Array.isArray(p.from)) throw new Error('malformed predicate');
  });

  const seen = new Set();
  const vocab = [];
  for (const p of v.predicates) {
    let id = String(p.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) continue;
    while (seen.has(id)) id += '-2';
    seen.add(id);
    const locals = [...new Set(p.from.map((t) => items[Number(t) - 1]).filter(Boolean).flatMap((f) => f.locals))];
    if (!locals.length) continue;
    vocab.push({
      id, label: String(p.label),
      roles: Array.isArray(p.roles) ? p.roles.slice(0, 2).map(String) : [],
      inducedFrom: locals,
      inducedFilmCount: new Set(locals.flatMap((l) => (localOf.get(l) || { members: [] }).members.map((i) => i))).size,
    });
  }
  const out = {
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL, stage: 'merge',
    generated: new Date().toISOString(),
    localFamilies: fams.length, round1: mid.length, predicates: vocab.length, vocab,
  };
  fs.writeFileSync(F_VOCAB, JSON.stringify(out, null, 1));
  console.log(`  FINAL VOCABULARY: ${vocab.length} predicates`);
  console.log(`  wrote ${path.relative(ROOT, F_VOCAB)}`);
}

async function stageAssign() {
  const { phrases } = loadPool();
  const vocab = JSON.parse(fs.readFileSync(F_VOCAB, 'utf8')).vocab;
  const ids = new Set(vocab.map((p) => p.id));

  /* shuffled deterministically so an assignment batch is not a Pass A reading batch */
  const order = phrases.slice().sort((a, b) =>
    (hash32('propC-assign:' + a.slug + ':' + a.k) - hash32('propC-assign:' + b.slug + ':' + b.k)) || (a.i - b.i));
  const batches = [];
  for (let k = 0; k < order.length; k += ASSIGN_BATCH) batches.push(order.slice(k, k + ASSIGN_BATCH));
  console.log(`  ${phrases.length} phrases, ${vocab.length} predicates, ${batches.length} batches of ${ASSIGN_BATCH}`);

  let done = 0;
  const res = await pool(batches.map((batch, bi) => async () => {
    const prompt = assignPrompt(vocab, batch);
    const want = new Set(batch.map((p) => p.i));
    const { v, hit } = await cached(`assign-${bi}`, prompt, (o) => {
      if (!Array.isArray(o.assignments)) throw new Error('no assignments array');
      const got = new Set(o.assignments.map((a) => Number(a.i)));
      const missing = [...want].filter((i) => !got.has(i));
      if (missing.length > 3) throw new Error(`${missing.length} phrases unassigned`);
    });
    process.stdout.write(`    batch ${bi}${hit ? ' (cached)' : ''}  [${++done}/${batches.length}]\n`);
    return v.assignments.filter((a) => want.has(Number(a.i)));
  }), CONCURRENCY);

  const tag = new Map();
  let invented = 0;
  for (const a of res.flat()) {
    const i = Number(a.i);
    const p = a.p === null || a.p === undefined ? null : String(a.p);
    if (p !== null && !ids.has(p)) { invented++; continue; }
    tag.set(i, p);
  }
  const missing = phrases.filter((p) => !tag.has(p.i)).length;
  const assigned = [...tag.values()].filter((x) => x !== null).length;
  const out = {
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL, stage: 'assign',
    generated: new Date().toISOString(),
    phrases: phrases.length, batches: batches.length,
    assigned, none: tag.size - assigned, missing, inventedIdsDropped: invented,
    tags: [...tag.entries()].map(([i, p]) => ({ i, p })),
  };
  fs.writeFileSync(F_ASSIGN, JSON.stringify(out, null, 1));
  console.log(`  assigned ${assigned}/${phrases.length} (${pct(assigned, phrases.length)}%), "none of these" ${tag.size - assigned}, unreturned ${missing}, invented ids dropped ${invented}`);
  console.log(`  wrote ${path.relative(ROOT, F_ASSIGN)}`);
}

function stageMeasure() {
  const { films, phrases } = loadPool();
  const facts = buildFacts(films);
  const groups = buildGroups(films, facts);
  const heldOut = new Set(groups.filter((g, gi) => gi % HOLDOUT_EVERY === HOLDOUT_EVERY - 1).flat());
  const vocabFile = JSON.parse(fs.readFileSync(F_VOCAB, 'utf8'));
  const assignFile = JSON.parse(fs.readFileSync(F_ASSIGN, 'utf8'));
  const byI = new Map(phrases.map((p) => [p.i, p]));
  const profile = R('pipeline/out/predicate-cohort-300.profile.json');
  const profByTitle = new Map(profile.films.map((f) => [f.title, f]));

  const tags = new Map(assignFile.tags.map((t) => [t.i, t.p]));
  const members = new Map();     // predicate id -> [phrase]
  for (const [i, p] of tags) {
    if (p === null) continue;
    if (!members.has(p)) members.set(p, []);
    members.get(p).push(byI.get(i));
  }

  const N = facts.n;
  const B = facts.counts.unreachable / facts.counts.pairs;   // the chance baseline

  const preds = [];
  for (const v of vocabFile.vocab) {
    const ms = members.get(v.id) || [];
    const filmIdx = [...new Set(ms.map((p) => p.fi))];
    if (filmIdx.length < 2) {
      preds.push({ ...v, films: filmIdx.length, occurrences: ms.length, verdict: 'cut', cutReason: filmIdx.length ? 'one cohort film only' : 'no cohort film' });
      continue;
    }
    let pairs = 0, unr = 0, edge = 0, attr = 0, hop2 = 0, tonalNear = 0, top6 = 0;
    const ds = [];
    for (let a = 0; a < filmIdx.length; a++) for (let b = a + 1; b < filmIdx.length; b++) {
      const i = filmIdx[a], j = filmIdx[b];
      const f = facts.flags[i * N + j];
      pairs++;
      if (f & facts.F.EDGE) edge++;
      if (f & facts.F.ATTR) attr++;
      if (f & facts.F.HOP2) hop2++;
      if (f & facts.F.TONAL) tonalNear++;
      if (f & facts.F.TOP6) top6++;
      if (!(f & (facts.F.EDGE | facts.F.ATTR | facts.F.HOP2 | facts.F.TONAL))) unr++;
      const d = facts.tonal[i * N + j];
      if (d >= 0) ds.push(d);
    }
    const batches = new Set(filmIdx.map((fi) => films[fi].batch));
    const shards = new Set(filmIdx.map((fi) => films[fi].shard));
    const regions = new Set(filmIdx.map((fi) => (profByTitle.get(films[fi].title) || {}).tradition).filter(Boolean));
    const years = filmIdx.map((fi) => films[fi].year).filter(Boolean);
    const outcomes = {};
    for (const p of ms) outcomes[p.outcome] = (outcomes[p.outcome] || 0) + 1;

    const cohortShare = pct(filmIdx.length, films.length);
    const flags = [];
    if (batches.size === 1) flags.push('single-reading-batch');
    if (shards.size === 1) flags.push('single-shard');
    if (cohortShare > 8) flags.push('above-prevalence-band');
    if (cohortShare < 0.4) flags.push('below-prevalence-band');
    if (unr === 0) flags.push('joins-nothing-new');

    let verdict = 'keep', cutReason = null;
    if (batches.size === 1) { verdict = 'cut'; cutReason = 'every film came from one Pass A reading batch — the agreement may be the prompt, not the corpus'; }
    else if (unr === 0) { verdict = 'cut'; cutReason = 'every pair it proposes is already reachable — it adds nothing the atlas cannot already say'; }
    else if (cohortShare > 8) { verdict = 'cut'; cutReason = `held by ${cohortShare}% of the cohort — a genre, not a predicament (proposal band 0.4-8%)`; }

    preds.push({
      id: v.id, label: v.label, roles: v.roles,
      films: filmIdx.length, occurrences: ms.length,
      cohortPrevalencePct: cohortShare,
      reach: {
        pairs, unreachable: unr, unreachablePct: pct(unr, pairs),
        alreadyReachablePct: pct(pairs - unr, pairs),
        liftOverChance: +(pct(unr, pairs) / (100 * B)).toFixed(3),
        alreadyEdged: edge, sharesAttribute: attr, commonNeighbour: hop2, tonallyNear: tonalNear, inTopSix: top6,
        pairsWithNoEdge: pairs - edge,
      },
      tonal: { meanDistance: ds.length ? +(ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(1) : null, medianDistance: ds.length ? +median(ds).toFixed(1) : null, maxDistance: ds.length ? +Math.max(...ds).toFixed(1) : null },
      spread: {
        readingBatches: batches.size, shards: shards.size, traditions: [...regions].sort(),
        yearSpan: years.length ? Math.max(...years) - Math.min(...years) : null,
        heldOutFilms: filmIdx.filter((fi) => heldOut.has(fi)).length,
      },
      outcomes, flags, verdict, cutReason,
      memberFilms: filmIdx.map((fi) => {
        const p = ms.find((x) => x.fi === fi);
        return { title: films[fi].title, year: films[fi].year, situation: p.situation, outcome: p.outcome, centrality: p.centrality, batch: films[fi].batch };
      }).sort((a, b) => a.year - b.year),
    });
  }

  const kept = preds.filter((p) => p.verdict === 'keep');
  /* the ordering the brief asks for: most strangers joined first. Distance is a tiebreak
     only, and the distance-blind order is recorded alongside so the cost of using it is
     visible rather than buried. */
  const rank = (arr, cmp) => arr.slice().sort(cmp).map((p) => p.id);
  const orderReach = rank(kept, (a, b) => b.reach.unreachable - a.reach.unreachable || (b.tonal.meanDistance || 0) - (a.tonal.meanDistance || 0) || a.id.localeCompare(b.id));
  const orderBlind = rank(kept, (a, b) => b.reach.unreachable - a.reach.unreachable || b.films - a.films || a.id.localeCompare(b.id));
  let moved = 0;
  orderReach.forEach((id, k) => { if (orderBlind[k] !== id) moved++; });
  kept.sort((a, b) => orderReach.indexOf(a.id) - orderReach.indexOf(b.id));

  /* PERMUTATION CONTROL — the test this proposal can fail.
   *
   * Every kept predicate joins films with no edge, because 99% of cohort pairs have no edge.
   * That number therefore says nothing on its own. The question that does discriminate is
   * whether the predicates concentrate unreachable pairs ABOVE what film sets of the same
   * sizes drawn at random would. And the second question, which the proposal's order-of-
   * operations rule turns on: are a predicate's films tonally CLOSER than chance? If they
   * are, the layer is partly re-deriving the fingerprint and the co-occurrence filter is not
   * independent of the thing it is supposed to replace.
   *
   * Sizes are held fixed and only the membership is resampled, so the control isolates the
   * clustering and not the size distribution. Deterministic: a fixed 32-bit LCG seed. */
  const titleToIdx = new Map(films.map((f) => [f.title, f.fi]));
  function permutationControl(K) {
    const sizes = kept.map((p) => p.films);
    const obsPairs = [], obsUnr = [];
    for (const p of kept) { obsPairs.push(p.reach.pairs); obsUnr.push(p.reach.unreachable); }
    const observedUnrPct = pct(obsUnr.reduce((a, b) => a + b, 0), obsPairs.reduce((a, b) => a + b, 0));
    let obsDistSum = 0, obsDistN = 0;
    for (const p of kept) {
      const idx = p.memberFilms.map((m) => titleToIdx.get(m.title));
      for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
        const d = facts.tonal[idx[a] * N + idx[b]];
        if (d >= 0) { obsDistSum += d; obsDistN++; }
      }
    }
    const observedDist = obsDistN ? obsDistSum / obsDistN : null;

    /* The `unreachable` definition folds in a tonal clause, so if a predicate's films turn out
       to be tonally tighter than chance it will score below chance on unreachability for that
       reason alone. Decompose it: STRUCTURAL unreachability drops the tonal clause and asks
       only whether the atlas has an industrial or graph route to the pair. */
    let obsStruct = 0, obsStructTot = 0;
    for (const p of kept) {
      const idx = p.memberFilms.map((m) => titleToIdx.get(m.title));
      for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
        obsStructTot++;
        if (!(facts.flags[idx[a] * N + idx[b]] & (facts.F.EDGE | facts.F.ATTR | facts.F.HOP2))) obsStruct++;
      }
    }
    const observedStructPct = pct(obsStruct, obsStructTot);

    let seed = 20260810;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const all = films.map((f) => f.fi);
    const unrRuns = [], distRuns = [], structRuns = [];
    for (let k = 0; k < K; k++) {
      let u = 0, st = 0, tot = 0, ds = 0, dn = 0;
      for (const size of sizes) {
        const pool_ = all.slice();
        for (let t = 0; t < size; t++) { const r = t + Math.floor(rnd() * (pool_.length - t)); const tmp = pool_[t]; pool_[t] = pool_[r]; pool_[r] = tmp; }
        const pick = pool_.slice(0, size);
        for (let a = 0; a < size; a++) for (let b = a + 1; b < size; b++) {
          const i = pick[a], j = pick[b], f = facts.flags[i * N + j];
          tot++;
          if (!(f & (facts.F.EDGE | facts.F.ATTR | facts.F.HOP2 | facts.F.TONAL))) u++;
          if (!(f & (facts.F.EDGE | facts.F.ATTR | facts.F.HOP2))) st++;
          const d = facts.tonal[i * N + j];
          if (d >= 0) { ds += d; dn++; }
        }
      }
      unrRuns.push(100 * u / tot);
      structRuns.push(100 * st / tot);
      distRuns.push(dn ? ds / dn : 0);
    }
    const stat = (a) => { const s = a.slice().sort((x, y) => x - y); const m = a.reduce((p, q) => p + q, 0) / a.length; return { mean: +m.toFixed(2), p5: +s[Math.floor(a.length * 0.05)].toFixed(2), p95: +s[Math.floor(a.length * 0.95)].toFixed(2) }; };
    const su = stat(unrRuns), sd = stat(distRuns), ss = stat(structRuns);
    const call_ = (obs, s) => obs > s.p95 ? 'above chance' : obs < s.p5 ? 'BELOW chance' : 'indistinguishable from chance';
    return {
      permutations: K,
      note: 'film-set sizes held fixed, membership resampled uniformly from the 300-film cohort',
      unreachableShareOfProposedPairs: { observed: observedUnrPct, random: su, verdict: call_(observedUnrPct, su) },
      structurallyUnreachableShare: {
        note: 'the same test with the tonal clause dropped — no edge, no shared crew/cast/keyword, no common neighbour. This is the industrial question on its own.',
        observed: observedStructPct, random: ss, verdict: call_(observedStructPct, ss),
      },
      meanTonalDistanceWithinPredicates: { observed: observedDist === null ? null : +observedDist.toFixed(1), random: sd, verdict: observedDist === null ? null : observedDist < sd.p5 ? 'tonally TIGHTER than chance — the layer is partly re-deriving the fingerprint' : observedDist > sd.p95 ? 'tonally wider than chance' : 'indistinguishable from chance — co-occurrence is independent of tonal distance, which is what the proposal requires' },
    };
  }
  const control = permutationControl(500);

  const heldOutPhrases = phrases.filter((p) => heldOut.has(p.fi));
  const inducedPhrases = phrases.filter((p) => !heldOut.has(p.fi));
  const noneRate = (list) => {
    const t = list.filter((p) => tags.has(p.i));
    return { phrases: t.length, none: t.filter((p) => tags.get(p.i) === null).length, nonePct: pct(t.filter((p) => tags.get(p.i) === null).length, t.length) };
  };

  const keptFilms = new Set(kept.flatMap((p) => p.memberFilms.map((m) => m.title)));
  const joinsNoEdge = kept.filter((p) => p.reach.pairsWithNoEdge > 0).length;
  const joinsUnreachable = kept.filter((p) => p.reach.unreachable > 0).length;
  const joinsStrangersHard = kept.filter((p) => p.reach.unreachable >= 3).length;

  /* What the layer could reach in a reader's map, stated as a precondition and not as a
     result. A film with no predicate partner cannot have its top six changed by this layer at
     any strength, so this is the ceiling on the trial contract's crew% number and it is a
     count, not a projection. Nothing here scores or ranks anything. */
  const partners = new Map(films.map((f) => [f.fi, new Set()]));
  const newPartners = new Map(films.map((f) => [f.fi, new Set()]));
  for (const p of kept) {
    const idx = p.memberFilms.map((m) => titleToIdx.get(m.title));
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
      const i = idx[a], j = idx[b];
      partners.get(i).add(j); partners.get(j).add(i);
      if (!(facts.flags[i * N + j] & facts.F.EDGE)) { newPartners.get(i).add(j); newPartners.get(j).add(i); }
    }
  }
  const partnerCounts = films.map((f) => newPartners.get(f.fi).size);
  const crewCastOnly = films.filter((f) => facts.allCrewCast.has(f.slug));
  const mapImpact = {
    note: 'a precondition, not a result. A cohort film with no predicate partner cannot have its top six changed by this layer at any strength. Nothing is merged and no edge is scored.',
    cohortFilms: films.length,
    filmsWithAtLeastOnePartner: partnerCounts.filter((c) => c >= 1).length,
    filmsWithAtLeastThreePartners: partnerCounts.filter((c) => c >= 3).length,
    filmsWithNoPartner: partnerCounts.filter((c) => c === 0).length,
    medianNewPartnersPerFilm: median(partnerCounts),
    maxNewPartnersOnOneFilm: Math.max(...partnerCounts),
    filmsWhoseTopSixIsEntirelyCrewOrCast: crewCastOnly.length,
    ofThoseThatGainAPartner: crewCastOnly.filter((f) => newPartners.get(f.fi).size >= 1).length,
  };

  const out = {
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL, proposal: 'C',
    generated: new Date().toISOString(),
    what: 'A predicate vocabulary mined from Pass A and cut on whether it joins films the current atlas cannot join at all. Nothing here is merged into corpus.json and nothing here is an edge.',
    boundaries: [
      'corpus.json untouched — the proposal says merge only after full-corpus tagging',
      'predicate-tags.seed.json never read, never used as an exemplar, never scored against',
      'estPrevalence and --prior never used; every prevalence here is a count over the 300-film cohort',
      'tonal distance is a diagnostic and a tiebreak, never a strength term',
      'relatives were not read and no edge is proposed from them',
    ],
    baselines: {
      note: 'measured today over the 44,850 pairs the 300-film cohort makes, from static/corpus.json, pipeline/out/harvest.json, pipeline/out/enrich.json and static/fingerprints.json',
      pairs: facts.counts.pairs,
      pairsWithAnEdge: facts.counts.edge, pairsWithAnEdgePct: pct(facts.counts.edge, facts.counts.pairs),
      pairsSharingCrewCastOrKeyword: facts.counts.attr, pct: pct(facts.counts.attr, facts.counts.pairs),
      pairsWithCommonNeighbour: facts.counts.hop2,
      pairsTonallyNear: facts.counts.tonalNear,
      unreachablePairs: facts.counts.unreachable, unreachablePct: pct(facts.counts.unreachable, facts.counts.pairs),
      cohortTopSixShare: Object.fromEntries(Object.entries(facts.slotTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v, facts.slots)])),
    },
    pipeline: {
      inductionGroups: groups.length,
      inducedGroups: groups.filter((g, gi) => gi % HOLDOUT_EVERY !== HOLDOUT_EVERY - 1 && g.length >= 3).length,
      heldOutGroups: groups.filter((g, gi) => gi % HOLDOUT_EVERY === HOLDOUT_EVERY - 1).length,
      localFamilies: vocabFile.localFamilies, afterRound1: vocabFile.round1, vocabulary: vocabFile.predicates,
      phrases: phrases.length,
      assigned: assignFile.assigned, noneOfThese: assignFile.none, noneOfThesePct: pct(assignFile.none, phrases.length),
      unreturned: assignFile.missing,
    },
    generalisationControl: {
      note: 'films in held-out groups were never shown to the induction stage. If the vocabulary only fits what it was mined from, the held-out "none of these" rate is the tell.',
      induced: noneRate(inducedPhrases), heldOut: noneRate(heldOutPhrases),
    },
    headline: {
      predicatesProposed: vocabFile.predicates,
      predicatesKept: kept.length,
      predicatesCut: preds.length - kept.length,
      keptThatJoinFilmsSharingNoEdge: joinsNoEdge,
      keptThatJoinUnreachableFilms: joinsUnreachable,
      keptThatJoinThreeOrMoreUnreachablePairs: joinsStrangersHard,
      cohortFilmsTouched: keptFilms.size,
      caution: `99% of cohort pairs have no edge to begin with (${facts.counts.noEdge} of ${facts.counts.pairs}), so "joins films sharing no edge" is nearly free. The unreachable count is the number that discriminates, against a ${pct(facts.counts.unreachable, facts.counts.pairs)}% chance baseline.`,
    },
    mapImpact,
    permutationControl: control,
    pairLoad: {
      note: 'what the layer would ask the graph to carry. Not an edge count — a candidate-pair count, before any strength or budget is applied.',
      candidatePairsProposedInsideTheCohort: kept.reduce((a, p) => a + p.reach.pairs, 0),
      cohortInternalEdgesToday: facts.counts.edge,
      ratio: +(kept.reduce((a, p) => a + p.reach.pairs, 0) / facts.counts.edge).toFixed(1),
      largestPredicateFilms: Math.max(...kept.map((p) => p.films)),
      pairsFromTheLargestPredicate: Math.max(...kept.map((p) => p.reach.pairs)),
      projectedAtCorpusScale: {
        note: 'a predicate at the top of the proposal band holds 8% of the corpus. Pairs go as n squared, so the band bounds the vocabulary semantically and does not bound the graph at all. Arithmetic, not a measurement.',
        filmsAtEightPercentOf2204: Math.round(0.08 * 2204),
        pairsThatPredicateWouldPropose: Math.round(0.08 * 2204 * (0.08 * 2204 - 1) / 2),
        edgesInTheWholeAtlasToday: 22217,
      },
    },
    ordering: {
      note: 'kept predicates are ordered by unreachable pairs joined, tonal mean as tiebreak',
      predicatesMovedByTheTonalTiebreak: moved,
      distanceBlindOrder: orderBlind,
    },
    cuts: preds.filter((p) => p.verdict === 'cut').map((p) => ({ id: p.id, label: p.label, films: p.films, reason: p.cutReason, flags: p.flags })),
    predicates: kept,
  };
  fs.writeFileSync(F_OUT, JSON.stringify(out, null, 1));

  console.log(`\n  vocabulary ${vocabFile.predicates} proposed -> ${kept.length} kept, ${preds.length - kept.length} cut`);
  console.log(`  assignment: ${assignFile.assigned}/${phrases.length} phrases tagged, "none of these" ${pct(assignFile.none, phrases.length)}%`);
  console.log(`  held-out none-rate ${noneRate(heldOutPhrases).nonePct}% vs induced ${noneRate(inducedPhrases).nonePct}%`);
  console.log(`  KEPT PREDICATES JOINING FILMS THAT SHARE NO EDGE: ${joinsNoEdge}`);
  console.log(`  kept predicates joining UNREACHABLE films: ${joinsUnreachable}  (>=3 such pairs: ${joinsStrangersHard})`);
  console.log(`  wrote ${path.relative(ROOT, F_OUT)}`);
}

/* ------------------------------------------------------------------ main */

(async () => {
  const a = process.argv.slice(2);
  try {
    if (a.includes('--facts')) stageFacts();
    else if (a.includes('--induce')) await stageInduce();
    else if (a.includes('--merge')) await stageMerge();
    else if (a.includes('--assign')) await stageAssign();
    else if (a.includes('--measure')) stageMeasure();
    else console.log('usage: --facts | --induce | --merge | --assign | --measure');
  } catch (e) {
    console.error('FAILED: ' + e.message);
    process.exit(1);
  }
})();
