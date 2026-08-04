# Calendario de subastas

**Checkbox del roadmap:** nuevo (Fase 5, va después de «Listado de subastas en la web»).

**Reparto:** el **endpoint de rango** (`listAuctionsForCalendar`) y la **agrupación por día
en zona horaria** los pica **Adrián** — es donde está la lógica que interesa aprender. La
**rejilla del mes**, los tests de calendario y el cableado de rutas, **Claude**.

## Objetivo

Hoy la única forma de descubrir subastas es `/subastas`: una rejilla paginada ordenada por
`endsAt asc`. Sirve para «qué hay ahora», pero no responde a la pregunta que se hace un
comprador recurrente: **«¿qué cierra esta semana? ¿y el mes que viene?»**. El calendario
da esa vista temporal: una rejilla mensual donde cada día muestra cuántas subastas cierran,
y al pulsar un día se ven las tarjetas de ese día.

Ruta pública nueva: **`/subastas/calendario`**.

## Decisiones ya tomadas

Las tres se acordaron antes de escribir este plan; las alternativas descartadas están abajo.

1. **Datos**: endpoint nuevo por rango de fechas, sin paginar.
2. **Vista**: rejilla mensual + panel del día seleccionado debajo.
3. **Fecha que marca la subasta**: el **cierre** (`endsAt`).

## Qué se toca

**API**
- `apps/api/src/auctions/dto/calendar-auctions.dto.ts` *(nuevo)* — `from` / `to`.
- `apps/api/src/auctions/auctions.controller.ts` — ruta `GET /auctions/calendar`.
- `apps/api/src/auctions/auctions.service.ts` — `listAuctionsForCalendar`.
- `apps/api/src/auctions/auctions.service.spec.ts` — tests.

**Shared**
- `packages/shared/src/index.ts` — nada nuevo si se reutiliza `AuctionListItem` (ver paso 3).

**Web**
- `apps/web/src/pages/AuctionsCalendarPage.tsx` *(nuevo)*.
- `apps/web/src/components/AuctionCalendarGrid.tsx` *(nuevo)* — solo la rejilla, sin fetching.
- `apps/web/src/lib/calendar.ts` *(nuevo)* — utilidades de fechas puras y testeables.
- `apps/web/src/main.tsx` — ruta `subastas/calendario`.
- `apps/web/src/pages/AuctionsListPage.tsx` — enlace «Ver calendario».
- `apps/api/src/seo/seo.service.ts` — añadir la ruta al sitemap.

---

## Cómo implementarlo

### 1. DTO del rango (`CalendarAuctionsDto`)

Dos campos obligatorios, `from` y `to`, como fecha ISO. Reglas:

- Validar con `@IsDateString()` y convertir a `Date` con `@Type(() => Date)`.
- **Tope de ventana**: rechazar (400) rangos de más de **62 días** (~2 meses). Sin paginación,
  el tope de ventana es lo único que impide que alguien pida `from=2000&to=2100` y se traiga la
  tabla entera. Es el equivalente a `MAX_AUCTION_PAGE_SIZE` en `list-auctions.dto.ts`.
- Rechazar `to <= from`.
- **Estados**: los mismos `PUBLIC_AUCTION_STATUSES` que ya exporta `list-auctions.dto.ts`
  (`LIVE`, `SCHEDULED`, `CLOSED`) — reutilizar la constante, no duplicarla. En el calendario
  las `CLOSED` sí entran por defecto: un mes pasado sin nada pintado sería una vista vacía y
  desconcertante.

> La validación cruzada (`to > from`, ventana ≤ 62 días) no la hace un decorador suelto: o
> escribes un validador propio con `registerDecorator`, o lo compruebas en el servicio y
> lanzas `BadRequestException`. Para una regla sola, la segunda opción es más simple y más
> fácil de leer.

### 2. `GET /auctions/calendar`

En `auctions.controller.ts`, con `@Public()` por ruta (mismo motivo que el listado: no hay
`@Roles` de clase, y `RolesGuard` no mira `@Public()` — está explicado en el comentario de
cabecera del controlador).

**Ojo con el orden de las rutas.** `@Get('calendar')` debe declararse **antes** que cualquier
`@Get(':id')` que exista o se añada después; si no, Nest hace match de `:id = "calendar"` y
devuelve un 404 de subasta. Es un fallo clásico y silencioso.

### 3. `listAuctionsForCalendar` en el servicio

Casi todo es reaprovechable de `listPublicAuctions` (`auctions.service.ts:485`):

