# Apex — build guide for Claude Code

This file orients Claude Code (or any engineer) starting the Apex project. It summarizes the plan and mockups already agreed with the client; treat it as the source of truth until superseded by code or a written decision.

## Read first: team sync notices
**At the start of every session, read `docs/team-sync.md`** and do any open item addressed to the person you are working for (Joan Marc / Sam). It lists what the other side changed that you must act on (migrations, moved tables, new rules). Add a notice there whenever you change something the other person's side must act on.

## Git workflow (team decision: 2 people, Claude merges)
- **Never commit or push to `main` directly.** Every change, however small, goes on its own branch created from the latest `main` (`git fetch origin main && git checkout -b <branch> origin/main`).
- **One branch per task/person.** Two people work in parallel, so never commit on someone else's branch unless asked; never rewrite history (rebase, amend, force-push) on a branch already pushed.
- **Merging is done by Claude** through a pull request to `main`: only when CI is green and there is no conflict. If `main` moved, merge `main` into the branch first (merge commit, not rebase), re-run checks, then merge the PR. If both branches changed the same logic, ask before choosing.
- After a branch is merged, follow-up work starts on a fresh branch from `main`; a merged branch is never reused.

## What Apex is

Three parts, one shared backend:

1. **Public website** — a content site (blog posts + themed landing pages) visible to everyone.
2. **Internal backend** — staff-only. Doubles as CRM, ERP, project manager and client manager.
3. **Client portal** — clients log in to see their own projects, documents and invoices (later phase).

**This guide covers the backbone: the public website + the backend content, lead-capture and form-builder pieces underneath it.** The full CRM/ERP/project-manager modules and the client portal are separate, later phases — don't build them yet (only the minimal Clients/Projects records that forms can attach to exist; see phase 6).

## Core priorities (apply to every decision below)

1. **Simplicity and robustness over new, interactive or complex features.** When two approaches solve the same problem, pick the plainer, more battle-tested one, even if it's less flashy.
2. **One database, one API, no separate systems.** Content, leads and form submissions all live in the same Postgres database and are served through the same API. Never wire the public site to a separate CMS/lead tool.
3. **No freeform canvas editors anywhere in the backend.** Pages, posts and forms are all built from a fixed, ordered list of typed sections/fields — add, reorder (up/down), remove. Never pixel/absolute positioning, never per-item custom CSS. *Client decision (phase 13):* pages also get a visual, Elementor-style builder with drag and drop, but it only moves sections and blocks within that same ordered list and columns, and styles are a fixed set of brand choices (see "Visual page builder").
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
- **Size budget:** whole CMS (admin + API + registry) soft target of ~6,000 lines. It is a guideline, not a hard stop (decision: flexible). When it is exceeded, say so and review for simplification before adding more; current size is recorded in the phase notes.

#### How to extend
| Need | Change |
|---|---|
| New section type | add `sections/<name>.ts` (schema + renderer) |
| New field type in form builder | add one entry to `packages/forms/fieldTypes.ts` (validate + render) |
| New language | add locale code to config + one row of UI strings |
| New content type later (CRM, projects) | new table + config for the generic screens |

#### Non-goals
Plugin system, GraphQL, real-time collaboration, comments, freeform (pixel) positioning, custom-fields UI, theme editor, rich-text canvas (text sections allow only paragraph, bold, italic, link, list).

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
- No freeform positioning, resizing, or free style overrides — only the brand style choices of the visual builder (phase 13).
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
- **One tokens file:** `packages/ui/src/tokens.css` holds every colour, type size, space, radius and shadow; the public site and the admin both read it. Nothing else defines a colour. To rebrand, edit that file.
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
- **Reporting:** per form: submissions, anonymous "started" counter (no cookie, no personal data) and completion rate; CSV export (UTF-8 BOM, `;` separated, spreadsheet formulas neutralised); responses screen with paging; *Contactes* list (phase 9 makes it a lead manager). **Erasure:** admins can erase a contact with all their leads, submissions, files and newsletter opt-in; any editor can delete a single response; deleting a form deletes its responses and files.
- **Sharing:** link `/{locale}/form/{slug}` (not indexed), embeddable `/embed/{locale}/form/{slug}` (iframe code shown in the builder; the only place other sites may frame), or the *Formulari* section inside any page/post. Forms are cached with the site; staff notification addresses are never sent to the browser.
- **Security headers:** `nosniff`, referrer policy, permissions policy on every route; admin and API cannot be framed; public pages only by themselves. The Content-Security-Policy is set per request (see phase 6).
- **Known limits (deliberate):** UTM tags come from the address the visitor is on when submitting, plus the remembered campaign if they allowed *Campaign source*; forms need JavaScript (the bot check does); XLSX is not offered, CSV opens in Excel/Sheets; uploaded files are not virus-scanned (do it at the hosting layer).

