# Plan: electronic signatures as its own app (`apps/sign`), built from scratch

Status: **S0 (plan, CLAUDE.md, notice) done 2026-10-07; S1 (scaffold `apps/sign`) done; S2 next. Decisions in section 9 are still open (they matter from S3 on).** Same procedure as `docs/forms-app-plan.md`. Owner: Sam. Needs a read from Joan Marc only for the shared files (schema, grants, Caddy, deploy, CI, `CLAUDE.md`).

## 1. Goal
Staff send a PDF to one or more people to sign electronically; each signer signs from a link, with no account; Apex keeps a sealed PDF plus an audit trail. It is **ours, not a hosted or AGPL platform**: nothing to fork, no third-party service, evidence in our own database and private bucket.

Why from scratch (decision 2026-10-07): it follows priorities 1 and 2 of `CLAUDE.md` (plain, one database, short dependency list) and avoids AGPL obligations and a second system to run. The cost is that we own the legal evidence design (section 3) and about 1,500 lines of code.

## 2. Legal level (what we promise)
- **Simple electronic signature (SES, eIDAS art. 25 / Ley 6/2020)**: valid and admissible in the EU for ordinary agreements: member agreements, enrolments, consent documents, quotes. Evidence = verified email link + explicit consent + audit trail + tamper-evident sealed PDF.
- **Not provided:** qualified signatures (QES). If a document legally requires one, use an external trust provider; nothing in this app claims it. The signer screen and the audit page say "electronic signature", never "qualified" or "advanced".
- The client's legal adviser must confirm: the consent wording, the retention period of sealed PDFs and audit trails, and which documents may use SES. Placeholders are clearly marked, as with the legal pages.

## 3. Design principles
1. **Fixed typed fields, no canvas.** Staff place fields (signature, date, text, initials) on a PDF page preview from a list: page, x, y, width in percent, required. Add/remove/move by number or click-to-place; no free drawing tools.
2. **The server decides.** Signing state, order, expiry and field values are validated server-side; the browser is only a view.
3. **Tamper evidence at every stage:** SHA-256 of the original is stored when uploaded and re-checked before sealing; the sealed PDF carries a PAdES signature and an audit page; the sealed hash is stored.
4. **Single-use tokens, hashed at rest** (same pattern as `portal_tokens`); a token only opens its own signer.
5. **Append-only audit log**, never edited or deleted except by contact erasure.
6. **Outage isolation:** its own app, role, service and rollback; a signing outage never affects the site, the CRM or the forms.

## 4. Layout
```
apps/sign/        staff screens (own login) + public /sign/<token> pages + API   (Sam, port 3004)
packages/sign/    pure logic: state machine, field geometry, audit text, PDF stamping/sealing
```
- `apps/sign` never imports another app and no app imports it (`scripts/check-boundaries.sh` + self-test extended). `packages/sign` never imports an app.
- Own staff cookie `apex_sign_session` (same `users` table), "El meu compte", `/api/health`, `/api/cron/tick`, robots disallow all, never framable. The public `/sign/*` pages are `noindex`, not framable, with no third-party anything (CSP in `lib/csp.ts` style).
- Host: `SIGN_DOMAIN` (default `sign.<SITE_DOMAIN>`). **Staff screens are locked to `ADMIN_ALLOWED_IPS`; `/sign/*`, `/_next/*`, `/api/health`, `/api/cron/*` and the signer API are open** (like the portal on the CRM host).
- Entry points: a "Enviar a signar" link from company, project and contact pages in the CRM (`SIGN_URL`, plain link carrying the record reference); the CRM reads signing status read-only.

## 5. Data (one migration, additive; each table also goes in `db/grants.sql` in the same PR)
- `sign_documents`: id, title, `file_key` (private bucket, `sign/<id>/original.pdf`), `sha256`, page count, optional `company_id` / `project_id` / `contact_id` (all `set null` on delete), `created_by`.
- `sign_requests`: id, document_id, status (`draft | sent | completed | declined | expired | voided`), `locale` (ca/es/en), `message`, `expires_at`, `ordered` (bool, default false), `sealed_key`, `sealed_sha256`, `sent_at`, `completed_at`.
- `sign_signers`: id, request_id, name, email, `position`, `token_hash` (unique), `status` (`pending | opened | signed | declined`), `signed_at`, `reminded_at`. One signer per email per request.
- `sign_fields`: id, request_id, signer_id, `kind` (signature | initials | date | text), page, x, y, w, h (percent of the page), `required`, `value` (filled at signing: image of the signature as PNG bytes key or typed text).
- `sign_events`: append-only: request_id, signer_id (nullable), `kind` (created, sent, opened, consented, signed, declined, reminded, voided, expired, sealed, downloaded), `at`, `ip_hash` (keyed hash, purged after the retention rule), `user_agent` (truncated), `detail` jsonb (no personal data beyond names already on the request).
- `sign_consents`: signer_id, exact consent text per locale at signing time, timestamp (kept with the request like form consent).
- Money-free, so no impact on ERP. Deleting a request deletes its fields, events and stored files; erasing a contact removes requests linked to that contact **unless the sealed document is under a retention duty** (decision for the legal adviser; until answered, erasure removes them and says so in the confirmation).

