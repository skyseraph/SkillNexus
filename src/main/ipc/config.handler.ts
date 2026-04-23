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
  return s.providers.find(p => p.id === s.activeProviderId) ?? s.providers[0]
}

export function registerConfigHandlers(): void {
  ipcMain.handle('config:get', (): AppConfigPublic => {
    const s = store.store
    return {
      providers: s.providers.map(p => ({ ...p, apiKey: undefined as unknown as string, apiKeySet: !!p.apiKey })),
      activeProviderId: s.activeProviderId,
      toolApiKeysSet: { tavily: !!(s.toolApiKeys?.tavily) }
    }
  })

  ipcMain.handle('config:set', (_event, config: Partial<AppConfig>) => {
    if ('toolPaths' in config) store.set('toolPaths', config.toolPaths)
    if ('enabledTools' in config) store.set('enabledTools', config.enabledTools)
    if ('toolApiKeys' in config) store.set('toolApiKeys', config.toolApiKeys)
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
