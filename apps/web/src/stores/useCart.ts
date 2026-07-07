import { create } from 'zustand'
import type { CartItem, Coupon } from '../types/domain'

interface CartState {
  items: CartItem[]
  appliedCoupon: Coupon | undefined
  add: (itemId: string, qty?: number) => void
  remove: (itemId: string) => void
  setQty: (itemId: string, qty: number) => void
  applyCoupon: (coupon: Coupon) => void
  clearCoupon: () => void
}

export const useCart = create<CartState>((set) => ({
  items: [],
  appliedCoupon: undefined,
  add: (itemId, qty = 1) =>
    set((state) => {
      const existing = state.items.find((line) => line.itemId === itemId)
      if (existing) {
        return {
          items: state.items.map((line) =>
            line.itemId === itemId ? { ...line, qty: line.qty + qty } : line,
          ),
        }
      }
      return { items: [...state.items, { itemId, qty }] }
    }),
  remove: (itemId) =>
    set((state) => ({ items: state.items.filter((line) => line.itemId !== itemId) })),
  setQty: (itemId, qty) =>
    set((state) => ({
      items:
        qty <= 0
          ? state.items.filter((line) => line.itemId !== itemId)
          : state.items.map((line) => (line.itemId === itemId ? { ...line, qty } : line)),
    })),
  applyCoupon: (coupon) => set({ appliedCoupon: coupon }),
  clearCoupon: () => set({ appliedCoupon: undefined }),
}))
