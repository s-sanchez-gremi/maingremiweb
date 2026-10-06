#!/usr/bin/env bash
# Proves deploy/deploy.sh does what it promises, using the local Docker services as stand-ins for IONOS, for ALL THREE apps:
#   1. a good release goes live (web, crm and forms)   2. a broken release is rolled back automatically, per app
#   3. the apps are released independently: a bad crm or forms release never touches the others, and deploying one leaves the rest running
#   4. a failed migration aborts without touching the running versions   5. the next good release goes live again
# Usage: ./scripts/deploy-drill.sh      (needs docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
# SAFETY: this drill runs deploy.sh (`up --remove-orphans`) and `down -v`. They act on a whole Compose PROJECT, so the drill must
# ALWAYS use a project of its own: an inherited COMPOSE_PROJECT_NAME (for example set to find your dev stack from a git worktree)
# would otherwise make them remove the containers AND VOLUMES of your local dev database. The inherited name is only used to find
# the dev database, then replaced.
DEV_PROJECT="${COMPOSE_PROJECT_NAME:-}"
dev_compose() { if [ -n "$DEV_PROJECT" ]; then COMPOSE_PROJECT_NAME="$DEV_PROJECT" docker compose "$@"; else env -u COMPOSE_PROJECT_NAME docker compose "$@"; fi; }
NET=$(docker inspect "$(dev_compose ps -q db)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
export COMPOSE_PROJECT_NAME=apexdrill   # the drill's own project (matches compose.test.yml); see SAFETY above
PORT="${DRILL_PORT:-3310}"; CRM_PORT=$((PORT + 1)); FORMS_PORT=$((PORT + 2))
DB=apex_drill
WORK="$(mktemp -d)"
TAGS=(env APEX_TAG_WEB=x APEX_TAG_CRM=x APEX_TAG_FORMS=x)
cleanup() { (cd "$WORK" && "${TAGS[@]}" docker compose -f compose.test.yml down -v >/dev/null 2>&1) || true; rm -rf "$WORK"; }
trap cleanup EXIT
fail() { echo "FAIL: $*"; exit 1; }
served() { curl -fsS "localhost:$PORT/api/health" >/dev/null 2>&1; }
served_crm() { curl -fsS "localhost:$CRM_PORT/api/health" >/dev/null 2>&1; }
served_forms() { curl -fsS "localhost:$FORMS_PORT/api/health" >/dev/null 2>&1; }
running_image() { docker inspect -f '{{.Config.Image}}' "$("${TAGS[@]}" docker compose -f compose.test.yml ps -q "$1")"; }
container_id() { "${TAGS[@]}" docker compose -f compose.test.yml ps -q "$1"; }

echo "== images: good release, a release whose start fails, a release whose migration fails"
docker build -q -t apex-drill:good . >/dev/null
docker tag apex-drill:good apex-drill:good2
docker tag apex-drill:good apex-drill:good3
printf 'FROM apex-drill:good\nENTRYPOINT ["sh","-c","if [ \\"$1\\" = migrate ]; then exit 0; fi; echo broken-start; exit 1","--"]\n' | docker build -q -t apex-drill:badstart - >/dev/null
printf 'FROM apex-drill:good\nENTRYPOINT ["sh","-c","echo migration-failed; exit 1","--"]\n' | docker build -q -t apex-drill:badmigrate - >/dev/null

echo "== a throw-away environment directory"
dev_compose exec -T db psql -U apex -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
dev_compose exec -T db psql -U apex -d postgres -c "drop role if exists smoke" -c "create role smoke login password 'Sm0ke-Pw-7421' superuser" >/dev/null 2>&1 || true
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
  forms:
    image: apex-drill:\${APEX_TAG_FORMS}
    command: ["start-forms"]
    env_file: .env
    environment: { PORT: "3000" }
    ports: ["$FORMS_PORT:3000"]
    networks: [default, local]
networks:
  local: { external: true, name: $NET }
YML
cp deploy/deploy.sh deploy/warm.sh "$WORK/"
cd "$WORK"
run() { PULL=0 COMPOSE_FILE=compose.test.yml HEALTH_WAIT_SECONDS=90 ./deploy.sh "$@"; }

echo; echo "##### 1. first release (all three apps)"
run good >/tmp/drill1.log 2>&1 || { cat /tmp/drill1.log; fail "good release did not deploy"; }
[ "$(cat .current-tag-web)" = good ] && [ "$(cat .current-tag-crm)" = good ] && [ "$(cat .current-tag-forms)" = good ] && served && served_crm && served_forms || fail "good release not live on all apps"
echo "ok: 'good' is live on web, crm and forms"

echo; echo "##### 2. a broken release must roll back ALL apps"
if run badstart >/tmp/drill2.log 2>&1; then fail "a broken release was reported as success"; fi
grep -q "rolling back web to good" /tmp/drill2.log && grep -q "rolling back crm to good" /tmp/drill2.log && grep -q "rolling back forms to good" /tmp/drill2.log || { cat /tmp/drill2.log; fail "no rollback happened"; }
[ "$(cat .current-tag-web)" = good ] && [ "$(cat .current-tag-crm)" = good ] && [ "$(cat .current-tag-forms)" = good ] || fail "state file changed to the broken release"
for i in $(seq 1 60); do served && served_crm && served_forms && break; sleep 1; done
served && served_crm && served_forms || fail "after the rollback the apps are not serving"
[ "$(running_image web)" = "apex-drill:good" ] && [ "$(running_image crm)" = "apex-drill:good" ] && [ "$(running_image forms)" = "apex-drill:good" ] || fail "rollback is not running the old image"
echo "ok: rolled back, the old version is serving on all three"

echo; echo "##### 3. independent releases: deploying one app leaves the others alone"
CRM_BEFORE="$(container_id crm)"; FORMS_BEFORE="$(container_id forms)"
run good2 web >/tmp/drill3a.log 2>&1 || { cat /tmp/drill3a.log; fail "deploying only the website failed"; }
[ "$(cat .current-tag-web)" = good2 ] && [ "$(cat .current-tag-crm)" = good ] && [ "$(cat .current-tag-forms)" = good ] || fail "state after a web-only deploy is wrong"
[ "$(container_id crm)" = "$CRM_BEFORE" ] && served_crm || fail "a website-only deploy restarted or broke the CRM app"
[ "$(container_id forms)" = "$FORMS_BEFORE" ] && served_forms || fail "a website-only deploy restarted or broke the Forms app"
echo "ok: web-only deploy: web=good2, crm and forms untouched (same containers, still serving)"
WEB_BEFORE="$(container_id web)"; FORMS_BEFORE="$(container_id forms)"
if run badstart crm >/tmp/drill3b.log 2>&1; then fail "a broken crm release was reported as success"; fi
grep -q "rolling back crm to good" /tmp/drill3b.log || fail "the broken crm release was not rolled back"
[ "$(container_id web)" = "$WEB_BEFORE" ] && served || fail "a broken CRM release disturbed the website"
[ "$(container_id forms)" = "$FORMS_BEFORE" ] && served_forms || fail "a broken CRM release disturbed the Forms app"
for i in $(seq 1 60); do served_crm && break; sleep 1; done
served_crm && [ "$(running_image crm)" = "apex-drill:good" ] || fail "crm did not return to its previous version"
[ "$(cat .current-tag-web)" = good2 ] && [ "$(cat .current-tag-crm)" = good ] || fail "state changed after a crm-only failure"
echo "ok: a broken crm release rolled back by itself; the website and the Forms app never noticed"
CRM_BEFORE="$(container_id crm)"
if run badstart forms >/tmp/drill3c.log 2>&1; then fail "a broken forms release was reported as success"; fi
grep -q "rolling back forms to good" /tmp/drill3c.log || fail "the broken forms release was not rolled back"
[ "$(container_id web)" = "$WEB_BEFORE" ] && served && [ "$(container_id crm)" = "$CRM_BEFORE" ] && served_crm || fail "a broken Forms release disturbed another app"
for i in $(seq 1 60); do served_forms && break; sleep 1; done
served_forms && [ "$(running_image forms)" = "apex-drill:good" ] || fail "forms did not return to its previous version"
[ "$(cat .current-tag-forms)" = good ] && [ "$(cat .current-tag-crm)" = good ] || fail "state changed after a forms-only failure"
echo "ok: a broken forms release rolled back by itself; the website and the CRM app never noticed"
run good2 forms >/tmp/drill3d.log 2>&1 || { cat /tmp/drill3d.log; fail "deploying only the Forms app failed"; }
[ "$(cat .current-tag-forms)" = good2 ] && [ "$(cat .current-tag-web)" = good2 ] && [ "$(cat .current-tag-crm)" = good ] || fail "state after a forms-only deploy is wrong"
[ "$(container_id web)" = "$WEB_BEFORE" ] && [ "$(container_id crm)" = "$CRM_BEFORE" ] && served && served_crm || fail "a Forms-only deploy touched another app"
echo "ok: forms-only deploy: forms=good2, web and crm untouched"

echo; echo "##### 4. a failing migration aborts before touching the running versions"
if run badmigrate >/tmp/drill4.log 2>&1; then fail "a failed migration was reported as success"; fi
served && served_crm && served_forms || fail "a failed migration took something down"
[ "$(cat .current-tag-web)" = good2 ] && [ "$(cat .current-tag-crm)" = good ] && [ "$(cat .current-tag-forms)" = good2 ] || fail "state changed after a failed migration"
echo "ok: migration failure left all running versions untouched"

echo; echo "##### 5. next good release (all)"
run good3 >/tmp/drill5.log 2>&1 || { cat /tmp/drill5.log; fail "next release did not deploy"; }
[ "$(cat .current-tag-web)" = good3 ] && [ "$(cat .current-tag-crm)" = good3 ] && [ "$(cat .current-tag-forms)" = good3 ] && served && served_crm && served_forms || fail "good3 not live"
echo "ok: 'good3' is live on all three"
echo; echo "DEPLOY DRILL PASSED"
