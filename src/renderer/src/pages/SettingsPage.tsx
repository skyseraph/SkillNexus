import { useEffect, useState, useCallback, useRef } from 'react'
import type { AppConfigPublic, AppConfig, ToolTarget, LLMProvider, LLMProviderPreset } from '../../../shared/types'
import { LLM_PROVIDER_PRESETS } from '../../../shared/types'
import type { Theme } from '../App'
import { useTrack } from '../hooks/useTrack'
import { useT } from '../i18n/useT'
import qrcodeImg from '../assets/qrcode.jpg'
import mmqrcodeImg from '../assets/mmqrcode.png'

function QRPlaceholder({ label, placeholder, imgSrc }: { label: string; placeholder: string; imgSrc?: string }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <div className="qr-thumb" onClick={() => setExpanded(true)} title={t('settings.qr_expand', { label })}>
        <div className="qr-placeholder-box">
          {imgSrc
            ? <img src={imgSrc} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 5 }} />
            : <><span className="qr-placeholder-icon">▦</span><span className="qr-placeholder-text">{placeholder}</span></>
          }
        </div>
        <span className="qr-label">{label}</span>
      </div>
      {expanded && (
        <div className="modal-overlay" onClick={() => setExpanded(false)}>
          <div className="qr-modal" onClick={e => e.stopPropagation()}>
            <div className="qr-modal-title">{t('settings.qr_title', { label })}</div>
            <div className="qr-modal-box">
              {imgSrc
                ? <img src={imgSrc} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }} />
                : <><span className="qr-modal-icon">▦</span><span className="qr-modal-hint">{t('settings.qr_placeholder_hint')}</span></>
              }
            </div>
            <button className="qr-modal-close" onClick={() => setExpanded(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </>
  )
}

interface Props {
  onConfigSaved?: () => void
  theme: Theme
  onThemeChange: (t: Theme) => void
  toast?: (msg: string, type?: 'success' | 'error' | 'info') => void
}

type PublicProvider = Omit<LLMProvider, 'apiKey'> & { apiKeySet: boolean }

type EditForm = {
  id: string
  name: string
  baseUrl: string
  model: string
  apiKey: string
  category: LLMProvider['category']
  websiteUrl: string
  isPreset: boolean
  presetId: string
}

