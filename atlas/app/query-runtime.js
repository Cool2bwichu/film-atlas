#!/usr/bin/env node
/* query-runtime.js — the typed search, assembled into one thing the page can hold.
 *
 *   const { buildFind } = require("./query-runtime.js");
 *   const FIND = buildFind({ packed: ATTRS, keys: KEYS, meta: CORPUS.films, facets: DISCOVERY });
 *   const r = FIND.run("fast pacing, a hopeful tone, little dialogue, very spiritual");
 *   r.drawable   // false means REFUSE — r.refusal says which of the four it is
 *   r.scores     // { filmKey -> 0..1 } for EVERY film. Nothing is ever filtered.
 *   r.offers     // what the sentence did not say, ranked by what asking would buy
 *
 * CLI:
 *   node atlas/app/query-runtime.js "a tense 70s conspiracy thriller with a twist"
 *   node atlas/app/query-runtime.js --selftest
 *   node atlas/app/query-runtime.js --battery          # the offer measure, six sentences
 *
 * ── WHY THIS FILE EXISTS AND WHAT IT REFUSES TO DO ───────────────────────────
 *
 * match.js scores. layout-match.js places. query-parse.js reads a sentence.
 * None of them decides whether the reading is worth drawing, and that decision
 * is the whole difference between a search and a machine that always answers.
 * Four things are refused here, each measured, each with its own sentence:
 *
 *   1. NOTHING READ.        match.js throws "match: empty query" on []. A reader
 *                           who typed "a good western" must get the atlas's own
 *                           admission, not an exception.
 *   2. NEGATION ONLY.       "nothing violent" scores perfectly well and is a lie:
 *                           1,346 of 2,204 films tie at exactly 1.000, so the
 *                           inner ring would hold 61% of the corpus. Measured.
 *   3. OUT OF VOCABULARY.   attributeModel returns {known:0, sigmaMax:0, prior:0}
 *                           for a term nobody has, so a typo contributes to
 *                           NEITHER numerator nor denominator and the scorer
 *                           reports nothing. Validation happens here, against the
 *                           59 closed ids, or it happens nowhere.
 *   4. THIN NEAR BAND.      Not a refusal — a notice. `setting:space` alone puts
 *                           30 of the top 60 on films the corpus has NO opinion
 *                           about, floating on unknown-prior credit. An answer
 *                           that confident about films nobody read is AGENTS
 *                           rule 3 in its sharpest form, and the count is
 *                           printed rather than buried.
 *
 * ── THE ONE WIRE THAT INVERTS IF YOU GET IT WRONG ────────────────────────────
 *
 * query-parse.js emits `negate` on a clause. match.js has never heard of it.
 * Handing the raw clauses to a plain matcher makes every "no X" mean "yes X" —
 * "nothing violent" returns Salo, Straw Dogs and Saving Private Ryan at 1.000.
 * The only correct handle is r.query() against withComplements(buildTable(...)),
 * and this file builds that table once and never exposes a plain one.
 *
 * ── THE RECORD CHANNEL, WHICH MARKS AND NEVER MOVES ──────────────────────────
 *
 * "a good western" names something the corpus knows perfectly well and the
 * consensus vocabulary deliberately excludes. Genre, era, cinema and director
 * are RECORD (AGENTS rule 8); the 59 attributes are READING. They must never be
 * folded into one 0..1 number, so they are not scored at all: they ring the
 * films they name and leave every radius alone. The caption says "marked, not
 * moved", which is the literal truth about the geometry.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { buildMatcher, buildTable, attributeModel } = require("../pipeline/match.js");
const { withComplements } = require("../pipeline/questioner.js");
const { buildParser } = require("../pipeline/query-parse.js");

const RUNTIME_VERSION = "find-v1";

/* THE FIVE RUNGS ARE FIVE, NOT FOUR. The attributor was asked for
   0.25/0.5/0.75/1.0 and three films in the shards sit at 0.6. Coercing them to
   0.5 to make the ladder tidy would be a silent data edit, so the rung table is
   read off the data at pack time and asserted against this list. */
const RUNGS = [0.25, 0.5, 0.6, 0.75, 1];

/* One character per attribute index and one per rung, so a film's whole reading
   is a string of even length and the decoder needs no separators. 64 symbols
   against 59 attributes, and the alphabet excludes the comma the row join uses. */
const SYM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const symIndex = new Map([...SYM].map((c, i) => [c, i]));

const NEAR = 60;            /* the front of the sky an offer is measured against */
const OFFER_ROW = 4;        /* doors, never more than the row can hold           */
const OFFER_PER_GROUP = 2;  /* diversity ACROSS the row, not a restriction on the pool */

