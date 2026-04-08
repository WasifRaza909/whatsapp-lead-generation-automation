import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { BrowserWindow } from 'electron'
import { saveLeadIfNew, type Lead } from './database'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find a Chrome/Chromium executable on Windows, macOS, or Linux */
function findChrome(): string {
  const candidates: string[] = []

  if (process.platform === 'win32') {
    const base = process.env['PROGRAMFILES'] ?? 'C:\\Program Files'
    const base86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'
    const local = process.env['LOCALAPPDATA'] ?? ''
    candidates.push(
      `${base}\\Google\\Chrome\\Application\\chrome.exe`,
      `${base86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${local}\\Google\\Chrome\\Application\\chrome.exe`,
      `${base}\\Google\\Chrome Beta\\Application\\chrome.exe`,
      `${local}\\Google\\Chrome Beta\\Application\\chrome.exe`,
      `${base}\\Chromium\\Application\\chrome.exe`
    )
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    )
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    )
  }

  const { existsSync } = require('fs') as typeof import('fs')
  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  throw new Error(
    'Chrome/Chromium not found. Please install Google Chrome and try again.'
  )
}

/** Send a lead back to the renderer in real-time */
function emitLead(win: BrowserWindow, lead: Lead): void {
  if (!win.isDestroyed()) {
    win.webContents.send('scraper:lead', lead)
  }
}

/** Send a status message to the renderer */
function emitStatus(win: BrowserWindow, message: string): void {
  if (!win.isDestroyed()) {
    win.webContents.send('scraper:status', message)
  }
}

// ── Main scraper ──────────────────────────────────────────────────────────────

export interface ScrapeOptions {
  keyword: string
  location: string
  maxResults?: number
}

let activeBrowser: Browser | null = null

/** Abort any running scrape session */
export async function stopScrape(): Promise<void> {
  if (activeBrowser) {
    await activeBrowser.close().catch(() => {})
    activeBrowser = null
  }
}

export async function scrapeGoogleMaps(
  win: BrowserWindow,
  options: ScrapeOptions
): Promise<void> {
  const { keyword, location, maxResults = 60 } = options
  const query = `${keyword} in ${location}`

  // Close any existing session
  await stopScrape()

  const executablePath = findChrome()
  emitStatus(win, `Opening Chrome…`)

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--lang=en-US,en'
    ]
  })
  activeBrowser = browser

  let page: Page | null = null

  try {
    page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36'
    )
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
    await page.setViewport({ width: 1280, height: 900 })

    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`
    emitStatus(win, `Searching: "${query}"`)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

    // Dismiss cookie/consent dialogs if present
    await page
      .$$eval('button', (btns) => {
        const labels = ['Accept all', 'Accept', 'Reject all', 'I agree']
        for (const btn of btns as unknown as Array<{ innerText: string; click(): void }>) {
          if (labels.some((l) => btn.innerText?.trim().startsWith(l))) {
            btn.click()
            return
          }
        }
      })
      .catch(() => {})

    // Wait for the results panel
    const PANEL_SEL = 'div[role="feed"]'
    await page.waitForSelector(PANEL_SEL, { timeout: 20000 })

    const seen = new Set<string>()
    let totalFound = 0

    emitStatus(win, 'Scrolling results…')

    // Keep scrolling until we hit maxResults or reach end-of-list
    let noNewCount = 0
    while (totalFound < maxResults && noNewCount < 5) {
      // Collect all currently visible result cards
      const cards = await page.$$(
        'div[role="feed"] > div > div > a[href*="/maps/place/"]'
      )

      const prevFound = totalFound

      for (const card of cards) {
        if (totalFound >= maxResults) break

        const cardName = await card
          .evaluate((el) => el.getAttribute('aria-label') ?? '')
          .catch(() => '')

        if (!cardName || seen.has(cardName)) continue
        seen.add(cardName)

        // Click card to open detail panel
        await card.click().catch(() => {})
        await page
          .waitForSelector('h1.DUwDvf, h1[class*="fontHeadlineLarge"]', { timeout: 6000 })
          .catch(() => {})
        await new Promise((r) => setTimeout(r, 1000))

        // ── Extract fields ────────────────────────────────────────────────
        const name = await page
          .$eval('h1.DUwDvf, h1[class*="fontHeadlineLarge"]', (el) => el.textContent?.trim() ?? '')
          .catch(() => cardName)

        // Phone: look for a button whose aria-label contains the number
        const phone = await page
          .$eval(
            'button[data-item-id^="phone:tel:"], [data-tooltip*="Copy phone"], [aria-label*="+"], [aria-label*="Phone"]',
            (el) => {
              const node = el as unknown as { getAttribute(n: string): string | null; textContent: string | null }
              const label = node.getAttribute('aria-label') ?? ''
              const match = label.match(/[\d\s\-\+\(\)]{7,20}/)
              return match ? match[0].trim() : ''
            }
          )
          .catch(() => '')

        // Website
        const website = await page
          .$eval(
            'a[data-item-id="authority"], a[aria-label*="website" i], a[href*="http"][data-item-id]',
            (el) => (el as unknown as { href: string }).href ?? ''
          )
          .catch(() => '')

        // Email — try to find a mailto: link on the detail panel
        const email = await page
          .$eval('a[href^="mailto:"]', (el) =>
            (el as HTMLAnchorElement).href.replace('mailto:', '').split('?')[0].trim()
          )
          .catch(() => '')

        // Address
        const address = await page
          .$eval(
            'button[data-item-id*="address"], [data-item-id="address"] .Io6YTe, [aria-label*="Address"]',
            (el) => {
              const node = el as unknown as { getAttribute(n: string): string | null; textContent: string | null }
              const label = node.getAttribute('aria-label') ?? ''
              const inner = node.textContent?.trim() ?? ''
              return label.replace(/^Address:\s*/i, '') || inner
            }
          )
          .catch(() => '')

        if (!name) continue

        const lead: Lead = {
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          website: website.trim(),
          email: email.trim(),
          custom_message: ''
        }

        // Persist to DB (deduplication inside saveLeadIfNew)
        const saved = saveLeadIfNew(lead)
        if (saved) {
          totalFound++
          emitLead(win, saved)
          emitStatus(win, `Found ${totalFound} lead(s)…`)
        }
      }

      if (totalFound >= maxResults) break

      // Scroll the results panel down
      await page.evaluate((sel: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el = (globalThis as any).document.querySelector(sel) as { scrollTop: number } | null
        if (el) el.scrollTop += 1200
      }, PANEL_SEL)

      await new Promise((r) => setTimeout(r, 1500))

      // Check if we've reached the end-of-list message
      const ended = await page
        .$eval(
          'div[role="feed"] span.HlvSq, div[class*="section-obscured"]',
          () => true
        )
        .catch(() => false)

      if (ended) break

      if (totalFound === prevFound) {
        noNewCount++
      } else {
        noNewCount = 0
      }
    }

    emitStatus(win, `Done — ${totalFound} lead(s) saved.`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitStatus(win, `Error: ${message}`)
    throw err
  } finally {
    await page?.close().catch(() => {})
    await browser.close().catch(() => {})
    activeBrowser = null
  }
}
