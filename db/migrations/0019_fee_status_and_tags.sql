-- Workspace: quota (fee) status on companies, tags (multi-select) on sponsors and attendance, and the sponsor pipeline fields of the Notion sheet.
alter table clients add column fee_status text not null default 'unknown' check (fee_status in ('paid', 'overdue', 'unknown'));

alter table sponsors
  add column event_tags text[] not null default '{}',
  add column contacted boolean not null default false,
  add column last_contact_on date,
  add column contact_email text not null default '',
  add column proposal text not null default '',
  add column follow_up text not null default '';
create index sponsors_event_tags_idx on sponsors using gin (event_tags);

alter table event_attendance
  add column seats text[] not null default '{}',
  add column categories text[] not null default '{}';
create index event_attendance_seats_idx on event_attendance using gin (seats);
