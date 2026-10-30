# Plan 002 · Gestión de usuarios

Cumple la [constitución](../../docs/constitution.md) (C3 capas, C5 persistencia, C7 seguridad). Cubre RF-1 a RF-6 de [spec.md](spec.md).

## 1. Estructura de módulos

| Archivo (`servicio_back/src/modules/users`) | Responsabilidad | RF |
| --- | --- | --- |
| `users.controller.ts` | Rutas y `@Roles`; extrae el actor del JWT | RF-1 a RF-5 |
| `users.service.ts` | Reglas: vínculo con cliente, autoprotección, hash de contraseña | RF-1, RF-3 a RF-6 |
| `dto/create-user.dto.ts` | Validación de usuario, contraseña, nombre, rol; DTO de edición, reinicio y consulta | RF-1.2, RF-1.3 |
| `repositories/user.repository.ts` | Único acceso a Prisma para `User` y `Customer` | todos |

`UsersService.assertActiveTechnician` lo consume el módulo de órdenes (RF-6).

## 2. Modelo de datos

```json
{
  "User": {
    "id": "6f1c0a3e-…",
    "username": "tecnico01",
    "passwordHash": "$argon2id$v=19$…",
    "fullName": "Técnico Uno",
    "role": "TECHNICIAN",
    "customerId": null,
    "isActive": true,
    "createdAt": "2026-10-18T22:05:33.000Z",
    "updatedAt": "2026-10-19T14:02:11.000Z"
  }
}
```

`customerId` solo se llena cuando `role = CUSTOMER`. `updatedAt` es la marca que invalida sesiones anteriores (spec 001).

## 3. Algoritmos

```text
create(dto):                                                    # RF-1
  if dto.role != CUSTOMER and dto.customerId: throw 422        # RF-1.6
  if dto.customerId and !customerExists(dto.customerId): throw 404   # RF-1.5
  if findByUsername(dto.username): throw 409                   # RF-1.4
  return repo.create({...dto, passwordHash: argon2.hash(dto.password)})

update(id, dto, actor):                                         # RF-3
  user = require(id)                                            # 404 si no existe
  if dto.role and dto.role != user.role:
      if user.role == CUSTOMER or dto.role == CUSTOMER: throw 422   # RF-3.2
      if id == actor.id: throw 422                              # RF-3.3
  return repo.update(id, {fullName, role})                      # bump de updatedAt

deactivate(id, actor):                                          # RF-5
  user = require(id)
  if !user.isActive: throw 404                                  # RF-5.3
  if id == actor.id: throw 422                                  # RF-5.2
  return repo.update(id, {isActive: false})

activate(id):                                                   # RF-5.4
  user = require(id)
  return user.isActive ? user : repo.update(id, {isActive: true})

assertActiveTechnician(id):                                     # RF-6
  if !repo.findActiveWithRole(id, TECHNICIAN): throw 422
```

## 4. Contrato de uso (`/api/v1`)

| Operación | Ruta | Roles | Salida / errores |
| --- | --- | --- | --- |
| Crear | `POST /users` | Admin | 201 usuario · 404 cliente · 409 duplicado · 422 vínculo |
| Listar | `GET /users?role=&includeInactive=` | Admin, Recepción | arreglo de usuarios |
| Editar | `PATCH /users/:id` | Admin | usuario · 404 · 422 |
| Reiniciar contraseña | `POST /users/:id/password` | Admin | 204 · 404 |
| Reactivar | `POST /users/:id/activate` | Admin | usuario · 404 |
| Desactivar | `DELETE /users/:id` | Admin | usuario · 404 · 422 |

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| Baja lógica (`isActive`) | Conserva la auditoría y el historial atribuidos a la cuenta | `DELETE` físico: rompería llaves foráneas de auditoría y órdenes |
| Autoprotección en el service (`assertNotSelf`) | Evita que un administrador se bloquee a sí mismo | Confiar en la interfaz: se saltaría llamando a la API |
| Reglas de contraseña como decorador reutilizable | Mismas reglas en alta y reinicio (RF-4.1) | Duplicar la validación: se desalinearía |
| Invalidar sesiones por `updatedAt` | Sin tabla ni job extra (C1.1) | Lista de sesiones por usuario: más estado |

## 6. Estrategia de tests

| Nivel | Tests (`unit-tests/users.service.spec.ts`) | RF |
| --- | --- | --- |
| Unitario | "hashes the password with argon2 and never returns it" · "rejects binding a staff user to a customer" · "rejects a duplicated username" | RF-1 |
| Unitario | "includes inactive users only for ADMIN" | RF-2 |
| Unitario | "edits the name and the staff role" · "never turns staff into CUSTOMER…" · "does not let an admin change their own role" · "lets an admin rename themself" · "answers 404 for an unknown user" | RF-3 |
| Unitario | "stores only the new argon2 hash" | RF-4.1 |
| Unitario | "deactivates another user logically" · "does not let an admin deactivate their own account" · "answers 404 when the user is already inactive" · "reactivates an inactive user and is idempotent…" | RF-5 |
| Unitario | "only accepts active technicians as assignees (RN-06)" | RF-6 |
| Unitario DTO | Validación de usuario y contraseña **sin test dedicado** | RF-1.2, RF-1.3 |
| Pendiente | Cliente inexistente al crear cuenta de rol Cliente | RF-1.5 |
| Pendiente | Efecto del reinicio de contraseña sobre sesiones previas (e2e) | RF-4.2 |
