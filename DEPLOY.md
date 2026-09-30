# Deploying Apex

One Docker image runs everywhere (staging and production); only the environment differs. The image contains the website,
the admin and the API. Everything else (database, file storage, mail, reverse proxy, scheduler) is provided by the host.

**Every change is checked by CI** (`.github/workflows/ci.yml`, locally: `pnpm verify`): lint, types, 129+ unit/database tests,
a build with no configuration, 33 end-to-end tests in a real browser (including accessibility), the Docker image smoke test,
and a dependency vulnerability audit.

## What you need from the host
| Need | Notes |
|---|---|
| PostgreSQL 17, EU region | one database, backed up daily (`scripts/backup.sh`, restore tested with `scripts/restore.sh`) |
| S3-compatible storage, EU region | **two buckets**: `S3_BUCKET` (media, publicly readable, ideally behind a CDN) and `S3_PRIVATE_BUCKET` (visitor uploads, **never public**) |
| SMTP account | transactional mail (form notifications) |
| Reverse proxy with HTTPS | see `deploy/Caddyfile`; it must append the client address to `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`, default 1) |
| A scheduler | one call per minute (below) + the warm-up (below) |

## Environment variables
The container **refuses to start** (exit code 1, clear message) on staging/production if any of these is missing, weak or a placeholder.

| Variable | Example / rule |
|---|---|
| `APP_ENV` | `staging` or `production` (turns the startup check on; production also requires an `https://` `SITE_URL`) |
| `DATABASE_URL` | `postgres://user:password@host:5432/apex` (not the local `apex:apex`) |
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

## Image commands
```
docker build -t apex .
docker run --env-file staging.env -e AUTO_MIGRATE=1 -p 3000:3000 apex      # start (staging: migrates first)
docker run --env-file production.env apex migrate                          # apply pending migrations only, then exit
docker run --env-file production.env -p 3000:3000 apex                     # start
```
Health endpoint for load balancers/uptime checks: `GET /api/health` (200 = up and the database answers, 503 otherwise).

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
   */5 * * * * SITE_URL=https://DOMAIN /path/to/scripts/warm.sh
   ```
   and run `scripts/warm.sh` once after every deploy.
6. Set the daily backup job and **restore a backup into a scratch database once** to prove it works.
7. In the admin: *Configuració* (homepage, menu, header buttons such as Campus virtual, footer, legal links), real legal pages
   (privacy policy, legal notice: wording from the client's legal adviser), then content.

## Rollback
Keep the previous image tag. Migrations are forward-only and additive: to roll back a release, start the previous image
(it ignores columns/tables it does not know). A migration that must be undone is fixed with a new migration, never by editing an old one.

## Not included yet (needs a hosting decision)
Automatic deploy to staging on every merge and approval-gated deploy to production (the CI already produces and tests the image;
the last step is "push image + tell the host to run it"), error tracking, uptime alerts and backup alerts (phase 8).
