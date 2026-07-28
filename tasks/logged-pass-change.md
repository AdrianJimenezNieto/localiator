# Plan: cambio de contraseña ESTANDO logueado

Añadir el flujo de **cambiar la contraseña desde "Mi cuenta"** para un usuario con
sesión iniciada, introduciendo su contraseña **actual** y una **nueva**. Es el caso
que quedó explícitamente **fuera** de la tarea de reset por email (`cambio-pass.md`),
y a diferencia de aquella toca **backend + frontend**.

## Alcance

- **DENTRO:** endpoint nuevo `POST /auth/change-password` (protegido) + sección
  "Cambiar contraseña" en `AccountPage`.
- **FUERA:** cualquier cambio en el flujo de reset por email (ya hecho), gestión de
  "sesiones activas" como pantalla (ver dispositivos), y 2FA.

## Estado actual (lo que ya existe y se reutiliza)

Backend en `apps/api/src/auth/`:

- `PasswordService` — `hash()` / `verify()` sobre argon2id. Se reutiliza tal cual.
- `IsStrongPassword()` (`dto/password.decorator.ts`) — política compartida (mín. 10,
  letra + número + carácter especial, máx. 72). La nueva contraseña la reutiliza.
- `SessionService.revokeAllForUser(userId)` y `.issue(user, meta)` — ya existen; con
  ellos montamos la estrategia de sesión (ver decisión 2).
- `AuthService.resetPassword()` — patrón de referencia (hash + update + revocado de
  sesiones). El método nuevo es un primo suyo, pero con reautenticación por contraseña
  en vez de por token de email.
- `CurrentUser` decorator + `JwtAuthGuard` global — el endpoint protegido recibe el
  usuario autenticado sin `@Public`.
- `MailService.send(to, subject, html)` — genérico; sirve para el aviso de seguridad
  (decisión 4).

Frontend:

- `AccountPage.tsx` (ruta `/cuenta`, ya protegida: redirige a login si no hay sesión).
  Hoy solo tiene la "zona peligrosa" de borrado de cuenta. Aquí añadimos la sección.
- `useAuth()` (`lib/auth.tsx`) — expone `token`, `user` y setters internos; si
  mantenemos la sesión actual (decisión 2) hay que **actualizar el `token`** tras el
  cambio, así que añadimos un método al contexto.
- `apiSend` (`lib/api.ts`) — cliente HTTP; manda la cookie (`credentials: include`) y
  acepta el access token por cabecera.

## Decisiones de diseño (para revisar antes de picar)

### 1. Reautenticación con la contraseña actual (innegociable)

El endpoint **exige `currentPassword`** y lo verifica con `password.verify()` contra el
hash guardado, aunque el usuario ya tenga sesión válida. Motivo: proteger contra
"secuestro de sesión" (alguien en un equipo desatendido) y contra CSRF efectivo. Es el
estándar para acciones sensibles (GitHub, Google… lo piden). Un `currentPassword`
incorrecto → `400`/`401` con mensaje genérico.

### 2. Estrategia de sesiones: **mantener la actual, revocar las demás** (recomendada)

Al cambiar la contraseña queremos invalidar cualquier sesión abierta en **otros**
dispositivos (por si la contraseña estaba comprometida), pero **sin echar al usuario
del dispositivo actual**, que es quien está haciendo el cambio a propósito.

Implementación: tras actualizar el hash,
1. `session.revokeAllForUser(userId)` — revoca TODO, incluida la sesión actual.
2. `session.issue(user, meta)` — emite una sesión nueva para este dispositivo.
3. El controller pone el nuevo refresh en la cookie y devuelve el nuevo `accessToken`
   (igual que hace `login`). El frontend actualiza el token en memoria.

- **Alternativa A (más simple):** revocar todo y **no** re-emitir → el usuario queda
  deslogueado y vuelve a `/login`, exactamente como el reset por email. Menos código
  (no se toca `auth.tsx`), pero peor UX para una acción voluntaria.
- **Alternativa B (más fina, descartada por ahora):** revocar solo las sesiones
  DISTINTAS a la actual, sin rotar la actual. Requiere identificar el refresh token
  actual desde la cookie y excluirlo; más lógica en `SessionService` para poca
  ganancia. La opción recomendada (revocar todo + re-emitir) consigue el mismo efecto
  reutilizando métodos que ya existen.

> **Decisión abierta para Adrián:** ¿opción recomendada (mantener sesión, toca
> `auth.tsx`) o alternativa A (deslogueo total, más simple)? El resto del plan asume la
> recomendada; si eliges A, se cae el paso de `auth.tsx` y el frontend redirige a login.

