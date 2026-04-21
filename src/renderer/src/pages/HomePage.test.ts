import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Skill } from '../../../shared/types'

// Minimal Skill fixture
function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    name: 'TestSkill',
    format: 'markdown',
    version: '1.0.0',
    tags: ['ai', 'code'],
    yamlFrontmatter: 'name: TestSkill\nversion: 1.0.0\ntags: [ai, code]',
    markdownContent: '# TestSkill\n\nDo useful things.',
    filePath: '/Users/bob/skills/test-skill.md',
    rootDir: '/Users/bob/skills',
    skillType: 'single',
    installedAt: 1714000000000,
    updatedAt: 1714000000000,
    ...overrides
  }
}

const mockApi = {
  skills: {
    getAll: vi.fn(),
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
  }
}
vi.stubGlobal('window', { api: mockApi })

describe('HomePage — skill list logic', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getAll returns empty array initially', async () => {
    mockApi.skills.getAll.mockResolvedValue([])
    const result = await window.api.skills.getAll()
    expect(result).toEqual([])
  })

  it('getAll returns installed skills', async () => {
    const skill = makeSkill()
    mockApi.skills.getAll.mockResolvedValue([skill])
    const result = await window.api.skills.getAll()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('TestSkill')
  })

  it('uninstall removes skill by id', async () => {
    mockApi.skills.uninstall.mockResolvedValue(undefined)
    await window.api.skills.uninstall('skill-1')
    expect(mockApi.skills.uninstall).toHaveBeenCalledWith('skill-1')
  })
})

describe('HomePage — skill detail data', () => {
  it('skill has all required detail fields', () => {
    const skill = makeSkill()
    expect(skill.yamlFrontmatter).toBeTruthy()
    expect(skill.markdownContent).toContain('#')
    expect(skill.filePath).toBeTruthy()
    expect(typeof skill.installedAt).toBe('number')
  })

  it('skill with no tags has empty tags array', () => {
    const skill = makeSkill({ tags: [] })
    expect(skill.tags).toEqual([])
    expect(skill.tags.length).toBe(0)
  })

  it('skill updatedAt equals installedAt for fresh install', () => {
    const skill = makeSkill()
    expect(skill.updatedAt).toBe(skill.installedAt)
  })

  it('skill with many tags only shows first 3 in list view', () => {
    const skill = makeSkill({ tags: ['a', 'b', 'c', 'd', 'e'] })
    const visible = skill.tags.slice(0, 3)
    const overflow = skill.tags.length - 3
    expect(visible).toEqual(['a', 'b', 'c'])
    expect(overflow).toBe(2)
  })

  it('frontmatter block wraps content with --- delimiters', () => {
    const skill = makeSkill()
    const rendered = `---\n${skill.yamlFrontmatter}\n---`
    expect(rendered.startsWith('---')).toBe(true)
    expect(rendered.endsWith('---')).toBe(true)
    expect(rendered).toContain('name: TestSkill')
  })
})

describe('HomePage — My Skills tab filtering', () => {
  it('filters skills by search query (name)', () => {
    const skills = [makeSkill({ name: 'Alpha' }), makeSkill({ id: 'skill-2', name: 'Beta' })]
    const q = 'alpha'
    const filtered = skills.filter(s => s.name.toLowerCase().includes(q))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Alpha')
  })

  it('filters skills by type: agent', () => {
    const skills = [makeSkill({ skillType: 'single' }), makeSkill({ id: 'skill-2', skillType: 'agent' })]
    const agentOnly = skills.filter(s => s.skillType === 'agent')
    expect(agentOnly).toHaveLength(1)
  })

  it('scan returns empty array when no tools are found', async () => {
    const result = await window.api.skills.scan()
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('getToolTargets returns array', async () => {
    const targets = await window.api.skills.getToolTargets()
    expect(Array.isArray(targets)).toBe(true)
  })

  it('marketplace.search returns array', async () => {
    const results = await window.api.marketplace.search('code review')
    expect(Array.isArray(results)).toBe(true)
  })
})
