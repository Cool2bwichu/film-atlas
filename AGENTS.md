# ATLAS Sites operating contract

Read `atlas/AGENTS.md` and `atlas/DESIGN.md` before changing the Atlas runtime.
Their settled relationship grammar, evidence distinctions, rack-focus design,
palette behavior and deterministic corpus rules remain binding.

## Architecture

- `atlas/app/template.html` is the active experience.
- `atlas/app/build.js` validates and embeds `atlas/static/corpus.json` into the
  generated `public/atlas.html` artifact.
- `worker/index.ts` serves that artifact directly at `/`; do not replace it
  with an iframe or redirect unless a measured limitation requires it.
- `artifact/`, `local/` and `scripts/` from the Claude handoff were obsolete and
  were intentionally not migrated.

## Delivery

- Preserve the original Claude project. This repository is the independent
  Codex/Sites copy.
- Run `npm run lint` and `npm test` before saving or deploying a version.
- Validate the active vanilla experience in a real browser at desktop, compact
  and mobile sizes. The historical React harness is not authoritative.
- Publish private checkpoints first. Public/commercial publication requires a
  deliberate rights decision for the poster corpus.
- Keep Sites metadata in `.openai/hosting.json`; never put runtime credentials
  or API keys in source.
- A GitHub Pages target exists alongside the worker
  (`.github/workflows/pages.yml`). It publishes the same built artifact with no
  worker in front of it, which means no CSP and no per-request origin
  substitution — the workflow passes `--origin` at build time instead. Treat
  the two targets as different deployments of one artifact, not as a fallback
  pair: a change to `worker/index.ts` headers does not reach Pages, and a
  change to the template's meta tags must keep working under both.
