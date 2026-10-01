# Apex

Public site + custom CMS + form/lead pipeline. Build guide: `CLAUDE.md`. Plan: `PLAN.md`.

## Requirements
Node 26 (what production runs; 22+ still works for development), pnpm, Docker (local Postgres, S3-compatible mock, Mailpit), `pg_dump`/`pg_restore` for backups.

## Run locally
One command (Mac/Linux; needs Node 22+ (26 recommended) and Docker Desktop running). Safe to re-run after every `git pull`:
```
./scripts/local-setup.sh       # installs, starts Docker services, migrates, demo content, asks for a first admin, starts the app
```
Then open http://localhost:3000/ca (site) and http://localhost:3000/admin. By hand instead:
```
cp .env.example .env
pnpm install
pnpm dev        # starts Docker services, then both apps: website + CMS on :3000, CRM + forms + portal on :3001
```
Mail caught at http://localhost:8025 · S3 (s3mock) http://localhost:9090

## Environments
local / staging / production each have their own database and secrets (see `.env.example`).

## Backups
`pnpm db:backup` (daily on staging/production via cron) · `pnpm db:restore` — restore must be tested into a scratch DB.

## Background jobs (one scheduler line)
`POST /api/cron/tick` with `Authorization: Bearer $CRON_SECRET` publishes due scheduled content, sends and retries queued emails (form notifications) and purges old address hashes. It is idempotent: call it **every minute**.
```
* * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/tick
```
It refuses to run if `CRON_SECRET` is unset or still `change-me`. (`/api/cron/publish` still exists for publishing only.)

## Email, spam protection and proxy
- Set `SMTP_URL`, `MAIL_FROM` and `STAFF_NOTIFY_EMAIL` (fallback recipient). Locally, Mailpit at http://localhost:8025 catches everything.
- Set a real `BOT_SECRET` (random, 32+ chars). The app refuses to run forms in production with the placeholder.
- The reverse proxy in front of the app **must append the real client address to `X-Forwarded-For`** (Caddy, nginx and most load balancers do). Set `TRUSTED_PROXY_HOPS` to the number of proxies in front (default 1). Rate limiting relies on it. Reference config: `deploy/Caddyfile`.
- Visitor uploads go to the **private** bucket `S3_PRIVATE_BUCKET`; never make that bucket public.

## Warm-up (keeps pages available during a database outage)
```
*/5 * * * * SITE_URL=https://YOUR-DOMAIN /path/to/scripts/warm.sh
```
Run it once after every deploy as well. `pnpm --filter web seed:demo` (local only, `RESET=1` to replace) loads demo content for design checks.

## Checks before you push
`pnpm verify:fast` (≈1 min: lint, types, unit tests, build) or `pnpm verify` (everything CI runs, ≈8 min, needs Docker). Deployment (IONOS): see `DEPLOY.md` and `deploy/ionos/README.md`. Drills: `scripts/deploy-drill.sh`, `scripts/backup-drill.sh`.

## Tests
- `pnpm test` — unit + database tests (throwaway DB `apex_test`; needs `docker compose up -d`).
- `pnpm --filter web test:e2e` — Playwright end-to-end against a real production build on port 3100 and a throwaway DB `apex_e2e` (first time: `pnpm --filter web exec playwright install chromium`). Covers login throttling, draft → publish → live → hidden edits → unpublish, scheduled publishing via the cron endpoint, and editor permissions.
