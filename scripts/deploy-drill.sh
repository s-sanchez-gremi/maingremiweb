#!/usr/bin/env bash
# Proves deploy/deploy.sh does what it promises, using the local Docker services as stand-ins for IONOS, for BOTH apps:
#   1. a good release goes live (web and crm)   2. a broken release is rolled back automatically, per app
#   3. the two apps are released independently: a bad crm release never touches the website, and deploying one leaves the other running
#   4. a failed migration aborts without touching the running versions   5. the next good release goes live again
# Usage: ./scripts/deploy-drill.sh      (needs docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
NET=$(docker inspect "$(docker compose ps -q db)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
PORT="${DRILL_PORT:-3310}"; CRM_PORT=$((PORT + 1))
DB=apex_drill
WORK="$(mktemp -d)"
cleanup() { (cd "$WORK" && APEX_TAG_WEB=x APEX_TAG_CRM=x docker compose -f compose.test.yml down -v >/dev/null 2>&1) || true; rm -rf "$WORK"; }
trap cleanup EXIT
fail() { echo "FAIL: $*"; exit 1; }
served() { curl -fsS "localhost:$PORT/api/health" >/dev/null 2>&1; }
served_crm() { curl -fsS "localhost:$CRM_PORT/api/health" >/dev/null 2>&1; }
running_image() { docker inspect -f '{{.Config.Image}}' "$(APEX_TAG_WEB=x APEX_TAG_CRM=x docker compose -f compose.test.yml ps -q "$1")"; }
container_id() { APEX_TAG_WEB=x APEX_TAG_CRM=x docker compose -f compose.test.yml ps -q "$1"; }

echo "== images: good release, a release whose start fails, a release whose migration fails"
docker build -q -t apex-drill:good . >/dev/null
docker tag apex-drill:good apex-drill:good2
docker tag apex-drill:good apex-drill:good3
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
  web:
    image: apex-drill:\${APEX_TAG_WEB}
    command: ["start-web"]
    env_file: .env
    environment: { PORT: "3000" }
    ports: ["$PORT:3000"]
    networks: [default, local]
  crm:
    image: apex-drill:\${APEX_TAG_CRM}
    command: ["start-crm"]
    env_file: .env
    environment: { PORT: "3000" }
    ports: ["$CRM_PORT:3000"]
    networks: [default, local]
networks:
  local: { external: true, name: $NET }
YML
cp deploy/deploy.sh deploy/warm.sh "$WORK/"
cd "$WORK"
run() { PULL=0 COMPOSE_FILE=compose.test.yml HEALTH_WAIT_SECONDS=90 ./deploy.sh "$@"; }

echo; echo "##### 1. first release (both apps)"
run good >/tmp/drill1.log 2>&1 || { cat /tmp/drill1.log; fail "good release did not deploy"; }
[ "$(cat .current-tag-web)" = good ] && [ "$(cat .current-tag-crm)" = good ] && served && served_crm || fail "good release not live on both apps"
echo "ok: 'good' is live on web and crm"

echo; echo "##### 2. a broken release must roll back BOTH apps"
if run badstart >/tmp/drill2.log 2>&1; then fail "a broken release was reported as success"; fi
grep -q "rolling back web to good" /tmp/drill2.log && grep -q "rolling back crm to good" /tmp/drill2.log || { cat /tmp/drill2.log; fail "no rollback happened"; }
[ "$(cat .current-tag-web)" = good ] && [ "$(cat .current-tag-crm)" = good ] || fail "state file changed to the broken release"
for i in $(seq 1 60); do served && served_crm && break; sleep 1; done
served && served_crm || fail "after the rollback the apps are not serving"
[ "$(running_image web)" = "apex-drill:good" ] && [ "$(running_image crm)" = "apex-drill:good" ] || fail "rollback is not running the old image"
echo "ok: rolled back, the old version is serving on both"

echo; echo "##### 3. independent releases: deploying one app leaves the other alone"
CRM_BEFORE="$(container_id crm)"
run good2 web >/tmp/drill3a.log 2>&1 || { cat /tmp/drill3a.log; fail "deploying only the website failed"; }
[ "$(cat .current-tag-web)" = good2 ] && [ "$(cat .current-tag-crm)" = good ] || fail "state after a web-only deploy is wrong"
[ "$(container_id crm)" = "$CRM_BEFORE" ] && served_crm || fail "a website-only deploy restarted or broke the CRM app"
echo "ok: web-only deploy: web=good2, crm untouched (same container, still serving)"
WEB_BEFORE="$(container_id web)"
if run badstart crm >/tmp/drill3b.log 2>&1; then fail "a broken crm release was reported as success"; fi
grep -q "rolling back crm to good" /tmp/drill3b.log || fail "the broken crm release was not rolled back"
[ "$(container_id web)" = "$WEB_BEFORE" ] && served || fail "a broken CRM release disturbed the website"
for i in $(seq 1 60); do served_crm && break; sleep 1; done
served_crm && [ "$(running_image crm)" = "apex-drill:good" ] || fail "crm did not return to its previous version"
[ "$(cat .current-tag-web)" = good2 ] && [ "$(cat .current-tag-crm)" = good ] || fail "state changed after a crm-only failure"
echo "ok: a broken crm release rolled back by itself; the website never noticed"

echo; echo "##### 4. a failing migration aborts before touching the running versions"
if run badmigrate >/tmp/drill4.log 2>&1; then fail "a failed migration was reported as success"; fi
served && served_crm || fail "a failed migration took something down"
[ "$(cat .current-tag-web)" = good2 ] && [ "$(cat .current-tag-crm)" = good ] || fail "state changed after a failed migration"
echo "ok: migration failure left both running versions untouched"

echo; echo "##### 5. next good release (both)"
run good3 >/tmp/drill5.log 2>&1 || { cat /tmp/drill5.log; fail "next release did not deploy"; }
[ "$(cat .current-tag-web)" = good3 ] && [ "$(cat .current-tag-crm)" = good3 ] && served && served_crm || fail "good3 not live"
echo "ok: 'good3' is live on both"
echo; echo "DEPLOY DRILL PASSED"
