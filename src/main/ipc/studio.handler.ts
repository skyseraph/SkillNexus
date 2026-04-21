import { ipcMain } from 'electron'
import { getAIProvider } from '../services/ai-provider'
import { getDb } from '../db'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve, basename } from 'path'
import { app } from 'electron'
import yaml from 'js-yaml'

const STUDIO_SYSTEM_PROMPT = `You are an expert Skill author. Generate a well-structured Skill in Markdown format.

A Skill has this structure:
---
name: SkillName
version: 1.0.0
format: markdown
tags: [tag1, tag2]
---

# Skill Description

[Detailed instructions for the AI...]

Generate ONLY the Skill content, no extra commentary.`

export function registerStudioHandlers(): void {
  ipcMain.handle('studio:generate', async (_event, prompt: string) => {
    const provider = getAIProvider()
    const result = await provider.call({
      model: 'claude-sonnet-4-6',
      systemPrompt: STUDIO_SYSTEM_PROMPT,
      userMessage: prompt
    })
    return result.content
  })

  ipcMain.handle('studio:install', async (_event, content: string, name: string) => {
    const skillsDir = join(app.getPath('userData'), 'skills')
    // SEC-04: sanitize name — strip any path separators, keep only safe chars
    const safeName = basename(name.replace(/[^a-zA-Z0-9_\- ]/g, '')).replace(/\s+/g, '-').toLowerCase() || 'skill'
    const filePath = resolve(join(skillsDir, `${safeName}.md`))
    // Ensure the resolved path stays inside skillsDir
    if (!filePath.startsWith(resolve(skillsDir))) {
      throw new Error('Invalid skill name: path traversal detected')
    }

    try {
      mkdirSync(skillsDir, { recursive: true })
    } catch { /* already exists */ }

    writeFileSync(filePath, content, 'utf-8')

    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    let frontmatter: Record<string, unknown> = {}
    let markdownContent = content

    if (match) {
      frontmatter = (yaml.load(match[1]) as Record<string, unknown>) || {}
      markdownContent = match[2]
    }

    const db = getDb()
    const now = Date.now()
    const id = `skill-${now}-${Math.random().toString(36).slice(2, 8)}`

    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      (frontmatter.name as string) || name,
      (frontmatter.format as string) || 'markdown',
      (frontmatter.version as string) || '1.0.0',
      JSON.stringify((frontmatter.tags as string[]) || []),
      match ? match[1] : '',
      markdownContent,
      filePath,
      now,
      now
    )

    return {
      id,
      name: (frontmatter.name as string) || name,
      format: (frontmatter.format as string) || 'markdown',
      version: (frontmatter.version as string) || '1.0.0',
      tags: (frontmatter.tags as string[]) || [],
      yamlFrontmatter: match ? match[1] : '',
      markdownContent,
      filePath,
      installedAt: now,
      updatedAt: now
    }
  })
}
