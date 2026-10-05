#!/usr/bin/env bash
# Proves the database permissions of db/grants.sql with the REAL restricted users, on a fresh database migrated by the production
# image: the website's user can only READ content (and forms); the CMS admin's user writes content, media, settings and accounts;
# the CRM's user can touch the business tables and cannot touch content or change accounts; none can change the schema; a table
# nobody classified is caught.
# Usage: ./scripts/boundary-drill.sh      (needs docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")/.."
NET=$(docker inspect "$(docker compose ps -q db)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
DB=apex_boundary
PWW="Web-Drill-Pw-5521"; PWC="Crm-Drill-Pw-8841"; PWA="Admin-Drill-Pw-6173"
fail() { echo "FAIL: $*"; exit 1; }
su() { docker compose exec -T db psql -U apex -d "${2:-postgres}" -v ON_ERROR_STOP=1 -qtAc "$1"; }

echo "== a fresh database, the two restricted roles, migrations + permissions applied by the production image"
su "drop database if exists $DB with (force)" >/dev/null
su "create database $DB" >/dev/null
for r in "apex_web:$PWW" "apex_crm:$PWC" "apex_admin:$PWA"; do
  su "do \$\$ begin if not exists (select from pg_roles where rolname = '${r%%:*}') then create role ${r%%:*} login; end if; end \$\$" >/dev/null
  su "alter role ${r%%:*} login password '${r##*:}'" >/dev/null
done
docker build -q -t apex-smoke . >/dev/null
docker run --rm --network "$NET" -e DATABASE_URL="postgres://apex:apex@db:5432/$DB" -e APPLY_GRANTS=1 apex-smoke migrate | tail -2

as() { docker compose exec -T db psql "postgres://$1:$2@localhost:5432/$DB" -v ON_ERROR_STOP=1 -qtAc "$3" 2>&1; }
n=0
allow() { n=$((n+1)); out="$(as "$1" "$2" "$3")" || fail "$1 should be allowed: $3 -> $out"; }
deny()  { n=$((n+1)); if out="$(as "$1" "$2" "$3")"; then fail "$1 should be REFUSED: $3"; fi; grep -qiE "permission denied|must be owner" <<<"$out" || fail "$1: $3 failed for another reason: $out"; }

echo "== apex_web (the public website: read-only on content)"
W() { echo apex_web "$PWW"; }
allow $(W) "select count(*) from entries"
allow $(W) "select count(*) from entry_translations"
allow $(W) "select count(*) from entry_versions"
allow $(W) "select count(*) from settings"
allow $(W) "select count(*) from categories"
allow $(W) "select count(*) from media"
allow $(W) "select count(*) from forms"                      # reads the form definition to draw it
allow $(W) "select count(*) from users"                      # recognises a signed-in staff member (staff bar, preview)
allow $(W) "select count(*) from sessions"
allow $(W) "delete from sessions where false"                # "Surt" in the staff bar ends the session
allow $(W) "select count(*) from heartbeats"                 # the deep health check reads the CMS scheduler's heartbeat
allow $(W) "insert into error_log (fingerprint, message) values ('drill-web', 'x')"
deny  $(W) "update entry_translations set title = title where false"   # content is written by the CMS admin only
deny  $(W) "insert into entries (type) values ('post')"
deny  $(W) "delete from entry_versions where false"
deny  $(W) "update settings set data = data"
deny  $(W) "update categories set slug = slug where false"
deny  $(W) "delete from media where false"
deny  $(W) "update forms set name = name where false"          # forms are the CRM's: read-only here
deny  $(W) "update users set role = role where false"          # accounts are the CMS admin's
deny  $(W) "insert into sessions (id, user_id, expires_at) values ('x', gen_random_uuid(), now())"   # only the admin apps sign people in
deny  $(W) "insert into outbox (kind, payload) values ('email', '{}'::jsonb)"
deny  $(W) "insert into heartbeats (name, at) values ('x', now())"
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

echo "== apex_admin (the CMS admin: content, media, settings, accounts)"
A() { echo apex_admin "$PWA"; }
allow $(A) "select count(*) from entries"
allow $(A) "update entry_translations set title = title where false"
allow $(A) "delete from entry_versions where false"
allow $(A) "update settings set data = data"
allow $(A) "select count(*) from categories"
allow $(A) "delete from media where false"
allow $(A) "select count(*) from forms"                      # the page editor offers forms to place in a page
allow $(A) "update users set role = role where false"         # the CMS admin manages accounts
allow $(A) "delete from sessions where false"
allow $(A) "insert into outbox (kind, payload) values ('email', '{}'::jsonb)"        # needs the id sequence
allow $(A) "insert into error_log (fingerprint, message) values ('drill-admin', 'x')"
allow $(A) "delete from outbox"
allow $(A) "insert into heartbeats (name, at) values ('drill-admin', now()) on conflict (name) do update set at = now()"
deny  $(A) "update forms set name = name where false"          # forms are the CRM's: read-only here
deny  $(A) "select count(*) from leads"
deny  $(A) "select count(*) from contacts"
deny  $(A) "select count(*) from clients"
deny  $(A) "select count(*) from people"
deny  $(A) "select count(*) from erp_entries"
deny  $(A) "select count(*) from members"
deny  $(A) "select count(*) from portal_users"
deny  $(A) "select count(*) from submissions"
deny  $(A) "select count(*) from record_notes"
deny  $(A) "select count(*) from job_seekers"
deny  $(A) "select count(*) from schema_migrations"
deny  $(A) "create table stolen (a int)"
deny  $(A) "drop table entries"

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