```
where: {
  status: { in: PUBLIC_AUCTION_STATUSES },
  endsAt: { gte: from, lt: to },
}
orderBy: { endsAt: 'asc' }
include: { bids: { orderBy: { amountCents: 'desc' }, take: 1 }, _count: { select: { bids: true } } }
```

Después, el mismo `resolveItems(rows)` para enriquecer con nombre y foto del artículo
(recuerda: `itemType`/`itemId` es polimórfico, sin FK, así que Prisma no puede hacer el
`include` y hay que resolverlo a mano agrupando por tipo).

**Devuelve `AuctionListItem[]` plano, sin `Paginated`**: no hay `total` ni `page` que dar, y
el front necesita el mes entero para pintar la rejilla. La forma de cada elemento es idéntica
a la del listado, así que **`AuctionCard` se reutiliza tal cual** en el panel del día — ese es
el motivo de no inventar un tipo nuevo.

Para evitar duplicar el mapeo `row → AuctionListItem` entre los dos métodos, **extrae ese
bloque a un privado** (`toListItem(row, item)`) y que ambos lo usen.

**Índice**: el `where` filtra por `status` + rango de `endsAt` y ordena por `endsAt`. Comprueba
en `schema.prisma` si ya hay un índice que lo cubra; si no, añade `@@index([status, endsAt])`
con su migración. Con pocas filas da igual, pero es el índice correcto y cuesta una línea.

### 4. Agrupación por día — **la parte delicada**

`endsAt` se guarda en **UTC**. El calendario tiene que agrupar por **día natural en
Europa/Madrid**, que en verano va +2h respecto a UTC. Si agrupas con `toISOString().slice(0,10)`,
una subasta que cierra el **1 de julio a las 00:30 (hora española)** cae en el **30 de junio**
de la rejilla. El bug aparece solo en las subastas de madrugada y solo parte del año, que es la
peor combinación posible para detectarlo.

En `apps/web/src/lib/calendar.ts`, la clave del día se calcula con `Intl`:

```ts
const DAY_KEY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' });
// 'sv-SE' formatea como YYYY-MM-DD, que es justo la clave que queremos.
export const dayKey = (iso: string) => DAY_KEY.format(new Date(iso));
```

Ese fichero contiene solo funciones puras, sin React, y es lo que se testea:
- `dayKey(iso)` — la clave anterior.
- `monthGrid(year, month)` — las 6 semanas × 7 días de la rejilla, **empezando en lunes**
  (convención española; `Date.getDay()` devuelve 0=domingo, hay que corregirlo), incluyendo
  los días de relleno del mes anterior y siguiente.
- `monthRange(year, month)` — el `from`/`to` que se pide a la API. **Debe cubrir toda la
  rejilla, no solo el mes**: si el mes empieza en jueves, los días 1–3 de la rejilla son del
  mes anterior y también deben mostrar sus subastas. Y debe construirse en hora de Madrid,
  no con `new Date(year, month, 1)` sin más.

Sin librería de fechas: el proyecto no tiene ninguna (`apps/web/package.json`) y meter
`date-fns` o `luxon` por esto es peso innecesario cuando `Intl` ya resuelve la zona horaria.

### 5. Página `AuctionsCalendarPage`

- **Estado en la URL**, no en `useState`: `?mes=2026-08&dia=2026-08-14`. Es el patrón que ya
  sigue `AuctionsListPage` con `useSearchParams`, y hace que `useApi` se refresque solo al
  cambiar el path. Además el usuario puede compartir el enlace de un día concreto.
- El path que se pasa a `useApi` sale de `monthRange(...)` + `toQuery(...)`; como `useApi`
  depende de `path`, cambiar de mes vuelve a pedir datos sin más código.
- `useSeo({ title: 'Calendario de subastas — Localiator', canonicalPath: '/subastas/calendario' })`.
- Agrupar `data` en un `Map<string, AuctionListItem[]>` por `dayKey(a.endsAt)`, dentro de un
  `useMemo` sobre `data`.
- Si no hay `?dia`, seleccionar por defecto **el primer día del mes visible que tenga
  subastas** (o hoy, si el mes visible es el actual). Un panel vacío al entrar da sensación de
  que la página está rota.

### 6. Rejilla `AuctionCalendarGrid`

Componente **presentacional puro**: recibe `{ year, month, byDay, selectedDay, onSelectDay }`
y no hace fetching. Así se puede probar y reutilizar sin montar la página entera.

- Cabecera con `‹ Agosto 2026 ›` y botón «Hoy».
- Cada celda: número del día + badge con el número de subastas si las hay. Días de relleno en
  gris claro, día de hoy con borde, día seleccionado en negro (mismo lenguaje visual que los
  filtros de `AuctionsListPage`).
