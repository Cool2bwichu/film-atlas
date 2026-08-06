#!/usr/bin/env node
/* What KIND of claim does a reader actually see? Across every seed in the corpus.
 *
 *   node pipeline/measure-claims.js [--corpus static/corpus.json] [--limit 6]
 *
 * measure-maps.js asks whether a map is diverse. This asks whether it is worth
 * reading, which is a different failure: a map can be six different directors,
 * six different decades and six different countries while every line says
 * "both are crime films made in the seventies".
 *
 * The number that matters is the trivia share — the fraction of everything a
 * reader sees that is genre/era coincidence or an incidental shared face. It was
 * 54% before ranking was fixed and 36% after, and seven further ranking policies
 * all returned 36% because selection cannot produce quality the corpus does not
 * contain (HISTORY, "Ranking is now at its floor"). Moving it requires more
 * discriminating attributes, so this script exists to tell you whether a new
 * attribute actually moved it.
 *
 * The ranking below is a deliberate duplicate of `connections()` in
 * app/template.html. Duplication is the wrong default, but the app is a single
 * templated file with no module system by design, and a measurement that
 * approximates the ranking instead of reproducing it would report numbers the
 * reader never sees. If you change ranking in one, change it in both — the
 * self-check at the bottom will tell you when they have drifted apart.
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const CORPUS = path.resolve(ROOT, arg("corpus", path.join("static", "corpus.json")));
const LIMIT = parseInt(arg("limit", "6"), 10);

/* Must match SIGNAL_WEIGHT in app/template.html. */
const SIGNAL_WEIGHT = {
  adaptation: 1.00, sameAuthor: 0.96, keyword: 0.88, movement: 0.80, setting: 0.72,
  subject: 0.66, crew: 0.60, studio: 0.50, genre: 0.26, cast: 0.24,
  countryEra: 0.13, genreEra: 0.12,
};

/* Trivia is not "the weak signals". It is the claims that tell a reader nothing
   about the films: era-and-genre coincidence, and a face that happens to recur.
   `genre` alone is borderline and counted in, because "both are horror films" is
   a category rather than a connection. Weak ties still belong in the GRAPH —
   they are what keeps it traversable (AGENTS, "weak ties are load-bearing").
   This measures what gets SHOWN. */
const TRIVIA = new Set(["genreEra", "countryEra", "genre", "cast"]);

