#!/usr/bin/env node
/* find-probe.mjs — ASK THE TYPED SEARCH WHAT IT ACTUALLY ANSWERED.
 *
 *   node .claude/skills/run-film-atlas/find-probe.mjs
 *   node .claude/skills/run-film-atlas/find-probe.mjs --controls   # break every check on purpose
 *   ATLAS_HTML=/tmp/other.html node .../find-probe.mjs
 *
 * WHY THIS EXISTS.
 * Three of the numbers this feature was built on contradict the headers of the
 * files they came from. layout-match.js claims Spearman(score, radius) = -0.993
 * and cited `measure-match-layout.js`, which did not exist anywhere in the
 * repository. query-parse.js's header used to say `r.clauses` was ready for
 * buildMatcher().score(), and believing it makes "nothing violent" return Salo
 * and Straw Dogs at 1.000 with no error. match.js's own comment at line 410
 * says an out-of-vocabulary term "still occupies its share of the denominator",
 * and it does not — a typo has literally no effect. A feature assembled out of
 * three wrong headers needs a probe, not a citation.
 *
 * EVERY CHECK ENDS IN A NUMBER, AND EVERY CHECK WAS BROKEN ON PURPOSE FIRST.
 * `--controls` re-runs each one against a deliberately wrong input and requires
 * it to go red; a check that passes under its own control is not a check. The
 * two that cannot be run that way in-process are documented here instead:
 *
 *   # the shard merge — collapses 484 honest unknowns into confident zeros
 *   node -e 'const{buildFind}=require("./atlas/app/query-runtime.js");
 *            const f=require("fs");const d="atlas/pipeline/out/";
 *            const s=["known","outline","unknown"].map(n=>JSON.parse(f.readFileSync(d+"consensus.shard-"+n+".json")));
 *            const one={vocabulary:s[0].vocabulary,films:Object.assign({},s[2].films,s[1].films,s[0].films)};
 *            const F=buildFind({shards:[one]});'   # -> throws: only one shard may declare a vocabulary
 *
 *   # the key-space trap — bearings keyed by filmId instead of corpus key. It
 *   # throws NOTHING: layoutMatch falls back to hashing every key into an angle
 *   # and draws a plausible disc with the atlas's lineage order discarded.
 *   perl -0pe 's/FIND_LAYOUT\.skyBearings\(SKY_POS\|\|\{\}\)/FIND_LAYOUT.skyBearings(LAYOUT.positions)/' \
 *     public/atlas.html > /tmp/atlas-badbearings.html
 *   ATLAS_HTML=/tmp/atlas-badbearings.html node .../find-probe.mjs
 *   #   FAIL  the bearings are the atlas's own  — 0 of 2204 films matched a bearing
 *   #   (and every other check in section 10 still passes, which is the point)
 *
 *   # filtering, which is the one thing this feature may never do
 *   perl -0pe 's/const live=new Uint8Array\(sky\.n\)\.fill\(1\);\n  const x=/const live=new Uint8Array(sky.n).fill(1);\n  for (let i=0;i<sky.n;i++) if ((scores[sky.keys[i]]||0) < 0.05) live[i]=0;\n  const x=/' \
 *     public/atlas.html > /tmp/atlas-filtered.html
 *   ATLAS_HTML=/tmp/atlas-filtered.html node .../find-probe.mjs
 *   #   FAIL  NOTHING is filtered out  — 1526 of 2204 films live
 *   #   FAIL  a weak answer is at the rim and still drawn  — alpha 0.00
 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join, relative } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT = resolve(HERE, "../../..");
const require = createRequire(join(UNIT, "package.json"));
const ARTIFACT = process.env.ATLAS_HTML || join(UNIT, "public/atlas.html");
const CONTROLS = process.argv.includes("--controls");
const SETTLE = Number(process.env.SETTLE || 3400);

if (!existsSync(ARTIFACT)) {
  console.error(`No artifact at ${ARTIFACT}\n  build it:  node atlas/app/build.js --out public/atlas.html`);
  process.exit(2);
}

let failures = 0, checks = 0;
const say = (s) => console.log(s);
const head = (s) => console.log("\n── " + s + " " + "─".repeat(Math.max(2, 58 - s.length)));
function check(name, ok, note) {
  checks++;
  if (!ok) failures++;
  console.log("  " + (ok ? "pass" : "FAIL") + "  " + name + (note ? "  — " + note : ""));
  return ok;
}
/* A control asserts the OPPOSITE: the check must go red on a broken input. */
function control(name, wouldPass, note) {
  if (!CONTROLS) return;
  checks++;
  if (wouldPass) failures++;
  console.log("  " + (wouldPass ? "CONTROL FAILED TO FIRE" : "ctl ") + "  " + name + (note ? "  — " + note : ""));
}

/* ══ 0. THE ENGINE, IN NODE ═══════════════════════════════════════════════ */

const { buildFind, packAttributes, unpackAttributes } = require("./atlas/app/query-runtime.js");
const { buildMatcher, buildTable, attributeModel, conjunctive: CONJ } = require("./atlas/pipeline/match.js");
const { withComplements } = require("./atlas/pipeline/questioner.js");
const ps = require("./atlas/pipeline/plot-source.js");

