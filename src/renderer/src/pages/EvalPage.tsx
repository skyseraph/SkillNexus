import { useEffect, useState, useCallback, useRef } from 'react'
import type { Skill, EvalResult, EvalScore, TestCase } from '../../../shared/types'
import CompareMode from './EvalCompareMode'
import ThreeConditionMode from './EvalThreeConditionMode'
import { useTrack } from '../hooks/useTrack'
import EmptyState from '../components/EmptyState'
import { useT } from '../i18n/useT'
import { useToast } from '../hooks/useToast'
import { friendlyError } from '../utils/friendly-error'

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
const DIM_ORDER = [
  'correctness', 'instruction_following', 'safety', 'completeness',
  'robustness', 'executability', 'cost_awareness', 'maintainability'
]

function makeDimLabels(t: (k: string) => string): Record<string, string> {
  return {
    correctness:           t('eval.dim.correctness'),
    instruction_following: t('eval.dim.instruction_following'),
    safety:                t('eval.dim.safety'),
    completeness:          t('eval.dim.completeness'),
    robustness:            t('eval.dim.robustness'),
    executability:         t('eval.dim.executability'),
    cost_awareness:        t('eval.dim.cost_awareness'),
    maintainability:       t('eval.dim.maintainability'),
  }
}

// ── Framework Panel ───────────────────────────────────────────────────────────

function FrameworkPanel() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const FRAMEWORK_DIMS = [
    { key: 'correctness',           source: 'AgentSkills G1', color: '#6c63ff' },
    { key: 'instruction_following', source: 'AgentSkills G2', color: '#00d4aa' },
    { key: 'safety',                source: 'AgentSkills G3', color: '#ef4444' },
    { key: 'completeness',          source: 'AgentSkills G4', color: '#f59e0b' },
    { key: 'robustness',            source: 'AgentSkills G5', color: '#8b5cf6' },
    { key: 'executability',         source: 'S1',             color: '#06b6d4' },
    { key: 'cost_awareness',        source: 'S2',             color: '#10b981' },
    { key: 'maintainability',       source: 'S3',             color: '#f97316' },
  ]
  return (
    <div className="fw-panel">
      <button className="fw-toggle" onClick={() => setOpen(v => !v)}>
        <span>{t('eval.framework_label')}</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="fw-body">
          <div className="fw-grid">
            {FRAMEWORK_DIMS.map(d => (
              <div key={d.key} className="fw-dim">
                <div className="fw-dim-header">
                  <span className="fw-dot" style={{ background: d.color }} />
                  <span className="fw-dim-name" style={{ color: d.color }}>{d.key.replace(/_/g, ' ')}</span>
                  <span className="fw-source">{d.source}</span>
                </div>
                <p className="fw-desc">{t(`eval.dim_desc.${d.key}`)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SVG Radar Chart ───────────────────────────────────────────────────────────

function RadarChart({ scores, minScores, maxScores, size = 200 }: {
  scores: Record<string, number>
  minScores?: Record<string, number>
  maxScores?: Record<string, number>
  size?: number
}) {
  const t = useT()
  const DIM_LABELS = makeDimLabels(t)
  const dims = DIM_ORDER.filter((d) => d in scores)
  if (dims.length < 3) return <div className="chart-empty">{t('eval.radar_empty')}</div>
  const pad = 36  // space for labels
  const cx = size / 2, cy = size / 2, r = size / 2 - pad
  const angle = (i: number) => (Math.PI * 2 * i) / dims.length - Math.PI / 2
  const pt = (i: number, val: number) => {
    const a = angle(i), ratio = val / 10
    return [cx + r * ratio * Math.cos(a), cy + r * ratio * Math.sin(a)] as [number, number]
  }
  const gridLevels = [2, 4, 6, 8, 10]
  const showBand = minScores && maxScores
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible', flexShrink: 0 }}>
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
      {/* Min/Max band (shown when ≥5 samples) */}
      {showBand && (
        <>
          <polygon
            points={dims.map((d, i) => pt(i, maxScores![d] ?? 0).join(',')).join(' ')}
            fill="rgba(108,99,255,0.07)" stroke="none" />
          <polygon
            points={dims.map((d, i) => pt(i, minScores![d] ?? 0).join(',')).join(' ')}
            fill="var(--bg)" stroke="none" />
          <polygon
            points={dims.map((d, i) => pt(i, maxScores![d] ?? 0).join(',')).join(' ')}
            fill="none" stroke="rgba(108,99,255,0.25)" strokeWidth="0.8" strokeDasharray="3,2" />
          <polygon
            points={dims.map((d, i) => pt(i, minScores![d] ?? 0).join(',')).join(' ')}
            fill="none" stroke="rgba(108,99,255,0.18)" strokeWidth="0.8" strokeDasharray="3,2" />
        </>
      )}
      {/* Avg polygon */}
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
            fontSize="10" fill="var(--text-muted)" fontWeight="600">
            {DIM_LABELS[d] ?? d}
          </text>
        )
      })}
    </svg>
  )
}

// ── Agent Output Renderer ─────────────────────────────────────────────────────

interface AgentTrace { turn: number; toolName: string; toolInput: Record<string, unknown>; toolOutput: string; toolError?: string }
interface AgentOutput { answer: string; trace: AgentTrace[] }

