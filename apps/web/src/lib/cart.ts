import { getItemById } from '../mocks/items'
import type { CartItem, Coupon } from '../types/domain'

/** Subtotal en céntimos, sin aplicar cupón. */
export function getSubtotal(lines: CartItem[]): number {
  return lines.reduce((sum, line) => {
    const item = getItemById(line.itemId)
    return item ? sum + item.price * line.qty : sum
  }, 0)
}

/** Descuento del cupón en céntimos, aplicado sobre el subtotal. */
export function getDiscount(subtotal: number, coupon: Coupon | undefined): number {
  if (!coupon) return 0
  return Math.round((subtotal * coupon.percentOff) / 100)
}

/** Total en céntimos tras aplicar el cupón. La recogida es siempre gratuita. */
export function getTotal(lines: CartItem[], coupon: Coupon | undefined): number {
  const subtotal = getSubtotal(lines)
  return subtotal - getDiscount(subtotal, coupon)
}
