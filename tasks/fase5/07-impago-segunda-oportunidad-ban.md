# 07 · Impago del ganador: segunda oportunidad + ban automático

**Checkbox del roadmap:** «Impago del ganador: segunda oportunidad al siguiente + ban
automático».

## Objetivo
Si el ganador **no paga** en el plazo dado, ofrecer la subasta al **siguiente pujador** (segunda
oportunidad) y **banear automáticamente** al que no pagó para que no vuelva a pujar. Se apoya en
el ganador fijado al cerrar (tarea 06) y en el cobro (tarea 09), y da la validación de «usuario
baneado» que ya consultaban las tareas 02/03.

## Qué se toca
- `apps/api/prisma/schema.prisma` — flag/estado de ban en `User` (p. ej. `bannedAt DateTime?`,
  `banReason String?`) e histórico de ofertas de la subasta si hace falta.
- `apps/api/src/auctions/auctions.service.ts` — lógica de reasignación al siguiente pujador.
- Job/scheduler — detectar ganadores que superan el plazo de pago.

## Cómo implementarlo
1. **Plazo de pago**: al cerrar (tarea 06) o al abrir el cobro (tarea 09), fijar un
   `paymentDueAt` para el ganador. Un job periódico busca subastas `CLOSED` con ganador y plazo
   vencido sin pago confirmado.
2. **Ban automático** del moroso: marcar `bannedAt`/`banReason` en `User`. A partir de ahí, la
   validación de la tarea 02 (`BANNED`) rechaza sus pujas. Registrar el ban en **auditoría**
   (acción sensible, `CLAUDE.md`).
3. **Segunda oportunidad**: buscar la **siguiente puja más alta de otro usuario** (saltando las
   del moroso), fijarla como nuevo ganador, reabrir el cobro para ese usuario y reiniciar su
   `paymentDueAt`. Notificarle (tarea 08).
4. **Sin siguiente pujador**: si no queda nadie, marcar la subasta desierta/cancelada y liberar
   el artículo.
5. **Transaccional e idempotente**: reasignar ganador y banear deben ser atómicos; no rebanear
   ni reasignar dos veces si el job solapa.
6. **Tests**: ganador no paga → baneado y siguiente pujador pasa a ganador; ese tampoco paga →
   se repite; sin más pujadores → subasta desierta; usuario baneado no puede pujar.

## Decisiones / alternativas
- **Ban por flag en `User` vs. tabla de bans:** flag simple para el MVP (un ban global); una
  tabla con motivos/fechas y desbanes se puede añadir si hace falta granularidad.
- **Segunda oportunidad automática vs. relistar la subasta:** automática al siguiente pujador
  es lo que pide `CLAUDE.md` y aprovecha el interés ya existente; relistar sería empezar de cero.
- **Saltar todas las pujas del moroso vs. solo la máxima:** saltar todas las suyas, porque si
  no paga no tiene sentido ofrecerle su segunda puja más alta.

## Conceptos que probablemente convenga repasar
- **Auditoría de acciones sensibles** (registrar el ban) — ya existe patrón de la Fase 1/2.
- Diseño de un **job idempotente** que no rebanea ni reasigna dos veces.
- Cómo el flag de ban **cierra el bucle** con la validación de puja de la tarea 02.

## Hecho cuando
- Un ganador que no paga en plazo queda baneado y no puede volver a pujar.
- La subasta pasa automáticamente al siguiente pujador con su plazo de pago reiniciado.
- Sin más pujadores, la subasta queda desierta. Todo es idempotente y auditado.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...` / `feat(db): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
