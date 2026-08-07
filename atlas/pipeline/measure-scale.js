#!/usr/bin/env node
/* How much does each signal's selectivity move when the corpus grows?
 *
 *   node pipeline/measure-scale.js --pairs 400000
 *   node pipeline/measure-scale.js --write-cohort pipeline/cohort-803.txt
 *   node pipeline/measure-scale.js --cohort pipeline/cohort-803.txt --pairs 400000
 *
 * WHY THIS EXISTS
 *
 * STATE.md open problem 1 says every `floorIdf` in associate.js was
 * hand-calibrated at N=803 and that none of them mean the same thing at
 * N=5,000. That is written as prose. Prose does not fail a build, and the
 * failure it describes is invisible: a corpus that has drifted still validates,
 * still renders, and still reports a plausible trivia share. The maps just get
 * quietly worse.
 *
 * This turns that prose into a number. It reports, per signal, how often a
 * random pair of films clears that signal's floor -- at several corpus sizes --
 * and the ratio between the extremes. A signal whose ratio is near 1.0 is
 * scale-free. A signal at 2x or 4x will mean something different after growth
 * than it meant when it was tuned, and the ratio says how much.
 *
 * WHAT THIS IS STRUCTURALLY BLIND TO — READ THIS BEFORE TRUSTING A CLEAN RESULT
 *
 * `GATED` below lists only the floorIdf-gated signals. `crew` and `adaptation`
 * are excluded because they gate on identity, not rarity (floorIdf 0) — and
 * `crew` is the signal that swamps the edge budget as the corpus grows. This
 * tool also models none of `MAX_EDGES_PER_VALUE`, the one-edge-per-pair
 * contest, or per-film edge selection.
 *
 * So it can report "every floor is within the control's margin" while half the
 * graph quietly turns into filmography browsing. A clean table here is NOT a
 * clean bill of health for the corpus. The instrument that catches that is
 * `measure-claims.js`, read at its `crew %` and `REPEATED` lines rather than
 * at `TRIVIA SHARE`.
 *
 * WHAT IT DELIBERATELY DOES NOT MODEL
 *
 * `usable()` in associate.js -- STOP_VALUES, VACUOUS, VAGUE_PLACE, ADMIN_TYPES
 * -- is not replicated here, and that is a deliberate choice rather than a
 * shortcut. Every one of those filters is a STATIC stop list: whether "United
 * States" is stop-listed does not depend on N. A scale-invariant filter cannot
 * contribute to scale drift, so omitting it shifts each absolute rate by a
 * constant factor and leaves the RATIO -- the thing being measured -- untouched.
 *
 * So read the absolute percentages as "how often the floor is cleared", not as
 * "how many edges get built". The drift column is the number that matters, and
 * it is faithful.
 *
 * WHY SUBSAMPLING IS HONEST HERE
 *
 * A smaller corpus is simulated by dropping films, which is exactly the
 * relationship a future larger corpus has to today's: today's 803 is a
 * subsample of the 2,000-film corpus that is coming. Reading the ladder
 * left-to-right shows the direction each signal is already moving.
 *
 * The ladder is capped at the corpus you actually have -- this measures drift
 * that has HAPPENED, and cannot extrapolate past the data.
 *
 * BUT TWO RUNS ARE NOT COMPARABLE UNLESS YOU PIN THE COHORT. An earlier version
 * of this header said to re-run after a harvest and read the extended ladder as
 * the answer to "did growth break the thresholds". That was WRONG, and the way
 * it was wrong is the kind that reads as a regression: `subsample()` takes the
 * n lowest key hashes, so the "N=803" rung of a 2,000-film corpus is a
 * hash-selected 803 films, not the 803 the corpus holds today. Measured across
 * exactly that pair, `subject` reads 0.55% today and 0.30% on the 803-rung of a
 * grown corpus -- same tool, same flags, different films.
 *
 * Use --write-cohort before a harvest and --cohort after it, and the rungs name
 * the same films on both sides. Without a pinned cohort, compare DRIFT RATIOS
 * only, never absolute rates, and never across harvests.
 */

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "out");

