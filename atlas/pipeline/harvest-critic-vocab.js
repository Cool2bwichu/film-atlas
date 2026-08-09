#!/usr/bin/env node
/* Harvest attested descriptive vocabulary from the cached Senses of Cinema
 * archive, per film, with receipts.
 *
 *   SOC_CACHE=/path/to/soc node pipeline/harvest-critic-vocab.js
 *     -> pipeline/out/critic-vocab.json   { filmKey: [{term, normalised, essay, sentence}] }
 *
 * EVIDENCE CLASS: attested vocabulary. Nothing is generated; every entry is a
 * word a critic used, in a sentence we keep, in an essay we link. The harvest
 * is lexicon-driven: only terms from a curated FORM/FEEL lexicon are taken,
 * so "masterful" and "disappointing" (verdicts) can never enter. The line:
 * a term qualifies if it names a quality a viewer could recognise while
 * watching — pace, light, texture, tone, spatial feel, structure — and is
 * excluded if it ranks the film's success (masterful, tedious), states a bare
 * technical fact (35mm, widescreen), or names a movement affiliation
 * (surrealist, expressionist — the -istic forms, which describe manner, stay).
 *
 * ATTRIBUTION — the hard part. A sentence yields terms for film X only if:
 *   1. its essay is not a world-poll / top-ten / festival-report (dropped whole);
 *   2. the essay is ABOUT X (X's title in the essay title), or the sentence
 *      itself names X — an essay merely mentioning X contributes nothing else;
 *   3. the sentence contains no italicised span that is a different work's
 *      title (Senses italicises titles by house style; any italic span with a
 *      capital letter that is not X's own title disqualifies the sentence —
 *      this also catches films outside our corpus);
 *   4. the sentence names no other corpus film matched to the same essay;
 *   5. the sentence names no corpus director other than X's own;
 *   6. the sentence is not comparing across the œuvre ("his earlier films...").
 * These guards trade recall for precision deliberately.
 *
 * NEGATION / DISTANCE: a term is dropped when the preceding clause window
 * carries a negating or distancing cue — never / not / less / far from /
 * eschews / aspires to / rather than / pseudo- ... — unless the cue is an
 * intensifier idiom (not only / not just / no less). Questions are dropped.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const CACHE = process.env.SOC_CACHE || path.join(__dirname, ".cache-soc");
const ix = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "soc-index.json"), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));

const NOISE = /\/(world-poll|top-tens|festival-reports|festival-report|cinemarati|readers-polls|book-reviews)\//i;
const SURFACE = 813;

/* ---------------- lexicon: normalised -> variants ---------------- */
/* Variants are matched case-insensitively on word boundaries; internal
   hyphens/spaces are interchangeable. The matched surface form is kept as
   the receipt's `term`; the key is the searchable normalisation. */
