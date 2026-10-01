# Plan: split the app into "website + CMS" and "CRM + internal tools"

Status: **approved in principle, not started.** Owner: Sam. Needs a read from Joan Marc (it moves shared code), then a short freeze (section 8).

## 1. Goal
Two apps in the **same repository and the same Postgres database**, so that a mistake, a bad release or an outage in one area cannot break the other:
- **`apps/web`** (Joan Marc): the public site, the public form/search endpoints, and the CMS admin (content, media, categories, settings, forms builder, users, errors).
- **`apps/crm`** (Sam): CRM (contacts, leads), clients, projects, tasks, the ERP registry and the client portal.
- **`packages/*`**: the code both need (database, auth core, storage, mail/outbox, money, search helpers, UI tokens).

"Nothing breaks the other" is enforced three ways, not by good intentions:
1. **Code boundary:** an app cannot import the other app (lint rule + separate packages).
2. **Data boundary:** each app connects with its **own database user** that may only write its own tables (section 5). A bug in the CRM literally cannot overwrite a page.
3. **Release boundary:** each app builds, deploys, health-checks and rolls back on its own. Migrations are **additive** (section 7), so either app can be one version behind the other.

## 2. Decisions already taken
- **Separate logins:** each app has its own login page and its own session cookie; the same user accounts and passwords (same `users` table), so no cookie from one ever reaches the other host.
- **Addresses:** `<domain>` serves `apps/web` (its `/admin` stays restricted to the office/VPN); `crm.<domain>` serves `apps/crm`, restricted to the office/VPN **except `/portal*`**, which stays open so clients can log in from anywhere.
- **Order:** merge the open ERP PR first, agree a short freeze, then split in small PRs, each passing the full CI.

## 3. Target layout
```
apps/
  web/   public site, public API (forms submit, search), CMS admin, its own login, tick (publish scheduled, purge)
  crm/   CRM, clients, projects, tasks, ERP, client portal, its own login, dashboard, global search, tick
packages/
  db/    schema (core / website / crm / erp files), client, migration runner, SQL migrations
  core/  staff auth (configurable cookie name), permissions, storage, mail + outbox, money, search helpers, env helpers
  ui/    tokens.css, admin base styles, shared admin components (ListSearch, ConfirmButton, EntryForm pieces…)
deploy/  one Dockerfile, build arg APP=web|crm, one compose with both services
```

## 4. Who owns what (tables and code)
| Area | Tables (write) | Code |
|---|---|---|
| **core (shared)** | `users`, `sessions`, `outbox`, `heartbeats` | `packages/core`, `packages/db` |
| **web** | `entries`, `entry_translations`, `entry_versions`, `categories`, `media`, `forms`, `form_starts`, `newsletter_optins`, `settings`, `error_log` | `apps/web` |
| **crm** | `contacts`, `leads`, `lead_notes`, `submissions`\*, `clients`, `projects`, `tasks`, `project_documents`, `portal_*`, and all ERP tables | `apps/crm` |

\* **The one real crossing:** the public form pipeline (web) creates a contact, a submission and a lead the moment a visitor submits. That is the **contract between the two areas**, and it is deliberately narrow:
- **web may INSERT/UPDATE** `contacts`, `submissions`, `leads` (only the pipeline's own insert path), read `clients` and `projects` (for the form's "attach to" choice), and write `outbox`.
- **crm may read** `forms` and `users`, and read/write everything of its own, plus `outbox`.
- Nothing else crosses. Anything new that crosses is added to this table in the same pull request.

