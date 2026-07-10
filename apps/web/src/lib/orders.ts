import { apiGet, apiSend, API_URL } from './api';

// Tipos e utilidades de PEDIDOS en el cliente. Los estados llegan del backend en
// mayúsculas (enum Prisma OrderStatus), distintos de los valores de
// `@localiator/shared` (minúsculas, pensados para otra capa); por eso aquí se
// tipan como el enum de la API para no mezclar convenciones.
export type ApiOrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'CANCELLED';

export type OrderItemType = 'PRODUCT' | 'LOT';

export interface OrderLineView {
  itemType: OrderItemType;
  itemId: string;
  nameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface OrderView {
  id: string;
  status: ApiOrderStatus;
  totalCents: number;
  currency: string;
  expiresAt: string; // ISO; el checkout muestra un contador hasta esta hora.
  createdAt: string;
  lines: OrderLineView[];
}

// Pedido tal como lo devuelven "Mis pedidos" / detalle / gestión: como OrderView
// pero con la factura (si existe) y, en el listado de admin, el email del cliente.
export interface OrderRecord {
  id: string;
  status: ApiOrderStatus;
  totalCents: number;
  createdAt: string;
  lines: OrderLineView[];
  invoice?: { number: string } | null;
  user?: { email: string };
}

// Etiquetas legibles del estado del pedido (mismas claves que el enum de la API).
export const ORDER_STATUS_LABELS: Record<ApiOrderStatus, string> = {
  PENDING: 'Pendiente de pago',
  PAID: 'Pagado',
  READY_FOR_PICKUP: 'Listo para recoger',
  PICKED_UP: 'Recogido',
  CANCELLED: 'Cancelado',
};

// Línea del carrito tal como la espera la API (mayúsculas). El precio NO se envía:
// lo fija el servidor.
export interface CreateOrderLine {
  itemType: OrderItemType;
  itemId: string;
  quantity: number;
}

// Crea el pedido y reserva stock (tarea 03). Requiere sesión (token) y email
// verificado (el backend responde 403 si no lo está).
export function createOrder(
  items: CreateOrderLine[],
  token: string,
): Promise<OrderView> {
  return apiSend<OrderView>('POST', '/orders', { items }, token);
}

// Lanza el pago del pedido (tarea 04): devuelve la URL de la Checkout Session de
// Stripe a la que redirigir.
export function payOrder(
  orderId: string,
  token: string,
): Promise<{ url: string }> {
  return apiSend<{ url: string }>('POST', `/orders/${orderId}/pay`, undefined, token);
}

// "Mis pedidos" del comprador.
export function getMyOrders(token: string): Promise<OrderRecord[]> {
  return apiGet<OrderRecord[]>('/orders', token);
}

// Detalle de un pedido (dueño o admin).
export function getOrder(orderId: string, token: string): Promise<OrderRecord> {
  return apiGet<OrderRecord>(`/orders/${orderId}`, token);
}

// Listado de gestión (admin), opcionalmente filtrado por estado.
export function adminListOrders(
  token: string,
  status?: ApiOrderStatus,
): Promise<OrderRecord[]> {
  const qs = status ? `?status=${status}` : '';
  return apiGet<OrderRecord[]>(`/orders/admin${qs}`, token);
}

// Transición de estado (admin). El servidor valida que sea legal (409 si no).
export function adminSetOrderStatus(
  orderId: string,
  status: ApiOrderStatus,
  token: string,
): Promise<OrderRecord> {
  return apiSend<OrderRecord>('PATCH', `/orders/${orderId}/status`, { status }, token);
}

// Abre la factura (HTML) del pedido. El endpoint exige el access token (Bearer),
// que un <a href> no adjunta; por eso se descarga con fetch autenticado y se abre
// como blob en una pestaña nueva.
export async function openInvoice(
  orderId: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/orders/${orderId}/invoice`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No se pudo abrir la factura');
  const html = await res.text();
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank');
}
