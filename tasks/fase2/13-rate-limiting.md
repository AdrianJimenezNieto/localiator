# 13 · Rate limiting global + endpoints sensibles

**Checkbox del roadmap:** «Rate limiting global + endpoints sensibles (login, registro,
recuperación)».

## Objetivo
Limitar la frecuencia de peticiones para frenar fuerza bruta, abuso y bots, como exige
`CLAUDE.md` (protección innegociable). Un límite general para toda la API y límites más
estrictos en los puntos sensibles de auth.

## Qué se toca
- `apps/api/src/app.module.ts` — configuración de `@nestjs/throttler`.
- Controladores de `auth/` — límites específicos por endpoint.
- `main.ts` — asegurar `trust proxy` para leer la IP real tras Nginx Proxy Manager.

## Cómo implementarlo
1. **Librería:** `@nestjs/throttler` (oficial NestJS). Registrar `ThrottlerModule` con un
   límite global razonable (p. ej. 100 req/min por IP) y su `ThrottlerGuard` como guard
   global.
2. **Límites estrictos por endpoint** con `@Throttle({...})`:
   - `POST /auth/login`: pocos intentos por minuto (p. ej. 5/min por IP).
   - `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password`,
     `POST /auth/verify-email`: límites bajos similares.
   Estos endpoints son los objetivos típicos de fuerza bruta / spam.
3. **IP real tras el proxy.** En producción la API va detrás de Nginx Proxy Manager; sin
   `trust proxy` todas las peticiones parecerían venir de la IP del proxy y el límite sería
   inútil o bloquearía a todos. Configurar Express `trust proxy` para usar
   `X-Forwarded-For`.
4. **Almacenamiento del contador.** Por defecto es en memoria (por instancia). Para el MVP
   (una sola instancia en el VPS) vale. Anotar que si hay varias instancias haría falta un
   store compartido (Redis); no es prioridad ahora.
5. **Combinar con otras defensas.** El rate limiting va de la mano de Turnstile + honeypot
   (`14`) y del hashing/respuestas neutras (`07`). Son capas complementarias, no
   sustitutivas.
6. **Respuesta:** `429 Too Many Requests`. Cuidar que el frontend lo muestre de forma
   amable.

## Decisiones / alternativas
- **`@nestjs/throttler`** vs. rate limiting en Nginx: hacerlo en la app permite límites por
  endpoint y por usuario, no solo por IP. Nginx podría añadir una capa extra en Fase 5.
- **Store en memoria** (MVP, una instancia) vs. Redis: memoria es suficiente ahora; Redis se
  valora si se escala horizontalmente.
- **Límite por IP** como base: simple y efectivo; combinar con Turnstile mitiga IPs
  rotativas.

## Conceptos a repasar (para tus notas)
- `@nestjs/throttler`, `ThrottlerGuard` y `@Throttle`.
- `trust proxy` y `X-Forwarded-For`: por qué importan detrás de un reverse proxy.
- Rate limiting como una capa entre varias (defensa en profundidad).

## Hecho cuando
- Hay límite global y límites estrictos en los endpoints de auth (login, registro,
  recuperación).
- La IP real se lee correctamente detrás del proxy.
- Superar el límite devuelve `429` y el front lo maneja.
