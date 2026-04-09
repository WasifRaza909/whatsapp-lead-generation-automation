/// <reference types="vite/client" />

export interface Lead {
  id?: number
  name: string
  phone: string
  address: string
  website: string
  email: string
  custom_message: string
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
      appReady: () => void
    }
  }
}
