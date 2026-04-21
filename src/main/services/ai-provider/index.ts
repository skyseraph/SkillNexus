import type { AIProvider } from './types'
import { AnthropicProvider } from './anthropic.provider'

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
