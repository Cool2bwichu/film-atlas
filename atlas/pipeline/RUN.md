# RUN.md — the growth run, 803 → ~2,200 films

The ordered commands, what to check between stages, what each check should say,
and what to do when one says something else.

Every command below is run from `/home/user/film-atlas/atlas`. The pipeline
scripts resolve their own paths from `__dirname`, so they work from the repo
root too; the `cd` is only so the relative paths in this file are readable.

**This run is long, network-bound and largely irreversible.** The single fact
worth internalising before starting: nothing downstream can distinguish *a film
Wikidata does not have* from *a film we failed to ask about*. Every check below
exists to catch that difference at the one stage that still knows it.

---

## Before anything: what the six pre-run fixes changed

Read this once. Several checks in the old plan no longer mean what they meant.

| | |
|---|---|
| `harvest-sparql.js` | no longer hangs forever on a mid-body socket reset; resolves same-title-same-year collisions deterministically; disambiguates slug collisions instead of silently dropping 27 films; deletes a stale `unresolved.txt`; **exits 1 rather than writing a harvest with a hole in it** |
| `check-harvest.js` | new. Compares the fresh harvest against `static/corpus.json` for presence AND identity |
| `qid-overrides.json` | new. Pins `earth (1930)` → Q55188 and `duel (1971)` → Q583407 |
| `enrich.js` | no longer persists failures into the cache; fatal on a non-404 4xx; refuses to overwrite a keyword collapse |
| `palette.py` | deterministic hue peaks; real retry/throttle armour; **exits 1 at ≥20% poster failures** |
| `associate.js` | budget charged at selection; order-independent output |
| `requirements.txt` | new, and **nothing in the repo installs from it** — stage 0 below does |
| `tests/rendered-html.test.mjs` | corpus assertions are derived from `static/corpus.json`, not hardcoded, so growth no longer turns `npm test` red |

---

## What was actually exercised before this file was written

So you know which expectations below are measured and which are projected.

**Exercised end to end on live Wikidata and live TMDB, 2026-08-08**, in a `/tmp`
mirror of the tree (7 seeds: `Psycho (1960)`, `Psycho (1998)`, `Nosferatu
(1922)`, `Nosferatu (2024)`, `Earth (1930)`, `Duel (1971)`, `Seven Samurai
(1954)`), chosen to hit both a slug collision and both wrong resolves:

```
harvest    7 seeds -> 7 films, 0 unresolved, renamed 2, dupe 0, collided 0,
           pinned by qid-overrides.json: 2, accounting balances, 18.5 s cold.
           Two independent COLD runs (cache deleted between) produced a
           BYTE-IDENTICAL harvest.json -- B2 determinism, on live rows.
           psycho=Q163038 (Hitchcock, unchanged) · psycho 1998=Q979196
           nosferatu=Q151895 (unchanged)         · nosferatu 2024=Q116361132
           earth=Q55188  (was Q12280475)         · duel=Q583407 (was the duel/Q17498893)
           unresolved.txt correctly ABSENT after a clean run.
guard      correctly FAILs, naming `the duel` as missing with the `duel`
           same-title/year hint, and `earth` as a qid move; accepts
           --allow-move earth=Q55188 and still exits 1 on `the duel`.
enrich     7/7 posters, 7/7 descriptions, 7/7 tmdb matched, 169 keywords, and
           one re-pick: "Psycho (1998): #1 was Psycho [1960], took Psycho [1998]"
           -- the remake filter firing on the exact pair the keying disambiguated.
palette    7 read, 6 measured, 1 achromatic, 0 unreadable, 0 carried fwd.
associate  7 films, 21 pairs considered, 6 kept, 0 unconnected.
merge      wrote the mirror's corpus.json; all four disambiguated/corrected keys
           survive with the right film, palette source and poster licence.
validate   schema OK.
```

**Also measured directly against live WDQS**, 120 real titles from
`seeds-expansion.txt`, interleaved so a load blip cannot explain it: the resolve
query returns 200 in 1.7 s / 2.3 s, and the `BIND`-inside-`UNION` form it
replaced returned 502 after 39 s and 504 after 65 s on the same chunk. Both
forms return the same 639 rows and the same 279 distinct (match, film) pairs.

**Not exercised at scale.** Nobody has run 2,214 seeds, 2,200 enrichments or
2,200 posters. Every count in the stage sections below marked `~` is a
projection from measured per-unit rates, not an observation.

