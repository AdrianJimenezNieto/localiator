import { Button } from '../ui/Button'
import { FavButton } from '../product/FavButton'

interface StickyBuyBarProps {
  itemId: string
  disabled?: boolean
  onAddToCart: () => void
}

export function StickyBuyBar({ itemId, disabled, onAddToCart }: StickyBuyBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-neutral-200 bg-white p-3 md:static md:border-0 md:bg-transparent md:p-0">
      <FavButton itemId={itemId} />
      <Button onClick={onAddToCart} disabled={disabled} className="flex-1">
        {disabled ? 'Sin stock' : 'Añadir al carrito'}
      </Button>
    </div>
  )
}
