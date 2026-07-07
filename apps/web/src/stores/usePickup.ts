import { create } from 'zustand'
import type { PickupSlot, Warehouse } from '../types/domain'

interface PickupState {
  warehouse: Warehouse | null
  slot: PickupSlot | null
  setWarehouse: (warehouse: Warehouse | null) => void
  setSlot: (slot: PickupSlot | null) => void
}

export const usePickup = create<PickupState>((set) => ({
  warehouse: null,
  slot: null,
  setWarehouse: (warehouse) => set({ warehouse, slot: null }),
  setSlot: (slot) => set({ slot }),
}))
