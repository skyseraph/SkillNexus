import { ipcMain, net } from 'electron'
import Store from 'electron-store'
import type { AppConfig, AppConfigPublic, ProviderName, CustomProvider } from '../../shared/types'
import { PROVIDER_PRESETS } from '../../shared/types'
import { setAIProvider, createProvider } from '../services/ai-provider'

const store = new Store<AppConfig>({
  defaults: {
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-6'
  }
})

export function registerConfigHandlers(): void {
  ipcMain.handle('config:get', (): AppConfigPublic => {
    const s = store.store
    const providerKeySet: Record<string, boolean> = {
      anthropic: !!s.anthropicApiKey,
      openai: !!s.openaiApiKey
    }
    const providerBaseUrls: Record<string, string> = {}
    for (const [id, cfg] of Object.entries(s.providerConfigs ?? {})) {
      if (cfg.apiKey) providerKeySet[id] = true
      if (cfg.baseUrl) providerBaseUrls[id] = cfg.baseUrl
    }
    const customProviders = (s.customProviders ?? []).map(p => ({
      id: p.id,
      label: p.label,
      baseUrl: p.baseUrl,
      apiKeySet: !!p.apiKey
    }))
    return {
      defaultProvider: s.defaultProvider,
      defaultModel: s.defaultModel,
      anthropicApiKeySet: !!s.anthropicApiKey,
      openaiApiKeySet: !!s.openaiApiKey,
      providerKeySet,
      providerBaseUrls,
      customProviders
    }
  })

  ipcMain.handle('config:set', (_event, config: Partial<AppConfig>) => {
    const allowed: (keyof AppConfig)[] = [
      'defaultProvider', 'defaultModel',
      'anthropicApiKey', 'openaiApiKey',
      'toolPaths', 'enabledTools', 'providerConfigs'
    ]
    for (const key of allowed) {
      if (!(key in config)) continue
      const value = config[key]

      if (key === 'providerConfigs') {
        // Merge with existing providerConfigs instead of overwriting
        const existing = store.get('providerConfigs') ?? {}
        const incoming = value as Record<string, { apiKey?: string; baseUrl?: string }>
        const merged: Record<string, { apiKey?: string; baseUrl?: string }> = { ...existing }
        for (const [pid, pcfg] of Object.entries(incoming)) {
          merged[pid] = { ...existing[pid], ...pcfg }
        }
        store.set('providerConfigs', merged)
      } else {
        store.set(key, value)
      }

      if (key === 'anthropicApiKey') {
        process.env.ANTHROPIC_API_KEY = (value as string) || ''
      } else if (key === 'openaiApiKey') {
        process.env.OPENAI_API_KEY = (value as string) || ''
      }
    }
    // Re-init active provider when provider or keys change
    const s = store.store
    setAIProvider(createProvider(s.defaultProvider, s))
  })

  ipcMain.handle('config:test', async (_event, provider: ProviderName) => {
    try {
      const s = store.store
      const p = createProvider(provider, s)
      // For custom providers, use their configured defaultModel; fall back to preset test model
      const custom = (s.customProviders ?? []).find(c => c.id === provider)
      const model = custom?.defaultModel || (s.defaultProvider === provider ? s.defaultModel : null) || getTestModel(provider)
      await p.call({
        model,
        systemPrompt: 'Reply with exactly: ok',
        userMessage: 'ping',
        maxTokens: 10
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('config:listModels', async (_event, provider: ProviderName) => {
    return listModels(provider)
  })

  ipcMain.handle('config:saveCustomProvider', (_event, p: CustomProvider) => {
    const existing = store.get('customProviders') ?? []
    const idx = existing.findIndex(c => c.id === p.id)
    if (idx >= 0) {
      // Preserve existing apiKey if new one is blank
      existing[idx] = { ...existing[idx], ...p, apiKey: p.apiKey || existing[idx].apiKey }
    } else {
      existing.push(p)
    }
    store.set('customProviders', existing)
    // Re-init provider if this is the active one
    const s = store.store
    if (s.defaultProvider === p.id) setAIProvider(createProvider(p.id, s))
  })

  ipcMain.handle('config:deleteCustomProvider', (_event, id: string) => {
    const existing = store.get('customProviders') ?? []
    store.set('customProviders', existing.filter(c => c.id !== id))
    // Fall back to anthropic if deleting the active provider
    const s = store.store
    if (s.defaultProvider === id) {
      store.set('defaultProvider', 'anthropic')
      setAIProvider(createProvider('anthropic', store.store))
    }
  })
}

function getTestModel(provider: ProviderName): string {
  const fallbacks: Record<string, string> = {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-1.5-flash',
    groq: 'llama-3.1-8b-instant',
    mistral: 'mistral-small-latest',
    ollama: 'llama3.2',
    lmstudio: 'local-model'
  }
  return fallbacks[provider] ?? 'gpt-4o-mini'
}

export function loadApiKeysToEnv(): void {
  const s = store.store
  if (s.anthropicApiKey) process.env.ANTHROPIC_API_KEY = s.anthropicApiKey
  if (s.openaiApiKey) process.env.OPENAI_API_KEY = s.openaiApiKey
  // Init active provider from saved config
  setAIProvider(createProvider(s.defaultProvider, s))
}

export function getConfig(): AppConfig {
  return store.store
}

export async function listModels(provider: ProviderName): Promise<string[]> {
  const s = store.store
  const providerCfg = s.providerConfigs?.[provider]

  if (provider === 'anthropic') {
    return fetchModelsViaNet(
      'https://api.anthropic.com/v1/models',
      { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' },
      (body) => (body.data || []).map((m: { id: string }) => m.id).filter((id: string) => id.startsWith('claude-')).sort().reverse()
    )
  }

  if (provider === 'openai') {
    return fetchModelsViaNet(
      'https://api.openai.com/v1/models',
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}` },
      (body) => (body.data || [])
        .map((m: { id: string }) => m.id)
        .filter((id: string) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
        .sort().reverse()
    )
  }

  if (provider === 'ollama') {
    const base = providerCfg?.baseUrl || 'http://localhost:11434'
    // Try /api/tags first (native Ollama API)
    try {
      const tagsRes = await fetchJson(`${base}/api/tags`)
      if (tagsRes && Array.isArray(tagsRes.models)) {
        return (tagsRes.models as Array<{ name: string }>).map(m => m.name).sort()
      }
    } catch { /* fall through to v1/models */ }
    // Fallback: OpenAI-compat endpoint
    return fetchModelsViaNet(
      `${base}/v1/models`, {},
      (body) => (body.data || []).map((m: { id: string }) => m.id).sort()
    )
  }

  if (provider === 'lmstudio') {
    const base = providerCfg?.baseUrl || 'http://localhost:1234'
    return fetchModelsViaNet(
      `${base}/v1/models`, {},
      (body) => (body.data || []).map((m: { id: string }) => m.id).sort()
    )
  }

  // Generic OpenAI-compatible providers (gemini, groq, mistral, ...)
  const preset = PROVIDER_PRESETS.find(p => p.id === provider)
  if (!preset) {
    // Custom provider
    const custom = (s.customProviders ?? []).find(c => c.id === provider)
    if (!custom) return []
    const authHeader = custom.apiFormat === 'anthropic'
      ? (custom.apiKey ? { 'x-api-key': custom.apiKey, 'anthropic-version': '2023-06-01' } : {})
      : (custom.apiKey ? { Authorization: `Bearer ${custom.apiKey}` } : {})
    return fetchModelsViaNet(
      `${custom.baseUrl}/models`,
      authHeader,
      (body) => (body.data || []).map((m: { id: string }) => m.id).sort()
    )
  }
  const apiKey = providerCfg?.apiKey ?? ''
  const baseUrl = providerCfg?.baseUrl || preset.baseUrl

  return fetchModelsViaNet(
    `${baseUrl}/models`,
    apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    (body) => (body.data || []).map((m: { id: string }) => m.id).sort().reverse()
  )
}

function fetchModelsViaNet(
  url: string,
  headers: Record<string, string>,
  extract: (body: Record<string, unknown>) => string[]
): Promise<string[]> {
  return new Promise((resolve) => {
    const req = net.request({ url, method: 'GET' })
    for (const [k, v] of Object.entries(headers)) {
      if (v) req.setHeader(k, v)
    }
    const chunks: Buffer[] = []
    req.on('response', res => {
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>
          resolve(extract(body))
        } catch { resolve([]) }
      })
      res.on('error', () => resolve([]))
    })
    req.on('error', () => resolve([]))
    req.end()
  })
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<Record<string, unknown>>
}
