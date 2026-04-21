export interface Skill {
  id: string
  name: string
  format: string
  version: string
  tags: string[]
  yamlFrontmatter: string
  markdownContent: string
  filePath: string
  installedAt: number
  updatedAt: number
}

export interface TestCase {
  id: string
  skillId: string
  name: string
  input: string
  judgeType: 'grep' | 'llm' | 'command'
  judgeParam: string
  createdAt: number
}

export interface EvalScore {
  score: number
  violations: string[]
  details: string
}

export interface EvalResult {
  id: string
  skillId: string
  model: string
  provider: string
  inputPrompt: string
  output: string
  scores: Record<string, EvalScore>
  totalScore: number
  durationMs: number
  status: 'success' | 'error'
  createdAt: number
}

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

export interface AppConfig {
  anthropicApiKey?: string
  openaiApiKey?: string
  defaultProvider: 'anthropic' | 'openai'
  defaultModel: string
}

// What config:get returns to the renderer (keys are masked)
export interface AppConfigPublic {
  defaultProvider: 'anthropic' | 'openai'
  defaultModel: string
  anthropicApiKeySet: boolean
  openaiApiKeySet: boolean
}

export interface IpcChannels {
  'skills:getAll': () => Promise<Skill[]>
  'skills:install': (filePath: string) => Promise<Skill>
  'skills:uninstall': (id: string) => Promise<void>
  'eval:start': (skillId: string, testCaseIds: string[]) => Promise<string>
  'eval:history': (skillId: string) => Promise<EvalResult[]>
  'studio:generate': (prompt: string) => Promise<string>
  'studio:install': (content: string, name: string) => Promise<Skill>
  'testcases:getBySkill': (skillId: string) => Promise<TestCase[]>
  'testcases:create': (tc: Omit<TestCase, 'id' | 'createdAt'>) => Promise<TestCase>
  'testcases:delete': (id: string) => Promise<void>
  'config:get': () => Promise<AppConfigPublic>
  'config:set': (config: Partial<AppConfig>) => Promise<void>
}
