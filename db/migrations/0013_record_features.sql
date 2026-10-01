-- R2 of the records engine: notes, files and change history shared by every engine entity, plus archiving.
-- The three tables are polymorphic (entity key + record id, no foreign key): the engine deletes a record's extras when it
-- deletes the record. Authors keep their e-mail copied so the log survives deleting a user.

create table record_notes (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  record_id uuid not null,
  body text not null check (length(body) between 1 and 4000),
  author_id uuid references users(id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index record_notes_record_idx on record_notes (entity, record_id, created_at desc);

create table record_files (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  record_id uuid not null,
  key text not null,                 -- object key in the PRIVATE bucket
  name text not null,
  mime text not null,
  size integer not null,
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index record_files_record_idx on record_files (entity, record_id, created_at desc);

create table record_history (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  record_id uuid not null,
  action text not null check (action in ('create', 'update', 'archive', 'restore')),
  changes jsonb not null default '[]',   -- [{ field, label, from, to }] as shown to people
  user_id uuid references users(id) on delete set null,
  user_name text not null default '',
  created_at timestamptz not null default now()
);
create index record_history_record_idx on record_history (entity, record_id, created_at desc);

-- Archiving instead of deleting (entities flagged `archivable`).
alter table suppliers add column archived_at timestamptz;
alter table members add column archived_at timestamptz;
