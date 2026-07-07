import { getDiscount, getSubtotal, getTotal } from '../../lib/cart'
import { formatPrice } from '../../lib/format'
import { useCart } from '../../stores/useCart'

export function OrderSummary() {
  const items = useCart((state) => state.items)
  const coupon = useCart((state) => state.appliedCoupon)

  const subtotal = getSubtotal(items)
  const discount = getDiscount(subtotal, coupon)
  const total = getTotal(items, coupon)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 text-sm">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{formatPrice(subtotal)}</span>
      </div>
      {coupon && (
        <div className="flex justify-between text-green-700">
          <span>Descuento ({coupon.code})</span>
          <span>−{formatPrice(discount)}</span>
        </div>
      )}
      <div className="flex justify-between text-neutral-500">
        <span>Envío</span>
        <span>Sin envío · recogida gratuita</span>
      </div>
      <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-900">
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>
    </div>
  )
}
