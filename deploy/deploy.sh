#!/usr/bin/env bash
# Runs ON THE SERVER, inside the environment directory (compose.yml, .env, Caddyfile next to it).
#   ./deploy.sh <image-tag> [all|web|admin|crm]
# The apps (web = public website, admin = CMS admin, crm = CRM, forms, ERP, portal) come from ONE image but are released independently:
# each has its own service, its own version (APEX_TAG_WEB / APEX_TAG_ADMIN / APEX_TAG_CRM), its own health check and its own rollback.
# "all" means every app service the compose file defines.
# Steps: pull the image, apply pending database migrations (once, before anything starts), start the new version(s),
# wait until each is healthy, warm the website cache. An app that does not become healthy is rolled back to ITS previous
# version automatically; the other app is not touched. Migrations are forward-only and additive, so any app version
# keeps working against the migrated database.
set -euo pipefail
cd "$(dirname "$0")"
TAG="${1:?usage: deploy.sh <image-tag> [all|web|admin|crm]}"
ONLY="${2:-all}"
export COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"   # docker compose reads this itself (several files may be joined with ":")
COMPOSE=(docker compose)
WAIT="${HEALTH_WAIT_SECONDS:-120}"
SERVICES="$("${COMPOSE[@]}" config --services)"   # captured, not piped: `| grep -q` can die of SIGPIPE under pipefail
APPS=(); for s in web admin crm; do if grep -qx "$s" <<<"$SERVICES"; then APPS+=("$s"); fi; done
case "$ONLY" in all) TARGETS=("${APPS[@]}") ;; web|admin|crm) grep -qx "$ONLY" <<<"$SERVICES" || { echo "this stack has no $ONLY service"; exit 2; }; TARGETS=("$ONLY") ;; *) echo "second argument must be all, web, admin or crm"; exit 2 ;; esac

state() { echo ".current-tag-$1"; }
prev() { cat "$(state "$1")" 2>/dev/null || true; }
tagvar() { echo "APEX_TAG_$(tr a-z A-Z <<<"$1")"; }
is_target() { local s; for s in "${TARGETS[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }
# New tag for the services being deployed; the others keep the version they run now (or the new one on a first deploy).
for svc in "${APPS[@]}"; do
  v="$(tagvar "$svc")"
  if is_target "$svc"; then export "$v=$TAG"; else cur="$(prev "$svc")"; export "$v=${cur:-$TAG}"; fi
done

say() { printf '\n== %s\n' "$*"; }
cid() { "${COMPOSE[@]}" ps -q "$1" 2>/dev/null || true; }
healthy() {
  local id status
  id="$(cid "$1")"; [ -n "$id" ] || return 1
  status="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id" 2>/dev/null || true)"
  [ "$status" = "running|healthy" ]
}
alive() { local id; id="$(cid "$1")"; [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null)" = "running" ]; }

if [ "${PULL:-1}" = "1" ]; then say "pull $TAG"; "${COMPOSE[@]}" pull "${TARGETS[@]}"; fi

# A stack that carries its own database (staging) must have it running before migrating; the managed-database stack has no "db" service.
if grep -qx db <<<"$SERVICES"; then
  say "start the database"
  "${COMPOSE[@]}" up -d --wait db
fi

say "apply database migrations (release $TAG)"
# With one database user per app (db/grants.sql), the apps run as restricted users and CANNOT migrate. The owner's connection lives in
# ./.env.migrate (MIGRATE_DATABASE_URL=...), a file only this script reads, so the owner's password never reaches an app container.
MIGRATE_ARGS=()
if [ -f .env.migrate ]; then
  set -a; . ./.env.migrate; set +a
  [ -n "${MIGRATE_DATABASE_URL:-}" ] || { echo ".env.migrate must define MIGRATE_DATABASE_URL"; exit 2; }
  MIGRATE_ARGS=(-e "DATABASE_URL=$MIGRATE_DATABASE_URL" -e APPLY_GRANTS=1)   # re-apply the permissions after every migration
fi
"${COMPOSE[@]}" run --rm --no-deps ${MIGRATE_ARGS[@]+"${MIGRATE_ARGS[@]}"} "${TARGETS[0]}" migrate

for svc in "${TARGETS[@]}"; do say "start $svc $TAG (was: $(prev "$svc" || true))"; done
"${COMPOSE[@]}" up -d --remove-orphans

say "wait for health (up to ${WAIT}s)"
failed=()
for svc in "${TARGETS[@]}"; do
  ok=0
  for i in $(seq 1 "$WAIT"); do
    if healthy "$svc"; then ok=1; break; fi
    # a container that already exited will never become healthy: stop waiting
    if ! alive "$svc" && [ "$i" -gt 5 ]; then break; fi
    sleep 1
  done
  if [ "$ok" = "1" ]; then echo "$TAG" > "$(state "$svc")"; say "healthy: $svc $TAG is live"; else failed+=("$svc"); fi
done

if [ "${#failed[@]}" -gt 0 ]; then
  for svc in "${failed[@]}"; do
    echo "!! $svc $TAG did not become healthy. Last log lines:"; "${COMPOSE[@]}" logs --tail 30 "$svc" || true
    p="$(prev "$svc" || true)"
    if [ -n "$p" ] && [ "$p" != "$TAG" ]; then
      say "rolling back $svc to $p"
      export "$(tagvar "$svc")=$p"   # (the variable, not its value)
      echo "rolled back $svc to $p"
    else
      echo "no previous version of $svc to roll back to"
    fi
  done
  "${COMPOSE[@]}" up -d --remove-orphans   # only the services whose tag changed are recreated
  exit 1
fi

if [ -x ./warm.sh ] && [ -n "${SITE_URL:-$(grep -E '^SITE_URL=' .env 2>/dev/null | cut -d= -f2-)}" ]; then
  SITE_URL="${SITE_URL:-$(grep -E '^SITE_URL=' .env | cut -d= -f2-)}" ./warm.sh || echo "warm-up reported problems (not fatal)"
fi
