/**
 * tests/security/ipc-security-extended.test.ts
 *
 * Extended security invariant tests:
 * - SEC-R1 extended: sibling-prefix path confusion (e.g. /skills/code-review-evil vs /skills/code-review)
 * - SEC-R2 extended: skills:export name sanitization and home-dir containment
 * - SEC-R7 extended: skills:readFile with symlink-like traversal patterns
 * - openExternal: additional protocol edge cases (vbscript, blob, ws://)
 * - testcases:importJson: root-node type guard (non-array inputs)
 * All pure logic — no Electron.
 */

import { describe, it, expect } from 'vitest'
import { resolve, join, basename } from 'path'

// ── assertPathAllowed (mirrors skills.handler.ts) ─────────────────────────────

function assertPathAllowed(p: string, allowedPrefixes: string[]): void {
  const r = resolve(p)
  if (!allowedPrefixes.some(prefix => r.startsWith(prefix + '/') || r === prefix)) {
    throw new Error(`Access to path is not allowed: ${r}`)
  }
}

// ── assertFileInSkillRootDir (mirrors skills.handler.ts readFile check) ───────

function assertFileInSkillRootDir(filePath: string, rootDir: string): void {
  const resolved = resolve(filePath)
  const resolvedRoot = resolve(rootDir)
  if (!resolved.startsWith(resolvedRoot + '/') && resolved !== resolvedRoot) {
    throw new Error(`File ${resolved} is outside skill rootDir ${resolvedRoot}`)
  }
}

// ── assertSafeExternalUrl (mirrors index.ts shell:openExternal) ───────────────

function assertSafeExternalUrl(url: string): void {
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`Unsafe protocol in URL: ${url}`)
  }
}

// ── sanitizeExportName (mirrors skills.handler.ts export) ────────────────────

function sanitizeExportName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '-').toLowerCase() || 'skill'
}

function buildExportPath(name: string, exportDir: string, ext: string): string {
  const safeName = sanitizeExportName(name)
  const destPath = join(exportDir, `${safeName}${ext}`)
  // Security: target must be under home directory
  const home = resolve('/Users/testuser')
  if (!resolve(exportDir).startsWith(home)) {
    throw new Error('Export path must be within home directory')
  }
  return destPath
}

// ── assertImportJsonIsArray (mirrors testcases.handler.ts importJson) ─────────

function assertImportJsonIsArray(items: unknown): asserts items is unknown[] {
  if (!Array.isArray(items)) throw new Error('JSON 根节点必须是数组')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SEC-R1 extended: sibling-prefix path confusion', () => {
  const ALLOWED = ['/Users/testuser/skills/code-review']

  it('allows file inside the exact skill root', () => {
    expect(() => assertPathAllowed('/Users/testuser/skills/code-review/SKILL.md', ALLOWED)).not.toThrow()
  })

  it('blocks sibling directory that shares the prefix string', () => {
    // /Users/testuser/skills/code-review-evil starts with /Users/testuser/skills/code-review
    // but is NOT inside it — the separator check prevents this
    expect(() => assertPathAllowed('/Users/testuser/skills/code-review-evil/file.md', ALLOWED)).toThrow('not allowed')
  })

  it('blocks sibling with numeric suffix', () => {
    expect(() => assertPathAllowed('/Users/testuser/skills/code-review2/file.md', ALLOWED)).toThrow('not allowed')
  })

  it('allows deeply nested file inside root', () => {
    expect(() => assertPathAllowed('/Users/testuser/skills/code-review/templates/example.md', ALLOWED)).not.toThrow()
  })

  it('blocks path that resolves to parent of allowed root', () => {
    expect(() => assertPathAllowed('/Users/testuser/skills', ALLOWED)).toThrow('not allowed')
  })

  it('allows the root dir itself', () => {
    expect(() => assertPathAllowed('/Users/testuser/skills/code-review', ALLOWED)).not.toThrow()
  })
})

describe('SEC-R7 extended: skills:readFile path containment edge cases', () => {
  const ROOT = '/Users/testuser/skills/code-review'

  it('blocks file in sibling directory sharing prefix', () => {
    expect(() => assertFileInSkillRootDir(`${ROOT}-evil/file.md`, ROOT)).toThrow('outside skill rootDir')
  })

  it('blocks path traversal via encoded-like sequences (resolved by path.resolve)', () => {
    // resolve() normalizes these
    expect(() => assertFileInSkillRootDir(`${ROOT}/../other/evil.md`, ROOT)).toThrow('outside skill rootDir')
  })

  it('blocks absolute path to /etc', () => {
    expect(() => assertFileInSkillRootDir('/etc/passwd', ROOT)).toThrow('outside skill rootDir')
  })

  it('blocks path to parent directory', () => {
    expect(() => assertFileInSkillRootDir('/Users/testuser/skills', ROOT)).toThrow('outside skill rootDir')
  })

  it('allows file at root level', () => {
    expect(() => assertFileInSkillRootDir(`${ROOT}/SKILL.md`, ROOT)).not.toThrow()
  })

  it('allows file in subdirectory', () => {
    expect(() => assertFileInSkillRootDir(`${ROOT}/prompts/system.md`, ROOT)).not.toThrow()
  })

  it('allows rootDir itself', () => {
    expect(() => assertFileInSkillRootDir(ROOT, ROOT)).not.toThrow()
  })

  it('blocks empty string path', () => {
    // resolve('') = process.cwd(), which is not inside ROOT
    expect(() => assertFileInSkillRootDir('', ROOT)).toThrow('outside skill rootDir')
  })
})