function AgentOutputRenderer({ output }: { output: string }) {
  const [open, setOpen] = useState(false)
  let parsed: AgentOutput | null = null
  try {
    const obj = JSON.parse(output)
    if (obj && typeof obj.answer === 'string' && Array.isArray(obj.trace)) parsed = obj as AgentOutput
  } catch { /* not agent output */ }

  if (!parsed) return <pre className="detail-pre">{output}</pre>

  return (
    <div className="agent-output">
      <pre className="detail-pre">{parsed.answer}</pre>
      {parsed.trace.length > 0 && (
        <div className="agent-trace">
          <button className="trace-toggle" onClick={() => setOpen(o => !o)}>
            {open ? '▼' : '▶'} 执行轨迹（{parsed.trace.length} 步）
          </button>
          {open && (
            <div className="trace-steps">
              {parsed.trace.map((step, i) => (
                <div key={i} className="trace-step">
                  <div className="trace-step-header">
                    <span className="trace-turn">Turn {step.turn + 1}</span>
                    <span className="trace-tool-name">{step.toolName}</span>
                    {step.toolError && <span className="trace-error-badge">error</span>}
                  </div>
                  <div className="trace-input">
                    <span className="trace-label">Input</span>
                    <pre className="trace-pre">{JSON.stringify(step.toolInput, null, 2)}</pre>
                  </div>
                  <div className="trace-output">
                    <span className="trace-label">{step.toolError ? 'Error' : 'Output'}</span>
                    <pre className="trace-pre">{step.toolError ? `${step.toolError}\n${step.toolOutput}` : step.toolOutput}</pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SVG Trend Line (total score) ──────────────────────────────────────────────

function TrendLine({ history, tcNames, width = 340, height = 120 }: {
  history: EvalResult[]; tcNames: string[]; width?: number; height?: number
}) {
  const [tcFilter, setTcFilter] = useState('')
  const filtered = tcFilter ? history.filter(r => r.testCaseName === tcFilter) : history
  const data = filtered.slice(-20)
  if (data.length < 2) return (
    <div>
      {tcNames.length > 0 && (
        <div className="trend-filter-row">
          <select className="trend-tc-select" value={tcFilter} onChange={e => setTcFilter(e.target.value)}>
            <option value="">全部用例</option>
            {tcNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
      <div className="chart-empty">至少需要 2 次评测数据</div>
    </div>
  )

  const pad = { l: 28, r: 12, t: 10, b: 32 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b

  const pts = data.map((r, i) => ({
    x: pad.l + (i / (data.length - 1)) * W,
    y: pad.t + H - (r.totalScore / 10) * H,
    r,
  }))
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length-1].x.toFixed(1)},${(pad.t+H).toFixed(1)} L${pts[0].x.toFixed(1)},${(pad.t+H).toFixed(1)} Z`

  // 7-point moving average
  const maPath = data.length >= 7 ? (() => {
    const maPts = data.map((_, i) => {
      if (i < 3 || i > data.length - 4) return null
      const window = data.slice(i - 3, i + 4)
      const avg = window.reduce((s, r) => s + r.totalScore, 0) / window.length
      return { x: pts[i].x, y: pad.t + H - (avg / 10) * H }
    }).filter(Boolean) as { x: number; y: number }[]
    return maPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  })() : null

  // X-axis date ticks: show up to 5 evenly spaced
  const tickIndices = data.length <= 5
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(data.length * 3 / 4), data.length - 1]

  return (
    <div>
      {tcNames.length > 0 && (
        <div className="trend-filter-row">
          <select className="trend-tc-select" value={tcFilter} onChange={e => setTcFilter(e.target.value)}>
            <option value="">全部用例</option>
            {tcNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 5, 10].map((v) => {
          const y = pad.t + H - (v / 10) * H
          return (
            <g key={v}>
              <line x1={pad.l - 4} y1={y} x2={pad.l + W} y2={y} stroke="var(--border)" strokeWidth="0.6" strokeDasharray="3,3" />
              <text x={pad.l - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize="8" fill="var(--text-muted)">{v}</text>
            </g>
          )
        })}
        {/* X date ticks */}
        {tickIndices.map(i => {
          const d = data[i]
          const x = pts[i].x
          const label = new Date(d.createdAt).toLocaleString('zh', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          return (
            <text key={i} x={x} y={pad.t + H + 14} textAnchor="middle" fontSize="7" fill="var(--text-muted)">{label}</text>
          )
        })}
        <path d={areaD} fill="rgba(108,99,255,0.08)" />
        <path d={pathD} fill="none" stroke="#6c63ff" strokeWidth="1.8" strokeLinejoin="round" />
        {maPath && (
          <path d={maPath} fill="none" stroke="#6c63ff" strokeWidth="1.2" strokeDasharray="4,3" opacity="0.55" strokeLinejoin="round" />
        )}
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6c63ff" />)}
      </svg>
      {maPath && <p className="chart-hint" style={{ marginTop: 2 }}>虚线 = 7 点滑动均值</p>}
    </div>
  )
}

// ── Multi-dim Trend Chart ─────────────────────────────────────────────────────

const G_DIMS = ['correctness', 'instruction_following', 'safety', 'completeness', 'robustness']
const S_DIMS = ['executability', 'cost_awareness', 'maintainability']

function MultiDimTrendChart({ history, width = 540, height = 200 }: {
  history: EvalResult[]; width?: number; height?: number
}) {
  const t = useT()
  const DIM_LABELS = makeDimLabels(t)
  const [hoveredDim, setHoveredDim] = useState<string | null>(null)
  const [showS, setShowS] = useState(false)
  const data = history.slice(-20)
  if (data.length < 2) return <div className="chart-empty">至少需要 2 次评测数据</div>

  const activeDims = showS ? DIM_ORDER : G_DIMS
  const pad = { l: 28, r: 70, t: 10, b: 28 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  const n = data.length

  // per-dim avg for deviation highlight
  const dimAvg: Record<string, number> = {}
  for (const dim of DIM_ORDER) {
    const vals = data.map(r => r.scores?.[dim]?.score ?? 0)
    dimAvg[dim] = vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const dimPaths = activeDims.map(dim => {
    const pts = data.map((r, i) => {
      const score = r.scores?.[dim]?.score ?? 0
      return { x: pad.l + (i / (n - 1)) * W, y: pad.t + H - (score / 10) * H, score }
    })
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    return { dim, pts, d }
  })

  // X tick indices (up to 5)
  const tickIdxs = n <= 5 ? data.map((_, i) => i)
    : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(n * 3 / 4), n - 1]

  return (
    <div className="multidim-wrap">
      <div className="multidim-controls">
        <button className={`mdl-toggle ${showS ? 'active' : ''}`} onClick={() => setShowS(v => !v)}>
          {showS ? t('eval.hide_s_dims') : t('eval.show_s_dims')}
        </button>
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', overflow: 'visible' }}>
        {/* Grid */}
        {[0, 2, 4, 6, 8, 10].map(v => {
          const y = pad.t + H - (v / 10) * H
          return (
            <g key={v}>
              <line x1={pad.l} y1={y} x2={pad.l + W} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
              <text x={pad.l - 4} y={y} textAnchor="end" dominantBaseline="middle" fontSize="8" fill="var(--text-muted)">{v}</text>
            </g>
          )
        })}
        {/* X ticks */}
        {tickIdxs.map(i => {
          const x = pad.l + (i / (n - 1)) * W
          const label = new Date(data[i].createdAt).toLocaleString('zh', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          return <text key={i} x={x} y={pad.t + H + 16} textAnchor="middle" fontSize="7" fill="var(--text-muted)">{label}</text>
        })}
        {/* Lines + dots + inline labels */}
        {dimPaths.map(({ dim, pts, d }) => {
          const active = hoveredDim === null || hoveredDim === dim
          const lastPt = pts[pts.length - 1]
          return (
            <g key={dim}>
              <path d={d} fill="none"
                stroke={DIM_COLORS[dim]}
                strokeWidth={hoveredDim === dim ? 2.5 : 1.4}
                strokeLinejoin="round"
                opacity={active ? 1 : 0.15}
                style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }} />
              {pts.map((p, i) => {
                const deviated = Math.abs(p.score - dimAvg[dim]) > 1.5
                const r = deviated ? 5 : (hoveredDim === dim ? 3.5 : 2)
                const stroke = deviated ? (p.score > dimAvg[dim] ? '#22c55e' : '#ef4444') : undefined
                return (
                  <circle key={i} cx={p.x} cy={p.y} r={r}
                    fill={DIM_COLORS[dim]}
                    stroke={stroke} strokeWidth={deviated ? 1.5 : 0}
                    opacity={active ? 1 : 0.15}
                    style={{ transition: 'opacity 0.2s' }} />
                )
              })}
              {/* Inline label at last point */}
              {active && (
                <text x={lastPt.x + 5} y={lastPt.y} dominantBaseline="middle"
                  fontSize="8" fill={DIM_COLORS[dim]} fontWeight="600" opacity={active ? 1 : 0}>
                  {DIM_LABELS[dim]}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {/* Legend */}
      <div className="multidim-legend">
        {activeDims.map(dim => (
          <div key={dim} className={`mdl-item ${hoveredDim === dim ? 'active' : ''}`}
            onMouseEnter={() => setHoveredDim(dim)}
            onMouseLeave={() => setHoveredDim(null)}>
            <span className="mdl-dot" style={{ background: DIM_COLORS[dim] }} />
            <span className="mdl-name" style={{ color: hoveredDim === dim ? DIM_COLORS[dim] : undefined }}>
              {DIM_LABELS[dim]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Heatmap Chart ─────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 8) return `rgba(74,222,128,${0.15 + (score - 8) / 2 * 0.6})`
  if (score >= 5) return `rgba(250,204,21,${0.12 + (score - 5) / 3 * 0.3})`
  return `rgba(239,68,68,${0.15 + (5 - score) / 5 * 0.5})`
}

function deltaColor(delta: number): string {
  if (delta > 0) return `rgba(74,222,128,${Math.min(0.15 + Math.abs(delta) / 5 * 0.6, 0.75)})`
  if (delta < 0) return `rgba(239,68,68,${Math.min(0.15 + Math.abs(delta) / 5 * 0.6, 0.75)})`
  return 'transparent'
}

function HeatmapChart({ history }: { history: EvalResult[] }) {
  const t = useT()
  const DIM_LABELS = makeDimLabels(t)
  const [deltaMode, setDeltaMode] = useState(false)
  const rows = [...history].reverse().slice(0, 20)
  if (rows.length === 0) return <div className="chart-empty">暂无评测数据</div>
  const dims = DIM_ORDER.filter(d => rows.some(r => d in (r.scores ?? {})))

  // per-dim global avg for Δ mode
  const dimAvg: Record<string, number> = {}
  for (const d of dims) {
    const vals = rows.map(r => r.scores?.[d]?.score ?? 0)
    dimAvg[d] = vals.reduce((a, b) => a + b, 0) / vals.length
  }

  return (
    <div className="heatmap-wrap">
      <div className="hm-toolbar">
        <button className={`hm-delta-btn ${deltaMode ? 'active' : ''}`} onClick={() => setDeltaMode(v => !v)}>
          {deltaMode ? t('eval.exit_delta') : t('eval.delta_mode')}
        </button>
        {deltaMode && <span className="hm-delta-hint">绿 = 高于均值　红 = 低于均值</span>}
      </div>
      <div className="heatmap-table">
        {/* Header row */}
        <div className="hm-header">
          <div className="hm-row-label" />
          {dims.map(d => (
            <div key={d} className="hm-col-label" title={d}>
              <span>{DIM_LABELS[d]}</span>
            </div>
          ))}
        </div>
        {/* Data rows */}
        {rows.map((r, ri) => {
          const prevTc = ri > 0 ? rows[ri - 1].testCaseName : undefined
          const showSep = ri > 0 && prevTc !== r.testCaseName
          return (
            <div key={r.id}>
              {showSep && <div className="hm-tc-sep" />}
              <div className="hm-row" title={r.testCaseName ? t('eval.test_case_label', { name: r.testCaseName }) : undefined}>
                <div className="hm-row-label">
                  {new Date(r.createdAt).toLocaleString('zh', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                {dims.map(d => {
                  const score = r.scores?.[d]?.score ?? 0
                  const delta = score - dimAvg[d]
                  const bg = deltaMode ? deltaColor(delta) : scoreColor(score)
                  const label = deltaMode ? (delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)) : score.toFixed(0)
                  return (
                    <div key={d} className="hm-cell" style={{ background: bg }}
                      title={`${DIM_LABELS[d]}: ${score.toFixed(1)} (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`}>
                      <span className="hm-val">{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {/* Avg row */}
        <div className="hm-row hm-avg-row">
          <div className="hm-row-label hm-avg-label">{t('eval.avg')}</div>
          {dims.map(d => (
            <div key={d} className="hm-cell hm-avg-cell" style={{ background: scoreColor(dimAvg[d]) }}>
              <span className="hm-val hm-avg-val">{dimAvg[d].toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Color scale */}
      <div className="hm-scale">
        <span className="hm-scale-label">0</span>
        <div className="hm-scale-bar" />
        <span className="hm-scale-label">10</span>
      </div>
    </div>
  )
}

// ── Box Plot Chart ────────────────────────────────────────────────────────────

// Interpolated quantile (linear interpolation, same as Excel PERCENTILE)
function quantile(sorted: number[], p: number): number {
  const n = sorted.length
  if (n === 0) return 0
  const idx = p * (n - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

// Deterministic jitter based on index (avoids random re-renders)
function jitter(i: number, range: number): number {
  return ((i * 2654435761) % 1000) / 1000 * range - range / 2
}

function BoxPlotChart({ history, width = 520, height = 160, onRunEval }: {
  history: EvalResult[]; width?: number; height?: number; onRunEval?: () => void
}) {
  const t = useT()
  const DIM_LABELS = makeDimLabels(t)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)
  if (history.length < 3) return (
    <div className="chart-empty">
      {t('eval.boxplot_empty', { n: history.length })}
      {onRunEval && <><br /><button className="link-btn" onClick={onRunEval}>{t('common.go_eval_arrow')}</button></>}
    </div>
  )
  const pad = { l: 80, r: 20, t: 10, b: 24 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  const dims = DIM_ORDER.filter(d => history.some(r => d in (r.scores ?? {})))
  const rowH = H / dims.length
  const showDots = history.length >= 5

  const stats = dims.map(dim => {
    const vals = history.map(r => r.scores?.[dim]?.score ?? 0).sort((a, b) => a - b)
    const n = vals.length
    const q1 = quantile(vals, 0.25)
    const median = quantile(vals, 0.5)
    const q3 = quantile(vals, 0.75)
    const mean = vals.reduce((a, b) => a + b, 0) / n
    return { dim, vals, min: vals[0], q1, median, q3, max: vals[n - 1], mean, n }
  })

  const xOf = (v: number) => pad.l + (v / 10) * W

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}
        onMouseLeave={() => setTooltip(null)}>
        {/* Grid */}
        {[0, 2, 4, 6, 8, 10].map(v => {
          const x = xOf(v)
          return (
            <g key={v}>
              <line x1={x} y1={pad.t} x2={x} y2={pad.t + H} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
              <text x={x} y={pad.t + H + 14} textAnchor="middle" fontSize="8" fill="var(--text-muted)">{v}</text>
            </g>
          )
        })}
        {/* Boxes */}
        {stats.map(({ dim, vals, min, q1, median, q3, max, mean, n }, i) => {
          const cy = pad.t + i * rowH + rowH / 2
          const bh = Math.max(rowH * 0.42, 6)
          const color = DIM_COLORS[dim]
          const tooltipContent = `${DIM_LABELS[dim]}\nmin ${min.toFixed(1)}  Q1 ${q1.toFixed(1)}  中位 ${median.toFixed(1)}\n均值 ${mean.toFixed(1)}  Q3 ${q3.toFixed(1)}  max ${max.toFixed(1)}\nn = ${n}`
          return (
            <g key={dim}>
              {/* Dim label */}
              <text x={pad.l - 6} y={cy} textAnchor="end" dominantBaseline="middle"
                fontSize="9" fill={color} fontWeight="600">
                {DIM_LABELS[dim]}
              </text>
              {/* Jittered dots */}
              {showDots && vals.map((v, vi) => (
                <circle key={vi} cx={xOf(v)} cy={cy + jitter(vi, bh * 0.7)}
                  r={2} fill={color} opacity="0.35" />
              ))}
              {/* Whiskers */}
              <line x1={xOf(min)} y1={cy} x2={xOf(q1)} y2={cy} stroke={color} strokeWidth="1.2" opacity="0.6" />
              <line x1={xOf(q3)} y1={cy} x2={xOf(max)} y2={cy} stroke={color} strokeWidth="1.2" opacity="0.6" />
              <line x1={xOf(min)} y1={cy - bh * 0.35} x2={xOf(min)} y2={cy + bh * 0.35} stroke={color} strokeWidth="1.2" />
              <line x1={xOf(max)} y1={cy - bh * 0.35} x2={xOf(max)} y2={cy + bh * 0.35} stroke={color} strokeWidth="1.2" />
              {/* Min/max value labels */}
              <text x={xOf(min) + 3} y={cy - bh * 0.35 - 2} fontSize="7" fill={color} opacity="0.7">{min.toFixed(1)}</text>
              <text x={xOf(max) - 3} y={cy - bh * 0.35 - 2} fontSize="7" fill={color} opacity="0.7" textAnchor="end">{max.toFixed(1)}</text>
              {/* IQR box — hover triggers tooltip */}
              <rect x={xOf(q1)} y={cy - bh / 2} width={Math.max(xOf(q3) - xOf(q1), 2)} height={bh}
                fill={color + '22'} stroke={color} strokeWidth="1.2" rx="2"
                style={{ cursor: 'default' }}
                onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                onMouseMove={e => setTooltip({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                onMouseLeave={() => setTooltip(null)} />
              {/* Median line */}
              <line x1={xOf(median)} y1={cy - bh / 2} x2={xOf(median)} y2={cy + bh / 2}
                stroke={color} strokeWidth="2" />
              {/* Mean diamond */}
              <polygon
                points={`${xOf(mean)},${cy - bh * 0.3} ${xOf(mean) + 4},${cy} ${xOf(mean)},${cy + bh * 0.3} ${xOf(mean) - 4},${cy}`}
                fill={color} opacity="0.8" />
            </g>
          )
        })}
      </svg>
      {tooltip && (
        <div className="bp-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
          {tooltip.content.split('\n').map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
    </div>
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

function minDimScores(history: EvalResult[]): Record<string, number> {
  const mins: Record<string, number> = {}
  for (const r of history)
    for (const [dim, s] of Object.entries(r.scores))
      mins[dim] = dim in mins ? Math.min(mins[dim], s.score) : s.score
  return mins
}

function maxDimScores(history: EvalResult[]): Record<string, number> {
  const maxs: Record<string, number> = {}
  for (const r of history)
    for (const [dim, s] of Object.entries(r.scores))
      maxs[dim] = dim in maxs ? Math.max(maxs[dim], s.score) : s.score
  return maxs
}

// ── Bar Chart (per-dimension for a single eval result) ────────────────────────

function DimBarChart({ scores }: { scores: Record<string, EvalScore> }) {
  const t = useT()
  const DIM_LABELS = makeDimLabels(t)
  return (
    <div className="dim-bar-chart">
      {DIM_ORDER.filter((d) => d in scores).map((d) => (
        <div key={d} className="dbc-row">
          <span className="dbc-label" style={{ color: DIM_COLORS[d] }}>{DIM_LABELS[d] ?? d}</span>
          <div className="dbc-track">
            <div className="dbc-fill" style={{ width: `${(scores[d].score / 10) * 100}%`, background: DIM_COLORS[d] }} />
          </div>
          <span className="dbc-val" style={{ color: DIM_COLORS[d] }}>{scores[d].score.toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

// ── GeneratePreviewModal ──────────────────────────────────────────────────────

interface PreviewCandidate extends Omit<TestCase, 'id' | 'createdAt'> {
  _key: string
}

function GeneratePreviewModal({ candidates, saving, onSave, onCancel }: {
  candidates: Omit<TestCase, 'id' | 'createdAt'>[]
  saving: boolean
  onSave: (selected: Omit<TestCase, 'id' | 'createdAt'>[]) => void
  onCancel: () => void
}) {
  const [items, setItems] = useState<PreviewCandidate[]>(() =>
    candidates.map((c, i) => ({ ...c, _key: `preview-${i}` }))
  )
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(
    () => new Set(candidates.map((_, i) => `preview-${i}`))
  )

  const toggleKey = (key: string) => setCheckedKeys(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
  })
  const allChecked = checkedKeys.size === items.length
  const toggleAll = () => setCheckedKeys(allChecked ? new Set() : new Set(items.map(i => i._key)))

  const updateItem = (key: string, field: keyof Omit<PreviewCandidate, '_key'>, value: string) => {
    setItems(prev => prev.map(it => it._key === key ? { ...it, [field]: value } : it))
  }

  const handleSave = () => {
    const selected = items.filter(it => checkedKeys.has(it._key)).map(({ _key: _k, ...rest }) => rest)
    onSave(selected)
  }

  const JUDGE_BADGE_COLORS: Record<string, string> = { llm: '#6c63ff', grep: '#00d4aa', command: '#f59e0b' }

  return (
    <div className="tc-preview-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="tc-preview-modal">
        <div className="tc-preview-header">
          <span className="tc-preview-title">预览生成的测试用例（{items.length} 个）</span>
          <div className="tc-preview-header-actions">
            <button className="btn btn-xs" onClick={toggleAll}>{allChecked ? '取消全选' : '全选'}</button>
          </div>
        </div>
        <div className="tc-preview-list">
          {items.map(item => (
            <div key={item._key} className={`tc-preview-card ${checkedKeys.has(item._key) ? 'checked' : ''}`}>
              <div className="tc-preview-card-header">
                <input
                  type="checkbox"
                  checked={checkedKeys.has(item._key)}
                  onChange={() => toggleKey(item._key)}
                />
                <input
                  className="tc-preview-name"
                  value={item.name}
                  onChange={e => updateItem(item._key, 'name', e.target.value)}
                  placeholder="用例名称"
                />
                <span
                  className="judge-chip"
                  style={{ color: JUDGE_BADGE_COLORS[item.judgeType] }}
                >
                  {item.judgeType}
                </span>
              </div>
              <div className="tc-preview-field">
                <span className="tc-preview-label">输入</span>
                <textarea
                  className="tc-preview-input"
                  rows={3}
                  value={item.input}
                  onChange={e => updateItem(item._key, 'input', e.target.value)}
                  placeholder="用户输入内容"
                />
              </div>
              {item.judgeType !== 'command' && (
                <div className="tc-preview-field">
                  <span className="tc-preview-label">判断</span>
                  <input
                    className="tc-preview-judge"
                    value={item.judgeParam}
                    onChange={e => updateItem(item._key, 'judgeParam', e.target.value)}
                    placeholder="判断标准"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="tc-preview-footer">
          <button className="btn btn-sm" onClick={onCancel} disabled={saving}>取消</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || checkedKeys.size === 0}
          >
            {saving ? '保存中...' : `保存已选（${checkedKeys.size} 个）`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TestCase Tab ──────────────────────────────────────────────────────────────

const JUDGE_COLORS: Record<string, string> = { llm: '#6c63ff', grep: '#00d4aa', command: '#f59e0b' }

function TestCaseTab({ skillId, apiKeySet, onRunEval, onNavigate }: {
  skillId: string
  apiKeySet: boolean | null
  onRunEval: (tcIds: string[]) => void
  onNavigate?: (page: string, skillId?: string) => void
}) {
  const t = useT()
  const JUDGE_LABELS: Record<string, string> = {
    llm: t('eval.judge.llm'), grep: t('eval.judge.grep'), command: t('eval.judge.command')
  }
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [genCount, setGenCount] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genSuccess, setGenSuccess] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', input: '', judgeType: 'llm' as TestCase['judgeType'], judgeParam: '' })
  const [adding, setAdding] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedTcId, setExpandedTcId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [previewCandidates, setPreviewCandidates] = useState<Omit<TestCase, 'id' | 'createdAt'>[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [savingPreview, setSavingPreview] = useState(false)

  useEffect(() => {
    if (!skillId) return
    setLoading(true)
    window.api.testcases.getBySkill(skillId).then((tcs) => {
      setTestCases(tcs)
      setSelectedIds(new Set(tcs.map((t) => t.id)))
      setLoading(false)
    })
  }, [skillId])

  const filtered = testCases.filter((tc) =>
    !search || tc.name.toLowerCase().includes(search.toLowerCase()) || tc.input.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; input: string; judgeType: TestCase['judgeType']; judgeParam: string }>({ name: '', input: '', judgeType: 'llm', judgeParam: '' })
  const [saving, setSaving] = useState(false)

  const startEdit = (tc: TestCase) => {
    setEditingId(tc.id)
    setEditForm({ name: tc.name, input: tc.input, judgeType: tc.judgeType, judgeParam: tc.judgeParam })
  }

  const cancelEdit = () => { setEditingId(null) }

  const handleUpdate = async (id: string) => {
    setSaving(true)
    try {
      const updated = await window.api.testcases.update(id, editForm)
      setTestCases((prev) => prev.map((t) => t.id === id ? updated : t))
      setEditingId(null)
    } catch (e) {
      // keep form open so user can retry
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (id: string) => {
    window.api.testcases.delete(id)
    setTestCases((prev) => prev.filter((t) => t.id !== id))
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    setConfirmingDeleteId(null)
  }

  const handleGenerate = async () => {
    setGenerating(true); setGenError(null); setGenSuccess(0)
    try {
      const tcs = await window.api.testcases.generate(skillId, genCount)
      setTestCases((prev) => [...prev, ...tcs])
      setSelectedIds((prev) => { const next = new Set(prev); tcs.forEach((t) => next.add(t.id)); return next })
      setGenSuccess(tcs.length)
    } catch (e) { setGenError(friendlyError(e, t)) }
    finally { setGenerating(false) }
  }

  const handleGeneratePreview = async () => {
    setPreviewing(true); setPreviewError(null)
    try {
      const candidates = await window.api.testcases.generatePreview(skillId, genCount)
      setPreviewCandidates(candidates)
    } catch (e) { setPreviewError(friendlyError(e, t)) }
    finally { setPreviewing(false) }
  }

  const handleSavePreview = async (selected: Omit<TestCase, 'id' | 'createdAt'>[]) => {
    setSavingPreview(true)
    const saved: TestCase[] = []
    for (const tc of selected) {
      const created = await window.api.testcases.create(tc)
      saved.push(created)
    }
    setTestCases((prev) => [...prev, ...saved])
    setSelectedIds((prev) => { const next = new Set(prev); saved.forEach((t) => next.add(t.id)); return next })
    setPreviewCandidates(null)
    setSavingPreview(false)
  }

  const handleAdd = async () => {
    if (!form.name.trim() || !form.input.trim()) return
    setAdding(true)
    const tc = await window.api.testcases.create({ skillId, ...form })
    setTestCases((prev) => [...prev, tc])
    setSelectedIds((prev) => { const next = new Set(prev); next.add(tc.id); return next })
    setForm({ name: '', input: '', judgeType: 'llm', judgeParam: '' })
    setAdding(false); setAddOpen(false)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true); setImportResult(null)
    try {
      const text = await file.text()
      let items: unknown[]
      try { items = JSON.parse(text) } catch { throw new Error(t('eval.import_error_format')) }
      if (!Array.isArray(items)) throw new Error(t('eval.import_error_array'))
      const result = await window.api.testcases.importJson(skillId, items)
      setTestCases((prev) => [...prev, ...result.imported])
      setSelectedIds((prev) => { const next = new Set(prev); result.imported.forEach((t) => next.add(t.id)); return next })
      setImportResult({ imported: result.imported.length, errors: result.errors })
    } catch (err) {
      setImportResult({ imported: 0, errors: [String(err)] })
    } finally { setImporting(false) }
  }

  const byType = {
    llm: testCases.filter((t) => t.judgeType === 'llm').length,
    grep: testCases.filter((t) => t.judgeType === 'grep').length,
    command: testCases.filter((t) => t.judgeType === 'command').length,
  }

  return (
    <div className="tc-tab">
      {/* AI Generate */}
      <div className="eval-card">
        <div className="card-row">
          <span className="card-title">{t('eval.gen_cases')}</span>
          <span className="gen-hint">覆盖 8 个评测维度</span>
        </div>
        <div className="gen-controls">
          <div className="count-row">
            {[3, 5, 10, 15].map((n) => (
              <button key={n} className={`count-chip ${genCount === n ? 'active' : ''}`}
                onClick={() => setGenCount(n)} disabled={generating || previewing}>{n}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleGeneratePreview}
              disabled={generating || previewing || apiKeySet === false}>
              {previewing ? <><span className="gen-spinner" />{` 生成中...`}</> : `预览生成 ▸`}
            </button>
            <button className="btn btn-sm" onClick={handleGenerate}
              disabled={generating || previewing || apiKeySet === false}>
              {generating ? <><span className="gen-spinner" />{` 生成中...`}</> : `直接生成`}
            </button>
          </div>
        </div>
        {(genError || previewError) && <div className="gen-error">⚠️ {genError || previewError}</div>}
        {genSuccess > 0 && !genError && <div className="gen-success">✅ 已生成 {genSuccess} 个用例</div>}
        {apiKeySet === false && <div className="gen-warn">⚠️ 未配置 API Key，请先前往 <button className="link-btn" onClick={() => onNavigate?.('settings')}>设置</button> 添加。</div>}
      </div>

      {/* Generate Preview Modal */}
      {previewCandidates && (
        <GeneratePreviewModal
          candidates={previewCandidates}
          saving={savingPreview}
          onSave={handleSavePreview}
          onCancel={() => setPreviewCandidates(null)}
        />
      )}

      {/* List */}
      <div className="eval-card">
        <div className="card-row">
          <div className="tc-stats">
            <span className="stat-total">{testCases.length} 个用例</span>
            {Object.entries(byType).filter(([, n]) => n > 0).map(([type, n]) => (
              <span key={type} className="stat-chip" style={{ color: JUDGE_COLORS[type] }}>
                {JUDGE_LABELS[type]} ×{n}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="tc-search-wrap">
              <span className="search-icon">🔍</span>
              <input className="tc-search" placeholder="搜索..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set(testCases.map((t) => t.id)))}>全选</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>取消</button>
          </div>
        </div>

        {loading ? <div className="tc-empty">{t('common.loading')}</div>
          : filtered.length === 0 ? (
            testCases.length === 0
              ? <EmptyState icon="🧪" title={t('eval.no_cases')} action={{ label: t('eval.go_studio'), onClick: () => onNavigate?.('studio') }} />
              : <div className="tc-empty">{t('common.no_match')}</div>
          )
          : (
            <div className="tc-list">
              {filtered.map((tc) => (
                <div key={tc.id} className={`tc-card ${selectedIds.has(tc.id) ? 'selected' : ''}`}>
                  <div className="tc-card-header">
                    <input type="checkbox" checked={selectedIds.has(tc.id)} onChange={() => toggle(tc.id)}
                      onClick={(e) => e.stopPropagation()} />
                    <span className="tc-expand" onClick={() => setExpandedTcId(expandedTcId === tc.id ? null : tc.id)}>
                      {expandedTcId === tc.id ? '▾' : '▸'}
                    </span>
                    <span className="tc-name" onClick={() => setExpandedTcId(expandedTcId === tc.id ? null : tc.id)}>{tc.name}</span>
                    <span className="judge-chip" style={{ color: JUDGE_COLORS[tc.judgeType], borderColor: JUDGE_COLORS[tc.judgeType] + '66' }}>
                      {JUDGE_LABELS[tc.judgeType]}
                    </span>
                    <button
                      className={`btn btn-xs ${confirmingDeleteId === tc.id ? 'btn-danger' : 'btn-ghost'}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirmingDeleteId !== tc.id) { setConfirmingDeleteId(tc.id); return }
                        handleDelete(tc.id)
                      }}
                      onBlur={() => setConfirmingDeleteId(null)}
                    >
                      {confirmingDeleteId === tc.id ? t('eval.confirm_delete') : t('common.delete')}
                    </button>
                    <button className="btn btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); startEdit(tc); setExpandedTcId(tc.id) }}>
                      {t('common.edit')}
                    </button>
                  </div>
                  {expandedTcId === tc.id && (
                    <div className="tc-card-body">
                      {editingId === tc.id ? (
                        <>
                          <div className="tc-field">
                            <span className="tc-field-label">{t('eval.tc.name')}</span>
                            <input className="tc-edit-input" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                          </div>
                          <div className="tc-field">
                            <span className="tc-field-label">Input</span>
                            <textarea className="tc-edit-textarea" rows={4} value={editForm.input} onChange={(e) => setEditForm((f) => ({ ...f, input: e.target.value }))} />
                          </div>
                          <div className="tc-field">
                            <span className="tc-field-label">Judge Type</span>
                            <select className="tc-edit-select" value={editForm.judgeType} onChange={(e) => setEditForm((f) => ({ ...f, judgeType: e.target.value as TestCase['judgeType'] }))}>
                              <option value="llm">LLM</option>
                              <option value="grep">Grep</option>
                              <option value="command">Command</option>
                            </select>
                          </div>
                          <div className="tc-field">
                            <span className="tc-field-label">Judge Param</span>
                            <textarea className="tc-edit-textarea" rows={3} value={editForm.judgeParam} onChange={(e) => setEditForm((f) => ({ ...f, judgeParam: e.target.value }))} />
                          </div>
                          <div className="tc-edit-actions">
                            <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleUpdate(tc.id)}>{saving ? t('common.saving') : t('common.save')}</button>
                            <button className="btn btn-ghost btn-sm" disabled={saving} onClick={cancelEdit}>{t('common.cancel')}</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="tc-field">
                            <span className="tc-field-label">Input</span>
                            <pre className="tc-field-value">{tc.input}</pre>
                          </div>
                          {tc.judgeParam && (
                            <div className="tc-field">
                              <span className="tc-field-label">Judge Param</span>
                              <pre className="tc-field-value">{tc.judgeParam}</pre>
                            </div>
                          )}
                          <div className="tc-meta">创建于 {new Date(tc.createdAt).toLocaleString()}</div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        {/* Add / Import */}
        {!addOpen && (
          <div className="tc-add-row">
            <button className="btn btn-ghost btn-sm" onClick={() => { setAddOpen(true); setImportResult(null) }}>+ 手动添加</button>
            <button className="btn btn-ghost btn-sm" onClick={() => importInputRef.current?.click()} disabled={importing}>
              {importing ? t('eval.importing') : t('eval.import_json')}
            </button>
            <input ref={importInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImportFile} />
          </div>
        )}
        {importResult && (
          <div className={`import-result ${importResult.errors.length > 0 && importResult.imported === 0 ? 'import-result-error' : 'import-result-ok'}`}>
            {importResult.imported > 0 && <div>✅ 成功导入 {importResult.imported} 条</div>}
            {importResult.errors.length > 0 && (
              <details>
                <summary>⚠️ {importResult.errors.length} 条跳过</summary>
                <ul className="import-errors">{importResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </details>
            )}
          </div>
        )}
        {!addOpen
          ? null
          : (
            <div className="add-form">
              <div className="add-form-header"><span>手动添加</span><button className="btn-icon-sm" onClick={() => setAddOpen(false)}>✕</button></div>
              <input placeholder={t('eval.case_name_placeholder')} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ width: '100%', marginBottom: 8 }} />
              <textarea rows={3} placeholder={t('eval.input_placeholder')} value={form.input} onChange={(e) => setForm((f) => ({ ...f, input: e.target.value }))} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} />
              <div className="add-form-row">
                <select value={form.judgeType} onChange={(e) => setForm((f) => ({ ...f, judgeType: e.target.value as TestCase['judgeType'] }))}>
                  <option value="llm">LLM 评判</option>
                  <option value="grep">Grep 匹配</option>
                  <option value="command">命令执行</option>
                </select>
                <input placeholder={t('eval.judge_placeholder')} value={form.judgeParam} onChange={(e) => setForm((f) => ({ ...f, judgeParam: e.target.value }))} style={{ flex: 1 }} />
              </div>
              {form.judgeType === 'command' && (
                <div className="warn-banner" style={{ marginTop: 6, padding: '6px 10px', background: '#7c3a001a', border: '1px solid #f59e0b55', borderRadius: 6, fontSize: 12, color: '#f59e0b', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span>⚠️</span>
                  <span><b>高级功能：</b>Command 判断类型会在本机直接执行 shell 命令，请确保 judge param 来自可信来源，避免使用破坏性命令（如 <code>rm</code>）。</span>
                </div>
              )}
              <div className="add-form-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(false)}>{t('common.cancel')}</button>
                <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={adding || !form.name.trim() || !form.input.trim()}>{adding ? t('common.loading') : t('eval.add_case')}</button>
              </div>
            </div>
          )}
      </div>

      {/* Run eval CTA */}
      {testCases.length > 0 && (
        <div className="run-cta">
          <span className="run-cta-hint">已选 {selectedIds.size} / {testCases.length} 个用例</span>
          <button className="btn btn-primary" disabled={selectedIds.size === 0 || apiKeySet === false}
            onClick={() => onRunEval([...selectedIds])}>
            ▶ 切换到评测 Tab 并运行
          </button>
        </div>
      )}
    </div>
  )
}

// ── By Case Panel ─────────────────────────────────────────────────────────────

function Sparkline({ scores, width = 120, height = 32 }: { scores: number[]; width?: number; height?: number }) {
  if (scores.length < 2) return null
  const pad = { l: 2, r: 2, t: 4, b: 4 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  const pts = scores.map((s, i) => ({
    x: pad.l + (i / (scores.length - 1)) * W,
    y: pad.t + H - (s / 10) * H,
  }))
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke="#6c63ff" strokeWidth="1.5" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2} fill="#6c63ff" />)}
    </svg>
  )
}

function ByCasePanel({ caseMap }: { caseMap: Map<string, EvalResult[]> }) {
  const t = useT()
  const DIM_LABELS = makeDimLabels(t)
  const [sortBy, setSortBy] = useState<'avg' | 'count'>('avg')
  const [expandedCase, setExpandedCase] = useState<string | null>(null)

  if (caseMap.size === 0) return <div className="tc-empty" style={{ padding: 16 }}>{t('eval.no_cases')}</div>

  const entries = [...caseMap.entries()].sort((a, b) => {
    if (sortBy === 'count') return b[1].length - a[1].length
    const avgA = a[1].reduce((s, r) => s + r.totalScore, 0) / a[1].length
    const avgB = b[1].reduce((s, r) => s + r.totalScore, 0) / b[1].length
    return avgB - avgA
  })

  return (
    <div>
      <div className="bycase-sort-row">
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>排序：</span>
        <button className={`bycase-sort-btn ${sortBy === 'avg' ? 'active' : ''}`} onClick={() => setSortBy('avg')}>均分</button>
        <button className={`bycase-sort-btn ${sortBy === 'count' ? 'active' : ''}`} onClick={() => setSortBy('count')}>次数</button>
      </div>
      <div className="bycase-table">
        {entries.map(([name, rows]) => {
          const avgTotal = rows.reduce((s, r) => s + r.totalScore, 0) / rows.length
          const isUnnamed = name === t('eval.unnamed')
          const scoreColor = avgTotal >= 7 ? 'var(--success)' : avgTotal >= 4 ? 'var(--warning)' : 'var(--danger)'
          const expanded = expandedCase === name

          // Trend arrow: compare last 3 vs overall avg
          let trendArrow = ''
          let trendColor = 'var(--text-muted)'
          if (rows.length >= 4) {
            const last3Avg = rows.slice(-3).reduce((s, r) => s + r.totalScore, 0) / 3
            const diff = last3Avg - avgTotal
            if (diff > 0.5) { trendArrow = '↑'; trendColor = 'var(--success)' }
            else if (diff < -0.5) { trendArrow = '↓'; trendColor = 'var(--danger)' }
            else { trendArrow = '→'; trendColor = 'var(--text-muted)' }
          }

          const sparkScores = rows.map(r => r.totalScore)

          return (
            <div key={name} style={{ borderRadius: 6, background: 'var(--surface2)' }}>
              <div className="bycase-row" onClick={() => setExpandedCase(expanded ? null : name)}>
                <span className={`bycase-name ${isUnnamed ? 'unnamed' : ''}`}>{name}</span>
                <span className="bycase-count">{rows.length} 次</span>
                {trendArrow && <span className="bycase-trend" style={{ color: trendColor }}>{trendArrow}</span>}
                <span className="bycase-total" style={{ color: scoreColor }}>{avgTotal.toFixed(1)}</span>
                <div className="bycase-dim-bars">
                  {DIM_ORDER.map(d => {
                    const avg = rows.reduce((s, r) => s + (r.scores[d]?.score ?? 0), 0) / rows.length
                    return (
                      <div key={d} className="inline-bar-wrap" title={`${DIM_LABELS[d]}: ${avg.toFixed(1)}`}>
                        <div className="inline-bar" style={{ width: `${(avg / 10) * 100}%`, background: DIM_COLORS[d] }} />
                      </div>
                    )
                  })}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
              </div>
              {expanded && (
                <div className="bycase-sparkline">
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{t('eval.spark_trend', { n: String(rows.length) })}</div>
                  <Sparkline scores={sparkScores} width={300} height={40} />
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('eval.spark_min')} <b style={{ color: 'var(--danger)' }}>{Math.min(...sparkScores).toFixed(1)}</b></span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('eval.spark_avg')} <b style={{ color: 'var(--accent)' }}>{avgTotal.toFixed(2)}</b></span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('eval.spark_max')} <b style={{ color: 'var(--success)' }}>{Math.max(...sparkScores).toFixed(1)}</b></span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main EvalPage ─────────────────────────────────────────────────────────────

export default function EvalPage({ initialSkillId, onNavigate, skillsRefreshKey }: { initialSkillId?: string; onNavigate?: (page: string, skillId?: string) => void; skillsRefreshKey?: number } = {}) {
  const track = useTrack()
  const t = useT()
  const { toasts, toast, dismiss } = useToast()
  const DIM_LABELS = makeDimLabels(t)
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState(initialSkillId ?? '')
  const [pageTab, setPageTab] = useState<'testcase' | 'eval' | 'chart'>('testcase')
  const [evalMode, setEvalMode] = useState<'single' | 'compare' | 'three'>('single')

  // Eval single state
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<EvalResult[]>([])
  const [chartHistory, setChartHistory] = useState<EvalResult[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(0)
  const PAGE_SIZE = 20
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatus, setHistoryStatus] = useState<'all' | 'success' | 'error'>('all')
  const [historyTcFilter, setHistoryTcFilter] = useState('')
  const [collapsedTcGroups, setCollapsedTcGroups] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [tavilyKeySet, setTavilyKeySet] = useState<boolean | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set())
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportRef = useRef<HTMLAnchorElement>(null)

  const toggleCompare = (id: string) => {
    setCompareSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else if (next.size < 2) { next.add(id) }
      return next
    })
  }

  useEffect(() => {
    window.api.skills.getAll().then(setSkills).catch(() => {})
    window.api.config.get().then((c) => {
      setApiKeySet((c.providers ?? []).length > 0)
      setTavilyKeySet(c.toolApiKeysSet?.tavily ?? false)
    }).catch(() => setApiKeySet(false))
  }, [skillsRefreshKey])

  const refreshHistory = useCallback((page = 0) => {
    if (!selectedSkill) return
    window.api.eval.history(selectedSkill, PAGE_SIZE, page * PAGE_SIZE).then((res) => {
      setHistory(res.items)
      setHistoryTotal(res.total)
      setHistoryPage(page)
    }).catch((e) => toast(friendlyError(e, t), 'error'))
    // Load full history for charts and search (no pagination limit)
    window.api.eval.history(selectedSkill, 10000, 0).then((res) => {
      setChartHistory(res.items)
    }).catch((e) => toast(friendlyError(e, t), 'error'))
  }, [selectedSkill])

  useEffect(() => {
    if (!selectedSkill) { setTestCases([]); setSelectedTcIds(new Set()); setHistory([]); setChartHistory([]); setHistoryTotal(0); return }
    window.api.testcases.getBySkill(selectedSkill).then((tcs) => {
      setTestCases(tcs)
      setSelectedTcIds(new Set(tcs.map((tc) => tc.id)))
    })
    refreshHistory(0)
  }, [selectedSkill, refreshHistory])

  useEffect(() => {
    const cleanup = window.api.eval.onProgress((data) => {
      setProgress(data.progress)
      setProgressMsg(data.message)
      if (data.progress >= 100) { setRunning(false); refreshHistory(0); setPageTab('chart') }
    })
    return cleanup
  }, [refreshHistory])

  const handleRunEval = async (tcIds?: string[]) => {
    const ids = tcIds ?? [...selectedTcIds]
    if (!selectedSkill || ids.length === 0 || running) return
    setSelectedTcIds(new Set(ids))
    setPageTab('eval')
    setEvalMode('single')
    setRunning(true); setProgress(0); setProgressMsg('')
    try {
      await window.api.eval.start(selectedSkill, ids)
      const skill = skills.find(s => s.id === selectedSkill)
      track('eval_ran', {
        test_case_count: ids.length,
        skill_type_eval: skill?.skillType as 'single' | 'agent' | undefined
      })
    } catch (e) {
      setRunning(false)
      setProgressMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const handleExport = async () => {
    if (!selectedSkill) return
    setExporting(true)
    try {
      const data = await window.api.eval.exportHistory(selectedSkill)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = exportRef.current!
      a.href = url; a.download = `eval-${selectedSkill}-${Date.now()}.json`; a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  const [chartTab, setChartTab] = useState<'radar' | 'trend' | 'multidim' | 'heatmap' | 'boxplot' | 'bycase'>('radar')

  const successHistory = chartHistory.filter(r => r.status === 'success')  // full dataset for charts
  const avgScores = avgDimScores(successHistory)
  const minScores = successHistory.length >= 5 ? minDimScores(successHistory) : undefined
  const maxScores = successHistory.length >= 5 ? maxDimScores(successHistory) : undefined
  const overallAvg = successHistory.length
    ? successHistory.reduce((s, r) => s + r.totalScore, 0) / successHistory.length
    : null

  // When search/filter is active, use the full chartHistory to avoid pagination truncation (E2)
  const isFiltering = historySearch !== '' || historyStatus !== 'all' || historyTcFilter !== ''
  const historyBase = isFiltering ? chartHistory : history
  const filteredHistory = historyBase.filter((r) => {
    if (historyStatus !== 'all' && r.status !== historyStatus) return false
    if (historyTcFilter && r.testCaseName !== historyTcFilter) return false
    if (historySearch) {
      const q = historySearch.toLowerCase()
      return r.inputPrompt?.toLowerCase().includes(q) || r.output?.toLowerCase().includes(q)
    }
    return true
  })

  const tcNames = [...new Set(successHistory.map(r => r.testCaseName).filter(Boolean))] as string[]

  const totalPages = Math.ceil(historyTotal / PAGE_SIZE)

  return (
    <div className="eval-root">
      {/* Hidden export anchor */}
      <a ref={exportRef} style={{ display: 'none' }} />

      {/* Header */}
      <div className="eval-page-header">
        <div>
          <h1>Skill Eval</h1>
          <p className="subtitle">{t('eval.subtitle')}</p>
        </div>
        <div className="eval-controls">
          <select value={selectedSkill} onChange={(e) => { setSelectedSkill(e.target.value); setHistoryPage(0) }} className="skill-select">
            <option value="">选择 Skill...</option>
            {skills.map((s) => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
          </select>
          {selectedSkill && historyTotal > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={exporting}>
              {exporting ? t('eval.exporting') : t('eval.export_json')}
            </button>
          )}
        </div>
      </div>
      {skills.find(s => s.id === selectedSkill)?.skillType === 'agent' && !tavilyKeySet && (
        <div className="gen-warn">⚠️ Agent Skill 使用 web_search 工具需要 Tavily API Key，请前往 <button className="link-btn" onClick={() => onNavigate?.('settings')}>设置</button> 配置。</div>
      )}

      {/* Page tabs: TestCase | Eval | Chart */}
      <div className="page-tabs">
        <button className={`page-tab ${pageTab === 'testcase' ? 'active' : ''}`} onClick={() => setPageTab('testcase')}>
          🧪 测试用例
        </button>
        <button className={`page-tab ${pageTab === 'eval' ? 'active' : ''}`} onClick={() => setPageTab('eval')}>
          ▶ 运行评测
        </button>
        <button className={`page-tab ${pageTab === 'chart' ? 'active' : ''}`} onClick={() => setPageTab('chart')}>
          📈 技能成长{historyTotal > 0 && <span className="tab-badge">{historyTotal}</span>}
        </button>
      </div>

      {/* ── TestCase Tab ── */}
      {pageTab === 'testcase' && selectedSkill && (
        <TestCaseTab skillId={selectedSkill} apiKeySet={apiKeySet} onRunEval={handleRunEval} onNavigate={onNavigate} />
      )}
      {pageTab === 'testcase' && !selectedSkill && (
        <div className="no-skill"><div className="no-skill-icon">🧪</div><p>选择一个 Skill 开始管理测试用例</p>{onNavigate && <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('studio')}>✦ 去 Studio 创建 Skill</button>}</div>
      )}

      {/* ── Eval Tab ── */}
      {pageTab === 'eval' && (<>

        {/* Eval mode tabs */}
        <div className="eval-mode-tabs">
          <button className={`eval-mode-tab ${evalMode === 'single' ? 'active' : ''}`} onClick={() => setEvalMode('single')}>📊 单 Skill</button>
          <button className={`eval-mode-tab ${evalMode === 'compare' ? 'active' : ''}`} onClick={() => setEvalMode('compare')}>⚖️ 对比</button>
          <button className={`eval-mode-tab ${evalMode === 'three' ? 'active' : ''}`} onClick={() => setEvalMode('three')}>🧪 三条件</button>
        </div>

        <FrameworkPanel />

        {evalMode === 'compare' && <CompareMode skills={skills} apiKeySet={apiKeySet} onNavigate={onNavigate} />}
        {evalMode === 'three' && <ThreeConditionMode skills={skills} apiKeySet={apiKeySet} onNavigate={onNavigate} />}

        {evalMode === 'single' && (<>

          {/* Run controls */}
          {selectedSkill && (
            <div className="eval-card run-panel">
              <div className="card-row">
                <span className="card-title">{t('eval.run')}</span>
                <button className="btn btn-primary"
                  onClick={() => handleRunEval()}
                  disabled={!selectedSkill || running || selectedTcIds.size === 0 || apiKeySet === false}>
                  {running ? <><span className="gen-spinner" />{`${progress}%`}</> : `▶ 运行（${selectedTcIds.size} 个用例）`}
                </button>
              </div>
              {testCases.length > 0 && (
                <div className="tc-list">
                  {testCases.map((tc) => (
                    <div key={tc.id} className={`tc-card ${selectedTcIds.has(tc.id) ? 'selected' : ''}`}>
                      <div className="tc-card-header">
                        <input type="checkbox" checked={selectedTcIds.has(tc.id)}
                          onChange={() => setSelectedTcIds((prev) => { const n = new Set(prev); n.has(tc.id) ? n.delete(tc.id) : n.add(tc.id); return n })} />
                        <span className="tc-name">{tc.name}</span>
                        <span className="judge-chip" style={{ color: JUDGE_COLORS[tc.judgeType], borderColor: JUDGE_COLORS[tc.judgeType] + '66' }}>{tc.judgeType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {testCases.length === 0 && <div className="info-banner">还没有测试用例，请先在「测试用例」Tab 添加。</div>}
              {apiKeySet === false && <div className="gen-warn">⚠️ 未配置 API Key，请先前往 <button className="link-btn" onClick={() => onNavigate?.('settings')}>设置</button> 添加。</div>}
            </div>
          )}

          {/* Progress */}
          {running && (
            <div className="eval-card progress-card">
              <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
              <p className="progress-msg">{progressMsg || t('eval.evaluating')} {progress}%</p>
            </div>
          )}

          {!running && historyTotal > 0 && (
            <div className="run-done-banner">
              评测完成
              <button className="link-btn" onClick={() => setPageTab('chart')}>查看技能成长 →</button>
              {selectedSkill && (
                <button className="link-btn evo-link" onClick={() => onNavigate?.('evo', selectedSkill)}>⟳ 去进化 →</button>
              )}
            </div>
          )}

          {!selectedSkill && (
            <div className="no-skill"><div className="no-skill-icon">📊</div><p>选择一个 Skill 开始评测</p>{onNavigate && <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('studio')}>✦ 去 Studio 创建 Skill</button>}</div>
          )}

        </>)}
      </>)}

      {/* ── Chart & History Tab ── */}
      {pageTab === 'chart' && (<>
        {!selectedSkill && (
          <div className="no-skill"><div className="no-skill-icon">📈</div><p>选择一个 Skill 查看技能成长</p>{onNavigate && <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('studio')}>✦ 去 Studio 创建 Skill</button>}</div>
        )}

        {selectedSkill && (<>
          {/* Chart panel */}
          <div className="eval-card chart-panel">
            <div className="chart-tabs">
              <button className={`chart-tab ${chartTab === 'radar' ? 'active' : ''}`} onClick={() => setChartTab('radar')}>🕸 雷达图</button>
              <button className={`chart-tab ${chartTab === 'trend' ? 'active' : ''}`} onClick={() => setChartTab('trend')}>📈 总分趋势</button>
              <button className={`chart-tab ${chartTab === 'multidim' ? 'active' : ''}`} onClick={() => setChartTab('multidim')}>〰 多维趋势</button>
              <button className={`chart-tab ${chartTab === 'heatmap' ? 'active' : ''}`} onClick={() => setChartTab('heatmap')}>🌡 热力图</button>
              <button className={`chart-tab ${chartTab === 'boxplot' ? 'active' : ''}`} onClick={() => setChartTab('boxplot')}>📦 分布图</button>
              <button className={`chart-tab ${chartTab === 'bycase' ? 'active' : ''}`} onClick={() => setChartTab('bycase')}>📋 按用例</button>
            </div>

            {successHistory.length === 0 && (
              <div className="chart-empty">
                还没有成功的评测记录。<button className="link-btn" onClick={() => setPageTab('eval')}>去运行评测 →</button>
              </div>
            )}

            {successHistory.length > 0 && (<>
              {/* Radar */}
              {chartTab === 'radar' && (
                <div className="radar-wrap">
                  <RadarChart scores={avgScores} minScores={minScores} maxScores={maxScores} size={320} />
                  <div className="radar-legend">
                    {DIM_ORDER.filter((d) => d in avgScores).map((d) => (
                      <div key={d} className="legend-row">
                        <span className="legend-dot" style={{ background: DIM_COLORS[d] }} />
                        <span className="legend-dim">{DIM_LABELS[d] ?? d}</span>
                        <span className="legend-val" style={{ color: DIM_COLORS[d] }}>{avgScores[d].toFixed(1)}</span>
                      </div>
                    ))}
                    {overallAvg !== null && (
                      <div className="legend-row overall">
                        <span className="legend-dim">总均分</span>
                        <span className="legend-val accent">{overallAvg.toFixed(2)}</span>
                      </div>
                    )}
                    {minScores && (
                      <div className="legend-row band-hint">
                        <span className="legend-dim" style={{ color: 'var(--text-muted)', fontSize: 10 }}>虚线带 = min/max 范围（≥5次）</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {chartTab === 'trend' && (
                <div>
                  <TrendLine history={successHistory} tcNames={tcNames} width={520} height={120} />
                  <div className="trend-stats">
                    <div className="trend-stat"><span className="ts-label">最低</span><span className="ts-val danger">{Math.min(...successHistory.map(r => r.totalScore)).toFixed(1)}</span></div>
                    <div className="trend-stat"><span className="ts-label">均值</span><span className="ts-val accent">{overallAvg!.toFixed(2)}</span></div>
                    <div className="trend-stat"><span className="ts-label">最高</span><span className="ts-val success">{Math.max(...successHistory.map(r => r.totalScore)).toFixed(1)}</span></div>
                    <div className="trend-stat"><span className="ts-label">次数</span><span className="ts-val">{successHistory.length}</span></div>
                  </div>
                </div>
              )}

              {chartTab === 'multidim' && (
                <div>
                  <p className="chart-hint">悬停图例可高亮单条维度趋势</p>
                  <MultiDimTrendChart history={successHistory.slice(-20)} width={560} height={220} />
                </div>
              )}

              {chartTab === 'heatmap' && (
                <div>
                  <p className="chart-hint">颜色越绿得分越高，显示最近 20 次评测（最新在上）</p>
                  <HeatmapChart history={successHistory} />
                </div>
              )}

              {chartTab === 'boxplot' && (
                <div>
                  <p className="chart-hint">◆ 均值　｜　竖线 = 中位数　｜　矩形 = Q1–Q3 区间　｜　横线端点 = min/max</p>
                  <BoxPlotChart history={successHistory} width={560} height={Math.max(160, DIM_ORDER.length * 26 + 34)} onRunEval={() => setPageTab('eval')} />
                </div>
              )}
              {chartTab === 'bycase' && (() => {
                const caseMap = new Map<string, typeof successHistory>()
                for (const r of successHistory) {
                  const key = r.testCaseName ?? t('eval.unnamed')
                  if (!caseMap.has(key)) caseMap.set(key, [])
                  caseMap.get(key)!.push(r)
                }
                return <ByCasePanel caseMap={caseMap} />
              })()}
            </>)}
          </div>

          {/* History list */}
          <div className="eval-card">
            <div className="card-row">
              <span className="card-title">{t('eval.history_count', { n: historyTotal })}</span>
              <div className="history-controls">
                {compareSet.size > 0 && (
                  <button
                    className={`btn btn-sm ${compareSet.size === 2 ? 'btn-primary' : 'btn-ghost'}`}
                    disabled={compareSet.size < 2}
                    onClick={() => setShowCompareModal(true)}
                  >
                    对比选中 ({compareSet.size}/2)
                  </button>
                )}
                <div className="tc-search-wrap">
                  <span className="search-icon">🔍</span>
                  <input className="tc-search" placeholder={t('eval.search_placeholder')} value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)} />
                  {historySearch && <button className="search-clear" onClick={() => setHistorySearch('')}>✕</button>}
                </div>
                <select className="status-filter" value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value as 'all' | 'success' | 'error')}>
                  <option value="all">全部</option>
                  <option value="success">成功</option>
                  <option value="error">失败</option>
                </select>
                {tcNames.length > 0 && (
                  <select className="status-filter" value={historyTcFilter} onChange={e => setHistoryTcFilter(e.target.value)}>
                    <option value="">全部用例</option>
                    {tcNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </div>
            </div>

            {historyTotal === 0 && (
              <div className="tc-empty">还没有评测记录，<button className="link-btn" onClick={() => setPageTab('eval')}>去运行评测 →</button></div>
            )}

            <div className="history-list">
              {(() => {
                // Group ALL rows by tcName (not just consecutive), preserving first-seen order
                const groupMap = new Map<string, typeof filteredHistory>()
                for (const r of filteredHistory) {
                  const key = r.testCaseName ?? ''
                  if (!groupMap.has(key)) groupMap.set(key, [])
                  groupMap.get(key)!.push(r)
                }
                return [...groupMap.entries()].map(([tcName, rows], gi) => {
                  const scores = rows.map(r => r.totalScore)
                  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
                  const trend = scores.length >= 2 ? scores[0] - scores[scores.length - 1] : 0
                  const trendIcon = trend > 0.5 ? '↑' : trend < -0.5 ? '↓' : '→'
                  const trendColor = trend > 0.5 ? 'var(--success)' : trend < -0.5 ? 'var(--danger)' : 'var(--text-muted)'
                  return (
                  <div key={gi} className="history-tc-group">
                    {tcName && (
                      <div className="history-tc-group-header" onClick={() => setCollapsedTcGroups(prev => {
                        const next = new Set(prev)
                        next.has(tcName) ? next.delete(tcName) : next.add(tcName)
                        return next
                      })}>
                        <span>{collapsedTcGroups.has(tcName) ? '▸' : '▾'}</span>
                        <span className="history-tc-group-name">{tcName}</span>
                        <span className="history-tc-group-count">{rows.length} 次</span>
                        <span className="history-tc-group-avg" style={{ color: avg >= 7 ? 'var(--success)' : avg >= 4 ? 'var(--warning)' : 'var(--danger)' }}>
                          均 {avg.toFixed(1)}
                        </span>
                        {scores.length >= 2 && (
                          <span className="history-tc-group-trend" style={{ color: trendColor }}>{trendIcon}</span>
                        )}
                      </div>
                    )}
                    {!collapsedTcGroups.has(tcName) && rows.map((r) => (
                      <div key={r.id} className={`result-row ${expandedId === r.id ? 'result-row-open' : ''}`}>
                        <div className="result-row-header">
                          <input
                            type="checkbox"
                            className="history-cmp-cb"
                            checked={compareSet.has(r.id)}
                            disabled={!compareSet.has(r.id) && compareSet.size >= 2}
                            onChange={() => toggleCompare(r.id)}
                            onClick={e => e.stopPropagation()}
                            title="选中后可对比两条记录"
                          />
                          <span className={`status-dot ${r.status}`} />
                          <span className="result-date">{new Date(r.createdAt).toLocaleString()}</span>
                          {r.testCaseName && !tcName && (
                            <span className="result-tc-name" title={r.testCaseName}>{r.testCaseName}</span>
                          )}
                          <div className="result-dim-bars">
                            {DIM_ORDER.filter((d) => d in r.scores).map((d) => (
                              <div key={d} className="inline-bar-wrap" title={`${DIM_LABELS[d] ?? d}: ${r.scores[d].score}/10${r.scores[d].details ? '\n' + r.scores[d].details : ''}`}>
                                <div className="inline-bar" style={{ width: `${(r.scores[d].score / 10) * 100}%`, background: DIM_COLORS[d] }} />
                              </div>
                            ))}
                          </div>
                          <span className="result-total" style={{ color: r.totalScore >= 7 ? 'var(--success)' : r.totalScore >= 4 ? 'var(--warning)' : 'var(--danger)' }}>
                            {r.totalScore.toFixed(1)}
                          </span>
                          <button
                            className="expand-btn"
                            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                            title={expandedId === r.id ? t('eval.collapse_detail') : t('eval.expand_detail')}
                          >
                            {expandedId === r.id ? '▾' : '▸'}
                          </button>
                          <button
                            className="expand-btn history-del-btn"
                            title="删除此记录"
                            onClick={async (e) => {
                              e.stopPropagation()
                              await window.api.eval.deleteRecord(r.id)
                              refreshHistory(historyPage)
                            }}
                          >🗑</button>
                        </div>

                        {expandedId === r.id && (
                          <div className="result-detail">
                            <div className="result-viz-row">
                              <RadarChart scores={Object.fromEntries(Object.entries(r.scores).map(([d, s]) => [d, s.score]))} size={160} />
                              <DimBarChart scores={r.scores} />
                            </div>
                            <div className="detail-dims-grid">
                              {Object.entries(r.scores).map(([dim, s]) => (
                                <div key={dim} className="detail-dim">
                                  <div className="detail-dim-header">
                                    <span className="detail-dim-name" style={{ color: DIM_COLORS[dim] ?? 'var(--text)' }}>{DIM_LABELS[dim] ?? dim}</span>
                                    <span className="detail-dim-score">{s.score}/10</span>
                                  </div>
                                  {s.details && (
                                    <blockquote className="detail-rationale">
                                      <span className="detail-rationale-label">评分依据</span>
                                      {s.details}
                                    </blockquote>
                                  )}
                                  {s.violations?.length > 0 && (
                                    <div className="violations-block">
                                      <span className="violations-label">扣分原因</span>
                                      <ul className="violations">{s.violations.map((v, i) => <li key={i}>{v}</li>)}</ul>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            {r.status === 'error' && <div className="error-detail">{r.output}</div>}
                            <div className="detail-io-row">
                              <div className="detail-io-col">
                                <span className="detail-label">Input</span>
                                <pre className="detail-pre">{r.inputPrompt}</pre>
                              </div>
                              <div className="detail-io-col">
                                <span className="detail-label">Output</span>
                                <AgentOutputRenderer output={r.output} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  )
                })
              })()}
            </div>

            {totalPages > 1 && !isFiltering && (
              <div className="pagination">
                <button className="btn btn-ghost btn-sm" disabled={historyPage === 0} onClick={() => refreshHistory(historyPage - 1)}>← 上一页</button>
                <span className="page-info">{historyPage + 1} / {totalPages}</span>
                <button className="btn btn-ghost btn-sm" disabled={historyPage >= totalPages - 1} onClick={() => refreshHistory(historyPage + 1)}>下一页 →</button>
              </div>
            )}
          </div>
        </>)}
      </>)}

      {/* 历史对比 Modal */}
      {showCompareModal && compareSet.size === 2 && (() => {
        const [idA, idB] = [...compareSet]
        const rA = history.find(r => r.id === idA)
        const rB = history.find(r => r.id === idB)
        if (!rA || !rB) return null
        const dims = DIM_ORDER.filter(d => d in rA.scores && d in rB.scores)
        return (
          <div className="modal-overlay" onClick={() => setShowCompareModal(false)}>
            <div className="modal-box hist-cmp-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">历史评测对比</span>
                <button className="modal-close" onClick={() => setShowCompareModal(false)}>✕</button>
              </div>
              <div className="hist-cmp-body">
                {/* 日期行 */}
                <div className="hist-cmp-dates">
                  <span className="hist-cmp-date-a">{new Date(rA.createdAt).toLocaleString()}</span>
                  <span className="hist-cmp-vs">vs</span>
                  <span className="hist-cmp-date-b">{new Date(rB.createdAt).toLocaleString()}</span>
                </div>
                {/* 总分 */}
                <div className="hist-cmp-totals">
                  <span className="hist-cmp-total" style={{ color: rA.totalScore >= 7 ? 'var(--success)' : 'var(--warning)' }}>{rA.totalScore.toFixed(1)}</span>
                  <span className="hist-cmp-total-label">总分</span>
                  <span className="hist-cmp-total" style={{ color: rB.totalScore >= 7 ? 'var(--success)' : 'var(--warning)' }}>{rB.totalScore.toFixed(1)}</span>
                </div>
                {/* 维度对比 */}
                <div className="hist-cmp-dims">
                  {dims.map(d => {
                    const sA = rA.scores[d].score, sB = rB.scores[d].score
                    const delta = sB - sA
                    return (
                      <div key={d} className="hist-cmp-dim-row">
                        <span className="hist-cmp-dim-val" style={{ color: DIM_COLORS[d] }}>{sA.toFixed(1)}</span>
                        <div className="hist-cmp-dim-center">
                          <span className="hist-cmp-dim-name" style={{ color: DIM_COLORS[d] }}>{DIM_LABELS[d] ?? d}</span>
                          <div className="hist-cmp-bar-wrap">
                            <div className="hist-cmp-bar hist-cmp-bar-a" style={{ width: `${(sA / 10) * 50}%`, background: DIM_COLORS[d] + '88' }} />
                            <div className="hist-cmp-bar-mid" />
                            <div className="hist-cmp-bar hist-cmp-bar-b" style={{ width: `${(sB / 10) * 50}%`, background: DIM_COLORS[d] }} />
                          </div>
                        </div>
                        <span className="hist-cmp-dim-val" style={{ color: DIM_COLORS[d] }}>{sB.toFixed(1)}</span>
                        <span className={`hist-cmp-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neu'}`}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      <style>{`
        /* Framework panel */
        .fw-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .fw-toggle { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: transparent; border: none; color: var(--text); font-size: 13px; font-weight: 600; cursor: pointer; text-align: left; }
        .fw-toggle:hover { background: var(--surface2); }
        .fw-body { padding: 14px 16px; border-top: 1px solid var(--border); }
        .fw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
        .fw-dim { background: var(--surface2); border-radius: var(--radius); padding: 10px 12px; }
        .fw-dim-header { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
        .fw-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .fw-dim-name { font-size: 12px; font-weight: 700; text-transform: capitalize; flex: 1; }
        .fw-source { font-size: 10px; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; white-space: nowrap; }
        .fw-desc { font-size: 11px; color: var(--text-muted); margin: 0; line-height: 1.5; }

        .eval-root { display: flex; flex-direction: column; gap: 20px; }
        .eval-page-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .eval-page-header h1 { font-size: 24px; font-weight: 700; }
        .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
        .eval-controls { display: flex; gap: 10px; align-items: center; }
        .skill-select { padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 14px; min-width: 200px; }
        .guard-banner { background: rgba(250,204,21,0.08); border: 1px solid rgba(250,204,21,0.3); border-radius: var(--radius); padding: 12px 16px; color: var(--warning); font-size: 13px; }
        .info-banner { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; color: var(--text-muted); font-size: 13px; }

        /* Mode tabs */
        .eval-mode-tabs { display: flex; gap: 6px; }
        .eval-mode-tab { display: flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer; transition: all var(--transition); }
        .eval-mode-tab:hover { color: var(--text); border-color: var(--text-muted); }
        .eval-mode-tab.active { background: var(--surface2); color: var(--text); border-color: var(--accent); }

        /* Cards */
        .eval-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
        .card-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 14px; display: block; }
        .card-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .card-row .card-title { margin-bottom: 0; }
        .bulk-btns { display: flex; gap: 6px; }
        .btn-sm { padding: 5px 10px; font-size: 12px; }

        /* Page tabs */
        .page-tabs { display: flex; gap: 4px; }
        .page-tab { display: flex; align-items: center; gap: 6px; padding: 7px 18px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer; transition: all var(--transition); }
        .page-tab:hover { color: var(--text); border-color: var(--text-muted); }
        .page-tab.active { background: var(--surface2); color: var(--text); border-color: var(--accent); }
        .tab-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: #fff; font-size: 10px; font-weight: 700; line-height: 1; }
        .link-btn { background: none; border: none; color: var(--accent); font-size: inherit; cursor: pointer; padding: 0; text-decoration: underline; }
        .link-btn:hover { opacity: 0.8; }
        .link-btn.evo-link { color: var(--success); }
        .run-done-banner { padding: 12px 16px; background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.25); border-radius: var(--radius); font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .history-controls { display: flex; gap: 8px; align-items: center; }
        .status-filter { padding: 5px 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 12px; }
        .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }
        .page-info { font-size: 13px; color: var(--text-muted); }

        /* TC tab */
        .tc-tab { display: flex; flex-direction: column; gap: 16px; }
        .tc-stats { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .stat-total { font-size: 14px; font-weight: 600; }
        .stat-chip { font-size: 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; }

        /* TC list */
        .tc-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
        .tc-card { border: 1px solid var(--border); border-radius: var(--radius); }
        .tc-card.selected { border-color: rgba(108,99,255,0.4); background: rgba(108,99,255,0.04); }
        .tc-card-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--surface2); transition: background var(--transition); }
        .tc-card-header:hover { background: rgba(108,99,255,0.06); }
        .tc-expand { font-size: 11px; color: var(--text-muted); width: 12px; flex-shrink: 0; cursor: pointer; }
        .tc-name { flex: 1; font-size: 13px; font-weight: 500; cursor: pointer; }
        .judge-chip { font-size: 10px; border: 1px solid; border-radius: 4px; padding: 1px 6px; flex-shrink: 0; }
        .tc-card-body { padding: 10px 12px; background: var(--bg); border-top: 1px solid var(--border); }
        .tc-field { margin-bottom: 8px; }
        .tc-field-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); display: block; margin-bottom: 3px; }
        .tc-field-value { font-family: 'Courier New', monospace; font-size: 12px; color: var(--text); white-space: pre-wrap; word-break: break-all; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; margin: 0; max-height: 100px; overflow-y: auto; }
        .tc-meta { font-size: 11px; color: var(--text-muted); }
        .tc-edit-input, .tc-edit-select { width: 100%; font-size: 13px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); box-sizing: border-box; }
        .tc-edit-textarea { width: 100%; font-size: 12px; font-family: 'Courier New', monospace; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); resize: vertical; box-sizing: border-box; }
        .tc-edit-actions { display: flex; gap: 8px; margin-top: 10px; }
        .tc-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }

        /* Buttons */
        .btn-xs { padding: 3px 9px; font-size: 11px; }
        .btn-danger { background: var(--danger) !important; border-color: var(--danger) !important; color: #fff !important; }

        /* Generate controls */
        .gen-hint { font-size: 12px; color: var(--text-muted); }
        .gen-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .count-row { display: flex; gap: 6px; }
        .count-chip { padding: 4px 12px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 13px; cursor: pointer; transition: all var(--transition); }
        .count-chip:hover { border-color: var(--accent); color: var(--accent); }
        .count-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }
        .gen-error { margin-top: 10px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius); padding: 8px 12px; color: var(--danger); font-size: 13px; }
        .gen-success { margin-top: 10px; background: rgba(74,222,128,0.08); border: 1px solid var(--success); border-radius: var(--radius); padding: 8px 12px; color: var(--success); font-size: 13px; }
        .gen-warn { margin-top: 10px; background: rgba(250,204,21,0.08); border: 1px solid rgba(250,204,21,0.3); border-radius: var(--radius); padding: 8px 12px; color: var(--warning); font-size: 12px; }
        .gen-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Generate Preview Modal */
        .tc-preview-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .tc-preview-modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: 100%; max-width: 640px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
        .tc-preview-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .tc-preview-title { font-size: 14px; font-weight: 700; }
        .tc-preview-header-actions { display: flex; gap: 8px; }
        .tc-preview-list { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
        .tc-preview-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; background: var(--surface2); transition: border-color var(--transition); }
        .tc-preview-card.checked { border-color: rgba(108,99,255,0.5); background: rgba(108,99,255,0.04); }
        .tc-preview-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .tc-preview-name { flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 13px; font-weight: 500; padding: 4px 8px; }
        .tc-preview-name:focus { outline: none; border-color: var(--accent); }
        .tc-preview-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
        .tc-preview-field:last-child { margin-bottom: 0; }
        .tc-preview-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
        .tc-preview-input { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 12px; font-family: 'Courier New', monospace; padding: 6px 8px; resize: vertical; }
        .tc-preview-input:focus { outline: none; border-color: var(--accent); }
        .tc-preview-judge { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 12px; padding: 4px 8px; }
        .tc-preview-judge:focus { outline: none; border-color: var(--accent); }
        .tc-preview-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }

        /* Search */
        .tc-search-wrap { position: relative; display: flex; align-items: center; }
        .search-icon { position: absolute; left: 9px; font-size: 12px; pointer-events: none; }
        .tc-search { padding: 6px 28px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; width: 180px; }
        .tc-search:focus { outline: none; border-color: var(--accent); }
        .search-clear { position: absolute; right: 8px; background: none; color: var(--text-muted); font-size: 11px; padding: 2px 4px; }

        /* Add form */
        .add-toggle { margin-top: 4px; }
        .tc-add-row { display: flex; gap: 8px; margin-top: 4px; }
        .add-form { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; margin-top: 8px; }
        .add-form-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
        .btn-icon-sm { background: transparent; color: var(--text-muted); font-size: 11px; padding: 2px 5px; border-radius: 3px; }
        .btn-icon-sm:hover { color: var(--danger); }
        .add-form-row { display: flex; gap: 8px; margin-bottom: 10px; }
        .add-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .import-result { margin-top: 8px; border-radius: var(--radius); padding: 8px 12px; font-size: 13px; }
        .import-result-ok { background: rgba(74,222,128,0.08); border: 1px solid var(--success); color: var(--success); }
        .import-result-error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); color: var(--danger); }
        .import-result summary { cursor: pointer; color: var(--warning); }
        .import-errors { margin: 6px 0 0 0; padding-left: 16px; }
        .import-errors li { font-size: 12px; color: var(--text-muted); margin-bottom: 2px; }

        /* Run CTA */
        .run-cta { display: flex; align-items: center; justify-content: space-between; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 20px; }
        .run-cta-hint { font-size: 13px; color: var(--text-muted); }

        /* No skill */
        .no-skill { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 80px 20px; color: var(--text-muted); text-align: center; }
        .no-skill-icon { font-size: 40px; }

        /* Progress */
        .progress-card { padding: 14px 20px; }
        .progress-track { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
        .progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s; }
        .progress-msg { font-size: 12px; color: var(--text-muted); margin: 0; }

        /* Chart panel */
        .chart-panel { display: flex; flex-direction: column; gap: 14px; }
        .chart-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
        .chart-tab { padding: 5px 14px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 500; cursor: pointer; transition: all var(--transition); white-space: nowrap; }
        .chart-tab:hover { color: var(--text); border-color: var(--text-muted); }
        .chart-tab.active { background: var(--surface2); color: var(--text); border-color: var(--accent); }
        .chart-hint { font-size: 11px; color: var(--text-muted); margin: 0 0 10px; }
        .chart-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }

        /* Multi-dim trend */
        .multidim-wrap { display: flex; flex-direction: column; gap: 10px; }
        .multidim-controls { display: flex; align-items: center; gap: 8px; }
        .mdl-toggle { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-muted); font-size: 11px; padding: 3px 10px; cursor: pointer; }
        .mdl-toggle:hover, .mdl-toggle.active { border-color: var(--accent); color: var(--accent); background: var(--surface); }
        .multidim-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; }
        .mdl-item { display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: background var(--transition); }
        .mdl-item:hover, .mdl-item.active { background: var(--surface2); }
        .mdl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .mdl-name { font-size: 11px; color: var(--text-muted); transition: color var(--transition); }

        /* Heatmap */
        .heatmap-wrap { display: flex; flex-direction: column; gap: 8px; overflow-x: auto; }
        .heatmap-table { display: flex; flex-direction: column; gap: 2px; min-width: max-content; }
        .hm-header { display: flex; align-items: flex-end; gap: 2px; margin-bottom: 2px; }
        .hm-row { display: flex; align-items: center; gap: 2px; }
        .hm-row-label { width: 48px; font-size: 10px; color: var(--text-muted); text-align: right; padding-right: 6px; flex-shrink: 0; }
        .hm-col-label { width: 52px; font-size: 9px; color: var(--text-muted); text-align: center; writing-mode: vertical-rl; transform: rotate(180deg); height: 52px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .hm-col-label span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 48px; }
        .hm-cell { width: 52px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.04); transition: transform 0.15s; cursor: default; }
        .hm-cell:hover { transform: scale(1.08); z-index: 1; position: relative; }
        .hm-val { font-size: 11px; font-weight: 700; color: var(--text); }
        .hm-avg-row { margin-top: 4px; border-top: 1px solid var(--border); padding-top: 4px; }
        .hm-avg-label { font-weight: 700; color: var(--text); }
        .hm-avg-cell { height: 24px; }
        .hm-avg-val { font-size: 11px; font-weight: 800; }
        .hm-scale { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
        .hm-scale-label { font-size: 10px; color: var(--text-muted); }
        .hm-scale-bar { height: 8px; width: 160px; border-radius: 4px; background: linear-gradient(to right, rgba(239,68,68,0.7), rgba(250,204,21,0.5), rgba(74,222,128,0.75)); }

        /* Viz (legacy, kept for per-result mini charts) */
        .viz-grid { display: grid; grid-template-columns: auto 1fr; gap: 16px; }
        .viz-card { }
        .radar-wrap { display: flex; align-items: center; justify-content: center; gap: 20px; }
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
        .trend-filter-row { display: flex; align-items: center; gap: 8px; padding: 6px 0 4px; }
        .trend-tc-select { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 11px; padding: 3px 8px; cursor: pointer; }
        .trend-tc-select:focus { outline: none; border-color: var(--accent); }

        /* History list */
        .history-list { display: flex; flex-direction: column; gap: 4px; }
        .result-row { border: 1px solid var(--border); border-radius: var(--radius); }
        .result-row-open { border-color: var(--accent); }
        .result-row-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--surface2); transition: background var(--transition); }
        .result-row-header:hover { background: rgba(108,99,255,0.06); }
        .history-cmp-cb { width: 13px; height: 13px; cursor: pointer; accent-color: var(--accent); flex-shrink: 0; }
        .history-cmp-cb:disabled { opacity: 0.3; cursor: not-allowed; }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .status-dot.success { background: var(--success); }
        .status-dot.error { background: var(--danger); }
        .result-date { font-size: 12px; color: var(--text-muted); flex: 1; }
        .result-dim-bars { display: flex; gap: 3px; align-items: center; }
        .inline-bar-wrap { width: 36px; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .inline-bar { height: 100%; border-radius: 3px; }
        .result-total { font-size: 14px; font-weight: 700; width: 32px; text-align: right; }
        .expand-btn { background: none; border: none; color: var(--text-muted); font-size: 11px; cursor: pointer; padding: 2px 4px; border-radius: 3px; flex-shrink: 0; }
        .expand-btn:hover { background: var(--surface); color: var(--text); }
        .history-del-btn:hover { color: var(--danger) !important; }

        /* Detail */
        .result-detail { padding: 14px 16px; background: var(--bg); border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
        .detail-dim { background: var(--surface2); border-radius: var(--radius); padding: 10px 12px; }
        .detail-dim-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .detail-dim-name { font-size: 12px; font-weight: 700; text-transform: capitalize; }
        .detail-dim-score { font-size: 13px; font-weight: 700; }
        .detail-text { font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.5; }
        .violations { margin: 4px 0 0 0; padding-left: 16px; }
        .violations li { font-size: 12px; color: var(--danger); }
        .detail-rationale { margin: 4px 0 0; padding: 6px 10px; border-left: 3px solid var(--accent); background: var(--surface2); border-radius: 0 4px 4px 0; font-size: 12px; color: var(--text); line-height: 1.5; }
        .detail-rationale-label, .violations-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 3px; }
        .violations-block { margin-top: 4px; }
        .history-tc-group-header { display: flex; align-items: center; gap: 8px; padding: 4px 8px; cursor: pointer; font-size: 12px; color: var(--text-muted); border-bottom: 1px solid var(--border); user-select: none; }
        .history-tc-group-header:hover { background: var(--surface2); }
        .history-tc-group-name { font-weight: 600; color: var(--text); }
        .history-tc-group-count { margin-left: auto; font-size: 11px; }
        .history-tc-group-avg { font-weight: 700; font-size: 11px; }
        .history-tc-group-trend { font-weight: 700; font-size: 13px; }
        .result-tc-name { font-size: 11px; color: var(--text-muted); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
        .bycase-table { display: flex; flex-direction: column; gap: 6px; padding: 12px; }
        .bycase-row { display: flex; align-items: center; gap: 12px; padding: 8px 10px; background: var(--surface2); border-radius: 6px; cursor: pointer; }
        .bycase-row:hover { background: var(--surface); }
        .bycase-name { flex: 1; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bycase-name.unnamed { color: var(--text-muted); font-style: italic; }
        .bycase-count { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
        .bycase-total { font-size: 14px; font-weight: 700; min-width: 32px; text-align: right; flex-shrink: 0; }
        .bycase-trend { font-size: 13px; font-weight: 700; flex-shrink: 0; }
        .bycase-dim-bars { display: flex; gap: 3px; flex-shrink: 0; }
        .bycase-sparkline { padding: 8px 10px 10px; background: var(--bg); border-top: 1px solid var(--border); border-radius: 0 0 6px 6px; }
        .bycase-sort-row { display: flex; align-items: center; gap: 8px; padding: 0 12px 8px; }
        .bycase-sort-btn { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-muted); font-size: 11px; padding: 3px 10px; cursor: pointer; }
        .bycase-sort-btn.active { border-color: var(--accent); color: var(--accent); }
        .bp-tooltip { position: fixed; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 11px; color: var(--text); white-space: pre; pointer-events: none; z-index: 999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); line-height: 1.6; }
        .error-detail { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius); padding: 8px 12px; color: var(--danger); font-size: 12px; }
        .detail-input { }
        .detail-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); display: block; margin-bottom: 4px; }
        .detail-pre { font-family: 'Courier New', monospace; font-size: 11px; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 8px 10px; margin: 0; white-space: pre-wrap; word-break: break-all; color: var(--text); max-height: 120px; overflow-y: auto; }
        .result-viz-row { display: flex; align-items: flex-start; gap: 16px; }
        .detail-dims-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
        .detail-io-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .detail-io-col { display: flex; flex-direction: column; gap: 4px; }

        /* Compare mode */
        .compare-mode { display: flex; flex-direction: column; gap: 16px; }
        .cmp-skill-row { display: flex; align-items: center; gap: 16px; margin-top: 14px; flex-wrap: wrap; }
        .cmp-skill-picker { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 160px; }
        .cmp-skill-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
        .cmp-vs { font-size: 16px; font-weight: 800; color: var(--text-muted); padding: 0 4px; flex-shrink: 0; }
        .cmp-tc-section { margin-top: 16px; }
        .cmp-overall-row { display: flex; align-items: center; justify-content: center; gap: 32px; padding: 20px 0 16px; }
        .cmp-overall-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .cmp-overall-name { font-size: 13px; font-weight: 600; color: var(--text-muted); max-width: 160px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cmp-overall-score { font-size: 36px; font-weight: 800; line-height: 1; }
        .cmp-overall-vs { font-size: 18px; font-weight: 800; color: var(--text-muted); }
        .cmp-dim-table { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
        .cmp-dim-header { display: grid; grid-template-columns: 100px 1fr 1fr 60px; gap: 8px; padding: 4px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
        .cmp-dim-col { }
        .cmp-dim-row { display: grid; grid-template-columns: 100px 1fr 1fr 60px; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 6px; background: var(--surface2); }
        .cmp-dim-name { font-size: 12px; font-weight: 600; text-transform: capitalize; }
        .cmp-bar-cell { display: flex; align-items: center; gap: 8px; }
        .cmp-bar-track { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .cmp-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
        .cmp-bar-val { font-size: 12px; font-weight: 700; width: 28px; text-align: right; flex-shrink: 0; }
        .cmp-delta { font-size: 12px; font-weight: 700; text-align: center; }
        .cmp-delta.pos { color: var(--success); }
        .cmp-delta.neg { color: var(--danger); }
        .cmp-delta.neu { color: var(--text-muted); }
        .cmp-winner { display: flex; justify-content: center; margin-top: 16px; }
        .winner-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 20px; border-radius: 20px; font-size: 14px; font-weight: 700; }
        .winner-badge.a { background: rgba(108,99,255,0.12); color: var(--accent); border: 1px solid var(--accent); }
        .winner-badge.b { background: rgba(0,212,170,0.12); color: var(--success); border: 1px solid var(--success); }
        .winner-badge.neu { background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); }

        /* Three-condition cards */
        .three-cond-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0; }
        .three-cond-card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface2); }
        .three-cond-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); text-align: center; }
        .three-cond-score { font-size: 32px; font-weight: 800; line-height: 1; }

        /* Three-condition per-TC detail */
        .tc-detail-section { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .tc-detail-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--surface2); cursor: pointer; user-select: none; }
        .tc-detail-header:hover { background: rgba(108,99,255,0.06); }
        .tc-detail-chevron { font-size: 10px; color: var(--text-muted); }
        .tc-detail-title { font-size: 12px; font-weight: 700; color: var(--text); }
        .tc-detail-count { margin-left: auto; font-size: 11px; color: var(--text-muted); }
        .tc-detail-table { display: flex; flex-direction: column; }
        .tc-detail-thead { display: grid; grid-template-columns: 1fr 64px 64px 72px; gap: 4px; padding: 6px 12px; background: var(--surface2); border-top: 1px solid var(--border); font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .tc-detail-group { border-top: 1px solid var(--border); }
        .tc-detail-row { display: grid; grid-template-columns: 1fr 64px 64px 72px; gap: 4px; padding: 7px 12px; cursor: pointer; align-items: center; }
        .tc-detail-row:hover { background: var(--surface2); }
        .tc-detail-row.expanded { background: rgba(108,99,255,0.04); }
        .tc-detail-col-name { display: flex; align-items: center; gap: 6px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tc-detail-chevron-sm { font-size: 9px; color: var(--text-muted); flex-shrink: 0; }
        .tc-detail-col-score { font-size: 13px; font-weight: 700; text-align: right; }
        .tc-detail-dim-row { display: grid; grid-template-columns: 1fr 64px 64px 72px; gap: 4px; padding: 3px 12px 3px 28px; background: rgba(0,0,0,0.02); align-items: center; }
        .tc-detail-dim-name { font-size: 11px; font-style: italic; }

        /* Agent trace */
        .agent-output { display: flex; flex-direction: column; gap: 8px; }
        .agent-trace { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .trace-toggle { width: 100%; text-align: left; padding: 7px 12px; background: var(--surface2); border: none; cursor: pointer; font-size: 12px; color: var(--text-muted); font-family: inherit; }
        .trace-toggle:hover { background: rgba(108,99,255,0.06); color: var(--text); }
        .trace-steps { display: flex; flex-direction: column; gap: 0; }
        .trace-step { border-top: 1px solid var(--border); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
        .trace-step-header { display: flex; align-items: center; gap: 8px; }
        .trace-turn { font-size: 11px; color: var(--text-muted); }
        .trace-tool-name { font-size: 12px; font-weight: 700; color: var(--accent); font-family: monospace; }
        .trace-error-badge { font-size: 10px; background: var(--danger); color: #fff; border-radius: 3px; padding: 1px 5px; }
        .trace-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 2px; }
        .trace-pre { margin: 0; font-size: 11px; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow-y: auto; background: var(--surface); padding: 6px 8px; border-radius: 4px; border: 1px solid var(--border); }

        /* History compare modal */
        .hist-cmp-modal { width: min(720px, 95vw); }
        .hist-cmp-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
        .hist-cmp-dates { display: flex; align-items: center; justify-content: center; gap: 16px; font-size: 13px; font-weight: 600; }
        .hist-cmp-date-a { color: var(--text-muted); }
        .hist-cmp-date-b { color: var(--accent); }
        .hist-cmp-vs { font-size: 12px; font-weight: 800; color: var(--text-muted); }
        .hist-cmp-totals { display: flex; align-items: center; justify-content: center; gap: 20px; }
        .hist-cmp-total { font-size: 28px; font-weight: 800; }
        .hist-cmp-total-label { font-size: 12px; color: var(--text-muted); }
        .hist-cmp-dims { display: flex; flex-direction: column; gap: 6px; }
        .hist-cmp-dim-row { display: flex; align-items: center; gap: 8px; }
        .hist-cmp-dim-val { font-size: 12px; font-weight: 700; width: 32px; text-align: right; flex-shrink: 0; }
        .hist-cmp-dim-center { flex: 1; min-width: 0; }
        .hist-cmp-dim-name { font-size: 12px; font-weight: 600; text-align: center; display: block; }
        .hist-cmp-bar-wrap { display: flex; align-items: center; gap: 0; margin-top: 3px; }
        .hist-cmp-bar { height: 6px; border-radius: 3px 0 0 3px; }
        .hist-cmp-bar-a { align-self: flex-end; border-radius: 3px 0 0 3px; }
        .hist-cmp-bar-b { align-self: flex-end; border-radius: 0 3px 3px 0; }
        .hist-cmp-bar-mid { width: 1px; background: var(--border); flex-shrink: 0; margin: 0 1px; }
        .hist-cmp-delta { font-size: 11px; font-weight: 700; width: 48px; text-align: right; flex-shrink: 0; }
        .hist-cmp-delta.pos { color: var(--success); }
        .hist-cmp-delta.neg { color: var(--danger); }
        .hist-cmp-delta.neu { color: var(--text-muted); }
      `}</style>
    </div>
  )
}
