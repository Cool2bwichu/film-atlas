#!/usr/bin/env node
/* query-parse.js — the reader's sentence becomes a query, and the reader can see it happen.
 *
 *   const { buildParser } = require("./query-parse.js");
 *   const P = buildParser();
 *   const r = P.parse("a film with fast pacing, the mood of the matrix, a hopeful tone, " +
 *                     "little dialogue, very spiritual");
 *   r.clauses    // -> match.js query clauses, ready for buildMatcher().score()
 *   r.readings   // -> one per span of the reader's text, with what it became and why
 *   r.unread     // -> spans that meant nothing here, kept and shown, never dropped
 *
 * CLI:
 *   node pipeline/query-parse.js "fast, hopeful, little dialogue, very spiritual"
 *   node pipeline/query-parse.js --selftest
 *   node pipeline/query-parse.js --measure          # coverage + collision table
 *
 * ── WHAT WAS MISSING, AND WHY IT IS ITS OWN FILE ─────────────────────────────
 *
 * match.js takes clauses. questioner.js takes clauses. Neither takes words, and
 * both say so in their headers. The whole typed search was one file short: the
 * thing that turns "little dialogue" into `texture:sparse-dialogue` and knows
 * that it must NOT turn it into "not dialogue".
 *
 * It is separate from both because it is the only part of the search that can be
 * wrong in a way no downstream measurement can detect. If this file maps
 * "atmospheric" to `mood:menacing`, every number after it is computed correctly
 * about a question the reader did not ask. So the rule this file is built on is
 * not accuracy, it is LEGIBILITY:
 *
 *      EVERY READING IS SHOWN TO THE READER, IN THEIR OWN WORDS AND IN OURS,
 *      AND EVERY ONE OF THEM CAN BE TAKEN BACK.
 *
 * A parse that is visible does not have to be right. It has to be correctable.
 * That is why `readings` carries the reader's own span alongside the attribute
 * label, why `unread` exists at all, and why nothing here ever guesses: a phrase
 * that is not in the lexicon becomes an admission rather than a silent drop.
 *
 * ── THE THREE THINGS IT KNOWS HOW TO DO ──────────────────────────────────────
 *
 * 1. PHRASES. `query-lexicon.json` maps reader language onto the 59 closed
 *    attributes, longest phrase first. Ambiguity is expressed rather than
 *    resolved: "fast" is genuinely relentless-or-brisk, so it becomes ONE
 *    anyOf clause holding both, which is exactly what match.js's anyOf is for —
 *    max credit among the members, so a synonym pair cannot pay twice.
 *
 * 2. FILMS. "the mood of the matrix" is not a phrase, it is a POINTER. The
 *    named film's own consensus attributes are read back and become clauses.
 *    "the mood of X" reads X's `mood` group; a bare "like X" reads X's most
 *    DISTINCTIVE attributes — ranked by sigma from match.js's own attributeModel,
 *    so the terms that come back are the ones that say something about X rather
 *    than the ones X shares with half the corpus.
 *
 *    The honest part, and it is the part that shows on screen: THE MATRIX HOLDS
 *    EXACTLY ONE MOOD TERM IN THIS VOCABULARY (`mood:paranoid`, 0.5). A reader
 *    who types "the mood of the matrix" is imagining more than that. So the
 *    reading names what it used and, when the named group is thin, widens to the
 *    film's distinctive terms and SAYS it widened. The alternative — quietly
 *    pulling in `texture:stylised` and `setting:future` under the word "mood" —
 *    is the same class of lie as inverting an unknown.
 *
 * 3. NEGATION AND DEGREE. "not funny" flips a clause; "very spiritual" weights
 *    it up; "a bit funny" weights it down. Negation is carried as `negate: true`
 *    on the clause and rendered as questioner.js's `not:` term, because that is
 *    where the complement table already lives and it is the one place that knows
 *    the rule that matters: an UNKNOWN never inverts.
 *
 *    One trap this file exists to avoid, and it is the owner's own sentence:
 *    "LITTLE DIALOGUE" IS NOT A NEGATION. `texture:sparse-dialogue` already IS
 *    the absence; negating it a second time asks for a talky film, which is the
 *    opposite of what was typed. Lexicon entries carry `polarity: "inherent"`
 *    and the negation scanner refuses to invert them. `--selftest` checks it.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────────
 *
 * No fuzzy matching, no stemming beyond a plural `s`, no embedding, no model
 * call. Every one of those turns an unmatched phrase into a confident wrong
 * answer, and a wrong answer here is invisible. An unmatched phrase is reported
 * as unread and the reader can see the gap and say it differently — which is a
 * worse first impression and a better search.
 *
 * The reader's typed words are also never thrown away when they DO match: the
 * span survives into `readings[].text`, so the interface can print
 * "fast pacing → relentless or quick" rather than replacing what they said with
 * schema vocabulary they never chose.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { buildMatcher, attributeModel } = require("./match.js");

const HERE = __dirname;
const ROOT = path.join(HERE, "..");
const LEXICON = path.join(HERE, "query-lexicon.json");
const VOCAB = path.join(HERE, "consensus-vocab.json");
const PHRASINGS = path.join(HERE, "questioner-phrasings.json");

/* How far back a negation reaches, in tokens. Four covers "not very funny" and
   "without any real violence" and stops short of the next comma either way —
   the clause separator is a harder boundary than the distance. */
