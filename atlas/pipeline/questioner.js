#!/usr/bin/env node
/* questioner.js — what to ask the reader next, and when to shut up.
 *
 *   const { buildQuestioner } = require("./questioner.js");
 *   const Q = buildQuestioner();                       // reads the consensus shards
 *   const s = Q.open([{ attr: "story:coming-home" }]); // what the reader typed
 *
 *   s.set()             // { answering, unread, corpus, top: [...], ranked, scores }
 *   s.ask()             // null, or { id, question, label, bits, exit, ... }
 *   s.answer(id, "yes" | "no" | "either")
 *   s.query()           // the match.js query the answers have built
 *   s.transcript()      // every question asked and every answer given
 *
 * CLI:
 *   node pipeline/questioner.js --q "story:coming-home"
 *   node pipeline/questioner.js --q "story:coming-home" --answers "tone:cerebral=yes,mode:action=yes"
 *   node pipeline/questioner.js --q "..." --target "Interstellar"   # simulated reader
 *   node pipeline/questioner.js --candidates --q "..."              # the full ranked shortlist
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 *
 * The owner's flow: "stories about coming home — uff, there is a ton. Oh but
 * they want it cerebral: ok, fewer. Oh wait, they also want action and set in
 * space." The site should ask the second and third of those rather than wait for
 * the reader to think of them, and the question it asks has to be a function of
 * what the reader already said — otherwise it is a form, and a form is what a
 * search feels like when nobody is listening.
 *
 * The mechanism is one line: ASK THE ATTRIBUTE THAT MOST SPLITS THE CURRENT
 * RESULT SET. "Do you want it cerebral?" is worth everything when it halves the
 * set and worth nothing when 290 of the 300 already are. Everything else in this
 * file is either the arithmetic of that sentence or a rule about when not to.
 *
 * ── THE SET, AND WHY THIS FILE HAS TO INVENT ONE ─────────────────────────────
 *
 * match.js deliberately has no result set. It re-ranks the whole corpus and lets
 * distance carry the answer, so that a search can never come back empty and the
 * near-misses stay drawn. That is right for the picture and useless here: you
 * cannot compute a split of a set that does not exist, and a reader who is told
 * "2,204 films, now sorted differently" has not been told the thing the owner's
 * sentence is about ("there is a ton, 300 films").
 *
 * So the questioner defines its own, and keeps two numbers rather than one
 * because the honest answer needs both:
 *
 *   ANSWERING (A)  films with a positive reading on every clause the reader has
 *                  said yes to, and a zero reading on everything they said no to.
 *                  This is the number to show a reader. It only ever shrinks.
 *
 *   UNREAD (P\A)   films that are not ruled out but that we have no reading for
 *                  on at least one clause. Not candidates, not corpses. Reported
 *                  separately and never folded into A, because folding them in is
 *                  how "we have not looked" turns into "there are lots".
 *
 * The ranking the reader actually sees is still match.js's, over all 2,204. A is
 * the questioner's instrument, not a filter applied to the view. Nothing in this
 * file truncates anything downstream.
 *
 * ── THE SPLIT MEASURE, AND THE THREE THINGS IT HAD TO SURVIVE ────────────────
 *
 * For candidate attribute a over the answering set A, with strengths v_f in
 * [0,1] (the consensus rungs 0.25 / 0.5 / 0.75 / 1, or 0 for a known no):
 *
 *   q      = mean v over the films in A that have a reading for a
 *   yes-weights  w_f = v_f          (unread films in A get q)
 *   no-weights   w_f = 1 - v_f      (unread films in A get 1 - q)
 *   N_branch     = (Σw)² / Σw²      — inverse Simpson: the EFFECTIVE size of the
 *                                     set once it is reweighted by that answer
 *   E      = q · N_yes + (1 - q) · N_no
 *   bits   = log2( |A| / E )
 *
 * Read `bits` as "how much of the set this question is expected to clear": 1 bit
 * is a halving, 0.42 bits is a quarter, 0.05 bits is nothing.
 *
 * EXPECTED is doing real work in that sentence, and the gap is worth knowing
 * before the floor below looks too strict. Most attributes are held by a
 * minority, so q is small, so the expectation is dominated by the "no" branch,
 * which keeps most of the set. A 0.48-bit question is a 2.3x cut for the reader
 * who says yes and almost nothing for the reader who says no. The expectation is
 * still the right thing to CHOOSE on — you do not know the answer when you pick
 * the question — but the number a reader experiences is the branch they took,
 * not the average over both. `measure-questioner.js` block 3 prints both.
 *
 * The inverse-Simpson step is not decoration, and it is the third thing I tried.
 * The two obvious measures both fail on real data:
 *
 *   COUNTING v > 0 AS "YES" makes an attribute that every film holds faintly
 *   look like a perfect question. 300 films all at 0.25 would score 2 bits and
 *   the answer would not move a single film relative to another.
 *
 *   SUMMING THE STRENGTHS fails the same way for a subtler reason: retention is
 *   then linear in v, the variance cancels algebraically, and E collapses to
 *   |A|·(q² + (1-q)²) — a function of the MEAN only. Same 300-films-at-0.25
 *   case, same wrong answer, now with arithmetic in front of it.
 *
 * An effective size is quadratic in the weights, so it is the spread that pays.
 * The three cases that decide whether the measure is right:
 *
 *   everyone at 0.25   N_yes = N_no = |A|            ->  0.00 bits.  Correct: a
 *                      thing they all are equally is not a question.
 *   half at 1, half 0  N_yes = N_no = |A|/2          ->  1.00 bits.  A halving.
 *   290 of 300 hold it N_yes = 290, N_no = 10, q≈.97 ->  0.09 bits.  The owner's
 *                      own case, and it falls out rather than being asserted.
 *
 * ── "NEVER ASK WHAT IS ALREADY ANSWERED, OR IMPLIED" — HALF FALLS OUT ────────
 *
 * IMPLIED does fall out, and that is the reason to compute the split over the
 * LIVE set instead of over the corpus. Once the reader grants X, everything
 * correlated with X is held by most of what is left, q climbs, N_no collapses,
 * and the correlate's bits go with it. Measured, not asserted:
 * `measure-questioner.js` block 4b walks it. Over `subject:political`, granting
 * `tone:bleak` takes `tone:earnest` from 0.27 bits to 0.16 and `tone:cerebral`
 * from 0.26 to 0.17. Over `tone:melancholy`, granting `pace:contemplative` takes
 * `pace:slow-burn` from 0.15 to 0.04 — the reader who wanted an unhurried
 * melancholy film has already told you about the slow burn.
 *
 * No implication table is needed and none is wanted: a hand-written "cerebral
 * implies not relentless" is an opinion about cinema smuggled in as a data
 * structure, it would be wrong about the corpus in front of it, and it would
 * need re-litigating every time the vocabulary moved.
 * The corpus's own co-occurrence says it instead, on the films still in play.
 *
 * ALREADY ANSWERED DOES NOT FALL OUT, and I believed it did until block 4 said
 * otherwise. The reasoning that failed: "a granted attribute is held by
 * everything left, so q -> 1, so bits -> 0". q is the mean STRENGTH, not the
 * prevalence, and a granted attribute sits at a mean of about 0.5 inside its own
 * answering set — some films hold it at 0.25 and some at 1. That is real spread,
 * so the measure correctly reports up to 0.34 bits for re-asking a question the
 * reader has just answered. The measure is right and the question is intolerable,
 * which is the definition of a case for an explicit rule: `shortlist()` drops
 * every attribute already spent in either direction, and every attribute already
 * put to the reader and skipped. Structural, not statistical.
 *
 * The residual it is suppressing is a real question in disguise — "you said
 * ironic; do you want it VERY ironic?" — and if this ever grows a degree
 * control, that 0.34 bits is where it lives. It is not a degree control today,
 * so it is silenced today.
 *
 * ── SAYING NO ────────────────────────────────────────────────────────────────
 *
 * A reader who answers "no" has told you as much as one who answers "yes", and
 * match.js's query language has no negation — a clause can only ask for a thing.
 * Rather than reach into match.js, the negative is carried as a complement
 * attribute `not:<id>` served by a wrapper around its attribute table: known v
 * becomes 1 - v, and unknown STAYS UNKNOWN. That last part is the whole point.
 * "We have no reading" must not become "so it is probably not that" — it is the
 * same three-state discipline match.js's shard rules exist to protect, and
 * inverting an absence would launder ignorance into evidence for the reader's no.
 *
 * The complement gets its rarity from its own empirical distribution, so "not
 * cerebral" is a cheap claim in a corpus where few films are cerebral and an
 * expensive one where most are. Nothing had to be tuned for that; it is
 * match.js's `attributeModel` reading a different column.
 *
 * ── THE STOP RULES, WHICH MATTER MORE THAN THE RANKING ───────────────────────
 *
 * A question with no good answer is worse than no question, and a reader who has
 * what they came for must not be quizzed. Four ways this stops, and the first is
 * the one that fires most:
 *
 *   1. THE SET IS ALREADY SHOWABLE. The wall shows the first 240 films
 *      (DESIGN.md, "The wall: what decides the front page"). Below that the
 *      reader can simply look, and a question is a toll gate in front of an open
 *      door. 240 is not a number invented here — it is the number the front page
 *      already commits to.
 *
 *   2. THE BEST QUESTION IS THIN. Below `minBits` nothing worth asking exists.
 *      The default 0.415 bits is the question clearing a quarter of the set, and
 *      it is a product judgement rather than a measurement: I am claiming that a
 *      question which leaves four-fifths of the set standing has cost the reader
 *      more than it returned. `measure-questioner.js` reports how often it binds.
 *
 *   3. THE CAP. Three questions. See below.
 *
 *   4. TWO SKIPS IN A ROW. "Either" is an answer, and two of them in sequence is
 *      a reader telling you to stop. It is not a floor on information; it is a
 *      floor on politeness.
 *
 * ── WHY THREE, AND WHY THE CAP IS THE LEAST IMPORTANT OF THE FOUR ───────────
 *
 * I expected the cap to be justified by decay — that the fourth question would
 * have worse material than the first, because the high-bit attributes are spent.
 * Block 3 says that is false. Median best-available bits by depth, over every
 * opening wide enough to fire: 0.458, 0.453, 0.456, 0.455, 0.491. FLAT. The
 * measure is scale-free, so a smaller set is not a worse set to split; there is
 * always some attribute that halves whatever is left, all the way down.
 *
 * What decays is the SET, and fast: median 401 films at Q1, 32 after three
 * answers. So the honest account of the cap is that it is a backstop and rule 1
 * is the real terminator — the conversation ends because the reader can see the
 * answer, not because the questioner ran out of things to ask. Three is where I
 * put the backstop because three answers is where the median opening drops two
 * orders of magnitude, and because a mechanism that will happily ask forever
 * needs a number that is not a function of its own appetite.
 *
 * If the cap is ever raised, raise the showable floor with it or the fourth
 * question arrives at a set of thirty films, which is a quiz about a page the
 * reader is already looking at.
 *
 * In practice the cap has never bound on this corpus. Under shipped defaults the
 * widest opening in the vocabulary gets ONE question and then rule 1 ends it:
 * `mood:menacing` 452 -> `tone:bleak?` -> 216, showable, done. The three-question
 * conversation the owner described needs a corpus several times this one.
 *
 * ── THE LIMIT THIS MECHANISM CANNOT ARGUE ITS WAY OUT OF ─────────────────────
 *
 * The highest-information question is almost always the near neighbour of what
 * the reader just said, and the near neighbour is the question they can see
 * coming. This is structural, not a tuning failure: an attribute unrelated to
 * the query is held by almost nobody in the answering set, so q -> 0, so it
 * cannot split anything. Only a correlate has the prevalence to make a balanced
 * cut. Measured: rho(bits, lift-over-corpus-prevalence) across the full
 * shortlist has median 0.724 and never drops below 0.414 over 33 openings.
 * Information gain and thematic adjacency are close to the same ranking.
 *
 * The owner's own example is the proof and it is worth sitting with. Opening on
 * `story:coming-home`, his three turns — cerebral, action, in space — score
 * 0.078, 0.000 and 0.000 bits. `tone:cerebral` ranks 39th of 58 candidates. This
 * questioner would never have proposed a single one of them, because the thing
 * that made his example alive was that the reader CHANGED DIRECTION, and a
 * direction change is by construction the lowest-information question available.
 *
 * So this file should be read as doing one of the two jobs in that sentence. It
 * narrows well and it will never surprise anybody. The surprising turn has to
 * come from the reader — which means the typed input must stay open at every
 * step, and the question must never be the only way forward. That is what the
 * exit is for, and it is why the exit is a first-class field on every question
 * rather than a link at the bottom.
 *
 * A forced two-pole question ("more X, or more Y?") was the obvious candidate
 * for breaking the ceiling, since neither branch keeps the whole set. It does
 * not: measured with the exit modelled as a real third branch and the poles
 * confined to one vocabulary group, the median best pair is 0.453 bits against
 * 0.458 for the best single, and it wins on only 16 of 33 openings. It is not
 * implemented, and the number is why.
 *
 * ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────
 *
 * It does not parse the reader's typed words into clauses — it takes clauses.
 * It does not rank, lay out or truncate anything: `set().top` is match.js's
 * ranking, unmodified, and A is never handed downstream as a filter.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { buildMatcher } = require("./match.js");

const HERE = __dirname;
const PHRASINGS = path.join(HERE, "questioner-phrasings.json");
const VOCAB = path.join(HERE, "consensus-vocab.json");

/* The wall shows the first 240 films. Below that, showing beats asking. */
const SHOWABLE = 240;
/* A question must expect to clear a quarter of the set: log2(1/0.75). */
const MIN_BITS = 0.415;
const MAX_QUESTIONS = 3;
const MAX_CONSECUTIVE_SKIPS = 2;

