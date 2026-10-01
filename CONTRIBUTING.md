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

## Rules that prevent the usual collisions
- **Migrations** (`db/migrations/NNNN_name.sql`): never edit one that is already on `main`. Take the next free number **after** rebasing on `main`; if two branches both added `0012_…`, the second one to merge renumbers its file (a unit test fails on duplicates or gaps).
- **Lockfile** (`pnpm-lock.yaml`): on a conflict, take `main`'s version and run `pnpm install` again; never hand-edit.
- **`CLAUDE.md`** is the source of truth for decisions: change it in the same PR as the behaviour it describes.
- **Secrets** never go in git (`.env` is ignored). Production/staging values live on the servers and in GitHub environment secrets.
- **Releases:** staging deploys automatically from `main` once enabled; production only by a person starting the *Release* workflow.
- **Dependabot** PRs are reviewed like any other; CI decides if they are safe.

## Using Claude Code
Same rules: ask it to work on a branch and open a PR. It must not push to `main`.
