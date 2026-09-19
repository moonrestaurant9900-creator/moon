import { ipcMain } from 'electron'
import { exportMonthEndExcel } from '../services/exportService'

export function registerExportIpc(): void {
  ipcMain.handle('export:monthEnd', async (_e, year: number, month: number) => exportMonthEndExcel(year, month))
}
