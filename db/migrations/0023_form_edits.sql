-- Edit a submitted response through a private link (Forms v2, item 4c). Opt-in per form (off by default).
-- Additive: nothing changes for a form until staff switch allow_edits on, and old rows simply have no edit link.
alter table forms add column allow_edits boolean not null default false;
alter table submissions add column edit_token_hash text unique;   -- sha-256 of the secret in the respondent's link; the secret itself is never stored
alter table submissions add column edited_at timestamptz;          -- the last time the respondent changed it
alter table submissions add column edit_count integer not null default 0;
alter table submissions add column original_answers jsonb;         -- the answers as first sent, kept the first time they are changed
