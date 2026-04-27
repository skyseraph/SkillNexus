import { describe, it, expect } from 'vitest'

// Pure functions extracted from EvoPage.tsx for isolated unit testing.
// These are copy-equivalent implementations — same logic, no React/Electron deps.

// ── bigramSimilarity ──────────────────────────────────────────────────────────

function bigramSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const sa = bigrams(a); const sb = bigrams(b)
  if (sa.size === 0 && sb.size === 0) return 1
  let intersection = 0
  for (const g of sa) if (sb.has(g)) intersection++
  return (2 * intersection) / (sa.size + sb.size)
}

describe('bigramSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(bigramSimilarity('hello world', 'hello world')).toBe(1)
  })

  it('returns 0 for completely different strings', () => {
    expect(bigramSimilarity('abcd', 'efgh')).toBe(0)
  })

  it('returns 1 for two empty strings', () => {
    expect(bigramSimilarity('', '')).toBe(1)
  })

  it('returns value between 0 and 1 for partially similar strings', () => {
    const score = bigramSimilarity('hello world', 'hello earth')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('is symmetric', () => {
    const a = 'the quick brown fox'
    const b = 'the slow brown dog'
    expect(bigramSimilarity(a, b)).toBeCloseTo(bigramSimilarity(b, a))
  })

  it('returns high score for near-identical long strings', () => {
    const base = '# Skill\nDo this task carefully.\nConsider edge cases.\nReturn structured output.'
    const tweaked = base.replace('carefully', 'thoroughly')
    expect(bigramSimilarity(base, tweaked)).toBeGreaterThan(0.9)
  })

  it('returns low score for very different content', () => {
    const a = 'You are a code reviewer. Analyze the diff.'
    const b = 'Translate the following text to French.'
    expect(bigramSimilarity(a, b)).toBeLessThan(0.5)
  })

  it('SIMILARITY_WARNING_THRESHOLD=0.95 triggers for near-identical content', () => {
    const THRESHOLD = 0.95
    const base = 'You are a helpful assistant. Answer questions clearly and concisely.'
    const almostSame = base + ' '  // trivial whitespace addition
    expect(bigramSimilarity(base, almostSame)).toBeGreaterThanOrEqual(THRESHOLD)
  })
})

// ── diffLines ─────────────────────────────────────────────────────────────────

type DiffLine = { type: 'same' | 'add' | 'remove'; text: string }

function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const m = aLines.length; const n = bLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = aLines[i - 1] === bLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const result: DiffLine[] = []
  let i = m; let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      result.unshift({ type: 'same', text: aLines[i - 1] }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', text: bLines[j - 1] }); j--
    } else {
      result.unshift({ type: 'remove', text: aLines[i - 1] }); i--
    }
  }
  return result
}

describe('diffLines', () => {
  it('returns all same for identical content', () => {
    const lines = diffLines('a\nb\nc', 'a\nb\nc')
    expect(lines.every(l => l.type === 'same')).toBe(true)
  })

  it('marks added lines correctly', () => {
    const lines = diffLines('a\nb', 'a\nb\nc')
    const added = lines.filter(l => l.type === 'add')
    expect(added).toHaveLength(1)
    expect(added[0].text).toBe('c')
  })

  it('marks removed lines correctly', () => {
    const lines = diffLines('a\nb\nc', 'a\nb')
    const removed = lines.filter(l => l.type === 'remove')
    expect(removed).toHaveLength(1)
    expect(removed[0].text).toBe('c')
  })

  it('handles empty original (all adds)', () => {
    const lines = diffLines('', 'a\nb')
    expect(lines.filter(l => l.type === 'add')).toHaveLength(2)
    // ''.split('\n') = [''] so the empty string token is treated as a remove
    expect(lines.filter(l => l.type === 'remove').map(l => l.text)).toEqual([''])
  })

  it('handles empty evolved (all removes)', () => {
    const lines = diffLines('a\nb', '')
    expect(lines.filter(l => l.type === 'remove')).toHaveLength(2)
    // ''.split('\n') = [''] so the empty string token is treated as an add
    expect(lines.filter(l => l.type === 'add').map(l => l.text)).toEqual([''])
  })

  it('handles both empty strings', () => {
    const lines = diffLines('', '')
    expect(lines).toHaveLength(1) // split('') gives ['']
    expect(lines[0].type).toBe('same')
  })

  it('preserves total line count (same + add + remove = max(a,b) lines approx)', () => {
    const a = 'line1\nline2\nline3'
    const b = 'line1\nchanged\nline3\nnewline'
    const lines = diffLines(a, b)
    const adds = lines.filter(l => l.type === 'add').length
    const removes = lines.filter(l => l.type === 'remove').length
    const sames = lines.filter(l => l.type === 'same').length
    // LCS invariant: sames + removes = a.split lines, sames + adds = b.split lines
    expect(sames + removes).toBe(a.split('\n').length)
    expect(sames + adds).toBe(b.split('\n').length)
  })

  it('correctly diffs a realistic skill edit', () => {
    const original = '# Skill\nBe helpful.\nAnswer concisely.'
    const evolved = '# Skill\nBe helpful and thorough.\nAnswer concisely.\nProvide examples.'
    const lines = diffLines(original, evolved)
    const adds = lines.filter(l => l.type === 'add').map(l => l.text)
    const removes = lines.filter(l => l.type === 'remove').map(l => l.text)
    expect(adds).toContain('Be helpful and thorough.')
    expect(adds).toContain('Provide examples.')
    expect(removes).toContain('Be helpful.')
  })
})

