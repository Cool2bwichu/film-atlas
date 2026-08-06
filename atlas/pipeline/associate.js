#!/usr/bin/env node
/* The association engine.
 *
 *   node pipeline/associate.js        # pipeline/out/harvest.json -> out/spine.json
 *
 * Builds typed, explainable connections between every pair of films in the
 * corpus from structured attributes alone. No language model, no hand-written
 * claim, and it scales to any number of films.
 *
 * ── THE GOVERNING IDEA ───────────────────────────────────────────────────────
 *
 * An association is interesting in proportion to how RARE the thing being
 * shared is.
 *
 * Two films sharing "drama" tells you nothing: half the corpus is drama. Two
 * films sharing "both adapt Stanisław Lem" is a discovery, because almost
 * nothing else does. So every shared attribute is weighted by its inverse
 * frequency in the corpus — the same arithmetic behind TF-IDF, used here for
 * what it actually measures: surprise.
 *
 * This is the founding correction (AGENTS.md rule 1) taken to its conclusion.
 * That rule bans weighting by popularity because the map then collapses toward
 * the canon. Rarity weighting is its exact inverse: the more predictable a
 * connection, the less the map cares about it.
 *
 * ── WHAT MAKES THE CLAIMS HONEST ─────────────────────────────────────────────
 *
 * Claim text is generated from the overlap itself, never invented. "Both are
 * set in a walled medieval city" is true by construction because it is a
 * restatement of the data. So `confidence` is 1.0 — the shared attribute is
 * certain — while `strength` carries the rarity weight, i.e. how much that
 * overlap actually binds the two films. Those are different questions and the
 * schema already separates them.
 *
 * Hand-written readings in static/readings.json still override anything
 * generated for the same pair. Generated breadth, authored depth.
 */

const fs = require("fs");
const path = require("path");
const pairKey = require("./pair-key");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(__dirname, "out");

/* Each signal is one way two films can be related, with the edge type it
 * implies and a ceiling on how strong that kind of overlap is ever allowed to
 * be. The ceiling matters: sharing a cinematographer is a harder fact than
 * sharing a subject, no matter how rare the subject.
 *
 * `floorIdf` drops signals that are too common to be worth drawing at all —
 * without it every film set in the United States connects to every other. */
const SIGNALS = {
  crew:      { type: "hand",        ceiling: 0.82, floorIdf: 0.00 },
  adaptation:{ type: "descent",     ceiling: 0.92, floorIdf: 0.00 },
  sameAuthor:{ type: "descent",     ceiling: 0.78, floorIdf: 0.25 },
  movement:  { type: "convergence", ceiling: 0.70, floorIdf: 0.18 },
  subject:   { type: "rhyme",       ceiling: 0.72, floorIdf: 0.28 },
  /* TMDB keywords, and the one signal here NOT gated by rarity — see the long
     note at the keyword block for why rarity actively selects the worst ones.
     Gated on agreement instead: MIN_SHARED_KEYWORDS below. floorIdf 0 because
     the filtering happens through usable()/VACUOUS and the shared-count rule.
     capMode "combo": the claim is justified by the SET of shared keywords
     together, so the edge cap below applies to that combination rather than
     to each keyword alone — capping "japan" on its own would treat it as the
     claim and cost every later samurai pair that happens to mention it.
     Every other multi-evidence signal (cast included) caps each value
     separately by default; that default was not revisited for this pass and
     may deserve the same treatment later, but changing it now would be a
     scoring change, not a cleanup. */
  keyword:   { type: "rhyme",       ceiling: 0.78, floorIdf: 0.00, capMode: "combo" },
  setting:   { type: "rhyme",       ceiling: 0.64, floorIdf: 0.28 },
  cast:      { type: "hand",        ceiling: 0.60, floorIdf: 0.22 },
  genreEra:  { type: "convergence", ceiling: 0.52, floorIdf: 0.26 },
  studio:    { type: "hand",        ceiling: 0.46, floorIdf: 0.30 },
  /* Weak ties. A network of strong ties is a set of islands; the weak ones are
     what a person can actually travel along. These are deliberately the lowest
     scoring edges in the graph, so ranking only surfaces them when a film has
     nothing better — but their existence is the difference between a film you
     can explore outward from and a dead end. */
  genre:     { type: "convergence", ceiling: 0.34, floorIdf: 0.14 },
  countryEra:{ type: "convergence", ceiling: 0.30, floorIdf: 0.10 },
};

