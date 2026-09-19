// Loaded via `node -r` before the TS test file. Intercepts require('electron') so the
// main-process service modules can run under plain Node for headless testing, against an
// isolated temp SQLite DB (never touches the real app's userData database).
const Module = require('module')
const path = require('path')
const os = require('os')
const fs = require('fs')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-test-'))
console.log('[mock] using temp userData dir:', tmpDir)

const electronMock = {
  app: {
    getPath: (name) => tmpDir,
    isPackaged: false
  },
  dialog: {},
  BrowserWindow: class {},
  protocol: { registerSchemesAsPrivileged() {}, handle() {} },
  shell: {}
}

const originalLoad = Module._load
Module._load = function (request, ...args) {
  if (request === 'electron') return electronMock
  return originalLoad.call(this, request, ...args)
}

require('tsx/cjs')
require('./test-flow.ts')
