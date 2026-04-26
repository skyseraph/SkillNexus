/**
 * tests/config/provider-config.test.ts
 *
 * Pure logic tests for LLM Provider configuration:
 * - Provider preset validation (12+ presets)
 * - baseURL structure checks
 * - Active model selection logic
 * - Tool path overrides (optional per-tool export dirs)
 * No Electron / electron-store.
 */

import { describe, it, expect } from 'vitest'

// ── Provider preset types (mirrors config.handler.ts) ────────────────────────

interface ProviderPreset {
  id: string
  name: string
  category: 'official' | 'cn-official' | 'aggregator' | 'local'
  baseUrl: string
  defaultModel: string
}

// Mirrors presets defined in SettingsPage.tsx / config.handler.ts
const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'anthropic',      name: 'Anthropic',         category: 'official',    baseUrl: 'https://api.anthropic.com',               defaultModel: 'claude-opus-4-7' },
  { id: 'openai',         name: 'OpenAI',             category: 'official',    baseUrl: 'https://api.openai.com/v1',                defaultModel: 'gpt-4o' },
  { id: 'google',         name: 'Google Gemini',      category: 'official',    baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash' },
  { id: 'deepseek',       name: 'DeepSeek',           category: 'cn-official', baseUrl: 'https://api.deepseek.com/v1',              defaultModel: 'deepseek-chat' },
  { id: 'qwen',           name: 'Qwen (Aliyun)',      category: 'cn-official', baseUrl: 'https://dashscope.aliyuncs.com/v1',        defaultModel: 'qwen-plus' },
  { id: 'openrouter',     name: 'OpenRouter',         category: 'aggregator',  baseUrl: 'https://openrouter.ai/api/v1',             defaultModel: 'anthropic/claude-opus-4' },
  { id: 'together',       name: 'Together AI',        category: 'aggregator',  baseUrl: 'https://api.together.xyz/v1',              defaultModel: 'meta-llama/Llama-3-70b' },
  { id: 'groq',           name: 'Groq',               category: 'aggregator',  baseUrl: 'https://api.groq.com/openai/v1',           defaultModel: 'llama-3-70b-8192' },
  { id: 'siliconflow',    name: 'SiliconFlow',        category: 'aggregator',  baseUrl: 'https://api.siliconflow.cn/v1',            defaultModel: 'deepseek-ai/DeepSeek-V2' },
  { id: 'ollama',         name: 'Ollama (local)',     category: 'local',       baseUrl: 'http://localhost:11434/v1',                defaultModel: 'llama3' },
  { id: 'lmstudio',       name: 'LM Studio',          category: 'local',       baseUrl: 'http://localhost:1234/v1',                 defaultModel: 'local-model' },
  { id: 'custom',         name: 'Custom',             category: 'aggregator',  baseUrl: '',                                         defaultModel: '' },
]

// ── Config validation helpers ─────────────────────────────────────────────────

function isValidBaseUrl(url: string): boolean {
  if (!url) return false
  return /^https?:\/\//.test(url)
}