const NOT = "not:";

/* ───────────────────────────────────────────────── the complement table wrapper

   Gives match.js a `not:<attr>` column without match.js learning about negation.
   The one rule that matters: undefined stays undefined. A film with no reading
   for `tone:cerebral` has no reading for `not:tone:cerebral` either, and must not
   be credited for the reader's "no". Inverting an absence is how an unattributed
   film quietly becomes evidence.                                              */

function withComplements(table) {
  return {
    vocab: table.vocab,
    keys: table.keys,
    value(filmKey, attr) {
      if (attr.startsWith(NOT)) {
        const v = table.value(filmKey, attr.slice(NOT.length));
        return v === undefined ? undefined : 1 - v;
      }
      return table.value(filmKey, attr);
    },
    stats: table.stats ? table.stats.bind(table) : () => ({}),
  };
}

/* ────────────────────────────────────────────────────────── the split measure */

/* Inverse Simpson: the number of films a weight vector is "really" spread over.
   Σw = 0 means the branch keeps nobody, which is a size of 0, not of NaN. */
function effectiveSize(weights) {
  let s = 0, s2 = 0;
  for (const w of weights) { s += w; s2 += w * w; }
  if (s <= 0 || s2 <= 0) return 0;
  return (s * s) / s2;
}

/* bits(a | A) — the expected shrinkage of A if the reader answers a.
   Returns the whole working, because the shortlist is the thing you read to
   judge whether the questions are any good. */
