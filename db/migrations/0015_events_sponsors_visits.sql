-- R4 of the records engine: events and attendance, sponsors, visits to companies.

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other' check (kind in ('conference', 'training', 'gala', 'networking', 'assembly', 'visit', 'other')),
  status text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  starts_on date,
  ends_on date,
  location text not null default '',
  capacity integer check (capacity is null or capacity >= 0),
  description text not null default '',
  archived_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now()
);
create unique index events_external_ref_key on events (external_ref) where external_ref is not null;
create index events_starts_idx on events (starts_on desc);

create table event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  company_id uuid references clients(id) on delete set null,
  status text not null default 'invited' check (status in ('invited', 'confirmed', 'attended', 'declined', 'no_show')),
  notes text not null default '',
  external_ref text,
  created_at timestamptz not null default now()
);
-- A person attends an event once (rows with no person, e.g. "company X sent someone", may repeat).
create unique index event_attendance_person_key on event_attendance (event_id, person_id) where person_id is not null;
create unique index event_attendance_external_ref_key on event_attendance (external_ref) where external_ref is not null;
create index event_attendance_company_idx on event_attendance (company_id);
create index event_attendance_person_idx on event_attendance (person_id);

create table sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'sponsor' check (kind in ('sponsor', 'collaborator', 'supplier')),
  level text check (level is null or level in ('gold', 'silver', 'bronze', 'other')),
  status text not null default 'prospect' check (status in ('prospect', 'confirmed', 'active', 'ended')),
  year integer check (year is null or year between 1990 and 2200),
  amount_cents bigint,
  company_id uuid references clients(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  notes text not null default '',
  archived_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now()
);
create unique index sponsors_external_ref_key on sponsors (external_ref) where external_ref is not null;

create table visits (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  company_id uuid references clients(id) on delete set null,
  visited_on date,
  kind text not null default 'follow_up' check (kind in ('new_member', 'follow_up', 'commercial', 'other')),
  status text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  owner_id uuid references users(id) on delete set null,
  summary text not null default '',
  follow_up_on date,
  archived_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now()
);
create unique index visits_external_ref_key on visits (external_ref) where external_ref is not null;
create index visits_company_idx on visits (company_id);
