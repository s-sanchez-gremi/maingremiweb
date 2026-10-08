# Team sync notices (read at the start of every session)

**For Claude Code:** at the start of a session, read the section addressed to the person you are working for, do each open item (they are safe to repeat), tell the person what you did or what needs their decision, and mark the item done (date + initials) in the same pull request as your next change. Add a new notice here when you change something the other person's side must act on (a new migration, a moved table, a new rule, a changed command). Never put secrets here.

## For Joan Marc (apps/web, apps/admin) and his Claude — notice of 2026-10-07 from Sam (visual identity, foundations)

Direction A of `docs/identity-plan.md` is approved; this is its step 2. **No visible change in any app yet, no migration, no grants change.** What changed:

1. `packages/ui/src/tokens.css` has new tokens `--spot-web|admin|crm|forms|hub|sign`, `--on-spot-*` and a `[data-app="…"]` block that sets `--spot` / `--on-spot` for an app. Nothing reads `--spot` yet except the new app marks; each app switches `--accent` to it in its own rollout PR (yours: the CMS admin and the website, the latter only after client sign-off).
2. `<html data-app="admin">` was added to `apps/admin/app/admin/layout.tsx` (and the CRM and Forms roots). Keep it when you edit that file.
3. New `@apex/ui/appmark` (colours, halftone, `appIconSvg`) and `@apex/ui/components/AppMark`. Favicons `apps/{admin,crm,forms}/app/icon.svg` are generated from it; a test (`apps/web/lib/__tests__/identity.test.ts`) fails if a file is edited by hand. The website keeps its `icon.png`.
4. Do once after merging `main`: nothing to install or migrate.

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when read)

## For Joan Marc (apps/web, apps/admin) and his Claude — notice of 2026-10-07 from Sam (signatures app, step S3: sending and the signer page)

Nothing in `apps/web`, `apps/admin` or `packages/sections` changed in behaviour. Do once, after merging `main`:

1. `pnpm install` (new dependency `pdfjs-dist`, used only by `apps/sign`). No migration in this step.
2. Add `SIGN_SECRET=change-me` to your `.env` (it is in `.env.example`); only the Signatures app reads it, and only the Signatures app in staging/production needs a real value.
3. **Shared files that changed:** `packages/core/src/client-ip.ts` is new: `clientIp()` (the visitor's address behind a proxy) moved there from `packages/forms/src/http.ts`, which now re-exports it, so `@apex/forms/http` and the website's test of it are unchanged. `e2e/playwright.config.ts` gives the sign server two variables. `.env.example` has `SIGN_SECRET`.
4. The signer pages are public (`/sign/<token>` on the Signatures host); in production Caddy must leave `/sign/*` and `/_next/*` open while locking the staff screens (step S6 does this; nothing to do now).

## For Joan Marc (apps/web, apps/admin) and his Claude — notice of 2026-10-07 from Sam (migration renumbered: 0026_signatures is now 0027_signatures)

Two migrations were merged as `0026` (forms analytics, #79, and signatures, #89). The signatures one is now **`0027_signatures.sql`** (same SQL). Nothing in your apps changes. Only if your **local** database already applied `0026_signatures` (the migrator records files by name, so it would try to create the `sign_*` tables again and fail): recreate the dev database, or run once `drop table sign_consents, sign_events, sign_fields, sign_signers, sign_requests, sign_documents cascade; delete from schema_migrations where name = '0026_signatures.sql';` and then `pnpm db:migrate`. No deployed or staging database has applied it (nothing has been deployed yet).

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web, apps/admin) and his Claude — notice of 2026-10-07 from Sam (signatures app, step S2: tables, drafts)

Nothing in `apps/web`, `apps/admin` or `packages/sections` changed. Do once, after merging `main`:

1. `pnpm install` (new package `@apex/sign`, which brings `pdf-lib`) and `pnpm db:migrate` (migration 0027: six new `sign_*` tables, all additive; compatible with the previous version of every app, so apps can be released in any order). No data is touched.
2. **Shared files that changed (please look at them in the PR):** `db/grants.sql` (the new `sign_*` tables belong to `apex_sign`; its audit trail and consent tables are insert/select only), `packages/core/src/permissions.ts` (a new action `sign:write`: admin and editor, like `forms:write`; nothing else about `can()` changed), `packages/db/src/schema/index.ts` (exports the new `sign.ts`), `scripts/boundary-drill.sh`, `Dockerfile` (a `COPY` line for the new package) and `.github/CODEOWNERS`.
3. The deployed environments need nothing new beyond the role `apex_sign` of the S1 notice below.

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web, apps/admin) and his Claude — notice of 2026-10-07 from Sam (signatures app, step S1: the empty shell)

