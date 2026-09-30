#!/usr/bin/env bash
# Runs ON THE SERVER, inside the environment directory (compose.yml, .env, Caddyfile next to it).
#   ./deploy.sh <image-tag>
# Steps: pull the image, apply pending database migrations, start the new version, wait until it is healthy,
# warm the page cache. If the new version does not become healthy it is rolled back to the previous one automatically.
# Migrations are forward-only and additive, so the previous app version keeps working against the migrated database.
set -euo pipefail
cd "$(dirname "$0")"
TAG="${1:?usage: deploy.sh <image-tag>}"
export COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"   # docker compose reads this itself (several files may be joined with ":")
COMPOSE=(docker compose)
STATE=.current-tag
PREV="$(cat "$STATE" 2>/dev/null || true)"
WAIT="${HEALTH_WAIT_SECONDS:-120}"
export APEX_TAG="$TAG"

say() { printf '\n== %s\n' "$*"; }
healthy() {
  local id status
  id="$("${COMPOSE[@]}" ps -q app 2>/dev/null || true)"
  [ -n "$id" ] || return 1
  status="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id" 2>/dev/null || true)"
  [ "$status" = "running|healthy" ]
}
alive() { local id; id="$("${COMPOSE[@]}" ps -q app 2>/dev/null || true)"; [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null)" = "running" ]; }

if [ "${PULL:-1}" = "1" ]; then say "pull $TAG"; "${COMPOSE[@]}" pull app; fi

# A stack that carries its own database (staging) must have it running before migrating; the managed-database stack has no "db" service.
SERVICES="$("${COMPOSE[@]}" config --services)"   # captured, not piped: `| grep -q` can die of SIGPIPE under pipefail
if grep -qx db <<<"$SERVICES"; then
  say "start the database"
  "${COMPOSE[@]}" up -d --wait db
fi

say "apply database migrations (release $TAG)"
"${COMPOSE[@]}" run --rm --no-deps app migrate

say "start $TAG (was: ${PREV:-nothing})"
"${COMPOSE[@]}" up -d --remove-orphans

say "wait for health (up to ${WAIT}s)"
ok=0
for i in $(seq 1 "$WAIT"); do
  if healthy; then ok=1; break; fi
  # a container that already exited will never become healthy: stop waiting
  if ! alive && [ "$i" -gt 5 ]; then break; fi
  sleep 1
done

if [ "$ok" != "1" ]; then
  echo "!! $TAG did not become healthy. Last log lines:"; "${COMPOSE[@]}" logs --tail 30 app || true
  if [ -n "$PREV" ] && [ "$PREV" != "$TAG" ]; then
    say "rolling back to $PREV"
    export APEX_TAG="$PREV"
    "${COMPOSE[@]}" up -d --remove-orphans
    echo "rolled back to $PREV"
  else
    echo "no previous version to roll back to"
  fi
  exit 1
fi

echo "$TAG" > "$STATE"
say "healthy: $TAG is live"
if [ -x ./warm.sh ] && [ -n "${SITE_URL:-$(grep -E '^SITE_URL=' .env 2>/dev/null | cut -d= -f2-)}" ]; then
  SITE_URL="${SITE_URL:-$(grep -E '^SITE_URL=' .env | cut -d= -f2-)}" ./warm.sh || echo "warm-up reported problems (not fatal)"
fi
