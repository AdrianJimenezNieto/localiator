# Handoff: Localiator — estructura del frontend (ecommerce de lotes/unidades, recogida en almacén)

> Objetivo de este paquete: que Claude Code monte la **estructura del frontend** en **React 19 + TypeScript** a partir de estos wireframes.

---

## Overview

Localiator es una tienda online **propia** (no marketplace) que vende productos muy variados comprados en plataformas de subasta, ofrecidos como **lotes** (varios artículos con un estado) o como **unidades sueltas**. Particularidad de negocio clave:

- **No hay envío.** Todos los pedidos se **recogen en un almacén de origen**. El checkout, por tanto, no pide dirección: pide **almacén de recogida + franja horaria**, y la confirmación entrega un **código/QR de recogida**.
- Cada producto es **lote** (`kind: 'lot'`, con lista de artículos y estado) o **unidad** (`kind: 'unit'`, con stock, frecuentemente 1).
- Funcionalidades presentes: **favoritos/wishlist**, **cupones de descuento**, **recogida local** (elección de almacén).

Diseño **mobile-first**, responsive a escritorio.

---

## About the Design Files

Los ficheros de este paquete son **referencias de diseño creadas en HTML** (wireframes), **no** código de producción para copiar tal cual. La tarea es **recrear estas pantallas en React 19 + TypeScript**, usando las librerías y patrones que decida el equipo (router, gestión de estado, sistema de estilos). Si aún no existe un entorno, elegir el stack más apropiado e implementar allí.

El fichero principal es un lienzo (canvas) con todas las pantallas dispuestas en tarjetas. Cada pantalla tiene un identificador estable (`1d`, `1f`, `1h`, …) referenciado más abajo.

---

## Fidelity

**Low-fidelity (lofi).** Son wireframes: muestran **estructura, jerarquía y flujo**, no el estilo final. Cajas rayadas = imágenes a colocar; barras grises = texto/precio.

- Usar los wireframes como guía de **layout y funcionalidad**.
- Aplicar el **sistema de diseño propio** del equipo para colores, tipografía, sombras y componentes. Los únicos valores intencionales son: fondo de acento **ámbar** para CTAs y avisos de recogida, y el patrón de **navegación** (ver más abajo). No copiar los tonos beige/gris del wireframe — son placeholders.

---

## Selección bloqueada (flujo definitivo)

El cliente ha elegido una variante por pantalla. **Implementar solo estas:**

| Pantalla | ID wireframe | Variante elegida |
|---|---|---|
| Navegación móvil | `1b` | Bottom **tab bar** (Inicio · Buscar · Favoritos · Cuenta) + hamburguesa para árbol de categorías; carrito 🛒 fijo arriba derecha |
| Home | `1d` | Buscador + chips de categoría + banner + carruseles de novedades + rejilla de categorías |
| Catálogo / Buscar | `1f` | Filtros en **drawer** (móvil) / **panel lateral fijo** (escritorio) + orden |
| Detalle de producto | `1h` | Galería + ficha + **barra de compra fija** abajo (móvil) |
| Carrito | `1j` | Líneas de producto + `QtyStepper` + `CouponInput` + resumen |
| Checkout | `1l` | **Una sola página** (acordeón de pasos) + resumen fijo |
| Login / registro | `1m` | Pestañas Entrar/Registrarme + Google + **continuar como invitado** |
| Cuenta / perfil | `1n` | Lista: pedidos y recogidas · favoritos · cupones · almacén preferido · datos |
| Confirmación | `1o` | Éxito + tarjeta de recogida (almacén, franja, **código/QR**) |

Flujo de compra: **Home → Catálogo/Buscar → Detalle → Carrito → (Login o invitado) → Checkout (recogida + pago) → Confirmación.**

---

## Screens / Views

