import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CatalogItem, ItemCondition, Paginated } from '@localiator/shared';
import { toQuery } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useSeo } from '../lib/useSeo';
import { eurosToCents } from '../lib/format';
import { ProductCard } from '../components/ProductCard';
import { Pagination } from '../components/Pagination';
import { FiltersPanel, type CatalogFilters } from '../components/FiltersPanel';

const PAGE_SIZE = 12;

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  useSeo({
    title: 'Catálogo — Localiator',
    description:
      'Explora lotes y productos individuales de subasta disponibles para recoger en almacén. Filtra por categoría, precio y estado.',
    canonicalPath: '/',
  });

  // La página y todos los filtros viven en la URL: compartir/recargar los conserva.
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const filters: CatalogFilters = {
    q: searchParams.get('q') ?? '',
    categoryId: searchParams.get('categoryId') ?? '',
    minPrice: searchParams.get('minPrice') ?? '',
    maxPrice: searchParams.get('maxPrice') ?? '',
    conditions: searchParams.getAll('condition') as ItemCondition[],
  };

  // En móvil los filtros se pliegan tras un botón (drawer/acordeón) para no empujar
  // el catálogo hacia abajo; en escritorio se muestran siempre en línea.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (filters.q ? 1 : 0) +
    (filters.categoryId ? 1 : 0) +
    (filters.minPrice || filters.maxPrice ? 1 : 0) +
    filters.conditions.length;

  // Un único flujo de datos: los filtros construyen el path, y useApi re-pide al
  // cambiar. La conversión euros→céntimos ocurre aquí (la API trabaja en céntimos).
  const query = toQuery({
    page,
    pageSize: PAGE_SIZE,
    q: filters.q,
    categoryId: filters.categoryId,
    minPriceCents: eurosToCents(filters.minPrice),
    maxPriceCents: eurosToCents(filters.maxPrice),
    condition: filters.conditions,
  });
  const { data, error, loading } = useApi<Paginated<CatalogItem>>(
    `/catalog/products${query}`,
  );

  // Escribe los filtros en la URL SIN page: cambiar un filtro resetea a la página 1.
  function applyFilters(next: CatalogFilters) {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.categoryId) params.set('categoryId', next.categoryId);
    if (next.minPrice) params.set('minPrice', next.minPrice);
    if (next.maxPrice) params.set('maxPrice', next.maxPrice);
    for (const c of next.conditions) params.append('condition', c);
    setSearchParams(params);
  }

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">Catálogo</h1>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          {/* Botón que despliega los filtros SOLO en móvil (oculto en lg). */}
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="mb-4 flex min-h-11 w-full items-center justify-between rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium lg:hidden"
          >
            <span>
              Filtros
              {activeFilterCount > 0 && (
                <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-white">
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
            <p className="rounded-md bg-red-50 p-4 text-red-700" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && data && data.items.length === 0 && (
            <p className="py-16 text-center text-neutral-500">
              No hay artículos que coincidan con la búsqueda.
            </p>
          )}

          {!loading && !error && data && data.items.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {data.items.map((item) => (
                  <ProductCard key={item.id} item={item} />
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
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-lg border border-neutral-200"
        >
          <div className="aspect-square w-full animate-pulse bg-neutral-200" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-200" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
