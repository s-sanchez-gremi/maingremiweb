# Forms v2 plan: closing the gap with Fillout

Apex already has its own form builder (phase 5 in `CLAUDE.md`): 11 field types, conditional logic, multi-step pages, validation in browser and server, CA/ES/EN, CRM or project destinations, spam defences, staff and respondent emails, per-form reporting, CSV export, link and embed sharing. This plan covers only what Fillout offers and Apex does not yet. Form code is Sam's area; anything touching `components/site/form/` needs Joan Marc's review too.

## Wave 1: day-to-day use
1. **Duplicate form and starter templates** (contact, event registration, course enrolment, job-seeker intake). **Done:** `apps/forms/lib/form-templates.ts` (plain data, validated by the same code as a hand-built form, fully CA/ES/EN) and `lib/forms-copy.ts`; the list has a template picker and a *Duplica* button per row, the editor has *Duplica el formulari*. A copy is closed, has a free slug, keeps the destination and settings and never copies responses.
2. **Richer field types.** Each is one entry in `packages/forms/src/fieldTypes.ts`, a check in `validate.ts` and an input in `components/site/form/Inputs.tsx`: rating/scale, yes/no, URL, address (reusing province and company fields), heading and paragraph blocks (display only), on-screen signature (see open decisions).
3. **More conditional logic.** Today: one earlier answer, equals / not equals. Add and/or combinations, "contains", "is empty" and **skip-to-page** branching. Still only earlier fields, checked on save.
4. **Respondent experience.** Progress bar; save and resume by link; custom thank-you message or redirect per form; close on a date or after N responses; edit a submitted response through a private link.

## Wave 2: automation (instead of Zapier)
5. **Webhooks per form.** POST the answers after submission, signed payload, retries and a log, reusing the `outbox` retry pattern.
6. **More destinations.** Create an event attendance row, a company or person record, or a case (labour, training), reusing the records engine.
7. **Calculated fields** (hidden score or total). Already listed as "later" in `CLAUDE.md`.
8. **Prefill from the URL** (`?name=…&company=…`), whitelisted per field.

## Wave 3: insight
9. **Response analytics:** drop-off per field, time to complete, charts per choice field (reuse the workspace chart view).
10. **Response views:** a form's answers as a workspace table, board or chart.
11. **XLSX export**, only if CSV proves insufficient for staff.

## Wave 4: only on a concrete need
Payments (test mode first), signed document flow, per-form theming limited to brand tokens, team comments on responses.

## Open decisions
- **Signatures and payments:** excluded from v1 by `CLAUDE.md`. Needed for Agremia't or course enrolment? If yes, separate wave-4 items with a legal check first.
- **Automations:** webhooks plus more destinations (recommended), or a general "when X, do Y" rules engine (against the simplicity priority)?

## Delivery rules
- One branch and PR per numbered item, from the latest `main`; CI green before merge; squash-merge.
- Tests: unit test per field type and logic rule; pipeline test and Playwright test per submission feature.
- Migrations additive; every new table gets a line in `db/grants.sql` (likely `form_webhooks`, `form_drafts`).
- Notices for Joan Marc go in `docs/team-sync.md`; `CLAUDE.md` phase 5 section is updated as items land.
- Order: waves 1 and 2 first, roughly 2 to 3 weeks together.
