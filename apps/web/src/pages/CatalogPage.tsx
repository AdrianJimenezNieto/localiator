import { useSearchParams } from 'react-router-dom';
import type { CatalogItem, Paginated } from '@localiator/shared';
import { toQuery } from '../lib/api';
import { useApi } from '../lib/useApi';
import { ProductCard } from '../components/ProductCard';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 12;

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // La página vive en la URL (?page=N): recargar/compartir la conserva.
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const path = `/catalog/products${toQuery({ page, pageSize: PAGE_SIZE })}`;
  const { data, error, loading } = useApi<Paginated<CatalogItem>>(path);

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">Catálogo</h1>

      {loading && <CatalogSkeleton />}

      {!loading && error && (
        <p className="rounded-md bg-red-50 p-4 text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && data.items.length === 0 && (
        <p className="py-16 text-center text-neutral-500">
          No hay artículos en el catálogo todavía.
        </p>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
    </div>
  );
}

// Placeholder de carga: rejilla de tarjetas "fantasma" para no dejar la pantalla
// en blanco mientras llega la respuesta.
function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: PAGE_SIZE }).map((_, i) => (
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
