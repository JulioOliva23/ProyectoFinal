## Qué cambia y por qué

<!-- Una o dos frases. Enlaza la spec: specs/NNN-nombre/spec.md -->

## Checklist SDD (docs/constitution.md)

- [ ] El comportamiento nuevo o modificado está en un `spec.md` (requisito `RF-x` en EARS) **antes** del código (C2.1, C2.2).
- [ ] Cada requisito tocado tiene un test con su etiqueta en el título, por ejemplo `[001/RF-2.2]` (C4.1, C4.5).
- [ ] `npm run sdd:check` pasa (lo ejecuta también la CI y el pre-commit).
- [ ] Las tareas hechas están marcadas `[x]` en `tasks.md` con su evidencia; las dudas siguen como `[NECESITA ACLARACIÓN]` (C2.4).
- [ ] Lint, tipos y tests pasan (`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`).
- [ ] Todo mensaje que ve una persona está en español (C6.2) y toda ruta nueva declara `@Roles` o `@Public` (C7.1).
- [ ] Si cambia el esquema, hay una migración revisada y confirmada por una persona (C5.2).
