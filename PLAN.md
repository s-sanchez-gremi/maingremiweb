# Apex — implementation plan (backbone phase)

Source: CLAUDE.md (build guide) + mockups (Main, Editor, FormBuilder). Default language: **Catalan**.

## Decisions taken

| Topic | Decision | Why (core principle) |
|---|---|---|
| Database | **PostgreSQL**, EU region | Guide specifies it. jsonb suits section lists; one DB for content + leads (P2). MySQL gives no advantage here. |
| App | Next.js (App Router, TypeScript), one repo, two route groups: `(site)` public, `(admin)` backend | P2, one codebase |
| CMS layer | **Custom-built, minimal** (client decision, overrides the guide's Payload suggestion) | Exact match to Editor/FormBuilder mockups; no framework lock-in. Kept small by the rules in "Custom CMS design" below. |
| Hosting | Single EU VPS/PaaS + managed Postgres + S3-compatible storage (EU) | Simple, predictable; pre-rendered pages survive backend outage (P4) |
| Form builder | **Fully custom**, list-based, own tables | Chosen by client. Costs ~1–2 extra weeks; keep strictly to the v1 field list. |
| Newsletter | **Existing external tool kept** | Deviation from P2 — see risks. Opt-in stored in Apex first; a one-way sync pushes subscribers out. Site and forms must work if the tool is down. |
| Default locale | `ca`; also `es`, `en` | |

## Design tokens (implement once, in a shared package)

Accent `#D50032` (hover `#A9002A`) · ivory `#FAF9F5` · secondary bg `#F2F0E8` · ink `#141413` · ink panel `#23221F` · text `#5C5A54` / `#8A8780` · border `#E5E2D9` · serif Georgia for headings, Inter/system-ui for body · radius 6px buttons/inputs, 10px cards.
Homepage mockup structure: top bar (phone, email, CA/ES/EN) → header (logo, 5 nav links, "Portal clients" outline + "Contacte" primary) → dark hero → 4 highlight tiles → news grid (3 cards) → courses grid (4 cards on `#F2F0E8`) → newsletter band → footer (4 columns + legal row).
Backend mockups: 220px dark sidebar, white top bar, section cards with type chip + ↑ ↓ ✕, dashed red "+ Afegeix una secció", 300–320px right panel.

## Repo layout

```
apps/web        Next.js app: (site) public + (admin) custom admin + /api
packages/ui     design tokens + components (Button, Card, Field, Header, Footer, sections)
packages/forms  form schema, validation, conditional logic (shared by builder and public renderer)
docker-compose  local Postgres + S3 (MinIO) + mail catcher
```
One command: `pnpm dev`. Envs: local / staging / production, separate DBs and secrets.

## Data model

See "Custom CMS design" below for the table list and section model. Status draft/scheduled/published is **per locale**, stored on each translation row.
Lead tables (ours): `contacts` (unique email), `leads` (FK contact, form, source page, theme, locale, UTM, consent text + timestamp), `submissions` (raw answers jsonb), `newsletter_optins`.
Form builder tables/collections: `forms` with ordered `fields[]` (type, label, required, options, validation, `showIf {fieldId, op, value}`, page-break), `destination` enum (`crm_lead` | `project` | `responses_only`), notification settings, consent text.

## Phases

1. **Foundation (wk 1)** — repo, Docker Postgres/MinIO, Next.js + Drizzle scaffold, 3 envs, CI skeleton, daily backups + one tested restore. *Done:* one-command local run; restore proven.
2. **Content tools (wk 1–5)** — own auth + roles, content tables, section registry, list editor, translations, draft/schedule/publish, media, revisions, admin built to the Editor mockup (sidebar + details/languages/SEO panel). *Done:* editor publishes a translated post.
3. **Public rendering (wk 3–4)** — `/ca|es|en` routes, ISR + on-demand revalidation on publish (live <1 min), section renderer, blog index/post/category, hreflang, sitemap, robots, 404/500. Static output served even if backend is down.
4. **Design foundation (wk 4–5, overlaps 3)** — tokens + component library built to the Main mockup; mobile-first; a11y (real buttons/links/labels, 4.5:1 contrast — note `#8A8780` on ivory is ~3.3:1, use `#5C5A54` for real text or verify first).
5. **Forms + lead pipeline (wk 5–8)** — custom builder (list UI per FormBuilder mockup), public renderer with conditional logic + validation, embed + link sharing, pipeline steps 1–6, honeypot + rate limit + privacy-friendly bot check (e.g. Altcha/Turnstile-alternative), submission stats, XLSX/CSV export, notifications via transactional email. *Done:* test submission reaches CRM tables with source tags + consent record.
6. **Consent + legal (wk 8)** — cookie banner (equal-prominence accept/reject), privacy policy, legal notice, per-form consent. *Done:* no non-essential script before consent.
7. **Deployment (wk 8–9)** — CI checks + build, auto-deploy to staging, prod on approval, domain + HTTPS.
8. **Monitoring + handover (wk 9)** — error tracking, uptime check, backup alerts, short editor guide (in Catalan).

Estimate: 10–13 weeks one full-time dev (custom CMS and custom form builder both included; the custom CMS adds ~2–3 weeks).

## Risks / things to watch

- **Newsletter tool = second system.** Mitigate: opt-in saved locally first, async retry queue for the sync, never block form submission on it. Need to know which tool.
- **Custom form builder scope creep.** Hold to the v1 field list; no payments, e-signatures, formulas or per-form styling.
- **Custom CMS = we own auth and security.** Mitigate with vetted libraries only (argon2, Zod, Drizzle), no hand-rolled crypto, security tests on login/permissions, and an audit of the admin before launch.
- **On-demand revalidation per locale:** prove early (phase 3 gate).
- **CRM tables now, CRM UI later:** create only the tables the pipeline needs; no CRM screens in this phase.

## Still open

2. Which newsletter tool is in use.
3. Hosting provider + region (e.g. Hetzner / Scaleway / OVH).
4. Logo/brand assets; who edits, who translates each language.
5. Any must-have Fillout feature missing from the v1 list.

## Custom CMS design (minimum code, maximum reuse)

**Principle: a few generic parts, reused everywhere. New content or fields = data/config, not new code.**

### Tables (8 total)
`users` (email, password_hash, role admin|editor) · `sessions` · `entries` (type `post`|`page`, theme, category_id, author_id, tags text[], cover media_id, publish date) · `entry_translations` (entry_id, locale, title, slug, `sections` jsonb, seo jsonb, status, publish_at) · `categories` (+ names jsonb per locale) · `media` (key, alt jsonb per locale, credit) · `forms` (fields jsonb, destination, notifications, consent jsonb per locale) · `settings` (single row, jsonb: nav, footer, SEO, contact, cookie text).
Lead tables (`contacts`, `leads`, `submissions`, `newsletter_optins`) are separate and belong to the lead pipeline.
Posts and landing pages share **one** `entries` table; the only difference is `type`.

### Five generic building blocks
1. **Section registry** — `sections/<name>.ts` exports `{ name, label, fields, Render }`. `fields` is a tiny declarative list (`text`, `textarea`, `image`, `link`, `select`, `list`). Zod validation and the **admin form are generated from `fields`**, so adding a section type = **one file, no admin code**. Sections: header, text, image, embed, form, CTA, tile row, card grid.
2. **`<ListEditor>`** — one component: add from a picker, ↑ ↓ ✕. Used for page sections **and** form fields **and** nav/footer links. Not built three times.
3. **Generic entity screens** — a list screen and an edit screen driven by config, reused for entries, categories, media, forms, users. No hand-built screen per content type.
4. **`translations` pattern** — every localized thing is `jsonb {ca,es,en}` or a translation row; one helper resolves locale with fallback to `ca`.
5. **`publish(entry, locale)`** — the only function that changes status: set `published`, snapshot a version, revalidate that tag. Scheduled publishing is one cron route that calls the same function.

### Rules that keep it small and stable
- **Deps (short list):** `next`, `drizzle-orm` + `postgres`, `zod`, `@node-rs/argon2`, `sharp`, AWS S3 SDK, `nodemailer`. Nothing else without a written reason.
- **Auth:** email + password, argon2id, session cookie backed by `sessions`, CSRF, login rate-limit; ~150 lines in one file. Permissions: one `can(user, action)` function. No SSO, no user-defined roles. **Users screen (admin only):** create user, change role, reset password, delete. Passwords min 12 chars; role change / password reset / own password change sign the user out everywhere; the last admin can't be demoted or deleted, and nobody can demote or delete themselves. Every user has "El meu compte" to change their own password.
- **Draft vs live:** editable columns on `entry_translations` are the draft; `live` (jsonb) is the validated snapshot the public site serves. Saving never changes what is live; only `publish()` copies draft → live. Status: `scheduled` if a future publish is pending, else `published` if `live` exists, else `draft`.
- **Versions:** on publish, copy the translation row into `entry_versions` (keep last 10). Restore = copy back. No diff UI.
- **Media:** uploaded through the app (`POST /api/media`, logged-in users only), not presigned browser uploads, so every file is checked on the server: real type detected from bytes, images re-encoded by `sharp` to WebP at 3 fixed widths (480/960/1600, never upscaled, metadata stripped), PDFs stored as-is, SVG rejected, max 15 MB. **Alt text per language is required** on any image before its page can be published. A file in use can't be deleted.
- **Public reads** go through one `getEntry(type, slug, locale)` returning only `published`; pages are ISR with tag revalidation.
- **Migrations:** plain SQL files in git, applied by one script; run automatically in staging, by hand (reviewed) in production.
- **Tests:** unit tests for section validation, `can()`, `publish()`, the public queries, media pipeline and the lead pipeline (throwaway DB); Playwright end-to-end suite (login throttle, draft → publish → live, hidden draft edits, unpublish, scheduled publish via cron, editor permissions) run in CI on every change.
- **Size budget:** whole CMS (admin + API + registry) soft target of ~6,000 lines. It is a guideline, not a hard stop (decision: flexible). When it is exceeded, say so and review for simplification before adding more; current size is recorded in the phase notes.

### How to extend
| Need | Change |
|---|---|
| New section type | add `sections/<name>.ts` (schema + renderer) |
| New field type in form builder | add one entry to `packages/forms/fieldTypes.ts` (validate + render) |
| New language | add locale code to config + one row of UI strings |
| New content type later (CRM, projects) | new table + config for the generic screens |

### Non-goals
Plugin system, GraphQL, real-time collaboration, comments, drag-and-drop, custom-fields UI, theme editor, rich-text canvas (text sections allow only paragraph, bold, italic, link, list).

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
