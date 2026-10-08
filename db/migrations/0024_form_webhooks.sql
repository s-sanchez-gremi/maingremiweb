-- Webhooks (Forms v2, item 5): a form can tell another system when a response is sent or changed. Additive: nothing happens for a form until staff add an endpoint.
create table form_webhooks (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  url text not null check (length(url) <= 500),
  secret text not null,                       -- signs every delivery (HMAC-SHA256); only staff of the Forms app can see it
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index form_webhooks_form_idx on form_webhooks (form_id);

-- One row per attempt to tell one endpoint about one event, written in the same transaction as the response (so a crash never loses it),
-- sent afterwards with retries like the email outbox. The payload holds personal data: it goes with the response (cascade) and is purged after 30 days.
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references form_webhooks(id) on delete cascade,
  submission_id uuid references submissions(id) on delete cascade,
  event text not null,                        -- response.created, response.updated or ping (the test button)
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  last_status integer,                        -- the HTTP status the endpoint answered with
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index webhook_deliveries_due_idx on webhook_deliveries (status, run_after);
create index webhook_deliveries_hook_idx on webhook_deliveries (webhook_id, created_at desc);
