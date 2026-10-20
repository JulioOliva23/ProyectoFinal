#!/usr/bin/env bash
# Validates the subagents in .claude/agents (Claude Code frontmatter: name,
# description, tools; name must match the file name). Prints a Markdown table
# to stdout so CI can publish it in the job summary.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

AGENTS_DIR=".claude/agents"
FAILED=0
fail() { echo "✖ $*" >&2; FAILED=1; }

shopt -s nullglob
files=("$AGENTS_DIR"/*.md)
if [ "${#files[@]}" -eq 0 ]; then
  fail "No subagents found in $AGENTS_DIR/"
  exit 1
fi

field() { awk -v k="$2" 'NR==1 && $0!="---" {exit} NR>1 && $0=="---" {exit} NR>1 && index($0, k": ")==1 {sub(k": ", ""); print; exit}' "$1"; }

echo "| Agente | Herramientas | Descripción | Estado |"
echo "| --- | --- | --- | --- |"
for file in "${files[@]}"; do
  name="$(field "$file" name)"
  description="$(field "$file" description)"
  tools="$(field "$file" tools)"
  status="✅"
  if [ -z "$name" ] || [ -z "$description" ] || [ -z "$tools" ]; then
    fail "$file: frontmatter needs name, description and tools"
    status="❌ frontmatter incompleto"
  elif [ "$name.md" != "$(basename "$file")" ]; then
    fail "$file: name '$name' does not match the file name"
    status="❌ nombre ≠ archivo"
  fi
  echo "| \`@${name:-?}\` | ${tools:-—} | ${description:0:120}… | $status |"
done

exit "$FAILED"