const LEXICON = {
  /* pace, movement, rhythm */
  hypnotic: ["hypnotic", "hypnotically"],
  mesmerising: ["mesmerising", "mesmerizing", "mesmeric"],
  propulsive: ["propulsive", "propulsively"],
  kinetic: ["kinetic", "kineticism"],
  frenetic: ["frenetic", "frenetically", "frenzied"],
  breakneck: ["breakneck"],
  breathless: ["breathless", "breathlessly"],
  languid: ["languid", "languidly", "languorous", "languor"],
  glacial: ["glacial", "glacially"],
  stately: ["stately"],
  unhurried: ["unhurried"],
  measured: ["measured"],
  deliberate: ["deliberate"],
  meditative: ["meditative"],
  contemplative: ["contemplative"],
  ruminative: ["ruminative"],
  "slow-burning": ["slow-burning", "slow-burn"],
  relentless: ["relentless", "relentlessly"],
  restless: ["restless", "restlessly"],
  static: ["static"],
  durational: ["durational"],
  torpid: ["torpid"],
  headlong: ["headlong"],
  balletic: ["balletic"],
  sinuous: ["sinuous"],
  /* dream, strangeness, mind */
  dreamlike: ["dreamlike", "dream-like", "dreamy", "oneiric"],
  hallucinatory: ["hallucinatory"],
  "trance-like": ["trance-like", "trancelike"],
  somnambulistic: ["somnambulistic", "somnambulant"],
  surreal: ["surreal", "surrealistic"],
  nightmarish: ["nightmarish"],
  phantasmagoric: ["phantasmagoric", "phantasmagorical"],
  uncanny: ["uncanny"],
  spectral: ["spectral"],
  ghostly: ["ghostly"],
  fevered: ["fevered", "feverish"],
  delirious: ["delirious"],
  haunting: ["haunting"],
  eerie: ["eerie", "eerily"],
  otherworldly: ["otherworldly", "other-worldly"],
  enigmatic: ["enigmatic"],
  cryptic: ["cryptic"],
  opaque: ["opaque"],
  oblique: ["oblique", "obliquely"],
  elliptical: ["elliptical", "elliptic", "elliptically"],
  cerebral: ["cerebral"],
  essayistic: ["essayistic"],
  abstract: ["abstract"],
  kaleidoscopic: ["kaleidoscopic"],
  /* austerity <-> ornament */
  austere: ["austere", "austerity"],
  ascetic: ["ascetic", "asceticism"],
  spare: ["spare"],
  "pared-down": ["pared-down", "pared down", "stripped-down", "stripped down"],
  minimalist: ["minimalist", "minimalism", "minimal"],
  unadorned: ["unadorned"],
  rigorous: ["rigorous", "rigour", "rigor"],
  severe: ["severe"],
  stark: ["stark", "starkly"],
  baroque: ["baroque"],
  ornate: ["ornate"],
  lush: ["lush"],
  sumptuous: ["sumptuous"],
  opulent: ["opulent", "opulence"],
  lavish: ["lavish"],
  extravagant: ["extravagant"],
  flamboyant: ["flamboyant"],
  operatic: ["operatic"],
  melodramatic: ["melodramatic"],
  theatrical: ["theatrical", "theatricality"],
  stylised: ["stylised", "stylized", "stylisation", "stylization"],
  mannered: ["mannered"],
  expressionistic: ["expressionistic"],
  impressionistic: ["impressionistic"],
  painterly: ["painterly"],
  sculptural: ["sculptural"],
  geometric: ["geometric", "geometrical"],
  symmetrical: ["symmetrical"],
  restrained: ["restrained", "restraint"],
  understated: ["understated", "understatement"],
  muted: ["muted"],
  subdued: ["subdued"],
  laconic: ["laconic"],
  taciturn: ["taciturn"],
  terse: ["terse"],
  /* light, colour, texture, weather */
  "sun-drenched": ["sun-drenched", "sundrenched", "sunlit", "sun-lit", "sun-bleached", "sun-baked", "sunbaked", "sun-scorched"],
  shadowy: ["shadowy"],
  chiaroscuro: ["chiaroscuro"],
  monochrome: ["monochrome", "monochromatic"],
  desaturated: ["desaturated"],
  saturated: ["saturated"],
  "neon-lit": ["neon-lit", "neon-drenched", "neon-soaked"],
  moonlit: ["moonlit"],
  crepuscular: ["crepuscular", "twilit"],
  autumnal: ["autumnal"],
  wintry: ["wintry", "wintery"],
  luminous: ["luminous", "luminosity"],
  incandescent: ["incandescent"],
  gauzy: ["gauzy"],
  hazy: ["hazy"],
  misty: ["misty"],
  smoky: ["smoky"],
  murky: ["murky"],
  inky: ["inky"],
  "washed-out": ["washed-out"],
  overexposed: ["overexposed"],
  "high-contrast": ["high-contrast"],
  grainy: ["grainy"],
  gritty: ["gritty"],
  "lo-fi": ["lo-fi", "low-fi"],
  velvety: ["velvety"],
  burnished: ["burnished"],
  shimmering: ["shimmering"],
  sepia: ["sepia", "sepia-toned"],
  pastel: ["pastel"],
  "rain-soaked": ["rain-soaked", "rainswept", "rain-swept"],
  windswept: ["windswept", "wind-swept"],
  /* space, air */
  claustrophobic: ["claustrophobic"],
  airless: ["airless"],
  suffocating: ["suffocating", "stifling"],
  oppressive: ["oppressive"],
  hermetic: ["hermetic", "hermetically"],
  expansive: ["expansive"],
  panoramic: ["panoramic"],
  vertiginous: ["vertiginous"],
  labyrinthine: ["labyrinthine"],
  cavernous: ["cavernous"],
  intimate: ["intimate"],
  hushed: ["hushed"],
  desolate: ["desolate", "desolation"],
  barren: ["barren"],
  arid: ["arid"],
  /* tone, mood */
  melancholy: ["melancholy", "melancholic", "melancholia"],
  elegiac: ["elegiac"],
  mournful: ["mournful"],
  funereal: ["funereal"],
  sombre: ["sombre", "somber"],
  brooding: ["brooding"],
  bleak: ["bleak", "bleakness"],
  forlorn: ["forlorn"],
  wistful: ["wistful"],
  bittersweet: ["bittersweet"],
  nostalgic: ["nostalgic"],
  tender: ["tender", "tenderness"],
  rapturous: ["rapturous"],
  ecstatic: ["ecstatic"],
  euphoric: ["euphoric"],
  exuberant: ["exuberant", "exuberance"],
  ebullient: ["ebullient"],
  jaunty: ["jaunty"],
  playful: ["playful", "playfulness"],
  whimsical: ["whimsical", "whimsy"],
  mischievous: ["mischievous"],
  macabre: ["macabre"],
  grotesque: ["grotesque", "grotesquerie"],
  gothic: ["gothic"],
  lurid: ["lurid"],
  pulpy: ["pulpy"],
  seedy: ["seedy"],
  sleazy: ["sleazy"],
  squalid: ["squalid"],
  sordid: ["sordid"],
  feral: ["feral"],
  savage: ["savage"],
  brutal: ["brutal"],
  visceral: ["visceral", "viscerally"],
  sensuous: ["sensuous", "sensual", "sensuality"],
  erotic: ["erotic", "eroticism"],
  tactile: ["tactile", "tactility"],
  atmospheric: ["atmospheric"],
  moody: ["moody"],
  noirish: ["noirish", "noir-inflected", "noir-tinged"],
  hardboiled: ["hardboiled", "hard-boiled"],
  icy: ["icy"],
  chilly: ["chilly"],
  clinical: ["clinical", "clinically"],
  detached: ["detached", "detachment"],
  distanced: ["distanced", "distancing"],
  dispassionate: ["dispassionate"],
  deadpan: ["deadpan"],
  droll: ["droll"],
  wry: ["wry", "wryly"],
  sardonic: ["sardonic"],
  mordant: ["mordant"],
  acerbic: ["acerbic"],
  caustic: ["caustic"],
  ominous: ["ominous"],
  menacing: ["menacing"],
  foreboding: ["foreboding"],
  taut: ["taut", "tautly"],
  tense: ["tense"],
  simmering: ["simmering"],
  serene: ["serene", "serenity"],
  tranquil: ["tranquil"],
  becalmed: ["becalmed"],
  pastoral: ["pastoral"],
  bucolic: ["bucolic"],
  idyllic: ["idyllic"],
  lyrical: ["lyrical", "lyricism"],
  poetic: ["poetic"],
  observational: ["observational"],
  "documentary-like": ["documentary-like", "documentary-style", "quasi-documentary", "semi-documentary"],
  vérité: ["vérité", "verite"],
  naturalistic: ["naturalistic"],
  hyperreal: ["hyperreal"],
  absurdist: ["absurdist"],
  farcical: ["farcical"],
  picaresque: ["picaresque"],
  fabular: ["fabular", "fable-like"],
  mythic: ["mythic"],
  immersive: ["immersive"],
  enveloping: ["enveloping"],
  /* structure */
  fragmented: ["fragmented", "fragmentary", "fragmentation"],
  episodic: ["episodic"],
  discursive: ["discursive"],
  digressive: ["digressive"],
  nonlinear: ["nonlinear", "non-linear"],
  circular: ["circular"],
  achronological: ["achronological", "unchronological"],
  repetitive: ["repetitive"],
  recursive: ["recursive"],
  aphoristic: ["aphoristic"],
  novelistic: ["novelistic"],
  epistolary: ["epistolary"],
  "open-ended": ["open-ended"],
  /* sound */
  percussive: ["percussive"],
  droning: ["droning", "drone-like"],
  pulsing: ["pulsing", "pulsating", "throbbing"],
  cacophonous: ["cacophonous", "cacophony"],
  discordant: ["discordant"],
  dissonant: ["dissonant", "dissonance"],
  staccato: ["staccato"],
  syncopated: ["syncopated"],
  sonorous: ["sonorous"],
  /* energy */
  rollicking: ["rollicking"],
  freewheeling: ["freewheeling", "free-wheeling"],
  anarchic: ["anarchic"],
  chaotic: ["chaotic"],
  unruly: ["unruly"],
  raucous: ["raucous"],
  manic: ["manic"],
};

