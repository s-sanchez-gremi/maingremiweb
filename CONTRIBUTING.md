# Working together

`main` is always releasable: everything on it has passed CI, and a push to `main` is what feeds the staging deploy. Nobody commits to it directly.

## Day to day
1. **Start from the latest main:** `git switch main && git pull && git switch -c feat/short-description`.
   Branch names: `feat/…` (new behaviour), `fix/…` (bug), `chore/…` (tooling, docs, deps).
2. **Commit small and often** with a clear message (what and why). Keep a branch to one topic.
3. **Check locally** before pushing: `pnpm verify:fast` (lint, types, unit tests, build); `pnpm verify` runs everything incl. Docker drills.
4. **Push the branch and open a pull request** into `main` (the template lists the checks). CI runs on the PR.
5. **The other person reviews** (read it, run it if it touches screens). Fix comments with more commits on the same branch.
6. **Squash-merge** once CI is green and someone other than the author approved. The branch is deleted automatically. Never force-push `main`.
7. Update your own branches with `git fetch && git rebase origin/main` (or merge `main` into the branch) before the final review.

A local hook (`.githooks/pre-push`, installed by `pnpm install`) refuses pushes to `main`. GitHub's own branch protection is not available on a private repo on the free plan, so these rules are by agreement; turning on "require a pull request + status checks" is the first thing to do if the plan is upgraded.

## Who owns what
Two apps in one repository sharing one database (`docs/split-plan.md`); `.github/CODEOWNERS` makes GitHub ask the right person to review:
- **Joan Marc (`@jmarcadell4-maker`) — `apps/web`:** the public site (including how forms are *drawn* inside pages), and the website's admin: content, media, categories, settings, users, errors.
- **Sam (`@s-sanchez-gremi`) — `apps/crm`:** CRM (contacts and leads), **forms** (builder, responses and the public submission API), project manager, tasks, the ERP registry and the client portal.
- **Shared, both review:** `packages/*` (database, core, ui, forms), `db/migrations`, `e2e/`, `deploy/`, `scripts/`, `.github/`, `Dockerfile`, `CLAUDE.md`.
- **The apps never import each other.** Anything both need goes in a package. The only calls between the running apps are listed in `docs/split-plan.md` (the website forwards `/api/forms/*` to the CRM app; the CRM app asks the website to refresh its cache after a form changes).
- **Working across the line** is fine (a small fix in the other's app): open the PR as usual; the owner reviews it. Agree first before anything larger.
- **New admin screens** get their own folder under the owning app's `app/admin/(app)/` plus their own `lib/<name>.ts`; the app's menu (`components/admin/AdminNav.tsx`) and dashboard are that app's own.
- **Database changes are the main collision point.** Tell the other person before adding a migration, and rebase right before merging so the number is the next free one. Tables live in `packages/db/src/schema/{core,website,crm,erp}.ts`; the migration rule for independent releases is in `docs/split-plan.md` (additive only).

## Rules that prevent the usual collisions
- **Migrations** (`db/migrations/NNNN_name.sql`): never edit one that is already on `main`, and keep them **additive** (the website and the CRM app deploy independently, so either can run one version behind: add columns/tables; drop or rename only in a later release). Take the next free number **after** rebasing on `main`; if two branches both added `0012_…`, the second one to merge renumbers its file (a unit test fails on duplicates or gaps).
- **Lockfile** (`pnpm-lock.yaml`): on a conflict, take `main`'s version and run `pnpm install` again; never hand-edit.
- **`CLAUDE.md`** is the source of truth for decisions: change it in the same PR as the behaviour it describes.
- **Secrets** never go in git (`.env` is ignored). Production/staging values live on the servers and in GitHub environment secrets.
- **Releases:** staging deploys automatically from `main` once enabled; production only by a person starting the *Release* workflow.
- **Dependabot** PRs are reviewed like any other; CI decides if they are safe.

## Using Claude Code
Same rules: ask it to work on a branch and open a PR. It must not push to `main`.
