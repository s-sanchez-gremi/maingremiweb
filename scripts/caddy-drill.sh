#!/usr/bin/env bash
# Proves the REAL deploy/Caddyfile for ALL hosts, with stub containers named "web", "admin" and "crm" behind it:
#  - main domain (public website): its few staff endpoints (/admin/bar, /admin/preview) are 404 outside ADMIN_ALLOWED_IPS (and by
#    default), public pages open, and /api/forms/* goes to the CRM app while everything else goes to the website
#  - admin host (CMS): everything is 404 outside the allow-list EXCEPT the page assets, robots.txt, the health check and the scheduler call
#  - crm host: everything is 404 outside the allow-list EXCEPT /portal, the page assets, robots.txt, the health check and the scheduler call
# Usage: ./scripts/caddy-drill.sh (needs Docker)
set -euo pipefail
cd "$(dirname "$0")/.."
NET=apexcaddydrill; PORT="${CADDY_DRILL_PORT:-8443}"
cleanup() { docker rm -f apexdrill-web apexdrill-admin apexdrill-crm apexdrill-caddy >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT; cleanup
fail() { echo "FAIL: $*"; exit 1; }
docker network create "$NET" >/dev/null
for app in web admin crm; do
  docker run -d --rm --name "apexdrill-$app" --network "$NET" --network-alias "$app" caddy:2 caddy respond --listen :3000 "$app-ok" >/dev/null
done

start_caddy() { # $1 = ADMIN_ALLOWED_IPS value ("" = unset)
  docker rm -f apexdrill-caddy >/dev/null 2>&1 || true
  local extra=(); [ -n "$1" ] && extra=(-e "ADMIN_ALLOWED_IPS=$1")
  docker run -d --rm --name apexdrill-caddy --network "$NET" -p "$PORT:443" -e SITE_DOMAIN=localhost -e CRM_DOMAIN=crm.localhost -e ADMIN_DOMAIN=admin.localhost ${extra[@]+"${extra[@]}"} \
    -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 >/dev/null
  for _ in $(seq 80); do [ "$(web /)" = 200 ] && [ "$(crm /portal/login)" = 200 ] && [ "$(adm /robots.txt)" = 200 ] && return 0; sleep 0.5; done
  docker logs apexdrill-caddy 2>&1 | tail -5; fail "caddy did not start (web / = $(web /), crm = $(crm /portal/login), admin = $(adm /robots.txt))"
}
# status code of a path on the main domain / on the admin host / on the crm host (curl pins every name to 127.0.0.1)
web() { curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "https://localhost:$PORT$1" || true; }
adm() { curl -sk -o /dev/null -w '%{http_code}' --max-time 5 --resolve "admin.localhost:$PORT:127.0.0.1" "https://admin.localhost:$PORT$1" || true; }
crm() { curl -sk -o /dev/null -w '%{http_code}' --max-time 5 --resolve "crm.localhost:$PORT:127.0.0.1" "https://crm.localhost:$PORT$1" || true; }
body_web() { curl -sk --max-time 5 "https://localhost:$PORT$1" || true; }
body_adm() { curl -sk --max-time 5 --resolve "admin.localhost:$PORT:127.0.0.1" "https://admin.localhost:$PORT$1" || true; }
body_crm() { curl -sk --max-time 5 --resolve "crm.localhost:$PORT:127.0.0.1" "https://crm.localhost:$PORT$1" || true; }

echo "== default (ADMIN_ALLOWED_IPS empty): staff paths closed, public paths open, on all hosts"
start_caddy ""
for p in /admin /admin/bar /admin/preview/x; do [ "$(web $p)" = 404 ] || fail "web $p should be 404 by default"; done
for p in / /ca /api/health; do [ "$(web $p)" = 200 ] || fail "web $p should stay open"; done
[ "$(body_web /ca)" = "web-ok" ] || fail "the website must be served by the web app"
[ "$(body_web /api/forms/x/submit)" = "crm-ok" ] || fail "/api/forms/* must go to the CRM app"
[ "$(body_web /api/forms/x/challenge)" = "crm-ok" ] || fail "/api/forms/* must go to the CRM app"
for p in /admin /admin/content /admin/media /api/media /api/media/x /; do [ "$(adm $p)" = 404 ] || fail "admin $p should be 404 by default"; done
for p in /_next/static/x.js /robots.txt /api/health /api/cron/tick; do [ "$(adm $p)" = 200 ] || fail "admin $p must stay open (monitors, scheduler)"; done
[ "$(body_adm /robots.txt)" = "admin-ok" ] || fail "the admin host must be served by the CMS admin app"
for p in /admin /admin/leads /admin/erp /api/forms/x/submit /; do [ "$(crm $p)" = 404 ] || fail "crm $p should be 404 by default"; done
for p in /portal/login /portal /portal/file/abc /_next/static/x.js /robots.txt /api/health /api/cron/tick; do [ "$(crm $p)" = 200 ] || fail "crm $p must stay open (clients/monitors)"; done
[ "$(body_crm /portal/login)" = "crm-ok" ] || fail "the crm host must be served by the CRM app"
echo "ok"

echo "== an address that is not on the list"
start_caddy "203.0.113.7 198.51.100.0/24"
for p in /admin /admin/bar /admin/preview/x; do [ "$(web $p)" = 404 ] || fail "web $p should be 404 from a non-listed address"; done
for p in /admin /admin/settings /api/media; do [ "$(adm $p)" = 404 ] || fail "admin $p should be 404 from a non-listed address"; done
for p in /admin /admin/projects; do [ "$(crm $p)" = 404 ] || fail "crm $p should be 404 from a non-listed address"; done
[ "$(web /ca)" = 200 ] && [ "$(crm /portal/login)" = 200 ] && [ "$(adm /api/health)" = 200 ] || fail "public/portal/health paths must stay open"
echo "ok"

echo "== the visitor's address is on the list (the docker gateway, seen from outside the network)"
GW="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}')"
start_caddy "$GW/32 172.16.0.0/12 192.168.0.0/16 10.0.0.0/8 127.0.0.1/32"
[ "$(body_web /admin/bar)" = "web-ok" ] || fail "web /admin/bar should reach the website app from an allowed address"
[ "$(body_adm /admin/content)" = "admin-ok" ] || fail "admin /admin should reach the CMS admin app from an allowed address"
[ "$(adm /api/media)" = 200 ] || fail "/api/media should reach the CMS admin app from an allowed address"
[ "$(body_crm /admin/leads)" = "crm-ok" ] || fail "crm /admin should reach the CRM app from an allowed address"
echo "ok"
echo; echo "CADDY DRILL PASSED"
