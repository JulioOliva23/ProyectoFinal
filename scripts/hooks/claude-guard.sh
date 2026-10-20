#!/usr/bin/env bash
# Claude Code PreToolUse hook (.claude/settings.json).
# Blocks, before they run:
#   - reading or editing real environment files (.env, .env.local…; .env.example is allowed) — GEN-11
#   - destructive database commands (prisma migrate reset/dev, db push, DROP/TRUNCATE)
#   - commands that skip the safety net (git push --force, git commit --no-verify)
# Exit code 2 blocks the tool call and shows stderr to Claude.
set -euo pipefail

INPUT="$(cat)"
read_field() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],j);process.stdout.write(v==null?"":String(v));});' "$1" <<<"$INPUT"; }

TOOL="$(read_field tool_name)"

block() { echo "⛔ Hook claude-guard: $*" >&2; exit 2; }

case "$TOOL" in
  Read|Edit|Write|MultiEdit|NotebookEdit)
    FILE="$(read_field tool_input.file_path)"
    [ -z "$FILE" ] && FILE="$(read_field tool_input.notebook_path)"
    base="$(basename "$FILE")"
    if [[ "$base" =~ ^\.env(\..+)?$ ]] && [ "$base" != ".env.example" ]; then
      block "no se leen ni editan archivos de entorno reales ($base). Usa .env.example (GEN-11)."
    fi
    ;;
  Bash)
    CMD="$(read_field tool_input.command)"
    if grep -Eiq 'prisma[[:space:]]+(migrate[[:space:]]+(reset|dev)|db[[:space:]]+push)' <<<"$CMD"; then
      block "comando de base de datos destructivo. Pide confirmación al usuario antes de cambiar el esquema."
    fi
    if grep -Eiq '(^|[^a-z_])(drop[[:space:]]+(table|database|schema)|truncate[[:space:]])' <<<"$CMD"; then
      block "SQL destructivo (DROP/TRUNCATE) bloqueado."
    fi
    if grep -Eq 'git[[:space:]]+push.*(--force|[[:space:]]-f([[:space:]]|$))' <<<"$CMD"; then
      block "git push --force bloqueado."
    fi
    if grep -Eq 'git[[:space:]]+commit.*--no-verify' <<<"$CMD"; then
      block "no se salta el hook pre-commit (--no-verify)."
    fi
    if grep -Eq '(^|[[:space:]])(cat|less|more|head|tail)[[:space:]]+[^|;&]*\.env([[:space:]]|$)' <<<"$CMD"; then
      block "no se leen secretos de .env en la conversación."
    fi
    ;;
esac

exit 0
