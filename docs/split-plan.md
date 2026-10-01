# Plan: split the app into "website + CMS" and "CRM + internal tools"

Status: **approved in principle, not started.** Owner: Sam. Needs a read from Joan Marc (it moves shared code), then a short freeze (section 8).

## 1. Goal
Two apps in the **same repository and the same Postgres database**, so that a mistake, a bad release or an outage in one area cannot break the other:
- **`apps/web`** (Joan Marc): the public site (including the *rendering* of forms inside pages), the public search endpoint, and the CMS admin (content, media, categories, settings, users, errors).
- **`apps/crm`** (Sam): CRM (contacts, leads), **forms (builder, responses, and the public submission pipeline)**, clients, projects, tasks, the ERP registry and the client portal.
- **`packages/*`**: the code both need (database, auth core, storage, mail/outbox, money, search helpers, UI tokens).

"Nothing breaks the other" is enforced three ways, not by good intentions:
1. **Code boundary:** an app cannot import the other app (lint rule + separate packages).
2. **Data boundary:** each app connects with its **own database user** that may only write its own tables (section 5). A bug in the CRM literally cannot overwrite a page.
3. **Release boundary:** each app builds, deploys, health-checks and rolls back on its own. Migrations are **additive** (section 7), so either app can be one version behind the other.

## 2. Decisions already taken
- **Separate logins:** each app has its own login page and its own session cookie; the same user accounts and passwords (same `users` table), so no cookie from one ever reaches the other host.
- **Addresses:** `<domain>` serves `apps/web` (its `/admin` stays restricted to the office/VPN); `crm.<domain>` serves `apps/crm`, restricted to the office/VPN **except `/portal*`**, which stays open so clients can log in from anywhere.
- **Forms move to the CRM app (decision after the first draft):** the form builder, the responses screens and the **public submission API** (`/api/forms/*`: challenge, submit, "started") belong to Sam's app, together with their tables (`forms`, `form_starts`, `newsletter_optins`). **Rendering** stays on the website: pages and the standalone form/embed pages are drawn by `apps/web` with a shared `packages/forms` (field types, validation, the form component and its bot-check client), reading the form definition read-only. On the public domain Caddy sends `/api/forms/*` to the CRM app, so the browser still posts to the same address (no cross-site requests, no CORS, CSP unchanged).
- **Order:** merge the open ERP PR first, agree a short freeze, then split in small PRs, each passing the full CI.

## 3. Target layout
```
apps/
  web/   public site + form rendering, search, CMS admin, its own login, tick (publish scheduled, purge)
  crm/   CRM, forms (builder, responses, submit API), clients, projects, tasks, ERP, client portal, its own login, dashboard, global search, tick
packages/
  db/    schema (core / website / crm / erp files), client, migration runner, SQL migrations
  forms/ field-type registry, validation, the public form component + bot-check client (rendered by web, used by crm for the builder preview)
  core/  staff auth (configurable cookie name), permissions, storage, mail + outbox, money, search helpers, env helpers
  ui/    tokens.css, admin base styles, shared admin components (ListSearch, ConfirmButton, EntryForm pieces…)
deploy/  one Dockerfile, build arg APP=web|crm, one compose with both services
```

## 4. Who owns what (tables and code)
| Area | Tables (write) | Code |
|---|---|---|
| **core (shared)** | `users`, `sessions`, `outbox`, `heartbeats`, `error_log` (each app records its own errors there) | `packages/core`, `packages/db` |
| **web** | `entries`, `entry_translations`, `entry_versions`, `categories`, `media`, `settings` | `apps/web` |
| **crm** | `forms`, `form_starts`, `newsletter_optins`, `contacts`, `leads`, `lead_notes`, `submissions`, `clients`, `projects`, `tasks`, `project_documents`, `portal_*`, and all ERP tables | `apps/crm`, `packages/forms` |

**The contract between the two areas is now very small**, because the whole lead pipeline (form definition, bot check, rate limit, contact + submission + lead, notification emails) lives in one app:
- **web only READS `forms`** (to draw a form inside a page, or on the standalone and embed pages; the staff notification addresses are stripped before anything reaches the browser). It **never writes a CRM table** and does not need `clients` or `projects` at all.
- **crm only READS `users`** (staff accounts) and the shared `outbox`/`sessions`; it **never writes a website table**.
- **Shared by both:** `users`, `sessions` (each app uses its own cookie name), `outbox` (both enqueue, either may send), `heartbeats` and `error_log` (each app records under its own name).
- Anything new that crosses is added here in the same pull request.

