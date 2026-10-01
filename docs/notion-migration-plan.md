# Plan: moving the Notion CRM into the Apex CRM app

Status: **inventory done (read-only), nothing imported yet.** Owner: Sam. No personal data is stored in this file or in git; the import reads Notion and writes straight to the database.

## 1. What Notion holds (found on 2026-10-01)
| Area in Notion | What it is | Size seen | Fits in the CRM today? |
|---|---|---|---|
| **Agremiats** (database "Agremiats (1)") | The companies: member status (agremiat / COagremiat / Matriu / antic agremiat / NO AGREMIAT), fee status (Corrent pagament / Impagament / Sense dades) and amount, CIF, customer number, address, municipality, province, three e-mail addresses (general, notification, newsletter), phones, web, logo, activity, services, employees, founding year, magazine yes/no, contact person ("Att"), parent company (Matriu) and co-members | **571 rows** (546 paying, 20 unpaid, 5 other) | Mostly: ERP `members` + CRM `clients`; several fields need new columns |
| **Persones** | People linked to companies | page is only a shortcut; the real people data sits in the event/attendance databases below | Contacts |
| **Esdeveniments** (attendance databases) | Who attended which event: person, company, e-mail, phone, event name, date, "check" | at least three databases (2025-26, e.g. "Repaper", "Forum EUDR") | **No**: needs an events + attendance feature |
| **Arxivador** (archive) | Older event/attendance records linking a person to a member company number | 1+ databases | same as above |
| **Patrocinadors / Proveïdors** | Sponsors and suppliers (e.g. ink, machinery, labels), sponsorship notes | dozens of pages | Suppliers (ERP `suppliers`) + notes; sponsorship needs a field/tag |
| **Borsa de treball** | Job-seeker pages (one per person, 2025-26) | many | **Sensitive personal data of private individuals (CVs)**: see section 3 |
| **Laboral**, **Formació bonificada**, **Visites agremiats**, **GALA GRÀFICA 2025**, **Newsletter**, **Fillout** | Work areas: labour matters per company, funded-training courses/projects, visits to members, a gala's attendee list, newsletter drafts, Fillout shortcuts | many pages | Partly: visits/notes → lead/client notes; courses → ERP courses (cost centers); the rest stays in Notion until decided |
| **Manuals / templates** | Notion templates (PRD, brainstorm, onboarding) | few | No: not CRM data |

## 2. Proposed mapping (companies first)
- **Notion company → Apex `clients`** (the company) **and, if it is a member, `members`** (member status, tier/fee, billing). One company, one record in each.
- Fields without a place today: CIF (client has no tax id column), customer number, address (street, postal code, municipality, province), the three e-mail addresses, web, logo, activity description, services, employee count, founding year, magazine flag, parent company, co-members. **Proposal:** add these as columns on `clients` (one additive migration) and keep `members` for fee data. No free-form JSON, so search and exports keep working.
- **Fee status / amount** → ERP: the amount becomes the member's tier (or a custom amount) and the paying/unpaid state becomes pending/paid income entries per period.
- **Persons** (contact people, attendees) → `contacts`, linked to their company.
- **Notes and history** → lead notes / client notes; **tasks** → Tasques.
- Rows are matched by CIF first, then by normalised name, to avoid duplicates; every imported record keeps its Notion page id in a new `external_ref` column so a re-run updates instead of duplicating, and so we can always trace a record back.

## 3. Decisions needed before any import
1. **Borsa de treball (job seekers):** private individuals' CVs and details. Recommended: **do not migrate**; keep it where it is (or archive it) until your legal adviser says under what legal basis and for how long the association may keep it in a new system. If you do want it, import only name, e-mail and the date, never CV files.
2. **Events and attendance:** this is a real feature we do not have (an *event* with an *attendee list* linked to companies and people). Recommended: add a small **Events** module (events, attendance, "who came to what", per company history), then import. Otherwise attendance history is lost.
3. **Sponsors:** model as a tag/type on suppliers or a separate "Patrocinadors" list? (Recommended: type on companies, with sponsorship level and year as fields.)
4. **Duplicates:** the same company appears several times (e.g. in sub-databases). Merge rule: same CIF = same company.
5. **Which Notion areas are in scope** beyond the three databases above (Laboral, Formació bonificada, Visites, Gala)? Each needs its own mapping; I suggest doing companies, people and events first.

## 4. How the import will work (safe by design)
1. **Dry run on a copy:** a script reads Notion (read-only) and loads a **throwaway database**; I report counts per table, rows skipped, duplicates found and field-by-field samples **with names masked**, and you compare with Notion.
2. **You approve the mapping.** Then the same script loads the real database in one transaction (all or nothing), tagged with the Notion id; re-running it only updates.
3. **After the import:** Notion is not changed or deleted; it stays as the fallback and the source of truth until you say otherwise. A final diff checks that the counts match.
4. Files (logos, CVs, attachments) are copied to the private bucket only for the areas you approve; Notion file links expire in minutes, so they are downloaded at import time.
5. Personal data is processed only on this Mac and in the database; nothing is committed to git or sent to any service.

## 5. Order of work
1. Your answers to section 3.
2. Migration: add the missing columns to `clients` and `external_ref`; the **Events** module if approved.
3. Import script, dry run, review, real import for companies/members, then people, then events, then notes.
4. Retire Notion for these areas only when the team agrees.
