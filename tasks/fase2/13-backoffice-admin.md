# 13 · Panel de administración (backoffice) básico

**Checkbox del roadmap:** «Panel de administración (backoffice) básico».

## Objetivo
Interfaz web para que el `administrador` gestione el catálogo desde el navegador (sin tocar
la API a mano): dar de alta/editar productos, lotes y categorías, y subir fotos. Cierra la
Fase 2 uniendo por UI todo lo construido en `01`–`08`.

## Qué se toca
- `apps/web/src/admin/` — rutas y páginas del backoffice (protegidas por rol).
- Formularios de producto/lote/categoría; subida de fotos; listados de gestión.
- Guardas de ruta en el frontend + apoyo en el RBAC del backend (Fase 1).

## Cómo implementarlo
1. **Rutas protegidas.** Sección `/admin/*` accesible solo a usuarios con rol `ADMIN`. La
   protección **real** la impone el backend (`@Roles(ADMIN)`); en el frontend se oculta/redirige
   la UI, pero nunca se confía solo en el cliente.
2. **Listados de gestión.** Tablas de productos, lotes y categorías con acciones
   crear/editar/borrar, reutilizando los endpoints admin de `01`/`02`/`03`.
3. **Formularios.** Alta y edición con validación en cliente (reflejo de los DTOs del
   backend): campos obligatorios, dinero en euros→céntimos, `condition`, categoría (selector),
   descuento ≤ precio. Mostrar los errores `400`/`409` de la API de forma legible.
4. **Subida de fotos** integrada con el endpoint de `05`: subir, previsualizar, reordenar y
   quitar fotos del artículo.
5. **Feedback de auditoría (opcional, ligero).** Como `04` registra cambios de precio/stock,
   valorar mostrar un aviso "este cambio quedará auditado" o un pequeño historial. No es
   imprescindible para cerrar el checkbox.
6. **UX honesta.** Confirmación antes de borrar; estados de carga/guardado; deshabilitar
   botones mientras se envía para evitar dobles envíos.

## Decisiones / alternativas
- **Backoffice propio mínimo vs. panel admin genérico (p. ej. React-Admin):** propio y
  mínimo respeta el coste cero y evita una dependencia grande para pocas pantallas. Si el
  backoffice crece mucho, se reconsidera.
- **Protección solo en frontend vs. defensa en profundidad:** siempre defensa en profundidad
  — el guard del backend es la barrera real; el frontend solo mejora la UX.
- **Alcance "básico":** para cerrar Fase 2 basta CRUD + fotos usables. Métricas, filtros
  avanzados del panel o edición masiva quedan fuera (backlog).

## Hecho cuando
- Un admin gestiona productos, lotes y categorías y sube fotos íntegramente desde el
  navegador.
- Las rutas `/admin/*` no son accesibles para no-admin (frontend redirige y backend deniega).
- Formularios con validación y errores legibles; confirmación de borrado.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
   Con esto **la Fase 2 queda completa**.
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
