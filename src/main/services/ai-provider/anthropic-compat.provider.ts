import type { AIProvider, AIRequestOptions, AIResponse } from './types'

export class AnthropicCompatibleProvider implements AIProvider {
  name: string
  private baseUrl: string
  private apiKey: string

  constructor(name: string, baseUrl: string, apiKey: string) {
    this.name = name
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
  }

  isAvailable(): boolean {
    return !!this.baseUrl
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(this.apiKey ? { 'x-api-key': this.apiKey } : {})
    }
  }

  async call(options: AIRequestOptions): Promise<AIResponse> {
    const start = Date.now()
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: options.userMessage }]
      })
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${this.name} API error ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>
      usage?: { input_tokens: number; output_tokens: number }
    }

    const content = (data.content ?? [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    return {
      content,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      durationMs: Date.now() - start
    }
  }

  async stream(options: AIRequestOptions, onChunk: (chunk: string) => void): Promise<AIResponse> {
    const start = Date.now()
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: options.userMessage }]
      })
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${this.name} API error ${res.status}: ${text}`)
    }

    if (!res.body) throw new Error('No response body')

    let fullContent = ''
    let inputTokens = 0
    let outputTokens = 0
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const parsed = JSON.parse(line.slice(6)) as {
            type: string
            delta?: { type: string; text?: string }
            message?: { usage: { input_tokens: number } }
            usage?: { output_tokens: number }
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
            fullContent += parsed.delta.text
            onChunk(parsed.delta.text)
          } else if (parsed.type === 'message_start' && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens
          } else if (parsed.type === 'message_delta' && parsed.usage) {
            outputTokens = parsed.usage.output_tokens
          }
        } catch { /* skip malformed */ }
      }
    }

    return { content: fullContent, inputTokens, outputTokens, durationMs: Date.now() - start }
  }
}
