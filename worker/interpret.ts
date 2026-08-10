/** /api/interpret — the model translates, it never answers.
 *
 * A reader types "friends who break up but make up towards the end". The atlas
 * has no phrase for that: query-parse.js reads it as nothing, and Route 1
 * measured that a static embedding cannot compose it either. A language model
 * can. The question is what we let it do.
 *
 * IT TRANSLATES INTO THE ATLAS'S OWN VOCABULARY AND IT NEVER NAMES A FILM.
 *
 * That constraint is the whole design and it is not squeamishness. If the model
 * answered directly — "here are five films like that" — the result would be
 * plausible, unfalsifiable, and indistinguishable from every other chatbot that
 * recommends films. Nothing on screen could be checked against the corpus,
 * explain() would have nothing to explain, and the atlas would have traded the
 * one property that makes it worth building for fluency it does not need.
 *
 * Translating instead keeps every downstream guarantee intact. The model emits
 * terms from a closed list of 59; anything outside that list is DROPPED at the
 * door and reported to the reader as unread. It cannot hallucinate a film into
 * the results because it is never asked about films and its output has no field
 * in which a film could travel. Scoring, ranking, distance, coverage and the
 * hollow-disc rendering of rule 3 all continue to run on the corpus exactly as
 * they do for a hand-typed clause.
 *
 * WHAT IT COSTS, PLAINLY. The page stops being self-contained for this one
 * feature: typed search needs the network, and the CSP that shipped with
 * connect-src 'none' has to allow 'self'. Everything else — the wall, the maps,
 * the constellation, the century, the shelf, name and genre lookup, and the
 * local vocabulary path — keeps working with no network at all. A failed or
 * slow call falls back to the local parser rather than blocking, so the worst
 * case is the behaviour we already ship.
 */

export interface InterpretEnv {
  ANTHROPIC_API_KEY?: string;   /* a Worker secret. Never in source, never in the artifact. */
  ATLAS_INTERPRET_MODEL?: string;
}

/** Shipped with the artifact and read here so the two can never disagree about
 *  what the vocabulary is. Passed in by the caller rather than imported, so the
 *  route has no build-time dependency on the pipeline. */
export interface Vocab { id: string; gloss: string; not?: string }

const MAX_QUERY = 400;
const MAX_CLAUSES = 8;
const CACHE_SECONDS = 60 * 60 * 24 * 30;

const SYSTEM = (attrs: Vocab[]) => `You translate a person's description of a film into a CLOSED vocabulary. You are a translator, not a recommender.

THE VOCABULARY — these ${attrs.length} ids are the only things you may emit:
${attrs.map((a) => `${a.id} — ${a.gloss}${a.not ? ` NOT: ${a.not}` : ""}`).join("\n")}

RULES
1. NEVER name a film, a director, an actor or a year. You are not answering the question. Something else does that.
2. Emit ONLY ids from the list above, exactly as spelled. An id you invent is discarded and the reader is told their words went unread, which is worse than emitting nothing.
3. Emit at most ${MAX_CLAUSES} clauses. Fewer is better. A description that genuinely only says one thing should produce one clause.
4. weight 0.5 to 2.0. Use above 1 only when the person clearly stressed it ("VERY spiritual"), below 1 when they hedged ("a bit").
5. NEGATION IS A CLAUSE, NOT AN OMISSION. "not violent" is texture:graphic-violence with negate:true. "almost no music" is texture:music-led with negate:true. "nothing sentimental" is tone:sentimental with negate:true. Emit these — do not drop them as unread. A dense vector cannot express "not" at all, which is the main reason you are here; leaving a negation out throws away the thing you are best at. weight applies normally.
6. If part of what they wrote has no home in this vocabulary, leave it out and list the words in "unread". Do not stretch an id to cover it. The vocabulary describes what a film is LIKE; it holds nothing about plot events, people, places or box office.
7. If NOTHING in the description maps, return an empty clauses array with the words in "unread". That is a valid and useful answer.
8. NEVER address the reader, ask a question, explain yourself, or apologise. A person naming an actor, a genre, a year or a title is being answered elsewhere by an exact index; your only job is to report that none of it maps. Prose instead of JSON is read as a failure and their words are lost.

Reply with JSON ONLY — no prose, no greeting, no code fence, no trailing note. Every reply begins with { and ends with }:
{"clauses":[{"attr":"tone:hopeful","weight":1,"negate":false}],"unread":["towards the end"]}`;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

export async function handleInterpret(
  request: Request,
  env: InterpretEnv,
  ctx: { waitUntil(p: Promise<unknown>): void },
  attrs: Vocab[],
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "unconfigured", clauses: [], unread: [] }, 503);

  let q = "";
  try { q = String(((await request.json()) as { q?: unknown }).q || "").trim(); }
  catch { return json({ error: "bad json" }, 400); }
  if (!q) return json({ error: "empty" }, 400);
  if (q.length > MAX_QUERY) q = q.slice(0, MAX_QUERY);

  /* The same sentence costs one call ever, across every reader. Interpretations
     are deterministic enough at temperature 0 to be shared, and this is what
     makes the feature affordable rather than per-keystroke expensive. */
  const cacheKey = new Request(
    new URL(`/api/interpret/${encodeURIComponent(q.toLowerCase())}`, request.url).toString(),
    { method: "GET" },
  );
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey);
  if (hit) {
    const h = new Headers(hit.headers);
    h.set("x-atlas-cache", "hit");
    return new Response(hit.body, { status: 200, headers: h });
  }

  const model = env.ATLAS_INTERPRET_MODEL || "claude-haiku-4-5-20251001";
  let raw = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM(attrs),
        messages: [{ role: "user", content: q }],
      }),
    });
    if (!res.ok) return json({ error: "upstream", status: res.status, clauses: [], unread: [] }, 502);
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    raw = (data.content || []).map((c) => c.text || "").join("").trim();
  } catch {
    return json({ error: "unreachable", clauses: [], unread: [] }, 502);
  }

  /* EVERY TERM IS CHECKED. The model is told the vocabulary and told not to
     invent, and it is still not trusted: an id that is not in the closed list
     is dropped and surfaced as `rejected`, so a drift in the model shows up in
     the page as words that went unread rather than as a silent wrong answer. */
  const known = new Set(attrs.map((a) => a.id));
  let parsed: { clauses?: unknown; unread?: unknown } = {};
  try {
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    parsed = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : {};
  } catch { parsed = {}; }

  const clauses: Array<{ attr: string; weight: number; negate: boolean }> = [];
  const rejected: string[] = [];
  for (const c of Array.isArray(parsed.clauses) ? parsed.clauses : []) {
    const o = c as { attr?: unknown; weight?: unknown; negate?: unknown };
    const attr = String(o.attr || "");
    if (!known.has(attr)) { if (attr) rejected.push(attr); continue; }
    if (clauses.some((k) => k.attr === attr)) continue;
    const w = Number(o.weight);
    clauses.push({
      attr,
      weight: Number.isFinite(w) ? Math.min(2, Math.max(0.5, w)) : 1,
      negate: o.negate === true,
    });
    if (clauses.length >= MAX_CLAUSES) break;
  }
  const unread = (Array.isArray(parsed.unread) ? parsed.unread : [])
    .map((u) => String(u)).filter(Boolean).slice(0, 12);

  const body = { q, clauses, unread, rejected, model, v: 1 };
  const out = json(body, 200, { "x-atlas-cache": "miss" });
  ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${CACHE_SECONDS}` },
  })));
  return out;
}
