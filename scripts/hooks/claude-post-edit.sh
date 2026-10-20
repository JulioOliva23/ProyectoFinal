#!/usr/bin/env bash
# Claude Code PostToolUse hook (.claude/settings.json).
# After Claude edits a TypeScript file of servicio_back, lints that file and
# runs the unit tests related to it. On failure, exit code 2 sends the errors
# back to Claude so it fixes them right away (GEN-12).
set -euo pipefail

INPUT="$(cat)"
FILE="$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(j.tool_input?.file_path??"");});' <<<"$INPUT")"

ROOT="$(git rev-parse --show-toplevel)"
PKG="$ROOT/servicio_back"

case "$FILE" in
  "$PKG"/src/generated/*) exit 0 ;;
  "$PKG"/src/*.ts|"$PKG"/unit-tests/*.ts|"$PKG"/test/*.ts|"$PKG"/prisma/*.ts) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0
[ -d "$PKG/node_modules" ] || exit 0

cd "$PKG"
REL="${FILE#"$PKG"/}"

if ! OUT="$(npx eslint "$REL" 2>&1)"; then
  echo "✖ ESLint falló en $REL:" >&2
  echo "$OUT" >&2
  exit 2
fi

if ! OUT="$(npx jest --findRelatedTests "$REL" --passWithNoTests --silent 2>&1)"; then
  echo "✖ Tests relacionados con $REL fallaron:" >&2
  echo "$OUT" | tail -40 >&2
  exit 2
fi

exit 0
