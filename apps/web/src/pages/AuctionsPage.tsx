import { useSearchParams } from 'react-router-dom';
import {
  AuctionStatus,
  type AuctionListItem,
  type Paginated,
} from '@localiator/shared';
import { toQuery } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useSeo } from '../lib/useSeo';
import { AuctionCard } from '../components/AuctionCard';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 12;

// Filtros del listado. "Abiertas" (el default de la API: LIVE + SCHEDULED) es lo
// que casi todo el mundo quiere ver; las cerradas se piden aparte.
const TABS = [
  { key: 'open', label: 'Abiertas', status: undefined },
  { key: 'live', label: 'En directo', status: AuctionStatus.LIVE },
  { key: 'closed', label: 'Cerradas', status: AuctionStatus.CLOSED },
] as const;

export function AuctionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  useSeo({
    title: 'Subastas — Localiator',
    description:
      'Puja en directo por lotes y productos de subasta. Recogida en almacén, sin envíos.',
    canonicalPath: '/subastas',
  });

  // Pestaña y página viven en la URL: compartir/recargar las conserva (mismo
  // criterio que el catálogo).
  const tabKey = searchParams.get('estado') ?? 'open';
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const query = toQuery({
    page,
    pageSize: PAGE_SIZE,
    status: tab.status,
  });
  const { data, error, loading } = useApi<Paginated<AuctionListItem>>(
    `/auctions${query}`,
  );

  function selectTab(key: string) {
    const params = new URLSearchParams();
    if (key !== 'open') params.set('estado', key);
    setSearchParams(params); // cambiar de pestaña vuelve a la página 1.
  }

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-neutral-900">Subastas</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Puja en directo. El precio y la cuenta atrás se actualizan solos al abrir
        una subasta.
      </p>

      <div className="mb-6 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab.key}
            onClick={() => selectTab(t.key)}
            className={`min-h-11 rounded-md px-4 py-2 text-sm font-medium ${
              t.key === tab.key
                ? 'bg-neutral-900 text-white'
                : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            {t.label}
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
          {tab.key === 'closed'
            ? 'Todavía no hay subastas cerradas.'
            : 'No hay subastas abiertas ahora mismo. Vuelve pronto.'}
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

// Mismo placeholder de carga que el catálogo: no dejar la pantalla en blanco.
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