/* ══ THE ATTRIBUTE TABLE ON THE WIRE ═══════════════════════════════════════

   THE SHARD BOUNDARY IS THE PAYLOAD'S ONLY HARD CONSTRAINT. Only the known
   shard declares a `vocabulary`, and that is what makes silence there mean
   known-absent while silence in the outline shard means unknown. Merging the
   three — or pointing the runtime at consensus.json, which declares all 59
   terms over all 2,204 films — converts 484 honest unknowns into confident
   zeros. Measured on the reference query: films scoring above zero drops from
   1,090 to 606, same scorer, same query, no error anywhere. So the tier byte
   below is not compression bookkeeping. It is the epistemics, on the wire.

   Films ride in CORPUS KEY ORDER and carry no key, because the page already
   holds the key list; 2,204 keys is 44 KB of a 49 KB payload otherwise. */

function packAttributes(shards, keys) {
  const vocab = [...new Set(shards.flatMap((s) => s.vocabulary || []))].sort();
  const idx = new Map(vocab.map((a, i) => [a, i]));
  const tier = [];
  const rows = [];
  let unseen = 0;
  const seenRungs = new Set();
  for (const k of keys) {
    let t = -1, rec = null;
    for (let s = 0; s < shards.length; s++) {
      const r = shards[s].films && shards[s].films[k];
      if (r !== undefined) { t = s; rec = r; break; }
    }
    if (t < 0) { tier.push("9"); rows.push(""); unseen++; continue; }
    tier.push(String(t));
    /* PASSED IS NOT THE SAME AS EMPTY, and conflating them costs a film its
       tier. 378 outline films list no attribute at all — the model looked and
       had nothing to say inside a shard that declares no vocabulary, which is
       UNKNOWN on every term. A `passed` film is one the model did not know at
       all. Both serialise to no pairs, so passed takes its own marker. */
    if (rec && rec.passed) { rows.push("-"); continue; }
    const parts = [];
    for (const [a, w] of Object.entries((rec && rec.attrs) || {})) {
      const ai = idx.get(a);
      if (ai === undefined) throw new Error("query-runtime: shard attribute outside the declared vocabulary: " + a);
      const ri = RUNGS.indexOf(Number(w));
      if (ri < 0) throw new Error("query-runtime: strength " + w + " is not one of the " + RUNGS.length + " rungs");
      seenRungs.add(Number(w));
      parts.push(SYM[ai] + SYM[ri]);
    }
    rows.push(parts.join(""));
  }
  if (vocab.length > SYM.length) throw new Error("query-runtime: the symbol alphabet holds " + SYM.length + " terms, the vocabulary has " + vocab.length);
  return {
    version: 1,
    a: vocab,
    r: RUNGS,
    /* which shard each film came from, and which of those shards declares a
       vocabulary — the receiving end rebuilds three objects, not one */
    d: shards.map((s) => (s.vocabulary ? 1 : 0)),
    t: tier.join(""),
    f: rows.join(","),
    unseen,
    rungsUsed: [...seenRungs].sort((x, y) => x - y),
  };
}

function unpackAttributes(packed, keys) {
  const vocab = packed.a;
  const rungs = packed.r;
  const rows = packed.f.split(",");
  if (rows.length !== keys.length) {
    throw new Error("query-runtime: packed attributes hold " + rows.length + " films, the corpus holds " + keys.length);
  }
  const shards = packed.d.map((declares) => (declares ? { vocabulary: vocab.slice(), films: {} } : { films: {} }));
  for (let i = 0; i < keys.length; i++) {
    const t = packed.t.charCodeAt(i) - 48;
    if (t < 0 || t >= shards.length) continue;      /* 9 = in no shard: stays unseen */
    const row = rows[i];
    if (row === "-") { shards[t].films[keys[i]] = { passed: true }; continue; }
    const attrs = {};
    if (row.length % 2) throw new Error("query-runtime: packed reading of odd length for " + keys[i]);
    for (let c = 0; c < row.length; c += 2) {
      const a = vocab[symIndex.get(row[c])];
      const g = rungs[symIndex.get(row[c + 1])];
      if (a === undefined || g === undefined) throw new Error("query-runtime: packed reading out of range for " + keys[i]);
      attrs[a] = g;
    }
    shards[t].films[keys[i]] = { attrs };
  }
  return shards;
}

/* ══ THE RECORD CHANNEL ════════════════════════════════════════════════════

   Built from the artifact's own facet definitions, so it costs no new bytes and
   cannot describe a corpus that is not on screen. Director is included here and
   excluded from the re-form panel for opposite reasons that are both right: 888
   values is a directory rather than a filter, and it is exactly what a person
   types.                                                                    */

const MARK_FIELDS = ["genre", "movement", "director", "country", "era"];

/* Reader words the facet labels do not carry themselves. Era is the case that
   matters — nobody types "1960–79". */
