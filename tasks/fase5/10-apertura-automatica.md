# 10 · Apertura automática de subastas (`SCHEDULED → LIVE`)

**Checkbox del roadmap:** «Apertura automática de subastas (`SCHEDULED` → `LIVE`)».

**Reparto:** lo pica **Adrián** (lógica de ciclo de vida).

## Objetivo
Que una subasta programada **abra sola** al llegar su `startsAt`. Hoy `SCHEDULED` es el estado
por defecto (`schema.prisma:463`) pero **ningún código lo transiciona a `LIVE`**: el
`auctions.closer.service.ts` solo cubre `LIVE → CLOSED`, el aviso de cierre próximo y el
impago. El agujero está tapado por accidente porque la única subasta existente es la del seed,
que se crea ya `LIVE` a mano (`seed.ts:198`). Sin esta tarea, cualquier subasta creada desde el
admin (tarea 11) se quedaría dormida para siempre y sus pujas se rechazarían con
`AUCTION_CLOSED`.

Va **primera** de la Fase 5 restante porque sin ella las tareas 11–14 no se pueden probar de
verdad de punta a punta.

## Qué se toca
- `apps/api/src/auctions/auctions.closer.service.ts` — pasa a ser el servicio de **ciclo de
  vida** de la subasta (abre y cierra), no solo de cierre. Renombrar a
  `auctions.lifecycle.service.ts` y actualizar `auctions.module.ts`.
- `apps/api/src/auctions/auctions.service.ts` — el método de apertura, si la lógica vive en el
  servicio y el cron solo la dispara (mismo patrón que el cierre).
- `apps/api/src/auctions/auctions.service.spec.ts` — tests.

## Cómo implementarlo
1. **Cron `EVERY_MINUTE`** gemelo del cierre, en el mismo servicio de ciclo de vida: busca
   subastas con `status: SCHEDULED` y `startsAt <= now` y las pone `LIVE`.
2. **Actualización condicional, no leer-y-escribir**: el `UPDATE` debe filtrar por
   `status: SCHEDULED` en el propio `where`, para que si dos instancias del job corren a la vez
   solo una abra la subasta. Mismo criterio de concurrencia que la tarea 04.
3. **Respetar `endsAt`**: si una subasta `SCHEDULED` tiene el `startsAt` pasado **y** el
   `endsAt` también (por ejemplo, estuvo la API caída), no abrirla para cerrarla al minuto
   siguiente: cerrarla directamente como desierta. Decidir y documentar este caso borde.
4. **Emitir por WS** el nuevo estado a la room de la subasta si hay alguien mirando, reutilizando
   el gateway (tarea 03), igual que hace el cierre.
5. **Tests**: `SCHEDULED` con `startsAt` pasado → `LIVE`; `SCHEDULED` con `startsAt` futuro →
   intacta; `SCHEDULED` con ambas fechas pasadas → cerrada sin pasar por `LIVE`; una subasta ya
   `LIVE` no se toca.
6. **Seed**: dejar la subasta del seed como está (nace `LIVE`, útil para probar pujas ya) pero
   **añadir una segunda `SCHEDULED`** con `startsAt` a pocos minutos, para ver abrir el cron.

## Decisiones / alternativas
- **Cron vs. calcular `LIVE` al leer:** cron. Es simétrico con el cierre que ya existe, deja el
  estado real en la BD y no obliga a tocar `placeBid` ni el gateway, que ya leen `status` de la
  BD. La alternativa perezosa (derivar el estado de `startsAt`/`endsAt` en cada lectura) ahorra
  el job, pero obliga a repetir el cálculo en cada sitio que mire `status` y basta con que uno
  se desincronice para tener dos verdades. Coste aceptado: una subasta puede abrir hasta un
  minuto tarde, irrelevante para este negocio.
- **Servicio de ciclo de vida vs. servicio de apertura aparte:** reutilizar el de cierre. Abrir
  y cerrar son la misma preocupación (mover el estado según el reloj) y comparten cron, gateway
  y criterio de concurrencia; separarlos duplicaría el andamiaje sin ganar nada.
- **Cerrar directamente la subasta caducada sin abrirla vs. abrir y dejar que el cierre la
  cierre:** cerrarla directa. Abrirla un minuto sería mentirle a quien la mire y permitiría
  pujas en una subasta que ya debía estar cerrada.

## Hecho cuando
- Una subasta `SCHEDULED` con `startsAt` pasado aparece `LIVE` en menos de un minuto y acepta
  pujas.
- Una `SCHEDULED` cuyo `endsAt` ya pasó termina `CLOSED` sin haber aceptado pujas.
- Hay tests de los cuatro casos y el seed trae una subasta programada para verlo en vivo.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
