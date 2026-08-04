import { Link, useSearchParams } from 'react-router-dom';
import type { AuctionListItem, Paginated } from '@localiator/shared';
import { toQuery } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useSeo } from '../lib/useSeo';
import { AUCTION_STATUS_LABELS, type ApiAuctionStatus } from '../lib/auctions';
import { AuctionCard } from '../components/AuctionCard';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 12;

// Estados que puede pedir un invitado (ListAuctionsDto los restringe igual en el
// backend): PAID y CANCELLED son ruido interno, no salen aquí.
const FILTERS: { value: ApiAuctionStatus[] | undefined; label: string }[] = [
  { value: undefined, label: 'Abiertas' }, // default del backend: LIVE + SCHEDULED.
  { value: ['LIVE'], label: 'En curso' },
  { value: ['SCHEDULED'], label: 'Próximamente' },
  { value: ['CLOSED'], label: 'Cerradas' },
];

export function AuctionsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  useSeo({
    title: 'Subastas — Localiator',
    description: 'Subastas en vivo de productos y lotes recogidos en almacén.',
    canonicalPath: '/subastas',
  });

  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const filterParam = searchParams.get('estado');
  const activeFilter =
    FILTERS.find((f) => f.value?.join(',') === filterParam) ?? FILTERS[0];

  const query = toQuery({
    page,
    pageSize: PAGE_SIZE,
    status: activeFilter.value,
  });
  const { data, error, loading } = useApi<Paginated<AuctionListItem>>(
    `/auctions${query}`,
  );

  function selectFilter(filter: (typeof FILTERS)[number]) {
    const params = new URLSearchParams();
    if (filter.value) params.set('estado', filter.value.join(','));
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Subastas</h1>
        <Link
          to="/subastas/calendario"
          className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
        >
          Ver calendario
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => selectFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              f.label === activeFilter.label
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {f.value ? AUCTION_STATUS_LABELS[f.value[0]] : f.label}
          </button>
        ))}
      </div>

      {loading && <AuctionsSkeleton />}

      {!loading && error && (
        <p className="rounded-md bg-red-50 p-4 text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && data.items.length === 0 && (
        <p className="py-16 text-center text-neutral-500">
          No hay subastas con este filtro.
        </p>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {data.items.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
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

function AuctionsSkeleton() {
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
