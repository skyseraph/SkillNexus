import { getDb } from '../db'
import { getActiveModel, getActiveProviderName } from '../ipc/config.handler'
import type { EvalScore } from '../../shared/types'

export interface InsertEvalHistoryParams {
  skillId: string
  jobId?: string
  input: string
  output: string
  scores: Record<string, EvalScore>
  totalScore: number
  durationMs: number
  status: 'success' | 'error'
  testCaseId?: string
  testCaseName?: string
}

export function insertEvalHistory(params: InsertEvalHistoryParams): string {
  const { skillId, jobId, input, output, scores, totalScore, durationMs, status, testCaseId, testCaseName } = params
  const db = getDb()
  const evalId = `er-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()
  db.prepare(`
    INSERT INTO eval_history (id, skill_id, job_id, model, provider, input_prompt, output, scores, total_score, duration_ms, status, created_at, test_case_id, test_case_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    evalId, skillId, jobId ?? null,
    getActiveModel(),
    getActiveProviderName(),
    input, output,
    JSON.stringify(scores),
    totalScore, durationMs, status, now,
    testCaseId ?? null,
    testCaseName ?? null
  )
  return evalId
}