function main() {
  if (!fs.existsSync(CORPUS)) {
    console.error("no corpus at " + CORPUS);
    process.exit(1);
  }
  const c = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
  const F = c.films, E = c.edges;
  const keys = Object.keys(F);

  const ADJ = {};
  for (const k of keys) ADJ[k] = [];
  E.forEach((e, i) => { if (ADJ[e.a]) ADJ[e.a].push(i); if (ADJ[e.b]) ADJ[e.b].push(i); });

  const sigWeight = (e) => e.source && e.source !== "record" ? 1.0
    : (SIGNAL_WEIGHT[e.signal] !== undefined ? SIGNAL_WEIGHT[e.signal] : 0.5);
  const sigOf = (x) => (x.e.source && x.e.source !== "record") ? "authored" : (x.e.signal || x.e.type);

  function connections(key, limit) {
    const seedYear = F[key].year || 0;
    const seedDir = F[key].director || "";
    const scored = ADJ[key].map((i) => {
      const e = E[i], other = e.a === key ? e.b : e.a;
      if (!F[other]) return null;
      let s = (e.strength || 0) * sigWeight(e);
      const o = F[other];
      if (o.director && o.director === seedDir) s *= 0.55;
      if (Math.abs((o.year || 0) - seedYear) < 8) s *= 0.9;
      return { key: other, e, score: s };
    }).filter(Boolean).sort((a, b) => b.score - a.score);

    /* Mirrors the repetition decay in app/template.html connections(). */
    const CLAIM_DECAY = 1.0, SIGNAL_DECAY = 0.2;
    const out = [], dirCount = {}, sigCount = {}, claimCount = {};
    const dirOK = (x) => (dirCount[F[x.key].director] || 0) < 2;
    const take = (x) => { out.push(x); const d = F[x.key].director; dirCount[d] = (dirCount[d] || 0) + 1;
      sigCount[sigOf(x)] = (sigCount[sigOf(x)] || 0) + 1;
      claimCount[x.e.claim] = (claimCount[x.e.claim] || 0) + 1; };
    const fill = (test) => {
      while (out.length < limit) {
        let best = null, bestScore = -1;
        for (const x of scored) {
          if (out.indexOf(x) >= 0 || !test(x)) continue;
          const nc = claimCount[x.e.claim] || 0, ns = sigCount[sigOf(x)] || 0;
          const s = sigOf(x) === "authored"
            ? x.score / (1 + nc * CLAIM_DECAY)
            : x.score / ((1 + nc * CLAIM_DECAY) * (1 + ns * SIGNAL_DECAY));
          if (s > bestScore) { bestScore = s; best = x; }
        }
        if (!best) break;
        take(best);
      }
    };
    fill(dirOK);
    fill(() => true);
    return out;
  }

  const bySignal = {}, byType = {};
  let shown = 0, trivia = 0, authored = 0, thin = 0, repeated = 0, mapsWithRepeat = 0;
  const unknownSignals = new Set();

  for (const k of keys) {
    const conns = connections(k, LIMIT);
    if (conns.length < LIMIT) thin++;
    /* A line that repeats another line on the SAME map is worse than a weak
       one — it spends a slot saying nothing new. Counting it as its signal
       (usually a good one) flattered the trivia share and made any fix for
       repetition look like a regression. Report it separately. */
    const claimSeen = {};
    for (const x of conns) {
      claimSeen[x.e.claim] = (claimSeen[x.e.claim] || 0) + 1;
      if (claimSeen[x.e.claim] > 1) repeated++;
    }
    if (Object.values(claimSeen).some((n) => n > 1)) mapsWithRepeat++;
    for (const x of conns) {
      const e = x.e;
      const sig = e.source && e.source !== "record" ? "authored" : (e.signal || "(none)");
      if (sig !== "authored" && SIGNAL_WEIGHT[sig] === undefined) unknownSignals.add(sig);
      bySignal[sig] = (bySignal[sig] || 0) + 1;
      byType[e.type] = (byType[e.type] || 0) + 1;
      shown++;
      if (sig === "authored") authored++;
      else if (TRIVIA.has(sig)) trivia++;
    }
  }

  const pc = (n) => ((n / shown) * 100).toFixed(1).padStart(5) + "%";
  console.log("corpus : " + path.relative(ROOT, CORPUS));
  console.log("seeds  : " + keys.length + "   lines shown: " + shown +
    "   (" + thin + " films cannot fill " + LIMIT + " lines)");
  console.log("\nwhat a reader sees, by signal:");
  for (const [s, n] of Object.entries(bySignal).sort((a, b) => b[1] - a[1]))
    console.log("  " + s.padEnd(12) + pc(n) + "   " + String(n).padStart(6) +
      (TRIVIA.has(s) ? "   <- trivia" : ""));
  console.log("\nby type:");
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1]))
    console.log("  " + t.padEnd(12) + pc(n) + "   " + String(n).padStart(6));

  console.log("\nTRIVIA SHARE : " + pc(trivia).trim() +
    "      (genre/era coincidence + incidental cast)");
  console.log("AUTHORED     : " + pc(authored).trim() +
    "      (readings, not record)");
  console.log("REPEATED     : " + pc(repeated).trim() +
    "      (a verbatim repeat of another line on the same map, in " +
    mapsWithRepeat + " maps)");

  if (unknownSignals.size) {
    console.log("\nWARNING: signals with no entry in SIGNAL_WEIGHT, ranked at the 0.5 default: " +
      [...unknownSignals].join(", "));
    console.log("         Add them to app/template.html AND to this file, or they rank mid-table by accident.");
  }

  /* Drift guard: this file duplicates the app's ranking table, so prove the two
     still agree rather than trusting that they do. */
  const tpl = fs.readFileSync(path.join(ROOT, "app", "template.html"), "utf8");
  const m = tpl.match(/const SIGNAL_WEIGHT\s*=\s*\{([\s\S]*?)\}/);
  if (m) {
    const inApp = {};
    for (const pair of m[1].matchAll(/(\w+)\s*:\s*([\d.]+)/g)) inApp[pair[1]] = parseFloat(pair[2]);
    const diffs = [];
    for (const s of new Set([...Object.keys(inApp), ...Object.keys(SIGNAL_WEIGHT)]))
      if (inApp[s] !== SIGNAL_WEIGHT[s]) diffs.push(s + ": app " + inApp[s] + " vs here " + SIGNAL_WEIGHT[s]);
    if (diffs.length) {
      console.log("\nFAIL: ranking has drifted from app/template.html:");
      diffs.forEach((d) => console.log("  " + d));
      process.exit(1);
    }
    console.log("\nranking matches app/template.html.");
  }
}

main();
