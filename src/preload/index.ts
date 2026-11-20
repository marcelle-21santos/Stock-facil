import { contextBridge, ipcRenderer } from 'electron'
import type { StockFacilApi } from '../shared/contracts'

const api: StockFacilApi = {
  security: {
    hasAdmin: () => ipcRenderer.invoke('security:has-admin'),
    createAdmin: (password) => ipcRenderer.invoke('security:create-admin', password),
    verifyAdmin: (password) => ipcRenderer.invoke('security:verify-admin', password),
    changeAdminPassword: (currentPassword, newPassword) => ipcRenderer.invoke('security:change-admin-password', currentPassword, newPassword),
    resetAdminPassword: (recoveryCode, newPassword) => ipcRenderer.invoke('security:reset-admin-password', recoveryCode, newPassword),
    hasRecoveryCode: () => ipcRenderer.invoke('security:has-recovery-code')
  },
  products: {
    list: () => ipcRenderer.invoke('products:list'),
    save: (input) => ipcRenderer.invoke('products:save', input),
    archive: (id, password) => ipcRenderer.invoke('products:archive', id, password),
    adjustStock: (id, delta, reason, password) => ipcRenderer.invoke('products:adjust-stock', id, delta, reason, password)
  },
  sales: {
    create: (input) => ipcRenderer.invoke('sales:create', input),
    list: () => ipcRenderer.invoke('sales:list'),
    cancel: (id, password) => ipcRenderer.invoke('sales:cancel', id, password)
  },
  reports: {
    export: (range, format) => ipcRenderer.invoke('reports:export', range, format)
  },
  backup: {
    export: (password) => ipcRenderer.invoke('backup:export', password)
  },
  database: {
    verify: () => ipcRenderer.invoke('database:verify')
  }
}

contextBridge.exposeInMainWorld('stockFacil', api)
