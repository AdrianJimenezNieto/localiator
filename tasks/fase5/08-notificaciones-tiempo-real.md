# 08 · Notificaciones en tiempo real (superado, ganado, a punto de cerrar)

**Checkbox del roadmap:** «Notificaciones en tiempo real (superado, ganado, a punto de
cerrar)».

## Objetivo
Avisar a cada pujador de lo que le importa: **te han superado**, **has ganado**, y **la subasta
está a punto de cerrar**. Combina el canal WebSocket (tarea 03) para lo instantáneo con el email
transaccional (Resend, ya usado en pedidos) para lo que debe llegar aunque el usuario no esté
conectado.

## Qué se toca
- `apps/api/src/auctions/auctions.gateway.ts` — eventos dirigidos por usuario.
- `apps/api/src/auctions/auctions.service.ts` — disparar notificaciones en los puntos clave.
- `apps/api/src/notifications/` o el módulo de email existente — plantillas Resend de subastas.

## Cómo implementarlo
1. **Superado (`outbid`)**: cuando una puja nueva desbanca al anterior líder (tarea 04),
   notificar **solo a ese usuario** — por WS si está conectado a la room, y por email como
   respaldo. No hace falta email en cada puja: basta cuando pierde el liderato.
2. **A punto de cerrar (`ending-soon`)**: un job avisa a los pujadores de una subasta `LIVE`
   cuando quedan p. ej. 5 min de `endsAt` (respetando extensiones, tarea 05). Evitar duplicados
   si el antisniping mueve el cierre (marcar «ya avisado» y reevaluar).
3. **Ganado / no ganado**: enganchado al cierre (tarea 06) y a la segunda oportunidad (tarea
   07): al ganador, instrucciones de pago (enlaza con tarea 09); a los demás, aviso opcional.
4. **Notificación por usuario, no por room**: usar rooms por usuario (`user:<id>`) o un mapa de
   sockets para dirigir eventos personales, además de la room de la subasta.
5. **Preferencias/RGPD**: emails transaccionales de una subasta en la que participas son
   legítimos; aun así, no spamear (agrupar, respetar el mínimo necesario).
6. **Tests**: superar a alguien dispara su `outbid` una vez; cierre dispara `won` al ganador;
   el aviso de «a punto de cerrar» no se duplica al extenderse el cierre.

## Decisiones / alternativas
- **WS + email vs. solo WS:** solo WS se pierde si el usuario cerró la pestaña; el email
  garantiza entrega de lo importante (superado, ganado). El SMS/push queda en backlog
  (`ROADMAP.md`).
- **Notificar cada puja vs. solo al perder el liderato:** solo al perder liderato reduce ruido y
  emails; enterarse de cada puja intermedia no aporta al que ya no es líder.
- **Rooms por usuario vs. broadcast filtrado en cliente:** dirigir en el servidor
  (`user:<id>`) evita mandar datos personales a quien no le tocan.

## Conceptos que probablemente convenga repasar
- **Rooms por usuario** vs. rooms por subasta en Socket.IO (dirigir eventos personales).
- Evitar **duplicados** en el aviso «a punto de cerrar» cuando el antisniping mueve `endsAt`.
- Reutilizar el **módulo de email/Resend** ya montado en la Fase 3 para pedidos.

## Hecho cuando
- Al ser superado, el usuario recibe aviso (WS y/o email) una sola vez por pérdida de liderato.
- El ganador recibe «has ganado» con instrucciones de pago al cerrar.
- El aviso «a punto de cerrar» llega sin duplicarse pese a las extensiones.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