/* Exploration is the product, so depth per film is a requirement, not an
 * outcome. A map shows six connections; if a film only HAS six, the first
 * click exhausts it and "Extend from this film" does nothing — which is
 * exactly the bug this constant exists to prevent. Every film needs a bench
 * deep enough to survive two or three hops outward. */
const MIN_PER_FILM = 11;
const MAX_PER_FILM = 20;

const ROLE_WEIGHT = { director: 0.62, cinematographer: 0.58, editor: 0.46, composer: 0.40, screenwriter: 0.44 };
const ROLE_PHRASE = { director: "directing", cinematographer: "shooting", editor: "cutting",
                      composer: "scoring", screenwriter: "writing" };

/* Attribute values so generic they describe nothing. Wikidata attaches these
 * to almost everything; keeping them would bury the rare signals in noise even
 * after IDF weighting, because a corpus heavy in one genre gives that genre a
 * misleadingly high rarity score. */
/* Abstract nouns that Wikidata records as a film's "main subject" and which
 * describe nothing a viewer could act on. "Both are about human nature" is
 * true of most of cinema; it is a category, not a discovery. IDF cannot catch
 * these on its own — in a small corpus a vague subject shared by two films
 * scores as maximally rare. */
const VACUOUS = new Set([
  "human nature", "rivalry", "love", "death", "friendship", "family", "war",
  "revenge", "loneliness", "memory", "time", "society", "morality", "identity",
  "supernatural", "violence", "fear", "hope", "religion", "politics", "money",
  "power", "justice", "childhood", "marriage", "old age", "sexuality", "crime",
  "good and evil", "human condition", "coming of age", "survival", "betrayal",
  "oppression", "global catastrophic risks", "dystopia", "utopia", "future",
  "space exploration", "extraterrestrial life", "history", "nature", "youth",
  "liberty", "freedom", "happiness", "truth", "art", "dream", "aging",
]);

/* Places too large to describe a film's world. "Both set in the United States"
 * or "in Arizona" is administrative trivia; "both set in Kyoto" is a fact
 * about the film. */
const VAGUE_PLACE = /\b(state|province|county|region|republic|united states|kingdom|federation)\b/i;

/* Wikidata types for "this is an administrative unit, not a place a film is
   set in". Checked against the setting's own P31 rather than guessed from its
   name, because "Arizona" and "Kyoto" look identical as strings. */
const ADMIN_TYPES = new Set([
  "Q6256",     // country
  "Q35657",    // U.S. state
  "Q10864048", // first-level administrative country subdivision
  "Q56061",    // administrative territorial entity
  "Q3624078",  // sovereign state
  "Q107390",   // state of Germany
  "Q1615742",  // province of Japan? (regional)
  "Q82794",    // geographic region
  "Q15642541", // human-geographic territorial entity
  "Q5107",     // continent
]);

const STOP_VALUES = new Set([
  "Q11424",    // film
  "Q130232",   // drama film
  "Q157443",   // comedy film
  "Q1054574",  // romance film
  "Q471839",   // science fiction film
  "Q853630",   // thriller film (broad)
  "Q200092",   // horror film
  "Q3072039",  // adventure film
  "Q959790",   // crime film
  "Q319221",   // action film
  "Q1361932",  // war film? (broad)
  "Q30",       // United States
  "Q145",      // United Kingdom
  "Q17",       // Japan
]);

