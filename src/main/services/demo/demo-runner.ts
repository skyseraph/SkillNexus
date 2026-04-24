import type { IpcMainInvokeEvent } from 'electron'
import {
  DEMO_EVOLVED_STREAM,
  DEMO_EVOLVED_CONTENT,
} from './demo-data'

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function chunkify(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

function parseAnalysis(raw: string): { rootCause: string; generalityTest: string; regressionRisk: string } | null {
  const match = raw.match(/<!--ANALYSIS\s*([\s\S]*?)-->/)
  if (!match) return null
  const body = match[1]
  const rootCause = body.match(/ROOT_CAUSE:\s*(.+)/)?.[1]?.trim() ?? ''
  const generalityTest = body.match(/GENERALITY_TEST:\s*(.+)/)?.[1]?.trim() ?? ''
  const regressionRisk = body.match(/REGRESSION_RISK:\s*(.+)/)?.[1]?.trim() ?? ''
  return { rootCause, generalityTest, regressionRisk }
}

/**
 * Simulates studio:evolve streaming for Demo mode.
 * Emits studio:analysis once, then streams evolved content as studio:chunk events.
 */
export async function runDemoEvolve(event: IpcMainInvokeEvent): Promise<void> {
  // Phase 1: simulate "analyzing" delay
  await delay(900)

  // Emit analysis event
  const analysis = parseAnalysis(DEMO_EVOLVED_STREAM)
  if (analysis) {
    event.sender.send('studio:analysis', analysis)
  }

  await delay(200)

  // Phase 2: stream evolved content char by char (8 chars per chunk)
  const content = DEMO_EVOLVED_CONTENT
  for (const chunk of chunkify(content, 8)) {
    await delay(18)
    event.sender.send('studio:chunk', { chunk, done: false })
  }

  event.sender.send('studio:chunk', { chunk: '', done: true })
}

/**
 * Simulates SkillClaw progress events for Demo mode.
 */
export async function runDemoSkillClawProgress(event: IpcMainInvokeEvent): Promise<void> {
  const steps = [
    { step: 1, total: 4, message: '加载历史记录...' },
    { step: 2, total: 4, message: '识别共同失败模式...' },
    { step: 3, total: 4, message: '生成改进版 Skill...' },
    { step: 4, total: 4, message: '完成', done: true },
  ]
  for (const s of steps) {
    await delay(600)
    event.sender.send('studio:progress', { stage: 'skillclaw', ...s })
  }
}

/**
 * Simulates EvoSkill iteration progress events for Demo mode.
 */
export async function runDemoEvoSkillProgress(event: IpcMainInvokeEvent, iterations: number): Promise<void> {
  for (let i = 1; i <= iterations; i++) {
    await delay(700)
    event.sender.send('studio:progress', {
      stage: 'evoskill',
      iteration: i,
      total: iterations,
      done: i === iterations
    })
  }
}

/**
 * Simulates eval:progress events for Demo mode (both original and evolved jobs).
 */
export async function runDemoEvalProgress(
  event: IpcMainInvokeEvent,
  originalJobId: string,
  evolvedJobId: string,
  origScores: Record<string, number>,
  evolvedScores: Record<string, number>
): Promise<void> {
  const steps = [20, 40, 60, 80, 100]
  for (const progress of steps) {
    await delay(400)
    event.sender.send('eval:progress', { jobId: originalJobId, progress, message: `评测原版 ${progress}%` })
    event.sender.send('eval:progress', { jobId: evolvedJobId, progress, message: `评测进化版 ${progress}%` })
  }
  // Emit final scores
  event.sender.send('eval:progress', {
    jobId: originalJobId, progress: 100, message: '完成',
    scores: origScores, done: true
  })
  event.sender.send('eval:progress', {
    jobId: evolvedJobId, progress: 100, message: '完成',
    scores: evolvedScores, done: true
  })
}
