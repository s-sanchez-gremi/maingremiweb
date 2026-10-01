-- Phase 8: our own minimal error log (no third-party service, no personal data) and a heartbeat for the scheduler.
create table error_log (
  id bigserial primary key,
  fingerprint text not null unique,          -- hash of message + first stack frame: the same bug is ONE row with a counter
  message text not null,
  stack text not null default '',
  path text not null default '',             -- route path only, never the query string or request body
  count int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  notified_at timestamptz,
  resolved boolean not null default false
);
create index error_log_open_idx on error_log (resolved, last_seen desc);

create table heartbeats (
  name text primary key,
  at timestamptz not null default now()
);
