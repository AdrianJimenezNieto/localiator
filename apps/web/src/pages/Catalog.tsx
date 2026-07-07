import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { FilterSidebar } from '../components/catalog/FilterSidebar'
import { FilterDrawer } from '../components/catalog/FilterDrawer'
import { SortMenu } from '../components/catalog/SortMenu'
import { ProductCard } from '../components/product/ProductCard'
import { EmptyState } from '../components/ui/EmptyState'
import { items } from '../mocks/items'
import { categories } from '../mocks/categories'
import type { Filters, SortOption } from '../types/filters'

export function Catalog() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q')?.toLowerCase() ?? ''

  const [filters, setFilters] = useState<Filters>({ categorySlug: slug })
  const [sort, setSort] = useState<SortOption>('relevance')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const results = useMemo(() => {
    let list = items.filter((item) => {
      if (query && !item.title.toLowerCase().includes(query)) return false
      if (filters.categorySlug && item.categorySlug !== filters.categorySlug) return false
      if (filters.kind && item.kind !== filters.kind) return false
      if (filters.condition && item.condition !== filters.condition) return false
      if (filters.warehouseId && item.warehouseId !== filters.warehouseId) return false
      if (filters.maxPrice !== undefined && item.price > filters.maxPrice) return false
      return true
    })

    if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price)

    return list
  }, [query, filters, sort])

  const title = slug ? categories.find((category) => category.slug === slug)?.name : 'Resultados'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">{title}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm md:hidden"
          >
            ⚙ Filtros
          </button>
          <SortMenu value={sort} onChange={setSort} />
        </div>
      </div>

      <p className="text-sm text-neutral-500">Ver {results.length} resultados</p>

      <div className="flex gap-6">
        <FilterSidebar filters={filters} onChange={setFilters} />
        <FilterDrawer
          open={drawerOpen}
          filters={filters}
          onChange={setFilters}
          onClose={() => setDrawerOpen(false)}
        />

        {results.length === 0 ? (
          <EmptyState title="Sin resultados" description="Prueba a cambiar los filtros o la búsqueda." />
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-3">
            {results.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
