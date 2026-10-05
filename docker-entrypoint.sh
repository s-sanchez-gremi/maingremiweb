#!/bin/sh
# docker run apex                -> the public website (same as start-web); applies migrations first when AUTO_MIGRATE=1 (e.g. a single container on staging)
# docker run apex start-web      -> the public website (read-only on the database)
# docker run apex start-admin    -> the CMS admin (content, media, settings, users, the scheduler; never migrates)
# docker run apex start-crm      -> the CRM app (never migrates: only one process may, the website's or the deploy's `migrate` step)
# docker run apex migrate        -> only apply pending database migrations, then exit (the deploy script runs this before starting a release)
set -e
export MIGRATIONS_DIR=/app/db/migrations
case "${1:-start}" in
  migrate) exec node /app/migrate.mjs ;;
  start|start-web)
    if [ "${AUTO_MIGRATE:-0}" = "1" ]; then node /app/migrate.mjs; fi
    exec node /app/apps/web/server.js ;;
  start-admin) exec node /app/apps/admin/server.js ;;
  start-crm) exec node /app/apps/crm/server.js ;;
  *) exec "$@" ;;
esac
