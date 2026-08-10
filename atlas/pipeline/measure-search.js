#!/usr/bin/env node
/* measure-search.js — what the typed search actually does, over sentences a
 * reader would type rather than over single vocabulary terms.
 *
 *   node pipeline/measure-search.js
 *   node pipeline/measure-search.js --verbose
 *
 * questioner.js was measured over 33 SINGLE-ATTRIBUTE openings, and reported
 * that under shipped defaults it is a one-question mechanism. That measurement
 * is right and it is not the one the product needs, because nobody types a
 * single attribute: they type a sentence, the parser turns it into three or
 * five clauses, and the answering set is a conjunction that collapses fast.
 *
 * So the number this file exists to produce is:
 *
 *      HOW OFTEN DOES A READER WHO TYPES A SENTENCE EVER SEE A QUESTION?
 *
 * and the second one, which is the one that decides whether the question is
 * worth building at all:
 *
 *      WHEN THEY DO SEE ONE, IS IT A THING THEY COULD HAVE PREDICTED?
 *
 * The obviousness proxy is deliberately crude and stated as such: does the asked
 * attribute share a vocabulary GROUP with something the reader already said
 * (a same-group question is one the reader could see coming, because the groups
 * are what the vocabulary is organised by), and what is its LIFT — its share of
 * the answering set over its share of the corpus. A lift near 1 is a genuinely
 * independent question; a lift of 3 is the corpus telling you what you already
 * knew about your own taste.
 */

"use strict";

const path = require("path");
const { buildParser } = require("./query-parse.js");
const { buildQuestioner } = require("./questioner.js");

/* Sentences, not terms. Written before any of them was run, and kept whole —
   including the ones that turn out to answer badly, because dropping those is
   how a battery becomes a demo. */
const BATTERY = [
  "a film with fast pacing, the mood of the matrix, a hopeful tone, little dialogue, very spiritual",
  "something funny and warm for a sunday",
  "bleak, slow, and beautiful to look at",
  "a film about coming home",
  "coming home, but funny",
  "very spiritual",
  "spiritual with little dialogue",
  "menacing, set in a small town",
  "something like blade runner",
  "the mood of stalker",
  "the pace of mad max fury road",
  "melancholy, city at night",
  "a revenge film that isn't violent",
  "not funny, not hopeful",
  "an investigation, nonlinear, city at night",
  "tender and about family",
  "in space, makes you think",
  "in space, makes you think, action, coming home",
  "grief, contemplative, painterly",
  "political and angry",
  "a slow burn about obsession",
  "growing up in a small town",
  "survival in the wilderness",
  "talky, ironic, one place",
  "musical, stylised, hopeful",
  "grimy city at night, paranoid",
  "dreamlike and sensual",
  "absurd, episodic, funny",
  "austere, spiritual, wordless",
  "raw and immediate, about work",
  "a twist, suspense, nonlinear",
  "class, ensemble, ironic",
  "elegiac, about memory",
  "quick and light, comic, about desire",
  "epic scale, spectacle, the future",
  "a film with no dialogue at all",
  "something to think about, nothing bleak",
  "narrated, about memory, melancholy",
  "fish out of water, comic, small town",
  "race against time, relentless",
];