const NEG_WINDOW = 4;
const DEGREE_WINDOW = 3;
/* Weights are relative: match.js scales numerator and denominator together, so
   1.5 means "this clause counts half again as much as a plain one". */
const W_UP = 1.5;
const W_DOWN = 0.6;

/* ─────────────────────────────────────────────────────────────── normalisation

   One normaliser, used on the reader's text, on every lexicon phrase and on
   every film title. If these ever disagree the search fails silently for
   accented titles, which is most of the interesting half of this corpus.      */

function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   /* é -> e, ō -> o */
    .replace(/['‘’ʼ]/g, "")               /* don't -> dont */
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s) {
  const n = norm(s);
  return n ? n.split(" ") : [];
}

/* Reader text is tokenised WITH its own character offsets so a reading can point
   back at the exact span the reader typed. Offsets are into the original string,
   not the normalised one. */
function tokenise(text) {
  const out = [];
  const re = /[\p{L}\p{N}'’]+/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = norm(m[0]);
    if (!t) continue;
    /* norm() can split one source word into several ("sci-fi" is already split
       by the regex, but "ﬁlm" ligatures and digits+letters can widen). Keep the
       whole source span on the first piece and empty spans on the rest. */
    const parts = t.split(" ");
    for (let i = 0; i < parts.length; i++) {
      out.push({ t: parts[i], start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

/* Commas, semicolons, "and", "but" and full stops are clause walls: a negation
   before one does not reach past it. Recorded as the index of the token AFTER
   each wall. */
function walls(text, toks) {
  const set = new Set([0]);
  for (let i = 1; i < toks.length; i++) {
    const between = text.slice(toks[i - 1].end, toks[i].start);
    if (/[,;.:—–()\/]|\n/.test(between)) set.add(i);
  }
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t === "and" || toks[i].t === "but" || toks[i].t === "also") set.add(i + 1);
  }
  return set;
}

/* ───────────────────────────────────────────────────────────────── the lexicon */

function buildLexicon(lex) {
  const byPhrase = new Map();          /* normalised phrase -> [{attr, polarity}] */
  let maxLen = 1;
  const add = (phrase, attr, polarity) => {
    const n = norm(phrase);
    if (!n) return;
    const len = n.split(" ").length;
    if (len > maxLen) maxLen = len;
    if (!byPhrase.has(n)) byPhrase.set(n, []);
    const row = byPhrase.get(n);
    if (!row.some((r) => r.attr === attr)) row.push({ attr, polarity: polarity || "plain", phrase: n });
  };
  for (const [attr, list] of Object.entries(lex.phrases)) {
    for (const e of list) {
      if (typeof e === "string") add(e, attr, "plain");
      else add(e.phrase, attr, e.polarity);
    }
  }
  const cues = [];                     /* film-reference cues, longest first */
  for (const [group, list] of Object.entries(lex.filmRef.groupCues)) {
    for (const c of list) cues.push({ toks: tokens(c), group, kind: "group" });
  }
  for (const c of lex.filmRef.wholeCues) cues.push({ toks: tokens(c), group: null, kind: "whole" });
  cues.sort((a, b) => b.toks.length - a.toks.length);

  const neg = new Set(lex.negation.map(norm));
  const negMax = Math.max(...[...neg].map((n) => n.split(" ").length));
  const up = new Set(lex.degree.up.map(norm));
  const down = new Set(lex.degree.down.map(norm));
  const downMax = Math.max(...[...down].map((n) => n.split(" ").length));
  const stop = new Set(lex.stopWords.map(norm));

  return { byPhrase, maxLen, cues, neg, negMax, up, down, downMax, stop };
}

/* ──────────────────────────────────────────────────────────────── film titles

   Corpus titles first, then Wikidata aliases keyed by the film's own qid, so
   "sette samurai" and "los siete samurais" both reach `seven samurai`. Aliases
   are ambiguous far more often than titles are, so a title always wins and an
   alias that resolves to two different films is DROPPED rather than guessed.  */

function buildTitleIndex(meta, aliasPath) {
  const byName = new Map();            /* normalised name -> Set(filmKey) */
  const put = (name, key, rank) => {
    const n = norm(name);
    if (!n || n.length < 2) return;
    if (!byName.has(n)) byName.set(n, new Map());
    const m = byName.get(n);
    if (!m.has(key) || m.get(key) > rank) m.set(key, rank);
  };
  const byQid = new Map();
  for (const [k, f] of Object.entries(meta)) {
    put(f.title, k, 0);
    /* "the matrix" is also reachable as "matrix"; a leading article is the one
       thing readers drop, and dropping it is unambiguous in this corpus except
       where it collides, which the collision rule below catches. */
    const stripped = String(f.title).replace(/^(the|a|an|le|la|les|l'|il|el|der|die|das)\s+/i, "");
    if (stripped !== f.title) put(stripped, k, 1);
    if (f.qid) byQid.set(f.qid, k);
  }
  let aliases = {};
  try { aliases = JSON.parse(fs.readFileSync(aliasPath, "utf8")); } catch (e) { aliases = {}; }
  for (const [qid, list] of Object.entries(aliases)) {
    const key = byQid.get(qid);
    if (!key || !Array.isArray(list)) continue;
    for (const a of list) put(a, key, 2);
  }
  /* Resolve each name to a single film, or to nothing. Rank wins; a tie at the
     same rank is a genuine ambiguity and is dropped. */
  const resolved = new Map();
  let dropped = 0;
  for (const [n, m] of byName) {
    let best = null, bestRank = 99, tie = false;
    for (const [k, r] of m) {
      if (r < bestRank) { best = k; bestRank = r; tie = false; }
      else if (r === bestRank && k !== best) tie = true;
    }
    if (tie) { dropped++; continue; }
    resolved.set(n, best);
  }
  let maxLen = 1;
  for (const n of resolved.keys()) {
    const l = n.split(" ").length;
    if (l > maxLen) maxLen = l;
  }
  return { resolved, maxLen: Math.min(maxLen, 12), ambiguous: dropped, size: resolved.size };
}

/* ───────────────────────────────────────────────────────────────── the parser */

function buildParser(opts) {
  opts = opts || {};
  const lex = JSON.parse(fs.readFileSync(opts.lexicon || LEXICON, "utf8"));
  const vocab = JSON.parse(fs.readFileSync(opts.vocab || VOCAB, "utf8"));
  const phrasings = JSON.parse(fs.readFileSync(opts.phrasings || PHRASINGS, "utf8"));
  const L = buildLexicon(lex);
  const matcher = opts.matcher || buildMatcher({ dir: opts.dir });
  const titles = buildTitleIndex(matcher.meta, opts.aliases || path.join(HERE, "out", "film-aliases.json"));

  const GROUPS = {};
  for (const a of vocab.attributes) {
    const g = a.id.split(":")[0];
    (GROUPS[g] = GROUPS[g] || []).push(a.id);
  }
  const models = new Map();
  const model = (a) => {
    if (!models.has(a)) models.set(a, attributeModel(matcher.table, a));
    return models.get(a);
  };
  const labelOf = (a) => (phrasings.questions[a] && phrasings.questions[a].label) || a.split(":")[1].replace(/-/g, " ");

  /* How much does this film's reading on this attribute SAY? sigma is the
     surprisal match.js already scores with, so "distinctive" here means exactly
     what "pays well" means there — no second opinion about what matters. */
  function distinctive(filmKey, attrs, limit) {
    const rows = [];
    for (const a of attrs) {
      const v = matcher.table.value(filmKey, a);
      if (v === undefined || !(v > 0)) continue;
      rows.push({ attr: a, strength: v, sigma: model(a).sigmaAt(v) });
    }
    rows.sort((x, y) => y.sigma - x.sigma || y.strength - x.strength || x.attr.localeCompare(y.attr));
    return limit ? rows.slice(0, limit) : rows;
  }

  /* ── one pass, left to right, longest match wins ── */
  function parse(text, popts) {
    popts = popts || {};
    const wholeK = popts.likeTerms === undefined ? 4 : popts.likeTerms;
    const groupMin = popts.groupMin === undefined ? 2 : popts.groupMin;
    const toks = tokenise(text);
    const wall = walls(text, toks);
    const readings = [];
    const unread = [];
    const used = new Array(toks.length).fill(false);

    const tokenSpan = (i, j) => ({ start: toks[i].start, end: toks[j - 1].end });
    const say = (i, j) => text.slice(toks[i].start, toks[j - 1].end);

    /* Negation / degree look BACK from a match, never forward, and never across
       a wall. Looking forward would let "funny, not slow" negate "funny". */
    function modifiers(i) {
      let negate = false, weight = 1, negText = null, degText = null, from = i;
      for (let back = 1; back <= Math.max(NEG_WINDOW, DEGREE_WINDOW); back++) {
        const p = i - back;
        if (p < 0) break;
        if (wall.has(p + 1)) break;                 /* a comma between: stop */
        if (used[p]) break;                          /* another reading between */
        const t = toks[p].t;
        if (back <= NEG_WINDOW && L.neg.has(t) && !negate) { negate = true; negText = t; from = Math.min(from, p); }
        /* two-token degree phrases: "a bit", "kind of" */
        const two = p > 0 ? toks[p - 1].t + " " + t : null;
        if (back <= DEGREE_WINDOW && weight === 1) {
          if (L.up.has(t)) { weight = W_UP; degText = t; from = Math.min(from, p); }
          else if (L.down.has(t)) { weight = W_DOWN; degText = t; from = Math.min(from, p); }
          else if (two && L.down.has(two)) { weight = W_DOWN; degText = two; from = Math.min(from, p - 1); }
          else if (two && L.up.has(two)) { weight = W_UP; degText = two; from = Math.min(from, p - 1); }
        }
      }
      /* The span the reader sees is THEIR phrase, modifiers included: a chip
         reading "very spiritual" is correctable and a chip reading "spiritual"
         next to an invisible 1.5 is not. */
      return { negate, weight, negText, degText, from };
    }

    let i = 0;
    while (i < toks.length) {
      /* ── a film reference? cue first, then a title, or it is not one ── */
      let hit = null;
      for (const cue of L.cues) {
        const n = cue.toks.length;
        if (i + n > toks.length) continue;
        let ok = true;
        for (let d = 0; d < n; d++) if (toks[i + d].t !== cue.toks[d]) { ok = false; break; }
        if (!ok) continue;
        /* the title must start right after the cue; try longest first */
        let j0 = i + n;
        /* allow a dropped article between cue and title: "the mood of the matrix" */
        for (const skip of [0, 1]) {
          const s = j0 + skip;
          if (skip === 1 && (s > toks.length || !["the", "a", "an"].includes(toks[j0].t))) continue;
          for (let len = Math.min(titles.maxLen, toks.length - s); len >= 1; len--) {
            const name = toks.slice(s, s + len).map((x) => x.t).join(" ");
            const key = titles.resolved.get(name);
            if (!key) continue;
            hit = { cue, start: i, titleStart: s, end: s + len, key, name };
            break;
          }
          if (hit) break;
        }
        if (hit) break;
      }

      if (hit) {
        const { cue, key } = hit;
        const group = cue.group;
        let picked, widened = false, note = null;
        if (group) {
          picked = distinctive(key, GROUPS[group] || [], 0);
          if (picked.length < groupMin) {
            /* Widen only into the DECLARED neighbours of the named group. The
               rule and its reason live in query-lexicon.json: a reader who said
               "mood" may be given tone and texture, and may never be given
               mode:action, however distinctive the film's action is. */
            const near = (lex.filmRef.neighbourhood && lex.filmRef.neighbourhood[group]) || [group];
            const attrs = [];
            for (const g of near) for (const a of (GROUPS[g] || [])) attrs.push(a);
            const wider = distinctive(key, attrs, wholeK)
              .filter((r) => !picked.some((p) => p.attr === r.attr));
            const others = near.filter((g) => g !== group);
            note = (picked.length
              ? matcher.meta[key].title + " reads as " + picked.length + " " + group + " term" +
                (picked.length === 1 ? "" : "s") + " here"
              : matcher.meta[key].title + " has no " + group + " reading here") +
              (wider.length ? ", so its " + others.join(" and ") + " were read too" : "");
            picked = picked.concat(wider);
            widened = wider.length > 0;
          }
          picked = picked.slice(0, wholeK);
        } else {
          picked = distinctive(key, vocab.attributes.map((a) => a.id), wholeK);
        }
        for (let d = hit.start; d < hit.end; d++) used[d] = true;
        const mods = modifiers(hit.start);
        if (!picked.length) {
          unread.push({
            text: say(hit.start, hit.end), ...tokenSpan(hit.start, hit.end),
            why: "no consensus reading exists for " + matcher.meta[key].title,
          });
        } else {
          for (const r of picked) {
            readings.push({
              kind: "film",
              text: say(hit.start, hit.end),
              ...tokenSpan(hit.start, hit.end),
              film: { key, title: matcher.meta[key].title, year: matcher.meta[key].year },
              group: group || "everything",
              widened, note,
              terms: [r.attr],
              label: labelOf(r.attr),
              strength: r.strength,
              sigma: Math.round(r.sigma * 1000) / 1000,
              negate: mods.negate,
              /* a film pointer carries the film's own strength as the weight:
                 a term the film holds at 0.25 is a weaker instruction than one
                 it holds at 1, and pretending otherwise would let one faint
                 reading of one film outrank a thing the reader typed outright */
              weight: Math.round(r.strength * mods.weight * 100) / 100,
            });
          }
        }
        i = hit.end;
        continue;
      }

      /* ── a lexicon phrase? longest first ── */
      let matched = null;
      for (let len = Math.min(L.maxLen, toks.length - i); len >= 1; len--) {
        const phrase = toks.slice(i, i + len).map((x) => x.t).join(" ");
        let row = L.byPhrase.get(phrase);
        if (!row && len === 1 && phrase.length > 3 && phrase.endsWith("s")) {
          row = L.byPhrase.get(phrase.slice(0, -1));      /* the one stem: plural s */
        }
        if (row) { matched = { row, len }; break; }
      }
      if (matched) {
        const j = i + matched.len;
        const mods = modifiers(i);
        const inherent = matched.row.some((r) => r.polarity === "inherent");
        for (let d = mods.from; d < j; d++) used[d] = true;
        readings.push({
          kind: "phrase",
          text: say(mods.from, j),
          ...tokenSpan(mods.from, j),
          terms: matched.row.map((r) => r.attr),
          label: matched.row.map((r) => labelOf(r.attr)).join(" or "),
          /* "little dialogue" is already an absence. A reader who typed "no" in
             front of it meant it twice, not backwards. */
          negate: inherent ? false : mods.negate,
          negationRefused: inherent && mods.negate ? mods.negText : null,
          weight: mods.weight,
          degree: mods.degText,
        });
        i = j;
        continue;
      }

      i++;
    }

    /* ── everything the parse could not use, kept as spans ── */
    let runStart = -1;
    const flush = (end) => {
      if (runStart < 0) return;
      const t = say(runStart, end).trim();
      const meaningful = toks.slice(runStart, end).some((x) => !L.stop.has(x.t));
      if (t && meaningful) {
        unread.push({ text: t, start: toks[runStart].start, end: toks[end - 1].end, why: "not in the vocabulary" });
      }
      runStart = -1;
    };
    for (let k = 0; k < toks.length; k++) {
      if (used[k]) { flush(k); continue; }
      if (runStart < 0) runStart = k;
      if (wall.has(k + 1)) flush(k + 1);
    }
    flush(toks.length);

    /* ── readings become clauses; one attribute is asked for once ──
       Two spans landing on the same attribute is the reader saying it twice
       ("spiritual, and about faith"). That is emphasis, not two demands, so the
       weights are combined by MAX rather than summed — summing would let a
       repeated word out-shout a rarer one, which is the thing rarity weighting
       exists to prevent. A contradiction (said and un-said) is kept and
       reported: the interface must show it, not silently pick a side. */
    const clauses = [];
    const seen = new Map();
    const conflicts = [];
    for (const r of readings) {
      const sig = (r.negate ? "!" : "") + r.terms.join("|");
      const opp = (r.negate ? "" : "!") + r.terms.join("|");
      if (seen.has(opp)) conflicts.push({ terms: r.terms.slice(), text: r.text, against: seen.get(opp).text });
      if (seen.has(sig)) {
        const c = seen.get(sig).clause;
        c.weight = Math.max(c.weight, r.weight);
        seen.get(sig).spans.push(r.text);
        r.clause = c;
        continue;
      }
      const c = {
        anyOf: r.terms.slice(),
        weight: r.weight,
        negate: r.negate,
        label: r.label,
        said: r.text,
      };
      clauses.push(c);
      seen.set(sig, { clause: c, text: r.text, spans: [r.text] });
      r.clause = c;
    }

    return {
      text, readings, unread, clauses, conflicts,
      /* the query in match.js's own shape. Negated clauses are rendered with
         questioner.js's `not:` prefix, which only its complement-aware table
         understands — a plain match.js matcher must be handed `positive()`. */
      query: () => clauses.map((c) => ({
        anyOf: c.negate ? c.anyOf.map((a) => "not:" + a) : c.anyOf.slice(),
        weight: c.weight,
        label: (c.negate ? "not " : "") + c.label,
      })),
      positive: () => clauses.filter((c) => !c.negate).map((c) => ({
        anyOf: c.anyOf.slice(), weight: c.weight, label: c.label,
      })),
    };
  }

  return { parse, titles, lexicon: L, matcher, vocab, phrasings, labelOf, distinctive, GROUPS };
}

/* ──────────────────────────────────────────────────────────────────── selftest

   Six cases, and every one of them is a bug this file already had or a rule it
   would be easy to break. They run in ~1s against the real shards.            */

function selftest() {
  const P = buildParser();
  const fails = [];
  const check = (name, cond, detail) => {
    if (!cond) fails.push(name + (detail ? " — " + detail : ""));
    console.log((cond ? "  ok   " : "  FAIL ") + name + (detail ? "   " + detail : ""));
  };

  /* 1. the owner's own trap */
  let r = P.parse("little dialogue");
  check("'little dialogue' is sparse-dialogue, not a negation",
    r.clauses.length === 1 && r.clauses[0].anyOf[0] === "texture:sparse-dialogue" && !r.clauses[0].negate,
    JSON.stringify(r.clauses));

  /* 2. and it survives a reader saying it twice */
  r = P.parse("no dialogue");
  check("'no dialogue' is not double-negated",
    r.clauses.length === 1 && !r.clauses[0].negate && r.readings[0].negationRefused === null,
    JSON.stringify(r.clauses));

  /* 3. real negation still works */
  r = P.parse("not funny");
  check("'not funny' negates", r.clauses.length === 1 && r.clauses[0].negate &&
    r.clauses[0].anyOf[0] === "tone:comic", JSON.stringify(r.clauses));

  /* 4. a comma is a wall */
  r = P.parse("not funny, hopeful");
  check("negation does not cross a comma",
    r.clauses.length === 2 && r.clauses[0].negate === true && r.clauses[1].negate === false,
    JSON.stringify(r.clauses.map((c) => (c.negate ? "!" : "") + c.anyOf[0])));

  /* 5. ambiguity is expressed, not resolved */
  r = P.parse("fast");
  check("'fast' is one anyOf clause over both pace terms",
    r.clauses.length === 1 && r.clauses[0].anyOf.length === 2, JSON.stringify(r.clauses[0]));

  /* 6. a film pointer reads the film, and says when it widened */
  r = P.parse("the mood of the matrix");
  const fromFilm = r.readings.filter((x) => x.kind === "film");
  check("'the mood of the matrix' resolves to The Matrix",
    fromFilm.length > 0 && fromFilm[0].film.key === "the matrix", JSON.stringify(fromFilm.map((x) => x.terms[0])));
  check("a thin group is reported as widened, never silently",
    fromFilm.some((x) => x.widened) && fromFilm[0].note, fromFilm[0] && fromFilm[0].note);

  /* 7. an unknown phrase is admitted, not dropped */
  r = P.parse("something quixotic and unrepeatable");
  check("an unmatched phrase becomes an unread span", r.unread.length > 0,
    JSON.stringify(r.unread.map((u) => u.text)));

  /* 8. degree moves the weight */
  const a = P.parse("spiritual").clauses[0].weight;
  const b = P.parse("very spiritual").clauses[0].weight;
  check("'very' outweighs plain", b > a, a + " -> " + b);

  console.log(fails.length ? "\nSELFTEST FAIL (" + fails.length + ")" : "\nSELFTEST PASS");
  return fails.length === 0;
}

/* ───────────────────────────────────────────────────────────────── measurement

   Three things worth a number, and the second is the one that would sink this
   file if it read badly.                                                      */

function measure() {
  const P = buildParser();
  const attrs = P.vocab.attributes.map((a) => a.id);

  /* 1. coverage: how many of the 59 attributes can be reached by typing? */
  const reach = new Set();
  for (const row of P.lexicon.byPhrase.values()) for (const r of row) reach.add(r.attr);
  console.log("reachable attributes   " + reach.size + " of " + attrs.length);
  const missing = attrs.filter((a) => !reach.has(a));
  if (missing.length) console.log("  unreachable: " + missing.join(", "));

  /* 2. collisions: a phrase that means two different things. These are not bugs
     by themselves — "fast" really is two pace terms — but a collision ACROSS
     groups is, because it means the lexicon is guessing. */
  let within = 0, across = 0;
  const acrossList = [];
  for (const [p, row] of P.lexicon.byPhrase) {
    if (row.length < 2) continue;
    const groups = new Set(row.map((r) => r.attr.split(":")[0]));
    if (groups.size > 1) { across++; acrossList.push(p + " -> " + row.map((r) => r.attr).join(", ")); }
    else within++;
  }
  console.log("phrases                " + P.lexicon.byPhrase.size +
    "   ambiguous within a group " + within + "   ACROSS groups " + across);
  for (const a of acrossList) console.log("  across: " + a);

  /* 3. titles reachable, and how many names had to be dropped for ambiguity */
  console.log("film names             " + P.titles.size + " resolve to one film; " +
    P.titles.ambiguous + " dropped as ambiguous");

  /* 4. the corpus's own descriptions, run through the parser. Not a proxy for
     reader language — it is the only large body of film-talk on hand, and what
     it measures is whether the lexicon fires on prose it was not written for. */
  const meta = P.matcher.meta;
  let hits = 0, films = 0, spans = 0;
  for (const k of Object.keys(meta).slice(0, 400)) {
    const d = meta[k].title;
    const r = P.parse(d);
    films++;
    if (r.clauses.length) { hits++; spans += r.clauses.length; }
  }
  console.log("titles that parse to a clause (a false-positive probe)  " + hits + " of " + films +
    "   " + (hits ? (spans / hits).toFixed(2) : 0) + " clauses each");
  console.log("  a HIGH number here is bad: a film title is not a query, and a lexicon that fires");
  console.log("  on 'Days of Heaven' is a lexicon that will fire on anything.");
}

/* ─────────────────────────────────────────────────────────────────────── CLI */

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) { process.exit(selftest() ? 0 : 1); }
  if (argv.includes("--measure")) { measure(); return; }
  const text = argv.filter((a) => !a.startsWith("--")).join(" ");
  if (!text) {
    console.log("usage: node pipeline/query-parse.js \"<what a reader would type>\"");
    console.log("       node pipeline/query-parse.js --selftest | --measure");
    return;
  }
  const P = buildParser();
  const r = P.parse(text);
  console.log("\ntyped: " + JSON.stringify(text) + "\n");
  for (const rd of r.readings) {
    const arrow = rd.negate ? "  ->  NOT " : "  ->  ";
    console.log("  " + JSON.stringify(rd.text).padEnd(28) + arrow + rd.terms.join(" | ") +
      "   (" + rd.label + ")" + (rd.weight !== 1 ? "  weight " + rd.weight : "") +
      (rd.kind === "film" ? "   [from " + rd.film.title + ", strength " + rd.strength + "]" : ""));
    if (rd.note) console.log("       note: " + rd.note);
    if (rd.negationRefused) console.log("       refused to negate: '" + rd.negationRefused +
      "' in front of a phrase that already means the absence");
  }
  for (const u of r.unread) console.log("  " + JSON.stringify(u.text).padEnd(28) + "  ->  (unread: " + u.why + ")");
  for (const c of r.conflicts) console.log("  CONFLICT: " + c.text + " against " + c.against);
  console.log("\nquery: " + JSON.stringify(r.query()));
}

module.exports = { buildParser, buildTitleIndex, buildLexicon, norm, tokenise, selftest, measure };

if (require.main === module) main();
