import { describe, it, expect, vi } from 'vitest'

// Mock window.api for renderer tests
const mockApi = {
  skills: {
    getAll: vi.fn().mockResolvedValue([]),
    install: vi.fn(),
    uninstall: vi.fn(),
    scan: vi.fn().mockResolvedValue([]),
    importScanned: vi.fn(),
    export: vi.fn().mockResolvedValue(undefined),
    getToolTargets: vi.fn().mockResolvedValue([])
  },
  marketplace: {
    search: vi.fn().mockResolvedValue([]),
    install: vi.fn()
  },
  eval: {
    start: vi.fn().mockResolvedValue('eval-123'),
    history: vi.fn().mockResolvedValue([]),
    onProgress: vi.fn().mockReturnValue(() => {})
  },
  studio: {
    generate: vi.fn().mockResolvedValue('---\nname: TestSkill\n---\n\n# Content'),
    generateStream: vi.fn().mockResolvedValue(undefined),
    install: vi.fn(),
    onChunk: vi.fn().mockReturnValue(() => {})
  },
  testcases: {
    getBySkill: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    delete: vi.fn()
  },
  config: {
    get: vi.fn().mockResolvedValue({ providers: [], activeProviderId: '' }),
    set: vi.fn(),
    test: vi.fn().mockResolvedValue({ ok: true }),
    saveProvider: vi.fn().mockResolvedValue(undefined),
    deleteProvider: vi.fn().mockResolvedValue(undefined),
    setActive: vi.fn().mockResolvedValue(undefined)
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

  it('studio.generateStream resolves (streaming returns void)', async () => {
    await expect(window.api.studio.generateStream('test')).resolves.toBeUndefined()
  })

  it('studio.onChunk returns a cleanup function', () => {
    const cleanup = window.api.studio.onChunk(() => {})
    expect(typeof cleanup).toBe('function')
  })

  it('config.get returns object with providers array and activeProviderId', async () => {
    const config = await window.api.config.get()
    expect(config).toHaveProperty('providers')
    expect(Array.isArray(config.providers)).toBe(true)
    expect(config).toHaveProperty('activeProviderId')
  })

  it('skills.scan returns array', async () => {
    const result = await window.api.skills.scan()
    expect(Array.isArray(result)).toBe(true)
  })

  it('skills.export resolves without error', async () => {
    await expect(window.api.skills.export('skill-1', 'claude-code', 'copy')).resolves.toBeUndefined()
  })

  it('skills.getToolTargets returns array', async () => {
    const targets = await window.api.skills.getToolTargets()
    expect(Array.isArray(targets)).toBe(true)
  })

  it('marketplace.search returns array', async () => {
    const results = await window.api.marketplace.search('test')
    expect(Array.isArray(results)).toBe(true)
  })
})
