#!/usr/bin/env node
/* Build a film -> essay index over the cached Senses of Cinema archive.
 *
 *   node pipeline/index-soc.js            # -> pipeline/out/soc-index.json
 *
 * Matching is deliberately conservative. Senses italicises film titles by
 * house style, so an <i>/<em> span whose normalised text equals a corpus
 * title is a high-precision hit. Bare prose matching is allowed only for
 * titles long enough that a chance collision is implausible, and a stoplist
 * kills the titles that are also ordinary English ("M", "Ran", "Contact").
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(__dirname, ".cache-soc");
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8230;/g, "...").replace(/&nbsp;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, "-").replace(/&#8212;|&mdash;/g, "-")
    .replace(/&#8230;|&hellip;/g, "...")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/* Titles that are also ordinary words or fragments of other titles. Prose
   matching is refused for these; only an italic span counts. */
const AMBIGUOUS = new Set([
  "m", "ran", "contact", "up", "her", "it", "them", "the birds", "brazil", "alien",
  "psycho", "faces", "persona", "solaris", "metropolis", "days of heaven", "the wall",
  "help", "yes", "no", "sisters", "the party", "gravity", "drive", "heat", "the hunt",
  "hero", "shame", "fear", "youth", "victoria", "loving", "roma", "rome", "paris",
  "the crowd", "the general", "the kid", "the gold rush", "the circus", "sunrise",
  "casino", "the game", "notorious", "vertigo", "the wave", "the earth", "earth",
  "the mother", "mother", "the son", "the fall", "the trial", "the message",
  "war and peace", "one", "two", "three", "four", "seven", "eight", "nine", "ten",
  "amour", "elephant", "boyhood", "carol", "lost highway", "the double", "wings",
  "the way", "the road", "the visit", "the bridge", "the dance", "the promise",
]);

/* ---------- corpus title table ---------- */
const titleToKeys = new Map();
const addTitle = (t, key) => {
  const n = norm(t);
  if (!n || n.length < 2) return;
  if (!titleToKeys.has(n)) titleToKeys.set(n, new Set());
  titleToKeys.get(n).add(key);
};
for (const [key, f] of Object.entries(corpus.films)) {
  addTitle(f.title, key);
  if (f.wikipedia) addTitle(String(f.wikipedia).replace(/\s*\(.*?\)\s*$/, ""), key);
  addTitle(key.replace(/-/g, " "), key);
}

/* ---------- load cache ---------- */
const posts = new Map();
for (const file of fs.readdirSync(CACHE).sort()) {
  if (!file.endsWith(".json")) continue;
  let arr;
  try { arr = JSON.parse(fs.readFileSync(path.join(CACHE, file), "utf8")); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  for (const p of arr) {
    if (!p || !p.id || posts.has(p.id)) continue;
    posts.set(p.id, {
      id: p.id,
      link: p.link,
      date: (p.date || "").slice(0, 10),
      title: stripTags(p.title && p.title.rendered ? p.title.rendered : ""),
      titleRaw: (p.title && p.title.rendered) || "",
      html: (p.content && p.content.rendered) || "",
    });
  }
}
console.error("posts: " + posts.size);

/* ---------- index ---------- */
const byFilm = new Map(); // key -> [{id, weight, about}]
const ITALIC = /<(?:i|em|cite)\b[^>]*>([\s\S]{1,140}?)<\/(?:i|em|cite)>/gi;

for (const post of posts.values()) {
  const text = stripTags(post.html);
  post.text = text;
  post.words = text.split(" ").length;
  const normText = " " + norm(text) + " ";
  const normTitle = " " + norm(post.title) + " ";

  const hits = new Map(); // key -> weight
  const bump = (key, w, about) => {
    const cur = hits.get(key) || { w: 0, about: false };
    cur.w += w;
    cur.about = cur.about || about;
    hits.set(key, cur);
  };

  /* italic spans: house style for a film title */
  const spans = new Set();
  let m;
  ITALIC.lastIndex = 0;
  while ((m = ITALIC.exec(post.html)) !== null) {
    const n = norm(stripTags(m[1]));
    if (n) spans.add(n);
  }
  ITALIC.lastIndex = 0;
  while ((m = ITALIC.exec(post.titleRaw)) !== null) {
    const n = norm(stripTags(m[1]));
    if (n) spans.add("TITLE:" + n);
  }

  for (const raw of spans) {
    const inTitle = raw.startsWith("TITLE:");
    const n = inTitle ? raw.slice(6) : raw;
    const keys = titleToKeys.get(n);
    if (!keys) continue;
    for (const key of keys) bump(key, inTitle ? 6 : 3, inTitle);
  }

  /* prose match for distinctive titles */
  for (const [n, keys] of titleToKeys) {
    if (n.length < 11 || AMBIGUOUS.has(n)) continue;
    if (hits.has([...keys][0])) continue;
    if (normText.includes(" " + n + " ")) {
      const about = normTitle.includes(" " + n + " ");
      for (const key of keys) bump(key, about ? 4 : 1, about);
    }
  }

  for (const [key, v] of hits) {
    if (!byFilm.has(key)) byFilm.set(key, []);
    byFilm.get(key).push({ id: post.id, w: v.w, about: v.about });
  }
}

/* ---------- write ---------- */
const out = { films: {}, posts: {} };
const keepPosts = new Set();
for (const [key, list] of byFilm) {
  list.sort((a, b) => (b.about - a.about) || (b.w - a.w));
  out.films[key] = list.slice(0, 12);
  for (const e of out.films[key]) keepPosts.add(e.id);
}
for (const id of keepPosts) {
  const p = posts.get(id);
  out.posts[id] = { link: p.link, date: p.date, title: p.title, words: p.words, text: p.text };
}

fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "out", "soc-index.json"), JSON.stringify(out));

const reached = Object.keys(out.films).length;
const aboutFilms = Object.entries(out.films).filter(([, l]) => l.some((e) => e.about)).length;
console.log("films reached : " + reached + " / " + Object.keys(corpus.films).length);
console.log("films with an essay ABOUT them: " + aboutFilms);
console.log("posts retained: " + keepPosts.size);
