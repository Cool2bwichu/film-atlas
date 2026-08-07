#!/usr/bin/env node
/* Grow the seed list by CONNECTION DENSITY, not by count.
 *
 *   node pipeline/expand-seeds.js --target 1200 > pipeline/seeds-expansion.txt
 *
 * WHY THIS EXISTS
 *
 * seeds.txt opens with the rule this script implements: "Grow this by
 * CONNECTION DENSITY, not by count. The pilot corpus fragmented into three
 * islands because films were added for their own sake. Adding a film that
 * shares no crew and no adaptation with anything already present creates an
 * orphan, and an orphan is worse than an absence."
 *
 * The obvious way to grow to 2,000 films is to write 1,200 more titles by
 * hand. That reproduces the exact failure the rule warns about, because a
 * human list is assembled by reputation — and reputation is uncorrelated with
 * whether a film has a formal tie to anything already in the corpus. It also
 * quietly re-imports the canon bias that AGENTS rule 1 exists to prevent.
 *
 * So the candidate set is derived from the corpus instead of guessed at. Ask
 * Wikidata which films share a HAND with a film already present -- the same
 * director, cinematographer, editor, composer or screenwriter -- and rank
 * candidates by how many DISTINCT corpus films they reach. A film tied to five
 * different corpus films is embedded; one tied to a single film hangs off the
 * edge and is exactly the future orphan the rule is about.
 *
 * WHAT IS DELIBERATELY NOT USED AS A GROWTH SIGNAL
 *
 * Studio (P272), genre (P136) and country (P495) are excluded from ranking
 * entirely. They are the signals `measure-claims.js` counts as trivia, and
 * worse, they select for volume: ranking by shared studio returns whoever
 * released the most films, which is a list of major-studio output and precisely
 * the canon collapse rule 1 forbids. They stay in the corpus as weak ties --
 * they are load-bearing for traversal -- but they must not decide who gets in.
 *
 * Cast (P161) IS used, at a quarter weight. A shared actor is the "shares a
 * face" signal, which the project treats as trivia-adjacent; it is a real tie
 * and a poor argument. Quarter weight lets it break ties between crew-equal
 * candidates without ever promoting a film on its own.
 *
 * COUNTING IS EXACT, NOT APPROXIMATE
 *
 * Corpus films are chunked to stay under the 60s query limit, and each chunk
 * aggregates with COUNT(DISTINCT ?seed) server-side to keep the payload small.
 * Summing those counts across chunks is exact rather than an approximation,
 * because the chunks PARTITION the seed set -- a candidate reaching seeds in
 * two chunks reaches two disjoint sets, so n1 + n2 is the true distinct total.
 * Aggregating on ?cand instead would not have this property.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");

const CACHE = path.join(__dirname, ".cache-expand");
const CORPUS = path.join(__dirname, "..", "static", "corpus.json");
const UA = "AtlasFilmLineage/0.3 (corpus pipeline; https://github.com/atlas-film-lineage)";
const ENDPOINT = "https://query.wikidata.org/sparql";
const THROTTLE_MS = parseInt(process.env.ATLAS_THROTTLE_MS || "900", 10);
const CHUNK = parseInt(process.env.ATLAS_CHUNK || "60", 10);

fs.mkdirSync(CACHE, { recursive: true });

const FILM_TYPES = ["Q11424", "Q24869", "Q226730", "Q202866", "Q29168811", "Q20650540", "Q506240"];
const TYPE_VALUES = FILM_TYPES.map((q) => "wd:" + q).join(" ");

/* The hand signals, and the one trivia-adjacent signal allowed to break ties.
   Weight is per DISTINCT corpus film reached through that property. */