const MARK_SYNONYM = {
  "genre:science-fiction": ["sci fi", "scifi", "science fiction"],
  "genre:documentary": ["docs", "doc", "documentaries"],
  "genre:animation": ["animated", "cartoon", "cartoons", "anime"],
  "genre:historical": ["period", "period piece", "historical"],
  "genre:western": ["westerns"],
  "genre:horror": ["horrors"],
  "genre:musical": ["musicals"],
  "era:silent-early": ["silent era", "silent film", "silent films", "silents"],
  "era:1930-1959": ["30s", "1930s", "40s", "1940s", "50s", "1950s", "thirties", "forties", "fifties", "golden age"],
  "era:1960-1979": ["60s", "1960s", "70s", "1970s", "sixties", "seventies"],
  "era:1980-1999": ["80s", "1980s", "90s", "1990s", "eighties", "nineties"],
  "era:2000-present": ["2000s", "modern", "recent", "contemporary", "this century"],
};

const markNorm = (s) => String(s).toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

function buildMarkIndex(disco) {
  const byPhrase = new Map();
  let maxLen = 1;
  const defs = (disco && disco.facets && disco.facets.definitions) || {};
  const put = (phrase, field, value) => {
    const n = markNorm(phrase);
    if (!n || n.length < 3) return;                 /* "us", "uk" are too collidable */
    const len = n.split(" ").length;
    if (len > maxLen) maxLen = len;
    if (!byPhrase.has(n)) byPhrase.set(n, []);
    const row = byPhrase.get(n);
    if (!row.some((r) => r.field === field && r.value === value)) row.push({ field, value });
  };
  for (const field of MARK_FIELDS) {
    const d = defs[field];
    if (!d || !d.values) continue;
    for (const [value, v] of Object.entries(d.values)) {
      if (value.endsWith(":unknown")) continue;
      if (!(v.count === undefined || v.count > 0)) continue;
      put(v.label, field, value);
      for (const s of (MARK_SYNONYM[value] || [])) put(s, field, value);
    }
  }
  /* A phrase that names two different things is not a mark, it is a coin toss.
     "Drama" is one genre; a director surname shared by two directors is not. */
  const resolved = new Map();
  let dropped = 0;
  for (const [n, row] of byPhrase) {
    if (row.length !== 1) { dropped++; continue; }
    resolved.set(n, row[0]);
  }
  return { byPhrase: resolved, maxLen, dropped };
}

/* Postings are indices into DISCOVERY.filmOrder (permanent film ids). Corpus
   keys are what everything else in the search speaks. Translate once. */
function markKeys(disco, field, value) {
  const rows = disco && disco.facets && disco.facets.postings
    && disco.facets.postings[field] && disco.facets.postings[field][value];
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const i of rows) {
    const id = disco.filmOrder[i];
    const k = id && disco.keyByFilmId[id];
    if (k) out.push(k);
  }
  return out;
}

/* ══ THE SEARCH ════════════════════════════════════════════════════════════ */

