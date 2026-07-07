import { create } from 'zustand'
import type { User } from '../types/domain'

interface AuthState {
  user: User | null
  isGuest: boolean
  /** Mock: la autenticación real llega en la Fase 2. */
  login: (user: User) => void
  logout: () => void
  continueAsGuest: () => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isGuest: false,
  login: (user) => set({ user, isGuest: false }),
  logout: () => set({ user: null, isGuest: false }),
  continueAsGuest: () => set({ user: null, isGuest: true }),
}))
