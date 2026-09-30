#!/usr/bin/env bash
# Independent, off-platform backup of the database: dump -> verify it is readable -> encrypt -> upload to a PRIVATE S3 bucket.
# (IONOS Managed PostgreSQL also keeps its own backups; this one is ours, in a different place, under our control.)
# Run daily from cron with: BACKUP_ENV=/srv/apex/production/backup.env /srv/apex/production/backup.sh
# backup.env: DATABASE_URL, BACKUP_S3_ENDPOINT, BACKUP_S3_REGION, BACKUP_BUCKET, BACKUP_ACCESS_KEY, BACKUP_SECRET_KEY,
#             BACKUP_PASSPHRASE (strongly recommended: dumps contain personal data), RETENTION_DAYS (default 30),
#             BACKUP_PING_URL (optional dead-man's-switch / uptime-monitor URL), DOCKER_NETWORK (optional), PG_IMAGE (default postgres:17)
set -euo pipefail
# shellcheck disable=SC1090
set -a; source "${BACKUP_ENV:-$(dirname "$0")/backup.env}"; set +a
PG_IMAGE="${PG_IMAGE:-postgres:17}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
NET_ARGS=(); [ -n "${DOCKER_NETWORK:-}" ] && NET_ARGS=(--network "$DOCKER_NETWORK")
# shellcheck disable=SC2206
[ -n "${DOCKER_EXTRA_ARGS:-}" ] && NET_ARGS+=(${DOCKER_EXTRA_ARGS})
ping() { [ -n "${BACKUP_PING_URL:-}" ] && curl -fsS -m 10 --retry 3 "${BACKUP_PING_URL}$1" >/dev/null 2>&1 || true; }
AWS=(docker run --rm -i "${NET_ARGS[@]}" -e AWS_ACCESS_KEY_ID="$BACKUP_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$BACKUP_SECRET_KEY"
     -e AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-eu-west-1}" -e AWS_EC2_METADATA_DISABLED=true amazon/aws-cli --endpoint-url "$BACKUP_S3_ENDPOINT")
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
trap 'echo "BACKUP FAILED" >&2; ping /fail' ERR
ping /start

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker run --rm "${NET_ARGS[@]}" "$PG_IMAGE" pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > "$TMP/dump"
[ "$(wc -c < "$TMP/dump")" -gt 1024 ] || { echo "dump is suspiciously small"; false; }
# Readable and non-empty. (Capture first: `pg_restore | grep -q` can die of SIGPIPE when grep quits early, and pipefail would fail a good backup.)
LIST="$(docker run --rm -i "$PG_IMAGE" pg_restore --list < "$TMP/dump")"
grep -q "TABLE DATA" <<<"$LIST" || { echo "dump has no table data"; false; }

KEY="db/apex-$STAMP.dump"; FILE="$TMP/dump"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$TMP/dump" -out "$TMP/dump.enc"
  KEY="$KEY.enc"; FILE="$TMP/dump.enc"
else
  echo "WARNING: BACKUP_PASSPHRASE is not set: this backup is stored UNENCRYPTED" >&2
fi

"${AWS[@]}" s3 cp - "s3://$BACKUP_BUCKET/$KEY" < "$FILE" >/dev/null
REMOTE="$("${AWS[@]}" s3api head-object --bucket "$BACKUP_BUCKET" --key "$KEY" --query ContentLength --output text)"
[ "$REMOTE" = "$(wc -c < "$FILE" | tr -d ' ')" ] || { echo "uploaded size differs"; false; }
echo "backup ok: s3://$BACKUP_BUCKET/$KEY ($REMOTE bytes)"

# Retention: drop backups older than RETENTION_DAYS (keeps at least the newest 3 whatever their age).
CUTOFF="$(date -u -d "-$RETENTION_DAYS days" +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y-%m-%dT%H:%M:%S)"
"${AWS[@]}" s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix db/ --query 'Contents[].[LastModified,Key]' --output text 2>/dev/null \
  | sort -r | tail -n +4 | while read -r modified key; do
      [ -n "$key" ] && [[ "$modified" < "$CUTOFF" ]] && { "${AWS[@]}" s3 rm "s3://$BACKUP_BUCKET/$key" >/dev/null; echo "pruned $key"; }
    done || true
ping ""
