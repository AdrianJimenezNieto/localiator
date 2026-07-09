# 09 · Sesión: refresh token en cookie + access token corto

**Checkbox del roadmap:** «Sesión con refresh token en cookie HttpOnly/Secure/SameSite +
access token corto».

## Objetivo
Emitir y validar sesiones tras un login correcto (local `07` o Google `08`) con el patrón
decidido en `CLAUDE.md`: **access token de vida corta en memoria** + **refresh token de vida
larga en cookie `HttpOnly`**. La renovación deslizante (caducidad por inactividad) se detalla
en `10-sliding-expiration.md`; aquí se monta la mecánica base de tokens.

## Qué se toca
- `apps/api/src/auth/` — emisión/rotación de tokens, guard de access token.
- `apps/api/prisma/schema.prisma` — modelo `RefreshToken` (o `Session`).
- `apps/api/src/main.ts` — `cookie-parser` y CORS con credenciales.
- `.env`: `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`.

## Cómo implementarlo
1. **Access token (JWT corto).** Firmado (`@nestjs/jwt`), TTL ~15 min, con `sub` (userId) y
   `role`. Se devuelve en el **body** de login/refresh; el frontend lo guarda **en memoria**
   (no en localStorage → menos superficie XSS). Vida corta = daño limitado si se filtra.
2. **Refresh token (opaco, en BD).** Token aleatorio de alta entropía; guardar en BD **solo
   su hash**, con `userId`, `expiresAt` y metadatos (userAgent/ip opcional). Se entrega al
   cliente en una **cookie**:
   - `HttpOnly` (JS no lo lee → protege de XSS),
   - `Secure` (solo HTTPS),
   - `SameSite=Lax` o `Strict` (protege de CSRF; ver nota CSRF abajo),
   - `Path=/auth/refresh` para minimizar dónde se envía,
   - `Max-Age` = TTL del refresh.
3. **Endpoint `POST /auth/refresh`.** Lee la cookie, hashea el token, lo busca en BD no
   expirado, y **rota**: invalida el refresh usado y emite uno nuevo (rotación de refresh
   tokens) + nuevo access token. Rotar permite detectar reutilización de un token robado.
4. **Endpoint `POST /auth/logout`.** Invalida el refresh actual en BD y limpia la cookie.
5. **Guard de access token.** Guard/estrategia JWT que protege rutas y expone `req.user`.
   Base para el RBAC del `12`.
6. **CORS + cookies:** frontend y API en orígenes distintos → CORS con
   `credentials: true` y origen explícito; el fetch del front con `credentials: 'include'`.
7. **Nota CSRF:** con refresh en cookie, valorar defensa CSRF (SameSite ya cubre mucho; si
   se relaja, añadir token anti-CSRF). Se cierra en la revisión de seguridad de Fase 5, pero
   dejar `SameSite` estricto desde ya.

## Decisiones / alternativas
- **Access en memoria + refresh en cookie HttpOnly** (decidido en `CLAUDE.md`) vs. todo en
  localStorage: el patrón elegido minimiza XSS (token de larga vida no accesible por JS) y
  CSRF (SameSite). Es más código pero es el estándar seguro.
- **Refresh opaco en BD** vs. refresh como JWT autocontenido: guardarlo en BD permite
  **revocar** sesiones (logout real, ban) y detectar reutilización; un JWT puro no se puede
  invalidar antes de que expire.
- **Rotación de refresh tokens:** detecta robo (si llega un token ya usado, se invalida toda
  la cadena). Alternativa (refresh fijo) es más simple pero menos segura.

## Conceptos a repasar (para tus notas)
- JWT: firma, claims, por qué vida corta.
- Atributos de cookie `HttpOnly`/`Secure`/`SameSite` y qué ataque frena cada uno.
- Rotación y revocación de refresh tokens; detección de reutilización.
- Por qué el access token en memoria y no en localStorage.

## Hecho cuando
- Login emite access (body) + refresh (cookie HttpOnly/Secure/SameSite).
- `/auth/refresh` rota el refresh y renueva el access; `/auth/logout` revoca.
- Rutas protegidas por el guard JWT exponen el usuario autenticado.

## Al terminar (automatización)
Cuando esta tarea cumpla todos los criterios de «Hecho cuando»:
1. Marcar `[x]` el checkbox correspondiente en `ROADMAP.md`.
2. Hacer commit con mensaje semántico (Conventional Commits), incluyendo el cambio
   de `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