/* Mirrors SIGNALS in associate.js. Only the floorIdf-gated signals appear:
   crew and adaptation have floorIdf 0 (they gate on identity, not rarity) and
   keyword gates on surprise() instead, which is measured separately below as
   the scale-free control. */
const GATED = [
  { signal: "sameAuthor", field: "author",  prop: "sourceAuthors", floorIdf: 0.25 },
  { signal: "movement",   field: "movement", prop: "movement",     floorIdf: 0.18 },
  { signal: "subject",    field: "subject",  prop: "subject",      floorIdf: 0.28 },
  { signal: "setting",    field: "setting",  prop: "setting",      floorIdf: 0.28 },
  { signal: "cast",       field: "cast",     prop: "cast",         floorIdf: 0.22 },
  { signal: "genreEra",   field: "genre",    prop: "genre",        floorIdf: 0.26 },
  { signal: "studio",     field: "studio",   prop: "studio",       floorIdf: 0.30 },
  { signal: "genre",      field: "genre",    prop: "genre",        floorIdf: 0.14 },
  { signal: "countryEra", field: "country",  prop: "country",      floorIdf: 0.10 },
];

const MIN_SHARED_KEYWORDS = 3;

const idf = (n, N) => (n <= 0 ? 0 : Math.min(1, Math.log(N / n) / Math.log(N)));

/* Deterministic everywhere: the same corpus must produce the same report twice,
   or a drift number cannot be compared against the one in the last commit. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* Subsample by hashing the film key and taking the lowest hashes. Stable
   (a film's membership does not depend on corpus order) and nested (the N=200
   sample is a subset of the N=400 sample), so consecutive ladder rows differ
   only by the films added -- which is what makes the columns comparable. */
function subsample(keys, n) {
  return keys.slice().sort((a, b) => hash32(a) - hash32(b) || (a < b ? -1 : 1)).slice(0, n);
}

