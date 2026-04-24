import { describe, it, expect, vi } from 'vitest'
import { CoEvoSkillEngine } from './coevoskill-engine'
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
  queryTestCases: vi.fn().mockReturnValue([{ id: 'tc1', name: 'c1', input: 'hello', judge_type: 'llm', judge_param: '' }]),
  querySkillChain: vi.fn().mockReturnValue([]),
  ...overrides,
})
const makeReporter = (): IProgressReporter => ({ report: vi.fn() })
const makeStorage = (): ISkillStorage => ({
  saveEvolvedSkill: vi.fn().mockReturnValue('evolved-1'),
  copyTestCases: vi.fn(),
})

// Verifier response: all PASS, Feedback: none
const allPassAI = (): AIProvider => ({
  call: vi.fn().mockResolvedValue({ content: 'TC1: PASS\nFeedback: looks good' })
} as unknown as AIProvider)

// Verifier response: all FAIL, Generator response: improved skill
const allFailAI = (): AIProvider => ({
  call: vi.fn()
    .mockResolvedValueOnce({ content: 'TC1: FAIL\nFeedback: missing edge case' })
    .mockResolvedValue({ content: '# Improved Skill' })
} as unknown as AIProvider)

describe('CoEvoSkillEngine', () => {
  it('throws when skill not found', async () => {
    const store = makeStore({ querySkill: vi.fn().mockReturnValue(undefined) })
    const engine = new CoEvoSkillEngine(allPassAI(), 'model', store, makeReporter(), makeStorage())
    await expect(engine.run({ skillId: 's1' })).rejects.toThrow('not found')
  })

  it('returns early with rounds=0 when no test cases', async () => {
    const store = makeStore({ queryTestCases: vi.fn().mockReturnValue([]) })
    const engine = new CoEvoSkillEngine(allPassAI(), 'model', store, makeReporter(), makeStorage())
    const result = await engine.run({ skillId: 's1' })
    expect(result.rounds).toBe(0)
    expect(result.passedAll).toBe(false)
  })

  it('escalation level increases when pass rate is high', async () => {
    // All pass → escalation should increase from 1 to 2 after first round
    const ai: AIProvider = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: 'TC1: PASS\nFeedback: good' }) // round 1 verifier
        .mockResolvedValueOnce({ content: '# Improved' })                // round 1 generator
        .mockResolvedValueOnce({ content: 'TC1: PASS\nFeedback: good' }) // round 2 verifier
        .mockResolvedValue({ content: '# Improved' })
    } as unknown as AIProvider
    const engine = new CoEvoSkillEngine(ai, 'model', makeStore(), makeReporter(), makeStorage())
    const result = await engine.run({ skillId: 's1', maxRounds: 2 })
    expect(result.escalationLevel).toBeGreaterThanOrEqual(2)
  })

  it('returns passedAll=true when all pass at level 3', async () => {
    // Simulate escalation reaching level 3 and passing
    const ai: AIProvider = {
      call: vi.fn()
        // rounds 1-2: pass → escalate to level 2, then 3
        .mockResolvedValueOnce({ content: 'TC1: PASS\nFeedback: good' })
        .mockResolvedValueOnce({ content: '# Improved' })
        .mockResolvedValueOnce({ content: 'TC1: PASS\nFeedback: good' })
        .mockResolvedValueOnce({ content: '# Improved' })
        // round 3: pass at level 3 → passedAll
        .mockResolvedValueOnce({ content: 'TC1: PASS\nFeedback: good' })
        .mockResolvedValue({ content: '# Improved' })
    } as unknown as AIProvider
    const engine = new CoEvoSkillEngine(ai, 'model', makeStore(), makeReporter(), makeStorage())
    const result = await engine.run({ skillId: 's1', maxRounds: 5 })
    expect(result.passedAll).toBe(true)
  })

  it('runs up to maxRounds', async () => {
    const ai = allFailAI()
    const engine = new CoEvoSkillEngine(ai, 'model', makeStore(), makeReporter(), makeStorage())
    const result = await engine.run({ skillId: 's1', maxRounds: 3 })
    expect(result.rounds).toBe(3)
  })

  it('verifier feedback is passed to generator', async () => {
    const calls: string[] = []
    const ai: AIProvider = {
      call: vi.fn().mockImplementation(({ userMessage }: { userMessage: string }) => {
        calls.push(userMessage)
        if (userMessage.includes('Test Cases')) return Promise.resolve({ content: 'TC1: FAIL\nFeedback: needs more detail' })
        return Promise.resolve({ content: '# Improved' })
      })
    } as unknown as AIProvider
    const engine = new CoEvoSkillEngine(ai, 'model', makeStore(), makeReporter(), makeStorage())
    await engine.run({ skillId: 's1', maxRounds: 2 })
    const generatorCall = calls.find(c => c.includes('Verifier Feedback'))
    expect(generatorCall).toContain('needs more detail')
  })
})
