#!/usr/bin/env bash
# Validates the subagents in .ai/agents (Claude Code frontmatter) and that
# .claude/agents still points at them. Prints a Markdown table to stdout so
# CI can publish it in the job summary.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

FAILED=0
fail() { echo "✖ $*" >&2; FAILED=1; }

if [ "$(readlink .claude/agents 2>/dev/null)" != "../.ai/agents" ]; then
  fail ".claude/agents must be a symlink to ../.ai/agents"
fi

field() { awk -v k="$2" 'NR==1 && $0!="---" {exit} NR>1 && $0=="---" {exit} NR>1 && index($0, k": ")==1 {sub(k": ", ""); print; exit}' "$1"; }

echo "| Agente | Herramientas | Descripción | Estado |"
echo "| --- | --- | --- | --- |"
for file in .ai/agents/*.md; do
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
