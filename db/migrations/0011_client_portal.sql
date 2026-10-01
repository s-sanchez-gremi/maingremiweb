-- Phase 11: client portal. Portal accounts are a SEPARATE system from staff users (own tables, own cookie, own pages):
-- no staff check can ever admit a client by mistake, and a client session is never a staff session.
create table portal_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,   -- deleting a client (or erasing a contact) removes their access
  email text not null unique,
  name text not null default '',
  password_hash text,                          -- null until the invitation is accepted
  disabled boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create index portal_users_client_idx on portal_users (client_id);

create table portal_sessions (
  id text primary key,                         -- sha256 of the cookie token
  portal_user_id uuid not null references portal_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Invitation and password-reset links: only the hash is stored, single use, expiring.
create table portal_tokens (
  token_hash text primary key,
  portal_user_id uuid not null references portal_users(id) on delete cascade,
  kind text not null check (kind in ('invite', 'reset')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Clients only ever see documents staff have explicitly shared.
alter table project_documents add column shared boolean not null default false;