---

## Stage 0 — preflight (~5 min)

```bash
cd /home/user/film-atlas/atlas

git status --short                  # only intended pipeline/test/gitignore files
npm --prefix .. run lint 2>&1 | grep -c " error "        # 0
npm --prefix .. test                                     # green, 3/3

# Freeze the pre-growth baseline. These are the numbers every "did it get
# worse" question is answered against, and after merge-corpus.js overwrites
# static/corpus.json they cannot be recomputed.
node pipeline/measure-claims.js > /tmp/atlas-baseline-claims.txt
node pipeline/measure-maps.js   > /tmp/atlas-baseline-maps.txt
cp pipeline/out/enrich.json  /tmp/atlas-enrich-803.json
cp pipeline/out/harvest.json /tmp/atlas-harvest-803.json
cp static/corpus.json        /tmp/atlas-corpus-803.json
cp static/readings.json      /tmp/atlas-readings-803.json

# The palette pin is inert unless someone installs from it.
python3 -m pip install -r pipeline/requirements.txt
python3 -c "import PIL, numpy; print(PIL.__version__, numpy.__version__)"   # 12.3.0 2.4.6

# TMDB key as environment only. It must never reach the repo, a commit or a log.
set -a; . /path/to/scratchpad/tmdb.env; set +a
```

**Expected baseline** (measured 2026-08-08, unchanged from STATE.md):
`trivia 20.9% / authored 33.1% / REPEATED 3.6%`, and
`interpretive 28% / oneType 56% / sameDir 9% / PASS`.

**Gate — a five-film enrich smoke test with a throwaway cache.** `enrich.js` is
now fatal on a non-404 4xx, which is the behaviour you want at film 1 and not at
film 1,400. Prove the key works before spending 29 minutes. `enrich.js` resolves
its cache and its output from `__dirname`, so running a *copy* under `/tmp` puts
everything it writes under `/tmp` by construction rather than by discipline:

```bash
ES=/tmp/atlas-esmoke; rm -rf $ES; mkdir -p $ES/out
cp pipeline/enrich.js $ES/
node -e 'const fs=require("fs");
  const h=JSON.parse(fs.readFileSync("pipeline/out/harvest.json","utf8"));
  const keep=Object.keys(h.films).slice(0,5), films={};
  for(const k of keep) films[k]=h.films[k];
  fs.writeFileSync(process.env.ES+"/out/harvest.json",
    JSON.stringify({films,labels:h.labels,placeTypes:h.placeTypes}));
  console.log(keep.join(", "));'
node $ES/enrich.js
```

Must show `tmdb matched : 5/5`. Anything else, stop: fix the key, do not proceed.
Measured 2026-08-08: 5/5 matched, 5/5 posters, 80 keywords, 4.2 s, exit 0, and
nothing written inside the repo.

---

## Stage 1 — harvest (~10 min)

```bash
cat pipeline/seeds.txt pipeline/seeds-expansion.txt > pipeline/seeds-all.txt
grep -vc '^\s*\(#.*\)\?$' pipeline/seeds-all.txt      # 2214 non-comment lines

node pipeline/harvest-sparql.js pipeline/seeds-all.txt 2>&1 | tee /tmp/atlas-harvest.log
echo "harvest exit: ${PIPESTATUS[0]}"
```

**`seeds.txt` must come first, and the reason is not cosmetic.** `claimKey()`
gives the bare slug to whichever film claims it first. `seeds.txt` first means
`psycho` stays Hitchcock and the 1998 remake becomes `psycho 1998`; the eight
hand-written Hitchcock readings stay on Hitchcock. Reverse the order and
`merge-corpus.js` will cheerfully report `866 readings merged, 0 dropped` while
rendering them on Van Sant. Nothing in the code enforces the order — this line
is the enforcement.

### What the log must say

```
seeds: 2214
  resolved batch 1/19  ...  19/19
resolved by SPARQL: ~2184 films, ~30 unresolved
REST fallback for ~30 unresolved titles ...
  recovered ~20, still missing ~10

seeds 2214 | resolved ~2192 | unresolved ~10 | renamed 25 | dupe 2 | collided 0
  pinned by qid-overrides.json: 2
films      : ~2192
DONE -- wrote pipeline/out/harvest.json
```

Four lines carry weight:

