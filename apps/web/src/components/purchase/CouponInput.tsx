import { useState } from 'react'
import { Button } from '../ui/Button'
import { findCoupon } from '../../mocks/coupons'
import { useCart } from '../../stores/useCart'

export function CouponInput() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const appliedCoupon = useCart((state) => state.appliedCoupon)
  const applyCoupon = useCart((state) => state.applyCoupon)
  const clearCoupon = useCart((state) => state.clearCoupon)

  function handleApply() {
    const coupon = findCoupon(code)
    if (!coupon) {
      setError('Cupón no válido')
      return
    }
    setError(null)
    applyCoupon(coupon)
  }

  if (appliedCoupon) {
    return (
      <div className="flex items-center justify-between rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
        <span>Cupón {appliedCoupon.code} aplicado (−{appliedCoupon.percentOff}%)</span>
        <button type="button" onClick={clearCoupon} className="underline">
          Quitar
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Código de cupón"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <Button variant="secondary" onClick={handleApply}>
          Aplicar
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
