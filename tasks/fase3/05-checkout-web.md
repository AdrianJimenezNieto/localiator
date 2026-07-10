# 05 · Flujo de checkout (web)

**Checkbox del roadmap:** parte de «Carrito de compra» / «Integración de pago con Stripe»
(la mitad de frontend del pago).

## Objetivo
Conectar el carrito (tarea 02) con el pago: crear el pedido en el servidor (tarea 03),
lanzar el pago de Stripe (tarea 04) y mostrar al cliente el resultado.

## Qué se toca
- `apps/web/src/pages/CheckoutPage.tsx` — nuevo: resumen final + botón de pago.
- `apps/web/src/pages/CheckoutResultPage.tsx` — retorno de Stripe (éxito / cancelado).
- `apps/web/src/lib/api.ts` — llamadas a `POST /orders` y `POST /orders/:id/pay`.
- `apps/web/src/App.tsx` — rutas `/checkout` y `/checkout/resultado`.

## Cómo implementarlo
1. **Al entrar en `/checkout`:** llamar a `POST /orders` con las líneas del carrito. El
   servidor devuelve el pedido con total real y `expiresAt`. Mostrar un **contador de
   expiración** de la reserva para que el cliente sepa que tiene tiempo limitado.
2. **Botón «Pagar»:** llamar a `POST /orders/:id/pay` y **redirigir a la `url` de la Checkout
   Session** de Stripe (`window.location = url`). Decidido en la tarea 04: página de pago
   alojada por Stripe, sin formulario de tarjeta propio.
3. **`success_url` / `cancel_url`** apuntan a `/checkout/resultado`. Al volver:
   - Éxito: mostrar «pago recibido, pedido en preparación» y **vaciar el carrito**. Ojo: la
     confirmación real del pedido la da el **webhook** (tarea 06), no esta pantalla; el front
     solo refleja el retorno del usuario.
   - Cancelado: volver al carrito con el pedido aún `PENDING` hasta que expire.
4. **Manejo de errores:** si `POST /orders` devuelve `409` (sin stock) o la reserva expiró,
   avisar y devolver al carrito para revisarlo.
5. **Gating:** exigir sesión iniciada y email verificado antes del checkout; si no, mandar a
   login/registro conservando el carrito.

## Decisiones / alternativas
- **Vaciar carrito en el retorno de éxito vs. esperar al webhook:** se vacía en el retorno por
  UX (el usuario ya pagó), pero la **verdad del pedido** es el webhook. No se marca nada como
  pagado desde el front. Esto evita depender de que el usuario vuelva a la web.
- **Redirect a Checkout (decidido):** página alojada por Stripe; sin formulario de tarjeta
  propio ni superficie PCI en la web. Coherente con la tarea 04.

## Hecho cuando
- Desde el carrito se crea el pedido, se paga en Stripe (test) y se vuelve a una pantalla de
  resultado clara.
- Sin stock / reserva expirada se comunica y se puede corregir el carrito.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar el checkbox correspondiente en `ROADMAP.md` en el **mismo commit** (si ya se marcó
   en 02/04, no re-marcar; el commit refleja el avance).
2. Commit semántico (`feat(web): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.

> Prueba de punta a punta con tarjetas de test de Stripe: ver `tasks/manual.md`.
