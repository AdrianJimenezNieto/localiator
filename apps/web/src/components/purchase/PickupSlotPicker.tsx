import { Chip } from '../ui/Chip'
import { pickupSlots } from '../../mocks/warehouses'
import type { PickupSlot } from '../../types/domain'

interface PickupSlotPickerProps {
  value: PickupSlot | null
  onChange: (slot: PickupSlot) => void
}

const windowLabels: Record<PickupSlot['window'], string> = { AM: 'Mañana', PM: 'Tarde' }

export function PickupSlotPicker({ value, onChange }: PickupSlotPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-neutral-700">Franja de recogida</span>
      <div className="flex flex-wrap gap-2">
        {pickupSlots.map((slot) => (
          <Chip
            key={slot.id}
            label={`${slot.date} · ${windowLabels[slot.window]}`}
            active={value?.id === slot.id}
            onClick={() => onChange(slot)}
          />
        ))}
      </div>
    </div>
  )
}
