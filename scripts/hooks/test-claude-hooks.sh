#!/usr/bin/env bash
# Tests the Claude Code PreToolUse hook (claude-guard.sh) with sample tool
# calls and checks each one is allowed (exit 0) or blocked (exit 2).
# Prints a Markdown table so CI can publish it in the job summary.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
GUARD="$ROOT/scripts/hooks/claude-guard.sh"
FAILED=0

echo "| Caso | Esperado | Obtenido | Estado |"
echo "| --- | --- | --- | --- |"

check() {
  local label="$1" expected="$2" payload="$3" got
  "$GUARD" <<<"$payload" >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$expected" ]; then status="✅"; else status="❌"; FAILED=1; fi
  echo "| $label | $expected | $got | $status |"
}

check "Editar .env" 2 '{"tool_name":"Edit","tool_input":{"file_path":"/repo/servicio_back/.env"}}'
check "Escribir .env.local" 2 '{"tool_name":"Write","tool_input":{"file_path":"/repo/.env.local"}}'
check "Editar .env.example" 0 '{"tool_name":"Edit","tool_input":{"file_path":"/repo/servicio_back/.env.example"}}'
check "Editar código fuente" 0 '{"tool_name":"Edit","tool_input":{"file_path":"/repo/src/main.ts"}}'
check "prisma migrate reset" 2 '{"tool_name":"Bash","tool_input":{"command":"npx prisma migrate reset --force"}}'
check "prisma db push" 2 '{"tool_name":"Bash","tool_input":{"command":"npx prisma db push"}}'
check "prisma migrate deploy" 0 '{"tool_name":"Bash","tool_input":{"command":"npx prisma migrate deploy"}}'
check "DROP TABLE" 2 '{"tool_name":"Bash","tool_input":{"command":"psql -c \"DROP TABLE users\""}}'
check "git push --force" 2 '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}'
check "git commit --no-verify" 2 '{"tool_name":"Bash","tool_input":{"command":"git commit --no-verify -m x"}}'
check "cat .env" 2 '{"tool_name":"Bash","tool_input":{"command":"cat servicio_back/.env"}}'
check "npm test" 0 '{"tool_name":"Bash","tool_input":{"command":"npm test"}}'
check "Leer .env" 2 '{"tool_name":"Read","tool_input":{"file_path":"/repo/.env"}}'
check "Leer código fuente" 0 '{"tool_name":"Read","tool_input":{"file_path":"/repo/src/main.ts"}}'

exit "$FAILED"
