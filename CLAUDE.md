# Apex — build guide for Claude Code

This file orients Claude Code (or any engineer) starting the Apex project. It summarizes the plan and mockups already agreed with the client; treat it as the source of truth until superseded by code or a written decision.

## What Apex is

Three parts, one shared backend:

1. **Public website** — a content site (blog posts + themed landing pages) visible to everyone.
2. **Internal backend** — staff-only. Doubles as CRM, ERP, project manager and client manager.
3. **Client portal** — clients log in to see their own projects, documents and invoices (later phase).

**This guide covers the backbone: the public website + the backend content, lead-capture and form-builder pieces underneath it.** The full CRM/ERP/project-manager modules and the client portal are separate, later phases — don't build them yet (only the minimal Clients/Projects records that forms can attach to exist; see phase 6).

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
- **Auth:** email + password, argon2id, session cookie backed by `sessions`, CSRF, login rate-limit; ~150 lines in one file. Permissions: one `can(user, action)` function. No SSO, no user-defined roles. **Users screen (admin only):** create user, change role, reset password, delete. Passwords min 12 chars; role change / password reset / own password change sign the user out everywhere; the last admin can't be demoted or deleted, and nobody can demote or delete themselves. Every user has "El meu compte" to change their own password.
- **Draft vs live:** editable columns on `entry_translations` are the draft; `live` (jsonb) is the validated snapshot the public site serves. Saving never changes what is live; only `publish()` copies draft → live. Status: `scheduled` if a future publish is pending, else `published` if `live` exists, else `draft`.
- **Versions:** on publish, copy the translation row into `entry_versions` (keep last 10). Restore = copy back. No diff UI.
- **Media:** uploaded through the app (`POST /api/media`, logged-in users only), not presigned browser uploads, so every file is checked on the server: real type detected from bytes, images re-encoded by `sharp` to WebP at 3 fixed widths (480/960/1600, never upscaled, metadata stripped), PDFs stored as-is, SVG rejected, max 15 MB. **Alt text per language is required** on any image before its page can be published. A file in use can't be deleted.
- **Public reads** go through one `getEntry(type, slug, locale)` returning only `published`; pages are ISR with tag revalidation.
- **Migrations:** plain SQL files in git, applied by one script; run automatically in staging, by hand (reviewed) in production.
- **Tests:** unit tests for section validation, `can()`, `publish()`, the public queries, media pipeline and the lead pipeline (throwaway DB); Playwright end-to-end suite (login throttle, draft → publish → live, hidden draft edits, unpublish, scheduled publish via cron, editor permissions) run in CI on every change.
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

## Public site (phase 3)
- **URLs:** `/{ca|es|en}/…` — home `/{l}`, landing pages `/{l}/{slug}`, blog `/{l}/blog`, post `/{l}/blog/{slug}`, category `/{l}/blog/categoria/{slug}`. Paths without a language go to `/ca` (`proxy.ts`). Reserved slugs (`blog`, `categoria`, `admin`, `api`, `sitemap`, `robots`) can't be published.
- **Homepage** is a landing page chosen in *Configuració*; nav, footer, contact, legal links and default SEO also live there (same field language as sections). A language without a live homepage redirects to `/ca`.
- **Caching = the outage rule.** Pages are generated on first visit and cached (ISR). All public reads use one cache tag, `content`; publish, unpublish, delete, scheduled publish, settings, categories and media edits expire it. Result: an edit is live in well under a second, and cached pages keep being served if the database is down. A page nobody has opened since the last change is not cached yet, so `scripts/warm.sh` (fetches every sitemap URL) runs after each deploy and every few minutes from cron. A build never needs the database.
- **Lists** show the latest 60 posts (no pagination yet, deliberate). **Embeds** load only after a click (no third-party request before consent). **Forms** sections render nothing until phase 5. `latestPosts` is an automatic news grid section.
- **SEO:** per-page title/description, canonical, hreflang (+ x-default), Open Graph/Twitter, `sitemap.xml` with alternates, `robots.txt`, localized 404/error pages.

