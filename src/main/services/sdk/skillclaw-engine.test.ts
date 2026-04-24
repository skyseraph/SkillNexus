import { describe, it, expect, vi } from 'vitest'
import { SkillClawEngine } from './skillclaw-engine'
import type { IDataStore, IProgressReporter, ISkillStorage } from './interfaces'
import type { AIProvider } from '../ai-provider/types'

vi.mock('../eval-job', () => ({
  AI_TIMEOUT_MS: 30000,
  withTimeout: vi.fn().mockImplementation((p: Promise<unknown>) => p),
}))

const skillRow = { id: 's1', name: 'Test', version: '1.0', markdown_content: '# Test', skill_type: 'single' }

const makeStore = (overrides: Partial<IDataStore> = {}): IDataStore => ({
  queryEvalHistory: vi.fn().mockReturnValue([]),
  querySkill: vi.fn().mockReturnValue(skillRow),
  queryTestCases: vi.fn().mockReturnValue([]),
  querySkillChain: vi.fn().mockReturnValue([]),
  ...overrides,
})
const makeReporter = (): IProgressReporter => ({ report: vi.fn() })
const makeStorage = (): ISkillStorage => ({
  saveEvolvedSkill: vi.fn().mockReturnValue('evolved-1'),
  copyTestCases: vi.fn(),
})
const makeAI = (response = '{"commonFailures":["missing edge case"],"improvementSummary":"needs improvement"}'): AIProvider =>
  ({ call: vi.fn().mockResolvedValue({ content: response }) } as unknown as AIProvider)

const weakRecords = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    input_prompt: `input${i}`, output: `output${i}`, total_score: 4, status: 'success', scores: '{}'
  }))

const goodRecords = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    input_prompt: `input${i}`, output: `output${i}`, total_score: 9, status: 'success', scores: '{}'
  }))

describe('SkillClawEngine', () => {
  it('throws when skill not found', async () => {
    const store = makeStore({ querySkill: vi.fn().mockReturnValue(undefined) })
    const engine = new SkillClawEngine(makeAI(), 'model', store, makeReporter(), makeStorage())
    await expect(engine.run({ skillId: 's1' })).rejects.toThrow('not found')
  })

  it('throws when no eval history', async () => {
    const engine = new SkillClawEngine(makeAI(), 'model', makeStore(), makeReporter(), makeStorage())
    await expect(engine.run({ skillId: 's1' })).rejects.toThrow('No eval history')
  })

  it('returns early without evolving when skill performs well', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue(goodRecords(10)) })
    const storage = makeStorage()
    const engine = new SkillClawEngine(makeAI(), 'model', store, makeReporter(), storage)
    const result = await engine.run({ skillId: 's1' })
    expect(storage.saveEvolvedSkill).not.toHaveBeenCalled()
    expect(result.evolvedSkillId).toBe('')
    expect(result.improvementSummary).toContain('良好')
  })

  it('identifies common failures and calls AI when weak records exist', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue(weakRecords(5)) })
    const ai = makeAI()
    const engine = new SkillClawEngine(ai, 'model', store, makeReporter(), makeStorage())
    const result = await engine.run({ skillId: 's1' })
    expect(result.commonFailures).toContain('missing edge case')
  })

  it('saves evolved skill with engine=skillclaw', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue(weakRecords(3)) })
    const ai = { call: vi.fn()
      .mockResolvedValueOnce({ content: '{"commonFailures":["f1"],"improvementSummary":"fix it"}' })
      .mockResolvedValueOnce({ content: '# Improved' })
    } as unknown as AIProvider
    const storage = makeStorage()
    const engine = new SkillClawEngine(ai, 'model', store, makeReporter(), storage)
    await engine.run({ skillId: 's1' })
    expect(storage.saveEvolvedSkill).toHaveBeenCalledWith(expect.objectContaining({ engine: 'skillclaw' }))
  })

  it('reports progress 4 steps', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue(weakRecords(3)) })
    const ai = { call: vi.fn()
      .mockResolvedValueOnce({ content: '{"commonFailures":["f1"],"improvementSummary":"fix"}' })
      .mockResolvedValueOnce({ content: '# Improved' })
    } as unknown as AIProvider
    const reporter = makeReporter()
    const engine = new SkillClawEngine(ai, 'model', store, reporter, makeStorage())
    await engine.run({ skillId: 's1' })
    expect(reporter.report).toHaveBeenCalledTimes(4)
  })

  it('handles JSON parse failure gracefully', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue(weakRecords(3)) })
    const ai = { call: vi.fn()
      .mockResolvedValueOnce({ content: 'not json' })
      .mockResolvedValueOnce({ content: '# Improved' })
    } as unknown as AIProvider
    const engine = new SkillClawEngine(ai, 'model', store, makeReporter(), makeStorage())
    const result = await engine.run({ skillId: 's1' })
    expect(result.commonFailures).toEqual(expect.arrayContaining([expect.any(String)]))
  })
})
