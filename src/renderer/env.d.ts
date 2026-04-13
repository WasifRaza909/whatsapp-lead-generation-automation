/// <reference types="vite/client" />

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

declare global {
  interface Window {
    api: {
      // Database
      saveLead: (lead: Omit<Lead, 'id'>) => Promise<Lead>
      getLeads: () => Promise<Lead[]>
      deleteLead: (id: number) => Promise<void>
      deleteAllLeads: () => Promise<void>
      // Scraper
      startScrape: (opts: ScrapeOptions) => Promise<void>
      stopScrape: () => Promise<void>
      onLead: (cb: (lead: Lead) => void) => () => void
      onStatus: (cb: (msg: string) => void) => () => void
      // Gemini AI
      validateApiKey: (apiKey: string) => Promise<void>
      processWithAI: (payload: { apiKey: string; service?: string }) => Promise<{ processed: number }>
      generateOne: (payload: { apiKey: string; leadId: number; service?: string }) => Promise<{ leadId: number; message: string }>
      stopAI: () => Promise<void>
      onAiProgress: (cb: (progress: AiProgress) => void) => () => void
      exportCsv: () => Promise<{ exported: number; filePath?: string }>
      // WhatsApp (wa.me deep link)
      openWhatsApp: (phone: string, message: string) => Promise<void>
      // WhatsApp Automated (whatsapp-web.js)
      waInit: () => Promise<void>
      waGetStatus: () => Promise<string>
      waSendBatch: () => Promise<{ sent: number; failed: number }>
      waAbort: () => Promise<void>
      waDisconnect: () => Promise<void>
      waManualSend: (payload: { leadId: number; phone: string; message: string }) => Promise<void>
      onWaStatus: (cb: (data: { status: string; detail?: string }) => void) => () => void
      onWaQr: (cb: (qr: string) => void) => () => void
      onWaSendProgress: (cb: (progress: WaSendProgress) => void) => () => void
      // Lifecycle
      appReady: () => void
    }
  }
}
