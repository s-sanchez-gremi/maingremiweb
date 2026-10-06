#!/usr/bin/env bash
# Proves the STAGING stack (deploy/compose.staging.yml: the three apps + PostgreSQL in Docker) works with the real deploy script:
# the database starts before the migration, data survives a redeploy, the database is not published, and the
# backup + restore drill work against a containerized database. The local S3 mock/mail stand in for IONOS services.
# Usage: ./scripts/staging-drill.sh   (needs docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${STAGING_DRILL_PORT:-3320}"; CRM_PORT=$((PORT + 1)); FORMS_PORT=$((PORT + 2))
WORK="$(mktemp -d)"
PROJECT=apexdrillstaging
# SAFETY: deploy.sh (`up --remove-orphans`) and `down -v` act on a whole Compose PROJECT; always use the drill's own, never an inherited
# COMPOSE_PROJECT_NAME (which could point at your local dev stack and destroy its database volume).
export COMPOSE_PROJECT_NAME="$PROJECT"
cleanup() { (cd "$WORK" && COMPOSE_FILE=compose.yml:override.yml APEX_TAG_WEB=x APEX_TAG_CRM=x APEX_TAG_FORMS=x docker compose down -v >/dev/null 2>&1) || true; rm -rf "$WORK"; }
trap cleanup EXIT
fail() { echo "FAIL: $*"; exit 1; }
rnd() { openssl rand -hex "$(( ($1 + 1) / 2 ))" | cut -c1-"$1"; }

echo "== image"
docker build -q -t apex-drill:good . >/dev/null
docker tag apex-drill:good apex-drill:good2

PGPW="$(rnd 24)"
cat > "$WORK/.env" <<ENV
APEX_ENV=$PROJECT
APEX_IMAGE=apex-drill
SITE_DOMAIN=localhost
POSTGRES_USER=apex_staging
POSTGRES_PASSWORD=$PGPW
POSTGRES_DB=apex_staging
APP_ENV=staging
NODE_ENV=production
SITE_URL=http://localhost:$PORT
DATABASE_URL=postgres://apex_staging:$PGPW@db:5432/apex_staging
S3_ENDPOINT=http://host.docker.internal:9090
S3_REGION=eu-south-2
S3_ACCESS_KEY=drill
S3_SECRET_KEY=$(rnd 24)
S3_BUCKET=apex-media
S3_PRIVATE_BUCKET=apex-private
S3_PUBLIC_URL=http://localhost:9090/apex-media
SMTP_URL=smtp://host.docker.internal:1025
MAIL_FROM=Apex STAGING <no-reply@apex.example>
CRON_SECRET=$(rnd 32)
BOT_SECRET=$(rnd 40)
AUTO_MIGRATE=0
ENV
cp deploy/compose.staging.yml "$WORK/compose.yml"
cp deploy/deploy.sh deploy/warm.sh "$WORK/"
# Local-only adjustments: no public HTTPS edge, publish the apps' ports, reach the host's S3 mock and mail catcher.
cat > "$WORK/override.yml" <<YML
services:
  caddy:
    profiles: ["off"]
  web:
    ports: ["$PORT:3000"]
    extra_hosts: ["host.docker.internal:host-gateway"]
  crm:
    ports: ["$CRM_PORT:3000"]
    extra_hosts: ["host.docker.internal:host-gateway"]
  forms:
    ports: ["$FORMS_PORT:3000"]
    extra_hosts: ["host.docker.internal:host-gateway"]
YML
cd "$WORK"
export COMPOSE_FILE=compose.yml:override.yml
run() { PULL=0 HEALTH_WAIT_SECONDS=90 ./deploy.sh "$@"; }
psql_stg() { docker compose exec -T db psql -U apex_staging -d apex_staging -Atc "$1"; }

echo; echo "##### 1. first deploy on an empty server: database starts first, then migrations, then the apps"
run good >/tmp/stg1.log 2>&1 || { cat /tmp/stg1.log; fail "first deploy failed"; }
grep -q "start the database" /tmp/stg1.log || fail "database was not started before migrating"
curl -fsS "localhost:$PORT/api/health" >/dev/null || fail "the website is not serving"
curl -fsS "localhost:$CRM_PORT/api/health" >/dev/null || fail "the CRM app is not serving"
curl -fsS "localhost:$FORMS_PORT/api/health" >/dev/null || fail "the Forms app is not serving"
[ "$(psql_stg 'select count(*) from schema_migrations')" -ge 7 ] || fail "migrations not applied"
echo "ok: database + all three apps up, migrations applied"

echo; echo "##### 2. the database is private"
PUBLISHED="$(docker compose ps --format '{{.Service}} {{.Publishers}}' | grep '^db ' || true)"
echo "$PUBLISHED" | grep -Eq '[0-9]+->5432' && fail "database port is published to the host: $PUBLISHED"
echo "ok: no published database port"

echo; echo "##### 3. data survives a new release"
psql_stg "insert into categories (slug, names) values ('persisteix', '{\"ca\":\"Persisteix\"}')" >/dev/null
run good2 >/tmp/stg2.log 2>&1 || { cat /tmp/stg2.log; fail "second deploy failed"; }
[ "$(psql_stg "select count(*) from categories where slug='persisteix'")" = 1 ] || fail "data lost on redeploy"
echo "ok: data still there after redeploy (volume kept)"

echo; echo "##### 4. backup + restore drill against the containerized database"
NET="${PROJECT}_default"
cat > backup.env <<ENV
DATABASE_URL=postgres://apex_staging:$PGPW@db:5432/apex_staging
BACKUP_S3_ENDPOINT=http://host.docker.internal:9090
BACKUP_S3_REGION=eu-south-2
BACKUP_BUCKET=apex-backups
BACKUP_ACCESS_KEY=drill
BACKUP_SECRET_KEY=drill
BACKUP_PASSPHRASE=$(rnd 32)
DOCKER_NETWORK=$NET
DOCKER_EXTRA_ARGS="--add-host host.docker.internal:host-gateway"
ENV
export BACKUP_ENV="$PWD/backup.env"
"$OLDPWD/deploy/backup.sh"
"$OLDPWD/deploy/restore-drill.sh" | tail -2
echo
echo "STAGING DRILL PASSED"
