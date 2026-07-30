# Plan: terminar la integración del login con Google

El backend del login con Google (`tasks/fase1/08-login-google.md`) está hecho y probado,
pero **no hay nada en el frontend** y faltan piezas de seguridad y de datos del comprador.
Este plan cierra todo lo que el código deja pendiente para poder marcar el flujo como
realmente usable en producción.

## Alcance

- **DENTRO:** botón de Google en login/registro, ruta `/oauth/callback`, manejo de errores
  del flujo OAuth, parámetro `state` (anti CSRF de login), conservar el destino
  (`?redirect=`) a través del flujo, completar los datos personales de las cuentas creadas
  por Google, credenciales reales en Google Cloud Console y ajuste del `ROADMAP.md`.
- **FUERA:** un segundo proveedor OAuth (GitHub/Apple), desvincular la cuenta de Google
  desde "Mi cuenta", usar el `name`/`picture` del perfil de Google como datos del usuario,
  y cualquier cambio en los flujos de contraseña (ya hechos).

## Estado actual (lo que ya existe y se reutiliza)

Backend, en `apps/api/src/auth/`:

- `google.strategy.ts` — `PassportStrategy(Strategy, 'google')` con scope `['email','profile']`.
  `validate()` saca el email y el `sub` (`profile.id`) y delega en `AuthService`. Si faltan
  las credenciales usa placeholders para que la app arranque igual.
- `auth.controller.ts:184` — `GET /auth/google` (`@Public` + `AuthGuard('google')`, cuerpo
  vacío: el guard redirige a Google) y `GET /auth/google/callback` (emite sesión con
  `SessionService.issue`, pone la cookie de refresh con `setRefreshCookie` y redirige a
  `${APP_URL}/oauth/callback`). El access token **no** viaja en la URL a propósito.
- `auth.service.ts:162` `validateOAuthLogin()` — account linking en tres casos: OAuthAccount
  existente → login; email ya registrado → vincula; ninguno → crea `User` con
  `emailVerifiedAt = now()` y `passwordHash = null`. Con tests en `auth.service.spec.ts:264`.
- `schema.prisma` — modelo `OAuthAccount` con `@@unique([provider, providerAccountId])`,
  migración `20260709083351_add_oauth_account` aplicada.
- `UsersService.anonymizeOwnAccount()` borra los `OAuthAccount` del usuario, así que una
  cuenta ejercida el derecho al olvido no se puede reabrir con Google.

Frontend, en `apps/web/src/`:

- `lib/auth.tsx` — el `AuthProvider` ya llama a `POST /auth/refresh` + `GET /auth/me` al
  montar. **Esto es la clave**: tras el callback de Google la cookie ya está puesta, así que
  la sesión se rehidrata sola sin necesidad de ningún endpoint nuevo.
- `pages/LoginPage.tsx` / `pages/RegisterPage.tsx` — formularios locales con Turnstile y
  soporte de `?redirect=` (login) para volver al checkout.
- `main.tsx` — `createBrowserRouter`; ahí se añade la ruta nueva.

