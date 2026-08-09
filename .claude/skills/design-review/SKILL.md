---
name: design-review
description: Run the standing ATLAS design review — walk the whole site as a first-time visitor, judge every surface against DESIGN.md and the owner's stated direction, and report what is wrong ranked by how much it matters. Use when asked to review the design, judge the experience, or run the design review.
---

# The standing design review

This is a judgement pass, not a build pass. The reviewer walks the site the way
a first-time visitor would, forms opinions, verifies them with measurements
where they are checkable, and reports — ranked by how much each finding
matters, not by how easy it is to fix.

## Who the reviewer is

The atlas-design agent, with taste authority. Its best work has been refusals —
it killed a damaged-print effect because "putting a charming nostalgia filter
on Come and See is the one tonal mistake this project cannot afford", and it
was right. The review should be written in that voice: opinionated, specific,
and willing to say a shipped thing is wrong.

## What it judges

1. **The first thirty seconds.** Open the built artifact cold. What does a
   visitor see, what do they understand, what would they click? The owner's
   test: "the constellations are the attractor, and the insights are why they
   stay." Is the attractor attracting? Are the insights reachable before
   attention runs out?
2. **The owner's direction, verbatim.** A world that belongs to the user.
   Dynamic, fluid, something never seen before. Films they love and films
   they're going to love. Judge the current build against those sentences, not
   against what was easy to ship.
3. **Every surface in turn**: the wall, a film's map, the constellation, a
   world (pick two — one treated, one authored), Passage, the query sky if it
   has landed. For each: does it teach something, or perform something?
4. **Coherence.** 28 worlds, six processes, three honesty tiers, five edge
   colours — does it still read as ONE object? The risk at this pace is not
   ugliness, it is accretion.
5. **The rules, spot-checked.** Rule 1 (nothing encodes popularity), rule 4
   (captions never blur), rule 8 (authored colour says it is authored). Pick
   three places each rule could fail and look.

## How it works

- Real Chromium only, via `.claude/skills/run-film-atlas/` — `driver.mjs smoke`
  first to confirm the build stands, then `shot` and `repl` to walk surfaces,
  `film` where motion is the question. jsdom has passed a black screen here
  twice; it is banned.
- Three viewports minimum: 1440x900, 900x820, 390x780.
- Opinions are welcome; checkable claims must be checked. "The rim feels
  crowded" is a finding. "Contrast fails on the fold row" needs the measured
  ratio.
- **No fixes during the review.** Findings only. Fixes happen afterwards, on
  the owner's priorities, by whoever owns the file.

## The report

Ranked findings, each with: what is wrong, where, how it was verified, and how
much it matters (breaks the experience / dulls it / polish). At the end, the
three things the reviewer would fix first, and one paragraph on whether the
site is becoming more or less itself.

Deliver as `atlas/reviews/YYYY-MM-DD.md`, committed. The history of these
reviews is itself a record of what the project thought mattered.
