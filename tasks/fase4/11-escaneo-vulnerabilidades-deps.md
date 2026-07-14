# 11 · Escaneo automático de vulnerabilidades en dependencias

**Checkbox del roadmap:** «Escaneo automático de vulnerabilidades en dependencias».

## Objetivo
Detectar y actualizar dependencias vulnerables de forma **automática y continua**, no manual.
Cierra el punto de `CLAUDE.md` sobre gestión de vulnerabilidades y se integra en la CI ya
existente (`.github/workflows/ci.yml`).

## Qué se toca
- `.github/dependabot.yml` — nuevo: actualizaciones automáticas de dependencias.
- `.github/workflows/ci.yml` (o un workflow nuevo) — paso de auditoría (`pnpm audit`).
- Opcional: activar **CodeQL** / alertas de seguridad de GitHub en el repo.

## Cómo implementarlo
1. **Dependabot:** configurar actualizaciones para el ecosistema `npm`/pnpm (y para
   `docker`/`github-actions` si aplica), agrupando parches menores para no inundar de PRs.
   Cada PR de Dependabot pasa la CI antes de mergear.
2. **Auditoría en CI:** añadir `pnpm audit --audit-level=high` (o similar) que **falle** el
   pipeline ante vulnerabilidades altas/críticas, con posibilidad de *allowlist* temporal
   justificada para falsos positivos.
3. **Alertas de GitHub:** activar Dependabot alerts y, si el repo lo permite gratis, CodeQL
   para análisis estático de seguridad.
4. **Política de actuación:** definir que las vulnerabilidades **críticas/altas** se atienden
   antes del siguiente release; las bajas se agrupan. Documentarlo brevemente.
5. **Ruido controlado:** agrupar/limitar PRs automáticas para que el flujo GitHub Flow del
   repo no se sature.

## Decisiones / alternativas
- **Dependabot vs. Renovate:** Dependabot está integrado en GitHub sin coste ni infra;
  Renovate es más configurable pero añade setup. Para este repo, Dependabot basta.
- **`pnpm audit` que bloquea vs. solo informativo:** bloquear en `high`/`critical` fuerza a
  no ignorar lo grave; informativo se ignora con el tiempo. Se elige bloquear con allowlist
  para casos justificados.
- **CodeQL sí/no:** se activa si es gratuito para el repo; aporta análisis estático sin coste
  recurrente (`CLAUDE.md`).

## Hecho cuando
- Dependabot abre PRs de actualización que pasan por la CI.
- La CI falla ante vulnerabilidades altas/críticas de dependencias.
- Hay una política breve de cómo se atienden las alertas. **La CI está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`ci(repo): ...` / `chore(repo): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
