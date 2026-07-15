# 11 · CRUD de subastas en la API (solo admin)

**Checkbox del roadmap:** «CRUD de subastas (solo admin)».

**Reparto:** las **validaciones del servicio** las pica **Adrián**; el boilerplate (DTOs,
cableado del controlador) lo pica **Claude**.

## Objetivo
Que un administrador pueda **crear, listar, editar y cancelar** subastas desde la API. Hoy no
existe ninguna vía de alta: `auctions.controller.ts` expone una única ruta
(`POST /auctions/:id/bids`) y las subastas solo nacen del seed o metiendo filas a mano en la BD.
Es el hueco que deja la Fase 5 con motor pero sin producto.

## Qué se toca
- `apps/api/src/auctions/auctions.admin.controller.ts` (nuevo) — controlador de admin, separado
  del de pujas, siguiendo el patrón del catálogo (`product.controller.ts` es admin,
  `catalog.controller.ts` es público).
- `apps/api/src/auctions/dto/create-auction.dto.ts`, `update-auction.dto.ts` (nuevos).
- `apps/api/src/auctions/auctions.service.ts` — reglas de alta y de transición.
- `apps/api/src/auctions/auctions.module.ts` — registrar el controlador.
- `apps/api/src/auctions/auctions.service.spec.ts` — tests.

## Cómo implementarlo
1. **Rutas** en `@Controller('auctions')` con `@Roles(Role.ADMIN)` a nivel de clase:
   `POST /` (crear), `GET /` (listar con estado), `GET /:id`, `PATCH /:id`,
   `POST /:id/cancel`. Ojo: no colisionar con el `POST /auctions/:id/bids` existente, que es de
   `BUYER`/`ADMIN` y vive en el otro controlador.
2. **DTO (forma)**: `itemType` (enum `OrderItemType`), `itemId`, `startingPriceCents` y
   `minIncrementCents` enteros positivos acotados, `startsAt`/`endsAt` fechas ISO. Nada de
   reglas de negocio aquí (mismo criterio que la tarea 02).
3. **Validaciones de negocio (en el servicio)** — el núcleo de esta tarea:
   - **El artículo existe**: `itemType`/`itemId` es polimórfico y Prisma **no** fuerza la
     integridad (ver tarea 01), así que hay que comprobar a mano que el `Product` o `Lot`
     existe. Si no → `400`/`404` con motivo claro.
   - **`startsAt < endsAt`**, y `endsAt` en el futuro al crear.
   - **No dos subastas activas sobre el mismo artículo**: rechazar si ya hay una `SCHEDULED` o
     `LIVE` con ese `itemType`/`itemId` (el índice `[itemType, itemId]` de la tarea 01 ayuda).
     Decidir qué pasa con el **stock** del artículo mientras está subastado.
   - **Transiciones legales**: qué se puede editar y cuándo. Una `SCHEDULED` es editable entera;
     una `LIVE` **con pujas** no puede cambiar de precio de salida ni de incremento (cambiaría
     las reglas a mitad de partida) y como mucho admite alargar `endsAt`; una `CLOSED`/`PAID` no
     se toca.
   - **Cancelar**: una `SCHEDULED` se cancela sin más; una `LIVE` **con pujas** es delicada
     (hay gente con pujas puestas) — cancelarla debe avisar por WS a la room y quedar registrada.
     Una `CLOSED` con ganador y pedido ya no se cancela por aquí (eso es el flujo de impago,
     tarea 07).
4. **Errores claros** con motivo, al estilo de la tarea 02 (`ITEM_NOT_FOUND`,
   `AUCTION_ALREADY_ACTIVE`, `INVALID_TRANSITION`…).
5. **Tests unitarios**: alta sobre artículo inexistente → rechazada; alta sobre artículo con
   subasta viva → rechazada; `startsAt >= endsAt` → rechazada; editar precio de salida de una
   `LIVE` con pujas → rechazada; cancelar `SCHEDULED` → OK.

## Decisiones / alternativas
- **Controlador de admin aparte vs. meter las rutas en `auctions.controller.ts`:** aparte. El
  controlador actual tiene `@Roles(BUYER, ADMIN)` a nivel de clase y mezclar admin ahí obligaría
  a poner el rol ruta por ruta, que es justo la forma de acabar publicando una ruta de admin por
  despiste. El catálogo ya separa admin y público en controladores distintos.
- **Bloquear el stock del artículo subastado vs. no:** decidir en esta tarea. Si un artículo se
  puede subastar y a la vez vender por el carrito, se puede acabar con un ganador sin artículo.
  Lo más simple y coherente con la Fase 3 es que subastar un artículo lo retire de la venta
  directa mientras la subasta viva.
- **Editar una `LIVE` con pujas vs. congelarla:** congelar precio de salida e incremento. Las
  pujas existentes se hicieron bajo unas reglas y cambiarlas a posteriori las invalida.

## Hecho cuando
- Un admin crea, lista, edita y cancela subastas por la API, y un no-admin recibe `403`.
- Las validaciones rechazan artículo inexistente, fechas incoherentes, subasta duplicada sobre
  el mismo artículo y ediciones ilegales según el estado, con motivos claros.
- Hay tests unitarios de los casos límite.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
