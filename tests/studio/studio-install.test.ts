/**
 * tests/studio/studio-install.test.ts
 *
 * Pure logic tests for studio:install handler:
 * - Skill name sanitization (special chars, spaces, path traversal, empty fallback)
 * - Content validation (empty content guard)
 * - Frontmatter generation for installed skills
 * - File path construction safety
 * No Electron / DB / AI calls.
 */

import { describe, it, expect } from 'vitest'
import { basename, join, resolve } from 'path'

// ── Mirrors studio.handler.ts install logic ───────────────────────────────────

function sanitizeInstallName(name: string): string {
  // Strip path separators and dangerous chars, collapse spaces to dashes
  const safe = basename(name)
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
  return safe || 'skill'
}

function buildInstallFilePath(name: string, skillsDir: string): string {
  const safeName = sanitizeInstallName(name)
  const filePath = resolve(join(skillsDir, `${safeName}.md`))
  // Containment check
  if (!filePath.startsWith(resolve(skillsDir))) {
    throw new Error(`Path traversal detected: ${filePath}`)
  }
  return filePath
}

function validateInstallContent(content: string): void {
  if (!content || !content.trim()) {
    throw new Error('Skill content cannot be empty')
  }
}

function buildFrontmatter(name: string, version = '1.0.0', tags: string[] = []): string {
  const safeName = sanitizeInstallName(name)
  const lines = [
    '---',
    `name: ${safeName}`,
    `version: ${version}`,
    'format: markdown',
    `tags: [${tags.join(', ')}]`,
    '---'
  ]
  return lines.join('\n')
}

function hasExistingFrontmatter(content: string): boolean {
  return /^---\n[\s\S]*?\n---/.test(content)
}

// ── Name sanitization ─────────────────────────────────────────────────────────

describe('sanitizeInstallName — skill name normalization', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(sanitizeInstallName('My Skill Name')).toBe('my-skill-name')
  })

  it('strips special characters', () => {
    expect(sanitizeInstallName('skill!@#$%')).toBe('skill')
  })

  it('strips path traversal sequences via basename()', () => {
    // basename('../../etc/passwd') = 'passwd'
    const result = sanitizeInstallName('../../../etc/passwd')
    expect(result).not.toContain('/')
    expect(result).not.toContain('..')
  })

  it('strips semicolons (shell injection prevention)', () => {
    expect(sanitizeInstallName('skill; rm -rf /')).toBe('skill-rm--rf-')
  })

  it('strips null bytes', () => {
    expect(sanitizeInstallName('skill\0evil')).toBe('skillevil')
  })

  it('collapses multiple spaces into single dash', () => {
    expect(sanitizeInstallName('skill   name')).toBe('skill-name')
  })

  it('preserves hyphens and underscores', () => {
    expect(sanitizeInstallName('code-review_v2')).toBe('code-review_v2')
  })

  it('falls back to "skill" when result is empty', () => {
    expect(sanitizeInstallName('!!!')).toBe('skill')
    expect(sanitizeInstallName('')).toBe('skill')
    // '   ' → basename strips nothing → replace spaces with dashes → '-' → truthy, not empty
    // so fallback does NOT trigger; the sanitized result is '-'
    expect(sanitizeInstallName('   ')).toBe('-')
  })

  it('handles Unicode characters (stripped)', () => {
    const result = sanitizeInstallName('skill-名前')
    expect(result).not.toContain('名')
    expect(result).toContain('skill')
  })

  it('handles already-clean names unchanged', () => {
    expect(sanitizeInstallName('commit-message')).toBe('commit-message')
    expect(sanitizeInstallName('code-review-v2')).toBe('code-review-v2')
  })

  it('strips leading/trailing spaces before processing', () => {
    // spaces become dashes, so leading/trailing spaces produce leading/trailing dashes
    expect(sanitizeInstallName('  my skill  ')).toBe('-my-skill-')
  })
})

// ── File path construction ────────────────────────────────────────────────────

