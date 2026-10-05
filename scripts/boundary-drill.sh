#!/usr/bin/env bash
# Proves the database permissions of db/grants.sql with the REAL restricted users, on a fresh database migrated by the production
# image: the website's user can touch the website's tables and only READ forms; the CRM's user can touch the business tables and
# cannot touch content or change accounts; the Forms app's user touches only the shared tables; neither can change the schema; a table nobody classified is caught.
# Usage: ./scripts/boundary-drill.sh      (needs docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")/.."
NET=$(docker inspect "$(docker compose ps -q db)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
DB=apex_boundary
PWW="Web-Drill-Pw-5521"; PWC="Crm-Drill-Pw-8841"; PWF="Forms-Drill-Pw-3367"
fail() { echo "FAIL: $*"; exit 1; }
su() { docker compose exec -T db psql -U apex -d "${2:-postgres}" -v ON_ERROR_STOP=1 -qtAc "$1"; }

echo "== a fresh database, the two restricted roles, migrations + permissions applied by the production image"
su "drop database if exists $DB with (force)" >/dev/null
su "create database $DB" >/dev/null
for r in "apex_web:$PWW" "apex_crm:$PWC" "apex_forms:$PWF"; do
  su "do \$\$ begin if not exists (select from pg_roles where rolname = '${r%%:*}') then create role ${r%%:*} login; end if; end \$\$" >/dev/null
  su "alter role ${r%%:*} login password '${r##*:}'" >/dev/null
done
docker build -q -t apex-smoke . >/dev/null
docker run --rm --network "$NET" -e DATABASE_URL="postgres://apex:apex@db:5432/$DB" -e APPLY_GRANTS=1 apex-smoke migrate | tail -2

as() { docker compose exec -T db psql "postgres://$1:$2@localhost:5432/$DB" -v ON_ERROR_STOP=1 -qtAc "$3" 2>&1; }
n=0
allow() { n=$((n+1)); out="$(as "$1" "$2" "$3")" || fail "$1 should be allowed: $3 -> $out"; }
deny()  { n=$((n+1)); if out="$(as "$1" "$2" "$3")"; then fail "$1 should be REFUSED: $3"; fi; grep -qiE "permission denied|must be owner" <<<"$out" || fail "$1: $3 failed for another reason: $out"; }

echo "== apex_web (website + CMS)"
W() { echo apex_web "$PWW"; }
allow $(W) "select count(*) from entries"
allow $(W) "update entry_translations set title = title where false"
allow $(W) "delete from entry_versions where false"
allow $(W) "update settings set data = data"
allow $(W) "select count(*) from categories"
allow $(W) "select count(*) from forms"                      # reads the form definition to draw it
allow $(W) "update users set role = role where false"         # the website's admin manages accounts
allow $(W) "delete from sessions where false"
allow $(W) "insert into outbox (kind, payload) values ('email', '{}'::jsonb)"        # needs the id sequence
allow $(W) "insert into error_log (fingerprint, message) values ('drill-web', 'x')"
allow $(W) "delete from outbox"
deny  $(W) "update forms set name = name where false"          # forms are the CRM's: read-only here
deny  $(W) "select count(*) from leads"
deny  $(W) "select count(*) from contacts"
deny  $(W) "select count(*) from clients"
deny  $(W) "select count(*) from people"
deny  $(W) "select count(*) from erp_entries"
deny  $(W) "select count(*) from members"
deny  $(W) "select count(*) from portal_users"
deny  $(W) "select count(*) from submissions"
deny  $(W) "select count(*) from record_notes"
deny  $(W) "select count(*) from job_seekers"
deny  $(W) "select count(*) from schema_migrations"
deny  $(W) "create table stolen (a int)"
deny  $(W) "drop table entries"

echo "== apex_crm (CRM, forms, projects, ERP, portal, records)"
C() { echo apex_crm "$PWC"; }
allow $(C) "select count(*) from users"
allow $(C) "update users set password_hash = password_hash where false"   # a person changes their own password
allow $(C) "update forms set name = name where false"
allow $(C) "update leads set status = status where false"
allow $(C) "update clients set name = name where false"
allow $(C) "update erp_entries set notes = notes where false"
allow $(C) "update people set name = name where false"
allow $(C) "delete from record_history where false"
allow $(C) "update job_seekers set name = name where false"
allow $(C) "delete from portal_sessions where false"
allow $(C) "insert into outbox (kind, payload) values ('email', '{}'::jsonb)"
allow $(C) "insert into error_log (fingerprint, message) values ('drill-crm', 'x')"
allow $(C) "delete from outbox"
deny  $(C) "update users set role = role where false"           # cannot make someone an admin
deny  $(C) "delete from users where false"
deny  $(C) "insert into users (email, name, role, password_hash) values ('x@x.test', 'x', 'admin', 'x')"
deny  $(C) "select count(*) from entries"
deny  $(C) "update entry_translations set title = title where false"
deny  $(C) "update settings set data = data"
deny  $(C) "select count(*) from media"
deny  $(C) "select count(*) from categories"
deny  $(C) "select count(*) from schema_migrations"
deny  $(C) "create table stolen (a int)"
deny  $(C) "drop table clients"
echo "== apex_forms (the Forms app: shared tables only until step F2 moves the forms tables to it)"
F() { echo apex_forms "$PWF"; }
allow $(F) "select count(*) from users"
allow $(F) "update users set password_hash = password_hash where false"
allow $(F) "insert into outbox (kind, payload) values ('email', '{}'::jsonb)"
allow $(F) "insert into error_log (fingerprint, message) values ('drill-forms', 'x')"
allow $(F) "delete from outbox"
deny  $(F) "update users set role = role where false"
deny  $(F) "delete from users where false"
deny  $(F) "select count(*) from entries"
deny  $(F) "select count(*) from leads"
deny  $(F) "select count(*) from clients"
deny  $(F) "select count(*) from schema_migrations"
deny  $(F) "create table stolen (a int)"
echo "ok: $n permission checks behave as designed"

echo "== a table nobody classified is caught (the rule for new tables)"
su "create table stray_table (id int)" "$DB" >/dev/null
if out="$(docker compose exec -T db psql -U apex -d "$DB" -v ON_ERROR_STOP=1 -q < db/grants.sql 2>&1)"; then fail "an unclassified table passed the grants check"; fi
grep -q 'stray_table" has no permissions' <<<"$out" || fail "wrong error for an unclassified table: $out"
su "drop table stray_table" "$DB" >/dev/null
echo "ok: the grants check names the table and refuses to continue"

echo "== applying the permissions again changes nothing (safe to run on every release)"
docker run --rm --network "$NET" -e DATABASE_URL="postgres://apex:apex@db:5432/$DB" -e APPLY_GRANTS=1 apex-smoke migrate | tail -1
allow apex_crm "$PWC" "update clients set name = name where false"
echo; echo "BOUNDARY DRILL PASSED"
