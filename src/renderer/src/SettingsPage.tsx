import React, { useState, useEffect } from 'react'

const LS_KEY = 'gemini_api_key'

type ValidateState = 'idle' | 'loading' | 'ok' | 'error'

export default function SettingsPage(): React.ReactElement {
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [validateState, setValidateState] = useState<ValidateState>('idle')
  const [validateMsg, setValidateMsg] = useState('')

  // Load saved key on mount
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY) ?? ''
    setApiKey(stored)
  }, [])

  const handleSave = (): void => {
    localStorage.setItem(LS_KEY, apiKey.trim())
    setSaved(true)
    setValidateState('idle')
    setTimeout(() => setSaved(false), 2500)
  }

  const handleClear = (): void => {
    localStorage.removeItem(LS_KEY)
    setApiKey('')
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
        <div className="settings-card__header">
          <div className="settings-card__icon">✨</div>
          <div>
            <h2 className="settings-card__title">Gemini AI Configuration</h2>
            <p className="settings-card__sub">
              Powers the "Process with AI" feature to write personalised WhatsApp greetings for each lead.
            </p>
          </div>
        </div>

        <div className="settings-divider" />

        {/* API Key input */}
        <label className="settings-label">Gemini API Key</label>
        <div className="key-input-wrap">
          <input
            className="key-input"
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

        <div className="settings-actions">
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
          <div className="settings-feedback settings-feedback--ok">
            ✓ API key saved to local storage.
          </div>
        )}
        {validateState !== 'idle' && validateState !== 'loading' && (
          <div className={`settings-feedback settings-feedback--${validateState}`}>
            {validateMsg}
          </div>
        )}
        {validateState === 'loading' && (
          <div className="settings-feedback settings-feedback--loading">
            <span className="settings-spinner" /> {validateMsg}
          </div>
        )}
      </div>

      {/* ── Section: Info ── */}
      <div className="settings-card settings-card--dim">
        <h3 className="settings-info-title">ℹ How it works</h3>
        <ul className="settings-info-list">
          <li>
            <strong>Model:</strong> <code>gemini-1.5-flash-latest</code> — Google's latest free-tier model.
          </li>
          <li>
            <strong>Rate limit:</strong> Free tier allows ~15 requests/min. The processor automatically
            waits ~4 s between leads to stay within limits.
          </li>
          <li>
            <strong>Prompt:</strong> "Write a professional 2-line WhatsApp greeting for{' '}
            <em>[Business Name]</em>. Mention we can help improve their digital presence.
            Keep it under 30 words."
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
