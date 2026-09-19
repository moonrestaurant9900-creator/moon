import { ipcMain } from 'electron'
import { getDashboardStats, getSalesByDate } from '../services/dashboardService'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function registerDashboardIpc(): void {
  ipcMain.handle('dashboard:stats', async () => getDashboardStats())

  ipcMain.handle('dashboard:salesByDate', async (_e, from?: string, to?: string) => {
    const toDate = to ?? todayStr()
    let fromDate = from
    if (!fromDate) {
      const d = new Date(`${toDate}T00:00:00`)
      d.setDate(d.getDate() - 13) // default: last 14 days including today
      fromDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return getSalesByDate(fromDate, toDate)
  })
}
