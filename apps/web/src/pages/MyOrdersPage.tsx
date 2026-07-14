import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  getMyOrders,
  openInvoice,
  payOrder,
  type OrderRecord,
} from '../lib/orders';
import { formatPrice } from '../lib/format';
import { OrderStatusBadge } from '../components/OrderStatusBadge';

// "Mis pedidos": el comprador ve el estado de cada pedido, las instrucciones de
// recogida cuando está listo y el acceso a la factura.
export function MyOrdersPage() {
  const { user, token, ready } = useAuth();
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pedido cuyo pago se está lanzando: deshabilita el botón mientras se pide la
  // URL de Stripe, para no crear dos sesiones de pago con doble clic.
  const [payingId, setPayingId] = useState<string | null>(null);

  // Lanza el pago de un pedido PENDING y redirige a la Checkout Session de Stripe
  // (mismo flujo que la venta directa, tarea 09). Los pedidos de subasta llegan aquí
  // ya creados al ganar; el comprador solo tiene que pagar.
  async function handlePay(orderId: string) {
    if (!token) return;
    setPayingId(orderId);
    try {
      const { url } = await payOrder(orderId, token);
      window.location.href = url;
    } catch {
      setError('No se pudo iniciar el pago. Inténtalo de nuevo.');
      setPayingId(null);
    }
  }

  useEffect(() => {
    if (!ready || !token) return;
    getMyOrders(token)
      .then(setOrders)
      .catch(() => setError('No se pudieron cargar tus pedidos'));
  }, [ready, token]);

  if (ready && !user) {
    return <Navigate to="/login?redirect=/mis-pedidos" replace />;
  }

  if (!ready || (!orders && !error)) {
    return (
      <p className="mx-auto max-w-3xl px-4 py-16 text-center text-neutral-500">
        Cargando tus pedidos…
      </p>
    );
  }

  if (error) {
    return (
      <p className="mx-auto max-w-3xl px-4 py-16 text-center text-red-700">
        {error}
      </p>
    );
  }

  if (orders && orders.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Aún no tienes pedidos</h1>
        <p className="text-neutral-500">Cuando compres, aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Mis pedidos</h1>
      <ul className="flex flex-col gap-4">
        {orders?.map((order) => (
          <li
            key={order.id}
            className="rounded-lg border border-neutral-200 bg-white p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-neutral-500">
                {new Date(order.createdAt).toLocaleDateString('es-ES')}
              </span>
              <OrderStatusBadge status={order.status} />
            </div>

            <ul className="mb-2 text-sm text-neutral-700">
              {order.lines.map((line) => (
                <li key={`${line.itemType}:${line.itemId}`}>
                  {line.nameSnapshot} × {line.quantity} —{' '}
                  {formatPrice(line.lineTotalCents)}
                </li>
              ))}
            </ul>

            {order.status === 'READY_FOR_PICKUP' && (
              <p className="mb-2 rounded bg-green-50 p-2 text-sm text-green-800">
                Tu pedido está listo para recoger en el almacén. Te hemos enviado
                los detalles por email.
              </p>
            )}

            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {formatPrice(order.totalCents)}
              </span>
              {order.status === 'PENDING' ? (
                <button
                  type="button"
                  onClick={() => void handlePay(order.id)}
                  disabled={payingId === order.id}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  {payingId === order.id ? 'Redirigiendo…' : 'Pagar'}
                </button>
              ) : (
                order.invoice &&
                token && (
                  <button
                    type="button"
                    onClick={() => void openInvoice(order.id, token)}
                    className="text-sm text-neutral-700 underline hover:text-neutral-900"
                  >
                    Factura {order.invoice.number}
                  </button>
                )
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
