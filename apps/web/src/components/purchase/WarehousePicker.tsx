import { warehouses } from '../../mocks/warehouses'
import type { Warehouse } from '../../types/domain'

interface WarehousePickerProps {
  value: Warehouse | null
  onChange: (warehouse: Warehouse) => void
}

export function WarehousePicker({ value, onChange }: WarehousePickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="warehouse" className="text-sm font-medium text-neutral-700">
        Almacén de recogida
      </label>
      <select
        id="warehouse"
        value={value?.id ?? ''}
        onChange={(event) => {
          const warehouse = warehouses.find((wh) => wh.id === event.target.value)
          if (warehouse) onChange(warehouse)
        }}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Selecciona un almacén
        </option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name} — {warehouse.address}
          </option>
        ))}
      </select>
    </div>
  )
}
