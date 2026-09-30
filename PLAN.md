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
- **Auth:** email + password, argon2id, session cookie backed by `sessions`, CSRF, login rate-limit; ~150 lines in one file. Permissions: one `can(user, action)` function. No SSO, no user-defined roles.
- **Draft vs live:** editable columns on `entry_translations` are the draft; `live` (jsonb) is the validated snapshot the public site serves. Saving never changes what is live; only `publish()` copies draft → live. Status: `scheduled` if a future publish is pending, else `published` if `live` exists, else `draft`.
- **Versions:** on publish, copy the translation row into `entry_versions` (keep last 10). Restore = copy back. No diff UI.
- **Media:** presigned upload to S3; `sharp` makes 3 fixed widths; alt required per language.
- **Public reads** go through one `getEntry(type, slug, locale)` returning only `published`; pages are ISR with tag revalidation.
- **Migrations:** plain SQL files in git, applied by one script; run automatically in staging, by hand (reviewed) in production.
- **Tests:** unit tests for section validation, `can()`, `publish()`, lead pipeline; one Playwright test: login → draft → publish → page live.
- **Size budget:** whole CMS (admin + API + registry) target under ~6,000 lines maximum; if it grows past that, stop and simplify.

### How to extend
| Need | Change |
|---|---|
| New section type | add `sections/<name>.ts` (schema + renderer) |
| New field type in form builder | add one entry to `packages/forms/fieldTypes.ts` (validate + render) |
| New language | add locale code to config + one row of UI strings |
| New content type later (CRM, projects) | new table + config for the generic screens |

### Non-goals
Plugin system, GraphQL, real-time collaboration, comments, drag-and-drop, custom-fields UI, theme editor, rich-text canvas (text sections allow only paragraph, bold, italic, link, list).
