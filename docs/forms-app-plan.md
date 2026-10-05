# Plan: Forms as its own app (`apps/forms`), the Fillout replacement

Status: **approved 2026-10-05 (decisions in section 8); F1 next.** Follows the same procedure as `docs/split-plan.md` (web / crm). Feature backlog: `docs/forms-v2-plan.md`. Owner: Sam. Needs a read from Joan Marc (it touches the public form pages and Caddy).

## 1. Goal
Forms (builder, responses, submission pipeline, and the new Fillout-like features) live in a **third app, `apps/forms`**, in the same repository and the same Postgres database, so that new forms work cannot break the public website, the CMS admin or the CRM/workspace, and vice versa. Same three guarantees as the first split:
1. **Code boundary:** `apps/forms` never imports `apps/web` or `apps/crm` (and they never import it); shared code is a package. `scripts/check-boundaries.sh` is extended.
2. **Data boundary:** its own database user `apex_forms` that can only write the forms tables, plus the narrow exceptions in section 4.
3. **Release boundary:** own build target, service, health check, tag (`APEX_TAG_FORMS`) and rollback. Migrations stay additive.

## 2. Decisions taken in this proposal (change them in review)
- **Own host and login:** `forms.<domain>` (staff builder, restricted to the office/VPN like the CRM) and its own session cookie `apex_forms_session`; same `users` table. Cost: a third login for staff who use it.
- **Respondent URLs do not change.** `/{locale}/form/{slug}`, `/embed/{locale}/form/{slug}` and `/api/forms/*` keep working on the public domain: Caddy routes `/api/forms/*` (and the standalone/embed pages) to the forms app. Forms placed inside website pages are still drawn by `apps/web` through `packages/forms`, reading `forms` read-only, exactly as today (no iframe, no CORS, CSP unchanged).
- **What moves out of the CRM:** builder, responses screens, the submit/challenge/start API, `lib/forms/*` glue, their tests. **What stays in the CRM:** contacts, leads, notes, clients, projects, erasure.
- **Public site and CMS admin stay untouched** except that the forms menu entry links to the forms app, like the CRM link today.

## 3. Target layout
```
apps/
  web/    public site, form drawing inside pages, CMS admin          (Joan Marc)
  crm/    CRM, workspace, projects, portal, ERP                      (Sam)
  forms/  builder, responses, submit API, standalone + embed pages,
          analytics, webhooks, own login, tick, health               (Sam)
packages/forms/   field types, validation, renderer, destinations (adapters)
```

## 4. The one real design question: how does a submission reach the CRM?
Today one transaction writes the submission, upserts the contact, creates the lead and the opt-in. A forms app writing CRM tables is the only way the boundary could blur. Two options:
- **A. Narrow grant exception (recommended first step, no behaviour change).** `apex_forms` may INSERT/UPDATE only `contacts`, `leads`, `newsletter_optins` (and `submissions`/`form_*` which it owns). The adapter code lives in `packages/forms/destinations/*`, one file per destination, so the CRM's rules are in one place. Same transaction, same behaviour, boundary drill extended.
- **B. Queue (cleanest, later).** The forms app only stores the submission with `routed_at = null`; the CRM's tick reads new submissions (read-only grant) and creates contact + lead. Forms app never writes a CRM table and keeps accepting submissions during a CRM outage; the cost is that leads appear up to a minute later and failures need a visible "not routed" state.
Start with A; B is a follow-up if the exception proves uncomfortable.

Table ownership after the move: **forms app** = `forms`, `form_starts`, `submissions`, new `form_webhooks`, `form_drafts`, `form_templates` (all under `db/grants.sql`); **CRM** = contacts, leads and the rest; **shared** unchanged (`users`, `sessions`, `outbox`, `heartbeats`, `error_log`). The web app keeps reading `forms`.

## 5. Steps (each its own PR, each passing `pnpm verify`)
- **F0. Preconditions.** Merge or park open work touching `apps/crm/lib/forms*`; agree with Joan Marc a short freeze on `packages/forms`, `proxy.ts` forms forwarding and `deploy/Caddyfile`.
- **F1. Scaffold `apps/forms`** (about 0.5 day): Next app, port 3002, own login and cookie, layout using `@apex/ui` tokens, `/api/health`, `/api/cron/tick`, robots disallow all, `pnpm dev` starts three apps, e2e runner gets a third port and `apex_forms` role. Empty but green in CI.
- **F2. Move forms from the CRM (about 1 day, `git mv` to keep history):** builder, responses, CSV export, submit/challenge/start API, pipeline glue, tests. CRM and web menus link across (`FORMS_URL`, `WEB_ADMIN_URL`/`CRM_URL`). The CRM stops calling it. The cache refresh call (`WEB_INTERNAL_URL`) moves with it. Option A destinations extracted to `packages/forms/destinations`.
- **F3. Deploy and edge (about 0.5 day):** Dockerfile `start-forms`, compose service `forms`, `deploy.sh [all|web|crm|forms]` with per-app rollback, Caddy: `FORMS_DOMAIN` locked to `ADMIN_ALLOWED_IPS`, public `/api/forms/*` and the standalone/embed pages open; extend `scripts/caddy-drill.sh` and `deploy-drill.sh`.
- **F4. Database user and boundary tests (about 0.5 day):** `apex_forms` in `db/grants.sql`, `boundary-drill.sh` proves allowed and refused writes, `check-boundaries.sh` and its self-test cover the new app.
- **F5. Docs and ownership:** `CLAUDE.md` (new section), `CODEOWNERS`, `CONTRIBUTING.md`, `DEPLOY.md`, notice in `docs/team-sync.md` for Joan Marc (new env vars, new host, move of `/api/forms/*`), editor guide addresses.
- **Then** the features of `docs/forms-v2-plan.md`, wave by wave, inside `apps/forms` only.
Rough total for the move: **2.5 to 3 working days.**

## 6. Costs and risks
- A third process (about +150 to 250 MB RAM; check server size), a third build and health check, a third login.
- Public submissions now depend on the forms app instead of the CRM app: same availability story as today (website still loads, submissions fail clearly until it returns); the CRM no longer matters to visitors.
- The shared form renderer in `packages/forms` is used by two apps; any change needs Joan Marc's review.
- Migrations must stay backward compatible so each app can be one version behind.
- Option A leaves a small write exception into CRM tables; it is documented, granted narrowly and tested.

## 7. Not changing
Public URLs, the data model of submissions, consent and spam behaviour, the CMS and workspace experience.

## 8. Decisions (2026-10-05, Sam)
1. Routing to the CRM: **option A** (narrow grant exception); B stays a possible follow-up.
2. Host: **`forms.<domain>`**, staff side restricted like the CRM.
3. A **separate staff login** for the forms app is accepted.
