# 10 · Sliding expiration ~15 días por inactividad

**Checkbox del roadmap:** «Sliding expiration ~15 días por inactividad».

## Objetivo
Que la sesión "estilo YouTube" (ver `CLAUDE.md`) se mantenga viva mientras el usuario sigue
usando la web, pero se cierre sola tras **~15 días de inactividad**. Construye sobre la
mecánica de tokens del `09-sesion-tokens.md`.

## Qué se toca
- `apps/api/src/auth/` — lógica de renovación del refresh token.
- `apps/api/prisma/schema.prisma` — campo(s) de expiración en `RefreshToken`.
- `.env`: `REFRESH_TOKEN_INACTIVITY_TTL` (~15 días).

## Cómo implementarlo
1. **Concepto.** "Sliding" = cada uso válido **empuja hacia delante** la fecha de
   caducidad. Se implementa en la rotación del refresh (`/auth/refresh`): cada vez que se
   renueva, el **nuevo** refresh token recibe `expiresAt = now() + 15 días`. Si el usuario
   no vuelve en 15 días, el refresh caduca y no puede renovar → sesión cerrada.
2. **Dónde vive el reloj.** El access token corto (~15 min) hace que el front pida
   `/auth/refresh` con frecuencia mientras se usa la web; cada refresh reinicia la ventana de
   15 días. La inactividad real (pestaña cerrada, sin uso) hace que no haya refresh y la
   ventana expire.
3. **Ventana absoluta (opcional).** Valorar un tope máximo absoluto de sesión (p. ej. 90
   días) además del deslizante, para que una sesión no viva indefinidamente aunque se use a
   diario. Anotar la decisión; para el MVP puede omitirse.
4. **Limpieza de tokens expirados.** Los `RefreshToken` caducados se acumulan en BD. Añadir
   una tarea programada (`@nestjs/schedule`, cron) que borre los expirados periódicamente, o
   borrarlos de forma oportunista al fallar una renovación. Anotar cuál se elige.

## Decisiones / alternativas
- **Sliding sobre el refresh token** (elegido) vs. sesión de duración fija: el deslizante da
  la experiencia "recordado mientras lo uso" que pide `CLAUDE.md`. Fija sería más simple pero
  peor UX.
- **Solo deslizante** vs. **deslizante + tope absoluto:** el tope absoluto es más seguro
  (limita robo de sesión de larga vida) a costa de re-login ocasional. Recomendado añadirlo
  en Fase 5; opcional ahora.
- **Cron de limpieza** vs. limpieza oportunista: el cron mantiene la tabla pequeña; la
  oportunista es más simple pero deja basura. Elegir según preferencia.

## Conceptos a repasar (para tus notas)
- Sliding expiration vs. expiración absoluta.
- Cómo el par access-corto / refresh-largo materializa la inactividad.
- Tareas programadas en NestJS (`@nestjs/schedule`).

## Hecho cuando
- Cada renovación reinicia la caducidad del refresh a ~15 días.
- Tras 15 días sin actividad, el refresh caduca y la sesión se cierra sola.
- Hay una estrategia decidida (cron u oportunista) para limpiar tokens expirados.
