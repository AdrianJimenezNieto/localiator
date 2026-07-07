import { Link } from 'react-router'
import { ItemKind } from '@localiator/shared'
import { LotBadge } from '../product/LotBadge'
import { QtyStepper } from './QtyStepper'
import { formatPrice } from '../../lib/format'
import { useCart } from '../../stores/useCart'
import type { Item } from '../../types/domain'

export function CartLine({ item, qty }: { item: Item; qty: number }) {
  const setQty = useCart((state) => state.setQty)
  const maxQty = item.kind === ItemKind.PRODUCT ? item.stock : undefined

  return (
    <div className="flex items-center gap-3 border-b border-neutral-200 py-3">
      <Link to={`/producto/${item.id}`} className="h-16 w-16 shrink-0 rounded-md bg-neutral-100" />
      <div className="flex flex-1 flex-col gap-1">
        <LotBadge item={item} />
        <Link to={`/producto/${item.id}`} className="text-sm font-medium text-neutral-900">
          {item.title}
        </Link>
        <span className="text-sm text-neutral-600">{formatPrice(item.price)}</span>
      </div>
      <QtyStepper qty={qty} max={maxQty} onChange={(next) => setQty(item.id, next)} />
    </div>
  )
}
