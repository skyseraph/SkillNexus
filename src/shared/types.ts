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
  trustLevel: TrustLevel // 1=未验证，2=5D 均分≥6, 3=8D avgScore≥7, 4=用户批准
  installedAt: number
  updatedAt: number
  evolutionNotes?: string
}

export interface SkillScore5D {
  safety: number           // 0-10
  completeness: number     // 0-10
  executability: number    // 0-10
  maintainability: number  // 0-10
  costAwareness: number    // 0-10, single skill
  orchestration?: number   // 0-10, agent skill only
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
  testCaseId?: string
  testCaseName?: string
}

export interface SkillRankEntry {
  skillId: string
  skillName: string
  evalCount: number
  avgTotal: number
  // AgentSkills G1-G5
  avgCorrectness: number
  avgInstructionFollowing: number
  avgSafety: number
  avgCompleteness: number
  avgRobustness: number
  // SkillNexus S1-S3
  avgExecutability: number
  avgCostAwareness: number
  avgMaintainability: number
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
  skillType: SkillType
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

export interface GithubSkillResult {
  id: string        // owner/repo + "/" + path
  name: string      // filename without .md
  repoName: string  // owner/repo
  description: string
  stars: number
  url: string       // html_url on github.com
  rawUrl: string    // raw.githubusercontent.com URL
  tags: string[]    // repo topics
}

export interface AppConfig {
  providers: LLMProvider[]         // all saved providers (preset-derived + custom)
  activeProviderId: string         // id of the active provider
  toolPaths?: Record<string, string>
  enabledTools?: Record<string, boolean>
  githubToken?: string
  toolApiKeys?: { tavily?: string }
}

export interface AppConfigPublic {
  providers: Array<Omit<LLMProvider, 'apiKey'> & { apiKeySet: boolean }>
  activeProviderId: string
  toolApiKeysSet?: { tavily: boolean }
  githubTokenSet?: boolean
}

export interface EvalHistoryPage {
  items: EvalResult[]
  total: number
  limit: number
  offset: number
}

export interface EvalExportRecord {
  id: string
  createdAt: string
  status: 'success' | 'error'
  model: string
  provider: string
  durationMs: number
  totalScore: number
  scores: Record<string, EvalScore>
  input: string
  output: string
}

export interface EvalExport {
  skill: { id: string; name: unknown; version: unknown }
  exportedAt: string
  framework: string
  dimensions: string[]
  records: EvalExportRecord[]
}

export interface EvoRunResult {
  evolvedSkill: Skill
  originalJobId: string
  evolvedJobId: string
}

export interface EvoAnalysis {
  rootCause: string
  generalityTest: string
  regressionRisk: string
}

export type EvoPhase =
  | 'idle'
  | 'configured'
  | 'analyzing'
  | 'generating'
  | 'reviewing'
  | 'evaluating'
  | 'deciding'

export type EvoParadigm = 'evidence' | 'strategy' | 'capability'

export interface EvoSession {
  phase: EvoPhase
  selectedId: string
  paradigm: EvoParadigm
  targets: string[]
  analysisData: EvoAnalysis | null
  evolvedContent: string
  evoResult: EvoRunResult | null
  origScores: Record<string, number>
  evolvedScores: Record<string, number>
  evalProgress: number
  error: string | null
}

export interface EvoConfig {
  paradigm: EvoParadigm
  targets?: string[]
  engine?: EvolutionEngine
  maxIterations?: number
}

export type EvolutionEngine =
  | 'skvm-evidence'
  | 'skvm-strategy'
  | 'skvm-capability'
  | 'evoskill'
  | 'coevoskill'
  | 'skillx'
  | 'skillmoo'
  | 'skillclaw'
  | 'manual'
  | (string & {})  // allows plugin:{id} dynamic engine IDs

export interface PluginManifest {
  id: string
  name: string
  description: string
  version: string
  filePath: string
}

export interface EvoChainEntry {
  id: string
  name: string
  version: string
  installedAt: number
  paradigm?: string
  engine?: EvolutionEngine
  generation?: number
  avgScore?: number
  paretoScores?: Record<string, number>
  transferReport?: Record<string, number>
  evolutionNotes?: EvoAnalysis
  isRoot: boolean
}

// ─── Evo v2 result types ──────────────────────────────────────────────────────

export interface ParetoPoint {
  id: string
  label: string
  x: number  // accuracy (0-10)
  y: number  // secondary objective (normalized 0-10)
}

export interface EvoSkillResult {
  frontierIds: string[]
  bestId: string
  iterations: number
  finalAvgScore: number
}

export interface CoEvoResult {
  evolvedContent: string
  escalationLevel: 1 | 2 | 3
  rounds: number
  passedAll: boolean
}

export interface TransferReport {
  results: Record<string, number>  // modelId → pass rate (0-1)
}

export interface SkillXEntry {
  level: 1 | 2 | 3
  levelName: 'planning' | 'functional' | 'atomic'
  content: string
  sourceCount: number
}

export interface SkillXResult {
  entries: SkillXEntry[]
  evolvedSkillId: string
  evolvedContent: string
  totalSourceSamples: number
}

export interface SkillClawResult {
  sessionsAnalyzed: number
  commonFailures: string[]
  evolvedSkillId: string
  evolvedContent: string
  improvementSummary: string
}

export interface ThreeConditionResult {
  jobIdA: string           // no-skill baseline
  jobIdB: string           // current skill
  jobIdC: string           // AI-generated skill
  noSkillId: string
  generatedSkillId: string
  generatedSkillContent: string
}

export interface JobEntry {
  id: string
  type: 'eval' | 'evo'
  skillId: string
  skillName: string
  // eval fields
  totalScore?: number
  status?: 'success' | 'error'
  durationMs?: number
  testCaseName?: string
  // eval job-level aggregation (when id is a job_id)
  jobId?: string
  totalCases?: number
  successCases?: number
  failedCases?: number
  avgJobScore?: number
  // evo fields
  engine?: EvolutionEngine
  parentSkillId?: string
  parentSkillName?: string
  avgScore?: number
  parentAvgScore?: number
  evalCount?: number
  createdAt: number
}

export interface IpcChannels {
  'telemetry:track': (name: string, properties?: Record<string, unknown>) => Promise<void>
  'telemetry:getConsent': () => Promise<{ enabled: boolean; asked: boolean }>
  'telemetry:setConsent': (enabled: boolean) => Promise<void>
  'skills:getAll': () => Promise<Skill[]>
  'skills:getEvolved': () => Promise<Skill[]>
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
  'skills:setTrustLevel': (id: string, level: 1 | 2 | 3 | 4) => Promise<void>
  'skills:getUninstallInfo': (id: string) => Promise<{ evalCount: number; tcCount: number; evolvedCount: number }>
  'skills:getContent': (skillId: string) => Promise<string>
  'marketplace:search': (query: string) => Promise<MarketSkill[]>
  'marketplace:install': (skill: MarketSkill) => Promise<Skill>
  'eval:start': (skillId: string, testCaseIds: string[]) => Promise<string>
  'eval:history': (skillId: string, limit?: number, offset?: number) => Promise<EvalHistoryPage>
  'eval:getById': (evalId: string) => Promise<EvalResult | null>
  'eval:getByJobId': (jobId: string) => Promise<EvalResult[]>
  'eval:deleteByJobId': (jobId: string) => Promise<void>
  'eval:exportHistory': (skillId: string) => Promise<EvalExport>
  'eval:historyAll': () => Promise<SkillRankEntry[]>
  'eval:startThreeCondition': (skillId: string, testCaseIds: string[]) => Promise<ThreeConditionResult>
  'studio:generate': (prompt: string) => Promise<string>
  'studio:install': (content: string, name: string) => Promise<Skill>
  'testcases:getBySkill': (skillId: string) => Promise<TestCase[]>
  'testcases:create': (tc: Omit<TestCase, 'id' | 'createdAt'>) => Promise<TestCase>
  'testcases:delete': (id: string) => Promise<void>
  'testcases:generate': (skillId: string, count: number) => Promise<TestCase[]>
  'testcases:importJson': (skillId: string, items: unknown[]) => Promise<{ imported: TestCase[]; errors: string[] }>
  'evo:installAndEval': (originalSkillId: string, evolvedContent: string) => Promise<EvoRunResult>
  'evo:runEvoSkill': (config: { skillId: string; maxIterations?: number }) => Promise<EvoSkillResult>
  'evo:getParetoFrontier': (skillId: string) => Promise<ParetoPoint[]>
  'evo:runCoEvo': (config: { skillId: string; maxRounds?: number }) => Promise<CoEvoResult>
  'evo:runTransferTest': (skillId: string, models: string[]) => Promise<TransferReport>
  'evo:runSkillX': (config: { skillId: string; minScore?: number; sampleLimit?: number }) => Promise<SkillXResult>
  'evo:runSkillClaw': (config: { skillId: string; windowSize?: number }) => Promise<SkillClawResult>
  'jobs:list': (filter?: 'all' | 'eval' | 'evo') => Promise<JobEntry[]>
  'shell:openPath': (filePath: string) => Promise<void>
  'studio:evolve': (skillId: string, strategy: string) => Promise<void>
  'studio:generateFromExamples': (examples: Array<{ input: string; output: string }>, description?: string) => Promise<void>
  'studio:generateStream': (prompt: string) => Promise<void>
  'studio:extract': (conversation: string) => Promise<void>
  'studio:scoreSkill': (content: string) => Promise<SkillScore5D>
  'studio:similarSkills': (content: string) => Promise<Skill[]>
  'studio:searchGithub': (query: string) => Promise<GithubSkillResult[]>
  'studio:fetchGithubContent': (rawUrl: string) => Promise<string>
  'config:get': () => Promise<AppConfigPublic>
  'config:set': (config: Partial<AppConfig>) => Promise<void>
  'config:test': (providerId: string) => Promise<{ ok: boolean; error?: string }>
  'config:saveProvider': (p: LLMProvider) => Promise<void>
  'config:deleteProvider': (id: string) => Promise<void>
  'config:setActive': (id: string) => Promise<void>
}
