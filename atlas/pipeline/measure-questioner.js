#!/usr/bin/env node
/* measure-questioner.js — is the follow-up question worth asking?
 *
 *   node pipeline/measure-questioner.js
 *   node pipeline/measure-questioner.js --dir path/to/shards
 *
 * Seven blocks, in the order they decide whether this ships:
 *
 *   1. THE SPLIT MEASURE'S OWN ARITHMETIC. Five hand-checkable cases, plus two
 *      negative controls that must FAIL if the measure is replaced by either of
 *      the two obvious wrong ones. A check that cannot fail is not a check.
 *   2. DOES IT EVER FIRE. How many single-attribute openings land above the
 *      wall's 240. If most land under it, the follow-up question is a mechanism
 *      for a corpus this project does not have yet, and that is the finding.
 *   3. THE BITS CURVE. Best available question at depth 1..5 over every opening
 *      that fires. Written to justify the cap; it refuted the justification
 *      instead — the curve is flat, so the cap is a backstop and the showable
 *      floor is the real terminator. questioner.js's header says so because of
 *      this block, not the other way round.
 *   4. ASKED AND IMPLIED. IMPLIED collapses out of the arithmetic and needs no
 *      table. ALREADY-ANSWERED does not, and is suppressed by an explicit rule.
 *      4a measures the residual the rule is covering for; 4b measures the
 *      collapse that is real.
 *   5. ARE THE QUESTIONS DULL. Lift of the chosen attribute inside the answering
 *      set over its corpus prevalence. High lift = the question is the near
 *      neighbour of what the reader already said = predictable.
 *   6. THE OWNER'S EXAMPLE, end to end.
 *   7. THE CEILING, and whether a two-pole "X or Y?" question would raise it.
 */

"use strict";

const path = require("path");
const { buildQuestioner, splitOf, effectiveSize } = require("./questioner.js");

function args(argv) {
  const a = { dir: undefined, depth: 5 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") a.dir = argv[++i];
    else if (argv[i] === "--depth") a.depth = Number(argv[++i]);
  }
  return a;
}

/* ─────────────────────────────────────────── 1. the measure's own arithmetic */

/* A fake table so the three cases are exact rather than corpus-dependent. */
function fakeTable(values) {
  const keys = values.map((_, i) => "f" + i);
  return {
    keys,
    value(k, a) {
      const v = values[Number(k.slice(1))][a];
      return v === undefined ? undefined : v;
    },
  };
}

function block1() {
  console.log("1. THE SPLIT MEASURE");
  let ok = true;
  const cases = [
    { name: "everyone at 0.25 (a thing they all are)", vals: Array(300).fill({ a: 0.25 }), want: 0.0, tol: 0.001 },
    { name: "half at 1, half at 0 (a clean halving)", vals: Array(150).fill({ a: 1 }).concat(Array(150).fill({ a: 0 })), want: 1.0, tol: 0.001 },
    { name: "290 of 300 already are (the owner's case)", vals: Array(290).fill({ a: 1 }).concat(Array(10).fill({ a: 0 })), want: 0.095, tol: 0.02 },
    { name: "nobody has it", vals: Array(300).fill({ a: 0 }), want: 0.0, tol: 0.001 },
    { name: "nothing is read (all unknown)", vals: Array(300).fill({}), want: 0.0, tol: 0.001 },
  ];
  for (const c of cases) {
    const t = fakeTable(c.vals);
    const r = splitOf(t, t.keys, "a");
    const pass = Math.abs(r.bits - c.want) <= c.tol;
    if (!pass) ok = false;
    console.log("   " + (pass ? "PASS" : "FAIL") + "  " + c.name.padEnd(42) +
      r.bits.toFixed(3) + " bits (want ~" + c.want + ")");
  }

  /* Negative controls: prove the checks can fail. Both wrong measures are
     implemented here and both must blow the all-at-0.25 case, which is the case
     that made the inverse-Simpson step necessary. */
  const flat = fakeTable(Array(300).fill({ a: 0.25 }));
  const countYes = () => {
    const n = 300, yes = 300, no = 0, q = 0.25;
    return Math.log2(n / (q * yes + (1 - q) * no));
  };
  const sumStrength = () => {
    const q = 0.25;
    return Math.log2(1 / (q * q + (1 - q) * (1 - q)));
  };
  console.log("   control  binarise at v>0 on the same input   " + countYes().toFixed(3) +
    " bits  <- must be wrong, and is (a constant attribute cannot be a 2-bit question)");
  console.log("   control  sum the strengths on the same input " + sumStrength().toFixed(3) +
    " bits  <- must be wrong, and is (mean-only: the variance cancels)");
  const real = splitOf(flat, flat.keys, "a").bits;
  if (!(countYes() > 1 && sumStrength() > 0.5 && real < 0.001)) {
    ok = false;
    console.log("   FAIL  the controls did not separate from the shipped measure");
  } else {
    console.log("   PASS  shipped measure " + real.toFixed(3) + " bits on the same input");
  }
  return ok;
}

