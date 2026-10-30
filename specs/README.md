# Specs del backend (Spec-Driven Development)

Documentación escrita **de forma retroactiva** el 2026-10-29 a partir del código y de los tests existentes, más dos propuestas nuevas. Rige la [constitución](../docs/constitution.md).

Cada carpeta tiene tres archivos:

| Archivo | Contenido |
| --- | --- |
| `spec.md` | **Qué y por qué**: contexto, usuarios, historias, requisitos `RF-x` en EARS, no funcionales, casos límite, fuera de alcance, criterios de finalización y dudas `[NECESITA ACLARACIÓN]` |
| `plan.md` | **Cómo**: módulos, datos (JSON), algoritmos, contrato de uso, decisiones con su alternativa descartada y estrategia de tests, marcando los RF que cubre cada parte |
| `tasks.md` | Tareas de 20–30 min con `Hecho cuando:`; `[x]` hecha · `[~]` parcial · `[ ]` pendiente |

| Spec | Estado | Hechas | Pendientes |
| --- | --- | --- | --- |
| [001 · Autenticación y sesiones](001-autenticacion-y-sesiones/spec.md) | ✅ Implementada | 14 | 1 (decisión del cliente) |
| [002 · Gestión de usuarios](002-gestion-de-usuarios/spec.md) | ✅ Implementada | 12 | 1 (decisión del cliente) |
| [003 · Recepción y dispositivos](003-recepcion-y-dispositivos/spec.md) | ✅ Implementada | 12 | 1 (decisión del cliente) |
| [004 · Ciclo de vida de la orden](004-ciclo-de-vida-de-la-orden/spec.md) | ✅ Implementada | 14 | 1 (decisión del cliente) |
| [005 · Consulta y panel de órdenes](005-consulta-y-panel-de-ordenes/spec.md) | ✅ Implementada | 11 | 0 |
| [006 · Presupuestos](006-presupuestos/spec.md) | ✅ Implementada | 13 | 0 |
| [007 · Inventario y Stock Guard](007-inventario-y-stock-guard/spec.md) | ✅ Implementada | 13 | 1 (decisión del cliente) |
| [008 · Seguimiento del cliente](008-seguimiento-del-cliente/spec.md) | ✅ Implementada | 13 | 0 |
| [009 · Cookie protegida](009-sesion-con-cookie-httponly/spec.md) | **Propuesta** (nueva) | 1 | 9 |
| [010 · Vencimiento automático de presupuestos](010-vencimiento-automatico-de-presupuestos/spec.md) | **Propuesta** (nueva) | 0 | 8 |
| **Total** | | **103** | **22** |

## Cómo se trabaja con SDD en este repositorio

1. **Spec primero:** el cambio de comportamiento empieza en el `spec.md` (un `RF-x` con criterios EARS).
2. **Test después, código al final:** cada test lleva en su título la etiqueta del requisito que prueba, por ejemplo `it('rejects … [001/RF-2.2]')`.
3. **Verificación automática:** `npm run sdd:check` falla si un requisito o criterio de aceptación de una spec implementada no tiene test, o si un test cita un requisito inexistente. Lo ejecutan el hook pre-commit y el job `sdd` de la CI.
4. **Tareas con evidencia:** `[x]` en `tasks.md` solo cuando su "Hecho cuando" se cumple y se cita la evidencia.
5. **Informes:** [verificacion.md](verificacion.md) (resultado de las pruebas y veredicto) y [trazabilidad.md](trazabilidad.md) (requisito → tests, generado con `npm run sdd:report`).

**Regla del proyecto:** si el código y una spec discrepan, gana la spec (constitución C2.2).
