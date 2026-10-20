# Subagentes

| Agente | Cuándo invocarlo |
| --- | --- |
| [`@agent-domain-architect`](../.claude/agents/agent-domain-architect.md) | Esquema Prisma, migraciones, ER, índices, triggers, atomicidad |
| [`@agent-api-core`](../.claude/agents/agent-api-core.md) | Endpoints, DTOs, services, repositories y RBAC de los 5 módulos |
| [`@agent-qa-security`](../.claude/agents/agent-qa-security.md) | Tests unitarios/e2e, sanitización, inyecciones, Luhn, auditoría |

Flujo típico: `domain-architect` (modelo) → `api-core` (feature + unit tests) → `qa-security` (e2e + revisión). Los archivos viven en `.claude/agents/` (frontmatter de Claude Code: `name`, `description`, `tools`) y CI los valida con `scripts/hooks/check-agents.sh`; otros entornos pueden leer el cuerpo Markdown como prompt de sistema.
