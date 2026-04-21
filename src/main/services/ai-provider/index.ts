import type { AIProvider } from './types'
import { AnthropicProvider } from './anthropic.provider'
import { OpenAICompatibleProvider } from './openai-compatible.provider'
import { AnthropicCompatibleProvider } from './anthropic-compat.provider'
import type { AppConfig, ProviderName } from '../../../shared/types'
import { PROVIDER_PRESETS } from '../../../shared/types'

export type { AIProvider, AIRequestOptions, AIResponse } from './types'

let activeProvider: AIProvider | null = null

export function getAIProvider(): AIProvider {
  if (!activeProvider) {
    activeProvider = new AnthropicProvider()
  }
  return activeProvider
}

export function setAIProvider(provider: AIProvider): void {
  activeProvider = provider
}

export function createProvider(id: ProviderName, cfg: AppConfig): AIProvider {
  if (id === 'anthropic') return new AnthropicProvider()

  const preset = PROVIDER_PRESETS.find(p => p.id === id)
  const providerCfg = cfg.providerConfigs?.[id]

  if (id === 'openai') {
    const key = process.env.OPENAI_API_KEY ?? ''
    return new OpenAICompatibleProvider('openai', preset!.baseUrl, key)
  }

  // Custom providers
  if (!preset) {
    const custom = (cfg.customProviders ?? []).find(c => c.id === id)
    if (custom) {
      const apiKey = custom.apiKey ?? ''
      if (custom.apiFormat === 'anthropic') {
        return new AnthropicCompatibleProvider(custom.label || custom.id, custom.baseUrl, apiKey)
      }
      return new OpenAICompatibleProvider(custom.label || custom.id, custom.baseUrl, apiKey)
    }
    return new AnthropicProvider()
  }

  const baseUrl = providerCfg?.baseUrl || preset.baseUrl
  const apiKey = providerCfg?.apiKey ?? ''
  return new OpenAICompatibleProvider(id, baseUrl, apiKey)
}