`apps/sign` now exists as an empty shell (plan: `docs/esign-plan.md`); nothing in `apps/web`, `apps/admin` or `packages/*` changed. Do once, after merging `main`:

1. `pnpm install` (the lockfile gained the new app). `pnpm dev` now also starts it on :3004 and links its `.env` itself. Add `SIGN_URL=http://localhost:3004` to your `.env` from `.env.example` (nothing uses it yet; it is for menu links later).
2. Nothing for your local database (one all-powerful user). The e2e run creates the new role `apex_sign` by itself and starts a fifth server on port 3104 (`E2E_PORT_OFFSET` still shifts every port; the build in `scripts/ci.sh` takes a bit longer).
3. **Deployed environments that use restricted database users** (`APPLY_GRANTS=1`): create the fifth role before the next release, `create role apex_sign login password '…';` (see `DEPLOY.md`), or `db/grants.sql` refuses to apply and the migration step stops the release. The Signatures app itself is not in the image's services yet (step S6), so no new host or variable is needed until then.
4. Rule for your reviews: `apps/sign` never imports another app and no app imports it (`scripts/check-boundaries.sh` covers every app under `apps/` automatically; its self-test now includes it). It reads the shared `users`, `sessions`, `outbox`, `heartbeats` and `error_log` only (`db/grants.sql`).

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web, apps/admin) and his Claude — notice of 2026-10-07 from Sam: a fifth app is planned (e-signatures)

Heads-up only, **nothing to do now and nothing in your apps changes.** We decided to build electronic signatures in-house as a separate app, `apps/sign` (plan: `docs/esign-plan.md`, merged in #74; the new section "Signatures app" in `CLAUDE.md` summarises it). It is Sam's area. What matters to you:

1. **You will be asked to review only the shared files** when the steps land: a migration + `db/grants.sql` (S2), the Dockerfile, compose, `deploy.sh`, Caddy and `scripts/*-drill.sh` (S6), `check-boundaries.sh`, CI and `CLAUDE.md`. Nothing in `apps/web`, `apps/admin` or `packages/sections`.
2. **Rules that will apply to everyone:** `apps/sign` never imports another app and no app imports it; a new database role `apex_sign` (like `apex_forms`: create the role before `APPLY_GRANTS=1` on any environment that uses restricted users; we will add a notice when S1 and S6 land); new env vars `SIGN_DOMAIN`, `SIGN_URL` and a seal certificate (`SIGN_SEAL_P12` + passphrase) in S6.
3. **Open for your opinion (section 9 of the plan):** a fourth separate staff login is accepted for the forms app; same trade-off here. Say so if you would rather share a login.
4. **Legal:** the consent wording, retention of sealed PDFs and the list of allowed documents need the client's legal adviser, the same as the privacy policy text on your side. If you already talk to them, it saves a round.

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when read)

## For Joan Marc (apps/web, apps/admin) and his Claude — notice of 2026-10-05 from Sam: the CMS admin is now its own app

`apps/web` is now only the public website. Everything under `/admin` that edits content moved to a new app, `apps/admin` (history kept with `git mv`). Do these once, in order, after the pull request "Split the CMS admin out of the website" is merged:

