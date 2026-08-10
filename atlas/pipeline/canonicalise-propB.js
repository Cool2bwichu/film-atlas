#!/usr/bin/env node
/* canonicalise-propB.js — Pass B, PROPOSAL B: a ROLE-STRUCTURED vocabulary.
 *
 *   node pipeline/canonicalise-propB.js --induce     # stage 1, model calls
 *   node pipeline/canonicalise-propB.js --merge      # stage 2, model calls
 *   node pipeline/canonicalise-propB.js --assign     # stage 3, model calls
 *   node pipeline/canonicalise-propB.js --measure    # no model calls, writes the deliverable
 *
 * WHAT THIS CLUSTERS ON, AND WHY IT CANNOT CLUSTER ON STRINGS
 *
 * Pass A produced 1,538 predicament phrases over 300 films and four shard
 * agents measured the same thing independently: cross-batch string reuse is
 * ZERO and cross-shard string reuse is 0-0.3%. The same film re-read in
 * different company reproduces 1-4% of its own phrases. So a lexical Pass B
 * over the pooled cohort would report an almost empty vocabulary. The join has
 * to be semantic, and this file makes it semantic by way of RELATION SHAPE.
 *
 * THE ORGANISING PRINCIPLE (this is what makes it proposal B and not A)
 *
 * A predicate is identified by WHO DOES WHAT TO WHOM:
 *
 *     (agent role) -- act --> (patient role)
 *
 * and by nothing else. Subject matter is not part of the identity: a bond
 * severed without a reason is the same predicate whether the bond is a
 * friendship, a marriage or a contract. Genre, era, tradition and the objects
 * in the plot are all stripped; they live in `basis`, which Pass A already
 * separated for exactly this reason.
 *
 * OUTCOME IS DELIBERATELY NOT PART OF THE IDENTITY. If `bond-severed` split
 * into `bond-severed-restored` and `bond-severed-fatal`, then no two films
 * could ever hold the same predicate with opposed outcomes and the rebuttal
 * edge — the thing the proposal says currently has to be hand-authored pair by
 * pair — could never fall out of the tagging. Outcome is a per-film field on
 * the tag, never a discriminator on the predicate.
 *
 * WHAT IT IS FED, AND WHAT IT IS NOT FED
 *
 * Induction and assignment see: the situation phrase, the role KEYS Pass A
 * emitted (`{severing, severed}` — 865 distinct across the pool, an
 * uncontrolled second vocabulary that is nevertheless the cleanest statement
 * of relation shape in the data), and the outcome. They do NOT see the film
 * title, the year, the engine or the `basis` sentence. Basis is where every
 * proper noun and every plot object went; showing it would pull the clustering
 * back onto subject matter, which is the failure this proposal exists to
 * avoid, and would let the model cluster on films it recognises rather than on
 * what the reading actually says.
 *
 * HELD-OUT SPLIT — the honesty control
 *
 * The vocabulary is induced from a deterministic 2/3 sample of the
 * predicaments and then assigned over all of them. The "none of these" rate on
 * the held-out third, compared with the rate on the seen two-thirds, measures
 * whether the vocabulary generalises or whether it merely memorised its own
 * induction sample. Without that split a coverage number means nothing.
 *
 * "NONE OF THESE" IS A FIRST-CLASS ANSWER, at assignment time and in the
 * report. A phrase that does not fit is left unassigned; it is not forced into
 * the nearest family to make coverage look better.
 *
 * NOTHING HERE TOUCHES corpus.json, app/template.html, app/build.js or
 * readings.js, and nothing here reads predicate-tags.seed.json.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "out");
const CACHE = path.join(__dirname, ".cache-propB");
const SHARDS = [0, 1, 2, 3].map((i) => path.join(OUT, `readings-pass-shard${i}.json`));

const MODEL = "claude-opus-5";
const PROMPT_VERSION = "propB-role-1";
const INDUCE_BATCH = 96;
const ASSIGN_BATCH = 48;
const CONCURRENCY = 5;
const CALL_TIMEOUT_MS = 15 * 60 * 1000;
const INDUCE_SHARE = 2 / 3;       // held-out third is the generalisation control
const SEED = 20260810;

/* ------------------------------------------------------------------ util */

const N2 = (s) =>
  String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter((w) => w && !["a", "an", "the"].includes(w)).join(" ");

