# Apex — build guide for Claude Code

This file orients Claude Code (or any engineer) starting the Apex project. It summarizes the plan and mockups already agreed with the client; treat it as the source of truth until superseded by code or a written decision.

## What Apex is

Three parts, one shared backend:

1. **Public website** — a content site (blog posts + themed landing pages) visible to everyone.
2. **Internal backend** — staff-only. Doubles as CRM, ERP, project manager and client manager.
3. **Client portal** — clients log in to see their own projects, documents and invoices (later phase).

**This guide covers the backbone: the public website + the backend content, lead-capture and form-builder pieces underneath it.** CRM/ERP/project-manager modules and the client portal are separate, later phases — don't build them yet.

## Core priorities (apply to every decision below)

1. **Simplicity and robustness over new, interactive or complex features.** When two approaches solve the same problem, pick the plainer, more battle-tested one, even if it's less flashy.
2. **One database, one API, no separate systems.** Content, leads and form submissions all live in the same Postgres database and are served through the same API. Never wire the public site to a separate CMS/lead tool.
3. **No freeform canvas editors anywhere in the backend.** Pages, posts and forms are all built from a fixed, ordered list of typed sections/fields — add, reorder (up/down), remove. Never drag-and-drop-anywhere positioning, never per-item custom CSS.
4. **Public pages are pre-rendered** (SSR/SSG) for speed, SEO, and so the site survives a backend outage.
5. **Consistent look by construction.** Every section/field renders with the site's fixed design tokens (below). Editors fill in content; they never choose fonts, colors or layout.

## Recommended stack

- **Next.js** for both the public site and the backend admin, one repository, two apps/routes sharing code.
- **PostgreSQL** (EU region) as the single database.
- **A custom, minimal CMS** built in the same Next.js app (decision by client, replaces the earlier Payload suggestion): Drizzle ORM + Zod on Postgres. See "Custom CMS design" below — keep it as small and generic as described there.
- **S3-compatible object storage** for images/files.
- **A transactional email service** for notifications.

Alternatives (Astro + headless CMS, WordPress) were considered and rejected because they split content and CRM/lead data into separate systems, violating priority 2.

## Custom CMS design


**Principle: a few generic parts, reused everywhere. New content or fields = data/config, not new code.**

#### Tables (8 total)
`users` (email, password_hash, role admin|editor) · `sessions` · `entries` (type `post`|`page`, theme, category_id, author_id, tags text[], cover media_id, publish date) · `entry_translations` (entry_id, locale, title, slug, `sections` jsonb, seo jsonb, status, publish_at) · `categories` (+ names jsonb per locale) · `media` (key, alt jsonb per locale, credit) · `forms` (fields jsonb, destination, notifications, consent jsonb per locale) · `settings` (single row, jsonb: nav, footer, SEO, contact, cookie text).
Lead tables (`contacts`, `leads`, `submissions`, `newsletter_optins`) are separate and belong to the lead pipeline.
Posts and landing pages share **one** `entries` table; the only difference is `type`.

#### Five generic building blocks
1. **Section registry** — `sections/<name>.ts` exports `{ name, label, fields, Render }`. `fields` is a tiny declarative list (`text`, `textarea`, `image`, `link`, `select`, `list`). Zod validation and the **admin form are generated from `fields`**, so adding a section type = **one file, no admin code**. Sections: header, text, image, embed, form, CTA, tile row, card grid.
2. **`<ListEditor>`** — one component: add from a picker, ↑ ↓ ✕. Used for page sections **and** form fields **and** nav/footer links. Not built three times.
3. **Generic entity screens** — a list screen and an edit screen driven by config, reused for entries, categories, media, forms, users. No hand-built screen per content type.
4. **`translations` pattern** — every localized thing is `jsonb {ca,es,en}` or a translation row; one helper resolves locale with fallback to `ca`.
5. **`publish(entry, locale)`** — the only function that changes status: set `published`, snapshot a version, revalidate that tag. Scheduled publishing is one cron route that calls the same function.