function measure(films, keys, pairCount) {
  const N = keys.length;
  const freq = {};
  const bump = (field, v) => { const k = field + ":" + v; freq[k] = (freq[k] || 0) + 1; };
  for (const k of keys) {
    const f = films[k];
    (f.genre || []).forEach((v) => bump("genre", v));
    (f.movement || []).forEach((v) => bump("movement", v));
    (f.subject || []).forEach((v) => bump("subject", v));
    (f.setting || []).forEach((v) => bump("setting", v));
    (f.cast || []).forEach((v) => bump("cast", v));
    (f.studio || []).forEach((v) => bump("studio", v));
    (f.sourceAuthors || []).forEach((v) => bump("author", v));
    (f.country || []).forEach((v) => bump("country", v));
    (f.keywords || []).forEach((v) => bump("keyword", v));
  }

  /* Same Poisson tail as associate.js surprise(), recomputed against THIS
     subsample's frequencies -- which is the whole point of it being scale-free.
     Duplicated rather than imported because associate.js is a script that runs
     its main() on load; importing it would rebuild the corpus as a side effect. */
  const surprise = (a, b, observed) => {
    const A = films[a].keywords || [];
    if (!A.length || observed <= 0) return 0;
    let lambda = 0;
    for (const v of A) lambda += ((freq["keyword:" + v] || 1) - 1) / Math.max(1, N - 1);
    if (lambda <= 0) return 12;
    let cum = 0, term = Math.exp(-lambda);
    for (let i = 0; i < observed; i++) { cum += term; term *= lambda / (i + 1); }
    return -Math.log10(Math.max(1e-12, 1 - cum));
  };

  const rnd = mulberry32(0x5eed);
  const fired = {};
  for (const g of GATED) fired[g.signal] = 0;
  fired.keyword = 0;

  let drawn = 0;
  const maxPairs = Math.min(pairCount, (N * (N - 1)) / 2);
  const seen = new Set();
  let guard = 0;
  while (drawn < maxPairs && guard < maxPairs * 20) {
    guard++;
    const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N);
    if (i === j) continue;
    const key = i < j ? i * N + j : j * N + i;
    if (seen.has(key)) continue;
    seen.add(key);
    drawn++;
    const a = keys[i], b = keys[j];

    for (const g of GATED) {
      const A = films[a][g.prop] || [], B = new Set(films[b][g.prop] || []);
      let best = -1;
      for (const v of A) if (B.has(v)) { const r = idf(freq[g.field + ":" + v] || 1, N); if (r > best) best = r; }
      if (best >= g.floorIdf) fired[g.signal]++;
    }

    const KA = films[a].keywords || [], KB = new Set(films[b].keywords || []);
    let shared = 0;
    for (const v of KA) if (KB.has(v)) shared++;
    if (shared >= MIN_SHARED_KEYWORDS && surprise(a, b, shared) >= 3) fired.keyword++;
  }

  const rate = {};
  for (const k of Object.keys(fired)) rate[k] = drawn ? (fired[k] / drawn) * 100 : 0;
  return { N, drawn, rate, fired: { ...fired } };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const pairs = parseInt(arg("pairs", "250000"), 10);

  const H = JSON.parse(fs.readFileSync(path.join(OUT, "harvest.json"), "utf8"));
  const films = H.films;
  const keys = Object.keys(films);

  /* Keywords live in enrich.json, not harvest.json, and the keyword signal is
     the scale-free control this whole report is measured against -- without
     them the control column is silently zero and the comparison is worthless. */
  const ep = path.join(OUT, "enrich.json");
  let kwFilms = 0;
  if (fs.existsSync(ep)) {
    const E = JSON.parse(fs.readFileSync(ep, "utf8"));
    for (const k of keys) {
      const raw = (E[k] && E[k].keywords) || [];
      const vals = [...new Set(raw.map((s) => String(s).trim().toLowerCase()))].filter((s) => s && s.length > 2);
      if (vals.length) { films[k].keywords = vals.map((s) => "kw:" + s); kwFilms++; }
    }
  }

  /* A COHORT PINS *WHICH* FILMS, NOT JUST HOW MANY.
   *
   * subsample() picks the n lowest key hashes, so "the N=803 rung" of a
   * 2,000-film corpus is a hash-selected 803 films -- NOT the 803 this corpus
   * holds today. Measured across exactly that pair, the same signal reads
   * 0.55% today and 0.30% on the 803-rung of a grown corpus. So a table
   * produced before a harvest CANNOT be diffed against one produced after it,
   * and the earlier advice in STATE.md to "re-run after any harvest" to see
   * whether growth moved the thresholds was wrong as written: the drift column
   * is only meaningful WITHIN one run.
   *
   * --write-cohort freezes today's film set to a file; --cohort restricts a
   * later run to those same films. Rungs then name the same cohort on both
   * sides of a harvest and the two tables are comparable. Without it, compare
   * drift ratios only, never absolute rates. */
  const cohortPath = arg("cohort", null);
  if (cohortPath) {
    const want = new Set(fs.readFileSync(cohortPath, "utf8").split("\n").map((l) => l.trim()).filter(Boolean));
    const kept = keys.filter((k) => want.has(k));
    const missing = want.size - kept.length;
    keys.length = 0;
    keys.push(...kept);
    process.stdout.write(`cohort : ${kept.length}/${want.size} films from ${path.basename(cohortPath)}`
      + (missing ? ` (${missing} no longer in the corpus)` : "") + "\n");
  }
  const writeCohort = arg("write-cohort", null);
  if (writeCohort) {
    fs.writeFileSync(writeCohort, keys.join("\n") + "\n");
    process.stdout.write(`cohort written -> ${writeCohort} (${keys.length} films)\n`);
  }

  const full = keys.length;
  /* Default ladder starts at 550, not 200. Below that the keyword control
     fires on too few pairs to be usable -- at N=200 only 19,900 pairs exist in
     total, and the control lands ~11 events -- so a six-rung ladder prints
     "noisy" for the control and a worst-case figure ~35% higher than the
     550-and-up ladder. Someone re-running the bare command would read that
     difference as a regression caused by growth. The default now matches the
     invocation whose numbers are worth quoting. */
  const ladder = (arg("ladder", "") || [550, 700, full]
    .filter((n, i, a) => n <= full && a.indexOf(n) === i).join(","))
    .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n > 20 && n <= full);
  if (ladder[ladder.length - 1] !== full) ladder.push(full);

  process.stdout.write(`corpus : ${full} films, ${kwFilms} with keywords\n`);
  process.stdout.write(`pairs  : ${pairs.toLocaleString()} sampled per rung (deterministic)\n`);
  process.stdout.write(`ladder : ${ladder.join(", ")}\n\n`);

  const rows = ladder.map((n) => measure(films, subsample(keys, n), pairs));

  const names = [...GATED.map((g) => g.signal), "keyword"];
  const pad = (s, w) => String(s).padEnd(w);
  const rpad = (s, w) => String(s).padStart(w);

  process.stdout.write(pad("signal", 12) + rpad("floor", 6) + ladder.map((n) => rpad("N=" + n, 9)).join("") + rpad("drift", 8) + "\n");
  process.stdout.write("-".repeat(12 + 6 + ladder.length * 9 + 8) + "\n");

  /* A ratio between two small event counts is noise with a decimal point. At
     N=200 there are only 19,900 pairs in existence, so a signal firing on 0.01%
     of them is being measured from about twelve events -- and the first run of
     this tool duly reported a confident "6.35x" for sameAuthor built on exactly
     that. Any rung below this many events makes the row unquotable, and the
     tool has to say so rather than print the number and hope. */
  const MIN_EVENTS = 100;

  const drifts = [];
  for (const name of names) {
    const g = GATED.find((x) => x.signal === name);
    const vals = rows.map((r) => r.rate[name]);
    const counts = rows.map((r) => r.fired[name]);
    const minCount = Math.min(...counts);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const solid = minCount >= MIN_EVENTS && lo > 0;
    const drift = solid ? hi / lo : NaN;
    if (name !== "keyword") drifts.push({ name, drift, minCount });
    process.stdout.write(
      pad(name, 12) + rpad(g ? g.floorIdf.toFixed(2) : "surp", 6) +
      vals.map((v) => rpad(v.toFixed(2) + "%", 9)).join("") +
      rpad(solid ? drift.toFixed(2) + "x" : "noisy", 8) +
      (solid ? "" : `   (min ${minCount} events < ${MIN_EVENTS})`) +
      (name === "keyword" ? "   <- scale-free control" : "") + "\n");
  }

  const kwCounts = rows.map((r) => r.fired.keyword);
  const kwVals = rows.map((r) => r.rate.keyword);
  const kwSolid = Math.min(...kwCounts) >= MIN_EVENTS && Math.min(...kwVals) > 0;
  const kwDrift = kwSolid ? Math.max(...kwVals) / Math.min(...kwVals) : NaN;
  const solidDrifts = drifts.filter((d) => isFinite(d.drift));
  const worst = solidDrifts.sort((a, b) => b.drift - a.drift)[0];
  const noisy = drifts.filter((d) => !isFinite(d.drift)).map((d) => d.name);

  process.stdout.write("\n");
  process.stdout.write(kwSolid
    ? `keyword (surprise) drifts ${kwDrift.toFixed(2)}x across this ladder.\n`
    : "keyword (surprise) fires too rarely at the small rungs to give a usable control.\n");
  if (worst) {
    process.stdout.write(`worst measurable floorIdf signal is ${worst.name} at ${worst.drift.toFixed(2)}x`);
    process.stdout.write(kwSolid ? ` — ${(worst.drift / kwDrift).toFixed(1)}x the control.\n` : ".\n");
  }
  if (noisy.length) {
    process.stdout.write(`not measurable on this ladder (too few events): ${noisy.join(", ")}.\n`);
    process.stdout.write("Raise --pairs, or drop the small rungs — at N=200 only 19,900 pairs exist,\n" +
      "so a rare signal cannot be measured there no matter how many are sampled.\n");
  }
  process.stdout.write(
    "\nRead the drift column, not the percentages: usable() is not modelled here\n" +
    "(see the header), so absolute rates are high by a constant factor that\n" +
    "cancels out of the ratio. A signal near 1.0x is scale-free. Anything well\n" +
    "above that was tuned at one corpus size and is being read at another.\n");
}

main();