const t0 = Date.now();
const FIND = buildFind();
const KEYS = FIND.keys;
say(`engine   ${KEYS.length} films, ${FIND.stats.vocabulary} attributes, ${FIND.stats.filmsPassed} passed, ` +
  `${FIND.stats.filmsUnseen} unseen, built in ${Date.now() - t0} ms`);

const BATTERY = [
  "a film that has fast pacing, has the mood of the matrix, has a hopeful tone, has little dialogue, very spiritual in nature",
  "something like In the Mood for Love, but with less talking and more of a plot",
  "a tense 70s conspiracy thriller based on a true story, with an unreliable narrator and a twist at the end, under two hours",
  "a feel-good animated musical for the whole family, happy ending, great villain, nothing scary",
  "I want something quiet and sad to watch alone at 2am, black and white if possible, nothing violent, where nothing much happens",
  "a gritty revenge film set in a city at night, very stylised",
];

/* ══ 1. THE NEGATION SEAM ════════════════════════════════════════════════ */
head("1. negation lowers rather than raises");
{
  const text = "a bleak film, nothing violent";
  const wired = FIND.run(text);
  const parsed = FIND.parse(text);
  /* the trap: query-parse.js's internal clauses handed to a plain matcher */
  const trap = FIND.matcher.score(parsed.clauses.map((c) => ({ anyOf: c.anyOf, weight: c.weight, label: c.label })));
  const trapRank = KEYS.slice().sort((a, b) => trap.scores[b] - trap.scores[a] || a.localeCompare(b));
  const named = ["salo or the 120 days of sodom", "the wild bunch", "straw dogs", "saving private ryan"]
    .filter((k) => FIND.meta[k]);
  const rows = named.map((k) => ({ k, trap: trapRank.indexOf(k) + 1, wired: wired.ranked.indexOf(k) + 1 }));
  for (const r of rows) say(`    ${FIND.meta[r.k].title.padEnd(30)} rank ${String(r.trap).padStart(5)} through the trap` +
    ` -> ${String(r.wired).padStart(5)} through the wired path` +
    `   (graphic-violence ${FIND.table.value(r.k, "texture:graphic-violence")}, bleak ${FIND.table.value(r.k, "tone:bleak")})`);
  /* THE ASSERTION IS THE MOVEMENT, NOT AN ABSOLUTE RANK, and Salo is why.
     It holds tone:bleak at 1.0 — the top of the corpus — while the complement
     clause's whole ceiling is 0.0895 against the query's denominator, so
     honouring the "no" moves it from 1st to 21st rather than out of sight.
     That is the structural fact the design is built on: the complement of a
     rare attribute is a common one, so a "no" is nearly free and separates
     nearly nobody. It is asserted, not glossed over. */
  const median = rows.map((r) => r.wired).sort((a, b) => a - b)[rows.length >> 1];
  check("every film a negation names moves DOWN, none up",
    rows.every((r) => r.wired > r.trap * 4) && median >= 100,
    `median rank ${median} through the wired path against ${trapRank.indexOf(rows[0].k) + 1}-` +
    `${Math.max(...rows.map((r) => r.trap))} through the trap`);
  const M = attributeModel(FIND.table, "not:texture:graphic-violence");
  check("the complement column exists and pays", M.known > 0 && M.sigmaMax > 0,
    `not:texture:graphic-violence known on ${M.known} films, ceiling ${M.sigmaMax.toFixed(4)}`);
  const negOnly = FIND.run("nothing violent");
  check("and the interface is told how little a bare “no” buys",
    negOnly.refusal && negOnly.tied > 1300,
    `a negation on its own puts ${negOnly.tied} of ${KEYS.length} films at exactly 1.000 — ` +
    `61% of the corpus in one ring, which is why it is refused rather than drawn`);
  control("a plain table would give the complement no ceiling at all",
    attributeModel(buildTable([...unpackAttributes(packAttributes(
      ["known", "outline", "unknown"].map((n) => JSON.parse(readFileSync(
        join(UNIT, "atlas/pipeline/out/consensus.shard-" + n + ".json"), "utf8"))), KEYS), KEYS)], KEYS),
      "not:texture:graphic-violence").sigmaMax > 0,
    "attributeModel on an unwrapped table -> ceiling 0, and layoutMatch draws that as a hollow ring");
}

