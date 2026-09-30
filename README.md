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
