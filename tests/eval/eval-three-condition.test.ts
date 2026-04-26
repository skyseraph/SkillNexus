/**
 * tests/eval/eval-three-condition.test.ts
 *
 * Pure logic tests for eval:startThreeCondition handler:
 * - testCaseIds array validation (MAX_TEST_CASES = 50)
 * - Empty test cases guard
 * - Three-condition job ID structure (jobIdA / jobIdB / jobIdC)
 * - Delta computation between conditions (Δpp = B - A)
 * - Condition labels (A = no-skill, B = skill, C = AI-generated)
 * No Electron / DB / AI calls.
 */

import { describe, it, expect } from 'vitest'

// ── Constants (mirrors eval.handler.ts) ───────────────────────────────────────

const MAX_TEST_CASES = 50

// ── Validation (mirrors eval.handler.ts startThreeCondition) ─────────────────

function validateThreeConditionInput(
  testCaseIds: unknown,
  testCasesFound: number
): void {
  if (!Array.isArray(testCaseIds) || testCaseIds.length > MAX_TEST_CASES) {
    throw new Error(`testCaseIds must be an array of at most ${MAX_TEST_CASES} items`)
  }
  if (testCasesFound === 0) {
    throw new Error('No test cases found for this skill')
  }
}

// ── Job ID structure ──────────────────────────────────────────────────────────

interface ThreeConditionJobIds {
  jobIdA: string  // Condition A: no-skill baseline
  jobIdB: string  // Condition B: skill under test
  jobIdC: string  // Condition C: AI-generated skill
}

function buildThreeConditionJobIds(timestamp: number): ThreeConditionJobIds {
  return {
    jobIdA: `3cond-a-${timestamp}`,
    jobIdB: `3cond-b-${timestamp}`,
    jobIdC: `3cond-c-${timestamp}`
  }
}

// ── Delta computation ─────────────────────────────────────────────────────────

interface ThreeConditionScores {
  conditionA: number  // no-skill baseline
  conditionB: number  // skill under test
  conditionC: number  // AI-generated skill
}

function computeThreeConditionDeltas(scores: ThreeConditionScores) {
  return {
    deltaBA: parseFloat((scores.conditionB - scores.conditionA).toFixed(2)),  // skill vs baseline
    deltaCA: parseFloat((scores.conditionC - scores.conditionA).toFixed(2)),  // AI-gen vs baseline
    deltaCB: parseFloat((scores.conditionC - scores.conditionB).toFixed(2))   // AI-gen vs skill
  }
}

// ── Condition semantics ───────────────────────────────────────────────────────

const THREE_CONDITION_LABELS = {
  A: 'No-Skill Baseline',
  B: 'Skill Under Test',
  C: 'AI-Generated Skill'
} as const

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('validateThreeConditionInput — testCaseIds guard', () => {
  it('accepts valid array with test cases found', () => {
    expect(() => validateThreeConditionInput(['tc-1', 'tc-2'], 2)).not.toThrow()
  })

  it('accepts empty array (uses all test cases)', () => {
    expect(() => validateThreeConditionInput([], 3)).not.toThrow()
  })

  it('accepts exactly MAX_TEST_CASES (50) ids', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `tc-${i}`)
    expect(() => validateThreeConditionInput(ids, 50)).not.toThrow()
  })

  it('throws for 51 ids', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `tc-${i}`)
    expect(() => validateThreeConditionInput(ids, 51)).toThrow('50')
  })

  it('throws for non-array testCaseIds', () => {
    expect(() => validateThreeConditionInput('tc-1', 1)).toThrow('array')
    expect(() => validateThreeConditionInput(null, 1)).toThrow('array')
    expect(() => validateThreeConditionInput({ id: 'tc-1' }, 1)).toThrow('array')
  })

  it('throws when no test cases found (testCasesFound = 0)', () => {
    expect(() => validateThreeConditionInput(['tc-1'], 0)).toThrow('No test cases found')
  })

  it('throws when empty array AND no test cases found', () => {
    expect(() => validateThreeConditionInput([], 0)).toThrow('No test cases found')
  })
})

