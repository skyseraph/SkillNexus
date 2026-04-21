import { ipcMain } from 'electron'
import { getDb } from '../db'
import { readFileSync } from 'fs'
import { basename, resolve, extname } from 'path'
import yaml from 'js-yaml'
import type { Skill } from '../../shared/types'

// SEC-01: validate filePath is an absolute path ending in .md and not traversing into system dirs
function validateSkillPath(filePath: string): void {
  const resolved = resolve(filePath)
  if (extname(resolved).toLowerCase() !== '.md') {
    throw new Error('Only .md files are allowed')
  }
  // Block obvious system paths
  const blocked = ['/etc', '/usr', '/bin', '/sbin', '/System', '/Library/Keychains']
  if (blocked.some((p) => resolved.startsWith(p))) {
    throw new Error(`Access to path is not allowed: ${resolved}`)
  }
}

function parseSkillFile(filePath: string): Omit<Skill, 'id' | 'installedAt' | 'updatedAt'> {
  validateSkillPath(filePath)
  const content = readFileSync(filePath, 'utf-8')
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

export function registerSkillsHandlers(): void {
  ipcMain.handle('skills:getAll', () => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM skills ORDER BY installed_at DESC').all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      format: r.format,
      version: r.version,
      tags: JSON.parse(r.tags as string),
      yamlFrontmatter: r.yaml_frontmatter,
      markdownContent: r.markdown_content,
      filePath: r.file_path,
      installedAt: r.installed_at,
      updatedAt: r.updated_at
    }))
  })

  ipcMain.handle('skills:install', (_event, filePath: string) => {
    const db = getDb()
    const parsed = parseSkillFile(filePath)
    const now = Date.now()
    const id = `skill-${now}-${Math.random().toString(36).slice(2, 8)}`

    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      parsed.name,
      parsed.format,
      parsed.version,
      JSON.stringify(parsed.tags),
      parsed.yamlFrontmatter,
      parsed.markdownContent,
      parsed.filePath,
      now,
      now
    )

    return { id, ...parsed, installedAt: now, updatedAt: now }
  })

  ipcMain.handle('skills:uninstall', (_event, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM skills WHERE id = ?').run(id)
  })
}
