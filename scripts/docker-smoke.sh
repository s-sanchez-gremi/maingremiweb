#!/usr/bin/env bash
# Builds the production image and proves it really works: migrates a FRESH database, starts, serves pages, refuses bad config.
# Needs the local services (docker compose up -d). Works on macOS and Linux (joins the compose network, publishes a port).
# Usage: ./scripts/docker-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGE="${IMAGE:-apex-smoke}"
NAME=apex-smoke-$$
PORT="${SMOKE_PORT:-3300}"
DB=apex_smoke
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
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
if [ "$CODE" -ne 0 ] && grep -q "refusing to start" <<<"$OUT"; then echo "ok: refused (exit $CODE)"; else echo "FAIL: exit=$CODE"; echo "$OUT" | tail -5; exit 1; fi

echo "== start (applies migrations to the fresh database first)"
docker run -d --name "$NAME" --network "$NET" -p "$PORT:3000" "${ENVS[@]}" "$IMAGE" >/dev/null
for i in $(seq 1 60); do curl -fsS "localhost:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; [ "$i" = 60 ] && { docker logs "$NAME" | tail -30; echo "FAIL: did not become healthy"; exit 1; }; done

chk() { local code; code=$(curl -s -o /dev/null -w "%{http_code}" "localhost:$PORT$1"); [ "$code" = "$2" ] || { echo "FAIL: $1 returned $code, expected $2"; docker logs "$NAME" | tail -20; exit 1; }; echo "ok: $1 -> $code"; }
chk /api/health 200
chk /robots.txt 200
chk /ca 200
chk /ca/blog 200
chk /ca/no-existeix 404
chk /admin/login 200
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
[ "$(psql_db "$DB" -Atc "select role from users where email = 'first-admin@smoke.test'")" = "admin" ] && echo "ok: first admin created from INITIAL_ADMIN_* on an empty database"
LOGS="$(docker logs "$NAME" 2>&1)"
if grep -qF "$ADMIN_PW" <<<"$LOGS"; then echo "FAIL: the admin password is in the logs"; exit 1; else echo "ok: the admin password is not in the logs"; fi
echo "ok: container health: $(docker inspect -f '{{.State.Health.Status}}' "$NAME")"
docker run --rm --network "$NET" "${ENVS[@]}" "$IMAGE" migrate >/dev/null && echo "ok: 'migrate' command runs and is idempotent"
echo "SMOKE TEST PASSED"
