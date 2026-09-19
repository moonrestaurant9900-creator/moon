import { ipcMain } from 'electron'
import { getSettings, updateSettings } from '../services/settingsService'
import type { SettingsDTO } from '../../shared/types'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async () => getSettings())
  ipcMain.handle('settings:update', async (_e, partial: Partial<SettingsDTO>) => updateSettings(partial))
}
