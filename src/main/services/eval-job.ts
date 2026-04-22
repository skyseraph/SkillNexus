import { getAIProvider } from './ai-provider'
import { getActiveModel } from '../ipc/config.handler'
import { insertEvalHistory } from './eval-history'
import { getMainWindow } from '../index'
import type { EvalScore } from '../../shared/types'

export const EVAL_DIMENSIONS = ['correctness', 'clarity', 'completeness', 'safety']
export const AI_TIMEOUT_MS = 30_000
export const MAX_TEST_CASES = 50

const JUDGE_SYSTEM_PROMPT = `You are an expert Skill evaluator. Score the AI response on the given dimension from 0 to 10.
Respond in JSON format: {"score": number, "violations": string[], "details": string}`

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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

export async function judgeOneDimension(
  dimension: string,
  skillContent: string,
  input: string,
  output: string
): Promise<EvalScore> {
  const provider = getAIProvider()
  const model = getActiveModel()
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

export async function runEvalJob(
  jobId: string,
  skillId: string,
  skillContent: string,
  testCases: Record<string, unknown>[]
): Promise<void> {
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
      const model = getActiveModel()
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
    insertEvalHistory({
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
