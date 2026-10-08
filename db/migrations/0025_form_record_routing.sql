-- Records as a form destination (Forms v2, item 6): a response can create or update CRM records (a person, an event registration, a labour case, a training
-- request, a job seeker). The Forms app only stores the response and what to do with it; the CRM app does the work through its own records engine
-- (validation, change history, de-duplication), so the Forms app never writes CRM tables. Additive: nothing changes for a form until staff choose this destination.
alter table forms drop constraint forms_destination_check;
alter table forms add constraint forms_destination_check check (destination in ('crm_lead', 'project', 'responses_only', 'records'));
alter table forms add column routing jsonb;                      -- {target, map: {recordField: formFieldId}, fixed: {recordField: value}} for destination 'records'

alter table submissions add column routing_status text check (routing_status in ('pending', 'done', 'failed'));   -- null: this response is not routed
alter table submissions add column routing_attempts integer not null default 0;
alter table submissions add column routed_at timestamptz;
alter table submissions add column routing_error text;
alter table submissions add column routed_records jsonb;         -- [{entity, id, label, action}] what the CRM created or updated
create index submissions_routing_idx on submissions (created_at) where routing_status = 'pending';
