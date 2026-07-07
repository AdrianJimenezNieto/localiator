import { ItemKind } from '@localiator/shared'
import { FilterChip } from './FilterChip'
import { PriceRange } from './PriceRange'
import { categories } from '../../mocks/categories'
import { warehouses } from '../../mocks/warehouses'
import type { Condition } from '../../types/domain'
import type { Filters } from '../../types/filters'

const conditions: { value: Condition; label: string }[] = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'usado', label: 'Usado' },
  { value: 'devolucion', label: 'Devolución' },
]

const MAX_PRICE = 12000

interface FiltersFormProps {
  filters: Filters
  onChange: (filters: Filters) => void
}

export function FiltersForm({ filters, onChange }: FiltersFormProps) {
  function toggle<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: filters[key] === value ? undefined : value })
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">Categoría</h3>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <FilterChip
              key={category.slug}
              label={category.name}
              active={filters.categorySlug === category.slug}
              onClick={() => toggle('categorySlug', category.slug)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">Tipo</h3>
        <div className="flex flex-wrap gap-2">
          <FilterChip label="Lote" active={filters.kind === ItemKind.LOT} onClick={() => toggle('kind', ItemKind.LOT)} />
          <FilterChip
            label="Unidad"
            active={filters.kind === ItemKind.PRODUCT}
            onClick={() => toggle('kind', ItemKind.PRODUCT)}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">Estado</h3>
        <div className="flex flex-wrap gap-2">
          {conditions.map((condition) => (
            <FilterChip
              key={condition.value}
              label={condition.label}
              active={filters.condition === condition.value}
              onClick={() => toggle('condition', condition.value)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">Almacén de recogida</h3>
        <div className="flex flex-wrap gap-2">
          {warehouses.map((warehouse) => (
            <FilterChip
              key={warehouse.id}
              label={warehouse.name}
              active={filters.warehouseId === warehouse.id}
              onClick={() => toggle('warehouseId', warehouse.id)}
            />
          ))}
        </div>
      </section>

      <PriceRange
        maxPrice={MAX_PRICE}
        value={filters.maxPrice}
        onChange={(maxPrice) => onChange({ ...filters, maxPrice })}
      />
    </div>
  )
}
