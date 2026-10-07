-- Signatures app (docs/esign-plan.md, step S2): documents to sign, requests, signers, fields, an append-only audit log and consents.
-- Additive: nothing else reads these tables yet, so every app version works with or without them.

-- The PDF to be signed. The original is kept untouched in the private bucket; its SHA-256 is checked again before sealing (S4).
create table sign_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  file_key text not null,                          -- private bucket: sign/<id>/original.pdf
  file_name text not null,
  size integer not null check (size > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer not null check (page_count between 1 and 100),
  pages jsonb not null,                            -- [{ "w": points, "h": points }] per page, rotation applied: the placement preview and the stamping use them
  -- optional link to a record of the CRM; deleting the record never deletes the document
  company_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table sign_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references sign_documents(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'sent', 'completed', 'declined', 'expired', 'voided')),
  locale text not null default 'ca' check (locale in ('ca', 'es', 'en')),
  message text not null default '' check (length(message) <= 2000),
  expires_at timestamptz,
  ordered boolean not null default false,          -- signers sign one after the other, in position order
  sealed_key text,                                  -- the sealed PDF (S4)
  sealed_sha256 text check (sealed_sha256 is null or sealed_sha256 ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz,
  completed_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index sign_requests_document_idx on sign_requests (document_id);
create index sign_requests_status_idx on sign_requests (status, expires_at);

create table sign_signers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references sign_requests(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  email text not null check (length(email) between 3 and 254),
  position integer not null default 0,
  token_hash text unique,                           -- only the hash of the single-use link is stored; set when the request is sent (S3)
  status text not null default 'pending' check (status in ('pending', 'opened', 'signed', 'declined')),
  signed_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index sign_signers_email_idx on sign_signers (request_id, lower(email));
create index sign_signers_request_idx on sign_signers (request_id, position);

-- A place on a page, in percent of the page (0 to 100), so it does not depend on the page size.
create table sign_fields (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references sign_requests(id) on delete cascade,
  signer_id uuid not null references sign_signers(id) on delete cascade,
  kind text not null check (kind in ('signature', 'initials', 'date', 'text')),
  page integer not null check (page >= 1),
  x numeric(6, 3) not null check (x >= 0 and x <= 100),
  y numeric(6, 3) not null check (y >= 0 and y <= 100),
  w numeric(6, 3) not null check (w > 0 and w <= 100),
  h numeric(6, 3) not null check (h > 0 and h <= 100),
  required boolean not null default true,
  value_text text,                                  -- what the signer typed or the date they signed (S3)
  value_key text,                                   -- a drawn signature, as an image in the private bucket (S3)
  created_at timestamptz not null default now(),
  check (x + w <= 100.0001 and y + h <= 100.0001)
);
create index sign_fields_request_idx on sign_fields (request_id);
create index sign_fields_signer_idx on sign_fields (signer_id);

-- The audit trail. Append-only: the Signatures app's database user may INSERT and SELECT, never UPDATE or DELETE (db/grants.sql);
-- rows only disappear with their request (cascade) or when a contact is erased.
create table sign_events (
  id bigserial primary key,
  request_id uuid not null references sign_requests(id) on delete cascade,
  signer_id uuid references sign_signers(id) on delete set null,
  kind text not null check (kind in ('created', 'sent', 'opened', 'consented', 'signed', 'declined', 'reminded', 'voided', 'expired', 'sealed', 'downloaded')),
  at timestamptz not null default now(),
  ip_hash text,                                     -- keyed hash of the address, purged under the retention rule
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  detail jsonb not null default '{}'::jsonb
);
create index sign_events_request_idx on sign_events (request_id, at);

-- The exact consent wording shown to a signer and when they accepted it (S3).
create table sign_consents (
  id uuid primary key default gen_random_uuid(),
  signer_id uuid not null references sign_signers(id) on delete cascade,
  locale text not null check (locale in ('ca', 'es', 'en')),
  text text not null,
  at timestamptz not null default now()
);
create index sign_consents_signer_idx on sign_consents (signer_id);
