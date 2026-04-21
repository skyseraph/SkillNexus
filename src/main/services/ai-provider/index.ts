import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIRequestOptions, AIResponse } from './types'
import type { LLMProvider } from '../../../shared/types'

export type { AIProvider, AIRequestOptions, AIResponse } from './types'

// Single active provider instance
let _client: Anthropic | null = null
let _provider: LLMProvider | null = null

export function setActiveProvider(provider: LLMProvider): void {
  _provider = provider
  _client = new Anthropic({
    apiKey: provider.apiKey || 'no-key',
    baseURL: provider.baseUrl || undefined
  })
}

export function getAIProvider(): AIProvider {
  if (!_client || !_provider) {
    // Default fallback
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? 'no-key' })
    _provider = {
      id: 'anthropic-default', name: 'Anthropic', baseUrl: '',
      apiKey: process.env.ANTHROPIC_API_KEY ?? '', model: 'claude-sonnet-4-6',
      category: 'official'
    }
  }
  const client = _client
  const provider = _provider
  return {
    name: provider.name,
    isAvailable: () => !!provider.apiKey || !provider.baseUrl.includes('api.anthropic.com'),
    call: (opts: AIRequestOptions) => callAnthropicSdk(client, opts),
    stream: (opts: AIRequestOptions, onChunk: (c: string) => void) => streamAnthropicSdk(client, opts, onChunk)
  }
}

async function callAnthropicSdk(client: Anthropic, options: AIRequestOptions): Promise<AIResponse> {
  const start = Date.now()
  const msg = await client.messages.create({
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    system: options.systemPrompt,
    messages: [{ role: 'user', content: options.userMessage }]
  })
  const content = msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
  return {
    content,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
    durationMs: Date.now() - start
  }
}

async function streamAnthropicSdk(
  client: Anthropic,
  options: AIRequestOptions,
  onChunk: (chunk: string) => void
): Promise<AIResponse> {
  const start = Date.now()
  let fullContent = ''
  let inputTokens = 0
  let outputTokens = 0
  const stream = await client.messages.create({
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    system: options.systemPrompt,
    messages: [{ role: 'user', content: options.userMessage }],
    stream: true
  })
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullContent += event.delta.text
      onChunk(event.delta.text)
    } else if (event.type === 'message_start') {
      inputTokens = event.message.usage.input_tokens
    } else if (event.type === 'message_delta') {
      outputTokens = event.usage.output_tokens
    }
  }
  return { content: fullContent, inputTokens, outputTokens, durationMs: Date.now() - start }
}
