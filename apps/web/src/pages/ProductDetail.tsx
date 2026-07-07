import { useParams, Link } from 'react-router'
import { ItemKind } from '@localiator/shared'
import { Gallery } from '../components/product/Gallery'
import { LotBadge } from '../components/product/LotBadge'
import { ConditionTag } from '../components/product/ConditionTag'
import { LotContents } from '../components/product/LotContents'
import { StickyBuyBar } from '../components/purchase/StickyBuyBar'
import { WarehouseBanner } from '../components/layout/WarehouseBanner'
import { EmptyState } from '../components/ui/EmptyState'
import { formatPrice } from '../lib/format'
import { getItemById } from '../mocks/items'
import { warehouses } from '../mocks/warehouses'
import { useCart } from '../stores/useCart'

export function ProductDetail() {
  const { id } = useParams()
  const item = id ? getItemById(id) : undefined
  const add = useCart((state) => state.add)

  if (!item) {
    return <EmptyState title="Producto no encontrado" action={<Link to="/">Volver al inicio</Link>} />
  }

  const warehouse = warehouses.find((wh) => wh.id === item.warehouseId)
  const outOfStock = item.kind === ItemKind.PRODUCT && item.stock <= 0

  return (
    <div className="flex flex-col gap-4 pb-20 md:grid md:grid-cols-2 md:gap-8 md:pb-0">
      <Gallery images={item.images} alt={item.title} />

      <div className="flex flex-col gap-3">
        <LotBadge item={item} />
        <h1 className="text-xl font-semibold text-neutral-900">{item.title}</h1>
        <div className="flex gap-2">
          <ConditionTag condition={item.condition} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-neutral-900">{formatPrice(item.price)}</span>
          {item.originalPrice && (
            <span className="text-neutral-400 line-through">{formatPrice(item.originalPrice)}</span>
          )}
        </div>

        {warehouse && (
          <WarehouseBanner>
            Recogida disponible en <strong>{warehouse.name}</strong> ({warehouse.address})
          </WarehouseBanner>
        )}

        {item.kind === ItemKind.LOT && <LotContents items={item.items} />}

        <p className="text-sm text-neutral-600">{item.description}</p>

        <StickyBuyBar itemId={item.id} disabled={outOfStock} onAddToCart={() => add(item.id)} />
      </div>
    </div>
  )
}
