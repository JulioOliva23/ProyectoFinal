# CLAUDE.md

@AI_CONTEXT.md

Subagents live in `.claude/agents/` (validated in CI by `scripts/hooks/check-agents.sh`). Never run `prisma migrate`, `prisma db push` or destructive SQL without explicit confirmation from the user.

Claude Code hooks (`.claude/settings.json`):
- `PreToolUse` → `scripts/hooks/claude-guard.sh`: blocks reading/editing real `.env` files, destructive Prisma/SQL commands, `git push --force` and `git commit --no-verify`.
- `PostToolUse` → `scripts/hooks/claude-post-edit.sh`: after editing a `servicio_back` TypeScript file, runs ESLint on it and its related unit tests; failures come back to you to fix.
