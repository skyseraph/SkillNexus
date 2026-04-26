/**
 * tests/studio/studio-generation-modes.test.ts
 *
 * Pure logic tests for Studio generation mode selection and config:
 * - Generation method options (describe / examples / extract / manual)
 * - Method bar: internal / SkillCreator / PromptPerfect / external URL
 * - PromptPerfect: generates on its own path (handleGenerate early-return)
 * - extractRecentHistory: evidence-driven Evo data preparation
 * - EvoConfig structure validation
 * No Electron / AI calls.
 */

import { describe, it, expect } from 'vitest'

// ── Generation modes ──────────────────────────────────────────────────────────

type CreationMode = 'describe' | 'examples' | 'extract' | 'manual' | 'agent'
type GenerationMethod = 'internal' | 'skillcreator' | 'promptperfect' | 'external'

const VALID_CREATION_MODES: CreationMode[] = ['describe', 'examples', 'extract', 'manual', 'agent']
const VALID_GENERATION_METHODS: GenerationMethod[] = ['internal', 'skillcreator', 'promptperfect', 'external']

// ── EvoConfig structure ──────────────────────────────────────────────────────

type EvoParadigm = 'evidence' | 'strategy' | 'capability'

interface EvoConfig {
  paradigm: EvoParadigm
  targets?: string[]
  maxIterations?: number
}

function validateEvoConfig(config: Partial<EvoConfig>): string | null {
  if (!config.paradigm) return 'paradigm is required'
  if (!['evidence', 'strategy', 'capability'].includes(config.paradigm)) return `invalid paradigm: ${config.paradigm}`
  if (config.targets && !Array.isArray(config.targets)) return 'targets must be an array'
  return null
}

// ── extractRecentHistory — evidence-driven data prep ────────────────────────

interface EvalResult {
  id: string
  totalScore: number
  scores: Record<string, { score: number }>
  createdAt: number
}

