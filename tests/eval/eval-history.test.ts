/**
 * tests/eval/eval-history.test.ts
 *
 * Pure logic tests for eval history aggregation and ranking:
 * - SkillRankEntry computation from raw eval_history rows
 * - Trend array construction (last 8 scores)
 * - Dimension average calculation
 * - Empty history edge cases
 * No Electron / DB.
 */

import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvalHistoryRow {
  skillId: string
  skillName: string
  totalScore: number
  scores: Record<string, { score: number; violations: string[]; details: string }>
  createdAt: number
}

interface SkillRankEntry {
  skillId: string
  skillName: string
  evalCount: number
  avgTotal: number
  avgCorrectness: number
  avgInstructionFollowing: number
  avgSafety: number
  avgCompleteness: number
  avgRobustness: number
  avgExecutability: number
  avgCostAwareness: number
  avgMaintainability: number
  trend: number[]
}

// ── Helpers (mirror eval.handler.ts historyAll logic) ─────────────────────────

function safeScore(row: EvalHistoryRow, dim: string): number {
  return row.scores[dim]?.score ?? 0
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function buildRankEntry(skillId: string, skillName: string, rows: EvalHistoryRow[]): SkillRankEntry {
  const recentForTrend = rows.slice(0, 8).map(r => r.totalScore)
  return {
    skillId,
    skillName,
    evalCount: rows.length,
    avgTotal:                avg(rows.map(r => r.totalScore)),
    avgCorrectness:          avg(rows.map(r => safeScore(r, 'correctness'))),
    avgInstructionFollowing: avg(rows.map(r => safeScore(r, 'instruction_following'))),
    avgSafety:               avg(rows.map(r => safeScore(r, 'safety'))),
    avgCompleteness:         avg(rows.map(r => safeScore(r, 'completeness'))),
    avgRobustness:           avg(rows.map(r => safeScore(r, 'robustness'))),
    avgExecutability:        avg(rows.map(r => safeScore(r, 'executability'))),
    avgCostAwareness:        avg(rows.map(r => safeScore(r, 'cost_awareness'))),
    avgMaintainability:      avg(rows.map(r => safeScore(r, 'maintainability'))),
    trend:                   recentForTrend
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeRow(skillId: string, skillName: string, total: number, overrides: Partial<Record<string, number>> = {}): EvalHistoryRow {
  const dims: Record<string, number> = {
    correctness: 8, instruction_following: 7, safety: 9,
    completeness: 8, robustness: 7, executability: 8,
    cost_awareness: 7, maintainability: 8, ...overrides
  }
  return {
    skillId,
    skillName,
    totalScore: total,
    scores: Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, { score: v, violations: [], details: '' }])),
    createdAt: Date.now()
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SkillRankEntry construction', () => {
  it('computes correct evalCount', () => {
    const rows = [makeRow('s1', 'Skill A', 8), makeRow('s1', 'Skill A', 7)]
    const entry = buildRankEntry('s1', 'Skill A', rows)
    expect(entry.evalCount).toBe(2)
  })

  it('computes avgTotal from totalScore values', () => {
    const rows = [makeRow('s1', 'Skill A', 8), makeRow('s1', 'Skill A', 6)]
    const entry = buildRankEntry('s1', 'Skill A', rows)
    expect(entry.avgTotal).toBe(7)
  })

  it('computes avgCorrectness from dimension scores', () => {
    const rows = [
      makeRow('s1', 'A', 8, { correctness: 10 }),
      makeRow('s1', 'A', 6, { correctness: 6 })
    ]
    const entry = buildRankEntry('s1', 'A', rows)
    expect(entry.avgCorrectness).toBe(8)
  })

  it('computes avgSafety from dimension scores', () => {
    const rows = [makeRow('s1', 'A', 8, { safety: 10 })]
    const entry = buildRankEntry('s1', 'A', rows)
    expect(entry.avgSafety).toBe(10)
  })

  it('handles single eval row', () => {
    const rows = [makeRow('s1', 'A', 9)]
    const entry = buildRankEntry('s1', 'A', rows)
    expect(entry.evalCount).toBe(1)
    expect(entry.avgTotal).toBe(9)
  })

  it('preserves skillId and skillName', () => {
    const entry = buildRankEntry('skill-abc', 'My Skill', [makeRow('skill-abc', 'My Skill', 7)])
    expect(entry.skillId).toBe('skill-abc')
    expect(entry.skillName).toBe('My Skill')
  })
})

