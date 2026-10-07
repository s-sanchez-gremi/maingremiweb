-- Save and resume by link (Forms v2, item 4b). A form can let a visitor save what they have typed and come back with a private link.
-- Additive: forms keep working exactly as before while allow_drafts stays false, and nothing reads form_drafts otherwise.
alter table forms add column allow_drafts boolean not null default false;

create table form_drafts (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  token_hash text not null unique,        -- sha-256 of the secret in the link; the secret itself is never stored
  answers jsonb not null,                 -- what was typed (text answers only; files are never kept), cleaned against the form's fields
  step integer not null default 0,
  locale text not null,
  source_path text not null default '',   -- the page the form was on, so the emailed link opens the same page
  email_hash text,                        -- keyed hash of the address the link was mailed to, only to limit mails per address; the address is not stored
  ip_hash text,                           -- keyed hash of the visitor's address for rate limiting; cleared after 24 h like the one on responses
  challenge_id text unique,               -- the bot-check solution used to create it (single use)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null         -- saved drafts are deleted after this (30 days after the last save)
);
create index form_drafts_form_idx on form_drafts (form_id);
create index form_drafts_expiry_idx on form_drafts (expires_at);
