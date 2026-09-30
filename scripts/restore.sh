#!/usr/bin/env bash
# Restore a dump. Default: into a scratch DB "apex_restore_test" in the local Docker db (never touches "apex").
# Elsewhere: TARGET_DATABASE_URL=... with pg_restore installed.
# Usage: ./scripts/restore.sh file.dump
set -euo pipefail
file="${1:?dump file required}"
if [ -n "${TARGET_DATABASE_URL:-}" ] && command -v pg_restore >/dev/null; then
  pg_restore --clean --if-exists --no-owner -d "$TARGET_DATABASE_URL" "$file"
else
  docker compose exec -T db psql -U apex -d postgres -c "drop database if exists apex_restore_test" -c "create database apex_restore_test"
  docker compose exec -T db pg_restore -U apex --no-owner -d apex_restore_test < "$file"
  echo "restored into scratch database apex_restore_test"
fi