- **Accesibilidad** (no es opcional): los días con subastas son `<button>`, no `<div>` con
  `onClick`. El badge necesita texto para lector de pantalla — `aria-label="14 de agosto,
  3 subastas"` —, porque un número suelto no dice nada fuera de contexto. Y el panel del día
  lleva `aria-live="polite"` para que el cambio de selección se anuncie.
- **Responsive**: en móvil la rejilla se aprieta mucho. Reduce a solo el número + un punto de
  color (sin el conteo), y el panel del día va debajo a ancho completo. La rejilla nunca hace
  scroll horizontal.

### 7. Enlaces y descubribilidad

- Botón «Ver calendario» en la cabecera de `AuctionsListPage`, y «Ver como lista» de vuelta.
- Añadir `/subastas/calendario` al sitemap en `seo.service.ts`.

### 8. Tests

**API** (`auctions.service.spec.ts`):
- El rango filtra: una subasta que cierra fuera de `[from, to)` no sale.
- Frontera: `endsAt === from` entra; `endsAt === to` **no** (rango semiabierto — decídelo una
  vez y que el test lo fije, o los meses contiguos duplicarán o perderán un día).
- Rango de más de 62 días → 400. `to <= from` → 400.
- No aparecen `PAID` ni `CANCELLED`.
- Precio actual correcto con y sin pujas (igual que en el listado).

**Web** (`lib/calendar.ts`, funciones puras):
- `dayKey` con una fecha de madrugada en horario de verano: `2026-07-01T00:30:00Z`… y
  comprobar contra el día esperado en Madrid. **Este es el test que justifica el fichero.**
- `monthGrid` de un mes que empieza en domingo y de otro que empieza en lunes.
- `monthRange` cubre los días de relleno.

---

## Decisiones / alternativas

- **Endpoint nuevo por rango vs. reutilizar `GET /auctions` con `pageSize=60`:** endpoint nuevo.
  Reutilizar el listado no cuesta backend, pero el calendario necesita *todo* el mes: en cuanto
  un mes tenga más subastas que la página, la rejilla mentiría (días sin badge que sí tienen
  subastas), y sería un fallo invisible. El rango con tope de 62 días acota el coste igual de
  bien que la paginación.

- **Endpoint de conteos agregados + carga del día bajo demanda:** descartado *por ahora*. Sería
  más eficiente a gran escala (`groupBy` de conteos + un `findMany` al pulsar un día), pero son
  dos viajes y más estado para un volumen que hoy es de decenas de filas. Si el mes llega a
  cientos de subastas, se migra sin tocar la UI: la rejilla ya recibe `byDay` como prop.

- **Marcar por `endsAt` vs. `startsAt` vs. barra multi-día:** `endsAt`. El momento que le
  importa al comprador es cuándo tiene que estar pendiente, y ya es el criterio de orden del
  listado actual. La barra de inicio a fin (tipo Google Calendar) informa más pero complica
  mucho el layout de la rejilla, y con subastas que duran días acabaría pintando casi todas las
  celdas.

- **Rejilla mensual vs. agenda cronológica:** rejilla. La agenda es más simple y responsive por
  defecto, pero se parece demasiado al listado que ya existe: no aportaría una forma nueva de
  mirar las subastas, que es justo el objetivo.

- **`Intl` vs. `date-fns`/`luxon`:** `Intl`. Es nativo, ya soporta zonas horarias y evita una
  dependencia nueva en un front que hoy solo tiene React, el router y socket.io.

## Hecho cuando

- `GET /auctions/calendar?from=&to=` responde **sin token** con las subastas del rango.
- Rangos abusivos o inválidos devuelven 400, no una respuesta gigante.
- `/subastas/calendario` pinta el mes, navega entre meses y refleja mes y día en la URL.
- Una subasta que cierra a las 00:30 hora española aparece en el día correcto de la rejilla.
- La rejilla se navega con teclado y no hace scroll horizontal en móvil.
- Enlaces cruzados entre lista y calendario, y la ruta está en el sitemap.

## Conceptos que aparecen aquí

Para tu lista de repaso, sin estudiarlos ahora: **zonas horarias y UTC en `Intl.DateTimeFormat`**
(el fallo de agrupación del paso 4), **validación cruzada de campos en class-validator**
(`registerDecorator`), **orden de resolución de rutas en NestJS** (`/calendar` vs `/:id`) e
**índices compuestos en Postgres para filtro + orden**.