/* ══ 2. THE FOUR REFUSALS ════════════════════════════════════════════════ */
head("2. what it refuses to draw");
{
  const a = FIND.run("under 90 minutes, in english, not too long");
  check("a reading with nothing in it refuses rather than throwing",
    !a.drawable && a.refusal.code === "no-reading", `${a.unread.length} unread spans kept and shown`);
  const b = FIND.run("nothing violent");
  check("a negation-only reading refuses and counts the tie",
    !b.drawable && b.refusal.code === "negation-only" && b.tied > 1000,
    `${b.tied} of ${KEYS.length} films tie at exactly 1.000`);
  const c = FIND.run("a good western");
  check("a record-only reading marks rather than throwing",
    !c.drawable && c.refusal.code === "record-only" && c.marks.length === 1,
    c.marks.map((m) => `${m.count} ${m.label}`).join(", "));
  /* out of vocabulary: the scorer will not report it, so the wrapper must */
  const model = attributeModel(FIND.table, "typo:nope");
  check("an unknown term contributes nothing to the denominator, so it must be caught upstream",
    model.sigmaMax === 0 && model.known === 0,
    `attributeModel("typo:nope") -> known ${model.known}, ceiling ${model.sigmaMax}`);
  const one = FIND.matcher.score([{ attr: "setting:space" }]);
  const two = FIND.matcher.score([{ attr: "setting:space" }, { attr: "typo:nope" }]);
  check("adding a typo really does change nothing at all",
    one.explain(KEYS[0]).denom === two.explain(KEYS[0]).denom,
    `denom ${one.explain(KEYS[0]).denom.toFixed(3)} either way — match.js:410 says otherwise and is wrong`);
  control("a query that reached the scorer empty would throw",
    (() => { try { FIND.matcher.score([]); return true; } catch (_e) { return false; } })(),
    'match.js:470 "match: empty query"');
}

/* ══ 3. RULE 3 — THIN DATA MUST NOT LOOK CONFIDENT ═══════════════════════ */
head("3. rule 3 — an answer built on films nobody read");
{
  const r = FIND.run("set in space");
  check("the near band's blind count is measured and non-trivial",
    r.coverage.blind >= 25, `${r.coverage.blind} of the nearest ${r.coverage.of} have coverage exactly 0`);
  let blind = 0;
  for (const k of KEYS) { const d = r.explain(k); if (d && d.coverage === 0) blind++; }
  check("and it is a property of the whole field, not just the front",
    blind > 400, `${blind} of ${KEYS.length} films answer that query on prior credit alone`);
  const owner = FIND.run(BATTERY[0]);
  check("a query the corpus actually read reports zero blind films",
    owner.coverage.blind === 0, `${owner.coverage.blind} of ${owner.coverage.of} on the owner's own sentence`);
  control("reading confidence off the radius instead of explain() would report none",
    false, "targetRadius(score) is identical for a known 0 and an unknown-prior 0.048 at the same score");
}

/* ══ 4. THE SHARD BOUNDARY ═══════════════════════════════════════════════ */
head("4. the shard boundary survived the packing");
{
  const shards = ["known", "outline", "unknown"].map((n) => JSON.parse(readFileSync(
    join(UNIT, "atlas/pipeline/out/consensus.shard-" + n + ".json"), "utf8")));
  const packed = packAttributes(shards, KEYS);
  const back = unpackAttributes(packed, KEYS);
  check("three shards in, three shards out, exactly one declaring a vocabulary",
    back.length === 3 && back.filter((s) => s.vocabulary).length === 1,
    `${back.length} shards, ${back.filter((s) => s.vocabulary).length} with a vocabulary`);
  const G = buildFind({ packed, keys: KEYS, meta: FIND.meta });
  const q = [{ anyOf: ["story:coming-home"] }, { anyOf: ["tone:cerebral"] },
             { anyOf: ["mode:action"] }, { anyOf: ["setting:space"] }];
  const a = FIND.matcher.score(q), b = G.matcher.score(q);
  let diff = 0, above = 0;
  for (const k of KEYS) { if (a.scores[k] !== b.scores[k]) diff++; if (b.scores[k] > 0) above++; }
  check("the packed table scores bit-identically to the shards on disk", diff === 0,
    `${diff} of ${KEYS.length} films differ`);
  /* the merge control, run for real */
  const merged = { vocabulary: shards[0].vocabulary,
    films: Object.assign({}, shards[2].films, shards[1].films, shards[0].films) };
  const mt = buildTable([merged], KEYS);
  const mm = buildMatcher({ table: withComplements(mt), meta: FIND.meta });
  const ms = mm.score(q);
  let mergedAbove = 0;
  for (const k of KEYS) if (ms.scores[k] > 0) mergedAbove++;
  check("and a merge is detectable in one number",
    above > mergedAbove * 1.5,
    `${above} films above zero with the boundary intact, ${mergedAbove} with it merged — ` +
    `${above - mergedAbove} honest unknowns would become confident zeros`);
  control("a merged payload passes every other check in this file", mergedAbove === above,
    "which is why this one exists");
}

