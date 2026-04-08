import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface Lead {
  id?: number
  name: string
  phone: string
  address: string
  website: string
  ai_message: string
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
  }
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


