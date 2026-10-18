# Reglas generales — GEN (Servicio Técnico de Celulares)

Aplican a todos los repositorios del proyecto. Las reglas específicas de cada repositorio están en [backend.md](backend.md), [frontend.md](frontend.md) y [tools.md](tools.md), y **nunca contradicen** lo que está aquí: si parece que lo hacen, gana este documento y hay que corregir el otro.

Niveles normativos: **MUST** es obligatorio, **SHOULD** admite excepción justificada por escrito, **MAY** es opcional.

---

## Idioma y estilo

### GEN-01
**Documentación en español, código en inglés**

**MUST.** Todo lo que se lee como documento va en español: los `.md` de este repo, las descripciones de MR y los comentarios de revisión. Todo lo que vive dentro del código va en inglés: clases, variables, funciones, nombres de archivo, tablas y columnas de base de datos, rutas de la API, comentarios en el código y mensajes de commit.

- ✅ `class WorkOrder`, `POST /api/v1/work-orders`, tabla `spare_parts`
- ❌ `class OrdenTrabajo`, `POST /api/v1/ordenes-trabajo`, tabla `repuestos`

### GEN-02
**El vocabulario del dominio se traduce una sola vez y no se vuelve a discutir**

**MUST.** El vocabulario oficial es la tabla de [AI_CONTEXT.md §3](../../AI_CONTEXT.md#3-mapeo-de-dominio-taller--servicio-técnico). Resumen:

| Dominio | Código |
| --- | --- |
| Orden de trabajo (OT) | `WorkOrder` |
| Dispositivo / Modelo comercial | `Device` / `DeviceModel` |
| Presupuesto técnico / Ítem | `Budget` / `BudgetItem` (`LABOR`, `PART`) |
| Repuesto electrónico / Compatibilidad | `SparePart` / `SparePartCompatibility` |
| Movimiento de inventario (kardex) | `StockMovement` |
| Auditoría de estados | `WorkOrderStatusAudit` |
| Administrador · Recepcionista · Técnico · Cliente | `ADMIN` · `RECEPTIONIST` · `TECHNICIAN` · `CUSTOMER` |
| Código de desbloqueo | `unlockCode` (solo cifrado: `unlockCodeCipher`) |
| Motivo | `reason` |

## Stack y versiones

### GEN-03
**Versiones fijadas**

**MUST.** Estas son las versiones verificadas y obligatorias para todo el ecosistema del proyecto:

| Herramienta | Versión | Nota |
| --- | --- | --- |
| Node.js | 24 LTS | Cubre los requisitos de NestJS (`>=20`), Prisma (`>=24.0`) y Vite (`>=22.12`) |
| npm | 11.x | Gestor de paquetes único, ver [GEN-04](#gen-04) |
| TypeScript | **6.0.x** | No 7.x — ver [GEN-05](#gen-05) |
| PostgreSQL | 17 o superior | Base de datos relacional |

### GEN-04
**npm como único gestor de paquetes**

**MUST.** Prohibido el uso de `yarn` o `pnpm`. El archivo `package-lock.json` se versiona siempre y se commitea junto con cualquier cambio en `package.json`.

### GEN-05
**TypeScript 6.0.x y modo `strict`, sin `any`**

**MUST.** TypeScript debe permanecer en la rama 6.0.x para preservar la compatibilidad con el Compiler API que utiliza NestJS y sus plugins de CLI.

**MUST.** `"strict": true` obligatorio en todos los `tsconfig.json`. El tipo `any` está prohibido; usar `unknown` y estrechar tipos.

**SHOULD.** Si se requiere un `any` excepcional, va con `// eslint-disable-next-line` y una justificación técnica.

---

## Git y Control de Versiones

### GEN-06
**Conventional commits en inglés**

**MUST.** Formato `<type>(<scope>): <subject>` en imperativo, minúsculas y sin punto final. Tipos permitidos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.

### GEN-07
**Estrategia de ramas y trazabilidad de MR**

**MUST.** Las ramas usan uno de estos formatos: `feat/<us-id>-<slug>`, `fix/<slug>`, `docs/<slug>` o `chore/<slug>`.

**MUST.** Está prohibido hacer push directo a `main`. Todo cambio entra por Merge Request (MR), enlazando la US correspondiente.

## Relación con el análisis funcional

### GEN-08
**Reglas de negocio del servicio técnico**

**MUST.** Las reglas RN-01 a RN-15 están en [AI_CONTEXT.md §4](../../AI_CONTEXT.md#4-reglas-de-negocio-rn) y la máquina de estados en [§5](../../AI_CONTEXT.md#5-máquina-de-estados-de-la-ot). Toda lógica de negocio las respeta y las cita en código.

### GEN-09
**Gestión de vacíos y supuestos técnicos**

**MUST.** Si al programar una US aparece una decisión que el backlog o estas reglas no cubren:

1. Registrar un supuesto `SUP-xx` en `supuestos.md`, incluyendo su riesgo y las US afectadas.
2. Agregar la pregunta correspondiente a `preguntas-cliente.md`.
3. Implementar la opción más conservadora y marcarla en el código citando el supuesto:

```ts
// SUP-NN: assumed behavior, pending client confirmation
```

### GEN-10
**Identificadores trazables en ambas direcciones**

**MUST.** Usar siempre esta nomenclatura oficial en código y documentación:

| Identificador | Significado |
| --- | --- |
| `US-xx` | User Story |
| `E-x` | Épica |
| `RN-xx` | Regla de Negocio |
| `SUP-xx` | Supuesto |
| `P-xx` | Pregunta al Cliente |
| `GEN-`, `BE-`, `FE-`, `TL-` | Reglas de arquitectura |

Los identificadores deben citarse explícitamente en el código cuando justifican una validación:

```ts
// RN-02: reject IMEIs that fail the Luhn check
// RN-09: reserve spare parts so they cannot be taken by other work orders
```

---

## Calidad y Definition of Done (DoD)

### GEN-11
**Seguridad y variables de entorno**

**MUST.** No se almacenan credenciales, tokens ni cadenas de conexión en el repositorio. Cada repositorio versiona un `.env.example` y el archivo `.env` real debe estar ignorado en `.gitignore`.

### GEN-12
**Definition of Done (DoD)**

**MUST.** Un cambio o MR está terminado únicamente cuando cumple:

- [ ] Compila y el linter pasa sin advertencias.
- [ ] Los criterios de aceptación Gherkin de la US están cubiertos por pruebas automatizadas que pasan.
- [ ] La UI funciona en escritorio (recepción) y tablet/móvil (banco del técnico).
- [ ] No hay tipos `any` sin justificar, secretos ni `console.log` olvidados.
- [ ] El MR referencia formalmente la US asociada, según GEN-07.
- [ ] Si se asumió algún comportamiento nuevo, quedó documentado como `SUP-xx`, según GEN-09.
