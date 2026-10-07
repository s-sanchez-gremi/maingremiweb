-- Form analytics (Forms v2, item 9). Additive; nothing changes for a form until people use it.
-- How long a response took, from the visitor's first interaction to sending (taken from the signed time of the bot-check challenge; no cookie, no clock of the visitor).
alter table submissions add column duration_seconds integer check (duration_seconds is null or duration_seconds >= 0);

-- Anonymous drop-off counter: how many page loads reached each question (first focus per page load). Totals only: no day, no address, no cookie, nothing that identifies a person.
create table form_field_reach (
  form_id uuid not null references forms(id) on delete cascade,
  field_id text not null,
  n integer not null default 0,
  primary key (form_id, field_id)
);