const TIES = [
  { label: "director", prop: "P57", weight: 1.0 },
  { label: "cinematographer", prop: "P344", weight: 1.0 },
  { label: "editor", prop: "P1040", weight: 0.9 },
  { label: "composer", prop: "P86", weight: 0.8 },
  { label: "screenwriter", prop: "P58", weight: 0.9 },
  { label: "cast", prop: "P161", weight: 0.25 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const qidOf = (uri) => (uri || "").replace("http://www.wikidata.org/entity/", "");

/* Same transport contract as harvest-sparql.js: POST, because a VALUES clause
   listing 60 QIDs blows past any sane URL length, and because behind an egress
   proxy a GET query returns a bare 502 while POST succeeds. */
function post(query) {
  const body = "query=" + encodeURIComponent(query) + "&format=json";
  return new Promise((resolve, reject) => {
    const req = https.request(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        "Accept": "application/sparql-results+json",
        "Accept-Encoding": "gzip",
      },
    }, (res) => {
      const buf = [];
      const stream = /gzip/.test(res.headers["content-encoding"] || "") ? res.pipe(zlib.createGunzip()) : res;
      stream.on("data", (c) => buf.push(c));
      stream.on("end", () => {
        const text = Buffer.concat(buf).toString("utf8");
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode + ": " + text.slice(0, 120)));
        try { resolve(JSON.parse(text)); } catch (_e) { reject(new Error("bad JSON: " + text.slice(0, 120))); }
      });
      stream.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

async function sparql(label, query, attempt) {
  const key = path.join(CACHE, label + "_" + hash(query) + ".json");
  if (fs.existsSync(key)) {
    try { return JSON.parse(fs.readFileSync(key, "utf8")); } catch (_e) { /* refetch */ }
  }
  const n = attempt || 0;
  try {
    const d = await post(query);
    const rows = (d.results && d.results.bindings) || [];
    fs.writeFileSync(key, JSON.stringify(rows));
    await sleep(THROTTLE_MS);
    return rows;
  } catch (e) {
    const retryable = /HTTP 429|HTTP 5\d\d|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/.test(e.message);
    if (!retryable || n >= 4) { process.stderr.write("  ! " + label + ": " + e.message.slice(0, 90) + "\n"); return null; }
    const wait = Math.round(2000 * Math.pow(1.8, n) + Math.random() * 800);
    process.stderr.write("  (retry " + (n + 1) + " in " + wait + "ms)\n");
    await sleep(wait);
    return sparql(label, query, n + 1);
  }
}

/* A candidate must carry an English Wikipedia article and a release year.
   The article is a notability proxy AND a practical requirement: enrich.js
   pulls the poster and the description from the enwiki sitelink, so a film
   without one arrives with no artwork and no text and lands in the corpus as a
   generated cell with nothing to read. The year is needed to disambiguate the
   seed line -- "Solaris" is three films and the resolver refuses to guess. */
function tieQuery(prop, seedQids) {
  const values = seedQids.map((q) => "wd:" + q).join(" ");
  /* MIN(?y), not GROUP BY ?year. A film carries one P577 per release territory,
     so grouping by year emits one row per territory and Variety Lights arrives
     three times as 1950, 1951 and 1954 -- three seed lines, two of them wrong,
     for one film. The earliest date is the film's year by the convention the
     corpus already follows. */
  return `
SELECT ?cand ?candLabel (MIN(?y) AS ?year) (COUNT(DISTINCT ?seed) AS ?n) WHERE {
  VALUES ?seed { ${values} }
  VALUES ?type { ${TYPE_VALUES} }
  ?seed wdt:${prop} ?person .
  ?cand wdt:${prop} ?person .
  ?cand wdt:P31 ?type .
  ?cand wdt:P577 ?date .
  BIND(YEAR(?date) AS ?y)
  FILTER(?cand != ?seed)
  ?article schema:about ?cand ; schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?cand ?candLabel`;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name, dflt) => {
    const i = argv.indexOf("--" + name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  const target = parseInt(arg("target", "1200"), 10);
  const minReach = parseFloat(arg("min-reach", "2"));

  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
  const films = corpus.films;
  const seedQids = Object.keys(films).map((k) => films[k].qid).filter(Boolean);
  const inCorpus = new Set(seedQids);
  /* Title+year match too, not just QID: a film can sit in the corpus under a
     different Wikidata item (re-releases and restorations get their own), and
     re-seeding it would produce a duplicate rather than a new film. */
  const inCorpusTitle = new Set(Object.keys(films).map((k) => `${films[k].title}::${films[k].year}`));

  process.stderr.write(`corpus: ${seedQids.length} films with a QID\n`);

  const groups = chunks(seedQids, CHUNK);
  const cand = {};   /* qid -> { title, year, score, reach, via:{} } */

  for (const tie of TIES) {
    let rows = 0;
    for (let i = 0; i < groups.length; i++) {
      const label = `${tie.label}_${i}`;
      const res = await sparql(label, tieQuery(tie.prop, groups[i]));
      if (!res) continue;
      rows += res.length;
      for (const r of res) {
        const q = qidOf(r.cand && r.cand.value);
        if (!q || inCorpus.has(q)) continue;
        const title = r.candLabel && r.candLabel.value;
        const year = r.year && parseInt(r.year.value, 10);
        /* An unlabelled item resolves to its own QID as a label. That is not a
           title, and seeding it would ask the resolver to match "Q12345". */
        if (!title || /^Q\d+$/.test(title) || !year) continue;
        const n = parseInt((r.n && r.n.value) || "0", 10);
        if (!n) continue;
        const c = cand[q] || (cand[q] = { qid: q, title, year, score: 0, reach: 0, via: {} });
        /* MIN is computed per chunk, so the true earliest year is the min
           across the chunks a candidate appears in, not whichever landed first. */
        if (year < c.year) c.year = year;
        c.score += n * tie.weight;
        c.via[tie.label] = (c.via[tie.label] || 0) + n;
        /* reach counts hand ties only. Cast can make a film look embedded when
           every one of its ties is a shared face, which is the weakest claim
           the corpus makes and not a reason to admit a film. */
        if (tie.label !== "cast") c.reach += n;
      }
      process.stderr.write(`\r  ${tie.label}: chunk ${i + 1}/${groups.length}, ${Object.keys(cand).length} candidates   `);
    }
    process.stderr.write(`\r  ${tie.label}: ${rows} rows, ${Object.keys(cand).length} candidates so far\n`);
  }

  /* One film can hold more than one Wikidata item -- a restoration or a
     re-release gets its own -- and both would emit the same seed line. Fold
     them by title+year, keeping the strongest, so the seed list has no
     duplicate the resolver would have to arbitrate. */
  const folded = {};
  for (const c of Object.values(cand)) {
    const k = `${c.title}::${c.year}`;
    const prev = folded[k];
    if (!prev || c.score > prev.score) folded[k] = c;
  }

  const all = Object.values(folded)
    .filter((c) => !inCorpusTitle.has(`${c.title}::${c.year}`))
    .filter((c) => c.reach >= minReach)
    .sort((a, b) => b.score - a.score || b.reach - a.reach || a.year - b.year);

  process.stderr.write(`\n${all.length} candidates with hand-reach >= ${minReach}; taking ${Math.min(target, all.length)}\n`);

  const picked = all.slice(0, target);
  const byDecade = {};
  for (const c of picked) { const d = Math.floor(c.year / 10) * 10; byDecade[d] = (byDecade[d] || 0) + 1; }
  process.stderr.write("decade spread: " + Object.keys(byDecade).sort().map((d) => `${d}s:${byDecade[d]}`).join("  ") + "\n");

  /* Seed lines must be EXACTLY "Title (Year)". parseSeeds() in
     harvest-sparql.js anchors its year regex to end-of-line, so a trailing
     "# reach 4" comment does not read as a comment -- it makes the whole line
     fail the match and get resolved as a title with no year, which is the
     ambiguity the resolver is built to refuse. Ranking detail goes to a
     separate report file instead. */
  const out = [];
  out.push("# Expansion seeds, generated by pipeline/expand-seeds.js.");
  out.push("# Ranked by how many DISTINCT corpus films each candidate reaches");
  out.push("# through a shared hand (director, cinematographer, editor, composer,");
  out.push("# screenwriter), with shared cast at quarter weight as a tiebreak.");
  out.push("# Studio, genre and country are excluded: they select for volume.");
  out.push("#");
  out.push(`# ${picked.length} titles, hand-reach >= ${minReach}, from a ${seedQids.length}-film corpus.`);
  out.push("# Ranking detail: seeds-expansion.report.tsv");
  out.push("");
  for (const c of picked) out.push(`${c.title} (${c.year})`);
  process.stdout.write(out.join("\n") + "\n");

  const reportPath = arg("report", path.join(__dirname, "seeds-expansion.report.tsv"));
  const rep = ["qid\ttitle\tyear\treach\tscore\tvia"];
  for (const c of picked) {
    const via = Object.keys(c.via).map((k) => `${k}:${c.via[k]}`).join(" ");
    rep.push([c.qid, c.title, c.year, c.reach, c.score.toFixed(2), via].join("\t"));
  }
  fs.writeFileSync(reportPath, rep.join("\n") + "\n");
  process.stderr.write(`ranking detail -> ${reportPath}\n`);
}

main().catch((e) => { process.stderr.write("FATAL: " + e.stack + "\n"); process.exit(1); });
