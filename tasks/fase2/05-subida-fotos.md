# 05 · Subida y gestión de fotos + estado real del artículo

**Checkbox del roadmap:** «Subida y gestión de fotos + estado real del artículo».

## Objetivo
Permitir al admin subir fotos reales de cada producto/lote (muchos con desperfectos, por eso
la foto y el `condition` son clave). El esquema ya guarda `photos String[]` y
`condition ItemCondition`; aquí se añade la **subida y gestión** de esas fotos.

## Qué se toca
- `apps/api/src/catalog/upload.controller.ts` — endpoint de subida (admin).
- `apps/api/src/catalog/storage.service.ts` — guardar el archivo y devolver su URL.
- `apps/api/src/main.ts` / módulo estático — servir los archivos subidos.
- `docker-compose.yml` — volumen persistente para las fotos (no perderlas al recrear).
- `.env.example` — variables de ruta/límites si aplican.

## Cómo implementarlo
1. **Almacenamiento local en el VPS (coste cero).** Guardar los archivos en un directorio
   montado como **volumen Docker** y servirlos como estáticos (o vía Nginx en Fase 4). Se
   descarta S3/Cloudinary por el principio de coste mínimo de `CLAUDE.md`.
2. **Endpoint `POST /uploads` (admin)** con `multipart/form-data` (interceptor de NestJS,
   p. ej. `FileInterceptor` de `multer`). Devuelve la(s) URL(s) resultante(s).
3. **Validación estricta del archivo (seguridad):**
   - Tipo MIME permitido (jpeg/png/webp) verificado, no solo por extensión.
   - Tamaño máximo por archivo.
   - Nombre de archivo **regenerado** (cuid/uuid), nunca el nombre del cliente (evita path
     traversal y colisiones).
4. **Asociar a la entidad.** Las URLs devueltas se guardan en `photos` del `Product`/`Lot`
   vía el `PATCH` de `02`/`03`. Permitir **reordenar y borrar** fotos editando el array.
5. **Borrado.** Al quitar una URL del array, borrar también el archivo físico (o dejar
   limpieza para más adelante; documentar la decisión).
6. **Tests.** Subida OK devuelve URL; MIME no permitido → `400`; archivo demasiado grande →
   `413`/`400`; ruta protegida (`403` sin admin).

## Decisiones / alternativas
- **Disco local + volumen vs. object storage:** local respeta coste cero y basta para el
  MVP. Si el catálogo crece mucho, se migra a almacenamiento externo en el futuro (la URL en
  `photos` desacopla ese cambio).
- **Guardar solo URLs vs. tabla `Photo`:** el esquema ya usa `String[]`; suficiente para
  reordenar/borrar. Una tabla con metadatos se valoraría si hiciera falta alt-text/orden
  explícito por SEO.
- **Regenerar nombre de archivo:** imprescindible por seguridad; nunca confiar en el nombre
  que manda el cliente.

## Hecho cuando
- Un admin sube fotos y quedan asociadas al producto/lote, servidas por URL estable.
- Las fotos persisten al recrear los contenedores (volumen configurado).
- Validación de tipo/tamaño y ruta protegida cubiertas por tests, con
  **la CI (lint + build + test) en verde**.

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
