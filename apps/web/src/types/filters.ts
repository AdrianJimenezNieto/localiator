import type { ItemKind } from '@localiator/shared'
import type { Condition } from './domain'

export interface Filters {
  categorySlug?: string
  kind?: ItemKind
  condition?: Condition
  maxPrice?: number
  warehouseId?: string
}

export type SortOption = 'relevance' | 'price-asc' | 'price-desc'

export const sortLabels: Record<SortOption, string> = {
  relevance: 'Relevancia',
  'price-asc': 'Precio: menor a mayor',
  'price-desc': 'Precio: mayor a menor',
}
