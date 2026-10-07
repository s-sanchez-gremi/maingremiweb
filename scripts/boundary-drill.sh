#!/usr/bin/env bash
# Proves the database permissions of db/grants.sql with the REAL restricted users, on a fresh database migrated by the production
# image: the website's user can only READ content (and forms); the CMS admin's user writes content, media, settings and accounts;
# the CRM's user can touch the business tables and cannot touch content or change accounts; the Forms app's user touches its own tables
# and the narrow hand-over of a lead to the CRM; none can change the schema; a table nobody classified is caught.
# Usage: ./scripts/boundary-drill.sh      (needs docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")/.."
NET=$(docker inspect "$(docker compose ps -q db)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
DB=apex_boundary
PWW="Web-Drill-Pw-5521"; PWC="Crm-Drill-Pw-8841"; PWF="Forms-Drill-Pw-3367"; PWA="Admin-Drill-Pw-6173"; PWS="Sign-Drill-Pw-4592"
fail() { echo "FAIL: $*"; exit 1; }
su() { docker compose exec -T db psql -U apex -d "${2:-postgres}" -v ON_ERROR_STOP=1 -qtAc "$1"; }

echo "== a fresh database, the restricted roles, migrations + permissions applied by the production image"
su "drop database if exists $DB with (force)" >/dev/null
su "create database $DB" >/dev/null
for r in "apex_web:$PWW" "apex_crm:$PWC" "apex_forms:$PWF" "apex_admin:$PWA" "apex_sign:$PWS"; do
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
deny  $(W) "update forms set name = name where false"          # forms are the Forms app's: read-only here
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
deny  $(W) "select count(*) from form_drafts"                  # what visitors saved is never readable by the website
deny  $(W) "select count(*) from form_webhooks"                 # webhook secrets and deliveries (which hold response data) are not the website's
deny  $(W) "select count(*) from webhook_deliveries"
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
deny  $(A) "update forms set name = name where false"          # forms are the Forms app's: read-only here
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

echo "== apex_crm (CRM, projects, ERP, portal, records)"
C() { echo apex_crm "$PWC"; }
allow $(C) "select count(*) from users"
allow $(C) "update users set password_hash = password_hash where false"   # a person changes their own password
allow $(C) "select count(*) from forms"                      # shows the form of a lead (read-only)
allow $(C) "select count(*) from submissions"                # shows the answers of a lead (read-only)
allow $(C) "update submissions set routing_status = routing_status, routing_attempts = routing_attempts, routed_records = routed_records where false"   # the CRM reports what it created from a form response...
allow $(C) "select id from submissions where routing_status = 'pending' limit 1 for update skip locked"   # ...and claims responses with a row lock
deny  $(C) "update submissions set answers = answers where false"       # ...but can never change the answers, the consent or the edit link
deny  $(C) "update submissions set consent_text = consent_text where false"
deny  $(C) "update submissions set edit_token_hash = edit_token_hash where false"
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
deny  $(C) "update forms set name = name where false"          # forms and their responses belong to the Forms app
deny  $(C) "update submissions set locale = locale where false"
deny  $(C) "delete from submissions where false"
deny  $(C) "select count(*) from form_starts"
deny  $(C) "select count(*) from form_drafts"                  # nor by the CRM: a draft is not a response yet
deny  $(C) "select count(*) from form_webhooks"
deny  $(C) "select count(*) from webhook_deliveries"
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
echo "== apex_forms (the Forms app: forms, responses, and the narrow hand-over of a lead to the CRM)"
F() { echo apex_forms "$PWF"; }
allow $(F) "select count(*) from users"
allow $(F) "update users set password_hash = password_hash where false"
allow $(F) "insert into outbox (kind, payload) values ('email', '{}'::jsonb)"
allow $(F) "insert into error_log (fingerprint, message) values ('drill-forms', 'x')"
allow $(F) "delete from outbox"
allow $(F) "update forms set name = name where false"
allow $(F) "delete from form_starts where false"
allow $(F) "update submissions set locale = locale where false"
allow $(F) "select count(*) from events"                                  # the editor offers an event to sign people up to
allow $(F) "update form_drafts set step = step where false"        # saved progress on long forms belongs to the Forms app
allow $(F) "delete from form_drafts where false"
allow $(F) "update form_webhooks set enabled = enabled where false"       # webhook endpoints and their delivery queue belong to the Forms app
allow $(F) "update webhook_deliveries set attempts = attempts where false"
allow $(F) "select count(*) from projects"                    # destination pickers of the builder
allow $(F) "select count(*) from clients"
# the pipeline's hand-over (decision A): upsert a contact, add a lead, upsert a newsletter opt-in
allow $(F) "insert into forms (name, slug, fields, destination, active) values ('Drill', 'drill-forms-app', '[]'::jsonb, 'crm_lead', true)"
allow $(F) "insert into contacts (email, name) values ('drill@pipeline.test', 'A') on conflict (email) do update set name = excluded.name returning id"
allow $(F) "insert into contacts (email, name) values ('drill@pipeline.test', 'B') on conflict (email) do update set name = excluded.name returning id"
allow $(F) "insert into submissions (id, form_id, contact_id, answers, locale) select '00000000-0000-4000-8000-0000000000d1', f.id, c.id, '[]'::jsonb, 'ca' from forms f, contacts c where f.slug = 'drill-forms-app' and c.email = 'drill@pipeline.test'"
allow $(F) "insert into leads (contact_id, form_id, submission_id, locale) select c.id, f.id, '00000000-0000-4000-8000-0000000000d1', 'ca' from forms f, contacts c where f.slug = 'drill-forms-app' and c.email = 'drill@pipeline.test'"
allow $(F) "insert into newsletter_optins (email, locale, consent_text) values ('drill@pipeline.test', 'ca', 'x') on conflict (email) do update set locale = excluded.locale"
# ...and nothing more: what happens to a lead afterwards, and every other business table, is the CRM's
deny  $(F) "select count(*) from leads"
deny  $(F) "update leads set status = status where false"
deny  $(F) "delete from leads where false"
deny  $(F) "delete from contacts where false"
deny  $(F) "delete from newsletter_optins where false"
deny  $(F) "update clients set name = name where false"
# records created from responses (people, registrations, cases, training, candidates) are written by the CRM app, never by the Forms app
deny  $(F) "update events set name = name where false"
deny  $(F) "update people set name = name where false"
deny  $(F) "insert into people (name) values ('x')"
deny  $(F) "update event_attendance set notes = notes where false"
deny  $(F) "update labour_cases set title = title where false"
deny  $(F) "update training_courses set name = name where false"
deny  $(F) "update job_seekers set name = name where false"
deny  $(F) "update projects set name = name where false"
deny  $(F) "select count(*) from erp_entries"
deny  $(F) "select count(*) from portal_users"
deny  $(F) "update users set role = role where false"
deny  $(F) "delete from users where false"
deny  $(F) "select count(*) from entries"
deny  $(F) "select count(*) from schema_migrations"
deny  $(F) "create table stolen (a int)"
# a form cannot be used to reach what the CRM owns: erasing the contact in the CRM removes the response and the lead (foreign keys cascade as the table owner)
allow $(C) "delete from contacts where email = 'drill@pipeline.test'"
n=$((n+1)); [ "$(su "select count(*) from submissions where id = '00000000-0000-4000-8000-0000000000d1'" "$DB")" = 0 ] || fail "erasing a contact in the CRM left its submission behind"
[ "$(su "select count(*) from leads l join forms f on f.id = l.form_id where f.slug = 'drill-forms-app'" "$DB")" = 0 ] || fail "erasing a contact in the CRM left its lead behind"
su "delete from forms where slug = 'drill-forms-app'" "$DB" >/dev/null
echo "== apex_sign (the Signatures app: shared tables only until step S2 adds its own)"
S() { echo apex_sign "$PWS"; }
allow $(S) "select count(*) from users"
allow $(S) "update users set password_hash = password_hash where false"
allow $(S) "insert into outbox (kind, payload) values ('email', '{}'::jsonb)"
allow $(S) "insert into error_log (fingerprint, message) values ('drill-sign', 'x')"
allow $(S) "delete from outbox"
deny  $(S) "update users set role = role where false"
deny  $(S) "delete from users where false"
deny  $(S) "select count(*) from entries"
deny  $(S) "select count(*) from forms"
deny  $(S) "select count(*) from submissions"
deny  $(S) "select count(*) from leads"
deny  $(S) "select count(*) from clients"
deny  $(S) "select count(*) from schema_migrations"
deny  $(S) "create table stolen (a int)"
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
