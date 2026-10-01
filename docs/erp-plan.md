# ERP plan (quotes, billing data, invoice register)

Status: **proposal for review**, nothing built. Owner: Sam. Needs the legal adviser's input on section 6 before any invoice-related code.

## 1. What we mean by "ERP" here
The brief only names ERP as a later phase after CRM and project manager ("invoicing, documents"). This plan assumes the smallest useful meaning: **money that flows from clients and projects**: what we offer (quotes), what we have billed (invoices), and what has been paid. It is **not** accounting, payroll, stock, purchasing or tax filing (the gestoria keeps doing those). Section 8 lists what we still need to confirm.

## 2. The key decision: do NOT build our own invoice issuer (yet)
Since the anti-fraud rules (Ley 11/2021, Real Decreto 1007/2023, "Veri*Factu"), any software that **issues invoices** must keep tamper-evident billing records (hash chain, event log), print a QR, and either send records to the tax agency (Veri*Factu mode) or keep them signed, and the producer must publish a *declaración responsable*. If we built it, the association would be the software producer and carry that obligation and liability. The compliance dates were postponed: from **1 Jan 2027** for companies and **1 Jul 2027** for self-employed. On top of that, B2B electronic invoicing becomes mandatory under Ley 18/2022 ("Crea y Crece"), developed by **Real Decreto 238/2026** (BOE 31 Mar 2026), with 12-month (turnover over 8 M EUR) and 24-month (everyone else) deadlines that start counting when the ministerial order takes effect; **confirm the exact dates**.

| | A. Build our own invoice issuer | **B. Apex keeps quotes + an invoice *register*; a certified tool issues the legal invoices (recommended)** |
|---|---|---|
| Legal risk | High: we must comply with, and keep up with, Veri*Factu, Facturae/e-invoicing, rectification rules | Low: the certified tool carries it |
| Effort | Large, and permanent (rules keep changing) | Small |
| Fits "simple, robust, one database" | Partly | Yes: Apex stores what was invoiced and paid, in our database, but does not generate the legal document |
| Gives staff | One place for everything | One extra tool to log into (but its invoices appear in Apex and in the client portal) |

**Recommendation: B.** Revisit A only if the adviser confirms a need that no certified tool covers. Which tool the association already uses (or picks) decides how invoices reach Apex: a CSV export you import, a PDF you attach, or later an API link.

## 3. Phases (each small, each shippable, each reviewed by the adviser where it touches the law)

**E1. Billing data and catalogue (about 2-3 days)**
- On a client: legal name, tax id (NIF/CIF), billing address, invoice email. (A client created from a contact starts empty.)
- A small catalogue of items we sell (name, default unit price, VAT rate), editable by admins.

**E2. Quotes / pressupostos (about 4-5 days)**
- A quote belongs to a client (optionally a project): lines (item or free text, quantity, unit price, discount %, VAT rate), totals computed in cents, validity date, status *draft → sent → accepted / rejected / expired*.
- PDF export with the association's details; numbering by series and year (`P-2026-0001`), no gaps once sent.
- A quote is **not** a tax invoice, so the invoicing rules do not apply; the PDF must say so ("Pressupost, no és una factura").
- Accepted quote → button "mark as invoiced" to link it to an invoice record (E3).

**E3. Invoice register and payments (about 4-5 days)**
- Record (never generate) each invoice the certified tool issued: series+number, issue date, client, base, VAT, total, due date, PDF (private bucket), link to project/quote.
- Status *pending / paid / overdue*, payments (date, amount, method), overdue list, reminder email to the client through the existing outbox.
- Corrections are **new records** (rectifying invoice, linked to the original); an invoice record is never edited or deleted once saved.
- Invoices marked "visible to client" show in the **client portal** (same share control as documents).
- CSV export for the gestoria.

**E4. Decision gate: membership fees and anything else.** If the main use is billing member dues in bulk (the "Agremia't" side), that is a different workflow (recurring fees, remittances/SEPA) and needs its own short plan.

## 4. Data model (new file `apps/web/db/schema/erp.ts`, re-exported from `index.ts`)
Money is **integer cents**, VAT rate is **basis points** (2100 = 21%), currency EUR only, rounding rule written down once (round per line, half up) and unit-tested.
- `billing_profiles` (client_id, legal_name, tax_id, address fields, invoice_email)
- `erp_items` (name, unit_price_cents, vat_bp, active)
- `quotes` (client_id, project_id, series, number, status, valid_until, notes) + `quote_lines` (quote_id, position, item_id?, description, qty, unit_price_cents, discount_bp, vat_bp)
- `invoice_records` (client_id, project_id?, quote_id?, series, number, issued_on, due_on, base_cents, vat_cents, total_cents, corrects_id?, file_key, shared, source_tool, external_ref) with unique (series, number)
- `payments` (invoice_id, paid_on, amount_cents, method)
- Migrations as always: next free number, shared review.