### Navegación global (`1b`)
- **Propósito:** acceso permanente a los 4 destinos y al carrito.
- **Layout móvil:** `TopBar` arriba (hamburguesa ☰ · logo centrado · ♡ · 🛒) + `TabBar` inferior fija con 4 ítems (icono + etiqueta), ítem activo resaltado.
- **Layout escritorio:** `TopBar` (logo · buscador · ♡ · avatar · 🛒) + barra de categorías horizontal debajo. Sin tab bar.
- **Comportamiento:** la hamburguesa abre un menú a pantalla completa (móvil) / mega-menú o drawer (escritorio) con el árbol de categorías.

### Home (`1d`)
- **Propósito:** entrar por búsqueda o descubrir novedades/categorías.
- **Layout:** buscador destacado → fila de chips de categoría (scroll horizontal) → banner promocional → carrusel "Novedades" (tarjetas) → rejilla "Categorías" (4 columnas móvil, más en escritorio).
- **Componentes:** `SearchBar`, `FilterChip` (categorías), `ProductCard` (con `LotBadge`/`Pill` "Lote ×N" o "Unidad"), tiles de categoría.

### Catálogo / Buscar (`1f`)
- **Propósito:** filtrar y explorar resultados heterogéneos.
- **Layout móvil:** cabecera con volver + búsqueda; barra de acciones `⚙ Filtros` / `↕ Ordenar`; rejilla de 2 columnas de `ProductCard`. El botón Filtros abre un **drawer a pantalla completa**.
- **Layout escritorio:** **panel lateral de filtros fijo** a la izquierda + rejilla de 3 columnas a la derecha; control de orden arriba a la derecha.
- **Filtros (propios del negocio):** Categoría · **Tipo (Lote / Unidad)** · **Estado (nuevo / usado / devolución)** · Precio (rango) · **Almacén de recogida**.
- **Componentes:** `FilterDrawer`, `FilterSidebar`, `FilterChip`, `PriceRange`, `SortMenu`, `ProductCard`.

### Detalle de producto (`1h`)
- **Propósito:** resolver 3 dudas: qué incluye el lote, en qué estado, y dónde/cuándo se recoge.
- **Layout móvil:** cabecera (volver · ♡ · compartir) → galería (swipe, con dots) con `LotBadge` superpuesto → título → tags (estado, unidades disponibles) → precio → **aviso de recogida** (almacén + disponibilidad, en ámbar) → sección "Contenido del lote (N artículos)" → descripción → **barra de compra fija abajo** (♡ + "Añadir al carrito").
- **Layout escritorio:** miniaturas verticales + imagen principal grande + columna derecha con badge, título, precio, tags, aviso de recogida, CTA "Añadir al carrito" y "Guardar en favoritos". Breadcrumb arriba.
- **Componentes:** `Gallery`, `LotBadge`, `ConditionTag`, `LotContents`, `FavButton`, `StickyBuyBar`, `Button`.

### Carrito (`1j`)
- **Propósito:** revisar, ajustar cantidades y aplicar cupón antes del checkout.
- **Layout:** aviso de almacén de recogida arriba → líneas de producto (miniatura, badge, título, precio, `QtyStepper`) → `CouponInput` ("Aplicar") → resumen (subtotal, descuento de cupón en verde, "Envío: Sin envío · recogida gratuita") → CTA "Tramitar recogida →".
- **Componentes:** `CartLine`, `QtyStepper`, `CouponInput`, `OrderSummary`.

### Checkout (`1l`)
- **Propósito:** completar la compra sin envío.
- **Layout:** **página única con acordeón de pasos**: `1 · Identificación` (✓ / editar) → `2 · Recogida` (**`WarehousePicker`** desplegable + **`PickupSlotPicker`** con franjas en chips) → `3 · Pago` (método: Tarjeta/PayPal/Bizum + campos). Columna/panel de **resumen** (artículos, cupón, "Recogida: Gratis", Total) fijo en escritorio; colapsado arriba en móvil.
- **Clave:** **no hay dirección de envío**; el paso "Recogida" la sustituye.
- **Componentes:** acordeón de pasos, `WarehousePicker`, `PickupSlotPicker`, campos de pago, `OrderSummary`.

