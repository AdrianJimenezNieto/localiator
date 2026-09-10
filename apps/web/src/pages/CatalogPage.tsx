import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CatalogItem } from '@localiator/shared';
import { toQuery } from '../lib/api';
import { useInfiniteApi } from '../lib/useInfiniteApi';
import { useSeo } from '../lib/useSeo';
import { eurosToCents } from '../lib/format';
import { ProductCard } from '../components/ProductCard';
import { FiltersPanel, type CatalogFilters } from '../components/FiltersPanel';
import { useReveal } from '../lib/useReveal';
import { badge, btnSecondary, card, container } from '../lib/ui';

const PAGE_SIZE = 12;
// Tope de pageSize del backend (MAX_PAGE_SIZE en list-catalog.dto.ts). Marca
// cuántas tandas se pueden recuperar de una sola petición al volver a la página.
const MAX_PAGE_SIZE = 60;

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  useSeo({
    title: 'Catálogo — Localiator',
    description:
      'Explora lotes y productos individuales de subasta disponibles para recoger en almacén. Busca por nombre y filtra por precio.',
    canonicalPath: '/catalogo',
  });

  // Todos los filtros viven en la URL: compartir/recargar los conserva.
  const filters: CatalogFilters = {
    q: searchParams.get('q') ?? '',
    minPrice: searchParams.get('minPrice') ?? '',
    maxPrice: searchParams.get('maxPrice') ?? '',
  };

  // `page` ya no es "la página que se ve", sino "cuántas tandas había
  // desplegadas". Se lee UNA vez, al montar: a partir de ahí la escribimos
  // nosotros conforme se hace scroll, y volver a leerla reiniciaría el catálogo.
  const [initialBatches] = useState(() =>
    Math.max(1, Number(searchParams.get('page') ?? '1') || 1),
  );

  // En móvil los filtros se pliegan tras un botón para no comerse la pantalla;
  // en escritorio se muestran siempre en la columna lateral.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (filters.q ? 1 : 0) +
    (filters.minPrice || filters.maxPrice ? 1 : 0);

  // Ruta CON filtros y SIN paginación: es la identidad de la búsqueda. Cuando
  // cambia, el hook tira lo acumulado y empieza de cero. La conversión
  // euros→céntimos ocurre aquí (la API trabaja en céntimos).
  const basePath = `/catalog/products${toQuery({
    q: filters.q,
    minPriceCents: eurosToCents(filters.minPrice),
    maxPriceCents: eurosToCents(filters.maxPrice),
  })}`;

  const {
    items,
    total,
    loadedBatches,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    retry,
  } = useInfiniteApi<CatalogItem>(basePath, {
    pageSize: PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
    initialBatches,
  });

  // Centinela: un div vacío al final de la rejilla. Cuando entra en pantalla, se
  // pide la siguiente tanda. El margen de 600px hace que la petición salga antes
  // de que el usuario llegue al final, así casi nunca ve el hueco.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `items.length` en las dependencias no es decorativo: si tras cargar una
    // tanda el centinela SIGUE dentro de la pantalla (ventana muy alta, o tanda
    // corta), el observer no volvería a avisar, porque para él no ha cambiado
    // nada. Al recrearlo, vuelve a comprobar el estado actual y encadena otra
    // carga si hace falta.
  }, [hasMore, loadMore, items.length]);

  // La URL guarda cuántas tandas hay desplegadas, con `replace` para no llenar
  // el historial (si no, "atrás" recorrería tanda a tanda en vez de volver a la
  // página anterior). Sirve para dos cosas: volver desde una ficha sin perder el
  // sitio, y dejar direcciones ?page=N que un buscador pueda seguir.
  useEffect(() => {
    if (loadedBatches === 0) return;
    const current = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    if (loadedBatches === current) return;
    const params = new URLSearchParams(searchParams);
    if (loadedBatches <= 1) params.delete('page');
    else params.set('page', String(loadedBatches));
    setSearchParams(params, { replace: true });
  }, [loadedBatches, searchParams, setSearchParams]);

  // `watch: items.length` vuelve a enganchar la animación tras cada tanda: las
  // tarjetas nuevas no existían cuando se creó el observer anterior.
  const gridRef = useReveal<HTMLDivElement>({ watch: items.length });

  // Escribe los filtros en la URL SIN page: cambiar un filtro vuelve a empezar.
  function applyFilters(next: CatalogFilters) {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.minPrice) params.set('minPrice', next.minPrice);
    if (next.maxPrice) params.set('maxPrice', next.maxPrice);
    setSearchParams(params);
    // Al filtrar, el listado se queda en una sola tanda: si estabas a mitad de
    // scroll, la página encoge y te dejaría mirando el vacío del final. Solo se
    // sube si hace falta, para no dar un tirón en cada tecla de la búsqueda.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className={`${container} py-10`}>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 sm:text-4xl">Catálogo</h1>
        <p className="mt-2 max-w-2xl text-ink-600">
          Lotes y productos sueltos listos para recoger en almacén. Cada artículo
          es único: lo que ves es la unidad concreta que te llevas.
        </p>
        {/* Recuento total junto al título: contesta "cuánto hay aquí" antes de
            empezar a bajar. */}
        {total !== null && (
          <p className={`${badge('brand')} mt-3`}>
            {total} {total === 1 ? 'artículo' : 'artículos'} disponibles
          </p>
        )}
      </header>

      {/* En móvil esto es un bloque normal (no una rejilla de una columna) para
          que el `sticky` del panel de filtros tenga recorrido: un elemento
          pegajoso solo se mueve dentro de la caja de su padre, y en una rejilla
          esa caja sería únicamente la fila del propio panel. */}
      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-8">
        <aside className="sticky top-header z-30 mb-6 self-start lg:-mx-1 lg:mb-0 lg:max-h-[calc(100dvh-var(--spacing-header)-3rem)] lg:overflow-y-auto lg:px-1 lg:top-[calc(var(--spacing-header)+1.5rem)]">
          {/* Fondo propio: al quedarse pegado, por debajo pasan las tarjetas y
              sin esto se leerían a través. Los márgenes negativos estiran ese
              fondo hasta los bordes del contenedor. */}
          <div className="-mx-4 border-b border-ink-200 bg-ink-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            {/* Botón que despliega los filtros SOLO en móvil (oculto en lg). */}
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="filtros"
              className="flex min-h-11 w-full items-center justify-between rounded-lg border border-ink-300 bg-white px-4 py-2 text-sm font-medium transition hover:border-ink-400 lg:hidden"
            >
              <span>
                Filtros
                {activeFilterCount > 0 && (
                  <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </span>
              <span aria-hidden>{filtersOpen ? '▲' : '▼'}</span>
            </button>

            {/* Oculto en móvil salvo que se abra; siempre visible en escritorio.
                El alto máximo evita que el panel abierto tape la pantalla entera
                en un teléfono. */}
            <div
              id="filtros"
              className={`${
                filtersOpen ? 'mt-4 block max-h-[60dvh] overflow-y-auto' : 'hidden'
              } lg:mt-0 lg:block lg:max-h-none lg:overflow-visible`}
            >
              <FiltersPanel
                filters={filters}
                resultCount={total}
                onChange={(patch) => applyFilters({ ...filters, ...patch })}
                onClear={() => setSearchParams(new URLSearchParams())}
              />
            </div>
          </div>
        </aside>

        <section>
          {loading && <CatalogSkeleton />}

          {!loading && error && items.length === 0 && (
            <p
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="rounded-xl border border-dashed border-ink-300 py-16 text-center">
              <p className="font-medium text-ink-700">
                No hay artículos que coincidan con la búsqueda.
              </p>
              <p className="mt-1 text-sm text-ink-500">
                Prueba a quitar algún filtro o a ampliar el rango de precio.
              </p>
            </div>
          )}

          {items.length > 0 && (
            <>
              <div
                ref={gridRef}
                className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4"
              >
                {items.map((item) => (
                  <div key={item.id} className="reveal">
                    <ProductCard item={item} />
                  </div>
                ))}
              </div>

              {loadingMore && <CatalogSkeleton rows={1} className="mt-4" />}

              {/* Estado del listado. `aria-live` es lo que hace que un lector de
                  pantalla se entere de que ha entrado más contenido: con scroll
                  infinito no hay ningún botón que pulsar del que deducirlo. */}
              <p
                className="mt-8 text-center text-sm text-ink-500"
                aria-live="polite"
              >
                {loadingMore
                  ? 'Cargando más artículos…'
                  : `Mostrando ${items.length} de ${total} artículos`}
              </p>

              {/* Fallo al ampliar: lo ya cargado se queda en pantalla y se ofrece
                  reintentar, en vez de tirar la vista entera. */}
              {error && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-red-700" role="alert">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={retry}
                    className={`${btnSecondary} mt-3`}
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </>
          )}

          {/* Centinela invisible al final: al entrar en pantalla pide más. */}
          <div ref={sentinelRef} aria-hidden className="h-px" />
        </section>
      </div>
    </div>
  );
}

// Placeholder de carga: rejilla de tarjetas "fantasma" para no dejar la pantalla
// en blanco mientras llega la respuesta.
function CatalogSkeleton({
  rows = 2,
  className = '',
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 ${className}`}
      aria-hidden
    >
      {Array.from({ length: rows * 3 }).map((_, i) => (
        <div key={i} className={`${card} flex flex-col overflow-hidden`}>
          <div className="aspect-square w-full animate-pulse bg-ink-100" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-1/3 animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