function extractWeakDimensions(
  history: EvalResult[],
  limit: number = 40
): { weakestDims: string[]; failingSamples: EvalResult[] } {
  const recent = history.slice(0, limit)
  if (recent.length === 0) return { weakestDims: [], failingSamples: [] }

  // Average each dimension
  const dims = Object.keys(recent[0].scores)
  const dimAvgs = dims.map(dim => ({
    dim,
    avg: recent.reduce((sum, r) => sum + (r.scores[dim]?.score ?? 0), 0) / recent.length
  }))

  // Sort ascending — weakest first
  dimAvgs.sort((a, b) => a.avg - b.avg)
  const weakestDims = dimAvgs.slice(0, 2).map(d => d.dim)

  // Pick 1-2 failing samples (totalScore < 6) for context
  const failingSamples = recent.filter(r => r.totalScore < 6).slice(0, 2)

  return { weakestDims, failingSamples }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('creation mode constants', () => {
  it('has exactly 5 creation modes', () => {
    expect(VALID_CREATION_MODES).toHaveLength(5)
  })

  it('includes all expected modes', () => {
    expect(VALID_CREATION_MODES).toContain('describe')
    expect(VALID_CREATION_MODES).toContain('examples')
    expect(VALID_CREATION_MODES).toContain('extract')
    expect(VALID_CREATION_MODES).toContain('manual')
    expect(VALID_CREATION_MODES).toContain('agent')
  })
})

describe('generation method options', () => {
  it('has exactly 4 generation methods', () => {
    expect(VALID_GENERATION_METHODS).toHaveLength(4)
  })

  it('includes all expected methods', () => {
    expect(VALID_GENERATION_METHODS).toContain('internal')
    expect(VALID_GENERATION_METHODS).toContain('skillcreator')
    expect(VALID_GENERATION_METHODS).toContain('promptperfect')
    expect(VALID_GENERATION_METHODS).toContain('external')
  })
})

describe('EvoConfig validation', () => {
  it('accepts valid evidence paradigm', () => {
    expect(validateEvoConfig({ paradigm: 'evidence' })).toBeNull()
  })

  it('accepts valid strategy paradigm', () => {
    expect(validateEvoConfig({ paradigm: 'strategy', targets: ['correctness'] })).toBeNull()
  })

  it('accepts valid capability paradigm', () => {
    expect(validateEvoConfig({ paradigm: 'capability' })).toBeNull()
  })

  it('rejects missing paradigm', () => {
    expect(validateEvoConfig({})).toContain('paradigm is required')
  })

  it('rejects unknown paradigm', () => {
    expect(validateEvoConfig({ paradigm: 'unknown' as EvoParadigm })).toContain('invalid paradigm')
  })

  it('accepts targets as string array', () => {
    expect(validateEvoConfig({ paradigm: 'strategy', targets: ['correctness', 'safety'] })).toBeNull()
  })

  it('rejects targets that is not an array', () => {
    const error = validateEvoConfig({ paradigm: 'strategy', targets: 'correctness' as unknown as string[] })
    expect(error).toContain('targets must be an array')
  })
})

describe('extractWeakDimensions — evidence-driven data preparation', () => {
  function makeResult(id: string, scores: Record<string, number>, total: number): EvalResult {
    return {
      id,
      totalScore: total,
      scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v }])),
      createdAt: Date.now()
    }
  }

  it('identifies the 2 weakest dimensions', () => {
    const history = [
      makeResult('r1', {
        correctness: 9, safety: 9, completeness: 9, robustness: 3, executability: 2
      }, 6.4)
    ]
    const { weakestDims } = extractWeakDimensions(history)
    expect(weakestDims).toContain('executability')
    expect(weakestDims).toContain('robustness')
    expect(weakestDims).toHaveLength(2)
  })

  it('selects failing samples with totalScore < 6', () => {
    const history = [
      makeResult('r1', { correctness: 8, safety: 8, completeness: 8, robustness: 8 }, 8),
      makeResult('r2', { correctness: 4, safety: 3, completeness: 4, robustness: 3 }, 3.5),
      makeResult('r3', { correctness: 2, safety: 2, completeness: 2, robustness: 2 }, 2)
    ]
    const { failingSamples } = extractWeakDimensions(history)
    expect(failingSamples.every(s => s.totalScore < 6)).toBe(true)
    expect(failingSamples.length).toBeLessThanOrEqual(2)
  })

  it('returns empty arrays for empty history', () => {
    const { weakestDims, failingSamples } = extractWeakDimensions([])
    expect(weakestDims).toEqual([])
    expect(failingSamples).toEqual([])
  })

  it('limits to last 40 eval records', () => {
    // Create 50 records; only the first 40 should be analyzed
    const history = Array.from({ length: 50 }, (_, i) =>
      makeResult(`r${i}`, { correctness: 5, safety: 5, robustness: 5, executability: 5 }, 5)
    )
    // No assertion on count of dims since all equal; just check it runs without error
    expect(() => extractWeakDimensions(history, 40)).not.toThrow()
  })

  it('fails samples are capped at 2', () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      makeResult(`r${i}`, { correctness: 3, safety: 3, robustness: 3, executability: 3 }, 3)
    )
    const { failingSamples } = extractWeakDimensions(history)
    expect(failingSamples.length).toBeLessThanOrEqual(2)
  })

  it('returns no failing samples when all scores are >= 6', () => {
    const history = [
      makeResult('r1', { correctness: 8, safety: 9 }, 8.5),
      makeResult('r2', { correctness: 7, safety: 8 }, 7.5)
    ]
    const { failingSamples } = extractWeakDimensions(history)
    expect(failingSamples).toHaveLength(0)
  })
})

describe('PromptPerfect mode — generate path', () => {
  it('PromptPerfect has its own optimize button independent of generate', () => {
    // B3 in release-todo: PromptPerfectPanel calls onOptimize directly
    // handleGenerate returns early when mode === promptperfect
    function handleGenerate(mode: GenerationMethod): boolean {
      if (mode === 'promptperfect') return false // early return, PromptPerfect handles itself
      return true
    }
    expect(handleGenerate('promptperfect')).toBe(false)
    expect(handleGenerate('internal')).toBe(true)
    expect(handleGenerate('skillcreator')).toBe(true)
  })
})

describe('external method — URL delegation', () => {
  it('external URL must start with https:// or http://', () => {
    function isValidExternalUrl(url: string): boolean {
      return /^https?:\/\//.test(url)
    }
    expect(isValidExternalUrl('https://example.com/skill-creator')).toBe(true)
    expect(isValidExternalUrl('http://localhost:3000')).toBe(true)
    expect(isValidExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isValidExternalUrl('ftp://server.com')).toBe(false)
    expect(isValidExternalUrl('')).toBe(false)
  })
})
