import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── File I/O IPC ─────────────────────────────────────────────────────────────

function toKebab(s: string): string {
  return (s ?? '').trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'harness'
}

ipcMain.handle('save-harness', async (_, json: string, projectName: string) => {
  const safeName = toKebab(projectName)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Harness',
    defaultPath: `${safeName}.wireman`,
    filters: [{ name: 'Wireman Harness', extensions: ['wireman'] }]
  })
  if (canceled || !filePath) return { ok: false }
  writeFileSync(filePath, json, 'utf-8')
  return { ok: true, filePath }
})

ipcMain.handle('export-image', async (_, base64: string, projectName: string) => {
  const safeName = toKebab(projectName)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Schematic Image',
    defaultPath: `${safeName}-schematic.png`,
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  })
  if (canceled || !filePath) return { ok: false }
  writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return { ok: true, filePath }
})

ipcMain.handle('load-harness', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Harness',
    filters: [{ name: 'Wireman Harness', extensions: ['wireman'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return { ok: false, json: null }
  const json = readFileSync(filePaths[0], 'utf-8')
  return { ok: true, json }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wireman.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
