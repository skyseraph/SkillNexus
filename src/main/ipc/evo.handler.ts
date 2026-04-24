import { ipcMain } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname, basename } from 'path'
import { app } from 'electron'
import yaml from 'js-yaml'
import { getDb } from '../db'
import { runEvalJob, runAgentEvalJob, MAX_TEST_CASES, withTimeout, AI_TIMEOUT_MS } from '../services/eval-job'
import { runEvoSkill } from '../services/evoskill'
import { computeParetoFrontier } from '../services/skillmoo'
import { runCoEvo } from '../services/coevoskill'
import { runSkillX } from '../services/skillx'
import { runSkillClaw } from '../services/skillclaw'
import { getConfig, getActiveModel } from './config.handler'
import { getAIProvider } from '../services/ai-provider'
import type { EvoRunResult, EvoSkillResult, ParetoPoint, CoEvoResult, TransferReport, SkillXResult, SkillClawResult, Skill, SkillType } from '../../shared/types'

export function registerEvoHandlers(): void {
  // Install evolved skill + run parallel eval on original vs evolved
  ipcMain.handle('evo:installAndEval', async (
    _event,
    originalSkillId: string,
    evolvedContent: string
  ): Promise<EvoRunResult> => {
    const db = getDb()

    const original = db.prepare('SELECT * FROM skills WHERE id = ?').get(originalSkillId) as Record<string, unknown> | undefined
    if (!original) throw new Error(`Skill ${originalSkillId} not found`)

    // Strip optimizer analysis comment block before installing
    const strippedContent = evolvedContent.replace(/<!--ANALYSIS[\s\S]*?-->\s*/m, '')

    // Parse ANALYSIS block for persistent storage
    const analysisMatch = evolvedContent.match(/<!--ANALYSIS\s*([\s\S]*?)-->/)
    let evolutionNotes: string | null = null
    if (analysisMatch) {
      const body = analysisMatch[1]
      const rootCause = body.match(/ROOT_CAUSE:\s*(.+)/)?.[1]?.trim() ?? ''
      const generalityTest = body.match(/GENERALITY_TEST:\s*(.+)/)?.[1]?.trim() ?? ''
      const regressionRisk = body.match(/REGRESSION_RISK:\s*(.+)/)?.[1]?.trim() ?? ''
      evolutionNotes = JSON.stringify({ rootCause, generalityTest, regressionRisk })
    }

    // Install evolved skill
    const skillsDir = join(app.getPath('userData'), 'skills', 'evolved')
    mkdirSync(skillsDir, { recursive: true })

    const match = strippedContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    let frontmatter: Record<string, unknown> = {}
    let markdownContent = strippedContent
    if (match) {
      frontmatter = (yaml.load(match[1]) as Record<string, unknown>) || {}
      markdownContent = match[2]
    }

    const evolvedName = (frontmatter.name as string) || `${original.name as string} (evolved)`
    const safeName = basename(evolvedName.replace(/[^a-zA-Z0-9_\- ]/g, '')).replace(/\s+/g, '-').toLowerCase() || 'evolved-skill'
    const filePath = resolve(join(skillsDir, `${safeName}-${Date.now()}.md`))
    writeFileSync(filePath, strippedContent, 'utf-8')

    const now = Date.now()
    const evolvedId = `skill-${now}-${Math.random().toString(36).slice(2, 8)}`
    const rootDir = dirname(filePath)

    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, parent_skill_id, evolution_notes, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evolvedId, evolvedName,
      (frontmatter.format as string) || 'markdown',
      (frontmatter.version as string) || '1.0.0',
      JSON.stringify((frontmatter.tags as string[]) || []),
      match ? match[1] : '',
      markdownContent,
      filePath, rootDir, 'single', 1, originalSkillId, evolutionNotes, now, now
    )

    const evolvedSkill: Skill = {
      id: evolvedId,
      name: evolvedName,
      format: (frontmatter.format as string) || 'markdown',
      version: (frontmatter.version as string) || '1.0.0',
      tags: (frontmatter.tags as string[]) || [],
      yamlFrontmatter: match ? match[1] : '',
      markdownContent,
      filePath,
      rootDir,
      skillType: 'single' as SkillType,
      trustLevel: 1,
      installedAt: now,
      updatedAt: now
    }

    // Copy test cases from original to evolved skill
    const testCases = db.prepare(
      'SELECT * FROM test_cases WHERE skill_id = ? LIMIT ?'
    ).all(originalSkillId, MAX_TEST_CASES) as Record<string, unknown>[]

    for (const tc of testCases) {
      const newId = `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      db.prepare(`
        INSERT INTO test_cases (id, skill_id, name, input, judge_type, judge_param, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(newId, evolvedId, tc.name, tc.input, tc.judge_type, tc.judge_param, Date.now())
    }

    if (testCases.length === 0) {
      return { evolvedSkill, originalJobId: '', evolvedJobId: '' }
    }

    // Run both evals in parallel (background)
    const originalJobId = `evo-orig-${Date.now()}`
    const evolvedJobId = `evo-evol-${Date.now()}`

    setImmediate(() => {
      const isAgent = (original.skill_type as string) === 'agent'
      Promise.allSettled([
        isAgent
          ? runAgentEvalJob(originalJobId, originalSkillId, original, testCases)
          : runEvalJob(originalJobId, originalSkillId, original.markdown_content as string, testCases),
        isAgent
          ? runAgentEvalJob(evolvedJobId, evolvedId, { ...original, markdown_content: markdownContent, skill_type: 'agent' }, testCases)
          : runEvalJob(evolvedJobId, evolvedId, markdownContent, testCases)
      ]).catch(() => {})
    })

    return { evolvedSkill, originalJobId, evolvedJobId }
  })

  ipcMain.handle('evo:runEvoSkill', async (
    _event,
    config: { skillId: string; maxIterations?: number }
  ): Promise<EvoSkillResult> => {
    if (!config.skillId) throw new Error('skillId is required')
    const db = getDb()
    const exists = db.prepare('SELECT id FROM skills WHERE id = ?').get(config.skillId)
    if (!exists) throw new Error(`Skill ${config.skillId} not found`)
    return runEvoSkill(config)
  })

  ipcMain.handle('evo:getParetoFrontier', (
    _event,
    skillId: string
  ): ParetoPoint[] => {
    const db = getDb()
    const exists = db.prepare('SELECT id FROM skills WHERE id = ?').get(skillId)
    if (!exists) throw new Error(`Skill ${skillId} not found`)
    return computeParetoFrontier(skillId)
  })

  ipcMain.handle('evo:runCoEvo', async (
    _event,
    config: { skillId: string; maxRounds?: number }
  ): Promise<CoEvoResult> => {
    if (!config.skillId) throw new Error('skillId is required')
    const db = getDb()
    const exists = db.prepare('SELECT id FROM skills WHERE id = ?').get(config.skillId)
    if (!exists) throw new Error(`Skill ${config.skillId} not found`)
    return runCoEvo(config)
  })

  ipcMain.handle('evo:runTransferTest', async (
    _event,
    skillId: string,
    models: string[]
  ): Promise<TransferReport> => {
    const db = getDb()
    const skillRow = db.prepare('SELECT markdown_content FROM skills WHERE id = ?').get(skillId) as
      { markdown_content: string } | undefined
    if (!skillRow) throw new Error(`Skill ${skillId} not found`)

    const cfg = getConfig()
    const allowedIds = new Set(cfg.providers.map(p => p.id))
    const validModels = models.filter(m => allowedIds.has(m))
    if (validModels.length === 0) throw new Error('No valid configured provider IDs provided')

    const testCases = db.prepare(
      'SELECT input FROM test_cases WHERE skill_id = ? LIMIT 10'
    ).all(skillId) as { input: string }[]

    const results: Record<string, number> = {}
    for (const modelId of validModels) {
      const provider = cfg.providers.find(p => p.id === modelId)
      if (!provider) continue
      let pass = 0
      for (const tc of testCases) {
        try {
          const aiProvider = getAIProvider()
          const resp = await withTimeout(
            aiProvider.call({ model: provider.model, systemPrompt: skillRow.markdown_content, userMessage: tc.input }),
            AI_TIMEOUT_MS,
            `transfer:${modelId}`
          )
          if (resp.content && resp.content.length > 0) pass++
        } catch { /* count as fail */ }
      }
      results[modelId] = testCases.length > 0 ? pass / testCases.length : 0
    }

    return { results }
  })

  ipcMain.handle('evo:runSkillX', async (
    _event,
    config: { skillId: string; minScore?: number; sampleLimit?: number }
  ): Promise<SkillXResult> => {
    if (!config.skillId) throw new Error('skillId is required')
    const db = getDb()
    if (!db.prepare('SELECT id FROM skills WHERE id = ?').get(config.skillId)) {
      throw new Error(`Skill ${config.skillId} not found`)
    }
    return runSkillX(config)
  })

  ipcMain.handle('evo:runSkillClaw', async (
    _event,
    config: { skillId: string; windowSize?: number }
  ): Promise<SkillClawResult> => {
    if (!config.skillId) throw new Error('skillId is required')
    const db = getDb()
    if (!db.prepare('SELECT id FROM skills WHERE id = ?').get(config.skillId)) {
      throw new Error(`Skill ${config.skillId} not found`)
    }
    return runSkillClaw(config)
  })
}
