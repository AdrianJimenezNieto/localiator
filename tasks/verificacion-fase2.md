# Verificación Fase 2 — Autenticación (tareas 06–14)

Guía para **revisar y entender** el sistema de auth que se ha implementado, y para
**verificar** que funciona. Léela de arriba abajo: primero el mapa mental (cómo
encajan las piezas), luego los patrones clave, luego la verificación práctica.

Todo el código vive en `apps/api/src/auth/` (+ `apps/api/src/mail/`). Cada tarea se
mergeó en su propia PR (#7 a #15).

---

## 1. Mapa: qué archivo hace qué

### Módulos y "cableado"
- **`auth.module.ts`** — declara todo el módulo: controlador, servicios, estrategias
  de Passport, guards y el `JwtModule` (firma de access tokens). Importa `MailModule`
  y `PassportModule`.
- **`app.module.ts`** (raíz) — registra los **guards globales** (orden = ejecución):
  `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`. También `ScheduleModule` (cron) y
  `ThrottlerModule` (rate limiting).
- **`main.ts`** — `cookie-parser`, CORS con credenciales, `trust proxy` (IP real tras
  Nginx) y el `ValidationPipe` global.

### Controlador (la "cara" HTTP)
- **`auth.controller.ts`** — todos los endpoints `/auth/*`. No tiene lógica de
  negocio: valida entrada (DTOs), llama a los servicios y gestiona las cookies.

### Servicios (la lógica)
- **`auth.service.ts`** — registro, login, verificación de email, recuperación de
  contraseña y *account linking* de Google. Es el corazón.
- **`session.service.ts`** — emisión, **rotación** y revocación de tokens de sesión
  (access JWT + refresh opaco). Sliding expiration y `deleteExpired`.
- **`session-cleanup.service.ts`** — `@Cron` diario que borra refresh caducados.
- **`password.service.ts`** — envoltorio de **argon2** (hash/verify).
- **`mail.service.ts`** (en `mail/`) — envoltorio de **Resend** (emails de
  verificación y reseteo). Sin API key, escribe en el log.
- **`turnstile.service.ts`** — verifica el CAPTCHA de Cloudflare en servidor.

### Estrategias de Passport (autenticación)
- **`jwt.strategy.ts`** — valida el access token (`Authorization: Bearer`). Rellena
  `req.user`.
- **`google.strategy.ts`** — flujo OAuth 2.0 con Google; delega el linking en
  `auth.service`.

### Guards (autorización / defensa)
- **`jwt-auth.guard.ts`** — global. Exige access token salvo rutas `@Public()`.
- **`roles.guard.ts`** — global. Exige rol (`@Roles(...)`) → 403 si no basta.
- **`anti-bot.guard.ts`** — por ruta. Honeypot + Turnstile.

### Decoradores y utilidades
- **`public.decorator.ts`** (`@Public`), **`roles.decorator.ts`** (`@Roles`),
  **`current-user.decorator.ts`** (`@CurrentUser`), **`auth.constants.ts`** (claves de
  metadatos).
- **`crypto.util.ts`** — genera tokens aleatorios y su hash SHA-256.
- **`duration.util.ts`** — parsea `"15m"`, `"15d"` a milisegundos.
- **`dto/`** — validación de entrada con `class-validator`; `password.decorator.ts`
  centraliza la política de contraseña.

### Modelos Prisma nuevos (`prisma/schema.prisma`)
- **`VerificationToken`** — tokens de un solo uso para verificación de email y reseteo
  de contraseña (campo `type`). Guarda solo el hash.
- **`OAuthAccount`** — vincula identidades de Google (u otros) a un `User`.
- **`RefreshToken`** — refresh tokens de sesión (hash, expiración, revocación,
  rotación).

---

## 2. Cómo hablan entre sí: los flujos

### Registro + verificación (06)
```
POST /auth/register
  AntiBotGuard (honeypot+turnstile) → ValidationPipe (RegisterDto)
  → AuthController.register → AuthService.register
      → PasswordService.hash (argon2)         [crea User no verificado]
      → crypto.generateToken → guarda hash en VerificationToken (24h)
      → MailService.sendEmailVerification (enlace con el token en claro)
  ← respuesta NEUTRA (exista o no el email)

POST /auth/verify-email  → AuthService.verifyEmail
  hashea el token, busca coincidencia válida, marca emailVerifiedAt + usedAt
  (en una transacción)
```

### Login local → sesión (07 + 09)
```
POST /auth/login
  AntiBotGuard → ValidationPipe (LoginDto)
  → AuthController.login → AuthService.login
      busca User; SIEMPRE hace un argon2.verify (contra hash real o "señuelo")
      → si falla: 401 genérico (no distingue email/contraseña, ni por tiempo)
  → SessionService.issue
      firma access token (JWT, 15m) + crea RefreshToken (hash, 15d)
  ← body { accessToken, user } + cookie HttpOnly `refresh_token`
```

### Renovación con rotación (09 + sliding 10)
```
POST /auth/refresh  (lee la cookie)
  → SessionService.rotate
      valida el refresh; si ya estaba revocado → REUTILIZACIÓN → revoca TODA la
      cadena del usuario (401). Si válido: emite uno nuevo (expiración renovada a
      15d = sliding) y revoca el anterior (revokedAt + replacedByTokenId).
  ← nuevo accessToken + nueva cookie
```

### Google (08 + 09)
```
GET /auth/google → redirige a Google
GET /auth/google/callback
  GoogleStrategy.validate → AuthService.validateOAuthLogin
      OAuthAccount existe? → login. ¿User con ese email? → vincula. ¿Nada? → crea
      User verificado + OAuthAccount.
  → SessionService.issue → cookie → redirect al frontend
```

### Recuperación de contraseña (11)
```
POST /auth/forgot-password  → respuesta neutra; si existe, token PASSWORD_RESET (1h)
POST /auth/reset-password   → valida token, PasswordService.hash, invalida token
                               (transacción) y SessionService.revokeAllForUser
```

### RBAC (12) — se aplica a TODO
```
Cada request → ThrottlerGuard → JwtAuthGuard (¿@Public? pasa. Si no, exige JWT y
pone req.user) → RolesGuard (¿@Roles? comprueba req.user.role, si no basta → 403)
```

---

## 3. Patrones y decisiones clave (el "por qué")

1. **Tokens siempre hasheados en BD.** Verificación de email, reseteo y refresh: se
   guarda solo el SHA-256. Si se filtra la BD, los tokens no son usables.
   (`crypto.util.ts`). Las contraseñas usan **argon2** (caro a propósito), los tokens
   SHA-256 (rápido, porque ya son de alta entropía).
2. **Respuestas neutras (anti-enumeración).** Registro, login y forgot-password no
   revelan si un email existe — ni por mensaje ni, en login, por **tiempo** (verify
   contra un hash "señuelo").
3. **Sesión = access corto + refresh largo.** Access JWT en memoria (menos XSS),
   refresh opaco en cookie `HttpOnly`/`Secure`/`SameSite` y en BD (revocable).
4. **Rotación de refresh + detección de reutilización.** Un token robado y reusado
   tras rotar corta toda la cadena de sesión.
5. **Sliding expiration.** Cada renovación reinicia los 15 días → "recordado mientras
   lo uso". Un cron limpia los caducados.
6. **Denegar por defecto.** `JwtAuthGuard` global: si olvidas proteger una ruta, NO
   queda abierta. Lo público se marca explícito con `@Public()`.
7. **Defensa en profundidad** en los formularios sensibles: rate limiting (13) +
   honeypot + Turnstile (14) + hashing/neutralidad (07). Capas, no sustitutos.
8. **Servicios aislados** (mail, password, turnstile) para desacoplar librerías del
   dominio y poder mockearlos en tests / arrancar sin credenciales en dev.

### Conceptos a repasar (consolidados de todo el slice)
- NestJS: módulos/providers/**inyección de dependencias**; **guards** y `CanActivate`;
  `Reflector` + `SetMetadata`; orden guards vs pipes; `@nestjs/passport` y estrategias.
- Seguridad: **enumeración de usuarios** y ataques de **timing**; por qué se hashea un
  token de un solo uso y qué es la **entropía**; atributos de cookie
  `HttpOnly`/`Secure`/`SameSite` (qué frena cada uno); **CSRF vs XSS**.
- Sesión: JWT (firma, claims, vida corta); **rotación y revocación** de refresh;
  sliding vs expiración absoluta.
- OAuth 2.0 / OpenID Connect: `sub`, authorization code, *account linking* y sus
  riesgos.
- Prisma: **transacciones** (`$transaction`) y atomicidad; `@@unique` compuesto.
- `argon2id` vs bcrypt; `needsRehash` (rehash oportunista, aún no implementado).
- `trust proxy` / `X-Forwarded-For` tras un reverse proxy.

---

## 4. Guía de verificación

### 4.1 Requisitos previos
```bash
# Postgres levantado (docker) y dependencias instaladas
docker compose up -d
pnpm install
# Migraciones aplicadas a la BD de desarrollo
cd apps/api && DATABASE_URL="postgresql://localiator:changeme@localhost:5433/localiator?schema=public" \
  pnpm exec prisma migrate deploy
```
> Sin `RESEND_API_KEY`, `GOOGLE_*` ni `TURNSTILE_SECRET_KEY` la app **arranca igual**;
> esos flujos concretos quedan en modo "dev" (email al log, Turnstile no bloquea,
> Google no funcionará hasta poner credenciales reales).

### 4.2 Lint + build + tests (lo que valida CI)
```bash
pnpm lint && pnpm build && pnpm test
# Esperado: verde. 37 tests en apps/api.
```

### 4.3 Arrancar la API y probar a mano
```bash
pnpm --filter @localiator/api start   # escucha en http://localhost:3000
```

**Denegar por defecto / RBAC (12)**
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health     # 200 (público)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/auth/me     # 401 (sin token)
```

**Registro + verificación (06)** — el enlace sale en el log de la API (sin Resend):
```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"nuevo@test.com","password":"micontrasena9"}'
# → 200 y mensaje neutro. En el log de la API verás la URL /verificar-email?token=...
# Copia ese token:
curl -s -X POST http://localhost:3000/auth/verify-email \
  -H 'Content-Type: application/json' -d '{"token":"<TOKEN_DEL_LOG>"}'
# → "Email verificado correctamente"
```

**Login + sesión + rutas protegidas (07 + 09)**
```bash
# Guardamos la cookie en un fichero y capturamos el accessToken
curl -s -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nuevo@test.com","password":"micontrasena9"}'
# → { accessToken, user }.  Exporta el token:
ACCESS=<pega_el_accessToken>
curl -s http://localhost:3000/auth/me -H "Authorization: Bearer $ACCESS"   # → tu usuario
# Renovar (rotación) usando la cookie:
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/auth/refresh   # → nuevo accessToken
# Logout:
curl -s -b cookies.txt -X POST http://localhost:3000/auth/logout                   # → "Sesión cerrada"
```

**Neutralidad y timing (07)**
```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"noexiste@x.com","password":"loquesea99"}'
# → 401 "Credenciales inválidas" (idéntico a contraseña incorrecta)
```

**Recuperación de contraseña (11)**
```bash
curl -s -X POST http://localhost:3000/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"nuevo@test.com"}'
# → mensaje neutro; enlace /restablecer-password?token=... en el log
curl -s -X POST http://localhost:3000/auth/reset-password \
  -H 'Content-Type: application/json' -d '{"token":"<TOKEN>","newPassword":"otraclave99"}'
# → "Contraseña actualizada". (Las sesiones previas quedan revocadas.)
```

**Rate limiting (13)** — login: 5/min por IP
```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3000/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"x@y.com","password":"loquesea99"}'
done; echo
# Esperado: 401 401 401 401 401 429 429
```

**Anti-bot honeypot (14)**
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"bot@x.com","password":"micontrasena9","website":"http://spam"}'
# → 400 (honeypot relleno = bot)
```

**Google (08)** — solo si configuras credenciales reales:
```
Abrir en el navegador http://localhost:3000/auth/google  → consentimiento → callback
→ redirige a APP_URL/oauth/callback con la cookie de sesión puesta.
```

### 4.4 Claves reales pendientes (para producción / pruebas end-to-end)
Rellena en `.env` (nunca en el repo):
- `RESEND_API_KEY` (+ `MAIL_FROM` con dominio verificado) — emails de verdad.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` — login Google.
- `TURNSTILE_SECRET_KEY` (backend) + `VITE_TURNSTILE_SITE_KEY` (frontend) — CAPTCHA.
- `JWT_ACCESS_SECRET` — un valor largo y aleatorio (en dev hay un fallback inseguro).

### 4.5 Lo que queda fuera de este slice (anotado, no olvidado)
- **Frontend de auth**: `apps/web` sigue siendo el starter de Vite. Formularios de
  registro/login/recuperación, el widget de Turnstile y el input honeypot oculto se
  harán cuando se construya esa UI.
- **Tope absoluto de sesión** (además del deslizante) y **rehash oportunista** de
  argon2: anotados para más adelante.
- Endurecer `SameSite` a `strict` y defensa CSRF explícita: revisión de seguridad de
  Fase 4.
