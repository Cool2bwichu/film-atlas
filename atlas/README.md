# ATLAS — a map of cinematic lineage

Name a film. The map draws what it descends from, what it argues with, and what
quietly rhymes with it. Every connection is a typed claim you can click and
read, and every claim shows how confident it is.

Built with Claude in a chat session. This package is a complete handoff: source,
creative direction, honest build state, and a working visual-validation harness.

---

## Read in this order

| File | What it holds |
|---|---|
| `AGENTS.md` | **Start here.** The settled decisions and quality bar. Do not re-litigate these without being asked. |
| `DESIGN.md` | Creative direction, colour and type tokens, motion grammar, what's deliberately avoided. |
| `STATE.md` | **One page.** Current numbers, build commands, open problems in priority order. |
| `HISTORY.md` | The narrative record — why decisions were made, what was tried and rejected, post-mortems. Read only when about to redo something. |
| `app/` | **The app.** `template.html` + `build.js` produce one self-contained file. No React, no d3, no bundler. |
| `validation/` | Playwright harness plus the screenshots and measurements behind every claim in `STATE.md`. |
| `artifact/`, `local/`, `scripts/` | **Superseded.** The old React dual build, kept only as reference. See HISTORY, "Rewrite: `app/` replaces the React component". Nothing here is on a live path; do not sync changes into it. |

---

## The publishable artifact

A size-limited build of the same single file, for targets that cannot carry the
whole 2.0 MB corpus:

```bash
node app/build.js --films 220 --degree 10 --out atlas-artifact.html
```

436 KB, 220 films, 1,268 edges. `--films` trades size against reach; the build
prints which anchor titles its neighbourhood pruning had to drop — at 220 that
currently costs *Yi Yi*, *Suspiria*, *Do the Right Thing*, *Beau Travail*,
*Touki Bouki* and *Pather Panchali*. See STATE.md for why film selection is the
one genuinely lossy step and the three ways it went wrong first.

---

## Previewing it, the fast way

Open **`atlas.html`**. That is the whole instruction — double-click it. No
install, no server, no keys, no network, no build step. The corpus and every
poster URL are inlined into one 2.0 MB file.

It opens on the wall of posters. Pick a face, or type a film (try *Chinatown*,
*Suspiria*, *Tokyo Story*, *Sátántangó*), hover a line to read the claim it
carries, then keep clicking outward — the thread along the bottom records where
you have been.

Rebuild it after changing the corpus or `app/template.html`:

```bash
node app/build.js
```

That is the only build command. It takes about a second, needs no dependencies,
and prints the film and edge counts it wrote.

---

## Iterating on the app

There is no dev server and nothing to install. Edit `app/template.html`, run
`node app/build.js`, reload `atlas.html`. If you want live reload, any static
server over the handoff directory will do:

```bash
python3 -m http.server 8777
```

Browser caching is aggressive on a 2 MB file — append `?v=2` when you reload, or
the browser will hand you the previous build and you will debug a stale page.

**No keys are required at any point.** The app holds no credential and makes no
API call; the only request it issues is for a poster image. `TMDB_KEY` is a
build-time input to `pipeline/enrich.js` only — see AGENTS rule 6b.

---

## Posters, and the licence you are inheriting

Posters and descriptions are resolved **at build time** by `pipeline/enrich.js`
and baked into `static/corpus.json` as URLs. The running app makes no API call
and needs no key — the only request it issues is for an image.

790 of 803 films carry a poster. **693 of those are non-free images** that
Wikipedia hosts under its own fair-use claim, which does not extend to third
parties; 97 are freely licensed Commons files. Every poster records which it is
in `posterLicence`. That is fine for a personal or portfolio project and is not
fine for a commercial one.

To replace them with properly licensed artwork, rebuild with a TMDB key and
`TMDB_POSTERS=1`. The flag is separate from the key on purpose: a key alone adds
keywords and leaves photography alone, because swapping posters re-skins the app
and invalidates every palette measured from the old image, so `palette.py` has to
run again afterwards.

```bash
TMDB_KEY=your_key TMDB_POSTERS=1 node pipeline/enrich.js
python3 pipeline/palette.py
node pipeline/associate.js && node pipeline/merge-corpus.js
```

---

## Rebuilding the corpus

```bash
node pipeline/harvest-sparql.js pipeline/seeds.txt   # ~40 SPARQL queries
node pipeline/enrich.js                              # posters + descriptions
python3 pipeline/palette.py                          # duotone from each poster
node pipeline/associate.js                           # the association engine
node pipeline/merge-corpus.js                        # + authored readings
node pipeline/validate-corpus.js && node pipeline/measure-maps.js
node pipeline/measure-claims.js                      # what a reader actually sees
```

`enrich.js` picks up TMDB keywords whenever `TMDB_KEY` is set — they are the
sharpest attributes in the corpus and the thing that moves the trivia share.
`measure-claims.js` is how you tell whether an attribute earned its place: it
reproduces the app's own ranking and reports the composition of every line a
reader sees. Run it before and after any change to the corpus or to ranking.

Every stage caches to disk and is resumable — interrupt and re-run freely.
`harvest.js` (the REST path) is kept as a fallback for networks where
query.wikidata.org is unreachable; it is far slower and rate-limits hard past a
few hundred titles.

## Briefing an agent on this project

Point it at `AGENTS.md` first, then name the specific task. Being concrete about
scope and constraint matters more than length.

**Good:**

- `Read AGENTS.md and DESIGN.md. Fix STATE.md item 3 — edge labels overlapping posters at desktop. Measure real label boxes, not bounding circles, and prove the check can fail before you fix it.`
- `Run validation/harness/probe.py against the current atlas.html at 390px and fix any overlap it reports.`
- `Extend the authored layer (STATE.md item 2) to the 40 highest-degree films outside the original 67. Follow the register documented in HISTORY under "The authored layer".`

**Bad:**

- `Make it better` — no scope, no constraint, invites a rewrite.
- `Add a poster fallback` — already exists; read `STATE.md` first.
- `Clean up the design` — the design is documented and deliberate. Name the specific thing that's wrong.

**The trap to warn against:** almost every generic instinct here is a
regression. Weighting edges by node degree, hiding the confidence indicator for
visual cleanliness, blurring the captions along with the imagery, or swapping
the palette for a neutral dark theme are all things an agent will reach for
naturally and all things this project has specifically rejected. `AGENTS.md`
exists to prevent exactly that.

---

## `artifact/`, `local/` and `scripts/` are dead code

They are the previous architecture: a React component maintained in two copies,
one for the artifact runtime and one for a Vite dev server, with a generator
keeping them in sync. `app/` replaced all of it with a single templated file and
no bundler — see HISTORY, "Rewrite: `app/` replaces the React component".

They are kept only so the earlier decisions remain readable. **Nothing in them is
on a live path.** Do not sync changes into them, and do not follow their build
scripts: `scripts/build-single.js` regenerates the React `atlas.html` that
rendered a black screen, which is exactly the failure the rewrite existed to fix.

Deleting them is reasonable and has not been done because it is the user's call.
