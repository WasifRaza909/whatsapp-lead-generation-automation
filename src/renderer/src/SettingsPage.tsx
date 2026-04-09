import React, { useState, useEffect } from 'react'

const LS_KEY         = 'gemini_api_key'
const LS_SERVICE_KEY = 'my_service'

type ValidateState = 'idle' | 'loading' | 'ok' | 'error'

export default function SettingsPage(): React.ReactElement {
  const [apiKey, setApiKey]       = useState('')
  const [myService, setMyService] = useState('')
  const [saved, setSaved]         = useState(false)
  const [showKey, setShowKey]     = useState(false)
  const [validateState, setValidateState] = useState<ValidateState>('idle')
  const [validateMsg, setValidateMsg]     = useState('')

  // Load saved values on mount
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY) ?? ''
    setApiKey(stored)
    setMyService(localStorage.getItem(LS_SERVICE_KEY) ?? '')
  }, [])

  const handleSave = (): void => {
    localStorage.setItem(LS_KEY, apiKey.trim())
    localStorage.setItem(LS_SERVICE_KEY, myService.trim())
    setSaved(true)
    setValidateState('idle')
    setTimeout(() => setSaved(false), 2500)
  }

  const handleClear = (): void => {
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem(LS_SERVICE_KEY)
    setApiKey('')
    setMyService('')
    setValidateState('idle')
    setValidateMsg('')
  }

  const handleValidate = async (): Promise<void> => {
    if (!apiKey.trim()) {
      setValidateState('error')
      setValidateMsg('Enter an API key first.')
      return
    }
    setValidateState('loading')
    setValidateMsg('Contacting Gemini…')
    try {
      await window.api.validateApiKey(apiKey.trim())
      setValidateState('ok')
      setValidateMsg('API key is valid! ✓')
    } catch (err) {
      setValidateState('error')
      setValidateMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const hasStoredKey = !!localStorage.getItem(LS_KEY)

  return (
    <div className="settings-page">

      {/* ── Section: Gemini API ── */}
      <div className="settings-card">
        <div className="flex items-start gap-4 mb-6">
          <div className="text-[2rem] leading-none shrink-0 mt-[0.1rem]">✨</div>
          <div>
            <h2 className="text-[1.05rem] font-extrabold text-app-text tracking-[-0.02em] mb-[0.3rem]">Gemini AI Configuration</h2>
            <p className="text-[0.82rem] text-app-text-dim leading-[1.5]">
              Powers the "Process with AI" feature to write personalised WhatsApp greetings for each lead.
            </p>
          </div>
        </div>

        <div className="h-px bg-app-border mb-[1.4rem] opacity-50" />

        {/* API Key input */}
        <label className="block text-[0.63rem] font-extrabold text-app-text-dim uppercase tracking-[0.12em] mb-2">Gemini API Key</label>
        <div className="key-input-wrap">
          <input
            className="flex-1 bg-transparent border-none text-app-text text-[0.88rem] font-medium py-3 px-4 outline-none font-mono tracking-[0.04em]"
            type={showKey ? 'text' : 'password'}
            placeholder="AIza…"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setSaved(false); setValidateState('idle') }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="key-toggle"
            onClick={() => setShowKey((v) => !v)}
            title={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>

        {/* My Service input */}
        <label className="block text-[0.63rem] font-extrabold text-app-text-dim uppercase tracking-[0.12em] mb-2" style={{ marginTop: '1.2rem' }}>Your Service</label>
        <input
          className="flex-1 bg-transparent border-none text-app-text text-[0.88rem] font-medium py-3 px-4 outline-none font-mono tracking-[0.04em]"
          type="text"
          placeholder="e.g. SEO, web design, social media marketing…"
          value={myService}
          onChange={(e) => { setMyService(e.target.value); setSaved(false) }}
          spellCheck={false}
        />
        <p className="text-[0.75rem] text-app-text-dim mt-[0.45rem] mb-[1.2rem] leading-[1.5]">
          Used in AI prompts: "We can help them with <em className="text-purple not-italic font-semibold">{myService || 'your service'}</em>."
        </p>

        <div className="flex items-center gap-3 flex-wrap mb-[0.9rem]">
          <button className="btn-primary" onClick={handleSave} disabled={!apiKey.trim()}>
            💾 Save Key
          </button>
          <button className="btn-settings-validate" onClick={handleValidate} disabled={validateState === 'loading'}>
            {validateState === 'loading' ? '⏳ Testing…' : '🔌 Test Connection'}
          </button>
          {hasStoredKey && (
            <button className="btn-ghost btn-settings-clear" onClick={handleClear}>
              🗑 Clear
            </button>
          )}
        </div>

        {/* Feedback messages */}
        {saved && (
          <div className="flex items-center gap-2 py-[0.65rem] px-4 rounded-lg text-[0.83rem] font-semibold animate-fade-soft bg-[rgba(52,211,153,0.1)] text-green border border-[rgba(52,211,153,0.2)]">
            ✓ API key saved to local storage.
          </div>
        )}
        {validateState !== 'idle' && validateState !== 'loading' && (
          <div className={`flex items-center gap-2 py-[0.65rem] px-4 rounded-lg text-[0.83rem] font-semibold animate-fade-soft ${validateState === 'ok' ? 'bg-[rgba(52,211,153,0.1)] text-green border border-[rgba(52,211,153,0.2)]' : 'bg-[rgba(248,113,113,0.1)] text-red border border-[rgba(248,113,113,0.2)]'}`}>
            {validateMsg}
          </div>
        )}
        {validateState === 'loading' && (
          <div className="flex items-center gap-2 py-[0.65rem] px-4 rounded-lg text-[0.83rem] font-semibold animate-fade-soft bg-[rgba(167,139,250,0.08)] text-purple-light border border-[rgba(167,139,250,0.18)]">
            <span className="settings-spinner" /> {validateMsg}
          </div>
        )}
      </div>

      {/* ── Section: Info ── */}
      <div className="settings-card bg-[rgba(9,18,33,0.4)] border-[rgba(30,41,59,0.5)]">
        <h3 className="text-[0.78rem] font-extrabold text-app-text-dim uppercase tracking-[0.1em] mb-4">ℹ How it works</h3>
        <ul className="settings-info-list">
          <li>
            <strong>Model:</strong> <code>gemini-2.5-flash</code> — Google's best price-performance free-tier model.
          </li>
          <li>
            <strong>Rate limit:</strong> Free tier allows ~15 requests/min. The processor automatically
            waits ~4 s between leads to stay within limits.
          </li>
          <li>
            <strong>Prompt:</strong> "Write a friendly 2-line WhatsApp intro for{' '}
            <em>[Business Name]</em>, located in <em>[City]</em>. Mention we can help them with{' '}
            <em>[Your Service]</em>. Keep it under 35 words."
          </li>
          <li>
            <strong>Storage:</strong> API key is saved only in&nbsp;
            <code>localStorage</code> — never sent to any server other than Google's API.
          </li>
          <li>
            <strong>Get a key:</strong>{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
            >
              aistudio.google.com/app/apikey
            </a>
          </li>
        </ul>
      </div>

    </div>
  )
}
