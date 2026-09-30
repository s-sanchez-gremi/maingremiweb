#!/usr/bin/env bash
# Tests deploy/backup.sh and deploy/restore-drill.sh against the LOCAL stack (database + S3 mock):
# a real backup restores correctly, and a corrupt backup is caught. Usage: ./scripts/backup-drill.sh
set -euo pipefail
cd "$(dirname "$0")/.."
NET=$(docker inspect "$(docker compose ps -q db)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
DB=apex_backupdrill

echo "== a fresh database, migrated by the production image, with a little data in it"
docker compose exec -T db psql -U apex -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
docker build -q -t apex-smoke . >/dev/null
docker run --rm --network "$NET" -e DATABASE_URL="postgres://apex:apex@db:5432/$DB" apex-smoke migrate >/dev/null
docker compose exec -T db psql -U apex -d "$DB" -v ON_ERROR_STOP=1 -c "insert into categories (slug, names) values ('empresa', '{\"ca\":\"Empresa\"}')" -c "insert into clients (name) values ('Rovellosa')" >/dev/null

cat > "$WORK/backup.env" <<ENV
DATABASE_URL=postgres://apex:apex@db:5432/$DB
BACKUP_S3_ENDPOINT=http://s3:9090
BACKUP_S3_REGION=eu-west-1
BACKUP_BUCKET=apex-backups
BACKUP_ACCESS_KEY=drill
BACKUP_SECRET_KEY=drill
BACKUP_PASSPHRASE=drill-passphrase-$(openssl rand -hex 8)
DOCKER_NETWORK=$NET
ENV
export BACKUP_ENV="$WORK/backup.env"
AWS=(docker run --rm -i --network "$NET" -e AWS_ACCESS_KEY_ID=drill -e AWS_SECRET_ACCESS_KEY=drill -e AWS_DEFAULT_REGION=eu-west-1 -e AWS_EC2_METADATA_DISABLED=true amazon/aws-cli --endpoint-url http://s3:9090)

echo "##### 1. back up the live local database and restore it into a scratch one"
./deploy/backup.sh
./deploy/restore-drill.sh | tail -3

echo; echo "##### 2. the stored backup is encrypted (not readable without the passphrase)"
KEY="$("${AWS[@]}" s3api list-objects-v2 --bucket apex-backups --prefix db/ --query 'sort_by(Contents,&LastModified)[-1].Key' --output text)"
[[ "$KEY" == *.enc ]] || { echo "FAIL: backup not encrypted"; exit 1; }
"${AWS[@]}" s3 cp "s3://apex-backups/$KEY" - > "$WORK/stored"
[ "$(head -c 8 "$WORK/stored")" = "Salted__" ] || { echo "FAIL: stored file is not an encrypted container"; exit 1; }
grep -aq "PGDMP" "$WORK/stored" && { echo "FAIL: database dump header visible in the stored file"; exit 1; }
echo "ok: stored as an encrypted file, no readable dump inside ($KEY)"
if openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:wrong-passphrase -in "$WORK/stored" 2>/dev/null | head -c 5 | grep -aq PGDMP; then echo "FAIL: decrypted with a wrong passphrase"; exit 1; fi
echo "ok: a wrong passphrase cannot read it"

echo; echo "##### 3. a corrupt newest backup must make the drill FAIL (so a silent bad backup cannot hide)"
sleep 2
head -c 4096 /dev/urandom | openssl enc -aes-256-cbc -pbkdf2 -pass "pass:$(grep BACKUP_PASSPHRASE "$BACKUP_ENV" | cut -d= -f2)" | "${AWS[@]}" s3 cp - "s3://apex-backups/db/apex-99990101T000000Z.dump.enc" >/dev/null
if ./deploy/restore-drill.sh >/tmp/drill-bad.log 2>&1; then echo "FAIL: drill passed on a corrupt backup"; exit 1; fi
echo "ok: drill failed on the corrupt backup, as it should"
"${AWS[@]}" s3 rm "s3://apex-backups/db/apex-99990101T000000Z.dump.enc" >/dev/null
echo; echo "BACKUP DRILL PASSED"
