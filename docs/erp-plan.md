# ERP plan: costs, purchases, subscriptions, courses and member fees

Status: **v4: build the registry backbone first, see the box below.** Earlier text: proposal v3 (after the team's answers: own Sage login, tiered fees billed annually or quarterly, paid by transfer or SEPA direct debit); nothing built. Owner: Sam. Roles and permissions are deliberately left open (section 6). The legal adviser should read section 7 before any money-related code.

> ### Decision v4: a registry backbone, not a second accounting system
> The team decided Apex should **only register data** and **Sage keeps doing all the main things** (accounting, invoices, tax, direct-debit files, bank reconciliation). So we build a small **registry**: suppliers, expenses and income entries, subscriptions, members with fee tiers and their fee charges, cost centers (courses/projects) and categories mapped to Sage accounts; with lists, search, simple totals and a **CSV export** for Sage. No approval workflows, no SEPA file, no bank import, no mandates or IBAN storage, no invoice issuing. Records can be edited and voided (Sage remains the source of truth); admin-only until roles are defined.
> Phases **E3 collections engine, E6 SEPA remittance and E7 bank matching below are therefore NOT planned**; they stay here only as options if the team ever wants them. Phases E0-E2 and the registry parts of E4/E5/E8 are the backbone. Because Apex is only a registry, the legal duties for issuing and tax stay in Sage.

## 1. What the ERP is for (from the team)
1. **Courses:** their costs and the payments received for them.
2. **Expenses** and **purchases** (what we buy and from whom, with approval).
3. **Subscriptions:** recurring costs we pay (software, memberships, services) and their renewals.
4. **Guild member fees** (quotes de socis): who owes what, who has paid, reminders.

The books and the legal invoices stay in **Sage Despachos**. So Apex is the **operational layer in front of the accounting**: it records what happens day to day, links it to clients, projects, courses and members, and hands the gestoria clean data to import into Sage. It is not accounting, tax filing, payroll or stock.

## 2. Design decisions
- **Apex does not issue legal invoices.** Anti-fraud rules (Veri*Factu) apply to software that *issues* invoices; Sage provides the certified issuer (it publishes a Veri*Factu *declaración responsable*). Apex stores what Sage issued (number, PDF, amount) and what we *receive* from suppliers. This removes the biggest legal risk from our code.
- **Money:** integer cents, VAT as basis points (2100 = 21%), EUR only, one written rounding rule (per line, half up) with heavy unit tests.
- **Sage login:** the association has its own Sage Despachos login, so we assume **the association issues its own invoices from Sage** (to confirm, section 9). Sage is therefore the certified issuer; Apex never produces the legal document, it records the Sage invoice number and PDF against each charge.
- **One collections engine for fees and courses:** members pay fees, and course participants pay course prices, **by transfer or SEPA direct debit**. We build the money-in side once (payers, direct-debit mandates, charges, payments, remittance, matching) and use it for both.
- **IBANs are sensitive:** stored encrypted at rest with a key from the server environment (never in git, never shown in full on screen, masked in lists and exports unless permitted).
- **Cost centers:** every cost or income belongs to a cost center (a **course**, a **project**, or **general**), which is what makes "how much did this course cost / earn" possible.
- **Never edit history:** saved financial records are corrected by a new linked record (reversal/rectification), not by editing or deleting.
- **Sage export:** Sage Despachos Connected imports journals and invoices from Excel/CSV through its *import guides* (a standard guide for journal entries exists; invoices need a plug-in) and customizable guides. So Apex produces a **monthly CSV/Excel in the layout the gestoria's guide expects**; we need that template from the gestoria. A direct API is a later option, not a first step.

## 3. Phases (each small, shippable, tested, reviewed by the other person)

**E0. Foundations (about 2 days)**
`lib/money.ts`; cost centers (course / project / general, optional budget); categories for expenses and income, each with the **Sage account number** it maps to; suppliers (name, tax id, contact, IBAN, payment terms).

**E1. Expenses and purchases (about 6-8 days)**
- **Purchase request → approval → order → received → invoiced.** Lines with quantity and price; cost center and category; status history; who requested/approved (rule decided with roles).
- **Expenses:** date, supplier, category, cost center, base + VAT + total, supplier invoice number, receipt/PDF in the private bucket, paid/unpaid with payment date and method. An expense can come from a purchase.
- Lists with the same search bar as the CRM; filters by cost center, supplier, month, unpaid.

**E2. Subscriptions (about 3-4 days)**
Supplier, what it is, amount, billing period (monthly/annual), next renewal, owner, category, cost center, active. Renewal reminder emails (existing outbox), "this month / this year" cost view, one click to record the expected expense when the invoice arrives.

**E3. Collections core (about 5-6 days)**: the money-in engine, shared by fees and courses
- **Payers** (a member company, or a course participant), **direct-debit mandates** (IBAN encrypted, mandate reference, signature date, sequence type first/recurrent), **charges** (amount, due date, status pending / paid / overdue / waived / cancelled, link to cost center) and **payments** (date, amount, method: transfer / direct debit / other). Part-payments and corrections as linked records; no editing of history.
- Recording a payment by hand, overdue list, reminder emails (outbox), CSV export.

**E4. Guild member fees (about 5-6 days)**
- **Fee tiers** (plans: name, annual price, optional quarterly price) and each member's tier, **billing period annual or quarterly**, join/leave dates (proration rule decided with the team).
- Bulk **generation of the period's charges** with a preview before anything is created; reminders; overdue follow-up.
- Bridge from the CRM: a lead from *Agremia't* → **convert to member**.
- Export of the charges for the invoices issued in Sage; afterwards the **Sage invoice number is back-filled** by importing a CSV, matched by charge reference.

**E5. Courses: costs and payments (about 4-5 days)**
A course is a cost center with dates, budget and price(s). **Costs** = expenses assigned to it; **income** = charges and payments from E3 for its participants. Dashboard: budget vs. actual and **margin per course**. Optional link to a project.

**E6. SEPA direct-debit remittance (about 5-7 days)**
Generate the bank file (SEPA Core direct debit, pain.008) for the charges due on a date: creditor identifier, per-mandate data, first/recurrent sequence, IBAN validation, pre-notification date check, totals. Marks charges "sent to bank"; the bank's return/rejections are recorded by hand at first. **Must be tested with the bank** (their file validation) before real use.

**E7. Bank matching (about 4-6 days)**
Import the bank statement (Norma 43 or the bank's CSV) and **suggest matches** between transfers/direct debits and open charges (by reference, IBAN, amount); staff confirm, nothing is auto-applied. Unmatched lines stay in a queue.

**E8. Reports and the Sage export (about 4-5 days)**
Monthly export in the layout the gestoria/Sage import guide expects (we need their template); income/expense/margin per cost center; budget vs. actual; unpaid expenses; overdue fees; all as CSV.

Rough total: **about 38-49 working days** for one person. Order: E0 → E1 → E2 (useful after about 3 weeks) → E3 → E4 → E5 → E6 → E7 → E8 (grown alongside).

## 4. Data model (new file `apps/web/db/schema/erp.ts`, re-exported from `index.ts`)
`cost_centers` · `erp_categories` (kind expense/income, sage_account) · `suppliers` · `purchases` + `purchase_lines` · `expenses` (+ file key, supplier invoice no.) · `subscriptions` · `payers` (member or participant) · `mandates` (IBAN encrypted, reference, signed_on, sequence) · `charges` (payer, cost_center, amount, due, status, sage_invoice_ref) · `collection_payments` (charge, date, amount, method, bank_line_id?) · `members` + `fee_plans` (tiers) · `courses` (extends a cost center: dates, budget, prices) · `remittances` (+ items) · `bank_lines` (imported statement lines, matched/unmatched). Corrections are new rows linked by `corrects_id`. Migrations take the next free number, with shared review.
**Erasure design (affects the existing erase feature):** financial rows must survive a data-erasure request for the legal retention period. No cascade from contacts/clients/members into financial tables; each record stores the fiscal identity it needs, and erasure anonymises personal fields only where the law allows.

## 5. Screens
New folders under `app/admin/(app)/`: `purchases/`, `expenses/`, `suppliers/`, `subscriptions/`, `collections/`, `members/`, `courses/`, `remittances/`, `bank/`, `erp-reports/`; logic in `lib/<name>.ts`. One menu group "Gestió" (the menu file is shared, one line per item). Client-portal: later, optional: members could see their own fee status (same isolation rules as the portal).

## 6. Roles (to define later) and how we stay ready
- Today the system has two staff roles (admin, editor) and **no user-defined roles** (a deliberate rule in `CLAUDE.md`). The ERP needs finer permissions (e.g. who requests, who approves, who pays, who sees amounts, who exports).
- Plan: all ERP code asks `can(user, "erp:…")` only, with actions such as `erp:read`, `erp:request`, `erp:approve`, `erp:pay`, `erp:export`, `erp:admin`. **Until roles are defined these are admin-only**, so nothing is exposed by default. When the roles are decided we add them as a *fixed list in code* (e.g. `finance`, `manager`), changing only `permissions.ts` and the users screen; this is a decision for both developers because it touches shared auth.
- Approval limits (e.g. purchases over X EUR need a second person) are a setting once the roles exist.

## 7. Legal and data-protection points for the adviser (before E1 stores supplier/member data)
1. Confirm who **issues** the association's invoices and receipts today (the association itself in Sage Despachos, or the gestoria on its behalf) and that Sage's certified issuing covers the association's Veri*Factu duty (start **1 Jan 2027** for companies; **1 Jul 2027** for self-employed, per RD-ley 15/2025). The B2B e-invoicing law (Ley 18/2022, RD 238/2026) has 12/24-month deadlines that start when a ministerial order takes effect: confirm the date.
2. VAT treatment of **member fees** and course income (exemptions, pro-rata deduction on expenses) and the association's tax status: it decides which fields the exports need.
3. **Retention** of purchase and expense documents and invoices (Código de Comercio 6 years; tax limitation 4 years; adviser to confirm) and how that interacts with GDPR erasure (section 4).
4. Privacy notice for suppliers' and members' data, and consent/legitimate-interest wording for fee reminder emails.
5. Whether storing supplier IBANs and receipts in our private EU bucket is acceptable under the association's data policy.
6. **SEPA direct debit:** the mandate wording and how the signature is captured and kept (paper, e-signature, bank-form), pre-notification period, retention of mandates (until 14 months after the last collection, per SEPA rules: confirm), and safeguards for IBANs of members and of private individuals who attend courses.
7. Whether the association needs a creditor identifier (it must have one to collect by direct debit) and which bank supplies the remittance format.

## 8. Out of scope (on purpose)
Issuing legal invoices; Veri*Factu/Facturae generation; online card payments; accounting ledger and tax returns (modelos 303/347/390…); payroll; stock/inventory; multi-currency; bank-statement reconciliation (possible later gate).

## 9. Questions for the team
**Answered so far:** the association has its own Sage login; fees are in tiers, billed annually or quarterly; payment is by transfer or direct debit.
1. **Sage:** does it issue the invoices (which module), or does it only hold the accounting? Can it import invoices in bulk from Excel/CSV, and what is the gestoria's import template? Which chart-of-accounts numbers map to our expense and income categories?
2. **Fee tiers:** what decides the tier (company size, turnover, employees, type)? Is the quarterly price simply the annual price divided by four? Prorated when someone joins or leaves mid-period? Discounts, late fees?
3. **Direct debit:** does the association already have a SEPA creditor identifier and collect mandates today (on what form)? Which bank, and does it accept a remittance file (pain.008) upload?
4. **Courses:** I assumed course participants also pay by transfer or direct debit. Are participants companies or individuals? Fixed prices per course? Do instructors invoice the association?
5. **Purchases:** who requests, who approves, and from what amount?
6. **Subscriptions:** roughly how many, and who owns the renewals?
7. **Bank:** which bank(s), and can you export Norma 43 or CSV statements?
8. What does the gestoria need each month (format, deadline)?

## 10. Order of work
1. Answers to section 9 (1, 2, 3, 7 first) and adviser items 1-3.
2. E0, then E1 and E2 (they need none of the open answers).
3. Gate: roles defined; then approval rules and amounts visibility.
4. E3-E5 once the fee tiers and the Sage layout are known; **gate before E6:** creditor identifier and the bank's file requirements confirmed; E7 after E6.
Team rules apply: own branch per phase, tests (money and numbering get heavy tests), review by the other person, `CLAUDE.md` updated in the same pull request.

## Sources
- Veri*Factu dates (RD-ley 15/2025: 1 Jan 2027 companies, 1 Jul 2027 self-employed): [Infocop](https://www.infocop.es/verifactu-entrara-en-vigor-en-2027-recuerda-las-claves-del-nuevo-sistema-de-facturacion-para-autonomos-y-pymes/), [Cegid](https://www.cegid.com/ib/es/sistema-verifactu/)
- B2B e-invoicing (Ley 18/2022, RD 238/2026, 12/24-month periods tied to a ministerial order): [Spendesk](https://www.spendesk.com/es/blog/factura-electronica-b2b-obligatoria/), [Invoo](https://invoo.es/es/blog/analisis/factura-electronica-b2b-obligatoria-2026-2027/)
- Invoice content and rectification (RD 1619/2012): [Agencia Tributaria](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-iva-2024/capitulo-10-obligac-formales-suj-registro/obligaciones-materia-facturacion/facturas-rectificacion.html)
- Sage Despachos Connected imports (Excel/CSV import guides, journal guide, invoice plug-in): [Sage community: importing entries](https://communityhub.sage.com/es/sage-despachos-connected/f/fiscal-contable/272374/importar-asientos-en-sage-despachos-conected)
- Sage Veri*Factu declaration and certified invoicing: [Sage: Veri*Factu readiness](https://www.sage.com/es-es/blog/preparacion-para-verifactu-esta-software-facturacion-listo/), [Sage Despachos certifications](https://www.sage.com/es-es/confianza-seguridad/certificaciones/sage-despachos/)

These are secondary sources checked on 2026-10-01; the adviser must confirm them against the official texts, and the gestoria must confirm Sage's import layout.
