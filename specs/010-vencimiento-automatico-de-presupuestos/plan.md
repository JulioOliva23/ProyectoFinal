# Plan 010 · Vencimiento automático de presupuestos

Cumple la [constitución](../../docs/constitution.md) (C1.1 sin infraestructura nueva, C3.1 regla pura en `domain/`, C5.1 PostgreSQL como fuente de verdad). Cubre RF-1 a RF-4 de [spec.md](spec.md). **Estado: propuesta.**

## 1. Estructura de módulos

| Archivo (`servicio_back/src`) | Cambio propuesto | RF |
| --- | --- | --- |
| `domain/budgets/budget-expiry.ts` (nuevo, puro) | `effectiveStatus(budget, now)` y `daysUntilExpiry(budget, now)` | RF-1.1, RF-1.2, RF-2.1 |
| `modules/budgets/budgets.service.ts` | Usar el estado efectivo al responder y en `requireDecidable`; nuevo `listExpiring(days)` | RF-1, RF-2 |
| `modules/budgets/repositories/budget.repository.ts` | `markExpiredBefore(now)` (UPDATE en lote) y `findExpiring(from, to)` | RF-1.1, RF-2.1 |
| `modules/work-orders/work-orders.service.ts` → `summary` | Sumar `expiredBudgets` | RF-2.2 |
| `modules/budgets/budgets.controller.ts` | Ruta de presupuestos por vencer | RF-2.1 |

## 2. Modelo de datos

Sin tablas nuevas. Un presupuesto ya tiene `status` y `expiresAt`; el estado efectivo se deriva:

```json
{
  "Budget": { "id": "…", "status": "SENT", "expiresAt": "2026-10-27T15:00:00.000Z" },
  "estadoEfectivo(now = 2026-10-28)": "EXPIRED",
  "diasRestantes(now = 2026-10-25)": 2
}
```

Se propone agregar `expiredBy` (`null` = manual / aprobación, `"SYSTEM"` = automático) para RF-4.1. Requiere migración (confirmación previa, C5.2).

## 3. Algoritmos

```text
effectiveStatus(budget, now):                                    # RF-1.1, RF-1.2
  if budget.status == SENT and budget.expiresAt <= now: return EXPIRED
  return budget.status

daysUntilExpiry(budget, now):                                    # RF-2.1
  if budget.status != SENT: return none
  return max(0, ceil((budget.expiresAt − now) / 1 día))

refreshExpired(now):                                             # materializa el estado
  UPDATE budgets SET status = EXPIRED, expiredBy = "SYSTEM"
   WHERE status = SENT AND expiresAt <= now                       # RF-1.1, RF-4.1

en cada lectura de presupuestos / panel / decisión:
  refreshExpired(now)    # barato, con índice (status, expiresAt); no necesita reloj propio

listExpiring(days, now):                                         # RF-2.1
  return budgets WHERE status = SENT AND expiresAt BETWEEN now AND now + days
```

## 4. Contrato de uso

| Operación | Ruta | Roles | Salida |
| --- | --- | --- | --- |
| Por vencer | `GET /budgets/expiring?days=2` | Admin, Recepción | presupuestos con `daysLeft` |
| Resumen del panel | `GET /work-orders/summary` | Admin, Recepción | agrega `expiredBudgets` |
| Consultas existentes | `GET /budgets/:id`, `GET /work-orders/:id/budgets` | Admin, Recepción | `status` ya efectivo |

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| **Actualización perezosa** al leer o decidir, más cálculo del estado efectivo | No depende de un proceso encendido (RNF-1); cero infraestructura (C1.1); el índice `(status, expires_at)` ya existe | Tarea programada (`@nestjs/schedule` o *cron job* de Render): el plan gratuito duerme el servidor y los cron jobs son de pago |
| Regla en `domain/` | Probable sin base de datos con fechas controladas | Lógica en el repositorio con SQL: difícil de probar |
| No mover la orden automáticamente | Evita cancelar un trabajo por un olvido; decisión de negocio pendiente | Cancelar a los N días: sin respuesta del cliente (duda 1) |
| Marcar `expiredBy` | El historial distingue lo automático de lo manual (RF-4.1) | Reutilizar `decidedBy` con un usuario "sistema" ficticio |

## 6. Estrategia de tests

| Nivel | Test propuesto | RF |
| --- | --- | --- |
| Unitario | `effectiveStatus`: justo antes, justo en y después de `expiresAt`; no toca APPROVED/REJECTED/SUPERSEDED | RF-1 |
| Unitario | `daysUntilExpiry` con fechas fijas (redondeo hacia arriba) | RF-2.1 |
| Unitario | `listExpiring(2)` devuelve solo los del rango | RF-2.1 |
| e2e | Un presupuesto enviado con `expiresAt` pasado se consulta como `EXPIRED` sin intentar decidirlo | RF-1.1 |
| e2e | El resumen cuenta presupuestos vencidos sin reemitir | RF-2.2 |
| e2e | Aprobar el vencido sigue rechazándose (regresión de la spec 006) | RF-1.2 |
