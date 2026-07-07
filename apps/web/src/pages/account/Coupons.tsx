import { coupons } from '../../mocks/coupons'
import { Badge } from '../../components/ui/Badge'

export function Coupons() {
  return (
    <ul className="flex flex-col gap-2">
      {coupons.map((coupon) => (
        <li key={coupon.code} className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3">
          <span className="font-mono text-sm">{coupon.code}</span>
          <Badge tone="amber">−{coupon.percentOff}%</Badge>
        </li>
      ))}
    </ul>
  )
}
