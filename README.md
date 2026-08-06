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

## Publishing

Two targets, and they are not equivalent.

**Cloudflare / Sites** is the native one. `worker/index.ts` serves the artifact
at the root, substitutes the origin per request, and sets the security headers
(CSP, referrer policy, nosniff, permissions policy). Its CSP allows
`img-src 'self' data: https:`, so posters load.

**GitHub Pages** is a static host, so `.github/workflows/pages.yml` skips the
worker layer entirely and publishes only the built artifact. That is the whole
app — the worker adds hardening, not rendering. Two real differences:

- Nothing rewrites `__ATLAS_ORIGIN__` per request, so the workflow bakes it in
  with `node atlas/app/build.js --out … --origin <url>`. Without that flag the
  placeholder ships verbatim into the canonical and OpenGraph tags.
- Pages cannot set response headers, so there is **no CSP**. The app issues no
  network request except for poster images, so this costs hardening rather than
  function — but it is a genuine downgrade from the Cloudflare deployment.

The workflow rebuilds from `atlas/static/corpus.json` on every push to `main`
and validates the corpus first, so a published site can neither drift from the
committed corpus nor ship one that fails validation. The built file is never
committed, matching the existing `/public/atlas.html` ignore rule.

Enable once, under Settings → Pages → Source → GitHub Actions.

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
