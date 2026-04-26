import { useState, useEffect, useCallback } from 'react'
import type { JobEntry, EvolutionEngine, EvalResult } from '../../../shared/types'
import { exportEvalReport, exportEvoReport } from '../utils/report-export'

interface TasksPageProps {
  onNavigate: (page: string, skillId?: string) => void
}

type Filter = 'all' | 'eval' | 'evo'
type EvalSubFilter = 'all' | 'single' | 'three-cond'

function evalSubtype(job: JobEntry): 'single' | 'three-cond' {
  return (job.skillId.startsWith('skill-noskill-') || job.skillId.startsWith('skill-gen-')) ? 'three-cond' : 'single'
}

// ── diff ──────────────────────────────────────────────────────────────────────
type DiffLine = { type: 'same' | 'add' | 'remove'; text: string }

function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n'); const bLines = b.split('\n')
  const m = aLines.length; const n = bLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = aLines[i-1] === bLines[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1])
  const result: DiffLine[] = []; let i = m; let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i-1] === bLines[j-1]) { result.unshift({ type: 'same', text: aLines[i-1] }); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { result.unshift({ type: 'add', text: bLines[j-1] }); j-- }
    else { result.unshift({ type: 'remove', text: aLines[i-1] }); i-- }
  }
  return result
}

function DiffView({ original, evolved }: { original: string; evolved: string }) {
  const lines = diffLines(original, evolved)
  return (
    <div className="diff-view">
      {lines.map((line, idx) => (
        <div key={idx} className={`diff-line diff-${line.type}`}>
          <span className="diff-gutter">{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}</span>
          <span className="diff-text">{line.text}</span>
        </div>
      ))}
    </div>
  )
}

// ── constants ─────────────────────────────────────────────────────────────────
const ENGINE_LABELS: Partial<Record<EvolutionEngine, string>> = {
  'evoskill': 'EvoSkill', 'coevoskill': 'CoEvoSkill', 'skillmoo': 'SkillMOO',
  'skillx': 'SkillX', 'skillclaw': 'SkillClaw',
  'skvm-evidence': 'SkVM证据', 'skvm-strategy': 'SkVM策略', 'skvm-capability': 'SkVM能力',
  'manual': '手动'
}

const ENGINE_ICONS: Partial<Record<EvolutionEngine, string>> = {
  'evoskill': '⚡', 'coevoskill': '🔬', 'skillmoo': '🎯',
  'skillx': '📚', 'skillclaw': '🦀', 'skvm-evidence': '🔍',
  'skvm-strategy': '🗂', 'skvm-capability': '🧠', 'manual': '✏️'
}

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

const DIM_ORDER = ['correctness','instruction_following','safety','completeness','robustness','executability','cost_awareness','maintainability']

