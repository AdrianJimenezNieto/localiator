import type { Coupon } from '../types/domain'

export const coupons: Coupon[] = [
  { code: 'BIENVENIDA10', percentOff: 10 },
  { code: 'VERANO15', percentOff: 15 },
]

export function findCoupon(code: string): Coupon | undefined {
  return coupons.find((c) => c.code.toLowerCase() === code.trim().toLowerCase())
}
