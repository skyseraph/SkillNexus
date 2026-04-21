import { describe, it, expect, vi } from 'vitest'

// Mock window.api for renderer tests
const mockApi = {
  skills: {
    getAll: vi.fn().mockResolvedValue([]),
    install: vi.fn(),
    uninstall: vi.fn()
  },
  eval: {
    start: vi.fn().mockResolvedValue('eval-123'),
    history: vi.fn().mockResolvedValue([]),
    onProgress: vi.fn().mockReturnValue(() => {})
  },
  studio: {
    generate: vi.fn().mockResolvedValue('---\nname: TestSkill\n---\n\n# Content'),
    install: vi.fn()
  },
  testcases: {
    getBySkill: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    delete: vi.fn()
  },
  config: {
    get: vi.fn().mockResolvedValue({ defaultProvider: 'anthropic', defaultModel: 'claude-sonnet-4-6' }),
    set: vi.fn()
  }
}

vi.stubGlobal('window', { api: mockApi })

describe('window.api contract', () => {
  it('skills.getAll returns array', async () => {
    const result = await window.api.skills.getAll()
    expect(Array.isArray(result)).toBe(true)
  })

  it('eval.start returns a job id string', async () => {
    const jobId = await window.api.eval.start('skill-1', ['tc-1'])
    expect(typeof jobId).toBe('string')
    expect(jobId.length).toBeGreaterThan(0)
  })

  it('eval.onProgress returns a cleanup function', () => {
    const cleanup = window.api.eval.onProgress(() => {})
    expect(typeof cleanup).toBe('function')
  })

  it('studio.generate returns skill content string', async () => {
    const content = await window.api.studio.generate('a summarizer skill')
    expect(typeof content).toBe('string')
    expect(content).toContain('---')
  })

  it('config.get returns object with defaultProvider', async () => {
    const config = await window.api.config.get()
    expect(config).toHaveProperty('defaultProvider')
    expect(['anthropic', 'openai']).toContain(config.defaultProvider)
  })
})
