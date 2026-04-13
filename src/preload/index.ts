import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface Lead {
  id?: number
  name: string
  phone: string
  address: string
  website: string
  email: string
  custom_message: string
  send_status: 'none' | 'sent_auto' | 'opened_manual' | 'failed'
}

export interface ScrapeOptions {
  keyword: string
  location: string
  maxResults?: number
}

export interface AiProgress {
  total: number
  current: number
  leadId?: number
  leadName: string
  message?: string
  status: 'processing' | 'done' | 'error'
  error?: string
}

export interface WaSendProgress {
  total: number
  current: number
  leadId: number
  status: 'sending' | 'done' | 'failed' | 'waiting'
  nextDelay?: number
}

// Typed API exposed to the renderer via contextBridge
const api = {
  // ── Database ──────────────────────────────────────────────────────────────
  saveLead: (lead: Omit<Lead, 'id'>): Promise<Lead> =>
    ipcRenderer.invoke('db:saveLead', lead),
  getLeads: (): Promise<Lead[]> =>
    ipcRenderer.invoke('db:getLeads'),
  deleteLead: (id: number): Promise<void> =>
    ipcRenderer.invoke('db:deleteLead', id),
  deleteAllLeads: (): Promise<void> =>
    ipcRenderer.invoke('db:deleteAllLeads'),

  // ── Scraper ───────────────────────────────────────────────────────────────
  startScrape: (opts: ScrapeOptions): Promise<void> =>
    ipcRenderer.invoke('scraper:start', opts),
  stopScrape: (): Promise<void> =>
    ipcRenderer.invoke('scraper:stop'),

  onLead: (cb: (lead: Lead) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, lead: Lead): void => cb(lead)
    ipcRenderer.on('scraper:lead', handler)
    return () => ipcRenderer.removeListener('scraper:lead', handler)
  },
  onStatus: (cb: (msg: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: string): void => cb(msg)
    ipcRenderer.on('scraper:status', handler)
    return () => ipcRenderer.removeListener('scraper:status', handler)
  },

  // ── Gemini AI ──────────────────────────────────────────────────────────────
  validateApiKey: (apiKey: string): Promise<void> =>
    ipcRenderer.invoke('ai:validateKey', apiKey),

  processWithAI: (payload: { apiKey: string; service?: string }): Promise<{ processed: number }> =>
    ipcRenderer.invoke('ai:processLeads', payload),

  generateOne: (payload: { apiKey: string; leadId: number; service?: string }): Promise<{ leadId: number; message: string }> =>
    ipcRenderer.invoke('ai:generateOne', payload),

  stopAI: (): Promise<void> =>
    ipcRenderer.invoke('ai:stop'),

  onAiProgress: (cb: (progress: AiProgress) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, progress: AiProgress): void => cb(progress)
    ipcRenderer.on('ai:progress', handler)
    return () => ipcRenderer.removeListener('ai:progress', handler)
  },

  // ── Export ────────────────────────────────────────────────────────────────
  exportCsv: (): Promise<{ exported: number; filePath?: string }> =>
    ipcRenderer.invoke('db:exportCsv'),

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  openWhatsApp: (phone: string, message: string): Promise<void> =>
    ipcRenderer.invoke('whatsapp:open', { phone, message }),

  // ── WhatsApp Automated (whatsapp-web.js) ──────────────────────────────────
  waInit: (): Promise<void> =>
    ipcRenderer.invoke('wa:init'),

  waGetStatus: (): Promise<string> =>
    ipcRenderer.invoke('wa:getStatus'),

  waSendBatch: (): Promise<{ sent: number; failed: number }> =>
    ipcRenderer.invoke('wa:sendBatch'),

  waAbort: (): Promise<void> =>
    ipcRenderer.invoke('wa:abort'),

  waDisconnect: (): Promise<void> =>
    ipcRenderer.invoke('wa:disconnect'),

  waLogout: (): Promise<void> =>
    ipcRenderer.invoke('wa:logout'),

  waManualSend: (payload: { leadId: number; phone: string; message: string }): Promise<void> =>
    ipcRenderer.invoke('wa:manualSend', payload),

  onWaStatus: (cb: (data: { status: string; detail?: string }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { status: string; detail?: string }): void => cb(data)
    ipcRenderer.on('wa:status', handler)
    return () => ipcRenderer.removeListener('wa:status', handler)
  },

  onWaQr: (cb: (qr: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, qr: string): void => cb(qr)
    ipcRenderer.on('wa:qr', handler)
    return () => ipcRenderer.removeListener('wa:qr', handler)
  },

  onWaSendProgress: (cb: (progress: WaSendProgress) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, progress: WaSendProgress): void => cb(progress)
    ipcRenderer.on('wa:send-progress', handler)
    return () => ipcRenderer.removeListener('wa:send-progress', handler)
  },

  // ── Window lifecycle ───────────────────────────────────────────────────────
  // Called by the renderer after React's first render so the main process
  // knows it's safe to show the window (prevents background-before-elements flash).
  appReady: (): void => ipcRenderer.send('app:ready')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}


