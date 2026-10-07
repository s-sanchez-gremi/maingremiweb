-- One sessions table per app (security hardening). `sessions` stays the CMS admin's (the website only reads it); the CRM, Forms and Signatures
-- apps sign people in to their own tables, written only by their own database role (db/grants.sql), so a compromised app can no longer forge a
-- session that another app accepts. Additive; people signed in to the CRM, Forms or Signatures app must sign in again once (their old rows in
-- `sessions` are no longer looked at by those apps; the cookie of the CMS admin keeps working). Release these apps TOGETHER with the new grants.
create table crm_sessions   (like sessions including all);
create table forms_sessions (like sessions including all);
create table sign_sessions  (like sessions including all);
alter table crm_sessions   add foreign key (user_id) references users (id) on delete cascade;
alter table forms_sessions add foreign key (user_id) references users (id) on delete cascade;
alter table sign_sessions  add foreign key (user_id) references users (id) on delete cascade;