function splitOf(table, A, attr) {
  const known = [];
  let unread = 0;
  for (const f of A) {
    const v = table.value(f, attr);
    if (v === undefined) unread++;
    else known.push(v);
  }
  const n = A.length;
  if (!n || !known.length) {
    return { attr, bits: 0, q: 0, known: known.length, unread, nYes: 0, nNo: n, held: 0 };
  }
  let sum = 0, held = 0;
  for (const v of known) { sum += v; if (v > 0) held++; }
  const q = sum / known.length;

  const yes = [], no = [];
  for (const v of known) { yes.push(v); no.push(1 - v); }
  for (let i = 0; i < unread; i++) { yes.push(q); no.push(1 - q); }

  const nYes = effectiveSize(yes);
  const nNo = effectiveSize(no);
  const E = q * nYes + (1 - q) * nNo;
  const bits = E > 0 ? Math.log2(n / E) : 0;
  return { attr, bits, q, known: known.length, unread, nYes, nNo, held };
}

/* ──────────────────────────────────────────────────────────────── the session */

function buildQuestioner(opts) {
  opts = opts || {};
  const matcher = buildMatcher({ dir: opts.dir, meta: opts.meta, attrsFile: opts.attrsFile });
  const table = withComplements(matcher.table);
  /* match.js was handed the raw table; give it the complement-aware one so
     `not:` clauses score. buildMatcher accepts a supplied table, so this is a
     second matcher over the same shards rather than a reach into the first. */
  const scorer = buildMatcher({ meta: matcher.meta, table });

  const phrasings = JSON.parse(fs.readFileSync(opts.phrasings || PHRASINGS, "utf8"));
  const vocab = JSON.parse(fs.readFileSync(opts.vocab || VOCAB, "utf8"));
  const ALL = vocab.attributes.map((a) => a.id);

  const cfg = {
    showable: opts.showable === undefined ? SHOWABLE : opts.showable,
    minBits: opts.minBits === undefined ? MIN_BITS : opts.minBits,
    maxQuestions: opts.maxQuestions === undefined ? MAX_QUESTIONS : opts.maxQuestions,
    maxSkips: opts.maxSkips === undefined ? MAX_CONSECUTIVE_SKIPS : opts.maxSkips,
  };

  function open(openingClauses) {
    /* Clauses the reader arrived with. They are answers too — never asked. */
    const clauses = [];
    for (const c of openingClauses) {
      const terms = typeof c === "string" ? [c] : (c.anyOf || [c.attr]);
      clauses.push({ terms, weight: c.weight === undefined ? 1 : c.weight, source: "typed" });
    }
    const asked = new Set();
    const log = [];
    let skips = 0, questions = 0, stopped = null;

    /* Does film f satisfy a clause? "yes" / "no" / "unknown".
     *
     * A `not:` term is STRICT and the asymmetry is deliberate. On the way in,
     * any positive reading counts: a film faintly about coming home is still a
     * candidate for someone who asked for that. On the way out, only a known
     * zero survives a "no": a reader who says they do not want it funny is not
     * served by a film that is funny at 0.25, and the complement's graded value
     * (1 - 0.25 = 0.75) would happily let it through. The graded reading still
     * governs the RANKING, where being slightly funny should demote a film
     * rather than delete it — that is match.js's job and it still does it. This
     * is only the count the questioner reasons about.
     *
     * Unknown never converts. It is not a yes and it is not a no in either
     * direction, and that is the whole three-state discipline. */
    function clauseState(f, c) {
      let seen = "unknown";
      for (const t of c.terms) {
        if (t.startsWith(NOT)) {
          const v = matcher.table.value(f, t.slice(NOT.length));
          if (v === undefined) continue;
          if (v === 0) return "yes";
          seen = "no";
        } else {
          const v = matcher.table.value(f, t);
          if (v === undefined) continue;
          if (v > 0) return "yes";
          seen = "no";
        }
      }
      return seen;
    }

    /* The answering set: a positive reading on every clause. Only ever shrinks. */
    function answering() {
      const out = [];
      outer: for (const f of matcher.keys) {
        for (const c of clauses) if (clauseState(f, c) !== "yes") continue outer;
        out.push(f);
      }
      return out;
    }

    /* Not ruled out, but unread on something. Reported, never counted as an answer. */
    function unread() {
      let n = 0;
      outer: for (const f of matcher.keys) {
        let anyUnknown = false;
        for (const c of clauses) {
          const st = clauseState(f, c);
          if (st === "no") continue outer;
          if (st === "unknown") anyUnknown = true;
        }
        if (anyUnknown) n++;
      }
      return n;
    }

    function query() {
      return clauses.map((c) => ({ anyOf: c.terms.slice(), weight: c.weight, label: c.terms.join("|") }));
    }

    function shortlist() {
      const A = answering();
      const spent = new Set();
      for (const c of clauses) for (const t of c.terms) spent.add(t.startsWith(NOT) ? t.slice(NOT.length) : t);
      const rows = [];
      for (const a of ALL) {
        if (spent.has(a)) continue;              /* already said, in either direction */
        if (asked.has(a)) continue;              /* already put to them and skipped */
        if (!phrasings.questions[a]) continue;   /* no reader-facing phrasing: not askable */
        rows.push(splitOf(table, A, a));
      }
      rows.sort((x, y) => y.bits - x.bits || x.attr.localeCompare(y.attr));
      return { A, rows };
    }

    function set() {
      const A = answering();
      const r = scorer.score(query());
      const order = r.ranked();
      return {
        answering: A.length,
        unread: unread(),
        corpus: matcher.keys.length,
        top: order.slice(0, 10).map((k) => ({
          key: k, title: matcher.meta[k].title, year: matcher.meta[k].year,
          score: Math.round(r.scores[k] * 1000) / 1000,
        })),
        ranked: order,
        scores: r.scores,
      };
    }

    function ask() {
      const A = answering();
      if (stopped) return null;
      if (questions >= cfg.maxQuestions) { stopped = "cap: " + cfg.maxQuestions + " questions"; return null; }
      if (skips >= cfg.maxSkips) { stopped = "the reader skipped " + skips + " in a row"; return null; }
      if (!A.length) {
        /* Nothing holds every clause. This is not a failure and must not be
           dressed as one: match.js still has a full ranking, and the reader is
           looking at the films that come closest. There is nothing left to
           narrow, so there is nothing to ask. */
        stopped = "no film answers all of it — the ranking is carrying the query now";
        return null;
      }
      if (A.length <= cfg.showable) {
        stopped = "the set is showable (" + A.length + " <= " + cfg.showable + ")";
        return null;
      }
      const { rows } = shortlist();
      const best = rows[0];
      if (!best || best.bits < cfg.minBits) {
        stopped = "nothing left worth asking (best " + (best ? best.bits.toFixed(3) : "0") +
          " bits < " + cfg.minBits + ")";
        return null;
      }
      const p = phrasings.questions[best.attr];
      return {
        id: best.attr,
        question: p.q,
        label: p.label,
        bits: best.bits,
        setNow: A.length,
        expected: { yes: Math.round(best.nYes), no: Math.round(best.nNo) },
        prevalence: best.q,
        unreadInSet: best.unread,
        /* The exit is not a courtesy string. It is an answer the caller can pass
           straight back to answer(), and it is available at every step. */
        exit: { answer: "either", label: "doesn't matter", andShow: "these " + A.length },
        runnerUp: rows[1] ? { id: rows[1].attr, bits: rows[1].bits } : null,
      };
    }

    function answer(id, verdict) {
      asked.add(id);
      questions++;
      if (verdict === "either" || verdict === "skip") {
        skips++;
        log.push({ id, verdict: "either" });
        return;
      }
      skips = 0;
      const term = verdict === "no" ? NOT + id : id;
      clauses.push({ terms: [term], weight: 1, source: "asked" });
      log.push({ id, verdict });
    }

    return {
      ask, answer, set, query, shortlist,
      transcript: () => log.slice(),
      stopReason: () => stopped,
      config: cfg,
    };
  }

  return { open, matcher, scorer, table, phrasings, vocab, config: cfg, splitOf: (A, a) => splitOf(table, A, a) };
}

