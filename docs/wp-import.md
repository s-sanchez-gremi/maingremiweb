# Rescuing the content of the old WordPress site (gremi.net)

The old site was hacked, so its content is treated as untrusted: it is read from the **public** REST API only (no
login, no passwords, nothing from it is executed), cleaned into the site's own sections, checked by a person, and
imported as **drafts**. Nothing is published automatically. Run it on a computer that can reach gremi.net (the cloud
sessions cannot), with the local database and S3 mock running (`docker compose up -d`).

Everything downloaded stays in `wp-export/` at the repository root (git-ignored). Never commit it.

## 1. Copy (read-only)
```
pnpm --filter admin wp:fetch https://gremi.net
```
Saves categories, tags, authors, posts, pages and the media list as JSON in `wp-export/raw/`, then downloads the
images and linked PDF/Word/Excel/PowerPoint files of the same site (max 15 MB each, never a redirect to another site)
into `wp-export/fitxers/`. Re-running only downloads what is missing.

If the API answers 403/404 (some hacks or security plugins close it), stop: plan B is a database copy from the
hosting panel, which needs a different reader.

## 2. Review
```
pnpm --filter admin wp:review --since 2026-08-01     # --since: the date the hack is believed to have started (optional)
```
Writes `wp-export/revisio.html` (what each item will look like; it cannot load or run anything) and
`wp-export/revisio.csv` (one row per item, column **importar** = sí/no). The cleaner first drops scripts, foreign iframes and every **hidden** element (where hacks hide their
spam links), then judges what is left. Items start as **no** when the kept content has a spam word (gambling, pharma,
adult…), a link to a cheap spam domain (.xyz, .top…), text in an unexpected alphabet, was changed on/after `--since`,
or is empty after cleaning. What was removed (code, hidden blocks, iframes), unknown authors, links to other sites,
page-builder codes, missing images and more than 60 blocks are only shown as medium warnings. The CSV is never overwritten
once it exists (`--reset` to start again), so a person's choices survive re-runs.

## 3. Import as drafts
```
pnpm --filter admin wp:import            # trial: reports what it would create, writes nothing
pnpm --filter admin wp:import --apply    # creates the drafts
```
- Posts → `post` entries (date = original date), pages → `page` entries; Catalan unless the site exposes a Polylang
  `lang` (then translations are grouped into one entry).
- First real category → the entry's category (created if missing, Catalan name); extra categories and tags → tags.
- Text keeps only paragraphs, bold, italic, links and lists (headings become bold paragraphs, tables become lines);
  images become image sections, YouTube/Adobe iframes become embed sections; everything else is dropped.
- Images and documents go through `saveUpload` (type from the bytes, images re-encoded, metadata removed); the WordPress
  alt text is kept as the Catalan alt. Images with no alt must get one before their page can be published.
- Links to other imported items point to the new addresses; links to documents point to their `/fitxers/…` link;
  other links to the old site keep only their path.
- A slug that already exists (e.g. the demo placeholder pages) or is reserved gets a suffix (`-2`, `-pagina`); the
  report lists them. Drafts that would not pass publishing validation are listed too.
- `wp-export/importat.json` records what was created, so re-running skips it.

Code: `apps/admin/lib/wp-import/` (clean, build, decisions, import) and `apps/admin/scripts/wp-*.mts`;
tests: `apps/admin/lib/__tests__/wp-import.test.ts`.
