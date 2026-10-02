-- Suppliers imported from Notion keep their Notion page id (repeatable import, same as the other records).
alter table suppliers add column external_ref text;
create unique index suppliers_external_ref_key on suppliers (external_ref) where external_ref is not null;