- **`pinned by qid-overrides.json: 2`.** If this line is missing, the override
  sheet matched nothing and did nothing — and it fails *silently*, with no
  warning, because `loadOverrides()` only warns when a pinned QID matches no
  candidate, never when a pinned *key* matches no seed line. An inert override
  sheet leaves `earth` on the wrong film and the run still looks clean.
- **`renamed 25`** — the slug disambiguations. The count is printed; the keys
  are not. To see them: `node -e 'const h=require("./pipeline/out/harvest.json");
  console.log(Object.keys(h.films).filter(k=>/ (19|20)\d\d$/.test(k)).join("\n"))'`
- **`dupe 2`** — two seed lines that are the same film twice. Expected.
- **`collided 0`.** A non-zero value is a genuine loss: title, year *and* film
  all collided. The line is listed in `unresolved.txt`; add a disambiguating
  seed rather than accepting it.

Each resolve chunk should return in **1–3 seconds**. If a chunk takes 60+
seconds and retries, something has changed in the resolve query — see the
`?exact IS BOUND BY A VALUES PAIR` comment in `harvest-sparql.js`; a `BIND`
inside a `UNION` branch pushes this query past WDQS's 60 s limit and was
measured returning 502/504 on real chunks while the shipped form returned 200
in 1.7 s.

### If the harvest exits non-zero

```
!! N resolve chunk(s) never answered. Up to N*120 films are missing ...
```

This is the guard doing its job: a failed chunk leaves its seeds in the
`unresolved` bucket, so the seed accounting balances perfectly while up to 120
films are simply gone. Nothing is written. **Re-run the same command** — the
successful chunks are already in `.cache-sparql/`, so the re-run costs only the
chunks that failed.

The other fatal is `!! seed accounting does not balance` — a film was dropped
without being counted. That is a bug in the keying, not a network problem. Do
not re-run; read `claimKey()`.

### Then the guard, before anything else touches the harvest

```bash
node pipeline/check-harvest.js --all --allow-move earth=Q55188 > /tmp/atlas-guard.log 2>&1
echo "guard exit: $?"
tail -20 /tmp/atlas-guard.log
```

**Redirect to a file. Do not pipe.** `check-harvest.js` ends with
`process.exit(1)`, which drops unflushed stdout when stdout is a pipe. Measured:
`--all` through a slow reader produced 599 of 818 lines, **verdict absent**,
3 runs of 3. `| tee log` also loses the exit code unless `set -o pipefail` is on.
A `>` redirect to a regular file keeps both. (Fix, when someone has the file
open: `process.exitCode = 1; return;` in place of `process.exit(1)`, in both the
verdict path and `die()`.)

**Expected — and it is an expected FAILURE, not a pass:**

```
MISSING FROM THE HARVEST (1 of 803):
  - the duel  "The Duel" (1971, Chang Cheh)  Q17498893  -- absent; but key "duel"
    holds a same-title/year record: "Duel" (1971, Steven Spielberg) ...

qid moved, accepted by --allow-move (1):
  - earth  "Earth" (1930, Peter Stojchev)  Q12280475 -> Q55188  now "Earth"
    (1930, Oleksandr Dovzhenko)

FAIL  corpus films present: 802/803, qid moved: 0
```

Both are the corrections this run exists to make, and both were reproduced
end-to-end on live Wikidata before the run:

- `earth` was a 1930 Macedonian short carrying a Soviet-montage reading. It
  becomes Dovzhenko's *Zemlya*, and the reading finally lands on its subject.
- `the duel` was Chang Cheh's wuxia film under a seed line that reads
  `Duel (1971)`. It becomes `duel` = Spielberg, and `merge-corpus.js` will drop
  the two readings written about the wuxia film **by name**. That is correct —
  they were written about the other film — but a saved `#/film/the%20duel` URL
  will now fall back to the wall.

So `802/803` with exactly those two names is the pass condition. **Anything
else is a stop.** In particular:

> **If a `qid moved` line names a film that ALSO appears elsewhere in the
> harvest under a disambiguated key, do not waive it.** That is the
> expansion-first collision — `psycho` holding Van Sant while Hitchcock sits at
> `psycho 1960` — and `--allow-move psycho=Q1130336` is the one command that
> turns that failure green with eight Hitchcock readings on the wrong film. Fix
> the seed order instead.

