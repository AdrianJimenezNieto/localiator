import { create } from 'zustand'

interface FavoritesState {
  ids: string[]
  toggle: (id: string) => void
  has: (id: string) => boolean
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  ids: [],
  toggle: (id) =>
    set((state) => ({
      ids: state.ids.includes(id) ? state.ids.filter((favId) => favId !== id) : [...state.ids, id],
    })),
  has: (id) => get().ids.includes(id),
}))