### Login / registro (`1m`)
- **Propósito:** autenticar sin bloquear la venta.
- **Layout:** pestañas Entrar / Registrarme → campos email + contraseña → CTA → separador → "Continuar con Google" → **"Continuar como invitado"** → "¿Olvidaste la contraseña?".
- **Comportamiento:** se permite comprar como invitado; el email se pide antes de confirmar la recogida (para avisos).

### Cuenta / perfil (`1n`)
- **Propósito:** gestión del usuario.
- **Layout:** cabecera con avatar + nombre/email → lista de accesos: **📦 Mis pedidos y recogidas** (centro: estado pendiente/recogido) · **♡ Favoritos** · **🏷 Mis cupones** · **📍 Almacén preferido** · **👤 Datos personales** · Cerrar sesión. Tab bar con "Cuenta" activa.

### Confirmación de pedido (`1o`)
- **Propósito:** confirmar y dar instrucciones de recogida (no de envío).
- **Layout:** check de éxito → mensaje → **tarjeta de recogida**: 📍 Almacén, 🗓 Franja, 🔖 **Código de recogida** (p.ej. `LC-4821`) + **QR** → botones "Ver pedido" y "Seguir comprando".

---

## Interactions & Behavior

- **Navegación:** tab bar cambia de sección sin recargar; hamburguesa abre categorías; carrito abre `/carrito`.
- **Añadir al carrito:** desde tarjeta (unidad) o desde detalle; actualiza contador del icono 🛒 y estado global.
- **Favoritos:** `FavButton` alterna (optimista) y sincroniza con `useFavorites`.
- **Filtros:** aplicar filtros actualiza la lista y el contador de resultados ("Ver 128 resultados"); en móvil el drawer confirma con CTA.
- **Cupón:** validar contra backend; mostrar descuento en verde o error inline.
- **Checkout:** avanzar de paso valida el anterior; no cambia de URL. `WarehousePicker` obligatorio antes de `PickupSlotPicker`; ambos obligatorios antes de pago.
- **Invitado:** el flujo de compra no exige login; pide email en checkout.
- **Estados a contemplar:** carga (skeletons de tarjeta), vacío (carrito vacío, sin favoritos, sin resultados), error (pago/cupón), stock agotado (unidad con 0 / lote ya vendido).
- **Responsive:** móvil = 1–2 columnas + drawers + barras fijas; escritorio = paneles laterales fijos + rejillas 3–4 columnas.

---

## State Management

Stores (Context API o Zustand — decisión del equipo):

- **`useCart`** — `items: CartItem[]`, `add()`, `remove()`, `setQty()`, `subtotal`, `appliedCoupon`, `total`.
- **`useFavorites`** — `ids: string[]`, `toggle(id)`, `has(id)`.
- **`usePickup`** — `warehouse: Warehouse | null`, `slot: PickupSlot | null`.
- **`useAuth`** — `user: User | null` (o invitado), `login()`, `logout()`, `isGuest`.

Datos a obtener del backend: catálogo/búsqueda con filtros, detalle de producto (incl. contenido de lote), lista de almacenes + franjas disponibles, validación de cupón, creación de pedido.

---

## Tipos clave (TypeScript)

```ts
type Condition = 'nuevo' | 'usado' | 'devolucion';

interface LotItem { name: string; qty: number; condition: Condition; }

interface ProductBase {
  id: string;
  title: string;
  price: number;          // en céntimos
  images: string[];
  categorySlug: string;
  warehouseId: string;    // almacén donde se recoge
}

interface Lot extends ProductBase {
  kind: 'lot';
  items: LotItem[];
  condition: Condition;   // estado global del lote
}

interface Unit extends ProductBase {
  kind: 'unit';
  stock: number;          // frecuentemente 1
}

type Product = Lot | Unit;

interface Warehouse { id: string; name: string; address: string; }
interface PickupSlot { id: string; date: string; window: 'AM' | 'PM'; }
interface Coupon { code: string; percentOff: number; }

interface Order {
  id: string;
  items: { productId: string; qty: number }[];
  coupon?: Coupon;
  pickup: { warehouse: Warehouse; slot: PickupSlot };
  code: string;           // código/QR de recogida, p.ej. "LC-4821"
  status: 'pendiente' | 'recogido';
}
```

