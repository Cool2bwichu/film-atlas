#!/usr/bin/env node
/* Pull the behaviour-bearing prose out of the cached Senses essays.
 *
 *   node pipeline/soc-form.js "vertigo" "psycho"          # named films
 *   node pipeline/soc-form.js --mine --from 0 --take 12   # this writer's slice
 *
 * Prints only sentences that name how a film MOVES, is LIT or is CUT. The
 * corpus already has plenty of subject; this is the column it does not have.
 *
 * TWO FILTERS, both learned the hard way. World polls, top-tens and festival
 * reports mention hundreds of films in passing and produce nothing but noise —
 * a sentence about Klondike surfacing under A Brighter Summer Day. They are
 * dropped whole. And in an essay that is not ABOUT the film, a sentence only
 * counts if it names the film, so a Kubrick essay cannot describe The Shining
 * under A.I.'s heading.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ix = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "soc-index.json"), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));

const NOISE = /\/(world-poll|top-tens|festival-reports|festival-report|cinemarati|readers-polls)\//i;

const BEHAVIOUR = new RegExp(
  "\\b(" + [
    "camera", "cameras", "pans?", "panning", "tilts?", "tracks?", "tracking",
    "dolly", "dollies", "cranes?", "zooms?", "handheld", "hand-held", "steadicam",
    "long takes?", "single take", "one take", "sequence shots?", "close-?ups?",
    "medium shots?", "wide shots?", "long shots?", "two-shot", "frames?", "framing",
    "framed", "reframe", "offscreen", "off-screen", "lens", "lenses", "telephoto",
    "wide-angle", "anamorphic", "widescreen", "cinemascope", "scope", "aspect ratio",
    "academy ratio", "deep focus", "shallow focus", "rack focus", "depth of field",
    "cuts?", "cutting", "edits?", "editing", "montage", "dissolves?", "jump cuts?",
    "fades?", "shot/reverse", "reverse shot", "eyeline", "match cut", "ellipsis",
    "elliptical", "tempo", "rhythm", "pacing", "duration", "static", "tableaux?",
    "lighting", "lit", "backlit", "chiaroscuro", "shadows?", "silhouettes?",
    "colour", "color", "palette", "monochrome", "black-and-white", "black and white",
    "desaturated", "saturated", "grain", "grainy", "16mm", "35mm", "super 8",
    "slow motion", "slow-motion", "freeze ?frames?", "step-print", "high angle",
    "low angle", "overhead", "point of view", "mise-en-sc.ne", "composition",
    "widescreen", "takes?", "shots?", "screen", "image", "images",
  ].join("|") + ")\\b", "i"
);

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();

function sentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z“"(‘])/);
}

function usableEssays(key) {
  const f = corpus.films[key];
  const nTitle = norm(f.title);
  const out = [];
  for (const e of (ix.films[key] || [])) {
    const p = ix.posts[e.id];
    if (!p || NOISE.test(p.link)) continue;
    const hay = norm(p.text);
    const count = nTitle.length > 2
      ? (hay.match(new RegExp("(^| )" + nTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "( |$)", "g")) || []).length
      : 0;
    if (!e.about && count < 3) continue;
    out.push({ ...e, post: p, count, nTitle });
  }
  return out;
}

function report(key, opts) {
  const f = corpus.films[key];
  if (!f) { console.log("!! not in corpus: " + key); return; }
  const essays = usableEssays(key);
  console.log("\n\n########## " + f.title + " (" + f.year + ") — " + f.director + "   [" + key + "]");
  if (!essays.length) { console.log("   (no focused Senses essay)"); return; }
  let printed = 0;
  for (const e of essays.slice(0, opts.n)) {
    const p = e.post;
    let sents = sentences(p.text).filter((s) => s.length > 55 && s.length < 800 && BEHAVIOUR.test(s));
    if (!e.about) {
      const re = new RegExp(e.nTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      sents = sents.filter((s) => re.test(norm(s)));
    }
    if (!sents.length) continue;
    console.log("\n-- " + (e.about ? "[ABOUT] " : "[x" + e.count + "] ") + p.title + "  (" + p.date + ")\n   " + p.link);
    for (const s of sents.slice(0, opts.cap)) {
      console.log("   • " + s.replace(/\s+/g, " ").trim());
      printed++;
    }
  }
  if (!printed) console.log("   (no behaviour-bearing prose)");
}

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i > -1 ? Number(argv[i + 1]) : dflt;
};

let films = argv.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a));
if (argv.includes("--mine")) {
  const ranked = Object.entries(ix.films)
    .map(([k, l]) => ({ k, about: l.filter((e) => e.about).length, w: l.reduce((a, e) => a + e.w, 0) }))
    .sort((a, b) => (b.about - a.about) || (b.w - a.w) || (a.k < b.k ? -1 : 1))
    .slice(0, 813).map((r) => r.k).sort();
  const mine = ranked.filter((_, i) => i % 3 === 0);
  films = mine.slice(flag("from", 0), flag("from", 0) + flag("take", 10));
}

for (const k of films) report(k, { n: flag("n", 2), cap: flag("cap", 16) });
