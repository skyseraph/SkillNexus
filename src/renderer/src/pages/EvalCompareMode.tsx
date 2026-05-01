import { useState, useEffect, useRef } from 'react'
import { useT } from '../i18n'
import type { Skill, TestCase, EvalResult } from '../../../shared/types'

const DIM_COLORS: Record<string, string> = {
  correctness:           '#6c63ff',
  instruction_following: '#00d4aa',
  safety:                '#ef4444',
  completeness:          '#f59e0b',
  robustness:            '#8b5cf6',
  executability:         '#06b6d4',
  cost_awareness:        '#10b981',
  maintainability:       '#f97316'
}

function avgDims(history: EvalResult[]): Record<string, number> {
  const totals: Record<string, { sum: number; count: number }> = {}
  for (const r of history.filter(h => h.status === 'success')) {
    for (const [dim, s] of Object.entries(r.scores)) {
      if (!totals[dim]) totals[dim] = { sum: 0, count: 0 }
      totals[dim].sum += s.score; totals[dim].count++
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([d, { sum, count }]) => [d, sum / count]))
}

export default function CompareMode({ skills, apiKeySet, onNavigate }: { skills: Skill[]; apiKeySet: boolean | null; onNavigate?: (page: string, skillId?: string) => void }) {
  const t = useT()
  const DIM_LABELS: Record<string, string> = {
    correctness:           t('eval.dim.correctness'),
    instruction_following: t('eval.dim.instruction_following'),
    safety:                t('eval.dim.safety'),
    completeness:          t('eval.dim.completeness'),
    robustness:            t('eval.dim.robustness'),
    executability:         t('eval.dim.executability'),
    cost_awareness:        t('eval.dim.cost_awareness'),
    maintainability:       t('eval.dim.maintainability'),
  }
  const [skillAId, setSkillAId] = useState('')
  const [skillBId, setSkillBId] = useState('')
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [scoresA, setScoresA] = useState<Record<string, number> | null>(null)
  const [scoresB, setScoresB] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => { cleanupRef.current?.(); if (pollRef.current) clearInterval(pollRef.current) }, [])

  useEffect(() => {
    if (!skillAId) { setTestCases([]); setSelectedTcIds(new Set()); return }
    window.api.testcases.getBySkill(skillAId).then(tcs => {
      setTestCases(tcs)
      setSelectedTcIds(new Set(tcs.map(tc => tc.id)))
    })
    setScoresA(null); setScoresB(null)
  }, [skillAId])

  const handleRun = async () => {
    if (!skillAId || !skillBId || selectedTcIds.size === 0) return
    setRunning(true); setProgress(0); setError(null); setScoresA(null); setScoresB(null)
    const tcIds = [...selectedTcIds]
    cleanupRef.current?.()
    cleanupRef.current = window.api.eval.onProgress((data) => {
      setProgress(Math.max(data.progress, 10))
    })
    try {
      const [jobIdA, jobIdB] = await Promise.all([
        window.api.eval.start(skillAId, tcIds),
        window.api.eval.start(skillBId, tcIds)
      ])
      const poll = setInterval(async () => {
        const [resA, resB] = await Promise.all([
          window.api.eval.getByJobId(jobIdA),
          window.api.eval.getByJobId(jobIdB)
        ])
        if (resA.length >= tcIds.length && resB.length >= tcIds.length) {
          clearInterval(poll); pollRef.current = null
          cleanupRef.current?.(); cleanupRef.current = null
          setScoresA(avgDims(resA)); setScoresB(avgDims(resB))
          setRunning(false)
        }
      }, 2000)
      pollRef.current = poll
      setTimeout(() => { clearInterval(poll); pollRef.current = null }, 120_000)
    } catch (e) {
      setError(String(e)); setRunning(false)
      cleanupRef.current?.(); cleanupRef.current = null
    }
  }

  const allDims = Array.from(new Set([...Object.keys(scoresA ?? {}), ...Object.keys(scoresB ?? {})]))
  const skillAName = skills.find(s => s.id === skillAId)?.name ?? 'Skill A'
  const skillBName = skills.find(s => s.id === skillBId)?.name ?? 'Skill B'
  const avgA = scoresA ? Object.values(scoresA).reduce((a, b) => a + b, 0) / Object.values(scoresA).length : null
  const avgB = scoresB ? Object.values(scoresB).reduce((a, b) => a + b, 0) / Object.values(scoresB).length : null

  return (
    <div className="compare-mode">
      {apiKeySet === false && <div className="guard-banner">{t('cmp.guard_no_llm')}</div>}

      <div className="eval-card">
        <span className="card-title">{t('cmp.title_select')}</span>
        <div className="cmp-skill-row">
          <div className="cmp-skill-picker">
            <label className="cmp-skill-label">Skill A</label>
            <select value={skillAId} onChange={e => setSkillAId(e.target.value)} className="skill-select">
              <option value="">{t('cmp.option_skill_a')}</option>
              {skills.filter(s => s.id !== skillBId).map(s => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
            </select>
          </div>
          <div className="cmp-vs">VS</div>
          <div className="cmp-skill-picker">
            <label className="cmp-skill-label">Skill B</label>
            <select value={skillBId} onChange={e => setSkillBId(e.target.value)} className="skill-select">
              <option value="">{t('cmp.option_skill_b')}</option>
              {skills.filter(s => s.id !== skillAId).map(s => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
            </select>
          </div>
        </div>

        {testCases.length > 0 && (
          <div className="cmp-tc-section">
            <div className="card-row" style={{ marginBottom: 8 }}>
              <span className="card-title" style={{ marginBottom: 0 }}>{t('cmp.title_test_cases')}</span>
              <div className="bulk-btns">
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTcIds(new Set(testCases.map(t => t.id)))}>{t('common.select_all')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTcIds(new Set())}>{t('common.cancel')}</button>
              </div>
            </div>
            <div className="tc-list" style={{ maxHeight: 140, overflowY: 'auto' }}>
              {testCases.map(tc => (
                <label key={tc.id} className={`tc-row ${selectedTcIds.has(tc.id) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={selectedTcIds.has(tc.id)} onChange={() => {
                    setSelectedTcIds(prev => { const n = new Set(prev); n.has(tc.id) ? n.delete(tc.id) : n.add(tc.id); return n })
                  }} />
                  <span className="tc-name">{tc.name}</span>
                  <span className="judge-chip">{tc.judgeType}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {skillAId && testCases.length === 0 && (
          <div className="info-banner">{t('cmp.info_no_test_cases')}</div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleRun}
          disabled={!skillAId || !skillBId || selectedTcIds.size === 0 || running || apiKeySet === false}>
          {running
            ? <><span className="gen-spinner" />{' '}{t('cmp.status_evaluating').replace('{progress}', String(progress))}</>
            : t('cmp.btn_start').replace('{n}', String(selectedTcIds.size))}
        </button>
        {error && <div className="guard-banner" style={{ marginTop: 10 }}>⚠️ {error}</div>}
      </div>

      {running && (
        <div className="eval-card progress-card">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <p className="progress-msg">{t('cmp.progress_msg').replace('{a}', skillAName).replace('{b}', skillBName)}</p>
        </div>
      )}

      {scoresA && scoresB && (
        <div className="eval-card">
          <span className="card-title">{t('cmp.title_results')}</span>
          <div className="cmp-overall-row">
            <div className="cmp-overall-item" style={{ color: avgA! >= (avgB ?? 0) ? 'var(--success)' : 'var(--text)' }}>
              <div className="cmp-overall-name">{skillAName}</div>
              <div className="cmp-overall-score">{avgA?.toFixed(2)}</div>
            </div>
            <div className="cmp-overall-vs">VS</div>
            <div className="cmp-overall-item" style={{ color: (avgB ?? 0) >= avgA! ? 'var(--success)' : 'var(--text)' }}>
              <div className="cmp-overall-name">{skillBName}</div>
              <div className="cmp-overall-score">{avgB?.toFixed(2)}</div>
            </div>
          </div>
          {allDims.length > 0 && (
            <div className="cmp-dim-table">
              <div className="cmp-dim-header">
                <span className="cmp-dim-col">{t('cmp.dim_header')}</span>
                <span className="cmp-dim-col">{skillAName}</span>
                <span className="cmp-dim-col">{skillBName}</span>
                <span className="cmp-dim-col">{t('cmp.delta_header')}</span>
              </div>
              {allDims.map(dim => {
                const a = scoresA[dim] ?? 0, b = scoresB[dim] ?? 0
                const delta = b - a
                const color = DIM_COLORS[dim] ?? '#888'
                return (
                  <div key={dim} className="cmp-dim-row">
                    <span className="cmp-dim-name" style={{ color }}>{DIM_LABELS[dim] ?? dim}</span>
                    <div className="cmp-bar-cell">
                      <div className="cmp-bar-track"><div className="cmp-bar-fill" style={{ width: `${(a / 10) * 100}%`, background: color + '88' }} /></div>
                      <span className="cmp-bar-val">{a.toFixed(1)}</span>
                    </div>
                    <div className="cmp-bar-cell">
                      <div className="cmp-bar-track"><div className="cmp-bar-fill" style={{ width: `${(b / 10) * 100}%`, background: color }} /></div>
                      <span className="cmp-bar-val">{b.toFixed(1)}</span>
                    </div>
                    <span className={`cmp-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neu'}`}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="cmp-winner">
            {avgA !== null && avgB !== null && (
              avgA > avgB
                ? <span className="winner-badge a">{t('cmp.winner').replace('{name}', skillAName).replace('{delta}', (avgA - avgB).toFixed(2))}</span>
                : avgB > avgA
                  ? <span className="winner-badge b">{t('cmp.winner').replace('{name}', skillBName).replace('{delta}', (avgB - avgA).toFixed(2))}</span>
                  : <span className="winner-badge neu">{t('cmp.tie')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
