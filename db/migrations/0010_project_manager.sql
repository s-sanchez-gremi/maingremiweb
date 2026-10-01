-- Phase 10: project manager (deliberately small): a task list and a document list per project.
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  owner_id uuid references users(id) on delete set null,
  due_date date,
  done_at timestamptz,                         -- null = open
  created_at timestamptz not null default now()
);
create index tasks_project_idx on tasks (project_id);
create index tasks_open_idx on tasks (owner_id, due_date) where done_at is null;

-- A document is a link or a file. Files live in the PRIVATE bucket under projects/<project id>/<document id>.<ext>.
create table project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in ('file', 'link')),
  title text not null,
  url text,                                    -- links
  file_key text,                               -- files
  file_name text,
  mime text,
  size int,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'file' and file_key is not null))
);
create index project_documents_project_idx on project_documents (project_id, created_at desc);
