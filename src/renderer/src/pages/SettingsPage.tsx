import { useEffect, useState, useCallback } from 'react'
import type { AppConfigPublic, AppConfig, ToolTarget, LLMProvider, LLMProviderPreset } from '../../../shared/types'
import { LLM_PROVIDER_PRESETS } from '../../../shared/types'

interface Props {
  onConfigSaved?: () => void
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

export default function SettingsPage({ onConfigSaved }: Props) {
  const [config, setConfig] = useState<AppConfigPublic | null>(null)
  const [toolTargets, setToolTargets] = useState<ToolTarget[]>([])
  const [toolPathOverrides, setToolPathOverrides] = useState<Record<string, string>>({})
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({})

  // Provider UI state
  const [form, setForm] = useState<EditForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null) // null = new, string = editing
  const [showForm, setShowForm] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({})
  const [formError, setFormError] = useState('')
  const [toolSaving, setToolSaving] = useState(false)
  const [toolSaved, setToolSaved] = useState(false)

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
    // Set as active if it's the first provider
    const fresh = await window.api.config.get()
    if (fresh.providers.length === 1 || !fresh.activeProviderId) {
      await window.api.config.setActive(finalId)
    }
    await reload()
    setSaving(false)
    // Stay in edit mode so user can test immediately
    if (!editingId) {
      setEditingId(finalId)
      setForm(f => ({ ...f, id: finalId, apiKey: '' }))
    }
    onConfigSaved?.()
  }

  const handleDelete = async (id: string) => {
    await window.api.config.deleteProvider(id)
    await reload()
    if (showForm && editingId === id) setShowForm(false)
  }

  const handleSetActive = async (id: string) => {
    await window.api.config.setActive(id)
    await reload()
    onConfigSaved?.()
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestResults(r => ({ ...r, [id]: { ok: false } }))
    const result = await window.api.config.test(id)
    setTestResults(r => ({ ...r, [id]: result }))
    setTestingId(null)
  }

  const handleSaveTools = async () => {
    setToolSaving(true)
    await window.api.config.set({ toolPaths: toolPathOverrides, enabledTools } as Partial<AppConfig>)
    setToolSaving(false)
    setToolSaved(true)
    setTimeout(() => setToolSaved(false), 2000)
  }

  const providers = config?.providers ?? []
  const activeId = config?.activeProviderId ?? ''

  const CATEGORY_LABELS: Record<string, string> = {
    official: 'Official', cn_official: 'CN Official',
    aggregator: 'Aggregator', local: 'Local', custom: 'Custom'
  }

  return (
    <div className="settings-page">
      <div className="page-header"><h1>Settings</h1></div>

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
                  <button className="btn btn-ghost btn-xs danger" onClick={() => handleDelete(p.id)}>Delete</button>
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
                  onChange={e => setEnabledTools(prev => ({ ...prev, [t.id]: e.target.checked }))} />
                <span className={`tool-dot ${t.exists ? 'exists' : ''}`} />
                <span className="tool-path-name">{t.name}</span>
              </label>
              <div className="tool-path-inputs">
                <input className="tool-path-input" placeholder={t.exportDirDisplay}
                  value={toolPathOverrides[t.id] || ''}
                  onChange={e => setToolPathOverrides(prev => ({ ...prev, [t.id]: e.target.value }))} />
                {toolPathOverrides[t.id] && (
                  <button className="btn btn-ghost btn-xs" onClick={() => setToolPathOverrides(prev => {
                    const n = { ...prev }; delete n[t.id]; return n
                  })}>Reset</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="save-row">
          <button className="btn btn-primary btn-sm" onClick={handleSaveTools} disabled={toolSaving}>
            {toolSaving ? 'Saving…' : 'Save Tool Settings'}
          </button>
          {toolSaved && <span className="saved-msg">✓ Saved</span>}
        </div>
      </section>

      {/* ── About ── */}
      <section className="settings-section about-section">
        <h2>About</h2>
        <div className="about-grid">
          <div className="about-item"><span className="about-label">App</span><span>SkillNexus</span></div>
          <div className="about-item"><span className="about-label">Version</span><span>0.1.0</span></div>
          <div className="about-item"><span className="about-label">Active Provider</span>
            <span>{config?.providers.find(p => p.id === activeId)?.name ?? '—'}</span></div>
          <div className="about-item"><span className="about-label">Active Model</span>
            <span>{config?.providers.find(p => p.id === activeId)?.model ?? '—'}</span></div>
        </div>
      </section>

      <style>{`
        .settings-page { max-width: 680px; }
        .page-header { margin-bottom: 28px; }
        .page-header h1 { font-size: 24px; font-weight: 700; }
        .settings-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; margin-bottom: 20px; }
        .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .settings-section h2 { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 0; }
        .section-actions { display: flex; gap: 8px; }
        .btn-sm { padding: 5px 12px; font-size: 12px; }

        /* Preset grid */
        .preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-bottom: 16px; padding: 14px; background: var(--surface2); border-radius: var(--radius); border: 1px solid var(--border); }
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
        .section-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 14px; margin-top: -8px; }
        .tool-paths-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
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
        .save-row { display: flex; align-items: center; gap: 10px; }
        .saved-msg { font-size: 13px; color: var(--success); font-weight: 500; }

        /* About */
        .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .about-item { display: flex; flex-direction: column; gap: 3px; }
        .about-label { font-size: 11px; color: var(--text-muted); }
        .about-item span:last-child { font-size: 13px; font-weight: 500; }
      `}</style>
    </div>
  )
}