function buildFind(opts) {
  opts = opts || {};
  const meta = opts.meta || JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "static", "corpus.json"), "utf8")).films;
  const keys = opts.keys || Object.keys(meta);
  const disco = opts.facets || (() => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "static", "discovery.json"), "utf8")); }
    catch (_e) { return null; }
  })();

  let shards = opts.shards;
  if (!shards && opts.packed) shards = unpackAttributes(opts.packed, keys);
  if (!shards) {
    const dir = opts.dir || path.join(__dirname, "..", "pipeline", "out");
    shards = ["known", "outline", "unknown"].map((n) =>
      JSON.parse(fs.readFileSync(path.join(dir, "consensus.shard-" + n + ".json"), "utf8")));
  }
  const declaring = shards.filter((s) => s.vocabulary).length;
  if (declaring !== 1) {
    throw new Error("query-runtime: exactly one shard may declare a vocabulary, " + declaring + " do. "
      + "Merging them turns 484 honest unknowns into confident zeros.");
  }

  const plain = buildTable(shards, keys);
  const table = withComplements(plain);
  const matcher = buildMatcher({ table, meta });
  const vocab = opts.vocab || JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "pipeline", "consensus-vocab.json"), "utf8"));
  const VOCAB_IDS = new Set(vocab.attributes.map((a) => a.id));
  const GLOSS = Object.create(null);
  for (const a of vocab.attributes) GLOSS[a.id] = { gloss: a.gloss, not: a.not };

  /* buildParser takes PATHS for its three JSONs (the virtual filesystem in the
     browser resolves them by basename); only the matcher is handed over as an
     object, so the parser ranks distinctiveness with the same sigma the scorer
     pays out. */
  const parser = buildParser(Object.assign({ matcher }, opts.parser || {}));
  const marks = buildMarkIndex(disco);

  /* One model per attribute and per complement, built once. The offer shortlist
     is 118 branches of pure arithmetic off these; rebuilding them per query is
     the difference between 30 ms and 700 ms. */
  const models = new Map();
  const modelFor = (a) => {
    if (!models.has(a)) models.set(a, attributeModel(table, a));
    return models.get(a);
  };

  const labelOf = (a) => parser.labelOf(a);
  const questionOf = (a) => {
    const q = parser.phrasings && parser.phrasings.questions && parser.phrasings.questions[a];
    return (q && (q.question || q.ask)) || null;
  };

  /* ── the record channel over the spans the reading could not use ── */
  function readMarks(unread) {
    const found = [];
    const rest = [];
    for (const u of unread) {
      if (u.guarded) { rest.push(u); continue; }
      const toks = markNorm(u.text).split(" ").filter(Boolean);
      let i = 0, any = false;
      let run = [];
      const flushRun = () => {
        if (!run.length) return;
        rest.push({ text: run.join(" "), why: u.why, kind: u.kind || "unknown" });
        run = [];
      };
      while (i < toks.length) {
        let hit = null;
        for (let len = Math.min(marks.maxLen, toks.length - i); len >= 1; len--) {
          const phrase = toks.slice(i, i + len).join(" ");
          const m = marks.byPhrase.get(phrase);
          if (m) { hit = { m, len, said: toks.slice(i, i + len).join(" ") }; break; }
        }
        if (hit) {
          flushRun();
          if (!found.some((f) => f.field === hit.m.field && f.value === hit.m.value)) {
            const ks = markKeys(disco, hit.m.field, hit.m.value);
            found.push({
              field: hit.m.field, value: hit.m.value, said: hit.said,
              label: (disco.facets.definitions[hit.m.field].values[hit.m.value] || {}).label || hit.m.value,
              fieldLabel: disco.facets.definitions[hit.m.field].label || hit.m.field,
              keys: ks, count: ks.length,
            });
          }
          any = true;
          i += hit.len;
          continue;
        }
        run.push(toks[i]); i++;
      }
      flushRun();
      if (!any && !rest.some((r) => r.text === u.text)) { /* nothing found: keep the original span verbatim */ }
    }
    return { marks: found, unread: rest };
  }

  /* ── the closed form. Verified against a full re-score in --selftest ──
     Adding one clause to a scored query moves every film by arithmetic already
     on the table: score' = clamp((raw + w*credit)/(denom + w*sigmaMax), 0, 1).
     No re-score, no second pass over the shards. */
  function shiftedTop(res, attr, w, n) {
    const M = modelFor(attr);
    if (!(M.sigmaMax > 0)) return null;
    const out = [];
    for (const k of keys) {
      const d = res.explain(k);
      if (!d) continue;
      const v = table.value(k, attr);
      const credit = v === undefined ? M.prior : M.sigmaAt(v);
      const den = d.denom + w * M.sigmaMax;
      const s = den > 0 ? Math.max(0, Math.min(1, (d.raw + w * credit) / den)) : 0;
      out.push([k, s]);
    }
    out.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return out.slice(0, n).map((r) => r[0]);
  }

  /* ── the offers ──
     THE CURRENCY IS INFLUX, NOT INFORMATION. A wall filters and a question that
     clears half the set is worth a bit. This sky never filters, so the only
     thing a question can buy the reader is a different set of films at the
     FRONT of it: how many of the sixty nearest would be films that are not
     there now. bits measures set-clearing and would be measuring a wall.

     THERE IS NO SLOT RULE, and that is a correction rather than an omission.
     Restricting the offer to namespaces the reader was silent in sounds honest
     and is a rule-1 defect: a sentence written in the interior vocabulary
     (pace/tone/mood/texture/subject) leaves mode and setting silent, and those
     are the two most fame-loaded namespaces in the vocabulary. find-probe.mjs
     measures the fame of the films each offer brings in, against the band they
     join, and that measurement is what keeps this checkable. */
  function offersFor(res, band, w, spent) {
    const B = new Set(band);
    const rows = [];
    for (const attr of VOCAB_IDS) {
      if (spent.has(attr)) continue;
      const M = modelFor(attr);
      if (!(M.known > 0)) continue;
      /* q — how much the near band already holds this, over the films in it the
         corpus has a reading for. Films with no reading are not evidence either
         way and are counted separately, because a question aimed at a band the
         corpus never read is a question about nothing. */
      let sum = 0, seen = 0;
      for (const k of band) {
        const v = table.value(k, attr);
        if (v === undefined) continue;
        sum += v; seen++;
      }
      if (seen < band.length * 0.75) continue;          /* the coverage guard */
      const q = seen ? sum / seen : 0;
      const yes = shiftedTop(res, attr, w, NEAR);
      const no = shiftedTop(res, "not:" + attr, w, NEAR);
      if (!yes || !no) continue;
      const newYes = yes.filter((k) => !B.has(k)).length / NEAR;
      const newNo = no.filter((k) => !B.has(k)).length / NEAR;
      const value = q * newYes + (1 - q) * newNo;
      rows.push({
        attr, group: attr.split(":")[0], label: labelOf(attr), question: questionOf(attr),
        gloss: GLOSS[attr] ? GLOSS[attr].gloss : "", not: GLOSS[attr] ? GLOSS[attr].not : "",
        value, newYes, newNo, q, coverage: seen / band.length,
        brings: yes.filter((k) => !B.has(k)).slice(0, 3),
      });
    }
    rows.sort((a, b) => b.value - a.value || a.attr.localeCompare(b.attr));
    return rows;
  }

  /* Both floors are query-dependent on purpose. A fixed threshold turns the
     offer row into a fixed list the moment the corpus changes shape; the second
     floor asks the scale-free question — does anything stand out from the 58
     other things we could have asked. Falling silent is a legitimate outcome.
     The numbers are product judgements, not derivations; --battery re-measures
     them and find-probe.mjs asserts the row is not a fixed list. */
  const OFFER_FLOOR = 0.08;
  const OFFER_STANDOUT = 1.8;

  function pickOffers(rows) {
    if (!rows.length) return [];
    const med = rows.map((r) => r.value).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
    const out = [];
    const perGroup = new Map();
    for (const r of rows) {
      if (out.length >= OFFER_ROW) break;
      if (r.value < OFFER_FLOOR) break;
      if (med > 0 && r.value < med * OFFER_STANDOUT) break;
      const n = perGroup.get(r.group) || 0;
      if (n >= OFFER_PER_GROUP) continue;
      perGroup.set(r.group, n + 1);
      out.push(r);
    }
    /* The row must span at least two namespaces or it is one question asked
       four ways. One offer alone is allowed; two from one group are not. */
    if (out.length > 1 && new Set(out.map((r) => r.group)).size < 2) return out.slice(0, 1);
    return out;
  }

  /* ── the tension note ──
     A clause whose retraction churns the front of the sky, on an attribute the
     top of that sky does not actually hold, is the reader's own sentence
     arguing with itself. Measured on the owner's: dropping "fast pacing" churns
     a third of the front 60 and leaves the top three unchanged, which means the
     "fast" is already not being honoured. That is a FACT ABOUT THE QUERY, not a
     question — it goes on the chip they can already take back, never in the
     offer row. */
  function tensionFor(query, res, band, i) {
    if (query.length < 2) return null;
    const without = query.filter((_c, j) => j !== i);
    if (!without.length) return null;
    const r2 = matcher.score(without);
    const top2 = keys.slice().sort((a, b) => r2.scores[b] - r2.scores[a] || a.localeCompare(b)).slice(0, NEAR);
    const B = new Set(band.slice(0, NEAR));
    const churn = top2.filter((k) => !B.has(k)).length / NEAR;
    /* HOW MUCH THE FRONT ACTUALLY HOLDS IT, read off explain() rather than
       re-derived: per[i] is this clause's own state on that film, so an anyOf
       is already resolved to whichever term paid best. */
    let sum = 0, n = 0;
    for (const k of band.slice(0, 10)) {
      const d = res.explain(k);
      if (!d || !d.per[i]) continue;
      sum += d.per[i].state === "unknown" ? 0 : d.per[i].value;
      n++;
    }
    const honoured = n ? sum / n : 0;
    if (churn < 0.25 || honoured >= 0.35) return null;
    return { churn: Math.round(churn * 1000) / 1000, honoured: Math.round(honoured * 1000) / 1000 };
  }

  /* ── the whole thing ── */
  function run(text, ropts) {
    ropts = ropts || {};
    const taken = ropts.taken || [];        /* [{attr, weight}] offers accepted */
    const spentIn = ropts.spent || [];      /* attributes never to offer again  */
    const parsed = parser.parse(String(text || ""));
    const { marks: found, unread } = readMarks(parsed.unread);

    /* OUT OF VOCABULARY. The scorer will not tell us — an unseen attribute has
       ceiling 0 and contributes to neither numerator nor denominator, so a typo
       is not a wrong answer, it is an invisible one. */
    const dropped = [];
    const clauses = [];
    for (const c of parsed.clauses) {
      const bad = c.anyOf.filter((a) => !VOCAB_IDS.has(a));
      if (bad.length) { dropped.push({ said: c.said, terms: bad }); continue; }
      clauses.push(c);
    }

    const readings = parsed.readings.map((r) => ({
      said: r.text, start: r.start, end: r.end, kind: r.kind,
      terms: r.terms.slice(), label: r.label, negate: !!r.negate, weight: r.weight,
      note: r.note || null, degree: r.degree || null,
      negationRefused: r.negationRefused || null,
      film: r.film || null, strength: r.strength === undefined ? null : r.strength,
      glosses: r.terms.filter((a) => GLOSS[a]).map((a) => ({ attr: a, label: labelOf(a), ...GLOSS[a] })),
    })).filter((r) => r.terms.every((a) => VOCAB_IDS.has(a)));

    const positive = clauses.filter((c) => !c.negate);
    const base = {
      text: String(text || ""), readings, unread, marks: found, dropped,
      conflicts: parsed.conflicts, taken: taken.slice(),
    };

    if (!clauses.length) {
      return Object.assign(base, {
        drawable: false,
        refusal: found.length
          ? { code: "record-only",
              headline: "Nothing here moves the sky, but the record answers.",
              detail: found.map((m) => m.count + " " + m.label).join(" · ")
                + " — marked where they already are. The atlas has an opinion about how a film "
                + "feels; genre and decade are filing facts, and folding them into the same "
                + "number would be the interface pretending they are the same kind of claim." }
          : { code: "no-reading",
              headline: "None of those words are in this atlas's vocabulary yet.",
              detail: "It knows 59 things about how a film feels — its pace, its tone, its mood, "
                + "what it is about, the shape of its story, its texture, its structure, "
                + "its setting and its mode. Nothing about runtime, language, colour, cast "
                + "or certificate." },
        marksOnly: found.length > 0,
      });
    }
    if (!positive.length) {
      /* A negation-only query scores and the picture is a lie. The complement of
         a rare attribute is a common one, so "no X" is nearly free and separates
         nearly nobody: measured, "nothing violent" alone puts 1,346 of 2,204
         films at exactly 1.000 and the top 60 are 60 films tied at 1.000,
         alphabetical from "10 on ten". */
      const r = matcher.score(parsed.query());
      let tied = 0;
      for (const k of keys) if (r.scores[k] >= 0.999999) tied++;
      return Object.assign(base, {
        drawable: false,
        refusal: { code: "negation-only",
          headline: "That is a fence, not a place.",
          detail: tied + " of " + keys.length + " films are equally not that, so they would all "
            + "sit at the same distance. Say one thing you do want and the fence will hold "
            + "alongside it." },
        tied,
      });
    }

    const query = parsed.query();
    for (const t of taken) query.push({ anyOf: [t.attr], weight: t.weight || 1, label: labelOf(t.attr) });
    const res = matcher.score(query);
    const denom = (res.explain(keys[0]) || {}).denom || 0;
    if (!(denom > 0)) {
      return Object.assign(base, {
        drawable: false,
        refusal: { code: "no-denominator",
          headline: "Nothing this atlas has an opinion about was named.",
          detail: "Every term in that reading is unknown to the corpus, so every film would "
            + "sit at the same distance." },
      });
    }

    const ranked = res.ranked();
    const band = ranked.slice(0, NEAR);

    /* A CLAUSE WHOSE CEILING NOBODY REACHES CAPS THE WHOLE QUERY, and the
       reader should be told rather than left to wonder why the best answer is
       0.381. sigma is read off each attribute's own tail, so an attribute
       nobody holds at full strength has its ceiling set by a maximum that does
       not exist in the corpus: tone:hopeful has two films at 1.0 and pace:brisk
       has none at all. */
    const ceilings = res.clauses.map((c) => {
      let max = 0, atTop = 0;
      for (const t of c.terms) {
        const M = modelFor(t);
        if (M.max > max) max = M.max;
      }
      for (const k of keys) {
        for (const t of c.terms) { if (table.value(k, t) === 1) { atTop++; break; } }
      }
      return { label: c.label, terms: c.terms, maxHeld: max, filmsAtFull: atTop, reachable: max >= 1 };
    });
    const capped = ceilings.filter((c) => !c.reachable);

    /* Ties at the front are a tie, never a ranking. */
    const topScore = res.scores[ranked[0]];
    let tiedAtTop = 0;
    for (const k of keys) if (res.scores[k] === topScore) tiedAtTop++;

    /* AGENTS RULE 3, AT ITS SHARPEST. Coverage is read off explain(), never off
       geometry. A film the corpus never read sits on prior credit alone and is
       drawn at a radius indistinguishable from a film it read and agreed with. */
    let blind = 0, thin = 0;
    for (const k of band) {
      const d = res.explain(k);
      if (!d) continue;
      if (d.coverage === 0) blind++;
      else if (d.coverage < 0.5) thin++;
    }

    /* THE OFFERS AND THE TENSION NOTE ARE NOT ON THE CRITICAL PATH, and
       computing them here would put 300-400 ms of arithmetic in front of the
       flight the reader is waiting to watch. `deepen()` is called after the
       constellation has settled; until then `offers` is an empty row and the
       slate simply does not have that section yet. */
    const w = query.reduce((a, c) => a + (c.weight === undefined ? 1 : c.weight), 0) / query.length;
    const spent = new Set(spentIn);
    for (const c of query) for (const a of (c.anyOf || [])) spent.add(String(a).replace(/^not:/, ""));
    for (const t of taken) spent.add(t.attr);

    let deepened = false;
    const out = Object.assign({}, base, {
      drawable: true, refusal: null,
      query, scores: res.scores, explain: res.explain, clauses: res.clauses,
      ranked, band,
      coverage: { blind, thin, of: band.length, tiedAtTop, topScore },
      ceilings, capped,
      offers: [], offerRows: null, tension: [], deepened: false,
      top: band.slice(0, 12).map((k) => ({
        key: k, title: meta[k] && meta[k].title, year: meta[k] && meta[k].year,
        score: res.scores[k], coverage: (res.explain(k) || {}).coverage,
      })),
      deepen() {
        if (deepened) return out;
        deepened = true;
        out.offerRows = offersFor(res, band, w, spent);
        out.offers = pickOffers(out.offerRows);
        out.tension = [];
        for (let i = 0; i < query.length; i++) {
          const t = tensionFor(query, res, ranked, i);
          if (t) out.tension.push(Object.assign({ clause: i, label: query[i].label }, t));
        }
        out.deepened = true;
        return out;
      },
    });
    return out;
  }

  return {
    run, parse: (t) => parser.parse(t), matcher, parser, table, plainTable: plain,
    keys, meta, marks, models: modelFor, labelOf, gloss: (a) => GLOSS[a],
    vocabIds: VOCAB_IDS, stats: plain.stats(), version: RUNTIME_VERSION,
    markKeys: (f, v) => markKeys(disco, f, v),
  };
}