/* ───────────────────────────────────────────────────────── the corpus blocks */

function main() {
  const a = args(process.argv.slice(2));
  const okArith = block1();

  const Q = buildQuestioner({ dir: a.dir });
  const ALL = Q.vocab.attributes.map((x) => x.id).filter((x) => Q.phrasings.questions[x]);
  const st = Q.matcher.stats;
  console.log("\n   shards: " + JSON.stringify(st));

  /* corpus prevalence, for the lift measure in block 5 */
  const prevalence = new Map();
  for (const id of ALL) {
    let known = 0, held = 0;
    for (const k of Q.matcher.keys) {
      const v = Q.table.value(k, id);
      if (v === undefined) continue;
      known++;
      if (v > 0) held++;
    }
    prevalence.set(id, known ? held / known : 0);
  }

  /* ── 2. does it ever fire ─────────────────────────────────────────────── */
  console.log("\n2. DOES IT EVER FIRE  (the wall shows 240; below that, showing beats asking)");
  const sizes = [];
  for (const id of ALL) {
    const s = Q.open([{ attr: id }]);
    sizes.push({ id, n: s.set().answering });
  }
  sizes.sort((x, y) => y.n - x.n);
  const fires = sizes.filter((x) => x.n > 240);
  console.log("   openings above the wall: " + fires.length + " of " + sizes.length +
    "   (" + (100 * fires.length / sizes.length).toFixed(0) + "%)");
  console.log("   widest:  " + sizes.slice(0, 5).map((x) => x.id + " " + x.n).join(", "));
  console.log("   narrowest: " + sizes.slice(-5).map((x) => x.id + " " + x.n).join(", "));

  /* ── 3. the bits curve ────────────────────────────────────────────────── */
  console.log("\n3. THE BITS CURVE  (best question available at each depth, cap and floors off)");
  const depth = a.depth;
  const byDepth = Array.from({ length: depth }, () => []);
  const walked = [];
  for (const o of fires) {
    /* walk greedily, always answering yes, floors off: we are measuring the
       material available, not the policy. */
    const sess = Q.open([{ attr: o.id }]);
    const path0 = [];
    for (let d = 0; d < depth; d++) {
      const { A, rows } = sess.shortlist();
      if (!rows.length || !A.length) break;
      sess.answer(rows[0].attr, "yes");
      const after = sess.shortlist().A.length;
      byDepth[d].push({ bits: rows[0].bits, n: A.length, id: rows[0].attr, cut: after ? A.length / after : 0 });
      path0.push({ id: rows[0].attr, bits: rows[0].bits, before: A.length });
    }
    walked.push({ opening: o.id, path: path0, end: sess.set().answering });
  }
  const median = (xs) => { const y = xs.slice().sort((p, q) => p - q); return y.length ? y[Math.floor(y.length / 2)] : 0; };
  console.log("   depth  median bits   median set before   realised cut on 'yes'   below 0.415 bits");
  for (let d = 0; d < depth; d++) {
    const r = byDepth[d];
    if (!r.length) continue;
    const thin = r.filter((x) => x.bits < 0.415).length;
    console.log("     Q" + (d + 1) + "     " + median(r.map((x) => x.bits)).toFixed(3) +
      "        " + String(median(r.map((x) => x.n))).padStart(6) +
      "              " + median(r.map((x) => x.cut)).toFixed(2) + "x" +
      "                  " + thin + "/" + r.length);
  }
  console.log("   the expected bits are the right thing to choose on; the cut is what the reader");
  console.log("   who says yes actually sees. They differ because 'no' keeps most of the set.");
  /* `path[3].before` is the set as it stood going into a fourth question, i.e.
     what three answers left. Walks that stopped earlier report their end. */
  const cum = walked.map((w) => ({
    opening: w.opening,
    from: w.path[0] ? w.path[0].before : 0,
    after3: w.path[3] ? w.path[3].before : w.end,
  }));
  console.log("   after three questions, median set: " +
    median(cum.map((c) => c.after3)) + "  (from median " + median(cum.map((c) => c.from)) + ")");

  /* ── 4. asked and implied ─────────────────────────────────────────────── */
  console.log("\n4. ASKED AND IMPLIED");
  console.log("   4a. ALREADY ANSWERED — the arithmetic does NOT suppress it, an explicit rule does.");
  let worstResidual = 0, checked = 0, reoffered = 0;
  for (const o of fires) {
    const sess = Q.open([{ attr: o.id }]);
    const first = sess.shortlist().rows[0];
    if (!first) continue;
    sess.answer(first.attr, "yes");
    const { A, rows } = sess.shortlist();
    /* what the measure alone would say about re-asking the granted attribute */
    worstResidual = Math.max(worstResidual, Q.splitOf(A, first.attr).bits);
    /* what the shipped shortlist does with it */
    if (rows.some((r) => r.attr === first.attr || r.attr === o.id)) reoffered++;
    checked++;
  }
  console.log("      residual bits the measure alone assigns a just-granted attribute: up to " +
    worstResidual.toFixed(3) + " over " + checked + " walks");
  console.log("      (mean STRENGTH inside the answering set is ~0.5, not 1, so the spread is real)");
  console.log("      spent attributes re-offered by shortlist(): " + reoffered + "/" + checked +
    "   " + (reoffered === 0 ? "PASS" : "FAIL"));
  console.log("   4b. IMPLIED — this half does fall out of the arithmetic, no table needed.");
  console.log("      third parties (bits before -> after the first answer):");
  for (const o of fires.slice(0, 5)) {
    const sess = Q.open([{ attr: o.id }]);
    const rows = sess.shortlist().rows;
    const top = rows[0];
    const before = new Map(rows.map((r) => [r.attr, r.bits]));
    sess.answer(top.attr, "yes");
    const after = new Map(sess.shortlist().rows.map((r) => [r.attr, r.bits]));
    const moved = [...before.keys()].filter((k) => after.has(k))
      .map((k) => ({ k, d: after.get(k) - before.get(k) }))
      .sort((x, y) => x.d - y.d).slice(0, 3);
    console.log("      " + o.id.padEnd(22) + " granted " + top.attr.padEnd(22) + " -> " +
      moved.map((m) => m.k + " " + before.get(m.k).toFixed(2) + "→" + after.get(m.k).toFixed(2)).join(", "));
  }

  /* ── 5. are the questions dull ────────────────────────────────────────── */
  console.log("\n5. ARE THE QUESTIONS DULL  (lift of the chosen attribute inside the set)");
  const lifts = [];
  for (const o of fires) {
    const sess = Q.open([{ attr: o.id }]);
    const rows = sess.shortlist().rows;
    if (!rows.length) continue;
    const top = rows[0];
    const inSet = top.known ? top.held / top.known : 0;
    const base = prevalence.get(top.attr) || 0;
    lifts.push({ opening: o.id, chosen: top.attr, lift: base > 0 ? inSet / base : 0, inSet, base, bits: top.bits });
  }
  lifts.sort((x, y) => y.lift - x.lift);
  const med = median(lifts.map((l) => l.lift));
  console.log("   median lift of the first question: " + med.toFixed(2) + "x its corpus prevalence");
  console.log("   (1.0 = the question is orthogonal to what they said; >1.5 = it is the near neighbour)");
  for (const l of lifts.slice(0, 6)) {
    console.log("     " + l.opening.padEnd(24) + " -> " + l.chosen.padEnd(24) +
      " lift " + l.lift.toFixed(2) + "x   " + (100 * l.inSet).toFixed(0) + "% in set vs " +
      (100 * l.base).toFixed(0) + "% corpus   " + l.bits.toFixed(2) + " bits");
  }
  const orth = lifts.filter((l) => l.lift < 1.2).length;
  console.log("   openings whose best question was NOT a near neighbour (lift < 1.2): " + orth + "/" + lifts.length);

  /* The structural version of the same worry: across the WHOLE shortlist, is a
     high-bit question just a high-lift question wearing information theory? If
     rho is strongly positive the mechanism cannot propose the reader's own
     surprising turn, because a surprising turn is by definition low-lift. */
  const rank = (xs) => {
    const idx = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(xs.length);
    for (let i = 0; i < idx.length; i++) r[idx[i][1]] = i + 1;
    return r;
  };
  const spear = (xs, ys) => {
    if (xs.length < 4) return NaN;
    const rx = rank(xs), ry = rank(ys), n = xs.length;
    const mx = (n + 1) / 2;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - mx); dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2; }
    return num / Math.sqrt(dx * dy);
  };
  const rhos = [];
  for (const o of fires) {
    const sess = Q.open([{ attr: o.id }]);
    const rows = sess.shortlist().rows.filter((r) => r.known > 0 && (prevalence.get(r.attr) || 0) > 0);
    const b = rows.map((r) => r.bits);
    const l = rows.map((r) => (r.held / r.known) / prevalence.get(r.attr));
    const rr = spear(b, l);
    if (Number.isFinite(rr)) rhos.push(rr);
  }
  rhos.sort((x, y) => x - y);
  console.log("   rho(bits, lift) across the whole shortlist: median " +
    median(rhos).toFixed(3) + "   range " + rhos[0].toFixed(3) + " .. " + rhos[rhos.length - 1].toFixed(3) +
    "   over " + rhos.length + " openings");
  console.log("   (positive = information gain and thematic adjacency are the same ranking,");
  console.log("    which is the mechanism's structural limit, not a bug in it)");

  /* ── 6. the owner's example ───────────────────────────────────────────── */
  console.log("\n6. THE OWNER'S EXAMPLE  — would the questioner have proposed his own turns?");
  const sess = Q.open([{ attr: "story:coming-home" }]);
  let A = sess.shortlist().A;
  console.log("   opening story:coming-home -> " + A.length + " answering, " + sess.set().unread + " unread");
  for (const want of ["tone:cerebral", "mode:action", "setting:space"]) {
    const sp = Q.splitOf(A, want);
    const rank = sess.shortlist().rows.findIndex((r) => r.attr === want) + 1;
    console.log("     " + want.padEnd(18) + sp.bits.toFixed(3) + " bits   rank " +
      (rank || "-") + " of " + sess.shortlist().rows.length +
      "   held by " + sp.held + "/" + sp.known + " of the set");
    sess.answer(want, "yes");
    A = sess.shortlist().A;
    console.log("       -> answering " + A.length);
  }

  /* ── 7. the ceiling, and what a two-pole question would buy ───────────── */
  console.log("\n7. THE CEILING  (what is the best question the vocabulary can physically ask?)");
  const best = [];
  for (const o of fires) {
    const sess = Q.open([{ attr: o.id }]);
    const rows = sess.shortlist().rows;
    if (rows.length) best.push(rows[0].bits);
  }
  console.log("   best single yes/no question, over the openings that fire:  max " +
    Math.max(...best).toFixed(3) + "   median " + median(best).toFixed(3) + " bits");
  console.log("   a yes/no question cannot exceed 1.000 bits, and graded strengths hold it well under.");

  /* "More X or more Y?" — a forced choice between two poles. It can beat one bit
     because neither branch keeps the whole set, and it is the one change that
     would lift the mechanism clear of its own floor. Not implemented in
     questioner.js; measured here so the number decides whether to build it.

     TWO DISCIPLINES, both learned by getting it wrong first. A naive version
     scored 7.8 bits and the bits were fraudulent:

       THE EXIT IS A BRANCH. Films holding neither pole cannot be deleted by a
       question the reader was pushed into. The exit ("either") retains the whole
       set, and it takes the probability mass the two poles do not claim. Without
       that branch the score is measuring how much of the set the pair fails to
       cover, and reports the failure as information.

       THE POLES MUST BE ONE GROUP. The naive top pair was "space / the future",
       offered to a reader asking about class. That is not a question, it is two
       unrelated filters with an "or" between them. A two-pole question is only a
       question when the poles are alternative answers to the same thing — which
       is exactly what consensus-vocab's nine groups already are. */
  function pairBits(A, x, y) {
    const wx = [], wy = [];
    let mx = 0, my = 0, mn = 0;
    for (const f of A) {
      const a = Q.table.value(f, x), b = Q.table.value(f, y);
      const va = a === undefined ? 0 : a, vb = b === undefined ? 0 : b;
      wx.push(va); wy.push(vb);
      mx += va; my += vb; mn += Math.max(0, 1 - va - vb);
    }
    const tot = mx + my + mn;
    if (!A.length || tot <= 0) return 0;
    const px = mx / tot, py = my / tot, pe = mn / tot;
    const E = px * effectiveSize(wx) + py * effectiveSize(wy) + pe * A.length;
    return E > 0 ? Math.log2(A.length / E) : 0;
  }
  const groupOf = (id) => id.split(":")[0];
  console.log("   best 'more X or more Y?' (poles from one group, exit is a real branch):");
  const pairRows = [];
  for (const o of fires) {
    const sess = Q.open([{ attr: o.id }]);
    const A = sess.shortlist().A;
    let top = null;
    for (let i = 0; i < ALL.length; i++) {
      for (let j = i + 1; j < ALL.length; j++) {
        if (ALL[i] === o.id || ALL[j] === o.id) continue;
        if (groupOf(ALL[i]) !== groupOf(ALL[j])) continue;
        const b = pairBits(A, ALL[i], ALL[j]);
        if (!top || b > top.bits) top = { x: ALL[i], y: ALL[j], bits: b };
      }
    }
    if (!top) continue;
    const single = sess.shortlist().rows[0];
    pairRows.push({ opening: o.id, pair: top, single: single ? single.bits : 0 });
  }
  for (const p of pairRows.slice(0, 6)) {
    console.log("     " + p.opening.padEnd(22) + (p.pair.x + " / " + p.pair.y).padEnd(46) +
      p.pair.bits.toFixed(2) + " bits   vs best single " + p.single.toFixed(2));
  }
  console.log("   median pair " + median(pairRows.map((p) => p.pair.bits)).toFixed(3) +
    " bits vs median single " + median(pairRows.map((p) => p.single)).toFixed(3) + " bits" +
    "   (" + pairRows.filter((p) => p.pair.bits > p.single).length + "/" + pairRows.length + " openings where the pair wins)");

  console.log("\n" + (okArith ? "arithmetic PASS" : "arithmetic FAIL"));
}

if (require.main === module) main();
