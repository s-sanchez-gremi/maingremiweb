#!/usr/bin/env bash
# Fails when the apps (or the shared packages) reach into each other's code. One repository, one database, several independent
# apps: the only things apps may share are the packages (@apex/db, @apex/core, @apex/ui, @apex/forms, @apex/sections) and the database.
#   an app may not import from any other app    (apps/web, apps/admin, apps/crm, apps/forms, … never depend on each other)
#   packages/*  may not import from an app       (no "@/…" alias, no apps/… path): packages never depend on what uses them
# A new app under apps/ is covered automatically.
# Usage: ./scripts/check-boundaries.sh [ROOT]      ./scripts/check-boundaries.sh --selftest
set -euo pipefail

check() {
  local root="$1" bad=0 hits
  # lines that import something: import … from "x", export … from "x", import("x"), require("x")
  imports() { grep -rEn "(from[[:space:]]+[\"'][^\"']+[\"']|import[[:space:]]*\(|require[[:space:]]*\()" "$1" --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.mjs' --include='*.js' 2>/dev/null \
      | grep -vE "/(node_modules|\.next[^/]*|test-results|dist)/" || true; }
  forbid() { # dir, label, extended regex matched against the import line
    hits="$(imports "$root/$1" | grep -E "$3" || true)"
    if [ -n "$hits" ]; then echo "BOUNDARY VIOLATION: $2"; echo "$hits" | head -8; bad=1; fi
  }
  local a b
  for a in "$root"/apps/*/; do
    [ -d "$a" ] || continue
    a="$(basename "$a")"
    for b in "$root"/apps/*/; do
      [ -d "$b" ] || continue
      b="$(basename "$b")"
      [ "$a" = "$b" ] && continue
      forbid "apps/$a" "apps/$a imports from apps/$b (use a package, or the database)" "[\"'][^\"']*(apps/$b|(\.\./)+$b/)"
    done
  done
  for p in "$root"/packages/*/; do
    [ -d "$p" ] && forbid "packages/$(basename "$p")" "a package imports from an app (packages never depend on apps)" "[\"'](@/|[^\"']*apps/[a-z]+)"
  done
  return $bad
}

if [ "${1:-}" = "--selftest" ]; then
  T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
  mkdir -p "$T/apps/web/lib" "$T/apps/crm/lib" "$T/apps/forms/lib" "$T/packages/core/src"
  echo 'import { x } from "@apex/core/auth"; import y from "@/lib/own";' > "$T/apps/web/lib/ok.ts"
  echo 'import { x } from "@apex/db"; const z = await import("./local");' > "$T/apps/crm/lib/ok.ts"
  echo 'import { x } from "@apex/forms/fieldTypes"; import y from "@/lib/own";' > "$T/apps/forms/lib/ok.ts"
  echo 'import { a } from "./b"; import { c } from "@apex/db/schema";' > "$T/packages/core/src/ok.ts"
  check "$T" >/dev/null || { echo "selftest FAILED: a clean tree was reported as a violation"; exit 1; }
  echo 'import { r } from "../../../crm/lib/leads";' > "$T/apps/web/lib/bad.ts"
  echo 'const m = await import("../../web/lib/x");' > "$T/apps/crm/lib/bad.ts"
  echo 'import { f } from "../../crm/lib/leads";' > "$T/apps/forms/lib/bad.ts"
  echo 'import q from "@/lib/thing";' > "$T/packages/core/src/bad.ts"
  out="$(check "$T" || true)"
  for needle in "apps/web imports from apps/crm" "apps/crm imports from apps/web" "apps/forms imports from apps/crm" "a package imports from an app"; do
    grep -q "$needle" <<<"$out" || { echo "selftest FAILED: not detected: $needle"; echo "$out"; exit 1; }
  done
  echo "boundary check selftest ok"
  exit 0
fi

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
if check "$ROOT"; then echo "ok: no imports across the apps and the packages"; else echo; echo "Fix: move the shared part into a package (packages/core, packages/ui, packages/forms, packages/sections, packages/db) agreed by the owners."; exit 1; fi
