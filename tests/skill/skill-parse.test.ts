/**
 * tests/skill/skill-parse.test.ts
 *
 * Pure logic tests for Skill file parsing (frontmatter, entry file detection,
 * sanitize fileName) — no Electron / DB / fs dependencies.
 */

import { describe, it, expect } from 'vitest'
import { basename } from 'path'
import yaml from 'js-yaml'

// ── Inline implementations (mirrors skills.handler.ts) ──────────────────────

function parseSkillContent(filePath: string, content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  let frontmatter: Record<string, unknown> = {}
  let markdownContent = content
  if (match) {
    frontmatter = (yaml.load(match[1]) as Record<string, unknown>) || {}
    markdownContent = match[2]
  }
  return {
    name: (frontmatter.name as string) || basename(filePath, '.md'),
    format: (frontmatter.format as string) || 'markdown',
    version: (frontmatter.version as string) || '1.0.0',
    tags: (frontmatter.tags as string[]) || [],
    yamlFrontmatter: match ? match[1] : '',
    markdownContent,
    filePath
  }
}

function sanitizeSkillName(name: string): string {
  // Mirrors marketplace.handler.ts name sanitization used when installing
  return name.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'skill'
}

// ── parseSkillContent ────────────────────────────────────────────────────────

describe('parseSkillContent — frontmatter extraction', () => {
  it('parses name, version, format from valid frontmatter', () => {
    const content = `---\nname: Code Review\nversion: 2.0.0\nformat: markdown\n---\n# Instructions`
    const result = parseSkillContent('/tmp/code-review.md', content)
    expect(result.name).toBe('Code Review')
    expect(result.version).toBe('2.0.0')
    expect(result.format).toBe('markdown')
  })

  it('parses tags array', () => {
    const content = `---\nname: My Skill\ntags:\n  - ai\n  - code\n  - review\n---\n# Body`
    const result = parseSkillContent('/tmp/my-skill.md', content)
    expect(result.tags).toEqual(['ai', 'code', 'review'])
  })

  it('falls back to filename (without .md) when name is missing', () => {
    const content = `---\nversion: 1.0.0\n---\n# Body`
    const result = parseSkillContent('/tmp/auto-name.md', content)
    expect(result.name).toBe('auto-name')
  })

  it('defaults version to 1.0.0 when missing', () => {
    const content = `---\nname: Test\n---\n# Body`
    const result = parseSkillContent('/tmp/test.md', content)
    expect(result.version).toBe('1.0.0')
  })

  it('defaults format to markdown when missing', () => {
    const content = `---\nname: Test\n---\n# Body`
    const result = parseSkillContent('/tmp/test.md', content)
    expect(result.format).toBe('markdown')
  })

  it('defaults tags to empty array when missing', () => {
    const content = `---\nname: Test\n---\n# Body`
    const result = parseSkillContent('/tmp/test.md', content)
    expect(result.tags).toEqual([])
  })

  it('handles content with no frontmatter delimiters', () => {
    const content = '# Just markdown\nNo frontmatter here.'
    const result = parseSkillContent('/tmp/plain.md', content)
    expect(result.yamlFrontmatter).toBe('')
    expect(result.markdownContent).toBe(content)
    expect(result.name).toBe('plain')
  })

  it('preserves markdownContent after frontmatter', () => {
    const content = `---\nname: Test\n---\n# Instructions\n\nDo important things.`
    const result = parseSkillContent('/tmp/test.md', content)
    expect(result.markdownContent).toContain('# Instructions')
    expect(result.markdownContent).toContain('Do important things.')
  })

  it('preserves raw yamlFrontmatter string', () => {
    const content = `---\nname: Test\nversion: 1.5.0\n---\n# Body`
    const result = parseSkillContent('/tmp/test.md', content)
    expect(result.yamlFrontmatter).toContain('name: Test')
    expect(result.yamlFrontmatter).toContain('version: 1.5.0')
  })

  it('handles empty tags array in frontmatter', () => {
    const content = `---\nname: No Tags\ntags: []\n---\n# Body`
    const result = parseSkillContent('/tmp/no-tags.md', content)
    expect(result.tags).toEqual([])
  })

  it('handles special characters in skill body without breaking parse', () => {
    const content = `---\nname: Special\n---\n# Body\n\`\`\`python\nprint("hello")\n\`\`\``
    const result = parseSkillContent('/tmp/special.md', content)
    expect(result.markdownContent).toContain('print("hello")')
  })
})

// ── sanitizeSkillName ────────────────────────────────────────────────────────

describe('sanitizeSkillName — marketplace install name normalization', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(sanitizeSkillName('My Skill Name')).toBe('my-skill-name')
  })

  it('removes special characters', () => {
    expect(sanitizeSkillName('Skill (v2)!')).toBe('skill-v2')
  })

  it('handles already-clean names', () => {
    expect(sanitizeSkillName('clean-skill')).toBe('clean-skill')
  })

  it('preserves hyphens', () => {
    expect(sanitizeSkillName('code-review-skill')).toBe('code-review-skill')
  })

  it('collapses multiple spaces', () => {
    expect(sanitizeSkillName('skill   name')).toBe('skill-name')
  })

  it('falls back to skill when result is empty', () => {
    expect(sanitizeSkillName('!!!')).toBe('skill')
  })
})