Also: `check-harvest.js` compares against `static/corpus.json`, and
`merge-corpus.js` overwrites that same file. **Once stage 4 has run, this guard
compares the corpus to itself and is green by construction.** Run it here or not
at all. If you realise later that you skipped it:
`git show HEAD:atlas/static/corpus.json` is the pre-run corpus.

---

## Stage 2 — enrich (~29 min, sliced)

```bash
for i in 1 2 3 4 5 6; do timeout 540 node pipeline/enrich.js 2>&1 | tail -14; done
```

~0.785 s/film cold × 2,200 exceeds the 600,000 ms foreground call ceiling, and a
bash call that times out in this container kills detached background jobs, so
sliced-with-`timeout` is the pattern. SIGTERM leaves `out/enrich.json`
byte-identical and keeps every cache entry written so far; the final pass runs
off warm cache in about a minute and is the only one that writes the file.

**Four lines, read every pass:**

```
posters      : ~2150/2200
descriptions : ~2180/2200
palettes     : 745 carried forward          <- and NO "dropped" clause
tmdb matched : ~2080/2200
keywords     : ~1550 films, ~19000 total
```

- **`palettes : 745 carried forward`** is the most important line in the whole
  run. `palette.py` writes its measurements back into `enrich.json`, which
  `enrich.js` rewrites from scratch; the loss is invisible because every film
  still ends up with a colour, just an era default. A "dropped (poster changed)"
  clause means posters moved and those films need re-measuring.
- **`keywords` below ~1,000 films** means the TMDB path is failing. Stop and
  `rm -rf pipeline/.cache-enrich`.
- If it exits 1 with `FATAL: TMDB returned 4xx`, the key is bad or revoked.
  Nothing was written. Fix the key and re-run — this is deliberate.
- If it exits 1 with `REFUSED: N films carried keywords ... after this run only
  M still would`, it caught a keyword collapse before overwriting. Do not force
  past it; find out why TMDB stopped answering.

**Known, accepted regression:** the match filter rejects a candidate when the
normalised title agrees exactly but the year does not. Measured on a random
400-title sample of the expansion: 6 false rejections, 0 correct ones, from that
branch — about **21 of 1,400 new films will carry no keywords**. Every one is a
film TMDB dates differently from Wikidata (*Room 666*, *Out 1*, *The American
Soldier*). It costs keywords only; `tmdbId` is consumed by nothing outside
`enrich.js`. If you want it fixed first, the change is one clause: keep
`results[0]` in that branch when its title agrees.

**Latent, will not fire in this run:** the keyword carry-forward keys on the
slug alone and does not check `qid`, so a key that changes film transplants the
old film's keywords. It needs `TMDB_KEY` unset to reach, and first-wins keying
prevents the collision. One clause closes it: `old.qid === f.qid`.

---

## Stage 3 — palette (~14 min, sliced)

```bash
for i in 1 2 3; do timeout 540 python3 pipeline/palette.py 2>&1 | tail -10; done
```

`.cache-posters/` persists across slices and `enrich.json` is untouched until the
final write, so the same slicing logic applies. An interrupt loses that pass's
palettes but not the downloaded posters.

**Check:**

```
posters read : ~2140
measured     : ~1950
achromatic   : ~150
unreadable   : 0
carried fwd  : 745
```

- `unreadable` should be **0**. Any non-zero value is a poisoned cache entry or
  a dropped request, and you cannot tell which later.
- **It now exits 1 at ≥20% failures.** That is intended — a scripted `&&` chain
  should stop — but note the threshold is `>=`, so a 5-film scoped run with one
  dead link also exits 1.
- Expect **~15 shadow hues to change** across the whole corpus versus what the
  old code would have produced. Each moves from a colour the poster does not
  contain to a rotation of one it does. Highlights do not move.

---

## Stage 4 — associate + merge (~30 s)

```bash
node pipeline/associate.js   2>&1 | tee /tmp/atlas-associate.log
node pipeline/merge-corpus.js 2>&1 | tee /tmp/atlas-merge.log
```

`merge-corpus.js` **overwrites `static/corpus.json`**. This is the irreversible
step; `/tmp/atlas-corpus-803.json` from stage 0 and `git show
HEAD:atlas/static/corpus.json` are the two ways back.

**Check:**

```bash
grep -i 'readings merged\|dropped\|REFUSED\|authored edges' /tmp/atlas-merge.log
```

