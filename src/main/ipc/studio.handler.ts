import { ipcMain } from 'electron'
import { getAIProvider } from '../services/ai-provider'
import { getActiveModel } from './config.handler'
import { getDb } from '../db'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve, basename, dirname } from 'path'
import { app } from 'electron'
import yaml from 'js-yaml'
import { withTimeout, AI_TIMEOUT_MS } from '../services/eval-job'
import type { SkillScore5D } from '../../shared/types'

const SKILL_FORMAT_HINT = `A Skill has this structure:
---
name: SkillName
version: 1.0.0
format: markdown
tags: [tag1, tag2]
---

# Skill Description

[Detailed instructions for the AI...]`

const STUDIO_SYSTEM_PROMPT = `You are an expert Skill author. Generate a well-structured Skill in Markdown format.

${SKILL_FORMAT_HINT}

Generate ONLY the Skill content, no extra commentary.`

const EVOLVE_SYSTEM_PROMPT = `You are an expert Skill optimizer. You receive an existing AI Skill and must produce an improved version.

${SKILL_FORMAT_HINT}

Output ONLY the complete improved Skill. No commentary outside the Skill itself.`

const EXAMPLES_SYSTEM_PROMPT = `You are an expert Skill author. Given input/output examples of an AI task, infer and write a comprehensive Skill that would produce similar outputs.

${SKILL_FORMAT_HINT}

Output ONLY the complete Skill. No extra commentary.`

const STRATEGY_HINTS: Record<string, string> = {
  improve_weak: 'Focus specifically on improving the weakest-scoring dimensions.',
  expand: 'Expand the skill with new capabilities, more detailed instructions, and broader use case coverage.',
  simplify: 'Simplify and distill the skill to its essential core, making it more focused and concise.',
  add_examples: 'Add concrete examples, sample inputs/outputs, and edge-case guidance within the skill.'
}

const EXTRACT_SYSTEM_PROMPT = `You are an expert Skill author. Analyze the conversation below and extract a reusable Skill ONLY if it contains stable, durable user preferences, constraints, or workflows that would benefit future interactions.

${SKILL_FORMAT_HINT}

Rules:
- If the conversation contains reusable patterns → output a complete Skill in the format above
- If it's a one-off request with no durable value → output exactly: NO_SKILL
- Prefer merging into an existing pattern over creating duplicates
- Output ONLY the Skill content or NO_SKILL. No commentary.`

const SCORE_SYSTEM_PROMPT = `You are a Skill quality evaluator. Score the given Skill on 5 dimensions, each from 0 to 10.

Dimensions:
- safety: Does it avoid harmful, biased, or dangerous instructions?
- completeness: Does it cover the task thoroughly with clear instructions?
- executability: Can an AI follow it without ambiguity?
- maintainability: Is it well-structured, readable, and easy to update?
- costAwareness: Does it avoid unnecessary verbosity that wastes tokens?

Respond with ONLY valid JSON in this exact format:
{"safety":8,"completeness":7,"executability":9,"maintainability":8,"costAwareness":6}`

