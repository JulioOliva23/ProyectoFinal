# Reglas de frontend — FE (Servicio Técnico de Celulares)

Repo `servicio_front` · React + Vite + TypeScript, SPA que consume la API REST de `servicio_back`. Se construye adaptando `taller_front` (ver [FE-05](#fe-05)); la prioridad de construcción está en [`../backlog.md`](../backlog.md).

Requiere haber leído [00-general.md](00-general.md) y [`AI_CONTEXT.md`](../../AI_CONTEXT.md). Las reglas RN-01 a RN-15 aplican aquí sin repetirse.

Niveles normativos: **MUST** es obligatorio, **SHOULD** admite excepción justificada por escrito, **MAY** es opcional.

---

## Stack

### FE-01
**Versiones del frontend (heredadas de `taller_front`)**

**MUST.**

| Paquete | Versión | Propósito |
| --- | --- | --- |
| `react`, `react-dom` | 19.x | UI |
| `vite` | 8.x | Build y servidor de desarrollo |
| `typescript` | 6.0.x | `strict`, sin `any` ([GEN-05](00-general.md#gen-05)) |
| `tailwindcss` + `@tailwindcss/vite` | 4.x | Estilos utilitarios; `clsx` + `tailwind-merge` para componer clases |
| `axios` | 1.x | Transporte HTTP, encapsulado en `shared/api/httpClient.ts` |
| `@tanstack/react-query` | 5.x | Estado de servidor, caché e invalidación |
| `react-router` | 7.x | Rutas, layouts y `lazy` por página |
| `react-hook-form` + `@hookform/resolvers` | 7.x / 5.x | Formularios |
| `zod` | 4.x | Esquemas de validación tipados |
| `openapi-typescript` | 7.x | Tipos generados desde Swagger |
| `lucide-react` | última | Iconografía |
| `vitest` + `@testing-library/react` + `msw` | 4.x / 16.x / 2.x | Tests de componentes con API simulada |
| `oxlint` | 1.x | Linter (`npm run lint` = `tsc -b && oxlint`) |

**MUST NOT.** Ninguna otra librería de estado global salvo justificación escrita (FE-10).

## Contrato con el backend

### FE-02
**Tipos generados desde OpenAPI**

**MUST.** Los tipos de payloads y respuestas salen de `openapi-typescript` y viven en `src/shared/api/schema.gen.ts` (nunca se edita a mano). El Swagger de `servicio_back` expone el JSON en `/api-json` (no `/api/docs-json` como en el taller):

```bash
npx openapi-typescript http://localhost:3000/api-json -o src/shared/api/schema.gen.ts
```

**MUST.** Prohibido declarar interfaces espejo de las respuestas de la API.

### FE-03
**Cliente HTTP único**

**MUST.** Toda petición pasa por `src/shared/api/httpClient.ts` (axios): base URL `/api/v1` desde `VITE_API_URL`, header `Authorization: Bearer`, renovación automática con `POST /auth/refresh` ante un `401` (una sola vez por petición, en cola si hay varias) y error tipado `ApiError`.

### FE-04
**Traducción de errores del backend**

**MUST.** `ApiError` traduce el cuerpo estándar de `AllExceptionsFilter` a mensajes en español:

| Código | Caso típico | Mensaje / acción en UI |
| --- | --- | --- |
| `400` | IMEI no pasa Luhn (RN-02), código de desbloqueo con formato inválido | Error junto al campo |
| `403` | Rol no permitido o OT no asignada (RN-06) | Toast + redirección a la ruta por defecto del rol |
| `404` | IMEI no registrado (RN-13) | Estado vacío, no error |
| `409` | Transición ilegal o concurrente (RN-04) | Toast + refetch de la OT |
| `422` `INSUFFICIENT_STOCK` | Stock Guard (RN-09) | Banner con los repuestos faltantes (`sparePartIds`) y enlace a inventario (si el rol lo permite) |
| `422` presupuesto vencido | RN-08 | Banner "Presupuesto vencido: emitir nueva versión" |

## Estructura y mapeo desde `taller_front`

### FE-05
**Mapeo de vistas y componentes**

**MUST.** Se reutiliza la estructura feature-first de `taller_front`. Cada feature migra así:

| `taller_front` | `servicio_front` | Acción |
| --- | --- | --- |
| `features/auth/*` (`LoginPage`, `AuthProvider`, `ProtectedRoute`, `role-routes.ts`) | `features/auth/*` | **Reutilizar**; cambiar roles a `ADMIN · RECEPTIONIST · TECHNICIAN · CUSTOMER` |
| `features/reception/pages/VehicleReceptionPage` + `reception.validation.ts` | `features/reception/pages/DeviceReceptionPage` | **Adaptar**: placa/año/eléctrico → IMEI (Luhn), modelo, color, batería %, check-in cosmético, tipo de bloqueo + código |
| `features/reception/components/VehicleHistoryPanel`, `features/vehicles/*` | `features/devices/components/DeviceHistoryPanel`, `useDeviceHistory` | **Adaptar**: búsqueda por IMEI (`GET /devices/by-imei/:imei`) |
| `features/work-orders/pages/WorkOrderTrackingPage`, `WorkOrderTrackingCard` | `features/work-orders/pages/WorkOrdersPage`, `WorkOrderCard` | **Adaptar** al listado paginado `GET /work-orders` |
| `features/work-orders/components/DiagnosticForm` | `features/work-orders/components/DiagnosisForm` | **Adaptar** a `PATCH /work-orders/:id/diagnosis` |
| `features/mechanic-view/*` (`MechanicConsoleView`, `AssignedOrderCard`) | `features/work-orders/pages/WorkOrderDetailPage` (vista técnico) | **Adaptar**: el técnico avanza estados con `POST /transitions`; ya no consume repuestos a mano (lo hace el Stock Guard) |
| `features/mechanic-view/components/ReservedPartsPanel` | `features/work-orders/components/BudgetPartsPanel` | **Adaptar**: muestra estado `PENDING/RESERVED/CONSUMED` sin precios |
| `features/workshop/*` (`AssignOrderModal`, `PendingOrdersCard`) | `features/work-orders/components/AssignTechnicianModal` | **Adaptar**: asigna Recepción/Admin (`GET /users?role=TECHNICIAN`) |
| `features/quote-creation/*` | `features/budgets/pages/BudgetEditorPage` | **Adaptar**: ítems `LABOR` con precio + `PART` filtrados por modelo compatible (RN-10) |
| `features/budget-approval/*` (`BudgetApprovalPage`, `BudgetItemsTable`, `ApprovalSummaryModal`) | `features/budgets/pages/BudgetsPage`, `BudgetDecisionModal` | **Adaptar**: enviar, aprobar/rechazar con canal; mostrar vencimiento |
| `features/budget-approval/components/EVWarningBanner` | — | **Eliminar** (no aplica) |
| `features/stale-quotes/*` | `features/budgets/components/ExpiringBudgetBadge` | **Adaptar** a vencimiento por `expiresAt` (RN-08) |
| `features/inventory/*` (`InventoryManagerView`, `SparePartCard`, `CreateSparePartModal`, `StockAdjustmentModal`, `InventoryAlertsView`) | `features/inventory/*` | **Reutilizar** casi íntegro; categorías electrónicas, compatibilidad multi-modelo, ingreso de stock |
| `features/tracking-public/*` (`TrackingForm`, `TrackingStatusStepper`) | `features/customer-portal/*` | **Adaptar**: stepper con los 9 estados; acceso según [FE-17](#fe-17) |
| `features/work-bays/*`, `features/settlement/*`, `features/additional-findings/*` | — | **Eliminar** (fuera del MVP, AI_CONTEXT §8) |
| `shared/components/*` (`Button`, `Card`, `Modal`, `Badge`, `StatusPipeline`, `Pagination`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `ToastContext`, `ui/form-field`) | `shared/components/*` | **Reutilizar** sin cambios |
| `shared/api/httpClient.ts`, `query-keys.ts` | idem | **Reutilizar**; regenerar `schema.gen.ts` |
| `shared/lib/money.ts` | idem | **Reutilizar** (montos `string` decimales, RN-15) |
| `shared/types/statuses.ts` | idem | **Reemplazar** por los 9 estados y etiquetas de AI_CONTEXT §5 |
| `test/msw/*-handlers.ts` | `test/msw/*-handlers.ts` | **Reescribir** por feature nueva |

### FE-06
**Estructura de carpetas resultante**

**MUST.**

```text
src/
├── app/                    # router.tsx, providers, layouts (AppLayout, CustomerLayout)
├── features/
│   ├── auth/               # login, sesión, ProtectedRoute, role-routes
│   ├── reception/          # DeviceReceptionPage (alta de OT)
│   ├── devices/            # historial por IMEI
│   ├── work-orders/        # listado, detalle, transiciones, asignación, auditoría, revelado
│   ├── budgets/            # editor, envío, decisión
│   ├── inventory/          # catálogo, stock, alertas
│   └── customer-portal/    # consulta del cliente
├── shared/                 # api/, components/, hooks/, lib/, types/
└── main.tsx
```

Nombres: componentes PascalCase, hooks `useX.ts`, servicios/esquemas kebab-case (`work-orders-api.ts`, `device-reception-schema.ts`). `shared/` nunca importa de `features/`.

## Rutas y RBAC

### FE-07
**Mapa de rutas protegidas**

**MUST.** Las URLs de la SPA van en español (decisión explícita para `servicio_front`; la API sigue en inglés según GEN-01). Cada ruta se envuelve en `ProtectedRoute allowedRoles={...}`:

| Ruta | Página | Roles | Notas |
| --- | --- | --- | --- |
| `/auth/login` | `LoginPage` | Público | Redirige a la ruta por defecto del rol si ya hay sesión |
| `/ordenes` | `WorkOrdersPage` | `ADMIN`, `RECEPTIONIST`, `TECHNICIAN` | El técnico ve solo sus OTs (el backend fuerza el filtro, RN-06) |
| `/ordenes/nueva` | `DeviceReceptionPage` | `ADMIN`, `RECEPTIONIST` | Alta de OT |
| `/ordenes/:id` | `WorkOrderDetailPage` | `ADMIN`, `RECEPTIONIST`, `TECHNICIAN` | Acciones según rol y `allowedTransitions` |
| `/presupuestos` | `BudgetsPage` | `ADMIN`, `RECEPTIONIST` | **Técnico: sin acceso** (RN-07) |
| `/presupuestos/:workOrderId` | `BudgetEditorPage` | `ADMIN`, `RECEPTIONIST` | |
| `/inventario` | `InventoryManagerView` | `ADMIN`, `RECEPTIONIST` | **Técnico: sin acceso en UI** (ver nota) |
| `/inventario/alertas` | `InventoryAlertsView` | `ADMIN`, `RECEPTIONIST` | RN-11 |
| `/portal-cliente` | `CustomerPortalPage` | Público + `CUSTOMER` | Dos modos de acceso, ver [FE-17](#fe-17) |

Nota: el backend permite a `TECHNICIAN` leer `GET /spare-parts` sin precios (consulta de compatibilidad). La UI es más restrictiva por decisión de producto; si el técnico necesita consultar stock se expone dentro del detalle de la OT (`BudgetPartsPanel`), no como ruta.

Ruta por defecto por rol (`role-routes.ts`): `ADMIN → /ordenes`, `RECEPTIONIST → /ordenes`, `TECHNICIAN → /ordenes`, `CUSTOMER → /portal-cliente`.

### FE-08
**El RBAC de la UI es cosmético; el backend es la autoridad**

**MUST.** Ocultar un botón no sustituye la verificación: toda acción debe manejar `403` (FE-04). Las acciones visibles se derivan de `allowedTransitions` devuelto por `GET /work-orders/:id`, nunca de una tabla de transiciones duplicada en el front.

## Estado

### FE-09
**React Query para todo estado de servidor**

**MUST.** Prohibido `useEffect + fetch + useState`. Claves centralizadas en `shared/api/query-keys.ts`.

**MUST.** Invalidaciones tras mutaciones:

| Mutación | Invalida |
| --- | --- |
| Transición de OT | `workOrders.detail(id)`, `workOrders.list`, `workOrders.audit(id)`; si `to ∈ {IN_REPAIR, QUALITY_CONTROL}` también `spareParts.*` |
| Asignar técnico | `workOrders.detail(id)`, `workOrders.list` |
| Enviar / aprobar / rechazar presupuesto | `budgets.byWorkOrder(id)`, `workOrders.detail(id)`, `workOrders.audit(id)` |
| Ingreso o ajuste de stock | `spareParts.list`, `spareParts.lowStock` |

### FE-10
**Estado de cliente acotado**

**SHOULD.** `useState` local; Context solo para sesión y toasts. El formulario de recepción es de una sola página con secciones; no requiere store global.

## Formularios y validación

### FE-11
**react-hook-form + zod, espejo de los DTOs**

**MUST.** Cada formulario tiene un esquema zod que replica las restricciones del DTO del backend (longitudes, rangos, enums). La validación del cliente es retroalimentación inmediata; nunca reemplaza la del backend.

### FE-12
**Validación de IMEI en el cliente (RN-02)**

**MUST.** El esquema de recepción normaliza (quita espacios y guiones) y valida Luhn con una copia de `servicio_back/src/domain/devices/imei.ts` en `shared/lib/imei.ts`, con los mismos vectores de test. Mientras se escribe el IMEI se consulta el historial con debounce de 300–400 ms solo cuando el valor es Luhn-válido (RN-13).

### FE-13
**Código de desbloqueo según tipo de bloqueo (RN-03)**

**MUST.** `lockType = NONE` oculta el campo; `PIN` acepta 4–16 dígitos con `inputMode="numeric"`; `PATTERN` se captura con una grilla 3×3 que produce `1-5-9-6`; `PASSWORD` acepta 1–64 caracteres. El campo es `type="password"`, con `autoComplete="off"`, y nunca se guarda en estado persistente, `localStorage` ni logs.

## Seguridad de UI

### FE-14
**Enmascaramiento y revelado auditado del código de desbloqueo (RN-03)**

**MUST.**

1. Las respuestas de la API nunca traen el código, solo `hasUnlockCode` y `lockType`. La UI muestra `••••` (PIN/contraseña) o una grilla vacía (patrón).
2. Solo el técnico asignado y `ADMIN` ven el botón **"Revelar código"**. Al pulsarlo se muestra una confirmación que advierte que el acceso queda registrado.
3. Al confirmar se llama a `POST /work-orders/:id/unlock-code/reveal`. Ese endpoint registra el acceso en `unlock_code_access_logs` **antes** de devolver el valor.
4. El valor revelado vive solo en el estado local del componente (no en la caché de React Query: `gcTime: 0` o `useMutation`), se oculta automáticamente a los 30 s, al cambiar de pestaña (`visibilitychange`) o al desmontar, y no se puede copiar al portapapeles desde un botón.
5. Cada revelado es una nueva llamada al endpoint: no se reutiliza un valor ya revelado.

### FE-15
**Precios y costos por rol (RN-07)**

**MUST.** `TECHNICIAN` no ve precios en ninguna vista (las respuestas ya los omiten; la UI no debe mostrar columnas vacías de precio). `unitCost` se muestra solo a `ADMIN`. `CUSTOMER` ve únicamente `budgetTotal`.

### FE-16
**Tokens JWT**

**MUST.** Access token en memoria. Refresh token en `sessionStorage` mientras el backend no emita cookies `httpOnly` (SUP-07); se borra en `logout` y ante un refresh fallido. Prohibido `localStorage` para tokens.

### FE-17
**Portal del cliente `/portal-cliente`**

**MUST.** Muestra únicamente lo que expone `CustomerWorkOrderStatusDto`: número de OT, dispositivo, estado con etiqueta en español y stepper, fecha compromiso y total del presupuesto vigente. Nunca diagnóstico técnico, código de desbloqueo, técnico ni costos internos (RN-14).

**Dos modos de acceso ([SUP-05](../supuestos.md#sup-05), confirmado):**

| Modo | Cómo entra | Endpoint | Vista |
| --- | --- | --- | --- |
| Con cuenta | Login con rol `CUSTOMER` | `GET /work-orders/mine` | Lista de todas sus OTs |
| Sin cuenta | Formulario "Número de OT" + "Código de seguimiento" en `/portal-cliente` | `POST /public/tracking` | Una OT |

- `/portal-cliente` es **pública**: si hay sesión `CUSTOMER` muestra la lista; si no, muestra el formulario.
- El formulario acepta `OT-000123` o `123`, y el código con o sin guion y en minúsculas. La etiqueta dice "Código de seguimiento (impreso en su ticket)" y aclara que **no** es el PIN del celular.
- Un `404` muestra un único mensaje: "No encontramos una orden con esos datos". Nunca distingue entre número inexistente y código incorrecto.
- Un `429` muestra "Demasiados intentos, espere un minuto" y deshabilita el botón 60 s.
- Sin persistencia: el número y el código no se guardan en `localStorage` ni en la URL (`POST`, nunca query string).

**MUST.** En recepción, la pantalla de éxito del alta (`WorkOrderSuccess`) muestra el `trackingCode` de forma destacada para imprimirlo en el ticket, con el aviso "Este código no se volverá a mostrar". Recepción y Admin tienen el botón "Regenerar código de seguimiento" en el detalle de la OT (ticket perdido).

## Experiencia de usuario

### FE-18
**Estados de carga, error y vacío**

**MUST.** Toda vista con datos renderiza skeleton, error con reintento y vacío descriptivo (p. ej. "Este IMEI no registra reparaciones previas").

### FE-19
**Uso en recepción y en el banco del técnico**

**MUST.** Recepción optimizada para escritorio; vista del técnico usable en tablet/móvil con áreas táctiles de al menos `44×44 px` en las acciones de transición.

### FE-20
**Alertas no intrusivas**

**MUST.** Stock bajo (RN-11) y presupuestos por vencer (RN-08) se muestran como badges o banners, nunca con `alert()` ni modales bloqueantes.

## Testing

### FE-21
**Vitest + Testing Library + MSW**

**MUST.** Consultas por rol y etiqueta accesible; red simulada con MSW (sin mocks manuales de axios). Tests en inglés citando la regla:

```ts
it('rejects an IMEI with an invalid Luhn check digit before submitting (RN-02)');
it('masks the unlock code and reveals it only after calling the audited endpoint (RN-03)');
it('hides the budgets and inventory routes for technicians (RN-07)');
it('shows the missing parts when the stock guard blocks IN_REPAIR (RN-09)');
```
