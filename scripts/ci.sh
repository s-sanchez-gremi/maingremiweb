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

# Each app reads its configuration from a .env next to it (a link to the root .env); make sure both exist.
[ -f .env ] || cp .env.example .env
ln -sf ../../.env apps/web/.env; ln -sf ../../.env apps/crm/.env; ln -sf ../../.env apps/forms/.env; ln -sf ../../.env apps/admin/.env; ln -sf ../../.env apps/sign/.env

step "app boundaries (the apps never import each other; packages never import an app)"
./scripts/check-boundaries.sh --selftest
./scripts/check-boundaries.sh

step "install (lockfile must be up to date)"
pnpm install --frozen-lockfile

step "lint"
pnpm --filter web exec eslint .
pnpm --filter crm exec eslint .
pnpm --filter forms exec eslint .
pnpm --filter sign exec eslint .
pnpm --filter admin exec eslint .

step "type check"
rm -rf apps/web/.next-e2e apps/web/.next/types apps/crm/.next-e2e apps/crm/.next/types apps/forms/.next-e2e apps/forms/.next/types apps/admin/.next-e2e apps/admin/.next/types apps/sign/.next-e2e apps/sign/.next/types apps/web/.next/dev/types apps/crm/.next/dev/types apps/forms/.next/dev/types apps/admin/.next/dev/types apps/sign/.next/dev/types   # stale route types from earlier builds can disagree with the dev server's current ones (builds below recreate them)
pnpm --filter web exec tsc --noEmit
pnpm --filter crm exec tsc --noEmit
pnpm --filter forms exec tsc --noEmit
pnpm --filter sign exec tsc --noEmit
pnpm --filter admin exec tsc --noEmit

step "local services (Postgres, S3 mock, Mailpit)"
docker compose up -d --wait db mail >/dev/null
docker compose up -d s3 >/dev/null
for i in $(seq 1 60); do curl -fsS "localhost:9090/apex-media?list-type=2" >/dev/null 2>&1 && break; sleep 1; [ "$i" = 60 ] && { echo "S3 mock did not start"; exit 1; }; done

step "unit + database tests"
pnpm --filter web test
pnpm --filter crm test
pnpm --filter forms test
pnpm --filter sign test
pnpm --filter admin test

step "production build with NO database and NO configuration (a build must never need them)"
for app in web admin crm forms sign; do
  ( cd apps/$app && env -i PATH="$PATH" HOME="$HOME" pnpm exec next build >/dev/null ) && echo "$app build ok"
done

if [ "$FAST" = 0 ]; then
  step "end-to-end tests (real browser, real production builds of every app)"
  for app in web admin crm forms sign; do
    ( cd apps/$app && rm -rf .next-e2e .next/types .next/dev/types && NEXT_DIST_DIR=.next-e2e pnpm exec next build >/dev/null ) && echo "$app e2e build ok"   # one after the other: parallel builds starve small CI machines
  done
  E2E_PREBUILT=1 pnpm --filter @apex/e2e test
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
    step "Boundary drill (database permissions per app, tested with the real restricted users)"
    ./scripts/boundary-drill.sh
  fi
fi
printf '\n\033[1;32mALL CHECKS PASSED\033[0m\n'
