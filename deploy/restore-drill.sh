#!/usr/bin/env bash
# Proves the latest backup can really be restored: download -> decrypt -> restore into a THROW-AWAY Postgres -> sanity checks.
# Never touches the live database. Run it monthly (and after changing the backup setup). Same backup.env as backup.sh.
set -euo pipefail
# shellcheck disable=SC1090
set -a; source "${BACKUP_ENV:-$(dirname "$0")/backup.env}"; set +a
PG_IMAGE="${PG_IMAGE:-postgres:17}"
NET_ARGS=(); [ -n "${DOCKER_NETWORK:-}" ] && NET_ARGS=(--network "$DOCKER_NETWORK")
# shellcheck disable=SC2206
[ -n "${DOCKER_EXTRA_ARGS:-}" ] && NET_ARGS+=(${DOCKER_EXTRA_ARGS})
ping() { [ -n "${DRILL_PING_URL:-}" ] && curl -fsS -m 10 --retry 3 "${DRILL_PING_URL}$1" >/dev/null 2>&1 || true; }
AWS=(docker run --rm -i "${NET_ARGS[@]}" -e AWS_ACCESS_KEY_ID="$BACKUP_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$BACKUP_SECRET_KEY"
     -e AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-eu-west-1}" -e AWS_EC2_METADATA_DISABLED=true amazon/aws-cli --endpoint-url "$BACKUP_S3_ENDPOINT")
TMP="$(mktemp -d)"; NAME="apex-restore-drill-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
trap 'echo "RESTORE DRILL FAILED" >&2; ping /fail' ERR

KEY="$("${AWS[@]}" s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix db/ --query 'sort_by(Contents,&LastModified)[-1].Key' --output text)"
[ -n "$KEY" ] && [ "$KEY" != "None" ] || { echo "no backups found"; false; }
echo "latest backup: $KEY"
"${AWS[@]}" s3 cp "s3://$BACKUP_BUCKET/$KEY" - > "$TMP/file"
if [[ "$KEY" == *.enc ]]; then
  [ -n "${BACKUP_PASSPHRASE:-}" ] || { echo "backup is encrypted but BACKUP_PASSPHRASE is not set"; false; }
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$TMP/file" -out "$TMP/dump"
else cp "$TMP/file" "$TMP/dump"; fi

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=restored "$PG_IMAGE" >/dev/null
# -h 127.0.0.1: during first start the image runs a TEMPORARY server that only listens on the unix socket and then shuts down;
# a socket check passes too early and the next command hits "database system is shutting down". Only the real server listens on TCP.
for i in $(seq 1 40); do docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres -d restored >/dev/null 2>&1 && break; sleep 1; [ "$i" = 40 ] && { echo "scratch Postgres did not start"; false; }; done
docker exec -i "$NAME" pg_restore -U postgres -d restored --no-owner --exit-on-error < "$TMP/dump"

q() { docker exec "$NAME" psql -U postgres -d restored -Atc "$1"; }
TABLES="$(q "select count(*) from information_schema.tables where table_schema='public'")"
MIGS="$(q "select count(*) from schema_migrations")"
[ "$TABLES" -ge 15 ] || { echo "only $TABLES tables restored"; false; }
[ "$MIGS" -ge 1 ] || { echo "no migration history in the backup"; false; }
echo "restored: $TABLES tables, $MIGS migrations; rows: users=$(q 'select count(*) from users') entries=$(q 'select count(*) from entries') submissions=$(q 'select count(*) from submissions') contacts=$(q 'select count(*) from contacts')"
echo "RESTORE DRILL PASSED ($KEY)"
ping ""
