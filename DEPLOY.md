# Deploying Apex

One Docker image runs everywhere (staging and production); only the environment differs. The image contains the website,
the admin and the API. Everything else (database, file storage, mail, reverse proxy, scheduler) is provided by the host.

**Hosting: IONOS Cloud, Logroño** — production: server + Managed PostgreSQL + S3; staging: a small separate server with PostgreSQL in Docker (cheaper). The step-by-step setup is `deploy/ionos/README.md`;
the environment template is `deploy/ionos/production.env.example`.

**Every change is checked by CI** (`.github/workflows/ci.yml`, locally: `pnpm verify`): lint, types, 129+ unit/database tests,
a build with no configuration, 33 end-to-end tests in a real browser (including accessibility), the Docker image smoke test,
and a dependency vulnerability audit.

## What you need from the host
| Need | Notes |
|---|---|
| PostgreSQL 17, EU region (production: IONOS Managed; staging: in Docker) | one database, backed up daily (`scripts/backup.sh`, restore tested with `scripts/restore.sh`) |
| S3-compatible storage, EU region | **two buckets**: `S3_BUCKET` (media, publicly readable, ideally behind a CDN) and `S3_PRIVATE_BUCKET` (visitor uploads, **never public**) |
| SMTP account | transactional mail (form notifications) |
| Reverse proxy with HTTPS | see `deploy/Caddyfile`; it must append the client address to `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`, default 1) |
| A scheduler | one call per minute (below) + the warm-up (below) |

## Environment variables
The container **refuses to start** (exit code 1, clear message) on staging/production if any of these is missing, weak or a placeholder.

| Variable | Example / rule |
|---|---|
| `APP_ENV` | `staging` or `production` (turns the startup check on; production also requires an `https://` `SITE_URL`) |
| `DATABASE_URL` | `postgres://user:password@host:5432/apex?sslmode=require` (not the local `apex:apex`; production requires `sslmode=require`) |
| `SITE_URL` | `https://www.example.com` (canonical URLs, sitemap, e-mail links) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | provider credentials |
| `S3_BUCKET`, `S3_PUBLIC_URL` | public media bucket and its public/CDN base URL |
| `S3_PRIVATE_BUCKET` | different from `S3_BUCKET` |
| `SMTP_URL`, `MAIL_FROM` | `smtp://user:pw@host:587`, `Name <no-reply@domain>` |
| `STAFF_NOTIFY_EMAIL` | fallback recipient when a form has no staff address |
| `CRON_SECRET` | random, 24+ characters: `openssl rand -hex 32` |
| `BOT_SECRET` | random, 32+ characters: `openssl rand -hex 32` |
| `TRUSTED_PROXY_HOPS` | number of proxies in front of the app (default `1`) |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | first start only (see the checklist); remove afterwards |
| `AUTO_MIGRATE` | `1` on staging (migrate on start); leave unset in production and run the migrate command first |

Never commit real values. Generate each secret separately for each environment.

## Four apps, one image
The image holds **all five** apps; a container's command picks one. They share the database and are released **independently**:

| Service / command | What it is | Public address |
|---|---|---|
| `web` (`start-web`, the default) | the public website (read-only on the database), form *rendering*, the staff bar and the editor's live preview | `SITE_DOMAIN` (its `/admin/*` restricted to `ADMIN_ALLOWED_IPS`) |
| `admin` (`start-admin`) | the CMS admin: content, media, categories, settings, users, errors, visual builder, and the scheduler for scheduled publishing | `ADMIN_DOMAIN` (default `admin.SITE_DOMAIN`; everything restricted to `ADMIN_ALLOWED_IPS` **except** assets, `robots.txt`, `/api/health`, `/api/cron/*`) |
| `crm` (`start-crm`) | CRM, projects, ERP, client portal | `CRM_DOMAIN` (everything restricted to `ADMIN_ALLOWED_IPS` **except** `/portal`, assets, `robots.txt`, `/api/health`, `/api/cron/*`) |
| `forms` (`start-forms`) | form builder, responses, public submission API | `FORMS_DOMAIN` (everything restricted to `ADMIN_ALLOWED_IPS` **except** assets, `robots.txt`, `/api/health`, `/api/cron/*`); visitors never use this host: `https://SITE_DOMAIN/api/forms/*` is routed to this app by Caddy |
| `hub` (`start-hub`) | the start page linking every portal (CMS admin, CRM, Forms, e-signature, public site); no database, no login, only links | `HUB_DOMAIN` (default `hub.SITE_DOMAIN`; restricted to `ADMIN_ALLOWED_IPS` **except** assets, `robots.txt`, `/api/health`). Needs its own DNS record. Its tiles come from `ADMIN_URL`, `CRM_URL`, `FORMS_URL`, `SITE_URL` and `SIGN_URL` (empty = "coming soon"/"not configured") |

