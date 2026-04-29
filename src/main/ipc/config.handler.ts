import { ipcMain } from 'electron'
import Store from 'electron-store'
import type { AppConfig, AppConfigPublic, LLMProvider } from '../../shared/types'
import { setActiveProvider, getAIProvider } from '../services/ai-provider'

const store = new Store<AppConfig>({
  defaults: {
    providers: [],
    activeProviderId: ''
  }
})

function getActiveProvider(): LLMProvider | undefined {
  const s = store.store
  const providers = s.providers ?? []
  return providers.find(p => p.id === s.activeProviderId) ?? providers[0]
}

export function registerConfigHandlers(): void {
  ipcMain.handle('config:get', (): AppConfigPublic => {
    const s = store.store
    return {
      providers: (s.providers ?? []).map(p => ({ ...p, apiKey: undefined as unknown as string, apiKeySet: !!p.apiKey })),
      activeProviderId: s.activeProviderId,
      toolApiKeysSet: { tavily: !!(s.toolApiKeys?.tavily) },
      githubTokenSet: !!(s.githubToken),
      language: s.language ?? 'zh'
    }
  })

type ConfigSetPayload = Pick<AppConfig, 'toolPaths' | 'enabledTools' | 'toolApiKeys' | 'githubToken' | 'language'>

  ipcMain.handle('config:set', (_event, config: Partial<ConfigSetPayload>) => {
    if ('toolPaths' in config) store.set('toolPaths', config.toolPaths)
    if ('enabledTools' in config) store.set('enabledTools', config.enabledTools)
    if ('toolApiKeys' in config) store.set('toolApiKeys', config.toolApiKeys)
    if ('githubToken' in config) store.set('githubToken', config.githubToken)
    if ('language' in config) store.set('language', config.language)
  })

  ipcMain.handle('config:saveProvider', (_event, p: LLMProvider) => {
    const providers = [...(store.get('providers') ?? [])]
    const idx = providers.findIndex(x => x.id === p.id)
    if (idx >= 0) {
      // Preserve existing apiKey if new one is blank
      providers[idx] = { ...providers[idx], ...p, apiKey: p.apiKey || providers[idx].apiKey }
    } else {
      providers.push(p)
    }
    store.set('providers', providers)
    // If this is now the active provider, re-init
    if (store.get('activeProviderId') === p.id || !store.get('activeProviderId')) {
      const saved = providers.find(x => x.id === p.id)!
      setActiveProvider(saved)
    }
  })

  ipcMain.handle('config:deleteProvider', (_event, id: string) => {
    const providers = (store.get('providers') ?? []).filter(p => p.id !== id)
    store.set('providers', providers)
    // If deleted the active one, fall back to first
    if (store.get('activeProviderId') === id) {
      const next = providers[0]
      store.set('activeProviderId', next?.id ?? '')
      if (next) setActiveProvider(next)
    }
  })

  ipcMain.handle('config:setActive', (_event, id: string) => {
    const providers = store.get('providers') ?? []
    const p = providers.find(x => x.id === id)
    if (!p) return
    store.set('activeProviderId', id)
    setActiveProvider(p)
  })

  ipcMain.handle('config:test', async (_event, providerId: string) => {
    try {
      const providers = store.get('providers') ?? []
      const p = providers.find(x => x.id === providerId)
      if (!p) throw new Error('Provider not found')
      setActiveProvider(p)
      await getAIProvider().call({
        model: p.model,
        systemPrompt: 'Reply with exactly: ok',
        userMessage: 'ping',
        maxTokens: 10
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('config:fetchModels', async (_event, baseUrl: string, apiFormat: 'anthropic' | 'openai', apiKey?: string) => {
    const base = baseUrl.replace(/\/$/, '')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    // Ollama exposes /api/tags; OpenAI-compat exposes /v1/models
    const isOllama = base.includes('11434') || base.toLowerCase().includes('ollama')
    const url = isOllama ? `${base}/api/tags` : `${base}/v1/models`

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json() as Record<string, unknown>

    // Ollama: { models: [{ name, model }] }
    // OpenAI-compat: { data: [{ id }] }
    if (isOllama && Array.isArray(json.models)) {
      return (json.models as Array<{ name?: string; model?: string }>).map(m => m.model ?? m.name ?? '').filter(Boolean)
    }
    if (Array.isArray(json.data)) {
      return (json.data as Array<{ id?: string }>).map(m => m.id ?? '').filter(Boolean)
    }
    throw new Error('Unexpected response format')
  })
}

export function loadApiKeysToEnv(): void {
  const active = getActiveProvider()
  if (active) setActiveProvider(active)
}

export function getConfig(): AppConfig {
  return store.store
}

export function getActiveModel(): string {
  return getActiveProvider()?.model ?? 'claude-sonnet-4-6'
}

export function getActiveProviderName(): string {
  return getActiveProvider()?.name ?? 'anthropic'
}

export function getToolApiKeys(): { tavily?: string } {
  return store.get('toolApiKeys') ?? {}
}

export function getLanguage(): 'zh' | 'en' {
  return store.get('language') ?? 'zh'
}
