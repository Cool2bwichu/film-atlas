# ATLAS — Sites edition

ATLAS is a map of cinematic lineage. Name a film and it draws what that film
descends from, argues with and quietly rhymes with, with a specific claim on
every connection.

This is an independent Codex/Sites project transposed from the Claude handoff.
The source project remains unchanged. The active Atlas experience is still the
small, deterministic vanilla application in `atlas/app/template.html`; the
Sites layer builds that artifact, serves it directly at the root, and supplies
hosting, security headers and publication metadata.

## Work on the site

```bash
npm run dev
npm run lint
npm test
```

`npm run build:atlas` regenerates `public/atlas.html` from the committed corpus.
The complete Sites build runs that step automatically.

## Source map

- `atlas/AGENTS.md` — settled product and engine rules.
- `atlas/DESIGN.md` — the darkroom visual language and motion grammar.
- `atlas/app/` — the active browser experience and deterministic builder.
- `atlas/static/corpus.json` — the baked 803-film corpus.
- `atlas/pipeline/` — the offline association and corpus-quality tools.
- `worker/index.ts` — direct root delivery and production security headers.

## Publication boundary

The current poster corpus contains a large non-free Wikipedia fair-use set.
Private review deployments are appropriate; do not represent a public or
commercial release as rights-cleared until the poster and attribution strategy
has been resolved.
