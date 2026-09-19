import { ipcMain, dialog } from 'electron'
import * as menuService from '../services/menuService'

export function registerMenuIpc(): void {
  ipcMain.handle('menu:listCategories', async (_e, includeInactive?: boolean) =>
    menuService.listCategories(includeInactive)
  )
  ipcMain.handle('menu:createCategory', async (_e, name: string) => menuService.createCategory(name))
  ipcMain.handle('menu:updateCategory', async (_e, id: string, data: any) => menuService.updateCategory(id, data))

  ipcMain.handle('menu:listItems', async (_e, includeInactive?: boolean) => menuService.listMenuItems(includeInactive))
  ipcMain.handle('menu:createItem', async (_e, data: any) => menuService.createMenuItem(data))
  ipcMain.handle('menu:updateItem', async (_e, id: string, data: any) => menuService.updateMenuItem(id, data))

  ipcMain.handle('menu:pickImage', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (canceled || filePaths.length === 0) return null
    return menuService.saveMenuItemImage(filePaths[0])
  })
}
