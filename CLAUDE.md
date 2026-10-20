# CLAUDE.md

@AI_CONTEXT.md

Subagents live in `.claude/agents/` (validated in CI by `scripts/hooks/check-agents.sh`). Never run `prisma migrate`, `prisma db push` or destructive SQL without explicit confirmation from the user.
