import { ipcMain } from 'electron'
import Store from 'electron-store'
import type { AppConfig } from '../../shared/types'

const store = new Store<AppConfig>({
  defaults: {
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-6'
  }
})

// SEC-03: mask API keys before returning to renderer — renderer only needs to know if a key is set
export function registerConfigHandlers(): void {
  ipcMain.handle('config:get', () => {
    const s = store.store
    return {
      defaultProvider: s.defaultProvider,
      defaultModel: s.defaultModel,
      anthropicApiKeySet: !!s.anthropicApiKey,
      openaiApiKeySet: !!s.openaiApiKey
    }
  })

  ipcMain.handle('config:set', (_event, config: Partial<AppConfig>) => {
    const allowed: (keyof AppConfig)[] = ['defaultProvider', 'defaultModel', 'anthropicApiKey', 'openaiApiKey']
    for (const key of allowed) {
      if (!(key in config)) continue
      const value = config[key]
      store.set(key, value)

      if (key === 'anthropicApiKey' && value) {
        process.env.ANTHROPIC_API_KEY = value as string
      } else if (key === 'openaiApiKey' && value) {
        process.env.OPENAI_API_KEY = value as string
      }
    }
  })
}

export function loadApiKeysToEnv(): void {
  const s = store.store
  if (s.anthropicApiKey) process.env.ANTHROPIC_API_KEY = s.anthropicApiKey
  if (s.openaiApiKey) process.env.OPENAI_API_KEY = s.openaiApiKey
}
