import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EvoSkillEngine } from './evoskill-engine'
import type { IDataStore, IProgressReporter, ISkillStorage } from './interfaces'
import type { AIProvider } from '../ai-provider/types'

vi.mock('../eval-job', () => ({
  runEvalJob: vi.fn().mockResolvedValue(undefined),
  AI_TIMEOUT_MS: 30000,
  withTimeout: vi.fn().mockImplementation((p: Promise<unknown>) => p),
}))

beforeEach(() => { vi.clearAllMocks() })

const makeStore = (overrides: Partial<IDataStore> = {}): IDataStore => ({
  queryEvalHistory: vi.fn().mockReturnValue([]),
  querySkill: vi.fn().mockReturnValue({ id: 's1', name: 'Test', version: '1.0', markdown_content: '# Test', skill_type: 'single' }),
  queryTestCases: vi.fn().mockReturnValue([{ id: 'tc1', name: 'case1', input: 'hello', judge_type: 'llm', judge_param: '' }]),
  querySkillChain: vi.fn().mockReturnValue([]),
  ...overrides,
})
const makeReporter = (): IProgressReporter => ({ report: vi.fn() })
const makeStorage = (): ISkillStorage => ({
  saveEvolvedSkill: vi.fn().mockReturnValue('evolved-1'),
  copyTestCases: vi.fn(),
})
const makeAI = (response = '# Improved\nContent'): AIProvider => ({
  call: vi.fn().mockResolvedValue({ content: response }),
} as unknown as AIProvider)

describe('EvoSkillEngine', () => {
  it('throws when skill not found', async () => {
    const store = makeStore({ querySkill: vi.fn().mockReturnValue(undefined) })
    const engine = new EvoSkillEngine(makeAI(), 'model', store, makeReporter(), makeStorage())
    await expect(engine.run({ skillId: 's1' })).rejects.toThrow('not found')
  })

  it('runs N iterations and saves N evolved skills', async () => {
    const storage = makeStorage()
    const engine = new EvoSkillEngine(makeAI(), 'model', makeStore(), makeReporter(), storage)
    await engine.run({ skillId: 's1', maxIterations: 3 })
    expect(storage.saveEvolvedSkill).toHaveBeenCalledTimes(3)
  })

  it('frontier does not exceed MAX_FRONTIER (5)', async () => {
    const storage = makeStorage()
    let callCount = 0
    const storageWithIds = {
      ...storage,
      saveEvolvedSkill: vi.fn().mockImplementation(() => `evolved-${++callCount}`),
    }
    const engine = new EvoSkillEngine(makeAI(), 'model', makeStore(), makeReporter(), storageWithIds)
    const result = await engine.run({ skillId: 's1', maxIterations: 8 })
    expect(result.frontierIds.length).toBeLessThanOrEqual(5)
  })

  it('returns bestId as the highest-scoring frontier node', async () => {
    const store = makeStore({
      queryEvalHistory: vi.fn().mockImplementation((skillId: string) => {
        if (skillId === 'evolved-2') return [{ input_prompt: 'x', output: 'y', total_score: 9, status: 'success', scores: JSON.stringify({ a: { score: 9 } }) }]
        return [{ input_prompt: 'x', output: 'y', total_score: 5, status: 'success', scores: JSON.stringify({ a: { score: 5 } }) }]
      }),
    })
    let count = 0
    const storage = {
      saveEvolvedSkill: vi.fn().mockImplementation(() => `evolved-${++count}`),
      copyTestCases: vi.fn(),
    }
    const engine = new EvoSkillEngine(makeAI(), 'model', store, makeReporter(), storage)
    const result = await engine.run({ skillId: 's1', maxIterations: 2 })
    expect(result.bestId).toBe('evolved-2')
  })

  it('skips eval when no test cases', async () => {
    const { runEvalJob } = await import('../eval-job')
    const store = makeStore({ queryTestCases: vi.fn().mockReturnValue([]) })
    const engine = new EvoSkillEngine(makeAI(), 'model', store, makeReporter(), makeStorage())
    await engine.run({ skillId: 's1', maxIterations: 2 })
    expect(runEvalJob).not.toHaveBeenCalled()
  })

  it('reports progress each iteration', async () => {
    const reporter = makeReporter()
    const engine = new EvoSkillEngine(makeAI(), 'model', makeStore(), reporter, makeStorage())
    await engine.run({ skillId: 's1', maxIterations: 3 })
    expect(reporter.report).toHaveBeenCalledTimes(4) // 3 iterations + 1 done
  })

  it('final progress report contains done:true', async () => {
    const reporter = makeReporter()
    const engine = new EvoSkillEngine(makeAI(), 'model', makeStore(), reporter, makeStorage())
    await engine.run({ skillId: 's1', maxIterations: 2 })
    const calls = (reporter.report as ReturnType<typeof vi.fn>).mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]).toMatchObject({ done: true })
  })
})
