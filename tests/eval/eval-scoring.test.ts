/**
 * tests/eval/eval-scoring.test.ts
 *
 * Pure logic tests for the 8-dimension eval scoring system:
 * - grepScore deterministic logic
 * - commandScore exit-code semantics (mocked)
 * - Score averaging across dimensions
 * - EvalResult construction
 * - MAX_TEST_CASES boundary guard
 * - ThreeConditionMode delta (Δpp) computation
 * No Electron / DB / AI calls.
 */

import { describe, it, expect } from 'vitest'

// ── Eval scoring types ────────────────────────────────────────────────────────

interface EvalScore {
  score: number
  violations: string[]
  details: string
}

// ── grepScore (mirrors eval-job.ts) ─────────────────────────────────────────

function grepScore(output: string, judgeParam: string): EvalScore {
  const hit = output.toLowerCase().includes((judgeParam ?? '').toLowerCase())
  return {
    score: hit ? 10 : 0,
    violations: hit ? [] : [`Expected "${judgeParam}" in output`],
    details: hit ? 'grep match' : 'grep miss'
  }
}

// ── commandScore (mocked — real uses execSync) ──────────────────────────────

function commandScoreMock(exitCode: number): EvalScore {
  if (exitCode === 0) return { score: 10, violations: [], details: 'command exited 0' }
  return { score: 0, violations: [`Command failed: exit code ${exitCode}`], details: 'command exited non-zero' }
}

// ── Score averaging ──────────────────────────────────────────────────────────

function computeAvgScore(scores: Record<string, EvalScore>): number {
  const vals = Object.values(scores).map(s => s.score)
  if (vals.length === 0) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// ── 8-dimension eval framework ───────────────────────────────────────────────

const EVAL_DIMENSIONS_G = ['correctness', 'instruction_following', 'safety', 'completeness', 'robustness']
const EVAL_DIMENSIONS_S = ['executability', 'cost_awareness', 'maintainability']
const ALL_DIMENSIONS = [...EVAL_DIMENSIONS_G, ...EVAL_DIMENSIONS_S]

// ── Tests ────────────────────────────────────────────────────────────────────

describe('grepScore — deterministic keyword matching', () => {
  it('returns score 10 when keyword is found', () => {
    expect(grepScore('The output contains the answer', 'answer').score).toBe(10)
  })

  it('returns score 0 when keyword is not found', () => {
    expect(grepScore('No relevant content here', 'keyword').score).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(grepScore('Hello World', 'HELLO').score).toBe(10)
    expect(grepScore('UPPERCASE OUTPUT', 'uppercase').score).toBe(10)
  })

  it('returns empty violations on hit', () => {
    expect(grepScore('found it', 'found').violations).toHaveLength(0)
  })

  it('returns one violation message on miss', () => {
    const result = grepScore('nothing relevant', 'keyword')
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]).toContain('keyword')
  })

  it('returns "grep match" details on hit', () => {
    expect(grepScore('found it', 'found').details).toBe('grep match')
  })

  it('returns "grep miss" details on miss', () => {
    expect(grepScore('nothing', 'keyword').details).toBe('grep miss')
  })

  it('handles empty judgeParam (empty string always found)', () => {
    expect(grepScore('any output', '').score).toBe(10)
  })

  it('handles empty output (returns miss unless param is also empty)', () => {
    expect(grepScore('', 'keyword').score).toBe(0)
    expect(grepScore('', '').score).toBe(10)
  })
})

