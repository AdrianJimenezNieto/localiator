# 12 · Listado público de subastas (API)

**Checkbox del roadmap:** «Listado público de subastas (API)».

**Reparto:** el **servicio de listado** lo pica **Adrián**; el DTO y el cableado del
controlador, **Claude**.

## Objetivo
Exponer una **lectura pública y paginada** de las subastas para que un invitado pueda
descubrirlas sin cuenta. Hoy los únicos `findMany` sobre `Auction` son internos (el cron de
cierre y el aviso de «a punto de cerrar»), así que la única forma de llegar a una subasta es
escribir `/subastas/:id` con el cuid exacto.

## Qué se toca
- `apps/api/src/auctions/auctions.controller.ts` — añadir las rutas públicas.
- `apps/api/src/auctions/dto/list-auctions.dto.ts` (nuevo) — a imagen de
  `catalog/dto/list-catalog.dto.ts`.
- `apps/api/src/auctions/auctions.service.ts` — el listado y su enriquecido.
- `apps/api/src/auctions/auctions.service.spec.ts` — tests.

## Cómo implementarlo
1. **`GET /auctions`** y **`GET /auctions/:id`** con `@Public()`. El controlador tiene
   `@Roles(BUYER, ADMIN)` a nivel de clase, así que hace falta `@Public()` **por ruta** para
   sobreescribirlo; verificar que la ruta responde sin token (es el tipo de cosa que se da por
   hecha y falla en producción).
2. **Filtro por estado**: por defecto devolver solo `LIVE` y `SCHEDULED` (lo que se puede pujar
   o se va a poder). Las `CLOSED` recientes son interesantes pero decide si entran por defecto o
   solo bajo filtro explícito.
3. **Paginación** con el mismo patrón que el catálogo (`catalog.service.ts:126-159`): `page`,
   `pageSize`, y `findMany` + `count` **en la misma transacción**, para que el `total` sea
   coherente con las filas (misma razón que allí).
4. **Precio actual**: la puja máxima de cada subasta, o el precio de salida si no hay pujas. Ojo
   con el **N+1**: no lances una consulta de puja máxima por fila. El índice
   `[auctionId, amountCents]` de la tarea 01 existe justo para esto.
5. **Enriquecer con el artículo**: `itemType`/`itemId` es polimórfico y **no hay FK**, así que
   Prisma no puede hacer el `include`. Hay que resolver a mano los `Product` y los `Lot` del
   lote de resultados (agrupando por tipo, no uno a uno) para devolver nombre y foto.
6. **No filtrar datos de más**: reutilizar el enmascarado de `auctions.mask.ts` (tarea 03) para
   cualquier dato de pujador. Un listado público **no** puede devolver emails ni ids de usuario.
7. **Tests**: la paginación cuadra con el total; una subasta sin pujas muestra el precio de
   salida; una con pujas muestra la máxima; no aparecen datos de usuario sin enmascarar; la ruta
   responde sin autenticar.

## Decisiones / alternativas
- **Rutas en el módulo de subastas vs. en `catalog.controller.ts`:** en subastas. El patrón del
  proyecto es que `catalog.controller.ts` sea la fachada pública, pero meter subastas dentro del
  catálogo obligaría al módulo de catálogo a conocer pujas y estados de subasta. Mantener las
  subastas autocontenidas y marcar la ruta `@Public()` conserva la cohesión del módulo.
- **Calcular el precio actual al vuelo vs. desnormalizarlo en `Auction`:** al vuelo, con el
  índice. Desnormalizar una columna `currentPriceCents` sería más rápido de leer, pero es otro
  dato que mantener sincronizado en el camino caliente de la puja (tarea 04), justo donde ya
  peleamos con la concurrencia. Si el listado se queda corto de rendimiento, se desnormaliza
  después sin romper la API.
- **Devolver `CLOSED` por defecto vs. solo bajo filtro:** decidir aquí. Enseñar subastas
  cerradas da prueba social y contenido para SEO; ensuciar el listado con cosas que no se pueden
  pujar confunde.

## Hecho cuando
- `GET /auctions` responde **sin token**, paginado, con precio actual y datos del artículo.
- No hay N+1 ni por la puja máxima ni por el artículo.
- Ningún dato de pujador sale sin enmascarar.
- Hay tests del listado, la paginación y el acceso anónimo.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
