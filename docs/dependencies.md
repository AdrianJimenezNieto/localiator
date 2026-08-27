# Gestión de vulnerabilidades en dependencias

Cómo se mantienen las dependencias sanas de forma automática y continua (Fase 4,
tarea 11). Cumple el punto de `CLAUDE.md` sobre gestión de vulnerabilidades.

## Herramientas

- **Dependabot** (`.github/dependabot.yml`): abre PRs semanales de actualización
  para el ecosistema `npm`/pnpm y para las GitHub Actions. Agrupa parches y menores
  en un único PR para no saturar el flujo GitHub Flow. Cada PR pasa la CI antes de
  poder mergearse.
- **`pnpm audit` en CI** (`.github/workflows/ci.yml`, job `audit`): en cada push/PR
  ejecuta `pnpm audit --audit-level=high` y **falla el pipeline** si hay
  vulnerabilidades altas o críticas.
- (Recomendado, manual) activar en GitHub: **Dependabot alerts** y, si es gratis para
  el repo, **CodeQL** para análisis estático de seguridad. Ver `tasks/manual.md`.

## Política de actuación

- **Críticas / altas**: se atienden **antes del siguiente release**. Normalmente
  basta mergear el PR de Dependabot o forzar la versión parcheada con un `override`.
- **Moderadas / bajas**: se agrupan y se atienden en el ciclo normal de
  actualizaciones semanales de Dependabot.

## Overrides y allowlist

- **Override aplicado**: `@nestjs/platform-express` arrastraba una `multer <2.2.0`
  vulnerable (GHSA-72gw-mp4g-v24j, DoS). Se fuerza la parcheada con `overrides` en
  `pnpm-workspace.yaml`. Retirar cuando Nest actualice su dependencia.
- **Overrides aplicados (agosto 2026)**: cuatro advisories altos publicados después
  del último release, todos en dependencias transitivas de tooling. Se fuerza la
  versión parcheada de cada uno en `pnpm-workspace.yaml`; el motivo concreto está en
  el comentario de cada línea:
  - `js-yaml` (GHSA-5p4m-2wfm-xmqj, CPU cuadrática en `!!omap`): fijado **por
    líneas**, `3.15.2` y `4.3.2`. No se unifican: istanbul (vía jest) espera la API
    de la 3.
  - `nanoid` (GHSA-2v37-7h3g-55p8): línea 3 a `3.3.18`, que es la que pide postcss.
  - `deepmerge-ts` (GHSA-ggr8-5vv4-36mx): a `8.x`, salto de **major** en una
    transitiva del CLI de Prisma. Es el único parche que existe. Verificado que
    `prisma generate`, `validate` y `migrate status` siguen cargando su
    configuración; conviene revisarlo si el CLI empieza a fallar al arrancar el
    contenedor.

  Nota: `pnpm audit` consulta la base de datos de advisories **viva**, así que un
  pipeline puede ponerse rojo sin que nadie haya tocado el `pnpm-lock.yaml`. Antes de
  buscar la causa en el último commit, comprobar si el aviso es nuevo.
- **Falsos positivos**: si una alerta no aplica (p. ej. solo afecta a un uso que no
  hacemos), se puede silenciar de forma **justificada y temporal** añadiendo su GHSA
  a `pnpm.auditConfig.ignoreGhsas` en `pnpm-workspace.yaml`, documentando el motivo.
  No se silencia nada sin justificación.
