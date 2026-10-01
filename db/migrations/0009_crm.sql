-- Phase 9: lead management (status, owner, notes) and contact -> client conversion.
alter table leads add column owner_id uuid references users(id) on delete set null;
alter table leads add constraint leads_status_check check (status in ('new', 'contacted', 'qualified', 'won', 'lost'));
create index leads_status_idx on leads (status, created_at desc);

create table lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,   -- erasing a contact erases their notes
  author_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index lead_notes_lead_idx on lead_notes (lead_id, created_at);

-- A client created from a contact remembers which one (one client per contact).
alter table clients add column contact_id uuid unique references contacts(id) on delete set null;
