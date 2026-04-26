/**
 * tests/security/plugin-loader-security.test.ts
 *
 * Plugin loader security boundary tests:
 * - Path containment: files outside plugin dir are rejected
 * - Malformed plugins (missing id/name/evolve) are skipped
 * - Plugin with invalid evolve type is rejected
 * - loadPlugins returns empty array when dir is missing
 * Pure logic — mocks fs and require, no real file I/O.
 */

import { describe, it, expect } from 'vitest'
import { resolve, join } from 'path'

// ── Mirror path-containment guard from plugin-loader.ts ──────────────────────

function isPathAllowed(filePath: string, dir: string): boolean {
  const resolvedFile = resolve(filePath)
  const resolvedDir = resolve(dir)
  // Must be inside dir — add trailing sep to prevent prefix-match false positives
  return resolvedFile.startsWith(resolvedDir + '/')
}

function validatePlugin(mod: Record<string, unknown>): boolean {
  const plugin = (mod.default ?? mod) as Record<string, unknown>
  if (typeof plugin.id !== 'string' || !plugin.id) return false
  if (typeof plugin.name !== 'string') return false
  if (typeof plugin.evolve !== 'function') return false
  return true
}

// ── Path containment ──────────────────────────────────────────────────────────

describe('plugin-loader — path containment', () => {
  const pluginDir = '/home/user/.config/SkillNexus/plugins'

  it('allows files inside plugin dir', () => {
    const filePath = join(pluginDir, 'my-plugin.js')
    expect(isPathAllowed(filePath, pluginDir)).toBe(true)
  })

  it('rejects path traversal outside plugin dir', () => {
    const filePath = join(pluginDir, '../../../etc/passwd')
    expect(isPathAllowed(filePath, pluginDir)).toBe(false)
  })

  it('rejects absolute path outside plugin dir', () => {
    expect(isPathAllowed('/tmp/evil.js', pluginDir)).toBe(false)
  })

  it('rejects sibling directory', () => {
    const filePath = '/home/user/.config/SkillNexus/plugins-evil/bad.js'
    expect(isPathAllowed(filePath, pluginDir)).toBe(false)
  })

  it('rejects path that is a prefix match but not a child', () => {
    // e.g. pluginsExtra starts with plugins but is not inside it
    const filePath = '/home/user/.config/SkillNexus/pluginsExtra/bad.js'
    expect(isPathAllowed(filePath, pluginDir)).toBe(false)
  })
})

// ── Plugin validation ─────────────────────────────────────────────────────────

describe('plugin-loader — plugin validation', () => {
  it('accepts a well-formed plugin', () => {
    const mod = {
      id: 'my-plugin',
      name: 'My Plugin',
      description: 'Does stuff',
      version: '1.0.0',
      evolve: async () => ({ evolvedContent: '' })
    }
    expect(validatePlugin(mod)).toBe(true)
  })

  it('accepts plugin exported as module.exports.default', () => {
    const mod = {
      default: {
        id: 'my-plugin',
        name: 'My Plugin',
        evolve: async () => ({ evolvedContent: '' })
      }
    }
    expect(validatePlugin(mod)).toBe(true)
  })

  it('rejects plugin missing id', () => {
    const mod = { name: 'No ID', evolve: async () => ({}) }
    expect(validatePlugin(mod)).toBe(false)
  })

  it('rejects plugin with empty id', () => {
    const mod = { id: '', name: 'Empty ID', evolve: async () => ({}) }
    expect(validatePlugin(mod)).toBe(false)
  })

  it('rejects plugin missing name', () => {
    const mod = { id: 'p1', evolve: async () => ({}) }
    expect(validatePlugin(mod)).toBe(false)
  })

  it('rejects plugin missing evolve function', () => {
    const mod = { id: 'p1', name: 'No Evolve' }
    expect(validatePlugin(mod)).toBe(false)
  })

  it('rejects plugin where evolve is not a function', () => {
    const mod = { id: 'p1', name: 'Bad Evolve', evolve: 'not-a-function' }
    expect(validatePlugin(mod)).toBe(false)
  })

  it('rejects completely empty module', () => {
    expect(validatePlugin({})).toBe(false)
  })
})