## 5. Database users (least privilege)
`apex_migrate` (owner, runs migrations only), `apex_web`, `apex_crm`, defined in `packages/db/grants.sql` and applied after migrations. Grants follow the table above (SELECT where a read is allowed, INSERT/UPDATE/DELETE only on the app's own tables, plus the pipeline exceptions). A **boundary test** (runs in CI against a throwaway database, using the real users) proves e.g. that `apex_crm` cannot update `entry_translations` and `apex_web` cannot update `leads` notes or any ERP table. Local development keeps one all-powerful user for convenience; staging and the CI drills use the restricted ones. ⚠ To verify on IONOS Managed PostgreSQL: creating roles and grants.

## 6. How the pieces behave
- **Cron/tick:** each app has its own `/api/cron/tick`. `web` publishes due content and purges old data; both may send the outbox (rows are claimed with `SKIP LOCKED`, so nothing is sent twice) so each app stays independent of the other's uptime. Heartbeat and deep health check exist per app; the uptime monitor watches both.
- **Lead capture availability (new, important):** a visitor's form is drawn by the website but submitted to the CRM app. If the CRM app is down, the website still loads but **submissions fail** until it is back. Mitigations: the form page shows a clear "try again / write to us at <email>" message, the CRM app has its own health check, uptime monitor and automatic rollback, and the CRM app runs at least as reliably as the site (same server, restart policy). A later option is a tiny write-ahead queue in the website.
- **Cache:** only the website has cached public pages and tag invalidation; the CRM never touches it, so there is no cross-app revalidation to build.
- **Files:** the private bucket is shared; key prefixes stay per area (`submissions/…`, `projects/…`, `erp/…`).
- **Erasure:** stays a CRM tool (it touches contacts, leads, notes, submissions, files, clients); it only deletes through the same tables it owns plus the pipeline's.
- **Staff users screen:** stays in the CMS admin (web); the CRM only reads users.
- **Dashboard, menu and global search:** each app gets its own (the current shared ones are split in step S2).

## 7. Releases without breaking each other
- One image build per app from one Dockerfile (`APP=web|crm`); compose runs `web`, `crm` and Caddy; `deploy.sh` deploys both by default or one (`--only crm`), waits for each health check and rolls back only the app that failed.
- **Migrations run once per release, before either app starts, and must be backward compatible with the previous version of both apps** (add columns/tables, never drop or rename in the same release; remove in a later release once nothing uses it). This is what lets the two apps ship independently. `CONTRIBUTING.md` gets this rule and the PR template a checkbox.
- CI keeps one workflow with two build/test targets; later path filters can skip an app's e2e when only the other changed.
- Caddy: `<domain>` → web, **except `/api/forms/*` → crm** (open to everyone, same address for the browser); `crm.<domain>` → crm, with the allow-list rule from `deploy/Caddyfile` and `/portal*` exempt. Staging mirrors this (`staging-crm.<domain>`), `scripts/caddy-drill.sh` is extended to prove both rules.

## 8. Steps (each its own pull request, each passing the full `pnpm verify`)
- **S0. Preconditions.** Merge the ERP backbone PR. Agree the **freeze** with Joan Marc: during S1-S2 (about two working days) he avoids large moves or renames of shared files (`lib/*` shared parts, `components/admin/*`, `db/*`); work inside `app/(site)`, `components/site`, `sections` and the CMS screens is fine.
- **S1. Extract shared packages, no behaviour change (about 1 day).** Create `packages/db`, `packages/core`, `packages/ui`, `packages/forms` (field types, validation, form component, bot-check client); point `apps/web` at them. Still one app, same tests, same deploy.
- **S2. Create `apps/crm` and move the CRM/internal code (about 1-1.5 days).** `git mv` (history kept): leads, **forms (builder, responses, submit/challenge API, pipeline)**, clients, projects, tasks, erp, portal screens, their `lib/*` files, their unit and e2e tests; the CRM gets its own layout, login, menu, dashboard, search, tick and health. `apps/web` loses those routes and its menu entries. `pnpm dev` starts both (ports 3000 and 3001).
- **S3. Build, deploy and edge (about 1 day).** Dockerfile `APP` arg, compose, `deploy.sh`, Caddy hosts, drills and CI for both apps, `docker-compose` for local.
- **S4. Database users and boundary tests (about 0.5 day).** `grants.sql`, the boundary test, staging drill using the restricted users, import-boundary lint rule.
- **S5. Docs and ownership.** `CLAUDE.md`, `CONTRIBUTING.md`, `CODEOWNERS` paths, the editor guide's addresses, the IONOS runbook (second host, roles).
Rough total: **4-5 working days** (forms add about half a day).

## 9. Costs and risks (so the trade-off is clear)
- **More moving parts:** two processes/images instead of one (roughly +250-400 MB RAM; check the server size), two builds, two health checks, two logins for staff who use both. This is the price of isolation and goes against the "simplest possible" priority, accepted on purpose for two developers and two areas.
- **Forms are split across two apps:** the builder, responses and submit API are in the CRM, the drawing of forms is in the website. The field-type registry and validation live in `packages/forms` so the two can never disagree about what a field is. Adding a field type = one entry there, plus its input.
- **Duplication risk:** shared admin shell and components must live in `packages/ui` or they will drift; anything shared is a package, never copy-pasted.
- **Tests:** two e2e suites on one database can collide; each app's e2e uses its own database name.
- **Migration discipline:** the backward-compatible rule (section 7) must be followed or an independent deploy could break the other app.
- **Rollback:** a release that needs both apps changed together (rare) is deployed as a pair; `deploy.sh` supports that.

## 10. Not changing
URLs of the public site, the CMS and the public form addresses (`/ca/form/…`, `/embed/…`, `/api/forms/…`), the data model, the content model, the editor experience, the consent and security behaviour. The client portal keeps its own accounts and its own `/portal` path (now served by the CRM app).
