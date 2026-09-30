#!/usr/bin/env bash
# Proves the REAL deploy/Caddyfile: the config loads, /admin and /api/media answer 404 from an address that is not allowed
# (and by default, when ADMIN_ALLOWED_IPS is empty), are reachable from an allowed one, and public pages stay open.
# A stub container named "app" stands in for the application. Usage: ./scripts/caddy-drill.sh (needs Docker)
set -euo pipefail
cd "$(dirname "$0")/.."
NET=apexcaddydrill; PORT="${CADDY_DRILL_PORT:-8443}"
cleanup() { docker rm -f apexdrill-app apexdrill-caddy >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT; cleanup
fail() { echo "FAIL: $*"; exit 1; }
docker network create "$NET" >/dev/null
docker run -d --rm --name apexdrill-app --network "$NET" --network-alias app caddy:2 caddy respond --listen :3000 "app-ok" >/dev/null

start_caddy() { # $1 = ADMIN_ALLOWED_IPS value ("" = unset)
  docker rm -f apexdrill-caddy >/dev/null 2>&1 || true
  local extra=(); [ -n "$1" ] && extra=(-e "ADMIN_ALLOWED_IPS=$1")
  docker run -d --rm --name apexdrill-caddy --network "$NET" -p "$PORT:443" -e SITE_DOMAIN=localhost ${extra[@]+"${extra[@]}"} \
    -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 >/dev/null
  for _ in $(seq 40); do [ "$(code /)" = 200 ] && return 0; sleep 0.5; done
  docker logs apexdrill-caddy 2>&1 | tail -5; fail "caddy did not start"
}
code() { curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "https://localhost:$PORT$1" || true; }

echo "== default (ADMIN_ALLOWED_IPS empty): staff paths closed, public open"
start_caddy ""
for p in /admin /admin/leads /api/media /api/media/x; do [ "$(code $p)" = 404 ] || fail "$p should be 404 by default"; done
for p in / /ca /api/health /api/forms/x/submit; do [ "$(code $p)" = 200 ] || fail "$p should stay open"; done
echo "ok"

echo "== an address that is not on the list"
start_caddy "203.0.113.7 198.51.100.0/24"
for p in /admin /admin/projects /api/media; do [ "$(code $p)" = 404 ] || fail "$p should be 404 from a non-listed address"; done
[ "$(code /ca)" = 200 ] || fail "public page must stay open"
echo "ok"

echo "== the visitor's address is on the list (the docker gateway, seen from outside the network)"
GW="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}')"
start_caddy "$GW/32 172.16.0.0/12 192.168.0.0/16 10.0.0.0/8 127.0.0.1/32"
[ "$(code /admin)" = 200 ] || fail "/admin should reach the app from an allowed address"
[ "$(code /api/media)" = 200 ] || fail "/api/media should reach the app from an allowed address"
echo "ok"
echo; echo "CADDY DRILL PASSED"
