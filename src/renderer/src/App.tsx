import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import SettingsPage from './SettingsPage'

interface Lead {
  id?: number
  name: string
  phone: string
  address: string
  website: string
  email: string
  custom_message: string
  send_status: 'none' | 'sent_auto' | 'opened_manual' | 'failed'
}

interface AiProgress {
  total: number
  current: number
  leadId?: number
  leadName: string
  message?: string
  status: 'processing' | 'done' | 'error'
  error?: string
}

type ScraperState = 'idle' | 'running' | 'done' | 'error'
type AiState     = 'idle' | 'running' | 'done' | 'error'
type Tab         = 'scraper' | 'settings'

const LS_KEY         = 'gemini_api_key'
const LS_SERVICE_KEY = 'my_service'

function App(): React.ReactElement {
  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('scraper')

  // ── Scraper ───────────────────────────────────────────────────────────────
  const [keyword, setKeyword]         = useState('')
  const [location, setLocation]       = useState('')
  const [maxResults, setMaxResults]   = useState(5)
  const [leads, setLeads]             = useState<Lead[]>([])
  const [status, setStatus]           = useState('')
  const [scraperState, setScraperState] = useState<ScraperState>('idle')
  const [newLeadIds, setNewLeadIds]   = useState<Set<number | string>>(new Set())
  const [sessionLeadCount, setSessionLeadCount] = useState(0)
  const unsubRef = useRef<Array<() => void>>([])

  // ── AI ────────────────────────────────────────────────────────────────────
  const [aiState, setAiState]   = useState<AiState>('idle')
  const [aiProgress, setAiProgress] = useState<{
    current: number; total: number; lastName: string
  }>({ current: 0, total: 0, lastName: '' })
  const aiUnsubRef = useRef<(() => void) | null>(null)
  const tableRef    = useRef<HTMLElement>(null)
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set())
  const [currentPage, setCurrentPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [sortBy, setSortBy] = useState<keyof Lead | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [aiError, setAiError] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [exporting, setExporting] = useState(false)
  const [pageSizeDropdownOpen, setPageSizeDropdownOpen] = useState(false)
  const pageSizeBtnRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; openUp: boolean }>({ top: 0, left: 0, openUp: false })

  // ── Sender ──────────────────────────────────────────────────────────────────
  const [senderOpen, setSenderOpen] = useState(false)
  const [sendMode, setSendMode] = useState<'auto' | 'manual'>('manual')
  const [waStatus, setWaStatus] = useState<'disconnected' | 'qr' | 'loading' | 'ready' | 'sending' | 'error'>('disconnected')
  const [waDetail, setWaDetail] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [campaignState, setCampaignState] = useState<'idle' | 'connecting' | 'ready' | 'sending' | 'done' | 'error'>('idle')
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 })
  const [currentSendLeadId, setCurrentSendLeadId] = useState<number | null>(null)
  const [waitingDelay, setWaitingDelay] = useState<number | null>(null)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sessionSendResults, setSessionSendResults] = useState<Map<number, 'sent_auto' | 'opened_manual' | 'failed'>>(new Map())
  const [showQrModal, setShowQrModal] = useState(false)
  const waUnsubRef = useRef<Array<() => void>>([])

  // Close modal on Escape
  // Signal main process that React has rendered — window is shown only after this,
  // eliminating the flash where the background appears before elements render.
  useEffect(() => {
    window.api.appReady()
  }, [])

  useEffect(() => {
    if (!selectedLead) return
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') setSelectedLead(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedLead])

  useEffect(() => {
    if (!pageSizeDropdownOpen) return
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') setPageSizeDropdownOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [pageSizeDropdownOpen])

  // Close page size dropdown when clicking outside
  useEffect(() => {
    if (!pageSizeDropdownOpen) return
    const handler = (e: MouseEvent): void => {
      const target = e.target as Node
      // Close if click is not on the trigger button and not inside dropdown portal
      if (!pageSizeBtnRef.current?.contains(target) && !(target as Element).closest?.('.dropdown-menu')) {
        setPageSizeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pageSizeDropdownOpen])

  useEffect(() => {
    window.api.getLeads().then(setLeads).catch(console.error)
  }, [])

  // refresh leads from DB whenever scraping finishes (catches any missed IPC events)
  useEffect(() => {
    if (scraperState === 'done' || scraperState === 'error') {
      window.api.getLeads().then(setLeads).catch(console.error)
    }
  }, [scraperState])

  // auto-scroll to leads table when scraping completes
  useEffect(() => {
    if (scraperState === 'done') {
      setTimeout(() => {
        tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 250)
    }
  }, [scraperState])

  // scroll table into view on page change
  useEffect(() => {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [currentPage])

  // cleanup on unmount
  useEffect(() => {
    return () => {
      unsubRef.current.forEach((fn) => fn())
      aiUnsubRef.current?.()
      waUnsubRef.current.forEach((fn) => fn())
    }
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const markNew = (key: number | string): void => {
    setNewLeadIds((prev) => new Set(prev).add(key))
    setTimeout(() => {
      setNewLeadIds((prev) => { const n = new Set(prev); n.delete(key); return n })
    }, 1200)
  }

  // ── Scraper handlers ──────────────────────────────────────────────────────
  const handleStart = async (): Promise<void> => {
    if (!keyword.trim() || !location.trim()) {
      setStatus('⚠ Please enter both a keyword and a location.')
      return
    }
    unsubRef.current.forEach((fn) => fn())
    unsubRef.current = []
    setScraperState('running')
    setStatus('Initialising scraper…')
    setSessionLeadCount(0)

    const unsubLead = window.api.onLead((lead: Lead) => {
      setLeads((prev) => [lead, ...prev])
      // show newest leads on page 1
      setCurrentPage(0)
      setSessionLeadCount((c) => c + 1)
      markNew(lead.id ?? lead.name)
    })
    const unsubStatus = window.api.onStatus((msg: string) => {
      setStatus(msg)
      if (msg.startsWith('Done') || msg.startsWith('Error')) {
        setScraperState(msg.startsWith('Error') ? 'error' : 'done')
      }
    })
    unsubRef.current = [unsubLead, unsubStatus]

    try {
      await window.api.startScrape({ keyword: keyword.trim(), location: location.trim(), maxResults })
      // Explicitly transition — don't rely solely on IPC send timing
      setScraperState((prev) => (prev === 'running' ? 'done' : prev))
    } catch (err) {
      setStatus(`Error: ${String(err)}`)
      setScraperState('error')
    } finally {
      // Always refresh leads from DB when scraping finishes
      window.api.getLeads().then(setLeads).catch(console.error)
    }
  }

  const handleStop = async (): Promise<void> => {
    await window.api.stopScrape()
    setScraperState('idle')
    setStatus('Scrape stopped.')
  }

  const handleDelete = async (id?: number): Promise<void> => {
    if (!id) return
    await window.api.deleteLead(id)
    setLeads((prev) => prev.filter((l) => l.id !== id))
  }

  const handleResetAllLeads = async (): Promise<void> => {
    const confirmed = window.confirm(
      `Delete all ${leads.length} lead(s)? This action cannot be undone.`
    )
    if (!confirmed) return
    await window.api.deleteAllLeads()
    setLeads([])
    setCurrentPage(0)
    setStatus('✓ All leads have been reset.')
  }

  const handleTestDB = async (): Promise<void> => {
    const dummy: Omit<Lead, 'id'> = {
      name: 'Test Business', phone: '+92 331 3780919',
      address: '123 Main St, New York, NY 10001',
      website: 'https://example.com', email: 'hello@example.com', custom_message: '',
      send_status: 'none'
    }
    const saved = await window.api.saveLead(dummy)
    setLeads((prev) => [saved, ...prev])
    setCurrentPage(0)
    markNew(saved.id ?? saved.name)
    setStatus(`✓ Test lead saved (id=${saved.id})`)
  }

  // ── AI handler ────────────────────────────────────────────────────────────
  const handleProcessWithAI = async (): Promise<void> => {
    const apiKey = localStorage.getItem(LS_KEY)?.trim()
    if (!apiKey) {
      setActiveTab('settings')
      return
    }
    const service = localStorage.getItem(LS_SERVICE_KEY)?.trim() || undefined
    aiUnsubRef.current?.()
    setAiState('running')
    setAiProgress({ current: 0, total: 0, lastName: '' })

    const unsub = window.api.onAiProgress((p: AiProgress) => {
      setAiProgress({ current: p.current, total: p.total, lastName: p.leadName })
      if (p.status === 'done' && p.message !== undefined) {
        setLeads((prev) =>
          prev.map((l) => (l.id === p.leadId ? { ...l, custom_message: p.message! } : l))
        )
      }
    })
    aiUnsubRef.current = unsub

    try {
      const result = await window.api.processWithAI({ apiKey, service })
      setAiState('done')
      setAiError(null)
      setStatus(`✨ AI wrote ${result.processed} message(s).`)
      const updated = await window.api.getLeads()
      setLeads(updated)
    } catch (err) {
      setAiState('error')
      setAiError(String(err).replace(/^Error:\s*/, ''))
    } finally {
      unsub()
      aiUnsubRef.current = null
      setAiProgress({ current: 0, total: 0, lastName: '' })
    }
  }

  const handleGenerateOne = async (leadId: number): Promise<void> => {
    const apiKey = localStorage.getItem(LS_KEY)?.trim()
    if (!apiKey) { setActiveTab('settings'); return }
    const service = localStorage.getItem(LS_SERVICE_KEY)?.trim() || undefined
    setGeneratingIds((prev) => new Set(prev).add(leadId))
    try {
      const { message } = await window.api.generateOne({ apiKey, leadId, service })
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, custom_message: message } : l))
      )
      setAiError(null)
    } catch (err) {
      setAiError(String(err).replace(/^Error:\s*/, ''))
    } finally {
      setGeneratingIds((prev) => { const n = new Set(prev); n.delete(leadId); return n })
    }
  }

  const handleStopAI = async (): Promise<void> => {
    await window.api.stopAI()
    setAiState('idle')
    setStatus('AI processing stopped.')
    const updated = await window.api.getLeads()
    setLeads(updated)
  }

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    try {
      await window.api.exportCsv()
    } finally {
      setExporting(false)
    }
  }

  // Sorting handler: toggle direction when clicking same column
  const handleSort = (col: keyof Lead): void => {
    setCurrentPage(0)
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  // ── Sender handlers ─────────────────────────────────────────────────────
  const readyToSendLeads = useMemo(
    () => leads.filter((l) => l.phone && l.custom_message && l.send_status !== 'sent_auto'),
    [leads]
  )

  const sendPercent = sendProgress.total > 0 ? Math.round((sendProgress.current / sendProgress.total) * 100) : 0

  const getLeadSendStatus = (lead: Lead): { label: string; cls: string } => {
    const ss = lead.id ? sessionSendResults.get(lead.id) : undefined
    const s = ss || lead.send_status
    switch (s) {
      case 'sent_auto': return { label: 'Sent', cls: 'status-sent' }
      case 'opened_manual': return { label: 'Opened', cls: 'status-opened' }
      case 'failed': return { label: 'Failed', cls: 'status-failed' }
      default: return { label: 'Pending', cls: 'status-pending' }
    }
  }

  const handleWaConnect = async (): Promise<void> => {
    setCampaignState('connecting')
    setSendError(null)
    setQrDataUrl(null)
    waUnsubRef.current.forEach((fn) => fn())
    waUnsubRef.current = []

    const unsubStatus = window.api.onWaStatus((data) => {
      setWaStatus(data.status as typeof waStatus)
      setWaDetail(data.detail || '')
      if (data.status === 'ready') { setCampaignState('ready'); setQrDataUrl(null); setShowQrModal(false) }
      if (data.status === 'error') { setCampaignState('error'); setSendError(data.detail || 'Connection failed') }
      if (data.status === 'disconnected') { setCampaignState('idle') }
    })

    const unsubQr = window.api.onWaQr((dataUrl) => {
      setQrDataUrl(dataUrl)
      setShowQrModal(true)
      setCampaignState('connecting')
    })

    waUnsubRef.current = [unsubStatus, unsubQr]
    try { await window.api.waInit() }
    catch (err) { setSendError(String(err)); setCampaignState('error') }
  }

  const handleStartCampaign = async (): Promise<void> => {
    setCampaignState('sending')
    setSendResult(null)
    setSendError(null)
    setSessionSendResults(new Map())
    setSendProgress({ current: 0, total: readyToSendLeads.length })

    const unsub = window.api.onWaSendProgress((p) => {
      setSendProgress({ current: p.current, total: p.total })
      setCurrentSendLeadId(p.leadId)
      setWaitingDelay(p.status === 'waiting' ? (p.nextDelay ?? null) : null)
      if (p.status === 'done') setSessionSendResults((prev) => new Map(prev).set(p.leadId, 'sent_auto'))
      else if (p.status === 'failed') setSessionSendResults((prev) => new Map(prev).set(p.leadId, 'failed'))
    })
    waUnsubRef.current.push(unsub)

    try {
      const res = await window.api.waSendBatch()
      setSendResult(res)
      setCampaignState('done')
      setWaitingDelay(null)
      setCurrentSendLeadId(null)
      const updated = await window.api.getLeads()
      setLeads(updated)
    } catch (err) { setSendError(String(err)); setCampaignState('error') }
  }

  const handleStopCampaign = async (): Promise<void> => {
    await window.api.waAbort()
    setCampaignState('ready')
    setWaitingDelay(null)
    setCurrentSendLeadId(null)
    const updated = await window.api.getLeads()
    setLeads(updated)
  }

  const handleWaDisconnect = async (): Promise<void> => {
    await window.api.waDisconnect()
    setCampaignState('idle')
    setWaStatus('disconnected')
    setQrDataUrl(null)
  }

  const handleWaLogout = async (): Promise<void> => {
    await window.api.waLogout()
    setCampaignState('idle')
    setWaStatus('disconnected')
    setQrDataUrl(null)
  }

  const handleManualSend = async (lead: Lead): Promise<void> => {
    if (!lead.id || !lead.phone || !lead.custom_message) return
    try {
      await window.api.waManualSend({ leadId: lead.id, phone: lead.phone, message: lead.custom_message })
      setSessionSendResults((prev) => new Map(prev).set(lead.id!, 'opened_manual'))
      const updated = await window.api.getLeads()
      setLeads(updated)
    } catch (err) { setSendError(String(err)) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const isRunning        = scraperState === 'running'
  const statusClass      = scraperState === 'error' ? 'err' : scraperState === 'done' ? 'ok' : ''
  const unprocessedCount = leads.filter((l) => !l.custom_message).length
  const hasKey           = !!localStorage.getItem(LS_KEY)
  const aiPercent        = aiProgress.total > 0
    ? Math.round((aiProgress.current / aiProgress.total) * 100)
    : 0

  // Sorted leads (derived)
  const sortedLeads = useMemo(() => {
    if (!sortBy) return [...leads]
    const arr = [...leads]
    const multiplier = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const getVal = (l: Lead, key: keyof Lead) => {
        if (key === 'id') return l.id ?? 0
        return (l[key] as string) ?? ''
      }
      const va = getVal(a, sortBy)
      const vb = getVal(b, sortBy)
      if (sortBy === 'id') {
        return (Number(va) - Number(vb)) * multiplier
      }
      return String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) * multiplier
    })
    return arr
  }, [leads, sortBy, sortDir])

  // Pagination (operate on sorted results)
  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / pageSize))
  useEffect(() => {
    // clamp current page when leads/pageSize change
    if (currentPage >= totalPages) setCurrentPage(Math.max(0, totalPages - 1))
  }, [sortedLeads.length, pageSize, totalPages, currentPage])

  const paginatedLeads = sortedLeads.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  const pageRange = (() => {
    const maxButtons = 5
    let start = Math.max(0, currentPage - Math.floor(maxButtons / 2))
    let end = start + maxButtons
    if (end > totalPages) { end = totalPages; start = Math.max(0, end - maxButtons) }
    return Array.from({ length: end - start }, (_, i) => start + i)
  })()

  return (
    <div className="container max-w-[1440px] mx-auto px-4 sm:px-8 py-6 sm:py-10 relative z-[1]">

      {/* ── Header ── */}
      <header className="mb-10">
        <div className="inline-flex items-center gap-2 bg-[rgba(34,211,238,0.07)] border border-[rgba(34,211,238,0.18)] rounded-full py-[0.3rem] px-[0.95rem] text-[0.65rem] font-bold text-cyan uppercase tracking-[0.14em] mb-[0.9rem] w-fit">
          <span className="w-[7px] h-[7px] rounded-full bg-cyan animate-breathe" style={{ boxShadow: '0 0 8px #22d3ee, 0 0 16px rgba(34,211,238,0.4)' }} />
          WhatsMaps AI · Live Scraper
        </div>
        <h1 className="text-[clamp(2.1rem,4.5vw,3rem)] font-black tracking-[-0.045em] leading-[1.08] animate-grad-shift">WhatsMaps AI</h1>
        <p className="mt-[0.4rem] text-app-text-dim text-[0.88rem] font-medium tracking-[0.02em]">Google Maps Scraper &amp; WhatsApp AI Sender</p>
      </header>

      {/* ── Tab nav ── */}
      <nav className="tab-nav">
        <button
          className={`tab-btn${activeTab === 'scraper' ? ' active' : ''}`}
          onClick={() => setActiveTab('scraper')}
        >
          🗺 Scraper
        </button>
        <button
          className={`tab-btn${activeTab === 'settings' ? ' active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙ Settings
          {!hasKey && <span className="tab-alert" />}
        </button>
      </nav>

      {/* ═══════════════ SETTINGS TAB ═══════════════ */}
      {activeTab === 'settings' && <SettingsPage />}

      {/* ═══════════════ SCRAPER TAB ════════════════ */}
      {activeTab === 'scraper' && (
        <>
          {/* Stats strip */}
          <div className="flex gap-3 mb-6 flex-wrap">
            <div className="flex items-center gap-[0.6rem] bg-white/[0.025] border border-white/[0.06] rounded-[10px] py-[0.6rem] px-[1.1rem]">
              <span className="text-[1.1rem]">📍</span>
              <div className="flex flex-col">
                <span className="font-extrabold text-cyan text-[1.15rem] leading-none">{leads.length}</span>
                <span className="text-app-text-mute text-[0.68rem] uppercase tracking-[0.09em] mt-[0.1rem]">Total Leads</span>
              </div>
            </div>
            <div className="flex items-center gap-[0.6rem] bg-white/[0.025] border border-white/[0.06] rounded-[10px] py-[0.6rem] px-[1.1rem]">
              <span className="text-[1.1rem]">{isRunning ? '⚡' : '💤'}</span>
              <div className="flex flex-col">
                <span className="font-extrabold text-cyan text-[1.15rem] leading-none"
                  style={{ color: isRunning ? '#22d3ee' : '#334155' }}>
                  {isRunning ? 'LIVE' : scraperState === 'done' ? 'DONE' : 'IDLE'}
                </span>
                <span className="text-app-text-mute text-[0.68rem] uppercase tracking-[0.09em] mt-[0.1rem]">Scraper</span>
              </div>
            </div>
            <div className="flex items-center gap-[0.6rem] bg-white/[0.025] border border-white/[0.06] rounded-[10px] py-[0.6rem] px-[1.1rem]">
              <span className="text-[1.1rem]">✨</span>
              <div className="flex flex-col">
                <span className="font-extrabold text-cyan text-[1.15rem] leading-none"
                  style={{ color: unprocessedCount > 0 ? '#f59e0b' : '#22d3ee' }}>
                  {leads.length - unprocessedCount}/{leads.length}
                </span>
                <span className="text-app-text-mute text-[0.68rem] uppercase tracking-[0.09em] mt-[0.1rem]">AI Processed</span>
              </div>
            </div>
            <div className="flex items-center gap-[0.6rem] bg-white/[0.025] border border-white/[0.06] rounded-[10px] py-[0.6rem] px-[1.1rem]">
              <span className="text-[1.1rem]">🎯</span>
              <div className="flex flex-col">
                <span className="font-extrabold text-cyan text-[1.15rem] leading-none">{maxResults}</span>
                <span className="text-app-text-mute text-[0.68rem] uppercase tracking-[0.09em] mt-[0.1rem]">Max Target</span>
              </div>
            </div>
          </div>

          {/* Search Form */}
          {!isRunning && (
            <section className="form-card">
            <p className="text-[0.68rem] font-extrabold text-app-text-mute uppercase tracking-[0.13em] mb-[1.4rem]">🔍 Search Configuration</p>
            <div className="flex gap-4 flex-wrap mb-5">
              <div className="flex flex-col flex-1 min-w-[160px]">
                <label>Keyword</label>
                <input type="text" placeholder="e.g. Dentists, Restaurants, Gyms…"
                  value={keyword} onChange={(e) => setKeyword(e.target.value)}
                  disabled={isRunning} />
              </div>
              <div className="flex flex-col flex-1 min-w-[160px]">
                <label>Location</label>
                <input type="text" placeholder="e.g. Karachi, Dubai, New York…"
                  value={location} onChange={(e) => setLocation(e.target.value)}
                  disabled={isRunning} />
              </div>
              <div className="flex flex-col flex-1 min-w-[160px] max-w-[130px]">
                <label>Max Results</label>
                <div className="number-stepper" role="group" aria-label="Max Results">
                  <button
                    type="button"
                    className="number-stepper__btn"
                    onClick={() => setMaxResults((prev) => Math.max(5, prev - 5))}
                    disabled={isRunning || maxResults <= 5}
                    aria-label="Decrease max results"
                  >
                    −
                  </button>
                  <input
                    className="number-stepper__input"
                    type="number"
                    min={5}
                    max={200}
                    value={maxResults}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (Number.isNaN(v)) return
                      setMaxResults(Math.max(5, Math.min(200, Math.round(v))))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); setMaxResults((p) => Math.min(200, p + 5)) }
                      else if (e.key === 'ArrowDown') { e.preventDefault(); setMaxResults((p) => Math.max(5, p - 5)) }
                      else if (e.key === 'PageUp') { e.preventDefault(); setMaxResults((p) => Math.min(200, p + 10)) }
                      else if (e.key === 'PageDown') { e.preventDefault(); setMaxResults((p) => Math.max(5, p - 10)) }
                    }}
                    onBlur={() => setMaxResults((p) => Math.max(5, Math.min(200, Math.round(p))))}
                    disabled={isRunning}
                    aria-label="Max results value"
                  />
                  <button
                    type="button"
                    className="number-stepper__btn"
                    onClick={() => setMaxResults((prev) => Math.min(200, prev + 5))}
                    disabled={isRunning || maxResults >= 200}
                    aria-label="Increase max results"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-[0.8rem] flex-wrap mb-4">
              {!isRunning ? (
                <button className="btn-primary" onClick={handleStart}>🚀 Start Scraping</button>
              ) : (
                <button className="btn-danger" onClick={handleStop}>⏹ Stop</button>
              )}
              <button className="btn-ghost" onClick={handleTestDB} disabled={isRunning}>🗄 Test DB</button>
              {leads.length > 0 && (
                <button className="btn-reset" onClick={handleResetAllLeads} disabled={isRunning}
                  title="Delete all scraped leads">
                  🗑 Clear DataBase
                </button>
              )}
              <button
                className="btn-primary ml-auto"
                onClick={handleExport}
                disabled={exporting || leads.length === 0}
                title={leads.length === 0 ? 'No leads to export' : 'Export all leads to Excel CSV'}
              >
                {exporting ? '⏳ Exporting…' : '📊 Export CSV'}
              </button>
            </div>
            {/* Status line (only shown when not actively scraping) */}
            {!isRunning && status && (
              <div className="flex items-center gap-[0.7rem] mt-[0.9rem]">
                <span className={`text-[0.82rem] font-semibold transition-colors duration-[400ms] ${statusClass === 'err' ? 'text-red' : statusClass === 'ok' ? 'text-green' : 'text-cyan'}`}>{status}</span>
              </div>
            )}
            </section>
          )}

          {/* ── Scraping loader — lives OUTSIDE form-card so animations aren't clipped ── */}
          {isRunning && (
            <div className="scrape-loader">
              <div className="relative w-10 h-10 shrink-0 overflow-visible">
                <span className="scrape-loader__ring" />
                <span className="scrape-loader__ring" />
                <span className="scrape-loader__ring" />
                <div className="scrape-loader__core" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-[0.4rem]">
                  <span className="text-[0.68rem] font-extrabold text-cyan uppercase tracking-[0.13em]">⚡ Scanning Google Maps</span>
                  <span className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-cyan leading-none tabular-nums" style={{ textShadow: '0 0 16px rgba(34,211,238,0.4)' }}>{sessionLeadCount}</span>
                    <span className="text-[0.62rem] font-bold text-app-text-dim uppercase tracking-[0.09em]"> leads found</span>
                  </span>
                </div>
                <div className="text-[0.83rem] font-medium text-app-text whitespace-nowrap overflow-hidden text-ellipsis mb-[0.65rem] min-h-[1.2em] transition-opacity duration-[250ms]">{status || 'Initialising…'}</div>
                <div className="h-[3px] bg-[rgba(51,65,85,0.4)] rounded-full overflow-hidden relative">
                  <div className="scrape-loader__bar-fill" />
                </div>
              </div>
            </div>
          )}

          {/* Leads Table */}
          {leads.length > 0 && (
            <section className="" ref={tableRef}>
              <div className="flex items-center justify-between mb-[1.1rem]">
                <span className="text-[0.65rem] font-extrabold text-app-text-dim uppercase tracking-[0.14em]">Captured Leads</span>
                <div className="flex items-center gap-3">
                  {aiState !== 'running' ? (
                    <button
                      className={`btn-ai${!hasKey ? ' btn-ai--warn' : ''}`}
                      onClick={handleProcessWithAI}
                      disabled={isRunning}
                      title={!hasKey ? 'Set your Gemini key in Settings first' : `Process ${unprocessedCount} unprocessed lead(s)`}
                    >
                      ✨ Process with AI
                      {unprocessedCount > 0 && (
                        <span className="inline-flex items-center justify-center bg-[rgba(167,139,250,0.3)] text-purple-lightest text-[0.63rem] font-extrabold min-w-[18px] h-[18px] rounded-full px-[0.35rem] ml-[0.1rem]">{unprocessedCount}</span>
                      )}
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2 bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.25)] rounded-lg py-[0.42rem] px-[0.9rem] text-[0.78rem] font-bold text-purple-light tabular-nums">
                      <span className="w-[7px] h-[7px] rounded-full bg-purple animate-breathe-fast" style={{ boxShadow: '0 0 8px #a78bfa' }} />
                      AI {aiProgress.current}/{aiProgress.total}
                      {aiProgress.total > 0 && (
                        <span className="ml-[0.2rem] text-[rgba(196,181,253,0.6)] text-[0.72rem]">{aiPercent}%</span>
                      )}
                      <button className="btn-ai-stop" onClick={handleStopAI} title="Stop AI processing">
                        ✕
                      </button>
                    </div>
                  )}
                  <span className="inline-flex items-center justify-center bg-[rgba(34,211,238,0.1)] text-cyan font-extrabold text-[0.78rem] py-[0.18rem] px-[0.65rem] rounded-full border border-[rgba(34,211,238,0.25)] tabular-nums" style={{ boxShadow: '0 0 12px rgba(34,211,238,0.15)' }} key={leads.length}>{leads.length}</span>
                </div>
              </div>

              {/* ── Sender Panel Toggle + Collapsible ── */}
              <div className="mb-[0.9rem]">
                <button
                  className={`btn-sender-toggle${senderOpen ? ' btn-sender-toggle--active' : ''}`}
                  onClick={() => setSenderOpen((p) => !p)}
                >
                  <span className={`wa-status-dot wa-status-dot--${waStatus}`} style={{ width: 8, height: 8 }} />
                  📡 Smart Sender
                  {readyToSendLeads.length > 0 && (
                    <span className="inline-flex items-center justify-center bg-[rgba(37,211,102,0.2)] text-[#25d366] text-[0.63rem] font-extrabold min-w-[18px] h-[18px] rounded-full px-[0.35rem]">{readyToSendLeads.length}</span>
                  )}
                  <span className={`sender-toggle-chevron${senderOpen ? ' open' : ''}`}>▾</span>
                </button>

                {senderOpen && (
                  <div className="sender-panel">
                    {/* Row 1: Mode pills + Status + Actions */}
                    <div className="flex items-center gap-4 flex-wrap">
                      {/* Mode pills */}
                      <div className="sender-mode-pills">
                        <button
                          className={`sender-pill${sendMode === 'manual' ? ' sender-pill--active-manual' : ''}`}
                          onClick={() => setSendMode('manual')}
                        >
                          🛡 Manual
                        </button>
                        <button
                          className={`sender-pill${sendMode === 'auto' ? ' sender-pill--active-auto' : ''}`}
                          onClick={() => setSendMode('auto')}
                        >
                          🤖 Auto
                        </button>
                      </div>

                      {/* Status indicator (auto mode) */}
                      {sendMode === 'auto' && (
                        <div className="flex items-center gap-2">
                          <span className={`wa-status-dot wa-status-dot--${waStatus}`} />
                          <span className="text-[0.78rem] font-semibold text-app-text-dim">
                            {waStatus === 'disconnected' && 'Not connected'}
                            {waStatus === 'qr' && 'Scan QR…'}
                            {waStatus === 'loading' && (waDetail || 'Loading…')}
                            {waStatus === 'ready' && 'Connected'}
                            {waStatus === 'sending' && 'Sending…'}
                            {waStatus === 'error' && 'Error'}
                          </span>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 ml-auto">
                        {sendMode === 'auto' && waStatus === 'disconnected' && (
                          <>
                            <button className="btn-wa-connect" onClick={handleWaConnect} disabled={campaignState === 'connecting'}>
                              {campaignState === 'connecting' ? '⏳ Connecting…' : '🔌 Connect'}
                            </button>
                            <button className="btn-ghost text-[#f87171]" onClick={handleWaLogout} title="Unlink saved account & scan new QR next time">
                              🔓 Unlink
                            </button>
                          </>
                        )}
                        {sendMode === 'auto' && (waStatus === 'ready' || waStatus === 'sending') && campaignState !== 'sending' && (
                          <>
                            <button
                              className="btn-wa-start"
                              onClick={handleStartCampaign}
                              disabled={readyToSendLeads.length === 0}
                              title={readyToSendLeads.length === 0 ? 'No leads ready' : `Send to ${readyToSendLeads.length} leads`}
                            >
                              🚀 Send All ({readyToSendLeads.length})
                            </button>
                            <button className="btn-ghost" onClick={handleWaDisconnect} title="Disconnect WhatsApp">⏏</button>
                            <button className="btn-ghost text-[#f87171]" onClick={handleWaLogout} title="Unlink account & scan new QR">
                              🔓 Unlink
                            </button>
                          </>
                        )}
                        {campaignState === 'sending' && (
                          <button className="btn-danger" onClick={handleStopCampaign}>⏹ Stop</button>
                        )}
                      </div>
                    </div>

                    {/* Manual mode info */}
                    {sendMode === 'manual' && (
                      <p className="text-[0.76rem] text-app-text-dim mt-3 leading-[1.5]">
                        Click <strong className="text-[#25d366]">💬</strong> on each lead to open WhatsApp with the AI message pre-filled — <strong className="text-green">100% safe</strong>.
                      </p>
                    )}

                    {/* Auto mode: warning */}
                    {sendMode === 'auto' && waStatus === 'disconnected' && (
                      <p className="text-[0.76rem] text-app-text-dim mt-3 leading-[1.5]">
                        <strong className="text-[#fbbf24]">⚠ Safety:</strong> Uses 45-120s random delays to mimic human behavior. Use Manual mode for new accounts.
                      </p>
                    )}

                    {/* Campaign progress */}
                    {campaignState === 'sending' && (
                      <div className="mt-3">
                        <div className="flex items-baseline justify-between gap-2 mb-[0.35rem]">
                          <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.13em]" style={{ color: '#25d366' }}>
                            ⚡ Sending
                          </span>
                          <span className="text-[0.78rem] font-bold text-app-text tabular-nums">
                            {sendProgress.current}/{sendProgress.total}
                            <span className="text-app-text-dim ml-1 text-[0.72rem]">{sendPercent}%</span>
                          </span>
                        </div>
                        <div className="h-[3px] bg-[rgba(51,65,85,0.4)] rounded-full overflow-hidden">
                          <div className="sender-progress-fill" style={{ width: `${sendPercent}%` }} />
                        </div>
                        {waitingDelay !== null && (
                          <p className="text-[0.72rem] text-app-text-dim italic mt-[0.3rem]">
                            ⏱ Waiting {waitingDelay}s before next…
                          </p>
                        )}
                      </div>
                    )}

                    {/* Campaign result */}
                    {campaignState === 'done' && sendResult && (
                      <div className="sender-result mt-3">
                        <span className="text-[1.1rem]">✅</span>
                        <p className="text-[0.82rem] font-bold text-app-text">
                          Campaign done — <span style={{ color: '#25d366' }}>{sendResult.sent} sent</span>
                          {sendResult.failed > 0 && <span className="text-red"> · {sendResult.failed} failed</span>}
                        </p>
                      </div>
                    )}

                    {/* Send error */}
                    {sendError && (
                      <div className="flex items-center gap-2 mt-3 text-[0.78rem] text-red-light">
                        <span>⚠</span>
                        <span className="flex-1">{sendError}</span>
                        <button className="ai-error-close" onClick={() => setSendError(null)}>✕</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* AI error banner */}
              {aiError && (
                <div className="flex items-center gap-[0.6rem] mb-[0.9rem] py-[0.7rem] px-4 bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.28)] rounded-[10px]">
                  <span className="text-[0.9rem]">⚠</span>
                  <span className="flex-1 text-[0.82rem] font-semibold text-red-light leading-[1.45]">{aiError}</span>
                  <button className="ai-error-close" onClick={() => setAiError(null)}>✕</button>
                </div>
              )}

              {/* AI progress bar */}
              {aiState === 'running' && (
                <div className="mb-[0.9rem]">
                  <div className="h-[3px] bg-[rgba(51,65,85,0.3)] rounded-full overflow-hidden mb-[0.45rem]">
                    <div className="ai-progress-fill" style={{ width: `${aiPercent}%` }} />
                  </div>
                  {aiProgress.lastName && (
                    <p className="text-[0.76rem] text-[#64748b] italic">
                      ✨ Writing for <strong className="text-purple-light not-italic">{aiProgress.lastName}</strong>…
                    </p>
                  )}
                </div>
              )}

              <div className="table-outer">
                <table>
                  <thead>
                    <tr>
                      <th aria-sort={sortBy === 'id' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'id' ? ' active' : ''}`} onClick={() => handleSort('id')}>
                          <span className="uppercase tracking-[0.12em]">#</span>
                          <span className={`sort-indicator ${sortBy === 'id' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th></th>
                      <th aria-sort={sortBy === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'name' ? ' active' : ''}`} onClick={() => handleSort('name')}>
                          <span className="uppercase tracking-[0.12em]">Business Name</span>
                          <span className={`sort-indicator ${sortBy === 'name' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'phone' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'phone' ? ' active' : ''}`} onClick={() => handleSort('phone')}>
                          <span className="uppercase tracking-[0.12em]">Phone</span>
                          <span className={`sort-indicator ${sortBy === 'phone' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'email' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'email' ? ' active' : ''}`} onClick={() => handleSort('email')}>
                          <span className="uppercase tracking-[0.12em]">Email</span>
                          <span className={`sort-indicator ${sortBy === 'email' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'address' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'address' ? ' active' : ''}`} onClick={() => handleSort('address')}>
                          <span className="uppercase tracking-[0.12em]">Address</span>
                          <span className={`sort-indicator ${sortBy === 'address' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'website' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'website' ? ' active' : ''}`} onClick={() => handleSort('website')}>
                          <span className="uppercase tracking-[0.12em]">Website</span>
                          <span className={`sort-indicator ${sortBy === 'website' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'custom_message' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'custom_message' ? ' active' : ''}`} onClick={() => handleSort('custom_message')}>
                          <span className="uppercase tracking-[0.12em]">AI Message</span>
                          <span className={`sort-indicator ${sortBy === 'custom_message' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'send_status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'send_status' ? ' active' : ''}`} onClick={() => handleSort('send_status')}>
                          <span className="uppercase tracking-[0.12em]">Status</span>
                          <span className={`sort-indicator ${sortBy === 'send_status' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLeads.map((lead, idx) => {
                      const key = lead.id ?? lead.name
                      const uniqueKey = lead.id ?? (currentPage * pageSize + idx)
                      const isSending = currentSendLeadId === lead.id && campaignState === 'sending'
                      const { label: sendLabel, cls: sendCls } = getLeadSendStatus(lead)
                      return (
                        <tr key={uniqueKey} className={`${newLeadIds.has(key) ? 'row-new' : ''}${isSending ? ' row-sending' : ''}`}>
                          <td className="text-app-text-mute w-12 text-right font-bold text-[0.74rem] tabular-nums" data-label="#">{lead.id ?? '—'}</td>
                          <td className="flex items-center justify-center" data-label="Detail">
                            <button
                              className="btn-view"
                              onClick={() => setSelectedLead(lead)}
                              title="View full details"
                            >
                              👁
                            </button>
                          </td>
                          <td className="text-app-text font-semibold max-w-[140px] md:max-w-[200px] lg:max-w-[360px] min-w-0 truncate" data-label="Business Name" title={lead.name}>{lead.name}</td>
                          <td className="text-cyan font-mono text-[0.8rem] font-medium min-w-[120px] whitespace-nowrap text-right" data-label="Phone">{lead.phone || <span className="text-app-text-mute">—</span>}</td>
                          <td className="max-w-[180px] whitespace-nowrap overflow-hidden text-ellipsis text-[0.8rem]" data-label="Email">
                            {lead.email ? (
                              <a href={`mailto:${lead.email}`}>{lead.email}</a>
                            ) : <span className="text-app-text-mute">—</span>}
                          </td>
                          <td className="max-w-[200px] whitespace-nowrap overflow-hidden text-ellipsis text-[0.8rem]" data-label="Address" title={lead.address}>
                            {lead.address || <span className="text-app-text-mute">—</span>}
                          </td>
                          <td data-label="Website">
                            {lead.website ? (
                              <a href={lead.website} target="_blank" rel="noreferrer">
                                {lead.website.replace(/^https?:\/\//, '').split('/')[0]}
                              </a>
                            ) : <span className="text-app-text-mute">—</span>}
                          </td>
                          <td className="max-w-[260px]" data-label="AI Message">
                            {lead.custom_message ? (
                              <span className="ai-msg" title={lead.custom_message}>
                                {lead.custom_message}
                              </span>
                            ) : generatingIds.has(lead.id!) ? (
                              <span className="inline-flex items-center gap-[0.4rem]">
                                <span className="ai-pending-dots"><span /><span /><span /></span>
                                <span className="text-[0.72rem] text-purple italic">Writing…</span>
                              </span>
                            ) : aiState === 'running' ? (
                              <span className="ai-pending-dots">
                                <span /><span /><span />
                              </span>
                            ) : <span className="text-app-text-mute">—</span>}
                          </td>
                          <td data-label="Status">
                            {lead.phone && lead.custom_message ? (
                              <span className={`send-badge ${sendCls}`}>
                                {isSending && <span className="send-badge__pulse" />}
                                {sendLabel}
                              </span>
                            ) : <span className="text-app-text-mute text-[0.72rem]">—</span>}
                          </td>
                          <td className="flex items-center gap-[0.3rem] whitespace-nowrap" data-label="Actions">
                            {lead.phone && lead.custom_message && (
                              <button
                                className="btn-wa"
                                onClick={() => handleManualSend(lead)}
                                title="Send via WhatsApp"
                              >
                                💬
                              </button>
                            )}
                            {!generatingIds.has(lead.id!) && aiState !== 'running' && (
                              <button
                                className={`btn-gen-one${lead.custom_message ? ' btn-regen' : ''}`}
                                onClick={() => handleGenerateOne(lead.id!)}
                                title={lead.custom_message ? 'Regenerate AI message' : 'Generate AI message for this lead'}
                              >
                                {lead.custom_message ? '🔄' : '✨'}
                              </button>
                            )}
                            <button className="btn-del" onClick={() => handleDelete(lead.id)}
                              title="Delete lead">✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Pagination controls (themed) */}
                <div className="pagination">
                  <div className="flex items-center gap-[0.6rem]">
                    <label className="text-[0.75rem] text-app-text-dim font-bold">Per page</label>
                    <button
                      ref={pageSizeBtnRef}
                      className="select-theme"
                      onClick={() => {
                        if (!pageSizeDropdownOpen && pageSizeBtnRef.current) {
                          const rect = pageSizeBtnRef.current.getBoundingClientRect()
                          const DROPDOWN_H = 120
                          const spaceBelow = window.innerHeight - rect.bottom
                          const openUp = spaceBelow < DROPDOWN_H + 8
                          setDropdownPos({
                            top: openUp ? rect.top - DROPDOWN_H - 6 : rect.bottom + 6,
                            left: rect.left,
                            openUp
                          })
                        }
                        setPageSizeDropdownOpen(!pageSizeDropdownOpen)
                      }}
                      title="Items per page"
                    >
                      {pageSize} ▾
                    </button>
                    {pageSizeDropdownOpen && createPortal(
                      <div
                        className="dropdown-menu animate-fade-in"
                        style={{ top: dropdownPos.top, left: dropdownPos.left }}
                      >
                        {[10, 20, 50].map((size) => (
                          <button
                            key={size}
                            className={`dropdown-item${pageSize === size ? ' active' : ''}`}
                            onClick={() => {
                              setPageSize(size)
                              setCurrentPage(0)
                              setPageSizeDropdownOpen(false)
                            }}
                          >
                            {size}
                          </button>
                        ))}
                      </div>,
                      document.body
                    )}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-[0.4rem] flex-wrap">
                      <button className="page-item" disabled={currentPage === 0}
                        onClick={() => setCurrentPage(0)}>«</button>
                      <button className="page-item" disabled={currentPage === 0}
                        onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}>‹</button>

                      {pageRange.map((p) => (
                        <button key={p}
                          className={`page-item${p === currentPage ? ' active' : ''}`}
                          onClick={() => setCurrentPage(p)}>{p + 1}</button>
                      ))}

                      <button className="page-item" disabled={currentPage >= totalPages - 1}
                        onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}>›</button>
                      <button className="page-item" disabled={currentPage >= totalPages - 1}
                        onClick={() => setCurrentPage(totalPages - 1)}>»</button>
                    </div>
                  )}

                  <div>
                    <span className="text-[0.82rem] text-app-text-dim font-bold">
                      {totalPages > 1 ? `Page ${currentPage + 1} of ${totalPages}` : `${leads.length} lead${leads.length !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                </div>

              </div>
            </section>
          )}
        </>
      )}

      {/* ═══════════════ LEAD DETAIL MODAL ══════════════ */}
      {selectedLead && (
        <div className="modal-overlay" onClick={() => setSelectedLead(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ padding: '1.4rem 1.6rem 1.1rem', borderBottom: '1px solid rgba(30,41,59,0.6)' }}>
              <div className="flex items-center gap-[0.85rem] min-w-0">
                <span className="text-2xl shrink-0">📍</span>
                <div>
                  <h2 className="text-[1.05rem] font-extrabold text-app-text tracking-[-0.02em] leading-[1.2] whitespace-nowrap overflow-hidden text-ellipsis">{selectedLead.name}</h2>
                  <span className="block text-[0.67rem] font-bold text-app-text-dim uppercase tracking-[0.1em] mt-[0.15rem]">Lead Details</span>
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelectedLead(null)} title="Close (Esc)">✕</button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-[0.85rem]" style={{ padding: '1.2rem 1.6rem 1.5rem' }}>
              <div className="flex flex-col gap-[0.3rem]">
                <span className="text-[0.62rem] font-extrabold text-app-text-dim uppercase tracking-[0.12em]">📞 Phone</span>
                <span className="text-[0.9rem] text-app-text font-medium leading-[1.5] break-words">{selectedLead.phone || '—'}</span>
              </div>
              <div className="flex flex-col gap-[0.3rem]">
                <span className="text-[0.62rem] font-extrabold text-app-text-dim uppercase tracking-[0.12em]">📧 Email</span>
                <span className="text-[0.9rem] text-app-text font-medium leading-[1.5] break-words">
                  {selectedLead.email
                    ? <a href={`mailto:${selectedLead.email}`}>{selectedLead.email}</a>
                    : '—'}
                </span>
              </div>
              <div className="flex flex-col gap-[0.3rem]">
                <span className="text-[0.62rem] font-extrabold text-app-text-dim uppercase tracking-[0.12em]">📍 Address</span>
                <span className="text-[0.9rem] text-app-text font-medium leading-[1.5] break-words">{selectedLead.address || '—'}</span>
              </div>
              <div className="flex flex-col gap-[0.3rem]">
                <span className="text-[0.62rem] font-extrabold text-app-text-dim uppercase tracking-[0.12em]">🌐 Website</span>
                <span className="text-[0.9rem] text-app-text font-medium leading-[1.5] break-words">
                  {selectedLead.website
                    ? <a href={selectedLead.website} target="_blank" rel="noreferrer">{selectedLead.website}</a>
                    : '—'}
                </span>
              </div>
              {selectedLead.custom_message && (
                <div className="flex flex-col gap-[0.3rem] mt-[0.3rem] pt-4 border-t border-[rgba(30,41,59,0.55)]">
                  <span className="text-[0.62rem] font-extrabold text-app-text-dim uppercase tracking-[0.12em]">✨ AI Message</span>
                  <p className="text-[0.88rem] text-purple-light leading-[1.6] bg-[rgba(167,139,250,0.06)] border border-[rgba(167,139,250,0.15)] rounded-[10px] py-3 px-4 m-0 font-medium">{selectedLead.custom_message}</p>
                  {selectedLead.phone && (
                    <button
                      className="btn-wa-modal"
                      onClick={() => window.api.openWhatsApp(selectedLead.phone, selectedLead.custom_message)}
                    >
                      💬 Send via WhatsApp
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ QR CODE MODAL ══════════════ */}
      {showQrModal && (
        <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
            <div className="flex items-center justify-between" style={{ padding: '1.4rem 1.6rem 1.1rem', borderBottom: '1px solid rgba(30,41,59,0.6)' }}>
              <div className="flex items-center gap-[0.85rem]">
                <span className="text-2xl">📱</span>
                <div>
                  <h2 className="text-[1.05rem] font-extrabold text-app-text tracking-[-0.02em]">Connect WhatsApp</h2>
                  <span className="block text-[0.67rem] font-bold text-app-text-dim uppercase tracking-[0.1em] mt-[0.15rem]">Scan QR Code</span>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowQrModal(false)} title="Close">✕</button>
            </div>
            <div style={{ padding: '1.6rem' }}>
              {qrDataUrl && qrDataUrl.startsWith('data:') ? (
                <img src={qrDataUrl} alt="WhatsApp QR Code" style={{ width: 240, height: 240, borderRadius: 12, margin: '0 auto', display: 'block' }} />
              ) : (
                <div className="flex flex-col items-center gap-3" style={{ padding: '2rem 0' }}>
                  <span className="ai-pending-dots"><span /><span /><span /></span>
                  <span className="text-[0.78rem] text-app-text-dim">Waiting for QR code…</span>
                </div>
              )}
              <p className="text-[0.76rem] text-app-text-dim mt-4 leading-[1.5]">
                Open <strong className="text-app-text">WhatsApp</strong> → Settings → Linked Devices → Link a Device
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App