## 5. Database users (least privilege)
`apex_migrate` (owner, runs migrations only), `apex_web`, `apex_crm`, defined in `packages/db/grants.sql` and applied after migrations. Grants follow the table above (SELECT where a read is allowed, INSERT/UPDATE/DELETE only on the app's own tables, plus the pipeline exceptions). A **boundary test** (runs in CI against a throwaway database, using the real users) proves e.g. that `apex_crm` cannot update `entry_translations` and `apex_web` cannot update `leads` notes or any ERP table. Local development keeps one all-powerful user for convenience; staging and the CI drills use the restricted ones. ⚠ To verify on IONOS Managed PostgreSQL: creating roles and grants.

## 6. How the pieces behave
- **Cron/tick:** each app has its own `/api/cron/tick`. `web` publishes due content and purges old data; both may send the outbox (rows are claimed with `SKIP LOCKED`, so nothing is sent twice) so each app stays independent of the other's uptime. Heartbeat and deep health check exist per app; the uptime monitor watches both.
- **Cache:** only the website has cached public pages and tag invalidation; the CRM never touches it, so there is no cross-app revalidation to build.
- **Files:** the private bucket is shared; key prefixes stay per area (`submissions/…`, `projects/…`, `erp/…`).
- **Erasure:** stays a CRM tool (it touches contacts, leads, notes, submissions, files, clients); it only deletes through the same tables it owns plus the pipeline's.
- **Staff users screen:** stays in the CMS admin (web); the CRM only reads users.
- **Dashboard, menu and global search:** each app gets its own (the current shared ones are split in step S2).

## 7. Releases without breaking each other
- One image build per app from one Dockerfile (`APP=web|crm`); compose runs `web`, `crm` and Caddy; `deploy.sh` deploys both by default or one (`--only crm`), waits for each health check and rolls back only the app that failed.
- **Migrations run once per release, before either app starts, and must be backward compatible with the previous version of both apps** (add columns/tables, never drop or rename in the same release; remove in a later release once nothing uses it). This is what lets the two apps ship independently. `CONTRIBUTING.md` gets this rule and the PR template a checkbox.
- CI keeps one workflow with two build/test targets; later path filters can skip an app's e2e when only the other changed.
- Caddy: `<domain>` → web; `crm.<domain>` → crm, with the allow-list rule from `deploy/Caddyfile` and `/portal*` exempt. Staging mirrors this (`staging-crm.<domain>`), `scripts/caddy-drill.sh` is extended to prove both rules.

## 8. Steps (each its own pull request, each passing the full `pnpm verify`)
- **S0. Preconditions.** Merge the ERP backbone PR. Agree the **freeze** with Joan Marc: during S1-S2 (about two working days) he avoids large moves or renames of shared files (`lib/*` shared parts, `components/admin/*`, `db/*`); work inside `app/(site)`, `components/site`, `sections` and the CMS screens is fine.
- **S1. Extract shared packages, no behaviour change (about 1 day).** Create `packages/db`, `packages/core`, `packages/ui`; point `apps/web` at them. Still one app, same tests, same deploy.
- **S2. Create `apps/crm` and move the CRM/internal code (about 1-1.5 days).** `git mv` (history kept): leads, clients, projects, tasks, erp, portal screens, their `lib/*` files, their unit and e2e tests; the CRM gets its own layout, login, menu, dashboard, search, tick and health. `apps/web` loses those routes and its menu entries. `pnpm dev` starts both (ports 3000 and 3001).
- **S3. Build, deploy and edge (about 1 day).** Dockerfile `APP` arg, compose, `deploy.sh`, Caddy hosts, drills and CI for both apps, `docker-compose` for local.
- **S4. Database users and boundary tests (about 0.5 day).** `grants.sql`, the boundary test, staging drill using the restricted users, import-boundary lint rule.
- **S5. Docs and ownership.** `CLAUDE.md`, `CONTRIBUTING.md`, `CODEOWNERS` paths, the editor guide's addresses, the IONOS runbook (second host, roles).
Rough total: **4-5 working days**.

## 9. Costs and risks (so the trade-off is clear)
- **More moving parts:** two processes/images instead of one (roughly +250-400 MB RAM; check the server size), two builds, two health checks, two logins for staff who use both. This is the price of isolation and goes against the "simplest possible" priority, accepted on purpose for two developers and two areas.
- **Duplication risk:** shared admin shell and components must live in `packages/ui` or they will drift; anything shared is a package, never copy-pasted.
- **Tests:** two e2e suites on one database can collide; each app's e2e uses its own database name.
- **Migration discipline:** the backward-compatible rule (section 7) must be followed or an independent deploy could break the other app.
- **Rollback:** a release that needs both apps changed together (rare) is deployed as a pair; `deploy.sh` supports that.

## 10. Not changing
URLs of the public site and the CMS, the data model, the content model, the editor experience, the consent and security behaviour. The client portal keeps its own accounts and its own `/portal` path (now served by the CRM app).
