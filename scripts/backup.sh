#!/usr/bin/env bash
# Dump the database. Local: uses the Docker db container. Elsewhere: set DATABASE_URL and have pg_dump installed.
# Usage: ./scripts/backup.sh [outfile]
set -euo pipefail
out="${1:-backups/apex-$(date +%Y%m%d-%H%M%S).dump}"
mkdir -p "$(dirname "$out")"
if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump >/dev/null; then
  pg_dump --format=custom --no-owner "$DATABASE_URL" > "$out"
else
  docker compose exec -T db pg_dump -U apex --format=custom --no-owner apex > "$out"
fi
echo "backup written: $out"
