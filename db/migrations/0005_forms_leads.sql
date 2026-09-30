-- Phase 5: form builder + lead pipeline.
alter table forms
  add column slug text,
  add column active boolean not null default true,
  add column confirmation jsonb not null default '{}',   -- thank-you message {ca,es,en}
  add column newsletter jsonb not null default '{}',     -- {enabled, text:{ca,es,en}}
  add column updated_at timestamptz not null default now();
update forms set slug = 'form-' || substr(id::text, 1, 8) where slug is null;
alter table forms alter column slug set not null;
create unique index forms_slug_key on forms (slug);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,                 -- always lowercased
  name text not null default '',
  phone text not null default '',
  company text not null default '',
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,   -- erasing a contact erases their submissions
  answers jsonb not null,                     -- snapshot: [{id,type,label,value}] so later form edits never rewrite history
  locale text not null,
  source_path text not null default '',
  source_entry_id uuid,
  theme text not null default '',
  utm jsonb not null default '{}',
  consent_text text not null default '',      -- the exact wording the person saw
  consent_at timestamptz,
  ip_hash text,                               -- keyed hash, rate limiting only, purged after 24h
  challenge_id text unique,                   -- one-time bot-check token (replay protection)
  created_at timestamptz not null default now()
);
create index submissions_form_idx on submissions (form_id, created_at desc);
create index submissions_ip_idx on submissions (ip_hash, created_at);

create table leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  form_id uuid references forms(id) on delete set null,
  submission_id uuid not null unique references submissions(id) on delete cascade,
  source_path text not null default '',
  source_entry_id uuid,
  theme text not null default '',
  locale text not null,
  utm jsonb not null default '{}',
  status text not null default 'new',
  created_at timestamptz not null default now()
);
create index leads_contact_idx on leads (contact_id, created_at desc);

-- Anonymous per-day counters (no cookies, no personal data) for the completion rate.
create table form_starts (
  form_id uuid not null references forms(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (form_id, day)
);

create table newsletter_optins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  locale text,
  form_id uuid references forms(id) on delete set null,
  source_path text not null default '',
  consent_text text not null,
  consent_at timestamptz not null default now(),
  synced_at timestamptz                       -- set once pushed to the external newsletter tool
);

-- Reliable side effects (emails): written in the same transaction as the submission, sent afterwards with retries.
create table outbox (
  id bigserial primary key,
  kind text not null,                         -- 'email'
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts int not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbox_due_idx on outbox (status, run_after);
