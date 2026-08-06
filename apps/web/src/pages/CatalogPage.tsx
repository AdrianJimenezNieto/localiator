import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CatalogItem, Paginated } from '@localiator/shared';
import { toQuery } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useSeo } from '../lib/useSeo';
import { eurosToCents } from '../lib/format';
import { ProductCard } from '../components/ProductCard';
import { Pagination } from '../components/Pagination';
import { FiltersPanel, type CatalogFilters } from '../components/FiltersPanel';
import { useReveal } from '../lib/useReveal';
import { badge, card, container } from '../lib/ui';

const PAGE_SIZE = 12;

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  useSeo({
    title: 'Catálogo — Localiator',
    description:
      'Explora lotes y productos individuales de subasta disponibles para recoger en almacén. Filtra por categoría y precio.',
    canonicalPath: '/catalogo',
  });

  // La página y todos los filtros viven en la URL: compartir/recargar los conserva.
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const filters: CatalogFilters = {
    q: searchParams.get('q') ?? '',
    categoryId: searchParams.get('categoryId') ?? '',
    minPrice: searchParams.get('minPrice') ?? '',
    maxPrice: searchParams.get('maxPrice') ?? '',
  };

  // En móvil los filtros se pliegan tras un botón (drawer/acordeón) para no empujar
  // el catálogo hacia abajo; en escritorio se muestran siempre en línea.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (filters.q ? 1 : 0) +
    (filters.categoryId ? 1 : 0) +
    (filters.minPrice || filters.maxPrice ? 1 : 0);

  // Un único flujo de datos: los filtros construyen el path, y useApi re-pide al
  // cambiar. La conversión euros→céntimos ocurre aquí (la API trabaja en céntimos).
  const query = toQuery({
    page,
    pageSize: PAGE_SIZE,
    q: filters.q,
    categoryId: filters.categoryId,
    minPriceCents: eurosToCents(filters.minPrice),
    maxPriceCents: eurosToCents(filters.maxPrice),
  });
  const { data, error, loading } = useApi<Paginated<CatalogItem>>(
    `/catalog/products${query}`,
  );

  // `watch: data` vuelve a enganchar la animación tras cada respuesta: al
  // paginar o filtrar, las tarjetas son nuevas y hay que observarlas otra vez.
  const gridRef = useReveal<HTMLDivElement>({ watch: data });

  // Escribe los filtros en la URL SIN page: cambiar un filtro resetea a la página 1.
  function applyFilters(next: CatalogFilters) {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.categoryId) params.set('categoryId', next.categoryId);
    if (next.minPrice) params.set('minPrice', next.minPrice);
    if (next.maxPrice) params.set('maxPrice', next.maxPrice);
    setSearchParams(params);
  }

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className={`${container} py-10`}>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 sm:text-4xl">Catálogo</h1>
        <p className="mt-2 max-w-2xl text-ink-600">
          Lotes y productos sueltos listos para recoger en almacén. Cada artículo
          es único: lo que ves es la unidad concreta que te llevas.
        </p>
        {/* Recuento total junto al título: contesta "¿cuánto hay aquí?" antes de
            que haya que bajar hasta el paginador. */}
        {data && (
          <p className={`${badge('brand')} mt-3`}>
            {data.total} {data.total === 1 ? 'artículo' : 'artículos'} disponibles
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          {/* Botón que despliega los filtros SOLO en móvil (oculto en lg). */}
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="mb-4 flex min-h-11 w-full items-center justify-between rounded-lg border border-ink-300 bg-white px-4 py-2 text-sm font-medium transition hover:border-ink-400 lg:hidden"
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

          {/* Oculto en móvil salvo que se abra; siempre visible en escritorio. */}
          <div className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>
            <FiltersPanel
              filters={filters}
              resultCount={data?.total ?? null}
              onChange={(patch) => applyFilters({ ...filters, ...patch })}
              onClear={() => setSearchParams(new URLSearchParams())}
            />
          </div>
        </aside>

        <section>
          {loading && <CatalogSkeleton />}

          {!loading && error && (
            <p
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}

          {!loading && !error && data && data.items.length === 0 && (
            <div className="rounded-xl border border-dashed border-ink-300 py-16 text-center">
              <p className="font-medium text-ink-700">
                No hay artículos que coincidan con la búsqueda.
              </p>
              <p className="mt-1 text-sm text-ink-500">
                Prueba a quitar algún filtro o a ampliar el rango de precio.
              </p>
            </div>
          )}

          {!loading && !error && data && data.items.length > 0 && (
            <>
              <div
                ref={gridRef}
                className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4"
              >
                {data.items.map((item) => (
                  // key con la página incluida: al paginar, React recrea las
                  // tarjetas en vez de reutilizarlas, y así vuelven a aparecer
                  // con la animación en lugar de cambiar de golpe.
                  <div key={`${page}-${item.id}`} className="reveal">
                    <ProductCard item={item} />
                  </div>
                ))}
              </div>
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={goToPage}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// Placeholder de carga: rejilla de tarjetas "fantasma" para no dejar la pantalla
// en blanco mientras llega la respuesta.
function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
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
