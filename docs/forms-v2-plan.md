# Forms v2 plan: closing the gap with Fillout

Apex already has its own form builder (phase 5 in `CLAUDE.md`): 11 field types, conditional logic, multi-step pages, validation in browser and server, CA/ES/EN, CRM or project destinations, spam defences, staff and respondent emails, per-form reporting, CSV export, link and embed sharing. This plan covers only what Fillout offers and Apex does not yet. Form code is Sam's area; anything touching `components/site/form/` needs Joan Marc's review too.

## Wave 1: day-to-day use
1. **Duplicate form and starter templates** (contact, event registration, course enrolment, job-seeker intake). **Done:** `apps/forms/lib/form-templates.ts` (plain data, validated by the same code as a hand-built form, fully CA/ES/EN) and `lib/forms-copy.ts`; the list has a template picker and a *Duplica* button per row, the editor has *Duplica el formulari*. A copy is closed, has a free slug, keeps the destination and settings and never copies responses.
2. **Richer field types.** Each is one entry in `packages/forms/src/fieldTypes.ts`, a check in `validate.ts` and an input in `components/Inputs.tsx`. **Done:** rating (1 to 5 or 1 to 10, optional end labels), yes/no, web address, address (street, postal code, city), heading and paragraph blocks (display only, can be conditional). **Not done:** on-screen signature (open decision below) and reusing the province list for addresses (a free city field was enough; revisit if staff need to filter by province).
3. **More conditional logic.** **Done:** operators *és igual a*, *no és igual a*, *conté el text* (ignores case and accents, text-like fields only), *està buit* and *no està buit*; up to five extra conditions per field or step combined with *totes* or *una qualsevol*; and **skip-to-page** as conditional steps: a page break can carry the same conditions, and when they do not hold the whole step is skipped (not counted in "Pas x de y", its required fields are not enforced, its answers are never stored). Conditions can still only depend on earlier answerable fields, all checked when the form is saved. Saved forms need no migration: the first condition keeps its old keys.
4. **Respondent experience**, in small PRs. **4a done (migration 0021):** progress bar on multi-step forms; redirect to a page after submitting (the custom thank-you message already existed: *confirmation*); close on a date (typed in Catalonia's time) or after N responses. **4b done (migration 0022):** save and resume by link: opt-in per form, a private link (also by email), text answers only, kept 30 days, deleted when the form is sent. **4c done (migration 0023):** edit a submitted response through a private link (opt-in per form, 30 days, the contact's email locked, files kept, the first version preserved, staff told what changed). **Wave 1 is complete.**

## Wave 2: automation (instead of Zapier)
5. **Webhooks per form.** **Done (migration 0024):** up to 5 endpoints per form; `response.created` and `response.updated` (with what changed) are POSTed as signed JSON, retried with backoff for about two days, and logged on the form's *Integracions* page with a test button and manual retry. Built on the outbox pattern; SSRF-hardened (see `CLAUDE.md`).
6. **More destinations.** **Done (migration 0025):** destination *Crear registres al CRM*: a person, an event registration, a labour case, a training request or a job-board candidate. Built as the **queue** option of the forms-app plan (decision B), not as more write permissions for the Forms app: the Forms app stores the response with `routing_status = pending`, the CRM app's scheduler creates the records through its own records engine.
7. **Calculated fields** (hidden score or total). **Done (no migration):** field type `calculated`: sum / average / smallest / largest of earlier questions with optional weights, a fixed number and decimals; options of drop-downs and multiple choices can carry points. Deliberately not a formula language.
8. **Prefill from the URL** (`?name=…&company=…`), whitelisted per field. **Done (no migration):** a field gets an optional link name (`prefill`); the browser fills it from the address (`packages/forms/src/prefill.ts`).

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
