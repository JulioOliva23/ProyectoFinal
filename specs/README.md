# Specs del backend (Spec-Driven Development)

Documentación escrita **de forma retroactiva** el 2026-10-29 a partir del código y de los tests existentes, más dos propuestas nuevas. Rige la [constitución](../docs/constitution.md).

Cada carpeta tiene tres archivos:

| Archivo | Contenido |
| --- | --- |
| `spec.md` | **Qué y por qué**: contexto, usuarios, historias, requisitos `RF-x` en EARS, no funcionales, casos límite, fuera de alcance, criterios de finalización y dudas `[NECESITA ACLARACIÓN]` |
| `plan.md` | **Cómo**: módulos, datos (JSON), algoritmos, contrato de uso, decisiones con su alternativa descartada y estrategia de tests, marcando los RF que cubre cada parte |
| `tasks.md` | Tareas de 20–30 min con `Hecho cuando:`; `[x]` hecha · `[~]` parcial · `[ ]` pendiente |

| Spec | Estado | Hechas | Parciales | Pendientes |
| --- | --- | --- | --- | --- |
| [001 · Autenticación y sesiones](001-autenticacion-y-sesiones/spec.md) | Implementada, **con hallazgos** (D1–D3) | 9 | 1 | 5 |
| [002 · Gestión de usuarios](002-gestion-de-usuarios/spec.md) | Implementada | 8 | 1 | 4 |
| [003 · Recepción y dispositivos](003-recepcion-y-dispositivos/spec.md) | Implementada | 10 | 0 | 3 |
| [004 · Ciclo de vida de la orden](004-ciclo-de-vida-de-la-orden/spec.md) | Implementada | 10 | 1 | 4 |
| [005 · Consulta y panel de órdenes](005-consulta-y-panel-de-ordenes/spec.md) | Implementada | 7 | 0 | 4 |
| [006 · Presupuestos](006-presupuestos/spec.md) | Implementada | 9 | 1 | 3 |
| [007 · Inventario y Stock Guard](007-inventario-y-stock-guard/spec.md) | Implementada | 10 | 1 | 3 |
| [008 · Seguimiento del cliente](008-seguimiento-del-cliente/spec.md) | Implementada | 10 | 0 | 3 |
| [009 · Cookie protegida](009-sesion-con-cookie-httponly/spec.md) | **Propuesta** (nueva) | 1 | 0 | 9 |
| [010 · Vencimiento automático de presupuestos](010-vencimiento-automatico-de-presupuestos/spec.md) | **Propuesta** (nueva) | 0 | 0 | 8 |
| **Total** | | **74** | **5** | **46** |

El resultado de ejecutar los tests contra cada requisito, los hallazgos y el veredicto están en [verificacion.md](verificacion.md).

**Regla del proyecto:** si el código y una spec discrepan, gana la spec (constitución C2.2). Un cambio de comportamiento empieza actualizando su `spec.md`.