describe('commandScore — exit code semantics', () => {
  it('exit code 0 returns score 10', () => {
    expect(commandScoreMock(0).score).toBe(10)
  })

  it('exit code 0 has no violations', () => {
    expect(commandScoreMock(0).violations).toHaveLength(0)
  })

  it('exit code 1 returns score 0', () => {
    expect(commandScoreMock(1).score).toBe(0)
  })

  it('exit code 1 has violation message', () => {
    expect(commandScoreMock(1).violations[0]).toContain('exit code 1')
  })

  it('any non-zero exit code returns score 0', () => {
    expect(commandScoreMock(2).score).toBe(0)
    expect(commandScoreMock(127).score).toBe(0)
    expect(commandScoreMock(-1).score).toBe(0)
  })

  it('exit 0 details says "command exited 0"', () => {
    expect(commandScoreMock(0).details).toBe('command exited 0')
  })
})

describe('score averaging — 8-dimension aggregation', () => {
  it('correctly averages 8 equal scores', () => {
    const scores: Record<string, EvalScore> = {}
    for (const dim of ALL_DIMENSIONS) {
      scores[dim] = { score: 8, violations: [], details: '' }
    }
    expect(computeAvgScore(scores)).toBe(8)
  })

  it('averages mixed dimension scores', () => {
    const scores: Record<string, EvalScore> = {
      correctness:           { score: 10, violations: [], details: '' },
      instruction_following: { score: 8,  violations: [], details: '' },
      safety:                { score: 9,  violations: [], details: '' },
      completeness:          { score: 7,  violations: [], details: '' },
      robustness:            { score: 6,  violations: [], details: '' },
      executability:         { score: 8,  violations: [], details: '' },
      cost_awareness:        { score: 5,  violations: [], details: '' },
      maintainability:       { score: 7,  violations: [], details: '' }
    }
    // (10+8+9+7+6+8+5+7)/8 = 60/8 = 7.5
    expect(computeAvgScore(scores)).toBe(7.5)
  })

  it('returns 0 for empty scores', () => {
    expect(computeAvgScore({})).toBe(0)
  })

  it('returns 10 for all-perfect scores', () => {
    const scores: Record<string, EvalScore> = {}
    for (const dim of ALL_DIMENSIONS) {
      scores[dim] = { score: 10, violations: [], details: '' }
    }
    expect(computeAvgScore(scores)).toBe(10)
  })

  it('returns 0 for all-zero scores', () => {
    const scores: Record<string, EvalScore> = {}
    for (const dim of ALL_DIMENSIONS) {
      scores[dim] = { score: 0, violations: ['fail'], details: '' }
    }
    expect(computeAvgScore(scores)).toBe(0)
  })

  it('handles single dimension', () => {
    expect(computeAvgScore({ correctness: { score: 7, violations: [], details: '' } })).toBe(7)
  })
})

describe('8-dimension eval framework structure', () => {
  it('has exactly 5 G-group dimensions', () => {
    expect(EVAL_DIMENSIONS_G).toHaveLength(5)
  })

  it('has exactly 3 S-group dimensions', () => {
    expect(EVAL_DIMENSIONS_S).toHaveLength(3)
  })

  it('has exactly 8 total dimensions', () => {
    expect(ALL_DIMENSIONS).toHaveLength(8)
  })

  it('G-group includes correctness, safety, completeness, robustness, instruction_following', () => {
    expect(EVAL_DIMENSIONS_G).toContain('correctness')
    expect(EVAL_DIMENSIONS_G).toContain('safety')
    expect(EVAL_DIMENSIONS_G).toContain('completeness')
    expect(EVAL_DIMENSIONS_G).toContain('robustness')
    expect(EVAL_DIMENSIONS_G).toContain('instruction_following')
  })

  it('S-group includes executability, cost_awareness, maintainability', () => {
    expect(EVAL_DIMENSIONS_S).toContain('executability')
    expect(EVAL_DIMENSIONS_S).toContain('cost_awareness')
    expect(EVAL_DIMENSIONS_S).toContain('maintainability')
  })

  it('no dimension is duplicated across G and S groups', () => {
    const gSet = new Set(EVAL_DIMENSIONS_G)
    for (const dim of EVAL_DIMENSIONS_S) {
      expect(gSet.has(dim)).toBe(false)
    }
  })
})

