-- Phase 12: ERP registry backbone. Apex only REGISTERS suppliers, expenses, income, subscriptions, members and fees;
-- Sage keeps the accounting, the legal invoices, tax, direct-debit files and bank reconciliation.
-- Money is integer cents; VAT rates are basis points (2100 = 21 %). Financial rows never cascade from people/contacts
-- (they must survive an erasure request for the legal retention period): links are "set null" and the name is copied onto the row.

create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('course', 'project', 'general')),
  name text not null,
  project_id uuid references projects(id) on delete set null,
  starts_on date,
  ends_on date,
  budget_cents bigint,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table erp_categories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expense', 'income')),
  name text not null,
  sage_account text not null default '',        -- chart-of-accounts number used in the Sage export
  active boolean not null default true,
  unique (kind, name)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text not null default '',
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table fee_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  annual_cents bigint not null check (annual_cents >= 0),
  quarterly_cents bigint check (quarterly_cents >= 0),   -- null = annual price / 4
  vat_bp int not null default 0,                          -- VAT on the fee (adviser to confirm)
  active boolean not null default true
);

create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text not null default '',
  email text not null default '',
  phone text not null default '',
  status text not null default 'active' check (status in ('active', 'left')),
  joined_on date,
  left_on date,
  tier_id uuid references fee_tiers(id) on delete set null,
  billing_period text not null default 'annual' check (billing_period in ('annual', 'quarterly')),
  contact_id uuid unique references contacts(id) on delete set null,   -- set when converted from a CRM lead
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supplier_id uuid references suppliers(id) on delete set null,
  amount_cents bigint not null check (amount_cents >= 0),
  period text not null default 'annual' check (period in ('monthly', 'quarterly', 'annual')),
  next_renewal date,
  active boolean not null default true,
  category_id uuid references erp_categories(id) on delete set null,
  cost_center_id uuid references cost_centers(id) on delete set null,
  owner_id uuid references users(id) on delete set null,
  notes text not null default ''
);

-- One table for money in and money out; "expenses" and "income" are filtered views of it.
create table erp_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expense', 'income')),
  occurred_on date not null,
  description text not null,
  supplier_id uuid references suppliers(id) on delete set null,
  member_id uuid references members(id) on delete set null,
  counterparty text not null default '',        -- name copy: survives deleting the supplier/member
  category_id uuid references erp_categories(id) on delete set null,
  cost_center_id uuid references cost_centers(id) on delete set null,
  subscription_id uuid references subscriptions(id) on delete set null,
  base_cents bigint not null,
  vat_bp int not null default 0,
  vat_cents bigint not null,
  total_cents bigint not null,
  doc_number text not null default '',          -- supplier invoice number, or the Sage invoice number
  due_on date,
  paid_on date,                                  -- null = not paid yet
  payment_method text not null default '',
  fee_period text not null default '',          -- e.g. '2026' or '2026-T1' for member fees
  file_key text,                                 -- receipt/invoice PDF in the PRIVATE bucket
  file_name text,
  notes text not null default '',
  voided_at timestamptz,                         -- voided rows stay for traceability but are excluded from lists and totals
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = base_cents + vat_cents)
);
create index erp_entries_kind_date_idx on erp_entries (kind, occurred_on desc);
create index erp_entries_cost_center_idx on erp_entries (cost_center_id);
create index erp_entries_member_idx on erp_entries (member_id);
-- a member is charged once per period
create unique index erp_entries_fee_unique_idx on erp_entries (member_id, fee_period) where fee_period <> '' and voided_at is null;
