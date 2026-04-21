import type { AIProvider, AIRequestOptions, AIResponse } from './types'

export class OpenAICompatibleProvider implements AIProvider {
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
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`
    return h
  }

  async call(options: AIRequestOptions): Promise<AIResponse> {
    const start = Date.now()
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userMessage }
        ]
      })
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${this.name} API error ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

    return {
      content: data.choices[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      durationMs: Date.now() - start
    }
  }

  async stream(options: AIRequestOptions, onChunk: (chunk: string) => void): Promise<AIResponse> {
    const start = Date.now()
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userMessage }
        ]
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
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data) as {
            choices: Array<{ delta: { content?: string } }>
            usage?: { prompt_tokens: number; completion_tokens: number }
          }
          const chunk = parsed.choices[0]?.delta?.content ?? ''
          if (chunk) { fullContent += chunk; onChunk(chunk) }
          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens
            outputTokens = parsed.usage.completion_tokens
          }
        } catch { /* skip malformed SSE line */ }
      }
    }

    return { content: fullContent, inputTokens, outputTokens, durationMs: Date.now() - start }
  }
}