## Projects module, consent and hardening (phase 6)
- **Projects module (deliberately minimal):** *Clients* and *Projects* (name, client, status active/paused/done, notes) in the admin. A form with destination *Adjuntar a un projecte o client* attaches every response to ONE chosen project or client (no contact/lead is created); the record page lists the attached responses. Deleting a project/client never deletes responses (they simply become unattached). The full CRM / ERP / project-manager screens (tasks, invoicing, documents, client portal) remain later phases.
- **Cookie consent:** one first-party cookie `apex_consent` (necessary: it only stores the choice; 6 months, versioned, then we ask again). Categories: *Necessary* (always on), *Campaign source* (remember `utm_*` in `sessionStorage` while browsing so it reaches the lead) and *External content* (YouTube/Adobe embeds load automatically instead of after a click). Accept and reject look identical; "Configure" opens a keyboard-operable dialog; a "Cookie settings" link is in every footer and any link to `#cookie-settings` (also inside page text) reopens it. Withdrawing consent erases what was kept. Nothing non-essential runs before a yes. Everything the site stores is declared once in `lib/consent/registry.ts`; the *Llista de cookies* section renders the public cookie declaration from it, so the text cannot drift from reality. **Add a new cookie/tracker = add it to that registry first.**
- **Legal pages:** privacy policy and legal notice are ordinary pages in the CMS, but their wording (entity, tax id, address, purposes, retention, rights) **must come from the client's legal adviser** — the demo seed only creates clearly marked placeholders. Add them to *Configuració → Enllaços legals*.
- **Content-Security-Policy** (`lib/csp.ts`, applied per request in `proxy.ts`): no third-party script can run (enforced by the browser, tested), frames only from YouTube/Adobe, images/media only from our own origin and the media bucket, `object-src 'none'`, `form-action 'self'`; admin and API can never be framed, public pages only by themselves, `/embed` by anyone. Trade-off: `'unsafe-inline'` for scripts/styles (cached pages cannot carry per-request nonces).
- **Client address behind a proxy:** `TRUSTED_PROXY_HOPS` (default 1) counts `X-Forwarded-For` entries from the RIGHT, so a visitor cannot spoof their address to dodge the rate limit; works with any proxy that appends the address (Caddy, nginx, most load balancers). Reference proxy config: `deploy/Caddyfile`; its staff-only rule is exercised by `scripts/caddy-drill.sh` (TLS certificates and real client addresses still need checking on the real server).

