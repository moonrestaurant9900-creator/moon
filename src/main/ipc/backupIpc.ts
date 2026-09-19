import { ipcMain } from 'electron'
import { backupDatabase, restoreDatabase } from '../services/backupService'

export function registerBackupIpc(): void {
  ipcMain.handle('backup:create', async () => backupDatabase())
  ipcMain.handle('backup:restore', async () => restoreDatabase())
}
