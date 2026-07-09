import type { ItemCondition, ItemKind } from '@localiator/shared';

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
