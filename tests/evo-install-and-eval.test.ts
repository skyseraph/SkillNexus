import { describe, it, expect } from 'vitest'

// Pure logic extracted from evo:installAndEval handler
// Tests the ANALYSIS block parsing, YAML frontmatter stripping, and name sanitization
// without requiring Electron/DB/filesystem dependencies.

function stripAnalysisBlock(content: string): string {
  return content.replace(/<!--ANALYSIS[\s\S]*?-->\s*/m, '')
}

function parseAnalysisBlock(content: string): { rootCause: string; generalityTest: string; regressionRisk: string } | null {
  const match = content.match(/<!--ANALYSIS\s*([\s\S]*?)-->/)
  if (!match) return null
  const body = match[1]
  const rootCause = body.match(/ROOT_CAUSE:\s*(.+)/)?.[1]?.trim() ?? ''
  const generalityTest = body.match(/GENERALITY_TEST:\s*(.+)/)?.[1]?.trim() ?? ''
  const regressionRisk = body.match(/REGRESSION_RISK:\s*(.+)/)?.[1]?.trim() ?? ''
  return { rootCause, generalityTest, regressionRisk }
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; markdownContent: string; yamlRaw: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, markdownContent: content, yamlRaw: '' }
  // minimal inline parse (mirrors what js-yaml would produce for simple keys)
  const frontmatter: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (val.startsWith('[') && val.endsWith(']')) {
      frontmatter[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    } else {
      frontmatter[key] = val
    }
  }
  return { frontmatter, markdownContent: match[2], yamlRaw: match[1] }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '-').toLowerCase() || 'evolved-skill'
}

// ── stripAnalysisBlock ────────────────────────────────────────────────────────

describe('stripAnalysisBlock', () => {
  it('removes ANALYSIS comment block from content', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: bad prompt\n-->\n# Skill\nDo stuff.`
    expect(stripAnalysisBlock(content)).toBe('# Skill\nDo stuff.')
  })

  it('leaves content unchanged when no ANALYSIS block', () => {
    const content = '# Skill\nDo stuff.'
    expect(stripAnalysisBlock(content)).toBe(content)
  })

  it('handles multiline ANALYSIS block', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: x\nGENERALITY_TEST: y\nREGRESSION_RISK: z\n-->\n# Skill`
    expect(stripAnalysisBlock(content)).toBe('# Skill')
  })

  it('only removes first ANALYSIS block', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: a\n-->\n# Skill\n<!--ANALYSIS\nROOT_CAUSE: b\n-->`
    const result = stripAnalysisBlock(content)
    expect(result).toContain('# Skill')
    expect(result).toContain('<!--ANALYSIS')  // second block remains
  })
})

// ── parseAnalysisBlock ────────────────────────────────────────────────────────

describe('parseAnalysisBlock', () => {
  it('extracts all three fields', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: vague instructions\nGENERALITY_TEST: passes 3/5\nREGRESSION_RISK: low\n-->`
    const result = parseAnalysisBlock(content)
    expect(result).not.toBeNull()
    expect(result!.rootCause).toBe('vague instructions')
    expect(result!.generalityTest).toBe('passes 3/5')
    expect(result!.regressionRisk).toBe('low')
  })

  it('returns null when no ANALYSIS block', () => {
    expect(parseAnalysisBlock('# Skill\nNo analysis here.')).toBeNull()
  })

  it('returns empty strings for missing fields', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: only this\n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.generalityTest).toBe('')
    expect(result!.regressionRisk).toBe('')
  })

  it('trims whitespace from field values', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE:   leading spaces   \n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.rootCause).toBe('leading spaces')
  })
})

// ── parseFrontmatter ──────────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('parses name, version, format from frontmatter', () => {
    const content = `---\nname: My Skill\nversion: 2.0.0\nformat: markdown\n---\n# Body`
    const { frontmatter, markdownContent } = parseFrontmatter(content)
    expect(frontmatter.name).toBe('My Skill')
    expect(frontmatter.version).toBe('2.0.0')
    expect(frontmatter.format).toBe('markdown')
    expect(markdownContent).toBe('# Body')
  })

  it('parses tags array', () => {
    const content = `---\ntags: [ai, code, review]\n---\n# Body`
    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter.tags).toEqual(['ai', 'code', 'review'])
  })

  it('returns empty frontmatter and full content when no frontmatter', () => {
    const content = '# Just markdown\nNo frontmatter.'
    const { frontmatter, markdownContent } = parseFrontmatter(content)
    expect(Object.keys(frontmatter)).toHaveLength(0)
    expect(markdownContent).toBe(content)
  })

  it('returns empty tags array for empty tags field', () => {
    const content = `---\ntags: []\n---\n# Body`
    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter.tags).toEqual([])
  })

  it('preserves raw yaml string', () => {
    const content = `---\nname: Test\n---\n# Body`
    const { yamlRaw } = parseFrontmatter(content)
    expect(yamlRaw).toContain('name: Test')
  })
})

// ── sanitizeFileName ──────────────────────────────────────────────────────────

describe('sanitizeFileName', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(sanitizeFileName('My Skill Name')).toBe('my-skill-name')
  })

  it('strips special characters', () => {
    expect(sanitizeFileName('Skill (v2) [beta]!')).toBe('skill-v2-beta')
  })

  it('falls back to evolved-skill for empty result', () => {
    expect(sanitizeFileName('!!!')).toBe('evolved-skill')
  })

  it('handles already clean names', () => {
    expect(sanitizeFileName('clean-name')).toBe('clean-name')
  })
})

// ── installAndEval integration logic ─────────────────────────────────────────

describe('installAndEval combined logic', () => {
  it('strips ANALYSIS block before writing frontmatter', () => {
    const raw = `<!--ANALYSIS\nROOT_CAUSE: x\n-->\n---\nname: Evolved\n---\n# Body`
    const stripped = stripAnalysisBlock(raw)
    const { frontmatter } = parseFrontmatter(stripped)
    expect(frontmatter.name).toBe('Evolved')
    expect(stripped).not.toContain('ANALYSIS')
  })

  it('falls back to original name + (evolved) when no frontmatter name', () => {
    const raw = `<!--ANALYSIS\nROOT_CAUSE: x\n-->\n# Body without frontmatter`
    const stripped = stripAnalysisBlock(raw)
    const { frontmatter } = parseFrontmatter(stripped)
    const originalName = 'My Original Skill'
    const evolvedName = (frontmatter.name as string) || `${originalName} (evolved)`
    expect(evolvedName).toBe('My Original Skill (evolved)')
  })

  it('uses frontmatter name when present', () => {
    const raw = `---\nname: Custom Evolved Name\n---\n# Body`
    const { frontmatter } = parseFrontmatter(raw)
    const evolvedName = (frontmatter.name as string) || 'fallback (evolved)'
    expect(evolvedName).toBe('Custom Evolved Name')
  })

  it('defaults format to markdown when missing', () => {
    const { frontmatter } = parseFrontmatter('# No frontmatter')
    expect((frontmatter.format as string) || 'markdown').toBe('markdown')
  })

  it('defaults version to 1.0.0 when missing', () => {
    const { frontmatter } = parseFrontmatter('# No frontmatter')
    expect((frontmatter.version as string) || '1.0.0').toBe('1.0.0')
  })

  it('defaults tags to empty array when missing', () => {
    const { frontmatter } = parseFrontmatter('# No frontmatter')
    expect((frontmatter.tags as string[]) || []).toEqual([])
  })
})
