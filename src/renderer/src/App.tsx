import React, { useState, useEffect, useRef, useMemo } from 'react'
import SettingsPage from './SettingsPage'

interface Lead {
  id?: number
  name: string
  phone: string
  address: string
  website: string
  email: string
  custom_message: string
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
  const [maxResults, setMaxResults]   = useState(40)
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

  // Close modal on Escape
  useEffect(() => {
    if (!selectedLead) return
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') setSelectedLead(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedLead])

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
      name: 'Test Business', phone: '+1 234 567 8900',
      address: '123 Main St, New York, NY 10001',
      website: 'https://example.com', email: 'hello@example.com', custom_message: ''
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
    <div className="container">

      {/* ── Header ── */}
      <header>
        <div className="header-badge">
          <span className="badge-dot" />
          WhatsMaps AI · Live Scraper
        </div>
        <h1>WhatsMaps AI</h1>
        <p className="subtitle">Google Maps Scraper &amp; WhatsApp AI Sender</p>
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
          <div className="stats-strip">
            <div className="stat-chip">
              <span className="stat-chip__icon">📍</span>
              <div className="stat-chip__body">
                <span className="stat-chip__value">{leads.length}</span>
                <span className="stat-chip__label">Total Leads</span>
              </div>
            </div>
            <div className="stat-chip">
              <span className="stat-chip__icon">{isRunning ? '⚡' : '💤'}</span>
              <div className="stat-chip__body">
                <span className="stat-chip__value"
                  style={{ color: isRunning ? '#22d3ee' : '#334155' }}>
                  {isRunning ? 'LIVE' : scraperState === 'done' ? 'DONE' : 'IDLE'}
                </span>
                <span className="stat-chip__label">Scraper</span>
              </div>
            </div>
            <div className="stat-chip">
              <span className="stat-chip__icon">✨</span>
              <div className="stat-chip__body">
                <span className="stat-chip__value"
                  style={{ color: unprocessedCount > 0 ? '#f59e0b' : '#22d3ee' }}>
                  {leads.length - unprocessedCount}/{leads.length}
                </span>
                <span className="stat-chip__label">AI Processed</span>
              </div>
            </div>
            <div className="stat-chip">
              <span className="stat-chip__icon">🎯</span>
              <div className="stat-chip__body">
                <span className="stat-chip__value">{maxResults}</span>
                <span className="stat-chip__label">Max Target</span>
              </div>
            </div>
          </div>

          {/* Search Form */}
          {!isRunning && (
            <section className="form-card">
            <p className="form-card__title">🔍 Search Configuration</p>
            <div className="form-row">
              <div className="field">
                <label>Keyword</label>
                <input type="text" placeholder="e.g. Dentists, Restaurants, Gyms…"
                  value={keyword} onChange={(e) => setKeyword(e.target.value)}
                  disabled={isRunning} />
              </div>
              <div className="field">
                <label>Location</label>
                <input type="text" placeholder="e.g. Karachi, Dubai, New York…"
                  value={location} onChange={(e) => setLocation(e.target.value)}
                  disabled={isRunning} />
              </div>
              <div className="field field--sm">
                <label>Max Results</label>
                <input type="number" min={5} max={200} value={maxResults}
                  onChange={(e) => setMaxResults(Number(e.target.value))}
                  disabled={isRunning} />
              </div>
            </div>
            <div className="form-actions">
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
            </div>
            {/* Status line (only shown when not actively scraping) */}
            {!isRunning && status && (
              <div className="scan-indicator">
                <span className={`scan-text ${statusClass}`}>{status}</span>
              </div>
            )}
            </section>
          )}

          {/* ── Scraping loader — lives OUTSIDE form-card so animations aren't clipped ── */}
          {isRunning && (
            <div className="scrape-loader">
              <div className="scrape-loader__radar">
                <span className="scrape-loader__ring" />
                <span className="scrape-loader__ring" />
                <span className="scrape-loader__ring" />
                <div className="scrape-loader__core" />
              </div>
              <div className="scrape-loader__body">
                <div className="scrape-loader__header">
                  <span className="scrape-loader__title">⚡ Scanning Google Maps</span>
                  <span className="scrape-loader__count">
                    <span className="scrape-loader__count-val">{sessionLeadCount}</span>
                    <span className="scrape-loader__count-label"> leads found</span>
                  </span>
                </div>
                <div className="scrape-loader__status">{status || 'Initialising…'}</div>
                <div className="scrape-loader__bar">
                  <div className="scrape-loader__bar-fill" />
                </div>
              </div>
            </div>
          )}

          {/* Leads Table */}
          {leads.length > 0 && (
            <section className="table-wrap" ref={tableRef}>
              <div className="table-header">
                <span className="table-title">Captured Leads</span>
                <div className="table-actions">
                  {aiState !== 'running' ? (
                    <button
                      className={`btn-ai${!hasKey ? ' btn-ai--warn' : ''}`}
                      onClick={handleProcessWithAI}
                      disabled={isRunning}
                      title={!hasKey ? 'Set your Gemini key in Settings first' : `Process ${unprocessedCount} unprocessed lead(s)`}
                    >
                      ✨ Process with AI
                      {unprocessedCount > 0 && (
                        <span className="btn-ai__badge">{unprocessedCount}</span>
                      )}
                    </button>
                  ) : (
                    <div className="ai-running-pill">
                      <span className="ai-running-dot" />
                      AI {aiProgress.current}/{aiProgress.total}
                      {aiProgress.total > 0 && (
                        <span className="ai-running-pct">{aiPercent}%</span>
                      )}
                      <button className="btn-ai-stop" onClick={handleStopAI} title="Stop AI processing">
                        ✕
                      </button>
                    </div>
                  )}
                  <span className="leads-badge" key={leads.length}>{leads.length}</span>
                </div>
              </div>

              {/* AI error banner */}
              {aiError && (
                <div className="ai-error-banner">
                  <span className="ai-error-icon">⚠</span>
                  <span className="ai-error-msg">{aiError}</span>
                  <button className="ai-error-close" onClick={() => setAiError(null)}>✕</button>
                </div>
              )}

              {/* AI progress bar */}
              {aiState === 'running' && (
                <div className="ai-progress-wrap">
                  <div className="ai-progress-track">
                    <div className="ai-progress-fill" style={{ width: `${aiPercent}%` }} />
                  </div>
                  {aiProgress.lastName && (
                    <p className="ai-progress-label">
                      ✨ Writing for <strong>{aiProgress.lastName}</strong>…
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
                          <span className="th-label">#</span>
                          <span className={`sort-indicator ${sortBy === 'id' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'name' ? ' active' : ''}`} onClick={() => handleSort('name')}>
                          <span className="th-label">Business Name</span>
                          <span className={`sort-indicator ${sortBy === 'name' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'phone' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'phone' ? ' active' : ''}`} onClick={() => handleSort('phone')}>
                          <span className="th-label">Phone</span>
                          <span className={`sort-indicator ${sortBy === 'phone' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'email' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'email' ? ' active' : ''}`} onClick={() => handleSort('email')}>
                          <span className="th-label">Email</span>
                          <span className={`sort-indicator ${sortBy === 'email' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'address' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'address' ? ' active' : ''}`} onClick={() => handleSort('address')}>
                          <span className="th-label">Address</span>
                          <span className={`sort-indicator ${sortBy === 'address' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'website' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'website' ? ' active' : ''}`} onClick={() => handleSort('website')}>
                          <span className="th-label">Website</span>
                          <span className={`sort-indicator ${sortBy === 'website' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th aria-sort={sortBy === 'custom_message' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button className={`th-btn${sortBy === 'custom_message' ? ' active' : ''}`} onClick={() => handleSort('custom_message')}>
                          <span className="th-label">AI Message</span>
                          <span className={`sort-indicator ${sortBy === 'custom_message' ? sortDir : ''}`} />
                        </button>
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLeads.map((lead, idx) => {
                      const key = lead.id ?? lead.name
                      const uniqueKey = lead.id ?? (currentPage * pageSize + idx)
                      return (
                        <tr key={uniqueKey} className={newLeadIds.has(key) ? 'row-new' : ''}>
                          <td className="td-num" data-label="#">{lead.id ?? '—'}</td>
                          <td className="td-name" data-label="Business Name">{lead.name}</td>
                          <td className="td-phone" data-label="Phone">{lead.phone || <span className="muted">—</span>}</td>
                          <td className="td-email" data-label="Email">
                            {lead.email ? (
                              <a href={`mailto:${lead.email}`}>{lead.email}</a>
                            ) : <span className="muted">—</span>}
                          </td>
                          <td className="td-addr" data-label="Address" title={lead.address}>
                            {lead.address || <span className="muted">—</span>}
                          </td>
                          <td data-label="Website">
                            {lead.website ? (
                              <a href={lead.website} target="_blank" rel="noreferrer">
                                {lead.website.replace(/^https?:\/\//, '').split('/')[0]}
                              </a>
                            ) : <span className="muted">—</span>}
                          </td>
                          <td className="td-ai" data-label="AI Message">
                            {lead.custom_message ? (
                              <span className="ai-msg" title={lead.custom_message}>
                                {lead.custom_message}
                              </span>
                            ) : generatingIds.has(lead.id!) ? (
                              <span className="ai-generating">
                                <span className="ai-pending-dots"><span /><span /><span /></span>
                                <span className="ai-generating-label">Writing…</span>
                              </span>
                            ) : aiState === 'running' ? (
                              <span className="ai-pending-dots">
                                <span /><span /><span />
                              </span>
                            ) : <span className="muted">—</span>}
                          </td>
                          <td className="td-actions" data-label="Actions">
                            <button
                              className="btn-view"
                              onClick={() => setSelectedLead(lead)}
                              title="View full details"
                            >
                              👁
                            </button>
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
                {totalPages > 1 && (
                  <div className="pagination">
                    <div className="pagination-left">
                      <label className="page-size-label">Per page</label>
                      <select className="page-size-select" value={pageSize}
                        onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(0) }}>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>

                    <div className="pagination-center">
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

                    <div className="pagination-right">
                      <span className="page-info">Page {currentPage + 1} of {totalPages}</span>
                    </div>
                  </div>
                )}

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
            <div className="modal-header">
              <div className="modal-title-group">
                <span className="modal-icon">📍</span>
                <div>
                  <h2 className="modal-title">{selectedLead.name}</h2>
                  <span className="modal-subtitle">Lead Details</span>
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelectedLead(null)} title="Close (Esc)">✕</button>
            </div>

            {/* Body */}
            <div className="modal-body">
              <div className="modal-field">
                <span className="modal-field__label">📞 Phone</span>
                <span className="modal-field__value">{selectedLead.phone || '—'}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field__label">📧 Email</span>
                <span className="modal-field__value">
                  {selectedLead.email
                    ? <a href={`mailto:${selectedLead.email}`}>{selectedLead.email}</a>
                    : '—'}
                </span>
              </div>
              <div className="modal-field">
                <span className="modal-field__label">📍 Address</span>
                <span className="modal-field__value">{selectedLead.address || '—'}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field__label">🌐 Website</span>
                <span className="modal-field__value">
                  {selectedLead.website
                    ? <a href={selectedLead.website} target="_blank" rel="noreferrer">{selectedLead.website}</a>
                    : '—'}
                </span>
              </div>
              {selectedLead.custom_message && (
                <div className="modal-field modal-field--ai">
                  <span className="modal-field__label">✨ AI Message</span>
                  <p className="modal-ai-msg">{selectedLead.custom_message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App


