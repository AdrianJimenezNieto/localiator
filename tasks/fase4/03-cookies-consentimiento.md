# 03 · Banner y política de cookies / consentimiento

**Checkbox del roadmap:** «Banner y política de cookies / consentimiento».

## Objetivo
Cumplir la normativa de cookies: un **banner de consentimiento** que permita aceptar/rechazar
cookies no esenciales antes de activarlas, más la **página de política de cookies**. Depende
de las páginas legales de la tarea 01 (footer y estilo) y debe respetar que las cookies
**técnicas** (sesión/refresh token de Fase 1, Turnstile) son exentas de consentimiento.

## Qué se toca
- `apps/web/src/components/CookieBanner.tsx` — nuevo banner de consentimiento.
- `apps/web/src/lib/` — utilidad de estado de consentimiento (guardado en `localStorage`).
- `apps/web/src/pages/CookiesPage.tsx` — política de cookies (texto).
- `apps/web/src/App.tsx` — montar el banner y la ruta `/cookies`.

## Cómo implementarlo
1. **Clasificar las cookies** que usa la web: **técnicas/exentas** (refresh token HttpOnly de
   sesión, Turnstile antibot — necesarias, no requieren consentimiento) vs. **no esenciales**
   (analítica u otras futuras — requieren opt-in). Hoy casi todo es técnico; el banner deja el
   marco listo para cuando entren métricas (backlog).
2. **Banner**: opciones **Aceptar** / **Rechazar** (y opcional «Configurar»). Rechazar debe
   ser tan fácil como aceptar (requisito legal). Guardar la elección y no volver a mostrarlo.
3. **No activar** ninguna cookie/script no esencial hasta que haya consentimiento explícito;
   si en el futuro se añade analítica, cargarla solo tras el opt-in.
4. **Política de cookies**: tabla con nombre, finalidad, duración y titular de cada cookie,
   enlazada desde el banner y el footer.
5. **Persistencia del consentimiento** con versión, para poder re-solicitarlo si cambian las
   cookies usadas.

## Decisiones / alternativas
- **Solución propia vs. CMP de terceros (Cookiebot, etc.):** propia porque el principio de
  `CLAUDE.md` es coste mínimo y hoy apenas hay cookies no esenciales; una CMP de pago sería
  desproporcionada.
- **`localStorage` vs. cookie para guardar el consentimiento:** `localStorage` evita crear
  otra cookie y basta para recordar la elección en el mismo navegador.
- **Bloquear por defecto (opt-in) vs. opt-out:** opt-in por defecto, que es lo exigible en la
  UE: nada no esencial se activa sin aceptación previa.

## Hecho cuando
- El banner aparece en la primera visita con Aceptar/Rechazar igual de accesibles.
- La elección se recuerda y no reaparece salvo cambio de versión.
- Ninguna cookie no esencial se activa sin consentimiento; existe la política de cookies.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(web): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
