-- R5 of the records engine: the remaining Notion areas (labour cases, funded training, job seekers) and a province on companies.

alter table clients add column province text not null default '';

create table labour_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company_id uuid references clients(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_on date,
  summary text not null default '',
  archived_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now()
);
create unique index labour_cases_external_ref_key on labour_cases (external_ref) where external_ref is not null;
create index labour_cases_company_idx on labour_cases (company_id);

create table training_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'planned' check (status in ('planned', 'running', 'done', 'cancelled')),
  starts_on date,
  ends_on date,
  hours integer check (hours is null or hours >= 0),
  participants integer check (participants is null or participants >= 0),
  company_id uuid references clients(id) on delete set null,       -- the company it was organised for / with, if any
  cost_center_id uuid references cost_centers(id) on delete set null, -- ERP: what the course costs and brings in
  notes text not null default '',
  archived_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now()
);
create unique index training_courses_external_ref_key on training_courses (external_ref) where external_ref is not null;

-- Job seekers (Borsa de treball): private individuals. The columns that matter for data protection are explicit:
-- when consent was given and until when we may keep the data (the adviser sets the rule; both are visible and filterable).
create table job_seekers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  phone text not null default '',
  profile text not null default '',
  status text not null default 'active' check (status in ('active', 'placed', 'withdrawn')),
  registered_on date,
  consent_on date,
  keep_until date,
  notes text not null default '',
  archived_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now()
);
create unique index job_seekers_external_ref_key on job_seekers (external_ref) where external_ref is not null;
create index job_seekers_keep_until_idx on job_seekers (keep_until);