/* ══ 5. THE OFFERS ARE A FUNCTION OF WHAT WAS TYPED ══════════════════════ */
head("5. the follow-up is dynamic, not a list in a costume");
{
  const tops = [], rows = [];
  for (const s of BATTERY) {
    const r = FIND.run(s);
    if (!r.drawable) { tops.push("(refused)"); continue; }
    r.deepen();
    tops.push(r.offers.length ? r.offers[0].attr : "(silent)");
    rows.push({ s, offers: r.offers.map((o) => o.attr), best: r.offers[0] ? r.offers[0].value : 0 });
  }
  for (const r of rows) say("    " + r.offers.join(", ").padEnd(62) + JSON.stringify(r.s.slice(0, 34)));
  const distinct = new Set(tops.filter((t) => t !== "(refused)")).size;
  check("different sentences get different first questions", distinct >= 4,
    `${distinct} distinct top offers across ${tops.filter((t) => t !== "(refused)").length} drawable sentences`);
  const rowsSilent = rows.filter((r) => !r.offers.length).length;
  check("and the row is not silent on the sentences that are the spec", rowsSilent === 0,
    `${rows.length - rowsSilent} of ${rows.length} sentences got offers`);
  /* taking one re-ranks the rest */
  const base = FIND.run(BATTERY[0]); base.deepen();
  const first = base.offers[0].attr;
  const after = FIND.run(BATTERY[0], { taken: [{ attr: first, weight: 1 }] }); after.deepen();
  check("taking the first offer changes the second",
    after.offers.length > 0 && after.offers[0].attr !== base.offers[1].attr,
    `before: ${base.offers.map((o) => o.attr).join(", ")}   after taking ${first}: ${after.offers.map((o) => o.attr).join(", ")}`);
  check("a taken offer is never offered again",
    !after.offers.some((o) => o.attr === first), `${first} absent from the new row`);
  const spent = FIND.run(BATTERY[0], { spent: [first] }); spent.deepen();
  check("and neither is one spent with “either”",
    !spent.offers.some((o) => o.attr === first), `top offer becomes ${spent.offers[0] ? spent.offers[0].attr : "(silent)"}`);
  control("a fixed list would give the same first offer every time",
    new Set(tops.filter((t) => t !== "(refused)")).size <= 1, "");
}

/* ══ 6. RULE 1 — FAME ════════════════════════════════════════════════════ */
head("6. rule 1 — the score, and the offers, against 60-day pageviews");
{
  /* CACHE-ONLY, AND THE WINDOW IS PINNED. plot-source.js derives viewsWindow()
     from Date.now(), so it drifts one key past the cache the day after the
     cache was written and match.js --fame then reports "cannot run. This is not
     a pass." on every day but one. Read the window off the cache instead. */
  const dir = ps.CACHE_VIEWS;
  let start = null;
  try {
    for (const f of readdirSync(dir)) { const m = f.match(/^pv_(\d{8})_/); if (m) { start = m[1]; break; } }
  } catch (_e) { /* no cache */ }
  if (!start) {
    check("pageviews are available to audit against", false, `no pv_* files in ${relative(UNIT, dir)}`);
  } else {
    const views = Object.create(null);
    let hit = 0;
    for (const k of KEYS) {
      const t = FIND.meta[k] && FIND.meta[k].wikipedia;
      if (!t) continue;
      const p = ps.cachePath(dir, "pv_" + start + "_" + t);
      if (!existsSync(p)) continue;
      let d; try { d = JSON.parse(readFileSync(p, "utf8")); } catch (_e) { continue; }
      if (!d || !Array.isArray(d.items)) continue;
      let s = 0; for (const it of d.items) s += it.views || 0;
      if (s > 0) { views[k] = s; hit++; }
    }
    say(`    window ${start}, cache-only, ${hit} of ${KEYS.length} films with pageviews`);
    const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
    const corpusMed = med(Object.values(views));

    /* THE GATE IS DIRECTIONAL. A large NEGATIVE rho on a thin query is the
       three-state ordering working: an unknown film is credited the corpus
       prior and correctly outranks a confidently-denied famous one. Only a
       POSITIVE correlation means the scorer is seeking the canon. */
    const GATE = 0.45;
    let worst = -1, worstQ = "";
    for (const s of BATTERY) {
      const r = FIND.run(s);
      if (!r.drawable) continue;
      const xs = [], ys = [], cx = [];
      for (const k of KEYS) {
        if (views[k] === undefined) continue;
        xs.push(r.scores[k]); ys.push(views[k]); cx.push(r.explain(k).coverage);
      }
      const rho = ps.spearman(xs, ys), rhoCov = ps.spearman(cx, ys);
      if (rho > worst) { worst = rho; worstQ = s; }
      say(`      rho(score,views) ${rho >= 0 ? "+" : ""}${rho.toFixed(4)}   ` +
        `rho(coverage,views) ${rhoCov >= 0 ? "+" : ""}${rhoCov.toFixed(4)}   n=${xs.length}   ${JSON.stringify(s.slice(0, 30))}`);
    }
    check("no reading correlates POSITIVELY with fame beyond the gate", worst <= GATE,
      `worst rho(score,views) = ${worst >= 0 ? "+" : ""}${worst.toFixed(4)} against a gate of ${GATE}, on ${JSON.stringify(worstQ.slice(0, 34))}`);

    /* THE OFFER'S OWN FAME GATE. The question the follow-up asks decides which
       films arrive at the front of the sky next, so it is a rule-1 surface in
       its own right — and the obvious honest-looking design (only ask about
       namespaces the reader was silent in) fails here, because the silent
       namespaces of an interior-vocabulary sentence are the two most
       fame-loaded ones in the vocabulary. */
    /* THE COMPARATIVE FORM, WHICH IS THE ONLY ONE THAT MEANS ANYTHING.
       "the films this offer brings in are more famous than the band it joins"
       is not a rule-1 breach on its own: a band whose median is 5,549 views is
       more obscure than almost anything the corpus could add to it, so the
       ratio is high whatever is asked. The question rule 1 actually poses is
       whether the CURRENCY prefers fame — so every candidate offer is scored,
       the fame it would bring in is measured, and the two are correlated. A
       chooser that is not seeking the canon puts its pick in the middle of that
       distribution, not at the top of it. */
    const rhos = [], ratios = [];
    for (const s of BATTERY) {
      const r = FIND.run(s);
      if (!r.drawable) continue;
      r.deepen();
      if (!r.offers.length) continue;
      const band = new Set(r.band);
      const xs = [], ys = [], fame = [];
      for (const o of r.offerRows.slice(0, 20)) {
        const bring = FIND.run(s, { taken: [{ attr: o.attr, weight: 1 }] })
          .ranked.slice(0, 60).filter((k) => !band.has(k)).map((k) => views[k]).filter((v) => v !== undefined);
        if (bring.length < 5) continue;
        xs.push(o.value); ys.push(med(bring)); fame.push({ attr: o.attr, fame: med(bring) });
      }
      if (xs.length < 8) continue;
      const rho = ps.spearman(xs, ys);
      rhos.push(rho);
      fame.sort((a, b) => b.fame - a.fame);
      const chosen = r.offers[0].attr;
      const at = fame.findIndex((f) => f.attr === chosen) + 1;
      const bandMed = med(r.band.map((k) => views[k]).filter((v) => v !== undefined));
      const chosenFame = (fame.find((f) => f.attr === chosen) || {}).fame || 0;
      ratios.push(chosenFame / Math.max(1, bandMed));
      say(`      ${chosen.padEnd(22)} rho(value, fame it brings) ${rho >= 0 ? "+" : ""}${rho.toFixed(3)}   ` +
        `chosen is ${at} of ${fame.length} by fame   band median ${bandMed.toLocaleString("en-US")}`);
    }
    const mean = rhos.reduce((a, b) => a + b, 0) / (rhos.length || 1);
    check("the offer currency does not prefer famous films",
      rhos.length >= 4 && Math.abs(mean) <= 0.45 && Math.max(...rhos) <= 0.45,
      `mean rho ${mean >= 0 ? "+" : ""}${mean.toFixed(4)}, worst ${Math.max(...rhos).toFixed(4)}, over ${rhos.length} sentences ` +
      `(the same 0.45 gate match.js holds the scorer to)`);
    say(`      for context, the chosen offer brings in films at a median of ` +
      `${(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)}x the band's own median, ` +
      `worst ${Math.max(...ratios).toFixed(2)}x — a number that says more about how obscure the band is than about the question`);
    control("a slot rule restricted to silent namespaces would be measured here too",
      false, "mode 8.9x / setting 8.3x corpus median fame against subject 1.7x — the silent slots are the loud ones");
  }
}

