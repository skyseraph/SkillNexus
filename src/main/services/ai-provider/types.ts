export interface AIRequestOptions {
  model: string
  systemPrompt: string
  userMessage: string
  maxTokens?: number
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
