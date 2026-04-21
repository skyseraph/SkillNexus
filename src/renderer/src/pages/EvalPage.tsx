import { useEffect, useState, useCallback } from 'react'
import type { Skill, EvalResult, TestCase } from '../../../shared/types'

const DIM_COLORS: Record<string, string> = {
  correctness:  '#6c63ff',
  clarity:      '#00d4aa',
  completeness: '#f59e0b',
  safety:       '#ef4444'
}
const DIM_ORDER = ['correctness', 'clarity', 'completeness', 'safety']

// ── SVG Radar Chart ───────────────────────────────────────────────────────────

function RadarChart({ scores, size = 200 }: { scores: Record<string, number>; size?: number }) {
  const dims = DIM_ORDER.filter((d) => d in scores)
  if (dims.length < 3) return null
  const cx = size / 2, cy = size / 2, r = size * 0.38
  const angle = (i: number) => (Math.PI * 2 * i) / dims.length - Math.PI / 2
  const pt = (i: number, val: number) => {
    const a = angle(i), ratio = val / 10
    return [cx + r * ratio * Math.cos(a), cy + r * ratio * Math.sin(a)] as [number, number]
  }
  const gridLevels = [2, 4, 6, 8, 10]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid */}
      {gridLevels.map((lvl) => (
        <polygon key={lvl}
          points={dims.map((_, i) => pt(i, lvl).join(',')).join(' ')}
          fill="none" stroke="var(--border)" strokeWidth="0.8" />
      ))}
      {/* Axes */}
      {dims.map((_, i) => {
        const [x, y] = pt(i, 10)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="0.8" />
      })}
      {/* Data polygon */}
      <polygon
        points={dims.map((d, i) => pt(i, scores[d] ?? 0).join(',')).join(' ')}
        fill="rgba(108,99,255,0.18)" stroke="#6c63ff" strokeWidth="1.5" />
      {/* Dots */}
      {dims.map((d, i) => {
        const [x, y] = pt(i, scores[d] ?? 0)
        return <circle key={d} cx={x} cy={y} r={3} fill={DIM_COLORS[d] ?? '#6c63ff'} />
      })}
      {/* Labels */}
      {dims.map((d, i) => {
        const a = angle(i)
        const lx = cx + (r + 18) * Math.cos(a)
        const ly = cy + (r + 18) * Math.sin(a)
        return (
          <text key={d} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill="var(--text-muted)" fontWeight="600">
            {d}
          </text>
        )
      })}
    </svg>
  )
}

// ── SVG Trend Line ────────────────────────────────────────────────────────────

