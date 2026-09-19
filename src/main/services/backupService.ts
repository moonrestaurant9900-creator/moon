import { dialog } from 'electron'
import fs from 'fs'
import { backupDatabasePath, closeDatabase, initDatabase } from '../db'
import { requireAdmin } from '../session'

export async function backupDatabase(): Promise<{ ok: boolean; path?: string; error?: string }> {
  requireAdmin()
  const dbPath = backupDatabasePath()
  const defaultName = `moon-pos-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.db`
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }]
  })
  if (canceled || !filePath) return { ok: false, error: 'cancelled' }
  fs.copyFileSync(dbPath, filePath)
  return { ok: true, path: filePath }
}

export async function restoreDatabase(): Promise<{ ok: boolean; error?: string }> {
  requireAdmin()
  const { filePaths, canceled } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SQLite Database', extensions: ['db'] }]
  })
  if (canceled || filePaths.length === 0) return { ok: false, error: 'cancelled' }
  const dbPath = backupDatabasePath()
  await closeDatabase()
  fs.copyFileSync(filePaths[0], dbPath)
  await initDatabase()
  return { ok: true }
}
