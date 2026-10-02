-- Database permissions per app (least privilege). Applied by the migration step (APPLY_GRANTS=1) after every migration, as the OWNER.
-- Two login roles, created once by whoever sets up the database (see deploy/ionos/README.md): apex_web (the website + CMS) and
-- apex_crm (CRM, forms, projects, ERP, portal, records). Neither can change the schema; each can only touch its own tables.
-- THE RULE FOR A NEW TABLE: add it to ONE of the lists below in the same pull request as its migration. The check at the end of this
-- file refuses to continue while any table has no permissions, so nobody can forget (and CI runs it).
-- Ownership (docs/split-plan.md section 4): web = content tables; crm = forms (builder, form_starts, newsletter opt-ins) and every
-- business table; shared = users (the website's admin manages accounts), sessions, outbox, heartbeats, error_log.

revoke all on all tables in schema public from apex_web, apex_crm;
revoke all on all sequences in schema public from apex_web, apex_crm;
grant usage on schema public to apex_web, apex_crm;

-- ---- shared by both apps ----
grant select, insert, update, delete on sessions, outbox, heartbeats, error_log to apex_web, apex_crm;

-- the auto-numbered ids of the shared tables (a role that may INSERT into a table with a serial id needs its sequence)
grant usage, select on sequence outbox_id_seq, error_log_id_seq to apex_web, apex_crm;

-- ---- users: accounts are managed in the website's admin; the CRM app reads them and lets a person change THEIR OWN password ----
grant select, insert, update, delete on users to apex_web;
grant select on users to apex_crm;
grant update (password_hash) on users to apex_crm;

-- ---- apex_web: the website and its CMS ----
grant select, insert, update, delete on entries, entry_translations, entry_versions, categories, media, settings to apex_web;
grant select on forms to apex_web;   -- the website only READS a form definition to draw it

-- ---- apex_crm: everything else ----
grant select, insert, update, delete on
  forms, form_starts, newsletter_optins,
  contacts, leads, lead_notes, submissions,
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
    if not has_table_privilege('apex_web', t.oid, 'SELECT') and not has_table_privilege('apex_crm', t.oid, 'SELECT') then
      raise exception 'Table "%" has no permissions: add it to db/grants.sql (web, crm or shared)', t.relname;
    end if;
  end loop;

  -- a role that may insert into a table must also be allowed to use that table's id sequence
  for t in
    select s.oid as seq, s.relname as seqname, d.refobjid as tbl
    from pg_class s join pg_namespace n on n.oid = s.relnamespace join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    where s.relkind = 'S' and n.nspname = 'public'
  loop
    for r in select unnest(array['apex_web', 'apex_crm']) as role loop
      if has_table_privilege(r.role, t.tbl, 'INSERT') and not has_sequence_privilege(r.role, t.seq, 'USAGE') then
        raise exception 'Role % may insert into the table of sequence "%" but cannot use it: grant usage on the sequence in db/grants.sql', r.role, t.seqname;
      end if;
    end loop;
  end loop;
end $$;