- Extra variables: `CRM_DOMAIN`, `FORMS_DOMAIN` and `ADMIN_DOMAIN` (Caddy; each needs its own DNS record, like the main domain), `WEB_INTERNAL_URL` (`http://web:3000`: the CMS admin and the Forms app ask the website to refresh its cache after a change; shares `CRON_SECRET`), `CRM_URL` / `FORMS_URL` / `WEB_ADMIN_URL` (menu links; `FORMS_URL` is also where staff notification emails point for new responses; `WEB_ADMIN_URL` is the CMS admin host). CMS admin only: `ADMIN_URL` (on the website: `https://ADMIN_DOMAIN`, where the staff bar links to), `WEB_PREVIEW_URL` (on the admin: `https://SITE_DOMAIN`, where the editor's live preview is served) and `SESSION_COOKIE_DOMAIN` (on **both** web and admin: the site's registrable domain, e.g. `example.org`, so the staff session reaches the website for the bar and the preview; leave it unset on the CRM and Forms apps). `FORMS_INTERNAL_URL` is for development only; leave it unset in production (Caddy routes the forms API). Optional `DATABASE_URL_WEB` / `DATABASE_URL_ADMIN` / `DATABASE_URL_CRM` / `DATABASE_URL_FORMS` give each app its own **restricted database user** (see "Database users per app" below).
- **`deploy.sh <tag> [all|web|admin|crm|forms|hub]`** ("all" = every app service in the compose file; per-app tags `APEX_TAG_WEB` / `_ADMIN` / `_CRM` / `_FORMS` / `_HUB`): migrations run once, before anything starts; each app waits for its own health check and **rolls back to its own previous version** without touching the others (`scripts/deploy-drill.sh` proves it). The release workflow's *Run workflow* has the same `only` choice. The release that first contains the Forms app must be deployed with `all`, and **must also have DNS and `.env` ready for `FORMS_DOMAIN`** (see "First deployment of the Forms app" below).
- **Migrations must work with the previous version of every app** (additive only; drop or rename in a later release), because one app can be a version behind the other.
- Three schedulers: `/api/cron/tick` on the **admin**, **CRM** and **Forms** hosts (the admin publishes scheduled content, sends mail and purges errors, then asks the website to refresh its cache; the CRM app sends mail; the Forms app sends mail and purges address hashes). The website has no scheduler. Uptime checks: `https://SITE_DOMAIN/api/health?deep=1` (also fails when the admin's scheduler has stalled), `https://ADMIN_DOMAIN/api/health?deep=1`, `https://CRM_DOMAIN/api/health?deep=1` and `https://FORMS_DOMAIN/api/health?deep=1`.

## Database users per app (least privilege)
`db/grants.sql` defines what each app's database user may touch: `apex_web` (the public website: read-only on content, `forms` and accounts), `apex_admin` (the CMS admin: writes content, media, settings and accounts), `apex_crm` (CRM, ERP, portal, records; reads accounts and changes only its own password; read-only `forms` and `submissions`) and `apex_forms` (form builder, responses and the submission pipeline: owns `forms`, `form_starts`, `submissions`; its only writes into the CRM are an upsert of the contact, a new lead and a newsletter opt-in). None can change the schema. It is **optional**: without it every app uses `DATABASE_URL` as before. To switch it on (once per environment):
1. As the database owner: `create role apex_web login password '…'; create role apex_admin login password '…'; create role apex_crm login password '…'; create role apex_forms login password '…';` (`db/grants.sql` refuses to apply without all four) (⚠ confirm IONOS Managed PostgreSQL lets the owner create roles).
2. In the server's `.env`: `DATABASE_URL_WEB=postgres://apex_web:…`, `DATABASE_URL_ADMIN=postgres://apex_admin:…`, `DATABASE_URL_CRM=postgres://apex_crm:…`, `DATABASE_URL_FORMS=postgres://apex_forms:…` and **remove `DATABASE_URL`** from it (the apps load the whole `.env`, so the owner's password must not be in it).
3. In a separate file `.env.migrate` next to it (only `deploy.sh` reads it): `MIGRATE_DATABASE_URL=postgres://<owner>:…`. Releases then migrate as the owner and re-apply `db/grants.sql` (`APPLY_GRANTS=1`) every time.
`scripts/boundary-drill.sh` (CI) proves what each user can and cannot do, and the end-to-end suite runs the apps as these restricted users.

