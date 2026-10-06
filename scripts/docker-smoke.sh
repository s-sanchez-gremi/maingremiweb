#!/usr/bin/env bash
# Builds the production image and proves it really works for ALL apps: migrates a FRESH database, starts the website, the CMS admin, the
# CRM app and the Forms app from the same image, serves pages, refuses bad config.
# Needs the local services (docker compose up -d). Works on macOS and Linux (joins the compose network, publishes a port).
# Usage: ./scripts/docker-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGE="${IMAGE:-apex-smoke}"
NAME=apex-smoke-$$
CRM_NAME=apex-smoke-crm-$$
ADMIN_NAME=apex-smoke-admin-$$
FORMS_NAME=apex-smoke-forms-$$
PORT="${SMOKE_PORT:-3300}"; CRM_PORT=$((PORT + 1)); FORMS_PORT=$((PORT + 2)); ADMIN_PORT=$((PORT + 3))
DB=apex_smoke
cleanup() { docker rm -f "$NAME" "$CRM_NAME" "$FORMS_NAME" "$ADMIN_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

NET=$(docker inspect "$(docker compose ps -q db)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
psql_db() { docker compose exec -T db psql -U apex -d "$1" -v ON_ERROR_STOP=1 "${@:2}"; }

echo "== build image"
docker build -q -t "$IMAGE" . >/dev/null

echo "== fresh database and a non-development role (the startup check rejects the local dev password)"
psql_db postgres -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
psql_db postgres -c "drop role if exists smoke" -c "create role smoke login password 'Sm0ke-Pw-7421' superuser" >/dev/null 2>&1 || true

ADMIN_PW="pw-$(openssl rand -hex 10)"
rnd() { openssl rand -hex "$(( ($1 + 1) / 2 ))" | cut -c1-"$1"; }
ENVS=(-e NODE_ENV=production -e APP_ENV=staging -e AUTO_MIGRATE=1
  -e DATABASE_URL="postgres://smoke:Sm0ke-Pw-7421@db:5432/$DB"
  -e SITE_URL="http://localhost:$PORT" -e S3_ENDPOINT=http://s3:9090 -e S3_REGION=eu-west-1 -e S3_BUCKET=apex-media -e S3_PRIVATE_BUCKET=apex-private
  -e S3_PUBLIC_URL=http://localhost:9090/apex-media -e S3_ACCESS_KEY=smoke -e S3_SECRET_KEY="$(rnd 24)"
  -e SMTP_URL=smtp://mail:1025 -e MAIL_FROM="Apex <no-reply@apex.example>" -e CRON_SECRET="$(rnd 32)" -e BOT_SECRET="$(rnd 40)"
  -e INITIAL_ADMIN_EMAIL=first-admin@smoke.test -e INITIAL_ADMIN_PASSWORD="$ADMIN_PW")

echo "== refuses to start with a placeholder secret (and exits, instead of running misconfigured)"
set +e
OUT=$(docker run --rm --network "$NET" "${ENVS[@]}" -e CRON_SECRET=change-me "$IMAGE" 2>&1); CODE=$?
set -e
if [ "$CODE" -ne 0 ] && grep -q "refusing to start" <<<"$OUT"; then echo "ok: website refused (exit $CODE)"; else echo "FAIL: exit=$CODE"; echo "$OUT" | tail -5; exit 1; fi

set +e
OUT=$(docker run --rm --network "$NET" "${ENVS[@]}" -e CRON_SECRET=change-me "$IMAGE" start-crm 2>&1); CODE=$?
set -e
if [ "$CODE" -ne 0 ] && grep -q "refusing to start" <<<"$OUT"; then echo "ok: CRM app refused too (exit $CODE)"; else echo "FAIL: crm exit=$CODE"; echo "$OUT" | tail -5; exit 1; fi

set +e
OUT=$(docker run --rm --network "$NET" "${ENVS[@]}" -e CRON_SECRET=change-me "$IMAGE" start-admin 2>&1); CODE=$?
set -e
if [ "$CODE" -ne 0 ] && grep -q "refusing to start" <<<"$OUT"; then echo "ok: CMS admin refused too (exit $CODE)"; else echo "FAIL: admin exit=$CODE"; echo "$OUT" | tail -5; exit 1; fi

set +e
OUT=$(docker run --rm --network "$NET" "${ENVS[@]}" -e BOT_SECRET=change-me "$IMAGE" start-forms 2>&1); CODE=$?
set -e
if [ "$CODE" -ne 0 ] && grep -q "refusing to start" <<<"$OUT"; then echo "ok: Forms app refuses a placeholder bot secret (exit $CODE)"; else echo "FAIL: forms exit=$CODE"; echo "$OUT" | tail -5; exit 1; fi

echo "== start the website (applies migrations to the fresh database first)"
docker run -d --name "$NAME" --network "$NET" -p "$PORT:3000" "${ENVS[@]}" "$IMAGE" >/dev/null
for i in $(seq 1 60); do curl -fsS "localhost:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; [ "$i" = 60 ] && { docker logs "$NAME" | tail -30; echo "FAIL: did not become healthy"; exit 1; }; done

chk() { local code; code=$(curl -s -o /dev/null -w "%{http_code}" "localhost:$PORT$1"); [ "$code" = "$2" ] || { echo "FAIL: $1 returned $code, expected $2"; docker logs "$NAME" | tail -20; exit 1; }; echo "ok: $1 -> $code"; }
chk /api/health 200
chk /robots.txt 200
chk /ca 200
chk /ca/blog 200
chk /ca/no-existeix 404
chk /admin/login 404                      # the CMS login lives in the admin app, not on the website
chk /admin/bar 401                        # the staff bar's endpoint answers, and says nobody is signed in
chk /sitemap.xml 200
chk /styleguide 404                       # development-only page must not exist in production images
HDRS="$(curl -sI "localhost:$PORT/ca")"
grep -qi "content-security-policy" <<<"$HDRS" && echo "ok: Content-Security-Policy header present" || { echo "FAIL: no Content-Security-Policy header"; exit 1; }
grep -qi "x-content-type-options: nosniff" <<<"$HDRS" && echo "ok: nosniff header present" || { echo "FAIL: no nosniff header"; exit 1; }
N=$(psql_db "$DB" -Atc 'select count(*) from schema_migrations'); [ "$N" -ge 7 ] && echo "ok: $N migrations applied to the fresh database"
# The two native libraries the app cannot work without (image conversion for uploads, password hashing for logins).
docker exec "$NAME" node -e '
const fs = require("fs"), base = "/app/node_modules/.pnpm/";
const load = (prefix, sub) => require(base + fs.readdirSync(base).find((d) => d.startsWith(prefix)) + "/node_modules/" + sub);
(async () => {
  const sharp = load("sharp@", "sharp");
  const out = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#D50032" } }).webp().toBuffer();
  if (out.subarray(8, 12).toString() !== "WEBP") throw new Error("sharp produced no WebP");
  const { hash, verify } = load("@node-rs+argon2@", "@node-rs/argon2");
  if (!(await verify(await hash("contrasenya-de-prova"), "contrasenya-de-prova"))) throw new Error("argon2 failed");
  console.log("ok: native libraries work in the image (sharp WebP conversion, argon2 hashing)");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });'
echo "ok: container health: $(docker inspect -f '{{.State.Health.Status}}' "$NAME")"
docker run --rm --network "$NET" "${ENVS[@]}" "$IMAGE" migrate >/dev/null && echo "ok: 'migrate' command runs and is idempotent"

echo "== start the CMS admin (same image, command start-admin; it never migrates)"
docker run -d --name "$ADMIN_NAME" --network "$NET" -p "$ADMIN_PORT:3000" "${ENVS[@]}" "$IMAGE" start-admin >/dev/null
for i in $(seq 1 60); do curl -fsS "localhost:$ADMIN_PORT/api/health" >/dev/null 2>&1 && break; sleep 1; [ "$i" = 60 ] && { docker logs "$ADMIN_NAME" | tail -30; echo "FAIL: the CMS admin did not become healthy"; exit 1; }; done
chk_admin() { local code; code=$(curl -s -o /dev/null -w "%{http_code}" "localhost:$ADMIN_PORT$1"); [ "$code" = "$2" ] || { echo "FAIL: admin $1 returned $code, expected $2"; docker logs "$ADMIN_NAME" | tail -20; exit 1; }; echo "ok: admin $1 -> $code"; }
chk_admin /api/health 200
chk_admin /admin/login 200
chk_admin /robots.txt 200
chk_admin /ca 404                         # the CMS admin does not serve the public site
AH="$(curl -sI "localhost:$ADMIN_PORT/admin/login")"
grep -qi "x-frame-options: deny" <<<"$AH" && grep -qi "content-security-policy" <<<"$AH" && echo "ok: admin is not frameable and sends a Content-Security-Policy" || { echo "FAIL: admin security headers"; exit 1; }
grep -qi "disallow: /" <<<"$(curl -s "localhost:$ADMIN_PORT/robots.txt")" && echo "ok: admin robots.txt disallows everything"
[ "$(psql_db "$DB" -Atc "select role from users where email = 'first-admin@smoke.test'")" = "admin" ] && echo "ok: first admin created from INITIAL_ADMIN_* on an empty database"
ALOGS="$(docker logs "$ADMIN_NAME" 2>&1)"
if grep -qF "$ADMIN_PW" <<<"$ALOGS"; then echo "FAIL: the admin password is in the logs"; exit 1; else echo "ok: the admin password is not in the logs"; fi
echo "ok: admin container health: $(docker inspect -f '{{.State.Health.Status}}' "$ADMIN_NAME")"

echo "== start the CRM app (same image, command start-crm; it never migrates)"
docker run -d --name "$CRM_NAME" --network "$NET" -p "$CRM_PORT:3000" "${ENVS[@]}" "$IMAGE" start-crm >/dev/null
for i in $(seq 1 60); do curl -fsS "localhost:$CRM_PORT/api/health" >/dev/null 2>&1 && break; sleep 1; [ "$i" = 60 ] && { docker logs "$CRM_NAME" | tail -30; echo "FAIL: the CRM app did not become healthy"; exit 1; }; done
chk_crm() { local code; code=$(curl -s -o /dev/null -w "%{http_code}" "localhost:$CRM_PORT$1"); [ "$code" = "$2" ] || { echo "FAIL: crm $1 returned $code, expected $2"; docker logs "$CRM_NAME" | tail -20; exit 1; }; echo "ok: crm $1 -> $code"; }
chk_crm /api/health 200
chk_crm /admin/login 200
chk_crm /portal/login 200
chk_crm /robots.txt 200
chk_crm /ca 404                           # the CRM app does not serve the public site
chk_crm /api/forms/no-existeix/challenge 404   # the public form API moved to the Forms app
CH="$(curl -sI "localhost:$CRM_PORT/admin/login")"
grep -qi "x-frame-options: deny" <<<"$CH" && grep -qi "content-security-policy" <<<"$CH" && echo "ok: crm is not frameable and sends a Content-Security-Policy" || { echo "FAIL: crm security headers"; exit 1; }
grep -qi "disallow: /" <<<"$(curl -s "localhost:$CRM_PORT/robots.txt")" && echo "ok: crm robots.txt disallows everything"
echo "ok: crm container health: $(docker inspect -f '{{.State.Health.Status}}' "$CRM_NAME")"

echo "== start the Forms app (same image, command start-forms; it never migrates)"
docker run -d --name "$FORMS_NAME" --network "$NET" -p "$FORMS_PORT:3000" "${ENVS[@]}" "$IMAGE" start-forms >/dev/null
for i in $(seq 1 60); do curl -fsS "localhost:$FORMS_PORT/api/health" >/dev/null 2>&1 && break; sleep 1; [ "$i" = 60 ] && { docker logs "$FORMS_NAME" | tail -30; echo "FAIL: the Forms app did not become healthy"; exit 1; }; done
chk_forms() { local code; code=$(curl -s -o /dev/null -w "%{http_code}" "localhost:$FORMS_PORT$1"); [ "$code" = "$2" ] || { echo "FAIL: forms $1 returned $code, expected $2"; docker logs "$FORMS_NAME" | tail -20; exit 1; }; echo "ok: forms $1 -> $code"; }
chk_forms /api/health 200
chk_forms /admin/login 200
chk_forms /robots.txt 200
chk_forms /ca 404                         # the Forms app does not serve the public site
chk_forms /portal/login 404               # nor the client portal
chk_forms /api/forms/no-existeix/challenge 404   # a form that does not exist: a real answer from the Forms app, not a crash
FH="$(curl -sI "localhost:$FORMS_PORT/admin/login")"
grep -qi "x-frame-options: deny" <<<"$FH" && grep -qi "content-security-policy" <<<"$FH" && echo "ok: forms is not frameable and sends a Content-Security-Policy" || { echo "FAIL: forms security headers"; exit 1; }
grep -qi "disallow: /" <<<"$(curl -s "localhost:$FORMS_PORT/robots.txt")" && echo "ok: forms robots.txt disallows everything"
echo "ok: forms container health: $(docker inspect -f '{{.State.Health.Status}}' "$FORMS_NAME")"
echo "SMOKE TEST PASSED"
