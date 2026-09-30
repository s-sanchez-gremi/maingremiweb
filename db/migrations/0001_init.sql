-- Phase 1: baseline. Content tables arrive in phase 2.
create table app_meta (key text primary key, value text not null);
insert into app_meta (key, value) values ('default_locale', 'ca');
