# 12 · Guards de rol por endpoint (RBAC)

**Checkbox del roadmap:** «Guards de rol en cada endpoint (RBAC)».

## Objetivo
Garantizar el control de acceso por rol exigido en `CLAUDE.md`: un `comprador` no puede tocar
rutas de `administrador`. Se apoya en el guard de autenticación del `09` (que ya identifica
al usuario) y añade la capa de autorización por rol.

## Qué se toca
- `apps/api/src/auth/` — `RolesGuard` + decorador `@Roles(...)`.
- `apps/api/src/app.module.ts` — registro del guard (global o por controlador).
- `packages/shared/src/index.ts` — `UserRole` como fuente de verdad de los valores de rol.

## Cómo implementarlo
1. **Autenticación primero.** El `JwtAuthGuard` del `09` valida el access token y pone
   `req.user` (con `role`). RBAC asume que esto ya corrió.
2. **Decorador `@Roles(UserRole.ADMIN)`.** Usa `SetMetadata` para anotar en el handler qué
   roles se permiten. Se lee con `Reflector` dentro del guard.
3. **`RolesGuard`.** Implementa `CanActivate`: lee los roles requeridos con `Reflector`
   (mirando handler y clase). Si no hay `@Roles`, la ruta solo requiere estar autenticado. Si
   los hay, comprueba que `req.user.role` esté entre los permitidos; si no, `403 Forbidden`.
4. **Estrategia de aplicación.** Recomendado: **denegar por defecto**.
   - Guard de auth global (todo requiere login salvo rutas marcadas `@Public()` — catálogo,
     home, login, registro).
   - `RolesGuard` global o por controlador para exigir rol donde haga falta (backoffice
     admin de Fase 3).
   Decorador `@Public()` para las rutas abiertas (invitado).
5. **Rol `invitado`.** No es un valor en BD: es el usuario **no autenticado** que solo accede
   a rutas `@Public()`. No necesita entrada en el enum de Prisma.
6. **Tests.** Cubrir: acceso permitido, `401` sin token, `403` con rol insuficiente. Es
   lógica de seguridad → merece tests explícitos.

## Decisiones / alternativas
- **Denegar por defecto + `@Public()`** vs. permitir por defecto + proteger a mano: denegar
  por defecto es mucho más seguro (olvidar proteger una ruta no la deja abierta). Es la
  práctica recomendada.
- **Guards globales** vs. aplicarlos ruta a ruta: globales reducen el riesgo de olvido; a
  cambio hay que marcar explícitamente lo público.
- **RBAC simple (rol único)** vs. permisos granulares: con solo dos roles, RBAC por rol
  basta; permisos finos serían sobreingeniería ahora.

## Conceptos a repasar (para tus notas)
- Guards de NestJS, `CanActivate` y el ciclo de ejecución (¿antes o después de los pipes?).
- `Reflector` y metadatos con `SetMetadata` / decoradores personalizados.
- Diferencia autenticación (quién eres, `401`) vs. autorización (qué puedes, `403`).
- Principio de "denegar por defecto".

## Hecho cuando
- Existe `@Roles()` + `RolesGuard` y las rutas admin devuelven `403` a un comprador.
- Las rutas públicas están marcadas explícitamente; el resto exige autenticación.
- Hay tests de acceso permitido, `401` y `403`.
