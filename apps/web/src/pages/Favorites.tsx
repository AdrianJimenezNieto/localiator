import { Link } from 'react-router'
import { ProductCard } from '../components/product/ProductCard'
import { EmptyState } from '../components/ui/EmptyState'
import { useFavorites } from '../stores/useFavorites'
import { getItemById } from '../mocks/items'

export function Favorites() {
  const ids = useFavorites((state) => state.ids)
  const favoriteItems = ids.map(getItemById).filter((item) => item !== undefined)

  if (favoriteItems.length === 0) {
    return (
      <EmptyState
        title="Aún no tienes favoritos"
        description="Toca el corazón en un producto o lote para guardarlo aquí."
        action={
          <Link to="/" className="text-amber-600 underline">
            Ir al catálogo
          </Link>
        }
      />
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {favoriteItems.map((item) => (
        <ProductCard key={item.id} item={item} />
      ))}
    </div>
  )
}
