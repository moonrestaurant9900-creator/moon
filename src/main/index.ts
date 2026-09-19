import { app, shell, BrowserWindow, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase } from './db'
import { registerAllIpc } from './ipc'
import { imagesDir } from './services/menuService'

const isDev = !app.isPackaged

// A second copy of the app writing to the same SQLite file concurrently risks
// SQLITE_BUSY errors and data corruption. Only one instance may run at a time;
// launching a second one just focuses the first instead of opening a new window.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  // Catch anything that slips past an IPC handler's own error handling so the
  // whole app doesn't die silently — log it instead of losing the crash reason.
  process.on('uncaughtException', (err) => {
    console.error('[main] uncaughtException:', err)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandledRejection:', reason)
  })

  protocol.registerSchemesAsPrivileged([
    { scheme: 'app-image', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])

  // Same dev/prod resource resolution pattern as the printer helper script and
  // receipt logo — electron-builder's asar packaging means this can't just be
  // a relative require(); it has to be located on disk at runtime.
  const resolveAppIcon = (): string | undefined => {
    const devPath = path.join(__dirname, '../../build/icon.png')
    if (fs.existsSync(devPath)) return devPath
    const prodPath = path.join(process.resourcesPath ?? '', 'logo.jpg')
    if (fs.existsSync(prodPath)) return prodPath
    return undefined
  }

  const createWindow = (): void => {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1100,
      minHeight: 700,
      show: false,
      autoHideMenuBar: true,
      icon: resolveAppIcon(),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    win.once('ready-to-show', () => win.show())

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
      win.webContents.openDevTools({ mode: 'detach' })
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
  }

  const registerImageProtocol = (): void => {
    protocol.handle('app-image', (request) => {
      const requestedName = decodeURIComponent(request.url.replace('app-image://', '').split('?')[0])
      const safeName = path.basename(requestedName)
      const filePath = path.join(imagesDir(), safeName)
      if (!filePath.startsWith(imagesDir()) || !fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }
      return new Response(fs.readFileSync(filePath))
    })
  }

  // A second launch attempt reaches here (on the already-running instance)
  // instead of opening a second window — bring the existing one to front.
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    registerImageProtocol()
    await initDatabase()
    registerAllIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', async (e) => {
    e.preventDefault()
    await closeDatabase()
    app.exit(0)
  })
}