const EMPTY_FORM: EditForm = {
  id: '', name: '', baseUrl: '', model: '', apiKey: '',
  category: 'custom', websiteUrl: '', isPreset: false, presetId: ''
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function SettingsPage({ onConfigSaved, theme, onThemeChange, toast }: Props) {
  const track = useTrack()
  const t = useT()
  const [config, setConfig] = useState<AppConfigPublic | null>(null)
  const [toolTargets, setToolTargets] = useState<ToolTarget[]>([])
  const [toolPathOverrides, setToolPathOverrides] = useState<Record<string, string>>({})
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({})

  // Provider UI state
  const [form, setForm] = useState<EditForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({})
  const [formError, setFormError] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [toolAutoSaved, setToolAutoSaved] = useState(false)
  const toolSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // API Keys state
  const [githubTokenInput, setGithubTokenInput] = useState('')
  const [editingGithubToken, setEditingGithubToken] = useState(false)
  const [tavilyInput, setTavilyInput] = useState('')
  const [editingTavily, setEditingTavily] = useState(false)

  // Telemetry state
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true)
  useEffect(() => {
    window.api.telemetry.getConsent().then(({ enabled }) => setAnalyticsEnabled(enabled)).catch(() => {})
  }, [])

  const reload = useCallback(async () => {
    const c = await window.api.config.get()
    setConfig(c)
  }, [])

  useEffect(() => {
    reload()
    window.api.skills.getToolTargets().then(targets => {
      setToolTargets(targets)
      const enabled: Record<string, boolean> = {}
      targets.forEach(t => { enabled[t.id] = t.enabled ?? true })
      setEnabledTools(enabled)
    })
  }, [reload])

  // ── provider actions ──────────────────────────────────────────────────────

  const openNew = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setTestResults({})
    setFormError('')
    setShowPresets(false)
    setShowForm(true)
  }

  const openEdit = (p: PublicProvider) => {
    setForm({ id: p.id, name: p.name, baseUrl: p.baseUrl, model: p.model, apiKey: '',
      category: p.category, websiteUrl: p.websiteUrl ?? '', isPreset: !!p.isPreset, presetId: p.presetId ?? '' })
    setEditingId(p.id)
    setFormError('')
    setShowPresets(false)
    setShowForm(true)
  }

  const applyPreset = (preset: LLMProviderPreset) => {
    const id = slugify(preset.id) + '-' + Date.now().toString(36).slice(-4)
    setForm({
      id, name: preset.name, baseUrl: preset.baseUrl, model: preset.defaultModel,
      apiKey: '', category: preset.category,
      websiteUrl: preset.websiteUrl ?? '', isPreset: true, presetId: preset.id
    })
    setEditingId(null)
    setFormError('')
    setShowPresets(false)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (!form.baseUrl.trim()) { setFormError('Base URL is required'); return }
    try { new URL(form.baseUrl.trim()) } catch { setFormError('Base URL must be a valid URL (e.g. https://api.example.com/v1)'); return }
    if (!form.model.trim()) { setFormError('Model is required'); return }
    const finalId = editingId ?? (form.id.trim() || slugify(form.name) + '-' + Date.now().toString(36).slice(-4))

    setSaving(true)
    setFormError('')
    const provider: LLMProvider = {
      id: finalId, name: form.name.trim(),
      baseUrl: form.baseUrl.trim().replace(/\/$/, ''),
      model: form.model.trim(),
      apiKey: form.apiKey.trim(),
      category: form.category,
      websiteUrl: form.websiteUrl.trim() || undefined,
      isPreset: form.isPreset,
      presetId: form.presetId || undefined
    }
    await window.api.config.saveProvider(provider)
    track('provider_added', { provider_category: form.category, is_preset: form.isPreset })
    const fresh = await window.api.config.get()
    if (fresh.providers.length === 1 || !fresh.activeProviderId) {
      await window.api.config.setActive(finalId)
    }
    await reload()
    setSaving(false)
    toast?.(editingId ? `"${form.name}" updated` : `"${form.name}" added`, 'success')
    if (!editingId) {
      setEditingId(finalId)
      setForm(f => ({ ...f, id: finalId, apiKey: '' }))
    }
    onConfigSaved?.()
  }

  const handleDelete = async (id: string) => {
    if (deleteConfirmId !== id) { setDeleteConfirmId(id); return }
    const name = config?.providers.find(p => p.id === id)?.name ?? id
    setDeleteConfirmId(null)
    await window.api.config.deleteProvider(id)
    await reload()
    if (showForm && editingId === id) setShowForm(false)
    toast?.(`"${name}" removed`, 'info')
  }

  const autoSaveTools = (paths: Record<string, string>, enabled: Record<string, boolean>) => {
    if (toolSaveTimer.current) clearTimeout(toolSaveTimer.current)
    toolSaveTimer.current = setTimeout(async () => {
      await window.api.config.set({ toolPaths: paths, enabledTools: enabled } as Partial<AppConfig>)
      setToolAutoSaved(true)
      setTimeout(() => setToolAutoSaved(false), 1500)
    }, 600)
  }

  const updateToolPath = (id: string, val: string) => {
    const next = { ...toolPathOverrides, [id]: val }
    if (!val) delete next[id]
    setToolPathOverrides(next)
    autoSaveTools(next, enabledTools)
  }

  const updateToolEnabled = (id: string, val: boolean) => {
    const next = { ...enabledTools, [id]: val }
    setEnabledTools(next)
    autoSaveTools(toolPathOverrides, next)
  }

  const handleSetActive = async (id: string) => {
    await window.api.config.setActive(id)
    await reload()
    onConfigSaved?.()
  }

  const saveGithubToken = async () => {
    if (!githubTokenInput.trim()) return
    await window.api.config.set({ githubToken: githubTokenInput.trim() } as Parameters<typeof window.api.config.set>[0])
    setGithubTokenInput('')
    setEditingGithubToken(false)
    await reload()
    toast?.('GitHub token saved', 'success')
  }

  const clearGithubToken = async () => {
    await window.api.config.set({ githubToken: '' } as Parameters<typeof window.api.config.set>[0])
    setGithubTokenInput('')
    setEditingGithubToken(false)
    await reload()
    toast?.('GitHub token cleared', 'info')
  }

  const saveTavilyKey = async () => {
    if (!tavilyInput.trim()) return
    await window.api.config.set({ toolApiKeys: { tavily: tavilyInput.trim() } })
    setTavilyInput('')
    setEditingTavily(false)
    await reload()
    toast?.('Tavily key saved', 'success')
  }

  const clearTavilyKey = async () => {
    await window.api.config.set({ toolApiKeys: { tavily: '' } })
    setTavilyInput('')
    setEditingTavily(false)
    await reload()
    toast?.('Tavily key cleared', 'info')
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestResults(r => ({ ...r, [id]: { ok: false } }))
    const result = await window.api.config.test(id)
    setTestResults(r => ({ ...r, [id]: result }))
    setTestingId(null)
    track('provider_tested', { test_ok: result.ok })
    if (result.ok) toast?.('Connection successful', 'success')
    else toast?.(result.error?.slice(0, 80) ?? 'Connection failed', 'error')
  }

  const providers = config?.providers ?? []
  const activeId = config?.activeProviderId ?? ''

  const CATEGORY_LABELS: Record<string, string> = {
    official: 'Official', cn_official: 'CN Official',
    aggregator: 'Aggregator', local: 'Local', custom: 'Custom'
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
        <p className="settings-subtitle">{t('settings.subtitle')}</p>
      </div>

      {/* ── LLM Providers ── */}
      <section className="settings-section">
        <div className="section-head">
          <h2>LLM Providers</h2>
          <div className="section-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowPresets(v => !v); setShowForm(false) }}>
              + From Preset
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNew}>+ Custom</button>
          </div>
        </div>

        {/* Preset picker */}
        {showPresets && (
          <div className="preset-grid">
            {(['official', 'cn_official', 'aggregator', 'local'] as const).map(cat => {
              const items = LLM_PROVIDER_PRESETS.filter(p => p.category === cat)
              if (!items.length) return null
              return (
                <div key={cat} className="preset-cat">
                  <div className="preset-cat-label">{CATEGORY_LABELS[cat]}</div>
                  {items.map(p => (
                    <button key={p.id} className="preset-item" onClick={() => applyPreset(p)}>
                      <span className="preset-name">{p.name}</span>
                      <span className="preset-model">{p.defaultModel}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* Provider list */}
        {providers.length === 0 && !showForm && (
          <div className="empty-providers">
            No providers yet. Add one from a preset or create a custom provider.
          </div>
        )}
        <div className="provider-list">
          {providers.map(p => {
            const tr = testResults[p.id]
            const isTesting = testingId === p.id
            return (
              <div key={p.id} className={`provider-row ${p.id === activeId ? 'active' : ''}`}>
                <div className="provider-row-left">
                  <button
                    className={`active-dot ${p.id === activeId ? 'on' : 'off'}`}
                    title={p.id === activeId ? 'Active' : 'Set as active'}
                    onClick={() => handleSetActive(p.id)}
                  />
                  <div className="provider-info">
                    <span className="provider-name">{p.name}</span>
                    <span className="provider-meta">
                      {p.model}
                      {p.apiKeySet && <span className="key-badge">Key set</span>}
                      <span className="cat-badge">{CATEGORY_LABELS[p.category] ?? p.category}</span>
                      {p.websiteUrl && (
                        <a className="provider-link" href="#" onClick={e => { e.preventDefault(); window.api.shell.openExternal(p.websiteUrl!) }}>
                          ↗ Website
                        </a>
                      )}
                      {tr && (
                        <span className={`test-badge ${tr.ok ? 'ok' : 'fail'}`}>
                          {tr.ok ? '✓ OK' : `✗ ${tr.error?.slice(0, 60) ?? 'Failed'}`}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="provider-row-actions">
                  <button className="btn btn-ghost btn-xs" onClick={() => handleTest(p.id)} disabled={isTesting}>
                    {isTesting ? '…' : 'Test'}
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => openEdit(p)}>Edit</button>
                  <button
                    className={`btn btn-xs ${deleteConfirmId === p.id ? 'btn-danger' : 'btn-ghost danger'}`}
                    onClick={() => handleDelete(p.id)}
                    onBlur={() => setDeleteConfirmId(null)}
                  >{deleteConfirmId === p.id ? 'Confirm?' : 'Delete'}</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Edit / New form */}
        {showForm && (
          <div className="provider-form">
            <div className="form-header">
              <span>{editingId ? 'Edit Provider' : 'New Provider'}</span>
              <button className="btn-icon" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="MiniMax" />
              </div>
              <div className="form-field">
                <label>Model</label>
                <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="MiniMax-M2.7" />
              </div>
              <div className="form-field full">
                <label>Base URL <span className="hint">— passed directly to Anthropic SDK as baseURL</span></label>
                <input value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} placeholder="https://api.minimaxi.com/anthropic" />
              </div>
              <div className="form-field full">
                <label>API Key {editingId && <span className="hint">(leave blank to keep existing)</span>}</label>
                <input type="password" autoComplete="off"
                  value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  placeholder={editingId && config?.providers.find(p => p.id === editingId)?.apiKeySet ? '••••••••  (saved)' : 'sk-...'} />
              </div>
            </div>
            {formError && <p className="form-error">{formError}</p>}
            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update' : 'Save & Continue'}
              </button>
              {editingId && (
                <button className="btn btn-ghost" onClick={() => handleTest(editingId)} disabled={testingId === editingId}>
                  {testingId === editingId ? 'Testing…' : 'Test Connection'}
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Done</button>
              {editingId && testResults[editingId] && (
                <span className={`test-result ${testResults[editingId].ok ? 'ok' : 'fail'}`}>
                  {testResults[editingId].ok ? '✓ Connected' : `✗ ${testResults[editingId].error}`}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── AI Tool Paths ── */}
      <section className="settings-section">
        <h2>AI Tool Scan &amp; Export</h2>
        <p className="section-desc">Enable tools to include in Scan Local. Override default export paths if needed.</p>
        <div className="tool-paths-list">
          {toolTargets.map(t => (
            <div key={t.id} className="tool-path-row">
              <label className="tool-toggle-label">
                <input type="checkbox" checked={enabledTools[t.id] ?? true}
                  onChange={e => updateToolEnabled(t.id, e.target.checked)} />
                <span className={`tool-dot ${t.exists ? 'exists' : ''}`} />
                <span className="tool-path-name">{t.name}</span>
              </label>
              <div className="tool-path-inputs">
                <input className="tool-path-input" placeholder={t.exportDirDisplay}
                  value={toolPathOverrides[t.id] || ''}
                  onChange={e => updateToolPath(t.id, e.target.value)} />
                {toolPathOverrides[t.id] && (
                  <button className="btn btn-ghost btn-xs" onClick={() => updateToolPath(t.id, '')}>Reset</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="save-row">
          {toolAutoSaved && <span className="saved-msg">✓ Auto-saved</span>}
        </div>
      </section>

      {/* ── Appearance ── */}
      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="appearance-row">
          <span className="appearance-label">Theme</span>
          <div className="theme-toggle">
            {(['dark', 'light', 'system'] as Theme[]).map(t => (
              <button key={t} className={`theme-btn ${theme === t ? 'active' : ''}`} onClick={() => onThemeChange(t)}>
                {t === 'dark' ? '🌙 Dark' : t === 'light' ? '☀️ Light' : '💻 System'}
              </button>
            ))}
          </div>
        </div>
        <div className="appearance-row" style={{ marginTop: 12 }}>
          <span className="appearance-label">{t('settings.lang_label')}</span>
          <div className="theme-toggle">
            {(['zh', 'en'] as const).map(l => (
              <button key={l} className={`theme-btn ${(config?.language ?? 'zh') === l ? 'active' : ''}`}
                onClick={async () => {
                  await window.api.config.set({ language: l } as Parameters<typeof window.api.config.set>[0])
                  await reload()
                  toast?.(l === 'zh' ? t('settings.lang_toast_zh') : t('settings.lang_toast_en'), 'success')
                }}>
                {l === 'zh' ? t('settings.lang_zh') : t('settings.lang_en')}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── API Keys ── */}
      <section className="settings-section">
        <h2>API Keys</h2>
        <p className="section-desc">Optional keys for Studio GitHub Code Search and Agent web_search tool.</p>
        <div className="apikeys-list">
          <div className="apikey-row">
            <div className="apikey-info">
              <span className="apikey-name">GitHub Token</span>
              <span className="apikey-desc">Studio GitHub Code Search: raises rate limit from 60 to 5000 req/h</span>
            </div>
            <div className="apikey-input-wrap">
              {config?.githubTokenSet && !editingGithubToken
                ? <span className="key-set-badge">Token set ✓</span>
                : <input
                    type="password"
                    className="apikey-input"
                    placeholder="ghp_..."
                    value={githubTokenInput}
                    onChange={e => setGithubTokenInput(e.target.value)}
                  />
              }
              {config?.githubTokenSet && !editingGithubToken
                ? <button className="btn btn-ghost btn-xs" onClick={() => setEditingGithubToken(true)}>Change</button>
                : <button className="btn btn-primary btn-xs" onClick={saveGithubToken} disabled={!githubTokenInput.trim()}>Save</button>
              }
              {config?.githubTokenSet && (
                <button className="btn btn-ghost btn-xs danger" onClick={clearGithubToken}>Clear</button>
              )}
            </div>
          </div>
          <div className="apikey-row">
            <div className="apikey-info">
              <span className="apikey-name">Tavily API Key</span>
              <span className="apikey-desc">Required for web_search tool in Agent Skills</span>
            </div>
            <div className="apikey-input-wrap">
              {config?.toolApiKeysSet?.tavily && !editingTavily
                ? <span className="key-set-badge">Key set ✓</span>
                : <input
                    type="password"
                    className="apikey-input"
                    placeholder="tvly-..."
                    value={tavilyInput}
                    onChange={e => setTavilyInput(e.target.value)}
                  />
              }
              {config?.toolApiKeysSet?.tavily && !editingTavily
                ? <button className="btn btn-ghost btn-xs" onClick={() => setEditingTavily(true)}>Change</button>
                : <button className="btn btn-primary btn-xs" onClick={saveTavilyKey} disabled={!tavilyInput.trim()}>Save</button>
              }
              {config?.toolApiKeysSet?.tavily && (
                <button className="btn btn-ghost btn-xs danger" onClick={clearTavilyKey}>Clear</button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy & Analytics ── */}
      <section className="settings-section">
        <h2>Privacy &amp; Analytics</h2>
        <p className="section-desc">{t('settings.analytics_desc')}</p>
        <div className="analytics-row">
          <div className="analytics-info">
            <span className="analytics-name">Usage Analytics</span>
            <span className="analytics-desc">{t('settings.analytics_detail')}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={analyticsEnabled}
              onChange={e => {
                const v = e.target.checked
                setAnalyticsEnabled(v)
                window.api.telemetry.setConsent(v).catch(() => {})
              }}
            />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
      </section>

      {/* ── About ── */}
      <section className="settings-section about-section">
        <h2>About</h2>
        <div className="about-app-row">
          <div className="about-app-logo">⚡</div>
          <div className="about-app-info">
            <span className="about-app-name">SkillNexus</span>
            <span className="about-app-version">v0.1.0</span>
            <span className="about-app-desc">{t('settings.about_desc')}</span>
          </div>
        </div>
        <div className="about-divider" />
        <div className="about-grid">
          <div className="about-item"><span className="about-label">Active Provider</span>
            <span>{config?.providers.find(p => p.id === activeId)?.name ?? '—'}</span></div>
          <div className="about-item"><span className="about-label">Active Model</span>
            <span>{config?.providers.find(p => p.id === activeId)?.model ?? '—'}</span></div>
          <div className="about-item"><span className="about-label">Providers</span>
            <span>{config?.providers.length ?? 0} configured</span></div>
          <div className="about-item"><span className="about-label">GitHub Token</span>
            <span>{config?.githubTokenSet ? '✓ Set' : '✗ Not set'}</span></div>
          <div className="about-item"><span className="about-label">Tavily Key</span>
            <span>{config?.toolApiKeysSet?.tavily ? '✓ Set' : '✗ Not set'}</span></div>
          <div className="about-item"><span className="about-label">Platform</span>
            <span>{navigator.platform}</span></div>
        </div>
        <div className="about-divider" />
        <div className="about-author-row">
          <div className="about-author-info">
            <span className="about-author-name">SkySeraph</span>
            <div className="about-author-links">
              <a className="about-link" href="#" onClick={e => { e.preventDefault(); window.api.shell.openExternal('https://github.com/SkySeraph') }}>
                <span className="about-link-icon">⌥</span> GitHub
              </a>
              <a className="about-link" href="#" onClick={e => { e.preventDefault(); window.api.shell.openExternal('mailto:540033633@qq.com') }}>
                <span className="about-link-icon">✉</span> 540033633@qq.com
              </a>
              <a className="about-link" href="#" onClick={e => { e.preventDefault(); window.api.shell.openExternal('https://skyseraph.github.io/') }}>
                <span className="about-link-icon">🌐</span> skyseraph.github.io
              </a>
            </div>
          </div>
          <div className="about-qrcodes">
            {[
              { label: t('settings.qr_wechat'), placeholder: 'WeChat', imgSrc: mmqrcodeImg },
              { label: t('settings.qr_official'), placeholder: 'Official', imgSrc: qrcodeImg },
            ].map(({ label, placeholder, imgSrc }) => (
              <QRPlaceholder key={label} label={label} placeholder={placeholder} imgSrc={imgSrc} />
            ))}
          </div>
        </div>
      </section>

      <style>{`
        .settings-page { max-width: 900px; width: 100%; margin: 0 auto; }
        .page-header { margin-bottom: 28px; }
        .page-header h1 { font-size: 24px; font-weight: 700; }
        .settings-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }
        .settings-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; margin-bottom: 20px; width: 100%; box-sizing: border-box; }
        .settings-section h2 { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 0 0 12px; }
        .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; }
        .section-head h2 { margin: 0; }
        .section-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .btn-sm { padding: 5px 12px; font-size: 12px; }

        /* Preset grid */
        .preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-bottom: 16px; padding: 14px; background: var(--surface2); border-radius: var(--radius); border: 1px solid var(--border); }
        .preset-cat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 4px; }
        .preset-cat { display: flex; flex-direction: column; gap: 3px; }
        .preset-item { display: flex; flex-direction: column; align-items: flex-start; padding: 6px 10px; border-radius: calc(var(--radius) - 2px); border: 1px solid var(--border); background: var(--surface); cursor: pointer; transition: all var(--transition); text-align: left; }
        .preset-item:hover { border-color: var(--accent); background: var(--surface2); }
        .preset-name { font-size: 13px; font-weight: 500; color: var(--text); }
        .preset-model { font-size: 10px; color: var(--text-muted); margin-top: 1px; }

        /* Provider list */
        .empty-providers { font-size: 13px; color: var(--text-muted); padding: 16px 0; text-align: center; }
        .provider-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .provider-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface2); transition: border-color var(--transition); }
        .provider-row.active { border-color: var(--accent); background: rgba(99,102,241,0.06); }
        .provider-row-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .active-dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--border); background: transparent; cursor: pointer; flex-shrink: 0; transition: all var(--transition); padding: 0; }
        .active-dot.on { background: var(--success); border-color: var(--success); }
        .active-dot.off:hover { border-color: var(--accent); }
        .provider-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .provider-name { font-size: 14px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .provider-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; }
        .key-badge { background: rgba(74,222,128,0.15); color: var(--success); border-radius: 3px; padding: 1px 5px; font-size: 10px; font-weight: 600; }
        .cat-badge { background: var(--surface); color: var(--text-muted); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-size: 10px; }
        .test-badge { border-radius: 3px; padding: 1px 5px; font-size: 10px; font-weight: 600; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .test-badge.ok { background: rgba(74,222,128,0.15); color: var(--success); }
        .test-badge.fail { background: rgba(239,68,68,0.12); color: var(--danger); }
        .provider-link { font-size: 10px; color: var(--accent); text-decoration: none; }
        .provider-link:hover { text-decoration: underline; }
        .provider-row-actions { display: flex; gap: 6px; }
        .danger { color: var(--danger) !important; }

        /* Form */
        .provider-form { border: 1px solid var(--accent); border-radius: var(--radius); padding: 16px; margin-top: 8px; background: var(--surface2); }
        .form-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 14px; }
        .btn-icon { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 14px; padding: 2px 6px; }
        .btn-icon:hover { color: var(--text); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .form-field { display: flex; flex-direction: column; gap: 4px; }
        .form-field.full { grid-column: 1 / -1; }
        .form-field label { font-size: 12px; font-weight: 500; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
        .form-field .hint { font-weight: 400; font-size: 11px; }
        .form-field input { padding: 7px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; }
        .form-field input:focus { outline: none; border-color: var(--accent); }
        .form-error { font-size: 12px; color: var(--danger); margin: 8px 0 0; }
        .form-actions { display: flex; align-items: center; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
        .test-result { font-size: 13px; font-weight: 500; }
        .test-result.ok { color: var(--success); }
        .test-result.fail { color: var(--danger); max-width: 320px; word-break: break-all; }

        /* Tools */
        .section-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 14px; margin-top: 6px; }
        .tool-paths-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
        .tool-path-row { display: flex; align-items: center; gap: 10px; }
        .tool-toggle-label { display: flex; align-items: center; gap: 7px; cursor: pointer; width: 200px; flex-shrink: 0; }
        .tool-toggle-label input[type=checkbox] { width: 14px; height: 14px; cursor: pointer; accent-color: var(--accent); }
        .tool-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
        .tool-dot.exists { background: var(--success); }
        .tool-path-name { font-size: 13px; font-weight: 500; white-space: nowrap; }
        .tool-path-inputs { display: flex; gap: 6px; flex: 1; align-items: center; }
        .tool-path-input { flex: 1; padding: 5px 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 12px; font-family: 'Courier New', monospace; }
        .tool-path-input:focus { outline: none; border-color: var(--accent); }
        .btn-xs { padding: 3px 9px; font-size: 11px; }
        .save-row { display: flex; align-items: center; gap: 10px; }
        .saved-msg { font-size: 13px; color: var(--success); font-weight: 500; }

        /* About */
        .about-app-row { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
        .about-app-logo { font-size: 36px; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; background: rgba(108,99,255,0.12); border-radius: 12px; flex-shrink: 0; }
        .about-app-info { display: flex; flex-direction: column; gap: 3px; }
        .about-app-name { font-size: 18px; font-weight: 700; color: var(--text); }
        .about-app-version { font-size: 11px; color: var(--accent); font-weight: 600; background: rgba(108,99,255,0.12); padding: 1px 7px; border-radius: 10px; width: fit-content; }
        .about-app-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .about-divider { height: 1px; background: var(--border); margin: 14px 0; }
        .about-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
        .about-item { display: flex; flex-direction: column; gap: 3px; }
        .about-label { font-size: 11px; color: var(--text-muted); }
        .about-item span:last-child { font-size: 13px; font-weight: 500; }
        .about-author-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .about-qrcodes { display: flex; gap: 12px; flex-shrink: 0; }
        .qr-thumb { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; }
        .qr-placeholder-box { width: 56px; height: 56px; border: 1px dashed var(--border); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: var(--surface2); transition: all var(--transition); }
        .qr-thumb:hover .qr-placeholder-box { border-color: var(--accent); background: rgba(108,99,255,0.06); }
        .qr-placeholder-icon { font-size: 22px; color: var(--text-muted); line-height: 1; }
        .qr-placeholder-text { font-size: 8px; color: var(--text-muted); }
        .qr-label { font-size: 11px; color: var(--text-muted); }
        .qr-modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 16px; width: 240px; }
        .qr-modal-title { font-size: 14px; font-weight: 600; color: var(--text); }
        .qr-modal-box { width: 160px; height: 160px; border: 1px dashed var(--border); border-radius: 8px; background: var(--surface2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
        .qr-modal-icon { font-size: 64px; color: var(--text-muted); line-height: 1; }
        .qr-modal-hint { font-size: 10px; color: var(--text-muted); text-align: center; padding: 0 12px; }
        .qr-modal-close { padding: 5px 20px; font-size: 12px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .qr-modal-close:hover { border-color: var(--accent); color: var(--accent); }
        .about-author-info { display: flex; flex-direction: column; gap: 8px; }
        .about-author-name { font-size: 14px; font-weight: 600; color: var(--text); }
        .about-author-links { display: flex; gap: 12px; flex-wrap: wrap; }
        .about-link { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-muted); text-decoration: none; padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; transition: all var(--transition); }
        .about-link:hover { border-color: var(--accent); color: var(--accent); background: rgba(108,99,255,0.06); }
        .about-link-icon { font-size: 13px; }

        /* API Keys */
        .apikeys-list { display: flex; flex-direction: column; gap: 12px; }
        .apikey-row { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface2); }
        .apikey-info { display: flex; flex-direction: column; gap: 2px; }
        .apikey-name { font-size: 13px; font-weight: 600; }
        .apikey-desc { font-size: 11px; color: var(--text-muted); }
        .apikey-input-wrap { display: flex; align-items: center; gap: 6px; }
        .apikey-input { flex: 1; min-width: 0; padding: 6px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 12px; font-family: 'Courier New', monospace; }
        .apikey-input:focus { outline: none; border-color: var(--accent); }
        .key-set-badge { font-size: 11px; font-weight: 600; color: var(--success); background: rgba(74,222,128,0.12); padding: 3px 8px; border-radius: 3px; white-space: nowrap; }

        /* Appearance */
        .appearance-row { display: flex; align-items: center; gap: 16px; margin-top: 12px; }
        .appearance-label { font-size: 13px; color: var(--text-muted); width: 90px; flex-shrink: 0; }
        .theme-toggle { display: flex; gap: 6px; }
        .theme-btn { padding: 6px 14px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface2); color: var(--text-muted); font-size: 12px; cursor: pointer; transition: all var(--transition); }
        .theme-btn:hover { border-color: var(--accent); color: var(--text); }
        .theme-btn.active { border-color: var(--accent); background: rgba(108,99,255,0.15); color: var(--accent); font-weight: 600; }

        /* Analytics */
        .analytics-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .analytics-info { display: flex; flex-direction: column; gap: 2px; }
        .analytics-name { font-size: 13px; font-weight: 600; color: var(--text); }
        .analytics-desc { font-size: 11px; color: var(--text-muted); }
        .toggle-switch { position: relative; display: inline-block; flex-shrink: 0; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .toggle-track { display: block; width: 40px; height: 22px; background: var(--border); border-radius: 11px; cursor: pointer; transition: background var(--transition); position: relative; }
        .toggle-switch input:checked + .toggle-track { background: var(--accent); }
        .toggle-thumb { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: #fff; border-radius: 50%; transition: transform var(--transition); }
        .toggle-switch input:checked + .toggle-track .toggle-thumb { transform: translateX(18px); }
      `}</style>
    </div>
  )
}
