/* Corpus resolver — the token-free replacement for askClaude().
 *
 * Contract is deliberately identical to the model call it replaces:
 *   resolve(corpus, title) -> { seed, links[] }  or  null when unknown
 * so the component does not need to know where its lineage came from.
 *
 * The point is not merely that this is cheaper. A claim written once, offline,
 * with room to check it and revise it is a better claim than one improvised per
 * request — and it can be corrected. A live model re-rolls the graph every time
 * and cannot be held to a previous answer.
 */

/* Titles arrive from a text field, so match forgivingly: case, punctuation,
   diacritics and leading articles are all things a user will get "wrong". */
export function normalise(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateKeys(title) {
  /* A trailing year is how everyone disambiguates a title — "Solaris (1972)" —
     and it is also the exact form the app itself passes when extending from a
     film. Normalising left it as part of the key ("solaris 1972"), which
     matched nothing, so every extend resolved to null and the map silently
     refused to grow. Strip it and try both. */
  const withYear = normalise(title);
  const bare = withYear.replace(/\s+(1[89]\d{2}|20\d{2})$/, "").trim();

  const keys = [];
  for (const n of bare !== withYear ? [bare, withYear] : [withYear]) {
    keys.push(n);
    const stripped = n.replace(/^(the|a|an) /, "");
    if (stripped !== n) keys.push(stripped);
    keys.push("the " + n, "a " + n);
  }
  return keys;
}

export function lookup(corpus, title) {
  for (const k of candidateKeys(title)) {
    if (corpus.films[k]) return k;
  }
  /* second pass: unique substring match, so "2001" finds "2001 a space odyssey"
     but an ambiguous fragment resolves to nothing rather than to a guess */
  const n = normalise(title);
  if (n.length < 3) return null;
  const hits = Object.keys(corpus.films).filter((k) => k.indexOf(n) === 0 || k.indexOf(" " + n) > -1);
  return hits.length === 1 ? hits[0] : null;
}

/* Ranking decides what six of a possibly larger set the map shows.
 *
 * Deliberately NOT by node degree — a degree ranking surfaces whatever is most
 * connected, which is whatever is most famous, and the map collapses toward the
 * canon the viewer already knows. Rank by the strength of the specific bond,
 * then prefer a spread of types so the seed is not surrounded by five edges of
 * one colour. */
/* How much a connection tells you that you did not already know.
 *
 * Ranking by raw strength looked correct and was not. Record edges are
 * systematically strong (a shared director and DP scores 0.82) while readings
 * sit between 0.33 and 0.79, so sorting by strength sorted every interpretive
 * edge out of the top six. The measured result across the 67-film corpus: 60%
 * of an average map was one director, 89% was one edge type, and six films
 * returned a map that was entirely a single filmography. Seeding 2046 returned
 * six Wong Kar-wai films with near-identical captions.
 *
 * That is AGENTS.md rule 1 failing in a new costume. The rule forbids weighting
 * by popularity because the map then collapses toward the canon and confirms
 * what the viewer already knows; weighting purely by bond strength collapses it
 * toward the filmography and confirms what the viewer already knows. Same
 * disease, different vector.
 *
 * So: a connection's worth is how tightly the two films are bound MULTIPLIED BY
 * how unobvious the pairing is. This is not a fame penalty and not a novelty
 * bonus — it is a predictability penalty. That Fallen Angels shares a crew with
 * 2046 is true, checkable, and almost entirely predictable from knowing both
 * are Wong Kar-wai films. That Yojimbo shares a cinematographer with Ugetsu is
 * equally true and tells you something you could not have guessed. */
function surprise(seed, other, edge) {
  let s = 1;

  /* Same author is the single most predictable relationship on the map. */
  const sd = (seed.director || "").trim().toLowerCase();
  const od = (other.director || "").trim().toLowerCase();
  if (sd && od && sd === od) s *= 0.34;
  else if (sd && od && sd.split(", ").some((d) => od.split(", ").indexOf(d) > -1)) s *= 0.55;

  /* Contemporaries influencing each other is the default expectation; a bond
     that survives across decades is the interesting case. Capped so that age
     alone cannot buy a slot. */
  if (seed.year && other.year) {
    const gap = Math.abs(seed.year - other.year);
    if (gap <= 6) s *= 0.86;
    s *= 1 + Math.min(0.45, gap / 90);
  }

  /* An edge type that is everywhere in this corpus carries less information
     than a rare one. `hand` is 88% of all edges, so it should have to earn
     its place rather than win by default. */
  if (edge.type === "hand") s *= 0.72;

  return s;
}

/* Assemble the map under three constraints, applied in order of importance:
   no filmography may dominate, at least one interpretive edge survives if any
   exists, and every relationship type present gets represented before any type
   takes a second slot. */
function rank(edges, limit, seed) {
  const MAX_PER_DIRECTOR = 2;

  const scored = edges.map((e) => ({ e: e, score: e.strength * surprise(seed, e, e) }))
    .sort((x, y) => y.score - x.score);

  /* A director quota alone still lets one *person* carry a whole map: Dune
     drew "Hans Zimmer scoring on both" twice, for two different films by two
     different directors, which passes a director check and reads as a bug.
     Quota the evidence as well as the author. */
  const MAX_PER_PERSON = 1;
  const peopleIn = (e) => (e.evidence || [])
    .map((v) => String(v).split("#")[0])
    .filter((v) => v.indexOf("wikidata:") === 0);

  const out = [];
  const perDirector = {};
  const perPerson = {};
  const typeSeen = {};

  const take = (c) => {
    out.push(c.e);
    const d = (c.e.director || "?").toLowerCase();
    perDirector[d] = (perDirector[d] || 0) + 1;
    peopleIn(c.e).forEach((p) => { perPerson[p] = (perPerson[p] || 0) + 1; });
    typeSeen[c.e.type] = true;
  };
  const allowed = (c) => {
    const d = (c.e.director || "?").toLowerCase();
    if ((perDirector[d] || 0) >= MAX_PER_DIRECTOR) return false;
    const ppl = peopleIn(c.e);
    /* an edge justified only by one already-used person adds nothing new */
    if (ppl.length && ppl.every((p) => (perPerson[p] || 0) >= MAX_PER_PERSON)) return false;
    return true;
  };

  /* 1. one of each type, best-scoring first */
  for (const c of scored) {
    if (out.length >= limit) break;
    if (!typeSeen[c.e.type] && allowed(c)) take(c);
  }
  /* 2. guarantee a reading — the interpretive edges are the only ones that
     leave the neighbourhood, and they are exactly what strength-sorting
     discarded */
  if (out.length < limit && !out.some((e) => e.source === "reading")) {
    const r = scored.find((c) => c.e.source === "reading" && out.indexOf(c.e) === -1 && allowed(c));
    if (r) take(r);
  }
  /* 3. fill by score, still respecting the per-director quota */
  for (const c of scored) {
    if (out.length >= limit) break;
    if (out.indexOf(c.e) === -1 && allowed(c)) take(c);
  }
  /* 4. only if the quota has starved the map does it relax — a thin map is
     worse than a slightly repetitive one */
  for (const c of scored) {
    if (out.length >= limit) break;
    if (out.indexOf(c.e) === -1) take(c);
  }
  return out;
}

/* `exclude` is a set of film keys already drawn on the map. Without it,
   "Extend from this film" re-ranked the same candidates, every one of them was
   filtered out as a duplicate by the caller, and the button appeared to do
   nothing. Ranking has to happen among the films the viewer has NOT seen yet —
   that is the whole mechanic of exploring outward. */
export function resolve(corpus, title, limit, exclude) {
  const key = lookup(corpus, title);
  if (!key) return null;
  const max = limit || 6;
  const skip = new Set(exclude || []);

  const touching = corpus.edges
    .filter((e) => e.a === key || e.b === key)
    .filter((e) => !skip.has(e.a === key ? e.b : e.a))
    .map((e) => {
      const otherKey = e.a === key ? e.b : e.a;
      const other = corpus.films[otherKey];
      if (!other) return null;
      /* `from` names which endpoint the arrow leaves, in corpus terms.
         The component wants it relative to the seed. */
      let dir = "none";
      if (e.from === "a") dir = e.a === key ? "out" : "in";
      else if (e.from === "b") dir = e.b === key ? "out" : "in";
      return {
        key: otherKey,
        title: other.title,
        year: other.year,
        director: other.director,
        shadow: other.shadow,
        highlight: other.highlight,
        /* Resolved at build time and carried in the corpus, so the app makes
           no API call and holds no key to draw a film. */
        poster: other.poster || null,
        posterShape: other.posterShape || null,
        posterLicence: other.posterLicence || null,
        description: other.description || "",
        wikipedia: other.wikipedia || null,
        paletteSource: other.paletteSource || null,
        type: e.type,
        dir: dir,
        strength: e.strength,
        confidence: e.confidence,
        claim: e.claim,
        source: e.source || "reading",
        /* carried so ranking can quota repeated people, not only directors */
        evidence: e.evidence || [],
      };
    })
    .filter(Boolean);

  const seedFilm = Object.assign({ key: key }, corpus.films[key]);
  return { seed: seedFilm, links: rank(touching, max, seedFilm) };
}

/* Everything the map can currently draw — used for the empty state and for
   telling a user honestly that a title is outside the atlas rather than
   silently returning a thin or invented result. */
export function titles(corpus) {
  return Object.keys(corpus.films).map((k) => corpus.films[k].title).sort();
}

export function coverage(corpus) {
  const films = Object.keys(corpus.films).length;
  const record = corpus.edges.filter((e) => e.source === "record").length;
  return { films: films, edges: corpus.edges.length, record: record, reading: corpus.edges.length - record };
}
