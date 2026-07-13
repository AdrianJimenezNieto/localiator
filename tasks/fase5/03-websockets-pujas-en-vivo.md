# 03 · WebSockets para pujas en vivo (Gateway NestJS + Socket.IO)

**Checkbox del roadmap:** «WebSockets (Gateway NestJS + Socket.IO) para pujas en vivo».

## Objetivo
Que los pujadores vean las pujas **en tiempo real** sin recargar: cuando alguien puja, todos
los que miran esa subasta reciben el nuevo precio y la nueva puja máxima al instante. Se apoya
en las reglas de puja de la tarea 02, ahora expuestas también por WebSocket. La concurrencia
dura (dos pujas casi a la vez) es la tarea 04; aquí montamos el canal en vivo.

## Qué se toca
- `apps/api/src/auctions/auctions.gateway.ts` — nuevo Gateway de Socket.IO.
- `apps/api/src/auctions/auctions.service.ts` — emitir eventos tras registrar una puja.
- `apps/web/src/` — hook/cliente Socket.IO para suscribirse a una subasta y pintar pujas.

## Cómo implementarlo
1. **Gateway** con `@WebSocketGateway` (namespace `/auctions`). Cada subasta es una **room**
   (`auction:<id>`); el cliente se une con un evento `join` al abrir la ficha de la subasta.
2. **Autenticación del socket**: reutilizar el JWT de acceso (el mismo del auth HTTP) en el
   handshake; sin token válido no se puja (sí se puede mirar, coherente con el rol invitado).
3. **Flujo de puja por WS**: evento `bid` → el gateway delega en `auctions.service` (la MISMA
   regla de la tarea 02, no duplicar validación) → si es válida, **broadcast** a la room de un
   evento `bid:accepted` con `{ amountCents, userMasked, endsAt }`; al emisor, confirmación o
   `bid:rejected` con motivo.
4. **No exponer identidad completa** de los pujadores: enviar un alias/máscara, no email ni
   nombre, por privacidad (RGPD, `CLAUDE.md`).
5. **Rate limiting** también en el canal WS (puntos sensibles, `CLAUDE.md`): limitar pujas por
   socket/usuario para no permitir floods.
6. **Front**: hook que se suscribe a `auction:<id>`, mantiene el estado del precio y lista de
   pujas, y envía pujas. Reconexión automática si se cae el socket.

## Decisiones / alternativas
- **Socket.IO vs. WebSocket puro:** Socket.IO ya está decidido en `CLAUDE.md` (rooms,
  reconexión y fallback listos de fábrica; menos que reimplementar).
- **Una room por subasta vs. un canal global:** rooms para no mandar a cada cliente pujas de
  subastas que no mira; escala mejor y es más simple de razonar.
- **Reutilizar el servicio de la tarea 02 vs. lógica propia en el gateway:** reutilizar, para
  que HTTP y WS compartan exactamente la misma validación y no diverjan.

## Conceptos que probablemente convenga repasar
- **Gateways y rooms de Socket.IO en NestJS** (`@WebSocketGateway`, `@SubscribeMessage`).
- **Autenticar el handshake de un WebSocket** con JWT (distinto del guard HTTP).
- Ciclo de **reconexión** y estado en el cliente Socket.IO.

## Hecho cuando
- Al pujar, todos los clientes suscritos a esa subasta ven el nuevo precio en tiempo real.
- El socket exige JWT para pujar; los invitados pueden mirar pero no pujar.
- Las pujas emiten identidad enmascarada y hay rate limiting en el canal.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...` / `feat(web): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
