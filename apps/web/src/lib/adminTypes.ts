import type { AuctionStatus, ItemCondition, ItemKind } from '@localiator/shared';

// Categoría tal como la devuelve GET /categories.
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

// Producto o lote tal como los devuelven los listados admin (GET /products,
// GET /lots) y el detalle (GET /products/:id). Product y Lot comparten forma.
export interface AdminItem {
  id: string;
  name: string;
  description: string;
  condition: ItemCondition;
  priceCents: number;
  discountCents: number;
  stock: number;
  photos: string[];
  categoryId: string;
  category?: { id: string; name: string };
}

// Subasta tal como la devuelve GET /admin/auctions. A diferencia del listado
// público, trae todos los estados y el ganador sin enmascarar: es vista interna.
export interface AdminAuction {
  id: string;
  itemType: 'PRODUCT' | 'LOT';
  itemId: string;
  itemName: string | null;
  status: AuctionStatus;
  startingPriceCents: number;
  minIncrementCents: number;
  currentPriceCents: number;
  bidCount: number;
  startsAt: string;
  endsAt: string;
  winner: { id: string; email: string } | null;
  paymentDueAt: string | null;
}

// Nota sobre errores: la API de subastas devuelve { code, message } y el `message`
// ya viene humano y en español ("La subasta ya tiene pujas: el cierre solo se puede
// alargar"). No se traduce el `code` en el front: sería duplicar ese texto y acabar
// divergiendo del servidor. El `code` existe para que el front pueda RAMIFICAR sin
// parsear el mensaje, no para reescribirlo.

// Etiquetas legibles del estado de una subasta.
export const AUCTION_STATUS_LABELS: Record<AuctionStatus, string> = {
  SCHEDULED: 'Programada',
  LIVE: 'En directo',
  CLOSED: 'Cerrada',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};

// Rutas de la API según el tipo de artículo (producto o lote). Centralizado para
// que las páginas admin de producto y lote compartan el mismo código.
export function itemBasePath(kind: ItemKind): string {
  return kind === 'lot' ? '/lots' : '/products';
}

export function itemLabels(kind: ItemKind) {
  return kind === 'lot'
    ? { singular: 'Lote', plural: 'Lotes' }
    : { singular: 'Producto', plural: 'Productos' };
}
