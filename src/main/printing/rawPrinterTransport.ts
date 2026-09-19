import { app, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { SystemPrinterInfo } from '../../shared/types'

function resolveHelperScript(): string {
  const devPath = path.join(__dirname, '../../resources/scripts/raw-print.ps1')
  if (fs.existsSync(devPath)) return devPath
  const prodPath = path.join(process.resourcesPath ?? '', 'scripts/raw-print.ps1')
  if (fs.existsSync(prodPath)) return prodPath
  throw new Error('raw-print.ps1 helper script not found')
}

function runPowerShell(args: string[], timeoutMs = 15_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolveHelperScript(), ...args],
      { timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr })
          return
        }
        const exitCode = (error as NodeJS.ErrnoException & { code?: string | number }).code
        if (typeof exitCode === 'number') {
          // Script ran and exited non-zero (a reported failure, e.g. printer offline).
          resolve({ code: exitCode, stdout, stderr })
          return
        }
        // Couldn't launch powershell.exe at all, or the process was killed/timed out.
        reject(error)
      }
    )
  })
}

/**
 * Direct ESC/POS printing over the Windows print spooler's RAW datatype —
 * no print dialog, no GDI/HTML rendering. The printer (or its "Generic / Text
 * Only" / raw-passthrough driver) receives the exact bytes built upstream.
 *
 * This is the one place that knows HOW bytes reach the physical printer.
 * Swapping in a different transport later (raw USB via libusb, network
 * socket 9100, etc.) means changing only this file.
 */
export async function sendRaw(buffer: Buffer, systemName: string): Promise<void> {
  if (!systemName) throw new Error('No Windows printer is configured for this print job')

  const tmpFile = path.join(app.getPath('temp'), `pos-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`)
  fs.writeFileSync(tmpFile, buffer)
  try {
    const { code, stderr } = await runPowerShell(['-PrinterName', systemName, '-DataFile', tmpFile])
    if (code !== 0) {
      throw new Error(stderr.trim() || `Print failed (exit code ${code})`)
    }
  } finally {
    try {
      fs.unlinkSync(tmpFile)
    } catch {
      // best-effort cleanup; a stray temp file is not worth failing the print over
    }
  }
}

// Printer enumeration doesn't need raw spooler access — Electron's own API
// already lists installed Windows printers.
export async function listSystemPrinters(): Promise<SystemPrinterInfo[]> {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  try {
    await win.loadURL('data:text/html,<html></html>')
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault }))
  } finally {
    win.destroy()
  }
}

// The POS never asks the cashier to pick a printer — both the bill and every
// token always go to whichever printer Windows currently has set as default.
export async function getDefaultSystemPrinterName(): Promise<string | null> {
  const printers = await listSystemPrinters()
  return printers.find((p) => p.isDefault)?.name ?? null
}
