/**
 * tests/trending/trending-logic.test.ts
 *
 * Pure logic tests for the Trending (leaderboard) page:
 * - Dimension selector: 9 options (overall + 8 dims)
 * - Sparkline trend computation
 * - Ranking sort by selected dimension
 * - Medal assignment (top 3)
 * - Delta indicator (↑/↓/→)
 * No Electron / DB.
 */

import { describe, it, expect } from 'vitest'

// ── Dimension options (mirrors TrendingPage.tsx) ──────────────────────────────

const TRENDING_DIMS = [
  { id: 'overall',               label: '⭐ 综合' },
  { id: 'correctness',           label: 'G1 正确性' },
  { id: 'instruction_following', label: 'G2 指令遵循' },
  { id: 'safety',                label: 'G3 安全性' },
  { id: 'completeness',          label: 'G4 完整性' },
  { id: 'robustness',            label: 'G5 鲁棒性' },
  { id: 'executability',         label: 'S1 可执行性' },
  { id: 'cost_awareness',        label: 'S2 成本意识' },
  { id: 'maintainability',       label: 'S3 可维护性' },
]

// ── SkillRankEntry type ───────────────────────────────────────────────────────

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

// ── Logic helpers ─────────────────────────────────────────────────────────────

function getDimScore(entry: SkillRankEntry, dimId: string): number {
  const map: Record<string, number> = {
    overall:               entry.avgTotal,
    correctness:           entry.avgCorrectness,
    instruction_following: entry.avgInstructionFollowing,
    safety:                entry.avgSafety,
    completeness:          entry.avgCompleteness,
    robustness:            entry.avgRobustness,
    executability:         entry.avgExecutability,
    cost_awareness:        entry.avgCostAwareness,
    maintainability:       entry.avgMaintainability,
  }
  return map[dimId] ?? 0
}

function sortByDim(entries: SkillRankEntry[], dimId: string): SkillRankEntry[] {
  return [...entries].sort((a, b) => getDimScore(b, dimId) - getDimScore(a, dimId))
}

function getMedal(rank: number): string {
  return rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : ''
}

