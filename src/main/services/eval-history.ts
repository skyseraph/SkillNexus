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
  contentHash?: string
  evalMode?: 'llm' | 'structural' | 'grep' | 'command'
}

export function insertEvalHistory(params: InsertEvalHistoryParams): string {
  const { skillId, jobId, input, output, scores, totalScore, durationMs, status, testCaseId, testCaseName, contentHash, evalMode } = params
  const db = getDb()
  const evalId = `er-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()
  db.prepare(`
    INSERT INTO eval_history (id, skill_id, job_id, model, provider, input_prompt, output, scores, total_score, duration_ms, status, created_at, test_case_id, test_case_name, content_hash, eval_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    evalId, skillId, jobId ?? null,
    getActiveModel(),
    getActiveProviderName(),
    input, output,
    JSON.stringify(scores),
    totalScore, durationMs, status, now,
    testCaseId ?? null,
    testCaseName ?? null,
    contentHash ?? null,
    evalMode ?? 'llm'
  )
  return evalId
}

export function findCachedEval(
  skillId: string,
  testCaseId: string,
  contentHash: string
): { output: string; scores: Record<string, EvalScore>; totalScore: number } | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT output, scores, total_score
    FROM eval_history
    WHERE skill_id = ? AND test_case_id = ? AND content_hash = ? AND status = 'success'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(skillId, testCaseId, contentHash) as Record<string, unknown> | undefined
  if (!row) return null
  try {
    return {
      output: row.output as string,
      scores: JSON.parse(row.scores as string) as Record<string, EvalScore>,
      totalScore: row.total_score as number
    }
  } catch {
    return null
  }
}
