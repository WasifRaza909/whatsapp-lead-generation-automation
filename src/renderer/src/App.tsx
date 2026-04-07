import React, { useState, useEffect, useRef } from 'react'
import SettingsPage from './SettingsPage'

interface Lead {
  id?: number
  name: string
  phone: string
  address: string
  website: string
  ai_message: string
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

const LS_KEY = 'gemini_api_key'

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
  const unsubRef = useRef<Array<() => void>>([])

  // ── AI ────────────────────────────────────────────────────────────────────
  const [aiState, setAiState]   = useState<AiState>('idle')
  const [aiProgress, setAiProgress] = useState<{
    current: number; total: number; lastName: string
  }>({ current: 0, total: 0, lastName: '' })
  const aiUnsubRef = useRef<(() => void) | null>(null)

  // load leads on mount
  useEffect(() => {
    window.api.getLeads().then(setLeads).catch(console.error)
  }, [])

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

    const unsubLead = window.api.onLead((lead: Lead) => {
      setLeads((prev) => [lead, ...prev])
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
    } catch (err) {
      setStatus(`Error: ${String(err)}`)
      setScraperState('error')
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

  const handleTestDB = async (): Promise<void> => {
    const dummy: Omit<Lead, 'id'> = {
      name: 'Test Business', phone: '+1 234 567 8900',
      address: '123 Main St, New York, NY 10001',
      website: 'https://example.com', ai_message: ''
    }
    const saved = await window.api.saveLead(dummy)
    setLeads((prev) => [saved, ...prev])
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
    aiUnsubRef.current?.()
    setAiState('running')
    setAiProgress({ current: 0, total: 0, lastName: '' })

    const unsub = window.api.onAiProgress((p: AiProgress) => {
      setAiProgress({ current: p.current, total: p.total, lastName: p.leadName })
      if (p.status === 'done' && p.message !== undefined) {
        setLeads((prev) =>
          prev.map((l) => (l.id === p.leadId ? { ...l, ai_message: p.message! } : l))
        )
      }
    })
    aiUnsubRef.current = unsub

    try {
      const result = await window.api.processWithAI(apiKey)
      setAiState('done')
      setStatus(`✨ AI wrote ${result.processed} message(s).`)
      const updated = await window.api.getLeads()
      setLeads(updated)
    } catch (err) {
      setAiState('error')
      setStatus(`AI Error: ${String(err)}`)
    } finally {
      unsub()
      aiUnsubRef.current = null
      setAiProgress({ current: 0, total: 0, lastName: '' })
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const isRunning        = scraperState === 'running'
  const statusClass      = scraperState === 'error' ? 'err' : scraperState === 'done' ? 'ok' : ''
  const unprocessedCount = leads.filter((l) => !l.ai_message).length
  const hasKey           = !!localStorage.getItem(LS_KEY)
  const aiPercent        = aiProgress.total > 0
    ? Math.round((aiProgress.current / aiProgress.total) * 100)
    : 0

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
          <section className={`form-card${isRunning ? ' scanning' : ''}`}>
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
            </div>
            {status && (
              <div className="scan-indicator">
                {isRunning && <div className="scan-rings"><span /><span /><span /></div>}
                <span className={`scan-text ${statusClass}`}>{status}</span>
              </div>
            )}
            {isRunning && <div className="progress-bar"><div className="progress-bar__fill" /></div>}
          </section>

          {/* Leads Table */}
          {leads.length > 0 && (
            <section className="table-wrap">
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
                    </div>
                  )}
                  <span className="leads-badge" key={leads.length}>{leads.length}</span>
                </div>
              </div>

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
                      <th>#</th>
                      <th>Business Name</th>
                      <th>Phone</th>
                      <th>Address</th>
                      <th>Website</th>
                      <th>AI Message</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, idx) => {
                      const key = lead.id ?? lead.name
                      return (
                        <tr key={lead.id ?? idx} className={newLeadIds.has(key) ? 'row-new' : ''}>
                          <td className="td-num">{lead.id ?? '—'}</td>
                          <td className="td-name">{lead.name}</td>
                          <td className="td-phone">{lead.phone || <span className="muted">—</span>}</td>
                          <td className="td-addr" title={lead.address}>
                            {lead.address || <span className="muted">—</span>}
                          </td>
                          <td>
                            {lead.website ? (
                              <a href={lead.website} target="_blank" rel="noreferrer">
                                {lead.website.replace(/^https?:\/\//, '').split('/')[0]}
                              </a>
                            ) : <span className="muted">—</span>}
                          </td>
                          <td className="td-ai">
                            {lead.ai_message ? (
                              <span className="ai-msg" title={lead.ai_message}>
                                {lead.ai_message}
                              </span>
                            ) : (
                              aiState === 'running' ? (
                                <span className="ai-pending-dots">
                                  <span /><span /><span />
                                </span>
                              ) : <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            <button className="btn-del" onClick={() => handleDelete(lead.id)}
                              title="Delete lead">✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default App


