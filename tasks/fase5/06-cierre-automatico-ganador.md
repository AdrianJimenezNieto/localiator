# 06 · Cierre automático de subasta y asignación de ganador

**Checkbox del roadmap:** «Cierre automático de subasta y asignación de ganador».

## Objetivo
Que la subasta **se cierre sola** cuando pasa `endsAt` (respetando las extensiones de la tarea
05), fije el **ganador** (la puja máxima) y deje la subasta lista para el cobro (tarea 09) o,
si nadie pujó, la marque desierta. Es el paso que convierte pujas en un resultado.

## Qué se toca
- `apps/api/src/auctions/auctions.closer.ts` (o servicio programado) — tarea periódica que
  cierra subastas vencidas.
- `apps/api/src/auctions/auctions.service.ts` — método `closeAuction(id)` transaccional.
- `apps/api/src/auctions/auctions.gateway.ts` — emitir `auction:closed` a la room.

## Cómo implementarlo
1. **Disparo por tiempo**: un job periódico (`@nestjs/schedule`, `@Cron` cada minuto) que busca
   subastas `LIVE` con `endsAt <= now` y las cierra. Alternativa: un timer por subasta; para el
   MVP el cron es más simple y robusto ante reinicios.
2. **`closeAuction` transaccional**: releer `endsAt` (una extensión de última hora pudo moverlo;
   si `endsAt > now`, no cerrar). Buscar la **puja máxima**; si existe, fijar `winnerUserId` y
   `winningBidId` y pasar `status` a `CLOSED`; si no hay pujas, `CLOSED` sin ganador (desierta).
3. **Idempotencia**: cerrar una subasta ya cerrada no debe romper ni reasignar ganador (por si
   el cron solapa o se reinicia el proceso). Comprobar `status` antes de actuar.
4. **Emitir el resultado** por WebSocket a la room (`auction:closed` con ganador enmascarado) y
   dejar enganchado el punto donde la tarea 08 disparará las notificaciones (ganado / no ganado)
   y la tarea 09 abrirá el cobro del ganador.
5. **Tests**: subasta con pujas → cierra con el pujador más alto como ganador; sin pujas →
   desierta; cerrar dos veces → sin efecto la segunda.

## Decisiones / alternativas
- **Cron periódico vs. timer por subasta:** el cron sobrevive a reinicios del proceso (no
  depende de timers en memoria) y es sencillo; un timer por subasta sería más «instantáneo»
  pero frágil. Para el MVP de subastas, cron cada minuto es proporcionado.
- **Releer `endsAt` dentro de la transacción:** obligatorio para no cerrar una subasta que el
  antisniping (tarea 05) acaba de extender.
- **Ganador desnormalizado en `Auction` vs. calcularlo al vuelo:** se fija al cerrar (tarea 01
  ya dejó los campos) para que cobro e impago no recalculen la máxima cada vez.

## Conceptos que probablemente convenga repasar
- **`@nestjs/schedule` / `@Cron`** y por qué un cron es más resistente a reinicios que timers.
- **Idempotencia** de un cierre (evitar dobles cierres con cron solapado).
- Relectura dentro de transacción para respetar el **antisniping**.

## Hecho cuando
- Las subastas vencidas se cierran solas y fijan ganador (o quedan desiertas).
- Cerrar una subasta ya cerrada no tiene efecto.
- El cierre se emite por WebSocket y deja el gancho para notificaciones (08) y cobro (09).
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
