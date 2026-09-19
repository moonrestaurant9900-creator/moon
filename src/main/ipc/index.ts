import { registerAuthIpc } from './authIpc'
import { registerMenuIpc } from './menuIpc'
import { registerOrderIpc } from './orderIpc'
import { registerDashboardIpc } from './dashboardIpc'
import { registerSettingsIpc } from './settingsIpc'
import { registerUserIpc } from './userIpc'
import { registerBackupIpc } from './backupIpc'
import { registerExportIpc } from './exportIpc'

export function registerAllIpc(): void {
  registerAuthIpc()
  registerMenuIpc()
  registerOrderIpc()
  registerDashboardIpc()
  registerSettingsIpc()
  registerUserIpc()
  registerBackupIpc()
  registerExportIpc()
}