1. **Get current and install.** `git fetch origin && git switch main && git pull`, merge `origin/main` into your branches (merge commit, never rebase), take `main`'s `pnpm-lock.yaml`, `pnpm install --frozen-lockfile`.
2. **Update your `.env`** from `.env.example` (new lines at the end of the "apps talk to each other" block): `WEB_ADMIN_URL=http://localhost:3003`, `ADMIN_URL=http://localhost:3003`, `WEB_PREVIEW_URL=http://localhost:3000`. `pnpm dev` now starts four apps: website :3000, CRM :3001, forms :3002, CMS admin :3003 (the CMS login is **http://localhost:3003/admin**; the website no longer has one).
3. **Know where things are now:** content, media, categories, settings, users, errors, the visual builder and the scheduler are in `apps/admin` (your admin redesign, #45, merged first and now lives there too: `apps/admin/app/admin/web-admin.css`, `components/admin/AdminNav.tsx` and `icons.tsx`, `lib/admin-ui.ts`); `apps/web/app/admin` only keeps `/admin/preview/[id]` (the live preview) and `/admin/bar` (the staff bar). The page model (section registry, blocks, settings schema, reserved slugs, inline-edit helpers, preview messages) is in the package `packages/sections` (already merged in an earlier PR); shared helpers moved to `packages/core` (`media-url`, `media-share`, `staff-cookie`, `staff-hint`, `web-cache`).
4. **Rules that changed (see "Four separate apps" in `CLAUDE.md`):** the website's database user is now **read-only** on content (`apex_web`; the new `apex_admin` writes it), so website code must never write a table; after a change the admin calls the website's `/api/cron/revalidate` (`lib/cache.ts` in the admin); the website has no scheduler any more (the admin's `/api/cron/tick` publishes scheduled content). Website tests that need "live" content use `lib/__tests__/helpers.ts` (`goLive`), not `publish()`.
5. **Local database:** the e2e suite creates the role `apex_admin` itself. For your own dev database nothing changes (one all-powerful user). To try the restricted users: `create role apex_admin login password '…';` next to the other two (`DEPLOY.md`, "Database users per app").
6. **Production topology (nothing to do until the servers exist):** a third host `ADMIN_DOMAIN` (default `admin.<SITE_DOMAIN>`) needs its own DNS record; `SESSION_COOKIE_DOMAIN` must be set on web and admin so the staff session reaches the website for the bar and the preview; new compose service `admin`, new release tag `APEX_TAG_ADMIN`, `deploy.sh <tag> [all|web|admin|crm]`. All in `DEPLOY.md` and `deploy/ionos/production.env.example`.
7. **Ownership:** `.github/CODEOWNERS` lists you for `apps/admin` too.

Done: (none yet; Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web) and his Claude — notice of 2026-10-08 from Sam (forms: records as a destination, migration 0025)

Forms can now create CRM records from a response (a person, an event registration, a labour case, a training request, a job-board candidate) (`docs/forms-v2-plan.md`, item 6). **Nothing in `apps/web` changes.** Do once, after merging `main`:

1. `pnpm db:migrate` (migration 0025: a new allowed value for `forms.destination` (`records`), `forms.routing`, and routing columns on `submissions`; additive and compatible with the previous version of every app, any release order).
2. `db/grants.sql`: the CRM app may now update **only** the routing columns of `submissions` (column-level `UPDATE`), and the Forms app may read `events`. Nothing for the website.
3. The CRM app does the work, so **the CRM scheduler (`/api/cron/tick` on `CRM_DOMAIN`) must keep running every minute** (it already does for mail): without it, responses of these forms stay "Pendent".

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web) and his Claude — notice of 2026-10-08 from Sam (forms: webhooks, migration 0024)

Forms can now tell other systems about new and changed responses (`docs/forms-v2-plan.md`, item 5). **Nothing in `apps/web` changes.** Do once, after merging `main`:

1. `pnpm db:migrate` (migration 0024: two new tables, `form_webhooks` and `webhook_deliveries`; additive, compatible with the previous version of every app).
2. The new tables are classified in `db/grants.sql` (they belong to `apex_forms`; the website and the CRM cannot read them, proven by `scripts/boundary-drill.sh`).
3. **New rule for servers:** `WEBHOOK_ALLOW_PRIVATE` must never be set in staging or production (the app refuses to start). Locally it only matters for the Forms app's e2e; `.env` needs nothing.
4. Deliveries carry response data to systems the form's owners choose: worth one line in the privacy text when the first form uses it.

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web) and his Claude — notice of 2026-10-07 from Sam (forms: edit a sent response, migration 0023)

Respondents can now change what they sent through a private link (`docs/forms-v2-plan.md`, item 4c; off unless staff switch it on per form). Your area is touched in **one line**: `apps/web/lib/content-queries.ts` (`publicForm()`) also passes `allowEdit`; the shared `FormRenderer` does the rest. Do once, after merging `main`:

1. `pnpm db:migrate` (migration 0023: `forms.allow_edits` and four columns on `submissions`; additive, compatible with the previous version of every app).
2. No grants change (the Forms app already owns `submissions` and may update contacts). The CRM only reads `submissions` and will simply see the edited answers.
3. The link opens the page the form was on with `?edit=<secret>`; your pages need no change (the form reads it in the browser, the cache ignores query strings). Nothing new is stored in the browser.

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web) and his Claude — notice of 2026-10-07 from Sam (forms: save and resume, migration 0022)

