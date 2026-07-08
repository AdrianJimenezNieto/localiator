# 11 · Recuperación de contraseña

**Checkbox del roadmap:** «Recuperación de contraseña».

## Objetivo
Permitir a un usuario restablecer su contraseña vía un enlace enviado por email, de forma
segura y sin filtrar qué cuentas existen. Reutiliza el patrón de tokens de un solo uso del
registro (`06`) y el hashing de `07`.

## Qué se toca
- `apps/api/src/auth/` — endpoints de "olvidé mi contraseña" y "restablecer".
- `apps/api/src/mail/` — plantilla de email de reseteo (Resend).
- `apps/api/prisma/schema.prisma` — `PasswordResetToken` (o reutilizar el modelo de tokens
  del `06` con un campo `type`).

## Cómo implementarlo
1. **Endpoint `POST /auth/forgot-password`.** Recibe `email` (+ Turnstile/honeypot del `14`,
   rate limit del `13`). **Siempre** responde igual ("si el email existe, te hemos enviado un
   enlace"), exista o no la cuenta → no filtra usuarios.
2. **Generar token** si el usuario existe: aleatorio de alta entropía, guardar **solo el
   hash** con `expiresAt` corto (~1 h) y `userId`. Un solo uso.
3. **Enviar email** con Resend: `${APP_URL}/restablecer-password?token=...`.
4. **Endpoint `POST /auth/reset-password`.** Recibe `token` + `newPassword`. Hashea el token,
   busca coincidencia no expirada, valida la política de contraseña, actualiza
   `passwordHash` (argon2, `07`) e **invalida** el token.
5. **Invalidar sesiones (recomendado).** Tras un reseteo, revocar todos los `RefreshToken`
   del usuario (`09`): si alguien había robado la sesión, se corta. Anotar la decisión.
6. **Caso usuario solo-Google.** Si el usuario no tenía contraseña local (`passwordHash =
   null`), este flujo sirve también para **establecer** una por primera vez. Enlazar con `08`.

## Decisiones / alternativas
- **Respuesta neutra** en `forgot-password`: no revela existencia de cuentas (anti
  enumeración), coherente con `06` y `07`.
- **Token hasheado + un solo uso + caducidad corta:** mismo estándar de seguridad que la
  verificación de email.
- **Revocar sesiones tras reseteo:** más seguro ante robo de cuenta; alternativa (mantener
  sesiones) es peor. Recomendado revocar.
- **Reutilizar tabla de tokens con `type`** vs. tabla dedicada: reutilizar reduce
  duplicación; tabla dedicada es más explícita. Elegir y anotar.

## Conceptos a repasar (para tus notas)
- Por qué la respuesta neutra evita enumeración también aquí.
- Ciclo de vida de un token de un solo uso (generar → hashear → validar → invalidar).
- Revocación masiva de sesiones como respuesta a un cambio de credenciales.

## Hecho cuando
- "Olvidé mi contraseña" envía enlace (si la cuenta existe) sin revelar existencia.
- El enlace permite fijar nueva contraseña, es de un solo uso y caduca.
- Tras el reseteo se revocan las sesiones activas (según decisión).

## Al terminar (automatización)
Cuando esta tarea cumpla todos los criterios de «Hecho cuando»:
1. Marcar `[x]` el checkbox correspondiente en `ROADMAP.md`.
2. Hacer commit con mensaje semántico (Conventional Commits), incluyendo el cambio
   de `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
