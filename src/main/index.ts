import { app, shell, BrowserWindow, ipcMain, IpcMainInvokeEvent, HandlerDetails, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import {
  initDatabase,
  saveLead,
  getLeads,
  deleteLead,
  deleteAllLeads,
  getLeadsWithoutCustomMessage,
  updateLeadCustomMessage,
  updateLeadSendStatus,
  getLeadsReadyToSend,
  type Lead
} from './database'
import { scrapeGoogleMaps, stopScrape, type ScrapeOptions } from './scraper'
import { generatePersonalizedMessage, validateApiKey } from './gemini'
import {
  initWhatsApp,
  sendBatch,
  abortSending,
  disconnectWhatsApp,
  logoutWhatsApp,
  getWhatsAppStatus,
  type SendQueueItem
} from './whatsapp'

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
    backgroundColor: '#030912',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Show the window only after React signals it has finished its first render.
  // This eliminates the flash where the background appears before elements render.
  const onAppReady = (): void => { mainWindow.show() }
  ipcMain.once('app:ready', onAppReady)

  // Fallback: show after 4 s if the renderer never sends 'app:ready'
  mainWindow.on('ready-to-show', () => {
    setTimeout(() => {
      if (!mainWindow.isVisible()) {
        ipcMain.removeListener('app:ready', onAppReady)
        mainWindow.show()
      }
    }, 4000)
  })

  // Clean up listener if the window closes before the signal arrives
  mainWindow.on('closed', () => {
    ipcMain.removeListener('app:ready', onAppReady)
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

  // IPC: export all leads to a CSV file (opens native Save dialog)
  ipcMain.handle('db:exportCsv', async () => {
    const leads = getLeads()
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Leads',
      defaultPath: 'leads.csv',
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { exported: 0 }

    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v)
      return '"' + s.replace(/"/g, '""') + '"'
    }
    const header = ['ID', 'Business Name', 'Phone', 'Email', 'Address', 'Website', 'AI Message']
    const rows = leads.map((l) => [
      escape(l.id), escape(l.name), escape(l.phone), escape(l.email),
      escape(l.address), escape(l.website), escape(l.custom_message)
    ])
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    // UTF-8 BOM so Excel opens it correctly
    writeFileSync(filePath, '\uFEFF' + csv, 'utf8')
    return { exported: leads.length, filePath }
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

  // IPC: open WhatsApp with a pre-filled message via wa.me deep link
  // Does NOT mark as opened_manual — only the React UI updates session state.
  // This way if the user closes without sending, the status reverts on page reload.
  ipcMain.handle(
    'whatsapp:open',
    async (_event: IpcMainInvokeEvent, payload: { phone: string; message: string; leadId?: number }) => {
      const { phone, message } = payload
      // Strip everything except digits from the phone number
      const cleaned = phone.replace(/[^\d]/g, '')
      if (!cleaned) throw new Error('Invalid phone number')
      const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`
      await shell.openExternal(url)
    }
  )

  // ── WhatsApp Web.js (Automated Mode) ────────────────────────────────────

  // IPC: initialise whatsapp-web.js client (triggers QR if needed)
  ipcMain.handle('wa:init', async () => {
    await initWhatsApp()
  })

  // IPC: get current WhatsApp client status
  ipcMain.handle('wa:getStatus', () => {
    return getWhatsAppStatus()
  })

  // IPC: start automated batch sending
  ipcMain.handle('wa:sendBatch', async () => {
    const queue: SendQueueItem[] = getLeadsReadyToSend().map((l) => ({
      leadId: l.id!,
      phone: l.phone,
      message: l.custom_message
    }))
    if (queue.length === 0) return { sent: 0, failed: 0 }
    return await sendBatch(queue, (id, status) => updateLeadSendStatus(id, status))
  })

  // IPC: abort automated sending
  ipcMain.handle('wa:abort', () => {
    abortSending()
  })

  // IPC: disconnect whatsapp-web.js client
  ipcMain.handle('wa:disconnect', async () => {
    await disconnectWhatsApp()
  })

  // IPC: logout & wipe session so a fresh QR scan is required
  ipcMain.handle('wa:logout', async () => {
    await logoutWhatsApp()
  })

  // IPC: manual send single lead via wa.me
  // Does NOT mark as opened_manual in DB — only React updates session state.
  // This way if the user closes without sending, the status reverts on page reload.
  ipcMain.handle(
    'wa:manualSend',
    async (_event: IpcMainInvokeEvent, payload: { leadId: number; phone: string; message: string }) => {
      const { phone, message } = payload
      const cleaned = phone.replace(/[^\d]/g, '')
      if (!cleaned) throw new Error('Invalid phone number')
      const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`
      await shell.openExternal(url)
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