describe('buildThreeConditionJobIds — job ID structure', () => {
  const TS = 1714100000000

  it('generates three distinct job IDs', () => {
    const ids = buildThreeConditionJobIds(TS)
    const unique = new Set([ids.jobIdA, ids.jobIdB, ids.jobIdC])
    expect(unique.size).toBe(3)
  })

  it('jobIdA uses 3cond-a- prefix', () => {
    const ids = buildThreeConditionJobIds(TS)
    expect(ids.jobIdA.startsWith('3cond-a-')).toBe(true)
  })

  it('jobIdB uses 3cond-b- prefix', () => {
    const ids = buildThreeConditionJobIds(TS)
    expect(ids.jobIdB.startsWith('3cond-b-')).toBe(true)
  })

  it('jobIdC uses 3cond-c- prefix', () => {
    const ids = buildThreeConditionJobIds(TS)
    expect(ids.jobIdC.startsWith('3cond-c-')).toBe(true)
  })

  it('all job IDs contain the timestamp', () => {
    const ids = buildThreeConditionJobIds(TS)
    expect(ids.jobIdA).toContain(String(TS))
    expect(ids.jobIdB).toContain(String(TS))
    expect(ids.jobIdC).toContain(String(TS))
  })

  it('job IDs from different timestamps are distinct', () => {
    const ids1 = buildThreeConditionJobIds(1000)
    const ids2 = buildThreeConditionJobIds(2000)
    expect(ids1.jobIdA).not.toBe(ids2.jobIdA)
  })
})

describe('computeThreeConditionDeltas — Δpp computation', () => {
  it('computes positive deltaBA when skill outperforms baseline', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 5.0, conditionB: 7.5, conditionC: 6.0 })
    expect(deltas.deltaBA).toBe(2.5)
  })

  it('computes negative deltaBA when skill underperforms baseline', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 7.0, conditionB: 5.0, conditionC: 6.0 })
    expect(deltas.deltaBA).toBe(-2)
  })

  it('computes zero deltaBA when skill equals baseline', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 6.0, conditionB: 6.0, conditionC: 7.0 })
    expect(deltas.deltaBA).toBe(0)
  })

  it('computes deltaCA (AI-gen vs baseline)', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 5.0, conditionB: 7.0, conditionC: 8.0 })
    expect(deltas.deltaCA).toBe(3)
  })

  it('computes deltaCB (AI-gen vs skill)', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 5.0, conditionB: 7.0, conditionC: 8.0 })
    expect(deltas.deltaCB).toBe(1)
  })

  it('rounds to 2 decimal places', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 5.111, conditionB: 7.333, conditionC: 6.0 })
    expect(deltas.deltaBA).toBe(2.22)
  })

  it('maximum possible delta is 10 (A=0, B=10)', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 0, conditionB: 10, conditionC: 5 })
    expect(deltas.deltaBA).toBe(10)
  })

  it('minimum possible delta is -10 (A=10, B=0)', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 10, conditionB: 0, conditionC: 5 })
    expect(deltas.deltaBA).toBe(-10)
  })
})

describe('three-condition semantics', () => {
  it('has exactly 3 conditions', () => {
    expect(Object.keys(THREE_CONDITION_LABELS)).toHaveLength(3)
  })

  it('Condition A is the no-skill baseline', () => {
    expect(THREE_CONDITION_LABELS.A).toContain('Baseline')
  })

  it('Condition B is the skill under test', () => {
    expect(THREE_CONDITION_LABELS.B).toContain('Skill')
  })

  it('Condition C is the AI-generated skill', () => {
    expect(THREE_CONDITION_LABELS.C).toContain('AI')
  })

  it('deltaBA > 0 means the skill adds value over no-skill', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 4.0, conditionB: 7.0, conditionC: 6.0 })
    expect(deltas.deltaBA).toBeGreaterThan(0)
  })

  it('deltaBA < 0 means the skill hurts performance (regression)', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 8.0, conditionB: 5.0, conditionC: 6.0 })
    expect(deltas.deltaBA).toBeLessThan(0)
  })

  it('deltaCB > 0 means AI-generated skill outperforms user skill', () => {
    const deltas = computeThreeConditionDeltas({ conditionA: 4.0, conditionB: 6.0, conditionC: 8.0 })
    expect(deltas.deltaCB).toBeGreaterThan(0)
  })
})
