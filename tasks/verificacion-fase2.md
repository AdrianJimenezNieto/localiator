# Verificación Fase 2 — Catálogo y backoffice (tareas 01–13)

Guía para **revisar y entender** el catálogo y el backoffice de admin, y para
**verificar** que funciona. Léela de arriba abajo: primero el mapa mental (cómo
encajan las piezas), luego los flujos, luego los patrones clave y por último la
verificación práctica.

El backend vive en `apps/api/src/catalog/` (módulo `catalog`); el frontend estrena
casi todo `apps/web/src/`. Cada tarea se mergeó en su propia PR (#18 a #30).

> Contexto de nombres: la Fase 1 (auth) se documentó en `verificacion-fase1.md`.
> Este documento cubre el siguiente tramo: el catálogo público, la API de gestión
> y el backoffice de administración.

---

## 1. Mapa: qué archivo hace qué

### Backend — módulo `catalog` (`apps/api/src/catalog/`)

**Cableado**
- **`catalog.module.ts`** — declara TODO el módulo: los controladores (categorías,
  productos, lotes, subida y catálogo público) y sus servicios. Se importa en
  `app.module.ts`.
- **`app.module.ts`** (raíz) — añade `CatalogModule`. Los **guards globales** de
  Fase 1 (`Throttler` → `JwtAuth` → `Roles`) siguen protegiendo todo: aquí solo se
  decide, ruta a ruta, qué es `@Public()` y qué exige `@Roles(ADMIN)`.
- **`main.ts`** — además de lo de Fase 1, ahora **sirve las fotos** subidas como
  estáticos bajo `/uploads` (`useStaticAssets`).

**Gestión de admin (CRUD, `@Roles(ADMIN)`)**
- **`category.controller.ts` / `category.service.ts`** — CRUD de `Category`. El
  `GET /categories` es `@Public()` (lo necesita el catálogo); el resto, admin.
- **`product.controller.ts` / `product.service.ts`** — CRUD de `Product` + listado
  admin (`GET /products`, todos, incluidos agotados).
- **`lot.controller.ts` / `lot.service.ts`** — espejo del anterior para `Lot`.
- **`upload.controller.ts` / `storage.service.ts`** — subida de fotos
  (`POST /uploads`) y su guardado/validación/borrado en disco.

**Catálogo público (lectura, `@Public()`)**
- **`catalog.controller.ts` / `catalog.service.ts`** — listado paginado con
  filtros (`GET /catalog/products`, `/catalog/lots`) y ficha por id
  (`GET /catalog/products/:id`, `/catalog/lots/:id`).

**Piezas compartidas (lógica pura, testeable y reutilizable)**
- **`catalog-support.ts`** — validaciones comunes a producto y lote
  (`assertCategoryExists`, `assertDiscountNotAbovePrice`). Se comparten SIN fusionar
  las entidades.
- **`audit.util.ts`** — `diffAuditableFields`: compara antes/después y devuelve una
  entrada por campo auditable que cambió (precio/descuento/stock).
- **`slug.util.ts`** — `slugify` (kebab-case sin acentos) para el slug de categoría.
- **`dto/`** — validación de entrada con `class-validator`:
  - `create-*.dto.ts` / `update-*.dto.ts` (los update son `PartialType` del create).
  - `list-catalog.dto.ts` — query params de paginación + filtros.
  - `is-not-greater-than.decorator.ts` — validador **de campo cruzado**
    (`descuento ≤ precio`), reutilizado por producto y lote.

**Tests** (`*.spec.ts`, Prisma mockeado, sin BD): `category`, `product`, `lot`,
`catalog`, `storage` y `audit.util`. En total **76 tests** en `apps/api`.

**Modelos Prisma** — no se añadió ninguno: `Category`, `Product`, `Lot`, `AuditLog`
y los enums (`ItemCondition`, `AuditEntity`, `AuditField`) ya existían de Fase 1.
Solo se **conectó** la lógica a ellos.

### Frontend (`apps/web/src/`) — antes era el starter de Vite

**Andamiaje / librería (`lib/`)**
- **`api.ts`** — cliente HTTP fino sobre `fetch`: `apiGet` (público), `apiSend`
  (POST/PATCH/DELETE con token), `apiUpload` (multipart) y `toQuery` (query strings).
  Traduce los errores de NestJS a un `ApiError` con `status`.
- **`useApi.ts`** — hook de fetching que **re-pide al cambiar el `path`** (base del
  listado y los filtros por URL); guarda anti-condición-de-carrera.
- **`useAuthedData.ts`** — como `useApi` pero envía el token y expone `reload()`
  (para refrescar tras una mutación en el backoffice).
- **`useDebounce.ts`** — retarda un valor (búsqueda por texto).
- **`auth.tsx`** — `AuthProvider` + `useAuth`: sesión en el navegador (login/logout,
  restauración vía refresh cookie, `isAdmin`).
- **`format.ts`** — céntimos↔euros, etiquetas de estado, opciones de `ItemCondition`.
- **`adminTypes.ts`** — tipos e ayudas del backoffice (`Category`, `AdminItem`,
  rutas por tipo de artículo).

**Catálogo público**
- **`pages/CatalogPage.tsx`** — home: grid paginado + filtros (drawer en móvil).
- **`pages/DetailPage.tsx`** — ficha por tipo (`kind`), con 404 limpio.
- **`components/ProductCard.tsx`**, **`Pagination.tsx`**, **`FiltersPanel.tsx`**,
  **`Gallery.tsx`** — tarjeta, paginación, panel de filtros y galería de fotos.

**Backoffice (`pages/admin/` + `components/admin/`)**
- **`ProtectedAdmin.tsx`** — guarda de ruta (redirige si no eres admin).
- **`AdminLayout.tsx`** — cabecera con navegación + logout.
- **`AdminLoginPage.tsx`** — login de admin.
- **`ItemsAdminPage.tsx`** — tabla de gestión de productos/lotes (`kind`).
- **`ItemFormPage.tsx`** — alta/edición de producto/lote (`kind`).
- **`CategoriesAdminPage.tsx`** — gestión de categorías.
- **`components/admin/PhotoManager.tsx`** — subir, reordenar y quitar fotos.

**Rutas / layout**
- **`main.tsx`** — define el router (catálogo público + `/admin/*`) y envuelve todo
  en `AuthProvider`.
- **`App.tsx`** — layout público (cabecera + `<Outlet/>`).

**Tipos compartidos** (`packages/shared/src/index.ts`) — `Paginated<T>`,
`CatalogItem` (tarjeta), `CatalogDetail` (ficha), y los valores de `ItemCondition`
para que el frontend no dependa del cliente de Prisma.

---

## 2. Cómo hablan entre sí: los flujos

### Alta de catálogo (admin) — 01/02/03
```
POST /categories        (admin)  → CategoryService.create
  slug = slug dado | slugify(name); valida parentId; @unique → 409
POST /products | /lots  (admin)  → Product/LotService.create
  ValidationPipe (CreateDto: dinero en céntimos, descuento ≤ precio vía validador
  de campo cruzado, condition ∈ ItemCondition)
  → assertCategoryExists (400 legible si no existe, no el P2003 de la FK)
  → prisma.create
```

### Auditoría atómica al editar — 04
```
PATCH /products/:id | /lots/:id  (admin)  → Service.update(id, dto, actorId)
  actorId = @CurrentUser().userId
  valida (categoría, descuento ≤ precio contra el valor persistido)
  → prisma.$transaction:
       lee 'antes' (findUniqueOrThrow) → update → diffAuditableFields(antes, después)
       → auditLog.createMany (1 fila por campo cambiado: PRICE/DISCOUNT/STOCK)
  Todo se confirma o nada: imposible cambiar precio/stock sin dejar traza.
```

### Subida de fotos — 05
```
POST /uploads  (admin, multipart)  → UploadController → StorageService.save
  FileInterceptor (memoryStorage) → el archivo llega en buffer
  valida por MAGIC BYTES (jpeg/png/webp, no por extensión) → 400 si no
  valida tamaño → 413
  nombre REGENERADO (uuid) → escribe en UPLOAD_DIR → devuelve URL absoluta
main.ts sirve UPLOAD_DIR bajo /uploads (estático, público)
La URL se guarda en photos[] del producto/lote vía el PATCH de 02/03.
```

### Catálogo público — 06/07/08 (API) + 09/10/11 (web)
```
Navegador (CatalogPage) --- URL con ?page & filtros --->
  useApi construye el path  →  GET /catalog/products?page&pageSize&q&categoryId&
                                minPriceCents&maxPriceCents&condition
    CatalogService.paginate:
      buildWhere (stock>0 + filtros presentes)  →  findMany(select tarjeta) + count
      en la misma transacción  →  { items, total, page, pageSize }
  ← tarjetas + metadatos de paginación (tipo Paginated<CatalogItem> compartido)

Click en tarjeta → /productos/:id (DetailPage) → GET /catalog/products/:id
    findFirst con stock>0 → 404 si no existe/agotado → CatalogDetail
```
Regla de oro: **página y filtros viven en la URL**; cambiar un filtro reconstruye el
`path`, `useApi` re-pide y (por diseño) resetea a la página 1.

### Backoffice con sesión — 13
```
Arranque de la web:
  AuthProvider → POST /auth/refresh (cookie HttpOnly) → accessToken (en memoria)
             → GET /auth/me → { userId, email, role }

/admin/* → ProtectedAdmin: si no isAdmin → redirige a /admin/login
         (la barrera REAL es @Roles(ADMIN) en el backend; esto es solo UX)

Gestión: las páginas usan useAuthedData (GET con token) para listar y apiSend/
apiUpload (con token) para crear/editar/borrar/subir; reload() refresca la tabla.
```

---

## 3. Patrones y decisiones clave (el "por qué")

1. **Producto y Lote son entidades separadas, a propósito.** Misma forma, sin
   contención. Se **duplica** controller/service/DTO en vez de un genérico
   parametrizado: si en el futuro divergen, no habrá que deshacer una abstracción.
   Solo se comparten validaciones **puras** (`catalog-support.ts`).
2. **Dinero siempre en céntimos (Int).** La aritmética con enteros evita errores de
   coma flotante. La conversión euros↔céntimos vive **solo** en el frontend
   (`format.ts`); la API rechaza cualquier cosa que no sea entero.
3. **Auditoría atómica.** El `update` y los `AuditLog` van en la **misma**
   `$transaction`: o ambos o ninguno. Es lo que hace imposible un cambio de
   precio/stock sin traza (exigencia de `CLAUDE.md`).
4. **Validar en el service lo que la FK haría feo.** `assertCategoryExists` da un
   `400` legible en vez del `P2003` opaco de Prisma. Las colisiones de `@unique`
   (slug) se traducen a `409`.
5. **Borrado seguro.** Categoría con artículos → se **bloquea** (409), no cascada.
   Producto/lote → borrado **físico** por ahora (lo más simple que no bloquea el
   futuro); a revisar en Fase 3 cuando estén en pedidos/reservas.
6. **Subida de fotos: nunca fiarse del cliente.** Se valida por **contenido**
   (magic bytes), no por extensión ni `mimetype` (falsificables), y se **regenera**
   el nombre (uuid) para evitar path traversal y colisiones.
7. **`select` explícito.** El listado devuelve solo lo de la tarjeta; la ficha, solo
   lo público (sin `stock` exacto, solo `available`). Ni se sobre-transfiere ni se
   filtran campos internos.
8. **Estado en la URL.** Página y filtros son query params → la búsqueda es
   compartible, recargable y base de SEO; un solo flujo de datos (`useApi` re-pide
   al cambiar el path).
9. **Tipos compartidos** (`packages/shared`) entre API y web: la forma de la
   paginación, la tarjeta y la ficha no pueden divergir sin que el build lo note.
10. **Defensa en profundidad en el admin.** Guard de frontend (`ProtectedAdmin`,
    solo UX) + `@Roles(ADMIN)` global en el backend (la barrera real). El access
    token vive **solo en memoria**; el refresh, en cookie HttpOnly (patrón de Fase 1).

### Conceptos a repasar (consolidados de todo el slice)
- **NestJS**: `PartialType` (mapped-types); `FileInterceptor`/multer y `memoryStorage`;
  servir estáticos (`useStaticAssets`); `@Query`/`ParseIntPipe` y `class-transformer`
  (`@Type`, `@Transform`) para convertir/validar query params.
- **Prisma**: `$transaction` **interactiva** (callback) vs **en array** (lista de
  operaciones) — se usan las dos aquí (auditoría vs listado+count); `findFirst` con
  `where` de visibilidad; `select`/`include`; construcción dinámica del `where`.
- **class-validator**: validador **de campo cruzado** con `registerDecorator`;
  `@IsEnum`, arrays (`each: true`), saneamiento (trim, longitud máxima).
- **React**: Context + hook (`AuthProvider`/`useAuth`); rutas anidadas y `<Outlet/>`
  de react-router; rutas protegidas con `<Navigate>`; estado en la URL
  (`useSearchParams`); **debounce**; condición de carrera en `useEffect` (flag
  `cancelled`).
- **Seguridad de subida de archivos**: validación por *magic bytes*, *path traversal*,
  regeneración de nombre; por qué el access token va en memoria y no en `localStorage`.

---

## 4. Guía de verificación

### 4.1 Requisitos previos
```bash
docker compose up -d db          # Postgres en localhost:5433
pnpm install
# Migraciones + datos de prueba (incluye admin con contraseña REAL)
cd apps/api && export $(grep -E '^(DATABASE_URL|POSTGRES)' ../../.env | xargs)
pnpm exec prisma migrate deploy
pnpm db:seed
```
> El seed crea `admin@localiator.dev` / `Localiator123` (hash argon2 real) y
> `buyer@localiator.dev` con la misma contraseña. Es una credencial de **desarrollo**.
> Sin `TURNSTILE_SECRET_KEY` el anti-bot no bloquea, así que el login funciona.

### 4.2 Lint + build + tests (lo que valida CI)
```bash
pnpm lint && pnpm build && pnpm test
# Esperado: verde. 76 tests en apps/api.
```

### 4.3 Arrancar todo y probar en el navegador
```bash
pnpm dev        # API en :3000 y web en :5173 (HMR)
```
- **Catálogo**: abre `http://localhost:5173` → grid de productos del seed, con
  paginación; prueba los filtros (texto, categoría, precio, estado) y mira cómo la
  URL cambia. En móvil (devtools responsive) los filtros se pliegan en un acordeón.
- **Ficha**: clic en una tarjeta → `/productos/:id`. Prueba un id inventado
  (`/productos/nope`) → página "no disponible" limpia (404), no un crash.
- **Backoffice**: `http://localhost:5173/admin` → te redirige a `/admin/login`.
  Entra con `admin@localiator.dev` / `Localiator123`. Crea/edita un producto, sube
  una foto, y comprueba que aparece en el catálogo público. Prueba borrar una
  categoría con artículos → error legible (409).

### 4.4 Probar la API a mano (sin frontend)
```bash
# Login admin y captura del access token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@localiator.dev","password":"Localiator123","website":""}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
```

**Denegar por defecto / RBAC**
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/products            # 401 (sin token)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/products -H "Authorization: Bearer $TOKEN"  # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/catalog/products    # 200 (público)
```

**Catálogo público: paginación y filtros (06/07)**
```bash
curl -s "http://localhost:3000/catalog/products?pageSize=2"                 # { items, total, page, pageSize }
curl -s "http://localhost:3000/catalog/products?q=taladro"                  # busca en nombre/descripción
curl -s "http://localhost:3000/catalog/products?minPriceCents=2000&maxPriceCents=3000"
curl -s "http://localhost:3000/catalog/products?condition=NEW&condition=GOOD"
```

**CRUD + validación de dinero (02)**
```bash
CAT=$(curl -s http://localhost:3000/categories | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
# descuento > precio → 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"x\",\"description\":\"d\",\"condition\":\"NEW\",\"priceCents\":100,\"discountCents\":200,\"stock\":1,\"categoryId\":\"$CAT\"}"
```

**Auditoría atómica (04)** — al cambiar precio+stock se crean 2 filas en `AuditLog`:
```bash
# (crea un producto, guarda su id en PID y ejecuta)
curl -s -X PATCH http://localhost:3000/products/$PID \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"priceCents":1500,"stock":5}'
# Comprobar en la BD:
docker compose exec db psql -U localiator -d localiator \
  -c "select field, \"oldValue\", \"newValue\" from \"AuditLog\" where \"entityId\"='$PID';"
```

**Subida de fotos (05)**
```bash
# genera un PNG 1x1 y súbelo
python3 -c "import base64;open('/tmp/px.png','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMFAT9DrHTuAAAAAElFTkSuQmCC'))"
URL=$(curl -s -X POST http://localhost:3000/uploads -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/px.png" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['url'])")
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "$URL"                    # 200 image/png (servida)
echo "no soy imagen" > /tmp/fake.png
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/uploads \
  -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/fake.png"                       # 400 (magic bytes)
```

### 4.5 Decisiones que conviene recordar (anotadas, no olvidadas)
- **Borrado físico** de producto/lote → revisar **soft-delete** en Fase 3 (cuando
  estén en pedidos/reservas).
- **Ficha por id, no por slug**: el slug (SEO/URLs amigables) se pospone a Fase 4.
- **Fotos en disco local + volumen** `uploads` (declarado en `docker-compose.yml`):
  se montará al contenedorizar la API en Fase 4; hoy en dev es `apps/api/uploads`.
- **Filtro de agotados**: el catálogo público solo muestra `stock > 0`; el listado
  admin muestra todos.

### 4.6 Lo que queda fuera de este slice
- **Frontend de auth "de comprador"** (registro/login público, Turnstile, honeypot):
  aquí solo se hizo el **login de admin** mínimo necesario para el backoffice.
- **Compra**: la ficha tiene un CTA "Comprar" deshabilitado; carrito, reserva de
  stock y pago son **Fase 3**.
- **Limpieza de fotos huérfanas** al borrar un artículo, **búsqueda full-text** y
  **índice de precio**: anotados para optimizar/endurecer más adelante.
