# 02 · Política de privacidad + RGPD (derecho al olvido)

**Checkbox del roadmap:** «Política de privacidad + RGPD (derecho al olvido)».

## Objetivo
Publicar la **política de privacidad** y dar soporte real al **derecho al olvido**: que un
comprador pueda solicitar el borrado/anonimización de su cuenta y datos personales. A
diferencia de la tarea 01 (texto estático), esta **sí toca backend**, porque hay que borrar o
anonimizar datos sin romper el histórico contable de pedidos/facturas.

## Qué se toca
- `apps/web/src/pages/PrivacyPage.tsx` — política de privacidad (texto).
- `apps/api/src/auth/` (o un `users` module) — endpoint de borrado/anonimización de cuenta.
- `apps/api/prisma/schema.prisma` — posible campo `deletedAt`/`anonymizedAt` en `User`.
- `apps/web/src/pages/` — botón «Eliminar mi cuenta» en el área de usuario.

## Cómo implementarlo
1. **Política de privacidad**: qué datos se recogen (email, nombre, datos de pedido), base
   legal, finalidad, conservación, encargados de tratamiento (**Stripe**, **Resend**,
   **Cloudflare Turnstile** — coherente con `CLAUDE.md`), y cómo ejercer derechos ARCO.
2. **Derecho al olvido — decisión clave**: no se puede borrar sin más un usuario que tiene
   **facturas** (obligación de conservación fiscal). Optar por **anonimizar**: sustituir
   email/nombre por valores tipo `borrado+<id>@localiator.invalid`, marcar `anonymizedAt`,
   invalidar sesiones/refresh tokens, y **conservar** las facturas ya emitidas por deber legal.
3. **Endpoint autenticado** `DELETE /users/me` (o `/auth/me`): solo el propio usuario;
   confirma, anonimiza y cierra sesión. Registrar la acción en auditoría (`CLAUDE.md`).
4. **Rate limiting / confirmación** para evitar borrados accidentales o abuso.
5. **Tests:** el usuario anonimiza su cuenta; las facturas siguen existiendo; no puede
   volver a autenticarse; otro usuario no puede borrar la cuenta ajena (`403`).

## Decisiones / alternativas
- **Anonimizar vs. borrado físico total:** el borrado total chocaría con la conservación
  fiscal de facturas; anonimizar cumple el RGPD (dato ya no es personal) sin romper la
  contabilidad. Es el equilibrio estándar.
- **Soft-delete (`deletedAt`) vs. borrado real de la fila `User`:** soft-delete/anonimización
  mantiene la integridad referencial de `Order`/`Invoice`; borrar la fila obligaría a cascadas
  peligrosas.
- **Autoservicio vs. solicitud manual por email:** autoservicio es mejor UX y demostrable
  ante la ley; se puede empezar por solicitud manual si el autoservicio no da tiempo, pero se
  prefiere el endpoint.

## Conceptos que probablemente convenga repasar
- **RGPD/anonimización vs. seudonimización** y su choque con la conservación fiscal.
- **Invalidación de refresh tokens** al borrar cuenta (encaja con la sesión de Fase 1).

## Hecho cuando
- Existe la política de privacidad publicada y enlazada desde el footer.
- Un comprador puede solicitar la eliminación y su cuenta queda anonimizada, con sesiones
  invalidadas y facturas conservadas.
- Hay tests de los casos anteriores y **la CI (lint + build + test) está en verde**.

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...` / `feat(web): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
