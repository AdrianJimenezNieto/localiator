# 05 · Revisión de seguridad

**Checkbox del roadmap:** «Revisión de seguridad: CSRF, XSS, inyección, secretos, HTTPS,
cifrado en reposo».

## Objetivo
Pasada de **hardening** antes de abrir al público: revisar y cerrar los vectores comunes
(CSRF, XSS, inyección, gestión de secretos, HTTPS forzado, cifrado en reposo) sobre lo ya
construido en las Fases 1–3. No es una feature nueva sino una auditoría con arreglos
concretos; conviene apoyarse en el skill `/security-review` para el barrido inicial.

## Qué se toca
- `apps/api/src/main.ts` — `helmet`, CORS estricto, `ValidationPipe` global (whitelist), y
  la configuración de cookies de sesión.
- `apps/api/src/auth/` — protección CSRF para las rutas que usan cookie de sesión.
- `apps/api/package.json` — añadir `helmet` (hoy no está; sí `@nestjs/throttler` y
  `cookie-parser`).
- `.env.example` / gestión de secretos — verificar que nada sensible está commiteado.
- `docker-compose.yml` y config de Postgres — cifrado en reposo del volumen de datos.

## Cómo implementarlo
1. **Cabeceras de seguridad (XSS/clickjacking):** añadir `helmet` en `main.ts` (CSP, HSTS,
   `X-Content-Type-Options`, etc.). React ya escapa por defecto; revisar cualquier
   `dangerouslySetInnerHTML`.
2. **CSRF:** el refresh token vive en cookie `HttpOnly`/`SameSite` (Fase 1). Verificar que
   `SameSite=Strict`/`Lax` cubre el caso y, si alguna mutación depende solo de la cookie,
   añadir token anti-CSRF o exigir cabecera `Authorization` (el access token en memoria ya
   mitiga CSRF en las rutas que lo usan). Documentar el modelo elegido.
3. **Inyección:** Prisma parametriza por defecto; auditar cualquier `\$queryRaw` y confirmar
   que **todos** los DTOs usan `class-validator` con `whitelist: true` y
   `forbidNonWhitelisted: true` en el `ValidationPipe` global.
4. **Secretos:** `git log`/`git grep` para confirmar que ninguna clave (Stripe, Resend,
   JWT, DB) se ha commiteado; rotar la que se haya filtrado. Todo vía `.env`, solo
   `.env.example` en el repo (`CLAUDE.md`).
5. **HTTPS:** forzado en el reverse proxy (tarea 09) + HSTS; cookies `Secure` en producción.
6. **Cifrado en reposo:** cifrado del volumen/disco de Postgres en el VPS y de los backups
   (tarea 07). Documentar el mecanismo.
7. **Verificación:** repasar el rate limiting (Fase 1) sobre login/registro/recuperación/
   checkout y que los guards de rol siguen en cada endpoint (RBAC).

## Decisiones / alternativas
- **`helmet` vs. cabeceras a mano:** `helmet` es el estándar y cubre el grueso con poca
  superficie de error.
- **Anti-CSRF por token vs. apoyarse en `SameSite` + access token en cabecera:** si las
  mutaciones exigen el `Authorization` header (no solo cookie), el riesgo CSRF baja mucho;
  se elige según cómo estén hoy las rutas y se documenta, evitando complejidad innecesaria.
- **Cifrado en reposo a nivel de disco vs. a nivel de columna:** disco/volumen es suficiente
  y barato para el MVP; el cifrado por columna se reserva para datos muy sensibles si surgen.

## Conceptos que probablemente convenga repasar
- **Modelo CSRF** con cookies `HttpOnly` + `SameSite` y access token en memoria.
- **Content-Security-Policy** y qué rompe en una SPA React.

## Hecho cuando
- `helmet` + `ValidationPipe` estricto activos; CSRF documentado y cubierto; sin secretos en
  el repo; HTTPS/HSTS y cookies `Secure` previstos; cifrado en reposo de BD y backups.
- El barrido de `/security-review` no deja hallazgos críticos abiertos.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`chore(api): ...` / `fix(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