`dropped readings referencing films outside the spine` should list **exactly the
two `the duel` readings** and nothing else. Any other name is a film that
carried an authored claim and did not survive the harvest — stage 1's guard
should have caught it. **Go back; do not patch forward.** The reading text is
still in `static/readings.json`; the film is not.

From the associate log, confirm `crew` did not eat the budget: expect roughly
12,000–13,000 crew edges of ~21,800 total. `crew` gates on identity rather than
rarity, and it is the signal that swamps the graph as N grows —
`measure-scale.js` is structurally blind to it, so this log line and
`measure-claims`' `crew %` are the only places it is visible.

---

## Stage 5 — validate + measure (~10 s)

```bash
node pipeline/validate-corpus.js static/corpus.json
node pipeline/measure-claims.js > /tmp/atlas-after-claims.txt; cat /tmp/atlas-after-claims.txt
node pipeline/measure-maps.js   > /tmp/atlas-after-maps.txt;   cat /tmp/atlas-after-maps.txt
node pipeline/measure-scale.js --cohort pipeline/cohort-pre-growth.txt --pairs 400000
```

**Run `measure-claims.js` before `measure-maps.js`, and never chain them with
`&&`.** `measure-maps.js` calls `process.exit(1)` and is expected to fire.
`measure-claims.js` is the only tool that can see a keyword collapse —
`validate-corpus.js` cannot: with keywords stripped, films, edges, components,
orphans and single-edge counts are all effectively unchanged.

**Expected:**

- `validate-corpus` — schema OK, **one component**, ≤3 orphans.
- `measure-claims` — `crew ~55–58%`, `TRIVIA ~15%` (down from 20.9%),
  `AUTHORED ~13%` (the authored layer is unchanged in size against three times
  the corpus), `REPEATED ~11%`.
- `measure-maps` — **FAIL, exit 1**, on `interpretive edges ~10%` (target 15%)
  and `single dominant type ~75%` (target 72%). This is the honest reading of
  the growth: 1,400 new films arrive with no authored readings, so the
  interpretive share falls even though nothing got worse. It is a scheduling
  problem for the next reading pass, not a reason to stop.
- `measure-scale` — drift ratios within ~1.2× of the `keyword` control. The
  `--cohort` flag is required: without it the "N=803" rung is a hash-selected
  803 films rather than today's 803, and the comparison is meaningless.

The number that would mean real damage is `REPEATED` climbing well past ~11%
with `crew` past ~60%: that is the graph turning into filmography browsing.
Read the sampled map lines, not just the percentage — a metric improving while
the thing it measures gets worse is a failure this project has already had.

---

## Stage 6 — build (~20 s)

```bash
node app/build.js --out ../public/atlas.html
ls -l ../public/atlas.html            # expect ~7.1 MB raw / ~1.0 MB gzip
npm --prefix .. test                  # green — the corpus assertions are derived now
```

`tests/rendered-html.test.mjs` re-derives every count from `static/corpus.json`
rather than hardcoding 803/7759/6893/15/851, so it survives the growth. It still
bites: it fails if the build drops a film, renames a key, swaps a film under a
key, loses an evidence tier, or embeds fewer edges than the corpus holds — all
six mutations were tested against it.

If it goes red on `below the floor of …`, the corpus itself shrank; that is a
real failure, not a stale constant.

Then open the artifact in a real browser and look at it. jsdom mounts and
evaluates but does no layout and no paint — two handoffs passed it while
rendering a black screen. Append `?v=N` to defeat the cache.

---

## Rollback

Nothing before stage 4 is destructive: harvest, enrich and palette all write
only under `pipeline/out/` and their caches.

```bash
git checkout -- atlas/static/corpus.json          # undo merge-corpus
cp /tmp/atlas-enrich-803.json  atlas/pipeline/out/enrich.json
cp /tmp/atlas-harvest-803.json atlas/pipeline/out/harvest.json
```

`static/readings.json` is never written by the pipeline.

## After a successful run

`.cache/`, `.cache-sparql/`, `.cache-expand/`, `.cache-enrich/` and
`.cache-posters/` are all gitignored — the last two hold roughly 190 MB of
poster bytes plus tens of thousands of small JSON files, and `git status` stays
readable. `pipeline/seeds-all.txt` is **not** ignored and should be committed:
it is the record of exactly what this harvest was asked for, and the file order
inside it is what kept every existing key on its own film.
