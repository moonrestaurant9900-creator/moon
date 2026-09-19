import { ipcMain } from 'electron'
import * as userService from '../services/userService'
import type { Role } from '../../shared/types'

export function registerUserIpc(): void {
  ipcMain.handle('users:list', async () => userService.listUsers())
  ipcMain.handle(
    'users:create',
    async (_e, data: { name: string; username: string; password: string; role: Role }) =>
      userService.createUser(data)
  )
  ipcMain.handle('users:update', async (_e, id: string, data: any) => userService.updateUser(id, data))
}