## 5. Screens and permissions
- New folders under `app/admin/(app)/`: `quotes/`, `invoices/`, `catalogue/`; logic in `lib/quotes.ts`, `lib/invoices.ts`, `lib/money.ts` (all in Sam's area, see `CODEOWNERS`); one new menu line each.
- New permission `erp:write`, **admins only at first** (money). Editors see nothing until we decide otherwise.
- Client portal: a new "Factures" list per client, only records marked visible.

## 6. Legal and data-protection points to confirm with the adviser (before E3, and for E2's PDF)
1. Legal form and tax status of the association (VAT exemption for member fees? corporate income tax status?), which decides the Veri*Factu start date and the VAT treatment on quotes.
2. Confirm option B is acceptable: invoices are issued only by certified software, Apex only records them.
3. Mandatory content of an invoice and the rules for rectifying invoices (Real Decreto 1619/2012): we must never edit or delete an issued invoice; corrections are new, linked records in their own series.
4. B2B e-invoicing (RD 238/2026): exact start date for the association and the tool's compliance.
5. **Retention vs. erasure (important, affects code already built):** the contact-erasure feature deletes a contact and the client made from them. Invoice data must be kept for the legal period (Código de Comercio: 6 years; tax rules: 4 years of limitation; **adviser to confirm**). So invoice records must survive an erasure request with only the minimum fiscal data, and erasure must not cascade into them. We will design `invoice_records` with no cascade from contacts/clients and store the fiscal identity needed on the record itself.
6. Privacy notice and consent wording for sending invoice reminders by email.
7. Where invoice PDFs may be stored (EU buckets, private, retention).

## 7. Out of scope (on purpose)
Issuing legal invoices, Veri*Factu/Facturae generation, online payments (cards, SEPA), accounting and ledgers, tax returns (modelo 303/347/390 etc.), purchasing and supplier invoices, stock, payroll, multi-currency.

## 8. Questions for the team
1. Is "ERP" exactly E1-E3, or do you also mean something else (expenses, purchasing, membership dues, inventory)?
2. Which tool issues invoices today (or which will we choose)? Can it export CSV/PDF, and does it have an API?
3. Roughly how many invoices and quotes per month?
4. Do members pay fees through Apex-managed invoices (E4), or is that handled elsewhere?
5. Who should see money: only admins, or also project/CRM staff?
6. Does the gestoria need a fixed export format?

## 9. Order of work and decision gates
1. Adviser answers section 6 items 1, 2 and 5 (before writing any invoice tables).
2. E1 → E2 (quotes can start while the adviser reviews E3).
3. Gate: choose the invoicing tool and agree the import method.
4. E3 → portal "Factures".
5. Gate: membership fees (E4) and any API integration, each with its own plan.

Each phase follows the team rules: own branch, tests (money rounding and numbering get heavy unit tests), review by the other person, `CLAUDE.md` updated in the same pull request.

## Sources
- Veri*Factu dates (RD-ley 15/2025 postponement: 1 Jan 2027 companies, 1 Jul 2027 self-employed): [Infocop](https://www.infocop.es/verifactu-entrara-en-vigor-en-2027-recuerda-las-claves-del-nuevo-sistema-de-facturacion-para-autonomos-y-pymes/), [Cegid](https://www.cegid.com/ib/es/sistema-verifactu/)
- B2B e-invoicing (Ley 18/2022, RD 238/2026, 12/24-month periods, dates still tied to a ministerial order): [Spendesk](https://www.spendesk.com/es/blog/factura-electronica-b2b-obligatoria/), [Invoo](https://invoo.es/es/blog/analisis/factura-electronica-b2b-obligatoria-2026-2027/)
- Invoice content and rectifying invoices (RD 1619/2012): [Agencia Tributaria, manual IVA](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-iva-2024/capitulo-10-obligac-formales-suj-registro/obligaciones-materia-facturacion/facturas-rectificacion.html)

These are secondary sources checked on 2026-10-01; the adviser must confirm them against the official texts.
