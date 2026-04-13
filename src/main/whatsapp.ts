/**
 * WhatsApp Web.js client — manages session lifecycle (QR auth, sending, cleanup).
 * Uses LocalAuth for persistent sessions so the user doesn't re-scan every launch.
 */

import { BrowserWindow } from 'electron'
import { join } from 'path'
import { app } from 'electron'
import { rmSync } from 'fs'

// whatsapp-web.js ships as CJS; use require() to avoid ESM issues inside electron-vite
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client, LocalAuth } = require('whatsapp-web.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCodeLib = require('qrcode') as { toDataURL: (text: string, opts?: Record<string, unknown>) => Promise<string> }

export type WaClientStatus = 'disconnected' | 'qr' | 'loading' | 'ready' | 'sending' | 'error'

let client: InstanceType<typeof Client> | null = null
let currentStatus: WaClientStatus = 'disconnected'
let abortFlag = false

function getWin(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function emit(channel: string, data: unknown): void {
  const win = getWin()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

function setStatus(s: WaClientStatus, extra?: string): void {
  currentStatus = s
  emit('wa:status', { status: s, detail: extra })
}

/**
 * Initialise the whatsapp-web.js client (idempotent).
 * Shows a QR code (as text) to the renderer on first auth.
 */
export async function initWhatsApp(): Promise<void> {
  if (client) {
    // Already initialised — just report current state
    setStatus(currentStatus)
    return
  }

  const dataPath = join(app.getPath('userData'), '.wwebjs_auth')

  client = new Client({
    authStrategy: new LocalAuth({ dataPath }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    }
  })

  setStatus('loading', 'Starting WhatsApp client…')

  client.on('qr', async (qr: string) => {
    setStatus('qr')
    try {
      const dataUrl = await QRCodeLib.toDataURL(qr, {
        width: 280,
        margin: 2,
        color: { dark: '#e2e8f0', light: '#030912' }
      })
      emit('wa:qr', dataUrl)
    } catch {
      // Fallback: emit raw string so renderer can try its own rendering
      emit('wa:qr', qr)
    }
  })

  client.on('loading_screen', (percent: number, message: string) => {
    setStatus('loading', `${message} (${percent}%)`)
  })

  client.on('authenticated', () => {
    setStatus('loading', 'Authenticated — loading chats…')
  })

  client.on('ready', () => {
    setStatus('ready')
  })

  client.on('auth_failure', (msg: string) => {
    setStatus('error', `Auth failed: ${msg}`)
  })

  client.on('disconnected', (reason: string) => {
    setStatus('disconnected', reason)
    client = null
  })

  await client.initialize()
}

/**
 * Send one message via the active whatsapp-web.js session.
 * Returns true on success, false on failure.
 */
export async function sendMessage(phone: string, message: string): Promise<boolean> {
  if (!client || currentStatus !== 'ready' && currentStatus !== 'sending') {
    throw new Error('WhatsApp client not ready')
  }
  // Normalise to WhatsApp chat-id format: <digits>@c.us
  const digits = phone.replace(/[^\d]/g, '')
  if (!digits) throw new Error('Invalid phone number')
  const chatId = `${digits}@c.us`

  try {
    await client.sendMessage(chatId, message)
    return true
  } catch {
    return false
  }
}

export interface SendQueueItem {
  leadId: number
  phone: string
  message: string
}

/**
 * Send messages to a batch of leads with random human-like delays (45-120 s).
 * Emits `wa:send-progress` per lead so the renderer can update in real-time.
 */
export async function sendBatch(
  queue: SendQueueItem[],
  updateStatus: (id: number, status: 'sent_auto' | 'failed') => void
): Promise<{ sent: number; failed: number }> {
  if (!client || (currentStatus !== 'ready' && currentStatus !== 'sending')) {
    throw new Error('WhatsApp client not ready — scan QR first')
  }

  abortFlag = false
  setStatus('sending')
  let sent = 0
  let failed = 0

  for (let i = 0; i < queue.length; i++) {
    if (abortFlag) break

    const item = queue[i]
    emit('wa:send-progress', {
      total: queue.length,
      current: i,
      leadId: item.leadId,
      status: 'sending'
    })

    try {
      const ok = await sendMessage(item.phone, item.message)
      if (ok) {
        sent++
        updateStatus(item.leadId, 'sent_auto')
        emit('wa:send-progress', {
          total: queue.length,
          current: i + 1,
          leadId: item.leadId,
          status: 'done'
        })
      } else {
        failed++
        updateStatus(item.leadId, 'failed')
        emit('wa:send-progress', {
          total: queue.length,
          current: i + 1,
          leadId: item.leadId,
          status: 'failed'
        })
      }
    } catch {
      failed++
      updateStatus(item.leadId, 'failed')
      emit('wa:send-progress', {
        total: queue.length,
        current: i + 1,
        leadId: item.leadId,
        status: 'failed'
      })
    }

    // Random delay 45-120 seconds to mimic human behaviour
    if (i < queue.length - 1 && !abortFlag) {
      const delay = Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000
      emit('wa:send-progress', {
        total: queue.length,
        current: i + 1,
        leadId: item.leadId,
        status: 'waiting',
        nextDelay: Math.round(delay / 1000)
      })
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (abortFlag) { clearInterval(interval); resolve() }
        }, 500)
        setTimeout(() => { clearInterval(interval); resolve() }, delay)
      })
    }
  }

  setStatus('ready')
  return { sent, failed }
}

export function abortSending(): void {
  abortFlag = true
}

export async function disconnectWhatsApp(): Promise<void> {
  if (client) {
    try { await client.destroy() } catch { /* ignore */ }
    client = null
    setStatus('disconnected')
  }
}

/**
 * Logout + wipe saved session so next connect shows a fresh QR.
 */
export async function logoutWhatsApp(): Promise<void> {
  if (client) {
    try { await client.logout() } catch { /* ignore */ }
    try { await client.destroy() } catch { /* ignore */ }
    client = null
  }
  // Remove persisted LocalAuth session data
  const dataPath = join(app.getPath('userData'), '.wwebjs_auth')
  try { rmSync(dataPath, { recursive: true, force: true }) } catch { /* ignore */ }
  setStatus('disconnected')
}

export function getWhatsAppStatus(): WaClientStatus {
  return currentStatus
}
