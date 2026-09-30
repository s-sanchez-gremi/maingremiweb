#!/usr/bin/env bash
# The exact checks CI runs on every change. Run it yourself before pushing.
#   ./scripts/ci.sh              everything: install, lint, types, unit tests, build, end-to-end tests, Docker image smoke test
#   ./scripts/ci.sh --fast       install, lint, types, unit tests, build   (about 1 minute)
#   ./scripts/ci.sh --no-docker  everything except the Docker image
# Needs Docker running for the tests (Postgres, S3 mock, Mailpit): the script starts them.
set -euo pipefail
cd "$(dirname "$0")/.."
FAST=0; DOCKER=1
for a in "$@"; do case "$a" in --fast) FAST=1 ;; --no-docker) DOCKER=0 ;; *) echo "unknown option $a"; exit 2 ;; esac; done
step() { printf '\n\033[1m=== %s\033[0m\n' "$*"; }

step "install (lockfile must be up to date)"
pnpm install --frozen-lockfile

step "lint"
pnpm --filter web exec eslint .

step "type check"
pnpm --filter web exec tsc --noEmit

step "local services (Postgres, S3 mock, Mailpit)"
docker compose up -d --wait db mail >/dev/null
docker compose up -d s3 >/dev/null
for i in $(seq 1 60); do curl -fsS "localhost:9090/apex-media?list-type=2" >/dev/null 2>&1 && break; sleep 1; [ "$i" = 60 ] && { echo "S3 mock did not start"; exit 1; }; done

step "unit + database tests"
pnpm --filter web test

step "production build with NO database and NO configuration (a build must never need them)"
( cd apps/web && env -i PATH="$PATH" HOME="$HOME" pnpm exec next build >/dev/null ) && echo "build ok"

if [ "$FAST" = 0 ]; then
  step "end-to-end tests (real browser, real production build)"
  pnpm --filter web test:e2e
  if [ "$DOCKER" = 1 ]; then
    step "Docker image smoke test"
    ./scripts/docker-smoke.sh
    step "Deploy drill (release, automatic rollback of a broken release, failed migration)"
    ./scripts/deploy-drill.sh
    step "Staging stack drill (app + PostgreSQL in Docker: data survives a release, database is private)"
    ./scripts/staging-drill.sh
    step "Caddy drill (staff-only paths closed to non-listed addresses, public pages open)"
    ./scripts/caddy-drill.sh
    step "Backup drill (encrypted off-platform backup restores; a corrupt backup is caught)"
    ./scripts/backup-drill.sh
  fi
fi
printf '\n\033[1;32mALL CHECKS PASSED\033[0m\n'