export function registerStudioHandlers(): void {
  ipcMain.handle('studio:generate', async (_event, prompt: string) => {
    const provider = getAIProvider()
    const result = await withTimeout(
      provider.call({ model: getActiveModel(), systemPrompt: STUDIO_SYSTEM_PROMPT, userMessage: prompt }),
      AI_TIMEOUT_MS,
      'studio:generate'
    )
    return result.content
  })

  ipcMain.handle('studio:evolve', async (event, skillId: string, strategy: string) => {
    const db = getDb()
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    if (!skill) throw new Error(`Skill ${skillId} not found`)

    const history = db.prepare(
      'SELECT scores FROM eval_history WHERE skill_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all(skillId) as { scores: string }[]

    // Aggregate avg score per dimension
    const totals: Record<string, { sum: number; count: number }> = {}
    for (const row of history) {
      try {
        const scores = JSON.parse(row.scores) as Record<string, { score: number }>
        for (const [dim, s] of Object.entries(scores)) {
          if (!totals[dim]) totals[dim] = { sum: 0, count: 0 }
          totals[dim].sum += s.score
          totals[dim].count++
        }
      } catch { /* corrupt row */ }
    }

    const dimAvgs = Object.entries(totals)
      .map(([dim, { sum, count }]) => ({ dim, avg: sum / count }))
      .sort((a, b) => a.avg - b.avg)

    const scoresSummary = dimAvgs.length > 0
      ? `Evaluation scores (${history.length} evals): ${dimAvgs.map(d => `${d.dim}: ${d.avg.toFixed(1)}/10`).join(', ')}`
      : 'No evaluation history available.'

    const strategyHint = STRATEGY_HINTS[strategy] ?? STRATEGY_HINTS.improve_weak

    // Bump minor version
    const currentVersion = (skill.version as string) || '1.0.0'
    const parts = currentVersion.split('.').map(Number)
    parts[1] = (parts[1] || 0) + 1
    const nextVersion = parts.join('.')

    const userMessage =
      `Current Skill (v${currentVersion}):\n\n${skill.markdown_content as string}\n\n` +
      `${scoresSummary}\n\nEvolution strategy: ${strategyHint}\n\n` +
      `Produce the improved Skill at version ${nextVersion}:`

    const provider = getAIProvider()
    await provider.stream(
      { model: getActiveModel(), systemPrompt: EVOLVE_SYSTEM_PROMPT, userMessage },
      (chunk) => event.sender.send('studio:chunk', { chunk, done: false })
    )
    event.sender.send('studio:chunk', { chunk: '', done: true })
  })

  ipcMain.handle('studio:generateFromExamples', async (event, examples: Array<{ input: string; output: string }>, description?: string) => {
    if (!Array.isArray(examples) || examples.length === 0) throw new Error('At least one example is required')
    if (examples.length > 10) throw new Error('Maximum 10 examples allowed')

    const examplesText = examples
      .map((ex, i) => `Example ${i + 1}:\nInput: ${ex.input}\nExpected Output: ${ex.output}`)
      .join('\n\n')
    const descLine = description?.trim() ? `\nAdditional context: ${description.trim()}` : ''
    const userMessage = `Based on these examples, write a Skill:\n\n${examplesText}${descLine}\n\nGenerate the Skill:`

    const provider = getAIProvider()
    await provider.stream(
      { model: getActiveModel(), systemPrompt: EXAMPLES_SYSTEM_PROMPT, userMessage },
      (chunk) => event.sender.send('studio:chunk', { chunk, done: false })
    )
    event.sender.send('studio:chunk', { chunk: '', done: true })
  })

  ipcMain.handle('studio:generateStream', async (event, prompt: string) => {
    const provider = getAIProvider()
    await provider.stream(
      { model: getActiveModel(), systemPrompt: STUDIO_SYSTEM_PROMPT, userMessage: prompt },
      (chunk) => event.sender.send('studio:chunk', { chunk, done: false })
    )
    event.sender.send('studio:chunk', { chunk: '', done: true })
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
    const rootDir = dirname(filePath)
    const skillName = (frontmatter.name as string) || name

    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      skillName,
      (frontmatter.format as string) || 'markdown',
      (frontmatter.version as string) || '1.0.0',
      JSON.stringify((frontmatter.tags as string[]) || []),
      match ? match[1] : '',
      markdownContent,
      filePath,
      rootDir,
      'single',
      1,
      now,
      now
    )

    return {
      id,
      name: skillName,
      format: (frontmatter.format as string) || 'markdown',
      version: (frontmatter.version as string) || '1.0.0',
      tags: (frontmatter.tags as string[]) || [],
      yamlFrontmatter: match ? match[1] : '',
      markdownContent,
      filePath,
      rootDir,
      skillType: 'single',
      trustLevel: 1,
      installedAt: now,
      updatedAt: now
    }
  })

  // Extract Skill from conversation text (AutoSkill-style)
  ipcMain.handle('studio:extract', async (event, conversation: string) => {
    const userMessage = `Conversation to analyze:\n\n${conversation}\n\nExtract a reusable Skill or output NO_SKILL:`
    const provider = getAIProvider()
    let buffer = ''
    await provider.stream(
      { model: getActiveModel(), systemPrompt: EXTRACT_SYSTEM_PROMPT, userMessage },
      (chunk) => {
        buffer += chunk
        event.sender.send('studio:chunk', { chunk, done: false })
      }
    )
    // If AI returned NO_SKILL, signal with a special done payload
    const isNoSkill = buffer.trim() === 'NO_SKILL'
    event.sender.send('studio:chunk', { chunk: '', done: true, noSkill: isNoSkill })
  })

  // Score a Skill on 5 dimensions (SkillNet-style)
  ipcMain.handle('studio:scoreSkill', async (_event, content: string): Promise<SkillScore5D> => {
    const provider = getAIProvider()
    const result = await withTimeout(
      provider.call({ model: getActiveModel(), systemPrompt: SCORE_SYSTEM_PROMPT, userMessage: content }),
      AI_TIMEOUT_MS,
      'studio:scoreSkill'
    )
    try {
      const parsed = JSON.parse(result.content.trim()) as Record<string, number>
      const clamp = (v: unknown) => Math.min(10, Math.max(0, Number(v) || 0))
      return {
        safety:         clamp(parsed.safety),
        completeness:   clamp(parsed.completeness),
        executability:  clamp(parsed.executability),
        maintainability: clamp(parsed.maintainability),
        costAwareness:  clamp(parsed.costAwareness)
      }
    } catch {
      return { safety: 5, completeness: 5, executability: 5, maintainability: 5, costAwareness: 5 }
    }
  })

  // Find similar skills by name/tag overlap
  ipcMain.handle('studio:similarSkills', (_event, content: string) => {
    const db = getDb()
    // Extract name from frontmatter if present
    const nameMatch = content.match(/^---[\s\S]*?name:\s*(.+?)\s*\n/m)
    const tagsMatch = content.match(/^---[\s\S]*?tags:\s*\[([^\]]*)\]/m)
    const name = nameMatch ? nameMatch[1].toLowerCase() : ''
    const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '').toLowerCase()).filter(Boolean) : []

    const rows = db.prepare(`
      SELECT * FROM skills
      WHERE id NOT LIKE 'skill-noskill-%' AND id NOT LIKE 'skill-gen-%'
    `).all() as Record<string, unknown>[]

    return rows
      .filter(r => {
        const rName = (r.name as string).toLowerCase()
        const rTags: string[] = JSON.parse(r.tags as string)
        const nameMatch = name && (rName.includes(name) || name.includes(rName))
        const tagOverlap = tags.some(t => rTags.includes(t))
        return nameMatch || tagOverlap
      })
      .slice(0, 5)
      .map(r => ({
        id: r.id as string,
        name: r.name as string,
        format: r.format as string,
        version: r.version as string,
        tags: JSON.parse(r.tags as string),
        yamlFrontmatter: r.yaml_frontmatter as string,
        markdownContent: r.markdown_content as string,
        filePath: r.file_path as string,
        rootDir: (r.root_dir as string) || '',
        skillType: ((r.skill_type as string) || 'single'),
        trustLevel: (r.trust_level as number) || 1,
        installedAt: r.installed_at as number,
        updatedAt: r.updated_at as number
      }))
  })
}
