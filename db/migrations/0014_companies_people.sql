-- R3 of the records engine: Companies and People.
-- Companies REUSES the `clients` table (same ids, so projects, the portal and lead conversion keep working) and gives it the
-- fields of the Notion "Empreses" database. People is a new table linked to a company. ERP members can point at a company.

alter table clients
  add column tax_id text not null default '',
  add column customer_number text not null default '',
  add column member_status text not null default 'prospect' check (member_status in ('member', 'former', 'prospect')),
  add column email_billing text not null default '',
  add column email_other text not null default '',
  add column phone_other text not null default '',
  add column address text not null default '',
  add column postal_code text not null default '',
  add column city text not null default '',
  add column website text not null default '',
  add column activity text not null default '',
  add column services text not null default '',
  add column employees integer check (employees is null or employees >= 0),
  add column founded_year integer check (founded_year is null or founded_year between 1500 and 2200),
  add column gets_magazine boolean not null default false,
  add column parent_company_id uuid references clients(id) on delete set null,
  add column archived_at timestamptz,
  add column external_ref text;

-- One company per tax id (spaces and case ignored): the duplicate check of the import and of every manual save.
create unique index clients_tax_id_key on clients (upper(replace(tax_id, ' ', ''))) where tax_id <> '';
create unique index clients_external_ref_key on clients (external_ref) where external_ref is not null;
create index clients_member_status_idx on clients (member_status);

create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  phone text not null default '',
  role text not null default '',
  company_id uuid references clients(id) on delete set null,
  source text not null default '',
  notes text not null default '',
  archived_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_company_idx on people (company_id);
create unique index people_external_ref_key on people (external_ref) where external_ref is not null;

-- ERP members point at their company (fees and invoices stay in the ERP; the company page shows the link both ways).
alter table members add column company_id uuid references clients(id) on delete set null;
update members m set company_id = c.id
  from clients c
  where m.company_id is null and m.tax_id <> '' and c.tax_id <> ''
    and upper(replace(c.tax_id, ' ', '')) = upper(replace(m.tax_id, ' ', ''));
