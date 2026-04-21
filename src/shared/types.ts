export type SkillType = 'single' | 'agent'

export interface Skill {
  id: string
  name: string
  format: string
  version: string
  tags: string[]
  yamlFrontmatter: string
  markdownContent: string
  filePath: string       // entry .md for single; main entry for agent
  rootDir: string        // same as filePath dir for single; folder root for agent
  skillType: SkillType
  installedAt: number
  updatedAt: number
}

export interface SkillFileEntry {
  name: string           // display name
  path: string           // absolute path
  relativePath: string   // relative to rootDir
  isDir: boolean
  ext: string            // '', '.md', '.py', '.ts', etc.
  size: number
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

export interface ToolTarget {
  id: string
  name: string
  exportDir: string       // resolved absolute path
  exportDirDisplay: string // exportDir with home replaced by ~
  ext: string             // '.md', '.mdc'
  exists: boolean         // whether the exportDir exists on disk
  enabled: boolean        // user-controlled scan/export toggle
}

export interface ScannedSkill {
  name: string
  filePath: string
  toolId: string
  toolName: string
  alreadyInstalled: boolean
}

export interface MarketSkill {
  id: string          // repo full_name e.g. "owner/repo"
  name: string
  description: string
  stars: number
  topics: string[]
  author: string
  htmlUrl: string
  installUrl: string  // raw content URL for entry .md
  updatedAt: string
}

export type BuiltinProviderName = 'anthropic' | 'openai' | 'gemini' | 'groq' | 'mistral' | 'ollama' | 'lmstudio'
export type ProviderName = BuiltinProviderName | (string & {})

export interface ProviderPreset {
  id: ProviderName
  label: string
  baseUrl: string
  requiresKey: boolean
  keyPlaceholder: string
  keyHint: string
  modelsFallback: string[]
  isLocal: boolean
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    requiresKey: true,
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'console.anthropic.com',
    modelsFallback: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    isLocal: false
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    keyHint: 'platform.openai.com',
    modelsFallback: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    isLocal: false
  },
  {
    id: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresKey: true,
    keyPlaceholder: 'AIza...',
    keyHint: 'aistudio.google.com',
    modelsFallback: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    isLocal: false
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    keyPlaceholder: 'gsk_...',
    keyHint: 'console.groq.com',
    modelsFallback: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    isLocal: false
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    requiresKey: true,
    keyPlaceholder: '...',
    keyHint: 'console.mistral.ai',
    modelsFallback: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-7b'],
    isLocal: false
  },
  {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434',
    requiresKey: false,
    keyPlaceholder: '',
    keyHint: 'Run: ollama serve',
    modelsFallback: [],
    isLocal: true
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234',
    requiresKey: false,
    keyPlaceholder: '',
    keyHint: 'Enable local server in LM Studio',
    modelsFallback: [],
    isLocal: true
  }
]

export interface CustomProvider {
  id: string
  label: string
  baseUrl: string
  apiKey?: string
  defaultModel?: string
  apiFormat: 'openai' | 'anthropic'
}

export interface AppConfig {
  anthropicApiKey?: string
  openaiApiKey?: string
  defaultProvider: ProviderName
  defaultModel: string
  toolPaths?: Record<string, string>    // toolId -> override exportDir
  enabledTools?: Record<string, boolean> // toolId -> enabled for scan/export
  providerConfigs?: Record<string, { apiKey?: string; baseUrl?: string }>
  customProviders?: CustomProvider[]
}

// What config:get returns to the renderer (keys are masked)
export interface AppConfigPublic {
  defaultProvider: ProviderName
  defaultModel: string
  anthropicApiKeySet: boolean
  openaiApiKeySet: boolean
  providerKeySet: Record<string, boolean>
  providerBaseUrls: Record<string, string>
  customProviders: Array<Omit<CustomProvider, 'apiKey'> & { apiKeySet: boolean }>
}

export interface EvoRunResult {
  evolvedSkill: Skill
  originalJobId: string
  evolvedJobId: string
}

export interface IpcChannels {
  'skills:getAll': () => Promise<Skill[]>
  'skills:install': (filePath: string) => Promise<Skill>
  'skills:installDir': (dirPath: string) => Promise<Skill>
  'skills:uninstall': (id: string) => Promise<void>
  'skills:listFiles': (skillId: string) => Promise<SkillFileEntry[]>
  'skills:readFile': (filePath: string, skillId: string) => Promise<string>
  'skills:openDialog': (mode: 'file' | 'dir') => Promise<string | null>
  'skills:scan': () => Promise<ScannedSkill[]>
  'skills:importScanned': (filePath: string) => Promise<Skill>
  'skills:export': (skillId: string, toolId: string, mode: 'copy' | 'symlink') => Promise<void>
  'skills:getToolTargets': () => Promise<ToolTarget[]>
  'marketplace:search': (query: string) => Promise<MarketSkill[]>
  'marketplace:install': (skill: MarketSkill) => Promise<Skill>
  'eval:start': (skillId: string, testCaseIds: string[]) => Promise<string>
  'eval:history': (skillId: string) => Promise<EvalResult[]>
  'studio:generate': (prompt: string) => Promise<string>
  'studio:install': (content: string, name: string) => Promise<Skill>
  'testcases:getBySkill': (skillId: string) => Promise<TestCase[]>
  'testcases:create': (tc: Omit<TestCase, 'id' | 'createdAt'>) => Promise<TestCase>
  'testcases:delete': (id: string) => Promise<void>
  'config:get': () => Promise<AppConfigPublic>
  'config:set': (config: Partial<AppConfig>) => Promise<void>
  'config:test': (provider: ProviderName) => Promise<{ ok: boolean; error?: string }>
  'config:listModels': (provider: ProviderName) => Promise<string[]>
  'config:saveCustomProvider': (p: CustomProvider) => Promise<void>
  'config:deleteCustomProvider': (id: string) => Promise<void>
}