describe('trend array — last 8 eval scores', () => {
  it('includes all scores when fewer than 8 evals', () => {
    const rows = [makeRow('s1', 'A', 7), makeRow('s1', 'A', 8)]
    const entry = buildRankEntry('s1', 'A', rows)
    expect(entry.trend).toHaveLength(2)
    expect(entry.trend).toEqual([7, 8])
  })

  it('uses only 8 most recent scores when more than 8 evals', () => {
    const rows = Array.from({ length: 12 }, (_, i) => makeRow('s1', 'A', i + 1))
    const entry = buildRankEntry('s1', 'A', rows)
    expect(entry.trend).toHaveLength(8)
    expect(entry.trend[0]).toBe(1) // first row (index 0) = oldest in slice
  })

  it('returns empty trend array for no evals', () => {
    const entry = buildRankEntry('s1', 'A', [])
    expect(entry.trend).toEqual([])
  })

  it('trend values are numbers (totalScore)', () => {
    const rows = [makeRow('s1', 'A', 7.5)]
    const entry = buildRankEntry('s1', 'A', rows)
    expect(typeof entry.trend[0]).toBe('number')
  })
})

describe('ranking sort logic', () => {
  it('higher avgTotal ranks first when sorting', () => {
    const entryA = buildRankEntry('s1', 'A', [makeRow('s1', 'A', 9)])
    const entryB = buildRankEntry('s2', 'B', [makeRow('s2', 'B', 6)])
    const ranked = [entryA, entryB].sort((a, b) => b.avgTotal - a.avgTotal)
    expect(ranked[0].skillId).toBe('s1')
  })

  it('skills without evals are excluded from ranking', () => {
    const entries = [
      buildRankEntry('s1', 'A', [makeRow('s1', 'A', 8)]),
      buildRankEntry('s2', 'B', []) // no evals
    ]
    const withEvals = entries.filter(e => e.evalCount > 0)
    expect(withEvals).toHaveLength(1)
    expect(withEvals[0].skillId).toBe('s1')
  })

  it('all 8 dimension averages are present in entry', () => {
    const entry = buildRankEntry('s1', 'A', [makeRow('s1', 'A', 8)])
    expect(entry.avgCorrectness).toBeDefined()
    expect(entry.avgInstructionFollowing).toBeDefined()
    expect(entry.avgSafety).toBeDefined()
    expect(entry.avgCompleteness).toBeDefined()
    expect(entry.avgRobustness).toBeDefined()
    expect(entry.avgExecutability).toBeDefined()
    expect(entry.avgCostAwareness).toBeDefined()
    expect(entry.avgMaintainability).toBeDefined()
  })
})

describe('avg() helper edge cases', () => {
  it('returns 0 for empty array', () => {
    expect(avg([])).toBe(0)
  })

  it('returns value itself for single element', () => {
    expect(avg([7])).toBe(7)
  })

  it('handles decimal values', () => {
    expect(avg([7.5, 8.5])).toBe(8)
  })

  it('handles all-zero values', () => {
    expect(avg([0, 0, 0])).toBe(0)
  })
})

describe('safeScore — missing dimension fallback', () => {
  it('returns 0 when dimension is missing from scores', () => {
    const row = makeRow('s1', 'A', 5)
    // Remove a dimension
    delete (row.scores as Record<string, unknown>).robustness
    expect(safeScore(row, 'robustness')).toBe(0)
  })

  it('returns actual score when dimension exists', () => {
    const row = makeRow('s1', 'A', 5, { safety: 9 })
    expect(safeScore(row, 'safety')).toBe(9)
  })
})