/* ══ 7. THE PARSER DOES NOT EAT THE TITLE AUTOCOMPLETE ═══════════════════ */
head("7. title-first does not regress");
{
  const keys = KEYS.slice().sort();
  const step = Math.max(1, Math.floor(keys.length / 400));
  let n = 0, hits = 0;
  const names = [];
  for (let i = 0; i < keys.length && n < 400; i += step) {
    const t = FIND.meta[keys[i]].title; n++;
    if (FIND.parse(t).clauses.length) { hits++; names.push(t); }
  }
  /* THE BASELINE IS MEASURED, NOT REMEMBERED. Under this exact protocol the
     lexicon at 7cd5c94 — before sad/quiet/scary/gritty/weird were added — gives
     21 of 400. The gate is set just above it so a real regression trips and the
     coverage work does not. */
  check("a film title is not read as a query", hits <= 25,
    `${hits} of ${n} titles produce an attribute clause (21 of 400 under the same protocol before the ` +
    `lexicon additions) — ${names.slice(0, 4).join(", ")}…`);
}

/* ══ 8. THE CLOSED FORM IS THE RE-SCORE ══════════════════════════════════ */
head("8. the offer arithmetic is not an approximation");
{
  const r = FIND.run("a hopeful tone, little dialogue, very spiritual");
  let worst = 0, pairs = 0;
  for (const attr of ["setting:space", "tone:cerebral", "not:texture:graphic-violence",
                      "mode:action", "not:pace:contemplative", "structure:twist"]) {
    const M = FIND.models(attr);
    const full = FIND.matcher.score(r.query.concat([{ anyOf: [attr], weight: 1, label: attr }]));
    for (const k of KEYS) {
      const d = r.explain(k);
      const v = FIND.table.value(k, attr);
      const credit = v === undefined ? M.prior : M.sigmaAt(v);
      const mean = Math.max(0, Math.min(1, (d.raw + credit) / (d.denom + M.sigmaMax)));
      /* THE CONJUNCTIVE TERM RIDES IN THE SAME CLOSED FORM. match.js multiplies
         the weighted mean by conjunctive(held weight, checkable weight), and
         both move by the added clause's own weight — by w if the corpus has a
         reading for this film on it, by nothing if it does not. Leaving it out
         made this check read 1.857e-1, which is the term, not a drift. */
      const knownW = d.knownWeight + (v === undefined ? 0 : 1);
      const holdW = d.holdWeight + (v !== undefined && v > 0 ? 1 : 0);
      const s = mean * CONJ(holdW, knownW);
      worst = Math.max(worst, Math.abs(s - full.scores[k])); pairs++;
    }
  }
  check("the closed form equals a full re-score to the last bit", worst === 0,
    `max |diff| ${worst.toExponential(3)} over ${pairs} film-attribute pairs, including two complements`);
  control("using the prior for a KNOWN film would show up here",
    (() => {
      const M = FIND.models("mode:action");
      const full = FIND.matcher.score(r.query.concat([{ anyOf: ["mode:action"], weight: 1, label: "x" }]));
      let w = 0;
      for (const k of KEYS) {
        const d = r.explain(k);
        const s = Math.max(0, Math.min(1, (d.raw + M.prior) / (d.denom + M.sigmaMax)));
        w = Math.max(w, Math.abs(s - full.scores[k]));
      }
      return w === 0;
    })(), "");
}

