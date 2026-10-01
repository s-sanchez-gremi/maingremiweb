# Plan: the "records engine", our own structured Notion for the CRM

Status: **approved 2026-10-01; R1 in progress.** Owner: Sam (apps/crm). Decisions (2026-10-01): a personalised, structured CRM engine for our use case, definitions in code, **no wiki/free-form pages**; **Borsa de treball is included**; **Companies replaces Clients**.

## 1. What it is (and is not)
- **Is:** one generic engine in `apps/crm` that turns a short **entity definition** (fields, relations, which columns to show, how to search) into a complete set of screens: list (search, filters, sorting, paging, saved views as filters), record page (fields, linked records, notes, files, history), create/edit/delete, CSV export and import. Adding a data type = adding a definition, not building screens. This is the part of Notion we keep: *typed databases with relations and views*.
- **Is not:** a wiki, a page editor, or a tool where staff invent new databases from the browser. Definitions live in code (`apps/crm/lib/records/entities/*.ts`), reviewed in pull requests, so data stays consistent, searchable, exportable and tested. (Changing a definition is a small PR; a UI to design databases can be a later decision.)
- It builds on what we already have: the generic list screen of the ERP (`lib/erp-entities.ts`), `ListSearch`, the CSV export, the unit/e2e patterns. The ERP lists then migrate onto the same engine.

## 2. Field types (one registry, like the form builder)
text, long text, number, money (cents), date, select, multi-select (tags), checkbox, email, phone, url, file, relation to another entity (one or many), and "status" (select with colours). Each type has: database column, validation, input, display, filter, CSV format. Adding a type = one registry entry.

## 3. Record features every entity gets for free
Search (accent-insensitive, across the shown text fields), filters per field, sort, paging, **linked records** both ways (a company shows its people, events attended, visits, notes), **notes and activity** (dated log, who wrote it), **attachments** (private bucket, signed download), a **change history** (who changed what, when), soft delete (archive), CSV export, CSV import with a dry run, permissions through `can()`.

## 4. Storage (simple and fast)
- **Real tables, not one big JSON.** Each entity is a normal Postgres table with typed columns (migrations as always), so search, indexes, constraints and reporting stay plain SQL. Relations are foreign keys or small join tables.
- A thin shared layer: `record_notes`, `record_files`, `record_history` (polymorphic by entity name + record id) so notes/files/history work for every entity without a table each.
- `external_ref` (Notion page id) on every imported entity so imports are repeatable and traceable.

## 5. First entities (from the Notion inventory, see `notion-migration-plan.md`)
1. **Companies** (the 571 "agremiats" and external companies): CIF, customer number, member status, fee state/amount, address, three e-mails, phones, web, logo, activity, services, employees, founding year, magazine, parent company/co-members. Replaces `clients` (migrated) and links to ERP `members`.
2. **People**: name, e-mail, phone, role, company (relation), source.
3. **Events** and **Attendance** (event, date, person, company, checked-in).
4. **Sponsors/Suppliers**: type, level, year, notes (linked to ERP suppliers).
5. **Visits** to member companies, **Training courses/projects** (linked to ERP cost centers), **Labour cases**, **Gala/attendees**.
6. **Job seekers (Borsa de treball)**: included by decision of 2026-10-01. They hold CVs and personal data of people who are not members, so before any import: a privacy notice and legal basis from the adviser, a retention period, access limited to the roles that need it, and erasure on request (see the migration plan).

## 6. Phases (each its own pull request with tests)
- **R1. Engine core (about 4-5 days):** field registry, definition format, list/record/edit screens, search/filter/sort/paging, CSV export. Proven by migrating the ERP simple lists onto it.
- **R2. Shared record features (about 3-4 days):** relations both ways, notes, attachments, change history, archive.
- **R3. Companies and People (about 3-4 days):** definitions, migration from `clients`/`contacts`, member link to the ERP, duplicates by CIF.
- **R4. Events + attendance, sponsors/suppliers, visits (about 3-4 days).**
- **R5. Notion import (about 3-4 days):** read-only importer with dry run on a throwaway database, mapping report with masked samples, one-transaction load, re-runnable.
- **R6. CSV import UI and polish, retire Notion for the migrated areas (about 2 days).**
Rough total: **18-23 working days** for one person.

## 7. Risks and how they are handled
- **Scope creep toward a full Notion:** the definitions-in-code rule and "no wiki" are the guardrails; anything new is a written decision.
- **App size:** the engine replaces much per-screen code (ERP lists, leads/clients lists shrink), so the net growth is smaller than it looks; size is reviewed at each phase.
- **Data protection:** personal data of members' staff and event attendees: privacy notice, retention and erasure must cover the new tables (erasure feature extended to people records; financial links keep their copied names).
- **Migration quality:** dry runs, counts compared with Notion, Notion untouched until sign-off.