function RadarChart({ scores, minScores, maxScores, size = 200 }: {
  scores: Record<string, number>
  minScores?: Record<string, number>
  maxScores?: Record<string, number>
  size?: number
}) {
  const dims = DIM_ORDER.filter((d) => d in scores)
  if (dims.length < 3) return null
  const pad = 36
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
      {gridLevels.map((lvl) => (
        <polygon key={lvl}
          points={dims.map((_, i) => pt(i, lvl).join(',')).join(' ')}
          fill="none" stroke="var(--border)" strokeWidth="0.8" />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(i, 10)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="0.8" />
      })}
      {showBand && (
        <>
          <polygon points={dims.map((d, i) => pt(i, maxScores![d] ?? 0).join(',')).join(' ')} fill="rgba(108,99,255,0.07)" stroke="none" />
          <polygon points={dims.map((d, i) => pt(i, minScores![d] ?? 0).join(',')).join(' ')} fill="var(--bg)" stroke="none" />
          <polygon points={dims.map((d, i) => pt(i, maxScores![d] ?? 0).join(',')).join(' ')} fill="none" stroke="rgba(108,99,255,0.25)" strokeWidth="0.8" strokeDasharray="3,2" />
          <polygon points={dims.map((d, i) => pt(i, minScores![d] ?? 0).join(',')).join(' ')} fill="none" stroke="rgba(108,99,255,0.18)" strokeWidth="0.8" strokeDasharray="3,2" />
        </>
      )}
      <polygon
        points={dims.map((d, i) => pt(i, scores[d] ?? 0).join(',')).join(' ')}
        fill="rgba(108,99,255,0.18)" stroke="#6c63ff" strokeWidth="1.5" />
      {dims.map((d, i) => {
        const [x, y] = pt(i, scores[d] ?? 0)
        return <circle key={d} cx={x} cy={y} r={3} fill={DIM_COLORS[d] ?? '#6c63ff'} />
      })}
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

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ── row components ────────────────────────────────────────────────────────────
interface RowProps {
  job: JobEntry
  selected: boolean
  active: boolean
  onSelect: (id: string) => void
  onClick: () => void
  onDelete: (job: JobEntry) => void
  onNavigate?: (page: string, skillId?: string) => void
}

function EvalRow({ job, selected, active, onSelect, onClick, onDelete, onNavigate }: RowProps) {
  const hasFailures = (job.failedCases ?? 0) > 0
  const allFailed = job.successCases === 0 && (job.failedCases ?? 0) > 0
  const isThreeCond = job.skillId.startsWith('skill-noskill-') || job.skillId.startsWith('skill-gen-')
  return (
    <tr className={`task-row ${selected ? 'task-row-selected' : ''} ${active ? 'task-row-active' : ''}`}>
      <td className="task-check-cell" onClick={e => { e.stopPropagation(); onSelect(job.id) }}>
        <input type="checkbox" checked={selected} onChange={() => onSelect(job.id)} onClick={e => e.stopPropagation()} />
      </td>
      <td className="task-icon-cell" onClick={onClick}><span className="task-icon">📊</span></td>
      <td className="task-type-cell" onClick={onClick}>
        <span className="task-type-label">Eval</span>
        {isThreeCond && <span className="task-badge task-badge-3cond">三条件</span>}
        {allFailed && <span className="task-badge task-badge-fail">失败</span>}
        {hasFailures && !allFailed && <span className="task-badge task-badge-warn">{job.failedCases}失败</span>}
      </td>
      <td className="task-skill-cell" onClick={onClick}>
        <span className="task-skill-name">{job.skillName}</span>
        {job.totalCases != null && (
          <span className="task-skill-sub">{job.totalCases} 个用例</span>
        )}
      </td>
      <td className="task-score-cell" onClick={onClick}>
        {job.avgJobScore != null
          ? <span className="task-score">{job.avgJobScore.toFixed(1)}</span>
          : <span className="task-score-na">—</span>
        }
        {job.totalCases != null && job.totalCases > 1 && (
          <span className="task-score-cases">
            <span className="task-score-ok">{job.successCases ?? 0}✓</span>
            {(job.failedCases ?? 0) > 0 && <span className="task-score-fail"> {job.failedCases}✗</span>}
          </span>
        )}
      </td>
      <td className="task-meta-cell" onClick={onClick}>
        <span className="task-time">{timeAgo(job.createdAt)}</span>
      </td>
      <td className="task-actions-cell">
        <div className="task-actions">
          {allFailed && onNavigate && (
            <button className="task-action-btn" title="重试" onClick={e => { e.stopPropagation(); onNavigate('eval', job.skillId) }}>↺</button>
          )}
          <button className="task-action-btn" title="导出报告" onClick={e => { e.stopPropagation(); exportEvalReport(job) }}>⬇</button>
          <button className="task-action-btn task-action-del" title="删除" onClick={e => { e.stopPropagation(); onDelete(job) }}>🗑</button>
        </div>
      </td>
    </tr>
  )
}

function EvoRow({ job, selected, active, onSelect, onClick, onDelete, onNavigate }: RowProps) {
  const engineLabel = job.engine ? (ENGINE_LABELS[job.engine] ?? job.engine) : '进化'
  const engineIcon = job.engine ? (ENGINE_ICONS[job.engine] ?? '🔬') : '🔬'
  const failed = job.status === 'error'
  return (
    <tr className={`task-row ${selected ? 'task-row-selected' : ''} ${active ? 'task-row-active' : ''}`}>
      <td className="task-check-cell" onClick={e => { e.stopPropagation(); onSelect(job.id) }}>
        <input type="checkbox" checked={selected} onChange={() => onSelect(job.id)} onClick={e => e.stopPropagation()} />
      </td>
      <td className="task-icon-cell" onClick={onClick}><span className="task-icon">{engineIcon}</span></td>
      <td className="task-type-cell" onClick={onClick}>
        <span className="task-type-label">{engineLabel}</span>
        {failed && <span className="task-badge task-badge-fail">失败</span>}
      </td>
      <td className="task-skill-cell" onClick={onClick}>
        {job.parentSkillName
          ? <><span className="task-skill-parent">{job.parentSkillName}</span><span className="task-arrow"> → </span><span className="task-skill-name">{job.skillName}</span></>
          : <span className="task-skill-name">{job.skillName}</span>
        }
      </td>
      <td className="task-score-cell" onClick={onClick}>
        {job.avgScore != null
          ? <span className="task-score">均分 {job.avgScore.toFixed(1)}</span>
          : job.evalCount != null && job.evalCount > 0
            ? <span className="task-score-na">{job.evalCount} 条记录</span>
            : <span className="task-score-na">未评测</span>
        }
      </td>
      <td className="task-meta-cell" onClick={onClick}>
        <span className="task-time">{timeAgo(job.createdAt)}</span>
      </td>
      <td className="task-actions-cell">
        <div className="task-actions">
          {failed && onNavigate && (
            <button className="task-action-btn" title="重试" onClick={e => { e.stopPropagation(); onNavigate('evo', job.parentSkillId ?? job.skillId) }}>↺</button>
          )}
          <button className="task-action-btn" title="导出报告" onClick={e => { e.stopPropagation(); exportEvoReport(job) }}>⬇</button>
          <button className="task-action-btn task-action-del" title="删除" onClick={e => { e.stopPropagation(); onDelete(job) }}>🗑</button>
        </div>
      </td>
    </tr>
  )
}

// ── eval case detail modal ────────────────────────────────────────────────────
function EvalCaseModal({ result, onClose }: { result: EvalResult; onClose: () => void }) {
  const dims = DIM_ORDER.filter(d => d in result.scores)
  const caseScores: Record<string, number> = {}
  dims.forEach(d => { caseScores[d] = result.scores[d]?.score ?? 0 })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{result.testCaseName ?? result.id.slice(-8)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {result.status === 'success' && (
              <span style={{ fontSize: 13, fontWeight: 700, color: result.totalScore >= 7 ? 'var(--success)' : result.totalScore >= 4 ? 'var(--warning)' : 'var(--danger)' }}>
                {result.totalScore.toFixed(1)} / 10
              </span>
            )}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {result.status === 'error' ? (
          <pre className="evo-expand-content" style={{ color: 'var(--danger)' }}>{result.output}</pre>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Radar + bars side by side */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <RadarChart scores={caseScores} size={220} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dims.map(d => {
                  const s = result.scores[d]
                  const color = DIM_COLORS[d] ?? '#888'
                  return (
                    <div key={d}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 110, fontSize: 12, fontWeight: 600, color, flexShrink: 0 }}>{DIM_LABELS[d] ?? d}</span>
                        <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(s.score / 10) * 100}%`, background: color, borderRadius: 3 }} />
                        </div>
                        <span style={{ width: 28, fontSize: 12, fontWeight: 700, color, textAlign: 'right' }}>{s.score.toFixed(1)}</span>
                      </div>
                      {(s.details || s.violations?.length > 0) && (
                        <div className="detail-score-extra" style={{ paddingLeft: 118, marginTop: 2 }}>
                          {s.details && <span className="detail-score-rationale">{s.details}</span>}
                          {s.violations?.length > 0 && (
                            <span className="detail-score-violations">扣分: {s.violations.join('; ')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Input / Output */}
            <div className="detail-section">
              <div className="detail-section-label">输入</div>
              <pre className="detail-code">{result.inputPrompt}</pre>
            </div>
            <div className="detail-section">
              <div className="detail-section-label">输出</div>
              <pre className="detail-code">{result.output}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── eval detail panel ─────────────────────────────────────────────────────────
function EvalDetailPanel({ job, onClose, onNavigate }: {
  job: JobEntry; onClose: () => void; onNavigate: (page: string, id?: string) => void
}) {
  const [results, setResults] = useState<EvalResult[]>([])
  const [loading, setLoading] = useState(true)
  const [modalResult, setModalResult] = useState<EvalResult | null>(null)

  useEffect(() => {
    setLoading(true)
    window.api.eval.getByJobId(job.id).then(r => { setResults(r); setLoading(false) }).catch(() => setLoading(false))
  }, [job.id])

  const successResults = results.filter(r => r.status === 'success')
  const avgScores: Record<string, number> = {}
  const minScores: Record<string, number> = {}
  const maxScores: Record<string, number> = {}
  if (successResults.length > 0) {
    for (const dim of DIM_ORDER) {
      const vals = successResults.map(r => r.scores[dim]?.score).filter(v => v != null) as number[]
      if (vals.length > 0) {
        avgScores[dim] = vals.reduce((a, b) => a + b, 0) / vals.length
        minScores[dim] = Math.min(...vals)
        maxScores[dim] = Math.max(...vals)
      }
    }
  }
  const showBand = successResults.length >= 5

  return (
    <>
    <div className="detail-panel">
      <div className="detail-panel-header">
        <div className="detail-panel-title">
          <span className="detail-panel-icon">📊</span>
          <span>{job.skillName}</span>
          <span className="detail-panel-sub">Eval 任务</span>
        </div>
        <div className="detail-panel-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); onNavigate('eval', job.skillId) }}>去评测</button>
          <button className="detail-panel-close" onClick={onClose}>✕</button>
        </div>
      </div>

      {loading ? (
        <div className="detail-panel-loading">加载中...</div>
      ) : results.length === 0 ? (
        <div className="detail-panel-loading">无记录</div>
      ) : (
        <div className="detail-panel-body">
          <div className="detail-meta-row">
            <span className="detail-badge detail-badge-ok">{successResults.length} 成功</span>
            {results.filter(r => r.status === 'error').length > 0 && (
              <span className="detail-badge detail-badge-fail">{results.filter(r => r.status === 'error').length} 失败</span>
            )}
            {job.avgJobScore != null && (
              <span className="detail-total-score">均分 {job.avgJobScore.toFixed(1)}</span>
            )}
            <span className="detail-time">{new Date(job.createdAt).toLocaleString()}</span>
          </div>

          {/* Radar chart + dimension bars */}
          {Object.keys(avgScores).length > 0 && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
              <RadarChart scores={avgScores} minScores={showBand ? minScores : undefined} maxScores={showBand ? maxScores : undefined} size={180} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {DIM_ORDER.filter(d => d in avgScores).map(d => {
                  const score = avgScores[d]
                  const color = DIM_COLORS[d] ?? '#888'
                  return (
                    <div key={d} className="detail-score-row">
                      <span className="detail-score-dim" style={{ color }}>{DIM_LABELS[d] ?? d}</span>
                      <div className="detail-score-bar-track">
                        <div className="detail-score-bar-fill" style={{ width: `${(score / 10) * 100}%`, background: color }} />
                      </div>
                      <span className="detail-score-val" style={{ color }}>{score.toFixed(1)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Per-case list — click to open modal */}
          <div className="detail-section">
            <div className="detail-section-label">用例明细（{results.length} 条）</div>
            <div className="job-cases-list">
              {results.map(r => (
                <div key={r.id} className="job-case-row" onClick={() => setModalResult(r)} style={{ cursor: 'pointer' }}>
                  <div className="job-case-header">
                    <span className={`status-dot ${r.status}`} />
                    <span className="job-case-name">{r.testCaseName ?? r.id.slice(-8)}</span>
                    <span className="job-case-score" style={{ color: r.totalScore >= 7 ? 'var(--success)' : r.totalScore >= 4 ? 'var(--warning)' : 'var(--danger)' }}>
                      {r.status === 'error' ? '错误' : r.totalScore.toFixed(1)}
                    </span>
                    <span className="job-case-chevron">▸</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>

    {modalResult && <EvalCaseModal result={modalResult} onClose={() => setModalResult(null)} />}
    </>
  )
}

// ── evo detail panel ──────────────────────────────────────────────────────────
function EvoDetailPanel({ job, onClose, onNavigate }: {
  job: JobEntry; onClose: () => void; onNavigate: (page: string, id?: string) => void
}) {
  const [content, setContent] = useState<string | null>(null)
  const [parentContent, setParentContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'diff' | 'content'>('diff')
  const [expanded, setExpanded] = useState(false)
  const [expandTab, setExpandTab] = useState<'diff' | 'content' | 'scores'>('scores')
  const [latestEval, setLatestEval] = useState<EvalResult | null>(null)
  const [parentEval, setParentEval] = useState<EvalResult | null>(null)

  useEffect(() => {
    setLoading(true)
    const loads: Promise<void>[] = [
      window.api.skills.getContent(job.skillId).then(setContent).catch(() => setContent(null)),
      window.api.eval.history(job.skillId, 1, 0)
        .then(p => setLatestEval(p.items[0] ?? null)).catch(() => setLatestEval(null))
    ]
    if (job.parentSkillId) {
      loads.push(window.api.skills.getContent(job.parentSkillId).then(setParentContent).catch(() => setParentContent(null)))
      loads.push(window.api.eval.history(job.parentSkillId, 1, 0)
        .then(p => setParentEval(p.items[0] ?? null)).catch(() => setParentEval(null)))
    }
    Promise.all(loads).finally(() => setLoading(false))
  }, [job.skillId, job.parentSkillId])

  const engineLabel = job.engine ? (ENGINE_LABELS[job.engine] ?? job.engine) : '进化'
  const engineIcon = job.engine ? (ENGINE_ICONS[job.engine] ?? '🔬') : '🔬'
  const dims = latestEval ? Object.keys(latestEval.scores) : []

  return (
    <>
    <div className={`detail-panel ${expanded ? 'detail-panel-hidden' : ''}`}>
      <div className="detail-panel-header">
        <div className="detail-panel-title">
          <span className="detail-panel-icon">{engineIcon}</span>
          <span>{job.skillName}</span>
          <span className="detail-panel-sub">{engineLabel} 详情</span>
        </div>
        <div className="detail-panel-actions">
          <button className="btn btn-ghost btn-sm" title="放大查看" onClick={() => setExpanded(true)}>⛶</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); onNavigate('evo', job.parentSkillId ?? job.skillId) }}>去进化</button>
          <button className="detail-panel-close" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="detail-panel-body">
        <div className="detail-meta-row">
          {job.parentSkillName && (
            <span className="detail-evo-chain">{job.parentSkillName} → <strong>{job.skillName}</strong></span>
          )}
          {job.avgScore != null && (
            <span className="detail-total-score">均分 {job.avgScore.toFixed(1)}</span>
          )}
          <span className="detail-time">{new Date(job.createdAt).toLocaleString()}</span>
        </div>

        {loading ? (
          <div className="detail-panel-loading">加载中...</div>
        ) : (
          <>
            <div className="detail-tabs">
              {parentContent && content && (
                <>
                  <button className={`detail-tab ${tab === 'diff' ? 'active' : ''}`} onClick={() => setTab('diff')}>Diff</button>
                  <button className={`detail-tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>内容</button>
                </>
              )}
            </div>

            {tab === 'diff' && parentContent && content ? (
              <div className="detail-section">
                <div className="detail-diff-labels">
                  <span className="detail-diff-label-a">{job.parentSkillName}</span>
                  <span className="detail-diff-label-b">{job.skillName}</span>
                </div>
                <DiffView original={parentContent} evolved={content} />
              </div>
            ) : (
              <div className="detail-section">
                <div className="detail-section-label">Skill 内容</div>
                <pre className="detail-code">{content ?? '（内容不可用）'}</pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {/* 全屏放大 Modal */}
    {expanded && !loading && (
      <div className="modal-overlay" onClick={() => setExpanded(false)}>
        <div className="modal-box modal-box-wide evo-expand-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{engineIcon}</span>
              <span className="modal-title">{job.parentSkillName ? `${job.parentSkillName} → ${job.skillName}` : job.skillName}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`detail-tab ${expandTab === 'scores' ? 'active' : ''}`} onClick={() => setExpandTab('scores')}>维度得分</button>
              {parentContent && content && (
                <>
                  <button className={`detail-tab ${expandTab === 'diff' ? 'active' : ''}`} onClick={() => setExpandTab('diff')}>Diff 对比</button>
                  <button className={`detail-tab ${expandTab === 'content' ? 'active' : ''}`} onClick={() => setExpandTab('content')}>完整内容</button>
                </>
              )}
              <button className="modal-close" onClick={() => setExpanded(false)}>✕</button>
            </div>
          </div>

          {/* 进化信息摘要行 */}
          <div className="evo-expand-meta">
            <div className="evo-expand-meta-item">
              <span className="evo-expand-meta-label">引擎</span>
              <span className="evo-expand-meta-val">{engineIcon} {engineLabel}</span>
            </div>
            {job.parentSkillName && (
              <div className="evo-expand-meta-item">
                <span className="evo-expand-meta-label">血缘</span>
                <span className="evo-expand-meta-val">{job.parentSkillName} → <strong>{job.skillName}</strong></span>
              </div>
            )}
            {(job.parentAvgScore != null || job.avgScore != null) && (
              <div className="evo-expand-meta-item">
                <span className="evo-expand-meta-label">均分变化</span>
                <div className="evo-score-cmp">
                  {job.parentAvgScore != null && (
                    <span className="evo-score-cmp-from">{job.parentAvgScore.toFixed(1)}</span>
                  )}
                  {job.parentAvgScore != null && job.avgScore != null && (
                    <span className="evo-score-cmp-arrow">→</span>
                  )}
                  {job.avgScore != null && (
                    <span className="evo-score-cmp-to" style={{ color: job.avgScore > (job.parentAvgScore ?? 0) ? 'var(--success)' : job.avgScore < (job.parentAvgScore ?? 0) ? 'var(--danger)' : 'var(--text)' }}>
                      {job.avgScore.toFixed(1)}
                    </span>
                  )}
                  {job.parentAvgScore != null && job.avgScore != null && (() => {
                    const delta = job.avgScore - job.parentAvgScore
                    return (
                      <span className={`evo-score-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neu'}`}>
                        {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}{Math.abs(delta).toFixed(1)}
                      </span>
                    )
                  })()}
                  {job.evalCount != null && job.evalCount > 0 && (
                    <span className="evo-score-cmp-count">{job.evalCount} evals</span>
                  )}
                </div>
              </div>
            )}
            <div className="evo-expand-meta-item">
              <span className="evo-expand-meta-label">时间</span>
              <span className="evo-expand-meta-val">{new Date(job.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {expandTab === 'scores' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              {dims.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 32 }}>进化版本暂无评测记录，请先运行 Eval</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 24, marginBottom: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                    {parentEval && <span><span style={{ display: 'inline-block', width: 10, height: 4, background: 'var(--border)', borderRadius: 2, marginRight: 4 }}/>父版本</span>}
                    <span><span style={{ display: 'inline-block', width: 10, height: 4, background: 'var(--accent)', borderRadius: 2, marginRight: 4 }}/>进化版本</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dims.map(d => {
                      const evolved = latestEval!.scores[d]
                      const parent = parentEval?.scores[d]
                      const delta = parent != null ? evolved.score - parent.score : null
                      const color = DIM_COLORS[d] ?? '#888'
                      return (
                        <div key={d}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 110, fontSize: 12, fontWeight: 600, color, flexShrink: 0 }}>{DIM_LABELS[d] ?? d}</span>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {parent != null && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${(parent.score / 10) * 100}%`, background: 'var(--border)', borderRadius: 3 }} />
                                  </div>
                                  <span style={{ width: 28, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{parent.score.toFixed(1)}</span>
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${(evolved.score / 10) * 100}%`, background: color, borderRadius: 3 }} />
                                </div>
                                <span style={{ width: 28, fontSize: 12, fontWeight: 700, color, textAlign: 'right' }}>{evolved.score.toFixed(1)}</span>
                                {delta != null && (
                                  <span className={`evo-score-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neu'}`}>
                                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {(evolved.details || evolved.violations?.length > 0) && (
                            <div className="detail-score-extra" style={{ paddingLeft: 120, marginTop: 3 }}>
                              {evolved.details && <span className="detail-score-rationale">{evolved.details}</span>}
                              {evolved.violations?.length > 0 && (
                                <span className="detail-score-violations">扣分: {evolved.violations.join('; ')}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {expandTab === 'diff' && parentContent && content && (
            <>
              <div className="diff-header-row">
                <span className="diff-label-a">{job.parentSkillName}</span>
                <span className="diff-label-b">{job.skillName}</span>
              </div>
              <DiffView original={parentContent} evolved={content} />
            </>
          )}

          {expandTab === 'content' && (
            <pre className="evo-expand-content">{content ?? '（内容不可用）'}</pre>
          )}
        </div>
      </div>
    )}
    </>
  )
}

// ── diff modal (compare 2 selected) ──────────────────────────────────────────
function DiffModal({ jobA, jobB, contentA, contentB, onClose }: {
  jobA: JobEntry; jobB: JobEntry; contentA: string; contentB: string; onClose: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">对比：{jobA.skillName} vs {jobB.skillName}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="diff-header-row">
          <span className="diff-label-a">{jobA.skillName}</span>
          <span className="diff-label-b">{jobB.skillName}</span>
        </div>
        <DiffView original={contentA} evolved={contentB} />
      </div>
    </div>
  )
}

// ── delete confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ job, onConfirm, onCancel }: { job: JobEntry; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box modal-box-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">确认删除</span>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text)' }}>
          删除 <strong>{job.skillName}</strong>？此操作不可撤销。
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>取消</button>
          <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff', border: 'none' }} onClick={onConfirm}>确认删除</button>
        </div>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function TasksPage({ onNavigate }: TasksPageProps) {
  const [jobs, setJobs] = useState<JobEntry[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [evalSubFilter, setEvalSubFilter] = useState<EvalSubFilter>('all')
  const [skillFilter, setSkillFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [diffModal, setDiffModal] = useState<{ jobA: JobEntry; jobB: JobEntry; contentA: string; contentB: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JobEntry | null>(null)

  const load = useCallback(async (f: Filter) => {
    setLoading(true); setSelected(new Set()); setActiveJobId(null)
    try { setJobs(await window.api.jobs.list(f)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  const skillNames = [...new Set(jobs.map(j => j.skillName))].sort()

  const filtered = jobs
    .filter(j => !skillFilter || j.skillName === skillFilter || j.parentSkillName === skillFilter)
    .filter(j => !search.trim() || j.skillName.toLowerCase().includes(search.toLowerCase()) ||
        j.parentSkillName?.toLowerCase().includes(search.toLowerCase()))
    .filter(j => {
      if (filter === 'eval') {
        if (evalSubFilter === 'single') return j.type === 'eval' && evalSubtype(j) === 'single'
        if (evalSubFilter === 'three-cond') return j.type === 'eval' && evalSubtype(j) === 'three-cond'
      }
      return true
    })

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapse = (key: string) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  // Group by canonical skill name (parent for evo, skill for eval)
  const grouped = filtered.reduce<{ key: string; label: string; jobs: JobEntry[] }[]>((acc, job) => {
    const key = job.parentSkillName ?? job.skillName
    const existing = acc.find(g => g.key === key)
    if (existing) existing.jobs.push(job)
    else acc.push({ key, label: key, jobs: [job] })
    return acc
  }, [])

  const handleClick = (job: JobEntry) => {
    setActiveJobId(prev => prev === job.id ? null : job.id)
  }

  const handleDelete = async (job: JobEntry) => {
    try {
      if (job.type === 'eval') {
        await window.api.eval.deleteByJobId(job.id)
      } else {
        await window.api.skills.uninstall(job.skillId)
      }
      setJobs(prev => prev.filter(j => j.id !== job.id))
      setSelected(prev => { const n = new Set(prev); n.delete(job.id); return n })
      if (activeJobId === job.id) setActiveJobId(null)
    } catch { /* ignore */ }
    setDeleteTarget(null)
  }

  const handleCompare = async () => {
    const ids = Array.from(selected)
    if (ids.length !== 2) return
    const [a, b] = ids.map(id => filtered.find(j => j.id === id)!)
    try {
      const [ca, cb] = await Promise.all([
        window.api.skills.getContent(a.skillId),
        window.api.skills.getContent(b.skillId)
      ])
      setDiffModal({ jobA: a, jobB: b, contentA: ca, contentB: cb })
    } catch { /* ignore */ }
  }

  // Stats
  const evalJobs = jobs.filter(j => j.type === 'eval')
  const evoJobs = jobs.filter(j => j.type === 'evo')
  const successEvals = evalJobs.filter(j => j.avgJobScore != null)
  const avgScore = successEvals.length > 0
    ? successEvals.reduce((s, j) => s + (j.avgJobScore ?? 0), 0) / successEvals.length
    : null

  const activeJob = activeJobId ? filtered.find(j => j.id === activeJobId) ?? null : null

  return (
    <div className="tasks-root">
      <style>{`
        .tasks-root { padding: 24px; height: 100%; overflow-y: auto; box-sizing: border-box; }
        .tasks-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .tasks-title { font-size: 24px; font-weight: 700; color: var(--text); display: block; }
        .tasks-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }

        /* Stats */
        .tasks-stats { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
        .tasks-stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 16px; min-width: 100px; }
        .tasks-stat-val { font-size: 20px; font-weight: 700; color: var(--text); }
        .tasks-stat-label { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .tasks-stat-accent { color: var(--accent); }

        .tasks-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .tasks-tabs { display: flex; gap: 4px; }
        .tasks-tab { padding: 5px 14px; font-size: 12px; font-weight: 500; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .tasks-tab.active { border-color: var(--accent); background: rgba(108,99,255,0.1); color: var(--accent); }
        .tasks-tab:hover:not(.active) { border-color: var(--text-muted); color: var(--text); }
        .tasks-subtabs { display: flex; gap: 3px; margin-left: 8px; padding-left: 8px; border-left: 1px solid var(--border); }
        .tasks-subtab { padding: 4px 10px; font-size: 11px; font-weight: 500; border-radius: 5px; border: 1px solid transparent; background: transparent; color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .tasks-subtab.active { border-color: var(--accent); background: rgba(108,99,255,0.08); color: var(--accent); }
        .tasks-subtab:hover:not(.active) { border-color: var(--border); color: var(--text); }
        .tasks-search { flex: 1; max-width: 260px; padding: 5px 10px; font-size: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); outline: none; }
        .tasks-search:focus { border-color: var(--accent); }
        .tasks-refresh { padding: 5px 12px; font-size: 12px; border-radius: 6px; }
        .tasks-compare-btn { padding: 5px 14px; font-size: 12px; border-radius: 6px; background: rgba(108,99,255,0.12); border: 1px solid var(--accent); color: var(--accent); cursor: pointer; font-weight: 600; transition: all var(--transition); }
        .tasks-compare-btn:hover { background: rgba(108,99,255,0.22); }

        /* Main layout with side panel */
        .tasks-main { display: flex; gap: 16px; align-items: flex-start; }
        .tasks-list-wrap { flex: 1; min-width: 0; }
        .tasks-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .tasks-table th { text-align: left; font-size: 11px; font-weight: 500; color: var(--text-muted); padding: 6px 8px; border-bottom: 1px solid var(--border); }
        .task-row { cursor: pointer; transition: background var(--transition); }
        .task-row:hover { background: rgba(108,99,255,0.05); }
        .task-row:hover .task-actions { opacity: 1; }
        .task-row-selected { background: rgba(108,99,255,0.08); }
        .task-row-active { background: rgba(108,99,255,0.12) !important; border-left: 2px solid var(--accent); }
        .task-row td { padding: 9px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
        .task-check-cell { width: 28px; cursor: default; }
        .task-check-cell input { cursor: pointer; accent-color: var(--accent); }
        .task-icon-cell { width: 32px; }
        .task-icon { font-size: 16px; }
        .task-type-cell { width: 110px; }
        .task-type-label { font-size: 12px; font-weight: 600; color: var(--text); }
        .task-badge { margin-left: 5px; font-size: 10px; padding: 1px 5px; border-radius: 4px; }
        .task-badge-fail { background: rgba(248,113,113,0.15); color: #f87171; }
        .task-badge-3cond { background: rgba(249,115,22,0.12); color: #f97316; }
        .task-badge-warn { background: rgba(245,158,11,0.15); color: #f59e0b; }
        .task-score-cases { display: flex; gap: 4px; font-size: 10px; margin-top: 2px; }
        .task-score-ok { color: var(--success); }
        .task-score-fail { color: var(--danger); }
        .job-cases-list { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
        .job-case-row { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
        .job-case-open { border-color: var(--accent); }
        .job-case-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; background: var(--bg); }
        .job-case-header:hover { background: var(--surface2); }
        .job-case-name { flex: 1; font-size: 12px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .job-case-score { font-size: 12px; font-weight: 700; flex-shrink: 0; }
        .job-case-chevron { font-size: 9px; color: var(--text-muted); flex-shrink: 0; }
        .job-case-detail { padding: 8px 10px; background: var(--surface); border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .status-dot.success { background: var(--success); }
        .status-dot.error { background: var(--danger); }
        .tasks-skill-filter { padding: 5px 10px; font-size: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); outline: none; cursor: pointer; max-width: 180px; }
        .tasks-skill-filter:focus { border-color: var(--accent); }
        .task-skill-cell { min-width: 160px; }
        .task-skill-name { color: var(--text); font-weight: 500; }
        .task-skill-parent { color: var(--text-muted); font-size: 12px; }
        .task-skill-sub { display: block; font-size: 11px; color: var(--text-muted); margin-top: 1px; }
        .detail-tc-badge { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
        .detail-tc-label { font-size: 10px; text-transform: uppercase; color: var(--text-muted); }
        .detail-tc-name { font-size: 12px; font-weight: 600; color: var(--accent); }
        .detail-score-extra { padding: 2px 0 4px; }
        .detail-score-rationale { display: block; font-size: 11px; color: var(--text-muted); font-style: italic; }
        .detail-score-violations { display: block; font-size: 11px; color: var(--warning); margin-top: 2px; }
        .task-arrow { color: var(--text-muted); font-size: 11px; }
        .task-score-cell { width: 100px; }
        .task-score { color: var(--accent); font-weight: 600; }
        .task-score-error { color: #f87171; font-size: 11px; }
        .task-score-na { color: var(--text-muted); font-size: 11px; }
        .task-meta-cell { width: 110px; display: flex; gap: 8px; align-items: center; padding-top: 10px; }
        .task-dur { font-size: 11px; color: var(--text-muted); }
        .task-time { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
        .task-actions-cell { width: 40px; }
        .task-actions { display: flex; gap: 4px; opacity: 0; transition: opacity var(--transition); }
        .task-action-btn { background: none; border: 1px solid var(--border); border-radius: 5px; padding: 2px 6px; font-size: 13px; cursor: pointer; color: var(--text-muted); transition: all var(--transition); }
        .task-action-btn:hover { border-color: var(--accent); color: var(--text); background: var(--surface2); }
        .task-action-del:hover { border-color: var(--danger); color: var(--danger); }
        .tasks-empty { text-align: center; color: var(--text-muted); font-size: 13px; padding: 48px 0; }
        .tasks-loading { text-align: center; color: var(--text-muted); font-size: 13px; padding: 48px 0; }
        .tasks-count { font-size: 11px; color: var(--text-muted); margin-left: 4px; }

        /* Group rows */
        .task-group-row { cursor: pointer; background: var(--surface2); }
        .task-group-row:hover { background: rgba(108,99,255,0.06); }
        .task-group-cell { padding: 7px 8px !important; border-bottom: 1px solid var(--border) !important; }
        .task-group-chevron { font-size: 9px; color: var(--text-muted); margin-right: 6px; user-select: none; }
        .task-group-name { font-size: 12px; font-weight: 600; color: var(--text); }
        .task-group-count { margin-left: 6px; font-size: 10px; color: var(--text-muted); background: var(--border); padding: 1px 6px; border-radius: 10px; }

        /* Detail Panel */
        .detail-panel { width: 360px; flex-shrink: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); display: flex; flex-direction: column; max-height: calc(100vh - 120px); position: sticky; top: 0; }
        .detail-panel-hidden { display: none; }
        .detail-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .detail-panel-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .detail-panel-icon { font-size: 16px; flex-shrink: 0; }
        .detail-panel-title span:nth-child(2) { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .detail-panel-sub { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
        .detail-panel-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .detail-panel-close { background: none; border: none; color: var(--text-muted); font-size: 15px; cursor: pointer; padding: 2px 5px; border-radius: 4px; }
        .detail-panel-close:hover { background: var(--surface2); color: var(--text); }
        .detail-panel-loading { padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px; }
        .detail-panel-body { overflow-y: auto; flex: 1; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }

        .detail-meta-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .detail-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
        .detail-badge-ok { background: rgba(16,185,129,0.15); color: #10b981; }
        .detail-badge-fail { background: rgba(248,113,113,0.15); color: #f87171; }
        .detail-total-score { font-size: 16px; font-weight: 700; color: var(--accent); }
        .detail-dur { font-size: 12px; color: var(--text-muted); }
        .detail-time { font-size: 11px; color: var(--text-muted); margin-left: auto; }
        .detail-evo-chain { font-size: 12px; color: var(--text-muted); }

        .detail-scores { display: flex; flex-direction: column; gap: 6px; background: var(--bg); border-radius: 6px; padding: 10px; }
        .detail-score-row { display: flex; align-items: center; gap: 8px; }
        .detail-score-dim { font-size: 11px; font-weight: 600; width: 72px; flex-shrink: 0; }
        .detail-score-bar-track { flex: 1; height: 5px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
        .detail-score-bar-fill { height: 100%; border-radius: 3px; }
        .detail-score-val { font-size: 12px; font-weight: 700; width: 28px; text-align: right; flex-shrink: 0; }
        .detail-score-violation { font-size: 11px; color: #f59e0b; cursor: default; }

        .detail-section { display: flex; flex-direction: column; gap: 4px; }
        .detail-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
        .detail-code { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--text); background: var(--bg); border-radius: 4px; padding: 8px; margin: 0; max-height: 180px; overflow-y: auto; }
        .detail-violation-row { display: flex; gap: 8px; font-size: 11px; }
        .detail-violation-dim { font-weight: 600; flex-shrink: 0; }
        .detail-violation-text { color: var(--text-muted); }

        .detail-tabs { display: flex; gap: 4px; margin-bottom: 4px; }
        .detail-tab { padding: 4px 12px; font-size: 12px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; }
        .detail-tab.active { border-color: var(--accent); background: rgba(108,99,255,0.1); color: var(--accent); }
        .detail-diff-labels { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
        .detail-diff-label-a { color: var(--text-muted); }
        .detail-diff-label-b { color: var(--accent); }

        /* Modal */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .modal-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: min(720px, 90vw); max-height: 80vh; display: flex; flex-direction: column; }
        .modal-box-wide { width: min(900px, 95vw); }
        .evo-expand-modal { height: min(80vh, 700px); }
        .evo-expand-content { flex: 1; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--text); padding: 16px 20px; margin: 0; }
        .modal-box-sm { width: min(400px, 90vw); }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .modal-title { font-size: 14px; font-weight: 600; color: var(--text); }
        .modal-close { background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
        .modal-close:hover { background: var(--surface2); color: var(--text); }
        .modal-footer { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
        .btn-sm { padding: 4px 12px; font-size: 12px; }

        /* Diff */
        .diff-header-row { display: grid; grid-template-columns: 1fr 1fr; padding: 6px 20px; background: var(--surface2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .diff-label-a { font-size: 11px; font-weight: 600; color: var(--text-muted); }
        .diff-label-b { font-size: 11px; font-weight: 600; color: var(--accent); }
        .diff-view { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.6; overflow-y: auto; flex: 1; padding: 8px 20px; }
        .diff-line { display: flex; gap: 8px; padding: 0 4px; }
        .diff-add { background: rgba(74,222,128,0.15); }
        .diff-remove { background: rgba(239,68,68,0.12); }
        .diff-gutter { width: 12px; flex-shrink: 0; color: var(--text-muted); user-select: none; }
        .diff-add .diff-gutter { color: var(--success); }
        .diff-remove .diff-gutter { color: var(--danger); }
        .diff-text { white-space: pre-wrap; word-break: break-all; flex: 1; }

        /* Eval expand modal */
        .eval-expand-modal { height: min(85vh, 760px); }
        .eval-expand-body { display: flex; flex: 1; overflow: hidden; gap: 0; }
        .eval-expand-scores { width: 260px; flex-shrink: 0; padding: 16px 18px; border-right: 1px solid var(--border); overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
        .eval-expand-io { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
        .eval-expand-pre { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--text); background: var(--bg); border-radius: 4px; padding: 10px; margin: 0; flex: 1; overflow-y: auto; min-height: 80px; }

        /* Evo expand meta bar */
        .evo-expand-meta { display: flex; align-items: center; gap: 20px; padding: 10px 20px; background: var(--surface2); border-bottom: 1px solid var(--border); flex-shrink: 0; flex-wrap: wrap; }
        .evo-expand-meta-item { display: flex; align-items: center; gap: 6px; }
        .evo-expand-meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
        .evo-expand-meta-val { font-size: 12px; color: var(--text); }

        /* Score comparison widget */
        .evo-score-cmp { display: flex; align-items: center; gap: 6px; }
        .evo-score-cmp-from { font-size: 13px; font-weight: 600; color: var(--text-muted); }
        .evo-score-cmp-arrow { font-size: 11px; color: var(--text-muted); }
        .evo-score-cmp-to { font-size: 14px; font-weight: 700; }
        .evo-score-cmp-count { font-size: 10px; color: var(--text-muted); margin-left: 2px; }
        .evo-score-delta { font-size: 12px; font-weight: 700; padding: 1px 5px; border-radius: 4px; }
        .evo-score-delta.pos { color: var(--success); background: rgba(16,185,129,0.12); }
        .evo-score-delta.neg { color: var(--danger); background: rgba(239,68,68,0.12); }
        .evo-score-delta.neu { color: var(--text-muted); background: var(--surface2); }
      `}</style>

      <div className="tasks-header">
        <div>
          <span className="tasks-title">Tasks</span>
          <p className="tasks-subtitle">评测与进化任务历史 · 版本对比 · 执行记录</p>
        </div>
      </div>

      {/* Stats */}
      {!loading && jobs.length > 0 && (
        <div className="tasks-stats">
          <div className="tasks-stat-card">
            <div className="tasks-stat-val">{jobs.length}</div>
            <div className="tasks-stat-label">总任务数</div>
          </div>
          <div className="tasks-stat-card">
            <div className="tasks-stat-val">{evalJobs.length}</div>
            <div className="tasks-stat-label">评测任务</div>
          </div>
          <div className="tasks-stat-card">
            <div className="tasks-stat-val">{evoJobs.length}</div>
            <div className="tasks-stat-label">进化任务</div>
          </div>
          {avgScore != null && (
            <div className="tasks-stat-card">
              <div className="tasks-stat-val tasks-stat-accent">{avgScore.toFixed(1)}</div>
              <div className="tasks-stat-label">平均得分</div>
            </div>
          )}
          {evalJobs.filter(j => (j.failedCases ?? 0) > 0).length > 0 && (
            <div className="tasks-stat-card">
              <div className="tasks-stat-val" style={{ color: '#f87171' }}>{evalJobs.filter(j => (j.failedCases ?? 0) > 0).length}</div>
              <div className="tasks-stat-label">含失败任务</div>
            </div>
          )}
        </div>
      )}

      <div className="tasks-toolbar">
        <div className="tasks-tabs">
          {(['all', 'eval', 'evo'] as Filter[]).map(f => (
            <button key={f} className={`tasks-tab ${filter === f ? 'active' : ''}`}
              onClick={() => { setFilter(f); setEvalSubFilter('all'); setSearch(''); setSkillFilter('') }}>
              {f === 'all' ? '全部' : f === 'eval' ? '评测' : '进化'}
              {!loading && <span className="tasks-count">({
                f === 'all' ? jobs.length :
                f === 'eval' ? jobs.filter(j => j.type === 'eval').length :
                jobs.filter(j => j.type === 'evo').length
              })</span>}
            </button>
          ))}
        </div>
        {filter === 'eval' && (
          <div className="tasks-subtabs">
            {(['all', 'single', 'three-cond'] as EvalSubFilter[]).map(sf => {
              const count = sf === 'all'
                ? jobs.filter(j => j.type === 'eval').length
                : jobs.filter(j => j.type === 'eval' && evalSubtype(j) === sf).length
              return (
                <button key={sf} className={`tasks-subtab ${evalSubFilter === sf ? 'active' : ''}`}
                  onClick={() => { setEvalSubFilter(sf); setSearch(''); setSkillFilter('') }}>
                  {sf === 'all' ? '全部' : sf === 'single' ? '单次' : '三条件'}
                  {!loading && <span className="tasks-count">({count})</span>}
                </button>
              )
            })}
          </div>
        )}
        {skillNames.length > 1 && (
          <select className="tasks-skill-filter" value={skillFilter}
            onChange={e => { setSkillFilter(e.target.value) }}>
            <option value="">全部 Skill</option>
            {skillNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <input className="tasks-search" placeholder="搜索 Skill..." value={search}
          onChange={e => setSearch(e.target.value)} />
        {selected.size === 2 && (
          <button className="tasks-compare-btn" onClick={handleCompare}>对比选中 (2)</button>
        )}
        <button className="btn btn-ghost tasks-refresh" onClick={() => load(filter)} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </button>
      </div>

      <div className="tasks-main">
        <div className="tasks-list-wrap">
          {loading ? (
            <div className="tasks-loading">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="tasks-empty">
              {search ? `未找到匹配"${search}"的任务` : <>暂无任务记录 · <button className="link-btn" onClick={() => onNavigate('eval')}>去运行评测 →</button></>}
            </div>
          ) : (
            <table className="tasks-table">
              <thead>
                <tr>
                  <th></th><th></th>
                  <th>类型 / 引擎</th>
                  <th>Skill</th>
                  <th>得分</th>
                  <th>时间</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(group => {
                  const isCollapsed = collapsed.has(group.key)
                  return [
                    <tr key={`group-${group.key}`} className="task-group-row" onClick={() => toggleCollapse(group.key)}>
                      <td colSpan={7} className="task-group-cell">
                        <span className="task-group-chevron">{isCollapsed ? '▶' : '▼'}</span>
                        <span className="task-group-name">{group.label}</span>
                        <span className="task-group-count">{group.jobs.length}</span>
                      </td>
                    </tr>,
                    ...(!isCollapsed ? group.jobs.map(job => {
                      const isSelected = selected.has(job.id)
                      const isActive = activeJobId === job.id
                      const props = {
                        job, selected: isSelected, active: isActive,
                        onSelect: toggleSelect,
                        onClick: () => handleClick(job),
                        onDelete: (j: JobEntry) => setDeleteTarget(j),
                        onNavigate
                      }
                      return job.type === 'eval'
                        ? <EvalRow key={job.id} {...props} />
                        : <EvoRow key={job.id} {...props} />
                    }) : [])
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail Panel */}
        {activeJob && (
          activeJob.type === 'eval'
            ? <EvalDetailPanel job={activeJob} onClose={() => setActiveJobId(null)} onNavigate={onNavigate} />
            : <EvoDetailPanel job={activeJob} onClose={() => setActiveJobId(null)} onNavigate={onNavigate} />
        )}
      </div>

      {diffModal && (
        <DiffModal
          jobA={diffModal.jobA} jobB={diffModal.jobB}
          contentA={diffModal.contentA} contentB={diffModal.contentB}
          onClose={() => setDiffModal(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          job={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