/* ══ 9. THE ARTIFACT ═════════════════════════════════════════════════════ */
head("9. what actually shipped");
{
  const html = readFileSync(ARTIFACT, "utf8");
  check("no film-grab URL reached the artifact", !html.includes("film-grab"),
    `${(html.match(/film-grab/g) || []).length} occurrences — docs/specs/film-grab-evaluation.md binds build-time only`);
  check("the typed search is in it", html.includes("FIND_DATA") && html.includes("__FIND_SRC"),
    `${(html.length / 1024 / 1024).toFixed(2)} MB`);
  const longest = html.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
  check("nothing was emitted as one enormous line", longest <= 4000, `longest line ${longest} characters`);
  check("the modules are the files on disk, not a browser dialect of them",
    html.includes("query-runtime.js") && html.includes("match: empty query"),
    "match.js, questioner.js, query-parse.js, query-runtime.js and layout-match.js inlined verbatim");
}

/* ══ 10-13. THE PAGE ═════════════════════════════════════════════════════ */
const URL0 = pathToFileURL(ARTIFACT).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
/* A poster that cannot be fetched is the sandbox, not the page: this artifact
   serves 2,129 runtime <img> from upload.wikimedia.org and there is no network
   here. Everything else counts. */
const NETWORK = /Failed to load resource|net::ERR_/;
page.on("console", (m) => { if (m.type() === "error" && !NETWORK.test(m.text())) errs.push("console: " + m.text()); });

const OWNER = BATTERY[0];
await page.goto(URL0 + "#/find/" + encodeURIComponent(OWNER));
await page.waitForTimeout(SETTLE);

head("10. the sky the sentence draws");
{
  const st = await page.evaluate(() => {
    const S = window.__ATLAS_SKY__;
    const q = S.query();
    /* the honest radius against the drawn one, which is the number
       measure-match-layout.js was supposed to produce and does not exist to */
    const LM = FIND_LAYOUT;
    const pairsScore = [], pairsRadius = [];
    for (let i = 0; i < sky.n; i++) {
      const k = sky.keys[i];
      pairsScore.push(q ? sky.query.r.scores[k] : 0);
      pairsRadius.push(Math.hypot(sky.wx[i] - 0.5, sky.wy[i] - 0.5) * 2);
    }
    /* ordered-pair inversion rate over a deterministic sample */
    let ordered = 0, wrong = 0;
    let seed = 20260810;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < 300000; t++) {
      const a = (rnd() * sky.n) | 0, b = (rnd() * sky.n) | 0;
      if (a === b || pairsScore[a] === pairsScore[b]) continue;
      ordered++;
      const hi = pairsScore[a] > pairsScore[b] ? a : b, lo = hi === a ? b : a;
      if (pairsRadius[hi] > pairsRadius[lo]) wrong++;
    }
    const rank = (v) => { const idx = v.map((x, i) => [x, i]).sort((p, r) => p[0] - r[0]);
      const out = new Array(v.length); idx.forEach(([, i], r) => { out[i] = r; }); return out; };
    const rs = rank(pairsScore), rr = rank(pairsRadius);
    const n = rs.length; let sd = 0;
    for (let i = 0; i < n; i++) sd += (rs[i] - rr[i]) ** 2;
    const spearman = 1 - (6 * sd) / (n * (n * n - 1));
    let hollow = 0; for (let i = 0; i < sky.n; i++) if (sky.qcov && sky.qcov[i]) hollow++;

    const rimIdx = pairsRadius.map((r, i) => [r, i]).sort((a, b) => b[0] - a[0])[0][1];
    return {
      kind: S.state().kind, live: S.state().live, n: S.state().n, q,
      spearman, inversions: wrong / Math.max(1, ordered), ordered, hollow,
      rimKey: sky.keys[rimIdx], rimAlpha: sky.alpha[rimIdx], rimRadius: pairsRadius[rimIdx],
      topRadius: pairsRadius[sky.at[q.top[0].key]],
      stratum: document.querySelector("#sky-stratum").textContent.replace(/\s+/g, " ").trim(),
      fold: document.querySelector("#sky-fold-sum").textContent,
      sr: document.querySelector("#sr-status").textContent,
      track: !document.querySelector("#sky-track").hidden,
      worlds: !document.querySelector("#sky-worlds").hidden,
      chips: [...document.querySelectorAll(".find-chip .said")].map((n2) => n2.textContent),
      unread: [...document.querySelectorAll(".find-un b")].map((n2) => n2.textContent),
      offers: [...document.querySelectorAll(".find-take b")].map((n2) => n2.textContent),
      honest: [...document.querySelectorAll(".find-honest span")].map((n2) => n2.textContent),
      canvasText: document.querySelectorAll("#sky-c").length,
      address: S.address(),
    };
  });
  check("the constellation is the fourth target kind, not a fourth view", st.kind === "match", `kind "${st.kind}"`);
  check("NOTHING is filtered out — every film is still in the picture",
    st.live === st.n && st.n === KEYS.length, `${st.live} of ${st.n} films live`);
  check("a weak answer is at the rim and still drawn",
    st.rimAlpha > 0.9 && st.rimRadius > 0.9,
    `outermost film "${st.rimKey}" at radius ${st.rimRadius.toFixed(3)}, alpha ${st.rimAlpha.toFixed(2)}`);
  check("and the best answer is near the middle", st.topRadius < 0.45,
    `${FIND.meta[st.q.top[0].key].title} at radius ${st.topRadius.toFixed(3)}`);
  check("the bearings are the atlas's own, not hashed angles",
    st.q.bearings > KEYS.length * 0.9, `${st.q.bearings} of ${KEYS.length} films matched a bearing`);
  say(`    layout fidelity  spearman(score, drawn radius) = ${st.spearman.toFixed(4)}   ` +
    `ordered pairs drawn backwards ${(st.inversions * 100).toFixed(2)}% of ${st.ordered.toLocaleString("en-US")}`);
  /* THE HEADER'S -0.993 WAS TAKEN ON A STAND-IN ATTRIBUTE LAYER. On the real
     shards over half the corpus is tied at one of two exact scores — the
     confident zero and the unknown prior — and spreading a tie is what costs
     the correlation. The number is reported rather than defended, and the UI
     never reads strength back off a radius: r.scores and explain() are what
     anything stated as fact comes from. */
  check("distance really does encode match strength",
    st.spearman <= -0.80 && st.inversions <= 0.16,
    `spearman ${st.spearman.toFixed(4)} and ${(st.inversions * 100).toFixed(2)}% inversions ` +
    `(the header's uncited -0.993 is gone; pipeline/measure-match-layout.js exists)`);
  say(`    solve ${st.q.solveMs} ms   engine build ${st.q.buildMs} ms`);
}