module.exports = { buildFind, packAttributes, unpackAttributes, buildMarkIndex, RUNGS, NEAR, RUNTIME_VERSION };

/* ─────────────────────────────────────────────────────────────────────── CLI */

const SENTENCES = [
  "a film that has fast pacing, has the mood of the matrix, has a hopeful tone, has little dialogue, very spiritual in nature",
  "something like In the Mood for Love, but with less talking and more of a plot",
  "a tense 70s conspiracy thriller based on a true story, with an unreliable narrator and a twist at the end, under two hours",
  "a feel-good animated musical for the whole family, happy ending, great villain, nothing scary",
  "I want something quiet and sad to watch alone at 2am, black and white if possible, nothing violent, where nothing much happens",
  "a gritty revenge film set in a city at night, very stylised",
];

function selftest() {
  const F = buildFind();
  const fails = [];
  const ok = (name, cond, note) => {
    console.log((cond ? "  ok   " : "  FAIL ") + name + (note ? "   " + note : ""));
    if (!cond) fails.push(name);
  };

  /* 1. the closed form IS the re-score, or the offer row is fiction */
  const r = F.run("a hopeful tone, little dialogue, very spiritual");
  let worst = 0, checked = 0;
  for (const attr of ["setting:space", "tone:cerebral", "not:texture:graphic-violence", "mode:action", "not:pace:contemplative"]) {
    const M = F.models(attr);
    const w = 1;
    const q2 = r.query.concat([{ anyOf: [attr], weight: w, label: attr }]);
    const full = F.matcher.score(q2);
    for (const k of F.keys) {
      const d = r.explain(k);
      const v = F.table.value(k, attr);
      const credit = v === undefined ? M.prior : M.sigmaAt(v);
      const s = Math.max(0, Math.min(1, (d.raw + w * credit) / (d.denom + w * M.sigmaMax)));
      worst = Math.max(worst, Math.abs(s - full.scores[k]));
      checked++;
    }
  }
  ok("the closed form equals a full re-score", worst === 0,
    "max |diff| " + worst.toExponential(3) + " over " + checked + " film-attribute pairs");

  /* 2. NEGATION DOES NOT INVERT. The failure this guards against is silent:
        query-parse.js's raw `clauses` through a plain matcher reads "nothing
        violent" as a WANT and returns Straw Dogs and Salo at 1.000. Both paths
        are run here so the control is visible, not asserted. */
  const negText = "a bleak film, nothing violent";
  const neg = F.run(negText);
  const parsedNeg = F.parse(negText);
  const wrong = F.matcher.score(parsedNeg.clauses.map((c) => ({ anyOf: c.anyOf, weight: c.weight, label: c.label })));
  const wrongRank = F.keys.slice().sort((a, b) => wrong.scores[b] - wrong.scores[a] || a.localeCompare(b));
  const rightRank = neg.ranked;
  const wrongAt = wrongRank.indexOf("straw dogs") + 1;
  const rightAt = rightRank.indexOf("straw dogs") + 1;
  ok("negation lowers rather than raises the films it names",
    wrongAt > 0 && rightAt > 0 && wrongAt < 20 && rightAt > 200,
    "Straw Dogs ranks " + wrongAt + " through the trap, " + rightAt + " through the wired path");

  /* 3. the three refusals */
  const a = F.run("under 90 minutes, in english");
  ok("nothing readable refuses instead of throwing", !a.drawable && a.refusal.code === "no-reading", a.refusal && a.refusal.code);
  const b = F.run("nothing violent");
  ok("negation-only refuses and says how many tie", !b.drawable && b.refusal.code === "negation-only", b.tied + " films at 1.000");
  const c = F.run("a good western");
  ok("a record-only query marks rather than throwing", !c.drawable && c.refusal.code === "record-only",
    c.marks.map((m) => m.count + " " + m.label).join(", "));

  /* 4. nothing is ever filtered out */
  const d = F.run("very spiritual, little dialogue");
  ok("every film in the corpus gets a score", Object.keys(d.scores).length === F.keys.length,
    Object.keys(d.scores).length + " of " + F.keys.length);

  /* 5. the shard boundary survived the packing */
  const packed = packAttributes(
    ["known", "outline", "unknown"].map((n) => JSON.parse(fs.readFileSync(
      path.join(__dirname, "..", "pipeline", "out", "consensus.shard-" + n + ".json"), "utf8"))),
    F.keys);
  const G = buildFind({ packed, keys: F.keys, meta: F.meta });
  const e1 = F.run("a hopeful tone, little dialogue, very spiritual");
  const e2 = G.run("a hopeful tone, little dialogue, very spiritual");
  let diff = 0;
  for (const k of F.keys) if (e1.scores[k] !== e2.scores[k]) diff++;
  ok("packed attributes score bit-identically to the shards on disk", diff === 0, diff + " of " + F.keys.length + " differ");
  let above = 0;
  for (const k of F.keys) if (e2.scores[k] > 0) above++;
  ok("the three shards stayed three (a merge would collapse unknowns to zero)",
    G.stats.filmsPassed === 106 && above > 900, above + " films above zero, " + G.stats.filmsPassed + " passed");

  /* 6. two different sentences ask two different questions */
  const o1 = F.run(SENTENCES[0]).deepen().offers.map((x) => x.attr).join(",");
  const o2 = F.run(SENTENCES[5]).deepen().offers.map((x) => x.attr).join(",");
  ok("two sentences produce different offers", o1 !== o2 && o1 && o2, "[" + o1 + "] vs [" + o2 + "]");

  console.log(fails.length ? "\nSELFTEST FAIL — " + fails.join("; ") : "\nSELFTEST PASS");
  return fails.length === 0;
}

