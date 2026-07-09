// Tipos y constantes compartidos entre backend (NestJS) y frontend (React).

// Fuente de verdad de los roles para el frontend. Ojo: `GUEST` no existe en la
// BD (el enum `Role` de Prisma solo tiene BUYER y ADMIN); `guest` representa la
// ausencia de usuario autenticado y solo vive aquí.
export const UserRole = {
  GUEST: "guest",
  BUYER: "buyer",
  ADMIN: "admin",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const OrderStatus = {
  PENDING: "pending",
  PAID: "paid",
  READY_FOR_PICKUP: "ready_for_pickup",
  PICKED_UP: "picked_up",
  CANCELLED: "cancelled",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

// Un producto y un lote son entidades separadas pero comparten forma.
export const ItemKind = {
  PRODUCT: "product",
  LOT: "lot",
} as const;

export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

// Estado real del artículo. Reflejo del enum `ItemCondition` de Prisma para que el
// frontend tenga los valores sin depender del cliente de Prisma. Si divergen, CI
// (build) lo detectaría al usarse en ambos lados.
export const ItemCondition = {
  NEW: "NEW",
  LIKE_NEW: "LIKE_NEW",
  GOOD: "GOOD",
  FAIR: "FAIR",
  DAMAGED: "DAMAGED",
} as const;

export type ItemCondition = (typeof ItemCondition)[keyof typeof ItemCondition];

// Respuesta paginada genérica (offset pagination). La comparten backend y frontend
// para no divergir en la forma de la paginación.
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Lo justo que necesita una TARJETA del catálogo (no todo el registro). La ficha
// completa (detalle) es un tipo aparte (CatalogDetail).
export interface CatalogItem {
  id: string;
  kind: ItemKind;
  name: string;
  priceCents: number;
  discountCents: number;
  condition: ItemCondition;
  // Primera foto (portada) o null si el artículo no tiene fotos aún.
  photo: string | null;
  category: { id: string; name: string };
}

// Detalle completo para la FICHA pública (todos los datos visibles al público).
// No lleva `stock` exacto: exponer el inventario no aporta al comprador y filtra
// un dato interno; basta `available`.
export interface CatalogDetail {
  id: string;
  kind: ItemKind;
  name: string;
  description: string;
  condition: ItemCondition;
  priceCents: number;
  discountCents: number;
  available: boolean;
  photos: string[];
  category: { id: string; name: string };
}
