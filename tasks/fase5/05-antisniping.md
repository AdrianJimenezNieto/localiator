# 05 · Antisniping: extensión automática del cierre a 5 min

**Checkbox del roadmap:** «Antisniping: extensión automática del cierre a 5 min».

## Objetivo
Evitar el «sniping» (ganar pujando en el último segundo sin dar reacción): si llega una puja
válida cuando **quedan menos de 5 minutos**, el cierre (`endsAt`) se **extiende** para que haya
tiempo de responder. Se apoya en el registro de puja transaccional de la tarea 04.

## Qué se toca
- `apps/api/src/auctions/auctions.service.ts` — extender `endsAt` al aceptar una puja tardía.
- `apps/api/src/auctions/auctions.gateway.ts` — emitir el nuevo `endsAt` a la room.
- Constante configurable del umbral/extensión (p. ej. `ANTISNIPE_WINDOW_MINUTES = 5`).

## Cómo implementarlo
1. **Dentro de la MISMA transacción** que registra la puja ganadora (tarea 04): si
   `endsAt - now < 5 min`, poner `endsAt = now + 5 min`. Hacerlo en la transacción evita que
   una puja se acepte pero la extensión se pierda por una carrera.
2. **Emitir el nuevo cierre** por WebSocket (`auction:extended` con el nuevo `endsAt`) para que
   todos los relojes del front se actualicen y muestren la cuenta atrás correcta.
3. **Umbral = extensión = 5 min** según `CLAUDE.md`, pero como **constante configurable** (no
   número mágico repartido por el código).
4. **Coherencia con el cierre automático** (tarea 06): el cierre debe leer siempre el `endsAt`
   actual, no uno cacheado, para respetar las extensiones.
5. **Tests**: puja a falta de 10 min → no extiende; puja a falta de 2 min → `endsAt` pasa a
   `now + 5 min`; varias pujas tardías seguidas → se sigue extendiendo.

## Decisiones / alternativas
- **Extender a `now + 5 min` vs. sumar 5 min al `endsAt`:** poner el cierre a `now + 5 min` da
  siempre una ventana de reacción constante; sumar al `endsAt` podría dejar ventanas raras si
  varias pujas caen juntas. Se elige `now + 5 min`.
- **Extensión en la transacción de la puja vs. proceso aparte:** en la misma transacción para
  que puja aceptada y cierre extendido sean atómicos; un proceso aparte podría desincronizarse.
- **Umbral configurable vs. fijo en código:** configurable para poder ajustarlo sin tocar la
  lógica, y para testear con valores pequeños.

## Conceptos que probablemente convenga repasar
- Por qué la extensión debe ir **en la misma transacción** que la puja (atomicidad).
- Sincronizar **relojes cliente/servidor**: el front cuenta atrás, pero la verdad del `endsAt`
  está en el servidor.

## Hecho cuando
- Una puja válida dentro de la ventana de 5 min mueve `endsAt` a `now + 5 min`.
- El nuevo cierre se propaga a todos los clientes por WebSocket.
- Hay tests que cubren extender / no extender / extensiones encadenadas.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
