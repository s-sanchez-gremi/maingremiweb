# ERP plan: costs, purchases, subscriptions, courses and member fees

Status: **proposal, v2** (after the team's answers); nothing built. Owner: Sam. Roles and permissions are deliberately left open (section 6). The legal adviser should read section 7 before any money-related code.

## 1. What the ERP is for (from the team)
1. **Courses:** their costs and the payments received for them.
2. **Expenses** and **purchases** (what we buy and from whom, with approval).
3. **Subscriptions:** recurring costs we pay (software, memberships, services) and their renewals.
4. **Guild member fees** (quotes de socis): who owes what, who has paid, reminders.

The books and the legal invoices stay in **Sage Despachos**. So Apex is the **operational layer in front of the accounting**: it records what happens day to day, links it to clients, projects, courses and members, and hands the gestoria clean data to import into Sage. It is not accounting, tax filing, payroll or stock.

## 2. Design decisions
- **Apex does not issue legal invoices.** Anti-fraud rules (Veri*Factu) apply to software that *issues* invoices; Sage provides the certified issuer (it publishes a Veri*Factu *declaración responsable*). Apex stores what Sage issued (number, PDF, amount) and what we *receive* from suppliers. This removes the biggest legal risk from our code.
- **Money:** integer cents, VAT as basis points (2100 = 21%), EUR only, one written rounding rule (per line, half up) with heavy unit tests.
- **Cost centers:** every cost or income belongs to a cost center (a **course**, a **project**, or **general**), which is what makes "how much did this course cost / earn" possible.
- **Never edit history:** saved financial records are corrected by a new linked record (reversal/rectification), not by editing or deleting.
- **Sage export:** Sage Despachos Connected imports journals and invoices from Excel/CSV through its *import guides* (a standard guide for journal entries exists; invoices need a plug-in) and customizable guides. So Apex produces a **monthly CSV/Excel in the layout the gestoria's guide expects**; we need that template from the gestoria. A direct API is a later option, not a first step.

## 3. Phases (each small, shippable, tested, reviewed by the other person)

**E0. Foundations (about 2 days)**
`lib/money.ts`; cost centers (course / project / general, optional budget); categories for expenses and income, each with the **Sage account number** it maps to (so exports need no manual coding); suppliers (name, tax id, contact, IBAN, payment terms).

**E1. Expenses and purchases (about 6-8 days)**
- **Purchase request → approval → order → received → invoiced.** Lines with quantity and price; cost center and category; status history; who requested/approved (approval rule decided with roles).
- **Expenses:** date, supplier, category, cost center, base + VAT + total, supplier invoice number, receipt/PDF in the private bucket, paid/unpaid with payment date and method. An expense can come from a purchase.
- Lists with search (same search bar as the CRM), filters by cost center, supplier, month, unpaid.

**E2. Subscriptions (about 3-4 days)**
Subscription = supplier, what it is, amount, billing period (monthly/annual), next renewal, owner, category, cost center, active. Renewal reminder emails (existing outbox), a "this month / this year" cost view, and one click to record the expected expense when the invoice arrives.

**E3. Courses: costs and payments (about 5-6 days)**
A course is a cost center with: dates, budget, instructors/suppliers, **costs** (expenses assigned to it) and **income** (payments received: date, amount, payer, method, optional Sage invoice number). Dashboard: budget vs. actual, **margin per course**. Payments are *recorded*, not processed (no online payment in scope). Optional link to a client/contact and to a project.

**E4. Guild member fees (about 6-8 days)**
Members (company, tax id, status active/left, join date, fee plan and amount, billing period), a **fee charge** per period (pending / paid / overdue / waived), payments recorded, overdue list, reminder emails, annual fee generation in bulk with a preview. Bridge from the CRM: a lead from the *Agremia't* form → **convert to member** (like convert to client today). Export to Sage for the invoices/receipts.

**E5. Reports and Sage export (about 4-5 days)**
Monthly export in the agreed Sage layout; per cost center income/expense/margin; budget vs. actual; unpaid expenses; overdue fees; CSV for everything.

**Decision gates (not planned yet):** SEPA direct-debit remittance file for fees (bank format, its own plan); online payments (excluded); API link to Sage.

Rough total: **26-34 working days** for one person, E0 first, then E1 and E2 (smallest, most useful), then E3/E4 in the order the team needs, E5 growing alongside.

## 4. Data model (new file `apps/web/db/schema/erp.ts`, re-exported from `index.ts`)
`cost_centers` · `erp_categories` (kind expense/income, sage_account) · `suppliers` · `purchases` + `purchase_lines` · `expenses` (+ file key, supplier invoice no.) · `subscriptions` · `courses` (extends a cost center: dates, budget) · `income_entries` (cost center, amount, date, payer, method, sage_invoice_ref) · `members` · `fee_plans` · `member_fees` (period, amount, status, paid_on). Corrections are new rows linked by `corrects_id`. Migrations take the next free number, with shared review.
**Erasure design (affects the existing erase feature):** financial rows must survive a data-erasure request for the legal retention period. No cascade from contacts/clients/members into financial tables; each record stores the fiscal identity it needs, and erasure anonymises personal fields only where the law allows.

## 5. Screens
New folders under `app/admin/(app)/`: `purchases/`, `expenses/`, `suppliers/`, `subscriptions/`, `courses/`, `members/`, `erp-reports/`; logic in `lib/<name>.ts`. One menu group "Gestió" (the menu file is shared, one line per item). Client-portal: later, optional: members could see their own fee status (same isolation rules as the portal).

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
6. Whether member bank details (for a future SEPA remittance) need extra safeguards.

## 8. Out of scope (on purpose)
Issuing legal invoices; Veri*Factu/Facturae generation; online payments; accounting ledger and tax returns (modelos 303/347/390…); payroll; stock/inventory; multi-currency; bank-statement reconciliation (possible later gate).

## 9. Questions for the team
1. **Sage Despachos** is a product for accounting firms: does the association have its own login, or does the gestoria keep the books and issue invoices? Which Excel import guide(s) do they use today (we need their template)?
2. **Courses:** where do students enroll and pay today (Campus virtual, bank transfer, Sage invoices)? Are course prices fixed? Do instructors invoice us?
3. **Members:** how many; one flat fee or tiers (by company size)? Billed annually or quarterly? Paid by SEPA direct debit, transfer or card? Do they receive an invoice or a receipt?
4. **Purchases:** who requests and who approves, and from what amount?
5. **Subscriptions:** roughly how many, and who owns renewals?
6. What does the gestoria need each month (format, deadline)?
7. Which Sage **chart-of-accounts numbers** map to our expense and income categories (list from the gestoria)?

## 10. Order of work
1. Answers to section 9 (1, 3, 6, 7 first) and adviser items 1-3.
2. E0, then E1 and E2 in parallel with the answers on courses and members.
3. Gate: roles defined; then approval rules and amounts visibility.
4. E3, E4, E5 in the order the team picks.
Team rules apply: own branch per phase, tests (money and numbering get heavy tests), review by the other person, `CLAUDE.md` updated in the same pull request.

## Sources
- Veri*Factu dates (RD-ley 15/2025: 1 Jan 2027 companies, 1 Jul 2027 self-employed): [Infocop](https://www.infocop.es/verifactu-entrara-en-vigor-en-2027-recuerda-las-claves-del-nuevo-sistema-de-facturacion-para-autonomos-y-pymes/), [Cegid](https://www.cegid.com/ib/es/sistema-verifactu/)
- B2B e-invoicing (Ley 18/2022, RD 238/2026, 12/24-month periods tied to a ministerial order): [Spendesk](https://www.spendesk.com/es/blog/factura-electronica-b2b-obligatoria/), [Invoo](https://invoo.es/es/blog/analisis/factura-electronica-b2b-obligatoria-2026-2027/)
- Invoice content and rectification (RD 1619/2012): [Agencia Tributaria](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-iva-2024/capitulo-10-obligac-formales-suj-registro/obligaciones-materia-facturacion/facturas-rectificacion.html)
- Sage Despachos Connected imports (Excel/CSV import guides, journal guide, invoice plug-in): [Sage community: importing entries](https://communityhub.sage.com/es/sage-despachos-connected/f/fiscal-contable/272374/importar-asientos-en-sage-despachos-conected)
- Sage Veri*Factu declaration and certified invoicing: [Sage: Veri*Factu readiness](https://www.sage.com/es-es/blog/preparacion-para-verifactu-esta-software-facturacion-listo/), [Sage Despachos certifications](https://www.sage.com/es-es/confianza-seguridad/certificaciones/sage-despachos/)

These are secondary sources checked on 2026-10-01; the adviser must confirm them against the official texts, and the gestoria must confirm Sage's import layout.
