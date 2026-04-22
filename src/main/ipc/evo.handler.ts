import { ipcMain } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname, basename } from 'path'
import { app } from 'electron'
import yaml from 'js-yaml'
import { getDb } from '../db'
import { runEvalJob, MAX_TEST_CASES } from '../services/eval-job'
import type { EvoRunResult, Skill, SkillType } from '../../shared/types'

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

    // Install evolved skill
    const skillsDir = join(app.getPath('userData'), 'skills', 'evolved')
    mkdirSync(skillsDir, { recursive: true })

    const match = evolvedContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    let frontmatter: Record<string, unknown> = {}
    let markdownContent = evolvedContent
    if (match) {
      frontmatter = (yaml.load(match[1]) as Record<string, unknown>) || {}
      markdownContent = match[2]
    }

    const evolvedName = (frontmatter.name as string) || `${original.name as string} (evolved)`
    const safeName = basename(evolvedName.replace(/[^a-zA-Z0-9_\- ]/g, '')).replace(/\s+/g, '-').toLowerCase() || 'evolved-skill'
    const filePath = resolve(join(skillsDir, `${safeName}-${Date.now()}.md`))
    writeFileSync(filePath, evolvedContent, 'utf-8')

    const now = Date.now()
    const evolvedId = `skill-${now}-${Math.random().toString(36).slice(2, 8)}`
    const rootDir = dirname(filePath)

    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evolvedId, evolvedName,
      (frontmatter.format as string) || 'markdown',
      (frontmatter.version as string) || '1.0.0',
      JSON.stringify((frontmatter.tags as string[]) || []),
      match ? match[1] : '',
      markdownContent,
      filePath, rootDir, 'single', 1, now, now
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
      Promise.allSettled([
        runEvalJob(originalJobId, originalSkillId, original.markdown_content as string, testCases),
        runEvalJob(evolvedJobId, evolvedId, markdownContent, testCases)
      ]).catch(() => {})
    })

    return { evolvedSkill, originalJobId, evolvedJobId }
  })
}
