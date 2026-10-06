# Team sync notices (read at the start of every session)

**For Claude Code:** at the start of a session, read the section addressed to the person you are working for, do each open item (they are safe to repeat), tell the person what you did or what needs their decision, and mark the item done (date + initials) in the same pull request as your next change. Add a new notice here when you change something the other person's side must act on (a new migration, a moved table, a new rule, a changed command). Never put secrets here.

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

## For Sam (apps/crm) and his Claude

Notice of 2026-10-02 from Joan Marc (website admin redesign):

1. **Nothing changes in the CRM's look.** The website's admin got its own stylesheet (`apps/web/app/admin/(staff)/web-admin.css`, scoped to `.wa`); `packages/ui/src/admin.css` was not touched.
2. **`packages/ui` FieldForm** has a new optional prop `lang` (show one language at a time, list items titled by their text). Without it, it behaves exactly as before, so your form builder is unaffected. Use it if you want the same in the CRM.
3. **`tokens.css`** now has `--warn`, `--warn-bg`, `--info`, `--info-bg`, with the same values and lines as your `feat/workspace-design` branch (and the same contrast-test line), so merging main into your branch should not conflict there; if git shows a conflict on those lines, keep either side (they are identical).

Done: (none yet; Sam or his Claude: add "YYYY-MM-DD SS" here when read)
