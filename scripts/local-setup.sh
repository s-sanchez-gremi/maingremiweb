#!/usr/bin/env bash
# One command to run Apex on your own computer (Mac or Linux; on Windows use WSL or follow README by hand).
#   ./scripts/local-setup.sh              prepare everything, then start the app at http://localhost:3000
#   ./scripts/local-setup.sh --no-start   prepare only
# Safe to run again any time (after a git pull, too): it only does what is still missing.
# First admin: asked interactively, or set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 chars) beforehand.
set -euo pipefail
cd "$(dirname "$0")/.."
START=1
for a in "$@"; do case "$a" in --no-start) START=0 ;; *) echo "unknown option $a"; exit 2 ;; esac; done
step() { printf '\n\033[1m=== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

step "checking requirements"
command -v node >/dev/null || fail "Node.js is not installed. Install Node 22 or newer from https://nodejs.org and run this again."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || fail "Node $(node -v) is too old. Install Node 22 or newer from https://nodejs.org."
command -v docker >/dev/null || fail "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop and run this again."
docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Open Docker Desktop, wait until it says it is running, and run this again."
if ! command -v pnpm >/dev/null; then
  corepack enable 2>/dev/null || fail "Could not enable pnpm. Run: sudo corepack enable   (then run this again)"
fi
echo "node $(node -v), $(docker --version), pnpm $(pnpm -v)"

step "configuration"
if [ ! -f .env ]; then cp .env.example .env; echo "created .env from .env.example"; else echo ".env already exists, kept as is"; fi
ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/crm/.env

step "installing dependencies"
pnpm install --frozen-lockfile

step "starting the database, file storage and mail catcher (Docker)"
docker compose up -d --wait

step "updating the database"
pnpm db:migrate

psql_count() { docker compose exec -T db psql -U apex -d apex -tAc "select count(*) from $1" | tr -d '[:space:]'; }

step "demo content"
if [ "$(psql_count entries)" = "0" ]; then pnpm --filter web seed:demo; else echo "content already present, kept as is"; fi

step "admin user"
if [ "$(psql_count users)" = "0" ]; then
  email="${ADMIN_EMAIL:-}"; password="${ADMIN_PASSWORD:-}"
  [ -n "$email" ] || read -rp "Admin email: " email
  while [ "${#password}" -lt 12 ]; do
    read -rsp "Admin password (min 12 characters): " password; echo
    [ "${#password}" -ge 12 ] || echo "Too short, try again."
  done
  PASSWORD="$password" pnpm --filter web user:create "$email" admin
else
  echo "users already exist, kept as is (add more with: PASSWORD=... pnpm --filter web user:create <email> <admin|editor>)"
fi

printf '\n\033[1mReady.\033[0m\n  Site:   http://localhost:3000/ca\n  Admin:  http://localhost:3000/admin   (website + content)\n  CRM:    http://localhost:3001/admin   (contacts, forms, projects, ERP)  portal: http://localhost:3001/portal\n  Mail:   http://localhost:8025\n'
if [ "$START" = 1 ]; then
  printf '\nStarting the app (keep this window open; Ctrl+C stops it)...\n'
  exec pnpm --filter web dev
fi
