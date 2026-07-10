import { apiSend } from './api';

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
