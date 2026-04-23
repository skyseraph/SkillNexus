import { useEffect, useState, useCallback, useRef } from 'react'
import type { Skill, EvalResult, EvalScore, TestCase } from '../../../shared/types'
import CompareMode from './EvalCompareMode'
import ThreeConditionMode from './EvalThreeConditionMode'

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
const DIM_LABELS: Record<string, string> = {
  correctness:           'Correctness',
  instruction_following: 'Instr. Follow',
  safety:                'Safety',
  completeness:          'Completeness',
  robustness:            'Robustness',
  executability:         'Executability',
  cost_awareness:        'Cost Aware',
  maintainability:       'Maintainability'
}

// ── Framework Panel ───────────────────────────────────────────────────────────

const FRAMEWORK_DIMS = [
  { key: 'correctness',           source: 'AgentSkills G1', color: '#6c63ff', desc: '输出是否正确完成任务目标' },
  { key: 'instruction_following', source: 'AgentSkills G2', color: '#00d4aa', desc: '是否遵循 Skill 中的具体指令和约束' },
  { key: 'safety',                source: 'AgentSkills G3', color: '#ef4444', desc: '输出是否安全、无偏见、无害' },
  { key: 'completeness',          source: 'AgentSkills G4', color: '#f59e0b', desc: '响应是否完整覆盖任务所有要求' },
  { key: 'robustness',            source: 'AgentSkills G5', color: '#8b5cf6', desc: '是否能处理边界情况和异常输入' },
  { key: 'executability',         source: 'SkillNet',       color: '#06b6d4', desc: 'Skill 指令是否清晰可执行、无歧义' },
  { key: 'cost_awareness',        source: 'SkillNet',       color: '#10b981', desc: '是否避免冗余、token 效率合理' },
  { key: 'maintainability',       source: 'SkillNet',       color: '#f97316', desc: 'Skill 结构是否清晰、易于维护和更新' },
]

