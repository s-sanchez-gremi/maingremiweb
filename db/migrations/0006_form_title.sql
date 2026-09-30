-- Public heading of a form, per language (the form's "name" stays an internal admin label).
alter table forms add column title jsonb not null default '{}';
