## What and why
<!-- One or two sentences: what changes, and the reason. -->

## How to check it
<!-- How a reviewer can see it working (screens, commands). -->

## Checklist
- [ ] `pnpm verify:fast` passes locally (CI also runs the full set)
- [ ] New/changed behaviour has a test
- [ ] Database change? New migration file with the NEXT free number, never an edited old one, and **additive**: it must work with the previous version of BOTH apps (the apps deploy independently; drop/rename in a later release)
- [ ] New cookie/tracker added to `lib/consent/registry.ts` first
- [ ] Docs updated if behaviour changed (`CLAUDE.md`, `docs/guia-editor.md`, `DEPLOY.md`)
