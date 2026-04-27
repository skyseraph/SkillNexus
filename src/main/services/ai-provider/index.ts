import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIRequestOptions, AIResponse } from './types'
import type { LLMProvider } from '../../../shared/types'

export type { AIProvider, AIRequestOptions, AIResponse } from './types'

export interface AgentTraceStep {
  turn: number
  toolName: string
  toolInput: Record<string, unknown>
  toolOutput: string
  toolError?: string
}

export const MAX_AGENT_TURNS = 10

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

/** Returns the active Anthropic client instance (initialises default if needed). */
export function getActiveClient(): Anthropic {
  if (!_client) getAIProvider() // trigger default init
  return _client!
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

export async function callWithTools(
  options: AIRequestOptions & { tools: object[] },
  toolHandler: (name: string, input: Record<string, unknown>) => Promise<{ output: string; error?: string }>,
  client?: Anthropic
): Promise<{ answer: string; trace: AgentTraceStep[]; inputTokens: number; outputTokens: number; durationMs: number }> {
  // Use provided client, or fall back to the active provider's client
  if (!client) client = getActiveClient()

  const start = Date.now()
  const trace: AgentTraceStep[] = []
  let totalInput = 0
  let totalOutput = 0

  const messages: Anthropic.MessageParam[] = options.messages
    ? (options.messages as Anthropic.MessageParam[])
    : [{ role: 'user', content: options.userMessage }]

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const response = await client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.systemPrompt,
      tools: options.tools as Anthropic.Tool[],
      messages
    })

    totalInput += response.usage.input_tokens
    totalOutput += response.usage.output_tokens

    if (response.stop_reason === 'end_turn') {
      const answer = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('')
      return { answer, trace, inputTokens: totalInput, outputTokens: totalOutput, durationMs: Date.now() - start }
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]

      // Push assistant turn
      messages.push({ role: 'assistant', content: response.content })

      // Execute all tool calls in parallel
      const results = await Promise.all(
        toolUseBlocks.map(b => toolHandler(b.name, b.input as Record<string, unknown>))
      )

      // Record trace
      toolUseBlocks.forEach((b, i) => {
        trace.push({
          turn,
          toolName: b.name,
          toolInput: b.input as Record<string, unknown>,
          toolOutput: results[i].output,
          toolError: results[i].error
        })
      })

      // Push tool results
      messages.push({
        role: 'user',
        content: toolUseBlocks.map((b, i) => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: results[i].error
            ? `Error: ${results[i].error}\n${results[i].output}`
            : results[i].output
        }))
      })
      continue
    }

    // Unexpected stop reason — extract any text and return
    const answer = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
    return { answer, trace, inputTokens: totalInput, outputTokens: totalOutput, durationMs: Date.now() - start }
  }

  // MAX_AGENT_TURNS exceeded
  return {
    answer: '[Agent stopped: max turns reached]',
    trace,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    durationMs: Date.now() - start
  }
}
