import type { PickupSlot, Warehouse } from '../types/domain'

export const warehouses: Warehouse[] = [
  { id: 'wh-madrid', name: 'Almacén Madrid Sur', address: 'Polígono Industrial, Getafe' },
  { id: 'wh-valencia', name: 'Almacén Valencia', address: 'Polígono El Bony, Paterna' },
]

export const pickupSlots: PickupSlot[] = [
  { id: 'slot-1', date: '2026-07-08', window: 'AM' },
  { id: 'slot-2', date: '2026-07-08', window: 'PM' },
  { id: 'slot-3', date: '2026-07-09', window: 'AM' },
  { id: 'slot-4', date: '2026-07-09', window: 'PM' },
]
