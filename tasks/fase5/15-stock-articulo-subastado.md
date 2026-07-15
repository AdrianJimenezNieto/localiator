# 15 · Stock del artículo subastado

**Checkbox del roadmap:** «Stock del artículo subastado (venta directa vs. subasta)».

**Reparto:** lo pica **Claude** (con la regla de negocio decidida por Adrián).

## Objetivo
Que el stock y las subastas **se hablen**. Hoy son dos mundos separados y eso permite vender
el mismo artículo dos veces.

## Regla de negocio (decidida por Adrián)
> Si alguien compra directamente un producto/lote que está en subasta, **que se lo quede**: se
> cancela la subasta y se le vende a quien ha pagado.

Es decir: **gana quien paga primero**, y la venta directa NO se bloquea mientras la subasta
está viva. Con un matiz: si el artículo tiene stock > 1, vender una unidad **no** mata la
subasta — todavía queda artículo. La subasta se cancela cuando el stock llega a **0**.

Excepción, decidida al ver la carrera: **cuando la subasta cierra con ganador**, el artículo
queda reservado durante su plazo de pago (48 h). Si no, un comprador directo y el ganador
podrían pagar a la vez y habría dos personas pagando por lo mismo, con reembolso manual — y
los reembolsos están fuera del MVP (`CLAUDE.md`). Si el ganador no paga, la reserva muere con
su plazo y el artículo vuelve al catálogo.

## Los tres agujeros que hay que tapar

1. **El pedido de subasta nunca descuenta stock** (`orders.service.ts`, rama `order.auctionId`
   de `confirmOrderPaid`). Decisión explícita de la tarea 09 («el ganador ya tenía el artículo
   asignado»), pero esa asignación no se refleja en el stock: un artículo subastado, ganado y
   **pagado sigue en el catálogo** y se puede volver a vender.
2. **`cancelPriorPending` cancela los pedidos de subasta.** Cancela TODOS los pedidos `PENDING`
   del usuario al entrar al checkout, y un pedido de subasta es `PENDING` durante 48 h. **Bug
   reproducido**: el ganador compra cualquier otra cosa → su pedido de subasta pasa a
   `CANCELLED` → a las 48 h el cron de impago lo **banea por no pagar** algo que el sistema le
   canceló solo. Ya está en `main`.
3. **Nada cancela la subasta al agotarse el stock**: es la regla nueva.

## Qué se toca
- `apps/api/src/orders/orders.service.ts` — `createAuctionOrder`, `confirmOrderPaid`,
  `cancelPriorPending`, `releaseExpiredReservations`.
- `apps/api/src/auctions/auctions.service.ts` — cancelar por stock agotado; borrar la reserva
  del moroso en `handleUnpaidWinner`.
- Specs de ambos.

## Cómo implementarlo
1. **`cancelPriorPending`: excluir los pedidos de subasta** (`auctionId: null`). Su intención
   es «no acaparar stock reentrando al checkout», y un pedido de subasta no es eso. Arregla el
   bug 2.
2. **`createAuctionOrder`: crear la reserva del ganador**, cantidad 1, `expiresAt` = su
   `paymentDueAt` (48 h, no el TTL de 15 min de la venta directa). Y al cancelar el pedido
   `PENDING` anterior (el del moroso), **borrar sus reservas**: `liveReservedQuantity` cuenta
   por `expiresAt` y **no mira el estado del pedido**, así que una reserva huérfana bloquearía
   el stock 48 h. Hoy no pasa porque los pedidos de subasta no tienen reserva; en cuanto la
   tengan, sí.
3. **`confirmOrderPaid`: que el pedido de subasta descuente stock** y consuma su reserva, como
   una venta directa. Arregla el bug 1.
4. **`confirmOrderPaid` (venta directa): si el stock llega a 0**, cancelar las subastas
   `LIVE`/`SCHEDULED` de ese artículo. Es la regla nueva. Las `CLOSED` no pueden aparecer aquí:
   su reserva impide que un comprador directo se lleve la última unidad.
5. **`releaseExpiredReservations`: excluir los pedidos de subasta.** El ciclo de vida del
   pedido del ganador lo gobierna `handleUnpaidWinner` (banea + segunda oportunidad); dos
   dueños para lo mismo es pedir una carrera.
6. **Avisar a los pujadores** de que la subasta se canceló: ya se emite `auction:closed` por
   WS; sumar el email, que es el canal fiable (llevan días pujando y se quedan sin nada).
7. **Tests**: venta directa que agota stock → subasta cancelada; con stock > 1 → subasta
   intacta; ganador paga → stock descontado; el ganador compra otra cosa → su pedido de subasta
   sobrevive; impago → reserva liberada y artículo de vuelta.

## Decisiones / alternativas
- **Cancelar al llegar a 0 vs. a la primera venta directa:** al llegar a 0. Con stock 5,
  vender 1 y matar la subasta sería absurdo: quedan 4 artículos que entregar.
- **Reservar al cerrar vs. dejar que gane quien pague también con la subasta cerrada:**
  reservar. La alternativa es más literal a la regla, pero abre una carrera real de doble pago
  cuyo arreglo es un reembolso manual, y los reembolsos están fuera del MVP.
- **Reservar desde que la subasta se crea (retirarlo de la venta directa):** descartado
  explícitamente por Adrián. Contradice la regla: mientras la subasta vive, se puede comprar.

## Hecho cuando
- Comprar el último de un artículo subastado cancela su subasta y avisa a los pujadores.
- Un artículo con stock > 1 mantiene su subasta al vender una unidad.
- El ganador que paga descuenta stock; el artículo desaparece del catálogo.
- El ganador puede comprar otras cosas sin perder su pedido de subasta.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`fix(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
