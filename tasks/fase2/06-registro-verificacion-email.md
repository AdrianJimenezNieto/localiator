# 06 · Registro con verificación de email (Resend)

**Checkbox del roadmap:** «Registro con verificación de email (Resend)».

## Objetivo
Permitir crear una cuenta con email y contraseña, y verificar que el email es real antes de
considerar la cuenta plenamente activa. El envío del correo se hace con **Resend** (decidido
en `CLAUDE.md`).

## Qué se toca
- `apps/api/src/auth/` (nuevo módulo NestJS): controlador + servicio de registro.
- `apps/api/src/mail/` (nuevo): servicio fino sobre Resend.
- `apps/api/prisma/schema.prisma` — modelo `EmailVerificationToken` (o reutilizar un patrón
  de tokens común con recuperación de contraseña, ver `11`).
- Variables en `.env` / `.env.example`: `RESEND_API_KEY`, `APP_URL`.

## Cómo implementarlo
1. **Endpoint `POST /auth/register`.** Recibe `email`, `password` (+ honeypot y token
   Turnstile, ver `14`). Validar y sanear la entrada con `class-validator` /
   `ValidationPipe` (email válido, política de contraseña).
2. **Crear usuario** con `emailVerifiedAt = null` y `passwordHash` (hashing en `07`).
   Si el email ya existe, responder de forma **neutra** (no revelar si la cuenta existe, para
   no filtrar usuarios registrados).
3. **Token de verificación.** Generar un token aleatorio de alta entropía
   (`crypto.randomBytes`), guardar en BD **solo su hash** con `expiresAt` (p. ej. 24 h) y
   `userId`. Nunca guardar el token en claro.
4. **Enviar email** con Resend: enlace `${APP_URL}/verificar-email?token=...`. Servicio de
   mail aislado para poder mockearlo en tests y cambiar de proveedor sin tocar el auth.
5. **Endpoint `POST /auth/verify-email`.** Recibe el token, lo hashea, busca coincidencia no
   expirada, marca `emailVerifiedAt = now()` y **invalida** el token (borrar o marcar usado).
6. **Política de acceso:** decidir qué puede hacer un usuario no verificado. Recomendado:
   puede loguear pero no comprar/pujar hasta verificar. Anotar la decisión.

## Decisiones / alternativas
- **Guardar hash del token** (no el token) igual que una contraseña: si se filtra la BD, los
  tokens no son usables. Alternativa (token en claro) es un riesgo innecesario.
- **Respuesta neutra ante email existente:** evita enumeración de usuarios. Alternativa
  (error "ya existe") es más cómoda pero filtra información.
- **Resend** ya decidido; el servicio de mail se abstrae para no acoplar el dominio al SDK.

## Conceptos a repasar (para tus notas)
- Módulos, providers e inyección de dependencias en NestJS.
- `ValidationPipe` + DTOs con `class-validator`.
- Por qué se hashea un token de un solo uso y qué es la entropía de un token.
- Enumeración de usuarios como vector de ataque.

## Hecho cuando
- Registro crea usuario no verificado y envía email vía Resend.
- El enlace verifica la cuenta, es de un solo uso y caduca.
- La entrada está validada/saneada y no se filtra la existencia de cuentas.

## Al terminar (automatización)
Cuando esta tarea cumpla todos los criterios de «Hecho cuando»:
1. Marcar `[x]` el checkbox correspondiente en `ROADMAP.md`.
2. Hacer commit con mensaje semántico (Conventional Commits), incluyendo el cambio
   de `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