### 3. Cuentas solo-Google (`passwordHash = null`)

Un usuario creado por OAuth no tiene contraseña local que "cambiar". Si llega aquí con
`passwordHash` null → `400` con mensaje que le remite a **"recuperar contraseña"**
(`/recuperar-password`), flujo que ya sirve para *establecer* una por primera vez
(está documentado así en `resetPassword`). En el frontend, ocultamos o deshabilitamos
la sección si detectamos que la cuenta no tiene contraseña local (requiere exponer ese
dato; ver "Cuestión a decidir" abajo).

### 4. Aviso por email del cambio (recomendado, seguridad)

Tras un cambio correcto, enviar un email "tu contraseña se ha cambiado" con
`MailService.send()`. Es una buena práctica: si el cambio no lo hizo el titular, se
entera y puede reaccionar (usar el reset). Es **best-effort**: si el envío falla, el
cambio ya está hecho, así que se captura el error y se loguea sin romper la respuesta.
Alternativa: omitirlo en el MVP. Lo dejo como recomendado pero marcable como opcional.

### 5. Anti-bot: rate limiting sí, Turnstile no

En login/registro/reset usamos `AntiBotGuard` (honeypot + Turnstile) porque son puntos
**públicos** y anónimos. Aquí el usuario ya está autenticado, así que meter un CAPTCHA
es fricción sin ganancia real. Propuesta:

- **Sí** `@Throttle(STRICT_THROTTLE)` (5/min) para frenar el bruteforce del
  `currentPassword`.
- **No** `AntiBotGuard` (ni honeypot ni Turnstile). El DTO **no** hereda de `AntiBotDto`.

Alternativa: reutilizar `AntiBotGuard` por consistencia. Descartada por la fricción y
porque el rate limit + la reautenticación ya cubren el abuso.

### 6. `newPassword` distinta de `currentPassword`

Rechazar (`400`) si la nueva contraseña coincide con la actual: no tiene sentido y suele
ser un error del usuario. Comprobación barata en el servicio.

## Trabajo a realizar — Backend

### B1. DTO — `dto/change-password.dto.ts`

```ts
export class ChangePasswordDto {
  @IsString() @MinLength(1)
  currentPassword!: string;

  @IsStrongPassword()   // misma política que registro/reset
  newPassword!: string;
}
```

**No** hereda de `AntiBotDto` (decisión 5).

### B2. Servicio — `AuthService.changePassword(userId, currentPassword, newPassword)`

1. Cargar `user` por `id`. Si `passwordHash` es null → `BadRequestException` remitiendo
   al reset (decisión 3).
2. `password.verify(user.passwordHash, currentPassword)`; si falla → `Unauthorized`
   (mensaje genérico "La contraseña actual no es correcta").
3. Si `newPassword === currentPassword` → `BadRequest` (decisión 6). *(Se compara en
   claro lo que llega en el body; no hace falta re-hashear para esto.)*
4. `hash(newPassword)` → `user.update({ passwordHash })`.
5. Estrategia de sesión (decisión 2): la maneja el **controller**, no el servicio,
   porque necesita la request/response (cookie + meta). El servicio devuelve el
   `AuthenticatedUser` actualizado para que el controller re-emita.
6. Email de aviso best-effort (decisión 4), en try/catch con log.

> Nota de diseño: dejo la parte de cookie/sesión en el controller (como ya hacen
> `login`/`refresh`), y el servicio solo valida + actualiza el hash. Así el servicio no
> depende de `Request`/`Response`.

### B3. Controller — `AuthController.changePassword`

```ts
@Throttle(STRICT_THROTTLE)
@Post('change-password')
@HttpCode(HttpStatus.OK)
async changePassword(
  @CurrentUser() user: RequestUser,
  @Body() dto: ChangePasswordDto,
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
) {
  const authUser = await this.authService.changePassword(
    user.userId, dto.currentPassword, dto.newPassword,
  );
  await this.session.revokeAllForUser(authUser.id);   // decisión 2
  const session = await this.session.issue(authUser, this.meta(req));
  return this.respondWithSession(res, session);        // set-cookie + { accessToken, user }
}
```

Sin `@Public` → el `JwtAuthGuard` global exige access token válido. Reutiliza los
helpers privados `respondWithSession` / `meta` que ya existen.

