# Apex

Public site + custom CMS + form/lead pipeline. Build guide: `CLAUDE.md`. Plan: `PLAN.md`.

## Requirements
Node 22+, pnpm, Docker (local Postgres, S3-compatible mock, Mailpit), `pg_dump`/`pg_restore` for backups.

## Run locally
```
cp .env.example .env
pnpm install
pnpm dev        # starts Docker services, then the Next.js app
```
Mail caught at http://localhost:8025 · S3 (s3mock) http://localhost:9090

## Environments
local / staging / production each have their own database and secrets (see `.env.example`).

## Backups
`pnpm db:backup` (daily on staging/production via cron) · `pnpm db:restore` — restore must be tested into a scratch DB.

## Scheduled publishing
`POST /api/cron/publish` with header `Authorization: Bearer $CRON_SECRET` publishes every due scheduled item (idempotent).
Call it **every minute** from the host's scheduler, e.g. a crontab line:
```
* * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/publish
```
The endpoint refuses to run if `CRON_SECRET` is unset or still `change-me`. Locally, call it by hand with the secret from `.env`.

## Media storage
Uploads go to the S3-compatible bucket in `.env` (`S3_*`). `S3_PUBLIC_URL` must be the public/CDN base URL of that bucket.

## First admin
The very first admin is created from the command line; after that admins manage users in the admin (Usuaris):
```
PASSWORD='a-long-password' pnpm --filter web user:create you@example.com admin "Your Name"
```