function FrameworkPanel() {
  const [open, setOpen] = useState(false)
  return (
    <div className="fw-panel">
      <button className="fw-toggle" onClick={() => setOpen(v => !v)}>
        <span>📐 评测框架（AgentSkills G1-G5 + SkillNet · 8 维度）</span>
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
                <p className="fw-desc">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
        const lx = cx + (r + 22) * Math.cos(a)
        const ly = cy + (r + 22) * Math.sin(a)
        return (
          <text key={d} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fill="var(--text-muted)" fontWeight="600">
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
  }))
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length-1].x.toFixed(1)},${(pad.t+H).toFixed(1)} L${pts[0].x.toFixed(1)},${(pad.t+H).toFixed(1)} Z`

  return (
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
      <path d={areaD} fill="rgba(108,99,255,0.08)" />
      <path d={pathD} fill="none" stroke="#6c63ff" strokeWidth="1.8" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6c63ff" />)}
    </svg>
  )
}

// ── Multi-dim Trend Chart ─────────────────────────────────────────────────────

function MultiDimTrendChart({ history, width = 540, height = 200 }: {
  history: EvalResult[]; width?: number; height?: number
}) {
  const [hoveredDim, setHoveredDim] = useState<string | null>(null)
  if (history.length < 2) return <div className="chart-empty">至少需要 2 次评测数据</div>
  const pad = { l: 28, r: 12, t: 10, b: 24 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  const n = history.length

  const dimPaths = DIM_ORDER.map(dim => {
    const pts = history.map((r, i) => {
      const score = r.scores?.[dim]?.score ?? 0
      return {
        x: pad.l + (i / (n - 1)) * W,
        y: pad.t + H - (score / 10) * H,
      }
    })
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    return { dim, pts, d }
  })

  return (
    <div className="multidim-wrap">
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
        {history.map((r, i) => {
          const x = pad.l + (i / (n - 1)) * W
          return (
            <text key={i} x={x} y={pad.t + H + 14} textAnchor="middle" fontSize="8" fill="var(--text-muted)">
              {new Date(r.createdAt).toLocaleDateString('zh', { month: 'numeric', day: 'numeric' })}
            </text>
          )
        })}
        {/* Lines */}
        {dimPaths.map(({ dim, pts, d }) => {
          const active = hoveredDim === null || hoveredDim === dim
          return (
            <g key={dim}>
              <path d={d} fill="none"
                stroke={DIM_COLORS[dim]}
                strokeWidth={hoveredDim === dim ? 2.5 : 1.4}
                strokeLinejoin="round"
                opacity={active ? 1 : 0.18}
                style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }} />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={hoveredDim === dim ? 3.5 : 2}
                  fill={DIM_COLORS[dim]} opacity={active ? 1 : 0.18}
                  style={{ transition: 'opacity 0.2s' }} />
              ))}
            </g>
          )
        })}
      </svg>
      {/* Legend */}
      <div className="multidim-legend">
        {DIM_ORDER.map(dim => (
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
  // 0→red, 5→yellow, 10→green  (all with low alpha background)
  if (score >= 8) return `rgba(74,222,128,${0.15 + (score - 8) / 2 * 0.6})`
  if (score >= 5) return `rgba(250,204,21,${0.12 + (score - 5) / 3 * 0.3})`
  return `rgba(239,68,68,${0.15 + (5 - score) / 5 * 0.5})`
}

function HeatmapChart({ history }: { history: EvalResult[] }) {
  const rows = [...history].reverse().slice(0, 20)
  if (rows.length === 0) return <div className="chart-empty">暂无评测数据</div>
  const dims = DIM_ORDER.filter(d => rows.some(r => d in (r.scores ?? {})))

  return (
    <div className="heatmap-wrap">
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
        {rows.map((r, ri) => (
          <div key={r.id} className="hm-row">
            <div className="hm-row-label">
              {new Date(r.createdAt).toLocaleDateString('zh', { month: 'numeric', day: 'numeric' })}
            </div>
            {dims.map(d => {
              const score = r.scores?.[d]?.score ?? 0
              return (
                <div key={d} className="hm-cell" style={{ background: scoreColor(score) }}
                  title={`${DIM_LABELS[d]}: ${score.toFixed(1)}`}>
                  <span className="hm-val">{score.toFixed(0)}</span>
                </div>
              )
            })}
          </div>
        ))}
        {/* Avg row */}
        <div className="hm-row hm-avg-row">
          <div className="hm-row-label hm-avg-label">均值</div>
          {dims.map(d => {
            const vals = rows.map(r => r.scores?.[d]?.score ?? 0)
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length
            return (
              <div key={d} className="hm-cell hm-avg-cell" style={{ background: scoreColor(avg) }}>
                <span className="hm-val hm-avg-val">{avg.toFixed(1)}</span>
              </div>
            )
          })}
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

function BoxPlotChart({ history, width = 520, height = 160 }: {
  history: EvalResult[]; width?: number; height?: number
}) {
  if (history.length < 3) return <div className="chart-empty">至少需要 3 次评测数据</div>
  const pad = { l: 80, r: 16, t: 10, b: 24 }
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  const dims = DIM_ORDER.filter(d => history.some(r => d in (r.scores ?? {})))
  const rowH = H / dims.length

  const stats = dims.map(dim => {
    const vals = history.map(r => r.scores?.[dim]?.score ?? 0).sort((a, b) => a - b)
    const n = vals.length
    const q1 = vals[Math.floor(n * 0.25)]
    const median = vals[Math.floor(n * 0.5)]
    const q3 = vals[Math.floor(n * 0.75)]
    return { dim, min: vals[0], q1, median, q3, max: vals[n - 1], mean: vals.reduce((a, b) => a + b, 0) / n }
  })

  const xOf = (v: number) => pad.l + (v / 10) * W

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
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
      {stats.map(({ dim, min, q1, median, q3, max, mean }, i) => {
        const cy = pad.t + i * rowH + rowH / 2
        const bh = Math.max(rowH * 0.45, 6)
        const color = DIM_COLORS[dim]
        return (
          <g key={dim}>
            {/* Dim label */}
            <text x={pad.l - 6} y={cy} textAnchor="end" dominantBaseline="middle"
              fontSize="9" fill={color} fontWeight="600">
              {DIM_LABELS[dim]}
            </text>
            {/* Whiskers */}
            <line x1={xOf(min)} y1={cy} x2={xOf(q1)} y2={cy} stroke={color} strokeWidth="1.2" opacity="0.6" />
            <line x1={xOf(q3)} y1={cy} x2={xOf(max)} y2={cy} stroke={color} strokeWidth="1.2" opacity="0.6" />
            <line x1={xOf(min)} y1={cy - bh * 0.35} x2={xOf(min)} y2={cy + bh * 0.35} stroke={color} strokeWidth="1.2" />
            <line x1={xOf(max)} y1={cy - bh * 0.35} x2={xOf(max)} y2={cy + bh * 0.35} stroke={color} strokeWidth="1.2" />
            {/* IQR box */}
            <rect x={xOf(q1)} y={cy - bh / 2} width={Math.max(xOf(q3) - xOf(q1), 2)} height={bh}
              fill={color + '22'} stroke={color} strokeWidth="1.2" rx="2" />
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

// ── Bar Chart (per-dimension for a single eval result) ────────────────────────

function DimBarChart({ scores }: { scores: Record<string, EvalScore> }) {
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

// ── TestCase Tab ──────────────────────────────────────────────────────────────

const JUDGE_COLORS: Record<string, string> = { llm: '#6c63ff', grep: '#00d4aa', command: '#f59e0b' }
const JUDGE_LABELS: Record<string, string> = { llm: 'LLM Judge', grep: 'Grep', command: 'Command' }

function TestCaseTab({ skillId, apiKeySet, onRunEval }: {
  skillId: string
  apiKeySet: boolean | null
  onRunEval: (tcIds: string[]) => void
}) {
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
    } catch (e) { setGenError(String(e)) }
    finally { setGenerating(false) }
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
          <span className="card-title">🤖 AI 生成测试用例</span>
          <span className="gen-hint">覆盖 8 个评测维度</span>
        </div>
        <div className="gen-controls">
          <div className="count-row">
            {[3, 5, 10, 15].map((n) => (
              <button key={n} className={`count-chip ${genCount === n ? 'active' : ''}`}
                onClick={() => setGenCount(n)} disabled={generating}>{n}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleGenerate}
            disabled={generating || apiKeySet === false}>
            {generating ? '生成中...' : `生成 ${genCount} 个`}
          </button>
        </div>
        {genError && <div className="gen-error">⚠️ {genError}</div>}
        {genSuccess > 0 && !genError && <div className="gen-success">✅ 已生成 {genSuccess} 个用例</div>}
        {apiKeySet === false && <div className="gen-warn">⚠️ 未配置 API Key</div>}
      </div>

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

        {loading ? <div className="tc-empty">加载中...</div>
          : filtered.length === 0 ? <div className="tc-empty">{testCases.length === 0 ? '还没有测试用例' : '无匹配'}</div>
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
                      {confirmingDeleteId === tc.id ? '确认删除' : '删除'}
                    </button>
                  </div>
                  {expandedTcId === tc.id && (
                    <div className="tc-card-body">
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
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        {/* Add form */}
        {!addOpen
          ? <button className="btn btn-ghost btn-sm add-toggle" onClick={() => setAddOpen(true)}>+ 手动添加</button>
          : (
            <div className="add-form">
              <div className="add-form-header"><span>手动添加</span><button className="btn-icon-sm" onClick={() => setAddOpen(false)}>✕</button></div>
              <input placeholder="用例名称..." value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ width: '100%', marginBottom: 8 }} />
              <textarea rows={3} placeholder="输入（Input）..." value={form.input} onChange={(e) => setForm((f) => ({ ...f, input: e.target.value }))} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} />
              <div className="add-form-row">
                <select value={form.judgeType} onChange={(e) => setForm((f) => ({ ...f, judgeType: e.target.value as TestCase['judgeType'] }))}>
                  <option value="llm">LLM Judge</option>
                  <option value="grep">Grep</option>
                  <option value="command">Command</option>
                </select>
                <input placeholder="Judge param（可选）..." value={form.judgeParam} onChange={(e) => setForm((f) => ({ ...f, judgeParam: e.target.value }))} style={{ flex: 1 }} />
              </div>
              <div className="add-form-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(false)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={adding || !form.name.trim() || !form.input.trim()}>{adding ? '添加中...' : '添加'}</button>
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

// ── Main EvalPage ─────────────────────────────────────────────────────────────

export default function EvalPage({ initialSkillId, onNavigate }: { initialSkillId?: string; onNavigate?: (page: string, skillId?: string) => void } = {}) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState(initialSkillId ?? '')
  const [pageTab, setPageTab] = useState<'testcase' | 'eval' | 'chart'>('testcase')
  const [evalMode, setEvalMode] = useState<'single' | 'compare' | 'three'>('single')

  // Eval single state
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<EvalResult[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(0)
  const PAGE_SIZE = 20
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatus, setHistoryStatus] = useState<'all' | 'success' | 'error'>('all')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const exportRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    window.api.skills.getAll().then(setSkills)
    window.api.config.get().then((c) => setApiKeySet(c.providers.length > 0))
  }, [])

  const refreshHistory = useCallback((page = 0) => {
    if (!selectedSkill) return
    window.api.eval.history(selectedSkill, PAGE_SIZE, page * PAGE_SIZE).then((res) => {
      setHistory(res.items)
      setHistoryTotal(res.total)
      setHistoryPage(page)
    }).catch(() => {})
  }, [selectedSkill])

  useEffect(() => {
    if (!selectedSkill) { setTestCases([]); setSelectedTcIds(new Set()); setHistory([]); setHistoryTotal(0); return }
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
    if (!selectedSkill || ids.length === 0) return
    setSelectedTcIds(new Set(ids))
    setPageTab('eval')
    setEvalMode('single')
    setRunning(true); setProgress(0); setProgressMsg('')
    try {
      await window.api.eval.start(selectedSkill, ids)
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

  const [chartTab, setChartTab] = useState<'radar' | 'trend' | 'multidim' | 'heatmap' | 'boxplot'>('radar')

  const successHistory = history.filter((r) => r.status === 'success')
  const avgScores = avgDimScores(successHistory)
  const overallAvg = successHistory.length
    ? successHistory.reduce((s, r) => s + r.totalScore, 0) / successHistory.length
    : null

  const filteredHistory = history.filter((r) => {
    if (historyStatus !== 'all' && r.status !== historyStatus) return false
    if (historySearch) {
      const q = historySearch.toLowerCase()
      return r.inputPrompt?.toLowerCase().includes(q) || r.output?.toLowerCase().includes(q)
    }
    return true
  })

  const totalPages = Math.ceil(historyTotal / PAGE_SIZE)

  return (
    <div className="eval-root">
      {/* Hidden export anchor */}
      <a ref={exportRef} style={{ display: 'none' }} />

      {/* Header */}
      <div className="eval-page-header">
        <div>
          <h1>Eval</h1>
          <p className="subtitle">测试用例管理 · 多维度评测 · 可视化报告</p>
        </div>
        <div className="eval-controls">
          <select value={selectedSkill} onChange={(e) => { setSelectedSkill(e.target.value); setHistoryPage(0) }} className="skill-select">
            <option value="">选择 Skill...</option>
            {skills.map((s) => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
          </select>
          {selectedSkill && historyTotal > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={exporting}>
              {exporting ? '导出中...' : '⬇ 导出 JSON'}
            </button>
          )}
        </div>
      </div>

      {/* Page tabs: TestCase | Eval | Chart */}
      <div className="page-tabs">
        <button className={`page-tab ${pageTab === 'testcase' ? 'active' : ''}`} onClick={() => setPageTab('testcase')}>
          🧪 测试用例
        </button>
        <button className={`page-tab ${pageTab === 'eval' ? 'active' : ''}`} onClick={() => setPageTab('eval')}>
          ▶ 运行评测
        </button>
        <button className={`page-tab ${pageTab === 'chart' ? 'active' : ''}`} onClick={() => setPageTab('chart')}>
          📊 图谱 & 历史{historyTotal > 0 && <span className="tab-badge">{historyTotal}</span>}
        </button>
      </div>

      {/* ── TestCase Tab ── */}
      {pageTab === 'testcase' && selectedSkill && (
        <TestCaseTab skillId={selectedSkill} apiKeySet={apiKeySet} onRunEval={handleRunEval} />
      )}
      {pageTab === 'testcase' && !selectedSkill && (
        <div className="no-skill"><div className="no-skill-icon">🧪</div><p>选择一个 Skill 开始管理测试用例</p></div>
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

        {evalMode === 'compare' && <CompareMode skills={skills} apiKeySet={apiKeySet} />}
        {evalMode === 'three' && <ThreeConditionMode skills={skills} apiKeySet={apiKeySet} />}

        {evalMode === 'single' && (<>

          {/* Run controls */}
          {selectedSkill && (
            <div className="eval-card run-panel">
              <div className="card-row">
                <span className="card-title">运行评测</span>
                <button className="btn btn-primary"
                  onClick={() => handleRunEval()}
                  disabled={!selectedSkill || running || selectedTcIds.size === 0 || apiKeySet === false}>
                  {running ? `${progress}%` : `▶ 运行（${selectedTcIds.size} 个用例）`}
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
            </div>
          )}

          {/* Progress */}
          {running && (
            <div className="eval-card progress-card">
              <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
              <p className="progress-msg">{progressMsg || '评测中...'} {progress}%</p>
            </div>
          )}

          {!running && historyTotal > 0 && (
            <div className="run-done-banner">
              评测完成，<button className="link-btn" onClick={() => setPageTab('chart')}>查看图谱 & 历史 →</button>
            </div>
          )}

          {!selectedSkill && (
            <div className="no-skill"><div className="no-skill-icon">📊</div><p>选择一个 Skill 开始评测</p></div>
          )}

        </>)}
      </>)}

      {/* ── Chart & History Tab ── */}
      {pageTab === 'chart' && (<>
        {!selectedSkill && (
          <div className="no-skill"><div className="no-skill-icon">📊</div><p>选择一个 Skill 查看图谱与历史</p></div>
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
                  <RadarChart scores={avgScores} size={220} />
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
                  </div>
                </div>
              )}

              {chartTab === 'trend' && (
                <div>
                  <TrendLine history={successHistory.slice(-20)} width={520} height={120} />
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
                  <BoxPlotChart history={successHistory} width={560} height={Math.max(160, DIM_ORDER.length * 26 + 34)} />
                </div>
              )}
            </>)}
          </div>

          {/* History list */}
          <div className="eval-card">
            <div className="card-row">
              <span className="card-title">评测历史（共 {historyTotal} 条）</span>
              <div className="history-controls">
                <div className="tc-search-wrap">
                  <span className="search-icon">🔍</span>
                  <input className="tc-search" placeholder="搜索 input/output..." value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)} />
                  {historySearch && <button className="search-clear" onClick={() => setHistorySearch('')}>✕</button>}
                </div>
                <select className="status-filter" value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value as 'all' | 'success' | 'error')}>
                  <option value="all">全部</option>
                  <option value="success">成功</option>
                  <option value="error">失败</option>
                </select>
              </div>
            </div>

            {historyTotal === 0 && (
              <div className="tc-empty">还没有评测记录，<button className="link-btn" onClick={() => setPageTab('eval')}>去运行评测 →</button></div>
            )}

            <div className="history-list">
              {filteredHistory.map((r) => (
                <div key={r.id} className="result-row" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <div className="result-row-header">
                    <span className={`status-dot ${r.status}`} />
                    <span className="result-date">{new Date(r.createdAt).toLocaleString()}</span>
                    <div className="result-dim-bars">
                      {DIM_ORDER.filter((d) => d in r.scores).map((d) => (
                        <div key={d} className="inline-bar-wrap" title={`${DIM_LABELS[d] ?? d}: ${r.scores[d].score}/10`}>
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
                            {s.details && <p className="detail-text">{s.details}</p>}
                            {s.violations?.length > 0 && (
                              <ul className="violations">{s.violations.map((v, i) => <li key={i}>{v}</li>)}</ul>
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

            {totalPages > 1 && (
              <div className="pagination">
                <button className="btn btn-ghost btn-sm" disabled={historyPage === 0} onClick={() => refreshHistory(historyPage - 1)}>← 上一页</button>
                <span className="page-info">{historyPage + 1} / {totalPages}</span>
                <button className="btn btn-ghost btn-sm" disabled={historyPage >= totalPages - 1} onClick={() => refreshHistory(historyPage + 1)}>下一页 →</button>
              </div>
            )}
          </div>
        </>)}
      </>)}

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
        .run-done-banner { padding: 12px 16px; background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.25); border-radius: var(--radius); font-size: 13px; color: var(--text-muted); }
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
        .tc-list { display: flex; flex-direction: column; gap: 4px; max-height: 360px; overflow-y: auto; margin-bottom: 8px; }
        .tc-card { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
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

        /* Search */
        .tc-search-wrap { position: relative; display: flex; align-items: center; }
        .search-icon { position: absolute; left: 9px; font-size: 12px; pointer-events: none; }
        .tc-search { padding: 6px 28px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; width: 180px; }
        .tc-search:focus { outline: none; border-color: var(--accent); }
        .search-clear { position: absolute; right: 8px; background: none; color: var(--text-muted); font-size: 11px; padding: 2px 4px; }

        /* Add form */
        .add-toggle { margin-top: 4px; }
        .add-form { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; margin-top: 8px; }
        .add-form-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
        .btn-icon-sm { background: transparent; color: var(--text-muted); font-size: 11px; padding: 2px 5px; border-radius: 3px; }
        .btn-icon-sm:hover { color: var(--danger); }
        .add-form-row { display: flex; gap: 8px; margin-bottom: 10px; }
        .add-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

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
      `}</style>
    </div>
  )
}