> Nota: **no existe `shipping`/dirección de envío** en el modelo. El pedido guarda `pickup`.

---

## Rutas (React Router)

`AppLayout` = `TopBar` + (`TabBar` en móvil) + `<Outlet/>`.

```
/                      Home              (1d)
/buscar                SearchResults     (1f)
/categoria/:slug       Catalog           (1f)
/producto/:id          ProductDetail     (1h)
/favoritos             Favorites
/carrito               Cart              (1j)
/checkout              Checkout          (1l)   // pasos internos, misma URL
/pedido/:id            OrderConfirmation (1o)
/login                 Auth              (1m)
/cuenta                Account           (1n)
  ├ /cuenta/pedidos    Orders
  ├ /cuenta/favoritos  Favorites
  ├ /cuenta/cupones    Coupons
  └ /cuenta/datos      Profile
```

---

## Componentes compartidos sugeridos

- **Layout:** `AppLayout`, `TopBar`, `TabBar`, `SearchBar`, `WarehouseBanner`.
- **Producto:** `ProductCard`, `LotBadge`, `ConditionTag`, `Gallery`, `LotContents`, `FavButton`.
- **Catálogo:** `FilterDrawer`, `FilterSidebar`, `FilterChip`, `PriceRange`, `SortMenu`.
- **Compra:** `QtyStepper`, `CouponInput`, `OrderSummary`, `WarehousePicker`, `PickupSlotPicker`, `StickyBuyBar`.
- **UI base:** `Button`, `Pill/Badge`, `Chip`, `EmptyState`, `Skeleton`.

Piezas propias del negocio a cuidar: `LotBadge`/`ConditionTag`/`LotContents` (lote vs. unidad) y `WarehousePicker`/`PickupSlotPicker` (recogida en vez de envío).

---

## Design Tokens

Los tokens finales los define el sistema de diseño del equipo. Los únicos valores **intencionales** del wireframe:

- **Acento CTA / recogida:** ámbar `#ffb703` (botones primarios y avisos de recogida).
- **Éxito:** verde (descuento de cupón, confirmación).
- **Navegación móvil:** tab bar inferior de 4 ítems + carrito fijo en `TopBar`.

Todo lo demás (beige de fondo, grises de las barras) es **placeholder de wireframe** — sustituir por el sistema propio.

---

## Assets

Sin assets finales. Todas las imágenes son placeholders (cajas rayadas). El equipo aportará: logo de Localiator, imágenes de producto/lote, iconos de navegación (o set de iconos elegido), y el QR de recogida (generado a partir de `Order.code`).

---

## Files

- `Wireframes Localiator.dc.html` — lienzo con todas las pantallas y variantes. Las pantallas a implementar son las de la tabla "Selección bloqueada" (`1b, 1d, 1f, 1h, 1j, 1l, 1m, 1n, 1o`). El turno 2 del lienzo (`2a–2d`) resume flujo, rutas, componentes y estado.

---

## Prompt sugerido para Claude Code

> Monta la estructura de un frontend de ecommerce en **React 19 + TypeScript** siguiendo este README y el HTML de referencia adjunto. Es una tienda de lotes/unidades con **recogida en almacén (sin envío)**. Crea el proyecto (Vite), configura React Router con las rutas indicadas, define los tipos de `Tipos clave`, crea los stores (`useCart`, `useFavorites`, `usePickup`, `useAuth`) y monta los componentes compartidos y las 9 pantallas de "Selección bloqueada" como wireframes funcionales (layout + navegación + estado), con datos mock. Es **low-fidelity**: prioriza estructura, rutas y estado sobre estilo; deja el estilado listo para aplicar un sistema de diseño después. Respeta la particularidad de que el checkout usa `WarehousePicker` + `PickupSlotPicker` en lugar de dirección de envío.
