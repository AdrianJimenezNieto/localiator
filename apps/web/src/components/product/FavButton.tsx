import { useFavorites } from '../../stores/useFavorites'

export function FavButton({ itemId }: { itemId: string }) {
  const isFav = useFavorites((state) => state.ids.includes(itemId))
  const toggle = useFavorites((state) => state.toggle)

  return (
    <button
      type="button"
      aria-label={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      aria-pressed={isFav}
      onClick={() => toggle(itemId)}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow-sm"
    >
      {isFav ? '♥' : '♡'}
    </button>
  )
}
