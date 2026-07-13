# Modelo de seguridad — Localiator

Resumen de las medidas de hardening y cómo se cubren los vectores comunes. Es la
salida de la revisión de seguridad de la Fase 4 (tarea 05); complementa las
decisiones de `CLAUDE.md`.

## Cabeceras de seguridad (XSS / clickjacking)

`helmet` está activo en `apps/api/src/main.ts` y aporta HSTS, `X-Content-Type-Options:
nosniff`, `X-Frame-Options`, `Referrer-Policy`, etc.

- **`Cross-Origin-Resource-Policy: cross-origin`**: necesario porque las fotos del
  catálogo se sirven desde el origen de la API (`/uploads`) y las carga la web, que
  está en otro origen. Con el valor por defecto (`same-origin`) no se verían.
- **XSS en el frontend**: React escapa por defecto. No se usa `dangerouslySetInnerHTML`
  (verificado con `grep`). Los textos legales son estáticos, no entrada de usuario.

## CSRF

Modelo elegido: **access token en memoria + refresh token en cookie acotada**.

- Las **mutaciones de la API** (crear pedido, checkout, admin, borrar cuenta…) exigen
  el access token en la cabecera `Authorization: Bearer`. Una web atacante no puede
  leer ese token (vive en memoria del SPA, no en cookie), así que **no puede forjar
  esas peticiones** → sin superficie CSRF.
- La **cookie de refresh** es `HttpOnly`, `SameSite=Lax`, `Secure` en producción y
  con `Path=/auth`. Solo la usan `POST /auth/refresh` y `POST /auth/logout`. Al ser
  `SameSite=Lax`, no viaja en peticiones POST cross-site, lo que mitiga el CSRF sobre
  esos dos endpoints. Además el refresh **rota** y detecta reutilización.

Conclusión: no se añade token anti-CSRF explícito porque el diseño (Bearer + cookie
`SameSite`) ya cierra el vector. Documentado aquí por si cambia el modelo de sesión.

## Inyección

- **SQL**: Prisma parametriza todas las consultas. No hay `$queryRaw`/`$executeRaw`
  con interpolación de entrada de usuario (verificado con `grep`).
- **Validación de entrada**: `ValidationPipe` global con `whitelist: true` **y**
  `forbidNonWhitelisted: true` (rechaza con 400 los campos no declarados, en vez de
  descartarlos en silencio). Todos los DTOs usan `class-validator`. Los formularios
  de auth declaran sus campos antibot (`website`, `turnstileToken`) en `AntiBotDto`
  para no ser rechazados.

## Rate limiting y control de acceso

- `@nestjs/throttler` global (100/min por IP) y límites más estrictos en login,
  registro, recuperación y borrado de cuenta.
- RBAC: `JwtAuthGuard` + `RolesGuard` globales; los endpoints de admin llevan
  `@Roles(ADMIN)`. Las rutas públicas se marcan explícitamente con `@Public`.

## Gestión de secretos

- Todo secreto (Stripe, Resend, JWT, DB, Google, Turnstile) vive en `.env`, que está
  en `.gitignore`. En el repo solo está `.env.example` con valores vacíos/placeholder.
- Verificación: `git log`/`git grep` no revelan claves reales commiteadas. Si alguna
  se filtrara, **rotarla** en el proveedor correspondiente.

## HTTPS y cifrado en tránsito

- En producción, **HTTPS forzado** en el reverse proxy (Nginx Proxy Manager, tarea
  09) con certificado Let's Encrypt, más **HSTS** (helmet). Las cookies se emiten
  `Secure` cuando `NODE_ENV=production`.

## Cifrado en reposo

- Datos de PostgreSQL y **backups** (tarea 07) sobre un volumen/disco cifrado del VPS
  (cifrado a nivel de disco, suficiente y barato para el MVP; el cifrado por columna
  se reserva para datos muy sensibles si surgen). Ver detalle en la tarea 09/07.

## Logs

- Logs estructurados con `nestjs-pino` (tarea 08). Se **redactan** cabeceras sensibles
  (`authorization`, `cookie`, `set-cookie`) y el cuerpo no se loguea, así que no se
  filtran contraseñas ni tokens. Los errores 5xx devuelven un mensaje genérico al
  cliente; el detalle queda solo en el log del servidor.
