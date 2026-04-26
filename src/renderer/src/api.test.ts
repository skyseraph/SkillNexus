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
    getToolTargets: vi.fn().mockResolvedValue([]),
    setTrustLevel: vi.fn().mockResolvedValue(undefined)
  },
  marketplace: {
    search: vi.fn().mockResolvedValue([]),
    install: vi.fn()
  },
  eval: {
    start: vi.fn().mockResolvedValue('eval-123'),
    history: vi.fn().mockResolvedValue([]),
    historyAll: vi.fn().mockResolvedValue([]),
    startThreeCondition: vi.fn().mockResolvedValue({ jobIdA: '', jobIdB: '', jobIdC: '', noSkillId: '', generatedSkillId: '', generatedSkillContent: '' }),
    onProgress: vi.fn().mockReturnValue(() => {})
  },
  studio: {
    generate: vi.fn().mockResolvedValue('---\nname: TestSkill\n---\n\n# Content'),
    generateStream: vi.fn().mockResolvedValue(undefined),
    evolve: vi.fn().mockResolvedValue(undefined),
    generateFromExamples: vi.fn().mockResolvedValue(undefined),
    install: vi.fn(),
    extract: vi.fn().mockResolvedValue(undefined),
    scoreSkill: vi.fn().mockResolvedValue({ safety: 8, completeness: 7, executability: 9, maintainability: 7, costAwareness: 6 }),
    similarSkills: vi.fn().mockResolvedValue([]),
    searchGithub: vi.fn().mockResolvedValue([]),
    fetchGithubContent: vi.fn().mockResolvedValue('---\nname: TestSkill\n---\n\n# Content'),
    recentEvalHistory: vi.fn().mockResolvedValue([]),
    onChunk: vi.fn().mockReturnValue(() => {})
  },
  testcases: {
    getBySkill: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    delete: vi.fn(),
    generate: vi.fn().mockResolvedValue([]),
    importJson: vi.fn().mockResolvedValue({ imported: [], errors: [] })
  },
  evo: {
    installAndEval: vi.fn().mockResolvedValue({ evolvedSkill: null, originalJobId: '', evolvedJobId: '' })
  },
  config: {
    get: vi.fn().mockResolvedValue({ providers: [], activeProviderId: '' }),
    set: vi.fn(),
    test: vi.fn().mockResolvedValue({ ok: true }),
    saveProvider: vi.fn().mockResolvedValue(undefined),
    deleteProvider: vi.fn().mockResolvedValue(undefined),
    setActive: vi.fn().mockResolvedValue(undefined)
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined)
  }
}

vi.stubGlobal('window', { api: mockApi })

describe('window.api contract', () => {
  it('skills.getAll returns array', async () => {
    const result = await window.api.skills.getAll()
    expect(Array.isArray(result)).toBe(true)
  })

  it('skills.setTrustLevel resolves', async () => {
    await expect(window.api.skills.setTrustLevel('skill-1', 4)).resolves.toBeUndefined()
  })

  it('eval.start returns a job id string', async () => {
    const jobId = await window.api.eval.start('skill-1', ['tc-1'])
    expect(typeof jobId).toBe('string')
    expect(jobId.length).toBeGreaterThan(0)
  })

  it('eval.historyAll returns array', async () => {
    const result = await window.api.eval.historyAll()
    expect(Array.isArray(result)).toBe(true)
  })

  it('eval.startThreeCondition returns result object', async () => {
    const result = await window.api.eval.startThreeCondition('skill-1', [])
    expect(result).toHaveProperty('jobIdA')
    expect(result).toHaveProperty('jobIdB')
    expect(result).toHaveProperty('jobIdC')
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

  it('studio.generateStream resolves', async () => {
    await expect(window.api.studio.generateStream('test')).resolves.toBeUndefined()
  })

  it('studio.scoreSkill returns 5D object', async () => {
    const score = await window.api.studio.scoreSkill('content')
    expect(score).toHaveProperty('safety')
    expect(score).toHaveProperty('completeness')
    expect(score).toHaveProperty('executability')
  })

  it('studio.similarSkills returns array', async () => {
    const result = await window.api.studio.similarSkills('content')
    expect(Array.isArray(result)).toBe(true)
  })

  it('studio.searchGithub returns array', async () => {
    const result = await window.api.studio.searchGithub('summarizer')
    expect(Array.isArray(result)).toBe(true)
  })

  it('studio.fetchGithubContent returns string with frontmatter', async () => {
    const content = await window.api.studio.fetchGithubContent(
      'https://raw.githubusercontent.com/owner/repo/main/skill.md'
    )
    expect(typeof content).toBe('string')
    expect(content).toContain('---')
  })

  it('studio.onChunk returns a cleanup function', () => {
    const cleanup = window.api.studio.onChunk(() => {})
    expect(typeof cleanup).toBe('function')
  })

  it('testcases.generate returns array', async () => {
    const result = await window.api.testcases.generate('skill-1', 3)
    expect(Array.isArray(result)).toBe(true)
  })

  it('evo.installAndEval returns result object', async () => {
    const result = await window.api.evo.installAndEval('skill-1', 'content')
    expect(result).toHaveProperty('evolvedSkill')
    expect(result).toHaveProperty('originalJobId')
    expect(result).toHaveProperty('evolvedJobId')
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

  it('shell.openExternal resolves', async () => {
    await expect(window.api.shell.openExternal('https://example.com')).resolves.toBeUndefined()
  })
})