function rng(seed) {                       // mulberry32, so the split is reproducible
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pool() {
  const preds = [];
  const films = [];
  SHARDS.forEach((p, shard) => {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const f of j.films) {
      films.push({ title: f.title, year: f.year, shard, batch: f.batch, n: (f.predicaments || []).length, plotChars: f.plotChars });
      (f.predicaments || []).forEach((pr, i) => {
        preds.push({
          id: `s${shard}b${f.batch}-${N2(f.title).replace(/ /g, "_").slice(0, 28)}-${i}`,
          film: f.title, year: f.year, shard, batch: f.batch,
          situation: pr.situation, n2: N2(pr.situation),
          roles: Object.keys(pr.roles || {}),
          outcome: pr.outcome, centrality: pr.centrality,
          basis: pr.basis,
        });
      });
    }
  });
  return { films, preds };
}

/* ------------------------------------------------------------------ call */

function call(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", [
      "-p", "--model", MODEL,
      "--disallowed-tools", "Bash", "Read", "Write", "Edit", "WebSearch", "WebFetch", "Glob", "Grep", "Task",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("model call timed out")); }, CALL_TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error("model exit " + code + ": " + err.slice(0, 400)));
      resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseJSON(raw) {
  let t = String(raw).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object in model output");
  return JSON.parse(t.slice(a, b + 1));
}

async function cached(key, build) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, `${PROMPT_VERSION}-${key}.json`);
  if (fs.existsSync(f)) return { hit: true, value: JSON.parse(fs.readFileSync(f, "utf8")) };
  const value = await build();
  fs.writeFileSync(f, JSON.stringify(value));
  return { hit: false, value };
}

