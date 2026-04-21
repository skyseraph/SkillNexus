import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIRequestOptions, AIResponse } from './types'

export class AnthropicProvider implements AIProvider {
  name = 'anthropic'
  private client: Anthropic | null = null
  private currentKey: string | undefined = undefined

  private getClient(): Anthropic {
    const key = process.env.ANTHROPIC_API_KEY
    // Refresh client if key changed
    if (!this.client || key !== this.currentKey) {
      this.client = new Anthropic({ apiKey: key })
      this.currentKey = key
    }
    return this.client
  }

  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY
  }

  async call(options: AIRequestOptions): Promise<AIResponse> {
    const start = Date.now()
    const client = this.getClient()

    const msg = await client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: options.userMessage }]
    })

    const content = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    return {
      content,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      durationMs: Date.now() - start
    }
  }

  async stream(
    options: AIRequestOptions,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    const start = Date.now()
    const client = this.getClient()

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
        const chunk = event.delta.text
        fullContent += chunk
        onChunk(chunk)
      } else if (event.type === 'message_start') {
        inputTokens = event.message.usage.input_tokens
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage.output_tokens
      }
    }

    return {
      content: fullContent,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start
    }
  }
}