function idf(n, N) {
  /* 0 when everything shares it, 1 when almost nothing does */
  if (n <= 0) return 0;
  return Math.min(1, Math.log(N / n) / Math.log(N));
}

function loadHarvest() {
  const p = path.join(OUT, "harvest.json");
  if (!fs.existsSync(p)) {
    console.error("no pipeline/out/harvest.json — run: node pipeline/harvest.js pipeline/seeds.txt");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  const H = loadHarvest();
  const films = H.films;
  const L = H.labels || {};
  const keys = Object.keys(films);
  const N = keys.length;
  const lab = (q) => L[q] || q;

  /* ---- TMDB keywords, folded in from enrich.json ----
   *
   * Every other attribute here is a Wikidata Q-id resolved through H.labels.
   * Keywords arrive as plain strings, so they are namespaced to "kw:<name>" and
   * registered as their own label. That is not cosmetic: it means keywords pass
   * through freq/rarity/sharedBy/list and the MAX_EDGES_PER_VALUE cap unchanged,
   * rather than needing a parallel code path that would drift.
   *
   * Optional, exactly like the rest of enrich.json. Without a TMDB key the file
   * carries no keywords and the corpus is precisely what it was. */
  const ENRICH_IN = path.join(OUT, "enrich.json");
  const enrichIn = fs.existsSync(ENRICH_IN) ? JSON.parse(fs.readFileSync(ENRICH_IN, "utf8")) : {};

  /* Structural or production metadata, not a formal property of the film. These
     survive rarity weighting in small corpora and say nothing about what a film
     IS, which is the one thing an edge is supposed to claim.

     This filters BEFORE `films[k].keywords` is populated, unlike STOP_VALUES
     below, which filters inside `usable()` — after `bump()` has already
     counted every raw value into `freq`. That's a deliberate difference, not
     an inconsistency to unify: a stop-listed Wikidata value (e.g. a broad
     country) is still sometimes the least-bad thing a thin film has to offer,
     so STOP_VALUES only hides it from being SHOWN. A stop-listed keyword like
     "sequel" or "based on novel or book" is pure catalogue metadata that
     should never count toward a keyword-overlap match at all — if it did,
     "sequel" would start counting toward MIN_SHARED_KEYWORDS and into
     surprise()'s expected-overlap baseline for every film that carries it,
     which is a scoring change, not a display one. */
  const STOP_KEYWORDS = new Set([
    "based on novel or book", "based on true story", "based on play or musical",
    "based on short story", "based on comic", "based on manga", "based on video game",
    "woman director", "independent film", "duringcreditsstinger", "aftercreditsstinger",
    "sequel", "prequel", "remake", "cult film", "biography", "silent film",
    "black and white", "live action", "anime", "short film", "3d",
  ]);

  let kwFilms = 0;
  for (const k of keys) {
    const raw = (enrichIn[k] && enrichIn[k].keywords) || [];
    const vals = [...new Set(raw.map((s) => String(s).trim().toLowerCase()))]
      .filter((s) => s && s.length > 2 && !STOP_KEYWORDS.has(s));
    if (!vals.length) continue;
    films[k].keywords = vals.map((s) => "kw:" + s);
    for (const s of vals) L["kw:" + s] = s;
    kwFilms++;
  }
  console.log("keywords: " + kwFilms + "/" + keys.length + " films carry TMDB keywords");

  /* ---- how common is each attribute value across the corpus ---- */
  const freq = {};   // "field:Qid" -> count
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
  const rarity = (field, v) => idf(freq[field + ":" + v] || 1, N);

  /* shared values of one field, most surprising first */
  const usable = (field, v) => {
    /* the broad-country stops exist to keep "both American" out of the strong
       signals; as an explicit weak tie it is exactly what we want */
    if (STOP_VALUES.has(v) && field !== "country") return false;
    if (field === "country" && !L[v]) return false;
    const name = L[v];
    if (!name) return false;                       /* unlabelled = unshowable */
    const low = name.toLowerCase();
    /* VACUOUS was written against Wikidata subjects and applies just as well to
       keywords: TMDB emits "love", "revenge", "friendship" freely, and they are
       no more informative there than here. */
    if ((field === "subject" || field === "keyword") && VACUOUS.has(low)) return false;
    if (field === "setting") {
      if (VAGUE_PLACE.test(low)) return false;
      const types = (H.placeTypes || {})[v] || [];
      if (types.some((t) => ADMIN_TYPES.has(t))) return false;
    }
    return true;
  };
  const sharedBy = (a, b, field, prop) => {
    const A = new Set(films[a][prop] || []);
    return (films[b][prop] || [])
      .filter((v) => A.has(v) && usable(field, v))
      .map((v) => ({ v: v, idf: rarity(field, v) }))
      .sort((x, y) => y.idf - x.idf);
  };

  const list = (arr) => arr.length === 1 ? lab(arr[0])
    : arr.length === 2 ? lab(arr[0]) + " and " + lab(arr[1])
    : arr.slice(0, -1).map(lab).join(", ") + " and " + lab(arr[arr.length - 1]);

  /* An attribute that explains twenty pairs is a category, not a connection.
     "New Hollywood" generated six identical edges before this cap; the map is
     supposed to tell you something specific, and a label repeated across the
     graph tells you only that a bucket exists. */
  /* Two films sharing one TMDB keyword is noise at this corpus size: 5,000 pairs
     share two, and they include "both turn on tea". 816 share three, and those
     are almost all real. Lowering this to 2 was measured and reinstated the
     noise; raising it to 4 costs the genuine three-keyword rhymes. */
  const MIN_SHARED_KEYWORDS = 3;

  /* How unlikely is this overlap? Expected shared keywords for a pair, if the
     two films drew their keywords independently from this corpus, is the sum
     over A's keywords of the chance B also has that one. Compare the observed
     overlap against that expectation as a Poisson tail, and report -log10 of
     the probability: 3 means "about one pair in a thousand would do this by
     chance", 6 means one in a million.

     This is the scale-invariant form of the rule. Expectation is computed FROM
     the corpus, so as films are added both the observed and expected overlap
     grow together and the threshold keeps meaning the same thing. A hard count
     does not have that property, which matters a great deal at the thousands
     of films this is heading toward.

     `freq["keyword:" + v]` (built above by `bump()`) already holds each
     keyword's corpus-wide count — no separate table needed. */
  function surprise(a, b, observed) {
    const A = films[a].keywords || [];
    if (!A.length || observed <= 0) return 0;
    let lambda = 0;
    for (const v of A) lambda += ((freq["keyword:" + v] || 1) - 1) / Math.max(1, N - 1);
    if (lambda <= 0) return 12;
    /* P(X >= observed) for Poisson(lambda), computed as 1 - CDF(observed-1). */
    let cum = 0, term = Math.exp(-lambda);
    for (let i = 0; i < observed; i++) { cum += term; term *= lambda / (i + 1); }
    return -Math.log10(Math.max(1e-12, 1 - cum));
  }

  const MAX_EDGES_PER_VALUE = 4;
  const valueUse = {};

  const proposals = [];   // one entry per (pair, signal)
  const push = (a, b, signal, weight, claim, evidence) => {
    const spec = SIGNALS[signal];
    /* never show a raw Q-id to a reader: a missing label means we do not
       actually know what we are claiming they share */
    if (/Q\d{4,}/.test(claim)) return;
    /* The cap protects the STRONG signals: an art movement or a rare subject
       that explains six pairs has stopped being a discovery. Weak ties are the
       opposite — "both French films of the sixties" is supposed to apply
       broadly, and capping it starves precisely the films that have nothing
       else. Exempt them. */
    const UNCAPPED = signal === "crew" || signal === "adaptation" ||
                     signal === "genre" || signal === "countryEra" || signal === "genreEra";
    /* capMode "combo" (declared on SIGNALS.keyword) caps the joined evidence
       set as one unit rather than each value separately — see that comment
       for why. Measured cost of getting this wrong: capping each keyword on
       its own threw away all but 207 of 1,105 candidate keyword-edge pairs. */
    const capKeys = spec.capMode === "combo"
      ? ["kwset:" + (evidence || []).map((e) => String(e).split("#")[0]).sort().join("+")]
      : (evidence || []).map((e) => String(e).split("#")[0]);
    if (!UNCAPPED) {
      for (const v of capKeys) if ((valueUse[v] || 0) >= MAX_EDGES_PER_VALUE) return;
    }
    for (const v of capKeys) valueUse[v] = (valueUse[v] || 0) + 1;
    proposals.push({
      a: a, b: b, signal: signal, type: spec.type,
      strength: +Math.min(spec.ceiling, weight).toFixed(3),
      claim: claim, evidence: evidence,
    });
  };

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = keys[i], b = keys[j];
      const A = films[a], B = films[b];

      /* --- crew: a hard production fact, weighted by role not by rarity --- */
      const sharedRoles = [];
      for (const role of Object.keys(ROLE_WEIGHT)) {
        const setA = new Set(A.crew && A.crew[role] || []);
        for (const q of (B.crew && B.crew[role]) || []) if (setA.has(q)) sharedRoles.push({ role, q });
      }
      if (sharedRoles.length) {
        const w = sharedRoles.map((s) => ROLE_WEIGHT[s.role]).sort((x, y) => y - x);
        let strength = w[0];
        for (let k = 1; k < w.length; k++) strength += w[k] * 0.18;
        const byRole = {};
        sharedRoles.forEach((s) => { (byRole[s.role] = byRole[s.role] || []).push(s.q); });
        const parts = Object.keys(byRole).map((rr) => list(byRole[rr]) + " " + ROLE_PHRASE[rr]);
        push(a, b, "crew", strength, parts.join("; ") + " on both.",
          sharedRoles.map((s) => "wikidata:" + s.q + "#" + s.role));
      }

      /* --- adaptation: one is recorded as based on the other --- */
      if ((A.basedOn || []).indexOf(B.qid) > -1)
        push(b, a, "adaptation", 0.92, A.title + " is recorded as based on " + B.title + ".",
          ["wikidata:" + A.qid + "#P144"]);
      if ((B.basedOn || []).indexOf(A.qid) > -1)
        push(a, b, "adaptation", 0.92, B.title + " is recorded as based on " + A.title + ".",
          ["wikidata:" + B.qid + "#P144"]);

      /* --- both adapt the same writer --- */
      const auth = sharedBy(a, b, "author", "sourceAuthors");
      if (auth.length && auth[0].idf >= SIGNALS.sameAuthor.floorIdf)
        push(a, b, "sameAuthor", 0.55 + auth[0].idf * 0.35,
          "Both adapt work by " + lab(auth[0].v) + ".",
          ["wikidata:" + auth[0].v + "#P50"]);

      /* --- same declared movement (on the film or its director) --- */
      const mv = sharedBy(a, b, "movement", "movement");
      if (mv.length && mv[0].idf >= SIGNALS.movement.floorIdf)
        push(a, b, "movement", 0.42 + mv[0].idf * 0.34,
          "Both belong to " + lab(mv[0].v) + ".",
          ["wikidata:" + mv[0].v + "#P135"]);

      /* --- what the films are ABOUT: the richest source of surprise --- */
      const subj = sharedBy(a, b, "subject", "subject");
      const strongSubj = subj.filter((s) => s.idf >= SIGNALS.subject.floorIdf);
      if (strongSubj.length) {
        const top = strongSubj.slice(0, 2);
        const w = top[0].idf + (top[1] ? top[1].idf * 0.25 : 0);
        push(a, b, "subject", 0.3 + w * 0.5,
          "Both are about " + list(top.map((t) => t.v)) + ".",
          top.map((t) => "wikidata:" + t.v + "#P921"));
      }

      /* --- the specific things both films turn on ---
       *
       * Rarity is the WRONG test for a TMDB keyword, which is the opposite of
       * how it behaves for a Wikidata subject. Measured on this corpus: "tea",
       * "peace" and "young woman" each occur twice and so score idf 0.896, while
       * "neo-noir" occurs thirty times and scores 0.491. A rare keyword is
       * usually rare because it is an incidental tag nobody else attracted, not
       * because it is distinctive. Ranking by rarity therefore promoted exactly
       * the wrong keywords -- an earlier build of this block put "Both turn on
       * frustrated" and "Both turn on tea" on the map, and cut Tokyo Story's
       * Ozu and Japanese-cinema links to make room.
       *
       * What does separate signal from noise is AGREEMENT. One shared keyword is
       * a coincidence at this corpus size; three is a pattern, and the pattern
       * holds regardless of which three: Close Encounters / E.T. share "flying
       * saucer, alien, alien contact"; Hereditary / Don't Look Now share
       * "funeral, loss of loved one, grieving". So the count is the evidence and
       * rarity only breaks ties within it.
       *
       * `sharedBy` rebuilds a fresh Set from `films[a].keywords` on every call,
       * which is fine at 803 films (~15-25 keywords each) but is the one place
       * in this O(N^2) loop where that matters: every other field it services
       * carries 1-5 values. Not worth restructuring for the current corpus, but
       * flagged here because it shares a deadline with STATE item 1 — whoever
       * converts the other signals to a scale-invariant measure for a
       * thousands-of-films corpus will be back in this loop anyway and should
       * hoist a per-film keyword Set at the same time. */
      const kw = sharedBy(a, b, "keyword", "keywords");
      if (kw.length >= MIN_SHARED_KEYWORDS) {
        /* Strength is SURPRISE, not count — because a raw count does not survive
           the corpus growing. This project is aimed at thousands of films, and
           the pair space grows as N squared, so the chance that two unrelated
           films share three keywords by accident rises with every film added.
           A rule phrased as "three or more" silently gets weaker as it scales.
           `surprise(a,b)` asks the scale-free question instead: given how many
           keywords these two films carry and how common each one is IN THIS
           CORPUS, how unlikely is an overlap this large? Measured across
           subsampled corpora of 200-803 films, a surprise threshold drifts about
           2.0x in selectivity where a fixed count drifts 3.9x. */
        const s = surprise(a, b, kw.length);
        push(a, b, "keyword", 0.40 + Math.min(1, s / 6) * 0.34,
          "Both turn on " + list(kw.slice(0, 3).map((t) => t.v)) + ".",
          kw.slice(0, 3).map((t) => "tmdb:" + t.v + "#keywords"));
      }

      /* --- where they take place --- */
      const loc = sharedBy(a, b, "setting", "setting");
      if (loc.length && loc[0].idf >= SIGNALS.setting.floorIdf)
        push(a, b, "setting", 0.28 + loc[0].idf * 0.44,
          "Both are set in " + lab(loc[0].v) + ".",
          ["wikidata:" + loc[0].v + "#P840"]);

      /* --- a face carried between them --- */
      const cast = sharedBy(a, b, "cast", "cast");
      if (cast.length && cast[0].idf >= SIGNALS.cast.floorIdf)
        push(a, b, "cast", 0.26 + cast[0].idf * 0.4,
          list(cast.slice(0, 2).map((c) => c.v)) +
            (cast.length > 1 ? " both appear" : " appears") + " in both films.",
          cast.slice(0, 2).map((c) => "wikidata:" + c.v + "#P161"));

      /* --- an unusual genre shared inside a narrow window of years --- */
      const gen = sharedBy(a, b, "genre", "genre");
      if (gen.length && gen[0].idf >= SIGNALS.genreEra.floorIdf && A.year && B.year) {
        const gap = Math.abs(A.year - B.year);
        if (gap <= 12)
          push(a, b, "genreEra", 0.26 + gen[0].idf * 0.3,
            "Both are " + lab(gen[0].v).toLowerCase() + ", made " +
            (gap === 0 ? "the same year" : gap === 1 ? "a year apart" : gap + " years apart") + ".",
            ["wikidata:" + gen[0].v + "#P136"]);
      }

      /* --- weak tie: an unusual genre, any distance apart --- */
      if (gen.length && gen[0].idf >= SIGNALS.genre.floorIdf)
        push(a, b, "genre", 0.18 + gen[0].idf * 0.22,
          "Both are " + lab(gen[0].v).toLowerCase() + ".",
          ["wikidata:" + gen[0].v + "#P136g"]);

      /* --- weak tie: same national cinema, same moment --- */
      const ctry = sharedBy(a, b, "country", "country");
      if (ctry.length && A.year && B.year && Math.abs(A.year - B.year) <= 9) {
        const gap = Math.abs(A.year - B.year);
        push(a, b, "countryEra", 0.16 + ctry[0].idf * 0.2,
          lab(ctry[0].v) + ", " + (gap <= 2 ? "the same moment" : "within " + gap + " years") + " of each other.",
          ["wikidata:" + ctry[0].v + "#P495"]);
      }

      /* --- the same production house, which shapes more than credits admit --- */
      const st = sharedBy(a, b, "studio", "studio");
      if (st.length && st[0].idf >= SIGNALS.studio.floorIdf)
        push(a, b, "studio", 0.22 + st[0].idf * 0.3,
          "Both produced by " + lab(st[0].v) + ".",
          ["wikidata:" + st[0].v + "#P272"]);
    }
  }

  /* ---- one edge per pair: the strongest signal wins, others become context ---- */
  const byPair = {};
  for (const p of proposals) {
    const sig = pairKey(p.a, p.b);
    if (!byPair[sig] || p.strength > byPair[sig].strength) byPair[sig] = p;
    (byPair[sig].also = byPair[sig].also || []);
  }
  for (const p of proposals) {
    const sig = pairKey(p.a, p.b);
    const win = byPair[sig];
    if (win !== p) win.also.push({ signal: p.signal, claim: p.claim, strength: p.strength });
  }

  /* ---- select, then guarantee every film is explorable ---- */
  const ranked = Object.values(byPair).sort((x, y) => y.strength - x.strength);
  const perFilm = {};
  const chosen = new Set();
  const take = (e) => {
    chosen.add(e);
    perFilm[e.a] = (perFilm[e.a] || 0) + 1;
    perFilm[e.b] = (perFilm[e.b] || 0) + 1;
  };

  /* pass 1: best edges first, capped so one dense node cannot swamp the graph */
  for (const e of ranked) {
    if ((perFilm[e.a] || 0) >= MAX_PER_FILM || (perFilm[e.b] || 0) >= MAX_PER_FILM) continue;
    take(e);
  }

  /* pass 2: backfill anything still too shallow to explore. These are weaker
     connections by definition — that is the honest trade for a film the viewer
     can actually travel through rather than a dead end. */
  let backfilled = 0;
  for (const key of keys) {
    if ((perFilm[key] || 0) >= MIN_PER_FILM) continue;
    for (const e of ranked) {
      if ((perFilm[key] || 0) >= MIN_PER_FILM) break;
      if (chosen.has(e)) continue;
      if (e.a !== key && e.b !== key) continue;
      const other = e.a === key ? e.b : e.a;
      if ((perFilm[other] || 0) >= MAX_PER_FILM) continue;
      take(e); backfilled++;
    }
  }
  const kept = ranked.filter((e) => chosen.has(e));

  const edges = kept.map((e) => ({
    a: e.a, b: e.b, type: e.type,
    from: e.signal === "adaptation" ? "a" : "none",
    strength: e.strength,
    /* the overlap is certain; how much it binds them is `strength`, not this */
    confidence: 1.0,
    source: "record",
    claim: e.claim.length > 165 ? e.claim.slice(0, 162) + "..." : e.claim,
    evidence: e.evidence,
    signal: e.signal,
    also: (e.also || []).sort((x, y) => y.strength - x.strength).slice(0, 3),
  }));

  /* films carry no attribute arrays into the app — only what it renders.
   *
   * Poster, description and poster-derived palette are folded in here from
   * pipeline/out/enrich.json when it exists. The app used to resolve posters
   * itself, per page load, from an API needing a key; baking the URL into the
   * corpus means the shipped build makes no API call and holds no credential.
   * enrich.json is optional by design — without it the corpus is exactly what
   * it was before, so a poster outage can never block a spine rebuild. */
  const ENRICH = path.join(OUT, "enrich.json");
  const enrich = fs.existsSync(ENRICH) ? JSON.parse(fs.readFileSync(ENRICH, "utf8")) : {};
  let withPoster = 0, withDesc = 0, fromPoster = 0;

  const outFilms = {};
  for (const k of keys) {
    const f = films[k];
    const e = enrich[k] || {};
    const rec = { title: f.title, year: f.year, director: f.director, qid: f.qid,
      shadow: f.shadow, highlight: f.highlight, paletteSource: f.paletteSource };

    /* A measured colour beats a decade-wide default, which is what AGENTS rule 5
       ("duotone from that film's own photography") always specified and what no
       previous build could supply. Where the poster has no dominant hue the era
       palette stands and paletteSource still says so — the difference between a
       measured value and a defaulted one must survive into the app. */
    if (e.palette) {
      rec.shadow = e.palette.shadow;
      rec.highlight = e.palette.highlight;
      rec.paletteSource = "poster";
      fromPoster++;
    }
    if (e.poster && e.poster.url) {
      rec.poster = e.poster.url;
      rec.posterShape = e.poster.shape || null;
      /* Carried so non-free artwork can be filtered or replaced later without
         re-deriving which is which. Nothing in the image says it is fair use. */
      rec.posterLicence = e.poster.licence || null;
      withPoster++;
    }
    if (e.description) { rec.description = e.description; withDesc++; }
    if (e.wikipedia) rec.wikipedia = e.wikipedia;
    outFilms[k] = rec;
  }
  if (Object.keys(enrich).length) {
    console.log("enrichment: " + withPoster + " posters, " + withDesc + " descriptions, " +
      fromPoster + " palettes measured from the poster");
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "spine.json"), JSON.stringify({
    version: "spine-" + new Date().toISOString().slice(0, 10),
    generator: "pipeline/associate.js (Wikidata attributes, rarity-weighted, no model)",
    films: outFilms, edges: edges,
  }, null, 1));

  const bySignal = {};
  edges.forEach((e) => { bySignal[e.signal] = (bySignal[e.signal] || 0) + 1; });
  console.log("films   : " + N);
  console.log("pairs   : " + (N * (N - 1) / 2) + " considered, " + Object.keys(byPair).length +
    " with any signal, " + edges.length + " kept");
  console.log("by signal:");
  Object.entries(bySignal).sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => console.log("   " + s.padEnd(11) + n));
  const iso = keys.filter((k) => !perFilm[k]);
  const shallow = keys.filter((k) => (perFilm[k] || 0) < 7).length;
  console.log("backfilled : " + backfilled + " edges to keep shallow films explorable");
  console.log("films with <7 connections (extend dies): " + shallow);
  console.log("unconnected films: " + (iso.length ? iso.length + "  (" + iso.slice(0, 6).join(", ") + ")" : "none"));
  console.log("\nwrote pipeline/out/spine.json");
}

main();