## Site navigation (from the current gremi.net structure)
- **Menu:** *Configuració → Menú principal*: up to 8 entries, each either a link or a section with a **submenu** (up to 12 links). Desktop (≥1100px): accessible dropdowns (real buttons with `aria-expanded`; Enter/Space opens, Tab walks the links, Escape closes and returns focus, click outside closes; hover also opens). Below 1100px: the "Menú" panel with expandable sections. An entry needs a link or a submenu (checked on save).
- **Header buttons:** *Botons de la capçalera* (up to 3, label per language, link may be an external site, red or outline) — this is where **"Campus virtual"** goes.
- **Social links:** *Xarxes socials* (Facebook, X, Instagram, YouTube, LinkedIn) as labelled icons in the top bar. Plus the phone/email, language switcher and footer already described.
- **Demo data:** `seed:demo` loads the real section structure (El GREMI, Laboral, Formació, Actualitat, Borsa de treball, Agremia't) with placeholder pages marked `[CONTINGUT PENDENT DE MIGRAR]`; the Campus link is a placeholder (`https://campus.example`) until the real address is set. Migrating the actual page content from gremi.net is a separate task.
- **Site search:** a plain GET form in the header (and mobile menu) → `/{locale}/search?q=` (`lib/search.ts`): Postgres over the LIVE snapshot only, accent/case-insensitive (also the Catalan middle dot), every word must match, title matches first, 20 results, `noindex`. No extension, no index, no service. It is the one public page rendered per request (needs the database); `search` is a reserved slug.

## CI and deployment foundation (phase 7)
- **CI** (`.github/workflows/ci.yml`, three parallel jobs; the logic is in `scripts/ci.sh` so it runs identically on a laptop: `pnpm verify`, or `pnpm verify:fast`): (1) lockfile-exact install, lint, types, unit + database tests, a **build with no configuration and no database**, the full Playwright end-to-end suite (accessibility, consent, forms, security headers); (2) the production **Docker image** is built and smoke-tested on a fresh database (`scripts/docker-smoke.sh`: migrations, pages, headers, startup refusal, native libraries, first admin); (3) `pnpm audit` for known vulnerabilities. Dependabot opens weekly update PRs (npm, GitHub Actions, Docker); CI decides if they are safe. The workflow file itself has not been run on GitHub yet (only its script and its YAML validity were verified here).
- **One image for every environment** (`Dockerfile`, `docker-entrypoint.sh`): `start` (optionally migrating first, `AUTO_MIGRATE=1`) or `migrate`. Runs as a non-root user, has a health check on `GET /api/health`.
- **Fail-fast configuration:** on `APP_ENV=staging|production` the server **refuses to start** (exit 1, clear message) if a variable is missing, a secret is weak or a placeholder, the local dev password/bucket is used, the two buckets coincide, or production lacks `https`. The database connection is created on first use, so building never needs configuration.
- **First admin:** `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` create the admin only when the database has no users (then remove the variables).
- **Runbook:** `DEPLOY.md` (environment table, image commands, first-deployment checklist, scheduler lines, rollback). Automatic deploys (staging on merge, production on approval) wait for the hosting decision.

## Hosting: IONOS Cloud (phase 7, continued)
- **Choice:** one Linux server (Docker: app + Caddy with automatic HTTPS) + **IONOS Managed PostgreSQL** + **IONOS S3** (three buckets: public media, private visitor uploads, private backups) + an IONOS mailbox for SMTP. **Region: Logroño (`es/vit`, S3 `eu-south-2`)**, to be confirmed in the IONOS console for server + database (fallback: Frankfurt for everything). **Staging = a small separate server with PostgreSQL in Docker** (`deploy/compose.staging.yml`, tested by `scripts/staging-drill.sh`), not a second managed database. Endpoints are configurable (`S3_ENDPOINT`/`S3_REGION`, see `deploy/ionos/production.env.example`). Indicative cost (list prices, before VAT): server ≈ $10/month, managed database from ≈ $66/month, S3 ≈ $1–5/month; a staging copy roughly doubles the database cost.
- **Deploy:** `deploy/deploy.sh` (pull → migrate → start → wait healthy → warm cache; **automatic rollback** of a release that does not become healthy; a failing migration aborts without touching the running version). Production requires `DATABASE_URL` with `sslmode=require`. `.github/workflows/release.yml`: CI-tested commit → image on GHCR → staging automatically → production only by a person, with approval; the deploy action takes inputs only as environment variables and validates the tag.
- **Backups:** managed-database backups by IONOS **plus** our own encrypted dump to a private bucket (`deploy/backup.sh`) and a monthly **restore drill** (`deploy/restore-drill.sh`); all exercised by `scripts/backup-drill.sh` and `scripts/deploy-drill.sh` (run in CI).
- **Unverified on IONOS until the first run (marked ⚠ in `deploy/ionos/README.md`):** the public-read policy form on the media bucket, path-style S3 addressing (`S3_FORCE_PATH_STYLE`), database user privileges, the SMTP host/port.

## Monitoring and handover (phase 8)
- **Uptime:** external monitor on `GET /api/health?deep=1` (503 if the database is down *or* the scheduler has not run for 10 min); the plain `/api/health` stays DB-only for the container health check. `/api/cron/tick` stamps a heartbeat (`heartbeats` table).
- **Errors:** `onRequestError` in `instrumentation.ts` → `lib/errors.ts` writes to our own `error_log` (migration 0008): deduplicated by fingerprint with a counter, message + short stack + route path only (no query/body/cookies), one e-mail to `ALERT_EMAIL` per new error (reminder after 24 h while open), purged 90 days after resolved. Admin screen *Errors*, plus *Estat del sistema* on the dashboard. No third-party service. Note: a page that throws for a normal "not allowed" case is logged as a bug, so use `notFound()` like the other admin pages.
- **Backup alerts:** `BACKUP_PING_URL` / `DRILL_PING_URL` dead-man's-switch URLs (see `DEPLOY.md`, Monitoring).
- **Editor guide:** `docs/guia-editor.md` (Catalan).

## Version restore and size note
- **Restore:** the editor's side panel lists the last 10 published versions; *Restaura* copies one back into the **draft** (never into live); the editor reviews and presses Publica (`restoreVersion()` in `lib/publish.ts`).
- **Size:** app code ≈ 6,200 lines after search, restore and monitoring; the 6,000 target is now a soft guideline (client decision).

## CRM: lead management (phase 9)
- **Scope (deliberately small):** builds only on the pipeline's tables; no new external service. Migration 0009 adds `leads.owner_id`, a status check (`new|contacted|qualified|won|lost`), `lead_notes` and `clients.contact_id` (unique: one client per contact).
- **Screens:** *Contactes* = filterable list (text search on name/email/company, status, owner, paging of 50) → lead page with the answers and consent, status + owner, a notes log, "other requests from this contact", **Convert to client** (creates the client from the contact, marks the lead *won*, idempotent) and, for admins, erasure. Dashboard shows the number of new leads. Logic in `lib/leads.ts`; both roles may work leads (`leads:write`).
- **Erasure covers everything:** the contact, leads, notes, submissions, files, newsletter opt-in **and the client created from that contact** (its projects stay, unattached).
- **Search and views:** the lead search covers name, email, phone, company, every note and every answer's *value* (accent/case-insensitive, all words must match; `matchAll()` in `lib/search.ts`, shared by the clients/projects lists). *Contactes* has two views: **Peticions** (one row per lead) and **Persones** (one row per contact: request count, latest status, client link). The admin sidebar has one search box (`/admin/search`) over leads/contacts, clients and projects.
- **Still later phases:** client portal (third role, per-client access), ERP/invoicing.

## Staff-only admin
- Decision: keep ONE app (CRM, project manager, settings all live under `/admin`) and lock it at the edge rather than splitting into several apps. `deploy/Caddyfile` returns 404 for `/admin/*` and `/api/media/*` unless the visitor is in `ADMIN_ALLOWED_IPS` (empty = nobody). A later split into a second app in the same repo stays possible if the admin side grows its own release cadence or load.

## Project manager (phase 10, deliberately small)
- **Scope (defaults chosen by the client's delegate):** per project a **task list** (title, owner, optional due date, done/reopen, delete; overdue flagged) and a **document list** (a link, or a file). Not built on purpose: stages/boards, subtasks, dependencies, time tracking, comments. Both roles can use it (`projects:write`).
- **Screens:** the project page has *Tasques* and *Documents*; *Tasques* in the menu lists open tasks across projects (mine by default, or everyone's, optionally with finished ones); the dashboard shows "my open tasks"; the projects list shows open tasks per project. Logic in `lib/projects.ts`; shared row `components/admin/TaskRow.tsx`.
- **Files:** PDF, images, Word (.docx), Excel (.xlsx), max 10 MB, type decided from the bytes (same `classifyUpload` as forms), stored in the **private** bucket under `projects/<project>/<document>.<ext>`, downloaded by staff via a session check + 60-second signed link that must match the project. Deleting a document or project deletes the stored objects. Uploads go through a server action, so `serverActions.bodySizeLimit` is 12 MB (`next.config.ts`). Links must be http(s).
- **Later:** ERP phases beyond the registry (see `docs/erp-plan.md`).

## Client portal (phase 11, deliberately small)
- **Isolation by construction:** portal accounts are a SEPARATE system from staff users: own tables (`portal_users`, `portal_sessions`, `portal_tokens`), own cookie (`apex_portal`, path `/portal`), own pages under `/portal` (outside the `/{locale}` site and outside `/admin`). No staff check (`requireUser`, `getUser`, `can`) can ever admit a client, and a staff session is not a portal session. The Caddy admin lock does **not** cover `/portal` (clients come from anywhere).
- **Access:** staff open a client (*Clients*) → *Accés al portal* → invite the contact person's email. They get a single-use link (7 days; only its hash is stored) to set their own password (min 12 chars); "forgot password" sends a 1-hour link and gives the same answer for unknown addresses. Setting a password closes all sessions of that account; disabling an account ends its sessions at once; deleting a client (or erasing a contact whose client was made from them) removes their portal access. Login is throttled like the admin (5 failures / 15 min). Argon2id, `SameSite=Lax` httpOnly cookie, 7-day sessions.
- **What a client sees:** their client's name, their projects (name + status; never notes, tasks or form responses) and, per project, **only documents staff marked "Visible pel client"** (default: not shared). Files download through a session check + that the document is shared AND belongs to one of their projects + a 60-second signed link; anything else is a plain 404. A client email can belong to one client only.
- **Headers/SEO:** `/portal/*` is `noindex`, disallowed in robots, not frameable (CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`), no third-party anything. `portal` is a reserved slug. UI language is Catalan only for now (decision to revisit with the first real client).
- **Not built (on purpose):** client-side uploads, messaging/comments, notifications of new documents, invoices (ERP phase), multiple contacts with different permissions.

## Team workflow (two people on the repo)
- **`main` is always releasable** and is never pushed to directly (a local `.githooks/pre-push` refuses it; GitHub branch protection needs a paid plan for private repos, so it is by agreement, see `CONTRIBUTING.md`). Work on `feat/…`, `fix/…` or `chore/…` branches → pull request → CI green + review by the other person → **squash-merge** (the repo allows only squash merges and deletes merged branches).
- **Claude Code follows the same rules:** it works on a branch, opens a PR, and does not merge or push to `main` unless the user explicitly says so in that moment.
- **Collision rules:** migrations get the next free number after rebasing (a unit test rejects duplicates/gaps); on `pnpm-lock.yaml` conflicts take main's and reinstall; decisions go into this file in the same PR.
- **Ownership (see `.github/CODEOWNERS`, `CONTRIBUTING.md`):** Joan Marc (`@jmarcadell4-maker`) owns the website (public site + the website's admin: content, media, categories, settings, users, errors); Sam (`@s-sanchez-gremi`) owns the business tools (CRM, **forms**: builder, responses and the public submission pipeline, project manager, client portal, ERP registry). The form renderer used inside website pages (`components/site/form/`) is reviewed by both. Schema, migrations, auth/permissions, proxy/CSP, admin layout/menu/dashboard/search, deploy, scripts, CI and this file are shared (both review).

## ERP registry (phase 12): Apex REGISTERS, Sage does the real work
- **Decision:** Sage Despachos keeps the accounting, the legal invoices (it is the certified issuer), tax, direct-debit files and bank reconciliation. Apex only **registers** data and exports it: no invoice issuing, no approval workflows, no SEPA/IBAN/mandates, no bank import. Full plan and options: `docs/erp-plan.md` (v4).
- **Tables** (`db/schema/erp.ts`, migration 0012): `cost_centers` (course/project/general), `erp_categories` (each with its **Sage account**), `suppliers`, `fee_tiers`, `members`, `subscriptions`, and ONE `erp_entries` table for money in and out (expenses and income are filtered views). Money = **integer cents**, VAT = **basis points** (`lib/money.ts`: one rounding rule, half up; amounts typed like `1.234,56`; ambiguous `12,345` is refused). `total = base + vat` is enforced by a database check.
- **Screens** (`/admin/erp/*`, menu "Gestió", **admin-only through `erp:write`** until the team defines roles): overview (year totals, per cost center and category, unpaid/overdue, renewals due in 30 days); expenses/income lists with search and filters (+ paid/unpaid/overdue) and a **CSV export for Sage** (Sage account on every line); one form for both kinds with an attached document (private bucket, signed download); the simple lists (suppliers, categories, cost centers, fee tiers, members, subscriptions) share ONE generic screen driven by `lib/erp-entities.ts`.
- **Fees:** members have a tier and a billing period (annual / quarterly). *Quotes* previews and then creates one pending income entry per member per period (`2026` or `2026-T1`), skipping members already charged (database unique index). The Sage invoice number is typed on the entry afterwards. The tier's VAT defaults to 0 % (adviser to confirm).
- **Subscriptions:** *Registra la renovació* creates the expense and moves the renewal date by the period.
- **Records are corrected, not deleted:** entries can be edited and **voided** (excluded from lists and totals, kept for traceability). Financial rows never cascade from people: links are `set null` and the supplier/member **name is copied onto the entry**, so deleting a supplier, member or contact (erasure) leaves the financial record intact (retention rules: adviser to confirm).
- **Ownership:** Sam (business tools). New tables live in `db/schema/erp.ts`.

## Monorepo layout after the shared-packages step (S1 of `docs/split-plan.md`)
- **Source packages** (plain TypeScript, compiled by the apps through `transpilePackages`; no build step): `packages/db` (`@apex/db`: schema in core/website/crm/erp files, lazy client, migration runner), `packages/core` (`@apex/core/*`: staff auth with `SESSION_COOKIE`, permissions, storage, mail+outbox, money, search helpers, file detection, the field language, error log, heartbeat, `siteUrl`), `packages/ui` (`@apex/ui`: `tokens.css`, `admin.css`, Button/Card/Field, ConfirmButton, ListEditor, FieldForm, ListSearch, richtext), `packages/forms` (`@apex/forms/*`: field types, validation, messages, the pipeline, `FormRenderer`). SQL migrations stay in `/db/migrations`.
- **Rules:** packages never import `@/…` (an app) and never import another app; an app imports packages by name. `FormRenderer` knows nothing about cookies: the website wraps it in `ConsentAwareForm`, which passes remembered campaign tags only when the visitor allowed them.
- Still one app (`apps/web`) in this step; the CRM app comes in S2.

## Two apps (S2 of `docs/split-plan.md`): where things live now
- **`apps/web`** (Joan Marc): public site (`/{locale}/…`, blog, search, sitemap), the cookie banner, the **drawing** of forms (`PublicForm` → `ConsentAwareForm` → `@apex/forms` component; standalone `/{locale}/form/{slug}` and `/embed/…` pages) and the CMS admin: content, media, categories, settings, users, errors, account. Own login and session cookie (`apex_session`), own `/api/cron/tick` (publishes scheduled content, sends the outbox), own `/api/health`.
- **`apps/crm`** (Sam): `/admin` for staff: Contactes (leads), **Formularis** (builder, responses), Projectes, Tasques, Clients, **Gestió** (ERP registry), account, global search; **`/portal`** for clients; **`/api/forms/*`** (challenge, start, submit: the whole lead pipeline); own login and session cookie (`apex_crm_session`), own `/api/cron/tick` (sends the outbox, purges address hashes), own `/api/health`; robots disallow everything.
- **Same database, same user accounts** (the `users` table is managed in the website's admin). A staff member logs in to each app separately.
- **The only calls between the running apps:** (1) the browser still posts a form to the public address `/api/forms/…`; Caddy routes it to the CRM app in production, and in development/tests the website's `proxy.ts` forwards it when `CRM_INTERNAL_URL` is set; (2) after a form is saved or deleted the CRM app calls the website's `POST /api/cron/revalidate` (`WEB_INTERNAL_URL` + the shared `CRON_SECRET`) so the cached form definition refreshes. Nothing else.
- **Menus link to each other** (`CRM_URL` in the website, `WEB_ADMIN_URL` in the CRM app).
- **Tests:** unit tests live with each app (`apps/web`: 122, `apps/crm`: 75; separate throwaway databases `apex_test` / `apex_test_crm`). End-to-end specs live in `apps/*/e2e` and run through the shared runner `e2e/` (both production builds, ports 3100 and 3101, one database `apex_e2e`): `pnpm --filter @apex/e2e test`. `pnpm verify` runs everything.
- **Dev:** `pnpm dev` starts both (website on :3000, CRM app on :3001). The image and deploy cover both apps (step S3): see "Deploy: two apps" below.

## Visual page builder (phase 13, client decision: "Elementor-style", brand styles only)
- **What:** pages open in a visual editor (block library | live preview | inspector); posts open in the list editor, and every entry can switch between the two (*Visual* / *Llista*): same data, same validation.
- **Data:** still the ordered `sections` list. New `columns` section (layouts 1, 1-1, 2-1, 1-2, 1-1-1, 1-1-1-1) holds **blocks** in `c1..c4`; blocks live in `sections/blocks.ts` (heading, text, image, button, embed, card, spacer, divider) and use the same field language (`kind: "blocks"` in `@apex/core/fields`; the app passes its block list on the field, so the package never imports the app). Every section has an optional `style` from a fixed list (`bg` auto/ivory/beige/white/dark/red, `space` none/s/m/l, `align` left/center, `width` normal/narrow/wide, `valign` top/center), and blocks have a few brand options (heading size up to xl and ink/red, text size, button red/outline/black and large, image plain/rounded/shadow, card border/shadow/flat), all rendered as classes from tokens: no colour picker, no fonts, no CSS. (Client choice 2026-10-01: "brand, more options", not a free editor.)
- **Preview:** `/admin/preview/[id]?locale=` renders the saved DRAFT through the real renderer (`lib/preview.ts` `lenientSections` keeps half-filled blocks visible). It is staff-only, `noindex`, framable by our own origin only (CSP `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`); everything else in /admin stays `DENY`. `/admin` has two root layouts via route groups: `(staff)` (the admin) and `(preview)` (the site look).
- **Editing:** `components/admin/builder/VisualEditor.tsx` (parent) + `PreviewBridge.tsx` (inside the iframe, same-origin `postMessage` only: select, drop). Pure edit operations in `lib/builder-ops.ts` (unit-tested). Every change autosaves the draft (`saveDraftSections`) and reloads the preview; nothing goes live until **Publica** (same `publish()`). Keyboard route: click-to-add, ↑ ↓, Duplica, Elimina.
- **Typing on the page:** in the preview only, the renderer marks editable text with `data-edit="field.path"` (`edit` prop of `SectionRenderer`; never on public pages, e2e-checked). Click it and type: one-line fields are plain text (Enter saves), text fields keep bold/italic/links/lists and are converted back to the site's markdown (`lib/inline-edit.ts`); leaving the field saves, Escape cancels. The value goes through the same `postMessage` bridge into the same data and validation as the inspector.
- **Tests:** `lib/__tests__/builder-ops.test.ts`, `e2e/builder.spec.ts` (preview framing/access, add + drag + edit + style + publish), `/ca/constructor` showcase in `e2e/design.spec.ts`.
- **Size:** app code ≈ 7,100 lines with the builder (soft guideline exceeded by client decision; review before adding more).

## Records engine (R1 of `docs/records-engine-plan.md`): our own structured Notion
- **What:** `apps/crm/lib/records/` turns an **entity definition** (a table, typed fields, which columns are searched, filters, default sort) into list screens with search, filters, sorting, paging, create/edit/delete and CSV export. Definitions live in code (`lib/records/entities/*.ts`, registered in `registry.ts`), never in a browser UI; no wiki, no page editor. Decisions (2026-10-01): Companies replaces Clients; Borsa de treball is included (needs a privacy basis before import).
- **Parts:** `fieldTypes.ts` (registry: text, textarea, email, phone, url, number, money, percent, date, select, checkbox, relation; one entry = parse + show + csv), `entity.ts` (the definition format), `engine.ts` (list/get/save/delete/relation choices/CSV, plain Drizzle + `matchAll` search), `actions.ts` (generic save/delete with permission and error redirect), `components/records/RecordScreen.tsx` (the screen). Storage stays real typed tables, never one JSON blob.
- **R1 proof:** the six simple ERP lists (suppliers, categories, cost centers, fee tiers, members, subscriptions) now run on the engine (`entities/erp.ts`); `erp-entities.ts` and the per-list screen/action code are gone. Filters and sort come from the definition (`filter: true` on select/relation/checkbox fields); unknown filter or sort names are ignored.
- **R2 (record features):** migration 0013 adds `record_notes`, `record_files` and `record_history` (polymorphic: entity key + record id, no foreign key; `deleteRecord` removes a record's extras and stored files). An entity flagged `detail: true` gets a record page `{basePath}/{id}` with editable fields, **linked records both ways** (computed from every relation field that points at it), **notes** (author e-mail copied), **private file attachments** (same detection/10 MB rules, signed 60-second download that must belong to that record) and a **change history** (field-by-field, relation names not ids). `archivable: true` (needs an `archived_at` column) hides records from lists instead of deleting; the list has a view of archived ones. Suppliers and members use it first.
- **Workspace (`/workspace`, apps/crm):** a Notion-style surface of its own (own root layout, sidebar of every engine entity the person may use, no admin menu), opened from the admin menu ("Espai de treball ↗"). Each entity is a **table** with typed columns; cells are **edited in place** (`components/workspace/Cell.tsx` saves on blur/change through `saveCellAction`, validated by the same field types, logged in the history, shows ✓ or the error); `+ Nou` opens a form in the **side panel**; `↗` opens the record page (notes, files, history, linked records) in the same panel (`?open=<id>`); search, filters, sort by header, archived toggle and CSV export come from the definition. `back` on the generic actions is honoured only for that entity's own admin or workspace pages. Styles: `app/workspace/workspace.css` (tokens only). Later views (board by a select field, gallery) would be added to the same page.
- **Workspace look (design passes, 2026-10-02):** a tinted window with the sidebar sitting on it and the content as floating rounded sheets (table canvas, record sheet; only the table scrolls), a large icon tile + title header with a `…` menu (archived / import / export, a plain `<details>`), pill search and filters that apply on change (`AutoSelect`), monograms before names, cells that look like text until focused, choices as soft pills, the record sheet's fields as an inset grouped list (label left, value right), slide-in motion, loading skeleton (`[entity]/loading.tsx`; **the permission check lives in `[entity]/layout.tsx`, above it, so a refusal stays a real 404**), keyboard: `/` search, `Esc` closes a menu then the sheet. Icons: `components/workspace/icons.tsx` (one per entity key). All colours are mixes of the shared tokens (no new colour). Choice pills are neutral on purpose: a per-value tone (e.g. green for *Agremiada*) would need a `tones` entry on the field definition.
- **R3 (Companies and People, migration 0014):** **Companies = the `clients` table, extended** with the Notion fields (tax id, customer number, member status agremiada/exagremiada/no agremiada, three e-mails, phones, address, web, activity, services, employees, founding year, magazine, parent company, `archived_at`, `external_ref`), so projects, the portal, lead conversion and the ERP keep the same ids and nothing is migrated. One company per tax id (unique on the id without spaces/case; blank ids never clash). **People** is a new table (`company_id`, role, source). ERP `members.company_id` links a member to its company (backfilled by matching tax id); the company page shows people, members and subsidiaries as linked records. Both entities live only in the workspace (`entities/crm.ts`, permission `leads:write`, so editors use them; ERP databases stay admin-only). Relations with more than 60 choices are read-only in the table and edited in the side panel. `/admin/clients` stays for projects and portal access (linked from the company page); archived companies are hidden from it, from search and from the project/form pickers. Retire the old clients screens after sign-off.
- **R4 (events, sponsors, visits; migration 0015):** `events` (type, status, dates, place, capacity), `event_attendance` (event + person and/or company + status invited/confirmed/attended/declined/no-show; one row per person per event, deleting an event removes its rows, deleting a person keeps the row unlinked; no change history), `sponsors` (type, level, status, year, amount in cents, company, ERP supplier) and `visits` (company, date, type, status, owner, summary, follow-up date). Definitions in `entities/events.ts`. Lists of dated things sort newest first (`sortDir`). Linked records now **name what else a row points at**, so an event page reads "Assistència · Confirmat · Anna Puig · Gràfiques Vila" and a person page shows the events. Known gap: adding many attendees one by one is slow; bulk add arrives with the Notion import (R5) and CSV import (R6).
- **R5 (Notion import, migration 0016):** new entities **Casos laborals**, **Formació bonificada** (links to an ERP cost center), **Borsa de treball** (job seekers: admin-only, explicit consent and "keep until" dates) and a province on companies. `lib/notion-import/*` + `scripts/notion-import.mts` (`pnpm --filter crm notion:import [--dry-run] [--overwrite] [--no-erp] [--only …]`) read Notion through its API with `NOTION_TOKEN` (read-only; databases must be shared with the integration; ids in `NOTION_DB_*`), map companies (merged by CIF, contact → person, member → ERP member + fee tier, parent company), the gala list (event + people + attendance, **DNI never imported**), visits and the free-form areas (title → name, other properties → notes), and load everything in ONE transaction; a dry run rolls back and prints the report (counts and masked samples only). Re-runs update by `external_ref` and by default only fill blanks. Details and the one-time Notion setup: `docs/notion-import.md`. The real run needs the user's token. Run against the user's workspace on 2026-10-01/02 into the local dev database: companies, former members, externes, gala, visits, sponsors, Laboral lists, Bonificada, event rosters, suppliers, people. Migration 0017 adds `suppliers.external_ref`. What was left out and why: `docs/notion-import.md` section 7.
- **R6 (CSV import, search, export):** `/workspace/<entity>/import` takes a CSV (comma, semicolon or tab; BOM; up to 5000 rows / 5 MB). Columns are matched to fields by label or name; values are checked with the same field types as the forms; choices are matched by label ("Agremiada"), relations by the name people see (zero or several matches is a row error), dates may be `31/12/2026`, yes/no by `Sí/No`. **Validation is the default ("Només validar"): everything runs in a transaction that is rolled back**, and the real run writes the whole file or nothing (unless "omet les files amb errors" is ticked); duplicates (e.g. a repeated CIF) are reported per row; each created row gets a history entry. A template (headers only) is downloadable. Also: one **search over every database** (`/workspace/search`, box in the sidebar), and CSV export for every workspace database. Code: `lib/records/{csv,csv-import,import-actions}.ts`, `components/workspace/ImportForm.tsx`.
- **Not retired yet (decision for the team):** the old `/admin/clients` list and the ERP simple-list pages (`/admin/erp/<list>`) still work next to the workspace; retire them (redirect to the workspace) once everyone has switched, and keep Notion read-only until the real import has been checked against it.
## Deploy: two apps (S3 of `docs/split-plan.md`)
- **One image, two services.** `Dockerfile` builds both apps; the container command picks one (`start-web` = default `start`, `start-crm`, `migrate`). `deploy/compose*.yml` run `web` and `crm` from the same image with separate tags (`APEX_TAG_WEB`, `APEX_TAG_CRM`); only `web` gates Caddy, so a CRM outage never takes the public site down (and form submissions fail clearly until it returns).
- **`deploy/deploy.sh <tag> [all|web|crm]`:** migrations once, then each selected app starts, waits for its own health check and **rolls back alone** to its own previous tag (state in `.current-tag-web` / `.current-tag-crm`). The release workflow's manual run has the same `only` choice. Proven by `scripts/deploy-drill.sh` (good release, per-app rollback, web-only/crm-only deploys leave the other container untouched, failed migration aborts).
- **Caddy (`deploy/Caddyfile`):** `SITE_DOMAIN` → website, except `/api/forms/*` → CRM app; `/admin` and `/api/media` locked to `ADMIN_ALLOWED_IPS`. `CRM_DOMAIN` → CRM app, locked to the same allow-list **except** `/portal*`, `/_next/*`, `/robots.txt`, `/api/health`, `/api/cron/*`. Rule order uses `route` (a plain `handle` would skip the staff rule); proven for both hosts by `scripts/caddy-drill.sh`.
- **Rule for migrations:** additive and compatible with the previous version of both apps (drop/rename in a later release).
- **Smoke test:** `scripts/docker-smoke.sh` starts both apps from the image (startup refusal, health, pages, headers, native libraries, first admin).

## App boundaries and database permissions (S4/S5 of `docs/split-plan.md`)
- **Code:** `apps/web` (Joan Marc) and `apps/crm` (Sam) never import each other and packages never import an app; `scripts/check-boundaries.sh` (with a self-test) fails CI otherwise. They share only the packages and the database; the only calls between the running apps are the two listed above.
- **Tables:** website (`website.ts`, Joan Marc): `entries`, `entry_translations`, `entry_versions`, `categories`, `media`, `settings`. CRM (`crm.ts`, `erp.ts`, `records.ts`, `events.ts`, Sam): **`forms`, `form_starts`, `newsletter_optins`** (moved to `crm.ts`: the form builder and the submission pipeline are Sam's; the website only READS `forms` to draw them), contacts, leads, submissions, clients/companies, people, projects, ERP, portal, records, events… Shared: `users` (the website's admin manages accounts; the CRM app reads them and lets a person change their own password), `sessions`, `outbox`, `heartbeats`, `error_log`. Anything that changes the shape of `users`, `sessions` or `outbox` needs both owners.
- **Permissions:** `db/grants.sql` gives each app its own database user (`apex_web`, `apex_crm`) that can only touch its own tables and cannot change the schema; it is applied by the migrate step with `APPLY_GRANTS=1` (opt-in per environment, see `DEPLOY.md`). **A new table must be added to `db/grants.sql` in the same PR** (the file refuses to apply while a table is unclassified). Local development keeps one all-powerful user. The end-to-end suite runs both apps as the restricted users (`E2E_OWNER_DB=1` runs them as the owner to tell a permissions problem from a code problem) and `scripts/boundary-drill.sh` tests allowed and refused operations with the real users.
- **Releases:** with restricted users, `deploy.sh` migrates as the owner from `.env.migrate` (never loaded by the apps).