async function pooled(jobs, concurrency, label) {
  const q = jobs.slice();
  const results = [];
  let done = 0, hits = 0, fails = 0;
  const worker = async () => {
    for (;;) {
      const job = q.shift();
      if (!job) return;
      try {
        const r = await cached(job.key, job.build);
        if (r.hit) hits++;
        results.push({ job, value: r.value });
        console.log(`  [${++done}/${jobs.length}] ${label} ${job.key}${r.hit ? " (cached)" : ""}`);
      } catch (e) {
        fails++;
        console.error(`  [${++done}/${jobs.length}] ${label} ${job.key} FAILED: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, q.length) }, worker));
  console.log(`  ${label}: ${results.length}/${jobs.length} ok, ${hits} cached, ${fails} failed`);
  return { results, fails };
}

/* ------------------------------------------------------------------ stage 1: induce */

function induceItems(preds) {
  // Deterministic 2/3 induction sample, then SHUFFLED ACROSS SHARDS AND BATCHES.
  // Pass A's central finding is that a phrase is a property of the six films it
  // was read beside; if induction batches re-formed those neighbourhoods the
  // families would inherit the same artefact. Every induction call therefore
  // sees films from all four shards and ~96 different batches.
  const r = rng(SEED);
  const marked = preds.map((p) => ({ ...p, induce: r() < INDUCE_SHARE }));
  const sample = marked.filter((p) => p.induce);
  const shuffled = sample.slice();
  const r2 = rng(SEED + 1);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(r2() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { marked, shuffled };
}

function inducePrompt(items, groupNo) {
  const lines = items.map((p, i) =>
    `${i + 1}. "${p.situation}"  [roles: ${p.roles.length ? p.roles.join(" / ") : "—"}]  [outcome: ${p.outcome}]`
  ).join("\n");

  return `You are building a CONTROLLED VOCABULARY of relational predicaments out of free-text
readings of films. Below are ${items.length} situations, each drawn from a different film. You are
not told which films — you must work from the situation itself.

THE ORGANISING PRINCIPLE — read this twice, it decides everything

Group them by the SHAPE OF THE RELATION: who does what to whom, and what that
does to the parties. NOT by subject matter, setting, genre or tone.

  * "a man will not say why he ended the friendship" and
    "a company terminates a contract and gives no grounds" and
    "a mother stops speaking to her daughter for no stated reason"
    are ONE predicate. The bond differs; the relation does not.
  * "two brothers are at war" and "two soldiers are at war" are NOT
    automatically one predicate — decide by what passes between the two
    parties, not by the noun "war".

So the test for a family is: can you state it as ONE PARTY does SOMETHING to
ANOTHER PARTY, in words that carry no genre, no century, no country and no
plot object? If you cannot, the family is a topic, not a predicate, and must
be split or dropped.

OUTCOME IS NOT PART OF THE IDENTITY. Two films that land on the same relation
and end it differently — one repaired, one fatal — MUST receive the SAME
predicate. That opposition is the most valuable thing this vocabulary can
produce, and it is destroyed if you fold the outcome into the name. Never
write a family whose label or id contains "restored", "fatal", "doomed",
"successful", "failed", "tragic" or "happy". The outcome column is shown only
so you can see that a family spans several outcomes — a family that appears
with two or more different outcomes below is a GOOD family, not a mixed one.

WHAT A FAMILY LOOKS LIKE

{ "id": "bond-severed-unilaterally",
  "label": "One party ends a bond and will not give a reason the other can accept",
  "roles": ["severing", "severed"],
  "act": "ends a bond without giving a usable reason",
  "members": [3, 17, 41] }

  - "id": kebab-case, 2-4 words, names the RELATION. No proper nouns, no genre
    words, no outcome words.
  - "label": one sentence, present tense, naming the two parties by their
    position in the relation and what passes between them. It must be
    intelligible to someone who has seen none of these films.
  - "roles": exactly two role names, ACTIVE side first, drawn from or modelled
    on the bracketed role words above. These are the sockets a film's figures
    get slotted into.
  - "act": the transaction itself, as a verb phrase.
  - "members": the line numbers from the list below that belong to this family.

RULES

- A family needs at least 2 members. State a family of 2 only if the relation
  is genuinely the same, not merely adjacent.
- A situation that fits nothing may be left out entirely. Leaving items
  unassigned is CORRECT and expected — do not stretch a family to swallow a
  stray. Roughly a third of a list like this usually has no partner in it.
- Do not assign one line to two families. Pick the one that names its relation
  best.
- Prefer families that would generalise to films you have not seen here. A
  family that only a costume drama could hold is too narrow; a family that
  every film ever made holds is too wide.
- Do NOT produce a catch-all family ("someone suffers", "people are in
  conflict"). If you find yourself writing one, split it or drop it.

OUTPUT — a single JSON object, no prose, no markdown fence:

{"families":[{"id":"...","label":"...","roles":["...","..."],"act":"...","members":[1,2]}],
 "unassigned":[4,9]}

THE SITUATIONS (group ${groupNo})

${lines}`;
}

async function stageInduce() {
  const { preds } = pool();
  const { shuffled } = induceItems(preds);
  const groups = [];
  for (let i = 0; i < shuffled.length; i += INDUCE_BATCH) groups.push(shuffled.slice(i, i + INDUCE_BATCH));
  console.log(`\n  INDUCE — ${shuffled.length} of ${preds.length} predicaments (${Math.round(INDUCE_SHARE * 100)}% sample), ${groups.length} calls of ${INDUCE_BATCH}\n`);

  const jobs = groups.map((g, gi) => ({
    key: `induce-${gi}`,
    build: async () => {
      const obj = parseJSON(await call(inducePrompt(g, gi + 1)));
      // resolve member line numbers to predicament ids here, so the cache entry
      // is self-contained and cannot be misread if grouping ever changes
      const fams = (obj.families || []).map((f) => ({
        ...f, group: gi,
        memberIds: (f.members || []).map((m) => g[m - 1] && g[m - 1].id).filter(Boolean),
        memberSituations: (f.members || []).map((m) => g[m - 1] && g[m - 1].situation).filter(Boolean),
      }));
      return { group: gi, size: g.length, families: fams, unassigned: (obj.unassigned || []).length };
    },
  }));

  const { results } = await pooled(jobs, CONCURRENCY, "induce");
  const families = results.flatMap((r) => r.value.families);
  const out = {
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL, stage: "induce",
    generated: new Date().toISOString(),
    inductionSample: shuffled.length, poolSize: preds.length, groups: groups.length,
    families,
  };
  fs.writeFileSync(path.join(OUT, "propB-induce.json"), JSON.stringify(out, null, 1));
  console.log(`\n  ${families.length} candidate families from ${results.length} groups -> pipeline/out/propB-induce.json\n`);
}

/* ------------------------------------------------------------------ stage 2: merge */

function mergePrompt(cands) {
  const lines = cands.map((c, i) =>
    `${i + 1}. [${c.id}] roles: ${(c.roles || []).join(" / ")} — ${c.label}`
  ).join("\n");

  return `You are merging ${cands.length} candidate predicate families into ONE controlled vocabulary.

They were induced independently from ${new Set(cands.map((c) => c.group)).size} separate reads of the same corpus, so the
same relation appears several times under different names. Your job is to
collapse those duplicates and emit the canonical list.

THE PRINCIPLE IS UNCHANGED: a predicate is identified by WHO DOES WHAT TO WHOM
and by nothing else. Subject matter, setting, genre and tone are not part of
the identity. Two candidates that differ only in what KIND of bond, debt,
family or institution is involved are THE SAME PREDICATE and must merge.

NEVER split on outcome. If two candidates name the same relation but one is
worded as ending well and one badly, they are one predicate. No id or label may
contain an outcome word.

WHAT TO EMIT, per canonical predicate:

{ "id": "bond-severed-unilaterally",
  "label": "One party ends a bond and will not give a reason the other can accept",
  "roles": ["severing", "severed"],
  "axis": "wound",
  "absorbs": ["friendship-ended-abruptly", "silent-cutting-off", "unexplained-refusal"] }

  - "id": kebab-case, 2-4 words. Reuse the clearest candidate id where one fits.
  - "label": one sentence naming both positions and what passes between them.
  - "roles": exactly two, active side first.
  - "axis": one of  wound | debt | knowledge | authority | belonging | desire |
    inheritance | witness  — the register the relation works in. Use exactly
    these eight words.
  - "absorbs": every candidate id you folded into this one, including its own.

SIZE AND SHAPE

- Aim for 120 to 200 canonical predicates. Fewer than 120 means you have merged
  distinct relations together; more than 200 means duplicates survived.
- Every candidate id must appear in exactly one "absorbs" list. Do not drop
  any, and do not list one twice.
- If a candidate is a topic rather than a relation ("war", "poverty",
  "coming of age"), still absorb it into the nearest genuine relation OR give
  it its own entry with an honest relational label — but do not silently lose it.
- Reject nothing. The vocabulary is trimmed later by measured prevalence, not
  here.

OUTPUT — a single JSON object, no prose, no markdown fence:

{"predicates":[{"id":"...","label":"...","roles":["...","..."],"axis":"...","absorbs":["..."]}]}

THE CANDIDATES

${lines}`;
}

function auditPrompt(preds) {
  const lines = preds.map((p, i) => `${i + 1}. [${p.id}] roles: ${(p.roles || []).join(" / ")} — ${p.label}`).join("\n");
  return `Below is a controlled vocabulary of ${preds.length} relational predicates, produced by merging
independently induced candidates. Find the merges that were missed.

Two entries are DUPLICATES if a film holding one would always be describable by
the other — same parties, same transaction, different wording. Differences of
subject matter (which kind of bond, which institution, which class of person)
are NOT differences of relation.

Also flag any entry whose id or label smuggles in an OUTCOME (restored, fatal,
doomed, failed, successful, tragic) — outcome must never be part of a
predicate's identity.

OUTPUT — a single JSON object, no prose, no markdown fence:

{"merge":[{"keep":"id-to-keep","fold":["id-1","id-2"],"why":"one clause"}],
 "outcomeLeaks":["id"],
 "topics":["id"]}

"topics" lists entries that name a subject rather than a relation and should be
dropped or rewritten. Leave any list empty if there is nothing to report.

THE VOCABULARY

${lines}`;
}

async function stageMerge() {
  const ind = JSON.parse(fs.readFileSync(path.join(OUT, "propB-induce.json"), "utf8"));
  const cands = ind.families.map((f, i) => ({ ...f, cid: `${f.id}#${f.group}`, seq: i }));
  console.log(`\n  MERGE — ${cands.length} candidate families\n`);

  const { results } = await pooled([{ key: "merge-all", build: async () => parseJSON(await call(mergePrompt(cands))) }], 1, "merge");
  if (!results.length) throw new Error("merge call failed");
  let preds = results[0].value.predicates || [];
  console.log(`  merged to ${preds.length} predicates; auditing`);

  const audit = await pooled([{ key: "merge-audit", build: async () => parseJSON(await call(auditPrompt(preds))) }], 1, "audit");
  const a = audit.results.length ? audit.results[0].value : { merge: [], outcomeLeaks: [], topics: [] };

  // apply the audit's merges mechanically, so the edit is inspectable
  const byId = new Map(preds.map((p) => [p.id, p]));
  const folded = new Set();
  for (const m of a.merge || []) {
    const keep = byId.get(m.keep);
    if (!keep) continue;
    for (const f of m.fold || []) {
      if (f === m.keep || folded.has(f)) continue;
      const p = byId.get(f);
      if (!p) continue;
      keep.absorbs = [...new Set([...(keep.absorbs || []), ...(p.absorbs || []), f])];
      keep.mergedIn = [...(keep.mergedIn || []), { id: f, why: m.why }];
      folded.add(f);
    }
  }
  preds = preds.filter((p) => !folded.has(p.id));

  const out = {
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL, stage: "merge",
    generated: new Date().toISOString(),
    candidates: cands.length, afterMerge: preds.length + folded.size, afterAudit: preds.length,
    auditFolded: [...folded], outcomeLeaks: a.outcomeLeaks || [], topicsFlagged: a.topics || [],
    predicates: preds,
  };
  fs.writeFileSync(path.join(OUT, "propB-vocab.json"), JSON.stringify(out, null, 1));
  console.log(`\n  ${preds.length} predicates (${folded.size} folded by audit) -> pipeline/out/propB-vocab.json\n`);
}

/* ------------------------------------------------------------------ stage 3: assign */

function assignPrompt(vocab, items) {
  const v = vocab.map((p) => `${p.id} [${(p.roles || []).join("/")}] — ${p.label}`).join("\n");
  const lines = items.map((p, i) =>
    `${i + 1}. "${p.situation}"  [roles: ${p.roles.length ? p.roles.join(" / ") : "—"}]`
  ).join("\n");

  return `You are TAGGING, not inventing. Below is a FROZEN vocabulary of relational
predicates, and ${items.length} situations read from films. For each situation, name the ONE
predicate whose relation it is an instance of — or say none.

HOW TO DECIDE

Ask only: are the same two positions in the same transaction? Who does what to
whom. Ignore subject matter entirely — the bond can be a marriage in one film
and a business partnership in another and still be the same predicate. Ignore
tone, genre, era and country.

Do not consider how the situation ends. Outcome is recorded separately and is
never a reason to reject a predicate.

"none" IS A FIRST-CLASS ANSWER AND YOU WILL NEED IT OFTEN.

  - Use "none" whenever the situation is not an instance of any listed relation.
  - Use "none" when the situation names a state rather than a transaction
    between parties ("a country is at war", "a family is poor").
  - Do NOT reach for the nearest-sounding entry. A wrong tag is worse than an
    absent one: this vocabulary is about to be measured on how honestly it
    covers the corpus, and a forced tag corrupts that measurement.
  - Expect to answer "none" for a substantial share of a list like this. That
    is the correct behaviour, not a failure.

OUTPUT — a single JSON object, no prose, no markdown fence. One entry per
numbered situation, in order, using the exact predicate ids:

{"tags":[{"n":1,"predicate":"bond-severed-unilaterally"},{"n":2,"predicate":"none"}]}

THE VOCABULARY

${v}

THE SITUATIONS

${lines}`;
}

async function stageAssign() {
  const { preds } = pool();
  const vocabFile = JSON.parse(fs.readFileSync(path.join(OUT, "propB-vocab.json"), "utf8"));
  const vocab = vocabFile.predicates;
  const ids = new Set(vocab.map((p) => p.id));

  const groups = [];
  for (let i = 0; i < preds.length; i += ASSIGN_BATCH) groups.push(preds.slice(i, i + ASSIGN_BATCH));
  console.log(`\n  ASSIGN — ${preds.length} predicaments against ${vocab.length} predicates, ${groups.length} calls of ${ASSIGN_BATCH}\n`);

  const jobs = groups.map((g, gi) => ({
    key: `assign-${gi}`,
    build: async () => {
      const obj = parseJSON(await call(assignPrompt(vocab, g)));
      const tags = obj.tags || [];
      if (tags.length !== g.length) throw new Error(`expected ${g.length} tags, got ${tags.length}`);
      return g.map((p, i) => {
        const t = tags[i] || {};
        const pid = String(t.predicate || "none").trim();
        return { id: p.id, predicate: ids.has(pid) ? pid : "none", raw: pid };
      });
    },
  }));

  const { results, fails } = await pooled(jobs, CONCURRENCY, "assign");
  const tags = results.flatMap((r) => r.value);
  const out = {
    version: 1, promptVersion: PROMPT_VERSION, model: MODEL, stage: "assign",
    generated: new Date().toISOString(),
    attempted: preds.length, tagged: tags.length, failedBatches: fails,
    tags,
  };
  fs.writeFileSync(path.join(OUT, "propB-tags.json"), JSON.stringify(out, null, 1));
  console.log(`\n  ${tags.length} tags -> pipeline/out/propB-tags.json\n`);
}

/* ------------------------------------------------------------------ dispatch */

(async function main() {
  const a = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  if (a.includes("--induce")) await stageInduce();
  else if (a.includes("--merge")) await stageMerge();
  else if (a.includes("--assign")) await stageAssign();
  else { console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]); process.exit(2); }
})().catch((e) => { console.error(e); process.exit(1); });
