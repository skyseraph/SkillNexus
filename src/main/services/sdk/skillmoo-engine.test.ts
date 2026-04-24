import { describe, it, expect, vi } from 'vitest'
import { SkillMOOEngine } from './skillmoo-engine'
import type { IDataStore } from './interfaces'

const makeStore = (overrides: Partial<IDataStore> = {}): IDataStore => ({
  queryEvalHistory: vi.fn().mockReturnValue([]),
  querySkill: vi.fn().mockReturnValue(undefined),
  queryTestCases: vi.fn().mockReturnValue([]),
  querySkillChain: vi.fn().mockReturnValue([]),
  ...overrides,
})

const skillRow = (id: string, name = 'Skill', version = '1.0') => ({
  id, name, version, markdown_content: '# Test', skill_type: 'single'
})

const evalRows = (scores: Record<string, number>) => [{
  input_prompt: 'test', output: 'out', total_score: 7, status: 'success',
  scores: JSON.stringify(Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v }])))
}]

describe('SkillMOOEngine', () => {
  it('returns empty array when no eval history', () => {
    const store = makeStore({
      querySkillChain: vi.fn().mockReturnValue([skillRow('s1')]),
      queryEvalHistory: vi.fn().mockReturnValue([]),
    })
    const engine = new SkillMOOEngine(store)
    expect(engine.computeParetoFrontier('s1')).toEqual([])
  })

  it('single skill with eval history returns itself', () => {
    const store = makeStore({
      querySkillChain: vi.fn().mockReturnValue([skillRow('s1')]),
      queryEvalHistory: vi.fn().mockReturnValue(evalRows({ correctness: 8, cost_awareness: 6 })),
    })
    const engine = new SkillMOOEngine(store)
    const result = engine.computeParetoFrontier('s1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('s1')
  })

  it('dominated point excluded from frontier', () => {
    // s2 dominates s1 on all dims
    const store = makeStore({
      querySkillChain: vi.fn().mockReturnValue([skillRow('s1'), skillRow('s2')]),
      queryEvalHistory: vi.fn().mockImplementation((skillId: string) => {
        if (skillId === 's1') return evalRows({ correctness: 5, cost_awareness: 5 })
        return evalRows({ correctness: 8, cost_awareness: 8 })
      }),
    })
    const engine = new SkillMOOEngine(store)
    const result = engine.computeParetoFrontier('s1')
    expect(result.map(p => p.id)).not.toContain('s1')
    expect(result.map(p => p.id)).toContain('s2')
  })

  it('non-dominated points all included', () => {
    // s1 better on correctness, s2 better on cost_awareness — neither dominates
    const store = makeStore({
      querySkillChain: vi.fn().mockReturnValue([skillRow('s1'), skillRow('s2')]),
      queryEvalHistory: vi.fn().mockImplementation((skillId: string) => {
        if (skillId === 's1') return evalRows({ correctness: 9, cost_awareness: 4 })
        return evalRows({ correctness: 4, cost_awareness: 9 })
      }),
    })
    const engine = new SkillMOOEngine(store)
    const result = engine.computeParetoFrontier('s1')
    expect(result).toHaveLength(2)
  })

  it('x coordinate is average of all dimensions', () => {
    const store = makeStore({
      querySkillChain: vi.fn().mockReturnValue([skillRow('s1')]),
      queryEvalHistory: vi.fn().mockReturnValue(evalRows({ correctness: 8, cost_awareness: 6 })),
    })
    const engine = new SkillMOOEngine(store)
    const result = engine.computeParetoFrontier('s1')
    expect(result[0].x).toBe(7) // (8+6)/2
  })

  it('y falls back to x when cost_awareness missing', () => {
    const store = makeStore({
      querySkillChain: vi.fn().mockReturnValue([skillRow('s1')]),
      queryEvalHistory: vi.fn().mockReturnValue(evalRows({ correctness: 8 })),
    })
    const engine = new SkillMOOEngine(store)
    const result = engine.computeParetoFrontier('s1')
    expect(result[0].y).toBe(result[0].x)
  })

  it('returns empty array when skill chain is empty', () => {
    const store = makeStore({ querySkillChain: vi.fn().mockReturnValue([]) })
    const engine = new SkillMOOEngine(store)
    expect(engine.computeParetoFrontier('s1')).toEqual([])
  })
})
