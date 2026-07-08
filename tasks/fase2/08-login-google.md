# 08 · Login social con Google

**Checkbox del roadmap:** «Login social (Google + un segundo proveedor)».

> **Decisión de alcance:** para el MVP se implementa **solo Google**. Es el proveedor que
> tiene prácticamente todo el mundo; un segundo proveedor (GitHub u otro) aporta poco a este
> público y se deja fuera. El diseño se hace extensible para poder añadir otro más adelante
> sin reescribir.

## Objetivo
Permitir registro e inicio de sesión con la cuenta de Google, reutilizando el mismo modelo
`User` y el mismo flujo de sesión (`09`) que el login local.

## Qué se toca
- `apps/api/src/auth/` — estrategia y endpoints de OAuth con Google.
- `apps/api/prisma/schema.prisma` — campos/tabla para vincular la identidad de Google.
- `.env` / `.env.example`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`.

## Cómo implementarlo
1. **App en Google Cloud Console:** crear credenciales OAuth 2.0, configurar orígenes y
   URIs de redirección (dev y prod). Guardar client id/secret en `.env` (nunca en el repo).
2. **Estrategia OAuth en NestJS:** usar Passport (`passport-google-oauth20`) tras `@nestjs/passport`.
   Endpoints:
   - `GET /auth/google` → redirige a Google.
   - `GET /auth/google/callback` → Google devuelve el perfil (email, nombre, sub).
3. **Vinculación de identidad.** Modelar cómo se asocia la cuenta Google al `User`:
   - Opción recomendada: tabla `OAuthAccount { provider, providerAccountId, userId }` con
     `@@unique([provider, providerAccountId])`. Deja la puerta abierta a más proveedores sin
     tocar `User`.
   - En el callback: buscar `OAuthAccount` por `(google, sub)`. Si existe → login. Si no,
     buscar `User` por email:
     - existe con ese email → **vincular** creando el `OAuthAccount` (cuenta unificada).
     - no existe → crear `User` (con `emailVerifiedAt = now()`, Google ya verificó el email)
       y su `OAuthAccount`.
4. **Emitir sesión** reutilizando el flujo del `09` (mismos access/refresh tokens y cookie).
   El frontend recibe la sesión igual que en login local.
5. **Sin contraseña:** estos usuarios pueden tener `passwordHash = null`. Si luego quieren
   contraseña local, se gestiona vía "recuperación/establecer contraseña" (`11`).

## Decisiones / alternativas
- **Solo Google** (decisión de alcance arriba). El modelo `OAuthAccount` genérico permite
  añadir otro proveedor después con coste bajo.
- **Vincular por email** cuando ya existe usuario: evita cuentas duplicadas de la misma
  persona. Riesgo: depende de que el email de Google esté verificado (lo está). Alternativa
  (crear siempre cuenta nueva) generaría duplicados.
- **Passport** vs. implementar OAuth a mano: Passport es el estándar en NestJS y evita
  errores sutiles del flujo OAuth.

## Conceptos a repasar (para tus notas)
- Flujo OAuth 2.0 / OpenID Connect (authorization code, `sub`, callback).
- Guards y estrategias de `@nestjs/passport`.
- Estrategia de *account linking* y sus riesgos de seguridad.

## Hecho cuando
- "Iniciar sesión con Google" crea o vincula la cuenta y emite la misma sesión que el login
  local.
- El modelo de vinculación (`OAuthAccount`) admite añadir otro proveedor sin migración
  disruptiva.
- Secrets de Google fuera del repo, en `.env`.