describe('SEC-R4 extended: openExternal additional protocol edge cases', () => {
  it('blocks vbscript: protocol', () => {
    expect(() => assertSafeExternalUrl('vbscript:msgbox(1)')).toThrow('Unsafe protocol')
  })

  it('blocks blob: protocol', () => {
    expect(() => assertSafeExternalUrl('blob:https://example.com/uuid')).toThrow('Unsafe protocol')
  })

  it('blocks ws:// (WebSocket)', () => {
    expect(() => assertSafeExternalUrl('ws://localhost:8080')).toThrow('Unsafe protocol')
  })

  it('blocks wss:// (secure WebSocket)', () => {
    expect(() => assertSafeExternalUrl('wss://example.com')).toThrow('Unsafe protocol')
  })

  it('blocks about:blank', () => {
    expect(() => assertSafeExternalUrl('about:blank')).toThrow('Unsafe protocol')
  })

  it('blocks URL with leading whitespace (bypass attempt)', () => {
    expect(() => assertSafeExternalUrl(' https://example.com')).toThrow('Unsafe protocol')
  })

  it('blocks URL with uppercase HTTPS (regex is case-sensitive — documents behavior)', () => {
    // The actual regex /^https?:\/\// is case-sensitive
    // HTTPS:// would be blocked — this documents the behavior
    expect(() => assertSafeExternalUrl('HTTPS://example.com')).toThrow('Unsafe protocol')
  })

  it('allows standard GitHub URL', () => {
    expect(() => assertSafeExternalUrl('https://github.com/anthropics/claude-code')).not.toThrow()
  })

  it('allows localhost http URL', () => {
    expect(() => assertSafeExternalUrl('http://localhost:3000/docs')).not.toThrow()
  })
})

describe('SEC-R2 extended: skills:export name sanitization', () => {
  const HOME = '/Users/testuser'
  const EXPORT_DIR = `${HOME}/.claude/commands`

  it('sanitizes skill name for export filename', () => {
    expect(sanitizeExportName('My Skill!')).toBe('my-skill')
    expect(sanitizeExportName('Code Review v2')).toBe('code-review-v2')
  })

  it('strips path traversal from export name', () => {
    const name = sanitizeExportName('../../../etc/passwd')
    expect(name).not.toContain('/')
    expect(name).not.toContain('..')
  })

  it('falls back to "skill" for empty/special-only names', () => {
    expect(sanitizeExportName('!!!')).toBe('skill')
    expect(sanitizeExportName('')).toBe('skill')
  })

  it('builds export path within home directory', () => {
    const path = buildExportPath('my-skill', EXPORT_DIR, '.md')
    expect(path.startsWith(HOME)).toBe(true)
  })

  it('throws when export dir is outside home directory', () => {
    expect(() => buildExportPath('my-skill', '/etc/malicious', '.md')).toThrow('within home directory')
  })

  it('export path uses correct extension', () => {
    const path = buildExportPath('my-skill', EXPORT_DIR, '.md')
    expect(path.endsWith('.md')).toBe(true)
  })

  it('export path for cursor uses .mdc extension', () => {
    const cursorDir = `${HOME}/.cursor/rules`
    const path = buildExportPath('my-skill', cursorDir, '.mdc')
    expect(path.endsWith('.mdc')).toBe(true)
  })
})

describe('testcases:importJson — root-node type guard', () => {
  it('throws for object input (not array)', () => {
    expect(() => assertImportJsonIsArray({ name: 'tc', input: 'x' })).toThrow('数组')
  })

  it('throws for string input', () => {
    expect(() => assertImportJsonIsArray('tc-1,tc-2')).toThrow('数组')
  })

  it('throws for number input', () => {
    expect(() => assertImportJsonIsArray(42)).toThrow('数组')
  })

  it('throws for null input', () => {
    expect(() => assertImportJsonIsArray(null)).toThrow('数组')
  })

  it('throws for boolean input', () => {
    expect(() => assertImportJsonIsArray(true)).toThrow('数组')
  })

  it('accepts empty array', () => {
    expect(() => assertImportJsonIsArray([])).not.toThrow()
  })

  it('accepts valid array', () => {
    expect(() => assertImportJsonIsArray([{ name: 'tc', input: 'x' }])).not.toThrow()
  })
})
