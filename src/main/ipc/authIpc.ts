import { ipcMain } from 'electron'
import { login, logout, currentSession } from '../services/authService'

export function registerAuthIpc(): void {
  ipcMain.handle('auth:login', async (_e, username: string, password: string) => {
    return login(username, password)
  })
  ipcMain.handle('auth:logout', async () => {
    await logout()
  })
  ipcMain.handle('auth:currentUser', async () => {
    return currentSession()
  })
}
