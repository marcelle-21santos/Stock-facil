import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { closeDatabase, getDatabase } from './database'
import { hasAdminPassword, createAdminPassword, verifyAdminPassword, changeAdminPassword, resetAdminPassword, hasAdminRecoveryCode } from './security'
import { listProducts, saveProduct, archiveProduct, adjustStock, createSale, listSales, cancelSale, exportReport, exportBackup, verifyDatabase } from './services'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'Stock Fácil',
    backgroundColor: '#f6f7f4',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerIpc() {
  ipcMain.handle('security:has-admin', () => hasAdminPassword())
  ipcMain.handle('security:create-admin', (_e, password: string) => createAdminPassword(password))
  ipcMain.handle('security:verify-admin', (_e, password: string) => verifyAdminPassword(password))
  ipcMain.handle('security:change-admin-password', (_e, currentPassword: string, newPassword: string) => changeAdminPassword(currentPassword, newPassword))
  ipcMain.handle('security:reset-admin-password', (_e, recoveryCode: string, newPassword: string) => resetAdminPassword(recoveryCode, newPassword))
  ipcMain.handle('security:has-recovery-code', () => hasAdminRecoveryCode())
  ipcMain.handle('products:list', () => listProducts())
  ipcMain.handle('products:save', (_e, input) => saveProduct(input))
  ipcMain.handle('products:archive', (_e, id: number, password: string) => archiveProduct(id, password))
  ipcMain.handle('products:adjust-stock', (_e, id: number, delta: number, reason: string, password: string) => adjustStock(id, delta, reason, password))
  ipcMain.handle('sales:create', (_e, input) => createSale(input))
  ipcMain.handle('sales:list', () => listSales())
  ipcMain.handle('sales:cancel', (_e, id: number, password: string) => cancelSale(id, password))
  ipcMain.handle('reports:export', (_e, range, format) => exportReport(range, format))
  ipcMain.handle('backup:export', (_e, password: string) => exportBackup(password))
  ipcMain.handle('database:verify', () => verifyDatabase())
}

app.whenReady().then(() => {
  getDatabase()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => closeDatabase())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
