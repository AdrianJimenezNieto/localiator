import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  adminCancelAuction,
  adminListAuctions,
  AUCTION_STATUS_LABELS,
  type AdminAuction,
  type ApiAuctionStatus,
} from '../../lib/auctions';
import { formatPrice } from '../../lib/format';

const FILTERS: { value: ApiAuctionStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'SCHEDULED', label: AUCTION_STATUS_LABELS.SCHEDULED },
  { value: 'LIVE', label: AUCTION_STATUS_LABELS.LIVE },
  { value: 'CLOSED', label: AUCTION_STATUS_LABELS.CLOSED },
  { value: 'PAID', label: AUCTION_STATUS_LABELS.PAID },
  { value: 'CANCELLED', label: AUCTION_STATUS_LABELS.CANCELLED },
];

// Solo se puede cancelar desde el backoffice mientras está programada o en curso
// (auctions.service.ts, cancelAuction): una CLOSED con ganador se gestiona por el
// camino de impago, no por aquí.
const CANCELLABLE: ApiAuctionStatus[] = ['SCHEDULED', 'LIVE'];

export function AuctionsAdminPage() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<ApiAuctionStatus | 'ALL'>('ALL');
  const [auctions, setAuctions] = useState<AdminAuction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setAuctions(null);
    adminListAuctions(token, filter === 'ALL' ? undefined : filter)
      .then(setAuctions)
      .catch(() => setError('No se pudieron cargar las subastas'));
  }, [token, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel(auction: AdminAuction) {
    if (!token) return;
    if (!window.confirm(`¿Cancelar la subasta de "${auction.itemName ?? auction.itemId}"?`)) {
      return;
    }
    setBusyId(auction.id);
    setError(null);
    try {
      await adminCancelAuction(auction.id, token);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cancelar');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Subastas</h1>
        <Link
          to="/admin/subastas/nuevo"
          className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white"
        >
          Nueva
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              filter === f.value
                ? 'bg-ink-900 text-white'
                : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {!auctions ? (
        <p className="text-ink-500">Cargando…</p>
      ) : auctions.length === 0 ? (
        <p className="text-ink-500">No hay subastas con este filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 text-ink-500">
              <tr>
                <th className="p-3 font-medium">Artículo</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3 font-medium">Precio actual</th>
                <th className="p-3 font-medium">Pujas</th>
                <th className="p-3 font-medium">Cierre</th>
                <th className="p-3 font-medium">Ganador</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {auctions.map((auction) => (
                <tr key={auction.id}>
                  <td className="p-3 font-medium">{auction.itemName ?? '—'}</td>
                  <td className="p-3 text-ink-600">
                    {AUCTION_STATUS_LABELS[auction.status]}
                  </td>
                  <td className="p-3">{formatPrice(auction.currentPriceCents)}</td>
                  <td className="p-3">{auction.bidCount}</td>
                  <td className="p-3 text-ink-600">
                    {new Date(auction.endsAt).toLocaleString('es-ES')}
                  </td>
                  <td className="p-3 text-ink-600">
                    {auction.winner?.email ?? '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/admin/subastas/${auction.id}`}
                        className="rounded-md border border-ink-300 px-3 py-1.5 hover:bg-ink-100"
                      >
                        Editar
                      </Link>
                      {CANCELLABLE.includes(auction.status) && (
                        <button
                          type="button"
                          disabled={busyId === auction.id}
                          onClick={() => void cancel(auction)}
                          className="rounded-md border border-ink-300 px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
