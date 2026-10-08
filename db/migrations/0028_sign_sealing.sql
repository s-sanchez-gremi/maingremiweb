-- Signatures app, step S4 (docs/esign-plan.md): sealing a finished request, and the signers' link to the signed copy.
-- Additive and idempotent (every statement is IF NOT EXISTS): the apps of the previous version simply do not use the new columns.

-- A completed request still has no sealed PDF until the seal job has run. These columns let the job retry with a delay, give up
-- visibly after a few tries, and say why; sealed_at is when the file was made.
alter table sign_requests add column if not exists sealed_at timestamptz;
alter table sign_requests add column if not exists seal_attempts integer not null default 0;
alter table sign_requests add column if not exists seal_after timestamptz;      -- do not try again before this moment (also the claim while a worker is sealing)
alter table sign_requests add column if not exists seal_error text;              -- why the last try failed (shown to staff)
create index if not exists sign_requests_unsealed_idx on sign_requests (seal_after) where status = 'completed' and sealed_key is null;

-- The link a signer gets by email to download the signed copy. Like the signing link, only its SHA-256 is stored.
alter table sign_signers add column if not exists download_hash text;
alter table sign_signers add column if not exists download_expires_at timestamptz;
create unique index if not exists sign_signers_download_hash_idx on sign_signers (download_hash) where download_hash is not null;