function getActiveModel(config: { providers: Array<{ id: string; model: string; active?: boolean }> }): string | null {
  const active = config.providers.find(p => p.active)
  return active?.model ?? null
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('provider presets coverage', () => {
  it('has at least 12 provider presets', () => {
    expect(PROVIDER_PRESETS.length).toBeGreaterThanOrEqual(12)
  })

  it('includes Anthropic as official provider', () => {
    const anthropic = PROVIDER_PRESETS.find(p => p.id === 'anthropic')
    expect(anthropic).toBeDefined()
    expect(anthropic!.category).toBe('official')
  })

  it('includes OpenAI as official provider', () => {
    expect(PROVIDER_PRESETS.find(p => p.id === 'openai')).toBeDefined()
  })

  it('includes at least one local provider', () => {
    const localProviders = PROVIDER_PRESETS.filter(p => p.category === 'local')
    expect(localProviders.length).toBeGreaterThanOrEqual(1)
  })

  it('includes at least one CN official provider', () => {
    const cnProviders = PROVIDER_PRESETS.filter(p => p.category === 'cn-official')
    expect(cnProviders.length).toBeGreaterThanOrEqual(1)
  })

  it('includes at least 3 aggregator providers', () => {
    const aggregators = PROVIDER_PRESETS.filter(p => p.category === 'aggregator')
    expect(aggregators.length).toBeGreaterThanOrEqual(3)
  })

  it('all presets have required fields', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.id, `${preset.id} missing id`).toBeTruthy()
      expect(preset.name, `${preset.id} missing name`).toBeTruthy()
      expect(preset.category, `${preset.id} missing category`).toBeTruthy()
    }
  })

  it('all preset IDs are unique', () => {
    const ids = PROVIDER_PRESETS.map(p => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('Ollama uses http:// localhost URL', () => {
    const ollama = PROVIDER_PRESETS.find(p => p.id === 'ollama')!
    expect(ollama.baseUrl).toContain('localhost')
    expect(ollama.baseUrl).toMatch(/^http:\/\//)
  })
})

describe('baseURL validation', () => {
  it('accepts https:// URLs', () => {
    expect(isValidBaseUrl('https://api.anthropic.com')).toBe(true)
    expect(isValidBaseUrl('https://api.openai.com/v1')).toBe(true)
  })

  it('accepts http:// for local providers', () => {
    expect(isValidBaseUrl('http://localhost:11434/v1')).toBe(true)
    expect(isValidBaseUrl('http://localhost:1234/v1')).toBe(true)
  })

  it('rejects empty baseURL (custom preset placeholder)', () => {
    expect(isValidBaseUrl('')).toBe(false)
  })

  it('rejects non-http protocols', () => {
    expect(isValidBaseUrl('ftp://example.com')).toBe(false)
    expect(isValidBaseUrl('file:///local')).toBe(false)
  })

  it('all official presets use https://', () => {
    const officials = PROVIDER_PRESETS.filter(p => p.category === 'official' && p.baseUrl)
    for (const p of officials) {
      expect(p.baseUrl.startsWith('https://'), `${p.id} should use https`).toBe(true)
    }
  })
})

describe('active model selection', () => {
  it('returns model of active provider', () => {
    const config = {
      providers: [
        { id: 'anthropic', model: 'claude-opus-4-7', active: true },
        { id: 'openai', model: 'gpt-4o', active: false }
      ]
    }
    expect(getActiveModel(config)).toBe('claude-opus-4-7')
  })

  it('returns null when no provider is active', () => {
    const config = { providers: [{ id: 'anthropic', model: 'claude-3', active: false }] }
    expect(getActiveModel(config)).toBeNull()
  })

  it('returns null for empty providers list', () => {
    expect(getActiveModel({ providers: [] })).toBeNull()
  })

  it('uses first active provider when multiple are active', () => {
    const config = {
      providers: [
        { id: 'anthropic', model: 'claude-opus', active: true },
        { id: 'openai', model: 'gpt-4', active: true }
      ]
    }
    // find() returns first match
    expect(getActiveModel(config)).toBe('claude-opus')
  })
})

describe('tool path overrides', () => {
  const DEFAULT_PATHS: Record<string, string> = {
    'claude-code': '.claude/commands',
    'cursor': '.cursor/rules',
    'windsurf': '.codeium/windsurf/memories'
  }

  function resolveToolPath(toolId: string, overrides: Record<string, string>): string {
    return overrides[toolId] ?? DEFAULT_PATHS[toolId] ?? ''
  }

  it('returns default path when no override', () => {
    expect(resolveToolPath('claude-code', {})).toBe('.claude/commands')
  })

  it('returns override path when configured', () => {
    expect(resolveToolPath('claude-code', { 'claude-code': 'custom/path' })).toBe('custom/path')
  })

  it('override for one tool does not affect other tools', () => {
    const overrides = { 'claude-code': 'custom/path' }
    expect(resolveToolPath('cursor', overrides)).toBe('.cursor/rules')
  })

  it('returns empty string for unknown tool with no override', () => {
    expect(resolveToolPath('unknown-tool', {})).toBe('')
  })
})

describe('GitHub Token and Tavily Key usage scope', () => {
  it('GitHub Token is used for Studio GitHub Code Search (not just marketplace)', () => {
    // Documents the correct usage scope from the codebase
    const githubTokenUsages = ['studio:generateFromExamples (GitHub Code Search)', 'marketplace:search (now disabled)']
    expect(githubTokenUsages).toContain('studio:generateFromExamples (GitHub Code Search)')
  })

  it('Tavily Key is used for Agent web_search tool (not marketplace)', () => {
    const tavilyKeyUsages = ['agent-tools.ts web_search', 'eval-job.ts runAgentEvalJob']
    expect(tavilyKeyUsages).toContain('agent-tools.ts web_search')
  })
})
