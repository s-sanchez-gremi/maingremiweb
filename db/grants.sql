-- Database permissions per app (least privilege). Applied by the migration step (APPLY_GRANTS=1) after every migration, as the OWNER.
-- Five login roles, created once by whoever sets up the database (see deploy/ionos/README.md): apex_web (the public website:
-- READ-ONLY on content), apex_admin (the CMS admin: writes content, media, settings and accounts), apex_crm (CRM, projects, ERP,
-- portal, records) and apex_forms (the Forms app, docs/forms-app-plan.md: the form builder, responses and the public submission
-- pipeline) and apex_sign (the Signatures app, docs/esign-plan.md: owns no table yet, step S2 adds them). None can change the schema; each can only touch its own tables, plus the narrow exceptions below.
-- THE RULE FOR A NEW TABLE: add it to ONE of the lists below in the same pull request as its migration. The check at the end of this
-- file refuses to continue while any table has no permissions, so nobody can forget (and CI runs it).
-- Ownership (docs/split-plan.md section 4, docs/forms-app-plan.md): admin = content tables and accounts; web = none, it only reads
-- them; forms = forms, form_starts, submissions, form_drafts, form_webhooks, webhook_deliveries, form_field_reach; crm = every business table (contacts, leads, newsletter opt-ins, clients, projects,
-- ERP...); shared = sessions, outbox, heartbeats, error_log.

revoke all on all tables in schema public from apex_web, apex_admin, apex_crm, apex_forms, apex_sign;
revoke all on all sequences in schema public from apex_web, apex_admin, apex_crm, apex_forms, apex_sign;
grant usage on schema public to apex_web, apex_admin, apex_crm, apex_forms, apex_sign;

-- ---- shared by the apps that write (the website only reads sessions to recognise staff, and ends a session on sign-out) ----
grant select, insert, update, delete on sessions, outbox, heartbeats, error_log to apex_admin, apex_crm, apex_forms, apex_sign;
grant select, delete on sessions to apex_web;      -- the staff bar and the preview recognise a signed-in person; "Surt" ends the session
grant select on heartbeats to apex_web;            -- the deep health check reads the CMS scheduler's heartbeat
grant select, insert, update on error_log to apex_web;

-- the auto-numbered ids of the shared tables (a role that may INSERT into a table with a serial id needs its sequence)
grant usage, select on sequence outbox_id_seq, error_log_id_seq to apex_admin, apex_crm, apex_forms, apex_sign;
grant usage, select on sequence error_log_id_seq to apex_web;

-- ---- users: accounts are managed in the CMS admin; the other apps only read them (the CRM and Forms apps let a person change THEIR OWN password) ----
grant select, insert, update, delete on users to apex_admin;
grant select on users to apex_web;
grant select on users to apex_crm;
grant update (password_hash) on users to apex_crm;
grant select on users to apex_forms;
grant update (password_hash) on users to apex_forms;   -- a person may change their own password in the Forms app too (same rule as the CRM)
grant select on users to apex_sign;
grant update (password_hash) on users to apex_sign;    -- and in the Signatures app (same rule)

-- ---- apex_admin: the CMS (content, media, categories, settings) ----
grant select, insert, update, delete on entries, entry_translations, entry_versions, categories, media, settings to apex_admin;
grant select on forms to apex_admin;   -- the page editor offers the forms to place in a page

-- ---- apex_web: the public website only READS what the CMS writes ----
grant select on entries, entry_translations, entry_versions, categories, media, settings, forms to apex_web;   -- forms: to draw a form

-- ---- apex_forms: the Forms app ----
grant select, insert, update, delete on forms, form_starts, submissions, form_drafts, form_webhooks, webhook_deliveries, form_field_reach to apex_forms;
grant select on projects, clients to apex_forms;   -- the builder offers them as the destination of a form (it never changes them)
grant select on events to apex_forms;              -- ...and an event as the place a registration form signs people up to (it never changes events)
-- Decision A of docs/forms-app-plan.md: the submission pipeline hands a lead to the CRM by writing these three rows, nothing more.
-- No read of leads, no change of their status or owner, no delete: the CRM owns what happens to a lead afterwards.
grant select, insert, update on contacts to apex_forms;        -- upsert by email (insert ... on conflict do update needs select)
grant insert on leads to apex_forms;
grant select, insert, update on newsletter_optins to apex_forms; -- upsert by email

-- ---- apex_crm: everything else ----
grant select on forms, submissions to apex_crm;   -- leads and attached responses show them; the Forms app owns and changes them
-- The CRM app turns responses of "records" forms into CRM records through its own records engine, and reports back in these columns ONLY
-- (it still cannot change the answers). The Forms app never writes the CRM's tables for these destinations.
grant update (routing_status, routing_attempts, routed_at, routing_error, routed_records) on submissions to apex_crm;
-- (deleting a contact or a form still removes their submissions: foreign-key actions run with the table owner's rights)
grant select, insert, update, delete on
  newsletter_optins,
  contacts, leads, lead_notes,
  clients, people, projects, tasks, project_documents,
  portal_users, portal_sessions, portal_tokens,
  cost_centers, erp_categories, suppliers, fee_tiers, members, subscriptions, erp_entries,
  record_notes, record_files, record_history,
  events, event_attendance, sponsors, visits, labour_cases, training_courses, job_seekers
to apex_crm;

-- ---- nobody but the owner: schema_migrations, app_meta ----

-- Safety net: every table must be classified above (or be one of the two owner-only ones).
do $$
declare t record; r record;
begin
  -- by table id (oid), not by name: a name lookup can trip over tables of other schemas
  for t in
    select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not in ('schema_migrations', 'app_meta')
  loop
    if not has_table_privilege('apex_web', t.oid, 'SELECT') and not has_table_privilege('apex_crm', t.oid, 'SELECT') and not has_table_privilege('apex_forms', t.oid, 'SELECT') and not has_table_privilege('apex_admin', t.oid, 'SELECT') and not has_table_privilege('apex_sign', t.oid, 'SELECT') then
      raise exception 'Table "%" has no permissions: add it to db/grants.sql (web, admin, crm, forms, sign or shared)', t.relname;
    end if;
  end loop;

  -- a role that may insert into a table must also be allowed to use that table's id sequence
  for t in
    select s.oid as seq, s.relname as seqname, d.refobjid as tbl
    from pg_class s join pg_namespace n on n.oid = s.relnamespace join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    where s.relkind = 'S' and n.nspname = 'public'
  loop
    for r in select unnest(array['apex_web', 'apex_admin', 'apex_crm', 'apex_forms', 'apex_sign']) as role loop
      if has_table_privilege(r.role, t.tbl, 'INSERT') and not has_sequence_privilege(r.role, t.seq, 'USAGE') then
        raise exception 'Role % may insert into the table of sequence "%" but cannot use it: grant usage on the sequence in db/grants.sql', r.role, t.seqname;
      end if;
    end loop;
  end loop;
end $$;