function main() {
  const verbose = process.argv.includes("--verbose");
  const Q = buildQuestioner();
  const P = buildParser({ matcher: Q.matcher });
  const groupsOf = (terms) => new Set(terms.map((t) => t.replace(/^not:/, "").split(":")[0]));

  /* corpus prevalence per attribute, over films KNOWN on it — the same
     denominator questioner.js's own q is computed against. */
  const prevalence = {};
  for (const a of Q.vocab.attributes.map((x) => x.id)) {
    let k = 0, pos = 0;
    for (const f of Q.matcher.keys) {
      const v = Q.matcher.table.value(f, a);
      if (v === undefined) continue;
      k++; if (v > 0) pos++;
    }
    prevalence[a] = k ? pos / k : 0;
  }

  const rows = [];
  for (const text of BATTERY) {
    const p = P.parse(text);
    if (!p.clauses.length) { rows.push({ text, clauses: 0, note: "parsed to nothing" }); continue; }
    const sess = Q.open(p.query());
    const set0 = sess.set();
    const chain = [];
    let guard = 0;
    let s = sess;
    let firstQ = null;
    /* A simulated reader who always says yes: the branch that narrows most, and
       therefore the most generous account of how deep the conversation can go.
       A no-answering reader gets fewer questions, not more. */
    while (guard++ < 6) {
      const q = s.ask();
      if (!q) break;
      if (!firstQ) firstQ = q;
      const A = s.set().answering;
      s.answer(q.id, "yes");
      chain.push({ id: q.id, bits: q.bits, before: A, after: s.set().answering, q: q.q });
    }
    const said = new Set();
    for (const c of p.clauses) for (const t of c.anyOf) said.add(t);
    const sameGroup = firstQ
      ? [...groupsOf([...said])].includes(firstQ.id.split(":")[0]) : null;
    const lift = firstQ ? (firstQ.prevalence > 0 && prevalence[firstQ.id] > 0
      ? firstQ.prevalence / prevalence[firstQ.id] : null) : null;
    rows.push({
      text, clauses: p.clauses.length, unread: p.unread.length,
      answering: set0.answering, questions: chain.length, chain,
      stop: s.stopReason(), sameGroup, lift, firstQ: firstQ ? firstQ.id : null,
    });
  }

  /* ── the report ── */
  const parsed = rows.filter((r) => r.clauses > 0);
  const noParse = rows.filter((r) => !r.clauses);
  const asked = parsed.filter((r) => r.questions > 0);
  const empty = parsed.filter((r) => r.answering === 0);

  console.log("\nTYPED SEARCH, MEASURED OVER " + BATTERY.length + " SENTENCES A READER MIGHT TYPE\n");
  console.log("  parsed to at least one clause          " + parsed.length + " of " + BATTERY.length);
  if (noParse.length) console.log("    understood nothing: " + noParse.map((r) => JSON.stringify(r.text)).join(", "));
  console.log("  median clauses per sentence            " + median(parsed.map((r) => r.clauses)));
  console.log("  spans not understood, per sentence     " +
    (parsed.reduce((a, r) => a + r.unread, 0) / parsed.length).toFixed(2));
  console.log("");
  console.log("  ANSWERING SET AT THE MOMENT THE READER PRESSES ENTER");
  console.log("    median                               " + median(parsed.map((r) => r.answering)));
  console.log("    already showable (<= 240)            " + parsed.filter((r) => r.answering <= 240 && r.answering > 0).length);
  console.log("    EMPTY — no film answers all of it    " + empty.length +
    "   (the ranking still draws all 2,204; there is simply nothing to split)");
  console.log("");
  console.log("  THE QUESTION");
  console.log("    sentences that get a question at all " + asked.length + " of " + parsed.length +
    "  (" + Math.round(100 * asked.length / parsed.length) + "%)");
  console.log("    questions asked, where asked         median " + median(asked.map((r) => r.questions)) +
    ", max " + Math.max(0, ...asked.map((r) => r.questions)));
  console.log("    reached the cap of " + Q.config.maxQuestions + "                  " +
    asked.filter((r) => r.questions >= Q.config.maxQuestions).length);
  const stops = {};
  for (const r of parsed) stops[shortStop(r.stop)] = (stops[shortStop(r.stop)] || 0) + 1;
  console.log("    why it stopped:");
  for (const [k, v] of Object.entries(stops).sort((a, b) => b[1] - a[1])) console.log("      " + String(v).padStart(3) + "  " + k);
  console.log("");
  console.log("  IS THE QUESTION OBVIOUS?");
  const sg = asked.filter((r) => r.sameGroup).length;
  console.log("    first question is in a group the reader already used   " + sg + " of " + asked.length);
  const lifts = asked.map((r) => r.lift).filter((x) => x !== null && isFinite(x));
  console.log("    lift of the asked attribute over its corpus rate       median " +
    median(lifts).toFixed(2) + "   range " + Math.min(...lifts).toFixed(2) + "–" + Math.max(...lifts).toFixed(2));
  console.log("    (1.0 = the question is independent of what was typed; 3.0 = the corpus is");
  console.log("     telling the reader something they told it thirty seconds ago)");

  /* ── the sweep, which is the actionable part ──────────────────────────────
     The 240 floor is the WALL's number — the front page shows 240 tiles and
     below that a reader can scroll rather than answer. The query sky is not a
     page: all 2,204 films are on screen at once, so "showable" there is not a
     count of the set at all, it is whether the near band is separable by eye.
     DESIGN.md's own figure is that the solver's median nearest-neighbour gap is
     0.669/sqrt(N) world units, which is 5.4px on a phone at 2,008 films — a set
     of 44 films inside a field of 2,204 is not something a reader can pick out,
     whatever the wall's number says. So the floor is swept rather than assumed,
     and the sweep is the number to argue over. */
  console.log("\n  IF THE SHOWABLE FLOOR WERE NOT THE WALL'S 240");
  console.log("    floor   sentences asked   median depth   median lift   median final set");
  for (const floor of [240, 120, 60, 24, 12, 6]) {
    const QQ = buildQuestioner({ meta: Q.matcher.meta, showable: floor });
    let n = 0, depths = [], lifts = [], finals = [];
    for (const text of BATTERY) {
      const p2 = P.parse(text);
      if (!p2.clauses.length) continue;
      const s2 = QQ.open(p2.query());
      let d = 0, first = null, g = 0;
      while (g++ < 6) {
        const q = s2.ask(); if (!q) break;
        if (!first) first = q;
        s2.answer(q.id, "yes"); d++;
      }
      if (d) { n++; depths.push(d);
        if (first && prevalence[first.id] > 0) lifts.push(first.prevalence / prevalence[first.id]); }
      finals.push(s2.set().answering);
    }
    console.log("    " + String(floor).padStart(5) + "   " + String(n + " of " + parsed.length).padStart(15) +
      "   " + String(depths.length ? median(depths) : "-").padStart(12) +
      "   " + String(lifts.length ? median(lifts).toFixed(2) : "-").padStart(11) +
      "   " + String(median(finals)).padStart(17));
  }

  if (verbose) {
    console.log("\n  EVERY SENTENCE\n");
    for (const r of rows) {
      console.log("  " + JSON.stringify(r.text));
      if (!r.clauses) { console.log("      understood nothing\n"); continue; }
      console.log("      " + r.clauses + " clauses · answering " + r.answering +
        (r.unread ? " · " + r.unread + " span(s) not understood" : ""));
      for (const c of r.chain) {
        console.log("      Q " + c.bits.toFixed(2) + "b  " + JSON.stringify(c.q) +
          "   yes -> " + c.before + " to " + c.after);
      }
      console.log("      stop: " + r.stop + "\n");
    }
  }
}

function shortStop(s) {
  if (!s) return "(still asking)";
  if (/showable/.test(s)) return "the set was already showable";
  if (/no film answers all/.test(s)) return "nothing answers every clause — no set to split";
  if (/nothing left worth asking/.test(s)) return "no question cleared the bits floor";
  if (/cap/.test(s)) return "the cap";
  if (/skipped/.test(s)) return "the reader skipped twice";
  return s;
}
function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
}

module.exports = { BATTERY };
if (require.main === module) main();
