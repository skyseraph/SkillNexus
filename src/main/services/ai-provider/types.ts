export interface AIMessage {
  role: 'user' | 'assistant'
  content: unknown  // string or Anthropic content block array
}

export interface AIRequestOptions {
  model: string
  systemPrompt: string
  userMessage: string
  maxTokens?: number
  tools?: object[]       // Anthropic tool definitions
  messages?: AIMessage[] // multi-turn history (overrides userMessage when provided)
}

export interface AIResponse {
  content: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}

export interface AIProvider {
  name: string
  call(options: AIRequestOptions): Promise<AIResponse>
  stream(options: AIRequestOptions, onChunk: (chunk: string) => void): Promise<AIResponse>
  isAvailable(): boolean
}
