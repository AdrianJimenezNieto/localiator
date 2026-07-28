# Plan: recuperación de contraseña (frontend del flujo SIN sesión)

Completar en el frontend el flujo de **"he olvidado mi contraseña"** (reset por email),
cuyo **backend ya está implementado** pero no tiene interfaz. Hoy el email de reset
llega con un enlace a `/restablecer-password?token=…` que **cae en el 404** porque esa
página no existe.

## Alcance

- **DENTRO:** solo el flujo de reset **sin estar logueado** (olvidé la contraseña →
  email → nueva contraseña). Es frontend puro.
- **FUERA (decisión explícita de Adrián):** el cambio de contraseña **estando
  logueado** (desde "Mi cuenta", introduciendo la actual). No se toca ni backend ni
  front para eso en esta tarea.

## Estado actual (lo que ya existe, no se toca)

Backend completo en `apps/api/src/auth/`:

- `POST /auth/forgot-password` — body `{ email }` (+ honeypot/Turnstile). Respuesta
  **neutra** siempre (anti-enumeración). Si la cuenta existe, genera token y envía el
  email con enlace a `${APP_URL}/restablecer-password?token=…` (TTL **1 h**).
  Rate limit estricto (5/min) + `AntiBotGuard`.
- `POST /auth/reset-password` — body `{ token, newPassword }` (+ honeypot/Turnstile).
  Valida el token (inexistente/caducado/usado → 400 con mensaje genérico), aplica la
  nueva contraseña (misma política que el registro) y **revoca TODAS las sesiones**
  del usuario. Rate limit estricto + `AntiBotGuard`.
- DTOs: `forgot-password.dto.ts` (email), `reset-password.dto.ts` (token + newPassword,
  con `@IsStrongPassword()`).

Frontend: **no hay** páginas ni rutas de contraseña. `LoginPage` no enlaza a nada de
esto.

> Patrón de referencia: reutilizar el estilo de las páginas ya hechas
> `ResendVerificationPage.tsx` (formulario email + Turnstile + respuesta neutra) y
> `VerifyEmailPage.tsx` (leer `?token` y actuar al montar). El flujo de reset es casi
> idéntico: una página "de solicitud" (como reenviar verificación) y una "de acción con
> token" (como verificar email, pero con formulario de nueva contraseña).

## Trabajo a realizar (frontend)

### 1. Página de solicitud — `ForgotPasswordPage.tsx`  ·  ruta `/recuperar-password`

Formulario con **email + `TurnstileWidget`**. Al enviar:

- `apiSend('POST', '/auth/forgot-password', { email, website: '', turnstileToken })`.
- En éxito, mostrar **aviso neutro** ("Si el email corresponde a una cuenta, te hemos
  enviado un enlace…") — **no** redirigir ni revelar si la cuenta existe.
- En error, mensaje genérico + reset del token de Turnstile (un solo uso).
- Copiar la mecánica de `ResendVerificationPage.tsx` (estados `submitting`/`done`,
  `turnstileReset`, honeypot `website: ''`).

### 2. Página de reseteo — `ResetPasswordPage.tsx`  ·  ruta `/restablecer-password`

**La ruta debe llamarse exactamente `/restablecer-password`** para casar con la URL que
el backend mete en el email (`auth.service.ts`, `resetUrl`). Si no, el enlace del correo
seguirá roto.

- Lee `token` de la query (`useSearchParams`). Si falta el token, mostrar error directo.
- Formulario: **nueva contraseña + repetir contraseña** (+ `TurnstileWidget`). Mostrar
  el mismo texto de política de contraseña que en `RegisterPage` (mín. 10, letra +
  número + carácter especial).
- Validación en cliente: contraseñas coinciden (igual que en el registro).
- Al enviar:
  `apiSend('POST', '/auth/reset-password', { token, newPassword, website: '', turnstileToken })`.
- En éxito: pantalla de confirmación con enlace a **`/login`**. Importante avisar de que
  se han cerrado todas las sesiones (el backend revoca sesiones), así que hay que
  **volver a iniciar sesión**.
- En error (token caducado/usado/ inválido → 400): mensaje del backend + enlace a
  **`/recuperar-password`** para pedir uno nuevo (el TTL es de solo 1 h, caducará a
  menudo).

### 3. Enlazar rutas — `apps/web/src/main.tsx`

Añadir dentro de los `children` del layout `App` (junto a `verificar-email` /
`reenviar-verificacion`), **antes** de la ruta comodín `*`:

```
{ path: 'recuperar-password', element: <ForgotPasswordPage /> },
{ path: 'restablecer-password', element: <ResetPasswordPage /> },
```

### 4. Enlace de entrada — `apps/web/src/pages/LoginPage.tsx`

Añadir bajo el formulario un enlace **"¿Olvidaste tu contraseña?"** → `/recuperar-password`.
Es el punto de entrada natural del flujo; sin él, el usuario no tiene forma de llegar.

## Decisiones de diseño (para revisar)

1. **Llamadas directas con `apiSend`** en las páginas, sin ampliar el contexto
   `auth.tsx`. Motivo: el reset **no toca el estado de sesión** (a diferencia de
   `login`/`register`), así que meterlo en el contexto solo lo engorda. Es lo mismo que
   se hizo con las páginas de verificación. Alternativa descartada: añadir
   `forgotPassword`/`resetPassword` al contexto (más "ordenado" pero innecesario aquí).
2. **Nombre de la ruta de solicitud**: `/recuperar-password` (la de acción es fija,
   `/restablecer-password`, impuesta por el backend). Alternativa: `/olvide-password`.
3. **No auto-login tras el reset**: el backend revoca todas las sesiones a propósito
   (si alguien había robado la cuenta, el reset lo expulsa), así que redirigimos a
   `/login` en vez de iniciar sesión solos. Es lo correcto de seguridad.

## Fuera de alcance / no hacer

- Cambio de contraseña estando logueado (endpoint + UI): **no** en esta tarea.
- Cambios en backend: **ninguno**, ya está todo.

## Verificación

- Manual (no hay tests de frontend en el proyecto):
  1. Pedir reset desde `/recuperar-password` con un email real → llega el correo (mirar
     también Resend → Logs).
  2. Pulsar el enlace → `/restablecer-password?token=…` abre la página (ya no 404).
  3. Fijar una contraseña nueva → confirmación → iniciar sesión con la nueva.
  4. Token caducado/reutilizado → mensaje de error + enlace para pedir otro.
- `pnpm --filter @localiator/web build` y `tsc -b --noEmit` en verde.

## Estimación

Frontend pequeño: 2 páginas nuevas (calcadas de las de verificación) + 2 líneas de
rutas + 1 enlace en login. Un diff revisable de una sentada.
