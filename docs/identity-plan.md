# Plan: one visual identity for all Apex apps

Status: **direction A approved by Sam 2026-10-07; the other decisions in section 8 are still open.** Owner of the proposal: Sam. Shared files are touched (tokens, `packages/ui`, `CLAUDE.md`), so Joan Marc reviews. Mockups for review: https://claude.ai/artifact/JrhfbgV96VNoDqiENiij4W (private link; share it from its Share menu).

## 1. Goal
Six apps (website, CMS admin, CRM workspace, Forms, Sign, Hub) look like one family and are still easy to tell apart. Staff should know which tool they are in at a glance; visitors should see GREMI, not "a web app".

Constraints from `CLAUDE.md` that this plan keeps: tokens live in ONE file (`packages/ui/src/tokens.css`); fonts are self-hosted (no third-party request); contrast is tested; no freeform styling by editors; simple and robust over flashy. The public website's look was approved by the client (2026-10-02), so changes there need their sign-off.

## 2. The idea: every app is an ink on the same sheet
GREMI is a print guild ("des del 1491"). Its logo is a halftone dot field. The identity borrows that vocabulary:
- **Shared base (all apps):** paper `#F7F4EE`, ink `#1A1715`, Fraunces headings, system sans body, Plex Mono labels. Exactly today's tokens.
- **One spot ink per app**, named after the printing inks, used for the 3px ink bar under the header, the active menu item, the primary button, the app mark and field highlights. Nothing else is coloured, so tables and forms stay calm.
- **Halftone** (a generated dot gradient) as the single decorative motif: app marks, hero, empty states, error pages, the seal of a signed PDF.
- **Proof-sheet details, used lightly:** crop marks on framed sheets, a CMYK strip in footers and emails, a round proof stamp.

| App | Spot ink | Hex | White text | Notes |
|---|---|---|---|---|
| Website | Red | `#D50032` | 5.4 | unchanged, client-approved |
| CMS admin | Cyan | `#00698F` | 6.1 | deep version of process C |
| CRM workspace | Magenta | `#B3005F` | 6.8 | deep version of process M |
| Forms | Yellow | `#FFD200` | 1.5 | fills with **ink text** (12.3); never text or sole border on light |
| Hub | Key black | `#1A1715` | 17.8 | the neutral portal; its tiles carry the other inks |
| Sign | Violet | `#5A3FA3` | 7.9 | cyan overprinted on magenta: a signature is an overprint |

Status colours (ok, warn, info, danger) keep their meaning in every app. In the tools the red accent no longer appears, so red always means "wrong".

## 3. What a good identity designer would insist on (applied)
1. One big idea repeated: the halftone dot.
2. Constraint is the system: two typefaces, one paper, one ink, one spot colour per app.
3. Family resemblance with individual personality (same frame, different letter and colour).
4. Design the small things first: 16px favicon, email header, 404, empty table, sealed PDF.
5. Borrow the trade's vocabulary (crop marks, colour bar, proof stamp).
6. Calm tools: boldness only in the ink bar and the primary button.
7. Test in context, at 16px, in greyscale (state never depends on colour alone), and with the contrast tests.
8. A one-page rulebook plus a visual test, so the identity does not drift.

## 4. Directions considered
- **A. Proof sheet (APPROVED 2026-10-07).** As above. Medium effort, clear identity per app, builds on the approved print-shop look.
- **B. Halftone night.** Dark, one red everywhere, apps differ by dot pattern. Striking, but dark tool UIs are tiring for table work and need a full dark theme per app (double visual testing).
- **C. Quiet tool.** Keep today's red everywhere, add shared header and app name. Cheapest, but the six apps stay hard to tell apart.

## 5. Technical design (direction A)
- **Tokens:** `tokens.css` gains `--ink-web/-admin/-crm/-forms/-hub/-sign` and a per-app alias set once on the app's root element: `<html data-app="crm">` maps `--spot` and `--on-spot` (white, or ink for Forms). Components use only `--spot`/`--on-spot`. The existing `--accent` stays for the website and becomes `var(--spot)` in the tools, so existing CSS keeps working during the rollout.
- **Contrast test:** `contrast.test.ts` (already parses the tokens file) adds each ink against white or ink text (4.5:1) and as text on paper where allowed.
- **Shared kit in `packages/ui`:** `AppMark` (square, letter in Fraunces, halftone fade as inline SVG generated from numbers, no image files), `InkBar`, `Halftone` (decorative SVG, `aria-hidden`), `EmptyState`, `ErrorPage`, `ProofStamp`. Packages never import an app (boundary check unchanged).
- **Favicons and app icons:** one generated SVG per app, wired through each app's Next.js metadata (`icons`). A 16px variant without the halftone.
- **Per-app shells:** keep their current layout code (admin `AdminNav`, CRM workspace sidebar, Forms and Hub headers); only swap tokens, add the mark and ink bar. No layout rewrites.
- **Emails and PDFs:** the outbox's plain-text mails stay plain text. A short branded HTML variant is optional and a later step; the Sign seal page uses the proof stamp and the violet ink.
- **Logo:** the current file is a black PNG. We need the vector original (SVG/PDF) to make white and spot-ink versions properly; until then the CSS `filter` approach stays.
- **No new dependency, no new font, no new service.**

## 6. Rollout (one pull request each, on its own branch from `main`)
1. Direction decision (this document and the mockups).
2. Foundations: tokens, `data-app`, contrast tests, app marks and favicons.
3. Shared kit in `packages/ui` plus the styleguide section "Identity" (live marks, inks, contrast, empty and error states).
4. Apps in this order: Hub, Forms, CMS admin, CRM workspace, Sign (when it exists), website (only after client sign-off).
5. Touchpoints: email footer strip, sealed PDF stamp, social card, optional printed letterhead.
6. Guardrails: `docs/identity.md` (one page of rules), a Playwright screenshot per app login page and home (light only), axe checks stay.
Ownership: Joan Marc `apps/web`, `apps/admin`; Sam `apps/crm`, `apps/forms`, `apps/hub`, `apps/sign`; both review `packages/ui`, tokens, `CLAUDE.md`. A notice in `docs/team-sync.md` goes out with step 2 (tokens change) and with each app PR that the other person must merge.

## 7. Risks
- Yellow is only safe as a fill with ink text; the rule is in the tokens and the contrast test.
- Changing the CRM's active colour from red to magenta touches many small CSS mixes (`color-mix` of `--accent`). They already read `--accent`, so the alias keeps them working; a visual pass is still needed.
- Staff habits: the CRM workspace's red is familiar to Sam's users. The rollout is per app so any app can wait.
- Without the vector logo the white and coloured logo variants stay approximations.

## 8. Decisions needed
1. ~~Direction A, B or C~~ A chosen (2026-10-07).
2. May the website change beyond red plus a halftone hero (needs the client)?
3. Public Catalan names of the apps (proposal: Contingut, Relacions, Formularis, Signatures, Portal) or keep Admin, CRM, Forms, Sign.
4. Is a dark theme for staff tools wanted? (Not planned.)
5. Is there a vector logo?
6. Printed material in scope?