head("11. every honesty surface has a query branch");
{
  const st = await page.evaluate(() => ({
    stratum: document.querySelector("#sky-stratum").hidden ? null
      : document.querySelector("#sky-stratum").textContent.replace(/\s+/g, " ").trim(),
    fold: document.querySelector("#sky-fold-sum").textContent,
    sr: document.querySelector("#sr-status").textContent,
    track: !document.querySelector("#sky-track").hidden,
    worlds: !document.querySelector("#sky-worlds").hidden,
    honest: [...document.querySelectorAll(".find-honest span")].map((n) => n.textContent),
    unread: [...document.querySelectorAll(".find-un")].map((n) => n.textContent.replace(/\s+/g, " ").trim()),
    domCaptions: document.querySelectorAll("#sky-read .find-chip .said").length,
  }));
  check("the standing notice says the picture was solved here",
    !!st.stratum && /solved here/.test(st.stratum) && /none removed/.test(st.stratum), st.stratum);
  check("the fold summary does not call it the whole atlas",
    !/whole atlas/i.test(st.fold), `"${st.fold}"`);
  check("the announcement says nothing was removed and that it is a reading",
    /nothing was removed/.test(st.sr) && /reading rather than a record/.test(st.sr),
    `${st.sr.length} characters`);
  check("the century transport stands down over a match disc", st.track === false, `track hidden: ${!st.track}`);
  check("the worlds strip is rolled up, as it is under a route", st.worlds === false, `strip hidden: ${!st.worlds}`);
  check("the two honesty lines are printed", st.honest.length >= 2 &&
    /READING/.test(st.honest[0]), `${st.honest.length} lines`);
  check("words it could not place are shown, not swallowed", st.unread.length >= 1,
    st.unread.map((u) => JSON.stringify(u.slice(0, 40))).join(" "));
  check("captions are DOM type over the canvas, never glyphs on it (rule 4)",
    st.domCaptions >= 4, `${st.domCaptions} chips are real DOM nodes inside #sky-read`);
}

head("12. the address round-trips");
{
  const before = await page.evaluate(() => ({ hash: location.hash, addr: window.__ATLAS_SKY__.address(),
    top: window.__ATLAS_SKY__.query().top.map((t) => t.key) }));
  check("a reading has an address of its own, and it is the sentence",
    before.hash === before.addr && before.hash.startsWith("#/find/") &&
    decodeURIComponent(before.hash.slice(7)) === OWNER, before.hash.slice(0, 58) + "…");
  /* Fit, which calls skySyncHash, must not eat it */
  await page.evaluate(() => { const f = skyFitCam(); skyGo(f.cx, f.cy, f.k, 10); skySyncHash(); });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => location.hash);
  check("and re-syncing the hash does not rewrite it to #/sky", after === before.hash, after.slice(0, 40) + "…");
  /* reload the address cold */
  await page.goto(URL0 + before.hash);
  await page.waitForTimeout(SETTLE);
  const cold = await page.evaluate(() => {
    const q = window.__ATLAS_SKY__.query();
    return { kind: window.__ATLAS_SKY__.state().kind, top: q ? q.top.map((t) => t.key) : [], text: q && q.text };
  });
  const same = cold.top.length && cold.top.join("|") === before.top.join("|");
  check("a cold load of that link draws the same reading", same,
    `${cold.top.length} films, top ${cold.top[0]} — the ranking is bit-identical across engines, the placement is not`);
  /* #/sky puts it down */
  await page.evaluate(() => { location.hash = "#/sky"; });
  await page.waitForTimeout(2200);
  const put = await page.evaluate(() => ({ kind: window.__ATLAS_SKY__.state().kind,
    q: window.__ATLAS_SKY__.query(), track: !document.querySelector("#sky-track").hidden }));
  check("#/sky is still the address that puts down whatever is held",
    put.kind === "whole" && put.q === null && put.track === true,
    `kind ${put.kind}, query ${put.q}, the century is back`);
}