Forms can now let a visitor save progress and resume from a private link (`docs/forms-v2-plan.md`, item 4b; off unless staff switch it on per form). Your area is touched in **one line**: `apps/web/lib/content-queries.ts` (`publicForm()`) also passes `allowDraft` to the form shown on your pages, and the shared `FormRenderer` shows the *Desa i continua més tard* panel. Do once, after merging `main`:

1. `pnpm db:migrate` (migration 0022: a `forms.allow_drafts` column and the new `form_drafts` table; additive, compatible with the previous version of every app).
2. A new table means a line in `db/grants.sql` (done: `form_drafts` belongs to `apex_forms`; the website and the CRM cannot read it, proven by `scripts/boundary-drill.sh`).
3. The resume link opens the page the form was on with `?resume=<secret>` (your pages need no change: the form reads it in the browser; ISR caching ignores query strings). Nothing new is stored in the browser, so nothing to add to the cookie registry.

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web) and his Claude — notice of 2026-10-07 from Sam (forms: availability, migration 0021)

Forms can now close on a date, close after N responses and redirect after submitting (`docs/forms-v2-plan.md`, item 4a). Your area is touched in **one place**: `apps/web/lib/content-queries.ts` (`publicForm()`) now also passes `checkOpen` and `redirectUrl` to the form shown on your pages, and the shared `FormRenderer` uses them. Do once, after merging `main`:

1. `pnpm db:migrate` (migration 0021: three additive columns on `forms`; compatible with the previous version of every app, so apps can be released in any order).
2. Nothing else. Published pages refresh as before (the Forms app calls your revalidate endpoint when a form is saved). A form with an end date or a limit asks the Forms app `/api/forms/<slug>/status` when its page opens (the website's cached page cannot know), so your pages never need to be refreshed because a date passed or a limit was reached.
3. Side observation, not changed: the CMS's scheduled publishing builds its date with `new Date(<datetime-local value>)`, which uses the *server's* time zone, not Catalonia's; forms do not have that problem (`apps/forms/lib/madrid-time.ts`). Worth a look if editors schedule pages near midnight.

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web) and his Claude — notice of 2026-10-05 from Sam (forms app, step F3: deploy)

The image, compose files, Caddy, `deploy.sh`, the release workflow and the drills now know the Forms app. Nothing changes in `apps/web`. What it means for deployments (details: `DEPLOY.md`, "First deployment of the Forms app"):

1. **New host and DNS record:** `FORMS_DOMAIN` (default `forms.<SITE_DOMAIN>`), staff-only like the CRM host. `/api/forms/*` on the main domain now goes to the Forms app.
2. **New database role** `apex_forms` (and `DATABASE_URL_FORMS` if restricted users are used) before the first release that contains the Forms app; otherwise the migration step stops the release. New `.env` values: `FORMS_DOMAIN`, `FORMS_URL`; `BOT_SECRET` is now needed by the Forms app (not the CRM app).
3. **Scheduler and uptime:** one more `/api/cron/tick` line and one more health check, for `FORMS_DOMAIN`.
4. First release with the Forms app: `deploy.sh <tag> all`. After that each app can be released alone (`web`, `crm`, `forms`).
5. Locally the drills that start the image or Caddy need Docker; on Windows run them with `MSYS_NO_PATHCONV=1` (and, if your compose project name differs from the running one, `COMPOSE_PROJECT_NAME`).

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web) and his Claude — notice of 2026-10-05 from Sam (forms app, step F2)

The form builder, the responses and the public submission API (`/api/forms/*`) moved from `apps/crm` to `apps/forms` (plan: `docs/forms-app-plan.md`). The website still draws every form exactly as before (standalone page, embed, forms inside pages); your code only changed in two lines of `apps/web/proxy.ts`. Do once, after merging `main`:

