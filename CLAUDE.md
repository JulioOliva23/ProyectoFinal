# CLAUDE.md

@AI_CONTEXT.md

Subagents live in `.claude/agents/` (validated in CI by `scripts/hooks/check-agents.sh`). Never run `prisma migrate`, `prisma db push` or destructive SQL without explicit confirmation from the user.

Claude Code hooks (`.claude/settings.json`):
- `PreToolUse` → `scripts/hooks/claude-guard.sh`: blocks reading/editing real `.env` files, destructive Prisma/SQL commands, `git push --force` and `git commit --no-verify`.
- `PostToolUse` → `scripts/hooks/claude-post-edit.sh`: after editing a `servicio_back` TypeScript file, runs ESLint on it and its related unit tests; failures come back to you to fix.

## Spec-Driven Development (obligatorio)

Constitution: `docs/constitution.md`. Specs: `specs/NNN-nombre/{spec,plan,tasks}.md`. Index and verification report: `specs/README.md`, `specs/verificacion.md`.

1. **Spec first.** Before changing behavior, read the spec. If the change is not covered, edit `spec.md` first (a numbered `RF-x` with EARS acceptance criteria). When the spec and the code disagree, the spec wins (C2.2); doubts stay as `[NECESITA ACLARACIÓN]`, never decided silently in code.
2. **Test second, code third.** Write the failing test, then the code. Every test title carries the requirement it proves, e.g. `it('rejects … [001/RF-2.2]')`. A requirement or acceptance criterion without a tagged test fails `npm run sdd:check` (pre-commit and the `sdd` CI job).
3. **Tasks with evidence.** Mark `[x]` in `tasks.md` only when the "Hecho cuando" line is verifiably true; use `[~]` for partial work.
4. Everything a person reads is in Spanish (C6.2); every route declares `@Roles` or `@Public` (C7.1; `RolesGuard` forbids the rest); schema changes need a migration confirmed by a person (C5.2).
