/**
 * Plugin Loader — dynamic evolution engine plugin system
 *
 * Plugins live in {userData}/plugins/*.js
 * Each plugin file must export a default object matching SkillNexusPlugin:
 *
 *   module.exports = {
 *     id: 'my-optimizer',
 *     name: 'My Optimizer',
 *     description: 'Custom evolution strategy',
 *     version: '1.0.0',
 *     evolve: async ({ skillContent, evalHistory, config }) => ({
 *       evolvedContent: '...'
 *     })
 *   }
 */

import { existsSync, readdirSync, mkdirSync } from 'fs'
import { join, resolve, basename } from 'path'
import { app } from 'electron'
import type { PluginManifest } from '../../shared/types'

export interface PluginInput {
  skillContent: string
  skillName: string
  evalHistory: Array<{ input: string; output: string; scores: Record<string, { score: number }> }>
  config: Record<string, unknown>
}

export interface PluginOutput {
  evolvedContent: string
}

export interface LoadedPlugin {
  manifest: PluginManifest
  evolve: (input: PluginInput) => Promise<PluginOutput>
}

const loadedPlugins = new Map<string, LoadedPlugin>()

export function getPluginDir(): string {
  return join(app.getPath('userData'), 'plugins')
}

export function ensurePluginDir(): void {
  const dir = getPluginDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function loadPlugins(): PluginManifest[] {
  ensurePluginDir()
  const dir = getPluginDir()
  loadedPlugins.clear()
  const manifests: PluginManifest[] = []

  let files: string[]
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.js'))
  } catch {
    return []
  }

  for (const file of files) {
    const filePath = resolve(join(dir, file))
    // Security: must be inside plugin dir
    if (!filePath.startsWith(resolve(dir))) continue

    try {
      // Clear require cache so reloading picks up changes
      delete require.cache[require.resolve(filePath)]
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(filePath) as Record<string, unknown>
      const plugin = (mod.default ?? mod) as Record<string, unknown>

      if (typeof plugin.id !== 'string' || !plugin.id) continue
      if (typeof plugin.name !== 'string') continue
      if (typeof plugin.evolve !== 'function') continue

      const manifest: PluginManifest = {
        id: String(plugin.id),
        name: String(plugin.name),
        description: String(plugin.description ?? ''),
        version: String(plugin.version ?? '1.0.0'),
        filePath
      }

      loadedPlugins.set(manifest.id, {
        manifest,
        evolve: plugin.evolve as (input: PluginInput) => Promise<PluginOutput>
      })
      manifests.push(manifest)
    } catch (err) {
      console.warn(`[plugin-loader] Failed to load ${file}:`, err instanceof Error ? err.message : err)
    }
  }

  return manifests
}

export function getPlugin(id: string): LoadedPlugin | undefined {
  return loadedPlugins.get(id)
}

export function listPlugins(): PluginManifest[] {
  return Array.from(loadedPlugins.values()).map(p => p.manifest)
}
