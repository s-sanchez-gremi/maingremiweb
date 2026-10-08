-- Mailing lists kept in Notion (Newsletters, Llistat Escola): one row per address per list. Registry only: nothing is sent from Apex.
-- Consent is NOT known from Notion, so consent_on stays empty until someone verifies the legal basis.
create table mailing_contacts (
  id uuid primary key default gen_random_uuid(),
  list text not null check (list in ('newsletter', 'school')),
  email text not null,
  name text not null default '',
  origin text not null default '',
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'unsubscribed', 'bounced')),
  consent_on date,
  notes text not null default '',
  archived_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now()
);
create unique index mailing_contacts_list_email_key on mailing_contacts (list, lower(email));
create index mailing_contacts_tags_idx on mailing_contacts using gin (tags);