// ── avgScores ─────────────────────────────────────────────────────────────────

interface EvalResult {
  scores: Record<string, { score: number }>
}

function avgScores(history: EvalResult[]): Record<string, number> {
  const totals: Record<string, { sum: number; count: number }> = {}
  for (const r of history) {
    for (const [dim, s] of Object.entries(r.scores)) {
      if (!totals[dim]) totals[dim] = { sum: 0, count: 0 }
      totals[dim].sum += s.score; totals[dim].count++
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([d, { sum, count }]) => [d, sum / count]))
}

describe('avgScores', () => {
  it('averages scores across multiple eval results', () => {
    const history: EvalResult[] = [
      { scores: { correctness: { score: 8 }, clarity: { score: 6 } } },
      { scores: { correctness: { score: 6 }, clarity: { score: 8 } } },
    ]
    const result = avgScores(history)
    expect(result.correctness).toBe(7)
    expect(result.clarity).toBe(7)
  })

  it('returns empty object for empty history', () => {
    expect(avgScores([])).toEqual({})
  })

  it('handles single result', () => {
    const history: EvalResult[] = [{ scores: { correctness: { score: 9 } } }]
    expect(avgScores(history).correctness).toBe(9)
  })

  it('handles different dims across results', () => {
    const history: EvalResult[] = [
      { scores: { correctness: { score: 8 } } },
      { scores: { clarity: { score: 6 } } },
    ]
    const result = avgScores(history)
    expect(result.correctness).toBe(8)
    expect(result.clarity).toBe(6)
  })

  it('handles perfect scores', () => {
    const history: EvalResult[] = [
      { scores: { a: { score: 10 }, b: { score: 10 } } },
      { scores: { a: { score: 10 }, b: { score: 10 } } },
    ]
    const result = avgScores(history)
    expect(result.a).toBe(10)
    expect(result.b).toBe(10)
  })
})

// ── overallAvg ────────────────────────────────────────────────────────────────

