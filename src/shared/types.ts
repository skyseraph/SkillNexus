export type SkillType = 'single' | 'agent'
export type TrustLevel = 1 | 2 | 3 | 4

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
  trustLevel: TrustLevel // 1=AI-generated, 2=format+safety, 3=eval-tested, 4=user-approved
  installedAt: number
  updatedAt: number
}

export interface SkillScore5D {
  safety: number           // 0-10
  completeness: number     // 0-10
  executability: number    // 0-10
  maintainability: number  // 0-10
  costAwareness: number    // 0-10
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

export interface SkillRankEntry {
  skillId: string
  skillName: string
  evalCount: number
  avgTotal: number
  avgCorrectness: number
  avgClarity: number
  avgCompleteness: number
  avgSafety: number
  trend: number[]
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

export interface ScanResult {
  skills: ScannedSkill[]
  scannedDirs: { toolName: string; dir: string; exists: boolean }[]
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

// ─── Provider system (cc-switch style) ───────────────────────────────────────

export type ProviderCategory = 'official' | 'cn_official' | 'aggregator' | 'local' | 'custom'

/** A saved provider entry (preset-derived or fully custom) */
export interface LLMProvider {
  id: string              // unique slug
  name: string
  baseUrl: string         // e.g. https://api.minimaxi.com/anthropic  (passed to Anthropic SDK baseURL)
  apiKey: string          // stored in electron-store; empty string when not set
  model: string           // e.g. MiniMax-M2.7
  category: ProviderCategory
  websiteUrl?: string
  isPreset?: boolean      // created from a built-in preset
  presetId?: string       // which preset it came from
}

export interface LLMProviderPreset {
  id: string
  name: string
  baseUrl: string
  defaultModel: string
  category: ProviderCategory
  websiteUrl?: string
  keyPlaceholder?: string
  requiresKey: boolean
}

export const LLM_PROVIDER_PRESETS: LLMProviderPreset[] = [
  // ── Official ──────────────────────────────────────────────────────────────
  { id: 'anthropic',    name: 'Anthropic',       baseUrl: 'https://api.anthropic.com',                     defaultModel: 'claude-sonnet-4-6',              category: 'official',    websiteUrl: 'https://console.anthropic.com',          keyPlaceholder: 'sk-ant-...',  requiresKey: true },
  // ── CN Official ───────────────────────────────────────────────────────────
  { id: 'minimax-cn',   name: 'MiniMax (CN)',     baseUrl: 'https://api.minimaxi.com/anthropic',            defaultModel: 'MiniMax-M2.7',                   category: 'cn_official', websiteUrl: 'https://platform.minimaxi.com',          keyPlaceholder: '',            requiresKey: true },
  { id: 'minimax-en',   name: 'MiniMax (Global)', baseUrl: 'https://api.minimax.io/anthropic',             defaultModel: 'MiniMax-M2.7',                   category: 'cn_official', websiteUrl: 'https://platform.minimax.io',            keyPlaceholder: '',            requiresKey: true },
  { id: 'deepseek',     name: 'DeepSeek',         baseUrl: 'https://api.deepseek.com/anthropic',           defaultModel: 'DeepSeek-V3.2',                  category: 'cn_official', websiteUrl: 'https://platform.deepseek.com',          keyPlaceholder: 'sk-...',      requiresKey: true },
  { id: 'kimi',         name: 'Kimi (Moonshot)',  baseUrl: 'https://api.moonshot.cn/anthropic',            defaultModel: 'kimi-k2.5',                      category: 'cn_official', websiteUrl: 'https://platform.moonshot.cn',           keyPlaceholder: 'sk-...',      requiresKey: true },
  { id: 'zhipu',        name: 'Zhipu GLM',        baseUrl: 'https://open.bigmodel.cn/api/anthropic',       defaultModel: 'glm-5',                          category: 'cn_official', websiteUrl: 'https://open.bigmodel.cn',               keyPlaceholder: '',            requiresKey: true },
  { id: 'doubao',       name: 'DouBao Seed',      baseUrl: 'https://ark.cn-beijing.volces.com/api/coding', defaultModel: 'doubao-seed-2-0-code-preview-latest', category: 'cn_official', websiteUrl: 'https://www.volcengine.com/product/doubao', keyPlaceholder: '', requiresKey: true },
  // ── Aggregators ───────────────────────────────────────────────────────────
  { id: 'siliconflow',  name: 'SiliconFlow',      baseUrl: 'https://api.siliconflow.cn',                   defaultModel: 'Pro/MiniMaxAI/MiniMax-M2.7',     category: 'aggregator',  websiteUrl: 'https://siliconflow.cn',                keyPlaceholder: 'sk-...',      requiresKey: true },
  { id: 'aihubmix',     name: 'AiHubMix',         baseUrl: 'https://aihubmix.com',                         defaultModel: 'claude-sonnet-4-6',              category: 'aggregator',  websiteUrl: 'https://aihubmix.com',                  keyPlaceholder: '',            requiresKey: true },
  { id: 'openrouter',   name: 'OpenRouter',        baseUrl: 'https://openrouter.ai/api',                   defaultModel: 'anthropic/claude-sonnet-4-6',    category: 'aggregator',  websiteUrl: 'https://openrouter.ai',                 keyPlaceholder: 'sk-or-...',   requiresKey: true },
  // ── Local ─────────────────────────────────────────────────────────────────
  { id: 'ollama',       name: 'Ollama',            baseUrl: 'http://localhost:11434',                       defaultModel: 'llama3.2',                       category: 'local',       websiteUrl: 'https://ollama.com',                    keyPlaceholder: '',            requiresKey: false },
  { id: 'lmstudio',    name: 'LM Studio',          baseUrl: 'http://localhost:1234',                        defaultModel: 'local-model',                    category: 'local',       websiteUrl: 'https://lmstudio.ai',                   keyPlaceholder: '',            requiresKey: false },
]

export interface AppConfig {
  providers: LLMProvider[]         // all saved providers (preset-derived + custom)
  activeProviderId: string         // id of the active provider
  toolPaths?: Record<string, string>
  enabledTools?: Record<string, boolean>
}

export interface AppConfigPublic {
  providers: Array<Omit<LLMProvider, 'apiKey'> & { apiKeySet: boolean }>
  activeProviderId: string
}

export interface EvoRunResult {
  evolvedSkill: Skill
  originalJobId: string
  evolvedJobId: string
}

export interface ThreeConditionResult {
  jobIdA: string           // no-skill baseline
  jobIdB: string           // current skill
  jobIdC: string           // AI-generated skill
  noSkillId: string
  generatedSkillId: string
  generatedSkillContent: string
}

export interface IpcChannels {
  'skills:getAll': () => Promise<Skill[]>
  'skills:install': (filePath: string) => Promise<Skill>
  'skills:installDir': (dirPath: string) => Promise<Skill>
  'skills:uninstall': (id: string) => Promise<void>
  'skills:listFiles': (skillId: string) => Promise<SkillFileEntry[]>
  'skills:readFile': (filePath: string, skillId: string) => Promise<string>
  'skills:openDialog': (mode: 'file' | 'dir') => Promise<string | null>
  'skills:scan': () => Promise<ScanResult>
  'skills:importScanned': (filePath: string) => Promise<Skill>
  'skills:export': (skillId: string, toolId: string, mode: 'copy' | 'symlink') => Promise<void>
  'skills:getToolTargets': () => Promise<ToolTarget[]>
  'marketplace:search': (query: string) => Promise<MarketSkill[]>
  'marketplace:install': (skill: MarketSkill) => Promise<Skill>
  'eval:start': (skillId: string, testCaseIds: string[]) => Promise<string>
  'eval:history': (skillId: string) => Promise<EvalResult[]>
  'eval:historyAll': () => Promise<SkillRankEntry[]>
  'eval:startThreeCondition': (skillId: string, testCaseIds: string[]) => Promise<ThreeConditionResult>
  'studio:generate': (prompt: string) => Promise<string>
  'studio:install': (content: string, name: string) => Promise<Skill>
  'testcases:getBySkill': (skillId: string) => Promise<TestCase[]>
  'testcases:create': (tc: Omit<TestCase, 'id' | 'createdAt'>) => Promise<TestCase>
  'testcases:delete': (id: string) => Promise<void>
  'testcases:generate': (skillId: string, count: number) => Promise<TestCase[]>
  'evo:installAndEval': (originalSkillId: string, evolvedContent: string) => Promise<EvoRunResult>
  'studio:evolve': (skillId: string, strategy: string) => Promise<void>
  'studio:generateFromExamples': (examples: Array<{ input: string; output: string }>, description?: string) => Promise<void>
  'studio:generateStream': (prompt: string) => Promise<void>
  'studio:extract': (conversation: string) => Promise<void>
  'studio:scoreSkill': (content: string) => Promise<SkillScore5D>
  'studio:similarSkills': (content: string) => Promise<Skill[]>
  'config:get': () => Promise<AppConfigPublic>
  'config:set': (config: Partial<AppConfig>) => Promise<void>
  'config:test': (providerId: string) => Promise<{ ok: boolean; error?: string }>
  'config:saveProvider': (p: LLMProvider) => Promise<void>
  'config:deleteProvider': (id: string) => Promise<void>
  'config:setActive': (id: string) => Promise<void>
}
