// Tipos de dominio del frontend, mockeados a partir del handoff de wireframes
// (design_handoff_localiator/README.md). Usan los enums de @localiator/shared
// como fuente de verdad; cuando exista backend real, se revisará qué mover allí.

import { ItemKind, OrderStatus } from '@localiator/shared'

export type Condition = 'nuevo' | 'usado' | 'devolucion'

export interface LotItem {
  name: string
  qty: number
  condition: Condition
}

interface ItemBase {
  id: string
  title: string
  description: string
  /** precio en céntimos */
  price: number
  /** precio original en céntimos, si hay descuento */
  originalPrice?: number
  images: string[]
  categorySlug: string
  warehouseId: string
}

export interface Product extends ItemBase {
  kind: typeof ItemKind.PRODUCT
  stock: number
  condition: Condition
}

export interface Lot extends ItemBase {
  kind: typeof ItemKind.LOT
  items: LotItem[]
  condition: Condition
}

export type Item = Product | Lot

export interface Category {
  slug: string
  name: string
}

export interface Warehouse {
  id: string
  name: string
  address: string
}

export interface PickupSlot {
  id: string
  date: string
  window: 'AM' | 'PM'
}

export interface Coupon {
  code: string
  percentOff: number
}

export interface CartItem {
  itemId: string
  qty: number
}

export interface Order {
  id: string
  items: CartItem[]
  coupon?: Coupon
  pickup: { warehouse: Warehouse; slot: PickupSlot }
  /** código/QR de recogida, p. ej. "LC-4821" */
  code: string
  status: typeof OrderStatus.PENDING | typeof OrderStatus.PICKED_UP
}

export interface User {
  id: string
  name: string
  email: string
}