function overallAvg(scores: Record<string, number>): number {
  const vals = Object.values(scores)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

describe('overallAvg', () => {
  it('averages all dimension scores', () => {
    expect(overallAvg({ correctness: 8, clarity: 6, completeness: 7 })).toBeCloseTo(7)
  })

  it('returns 0 for empty scores', () => {
    expect(overallAvg({})).toBe(0)
  })

  it('returns single value unchanged', () => {
    expect(overallAvg({ correctness: 9 })).toBe(9)
  })

  it('handles perfect score', () => {
    expect(overallAvg({ a: 10, b: 10, c: 10 })).toBe(10)
  })

  it('handles zero scores', () => {
    expect(overallAvg({ a: 0, b: 0 })).toBe(0)
  })
})

// ── makeDefaultSession ────────────────────────────────────────────────────────

interface EvoSession {
  phase: string
  selectedId: string
  paradigm: string
  targets: string[]
  analysisData: null
  evolvedContent: string
  evoResult: null
  origScores: Record<string, number>
  evolvedScores: Record<string, number>
  evalProgress: number
  error: null
}

function makeDefaultSession(selectedId = ''): EvoSession {
  return {
    phase: 'idle',
    selectedId,
    paradigm: 'evidence',
    targets: [],
    analysisData: null,
    evolvedContent: '',
    evoResult: null,
    origScores: {},
    evolvedScores: {},
    evalProgress: 0,
    error: null,
  }
}

describe('makeDefaultSession', () => {
  it('creates session with idle phase', () => {
    expect(makeDefaultSession().phase).toBe('idle')
  })

  it('uses provided selectedId', () => {
    expect(makeDefaultSession('skill-123').selectedId).toBe('skill-123')
  })

  it('defaults selectedId to empty string', () => {
    expect(makeDefaultSession().selectedId).toBe('')
  })

  it('defaults paradigm to evidence', () => {
    expect(makeDefaultSession().paradigm).toBe('evidence')
  })

  it('initializes targets as empty array', () => {
    expect(makeDefaultSession().targets).toEqual([])
  })

  it('initializes scores as empty objects', () => {
    const s = makeDefaultSession()
    expect(s.origScores).toEqual({})
    expect(s.evolvedScores).toEqual({})
  })

  it('initializes nullable fields as null', () => {
    const s = makeDefaultSession()
    expect(s.analysisData).toBeNull()
    expect(s.evoResult).toBeNull()
    expect(s.error).toBeNull()
  })

  it('initializes evalProgress to 0', () => {
    expect(makeDefaultSession().evalProgress).toBe(0)
  })

  it('returns a new object each call', () => {
    const a = makeDefaultSession()
    const b = makeDefaultSession()
    expect(a).not.toBe(b)
    a.targets.push('x')
    expect(b.targets).toHaveLength(0)
  })
})

// ── friendlyError ─────────────────────────────────────────────────────────────

function friendlyError(e: unknown): string {
  const msg = String(e)
  if (msg.includes('API key') || msg.includes('api_key') || msg.includes('401')) return 'API Key 无效或未配置，请在设置中检查。'
  if (msg.includes('rate limit') || msg.includes('429')) return '请求频率超限，请稍后重试。'
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) return '请求超时，请检查网络连接后重试。'
  if (msg.includes('not found') || msg.includes('404')) return '找不到指定的 Skill，可能已被删除。'
  if (msg.includes('No eval history') || msg.includes('eval records')) return '该 Skill 没有足够的评测历史，请先运行评测。'
  if (msg.includes('cancelled') || msg.includes('aborted')) return '进化已取消。'
  if (msg.includes('ECONNREFUSED') || msg.includes('network')) return '网络连接失败，请检查网络后重试。'
  return msg.replace(/^Error:\s*/i, '')
}

describe('friendlyError', () => {
  it('maps API key error', () => {
    expect(friendlyError(new Error('Invalid API key'))).toContain('API Key')
  })

  it('maps 401 status', () => {
    expect(friendlyError('Error: 401 Unauthorized')).toContain('API Key')
  })

  it('maps rate limit error', () => {
    expect(friendlyError(new Error('rate limit exceeded'))).toContain('频率超限')
  })

  it('maps 429 status', () => {
    expect(friendlyError('Error: 429 Too Many Requests')).toContain('频率超限')
  })

  it('maps timeout error', () => {
    expect(friendlyError(new Error('Request timeout'))).toContain('超时')
  })

  it('maps ETIMEDOUT', () => {
    expect(friendlyError('ETIMEDOUT')).toContain('超时')
  })

  it('maps not found error', () => {
    expect(friendlyError(new Error('Skill not found'))).toContain('找不到')
  })

  it('maps 404 status', () => {
    expect(friendlyError('Error: 404')).toContain('找不到')
  })

  it('maps no eval history error', () => {
    expect(friendlyError(new Error('No eval history available'))).toContain('评测历史')
  })

  it('maps cancelled error', () => {
    expect(friendlyError(new Error('Operation cancelled'))).toContain('取消')
  })

  it('maps aborted error', () => {
    expect(friendlyError(new Error('Request aborted'))).toContain('取消')
  })

  it('maps network connection error', () => {
    expect(friendlyError(new Error('ECONNREFUSED'))).toContain('网络')
  })

  it('strips Error: prefix for unknown errors', () => {
    expect(friendlyError(new Error('Something unexpected happened'))).toBe('Something unexpected happened')
  })

  it('handles non-Error objects', () => {
    expect(friendlyError('plain string error')).toBe('plain string error')
  })

  it('handles null/undefined gracefully', () => {
    expect(() => friendlyError(null)).not.toThrow()
    expect(() => friendlyError(undefined)).not.toThrow()
  })
})