1. **Rename an environment variable in your local `.env`** (and `.env.example` already has it): `CRM_INTERNAL_URL=http://localhost:3001` becomes `FORMS_INTERNAL_URL=http://localhost:3002`; add `FORMS_URL=http://localhost:3002` too. Without it the website's `/api/forms/*` forwarding does nothing and forms cannot be submitted locally.
2. `pnpm install` (the forms app gained a test dependency), then run the apps with `pnpm dev` as before (three servers now).
3. Database permissions changed (`db/grants.sql`): `forms`, `form_starts`, `submissions` are now written only by `apex_forms`; the website still only READS `forms`. Nothing for you to do unless your code writes them (it should not).
4. **Release rule:** F2 must not be deployed without F3 (Dockerfile, compose, Caddy routing of `/api/forms/*` to the Forms app); until then public forms would fail. F3 comes next.

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web) and his Claude — notice of 2026-10-05 from Sam (forms app, step F1)

A third app, `apps/forms`, is being added (plan: `docs/forms-app-plan.md`). Step F1 only adds an empty shell; your area is not touched. Do once, after merging `main`:

1. `pnpm install` (the lockfile gained the new app) and link its env: `ln -sf ../../.env apps/forms/.env` (`pnpm dev` now also starts it on :3002; `./scripts/ci.sh` does the link itself).
2. Nothing to do for your local database (it uses one all-powerful user). The e2e run creates the new role `apex_forms` by itself.
3. **Deployed environments:** before the next release that sets `APPLY_GRANTS=1`, create the third role (`create role apex_forms login password '…';`, see `DEPLOY.md`), or `db/grants.sql` will refuse to apply.
4. Rule for your reviews: `apps/forms` never imports `apps/web` (checked by `scripts/check-boundaries.sh`). In step F2 the form builder and `/api/forms/*` move from the CRM app to it; public form URLs and the way the website draws forms do not change. You will be asked to review F2 (it touches `packages/forms`, `proxy.ts` forwarding and the Caddyfile).

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web) and his Claude — notice of 2026-10-02 from Sam

Since your last sync, `main` gained the CRM's records engine and the app-boundary rules. Your area (`apps/web`) is not affected functionally, but your local setup, your tests and your branches are. Do these once, in order:

1. **Get current.** `git fetch origin && git switch main && git pull`. On each of your own branches: `git merge origin/main` (merge commit, never rebase), resolve conflicts keeping both sides in `CLAUDE.md`, take `main`'s `pnpm-lock.yaml` and run `pnpm install`.
2. **Install and migrate your local database.** `pnpm install --frozen-lockfile` then `pnpm db:migrate` (new migrations 0013 to 0016: records, companies/people, events, labour/training/job seekers; all additive, none touches your tables).
3. **Read these two sections of `CLAUDE.md`:** "App boundaries and database permissions" and "Two apps (S2)". The rules you must follow:
   - `apps/web` never imports from `apps/crm` (and the CRM never from you); packages never import an app. `./scripts/check-boundaries.sh` checks it, and CI runs it first.
   - **The website's database user can only touch your content tables** (`entries`, `entry_translations`, `entry_versions`, `categories`, `media`, `settings`), read `forms`, and use the shared `users`, `sessions`, `outbox`, `heartbeats`, `error_log`. Anything else fails with "permission denied". **The end-to-end suite now runs the website as that restricted user**, so if your new code or test touches another table, CI tells you. Fix the code, or if the table is genuinely yours, add it to `db/grants.sql` in the same pull request (ask Sam if it is a shared table).
   - **A new table of yours needs two things:** its migration and a line in `db/grants.sql`. The grants file refuses to apply while a table is unclassified.
   - **The forms tables (`forms`, `form_starts`, `newsletter_optins`) are Sam's** and now live in `packages/db/src/schema/crm.ts`. You still import them from `@apex/db/schema` as before and only READ `forms`.
   - `users` (accounts) stays managed by your admin; the CRM reads it. A change to the shape of `users`, `sessions` or `outbox` needs both of you.