## Design foundation (phase 4)
- **One tokens file:** `apps/web/styles/tokens.css` holds every colour, type size, space, radius and shadow; the public site and the admin both read it. Nothing else defines a colour. To rebrand, edit that file.
- **Contrast rules (enforced by `lib/__tests__/contrast.test.ts`, which parses the tokens file):** `#8A8780` fails as text (3.1–3.6:1) so it is only used for input outlines (`--field-border`, needs 3:1); small grey text uses `--text2` `#5C5A54` (6:1+); accent `#D50032` is fine on light backgrounds but **must not be used for small text on dark panels** (3.4:1) — use ivory there (the hero label uses ivory with a red bar).
- **Component library:** `components/ui/` — `Button`, `Card`, and accessible form fields (`TextField`, `TextAreaField`, `SelectField`, `CheckboxField`, `RadioGroup`: visible label, hint/error wired with `aria-describedby`, `aria-invalid`, 44px touch targets). Site pieces (`Shell`, header, footer, `PostCard`, section renderers) live in `components/site/` and `sections/render.tsx`.
- **Styleguide:** `/styleguide` (local/e2e only, 404 in production) shows tokens with live contrast ratios, type, buttons, form fields in every state, cards and all section types.
- **Accessibility checks on every change:** `e2e/design.spec.ts` runs axe (WCAG 2.2 AA) plus sideways-overflow and 44px touch-target checks on every public page at 320 / 375 / 768 / 1024 / 1440 px, and keyboard tests (skip link, mobile menu, visible focus).
- **Mockup fidelity:** at 1440px the header, hero (460px, 48px headline, label + two buttons), tiles, cards (170px image), 3- and 4-column grids and footer columns match the approved homepage mockup. The newsletter band needs the form pipeline and lands with phase 5/6.

## Forms and lead pipeline (phase 5)
- **Builder:** *Formularis* in the admin. A form is an ordered list of typed fields (same mechanism as page sections; ↑ ↓ ✕). Field types live in one registry, `lib/forms/fieldTypes.ts` (short/long text, email, phone, number, dropdown, multiple choice (one/many), checkbox, date, file upload, page break); adding a type = one registry entry + its check in `lib/forms/validate.ts` + its input in `components/site/form/Inputs.tsx`. Every label, help text, option and message is per language (CA/ES/EN, Catalan fallback). Conditional logic (`showField/showOp/showValue`) may only depend on an *earlier* field and is checked on save. Number ranges, required, email/phone/date formats are validated in the browser **and** again on the server (the server is the only one that counts).
- **Pipeline (`lib/forms/submit.ts`, one transaction):** browser → `POST /api/forms/{slug}/submit` (never the database) → honeypot → bot check → rate limit → validation of *visible* fields only → consent → files → in one transaction: submission (answers stored as a snapshot of label+value, so later form edits never rewrite history), contact upsert by email (blank values never erase known data), lead tagged with source page, page theme, language and UTM, newsletter opt-in, email outbox. Destination per form: *contact + lead* or *responses only*; *attach to project/client* attaches to a record of the minimal Projects module (phase 6).
- **Consent & newsletter:** the exact consent wording and a timestamp are stored on every submission. The newsletter box is a separate, unticked checkbox with its own stored wording (`newsletter_optins`); consenting to the privacy policy never subscribes anyone. Pushing opt-ins to the external newsletter tool is a later step (the table has `synced_at` for it).
- **Spam defences (no third parties, no cookies):** hidden honeypot field; a signed, expiring, single-use proof-of-work challenge solved by the visitor's browser (`lib/forms/pow.ts`; needs `BOT_SECRET`); rate limit of 5 submissions per address per form per 10 min and 20 per hour, using a keyed hash of the address that is purged after 24 h. **The reverse proxy in front of the app must append the client address to `X-Forwarded-For` (see `TRUSTED_PROXY_HOPS`).**
- **Files:** identified by content (PDF, images, Word, Excel), 10 MB max, stored in a **private** bucket (`S3_PRIVATE_BUCKET`), downloaded by staff through 60-second signed links after a login check. No antivirus scanning yet (note for hosting).
- **Email:** plain text via SMTP (`SMTP_URL`, `MAIL_FROM`). Emails are written to an `outbox` table in the same transaction as the submission and sent afterwards with retries (1 min → 24 h, 8 attempts, then flagged "dead" in the admin), so a mail outage never loses a notification or blocks the visitor. `POST /api/cron/tick` (every minute) publishes due scheduled content, sends/retries emails and purges old address hashes.
- **Reporting:** per form: submissions, anonymous "started" counter (no cookie, no personal data) and completion rate; CSV export (UTF-8 BOM, `;` separated, spreadsheet formulas neutralised); responses screen with paging; read-only *Contactes* list. **Erasure:** admins can erase a contact with all their leads, submissions, files and newsletter opt-in; any editor can delete a single response; deleting a form deletes its responses and files.
- **Sharing:** link `/{locale}/form/{slug}` (not indexed), embeddable `/embed/{locale}/form/{slug}` (iframe code shown in the builder; the only place other sites may frame), or the *Formulari* section inside any page/post. Forms are cached with the site; staff notification addresses are never sent to the browser.
- **Security headers:** `nosniff`, referrer policy, permissions policy on every route; admin and API cannot be framed; public pages only by themselves. The Content-Security-Policy is set per request (see phase 6).
- **Known limits (deliberate):** UTM tags come from the address the visitor is on when submitting, plus the remembered campaign if they allowed *Campaign source*; forms need JavaScript (the bot check does); XLSX is not offered, CSV opens in Excel/Sheets; uploaded files are not virus-scanned (do it at the hosting layer).