#### Rules that keep it small and stable
- **Deps (short list):** `next`, `drizzle-orm` + `postgres`, `zod`, `@node-rs/argon2`, `sharp`, AWS S3 SDK, `nodemailer`. Nothing else without a written reason.
- **Auth:** email + password, argon2id, session cookie backed by `sessions`, CSRF, login rate-limit; ~150 lines in one file. Permissions: one `can(user, action)` function. No SSO, no user-defined roles.
- **Versions:** on publish, copy the translation row into `entry_versions` (keep last 10). Restore = copy back. No diff UI.
- **Media:** presigned upload to S3; `sharp` makes 3 fixed widths; alt required per language.
- **Public reads** go through one `getEntry(type, slug, locale)` returning only `published`; pages are ISR with tag revalidation.
- **Migrations:** plain SQL files in git, applied by one script; run automatically in staging, by hand (reviewed) in production.
- **Tests:** unit tests for section validation, `can()`, `publish()`, lead pipeline; one Playwright test: login → draft → publish → page live.
- **Size budget:** whole CMS (admin + API + registry) target under ~6,000 lines maximum; if it grows past that, stop and simplify.

#### How to extend
| Need | Change |
|---|---|
| New section type | add `sections/<name>.ts` (schema + renderer) |
| New field type in form builder | add one entry to `packages/forms/fieldTypes.ts` (validate + render) |
| New language | add locale code to config + one row of UI strings |
| New content type later (CRM, projects) | new table + config for the generic screens |

#### Non-goals
Plugin system, GraphQL, real-time collaboration, comments, drag-and-drop, custom-fields UI, theme editor, rich-text canvas (text sections allow only paragraph, bold, italic, link, list).

Full detail and phase plan: `PLAN.md`.

## Design tokens (from the approved mockups)

- **Accent color:** `#D50032`
- **Background (ivory):** `#FAF9F5`; **secondary background:** `#F2F0E8`
- **Ink (near-black):** `#141413`; **secondary ink panel:** `#23221F`
- **Text, secondary/quiet:** `#5C5A54` / `#8A8780`
- **Borders/dividers:** `#E5E2D9`
- **Type:** serif (Georgia/Times New Roman) for headings and display; sans (Inter/system-ui) for body and UI
- **Radius:** 6–10px on cards/buttons; **borders:** 1px, `#E5E2D9`
- Reference the mockup artifact for exact spacing, card patterns and component shapes before building — treat it as the visual spec, not just inspiration.

## Content model

Seven content types, each translatable into Catalan, Spanish and English (`/ca/`, `/es/`, `/en/` URL prefixes, alternate-language tags):

| Type | Purpose | Key fields |
|---|---|---|
| Post | Blog articles | Title, slug, sections (see below), author, category, tags, cover image, publish date, status |
| Landing page | Themed page | Title, slug, theme, sections, form, SEO fields, status |
| Section | One block in a post/page's ordered list | Type (header, text, image, embed, form, CTA, tile row, card grid…), fields per type, order |
| Category / tag | Grouping and nav | Name, slug, translations |
| Form | Lead/response capture | Fields (see form builder below), destination, consent text, notifications |
| Media | Images/files | File, alt text per language, credit |
| Site settings | Global elements | Nav, footer, default SEO, contact details, cookie text |

Status is draft / scheduled / published, per language independently, so a page can go live in one language before others are translated.

### Editor UI (posts and landing pages, same mechanism)

- Each page/post is an ordered list of sections.
- Staff add a section from a fixed picker, fill its fields (heading, body text, image, link), reorder with up/down controls, remove with an ✕.
- No freeform positioning, resizing, or per-section style overrides — see the "Editor" mockup artboard.
- Embeds are restricted to **YouTube and Adobe (Express/Acrobat/Creative Cloud)** only, via pasted link — no generic embed-code field.
- Author, category, date, per-language publish status and SEO fields live in a side panel (see mockup).