*(Ajustar la firma de `changePassword` en el servicio para que devuelva el
`AuthenticatedUser`; los nombres exactos de `RequestUser.userId` conviene confirmarlos
al picar.)*

### B4. Tests — `auth.service.spec.ts` / (opcional) e2e del controller

Casos mínimos: contraseña actual correcta → hash cambia; actual incorrecta → error;
cuenta solo-Google → error remitiendo al reset; nueva == actual → error. Seguir el
estilo de los specs ya existentes.

## Trabajo a realizar — Frontend

### F1. Método `changePassword` en el contexto — `lib/auth.tsx`

Con la decisión 2 (mantener sesión), el endpoint devuelve un `accessToken` nuevo que hay
que guardar en memoria. Añadir al contexto:

```ts
changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
```

que hace `apiSend('POST', '/auth/change-password', { currentPassword, newPassword }, token)`
y, en éxito, `setToken(accessToken)` (y refresca `user` si hiciera falta). Va en el
contexto —y no en la página con `apiSend` directo como el reset— **precisamente porque
sí toca el estado de sesión** (el token en memoria). Es el criterio que ya usa el
proyecto: verificación/reset no tocan sesión → `apiSend` directo; login/register/este →
contexto.

*(Si se elige la alternativa A del deslogueo total, este método no hace falta: la página
llama a `apiSend` y luego a `logout()` + redirect a `/login`.)*

### F2. Sección "Cambiar contraseña" en `AccountPage.tsx`

Nueva `<section>` (antes de la zona peligrosa) con formulario:

- **Contraseña actual**, **Nueva contraseña**, **Repetir nueva contraseña** (los tres
  `type="password"`, `required`).
- Texto de política igual que en registro/reset ("mín. 10, letra + número + carácter
  especial").
- Validación en cliente: las dos nuevas coinciden (como en `ResetPasswordPage`); el
  resto lo valida el backend.
- Estados `submitting` / `error` / `done` (mensaje de éxito inline, sin salir de la
  página, ya que la sesión se mantiene).
- Si la cuenta es solo-Google, mostrar en su lugar un aviso con enlace a
  `/recuperar-password` para *establecer* contraseña (ver cuestión a decidir).

Sin Turnstile ni honeypot (decisión 5), así que el formulario es más simple que los de
auth públicos.

## Cuestión a decidir (dato de "cuenta con contraseña local")

Para ocultar la sección a los usuarios solo-Google, el frontend necesita saber si la
cuenta tiene `passwordHash`. Hoy `GET /auth/me` / `AuthUser` **no** expone eso. Opciones:

- **(a)** Añadir un booleano `hasPassword` al payload de `/auth/me` (pequeño cambio en
  `jwt.strategy` o en el endpoint). Limpio pero toca el shape de la sesión.
- **(b)** No ocultar nada: mostrar siempre la sección y dejar que el backend responda
  con el `400` "usa recuperar contraseña" si es solo-Google. Cero cambios extra; peor
  UX en un caso poco común.

Propuesta: **(b) para el MVP**, y dejar (a) anotado para cuando haya más "ajustes de
cuenta". Confirmar con Adrián.

## Verificación

Manual (no hay tests de frontend):

1. Logueado, `/cuenta` → cambiar contraseña con la actual correcta → éxito, **sigo
   logueado** (no me echa) y puedo recargar sin re-login.
2. Abrir sesión en otro navegador/incógnito con el mismo usuario; cambiar la contraseña
   en el primero → el segundo, al hacer una acción que renueve token, queda deslogueado
   (sesiones revocadas).
3. Contraseña actual incorrecta → error claro, sin cambiar nada.
4. Nueva contraseña débil → mensaje de política (del backend).
5. Cuenta creada por Google → aviso remitiendo a "recuperar contraseña".
6. (Si se implementa) llega el email de aviso de cambio (mirar Resend → Logs).

Automático:

- `pnpm --filter @localiator/api test` (specs de auth en verde).
- `pnpm --filter @localiator/web build` y `tsc -b --noEmit` en verde.

## Fuera de alcance / no hacer

- Pantalla de "sesiones activas / dispositivos" con revocado selectivo.
- 2FA / verificación en dos pasos.
- Cambios en el flujo de reset por email (ya está hecho).

## Estimación

Backend pequeño (DTO + método de servicio calcado de `resetPassword` + endpoint que
reutiliza helpers ya existentes + un par de tests). Frontend pequeño (un método en el
contexto + una sección de formulario en una página ya existente). Dos diffs revisables
de una sentada (uno backend, uno frontend).