function TrendLine({ history, width = 340, height = 80 }: {
  history: EvalResult[]; width?: number; height?: number
}) {
  if (history.length < 2) return null
  const pad = { l: 28, r: 12, t: 10, b: 20 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  const pts = history.map((r, i) => ({
    x: pad.l + (i / (history.length - 1)) * W,
    y: pad.t + H - (r.totalScore / 10) * H,
    score: r.totalScore,
    date: new Date(r.createdAt).toLocaleDateString()
  }))
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length-1].x.toFixed(1)},${(pad.t+H).toFixed(1)} L${pts[0].x.toFixed(1)},${(pad.t+H).toFixed(1)} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Y axis labels */}
      {[0, 5, 10].map((v) => {
        const y = pad.t + H - (v / 10) * H
        return (
          <g key={v}>
            <line x1={pad.l - 4} y1={y} x2={pad.l + W} y2={y} stroke="var(--border)" strokeWidth="0.6" strokeDasharray="3,3" />
            <text x={pad.l - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize="8" fill="var(--text-muted)">{v}</text>
          </g>
        )
      })}
      {/* Area fill */}
      <path d={areaD} fill="rgba(108,99,255,0.08)" />
      {/* Line */}
      <path d={pathD} fill="none" stroke="#6c63ff" strokeWidth="1.8" strokeLinejoin="round" />
      {/* Dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6c63ff" />
      ))}
    </svg>
  )
}

// ── Aggregate helpers ─────────────────────────────────────────────────────────

function avgDimScores(history: EvalResult[]): Record<string, number> {
  const totals: Record<string, { sum: number; count: number }> = {}
  for (const r of history) {
    for (const [dim, s] of Object.entries(r.scores)) {
      if (!totals[dim]) totals[dim] = { sum: 0, count: 0 }
      totals[dim].sum += s.score
      totals[dim].count++
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([d, { sum, count }]) => [d, sum / count]))
}

// ── Main EvalPage ─────────────────────────────────────────────────────────────

export default function EvalPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState('')
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<EvalResult[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    window.api.skills.getAll().then(setSkills)
    window.api.config.get().then((c) => setApiKeySet(c.anthropicApiKeySet || c.openaiApiKeySet))
  }, [])

  const refreshHistory = useCallback(() => {
    if (selectedSkill) window.api.eval.history(selectedSkill).then(setHistory).catch(() => {})
  }, [selectedSkill])

  useEffect(() => {
    if (!selectedSkill) { setTestCases([]); setSelectedTcIds(new Set()); setHistory([]); return }
    window.api.testcases.getBySkill(selectedSkill).then((tcs) => {
      setTestCases(tcs)
      setSelectedTcIds(new Set(tcs.map((tc) => tc.id)))
    })
    refreshHistory()
  }, [selectedSkill, refreshHistory])

  useEffect(() => {
    const cleanup = window.api.eval.onProgress((data) => {
      setProgress(data.progress)
      setProgressMsg(data.message)
      if (data.progress >= 100) { setRunning(false); refreshHistory() }
    })
    return cleanup
  }, [refreshHistory])

  const toggleTc = (id: string) => setSelectedTcIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const handleRunEval = async () => {
    if (!selectedSkill || selectedTcIds.size === 0) return
    setRunning(true); setProgress(0); setProgressMsg('')
    try {
      await window.api.eval.start(selectedSkill, [...selectedTcIds])
    } catch (e) {
      setRunning(false)
      setProgressMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const avgScores = avgDimScores(history)
  const successHistory = history.filter((r) => r.status === 'success')
  const overallAvg = successHistory.length
    ? successHistory.reduce((s, r) => s + r.totalScore, 0) / successHistory.length
    : null

  return (
    <div className="eval-root">
      {/* Header */}
      <div className="eval-page-header">
        <div>
          <h1>Eval</h1>
          <p className="subtitle">多维度评测 Skill 质量</p>
        </div>
        <div className="eval-controls">
          <select value={selectedSkill} onChange={(e) => setSelectedSkill(e.target.value)} className="skill-select">
            <option value="">选择 Skill...</option>
            {skills.map((s) => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
          </select>
          <button
            className="btn btn-primary"
            onClick={handleRunEval}
            disabled={!selectedSkill || running || selectedTcIds.size === 0 || apiKeySet === false}
          >
            {running ? `${progress}%` : `▶ 运行评测（${selectedTcIds.size}）`}
          </button>
        </div>
      </div>

      {apiKeySet === false && (
        <div className="guard-banner">⚠️ 未配置 API Key，请前往 Settings 添加后再运行评测。</div>
      )}

      {/* Test case selector */}
      {selectedSkill && testCases.length === 0 && (
        <div className="info-banner">该 Skill 还没有测试用例，请先在 TestCase 页面添加。</div>
      )}
      {testCases.length > 0 && (
        <div className="eval-card">
          <div className="card-row">
            <span className="card-title">测试用例</span>
            <div className="bulk-btns">
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTcIds(new Set(testCases.map((t) => t.id)))}>全选</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTcIds(new Set())}>取消</button>
            </div>
          </div>
          <div className="tc-list">
            {testCases.map((tc) => (
              <label key={tc.id} className={`tc-row ${selectedTcIds.has(tc.id) ? 'selected' : ''}`}>
                <input type="checkbox" checked={selectedTcIds.has(tc.id)} onChange={() => toggleTc(tc.id)} />
                <span className="tc-name">{tc.name}</span>
                <span className="judge-chip">{tc.judgeType}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {running && (
        <div className="eval-card progress-card">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-msg">{progressMsg || '评测中...'} {progress}%</p>
        </div>
      )}

      {/* Visualizations */}
      {successHistory.length > 0 && (
        <div className="viz-grid">
          {/* Radar */}
          <div className="eval-card viz-card">
            <div className="card-title">维度均分雷达图</div>
            <div className="radar-wrap">
              <RadarChart scores={avgScores} size={220} />
              <div className="radar-legend">
                {DIM_ORDER.filter((d) => d in avgScores).map((d) => (
                  <div key={d} className="legend-row">
                    <span className="legend-dot" style={{ background: DIM_COLORS[d] }} />
                    <span className="legend-dim">{d}</span>
                    <span className="legend-val" style={{ color: DIM_COLORS[d] }}>{avgScores[d].toFixed(1)}</span>
                  </div>
                ))}
                {overallAvg !== null && (
                  <div className="legend-row overall">
                    <span className="legend-dim">总均分</span>
                    <span className="legend-val accent">{overallAvg.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trend */}
          {successHistory.length >= 2 && (
            <div className="eval-card viz-card">
              <div className="card-title">总分趋势（最近 {successHistory.length} 次）</div>
              <TrendLine history={successHistory.slice(-20)} width={340} height={100} />
              <div className="trend-stats">
                <div className="trend-stat">
                  <span className="ts-label">最低</span>
                  <span className="ts-val danger">{Math.min(...successHistory.map((r) => r.totalScore)).toFixed(1)}</span>
                </div>
                <div className="trend-stat">
                  <span className="ts-label">均值</span>
                  <span className="ts-val accent">{overallAvg!.toFixed(2)}</span>
                </div>
                <div className="trend-stat">
                  <span className="ts-label">最高</span>
                  <span className="ts-val success">{Math.max(...successHistory.map((r) => r.totalScore)).toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History list */}
      {history.length > 0 && (
        <div className="eval-card">
          <div className="card-title">评测历史（{history.length} 条）</div>
          <div className="history-list">
            {history.map((r) => (
              <div key={r.id} className="result-row" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                <div className="result-row-header">
                  <span className={`status-dot ${r.status}`} />
                  <span className="result-date">{new Date(r.createdAt).toLocaleString()}</span>
                  <div className="result-dim-bars">
                    {DIM_ORDER.filter((d) => d in r.scores).map((d) => (
                      <div key={d} className="inline-bar-wrap" title={`${d}: ${r.scores[d].score}/10`}>
                        <div className="inline-bar" style={{ width: `${(r.scores[d].score / 10) * 100}%`, background: DIM_COLORS[d] }} />
                      </div>
                    ))}
                  </div>
                  <span className="result-total" style={{ color: r.totalScore >= 7 ? 'var(--success)' : r.totalScore >= 4 ? 'var(--warning)' : 'var(--danger)' }}>
                    {r.totalScore.toFixed(1)}
                  </span>
                  <span className="expand-icon">{expandedId === r.id ? '▾' : '▸'}</span>
                </div>
                {expandedId === r.id && (
                  <div className="result-detail">
                    {Object.entries(r.scores).map(([dim, s]) => (
                      <div key={dim} className="detail-dim">
                        <div className="detail-dim-header">
                          <span className="detail-dim-name" style={{ color: DIM_COLORS[dim] ?? 'var(--text)' }}>{dim}</span>
                          <span className="detail-dim-score">{s.score}/10</span>
                        </div>
                        {s.details && <p className="detail-text">{s.details}</p>}
                        {s.violations?.length > 0 && (
                          <ul className="violations">
                            {s.violations.map((v, i) => <li key={i}>{v}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                    {r.status === 'error' && <div className="error-detail">{r.output}</div>}
                    <div className="detail-input">
                      <span className="detail-label">Input</span>
                      <pre className="detail-pre">{r.inputPrompt}</pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .eval-root { display: flex; flex-direction: column; gap: 20px; }
        .eval-page-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .eval-page-header h1 { font-size: 24px; font-weight: 700; }
        .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
        .eval-controls { display: flex; gap: 10px; align-items: center; }
        .skill-select { padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 14px; min-width: 200px; }
        .guard-banner { background: rgba(250,204,21,0.08); border: 1px solid rgba(250,204,21,0.3); border-radius: var(--radius); padding: 12px 16px; color: var(--warning); font-size: 13px; }
        .info-banner { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; color: var(--text-muted); font-size: 13px; }

        /* Cards */
        .eval-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
        .card-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 14px; display: block; }
        .card-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .card-row .card-title { margin-bottom: 0; }
        .bulk-btns { display: flex; gap: 6px; }
        .btn-sm { padding: 5px 10px; font-size: 12px; }

        /* TC list */
        .tc-list { display: flex; flex-direction: column; gap: 3px; max-height: 180px; overflow-y: auto; }
        .tc-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .tc-row:hover { background: var(--surface2); }
        .tc-row.selected { background: rgba(108,99,255,0.08); }
        .tc-name { flex: 1; }
        .judge-chip { font-size: 10px; border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; color: var(--text-muted); }

        /* Progress */
        .progress-card { padding: 14px 20px; }
        .progress-track { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
        .progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s; }
        .progress-msg { font-size: 12px; color: var(--text-muted); margin: 0; }

        /* Viz grid */
        .viz-grid { display: grid; grid-template-columns: auto 1fr; gap: 16px; }
        .viz-card { }
        .radar-wrap { display: flex; align-items: center; gap: 20px; }
        .radar-legend { display: flex; flex-direction: column; gap: 8px; }
        .legend-row { display: flex; align-items: center; gap: 8px; }
        .legend-row.overall { margin-top: 6px; border-top: 1px solid var(--border); padding-top: 6px; }
        .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .legend-dim { font-size: 12px; color: var(--text-muted); text-transform: capitalize; width: 90px; }
        .legend-val { font-size: 13px; font-weight: 700; }
        .legend-val.accent { color: var(--accent); }
        .trend-stats { display: flex; gap: 24px; margin-top: 10px; }
        .trend-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .ts-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .ts-val { font-size: 16px; font-weight: 700; }
        .ts-val.danger { color: var(--danger); }
        .ts-val.accent { color: var(--accent); }
        .ts-val.success { color: var(--success); }

        /* History list */
        .history-list { display: flex; flex-direction: column; gap: 4px; }
        .result-row { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; cursor: pointer; }
        .result-row-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--surface2); transition: background var(--transition); }
        .result-row-header:hover { background: rgba(108,99,255,0.06); }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .status-dot.success { background: var(--success); }
        .status-dot.error { background: var(--danger); }
        .result-date { font-size: 12px; color: var(--text-muted); flex: 1; }
        .result-dim-bars { display: flex; gap: 3px; align-items: center; }
        .inline-bar-wrap { width: 36px; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .inline-bar { height: 100%; border-radius: 3px; }
        .result-total { font-size: 14px; font-weight: 700; width: 32px; text-align: right; }
        .expand-icon { font-size: 11px; color: var(--text-muted); width: 12px; }

        /* Detail */
        .result-detail { padding: 14px 16px; background: var(--bg); border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
        .detail-dim { background: var(--surface2); border-radius: var(--radius); padding: 10px 12px; }
        .detail-dim-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .detail-dim-name { font-size: 12px; font-weight: 700; text-transform: capitalize; }
        .detail-dim-score { font-size: 13px; font-weight: 700; }
        .detail-text { font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.5; }
        .violations { margin: 6px 0 0 0; padding-left: 16px; }
        .violations li { font-size: 12px; color: var(--danger); }
        .error-detail { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius); padding: 8px 12px; color: var(--danger); font-size: 12px; }
        .detail-input { }
        .detail-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); display: block; margin-bottom: 4px; }
        .detail-pre { font-family: 'Courier New', monospace; font-size: 11px; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 8px 10px; margin: 0; white-space: pre-wrap; word-break: break-all; color: var(--text); max-height: 120px; overflow-y: auto; }
      `}</style>
    </div>
  )
}
