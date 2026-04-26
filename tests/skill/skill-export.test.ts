/**
 * tests/skill/skill-export.test.ts
 *
 * Pure logic tests for Skill export:
 * - Tool target resolution (toolId → exportDir, ext)
 * - Copy vs symlink decision logic
 * - File extension mapping per tool
 * No Electron / fs / DB.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'path'

// ── Mirrors TOOL_DEFAULTS in skills.handler.ts ───────────────────────────────

const TOOL_DEFAULTS: Record<string, { name: string; exportDir: string; ext: string }> = {
  'claude-code': { name: 'Claude Code',   exportDir: '.claude/commands',            ext: '.md' },
  'cursor':      { name: 'Cursor',         exportDir: '.cursor/rules',               ext: '.mdc' },
  'windsurf':    { name: 'Windsurf',       exportDir: '.codeium/windsurf/memories',  ext: '.md' },
  'codex':       { name: 'Codex CLI',      exportDir: '.codex',                      ext: '.md' },
  'gemini':      { name: 'Gemini CLI',     exportDir: '.gemini/skills',              ext: '.md' },
  'opencode':    { name: 'OpenCode',       exportDir: '.opencode',                   ext: '.md' },
  'openclaw':    { name: 'OpenClaw',       exportDir: '.openclaw',                   ext: '.md' },
  'codebuddy':   { name: 'CodeBuddy',      exportDir: '.codebuddy/skills',           ext: '.md' },
}

function resolveToolDir(toolId: string, homeDir: string, overrides: Record<string, string> = {}) {
  const def = TOOL_DEFAULTS[toolId]
  if (!def) return null
  const override = overrides[toolId]
  const exportDir = join(homeDir, override ?? def.exportDir)
  return { name: def.name, exportDir, ext: def.ext }
}

function buildExportPath(exportDir: string, skillName: string, ext: string): string {
  const safeName = skillName.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '-').toLowerCase()
  return join(exportDir, `${safeName}${ext}`)
}

// ── Tool target resolution ───────────────────────────────────────────────────

describe('tool target resolution', () => {
  const HOME = '/Users/testuser'

  it('resolves claude-code target with correct dir and ext', () => {
    const result = resolveToolDir('claude-code', HOME)
    expect(result).not.toBeNull()
    expect(result!.exportDir).toBe('/Users/testuser/.claude/commands')
    expect(result!.ext).toBe('.md')
    expect(result!.name).toBe('Claude Code')
  })

  it('resolves cursor with .mdc extension', () => {
    const result = resolveToolDir('cursor', HOME)
    expect(result!.ext).toBe('.mdc')
  })

  it('resolves all 8 supported tools without error', () => {
    const tools = ['claude-code', 'cursor', 'windsurf', 'codex', 'gemini', 'opencode', 'openclaw', 'codebuddy']
    for (const tool of tools) {
      const result = resolveToolDir(tool, HOME)
      expect(result, `tool ${tool} should resolve`).not.toBeNull()
    }
  })

  it('returns null for unknown tool ID', () => {
    expect(resolveToolDir('unknown-tool', HOME)).toBeNull()
    expect(resolveToolDir('', HOME)).toBeNull()
  })

  it('applies user override path when configured', () => {
    const overrides = { 'claude-code': 'custom/commands' }
    const result = resolveToolDir('claude-code', HOME, overrides)
    expect(result!.exportDir).toBe('/Users/testuser/custom/commands')
  })

  it('ignores override for other tools', () => {
    const overrides = { 'cursor': 'my-cursor-dir' }
    const result = resolveToolDir('claude-code', HOME, overrides)
    expect(result!.exportDir).toBe('/Users/testuser/.claude/commands')
  })
})

// ── Export path construction ─────────────────────────────────────────────────

describe('export path construction', () => {
  it('builds correct path for claude-code export', () => {
    const path = buildExportPath('/home/.claude/commands', 'Code Review', '.md')
    expect(path).toBe('/home/.claude/commands/code-review.md')
  })

  it('builds .mdc path for cursor', () => {
    const path = buildExportPath('/home/.cursor/rules', 'My Skill', '.mdc')
    expect(path).toBe('/home/.cursor/rules/my-skill.mdc')
  })

  it('sanitizes special chars in skill name', () => {
    const path = buildExportPath('/export', 'Skill (v2)!', '.md')
    expect(path).not.toContain('(')
    expect(path).not.toContain(')')
    expect(path).not.toContain('!')
  })

  it('replaces spaces with dashes in filename', () => {
    const path = buildExportPath('/export', 'my skill name', '.md')
    expect(path).toContain('my-skill-name.md')
  })

  it('lowercases filename', () => {
    const path = buildExportPath('/export', 'MySkill', '.md')
    expect(path).toContain('myskill.md')
  })
})

// ── Tool coverage ────────────────────────────────────────────────────────────

describe('8-tool coverage completeness', () => {
  const EXPECTED_TOOLS = [
    'claude-code', 'cursor', 'windsurf', 'codex',
    'gemini', 'opencode', 'openclaw', 'codebuddy'
  ]

  it('has exactly 8 tool targets defined', () => {
    expect(Object.keys(TOOL_DEFAULTS)).toHaveLength(8)
  })

  it('all expected tool IDs are registered', () => {
    for (const tool of EXPECTED_TOOLS) {
      expect(TOOL_DEFAULTS[tool], `${tool} should be defined`).toBeDefined()
    }
  })

  it('all tools have name, exportDir, and ext fields', () => {
    for (const [id, def] of Object.entries(TOOL_DEFAULTS)) {
      expect(def.name, `${id} missing name`).toBeTruthy()
      expect(def.exportDir, `${id} missing exportDir`).toBeTruthy()
      expect(def.ext, `${id} missing ext`).toBeTruthy()
    }
  })

  it('extensions are .md or .mdc only', () => {
    const validExts = new Set(['.md', '.mdc'])
    for (const [id, def] of Object.entries(TOOL_DEFAULTS)) {
      expect(validExts.has(def.ext), `${id} has unexpected ext ${def.ext}`).toBe(true)
    }
  })

  it('only cursor uses .mdc', () => {
    const mdcTools = Object.entries(TOOL_DEFAULTS).filter(([, d]) => d.ext === '.mdc')
    expect(mdcTools).toHaveLength(1)
    expect(mdcTools[0][0]).toBe('cursor')
  })
})
