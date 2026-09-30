-- Minimal Projects module: clients and projects, so forms can attach responses to a record.
-- (The full CRM / ERP / project-manager screens stay a later phase; this is only what the forms need.)
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_client_idx on projects (client_id);

-- A form with destination 'project' attaches every response to ONE target: a project or a client.
alter table forms
  add column target_project_id uuid references projects(id) on delete set null,
  add column target_client_id uuid references clients(id) on delete set null,
  add constraint forms_one_target check (not (target_project_id is not null and target_client_id is not null));

alter table submissions
  add column project_id uuid references projects(id) on delete set null,
  add column client_id uuid references clients(id) on delete set null;
create index submissions_project_idx on submissions (project_id);
create index submissions_client_idx on submissions (client_id);
