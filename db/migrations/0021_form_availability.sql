-- Form availability and ending (Forms v2, item 4): a form can close on a date, or after a number of responses, and can send the visitor to a page after submitting.
-- Additive: forms keep working exactly as before while these stay empty (no end date, no limit, no redirect).
alter table forms add column closes_at timestamptz;
alter table forms add column max_responses integer check (max_responses is null or max_responses > 0);
alter table forms add column redirect_url text not null default '' check (length(redirect_url) <= 500);