### Form builder (Fillout replacement)

Build Apex's own form builder — same list-based mechanism as the section editor, not a canvas:

- **Field types:** short text, long text, email, phone, number, dropdown, multiple choice, checkbox, date, file upload, section/page break (multi-step forms).
- **Conditional logic:** show/hide a field based on an earlier answer.
- **Validation:** required fields, email format, number ranges.
- **Sharing:** a link and an embeddable version.
- **Destination is configurable per form**, set when the form is built:
  - create/update a CRM contact + lead, or
  - attach submissions to a project/client record, or
  - collect responses only, no CRM link.
- **Notifications:** email to staff on submission; optional confirmation email to the respondent.
- **Reporting:** submission count and completion rate per form; export submissions as a spreadsheet.
- **Explicitly out of scope for v1:** payments, e-signatures, calculated/formula fields, custom per-form styling. Add only if a concrete need arises later.
- See the "FormBuilder" mockup artboard for the UI (field list + destination panel + notification toggles).

## Lead capture pipeline

Every form submission (from a landing page or a standalone form) goes through the same flow:

1. Browser submits to the Apex API — never directly to the database.
2. API validates, rejects spam (honeypot field, rate limit, privacy-friendly bot check), and stores the exact consent text + timestamp.
3. If the email exists, update that contact and add a new lead; otherwise create the contact.
4. Tag the lead with source page, theme, language, and any UTM campaign parameters.
5. Route to the form's configured destination (CRM lead / project record / responses only).
6. Notify staff; show the visitor a confirmation.

Newsletter opt-in is a separate, unticked checkbox — never bundled into a general contact-request consent.

## Build order

1. **Repository, environments, database** — one repo, both apps run locally with one command; local/staging/production each with their own DB and secrets; daily backups with a tested restore.
2. **Backend content tools (custom CMS)** — seven content types, three languages, roles (admin/editor), draft/scheduled/published states. Done when an editor can draft and publish a translated post using the section-list editor.
3. **Public site rendering** — language-prefixed routes, section renderer, blog index/post/category pages, sitemap, robots, error pages. Done when a published page appears live within a minute, no full redeploy.
4. **Design foundation** — implement the tokens above as the base component library (header, footer, buttons, cards, form fields), mobile-first, accessible. Done when every section looks right at phone and desktop widths.
5. **Forms and lead pipeline** — build the form builder and wire it to the pipeline above. Done when a test submission reaches the CRM with correct source tags and consent record.
6. **Consent and legal pages** — cookie banner (accept/reject, equal prominence), privacy policy, legal notice, consent records on forms. Done when no non-essential script loads before consent.
7. **Deployment pipeline** — checks + build on every change, auto-deploy to staging, deploy to production on approval, domain + HTTPS. Done when a commit reaches staging with no manual steps.
8. **Monitoring and handover** — error tracking, uptime check, backup alerts, a short editor guide.

Rough estimate: 6–8 weeks for one full-time developer, before the form builder was added (~1–2 extra weeks); refine once the stack is confirmed.

## Open decisions to confirm before/while building

- Default language among Catalan / Spanish / English.
- Hosting provider and EU region.
- Who provides the logo/brand assets beyond the accent color already given (`#D50032`).
- Which staff will be editors, and who translates each language.
- Any must-have Fillout feature not already listed above.

## Reference artifacts

- **Public site mockup** (homepage: header, hero, highlight tiles, news grid, courses grid, newsletter band, footer) — build to this pixel-for-pixel where feasible; it is the visual spec.
- **Editor mockup** (page/post section-list editor + side panel).
- **FormBuilder mockup** (field-list form builder + destination panel).

Ask the person running this guide for the mockup artifact link(s) if they weren't provided alongside this file.
