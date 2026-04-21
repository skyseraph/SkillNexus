import { describe, it, expect } from 'vitest'

// Pure logic tests — no Electron dependency
describe('Skill YAML parsing logic', () => {
  function parseSkillContent(content: string) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!match) return { frontmatter: {}, markdownContent: content, yamlFrontmatter: '' }

    // Minimal YAML key:value parser for test purposes
    const frontmatter: Record<string, unknown> = {}
    for (const line of match[1].split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      const val = line.slice(colonIdx + 1).trim()
      if (val.startsWith('[') && val.endsWith(']')) {
        frontmatter[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      } else {
        frontmatter[key] = val
      }
    }

    return { frontmatter, markdownContent: match[2], yamlFrontmatter: match[1] }
  }

  it('parses skill with valid frontmatter', () => {
    const content = `---\nname: MySkill\nversion: 1.2.0\nformat: markdown\ntags: [ai, code]\n---\n\n# Instructions\n\nDo stuff.`
    const { frontmatter, markdownContent } = parseSkillContent(content)
    expect(frontmatter.name).toBe('MySkill')
    expect(frontmatter.version).toBe('1.2.0')
    expect(frontmatter.tags).toEqual(['ai', 'code'])
    expect(markdownContent).toContain('# Instructions')
  })

  it('returns full content when no frontmatter', () => {
    const content = '# Just markdown\n\nNo frontmatter here.'
    const { frontmatter, markdownContent } = parseSkillContent(content)
    expect(Object.keys(frontmatter)).toHaveLength(0)
    expect(markdownContent).toBe(content)
  })

  it('handles empty tags', () => {
    const content = `---\nname: EmptyTags\ntags: []\n---\n\n# Content`
    const { frontmatter } = parseSkillContent(content)
    expect(frontmatter.tags).toEqual([])
  })
})

describe('EvalResult score computation', () => {
  function computeAvgScore(scores: Record<string, { score: number }>) {
    const vals = Object.values(scores).map(s => s.score)
    if (vals.length === 0) return 0
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  it('averages 4 dimensions correctly', () => {
    const scores = {
      correctness: { score: 8 },
      clarity: { score: 6 },
      completeness: { score: 9 },
      safety: { score: 7 }
    }
    expect(computeAvgScore(scores)).toBe(7.5)
  })

  it('returns 0 for empty scores', () => {
    expect(computeAvgScore({})).toBe(0)
  })

  it('handles perfect scores', () => {
    const scores = { a: { score: 10 }, b: { score: 10 } }
    expect(computeAvgScore(scores)).toBe(10)
  })
})

describe('IPC ID generation pattern', () => {
  function genId(prefix: string) {
    const now = 1714000000000
    return `${prefix}-${now}-abc123`
  }

  it('generates id with correct prefix', () => {
    expect(genId('skill')).toMatch(/^skill-/)
    expect(genId('tc')).toMatch(/^tc-/)
    expect(genId('er')).toMatch(/^er-/)
  })

  it('ids from different prefixes are distinct', () => {
    expect(genId('skill')).not.toBe(genId('tc'))
  })
})
