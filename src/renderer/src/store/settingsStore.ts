import { create } from 'zustand'
import type { SettingsDTO } from '../../../shared/types'

interface SettingsState {
  settings: SettingsDTO | null
  refresh: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  refresh: async () => {
    const settings = await window.api.settings.get()
    set({ settings })
  }
}))
