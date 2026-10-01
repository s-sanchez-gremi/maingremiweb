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
| Laboral, Formació bonificada | **Labour cases / Training**: the page title is the name, every other property is kept as text lines in the notes |
| Borsa de treball | **Job seekers** (see below) |

## 4. Job seekers (Borsa de treball)
Private individuals' data. The importer brings name, e-mail, phone and the page's properties; it leaves **consent date and "keep until" empty on purpose** and says so in each record's note. The database is **admin-only**. CV files (PDFs) are **not** copied. Before real use: your legal adviser sets the legal basis and retention period; then fill *Consentiment el* / *Conservar fins* (sort by "Conservar fins" to clear old ones).

## 5. After the import
Compare the report's counts with Notion (companies, people, events). Notion stays as the fallback until the team agrees to retire it. Fix anything odd directly in the workspace (it keeps a history of every change). Open points are recorded in `docs/records-engine-plan.md`.

## 6. What the first dry run on the real workspace showed (2026-10-01)
Companies: the main list ("Agremiats", 577 rows) plus "Empreses" (303) merge into 582 companies (298 pages merged by CIF); 11 have no CIF; 1 had an impossible founding year (left empty and counted). Fees: 133 different yearly amounts, only 16 shared by five or more companies, so 15 fee tiers are created and 164 custom amounts are kept in the members' notes. Gala: 535 people (many share one company mailbox, so people are matched on name **and** e-mail), 4 rows without a name skipped, about 45 % of attendees are not member companies and stay without a company link. Not yet imported: "Baixa agremiat" (134 former members), "Externes" (1001 non-members), Patrocinadors (131), Laboral, Bonificada, Borsa de treball (1601 pages, sensitive: see section 4). The **token is a secret**: keep it only in `.env`, give the integration read access only, and revoke it in Notion when the migration is finished.
