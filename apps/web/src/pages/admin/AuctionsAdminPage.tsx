import { Link } from 'react-router-dom';
import { AuctionStatus } from '@localiator/shared';
import { apiSend, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAuthedData } from '../../lib/useAuthedData';
import { AUCTION_STATUS_LABELS, type AdminAuction } from '../../lib/adminTypes';
import { formatPrice } from '../../lib/format';

// Listado de gestión de subastas. Sección propia y no una pestaña dentro de
// productos/lotes: una subasta no es un artículo (tiene ciclo de vida, pujas y
// ganador) y se mira por estado y fecha de cierre, no por categoría.
export function AuctionsAdminPage() {
  const { token } = useAuth();
  const { data, error, loading, reload } = useAuthedData<AdminAuction[]>(
    '/admin/auctions',
    token,
  );

  async function handleCancel(auction: AdminAuction) {
    // Puede haber gente con pujas puestas: el aviso lo dice explícitamente.
    const warning =
      auction.bidCount > 0
        ? `Esta subasta tiene ${auction.bidCount} puja(s). Se avisará a quien esté mirándola. `
        : '';
    if (!window.confirm(`${warning}¿Cancelar la subasta de "${auction.itemName}"?`))
      return;
    try {
      await apiSend(
        'POST',
        `/admin/auctions/${auction.id}/cancel`,
        undefined,
        token ?? undefined,
      );
      reload();
    } catch (err) {
      alert(humanizeError(err));
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Subastas</h1>
        <Link
          to="/admin/subastas/nueva"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Nueva
        </Link>
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="text-red-700">{error}</p>}

      {data && data.length === 0 && (
        <p className="text-neutral-500">
          No hay subastas todavía. Crea una con «Nueva»: se abrirá sola al llegar su
          fecha de inicio.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <th className="px-4 py-3 font-medium">Artículo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Precio actual</th>
                <th className="px-4 py-3 font-medium">Pujas</th>
                <th className="px-4 py-3 font-medium">Cierra</th>
                <th className="px-4 py-3 font-medium">Ganador</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((auction) => {
                const editable =
                  auction.status === AuctionStatus.SCHEDULED ||
                  auction.status === AuctionStatus.LIVE;
                return (
                  <tr key={auction.id} className="border-b border-neutral-100">
                    <td className="px-4 py-3">
                      {auction.itemName ?? (
                        <span className="text-red-600">Artículo no encontrado</span>
                      )}
                      <span className="ml-2 text-xs text-neutral-400">
                        {auction.itemType === 'LOT' ? 'Lote' : 'Producto'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={auction.status} />
                    </td>
                    <td className="px-4 py-3">
                      {formatPrice(auction.currentPriceCents)}
                      {auction.bidCount === 0 && (
                        <span className="ml-1 text-xs text-neutral-400">
                          (salida)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{auction.bidCount}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {new Date(auction.endsAt).toLocaleString('es-ES')}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {auction.winner?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {editable && (
                        <>
                          <Link
                            to={`/admin/subastas/${auction.id}`}
                            className="text-neutral-900 underline"
                          >
                            Editar
                          </Link>
                          <button
                            type="button"
                            onClick={() => void handleCancel(auction)}
                            className="ml-3 text-red-700 underline"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AuctionStatus }) {
  const styles: Record<AuctionStatus, string> = {
    LIVE: 'bg-green-100 text-green-800',
    SCHEDULED: 'bg-blue-100 text-blue-800',
    CLOSED: 'bg-neutral-100 text-neutral-700',
    PAID: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {AUCTION_STATUS_LABELS[status]}
    </span>
  );
}

// El mensaje del servidor ya viene humano y en español (el servicio lo escribe
// junto al `code`), así que se muestra tal cual en vez de mantener una tabla de
// traducciones paralela que acabaría divergiendo.
export function humanizeError(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'No se pudo completar la operación';
}