## 6. Flow
1. **Draft (staff):** upload a PDF (type by content, PDF only, max 15 MB, no encryption/scripts; unreadable or password-protected files are refused), add signers (name, email, optional order), place fields per signer, choose language and expiry (default 14 days). Everything is editable until sent.
2. **Send:** validation (every signer has at least one required signature field; every field belongs to a signer; page numbers exist), state to `sent`, one email per signer through the `outbox` (so a mail outage never loses a request). With `ordered`, only the next signer gets a link; the next is sent when the previous signs.
3. **Signer page `/sign/<token>`:** expired/voided/finished tokens show a neutral message. Shows the PDF (`pdf.js`, self-hosted worker, no CDN), the fields to fill, and the consent checkbox (unticked, own stored wording). The signer types their name (rendered in a font) or draws it (canvas, PNG, size-capped), fills the other fields and confirms. They may **decline** with an optional reason.
4. **Each signature** is one transaction: re-validate token, state, order, expiry; store field values; write the event; if it was the last signer, enqueue sealing.
5. **Seal** (one function, idempotent): re-check the original's SHA-256; stamp field values onto the pages with `pdf-lib`; append the **audit page** (document title and hash, each signer's name, email, time, IP hash prefix, consent wording, event trail); apply a PAdES signature with the app's seal certificate (`@signpdf/signpdf`, `SIGN_SEAL_P12` + passphrase); store `sealed.pdf`; hash it; status `completed`; email every signer and the creating staff member a copy link.
6. **Delivery:** signers get a 7-day single-use download link to the sealed PDF (hash-checked). Staff download through a session check plus a 60-second signed link that must belong to the request (same rule as project documents). Nothing public, no bucket URL ever reaches a browser.
7. **Lifecycle (cron tick, every minute):** one reminder after 3 days to pending signers; expire past `expires_at`; retry sealing failures with backoff, flagged "sealing failed" in the staff list after 5 attempts and reported through `error_log`; purge `ip_hash` per the retention rule.

## 7. Rules and security
- Staff permission `sign:write` (admin and editor, same as `leads:write`; to revisit when roles are defined); sealed downloads need `sign:read`.
- Signer pages: rate limit per token and per address (reuse the keyed-hash limiter), constant-time token comparison, same neutral answer for unknown/expired/used tokens, no email enumeration, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- Uploaded PDFs are never rendered server-side beyond `pdf-lib` page counting; the browser viewer runs `pdf.js` with scripting disabled. Page count and size are capped (e.g. 100 pages) so a request cannot exhaust memory.
- The seal certificate and its passphrase come from the environment, are validated at startup in staging/production (fail-fast, like other secrets), and are never stored in the database or logged. Rotation = new certificate for new seals; old sealed PDFs stay valid.
- **Dependencies (written reasons per the rule):** `pdf-lib` (MIT) stamping and audit page; `pdfjs-dist` (Apache-2.0) viewer; `@signpdf/signpdf` + `@signpdf/signer-p12` (MIT) PAdES seal. Hashing uses Node `crypto`. Add `node-forge` only if the seal library requires it. Each licence is checked in CI (`pnpm audit` plus a licence allow-list step: MIT, Apache-2.0, BSD, ISC).
- Cookies: none for signers (the token is in the path); staff cookie is first-party, declared in `lib/consent/registry.ts` only if it is ever set on a public site host (it is not: it lives on the sign host).
- Size budget: target about 1,500 lines for the app plus about 500 for `packages/sign`; report when exceeded.