function getDeltaIndicator(trend: number[]): '↑' | '↓' | '→' {
  if (trend.length < 2) return '→'
  const recent = trend[trend.length - 1]
  const prev = trend[trend.length - 2]
  if (recent > prev + 0.1) return '↑'
  if (recent < prev - 0.1) return '↓'
  return '→'
}

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeEntry(id: string, name: string, dims: Partial<{
  total: number; correctness: number; safety: number; completeness: number;
  robustness: number; instruction_following: number; executability: number;
  cost_awareness: number; maintainability: number
}> = {}): SkillRankEntry {
  return {
    skillId: id,
    skillName: name,
    evalCount: 3,
    avgTotal:                dims.total ?? 7,
    avgCorrectness:          dims.correctness ?? 7,
    avgInstructionFollowing: dims.instruction_following ?? 7,
    avgSafety:               dims.safety ?? 7,
    avgCompleteness:         dims.completeness ?? 7,
    avgRobustness:           dims.robustness ?? 7,
    avgExecutability:        dims.executability ?? 7,
    avgCostAwareness:        dims.cost_awareness ?? 7,
    avgMaintainability:      dims.maintainability ?? 7,
    trend: [6.5, 7.0, 7.5]
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('trending dimension options', () => {
  it('has exactly 9 dimension options (overall + 8 eval dims)', () => {
    expect(TRENDING_DIMS).toHaveLength(9)
  })

  it('first option is overall (⭐ 综合)', () => {
    expect(TRENDING_DIMS[0].id).toBe('overall')
    expect(TRENDING_DIMS[0].label).toContain('⭐')
  })

  it('includes all 5 G-group dimensions', () => {
    const ids = TRENDING_DIMS.map(d => d.id)
    expect(ids).toContain('correctness')
    expect(ids).toContain('instruction_following')
    expect(ids).toContain('safety')
    expect(ids).toContain('completeness')
    expect(ids).toContain('robustness')
  })

  it('includes all 3 S-group dimensions', () => {
    const ids = TRENDING_DIMS.map(d => d.id)
    expect(ids).toContain('executability')
    expect(ids).toContain('cost_awareness')
    expect(ids).toContain('maintainability')
  })

  it('G-group dims have G prefix labels', () => {
    const gDims = TRENDING_DIMS.filter(d => ['correctness', 'instruction_following', 'safety', 'completeness', 'robustness'].includes(d.id))
    for (const d of gDims) {
      expect(d.label.startsWith('G'), `${d.id} label should start with G`).toBe(true)
    }
  })

  it('S-group dims have S prefix labels', () => {
    const sDims = TRENDING_DIMS.filter(d => ['executability', 'cost_awareness', 'maintainability'].includes(d.id))
    for (const d of sDims) {
      expect(d.label.startsWith('S'), `${d.id} label should start with S`).toBe(true)
    }
  })
})

describe('sortByDim — ranking by selected dimension', () => {
  const entries = [
    makeEntry('s1', 'Skill A', { total: 7, safety: 9 }),
    makeEntry('s2', 'Skill B', { total: 9, safety: 5 }),
    makeEntry('s3', 'Skill C', { total: 8, safety: 7 })
  ]

  it('sorts by overall avgTotal descending', () => {
    const sorted = sortByDim(entries, 'overall')
    expect(sorted[0].skillId).toBe('s2')
    expect(sorted[1].skillId).toBe('s3')
    expect(sorted[2].skillId).toBe('s1')
  })

  it('sorts by safety dimension descending', () => {
    const sorted = sortByDim(entries, 'safety')
    expect(sorted[0].skillId).toBe('s1')
    expect(sorted[1].skillId).toBe('s3')
    expect(sorted[2].skillId).toBe('s2')
  })

  it('does not mutate original array', () => {
    const original = [...entries]
    sortByDim(entries, 'overall')
    expect(entries.map(e => e.skillId)).toEqual(original.map(e => e.skillId))
  })

  it('unknown dimension returns 0 for all (stable sort)', () => {
    const sorted = sortByDim(entries, 'nonexistent')
    expect(sorted).toHaveLength(3)
    // All get 0 — order is stable (equal sort key)
    expect(sorted.map(e => e.skillId)).toEqual(['s1', 's2', 's3'])
  })
})

describe('medal assignment', () => {
  it('rank 0 gets gold medal', () => {
    expect(getMedal(0)).toBe('🥇')
  })

  it('rank 1 gets silver medal', () => {
    expect(getMedal(1)).toBe('🥈')
  })

  it('rank 2 gets bronze medal', () => {
    expect(getMedal(2)).toBe('🥉')
  })

  it('rank 3+ gets no medal', () => {
    expect(getMedal(3)).toBe('')
    expect(getMedal(10)).toBe('')
  })
})

describe('delta indicator — sparkline trend direction', () => {
  it('returns ↑ when recent score is significantly higher', () => {
    expect(getDeltaIndicator([6.0, 7.0, 8.0])).toBe('↑')
  })

  it('returns ↓ when recent score is significantly lower', () => {
    expect(getDeltaIndicator([8.0, 7.0, 6.0])).toBe('↓')
  })

  it('returns → for stable scores (< 0.1 delta)', () => {
    expect(getDeltaIndicator([7.0, 7.05, 7.0])).toBe('→')
  })

  it('returns → for single-element trend', () => {
    expect(getDeltaIndicator([7.0])).toBe('→')
  })

  it('returns → for empty trend', () => {
    expect(getDeltaIndicator([])).toBe('→')
  })

  it('compares last two entries only', () => {
    // Even if trend was mostly falling, recent uptick → ↑
    expect(getDeltaIndicator([9.0, 8.0, 7.0, 8.5])).toBe('↑')
  })
})

describe('getDimScore — dimension score extraction', () => {
  const entry = makeEntry('s1', 'Test', {
    total: 7, correctness: 8, safety: 9, completeness: 6
  })

  it('extracts avgTotal for overall', () => {
    expect(getDimScore(entry, 'overall')).toBe(7)
  })

  it('extracts correctness score', () => {
    expect(getDimScore(entry, 'correctness')).toBe(8)
  })

  it('extracts safety score', () => {
    expect(getDimScore(entry, 'safety')).toBe(9)
  })

  it('returns 0 for unknown dimension', () => {
    expect(getDimScore(entry, 'nonexistent')).toBe(0)
  })
})