Configuración: `.env.example:60` ya declara `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y
`GOOGLE_CALLBACK_URL`; `tasks/placeholders.md:55` documenta qué poner en producción.

## Huecos detectados (el "por qué" de cada paso)

1. **No hay botón ni ruta.** Hoy, con credenciales válidas, el flujo funciona de punta a
   punta y aterriza en el `NotFoundPage` (`/oauth/callback` no existe). La sesión sí queda
   creada, pero la UX es un 404.
2. **Sin `state`: login CSRF.** El flujo no usa el parámetro `state` de OAuth 2.0. Un
   atacante puede hacer que la víctima complete un callback con SU código de autorización y
   quede logueada en la cuenta del atacante (donde luego ve lo que la víctima haga: pedidos,
   datos). Es el hueco de seguridad más serio de lo que hay.
3. **Errores del flujo sin tratar.** Si el usuario cancela el consentimiento, Google vuelve
   con `?error=access_denied` y `AuthGuard('google')` responde un `401` JSON crudo **en el
   dominio de la API**. Igual si las credenciales son placeholders.
4. **Se pierde el destino.** El callback siempre redirige a `/oauth/callback` sin memoria de
   a dónde iba el usuario, así que "inicia sesión con Google para pagar" no vuelve al
   checkout, a diferencia del login local (`?redirect=`).
5. **Datos personales vacíos.** Un `User` creado por Google no tiene `firstName`, `lastName`,
   `birthDate` ni dirección de facturación (nullable a propósito en el schema). Hoy la
   factura solo guarda `customerEmail` (`invoicing.service.ts:89`), así que **no se rompe
   nada**, pero se está vendiendo a alguien de quien no se tiene ni el nombre, y no existe
   ninguna pantalla donde rellenarlo (el `AccountPage` no edita esos campos).
6. **`ROADMAP.md:63`** está marcado `[x]` como «Login social (Google + un segundo proveedor)»
   cuando la decisión de alcance fue **solo Google**.

## Decisiones de diseño (revisar antes de picar)

### 1. `state` firmado en cookie, no `express-session` (recomendada)

`passport-google-oauth20` sabe generar y verificar `state` con `state: true`, pero eso exige
una **sesión de servidor** (`express-session`), y este proyecto es deliberadamente *stateless*
(JWT + refresh en cookie). Meter `express-session` solo para esto añadiría un store más.

Propuesta: implementar un **`store` propio** (la opción `store` de `passport-oauth2`, que es
la base de la estrategia de Google) que guarde el state en una **cookie corta, `HttpOnly`,
`SameSite=lax`, de ~10 minutos**:

- `store(req, meta, cb)` → genera un valor aleatorio (`crypto.randomBytes(32).toString('base64url')`),
  lo escribe en la cookie `oauth_state` y lo devuelve por callback.
- `verify(req, providedState, cb)` → compara la cookie con lo que vuelve de Google en
  **tiempo constante** (`crypto.timingSafeEqual`), borra la cookie y acepta o rechaza.

Es exactamente lo que hace `express-session` pero apoyándose en la cookie firmada en vez de
en un store. Alternativas: (a) `express-session` — más dependencia y estado en memoria que no
sobrevive a un reinicio; (b) no poner `state` — deja el CSRF de login abierto, descartado.

> **Concepto a repasar (para tus notas):** login CSRF en OAuth y para qué sirve `state`;
> firma y comparación en tiempo constante.

### 2. El `redirect` viaja **dentro** del state, no como query aparte

Ya que ciframos/guardamos state, el destino post-login (`/checkout`, por ejemplo) se guarda
**en la misma cookie** junto al valor aleatorio (`{ state, next }` serializado). Así el
callback sabe a dónde mandar al usuario y —importante— **el destino nunca llega desde una
URL manipulable**, lo que evita un *open redirect*.

Aun así, al usarlo se valida que `next` sea una **ruta relativa** que empiece por `/` y no
por `//` (que el navegador interpretaría como otro host).

Alternativa descartada: `GET /auth/google?redirect=/checkout` y propagarlo tal cual → hay que
validar igualmente y encima es manipulable por un tercero.

### 3. Errores → redirect al frontend, nunca JSON en el dominio de la API

Un filtro/guard alrededor del callback que, ante cualquier fallo (cancelación, credenciales
inválidas, state que no cuadra), haga
`res.redirect(`${APP_URL}/login?error=oauth`)` en vez de propagar el `401`.

Implementación propuesta: **guard propio `GoogleAuthGuard extends AuthGuard('google')`** que
sobrescribe `handleRequest()` y, en caso de error o de `user` ausente, lanza una excepción que
un `@UseFilters(OAuthErrorFilter)` traduce a redirect. Alternativa más simple: try/catch
imposible (el guard corre antes del handler), de ahí el filtro.