## 8. Steps (each its own PR from a fresh branch off `main`, each passing `pnpm verify`)
- **S0. Approve this plan; answer section 9.** Update `CLAUDE.md`: remove "e-signatures" from the forms' out-of-scope line, add the section "Signatures app" pointing here. Note in `docs/team-sync.md` for Joan Marc (new app, port, host, role, env vars; nothing to do in his apps).
- **S1. Scaffold `apps/sign` (about 0.5 day):** Next app on 3004, own login and cookie, health, tick, robots, CSP, `pnpm dev` starts five apps, e2e runner port and `apex_sign` role, `check-boundaries.sh` extended with self-test. Empty but green in CI.
- **S2. Data and drafts (about 1 day):** migration + `db/grants.sql` + schema in `packages/db`; staff list and create-draft screens; PDF upload with content detection, hash, page count; add/remove signers; field placement by list and click-to-place on a page preview; validation of a request. Unit tests: state machine, geometry (percent bounds), validation.
- **S3. Sending and the signer page (about 1.5 days):** send action and `outbox` emails in three languages; `/sign/<token>` page: viewer, consent, type/draw signature, other fields, decline; order handling; rate limits; events. Tests: token rules (expired, reused, wrong request), concurrent last-signature race (exactly one seal), ordered signing.
- **S4. Sealing and audit page (about 1.5 days):** stamping, audit page, PAdES seal, hash checks, sealed download and emails; verify the output with an independent PDF validator in a test (open with `pdf-lib`/`qpdf` for structure, check the signature byte range and hash); tamper test (altered original refuses to seal). Self-signed seal certificate for development generated by a script and used by tests only.
- **S5. Lifecycle and CRM link (about 0.5 day):** reminders, expiry, retry/backoff and failure reporting, ip-hash purge; "Signatures" tab (read-only status list) on company/project/contact pages; erasure behaviour.
- **S6. Deploy and edge (about 0.5 day):** Dockerfile `start-sign`, compose service, tag `APEX_TAG_SIGN`, `deploy.sh [all|web|admin|crm|forms|sign]` with its own health check and rollback, Caddy host `SIGN_DOMAIN` (staff locked; `/sign/*` and the signer API open), scheduler line, uptime check, bucket for `sign/` objects (private), seal certificate handling in `DEPLOY.md`; extend `docker-smoke.sh`, `deploy-drill.sh`, `caddy-drill.sh`, `boundary-drill.sh` (`apex_sign` can write only its tables, read `users`, `clients`/`projects`/`contacts` ids for linking, shared tables as the forms role does).
- **S7. Docs and handover:** `docs/guia-signatures.md` (Catalan) for staff, legal text placeholders listed in the handover notes, CODEOWNERS, `CONTRIBUTING.md`.
- Rough total: **5.5 to 6.5 working days**, plus legal review in parallel.

## 9. Decisions to take (defaults in bold)
1. Seal certificate: **self-signed at first** (Acrobat shows "validity unknown", but any change after sealing is flagged), or a purchased organisation certificate from a CA. Switching later needs no schema change.
2. Who signs: **external signers only** in v1 (members, companies, people); staff co-signing as a signer (with the same email-link flow) is allowed, but there is no staff-side shortcut.
3. Host and login: **own `SIGN_DOMAIN` and cookie**, a fourth staff login (same trade-off as the forms app).
4. Ownership: **Sam** (business tools); Joan Marc reviews shared files only.
5. Signing order: **optional, off by default.**
6. Reminders and expiry: **one reminder at 3 days, expiry at 14 days**, both per request overridable.
7. Retention of sealed PDFs and audit trail: **kept until the legal adviser answers** (flag, not a silent rule).
8. Signer identity beyond email link (SMS code, ID check): **not in v1.** Add only for a concrete need.

## 10. Not building (v1)
Templates with merge fields, bulk send, in-person signing on a tablet, QES, SMS or ID verification, payments, signer accounts, a free-form editor, a public signing-verification page (the PDF itself is verifiable offline), integrations with other signature providers, per-request custom branding.

## 11. Risks
- **Legal weight depends on wording and process, not on code:** the adviser must approve consent text, retention and the list of allowed documents before real use.
- **PDF edge cases** (forms, encrypted, very large, odd page boxes/rotation): handled by refusing unsupported files up front; stamping must respect page rotation and crop boxes (tests with rotated pages).
- **Seal library maturity:** isolated behind one function in `packages/sign`, so it can be swapped for a different PAdES implementation or an external timestamp authority later without touching the app.
- **No trusted timestamp** in v1 (times come from our server clock, recorded in the audit page); adding an RFC 3161 timestamp from a trusted authority is a possible follow-up for stronger evidence.
- **Fifth process** (+ about 150 MB RAM) and another login; same trade-off as the forms app.
- **Migrations stay additive** so each app can be one version behind.
