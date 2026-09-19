import { create } from 'zustand'
import type { SessionUser } from '../../../shared/types'

interface AuthState {
  user: SessionUser | null
  loading: boolean
  setUser: (user: SessionUser | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading })
}))
