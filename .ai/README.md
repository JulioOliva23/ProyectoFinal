# Subagentes

| Agente | Cuándo invocarlo |
| --- | --- |
| [`@agent-domain-architect`](agents/agent-domain-architect.md) | Esquema Prisma, migraciones, ER, índices, triggers, atomicidad |
| [`@agent-api-core`](agents/agent-api-core.md) | Endpoints, DTOs, services, repositories y RBAC de los 5 módulos |
| [`@agent-qa-security`](agents/agent-qa-security.md) | Tests unitarios/e2e, sanitización, inyecciones, Luhn, auditoría |

Flujo típico: `domain-architect` (modelo) → `api-core` (feature + unit tests) → `qa-security` (e2e + revisión). El frontmatter es compatible con Claude Code (`.claude/agents` es un symlink a `.ai/agents/`); otros entornos pueden leer el cuerpo Markdown como prompt de sistema.
