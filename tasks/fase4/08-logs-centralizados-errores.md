# 08 · Logs centralizados + trazabilidad de errores

**Checkbox del roadmap:** «Logs centralizados + trazabilidad de errores en producción».

## Objetivo
Poder **ver qué pasa en producción**: logs estructurados de la API, captura centralizada de
errores con contexto (traza, usuario, request-id) y trazabilidad end-to-end. Es lo que
permitirá diagnosticar incidentes tras el lanzamiento (tarea 12).

## Qué se toca
- `apps/api/src/main.ts` — logger estructurado (p. ej. `nestjs-pino`).
- `apps/api/src/` — `ExceptionFilter` global para normalizar y registrar errores.
- Middleware de **request-id** para correlacionar logs de una misma petición.
- Config de despliegue (tarea 09) — recogida/rotación de logs de los contenedores.

## Cómo implementarlo
1. **Logs estructurados (JSON):** sustituir el logger por defecto por uno estructurado
   (`pino`) con nivel configurable por `.env`. JSON facilita filtrar/buscar después.
2. **Request-id:** middleware que asigna un id por petición y lo incluye en cada log, para
   seguir una request de principio a fin.
3. **Filtro global de excepciones:** capturar errores no controlados, loguearlos con traza y
   contexto (ruta, usuario si lo hay) y devolver al cliente un mensaje **genérico** (no filtrar
   detalles internos — encaja con la tarea 05).
4. **No loguear datos sensibles:** redactar tokens, contraseñas, datos de tarjeta (que no
   tocamos, PCI en Stripe) y PII innecesaria.
5. **Centralización:** para el MVP, empezar por logs a `stdout` recogidos por Docker con
   rotación; dejar la puerta abierta a un colector gratuito/self-hosted (p. ej. Loki) sin
   añadir SaaS de pago (`CLAUDE.md`).
6. **Trazabilidad de errores:** valorar Sentry en su plan gratuito o una alternativa
   self-hosted; si no, el filtro global + logs estructurados cubren el mínimo.

## Decisiones / alternativas
- **`pino` vs. logger por defecto de Nest:** `pino` es rápido y estructurado; el de Nest es
  texto plano y peor para buscar en producción.
- **Stack de logs self-hosted vs. SaaS:** self-hosted/`stdout`+Docker por el principio de
  coste mínimo; un SaaS de pago queda descartado salvo plan gratuito suficiente.
- **Mensaje de error genérico al cliente vs. detallado:** genérico por seguridad; el detalle
  vive en los logs del servidor.

## Conceptos que probablemente convenga repasar
- **`ExceptionFilter` global de NestJS** y el ciclo de vida de una request (interceptors,
  filters).
- **Correlación por request-id** en logs.

## Hecho cuando
- La API emite logs estructurados con request-id; hay filtro global de excepciones que
  registra errores con contexto sin filtrar datos internos al cliente.
- Los logs se recogen con rotación en el despliegue y no contienen datos sensibles.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...` / `chore(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
