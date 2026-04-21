import { useEffect, useState, useCallback } from 'react'
import type { AppConfigPublic, AppConfig, ToolTarget, ProviderName, CustomProvider } from '../../../shared/types'
import { PROVIDER_PRESETS } from '../../../shared/types'

interface Props {
  onConfigSaved?: () => void
}

const EMPTY_CUSTOM: CustomProvider = { id: '', label: '', baseUrl: '', apiKey: '', defaultModel: '', apiFormat: 'openai' }

const ANTHROPIC_COMPAT_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229'
]

export default function SettingsPage({ onConfigSaved }: Props) {
  const [config, setConfig] = useState<AppConfigPublic | null>(null)
  const [provider, setProvider] = useState<ProviderName>('anthropic')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [models, setModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [toolTargets, setToolTargets] = useState<ToolTarget[]>([])
  const [toolPathOverrides, setToolPathOverrides] = useState<Record<string, string>>({})
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({})
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({})
  // Custom provider management
  const [customProviders, setCustomProviders] = useState<Array<Omit<CustomProvider, 'apiKey'> & { apiKeySet: boolean }>>([])
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [editingCustom, setEditingCustom] = useState<CustomProvider>(EMPTY_CUSTOM)
  const [customSaving, setCustomSaving] = useState(false)
  const [customIdError, setCustomIdError] = useState('')

  const currentPreset = PROVIDER_PRESETS.find(p => p.id === provider)
  const currentCustom = customProviders.find(p => p.id === provider)

  const fetchModels = useCallback(async (p: ProviderName) => {
    setFetchingModels(true)
    try {
      const list = await window.api.config.listModels(p)
      const preset = PROVIDER_PRESETS.find(pr => pr.id === p)
      const fallback = preset?.modelsFallback ?? []
      if (list.length > 0) {
        setModels(list)
        setModel(prev => list.includes(prev) ? prev : list[0])
      } else {
        setModels(fallback)
      }
    } catch {
      const preset = PROVIDER_PRESETS.find(pr => pr.id === p)
      setModels(preset?.modelsFallback ?? [])
    } finally {
      setFetchingModels(false)
    }
  }, [])

  const reloadConfig = useCallback(async () => {
    const c = await window.api.config.get()
    setConfig(c)
    setProvider(c.defaultProvider)
    setModel(c.defaultModel)
    setBaseUrls(c.providerBaseUrls ?? {})
    setCustomProviders(c.customProviders ?? [])
    fetchModels(c.defaultProvider)
  }, [fetchModels])

  useEffect(() => {
    reloadConfig()
    window.api.skills.getToolTargets().then(targets => {
      setToolTargets(targets)
      const enabled: Record<string, boolean> = {}
      targets.forEach(t => { enabled[t.id] = t.enabled ?? true })
      setEnabledTools(enabled)
    })
  }, [reloadConfig])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setTestResult(null)

    const update: Partial<AppConfig> = {
      defaultProvider: provider,
      defaultModel: model,
      toolPaths: toolPathOverrides,
      enabledTools
    }

    if (apiKeys['anthropic']?.trim()) update.anthropicApiKey = apiKeys['anthropic'].trim()
    if (apiKeys['openai']?.trim()) update.openaiApiKey = apiKeys['openai'].trim()

    const newProviderCfgs: Record<string, { apiKey?: string; baseUrl?: string }> = {}
    for (const preset of PROVIDER_PRESETS) {
      if (preset.id === 'anthropic' || preset.id === 'openai') continue
      const key = apiKeys[preset.id]?.trim()
      const base = baseUrls[preset.id]?.trim()
      if (key || base) {
        newProviderCfgs[preset.id] = {}
        if (key) newProviderCfgs[preset.id].apiKey = key
        if (base) newProviderCfgs[preset.id].baseUrl = base
      }
    }
    if (Object.keys(newProviderCfgs).length > 0) update.providerConfigs = newProviderCfgs

    await window.api.config.set(update)
    const fresh = await window.api.config.get()
    setConfig(fresh)
    setBaseUrls(fresh.providerBaseUrls ?? {})
    setCustomProviders(fresh.customProviders ?? [])
    setApiKeys({})
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    onConfigSaved?.()
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await window.api.config.test(provider)
    setTestResult(result)
    setTesting(false)
  }

  const switchProvider = (p: ProviderName) => {
    setProvider(p)
    setTestResult(null)
    // Pre-fill model from custom provider's defaultModel
    const custom = customProviders.find(c => c.id === p)
    if (custom?.defaultModel) setModel(custom.defaultModel)
    fetchModels(p)
  }

  const isKeySet = (p: ProviderName): boolean => {
    if (p === 'anthropic') return !!config?.anthropicApiKeySet
    if (p === 'openai') return !!config?.openaiApiKeySet
    return !!(config?.providerKeySet?.[p] || customProviders.find(c => c.id === p)?.apiKeySet)
  }

  const openAddCustom = () => {
    setEditingCustom(EMPTY_CUSTOM)
    setCustomIdError('')
    setShowAddCustom(true)
  }

  const openEditCustom = (id: string) => {
    const found = customProviders.find(c => c.id === id)
    if (!found) return
    setEditingCustom({ id: found.id, label: found.label, baseUrl: found.baseUrl, apiKey: '', defaultModel: found.defaultModel ?? '' })
    setCustomIdError('')
    setShowAddCustom(true)
  }

  const handleSaveCustom = async () => {
    const { id, label, baseUrl } = editingCustom
    if (!id.trim()) { setCustomIdError('ID is required'); return }
    if (!/^[a-z0-9_-]+$/.test(id.trim())) { setCustomIdError('ID: lowercase letters, digits, - _ only'); return }
    const isBuiltin = PROVIDER_PRESETS.some(p => p.id === id.trim())
    if (isBuiltin) { setCustomIdError('ID conflicts with a built-in provider'); return }
    if (!label.trim()) { setCustomIdError('Name is required'); return }
    if (!baseUrl.trim()) { setCustomIdError('Base URL is required'); return }
    if (!editingCustom.defaultModel?.trim()) { setCustomIdError('Default Model is required'); return }

    setCustomSaving(true)
    const saved: CustomProvider = {
      id: id.trim(), label: label.trim(),
      baseUrl: baseUrl.trim().replace(/\/$/, ''),
      apiKey: editingCustom.apiKey?.trim() || undefined,
      defaultModel: editingCustom.defaultModel?.trim() || undefined
    }
    await window.api.config.saveCustomProvider(saved)
    await reloadConfig()
    setShowAddCustom(false)
    setCustomSaving(false)
    // Auto-switch to new provider and apply its model
    switchProvider(saved.id)
    if (saved.defaultModel) setModel(saved.defaultModel)
  }

  const handleDeleteCustom = async (id: string) => {
    await window.api.config.deleteCustomProvider(id)
    await reloadConfig()
    if (provider === id) switchProvider('anthropic')
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      {/* LLM Provider */}
      <section className="settings-section">
        <h2>LLM Provider</h2>
        <div className="provider-tabs">
          {PROVIDER_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`provider-tab ${provider === p.id ? 'active' : ''}`}
              onClick={() => switchProvider(p.id)}
            >
              {p.label}
              {isKeySet(p.id) && <span className="key-dot" title="Configured" />}
            </button>
          ))}
          {customProviders.map((p) => (
            <button
              key={p.id}
              className={`provider-tab custom-tab ${provider === p.id ? 'active' : ''}`}
              onClick={() => switchProvider(p.id)}
            >
              {p.label}
              {p.apiKeySet && <span className="key-dot" title="Configured" />}
            </button>
          ))}
          <button className="provider-tab add-custom-btn" onClick={openAddCustom} title="Add custom provider">
            + Custom
          </button>
        </div>

        {/* Custom provider editor */}
        {showAddCustom && (
          <div className="custom-form">
            <div className="custom-form-header">
              <span>{editingCustom.id && customProviders.some(c => c.id === editingCustom.id) ? 'Edit' : 'New'} Custom Provider</span>
              <button className="btn-icon" onClick={() => setShowAddCustom(false)}>✕</button>
            </div>
            <div className="custom-form-fields">
              <div className="custom-field">
                <label>ID <span className="muted">(unique slug)</span></label>
                <input
                  type="text"
                  placeholder="my-provider"
                  value={editingCustom.id}
                  onChange={e => { setEditingCustom(prev => ({ ...prev, id: e.target.value })); setCustomIdError('') }}
                  disabled={customProviders.some(c => c.id === editingCustom.id)}
                />
              </div>
              <div className="custom-field">
                <label>Name</label>
                <input
                  type="text"
                  placeholder="My Provider"
                  value={editingCustom.label}
                  onChange={e => setEditingCustom(prev => ({ ...prev, label: e.target.value }))}
                />
              </div>
              <div className="custom-field full">
                <label>API Format</label>
                <div className="format-toggle">
                  <button
                    type="button"
                    className={`format-btn ${editingCustom.apiFormat === 'openai' ? 'active' : ''}`}
                    onClick={() => setEditingCustom(prev => ({ ...prev, apiFormat: 'openai' }))}
                  >OpenAI Compatible</button>
                  <button
                    type="button"
                    className={`format-btn ${editingCustom.apiFormat === 'anthropic' ? 'active' : ''}`}
                    onClick={() => setEditingCustom(prev => ({ ...prev, apiFormat: 'anthropic' }))}
                  >Anthropic Compatible</button>
                </div>
                <p className="field-hint" style={{ marginTop: 4 }}>
                  {editingCustom.apiFormat === 'openai'
                    ? 'POST /chat/completions — OpenAI, Groq, MiniMax (api.minimaxi.chat/v1), etc.'
                    : 'POST /messages — Anthropic format, e.g. https://api.minimax.chat/v1'}
                </p>
              </div>
              <div className="custom-field full">
                <label>Base URL</label>
                <input
                  type="text"
                  placeholder={editingCustom.apiFormat === 'openai' ? 'https://api.minimaxi.chat/v1' : 'https://api.minimax.chat/v1'}
                  value={editingCustom.baseUrl}
                  onChange={e => setEditingCustom(prev => ({ ...prev, baseUrl: e.target.value }))}
                />
              </div>
              <div className="custom-field full">
                <label>Default Model <span className="muted">(required)</span></label>
                {editingCustom.apiFormat === 'anthropic' ? (
                  <div className="model-combo">
                    <select
                      value={ANTHROPIC_COMPAT_MODELS.includes(editingCustom.defaultModel ?? '') ? (editingCustom.defaultModel ?? '') : '__custom__'}
                      onChange={e => {
                        if (e.target.value !== '__custom__') setEditingCustom(prev => ({ ...prev, defaultModel: e.target.value }))
                        else setEditingCustom(prev => ({ ...prev, defaultModel: '' }))
                      }}
                    >
                      {ANTHROPIC_COMPAT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                      <option value="__custom__">Custom model name…</option>
                    </select>
                    {!ANTHROPIC_COMPAT_MODELS.includes(editingCustom.defaultModel ?? '') && (
                      <input
                        type="text"
                        placeholder="e.g. MiniMax-Text-01"
                        value={editingCustom.defaultModel ?? ''}
                        onChange={e => setEditingCustom(prev => ({ ...prev, defaultModel: e.target.value }))}
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. MiniMax-M1"
                    value={editingCustom.defaultModel ?? ''}
                    onChange={e => setEditingCustom(prev => ({ ...prev, defaultModel: e.target.value }))}
                  />
                )}
              </div>
              <div className="custom-field full">
                <label>API Key <span className="muted">(optional)</span></label>
                <input
                  type="password"
                  placeholder={editingCustom.apiFormat === 'anthropic' ? 'x-api-key value' : 'Bearer token / sk-...'}
                  value={editingCustom.apiKey ?? ''}
                  onChange={e => setEditingCustom(prev => ({ ...prev, apiKey: e.target.value }))}
                  autoComplete="off"
                />
              </div>
            </div>
            {customIdError && <p className="custom-error">{customIdError}</p>}
            <div className="custom-form-actions">
              <button className="btn btn-primary" onClick={handleSaveCustom} disabled={customSaving}>
                {customSaving ? 'Saving...' : 'Save Provider'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAddCustom(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Custom provider management row */}
        {currentCustom && (
          <div className="custom-manage-row">
            <span className="custom-manage-label">Custom: <strong>{currentCustom.label}</strong> — {customProviders.find(c => c.id === currentCustom.id)?.apiKeySet ? '🔑 Key set' : 'No key'}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => openEditCustom(currentCustom.id)}>Edit</button>
            <button className="btn btn-ghost btn-xs danger" onClick={() => handleDeleteCustom(currentCustom.id)}>Delete</button>
          </div>
        )}

        {/* API Key (built-in cloud providers) */}
        {currentPreset?.requiresKey && (
          <div className="field">
            <label className="field-label">
              {currentPreset.label} API Key
              {isKeySet(provider) && <span className="badge-set">Key saved</span>}
            </label>
            <input
              type="password"
              placeholder={
                isKeySet(provider)
                  ? '••••••••••••••••  (leave blank to keep existing)'
                  : currentPreset.keyPlaceholder
              }
              value={apiKeys[provider] ?? ''}
              onChange={(e) => setApiKeys(prev => ({ ...prev, [provider]: e.target.value }))}
              style={{ width: '100%' }}
              autoComplete="off"
            />
            <p className="field-hint">Get your key at {currentPreset.keyHint}</p>
          </div>
        )}

        {/* Base URL (local built-in providers) */}
        {currentPreset?.isLocal && (
          <div className="field">
            <label className="field-label">Base URL</label>
            <input
              type="text"
              placeholder={currentPreset.baseUrl}
              value={baseUrls[provider] ?? ''}
              onChange={(e) => setBaseUrls(prev => ({ ...prev, [provider]: e.target.value }))}
              style={{ width: '100%' }}
            />
            <p className="field-hint">{currentPreset.keyHint}</p>
          </div>
        )}

        {/* Default Model */}
        <div className="field">
          <label className="field-label">
            Default Model
            {fetchingModels && <span className="fetching-badge">Fetching...</span>}
            {!fetchingModels && (
              <button className="btn-link" onClick={() => fetchModels(provider)} title="Refresh model list">
                ↻ Refresh
              </button>
            )}
          </label>
          {models.length > 0 ? (
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={fetchingModels}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <div className="model-empty">
              <input
                type="text"
                placeholder={currentPreset?.isLocal ? 'e.g. llama3.2:latest' : 'Enter model name'}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{ width: '100%' }}
              />
              {currentPreset?.isLocal && (
                <p className="field-hint">No models found — make sure {currentPreset.label} is running, then click Refresh.</p>
              )}
              {currentCustom && (
                <p className="field-hint">Click Refresh to auto-discover models, or enter manually.</p>
              )}
            </div>
          )}
        </div>

        {/* Test Connection */}
        <div className="test-row">
          <button className="btn btn-ghost" onClick={handleTest} disabled={testing}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          {testResult && (
            <span className={`test-result ${testResult.ok ? 'ok' : 'fail'}`}>
              {testResult.ok ? '✓ Connected' : `✗ ${testResult.error}`}
            </span>
          )}
        </div>
      </section>

      {/* Save */}
      <div className="save-row">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && <span className="saved-msg">✓ Saved</span>}
      </div>

      {/* AI Tool Paths & Toggles */}
      <section className="settings-section">
        <h2>AI Tool Scan &amp; Export</h2>
        <p className="section-desc">Enable tools to include in Scan Local. Override default paths if your tool is installed elsewhere.</p>
        <div className="tool-paths-list">
          {toolTargets.map(t => (
            <div key={t.id} className="tool-path-row">
              <label className="tool-toggle-label">
                <input
                  type="checkbox"
                  checked={enabledTools[t.id] ?? true}
                  onChange={e => setEnabledTools(prev => ({ ...prev, [t.id]: e.target.checked }))}
                />
                <span className={`tool-dot ${t.exists ? 'exists' : ''}`} />
                <span className="tool-path-name">{t.name}</span>
              </label>
              <div className="tool-path-inputs">
                <input
                  className="tool-path-input"
                  placeholder={t.exportDirDisplay}
                  value={toolPathOverrides[t.id] || ''}
                  onChange={e => setToolPathOverrides(prev => ({ ...prev, [t.id]: e.target.value }))}
                />
                {toolPathOverrides[t.id] && (
                  <button className="btn btn-ghost btn-xs" onClick={() => setToolPathOverrides(prev => {
                    const n = { ...prev }; delete n[t.id]; return n
                  })}>Reset</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="settings-section about-section">
        <h2>About</h2>
        <div className="about-grid">
          <div className="about-item"><span className="about-label">App</span><span>SkillNexus</span></div>
          <div className="about-item"><span className="about-label">Version</span><span>0.1.0</span></div>
          <div className="about-item"><span className="about-label">Active Provider</span><span>{config?.defaultProvider ?? '—'}</span></div>
          <div className="about-item"><span className="about-label">Active Model</span><span>{config?.defaultModel ?? '—'}</span></div>
        </div>
      </section>

      <style>{`
        .settings-page { max-width: 640px; }
        .page-header { margin-bottom: 28px; }
        .page-header h1 { font-size: 24px; font-weight: 700; }
        .settings-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; margin-bottom: 20px; }
        .settings-section h2 { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 18px; }
        .provider-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
        .provider-tab { position: relative; padding: 6px 14px; border-radius: var(--radius); border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer; transition: all var(--transition); }
        .provider-tab:hover { color: var(--text); border-color: var(--text-muted); }
        .provider-tab.active { background: var(--surface2); color: var(--text); border-color: var(--accent); }
        .custom-tab { border-style: dashed; }
        .add-custom-btn { border-style: dashed; color: var(--accent); }
        .add-custom-btn:hover { background: rgba(var(--accent-rgb, 99,102,241),0.08); border-color: var(--accent); color: var(--accent); }
        .key-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--success); margin-left: 6px; vertical-align: middle; }
        .custom-form { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface2); padding: 16px; margin-bottom: 16px; }
        .custom-form-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
        .btn-icon { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 14px; padding: 2px 6px; }
        .btn-icon:hover { color: var(--text); }
        .custom-form-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .custom-field { display: flex; flex-direction: column; gap: 4px; }
        .custom-field.full { grid-column: 1 / -1; }
        .format-toggle { display: flex; gap: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; width: fit-content; }
        .format-btn { padding: 5px 14px; font-size: 12px; font-weight: 500; background: transparent; border: none; color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .format-btn:hover { background: var(--surface2); color: var(--text); }
        .format-btn.active { background: var(--accent); color: #fff; }
        .model-combo { display: flex; flex-direction: column; gap: 6px; }
        .custom-field label { font-size: 12px; font-weight: 500; color: var(--text-muted); }
        .custom-field input { padding: 6px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; }
        .custom-field input:focus { outline: none; border-color: var(--accent); }
        .muted { color: var(--text-muted); font-weight: 400; }
        .custom-error { font-size: 12px; color: var(--danger); margin-top: 8px; }
        .custom-form-actions { display: flex; gap: 8px; margin-top: 12px; }
        .custom-manage-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--surface2); border-radius: var(--radius); margin-bottom: 16px; font-size: 13px; }
        .custom-manage-label { flex: 1; }
        .danger { color: var(--danger) !important; }
        .field { margin-bottom: 16px; }
        .field-label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text); flex-wrap: wrap; }
        .badge-set { background: rgba(74,222,128,0.15); color: var(--success); border-radius: 4px; padding: 1px 7px; font-size: 11px; font-weight: 600; }
        .fetching-badge { background: var(--surface2); color: var(--text-muted); border-radius: 4px; padding: 1px 7px; font-size: 11px; }
        .btn-link { background: none; border: none; color: var(--accent); font-size: 12px; cursor: pointer; padding: 0 4px; }
        .btn-link:hover { text-decoration: underline; }
        .field-hint { font-size: 11px; color: var(--text-muted); margin-top: 5px; }
        .model-empty { display: flex; flex-direction: column; gap: 4px; }
        .test-row { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
        .test-result { font-size: 13px; font-weight: 500; }
        .test-result.ok { color: var(--success); }
        .test-result.fail { color: var(--danger); }
        .save-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .saved-msg { font-size: 13px; color: var(--success); font-weight: 500; }
        .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .about-item { display: flex; flex-direction: column; gap: 3px; }
        .about-label { font-size: 11px; color: var(--text-muted); }
        .about-item span:last-child { font-size: 13px; font-weight: 500; }
        .section-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 14px; margin-top: -10px; }
        .tool-paths-list { display: flex; flex-direction: column; gap: 8px; }
        .tool-path-row { display: flex; align-items: center; gap: 10px; }
        .tool-toggle-label { display: flex; align-items: center; gap: 7px; cursor: pointer; width: 160px; flex-shrink: 0; }
        .tool-toggle-label input[type=checkbox] { width: 14px; height: 14px; cursor: pointer; accent-color: var(--accent); }
        .tool-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
        .tool-dot.exists { background: var(--success); }
        .tool-path-name { font-size: 13px; font-weight: 500; }
        .tool-path-inputs { display: flex; gap: 6px; flex: 1; align-items: center; }
        .tool-path-input { flex: 1; padding: 5px 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 12px; font-family: 'Courier New', monospace; }
        .tool-path-input:focus { outline: none; border-color: var(--accent); }
        .btn-xs { padding: 3px 9px; font-size: 11px; }
      `}</style>
    </div>
  )
}
