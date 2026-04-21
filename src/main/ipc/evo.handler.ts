import { ipcMain } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname, basename } from 'path'
import { app } from 'electron'
import yaml from 'js-yaml'
import { getDb } from '../db'
import { getAIProvider } from '../services/ai-provider'
import { getConfig } from './config.handler'
import { insertEvalHistory } from '../services/eval-history'
import { getMainWindow } from '../index'
import type { EvalScore, EvoRunResult, Skill, SkillType } from '../../shared/types'

const EVAL_DIMENSIONS = ['correctness', 'clarity', 'completeness', 'safety']
const AI_TIMEOUT_MS = 30_000
const MAX_TEST_CASES = 50

const JUDGE_SYSTEM_PROMPT = `You are an expert Skill evaluator. Score the AI response on the given dimension from 0 to 10.
Respond in JSON format: {"score": number, "violations": string[], "details": string}`

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

async function judgeOneDimension(
  dimension: string,
  skillContent: string,
  input: string,
  output: string
): Promise<EvalScore> {
  const provider = getAIProvider()
  const model = getConfig().defaultModel
  const result = await withTimeout(
    provider.call({
      model,
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      userMessage: `Dimension: ${dimension}\n\nSkill:\n${skillContent}\n\nInput:\n${input}\n\nOutput:\n${output}`
    }),
    AI_TIMEOUT_MS,
    `judge:${dimension}`
  )
  try {
    return JSON.parse(result.content) as EvalScore
  } catch {
    return { score: 5, violations: [], details: result.content }
  }
}

async function runEvalJob(
  jobId: string,
  skillId: string,
  skillContent: string,
  testCases: Record<string, unknown>[]
): Promise<void> {
  const db = getDb()
  const win = getMainWindow()
  let completed = 0

  for (const tc of testCases) {
    const start = Date.now()
    let status: 'success' | 'error' = 'success'
    let errorMsg = ''
    let output = ''
    let scores: Record<string, EvalScore> = {}
    let totalScore = 0

    try {
      const provider = getAIProvider()
      const model = getConfig().defaultModel
      const response = await withTimeout(
        provider.call({ model, systemPrompt: skillContent, userMessage: tc.input as string }),
        AI_TIMEOUT_MS,
        'skill-execution'
      )
      output = response.content

      const scoreEntries = await Promise.all(
        EVAL_DIMENSIONS.map(async (dim) => {
          const s = await judgeOneDimension(dim, skillContent, tc.input as string, output)
          return [dim, s] as [string, EvalScore]
        })
      )
      scores = Object.fromEntries(scoreEntries)
      totalScore = Object.values(scores).reduce((sum, s) => sum + s.score, 0) / EVAL_DIMENSIONS.length
    } catch (err) {
      status = 'error'
      errorMsg = err instanceof Error ? err.message : String(err)
    }

    const evalId = insertEvalHistory({
      skillId,
      input: tc.input as string,
      output: status === 'error' ? errorMsg : output,
      scores,
      totalScore,
      durationMs: Date.now() - start,
      status
    })

    completed++
    win?.webContents.send('eval:progress', {
      jobId,
      progress: Math.round((completed / testCases.length) * 100),
      message: `Evaluated ${completed}/${testCases.length}${status === 'error' ? ' (error)' : ''}`
    })
  }
}

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
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evolvedId, evolvedName,
      (frontmatter.format as string) || 'markdown',
      (frontmatter.version as string) || '1.0.0',
      JSON.stringify((frontmatter.tags as string[]) || []),
      match ? match[1] : '',
      markdownContent,
      filePath, rootDir, 'single', now, now
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
