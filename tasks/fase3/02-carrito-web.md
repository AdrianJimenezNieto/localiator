# 02 · Carrito de compra (web, en cliente)

**Checkbox del roadmap:** «Carrito de compra».

## Objetivo
Que el comprador pueda añadir productos/lotes a un carrito, ver el resumen y ajustar
cantidades, **sin persistir nada en el servidor todavía**. El carrito vive en el navegador;
el servidor solo interviene al hacer checkout (tarea 03).

## Qué se toca
- `apps/web/src/lib/cart.tsx` — contexto de carrito (estado + acciones) con persistencia en
  `localStorage`.
- `apps/web/src/components/` — botón «Añadir al carrito» en la ficha (`DetailPage.tsx`) y un
  indicador de carrito en la cabecera.
- `apps/web/src/pages/CartPage.tsx` — página de carrito con líneas, cantidades y total.
- `apps/web/src/App.tsx` — ruta `/carrito`.

## Cómo implementarlo
1. **Contexto `CartProvider`** con estado `{ items: CartItem[] }`, donde `CartItem` guarda
   `itemType`, `itemId`, `nameSnapshot`, `unitPriceCents`, `photo`, `quantity`. Acciones:
   `add`, `remove`, `setQuantity`, `clear`.
2. **Persistencia en `localStorage`** (leer al montar, escribir en cada cambio) para que el
   carrito sobreviva a recargas. Versionar la clave (`cart:v1`) por si cambia la forma.
3. **Cálculo de totales en cliente solo para mostrar.** El total «de verdad» lo recalcula el
   servidor en el checkout (tarea 03) a partir del precio actual de BD; nunca se confía en el
   precio que manda el cliente.
4. **UI**: botón añadir en la ficha, contador en cabecera, página `/carrito` con editar
   cantidad y eliminar línea, y botón «Tramitar pedido» que lleva al checkout (tarea 05).
5. **Validación ligera de stock en cliente** (informativa): avisar si la cantidad supera el
   stock mostrado, pero la comprobación fuerte es servidor en la reserva.

## Decisiones / alternativas
- **Carrito en cliente vs. en servidor:** cliente (localStorage) es más barato y simple, sin
  carritos huérfanos que limpiar en BD, y encaja con el principio de coste mínimo de
  `CLAUDE.md`. La contrapartida (no se sincroniza entre dispositivos) es asumible en el MVP;
  si hiciera falta, se migra a servidor sin romper la API de checkout.
- **Recalcular total en servidor:** imprescindible por seguridad; el precio del cliente es
  solo cosmético. Confiar en él permitiría manipular importes.

## Hecho cuando
- Se puede añadir/quitar/ajustar artículos y el carrito persiste al recargar.
- El carrito muestra un total coherente y enlaza al checkout.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(web): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