## Image commands
```
docker build -t apex .
docker run --env-file staging.env -e AUTO_MIGRATE=1 -p 3000:3000 apex      # start (staging: migrates first)
docker run --env-file production.env apex migrate                          # apply pending migrations only, then exit
docker run --env-file production.env -p 3000:3000 apex                     # start the website (= start-web)
docker run --env-file production.env -p 3001:3000 apex start-crm          # start the CRM app
docker run --env-file production.env -p 3002:3000 apex start-forms        # start the Forms app
```
Health endpoints: `GET /api/health` (200 = up and the database answers, 503 otherwise; used by the container health check) and `GET /api/health?deep=1` (also requires the scheduler to have run in the last 10 minutes: **point the external uptime monitor here**).

## First deployment of the Forms app (existing installations)
The Forms app took over the form builder, the responses and `/api/forms/*` from the CRM app (`docs/forms-app-plan.md`, steps F2 and F3). On a server that already runs the website and the CRM app, do this **before** releasing the first version that contains it, in this order:
1. DNS: an A record for `FORMS_DOMAIN` (default `forms.<SITE_DOMAIN>`) pointing at the server; Caddy gets its certificate.
2. As the database owner: `create role apex_forms login password '…';` (and `DATABASE_URL_FORMS` in `.env` if you use restricted users). Without the role, the migration step's `APPLY_GRANTS=1` stops the release before anything is changed.
3. In `.env`: `FORMS_DOMAIN`, `FORMS_URL=https://FORMS_DOMAIN`, and `CRM_URL`/`WEB_ADMIN_URL` if not set already; `BOT_SECRET` must be set (the Forms app refuses to start without a real one; the CRM app no longer needs it). `WEB_INTERNAL_URL` stays (now used by the Forms app).
4. Add the scheduler line and the uptime check for `FORMS_DOMAIN` (see above).
5. Release with `deploy.sh <tag> all` (the release workflow's `only: all`). The copied `Caddyfile` and `compose.yml` change in the same release, so public forms keep working: `/api/forms/*` goes to the Forms app from the moment it is healthy.
6. Webhooks (optional, per form): outgoing requests go from the Forms container to the receivers' public addresses, so the server needs outbound HTTPS and **no firewall rule that lets that container reach your private network**. `WEBHOOK_ALLOW_PRIVATE` must stay unset (the app refuses to start if it is set).
7. Forms that create CRM records (destination *Crear registres al CRM*) are processed by the **CRM app's** scheduler line (`https://CRM_DOMAIN/api/cron/tick`, every minute): keep it, and its uptime check, in place.
8. Afterwards: submit a test form from the public site, open the response at `https://FORMS_DOMAIN/admin/forms`, and check the staff notification email links there.
Rollback of the Forms app alone (`deploy.sh <old-tag> forms`) is safe; rolling back to a version **before** the Forms app existed means rolling back `all`, because the old CRM app is then the only one that serves `/api/forms/*` (and the Caddyfile must go back with it).

## First deployment checklist
1. Create the database, both buckets (public read only on `S3_BUCKET`), the SMTP account, DNS and TLS (proxy).
2. Create `staging.env` / `production.env` from the table above.
3. `docker run … apex migrate`, then start the container; check `/api/health`.
4. Create the first admin: set `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (12+ characters) and optionally
   `INITIAL_ADMIN_NAME` for the **first** start. If (and only if) the database has no users, that admin is created; the
   log confirms it (never showing the password). **Then remove those variables.** More users are created in the admin
   (Usuaris).
5. Add the scheduler lines:
   ```
   * * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://ADMIN_DOMAIN/api/cron/tick
   * * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://CRM_DOMAIN/api/cron/tick
   * * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://FORMS_DOMAIN/api/cron/tick
   */5 * * * * SITE_URL=https://DOMAIN /path/to/scripts/warm.sh
   ```
   and run `scripts/warm.sh` once after every deploy.
6. Set the daily backup job and **restore a backup into a scratch database once** to prove it works.
7. In the admin: *Configuració* (homepage, menu, header buttons such as Campus virtual, footer, legal links), real legal pages
   (privacy policy, legal notice: wording from the client's legal adviser), then content.

## Rollback
Keep the previous image tag. Migrations are forward-only and additive: to roll back a release, start the previous image
(it ignores columns/tables it does not know). A migration that must be undone is fixed with a new migration, never by editing an old one.

## How releases flow (IONOS)
`main` → **CI** (lint, types, tests, browser tests, image, deploy drill, backup drill) → **Release** workflow builds the tested commit into
`ghcr.io/OWNER/REPO:sha-XXXXXXX` → **staging deploys automatically** → a person runs *Release → Run workflow* with that tag and **approves**
the production deployment. On the server `deploy.sh` pulls the image, applies migrations, starts it, waits for health and **rolls back
automatically** if the new version does not become healthy (`scripts/deploy-drill.sh` proves this, including a failing migration).

## Backups
Independent of IONOS's own database backups: `deploy/backup.sh` (daily) dumps, verifies, **encrypts** and uploads to a private bucket;
`deploy/restore-drill.sh` (monthly) restores the newest backup into a throw-away Postgres and checks it. `scripts/backup-drill.sh` proves both,
including that a corrupt backup is detected. Optional ping URLs (`BACKUP_PING_URL`, `DRILL_PING_URL`) alert you if a run is missing or fails (phase 8).

## Staff-only admin (Caddy)
`deploy/Caddyfile` answers **404** for `/admin/*` and `/api/media/*` to every address outside `ADMIN_ALLOWED_IPS` (space-separated, e.g. `203.0.113.7 198.51.100.0/24`; your office or VPN range). **Empty means nobody**, so set it before the first login. This one rule covers every staff screen now and later (CRM, projects, settings…). Public pages, form submission and the health check stay open; the login still applies on top. `scripts/caddy-drill.sh` proves the rule on the real file. To let someone in, add their address to `.env` and run `docker compose up -d caddy`. The future client portal will need its own open path.

## Monitoring (phase 8)
- **Uptime:** any external monitor (UptimeRobot, Better Stack, Healthchecks… free tiers are enough) checking `https://DOMAIN/api/health?deep=1` every minute, alerting by e-mail/SMS. 503 = database down **or** the scheduler stopped (scheduled publishing and e-mails would silently stall).
- **Errors:** unhandled server errors are stored in our own database (`error_log`; message, short stack, route path only, no query string/body/cookies), deduplicated with a counter, shown to admins in *Errors*, and e-mailed to `ALERT_EMAIL` the first time they appear (reminder after 24 h if still open; resolved ones are purged after 90 days). No third-party service, nothing personal leaves the platform. Unset `ALERT_EMAIL` = logged but not e-mailed.
- **Backups:** set `BACKUP_PING_URL` (nightly backup) and `DRILL_PING_URL` (monthly restore drill) to dead-man's-switch check URLs (e.g. Healthchecks.io): you are alerted if a run **fails or does not happen**. Also set the monitor's grace period to ~26 h (backup) / ~32 days (drill).
- **Admin dashboard** (*Tauler → Estat del sistema*, admins): scheduler running, pending/failed e-mails, open errors.
- **Editor handover:** `docs/guia-editor.md` (Catalan).

## Not included yet
The GitHub release workflow and the IONOS console steps are documented but have not been
run on a real repository/account yet (see the verification notes in `deploy/ionos/README.md`).
