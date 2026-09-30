#!/usr/bin/env bash
# Visit every public page once so it is built and cached. Run after each deploy and every few minutes from cron:
# then even pages nobody has opened yet keep being served if the database is briefly down.
# Usage: SITE_URL=https://example.com ./scripts/warm.sh
set -uo pipefail
base="${SITE_URL:-http://localhost:3000}"
urls=$( { echo "$base/ca"; echo "$base/es"; echo "$base/en"; curl -fsS "$base/sitemap.xml" | grep -oE "<loc>[^<]+</loc>" | sed -E 's#</?loc>##g'; } | sort -u )
ok=0; bad=0
for u in $urls; do
  code=$(curl -s -o /dev/null -L -w "%{http_code}" "$u")
  if [ "$code" = "200" ]; then ok=$((ok+1)); else bad=$((bad+1)); echo "warm: $code $u"; fi
done
echo "warmed $ok pages, $bad problems"
[ "$bad" -eq 0 ]
