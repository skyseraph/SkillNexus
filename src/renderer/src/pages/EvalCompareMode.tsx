import { useState, useEffect, useRef } from 'react'
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

export default function CompareMode({ skills, apiKeySet, onNavigate }: { skills: Skill[]; apiKeySet: boolean | null; onNavigate?: (page: string, skillId?: string) => void }) {
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
      await Promise.all([
        window.api.eval.start(skillAId, tcIds),
        window.api.eval.start(skillBId, tcIds)
      ])
      const poll = setInterval(async () => {
        const [hA, hB] = await Promise.all([
          window.api.eval.history(skillAId),
          window.api.eval.history(skillBId)
        ])
        const recent = Date.now() - 60_000
        const filtA = hA.items.filter(r => r.createdAt > recent)
        const filtB = hB.items.filter(r => r.createdAt > recent)
        if (filtA.length > 0 && filtB.length > 0) {
          clearInterval(poll); pollRef.current = null
          cleanupRef.current?.(); cleanupRef.current = null
          setScoresA(avgDims(filtA)); setScoresB(avgDims(filtB))
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
      {apiKeySet === false && <div className="guard-banner">⚠️ 未配置 LLM 供应商，请先前往 <button className="link-btn" onClick={() => onNavigate?.('settings')}>Settings</button> 添加。</div>}

      <div className="eval-card">
        <span className="card-title">选择两个 Skill 对比</span>
        <div className="cmp-skill-row">
          <div className="cmp-skill-picker">
            <label className="cmp-skill-label">Skill A</label>
            <select value={skillAId} onChange={e => setSkillAId(e.target.value)} className="skill-select">
              <option value="">选择 Skill A...</option>
              {skills.filter(s => s.id !== skillBId).map(s => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
            </select>
          </div>
          <div className="cmp-vs">VS</div>
          <div className="cmp-skill-picker">
            <label className="cmp-skill-label">Skill B</label>
            <select value={skillBId} onChange={e => setSkillBId(e.target.value)} className="skill-select">
              <option value="">选择 Skill B...</option>
              {skills.filter(s => s.id !== skillAId).map(s => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
            </select>
          </div>
        </div>

        {testCases.length > 0 && (
          <div className="cmp-tc-section">
            <div className="card-row" style={{ marginBottom: 8 }}>
              <span className="card-title" style={{ marginBottom: 0 }}>测试用例 (来自 Skill A)</span>
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

        {skillAId && testCases.length === 0 && (
          <div className="info-banner">Skill A 还没有测试用例，请先<button className="link-btn" onClick={() => onNavigate?.('eval')}>在 TestCase 页面添加</button>。</div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleRun}
          disabled={!skillAId || !skillBId || selectedTcIds.size === 0 || running || apiKeySet === false}>
          {running ? <><span className="gen-spinner" />{` 评测中 ${progress}%...`}</> : `▶ 开始对比评测 (${selectedTcIds.size} 用例)`}
        </button>
        {error && <div className="guard-banner" style={{ marginTop: 10 }}>⚠️ {error}</div>}
      </div>

      {running && (
        <div className="eval-card progress-card">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <p className="progress-msg">正在对 {skillAName} 和 {skillBName} 并行评测，请稍候...</p>
        </div>
      )}

      {scoresA && scoresB && (
        <div className="eval-card">
          <span className="card-title">对比结果</span>
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
                <span className="cmp-dim-col">维度</span>
                <span className="cmp-dim-col">{skillAName}</span>
                <span className="cmp-dim-col">{skillBName}</span>
                <span className="cmp-dim-col">差值</span>
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
                ? <span className="winner-badge a">🏆 {skillAName} 胜出 (+{(avgA - avgB).toFixed(2)})</span>
                : avgB > avgA
                  ? <span className="winner-badge b">🏆 {skillBName} 胜出 (+{(avgB - avgA).toFixed(2)})</span>
                  : <span className="winner-badge neu">平局</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