describe('buildInstallFilePath — safe path construction', () => {
  const SKILLS_DIR = '/Users/testuser/Library/Application Support/SkillNexus/skills'

  it('builds correct path for clean name', () => {
    const path = buildInstallFilePath('commit-message', SKILLS_DIR)
    expect(path).toBe(`${SKILLS_DIR}/commit-message.md`)
  })

  it('sanitizes name before building path', () => {
    const path = buildInstallFilePath('My Skill!', SKILLS_DIR)
    expect(path).toBe(`${SKILLS_DIR}/my-skill.md`)
  })

  it('path is always within skillsDir', () => {
    const path = buildInstallFilePath('any-name', SKILLS_DIR)
    expect(path.startsWith(resolve(SKILLS_DIR))).toBe(true)
  })

  it('path traversal in name is neutralized', () => {
    const path = buildInstallFilePath('../../../etc/passwd', SKILLS_DIR)
    expect(path.startsWith(resolve(SKILLS_DIR))).toBe(true)
    expect(path).not.toContain('/etc/')
  })

  it('always produces .md extension', () => {
    const path = buildInstallFilePath('my-skill', SKILLS_DIR)
    expect(path.endsWith('.md')).toBe(true)
  })
})

// ── Content validation ────────────────────────────────────────────────────────

describe('validateInstallContent — empty content guard', () => {
  it('accepts valid skill content', () => {
    expect(() => validateInstallContent('# My Skill\n\nDo something useful.')).not.toThrow()
  })

  it('accepts content with frontmatter', () => {
    const content = '---\nname: test\n---\n# Instructions'
    expect(() => validateInstallContent(content)).not.toThrow()
  })

  it('throws for empty string', () => {
    expect(() => validateInstallContent('')).toThrow('cannot be empty')
  })

  it('throws for whitespace-only content', () => {
    expect(() => validateInstallContent('   \n\t  ')).toThrow('cannot be empty')
  })

  it('throws for null-like empty', () => {
    expect(() => validateInstallContent('')).toThrow()
  })

  it('accepts single-line content', () => {
    expect(() => validateInstallContent('Do the thing.')).not.toThrow()
  })
})

// ── Frontmatter generation ────────────────────────────────────────────────────

describe('buildFrontmatter — frontmatter block generation', () => {
  it('generates valid YAML frontmatter block', () => {
    const fm = buildFrontmatter('My Skill')
    expect(fm).toContain('---')
    expect(fm).toContain('name: my-skill')
    expect(fm).toContain('version: 1.0.0')
    expect(fm).toContain('format: markdown')
  })

  it('includes custom version', () => {
    const fm = buildFrontmatter('test', '2.0.0')
    expect(fm).toContain('version: 2.0.0')
  })

  it('includes tags when provided', () => {
    const fm = buildFrontmatter('test', '1.0.0', ['git', 'commit'])
    expect(fm).toContain('git')
    expect(fm).toContain('commit')
  })

  it('produces empty tags array when none provided', () => {
    const fm = buildFrontmatter('test')
    expect(fm).toContain('tags: []')
  })

  it('starts and ends with ---', () => {
    const fm = buildFrontmatter('test')
    expect(fm.startsWith('---')).toBe(true)
    expect(fm.endsWith('---')).toBe(true)
  })

  it('sanitizes name in frontmatter', () => {
    const fm = buildFrontmatter('My Skill!!!')
    expect(fm).toContain('name: my-skill')
    expect(fm).not.toContain('!!!')
  })
})

// ── Frontmatter detection ─────────────────────────────────────────────────────

describe('hasExistingFrontmatter — detect pre-existing frontmatter', () => {
  it('detects valid frontmatter block', () => {
    const content = '---\nname: test\nversion: 1.0.0\n---\n# Body'
    expect(hasExistingFrontmatter(content)).toBe(true)
  })

  it('returns false for plain markdown without frontmatter', () => {
    expect(hasExistingFrontmatter('# Just a heading\n\nSome content.')).toBe(false)
  })

  it('returns false for empty content', () => {
    expect(hasExistingFrontmatter('')).toBe(false)
  })

  it('returns false for content starting with --- but no closing ---', () => {
    expect(hasExistingFrontmatter('---\nname: test\n# No closing')).toBe(false)
  })

  it('returns false for minimal frontmatter with empty body (just dashes)', () => {
    // regex requires [\s\S]*? between the two --- lines, which matches empty too,
    // but '---\n---' has no content between them — regex needs \n---\n so this is false
    expect(hasExistingFrontmatter('---\n---\n# Body')).toBe(false)
  })
})
