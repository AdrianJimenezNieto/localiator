import { FiltersForm } from './FiltersForm'
import type { Filters } from '../../types/filters'

export function FilterSidebar({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (filters: Filters) => void
}) {
  return (
    <aside className="hidden w-64 shrink-0 md:block">
      <h2 className="mb-3 font-semibold text-neutral-900">Filtros</h2>
      <FiltersForm filters={filters} onChange={onChange} />
    </aside>
  )
}
