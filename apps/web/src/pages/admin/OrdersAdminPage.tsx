import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  adminListOrders,
  adminSetOrderStatus,
  openInvoice,
  ORDER_STATUS_LABELS,
  type ApiOrderStatus,
  type OrderRecord,
} from '../../lib/orders';
import { formatPrice } from '../../lib/format';
import { OrderStatusBadge } from '../../components/OrderStatusBadge';

// Transiciones que el admin puede lanzar desde cada estado (mismo criterio que la
// máquina de estados del backend; el servidor valida igualmente con 409).
const ACTIONS: Partial<
  Record<ApiOrderStatus, { label: string; to: ApiOrderStatus }[]>
> = {
  PAID: [
    { label: 'Marcar listo para recoger', to: 'READY_FOR_PICKUP' },
    { label: 'Cancelar', to: 'CANCELLED' },
  ],
  READY_FOR_PICKUP: [
    { label: 'Marcar recogido', to: 'PICKED_UP' },
    { label: 'Cancelar', to: 'CANCELLED' },
  ],
};

const FILTERS: { value: ApiOrderStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PAID', label: ORDER_STATUS_LABELS.PAID },
  { value: 'READY_FOR_PICKUP', label: ORDER_STATUS_LABELS.READY_FOR_PICKUP },
  { value: 'PICKED_UP', label: ORDER_STATUS_LABELS.PICKED_UP },
  { value: 'PENDING', label: ORDER_STATUS_LABELS.PENDING },
  { value: 'CANCELLED', label: ORDER_STATUS_LABELS.CANCELLED },
];

export function OrdersAdminPage() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<ApiOrderStatus | 'ALL'>('ALL');
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setOrders(null);
    adminListOrders(token, filter === 'ALL' ? undefined : filter)
      .then(setOrders)
      .catch(() => setError('No se pudieron cargar los pedidos'));
  }, [token, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function transition(orderId: string, to: ApiOrderStatus) {
    if (!token) return;
    setBusyId(orderId);
    setError(null);
    try {
      await adminSetOrderStatus(orderId, to, token);
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cambiar el estado',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Pedidos</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              filter === f.value
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!orders ? (
        <p className="text-neutral-500">Cargando…</p>
      ) : orders.length === 0 ? (
        <p className="text-neutral-500">No hay pedidos con este filtro.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{order.user?.email}</span>
                  <span className="ml-2 text-sm text-neutral-500">
                    {new Date(order.createdAt).toLocaleString('es-ES')}
                  </span>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              <ul className="mb-3 text-sm text-neutral-700">
                {order.lines.map((line) => (
                  <li key={`${line.itemType}:${line.itemId}`}>
                    {line.nameSnapshot} × {line.quantity} —{' '}
                    {formatPrice(line.lineTotalCents)}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto font-semibold">
                  {formatPrice(order.totalCents)}
                </span>
                {order.invoice && token && (
                  <button
                    type="button"
                    onClick={() => void openInvoice(order.id, token)}
                    className="text-sm text-neutral-600 underline hover:text-neutral-900"
                  >
                    Factura {order.invoice.number}
                  </button>
                )}
                {(ACTIONS[order.status] ?? []).map((action) => (
                  <button
                    key={action.to}
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => void transition(order.id, action.to)}
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
