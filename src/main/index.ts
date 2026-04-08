import { app, shell, BrowserWindow, ipcMain, IpcMainInvokeEvent, HandlerDetails } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  initDatabase,
  saveLead,
  getLeads,
  deleteLead,
  deleteAllLeads,
  getLeadsWithoutCustomMessage,
  updateLeadCustomMessage,
  type Lead
} from './database'
import { scrapeGoogleMaps, stopScrape, type ScrapeOptions } from './scraper'
import { generatePersonalizedMessage, validateApiKey } from './gemini'

let aiAbortFlag = false

// During development, override Electron's `userData` path to a project-local folder
// This avoids system-level cache permission issues when running in dev mode.
if (is.dev) {
  try {
    const devUserData = join(process.cwd(), '.electron-user-data')
    app.setPath('userData', devUserData)
  } catch (err) {
    // swallow — if this fails the app will fall back to default paths
    console.warn('Failed to set dev userData path', err)
  }
}
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 950,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details: HandlerDetails) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDatabase()

  // IPC: save a single lead, return the inserted row with its id
  ipcMain.handle('db:saveLead', (_event: IpcMainInvokeEvent, lead: Omit<Lead, 'id'>) => {
    return saveLead(lead)
  })

  // IPC: return all leads
  ipcMain.handle('db:getLeads', () => {
    return getLeads()
  })

  // IPC: delete a lead by id
  ipcMain.handle('db:deleteLead', (_event: IpcMainInvokeEvent, id: number) => {
    deleteLead(id)
  })

  // IPC: delete all leads
  ipcMain.handle('db:deleteAllLeads', () => {
    deleteAllLeads()
  })

  // IPC: start Google Maps scrape — streams results back via win.webContents.send
  ipcMain.handle(
    'scraper:start',
    async (_event: IpcMainInvokeEvent, opts: ScrapeOptions) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) throw new Error('No window available')
      await scrapeGoogleMaps(win, opts)
    }
  )

  // IPC: abort running scrape
  ipcMain.handle('scraper:stop', async () => {
    await stopScrape()
  })

  // IPC: validate a Gemini API key
  ipcMain.handle('ai:validateKey', async (_event: IpcMainInvokeEvent, apiKey: string) => {
    await validateApiKey(apiKey)
  })

  // IPC: generate AI messages for all leads that have no ai_message yet.
  // Streams per-lead progress via win.webContents.send('ai:progress', AiProgress).
  ipcMain.handle('ai:processLeads', async (_event: IpcMainInvokeEvent, payload: { apiKey: string; service?: string }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No window available')

    const { apiKey, service } = typeof payload === 'string'
      ? { apiKey: payload, service: undefined }
      : payload

    const leads = getLeadsWithoutCustomMessage()
    if (leads.length === 0) return { processed: 0 }

    let processed = 0
    aiAbortFlag = false

    for (const lead of leads) {
      if (aiAbortFlag) break

      // Signal "started processing this lead"
      if (!win.isDestroyed()) {
        win.webContents.send('ai:progress', {
          total: leads.length,
          current: processed,
          leadId: lead.id,
          leadName: lead.name,
          status: 'processing'
        })
      }

      try {
        const message = await generatePersonalizedMessage(apiKey, {
          name: lead.name,
          address: lead.address,
          website: lead.website,
          service
        })

        if (aiAbortFlag) break

        updateLeadCustomMessage(lead.id!, message)
        processed++

        if (!win.isDestroyed()) {
          win.webContents.send('ai:progress', {
            total: leads.length,
            current: processed,
            leadId: lead.id,
            leadName: lead.name,
            message,
            status: 'done'
          })
        }
      } catch (err) {
        if (aiAbortFlag) break

        if (!win.isDestroyed()) {
          win.webContents.send('ai:progress', {
            total: leads.length,
            current: processed,
            leadId: lead.id,
            leadName: lead.name,
            status: 'error',
            error: err instanceof Error ? err.message : String(err)
          })
        }
      }

      // Respect Gemini free-tier rate limit (15 RPM → ~1 req per 4s)
      await new Promise((r) => setTimeout(r, 4200))
    }

    return { processed }
  })

  // IPC: abort AI processing
  ipcMain.handle('ai:stop', async () => {
    aiAbortFlag = true
  })

  // IPC: generate AI message for a single lead by id
  ipcMain.handle(
    'ai:generateOne',
    async (_event: IpcMainInvokeEvent, payload: { apiKey: string; leadId: number; service?: string }) => {
      const { apiKey, leadId, service } = payload
      const leads = getLeads()
      const lead = leads.find((l) => l.id === leadId)
      if (!lead) throw new Error(`Lead ${leadId} not found`)

      const message = await generatePersonalizedMessage(apiKey, {
        name: lead.name,
        address: lead.address,
        website: lead.website,
        service
      })
      updateLeadCustomMessage(lead.id!, message)
      return { leadId, message }
    }
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
