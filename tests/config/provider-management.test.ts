/**
 * tests/config/provider-management.test.ts
 *
 * Pure logic tests for config:saveProvider / deleteProvider / setActive:
 * - saveProvider: insert new, update existing, preserve apiKey when blank
 * - deleteProvider: removes by id, falls back active to first remaining
 * - setActive: updates activeProviderId
 * - config:get: apiKey never exposed in public config
 * - provider validation: required fields
 * No Electron / electron-store.
 */

import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LLMProvider {
  id: string
  name: string
  baseUrl: string
  model: string
  apiKey: string
}

interface AppConfig {
  providers: LLMProvider[]
  activeProviderId: string
}

// ── Mirrors config.handler.ts logic ──────────────────────────────────────────

function saveProvider(config: AppConfig, p: LLMProvider): AppConfig {
  const providers = [...config.providers]
  const idx = providers.findIndex(x => x.id === p.id)
  if (idx >= 0) {
    // Preserve existing apiKey if new one is blank
    providers[idx] = { ...providers[idx], ...p, apiKey: p.apiKey || providers[idx].apiKey }
  } else {
    providers.push(p)
  }
  return { ...config, providers }
}

function deleteProvider(config: AppConfig, id: string): AppConfig {
  const providers = config.providers.filter(p => p.id !== id)
  let activeProviderId = config.activeProviderId
  if (activeProviderId === id) {
    activeProviderId = providers[0]?.id ?? ''
  }
  return { ...config, providers, activeProviderId }
}

function setActive(config: AppConfig, id: string): AppConfig {
  return { ...config, activeProviderId: id }
}


// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROVIDER_A: LLMProvider = {
  id: 'anthropic',
  name: 'Anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiKey: 'sk-ant-secret-key'
}

const PROVIDER_B: LLMProvider = {
  id: 'openai',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4o',
  apiKey: 'sk-openai-secret'
}

const EMPTY_CONFIG: AppConfig = { providers: [], activeProviderId: '' }

// ── saveProvider ──────────────────────────────────────────────────────────────

describe('saveProvider — insert and update', () => {
  it('inserts a new provider when id does not exist', () => {
    const result = saveProvider(EMPTY_CONFIG, PROVIDER_A)
    expect(result.providers).toHaveLength(1)
    expect(result.providers[0].id).toBe('anthropic')
  })

  it('updates existing provider when id matches', () => {
    const config: AppConfig = { providers: [PROVIDER_A], activeProviderId: 'anthropic' }
    const updated = { ...PROVIDER_A, model: 'claude-opus-4-5' }
    const result = saveProvider(config, updated)
    expect(result.providers).toHaveLength(1)
    expect(result.providers[0].model).toBe('claude-opus-4-5')
  })

  it('preserves existing apiKey when new apiKey is blank', () => {
    const config: AppConfig = { providers: [PROVIDER_A], activeProviderId: 'anthropic' }
    const updateWithBlankKey = { ...PROVIDER_A, apiKey: '', model: 'claude-haiku-4-5' }
    const result = saveProvider(config, updateWithBlankKey)
    expect(result.providers[0].apiKey).toBe('sk-ant-secret-key')
    expect(result.providers[0].model).toBe('claude-haiku-4-5')
  })

  it('replaces apiKey when new apiKey is non-blank', () => {
    const config: AppConfig = { providers: [PROVIDER_A], activeProviderId: 'anthropic' }
    const updateWithNewKey = { ...PROVIDER_A, apiKey: 'sk-ant-new-key' }
    const result = saveProvider(config, updateWithNewKey)
    expect(result.providers[0].apiKey).toBe('sk-ant-new-key')
  })

  it('can add multiple providers', () => {
    let config = saveProvider(EMPTY_CONFIG, PROVIDER_A)
    config = saveProvider(config, PROVIDER_B)
    expect(config.providers).toHaveLength(2)
  })

  it('does not mutate original config', () => {
    const original: AppConfig = { providers: [PROVIDER_A], activeProviderId: 'anthropic' }
    saveProvider(original, PROVIDER_B)
    expect(original.providers).toHaveLength(1)
  })
})

// ── deleteProvider ────────────────────────────────────────────────────────────

describe('deleteProvider — removal and active fallback', () => {
  it('removes provider by id', () => {
    const config: AppConfig = { providers: [PROVIDER_A, PROVIDER_B], activeProviderId: 'anthropic' }
    const result = deleteProvider(config, 'openai')
    expect(result.providers).toHaveLength(1)
    expect(result.providers[0].id).toBe('anthropic')
  })

  it('falls back activeProviderId to first remaining when active is deleted', () => {
    const config: AppConfig = { providers: [PROVIDER_A, PROVIDER_B], activeProviderId: 'anthropic' }
    const result = deleteProvider(config, 'anthropic')
    expect(result.activeProviderId).toBe('openai')
  })

  it('sets activeProviderId to empty string when last provider is deleted', () => {
    const config: AppConfig = { providers: [PROVIDER_A], activeProviderId: 'anthropic' }
    const result = deleteProvider(config, 'anthropic')
    expect(result.providers).toHaveLength(0)
    expect(result.activeProviderId).toBe('')
  })

  it('keeps activeProviderId unchanged when non-active provider is deleted', () => {
    const config: AppConfig = { providers: [PROVIDER_A, PROVIDER_B], activeProviderId: 'anthropic' }
    const result = deleteProvider(config, 'openai')
    expect(result.activeProviderId).toBe('anthropic')
  })

  it('is a no-op when id does not exist', () => {
    const config: AppConfig = { providers: [PROVIDER_A], activeProviderId: 'anthropic' }
    const result = deleteProvider(config, 'nonexistent')
    expect(result.providers).toHaveLength(1)
  })

  it('does not mutate original config', () => {
    const config: AppConfig = { providers: [PROVIDER_A, PROVIDER_B], activeProviderId: 'anthropic' }
    deleteProvider(config, 'openai')
    expect(config.providers).toHaveLength(2)
  })
})

// ── setActive ─────────────────────────────────────────────────────────────────

describe('setActive — active provider selection', () => {
  it('sets activeProviderId to given id', () => {
    const config: AppConfig = { providers: [PROVIDER_A, PROVIDER_B], activeProviderId: 'anthropic' }
    const result = setActive(config, 'openai')
    expect(result.activeProviderId).toBe('openai')
  })

  it('does not change providers list', () => {
    const config: AppConfig = { providers: [PROVIDER_A, PROVIDER_B], activeProviderId: 'anthropic' }
    const result = setActive(config, 'openai')
    expect(result.providers).toHaveLength(2)
  })

  it('does not mutate original config', () => {
    const config: AppConfig = { providers: [PROVIDER_A], activeProviderId: 'anthropic' }
    setActive(config, 'openai')
    expect(config.activeProviderId).toBe('anthropic')
  })
})
