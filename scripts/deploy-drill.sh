#!/usr/bin/env bash
# Proves deploy/deploy.sh does what it promises, using the local Docker services as stand-ins for IONOS:
#   1. a good release goes live      2. a broken release is rolled back automatically (old version keeps serving)
#   3. a failed migration aborts without touching the running version      4. the next good release goes live again
# Usage: ./scripts/deploy-drill.sh      (needs docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
NET=$(docker inspect "$(docker compose ps -q db)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
PORT="${DRILL_PORT:-3310}"
DB=apex_drill
WORK="$(mktemp -d)"
cleanup() { (cd "$WORK" && docker compose -f compose.test.yml down -v >/dev/null 2>&1) || true; rm -rf "$WORK"; }
trap cleanup EXIT
fail() { echo "FAIL: $*"; exit 1; }
served() { curl -fsS "localhost:$PORT/api/health" >/dev/null 2>&1; }

echo "== images: good release, a release whose start fails, a release whose migration fails"
docker build -q -t apex-drill:good . >/dev/null
docker tag apex-drill:good apex-drill:good2
printf 'FROM apex-drill:good\nENTRYPOINT ["sh","-c","if [ \\"$1\\" = migrate ]; then exit 0; fi; echo broken-start; exit 1","--"]\n' | docker build -q -t apex-drill:badstart - >/dev/null
printf 'FROM apex-drill:good\nENTRYPOINT ["sh","-c","echo migration-failed; exit 1","--"]\n' | docker build -q -t apex-drill:badmigrate - >/dev/null

echo "== a throw-away environment directory"
docker compose exec -T db psql -U apex -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
docker compose exec -T db psql -U apex -d postgres -c "drop role if exists smoke" -c "create role smoke login password 'Sm0ke-Pw-7421' superuser" >/dev/null 2>&1 || true
rnd() { openssl rand -hex "$(( ($1 + 1) / 2 ))" | cut -c1-"$1"; }
cat > "$WORK/.env" <<ENV
NODE_ENV=production
APP_ENV=staging
AUTO_MIGRATE=0
DATABASE_URL=postgres://smoke:Sm0ke-Pw-7421@db:5432/$DB
SITE_URL=http://localhost:$PORT
S3_ENDPOINT=http://s3:9090
S3_REGION=eu-west-1
S3_BUCKET=apex-media
S3_PRIVATE_BUCKET=apex-private
S3_PUBLIC_URL=http://localhost:9090/apex-media
S3_ACCESS_KEY=drill
S3_SECRET_KEY=$(rnd 24)
SMTP_URL=smtp://mail:1025
MAIL_FROM=Apex <no-reply@apex.example>
CRON_SECRET=$(rnd 32)
BOT_SECRET=$(rnd 40)
ENV
cat > "$WORK/compose.test.yml" <<YML
name: apexdrill
services:
  app:
    image: apex-drill:\${APEX_TAG}
    env_file: .env
    environment: { PORT: "3000" }
    ports: ["$PORT:3000"]
    networks: [default, local]
networks:
  local: { external: true, name: $NET }
YML
cp deploy/deploy.sh deploy/warm.sh "$WORK/"
cd "$WORK"
run() { PULL=0 COMPOSE_FILE=compose.test.yml HEALTH_WAIT_SECONDS=90 ./deploy.sh "$@"; }

echo; echo "##### 1. first release"
run good >/tmp/drill1.log 2>&1 || { cat /tmp/drill1.log; fail "good release did not deploy"; }
[ "$(cat .current-tag)" = good ] && served || fail "good release not live"
echo "ok: 'good' is live"

echo; echo "##### 2. broken release must roll back"
if run badstart >/tmp/drill2.log 2>&1; then fail "a broken release was reported as success"; fi
grep -q "rolling back to good" /tmp/drill2.log || { cat /tmp/drill2.log; fail "no rollback happened"; }
[ "$(cat .current-tag)" = good ] || fail "state file changed to the broken release"
for i in $(seq 1 60); do served && break; sleep 1; done
served || fail "after the rollback the site is not serving"
[ "$(docker inspect -f '{{.Config.Image}}' "$(docker compose -f compose.test.yml ps -q app)")" = "apex-drill:good" ] || fail "rollback is not running the old image"
echo "ok: rolled back, the old version is serving"

echo; echo "##### 3. a failing migration aborts before touching the running version"
if run badmigrate >/tmp/drill3.log 2>&1; then fail "a failed migration was reported as success"; fi
served || fail "a failed migration took the site down"
[ "$(cat .current-tag)" = good ] || fail "state changed after a failed migration"
echo "ok: migration failure left the running version untouched"

echo; echo "##### 4. next good release"
run good2 >/tmp/drill4.log 2>&1 || { cat /tmp/drill4.log; fail "next release did not deploy"; }
[ "$(cat .current-tag)" = good2 ] && served || fail "good2 not live"
echo "ok: 'good2' is live"
echo; echo "DEPLOY DRILL PASSED"
