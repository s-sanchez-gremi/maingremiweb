#!/bin/sh
# docker run apex            -> start the server (applies migrations first when AUTO_MIGRATE=1, e.g. on staging)
# docker run apex migrate    -> only apply pending database migrations, then exit (use before a production rollout)
set -e
export MIGRATIONS_DIR=/app/db/migrations
case "${1:-start}" in
  migrate) exec node /app/migrate.mjs ;;
  start)
    if [ "${AUTO_MIGRATE:-0}" = "1" ]; then node /app/migrate.mjs; fi
    exec node /app/apps/web/server.js ;;
  *) exec "$@" ;;
esac
