import { ORDER_STATUS_LABELS, type ApiOrderStatus } from '../lib/orders';

// Color por estado, para leer de un vistazo en qué punto está el pedido.
const STATUS_CLASSES: Record<ApiOrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-blue-100 text-blue-800',
  READY_FOR_PICKUP: 'bg-green-100 text-green-800',
  PICKED_UP: 'bg-neutral-200 text-neutral-700',
  CANCELLED: 'bg-red-100 text-red-800',
};

export function OrderStatusBadge({ status }: { status: ApiOrderStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
