# Importing the Notion CRM into Apex (R5)

Notion is only **read**, never changed. The import runs on your Mac, straight from Notion to your database: nothing is committed to git and nothing goes through any other service. Always do a **dry run first**.

## 1. One-time setup in Notion (you)
1. Notion → **Settings → Connections → Develop or manage integrations → New integration** (internal). Give it *read content* only. Copy the **secret**.
2. Open each database to import → **⋯ → Connections → add the integration**. Sharing a parent page shares its databases. (The 404 error "is it shared with the integration?" means one was missed.)
3. Copy each database's id: the 32-character code in its URL (before `?v=`).
4. Put these in the project's `.env` (never in git):

```
NOTION_TOKEN=secret_...
NOTION_DB_COMPANIES=<id>,<id>      # every copy of Agremiats / Empreses (duplicates are merged by CIF)
NOTION_DB_FORMER=<id>              # "Baixa agremiat": former members (every row becomes Exagremiada; a company also listed as a current member is left unchanged and counted)
NOTION_DB_EXTERNAL=<id>            # "Externes": non-member companies (names, websites…); no ERP member or fee records are created for them
NOTION_DB_GALA=<id>
NOTION_DB_VISITS=<id>              # "Visites agremiats"
NOTION_DB_LABOUR=<id>              # Laboral (optional)
NOTION_DB_TRAINING=<id>            # Formació bonificada (optional)
NOTION_DB_SPONSORS=<id>            # Patrocinadors (optional)
NOTION_DB_JOBSEEKERS=<id>          # Borsa de treball (optional, see "Job seekers")
```

## 2. Dry run on a copy (recommended), then the real run
```
pnpm --filter crm notion:import --dry-run          # runs everything, then rolls back, prints the report
pnpm --filter crm notion:import                    # the real import, one transaction (all or nothing)
```
Options: `--min-tier 5` (a fee amount shared by at least this many member companies becomes a fee tier; one-off amounts stay in that member's notes), `--only companies,gala` (some areas), `--no-erp` (skip ERP members and fee tiers), `--overwrite` (replace values with Notion's; default only **fills blanks**, so edits made in Apex are kept).
Safest first run: point `DATABASE_URL` at a throwaway database (`createdb apex_import_test`, `pnpm db:migrate`), dry-run, run for real there, look at the workspace, compare counts with Notion, then run against the real database. Re-running is safe: every imported record keeps its Notion page id (`external_ref`), so it updates instead of duplicating.