## Projects module, consent and hardening (phase 6)
- **Projects module (deliberately minimal):** *Clients* and *Projects* (name, client, status active/paused/done, notes) in the admin. A form with destination *Adjuntar a un projecte o client* attaches every response to ONE chosen project or client (no contact/lead is created); the record page lists the attached responses. Deleting a project/client never deletes responses (they simply become unattached). The full CRM / ERP / project-manager screens (tasks, invoicing, documents, client portal) remain later phases.
- **Cookie consent:** one first-party cookie `apex_consent` (necessary: it only stores the choice; 6 months, versioned, then we ask again). Categories: *Necessary* (always on), *Campaign source* (remember `utm_*` in `sessionStorage` while browsing so it reaches the lead) and *External content* (YouTube/Adobe embeds load automatically instead of after a click). Accept and reject look identical; "Configure" opens a keyboard-operable dialog; a "Cookie settings" link is in every footer and any link to `#cookie-settings` (also inside page text) reopens it. Withdrawing consent erases what was kept. Nothing non-essential runs before a yes. Everything the site stores is declared once in `lib/consent/registry.ts`; the *Llista de cookies* section renders the public cookie declaration from it, so the text cannot drift from reality. **Add a new cookie/tracker = add it to that registry first.**
- **Legal pages:** privacy policy and legal notice are ordinary pages in the CMS, but their wording (entity, tax id, address, purposes, retention, rights) **must come from the client's legal adviser** — the demo seed only creates clearly marked placeholders. Add them to *Configuració → Enllaços legals*.
- **Content-Security-Policy** (`lib/csp.ts`, applied per request in `proxy.ts`): no third-party script can run (enforced by the browser, tested), frames only from YouTube/Adobe, images/media only from our own origin and the media bucket, `object-src 'none'`, `form-action 'self'`; admin and API can never be framed, public pages only by themselves, `/embed` by anyone. Trade-off: `'unsafe-inline'` for scripts/styles (cached pages cannot carry per-request nonces).
- **Client address behind a proxy:** `TRUSTED_PROXY_HOPS` (default 1) counts `X-Forwarded-For` entries from the RIGHT, so a visitor cannot spoof their address to dodge the rate limit; works with any proxy that appends the address (Caddy, nginx, most load balancers). Reference proxy config: `deploy/Caddyfile` (not yet exercised by tests; verify on the real server).

## Site navigation (from the current gremi.net structure)
- **Menu:** *Configuració → Menú principal*: up to 8 entries, each either a link or a section with a **submenu** (up to 12 links). Desktop (≥1100px): accessible dropdowns (real buttons with `aria-expanded`; Enter/Space opens, Tab walks the links, Escape closes and returns focus, click outside closes; hover also opens). Below 1100px: the "Menú" panel with expandable sections. An entry needs a link or a submenu (checked on save).
- **Header buttons:** *Botons de la capçalera* (up to 3, label per language, link may be an external site, red or outline) — this is where **"Campus virtual"** goes.
- **Social links:** *Xarxes socials* (Facebook, X, Instagram, YouTube, LinkedIn) as labelled icons in the top bar. Plus the phone/email, language switcher and footer already described.
- **Demo data:** `seed:demo` loads the real section structure (El GREMI, Laboral, Formació, Actualitat, Borsa de treball, Agremia't) with placeholder pages marked `[CONTINGUT PENDENT DE MIGRAR]`; the Campus link is a placeholder (`https://campus.example`) until the real address is set. Migrating the actual page content from gremi.net is a separate task.
- **Not built (yet):** the site search box present on gremi.net.