/* ───────────────────────────────────────────────────────────────────────── CLI */

function parseArgs(argv) {
  const a = { q: null, answers: null, target: null, candidates: false, dir: null, showable: null, minBits: null, max: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--q") a.q = argv[++i];
    else if (k === "--answers") a.answers = argv[++i];
    else if (k === "--target") a.target = argv[++i];
    else if (k === "--candidates") a.candidates = true;
    else if (k === "--dir") a.dir = argv[++i];
    else if (k === "--showable") a.showable = Number(argv[++i]);
    else if (k === "--min-bits") a.minBits = Number(argv[++i]);
    else if (k === "--max") a.max = Number(argv[++i]);
    else throw new Error("unknown argument " + k);
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.q) { console.log("usage: node pipeline/questioner.js --q \"story:coming-home\" [--answers a=yes,b=no] [--target Title] [--candidates]"); return; }

  const Q = buildQuestioner({
    dir: a.dir || undefined,
    showable: a.showable === null ? undefined : a.showable,
    minBits: a.minBits === null ? undefined : a.minBits,
    maxQuestions: a.max === null ? undefined : a.max,
  });
  const s = Q.open(a.q.split(",").map((t) => t.trim()).filter(Boolean).map((t) => ({ attr: t })));

  /* A scripted reader: --answers gives literal answers; --target answers the
     way the named film would, which is how you see the sequence a real search
     for a real film would produce. */
  const scripted = new Map();
  if (a.answers) {
    for (const kv of a.answers.split(",")) {
      const [k, v] = kv.split("=").map((x) => x.trim());
      if (k) scripted.set(k, v || "yes");
    }
  }
  let targetKey = null;
  if (a.target) {
    for (const k of Q.matcher.keys) {
      if (String(Q.matcher.meta[k].title).toLowerCase() === a.target.toLowerCase()) { targetKey = k; break; }
    }
    if (!targetKey) { console.error("no film titled " + a.target); process.exit(1); }
  }

  const show = (label) => {
    const st = s.set();
    console.log("     " + label.padEnd(30) + " answering " + String(st.answering).padStart(5) +
      "   (+" + String(st.unread).padStart(4) + " unread)" +
      "   " + st.top.slice(0, 3).map((t) => t.title).join(" · "));
  };

  console.log("shards: " + JSON.stringify(Q.matcher.stats) +
    "   policy: showable<=" + Q.config.showable + ", minBits " + Q.config.minBits +
    ", cap " + Q.config.maxQuestions);
  console.log("\nopening: " + a.q);
  show("start");

  for (;;) {
    if (a.candidates) {
      const { A, rows } = s.shortlist();
      console.log("\n  candidates over " + A.length + " films:");
      for (const r of rows.slice(0, 12)) {
        console.log("    " + r.attr.padEnd(26) + r.bits.toFixed(3) + " bits" +
          "   holds " + String(r.held).padStart(4) + "/" + String(r.known).padEnd(4) +
          "  q=" + r.q.toFixed(2) + "  unread " + r.unread);
      }
    }
    const q = s.ask();
    if (!q) { console.log("\n  stop: " + s.stopReason()); break; }
    let verdict;
    if (scripted.has(q.id)) verdict = scripted.get(q.id);
    else if (targetKey) {
      const v = Q.table.value(targetKey, q.id);
      verdict = v === undefined ? "either" : (v > 0 ? "yes" : "no");
    } else verdict = "yes";
    console.log("\n  Q" + (s.transcript().length + 1) + " (" + q.bits.toFixed(2) + " bits): " + q.question);
    console.log("       [yes] [no] [" + q.exit.label + " — just show me " + q.exit.andShow + "]");
    console.log("       reader: " + verdict);
    s.answer(q.id, verdict);
    show("after " + q.id + "=" + verdict);
  }

  const st = s.set();
  console.log("\nfinal query: " + JSON.stringify(s.query().map((c) => c.label)));
  console.log("answering " + st.answering + "   unread " + st.unread + "   corpus " + st.corpus);
  console.log("top 10 by match score:");
  for (const t of st.top) console.log("  " + String(t.score).padEnd(6) + t.title + " (" + t.year + ")");
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.stack || e.message); process.exit(1); }
}

module.exports = { buildQuestioner, splitOf, effectiveSize, withComplements, SHOWABLE, MIN_BITS, MAX_QUESTIONS };
