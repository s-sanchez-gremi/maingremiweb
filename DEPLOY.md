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

## Two apps, one image
The image holds **both** apps; a container's command picks one. They share the database and are released **independently**:

| Service / command | What it is | Public address |
|---|---|---|
| `web` (`start-web`, the default) | website, CMS admin, form *rendering* | `SITE_DOMAIN` (admin restricted to `ADMIN_ALLOWED_IPS`) |
| `crm` (`start-crm`) | CRM, forms builder + submission API, projects, ERP, client portal | `CRM_DOMAIN` (everything restricted to `ADMIN_ALLOWED_IPS` **except** `/portal`, assets, `robots.txt`, `/api/health`, `/api/cron/*`); `https://SITE_DOMAIN/api/forms/*` is routed here by Caddy |

- Extra variables: `CRM_DOMAIN` (Caddy; needs its own DNS record), `WEB_INTERNAL_URL` (`http://web:3000`: the CRM app asks the website to refresh its cache after a form changes; shares `CRON_SECRET`), `CRM_URL` / `WEB_ADMIN_URL` (menu links). `CRM_INTERNAL_URL` is for development only; leave it unset in production (Caddy routes the forms API). Optional `DATABASE_URL_WEB` / `DATABASE_URL_CRM` give each app its own **restricted database user** (see "Database users per app" below).
- **`deploy.sh <tag> [all|web|crm]`**: migrations run once, before anything starts; each app waits for its own health check and **rolls back to its own previous version** without touching the other (`scripts/deploy-drill.sh` proves it). The release workflow's *Run workflow* has the same `only` choice.
- **Migrations must work with the previous version of BOTH apps** (additive only; drop or rename in a later release), because one app can be a version behind the other.
- Two schedulers: `/api/cron/tick` on **both** hosts (the website publishes scheduled content and sends mail; the CRM app sends mail and purges address hashes). Two uptime checks: `https://SITE_DOMAIN/api/health?deep=1` and `https://CRM_DOMAIN/api/health?deep=1`.

## Database users per app (least privilege)
`db/grants.sql` defines what each app's database user may touch: `apex_web` (website + CMS: content tables, read-only `forms`, accounts) and `apex_crm` (CRM, forms, ERP, portal, records; reads accounts and changes only its own password). Neither can change the schema. It is **optional**: without it both apps use `DATABASE_URL` as before. To switch it on (once per environment):
1. As the database owner: `create role apex_web login password '…'; create role apex_crm login password '…';` (⚠ confirm IONOS Managed PostgreSQL lets the owner create roles).
2. In the server's `.env`: `DATABASE_URL_WEB=postgres://apex_web:…`, `DATABASE_URL_CRM=postgres://apex_crm:…` and **remove `DATABASE_URL`** from it (the apps load the whole `.env`, so the owner's password must not be in it).
3. In a separate file `.env.migrate` next to it (only `deploy.sh` reads it): `MIGRATE_DATABASE_URL=postgres://<owner>:…`. Releases then migrate as the owner and re-apply `db/grants.sql` (`APPLY_GRANTS=1`) every time.
`scripts/boundary-drill.sh` (CI) proves what each user can and cannot do, and the end-to-end suite runs both apps as these restricted users.

## Image commands
```
docker build -t apex .
docker run --env-file staging.env -e AUTO_MIGRATE=1 -p 3000:3000 apex      # start (staging: migrates first)
docker run --env-file production.env apex migrate                          # apply pending migrations only, then exit
docker run --env-file production.env -p 3000:3000 apex                     # start the website (= start-web)
docker run --env-file production.env -p 3001:3000 apex start-crm          # start the CRM app
```
Health endpoints: `GET /api/health` (200 = up and the database answers, 503 otherwise; used by the container health check) and `GET /api/health?deep=1` (also requires the scheduler to have run in the last 10 minutes: **point the external uptime monitor here**).

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
   * * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/tick
   * * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://CRM_DOMAIN/api/cron/tick
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
