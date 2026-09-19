import { create } from 'zustand'
import type { CategoryDTO, MenuItemDTO } from '../../../shared/types'

interface MenuState {
  categories: CategoryDTO[]
  items: MenuItemDTO[]
  loaded: boolean
  refresh: () => Promise<void>
}

export const useMenuStore = create<MenuState>((set) => ({
  categories: [],
  items: [],
  loaded: false,
  refresh: async () => {
    const [categories, items] = await Promise.all([
      window.api.menu.listCategories(),
      window.api.menu.listItems()
    ])
    set({ categories, items, loaded: true })
  }
}))