function battery() {
  const F = buildFind();
  for (const s of SENTENCES) {
    const t0 = Date.now();
    const r = F.run(s);
    const shallow = Date.now() - t0;
    if (r.drawable) r.deepen();
    const ms = Date.now() - t0;
    console.log("\n" + JSON.stringify(s));
    if (!r.drawable) { console.log("  REFUSED  " + r.refusal.code + " — " + r.refusal.headline); }
    else {
      console.log("  " + r.query.length + " clauses · top " + r.top.slice(0, 5)
        .map((t) => t.title + " " + t.score.toFixed(3)).join(" · "));
      console.log("  near band: " + r.coverage.blind + " of " + r.coverage.of + " films the corpus never read");
    }
    if (r.marks.length) console.log("  marks: " + r.marks.map((m) => m.count + " " + m.label).join(", "));
    if (r.unread.length) console.log("  unread: " + r.unread.map((u) => JSON.stringify(u.text)).join(", "));
    const rows = r.offerRows || [];
    if (rows.length) {
      const med = rows.map((x) => x.value).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
      console.log("  best influx " + rows[0].value.toFixed(3) + " (" + rows[0].attr + ")  median "
        + med.toFixed(3) + "  ratio " + (med > 0 ? (rows[0].value / med).toFixed(2) : "inf"));
    }
    console.log("  offers: " + (r.offers || []).map((o) => o.attr + " " + o.value.toFixed(3)).join(" | ") || "  offers: (silent)");
    for (const t of (r.tension || [])) console.log("  tension: " + t.label + " churns " + (t.churn * 100).toFixed(0) + "% of the front");
    console.log("  " + shallow + " ms to the picture, " + ms + " ms including the offers");
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) { process.exit(selftest() ? 0 : 1); }
  if (argv.includes("--battery")) { battery(); return; }
  const text = argv.filter((a) => !a.startsWith("--")).join(" ");
  if (!text) { console.log("usage: node atlas/app/query-runtime.js \"<a sentence>\" | --selftest | --battery"); return; }
  const F = buildFind();
  const r = F.run(text);
  console.log(JSON.stringify({
    drawable: r.drawable, refusal: r.refusal,
    readings: r.readings.map((x) => [x.said, (x.negate ? "NOT " : "") + x.terms.join("|"), x.weight]),
    unread: r.unread.map((x) => [x.text, x.why]),
    marks: r.marks.map((m) => [m.said, m.value, m.count]),
    top: (r.top || []).slice(0, 8).map((t) => [t.title, +t.score.toFixed(3), t.coverage]),
    coverage: r.coverage, offers: (r.offers || []).map((o) => [o.attr, +o.value.toFixed(3), o.brings]),
    tension: r.tension,
  }, null, 1));
}

if (require.main === module) main();
