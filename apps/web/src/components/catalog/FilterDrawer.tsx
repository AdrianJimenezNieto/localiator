import { FiltersForm } from './FiltersForm'
import { Button } from '../ui/Button'
import type { Filters } from '../../types/filters'

interface FilterDrawerProps {
  open: boolean
  filters: Filters
  onChange: (filters: Filters) => void
  onClose: () => void
}

export function FilterDrawer({ open, filters, onChange, onClose }: FilterDrawerProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-white p-4 md:hidden">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-neutral-900">Filtros</h2>
        <button type="button" aria-label="Cerrar filtros" onClick={onClose} className="text-xl">
          ✕
        </button>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto">
        <FiltersForm filters={filters} onChange={onChange} />
      </div>
      <Button onClick={onClose} className="mt-4 w-full">
        Ver resultados
      </Button>
    </div>
  )
}