El frontend, en `/login`, muestra un aviso si ve `?error=oauth` ("No se pudo iniciar sesión
con Google, prueba con tu email").

### 4. Datos personales: pedirlos **al completar el perfil**, no en el callback

Un usuario de Google llega sin nombre ni dirección. Opciones:

- **(a) Recomendada:** dejar que entre y que el **checkout** exija el perfil completo: si
  faltan datos obligatorios, `CheckoutPage` muestra primero el formulario de datos
  personales (mismos campos y validaciones que `RegisterDto`) contra un endpoint nuevo
  `PATCH /users/me`. Ventaja: no rompe la promesa de "login en un clic" de Google y solo
  molesta cuando de verdad hace falta (facturar).
- **(b)** Pedir los datos inmediatamente tras el primer login con Google (pantalla de
  "completa tu registro"). Más consistente con el registro local, pero mata la ventaja del
  login social y penaliza a quien solo quiere mirar el catálogo o pujar.
- **(c)** No pedirlos nunca (estado actual). Se factura sin nombre del comprador.

> **Decisión abierta para Adrián:** el plan asume **(a)**. Si prefieres (b), el paso F4 se
> mueve a una pantalla propia justo después del callback.

Nota aparte, **independiente de Google**: hoy `Invoice` guarda solo `customerEmail`, así que
ni siquiera los usuarios locales aportan nombre/dirección a la factura. Arreglarlo es de la
tarea de facturación (`tasks/fase3/09-facturacion-iva.md`), no de esta; aquí solo se garantiza
que el dato **exista** en `User`.

### 5. `prompt=select_account`

Añadir `prompt: 'select_account'` a la estrategia para que Google siempre pregunte con qué
cuenta entrar. Sin ello, quien tenga una sola sesión de Google entra sin poder elegir, y
cambiar de cuenta se vuelve confuso. Coste: una línea.

### 6. Anti-bot: rate limit sí, Turnstile no

`GET /auth/google` es público, pero un CAPTCHA antes de redirigir a Google no aporta (el
propio Google tiene su antiabuso) y rompería el flujo de un simple enlace. Sí conviene bajar
el límite del throttler global (100/min) a `MODERATE_THROTTLE` en ambos endpoints, para que
nadie use el `/auth/google/callback` como ariete.

## Trabajo a realizar — Backend

### B1. Store de `state` en cookie — `auth/oauth-state.store.ts` (nuevo)

Clase con `store(req, meta, cb)` / `verify(req, state, cb)` según la interfaz `StateStore` de
`passport-oauth2`, apoyada en `crypto` y en `res.cookie` / `req.cookies` (ya hay
`cookie-parser` en `main.ts:44`). Cookie `oauth_state`: `httpOnly`, `sameSite: 'lax'`,
`secure` en producción, `maxAge` 10 min, `path: '/auth'`.

> Al picar, confirmar la firma exacta de `store()` en la versión instalada de
> `passport-oauth2` (cambia entre 1.5 y 1.6+: con y sin el argumento `meta`).

### B2. Estrategia — `google.strategy.ts`

- Pasarle `store: new OAuthStateStore(...)` y `prompt: 'select_account'`.
- Mantener el fallback de placeholders, pero **loguear un `warn` al arrancar** si las
  credenciales no están configuradas, para que el fallo no sea opaco (hueco 3).

### B3. Guard + filtro de error — `auth/google-auth.guard.ts`, `auth/oauth-error.filter.ts` (nuevos)

`GoogleAuthGuard extends AuthGuard('google')` con `handleRequest()` que convierte cualquier
error en una excepción propia; `OAuthErrorFilter` la traduce a
`res.redirect(`${APP_URL}/login?error=oauth`)`. Aplicarlo a los dos endpoints de Google.

### B4. Controller — `auth.controller.ts`

- Sustituir `AuthGuard('google')` por `GoogleAuthGuard` en `/auth/google` y `/auth/google/callback`.
- `@Throttle(MODERATE_THROTTLE)` en ambos.
- En `googleAuth()`: leer `?redirect=` de la query, validarlo como ruta relativa y dejarlo en
  el state (decisión 2).
- En `googleCallback()`: recuperar el `next` del state y redirigir a `${APP_URL}${next}` (por
  defecto `/oauth/callback`, que es quien enseña el "entrando…"). Mantener el paso de
  `session.issue` + `setRefreshCookie` tal cual.

### B5. Perfil del comprador — `PATCH /users/me` (decisión 4a)

- DTO `UpdateProfileDto` reutilizando los validadores de `RegisterDto` (`@IsAdult`, etc.).
- `UsersService.updateOwnProfile(userId, dto)` → `user.update`. Rechazar si la cuenta está
  anonimizada (mismo criterio que `anonymizeOwnAccount`).
- Exponer en `GET /auth/me` un booleano `profileComplete` (o los propios campos) para que el
  frontend sepa si tiene que pedirlos.

### B6. Tests

- `oauth-state.store.spec.ts`: state válido pasa; state distinto/ausente/expirado falla; la
  cookie se borra tras verificar.
- Un caso de `next` malicioso (`//evil.com`, `https://evil.com`) → se ignora y va a `/`.
- Ampliar `auth.service.spec.ts` si cambia algo del linking (no debería).

## Trabajo a realizar — Frontend

### F1. Botón "Continuar con Google" — `LoginPage.tsx` y `RegisterPage.tsx`

Un `<a href={`${API_URL}/auth/google?redirect=${encodeURIComponent(redirect)}`}>` (enlace, no
`fetch`: es una navegación *top-level*, imprescindible para que Google pinte su pantalla y
para que la cookie `SameSite=lax` se acepte al volver). Separador "o" sobre el formulario
local, con el logo de Google.

### F2. Ruta y página `/oauth/callback` — `main.tsx`, `pages/OAuthCallbackPage.tsx` (nueva)

Página mínima: mientras `ready` del `useAuth()` sea falso, "Iniciando sesión…"; cuando esté
lista, `navigate(destino, { replace: true })` — a `/` si hay usuario, a `/login?error=oauth`
si no (la cookie no llegó). No hace ninguna llamada propia: el `AuthProvider` ya rehidrata
solo, por eso esta página es tan corta.

### F3. Aviso de error en `LoginPage.tsx`

Si `?error=oauth`, mostrar el mensaje de fallo del login social encima del formulario.

### F4. Completar perfil en el checkout — `CheckoutPage.tsx`

Si el usuario está logueado pero le faltan datos obligatorios (`profileComplete === false`),
mostrar el formulario de datos personales (mismos campos que el registro) antes de poder
pagar; envía a `PATCH /users/me` y continúa. Extraer los campos del `RegisterPage` a un
componente compartido `PersonalDataFields` para no duplicarlos.

## Trabajo a realizar — Configuración y documentación

### C1. Credenciales reales en Google Cloud Console

1. Crear proyecto → **APIs y servicios → Pantalla de consentimiento OAuth** (tipo *Externo*,
   datos de la app, ámbitos `email` y `profile`).
2. **Credenciales → ID de cliente OAuth 2.0 → Aplicación web**:
   - Orígenes autorizados: `http://localhost:5173` y `https://localiator.com`.
   - URIs de redirección: `http://localhost:3000/auth/google/callback` y
     `https://api.localiator.com/auth/google/callback` (**debe coincidir carácter a
     carácter** con `GOOGLE_CALLBACK_URL`).
3. Client ID/secret → `.env` (local) y `.env.production` (VPS). Nunca al repo.
4. Mientras la app esté "en pruebas", solo entran los usuarios de prueba dados de alta:
   publicarla cuando se vaya a lanzar.

### C2. Documentación

- Marcar el punto 4 de `tasks/placeholders.md` cuando las credenciales estén puestas.
- `ROADMAP.md:63`: reformular a «Login social (Google)» dejando constancia de la decisión de
  alcance (solo Google) que ya recoge `tasks/fase1/08-login-google.md`.

## Orden de ejecución sugerido (un diff revisable por paso)

1. **F1 + F2 + F3** — botón, ruta y errores en el frontend. Es lo que desbloquea probar el
   flujo entero; sin esto no se puede validar nada. *(Boilerplate: lo pico yo.)*
2. **C1** — credenciales reales y primera prueba manual en local. *(Manual, Adrián.)*
3. **B1 + B2 + B4 (state y redirect) + B6** — seguridad del flujo. *(Núcleo: lo picas tú con
   mi guía; te explico `state` antes.)*
4. **B3** — guard y filtro de errores.
5. **B5 + F4** — perfil del comprador (solo si se confirma la decisión 4a).
6. **C2** — documentación y roadmap, en el commit del último paso.

## Verificación

Manual (no hay tests de frontend):

1. `/login` → "Continuar con Google" → elegir cuenta → vuelvo logueado a la home, sin 404.
2. Con carrito lleno: `/checkout` → login con Google → **vuelvo al checkout**, no a la home.
3. Cancelar en la pantalla de Google → aterrizo en `/login` con aviso claro, sin JSON crudo.
4. Manipular el callback a mano (`/auth/google/callback?code=x&state=falso`) → rechazado con
   redirect a `/login?error=oauth`, sin sesión emitida.
5. Cuenta de Google con un email **ya registrado** por el flujo local → entra a la **misma**
   cuenta (ve sus pedidos), no crea una duplicada.
6. Usuario nuevo por Google → `emailVerifiedAt` puesto, y al ir al checkout se le piden los
   datos personales.
7. Cuenta creada por Google → `/recuperar-password` le permite **establecer** una contraseña
   local y luego entrar por email (ya soportado).
8. Borrar la cuenta (derecho al olvido) y volver a entrar con Google → cuenta nueva y limpia,
   sin acceso a los pedidos de la anterior.

Automático:

- `pnpm --filter @localiator/api test`
- `pnpm --filter @localiator/web build` y `tsc -b --noEmit`

## Estimación

Frontend pequeño (una página nueva de ~30 líneas, un botón por página, un aviso). Backend
mediano: el store de `state` es la única pieza con miga real; el guard/filtro y el throttle
son mecánicos. El bloque de perfil (B5+F4) es el más grande y es **separable**: si se decide
(c), se cae entero.
