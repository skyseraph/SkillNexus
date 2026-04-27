import { describe, it, expect } from 'vitest'

// Pure logic extracted from evo:runTransferTest handler
// Tests provider filtering, pass-rate computation, and edge cases
// without requiring Electron/DB/AI dependencies.

interface Provider { id: string; model: string }

function filterValidModels(requestedModels: string[], configuredProviders: Provider[]): string[] {
  const allowedIds = new Set(configuredProviders.map(p => p.id))
  return requestedModels.filter(m => allowedIds.has(m))
}

function validateTransferRequest(models: string[], validModels: string[]): void {
  if (!models || models.length === 0) throw new Error('models array must not be empty')
  if (validModels.length === 0) throw new Error('No valid configured provider IDs provided')
}

function computePassRate(passCount: number, totalCases: number): number {
  return totalCases > 0 ? passCount / totalCases : 0
}

function countPass(responses: Array<{ content: string }>): number {
  return responses.filter(r => r.content && r.content.length > 0).length
}

// ── filterValidModels ─────────────────────────────────────────────────────────

describe('filterValidModels', () => {
  const providers: Provider[] = [
    { id: 'anthropic', model: 'claude-3-5-sonnet' },
    { id: 'openrouter', model: 'gpt-4o' },
  ]

  it('keeps only models that match configured provider IDs', () => {
    const result = filterValidModels(['anthropic', 'openrouter', 'unknown'], providers)
    expect(result).toEqual(['anthropic', 'openrouter'])
  })

  it('returns empty array when no models match', () => {
    expect(filterValidModels(['unknown', 'ghost'], providers)).toEqual([])
  })

  it('returns empty array when requested list is empty', () => {
    expect(filterValidModels([], providers)).toEqual([])
  })

  it('handles empty provider config', () => {
    expect(filterValidModels(['anthropic'], [])).toEqual([])
  })

  it('preserves order of requested models', () => {
    const result = filterValidModels(['openrouter', 'anthropic'], providers)
    expect(result).toEqual(['openrouter', 'anthropic'])
  })
})

// ── validateTransferRequest ───────────────────────────────────────────────────

describe('validateTransferRequest', () => {
  it('throws when models array is empty', () => {
    expect(() => validateTransferRequest([], ['anthropic'])).toThrow('must not be empty')
  })

  it('throws when no valid models after filtering', () => {
    expect(() => validateTransferRequest(['unknown'], [])).toThrow('No valid configured provider IDs')
  })

  it('does not throw when both arrays are non-empty', () => {
    expect(() => validateTransferRequest(['anthropic'], ['anthropic'])).not.toThrow()
  })

  it('throws for null-like models', () => {
    expect(() => validateTransferRequest(null as unknown as string[], [])).toThrow()
  })
})

// ── computePassRate ───────────────────────────────────────────────────────────

describe('computePassRate', () => {
  it('returns pass / total', () => {
    expect(computePassRate(7, 10)).toBeCloseTo(0.7)
  })

  it('returns 1.0 for all pass', () => {
    expect(computePassRate(10, 10)).toBe(1)
  })

  it('returns 0 for all fail', () => {
    expect(computePassRate(0, 10)).toBe(0)
  })

  it('returns 0 when no test cases', () => {
    expect(computePassRate(0, 0)).toBe(0)
  })
})

// ── countPass ─────────────────────────────────────────────────────────────────

describe('countPass (non-empty response = pass)', () => {
  it('counts non-empty responses as pass', () => {
    const responses = [
      { content: 'some output' },
      { content: '' },
      { content: 'another output' },
    ]
    expect(countPass(responses)).toBe(2)
  })

  it('returns 0 when all responses are empty', () => {
    expect(countPass([{ content: '' }, { content: '' }])).toBe(0)
  })

  it('returns total when all responses are non-empty', () => {
    expect(countPass([{ content: 'a' }, { content: 'b' }, { content: 'c' }])).toBe(3)
  })

  it('returns 0 for empty input array', () => {
    expect(countPass([])).toBe(0)
  })
})

// ── full transfer test flow ───────────────────────────────────────────────────

describe('transfer test flow', () => {
  it('computes per-model pass rates correctly', () => {
    const models = ['anthropic', 'openrouter']
    const providers: Provider[] = [
      { id: 'anthropic', model: 'claude-3-5-sonnet' },
      { id: 'openrouter', model: 'gpt-4o' },
    ]
    const validModels = filterValidModels(models, providers)
    validateTransferRequest(models, validModels)

    // Simulate: anthropic passes 8/10, openrouter passes 5/10
    const mockResults: Record<string, number> = {
      anthropic: computePassRate(8, 10),
      openrouter: computePassRate(5, 10),
    }
    expect(mockResults.anthropic).toBeCloseTo(0.8)
    expect(mockResults.openrouter).toBeCloseTo(0.5)
  })

  it('skips unconfigured models silently', () => {
    const models = ['anthropic', 'ghost-model']
    const providers: Provider[] = [{ id: 'anthropic', model: 'claude-3-5-sonnet' }]
    const validModels = filterValidModels(models, providers)
    expect(validModels).toEqual(['anthropic'])
    expect(validModels).not.toContain('ghost-model')
  })

  it('throws before running any AI calls when models list is empty', () => {
    expect(() => validateTransferRequest([], [])).toThrow('must not be empty')
  })
})
