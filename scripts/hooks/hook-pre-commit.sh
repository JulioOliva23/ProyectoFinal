#!/usr/bin/env bash
# Pre-commit validation hook (GEN-12 DoD).
# Blocks the commit when any staged package has lint errors, static type
# errors or failing unit tests. Also refuses staged secrets (.env files).
#
# Install (pick one):
#   npx husky init  → .husky/pre-commit already calls this script
#   git config core.hooksPath .husky
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
step()  { printf '\033[36m▶ %s\033[0m\n' "$*"; }

STAGED="$(git diff --cached --name-only --diff-filter=ACMR)"
[ -z "$STAGED" ] && exit 0

# GEN-11: never commit real environment files.
if printf '%s\n' "$STAGED" | grep -E '(^|/)\.env(\..+)?$' | grep -vE '\.env\.example$' >/dev/null; then
  red "✖ Staged .env file detected. Unstage it (GEN-11)."
  exit 1
fi

# Packages that follow the <prefix>_back / <prefix>_front convention.
PACKAGES=()
for dir in */; do
  dir="${dir%/}"
  [ -f "$dir/package.json" ] || continue
  if printf '%s\n' "$STAGED" | grep -q "^$dir/"; then PACKAGES+=("$dir"); fi
done

if [ "${#PACKAGES[@]}" -eq 0 ]; then
  green "✔ No package sources staged, skipping checks."
  exit 0
fi

has_script() { node -e "process.exit(require('./$1/package.json').scripts?.['$2'] ? 0 : 1)"; }

FAILED=0
for pkg in "${PACKAGES[@]}"; do
  for script in lint typecheck test; do
    if has_script "$pkg" "$script"; then
      step "$pkg → npm run $script"
      args=()
      [ "$script" = "test" ] && args=(-- --passWithNoTests)
      if ! npm run --silent --prefix "$pkg" "$script" "${args[@]+"${args[@]}"}"; then
        red "✖ $pkg: '$script' failed"
        FAILED=1
      fi
    fi
  done
done

if [ "$FAILED" -ne 0 ]; then
  red "✖ Commit blocked: fix the errors above (GEN-12)."
  exit 1
fi
green "✔ Lint, types and tests passed."