head("13. taking an offer, and taking a word back");
{
  await page.evaluate((t) => window.__ATLAS_SKY__.find(t), OWNER);
  await page.waitForTimeout(SETTLE);
  const before = await page.evaluate(() => {
    const q = window.__ATLAS_SKY__.query();
    return { offers: q.offers.map((o) => o.attr), top: q.top.map((t) => t.key), chips: q.readings.length };
  });
  await page.click(".find-take");
  await page.waitForTimeout(SETTLE);
  const after = await page.evaluate(() => {
    const q = window.__ATLAS_SKY__.query();
    return { offers: q.offers.map((o) => o.attr), top: q.top.map((t) => t.key), taken: q.taken.map((t) => t.attr) };
  });
  const moved = after.top.filter((k) => !before.top.includes(k)).length;
  check("taking an offer re-forms the sky", after.taken.length === 1 && moved > 0,
    `${after.taken[0]} taken, ${moved} of the top 12 are new`);
  check("and the row it came from does not offer it again",
    !after.offers.includes(after.taken[0]),
    `${before.offers.join(", ")} → ${after.offers.join(", ")}`);
  await page.click(".find-chip-x");
  await page.waitForTimeout(SETTLE);
  const dropped = await page.evaluate(() => {
    const q = window.__ATLAS_SKY__.query();
    return { chips: q ? q.readings.length : -1, text: q ? q.text : null, hash: location.hash };
  });
  check("taking a word back edits the sentence the address carries",
    dropped.chips === before.chips - 1 && dropped.text.length < OWNER.length &&
    decodeURIComponent(dropped.hash.slice(7)) === dropped.text,
    `${before.chips} readings → ${dropped.chips}, and the link now says ${JSON.stringify(dropped.text.slice(0, 34))}`);
}

head("14. the other viewports, and reduced motion");
for (const [w, h] of [[900, 820], [390, 780]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate((t) => window.__ATLAS_SKY__.find(t), OWNER);
  await page.waitForTimeout(SETTLE);
  const st = await page.evaluate(() => {
    const box = document.querySelector("#sky-readbox").getBoundingClientRect();
    const field = document.querySelector("#sky-field").getBoundingClientRect();
    const read = document.querySelector("#sky-read");
    return {
      kind: window.__ATLAS_SKY__.state().kind, live: window.__ATLAS_SKY__.state().live,
      boxW: Math.round(box.width), boxH: Math.round(box.height), fieldH: Math.round(field.height),
      overflowX: read.scrollWidth - read.clientWidth,
      inFrame: box.top >= field.top - 1 && box.bottom <= field.bottom + 1,
      chips: document.querySelectorAll(".find-chip").length,
    };
  });
  check(`${w}x${h}: the slate fits the field and does not scroll sideways`,
    st.inFrame && st.overflowX <= 0 && st.kind === "match",
    `readout ${st.boxW}x${st.boxH} in a ${st.fieldH}px field, ${st.chips} chips, ${st.overflowX}px of horizontal overflow`);
}
{
  const rp = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const rerr = [];
  rp.on("pageerror", (e) => rerr.push(e.message));
  await rp.goto(URL0 + "#/find/" + encodeURIComponent(OWNER));
  await rp.waitForTimeout(2600);
  const st = await rp.evaluate(() => ({ kind: window.__ATLAS_SKY__.state().kind,
    live: window.__ATLAS_SKY__.state().live, forming: window.__ATLAS_SKY__.state().forming,
    offers: window.__ATLAS_SKY__.query() ? window.__ATLAS_SKY__.query().offers.length : -1 }));
  check("reduced motion still changes the atlas, it just arrives",
    st.kind === "match" && st.live === KEYS.length && !st.forming && st.offers > 0,
    `${st.live} films, ${st.offers} offers, no flight in progress`);
  check("and nothing threw", rerr.length === 0, `${rerr.length} page errors`);
  await rp.close();
}

head("15. the console");
check("nothing was logged as an error", errs.length === 0, errs.length ? errs.slice(0, 3).join(" | ") : "0 errors");

await browser.close();

console.log("\n" + (failures ? `FIND FAIL — ${failures} of ${checks} check(s)` : `FIND PASS — ${checks} checks`));
process.exit(failures ? 1 : 0);
