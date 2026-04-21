import { getDb } from '../db'
import { getConfig } from '../ipc/config.handler'
import type { EvalScore } from '../../shared/types'

export interface InsertEvalHistoryParams {
  skillId: string
  input: string
  output: string
  scores: Record<string, EvalScore>
  totalScore: number
  durationMs: number
  status: 'success' | 'error'
}

export function insertEvalHistory(params: InsertEvalHistoryParams): string {
  const { skillId, input, output, scores, totalScore, durationMs, status } = params
  const db = getDb()
  const cfg = getConfig()
  const evalId = `er-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()
  db.prepare(`
    INSERT INTO eval_history (id, skill_id, model, provider, input_prompt, output, scores, total_score, duration_ms, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    evalId, skillId,
    cfg.defaultModel,
    cfg.defaultProvider ?? 'anthropic',
    input, output,
    JSON.stringify(scores),
    totalScore, durationMs, status, now
  )
  return evalId
}
