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
