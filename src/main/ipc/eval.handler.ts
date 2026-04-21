import { ipcMain } from 'electron'
import { getDb } from '../db'
import { getAIProvider } from '../services/ai-provider'
import { getMainWindow } from '../index'
import type { EvalScore } from '../../shared/types'

const EVAL_DIMENSIONS = ['correctness', 'clarity', 'completeness', 'safety']
const MAX_TEST_CASES = 50
const AI_TIMEOUT_MS = 30_000

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
  const result = await withTimeout(
    provider.call({
      model: 'claude-haiku-4-5-20251001',
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

export function registerEvalHandlers(): void {
  ipcMain.handle('eval:start', async (_event, skillId: string, testCaseIds: string[]) => {
    // SEC-05: cap testCaseIds to prevent resource exhaustion
    if (!Array.isArray(testCaseIds) || testCaseIds.length > MAX_TEST_CASES) {
      throw new Error(`testCaseIds must be an array of at most ${MAX_TEST_CASES} items`)
    }

    const db = getDb()
    const jobId = `eval-${Date.now()}`
    const win = getMainWindow()

    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    if (!skill) throw new Error(`Skill ${skillId} not found`)

    // If no specific IDs provided, run all test cases for this skill (up to MAX_TEST_CASES)
    const testCases = testCaseIds.length > 0
      ? (db.prepare(`SELECT * FROM test_cases WHERE id IN (${testCaseIds.map(() => '?').join(',')}) AND skill_id = ?`).all(...testCaseIds, skillId) as Record<string, unknown>[])
      : (db.prepare('SELECT * FROM test_cases WHERE skill_id = ? LIMIT ?').all(skillId, MAX_TEST_CASES) as Record<string, unknown>[])

    if (testCases.length === 0) {
      win?.webContents.send('eval:progress', { jobId, progress: 100, message: 'No test cases found' })
      return jobId
    }

    setImmediate(async () => {
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

          // SEC-06: timeout on AI call
          const response = await withTimeout(
            provider.call({
              model: 'claude-haiku-4-5-20251001',
              systemPrompt: skill.markdown_content as string,
              userMessage: tc.input as string
            }),
            AI_TIMEOUT_MS,
            'skill-execution'
          )
          output = response.content

          const scoreEntries = await Promise.all(
            EVAL_DIMENSIONS.map(async (dim) => {
              const s = await judgeOneDimension(dim, skill.markdown_content as string, tc.input as string, output)
              return [dim, s] as [string, EvalScore]
            })
          )

          scores = Object.fromEntries(scoreEntries)
          totalScore = Object.values(scores).reduce((sum, s) => sum + s.score, 0) / EVAL_DIMENSIONS.length
        } catch (err) {
          status = 'error'
          errorMsg = err instanceof Error ? err.message : String(err)
        }

        // PROD-01: always write history record — even on error
        const evalId = `er-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const now = Date.now()
        db.prepare(`
          INSERT INTO eval_history (id, skill_id, model, provider, input_prompt, output, scores, total_score, duration_ms, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          evalId, skillId, 'claude-haiku-4-5-20251001', 'anthropic',
          tc.input as string,
          status === 'error' ? errorMsg : output,
          JSON.stringify(scores),
          totalScore,
          Date.now() - start,
          status,
          now
        )

        completed++
        win?.webContents.send('eval:progress', {
          jobId,
          progress: Math.round((completed / testCases.length) * 100),
          message: `Evaluated ${completed}/${testCases.length}${status === 'error' ? ' (error)' : ''}`
        })
      }
    })

    return jobId
  })

  ipcMain.handle('eval:history', (_event, skillId: string) => {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM eval_history WHERE skill_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(skillId) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id,
      skillId: r.skill_id,
      model: r.model,
      provider: r.provider,
      inputPrompt: r.input_prompt,
      output: r.output,
      scores: JSON.parse(r.scores as string),
      totalScore: r.total_score,
      durationMs: r.duration_ms,
      status: r.status,
      createdAt: r.created_at
    }))
  })
}
