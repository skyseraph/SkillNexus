import { describe, it, expect, vi } from 'vitest'
import { SkillXEngine } from './skillx-engine'
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
const makeAI = (response = '{"entries":[{"level":1,"levelName":"planning","content":"plan","sourceCount":2}]}'): AIProvider =>
  ({ call: vi.fn().mockResolvedValue({ content: response }) } as unknown as AIProvider)

const highScoreSamples = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    input_prompt: `input${i}`, output: `output${i}`, total_score: 8, status: 'success', scores: '{}'
  }))

describe('SkillXEngine', () => {
  it('throws when skill not found', async () => {
    const store = makeStore({ querySkill: vi.fn().mockReturnValue(undefined) })
    const engine = new SkillXEngine(makeAI(), 'model', store, makeReporter(), makeStorage())
    await expect(engine.run({ skillId: 's1' })).rejects.toThrow('not found')
  })

  it('throws when insufficient high-score samples after retries', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue([]) })
    const engine = new SkillXEngine(makeAI(), 'model', store, makeReporter(), makeStorage())
    await expect(engine.run({ skillId: 's1', minScore: 7 })).rejects.toThrow('Insufficient')
  })

  it('retries with lower minScore when samples insufficient', async () => {
    const store = makeStore({
      queryEvalHistory: vi.fn()
        .mockReturnValueOnce([]) // first call: minScore=7, 0 samples
        .mockReturnValueOnce([]) // second call: minScore=6, 0 samples
        .mockReturnValue(highScoreSamples(3)), // third call: minScore=5, 3 samples
    })
    const ai = makeAI('{"entries":[]}')
    const aiWithSynth = { call: vi.fn()
      .mockResolvedValueOnce({ content: '{"entries":[]}' })
      .mockResolvedValueOnce({ content: '# Improved' })
    } as unknown as AIProvider
    const engine = new SkillXEngine(aiWithSynth, 'model', store, makeReporter(), makeStorage())
    await engine.run({ skillId: 's1', minScore: 7 })
    expect(store.queryEvalHistory).toHaveBeenCalledTimes(3)
  })

  it('parses entries from AI JSON response', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue(highScoreSamples(3)) })
    const ai = { call: vi.fn()
      .mockResolvedValueOnce({ content: '{"entries":[{"level":2,"levelName":"functional","content":"use tool X","sourceCount":3}]}' })
      .mockResolvedValueOnce({ content: '# Improved Skill' })
    } as unknown as AIProvider
    const engine = new SkillXEngine(ai, 'model', store, makeReporter(), makeStorage())
    const result = await engine.run({ skillId: 's1' })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].level).toBe(2)
  })

  it('handles malformed AI JSON and continues to synthesis', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue(highScoreSamples(3)) })
    const ai = { call: vi.fn()
      .mockResolvedValueOnce({ content: 'not json at all' })
      .mockResolvedValueOnce({ content: '# Improved Skill' })
    } as unknown as AIProvider
    const engine = new SkillXEngine(ai, 'model', store, makeReporter(), makeStorage())
    const result = await engine.run({ skillId: 's1' })
    expect(result.entries).toEqual([])
    expect(result.evolvedContent).toBe('# Improved Skill')
  })

  it('saves evolved skill with engine=skillx', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue(highScoreSamples(3)) })
    const ai = { call: vi.fn()
      .mockResolvedValueOnce({ content: '{"entries":[]}' })
      .mockResolvedValueOnce({ content: '# Improved' })
    } as unknown as AIProvider
    const storage = makeStorage()
    const engine = new SkillXEngine(ai, 'model', store, makeReporter(), storage)
    await engine.run({ skillId: 's1' })
    expect(storage.saveEvolvedSkill).toHaveBeenCalledWith(expect.objectContaining({ engine: 'skillx' }))
  })

  it('returns correct totalSourceSamples', async () => {
    const store = makeStore({ queryEvalHistory: vi.fn().mockReturnValue(highScoreSamples(5)) })
    const ai = { call: vi.fn()
      .mockResolvedValueOnce({ content: '{"entries":[]}' })
      .mockResolvedValueOnce({ content: '# Improved' })
    } as unknown as AIProvider
    const engine = new SkillXEngine(ai, 'model', store, makeReporter(), makeStorage())
    const result = await engine.run({ skillId: 's1' })
    expect(result.totalSourceSamples).toBe(5)
  })
})