/* Context guards for polysemous terms. `after` tested against the text that
   follows the match (same sentence); `before` against the text preceding it.
   A hit on either KILLS the candidate. `requireAfter` must match or it dies. */
const GUARDS = {
  measured: { after: /^\s*(against|by|in|from|out|through|the|his|her|its|their|critical|response|praise|plaudits|acclaim|reviews?|terms)\b/i },
  /* verb use: "actors haunting the corridors" */
  haunting: { before: /\bghost\s*$/i, after: /^\s*["'“‘]?(the|a|an|his|her|its|their|him|them|our|your)\b/i },
  theatrical: { after: /^\s*(trailer|release|run|exhibition|distribution|version|cut)\b/i },
  deliberate: { requireAfter: /^\s*(pace|pacing|pac[ei]|rhythm|tempo|slowness|tread|speed|deliberateness)/i },
  tense: { before: /\b(past|present|future|verb)\s*$/i },
  abstract: { after: /^\s*(idea|notion|concept|principle|level|sense|term|question|thought|noun|the|to|it)\b/i },
  baroque: { after: /^\s*(music|period|era|composer|painting)/i },
  gothic: { after: /^\s*(novel|literature|fiction|architecture|cathedral|revival|romance|horror tradition)/i },
  rigorous: { after: /^\s*(analysis|study|examination|research|scholarship|critique)/i },
  spare: { before: /\bto\s*$/i, after: /^\s*(a|the|him|her|them|us|me|no|any|time|change|moment|thought|you)\b/i },
  circular: { after: /^\s*(saw|argument|reasoning|logic)/i },
  clinical: { after: /^\s*(trial|depression|psycholog|diagnos)/i },
  severe: { after: /^\s*(injur|illness|weather|winter|case|drought|storm)/i },
  tender: { after: /^\s*(age|years|meat)/i },
  /* noun use: "a personal intimate" */
  intimate: { before: /\bpersonal\s*$/i, after: /^\s*(knowledge|acquaintance|relations|relationship|partner|detail)/i },
  saturated: { after: /^\s*(market|media)/i },
  static: { after: /^\s*(electricity|noise|on the)/i },
  pastoral: { after: /^\s*(care|letter|visit)/i },
};

/* Negation / distancing cues, scanned in the clause window before the term. */
const NEG = /\b(not|never|no|nor|neither|hardly|scarcely|barely|without|less|least|lack|lacks|lacking|lacked|far from|anything but|rather than|instead of|refuse[sd]?|refusing|refusal|avoid(?:s|ed|ing)?|eschew(?:s|ed|ing)?|resist(?:s|ed|ing)?|reject(?:s|ed|ing)?|abandon(?:s|ed|ing)?|aspir(?:es?|ing|ation)|striv(?:es?|ing)|attempt(?:s|ed|ing)?|tries to|trying to|wants? to|wanted to|would-be|pseudo|quasi|faux|supposedly|allegedly|ostensibly)\b/i;
const NEG_OK = /\b(not only|not just|not merely|not simply|no less|nothing if not|nothing short of)\b/i;
/* œuvre-comparison cues: sentence predicates of the director's work at large */
const OEUVRE = /\b(earlier|previous|later|subsequent|next|other|another|preceding|prior)\s+(films?|features?|works?|pictures?|movies?|efforts?)\b|\b(his|her|their|whose|the director[’']s?)\s+(work|works|films|movies|oeuvre|œuvre|filmography|career|body of work)\b/i;
/* comparative frame: the predication may belong to the other side of it */
const COMPARATIVE = /\b(unlike|as opposed to|in contrast (?:to|with)|by contrast with|whereas|compared (?:to|with)|in comparison (?:to|with))\b/i;
/* generic register: claims about films/directors at large, or received ideas */
const GENERIC = /\bfilms that\b|\btends? to be\b|\bmany (?:directors|filmmakers|films|movies)\b|\bso-called\b|\bare often\b|\bis often (?:depicted|described|seen|said)\b/i;
/* citation / theory register: the sentence reports someone else's general
   claim, or talks about cinema/art in the abstract, not this film */
const CITATION = /\b(argu(?:es|ed|ing)|according to|et al|as \w+ (?:says|writes|notes|puts|argues|observes)|(?:s?he|they) (?:argues|writes|says|notes|claims|suggests)|identifi(?:es|ed)|characteris(?:es|ed)|characteriz(?:es|ed)|defin(?:es|ed|ition)|observ(?:es|ed) that|suggest(?:s|ed) that|claim(?:s|ed) that|writes that|notes that|puts it)\b/i;
const THEORY = /\b(modernis[mt]|postmodernis\w*|meta-?textual\w*|representation|signifiers?|signifieds?|discourse|dialectic\w*|paradigm|ontolog\w*|epistemolog\w*|phenomenolog\w*|spectatorship|a work of art|this model|theor(?:y|ies|ist|ists|etical))\b/i;
/* another author's work invoked possessively: "McElwee's sonorous voice" */
const POSSESSIVE_WORK = /\b([A-ZÀ-Þ][a-zà-ÿ’'-]+)[’']s\s+(work|films|movies|works|oeuvre|œuvre|filmography|career|cinema|voice|style|approach|aesthetics?|camera|documentaries|narration|body of work)\b/g;
const OEUVRE_NOUN = /^(work|films|movies|works|oeuvre|œuvre|filmography|career|body of work)$/i;
/* post-copula negation after the term: "... are not truly static" */
const POST_NEG = /\b(?:is|are|was|were|be|been|seems?|remains?)\s+(?:not|never|hardly|scarcely|anything but)\b/i;
/* first-person openings are usually interview quotes or critic memoir */
const FIRST_PERSON = /^["“‘']?(when\s+)?i\b/i;

/* ---------------- text plumbing ---------------- */
const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/&amp;/g, "&").replace(/&#8217;|&#8216;/g, "'")
    .replace(/&#8230;/g, "...").replace(/&nbsp;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const deent = (s) => s
  .replace(/&#8217;|&rsquo;/g, "\u2019").replace(/&#8216;|&lsquo;/g, "\u2018")
  .replace(/&#8220;|&ldquo;/g, "\u201c").replace(/&#8221;|&rdquo;/g, "\u201d")
  .replace(/&#8211;|&ndash;/g, "\u2013").replace(/&#8212;|&mdash;/g, "\u2014")
  .replace(/&#8230;|&hellip;/g, "\u2026")
  .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/* HTML -> plain text with italic spans wrapped in \x01...\x02 sentinels. */
function markedText(html) {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:i|em|cite)\b[^>]*>([\s\S]{0,200}?)<\/(?:i|em|cite)>/gi, (_, inner) =>
      "\x01" + inner.replace(/<[^>]+>/g, " ") + "\x02")
    .replace(/<(?:p|div|br|h\d|li|blockquote|tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  t = deent(t);
  return t.replace(/[ \t]+/g, " ").replace(/ ?\n[ \n]*/g, "\n").trim();
}

function sentences(text) {
  const out = [];
  for (const block of text.split("\n")) {
    for (const s of block.split(/(?<=[.!?\u2026]["\u201d\u2019)]?)\s+(?=[\x01(\u201c"\u2018']?[A-Z0-9])/)) {
      const trimmed = s.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

/* ---------------- corpus tables ---------------- */
const filmTitles = new Map(); // key -> Set(normalised titles)
for (const [key, f] of Object.entries(corpus.films)) {
  const set = new Set();
  for (const t of [f.title, f.wikipedia && String(f.wikipedia).replace(/\s*\(.*?\)\s*$/, ""), key.replace(/-/g, " ")]) {
    if (!t) continue;
    const n = norm(t);
    if (n && n.length >= 2) set.add(n);
  }
  filmTitles.set(key, set);
}

/* surname -> Set(film keys whose director carries it); len >= 4 only */
const surnameFilms = new Map();
const directorTokens = new Map(); // key -> Set(name tokens of its own director(s))
for (const [key, f] of Object.entries(corpus.films)) {
  const toks = new Set();
  for (const name of String(f.director || "").split(/,|&| and /)) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    for (const p of parts) toks.add(p);
    const last = parts[parts.length - 1];
    if (last && last.length >= 4 && /^[A-ZÀ-Þ]/.test(last)) {
      if (!surnameFilms.has(last)) surnameFilms.set(last, new Set());
      surnameFilms.get(last).add(key);
    }
  }
  directorTokens.set(key, toks);
}

/* post id -> Set(film keys matched by the index); and which are ABOUT it */
const postFilms = new Map();
const postAboutFilms = new Map();
for (const [key, list] of Object.entries(ix.films)) {
  for (const e of list) {
    if (!postFilms.has(e.id)) postFilms.set(e.id, new Set());
    postFilms.get(e.id).add(key);
    if (e.about) {
      if (!postAboutFilms.has(e.id)) postAboutFilms.set(e.id, new Set());
      postAboutFilms.get(e.id).add(key);
    }
  }
}

/* ---------------- load raw HTML for retained posts ---------------- */
const wantIds = new Set(Object.keys(ix.posts).map(Number));
const htmlById = new Map();
for (const file of fs.readdirSync(CACHE).sort()) {
  let raw;
  const p = path.join(CACHE, file);
  if (file.endsWith(".json.gz")) raw = zlib.gunzipSync(fs.readFileSync(p)).toString("utf8");
  else if (file.endsWith(".json")) raw = fs.readFileSync(p, "utf8");
  else continue;
  let arr; try { arr = JSON.parse(raw); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  for (const post of arr) {
    const id = Number(post && post.id);
    if (!id || !wantIds.has(id) || htmlById.has(id)) continue;
    htmlById.set(id, (post.content && post.content.rendered) || "");
  }
}
console.error("posts with HTML: " + htmlById.size + " / " + wantIds.size);

/* ---------------- compile lexicon matchers ---------------- */
const MATCHERS = []; // {normalised, re}
for (const [normalised, variants] of Object.entries(LEXICON)) {
  const alts = variants.map((v) =>
    v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[- ]/g, "[\\-\u2011 ]"));
  MATCHERS.push({ normalised, re: new RegExp("\\b(" + alts.join("|") + ")\\b", "gi") });
}

/* ---------------- the 813-film surface (soc-partition ranking) ---------------- */
const surface = Object.entries(ix.films)
  .map(([k, l]) => ({ k, about: l.filter((e) => e.about).length, w: l.reduce((a, e) => a + e.w, 0) }))
  .sort((a, b) => (b.about - a.about) || (b.w - a.w) || (a.k < b.k ? -1 : 1))
  .slice(0, SURFACE)
  .map((r) => r.k);

/* ---------------- harvest ---------------- */
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const foldedPostText = new Map();

const out = {};
const dropStats = { italic: 0, otherFilm: 0, otherDirector: 0, oeuvre: 0, notNamed: 0, negated: 0, postNeg: 0, guard: 0, question: 0, citation: 0, theory: 0, comparative: 0, generic: 0, possessive: 0, firstPerson: 0, essayNoDirector: 0, essayPossessive: 0 };

/* words of a film's own titles, for the essay-title possessive exception
   (so "Rosemary's Baby: ..." does not disqualify Rosemary's Baby's essay) */
const titleWords = new Map();
for (const [key, set] of filmTitles) {
  const words = new Set();
  for (const t of set) for (const w of t.split(" ")) words.add(w);
  titleWords.set(key, words);
}

for (const key of surface) {
  const myTitles = filmTitles.get(key) || new Set();
  const myDirToks = directorTokens.get(key) || new Set();
  const myTitleWords = titleWords.get(key) || new Set();
  const found = new Map(); // termLower -> {entry, score}

  for (const e of ix.films[key] || []) {
    const meta = ix.posts[e.id];
    const html = htmlById.get(Number(e.id));
    if (!meta || !html || NOISE.test(meta.link)) continue;

    /* remake / wrong-film guards, essay level. An essay used for this film
       must mention this film's director somewhere (an essay on Adrian Lyne's
       Lolita never names Kubrick's hand); and an essay whose TITLE credits the
       film to another possessive name ("Adrian Lyne's Lolita") is not ours. */
    const longToks = [...myDirToks].filter((t) => t.length >= 4);
    if (!foldedPostText.has(e.id)) foldedPostText.set(e.id, fold(meta.text));
    const foldedText = foldedPostText.get(e.id);
    if (longToks.length && !longToks.some((t) => foldedText.includes(fold(t)))) { dropStats.essayNoDirector++; continue; }
    let essayBad = false;
    for (const m of meta.title.matchAll(/\b([A-ZÀ-Þ][a-zà-ÿ’'-]{2,})[’']s?\s/g)) {
      const name = m[1];
      if (!myDirToks.has(name) && !myTitleWords.has(norm(name))) { essayBad = true; break; }
    }
    if (essayBad) { dropStats.essayPossessive++; continue; }

    /* if this essay is ABOUT more than one corpus film ("Alphaville /
       Playtime"), a sentence only counts when it names this one */
    const multiAbout = (postAboutFilms.get(e.id) || new Set()).size > 1;

    /* essays that merely mention the film need >= 3 title occurrences to be
       usable at all (soc-form's floor), and per-sentence naming below */
    if (!e.about) {
      const hay = " " + norm(meta.text) + " ";
      let count = 0;
      for (const t of myTitles) {
        if (t.length < 3) continue;
        count = Math.max(count, (hay.match(new RegExp("(?<= )" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?= )", "g")) || []).length);
      }
      if (count < 3) continue;
    }

    for (const sent of sentences(markedText(html))) {
      if (sent.length < 40 || sent.length > 700) continue;
      if (/\?["\u201d)]?\s*$/.test(sent)) { dropStats.question++; continue; }

      const plain = sent.replace(/[\x01\x02]/g, "");
      const nSent = " " + norm(plain) + " ";

      /* does the sentence name this film? */
      let namesFilm = false;
      for (const t of myTitles) {
        if (t.length >= 3 && nSent.includes(" " + t + " ")) { namesFilm = true; break; }
      }
      if ((!e.about || multiAbout) && !namesFilm) { dropStats.notNamed++; continue; }

      if (FIRST_PERSON.test(plain)) { dropStats.firstPerson++; continue; }
      if (CITATION.test(plain)) { dropStats.citation++; continue; }
      if (THEORY.test(plain)) { dropStats.theory++; continue; }
      if (COMPARATIVE.test(plain)) { dropStats.comparative++; continue; }
      if (GENERIC.test(plain)) { dropStats.generic++; continue; }

      /* someone else's work predicated possessively, or œuvre-level talk */
      let possessiveBad = false;
      POSSESSIVE_WORK.lastIndex = 0;
      let pm;
      while ((pm = POSSESSIVE_WORK.exec(plain)) !== null) {
        const name = pm[1], noun = pm[2];
        if (!myDirToks.has(name) && !myTitleWords.has(norm(name))) { possessiveBad = true; break; }
        if (myDirToks.has(name) && OEUVRE_NOUN.test(noun)) { possessiveBad = true; break; }
      }
      if (possessiveBad) { dropStats.possessive++; continue; }

      /* italic guard: any italicised capitalised span that is not our title */
      let badItalic = false;
      for (const m of sent.matchAll(/\x01([^\x02]*)\x02/g)) {
        const span = m[1].trim();
        if (!span || !/[A-ZÀ-Þ]/.test(span)) continue;
        const n = norm(span);
        if (n.length < 3) continue;
        if (!myTitles.has(n)) { badItalic = true; break; }
      }
      if (badItalic) { dropStats.italic++; continue; }

      /* other corpus films matched to this essay, named in prose */
      let otherFilm = false;
      for (const otherKey of postFilms.get(e.id) || []) {
        if (otherKey === key) continue;
        for (const t of filmTitles.get(otherKey) || []) {
          if (t.length >= 4 && !myTitles.has(t) && nSent.includes(" " + t + " ")) { otherFilm = true; break; }
        }
        if (otherFilm) break;
      }
      if (otherFilm) { dropStats.otherFilm++; continue; }

      /* another director's name in the sentence */
      let otherDirector = false;
      for (const m of plain.matchAll(/\b([A-ZÀ-Þ][a-zà-ÿ\u2019'-]{3,})\b/g)) {
        const name = m[1].replace(/[’']s?$/, "");
        const cand = surnameFilms.get(name);
        if (cand && !cand.has(key) && !myDirToks.has(name)) { otherDirector = true; break; }
      }
      if (otherDirector) { dropStats.otherDirector++; continue; }

      if (OEUVRE.test(plain)) { dropStats.oeuvre++; continue; }

      /* lexicon scan */
      for (const { normalised, re } of MATCHERS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(plain)) !== null) {
          const term = m[1];
          const beforeAll = plain.slice(0, m.index);
          const after = plain.slice(m.index + term.length);
          /* clause window before the term: cut at last . ; : — */
          if (/[-\u2011]$/.test(beforeAll)) continue; /* "ill-mannered" is a different word */
          /* capitalised mid-sentence: proper noun ("Chilly Billy"), not a descriptor */
          if (m.index > 1 && /^[A-Z\u00c0-\u00de]/.test(term)) continue;
          const win = beforeAll.split(/[.;:\u2014]/).pop().slice(-70);
          if (NEG.test(win) && !NEG_OK.test(win)) { dropStats.negated++; continue; }
          if (POST_NEG.test(after.slice(0, 80))) { dropStats.postNeg++; continue; }
          const g = GUARDS[normalised] || GUARDS[term.toLowerCase()];
          if (g) {
            if (g.before && g.before.test(beforeAll.slice(-30))) { dropStats.guard++; continue; }
            if (g.after && g.after.test(after)) { dropStats.guard++; continue; }
            if (g.requireAfter && !g.requireAfter.test(after)) { dropStats.guard++; continue; }
          }
          const score = (e.about ? 2 : 0) + (namesFilm ? 1 : 0);
          const tl = term.toLowerCase();
          const prev = found.get(tl);
          if (!prev || score > prev.score) {
            found.set(tl, {
              score,
              entry: {
                term,
                normalised,
                essay: meta.link,
                sentence: plain.replace(/\s+/g, " ").trim(),
              },
            });
          }
        }
      }
    }
  }

  if (found.size) {
    out[key] = [...found.values()]
      .sort((a, b) => b.score - a.score || a.entry.normalised.localeCompare(b.entry.normalised))
      .map((v) => v.entry);
  }
}

fs.writeFileSync(path.join(__dirname, "out", "critic-vocab.json"), JSON.stringify(out));

/* ---------------- report ---------------- */
const filmsOut = Object.keys(out).length;
const counts = Object.values(out).map((l) => l.length).sort((a, b) => a - b);
const total = counts.reduce((a, b) => a + b, 0);
const distinct = new Set();
for (const l of Object.values(out)) for (const en of l) distinct.add(en.normalised);
const q = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] || 0;
console.log("surface films      : " + surface.length);
console.log("films with terms   : " + filmsOut);
console.log("entries total      : " + total);
console.log("distinct normalised: " + distinct.size);
console.log("terms/film min|p25|p50|p75|p90|max : " + [counts[0], q(0.25), q(0.5), q(0.75), q(0.9), counts[counts.length - 1]].join(" | "));
console.log("drops: " + JSON.stringify(dropStats));
