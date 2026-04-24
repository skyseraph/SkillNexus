import type { AIProvider } from '../ai-provider/types'
import type { IDataStore, IProgressReporter, ISkillStorage } from './interfaces'
import type { ParetoPoint } from '../../../shared/types'

type ScoreSet = Record<string, number>

function isDominated(a: ScoreSet, b: ScoreSet): boolean {
  const dims = Object.keys(a)
  let strictlyBetter = false
  for (const d of dims) {
    if ((b[d] ?? 0) < (a[d] ?? 0)) return false
    if ((b[d] ?? 0) > (a[d] ?? 0)) strictlyBetter = true
  }
  return strictlyBetter
}

// SkillMOO is pure computation — no AI, no progress, no file writes.
// reporter and storage are unused but kept for interface consistency.
export class SkillMOOEngine {
  constructor(
    private readonly store: IDataStore,
    _ai?: AIProvider,
    _reporter?: IProgressReporter,
    _storage?: ISkillStorage,
  ) {}

  private avgDimScores(skillId: string): ScoreSet | null {
    const rows = this.store.queryEvalHistory(skillId, { status: 'success', limit: 10 })
    if (rows.length === 0) return null
    const totals: Record<string, { sum: number; count: number }> = {}
    for (const r of rows) {
      try {
        const s = JSON.parse(r.scores ?? '{}') as Record<string, { score: number }>
        for (const [dim, v] of Object.entries(s)) {
          if (!totals[dim]) totals[dim] = { sum: 0, count: 0 }
          totals[dim].sum += v.score
          totals[dim].count++
        }
      } catch { /* skip */ }
    }
    if (Object.keys(totals).length === 0) return null
    return Object.fromEntries(Object.entries(totals).map(([d, { sum, count }]) => [d, sum / count]))
  }

  computeParetoFrontier(skillId: string): ParetoPoint[] {
    const allRows = this.store.querySkillChain(skillId, 50)
    const candidates: { id: string; label: string; scores: ScoreSet }[] = []
    for (const row of allRows) {
      const scores = this.avgDimScores(row.id)
      if (scores) candidates.push({ id: row.id, label: `${row.name} v${row.version}`, scores })
    }
    if (candidates.length === 0) return []

    const nonDominated = candidates.filter(cand =>
      !candidates.some(other => other.id !== cand.id && isDominated(cand.scores, other.scores))
    )

    return nonDominated.map(c => {
      const vals = Object.values(c.scores)
      const x = vals.length > 0 ? vals.reduce((a, v) => a + v, 0) / vals.length : 0
      const y = c.scores['cost_awareness'] ?? x
      return { id: c.id, label: c.label, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
    })
  }
}
