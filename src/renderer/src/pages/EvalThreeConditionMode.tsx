import { useState, useEffect, useRef } from 'react'
import type { Skill, TestCase, EvalResult, ThreeConditionResult } from '../../../shared/types'

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
const DIM_LABELS: Record<string, string> = {
  correctness:           'G1 正确性',
  instruction_following: 'G2 指令遵循',
  safety:                'G3 安全性',
  completeness:          'G4 完整性',
  robustness:            'G5 鲁棒性',
  executability:         'S1 可执行性',
  cost_awareness:        'S2 成本意识',
  maintainability:       'S3 可维护性'
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

export default function ThreeConditionMode({ skills, apiKeySet, onNavigate }: { skills: Skill[]; apiKeySet: boolean | null; onNavigate?: (page: string, skillId?: string) => void }) {
  const [skillId, setSkillId] = useState('')
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'generating' | 'evaluating' | 'done'>('idle')
  const [result, setResult] = useState<ThreeConditionResult | null>(null)
  const [scoresA, setScoresA] = useState<Record<string, number> | null>(null)
  const [scoresB, setScoresB] = useState<Record<string, number> | null>(null)
  const [scoresC, setScoresC] = useState<Record<string, number> | null>(null)
  const [detailsA, setDetailsA] = useState<EvalResult[]>([])
  const [detailsB, setDetailsB] = useState<EvalResult[]>([])
  const [detailsC, setDetailsC] = useState<EvalResult[]>([])
  const [expandedTc, setExpandedTc] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => { cleanupRef.current?.(); if (pollRef.current) clearInterval(pollRef.current) }, [])

  useEffect(() => {
    if (!skillId) { setTestCases([]); setSelectedTcIds(new Set()); return }
    window.api.testcases.getBySkill(skillId).then(tcs => {
      setTestCases(tcs)
      setSelectedTcIds(new Set(tcs.map(t => t.id)))
    })
    setResult(null); setScoresA(null); setScoresB(null); setScoresC(null)
  }, [skillId])

  const handleRun = async () => {
    if (!skillId || selectedTcIds.size === 0) return
    setRunning(true); setPhase('generating'); setProgress(10)
    setError(null); setResult(null); setScoresA(null); setScoresB(null); setScoresC(null)
    setDetailsA([]); setDetailsB([]); setDetailsC([]); setExpandedTc(null); setDetailsOpen(false)
    cleanupRef.current?.()
    cleanupRef.current = window.api.eval.onProgress((data) => {
      setProgress(p => Math.max(p, data.progress < 100 ? 30 + Math.round(data.progress * 0.6) : 90))
    })
    try {
      setPhase('evaluating')
      const r = await window.api.eval.startThreeCondition(skillId, [...selectedTcIds])
      setResult(r); setProgress(50)
      const poll = setInterval(async () => {
        const recent = Date.now() - 120_000
        const [histA, histB, histC] = await Promise.all([
          window.api.eval.history(r.noSkillId).then(h => h.items.filter(x => x.createdAt > recent)),
          window.api.eval.history(skillId).then(h => h.items.filter(x => x.createdAt > recent)),
          window.api.eval.history(r.generatedSkillId).then(h => h.items.filter(x => x.createdAt > recent))
        ])
        if (histA.length > 0 && histB.length > 0 && histC.length > 0) {
          clearInterval(poll); pollRef.current = null
          cleanupRef.current?.(); cleanupRef.current = null
          setScoresA(avgDims(histA)); setScoresB(avgDims(histB)); setScoresC(avgDims(histC))
          setDetailsA(histA); setDetailsB(histB); setDetailsC(histC)
          setPhase('done'); setRunning(false); setProgress(100)
        }
      }, 2500)
      pollRef.current = poll
      setTimeout(() => {
        clearInterval(poll); pollRef.current = null
        setPhase(p => { if (p !== 'done') { setRunning(false); cleanupRef.current?.(); cleanupRef.current = null; return 'done' } return p })
      }, 180_000)
    } catch (e) {
      setError(String(e)); setRunning(false); setPhase('idle')
      cleanupRef.current?.(); cleanupRef.current = null
    }
  }

  const skillName = skills.find(s => s.id === skillId)?.name ?? 'Skill'
  const avgOf = (sc: Record<string, number> | null) =>
    sc && Object.keys(sc).length > 0 ? Object.values(sc).reduce((a, b) => a + b, 0) / Object.values(sc).length : null
  const avgA = avgOf(scoresA), avgB = avgOf(scoresB), avgC = avgOf(scoresC)
  const deltaB = avgA !== null && avgB !== null ? avgB - avgA : null
  const deltaC = avgA !== null && avgC !== null ? avgC - avgA : null
  const allDims = Array.from(new Set([...Object.keys(scoresB ?? {}), ...Object.keys(scoresC ?? {})]))

  return (
    <div className="compare-mode">
      {apiKeySet === false && <div className="guard-banner">⚠️ 未配置 LLM 供应商，请先前往 <button className="link-btn" onClick={() => onNavigate?.('settings')}>Settings</button> 添加。</div>}

      <div className="eval-card">
        <span className="card-title">三条件评测（SkillsBench）</span>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          同时运行三个条件：<strong>A</strong> 无 Skill 基线 · <strong>B</strong> 当前 Skill · <strong>C</strong> AI 自动生成 Skill，输出 Δpp 增益。
        </p>
        <select value={skillId} onChange={e => setSkillId(e.target.value)} className="skill-select" style={{ width: '100%', marginBottom: 14 }}>
          <option value="">选择 Skill...</option>
          {skills.map(s => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
        </select>

        {testCases.length > 0 && (
          <div className="cmp-tc-section">
            <div className="card-row" style={{ marginBottom: 8 }}>
              <span className="card-title" style={{ marginBottom: 0 }}>测试用例</span>
              <div className="bulk-btns">
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTcIds(new Set(testCases.map(t => t.id)))}>全选</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTcIds(new Set())}>取消</button>
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

        {skillId && testCases.length === 0 && (
          <div className="info-banner">Skill 还没有测试用例，请先<button className="link-btn" onClick={() => onNavigate?.('eval')}>在 TestCase 页面添加</button>。</div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleRun}
          disabled={!skillId || selectedTcIds.size === 0 || running || apiKeySet === false}>
          {running
            ? phase === 'generating' ? <><span className="gen-spinner" />{` AI 生成 Skill C...`}</> : <><span className="gen-spinner" />{` 评测中 ${progress}%...`}</>
            : `▶ 开始三条件评测 (${selectedTcIds.size} 用例)`}
        </button>
        {error && <div className="guard-banner" style={{ marginTop: 10 }}>⚠️ {error}</div>}
      </div>

      {running && (
        <div className="eval-card progress-card">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <p className="progress-msg">
            {phase === 'generating' ? 'AI 正在生成 Skill C...' : '并行评测 A/B/C 三个条件中，请稍候...'}
          </p>
        </div>
      )}

      {result && phase === 'done' && (
        <div className="eval-card">
          <span className="card-title">三条件对比结果</span>
          <div className="three-cond-row">
            {[
              { label: 'A — 无 Skill 基线', avg: avgA, delta: null, color: 'var(--text-muted)' },
              { label: `B — ${skillName}`, avg: avgB, delta: deltaB, color: 'var(--accent)' },
              { label: 'C — AI 生成 Skill', avg: avgC, delta: deltaC, color: 'var(--success)' }
            ].map(({ label, avg, delta, color }) => (
              <div key={label} className="three-cond-card" style={{ borderColor: color + '55' }}>
                <div className="three-cond-label">{label}</div>
                <div className="three-cond-score" style={{ color }}>{avg !== null ? avg.toFixed(2) : '—'}</div>
                {delta !== null && (
                  <div className={`cmp-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neu'}`} style={{ fontSize: 13 }}>
                    Δpp {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                  </div>
                )}
                {delta === null && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>基准</div>}
              </div>
            ))}
          </div>

          {allDims.length > 0 && (
            <div className="cmp-dim-table" style={{ marginTop: 16 }}>
              <div className="cmp-dim-header">
                <span className="cmp-dim-col">维度</span>
                <span className="cmp-dim-col">B ({skillName})</span>
                <span className="cmp-dim-col">C (AI 生成)</span>
                <span className="cmp-dim-col">B vs C</span>
              </div>
              {allDims.map(dim => {
                const b = scoresB?.[dim] ?? 0, c = scoresC?.[dim] ?? 0
                const delta = c - b
                const color = DIM_COLORS[dim] ?? '#888'
                return (
                  <div key={dim} className="cmp-dim-row">
                    <span className="cmp-dim-name" style={{ color }}>{DIM_LABELS[dim] ?? dim}</span>
                    <div className="cmp-bar-cell">
                      <div className="cmp-bar-track"><div className="cmp-bar-fill" style={{ width: `${(b / 10) * 100}%`, background: color + '88' }} /></div>
                      <span className="cmp-bar-val">{b.toFixed(1)}</span>
                    </div>
                    <div className="cmp-bar-cell">
                      <div className="cmp-bar-track"><div className="cmp-bar-fill" style={{ width: `${(c / 10) * 100}%`, background: color }} /></div>
                      <span className="cmp-bar-val">{c.toFixed(1)}</span>
                    </div>
                    <span className={`cmp-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neu'}`}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="cmp-winner" style={{ marginTop: 16 }}>
            {avgB !== null && avgC !== null && (
              avgB > avgC
                ? <span className="winner-badge a">🏆 当前 Skill 胜出</span>
                : avgC > avgB
                  ? <span className="winner-badge b">🏆 AI 生成 Skill 胜出</span>
                  : <span className="winner-badge neu">平局</span>
            )}
          </div>

          {detailsB.length > 0 && (
            <div className="tc-detail-section" style={{ marginTop: 16 }}>
              <div className="tc-detail-header" onClick={() => setDetailsOpen(o => !o)}>
                <span className="tc-detail-chevron">{detailsOpen ? '▼' : '▶'}</span>
                <span className="tc-detail-title">按用例查看详情</span>
                <span className="tc-detail-count">{detailsB.length} 条</span>
              </div>
              {detailsOpen && (() => {
                const tcNames = [...new Set([...detailsA, ...detailsB, ...detailsC].map(r => r.testCaseName ?? '(未命名)'))]
                return (
                  <div className="tc-detail-table">
                    <div className="tc-detail-thead">
                      <span className="tc-detail-col-name">用例</span>
                      <span className="tc-detail-col-score">A 基线</span>
                      <span className="tc-detail-col-score">B 当前</span>
                      <span className="tc-detail-col-score">C AI生成</span>
                    </div>
                    {tcNames.map(tcName => {
                      const rA = detailsA.find(r => (r.testCaseName ?? '(未命名)') === tcName)
                      const rB = detailsB.find(r => (r.testCaseName ?? '(未命名)') === tcName)
                      const rC = detailsC.find(r => (r.testCaseName ?? '(未命名)') === tcName)
                      const isExpanded = expandedTc === tcName
                      const dims = [...new Set([...Object.keys(rB?.scores ?? {}), ...Object.keys(rC?.scores ?? {})])]
                      return (
                        <div key={tcName} className="tc-detail-group">
                          <div className={`tc-detail-row ${isExpanded ? 'expanded' : ''}`}
                            onClick={() => setExpandedTc(isExpanded ? null : tcName)}>
                            <span className="tc-detail-col-name">
                              <span className="tc-detail-chevron-sm">{isExpanded ? '▼' : '▶'}</span>
                              {tcName}
                            </span>
                            <span className="tc-detail-col-score" style={{ color: 'var(--text-muted)' }}>
                              {rA ? rA.totalScore.toFixed(1) : '—'}
                            </span>
                            <span className="tc-detail-col-score" style={{ color: 'var(--accent)' }}>
                              {rB ? rB.totalScore.toFixed(1) : '—'}
                            </span>
                            <span className="tc-detail-col-score" style={{ color: 'var(--success)' }}>
                              {rC ? rC.totalScore.toFixed(1) : '—'}
                            </span>
                          </div>
                          {isExpanded && dims.map(dim => {
                            const sA = rA?.scores[dim]?.score ?? null
                            const sB = rB?.scores[dim]?.score ?? null
                            const sC = rC?.scores[dim]?.score ?? null
                            const color = DIM_COLORS[dim] ?? '#888'
                            return (
                              <div key={dim} className="tc-detail-dim-row">
                                <span className="tc-detail-dim-name" style={{ color }}>{DIM_LABELS[dim] ?? dim}</span>
                                <span className="tc-detail-col-score" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{sA !== null ? sA.toFixed(1) : '—'}</span>
                                <span className="tc-detail-col-score" style={{ color, fontSize: 12 }}>{sB !== null ? sB.toFixed(1) : '—'}</span>
                                <span className="tc-detail-col-score" style={{ color, fontSize: 12 }}>{sC !== null ? sC.toFixed(1) : '—'}</span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
