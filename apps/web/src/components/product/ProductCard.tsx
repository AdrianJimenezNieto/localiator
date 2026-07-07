import { Link } from 'react-router'
import { LotBadge } from './LotBadge'
import { ConditionTag } from './ConditionTag'
import { FavButton } from './FavButton'
import { formatPrice } from '../../lib/format'
import type { Item } from '../../types/domain'

export function ProductCard({ item }: { item: Item }) {
  return (
    <Link
      to={`/producto/${item.id}`}
      className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-2 hover:border-amber-400"
    >
      <div className="relative aspect-square rounded-md bg-neutral-100">
        <div className="absolute left-2 top-2">
          <LotBadge item={item} />
        </div>
        <div className="absolute right-2 top-2">
          <FavButton itemId={item.id} />
        </div>
      </div>
      <p className="line-clamp-2 text-sm font-medium text-neutral-900">{item.title}</p>
      <div className="flex items-center gap-2">
        <ConditionTag condition={item.condition} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-neutral-900">{formatPrice(item.price)}</span>
        {item.originalPrice && (
          <span className="text-xs text-neutral-400 line-through">{formatPrice(item.originalPrice)}</span>
        )}
      </div>
    </Link>
  )
}