4. **Know what changed in your files** (review in the history if you have not already): `apps/web/app/api/cron/tick/route.ts` no longer purges address hashes (that table is the CRM's; the CRM's own tick does it); `packages/db/src/schema/website.ts` no longer defines the forms tables; `e2e/` (shared runner) creates the two restricted database roles and starts both apps as them.
5. **Check your side is green locally:** `./scripts/check-boundaries.sh`, `pnpm --filter web exec eslint .`, `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web test`, then the full suite with `pnpm --filter @apex/e2e test` (needs `docker compose up -d`). If a failure says "permission denied", see step 3. `E2E_OWNER_DB=1` runs the apps as the all-powerful owner, only to tell a permissions problem from a code problem.
6. **Releases:** nothing to do now. When the real servers exist, the restricted users are switched on per environment (`DEPLOY.md`, "Database users per app"); until then both apps use `DATABASE_URL` as before.
7. **Ownership file:** `.github/CODEOWNERS` was updated (new schema files are Sam's; `db/grants.sql` needs both of you). Check it lists you where you expect.

Open question for you both (not urgent): the old CRM screens `/admin/clients` and the ERP list pages still exist next to the new workspace; Sam decides when to retire them.

Done: (none yet; Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)
Partial, 2026-10-02 JM (Claude, cloud session): step 5 checks are green on a branch from current `main` (boundaries, lint, types, unit tests except the media test that needs the Docker S3 mock). Steps 1 and 2 still have to be run once on Joan Marc's own computer.

## For Joan Marc (apps/web, apps/admin) and his Claude — notice of 2026-10-07 from Sam (new app: the Hub start page)

A sixth app, `apps/hub`, is a start page linking to every portal (CMS admin, CRM, Forms, e-signature). It has no database and no login; nothing in `apps/web` or `apps/admin` changes. Do once, after merging `main`:

1. `pnpm install` and link its env: `ln -sf ../../.env apps/hub/.env` (`pnpm dev` now also starts it on :3005; `./scripts/ci.sh` links it itself). Add `SIGN_URL=` (empty) to your `.env` (see `.env.example`).
2. **Deployed environments:** a new host `HUB_DOMAIN` (default `hub.<SITE_DOMAIN>`) needs its own DNS A record; new compose service `hub`, release tag `APEX_TAG_HUB`, `deploy.sh <tag> [all|web|admin|crm|forms|hub]`. The first release containing it is `deploy.sh <tag> all`. Details: `DEPLOY.md`, `deploy/ionos/*.env.example`.
3. No migration, no grants change. E-signature is not built: its tile reads "coming soon" until `SIGN_URL` is set.
4. Review note: `apps/hub` is reviewed by both of you (CODEOWNERS).

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Joan Marc (apps/web, apps/admin) and his Claude — notice of 2026-10-08 from Sam (security: Next.js 16.3.7 -> 16.3.8)

A high-severity advisory (GHSA-cjq9-62q9-8jv4, SSRF in Next.js image optimization, fixed in 16.3.8) made the CI audit job fail on every branch. `next` and `eslint-config-next` are now pinned to `16.3.8` in every app and in `packages/core`, and `pnpm-lock.yaml` was regenerated. Nothing in the code changed. Do once, after merging `main`:

1. `pnpm install` (take `main`'s `pnpm-lock.yaml` if your branch conflicts on it). If your branch adds an app or a `next` pin, use `16.3.8`.
2. Dependabot's grouped PR (#70) edits the same lines; it will need to be rebased by Dependabot (`@dependabot rebase`) or closed in favour of a fresh one.

Done: (Joan Marc or his Claude: add "YYYY-MM-DD JM" here when finished)

## For Sam (apps/crm) and his Claude

Notice of 2026-10-02 from Joan Marc (website admin redesign):

1. **Nothing changes in the CRM's look.** The website's admin got its own stylesheet (`apps/web/app/admin/(staff)/web-admin.css`, scoped to `.wa`); `packages/ui/src/admin.css` was not touched.
2. **`packages/ui` FieldForm** has a new optional prop `lang` (show one language at a time, list items titled by their text). Without it, it behaves exactly as before, so your form builder is unaffected. Use it if you want the same in the CRM.
3. **`tokens.css`** now has `--warn`, `--warn-bg`, `--info`, `--info-bg`, with the same values and lines as your `feat/workspace-design` branch (and the same contrast-test line), so merging main into your branch should not conflict there; if git shows a conflict on those lines, keep either side (they are identical).

Done: (none yet; Sam or his Claude: add "YYYY-MM-DD SS" here when read)