## 3. What goes where
| Notion | Apex |
|---|---|
| Agremiats / Empreses | **Companies** (name, CIF, customer no., status, 3 e-mails, phones, address, postal code, town, province, web, activity, services, employees, founded, magazine, parent company). Status: *agremiat, COagremiat, Matriu* → Agremiada; *antic agremiat* → Exagremiada; *NO AGREMIAT* → No agremiada. Same CIF (spaces/case ignored) = one company, whatever the number of Notion pages. |
| "Att" (contact) | a **Person** of that company (role "Contacte") |
| Cuota status + Import | an **ERP member** for member/former companies and a fee tier "Quota N €" (yearly amount); "Impagament" / "Sense dades" is kept in the member's notes. Fee *entries* are not created: generate them from *Quotes* when you decide. |
| Gala list | one **event** + **people** + **attendance** (categories, seats and row in the attendance notes). **DNI numbers are not imported.** |
| Visites agremiats | **Visits** (status, type, date, company; the responsible person's name goes into the summary) |
| Patrocinadors | **Sponsors** (a prospect pipeline: status *Potencial*): events targeted, last contact, contact, proposal, budget, follow-up and history are kept as readable lines in the notes; linked to a company when its name matches exactly one; a plain-number budget becomes the amount |
| Laboral lists (04/03, 28/9) | each list is an **event** ("Laboral 04/03"…) with its contacts as **people** and one attendance row each (status *Convidat*); configure as `NOTION_DB_LABOUR=<id>:<event name>,<id>:<event name>`. A company name that matches no company is kept in the attendance notes |
| Event and session rosters (Congrés, Jornada PPWR, Forum EUDR, Repaper, FESPA, Open House Bobst, LabelExpo, Protocol de desconnexió, Factura electrònica, Edició 2026, Alumnes màster) | each list is an **event**; `NOTION_DB_ROSTERS=<id>:<event name>,…`. Columns are recognised by role (title as company or as person, "Persona", "Nom i cognoms", e-mail and phone under their many names), people are matched on name **and** e-mail, a row with only a company is an attendance row of the company, and every other column (interests, status, follow-up…) is kept as lines in the attendance notes |
| Proveïdors | **ERP suppliers** (`NOTION_DB_SUPPLIERS`; location, web, LinkedIn, contact, origin and notes as lines in the supplier's notes) |
| Formadors, Personal (address book) | **People** (`NOTION_DB_PEOPLE=<id>:<label>[:<role>]`, e.g. `…:Formadors:Formador`); someone already present (same name and e-mail, or name and company) is not duplicated, only blanks are filled; **DNI never imported** |
| Formació màster seguiment | **Training courses** (`NOTION_DB_COURSES=<id>:<label>`) |
| Bonificada | **Formació bonificada** courses: status (En curs → running, Bonificat/Acabat → done), hours, end date, company from the member/external relation; code, price, trainers count, budget file name and responsible person in the notes |
| Borsa de treball | **Job seekers** (see below) |

## 4. Job seekers (Borsa de treball)
Private individuals' data. The importer brings name, e-mail, phone and the page's properties; it leaves **consent date and "keep until" empty on purpose** and says so in each record's note. The database is **admin-only**. CV files (PDFs) are **not** copied. Before real use: your legal adviser sets the legal basis and retention period; then fill *Consentiment el* / *Conservar fins* (sort by "Conservar fins" to clear old ones).

## 5. After the import
Compare the report's counts with Notion (companies, people, events). Notion stays as the fallback until the team agrees to retire it. Fix anything odd directly in the workspace (it keeps a history of every change). Open points are recorded in `docs/records-engine-plan.md`.

## 6. What the first dry run on the real workspace showed (2026-10-01)
Companies: the main list ("Agremiats", 577 rows) plus "Empreses" (303) merge into 582 companies (298 pages merged by CIF); 11 have no CIF; 1 had an impossible founding year (left empty and counted). Fees: 133 different yearly amounts, only 16 shared by five or more companies, so 15 fee tiers are created and 164 custom amounts are kept in the members' notes. Gala: 535 people (many share one company mailbox, so people are matched on name **and** e-mail), 4 rows without a name skipped, about 45 % of attendees are not member companies and stay without a company link. Not yet imported: "Baixa agremiat" (134 former members), "Externes" (1001 non-members), Patrocinadors (131), Laboral, Bonificada, Borsa de treball (1601 pages, sensitive: see section 4). The **token is a secret**: keep it only in `.env`, give the integration read access only, and revoke it in Notion when the migration is finished.

## 7. Not imported (and why)
- **Mailing lists (imported 2026-10-02 as a registry, see section 9):** Newsletters (246) and Llistat Escola (1,814); consent is unknown, so it stays empty.
- **Needs a legal basis first:** Borsa de treball (1,601), Ofertes borsa (103) and Alumnes EGA (37) hold CVs and job-seeker data.
- **Not importable through the API:** Printing Our Future 16/10/25 (58 rows: the pages are only numbers and a computed e-mail column that Notion does not return).
- **Not CRM data:** Manuals, Cronograma Revista Trimestral, Graella disponibilitat màquines, Feigraf-Neobis, Questionari IA (survey answers), Concurs 2026 (media files), Tasques (6 rows, not tied to a project), People (Notion template), Junta Directiva 2025 and Assemblea (rollups only, no names).


## 8. Fields filled by later passes
Migration 0019: *Cuota* → company `fee_status` (Corrent pagament / Impagament / Sense dades); sponsors' *esdeveniments*, *contactats*, *últim contacte*, *persona de contacte* (only when it is an e-mail), *proposta*, *seguiment* → their own fields (the rest stays in the notes); gala *SEIENTS* → seat tags (platea, llotja, llotja sponsor, vip, nominal) and *Categoria* → free category tags. Re-running fills them on rows imported earlier without touching what people edited since.

## 9. Mailing lists (migration 0029)
`NOTION_DB_NEWSLETTERS` and `NOTION_DB_SCHOOL_LIST` (`--only newsletters,schoolList`) fill **Llistes de correu** (`/workspace/mailing-lists`, admin-only): one row per address per list (case-insensitive; repeated addresses are kept once and counted in the report; rows without a valid e-mail are skipped). Newsletter classification becomes tags, *Origen*/*campaign* the origin. **Consent date is left empty on purpose** (tab *Sense consentiment*) until the legal adviser fixes the basis; nothing is sent from Apex and nothing is pushed to any external tool. First run on the dev database: 230 newsletter addresses (14 repeated, 2 without e-mail) and 1,814 school addresses.
