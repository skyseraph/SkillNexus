import { useEffect, useState, useRef, useCallback } from 'react'
import type { MutableRefObject } from 'react'
import type { Skill, EvalResult, EvalHistoryPage, EvoRunResult, EvoSession, EvoPhase, EvoParadigm, EvoAnalysis, EvoConfig, EvoChainEntry, EvolutionEngine, ParetoPoint, EvoSkillResult, CoEvoResult, TransferReport, SkillXResult, SkillClawResult } from '../../../shared/types'
import { useTrack } from '../hooks/useTrack'

const MIN_MEANINGFUL_IMPROVEMENT = 0.3
const PER_DIM_REGRESSION_TOLERANCE = 1.0
const SIMILARITY_WARNING_THRESHOLD = 0.95

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

// ── LCS-based line diff ────────────────────────────────────────────────────────

type DiffLine = { type: 'same' | 'add' | 'remove'; text: string }

function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const m = aLines.length; const n = bLines.length

  // DP table for LCS lengths
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = aLines[i - 1] === bLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack
  const result: DiffLine[] = []
  let i = m; let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      result.unshift({ type: 'same', text: aLines[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', text: bLines[j - 1] })
      j--
    } else {
      result.unshift({ type: 'remove', text: aLines[i - 1] })
      i--
    }
  }
  return result
}

// ── DiffView component ─────────────────────────────────────────────────────────

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

// ── TestCaseDetail component ───────────────────────────────────────────────────

interface TCDetailProps {
  origHistory: EvalResult[]
  evolvedHistory: EvalResult[]
}

function TestCaseDetail({ origHistory, evolvedHistory }: TCDetailProps) {
  const [open, setOpen] = useState(false)

  // Match by input order (both lists were built from the same test cases)
  const rows = origHistory.map((orig, i) => {
    const evol = evolvedHistory[i]
    const origAvg = Object.values(orig.scores).reduce((s, v) => s + v.score, 0) / Math.max(Object.values(orig.scores).length, 1)
    const evolAvg = evol ? Object.values(evol.scores).reduce((s, v) => s + v.score, 0) / Math.max(Object.values(evol.scores).length, 1) : null
    const delta = evolAvg !== null ? evolAvg - origAvg : null
    const isRegress = delta !== null && delta < -PER_DIM_REGRESSION_TOLERANCE
    return { orig, evol, origAvg, evolAvg, delta, isRegress }
  })

  if (rows.length === 0) return null

  return (
    <div className="tc-detail">
      <button className="tc-toggle" onClick={() => setOpen(!open)}>
        <span>{open ? '▼' : '▶'}</span>
        测试用例明细（{rows.length} 条）
      </button>
      {open && (
        <div className="tc-table">
          <div className="tc-head">
            <span>输入摘要</span><span>原版</span><span>进化版</span><span>Delta</span>
          </div>
          {rows.map(({ orig, origAvg, evolAvg, delta, isRegress }, i) => (
            <div key={i} className={`tc-row ${isRegress ? 'tc-regress' : ''}`}>
              <span className="tc-input">{orig.inputPrompt.slice(0, 80)}{orig.inputPrompt.length > 80 ? '…' : ''}</span>
              <span className="tc-score">{origAvg.toFixed(1)}</span>
              <span className="tc-score">{evolAvg !== null ? evolAvg.toFixed(1) : '—'}</span>
              <span className={`tc-delta ${delta !== null && delta > 0 ? 'pos' : delta !== null && delta < 0 ? 'neg' : 'neu'}`}>
                {delta !== null ? (delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── EvoTree component ──────────────────────────────────────────────────────────

interface EvoTreeProps {
  chain: EvoChainEntry[]
  currentId: string
  onSelect: (id: string) => void
}

function EvoTree({ chain, currentId, onSelect }: EvoTreeProps) {
  if (chain.length < 2) return null
  return (
    <div className="evo-tree">
      <div className="evo-section-title">进化历史</div>
      {chain.map((entry, idx) => {
        const isCurrent = entry.id === currentId
        const prevEntry = chain[idx - 1]
        const delta = prevEntry?.avgScore !== undefined && entry.avgScore !== undefined
          ? entry.avgScore - prevEntry.avgScore
          : null
        return (
          <div key={entry.id} className={`tree-node ${isCurrent ? 'tree-current' : ''}`}
            style={{ paddingLeft: idx * 12 }}>
            <div className="tree-row" onClick={() => onSelect(entry.id)}>
              <span className="tree-dot">{isCurrent ? '◉' : '○'}</span>
              <span className="tree-name">{entry.name}</span>
              <span className="tree-ver">v{entry.version}</span>
              {delta !== null && (
                <span className={`tree-badge ${delta >= MIN_MEANINGFUL_IMPROVEMENT ? 'pos' : delta <= -MIN_MEANINGFUL_IMPROVEMENT ? 'neg' : 'neu'}`}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                </span>
              )}
            </div>
            {entry.paradigm && <div className="tree-tag">{entry.paradigm}</div>}
            {entry.isRoot && <div className="tree-root-label">根版本</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── ParetoScatter component ────────────────────────────────────────────────────

function ParetoScatter({ points }: { points: ParetoPoint[] }) {
  const [hovered, setHovered] = useState<string | null>(null)
  if (points.length === 0) return <div className="pareto-empty">暂无 Pareto 数据</div>
  const W = 280; const H = 200; const PAD = 32

  return (
    <div className="pareto-wrap">
      <div className="evo-section-title">Pareto 前沿</div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Axes */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD / 2} y2={H - PAD} stroke="var(--border)" strokeWidth={1} />
        <line x1={PAD} y1={PAD / 2} x2={PAD} y2={H - PAD} stroke="var(--border)" strokeWidth={1} />
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--text-muted)">Accuracy</text>
        <text x={8} y={H / 2} textAnchor="middle" fontSize={10} fill="var(--text-muted)" transform={`rotate(-90, 8, ${H / 2})`}>Cost Aware</text>
        {points.map((p) => {
          const cx = PAD + ((p.x / 10) * (W - PAD * 1.5))
          const cy = (H - PAD) - ((p.y / 10) * (H - PAD * 1.5))
          const isHov = hovered === p.id
          return (
            <g key={p.id} onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)}>
              <circle cx={cx} cy={cy} r={isHov ? 7 : 5} fill="#6c63ff" opacity={isHov ? 1 : 0.75} />
              {isHov && (
                <text x={cx + 9} y={cy + 4} fontSize={10} fill="var(--text-primary)">{p.label} ({p.x},{p.y})</text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── RadarChart component ───────────────────────────────────────────────────────

function RadarChart({ dims, before, after }: { dims: string[]; before: Record<string, number>; after: Record<string, number> }) {
  if (dims.length === 0) return null
  const SIZE = 220; const CX = SIZE / 2; const CY = SIZE / 2; const R = 82; const MAX = 10
  const n = dims.length
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2

  const toXY = (i: number, val: number) => {
    const r = (val / MAX) * R
    return { x: CX + r * Math.cos(angle(i)), y: CY + r * Math.sin(angle(i)) }
  }

  const gridLevels = [2, 4, 6, 8, 10]
  const polyPoints = (scores: Record<string, number>) =>
    dims.map((d, i) => { const p = toXY(i, scores[d] ?? 0); return `${p.x},${p.y}` }).join(' ')

  return (
    <div className="radar-wrap">
      <svg width={SIZE} height={SIZE} style={{ display: 'block', margin: '0 auto' }}>
        {/* Grid rings */}
        {gridLevels.map(lv => (
          <polygon key={lv}
            points={dims.map((_, i) => { const p = toXY(i, lv); return `${p.x},${p.y}` }).join(' ')}
            fill="none" stroke="var(--border)" strokeWidth={1} />
        ))}
        {/* Spokes */}
        {dims.map((_, i) => {
          const p = toXY(i, MAX)
          return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="var(--border)" strokeWidth={1} />
        })}
        {/* Before polygon */}
        <polygon points={polyPoints(before)} fill="rgba(136,136,136,0.15)" stroke="rgba(136,136,136,0.6)" strokeWidth={1.5} />
        {/* After polygon */}
        <polygon points={polyPoints(after)} fill="rgba(108,99,255,0.18)" stroke="#6c63ff" strokeWidth={2} />
        {/* Dimension labels */}
        {dims.map((d, i) => {
          const p = toXY(i, MAX + 1.5)
          const anchor = p.x < CX - 4 ? 'end' : p.x > CX + 4 ? 'start' : 'middle'
          return (
            <text key={d} x={p.x} y={p.y + 4} textAnchor={anchor} fontSize={9} fill="var(--text-muted)" style={{ textTransform: 'capitalize' }}>
              {d.replace(/_/g, ' ')}
            </text>
          )
        })}
      </svg>
      <div className="radar-legend">
        <span className="radar-leg-orig">■ 原版</span>
        <span className="radar-leg-evo">■ 进化版</span>
      </div>
    </div>
  )
}

// ── EvoSkillProgress component ─────────────────────────────────────────────────

function EvoSkillProgress({ iteration, total, result }: { iteration: number; total: number; result: EvoSkillResult | null }) {
  return (
    <div className="evo-card">
      <div className="card-title">EvoSkill 进化中... ({iteration}/{total})</div>
      <div className="progress-wrap"><div className="progress-bar" style={{ width: `${(iteration / total) * 100}%` }} /></div>
      {result && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <div>Frontier: {result.frontierIds.length} 个候选</div>
          <div>最高均分: <strong>{result.finalAvgScore.toFixed(2)}</strong></div>
        </div>
      )}
    </div>
  )
}

// ── CoEvoStatus component ──────────────────────────────────────────────────────

function CoEvoStatus({ result }: { result: CoEvoResult | null }) {
  const escalationLabel = (l: number) => ['—', '基础用例', '边界用例', '对抗用例'][l] ?? '—'
  return (
    <div className="evo-card">
      <div className="card-title">CoEvoSkill 协同进化</div>
      {result ? (
        <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>Escalation 等级: <strong>{escalationLabel(result.escalationLevel)}</strong></div>
          <div>已运行轮次: <strong>{result.rounds}</strong></div>
          <div>{result.passedAll ? '✅ 全部用例通过' : '⚠️ 部分用例未通过'}</div>
        </div>
      ) : (
        <div className="text-muted">协同进化中，请稍候... <span className="streaming-dot">●</span></div>
      )}
    </div>
  )
}

const PARADIGMS: { id: EvoParadigm; label: string; hint: string }[] = [
  { id: 'evidence',   label: '证据驱动',  hint: '基于评测历史，诊断根因，外科手术修改（需有 eval 历史）' },
  { id: 'strategy',   label: '策略矩阵',  hint: '指定改进目标组合，LLM 仲裁冲突（无需历史，适合新 Skill）' },
  { id: 'capability', label: '能力感知',  hint: '识别过高能力门槛，降级难以遵循的指令（适合复杂 Agent Skill）' }
]

const ENGINES: { id: EvolutionEngine; label: string; hint: string; prereq?: string }[] = [
  { id: 'skvm-evidence',   label: 'SkVM 证据',   hint: '基于评测历史诊断根因，外科手术式修改。适合有 eval 记录的 Skill。', prereq: '需要 eval 历史记录' },
  { id: 'skvm-strategy',   label: 'SkVM 策略',   hint: '指定改进目标组合，LLM 仲裁冲突。无需历史，适合新 Skill。' },
  { id: 'skvm-capability', label: 'SkVM 能力',   hint: '识别过高能力门槛，降级难以遵循的指令。适合复杂 Agent Skill。' },
  { id: 'evoskill',        label: 'EvoSkill',    hint: '维护前沿集合，多代迭代保留最优变体，自动淘汰低分版本。', prereq: '需要测试用例' },
  { id: 'skillmoo',        label: 'SkillMOO',    hint: '多目标 Pareto 前沿优化，同时优化准确率和 token 效率。', prereq: '需要 eval 历史记录' },
  { id: 'coevoskill',      label: 'CoEvoSkill',  hint: 'Generator + Verifier 双引擎协同，Test Escalation 三级递进。', prereq: '需要测试用例' },
  { id: 'skillx',          label: 'SkillX',      hint: '从高分样本提取三层知识条目（planning/functional/atomic），融合生成进化版。', prereq: '需要 ≥3 条高分 eval 记录' },
  { id: 'skillclaw',       label: 'SkillClaw',   hint: '聚合最近 N 条 eval 历史，识别共同失败模式，集体进化。', prereq: '需要 eval 历史记录' },
]

const ENGINE_GROUPS: { label: string; ids: EvolutionEngine[] }[] = [
  { label: 'SkVM 经典', ids: ['skvm-evidence', 'skvm-strategy', 'skvm-capability'] },
  { label: 'v2 算法',   ids: ['evoskill', 'skillmoo', 'coevoskill', 'skillx', 'skillclaw'] },
]

const STRATEGY_TARGETS = ['修复弱维度', '提升清晰度', '补充示例', '扩展边界', '精简冗余', '增强鲁棒性']

const DIM_COLORS: Record<string, string> = {
  correctness: '#6c63ff', clarity: '#00d4aa', completeness: '#f59e0b',
  safety: '#ef4444', instruction_following: '#3b82f6', robustness: '#8b5cf6',
  executability: '#10b981', cost_awareness: '#f97316', maintainability: '#ec4899'
}

function DimCompareRow({ dim, before, after }: { dim: string; before: number; after: number }) {
  const color = DIM_COLORS[dim] ?? '#888'
  const delta = after - before
  return (
    <div className="dim-row">
      <span className="dim-name">{dim}</span>
      <div className="dim-bars">
        <div className="bar-wrap"><div className="bar-fill" style={{ width: `${(before / 10) * 100}%`, background: `${color}55` }} /></div>
        <div className="bar-wrap"><div className="bar-fill" style={{ width: `${(after / 10) * 100}%`, background: color }} /></div>
      </div>
      <span className="dim-scores">
        <span className="score-before">{before.toFixed(1)}</span>
        <span className={`score-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neu'}`}>{delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}</span>
        <span className="score-after" style={{ color }}>{after.toFixed(1)}</span>
      </span>
    </div>
  )
}

function AnalysisPanel({ data }: { data: EvoAnalysis }) {
  return (
    <div className="analysis-panel">
      <div className="analysis-title">优化器诊断</div>
      <div className="analysis-field"><span className="analysis-label">ROOT CAUSE</span><span className="analysis-value">{data.rootCause || '—'}</span></div>
      <div className="analysis-field"><span className="analysis-label">GENERALITY TEST</span><span className="analysis-value">{data.generalityTest || '—'}</span></div>
      <div className="analysis-field"><span className="analysis-label">REGRESSION RISK</span><span className="analysis-value">{data.regressionRisk || '—'}</span></div>
    </div>
  )
}

function avgScores(history: EvalResult[] | EvalHistoryPage): Record<string, number> {
  const items: EvalResult[] = Array.isArray(history) ? history : history.items
  const totals: Record<string, { sum: number; count: number }> = {}
  for (const r of items) {
    for (const [dim, s] of Object.entries(r.scores)) {
      if (!totals[dim]) totals[dim] = { sum: 0, count: 0 }
      totals[dim].sum += s.score; totals[dim].count++
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([d, { sum, count }]) => [d, sum / count]))
}

function overallAvg(scores: Record<string, number>): number {
  const vals = Object.values(scores)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function makeDefaultSession(selectedId = ''): EvoSession {
  return { phase: 'idle', selectedId, paradigm: 'evidence', targets: [], analysisData: null, evolvedContent: '', evoResult: null, origScores: {}, evolvedScores: {}, evalProgress: 0, error: null }
}

// ── Main EvoPage ───────────────────────────────────────────────────────────────

interface EvoPageProps {
  session: MutableRefObject<EvoSession | null>
  initialSkillId?: string
  onNavigate?: (page: string, skillId?: string) => void
}

export default function EvoPage({ session, initialSkillId, onNavigate }: EvoPageProps) {
  const track = useTrack()
  const initial = session.current ?? makeDefaultSession(initialSkillId ?? '')

  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedId, setSelectedId] = useState(initial.selectedId || initialSkillId || '')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [origHistory, setOrigHistory] = useState<EvalResult[]>([])
  const [evolvedHistory, setEvolvedHistory] = useState<EvalResult[]>([])
  const [paradigm, setParadigm] = useState<EvoParadigm>(initial.paradigm)
  const [targets, setTargets] = useState<string[]>(initial.targets)
  const [phase, setPhase] = useState<EvoPhase>(initial.phase)
  const [analysisData, setAnalysisData] = useState<EvoAnalysis | null>(initial.analysisData)
  const [evolvedContent, setEvolvedContent] = useState(initial.evolvedContent)
  const [evoResult, setEvoResult] = useState<EvoRunResult | null>(initial.evoResult)
  const [origScores, setOrigScores] = useState<Record<string, number>>(initial.origScores)
  const [evolvedScores, setEvolvedScores] = useState<Record<string, number>>(initial.evolvedScores)
  const [evalProgress, setEvalProgress] = useState(initial.evalProgress)
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(initial.error)
  const [diffMode, setDiffMode] = useState(false)            // false = side-by-side, true = diff highlight
  const [evoChain, setEvoChain] = useState<EvoChainEntry[]>([])
  const [engine, setEngine] = useState<EvolutionEngine>('skvm-evidence')
  const [showAdvancedEngines, setShowAdvancedEngines] = useState(false)
  const [plugins, setPlugins] = useState<import('../../../shared/types').PluginManifest[]>([])

  useEffect(() => {
    window.api.evo.listPlugins().then(setPlugins).catch(() => setPlugins([]))
  }, [])
  const [evoSkillProgress, setEvoSkillProgress] = useState<{ iteration: number; total: number }>({ iteration: 0, total: 3 })
  const [evoSkillResult, setEvoSkillResult] = useState<EvoSkillResult | null>(null)
  const [coEvoResult, setCoEvoResult] = useState<CoEvoResult | null>(null)
  const [paretoPoints, setParetoPoints] = useState<ParetoPoint[]>([])
  const [skillXResult, setSkillXResult] = useState<SkillXResult | null>(null)
  const [skillClawResult, setSkillClawResult] = useState<SkillClawResult | null>(null)
  const [skillClawProgress, setSkillClawProgress] = useState<{ step: number; total: number; message: string }>({ step: 0, total: 4, message: '' })
  const [v2Running, setV2Running] = useState(false)
  const [v2Cancelled, setV2Cancelled] = useState(false)
  const v2AbortRef = useRef(false)
  const [v2ContentModal, setV2ContentModal] = useState<{ title: string; content: string; skillId?: string } | null>(null)
  // Engine params
  const [evoMaxIter, setEvoMaxIter] = useState(3)
  const [coEvoMaxRounds, setCoEvoMaxRounds] = useState(5)
  const [skillXMinScore, setSkillXMinScore] = useState(7.0)
  const [skillClawWindowSize, setSkillClawWindowSize] = useState(20)
  const [transferReport, setTransferReport] = useState<TransferReport | null>(null)
  const [transferRunning, setTransferRunning] = useState(false)
  const [transferModels, setTransferModels] = useState<string[]>([])
  const [availableProviders, setAvailableProviders] = useState<{ id: string; name: string }[]>([])
  const [demoMode, setDemoMode] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Sync state → session ref
  useEffect(() => {
    session.current = { phase, selectedId, paradigm, targets, analysisData, evolvedContent, evoResult, origScores, evolvedScores, evalProgress, error }
  }, [session, phase, selectedId, paradigm, targets, analysisData, evolvedContent, evoResult, origScores, evolvedScores, evalProgress, error])

  useEffect(() => {
    window.api.skills.getAll().then(setSkills)
    window.api.config.get().then((c) => {
      setApiKeySet(c.providers.length > 0)
      setAvailableProviders(c.providers.map(p => ({ id: p.id, name: p.name || p.id })))
    })
    window.api.demo.isActive().then(setDemoMode)
  }, [])

  const loadSkill = useCallback(async (id: string, keepPhase = false) => {
    if (!keepPhase) {
      setPhase('idle'); setEvolvedContent(''); setEvoResult(null)
      setOrigScores({}); setEvolvedScores({}); setAnalysisData(null); setError(null)
      setEvoChain([])
    }
    if (!id) { setSelectedSkill(null); setOrigHistory([]); return }
    const history = await window.api.eval.history(id)
    setOrigHistory(history.items)
    if (!keepPhase) setOrigScores(avgScores(history.items))
    // Load evolution chain for left-column tree
    const chain = await window.api.skills.getEvoChain(id)
    setEvoChain(chain)
  }, [])

  useEffect(() => {
    const skill = skills.find((s) => s.id === selectedId) ?? null
    setSelectedSkill(skill)
  }, [selectedId, skills])

  useEffect(() => {
    loadSkill(selectedId, phase !== 'idle')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loadSkill])

  // On mount: resume evaluating phase if interrupted
  useEffect(() => {
    if (initial.phase === 'evaluating' && initial.evoResult?.evolvedJobId) {
      pollScores(initial.evoResult)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pollScores = useCallback(async (result: EvoRunResult) => {
    if (!result.evolvedJobId) { setPhase('deciding'); return }
    const maxAttempts = 60; let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      const [origH, evolvedH] = await Promise.all([
        window.api.eval.history(selectedId),
        window.api.eval.history(result.evolvedSkill.id)
      ])
      const oScores = avgScores(origH.items)
      const eScores = avgScores(evolvedH.items)
      if (Object.keys(eScores).length > 0 || attempts >= maxAttempts) {
        clearInterval(interval); cleanupRef.current = null
        setOrigScores(oScores); setEvolvedScores(eScores)
        setOrigHistory(origH.items); setEvolvedHistory(evolvedH.items)
        setPhase('deciding')
      } else {
        setEvalProgress(Math.min(90, attempts * 3))
      }
    }, 2000)
    cleanupRef.current = () => clearInterval(interval)
  }, [selectedId])

  const handleEvolve = async () => {
    if (!selectedId) return
    setPhase('analyzing'); setEvolvedContent(''); setAnalysisData(null); setError(null)
    cleanupRef.current?.()

    const removeAnalysis = window.api.studio.onAnalysis((data: EvoAnalysis) => {
      setAnalysisData(data); setPhase('generating'); removeAnalysis()
    })

    const removeChunk = window.api.studio.onChunk(({ chunk, done }) => {
      if (!done) {
        setEvolvedContent((p) => p + chunk)
      } else {
        setPhase('reviewing'); removeChunk(); cleanupRef.current = null
      }
    })

    cleanupRef.current = () => { removeAnalysis(); removeChunk() }

    try {
      await window.api.studio.evolve(selectedId, { paradigm, targets: targets.length > 0 ? targets : undefined } as EvoConfig)
    } catch (e) {
      setError(String(e)); setPhase('idle'); cleanupRef.current?.(); cleanupRef.current = null
    }
  }

  const handleRunEval = async () => {
    if (!evolvedContent) return
    setPhase('evaluating'); setEvalProgress(0); setError(null)
    try {
      const result = await window.api.evo.installAndEval(selectedId, evolvedContent)
      setEvoResult(result)
      track('evo_ran', { engine: 'skvm', paradigm: paradigm })
      if (result.evolvedJobId) {
        cleanupRef.current?.()
        let origDone = !result.originalJobId; let evolDone = false
        const removeProgress = window.api.eval.onProgress((data) => {
          if (data.jobId === result.originalJobId && data.progress >= 100) origDone = true
          if (data.jobId === result.evolvedJobId && data.progress >= 100) evolDone = true
          setEvalProgress(origDone && evolDone ? 100 : data.progress)
          if (origDone && evolDone) { removeProgress(); cleanupRef.current = null; pollScores(result) }
        })
        cleanupRef.current = removeProgress
      } else {
        setPhase('deciding')
      }
    } catch (e) { setError(String(e)); setPhase('reviewing') }
  }

  const handleReset = () => { cleanupRef.current?.(); cleanupRef.current = null; loadSkill(selectedId) }

  const friendlyError = (e: unknown): string => {
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

  const handleCancelV2 = () => {
    v2AbortRef.current = true
    setV2Cancelled(true)
  }

  const handleV2Evolve = async () => {
    if (!selectedId || apiKeySet === false) return
    v2AbortRef.current = false; setV2Cancelled(false)
    setV2Running(true); setError(null)
    setEvoSkillResult(null); setCoEvoResult(null); setParetoPoints([])
    setSkillXResult(null); setSkillClawResult(null)

    try {
      if (engine === 'evoskill') {
        const removeProgress = window.api.studio.onProgress((data) => {
          if (v2AbortRef.current) return
          setEvoSkillProgress({ iteration: data.iteration, total: data.total })
        })
        const result = await window.api.evo.runEvoSkill({ skillId: selectedId, maxIterations: evoMaxIter })
        removeProgress()
        if (!v2AbortRef.current) {
          setEvoSkillResult(result)
          track('evo_evoskill_ran', { iterations: result.iterations })
          const pareto = await window.api.evo.getParetoFrontier(selectedId)
          setParetoPoints(pareto)
        }
      } else if (engine === 'skillmoo') {
        const pareto = await window.api.evo.getParetoFrontier(selectedId)
        if (!v2AbortRef.current) setParetoPoints(pareto)
      } else if (engine === 'coevoskill') {
        const result = await window.api.evo.runCoEvo({ skillId: selectedId, maxRounds: coEvoMaxRounds })
        if (!v2AbortRef.current) {
          setCoEvoResult(result)
          track('evo_coevo_ran', { iterations: result.rounds })
          if (result.evolvedContent) await window.api.evo.installAndEval(selectedId, result.evolvedContent)
        }
      } else if (engine === 'skillx') {
        const result = await window.api.evo.runSkillX({ skillId: selectedId, minScore: skillXMinScore })
        if (!v2AbortRef.current) { setSkillXResult(result); track('evo_skillx_ran') }
      } else if (engine === 'skillclaw') {
        const removeProgress = window.api.studio.onProgress((data) => {
          if (v2AbortRef.current) return
          setSkillClawProgress({ step: (data as unknown as { step: number }).step ?? 0, total: 4, message: (data as unknown as { message: string }).message ?? '' })
        })
        const result = await window.api.evo.runSkillClaw({ skillId: selectedId, windowSize: skillClawWindowSize })
        removeProgress()
        if (!v2AbortRef.current) { setSkillClawResult(result); track('evo_skillclaw_ran') }
      } else if (engine.startsWith('plugin:')) {
        const pluginId = engine.slice(7)
        const result = await window.api.evo.runPlugin({ skillId: selectedId, pluginId })
        if (!v2AbortRef.current && result?.evolvedContent) {
          await window.api.evo.installAndEval(selectedId, result.evolvedContent)
          track('evo_plugin_ran', { pluginId })
        }
      }
    } catch (e) {
      if (!v2AbortRef.current) setError(friendlyError(e))
    } finally {
      setV2Running(false)
    }
  }

  const handleRunTransferTest = async () => {
    if (!selectedId || transferModels.length === 0) return
    setTransferRunning(true); setTransferReport(null); setError(null)
    try {
      const report = await window.api.evo.runTransferTest(selectedId, transferModels)
      setTransferReport(report)
    } catch (e) {
      setError(String(e))
    } finally {
      setTransferRunning(false)
    }
  }

  useEffect(() => () => { cleanupRef.current?.() }, [])

  // Esc key returns to idle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'idle' && !v2Running) handleReset()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, v2Running])

  const origAvg = overallAvg(origScores)
  const evolvedAvg = overallAvg(evolvedScores)
  const totalDelta = evolvedAvg - origAvg
  const allDims = Array.from(new Set([...Object.keys(origScores), ...Object.keys(evolvedScores)]))
  const isStreaming = phase === 'analyzing' || phase === 'generating'
  const showContent = isStreaming || phase === 'reviewing' || phase === 'evaluating' || phase === 'deciding'

  return (
    <div className="evo-root">
      {demoMode && (
        <div className="demo-banner">
          🎬 Demo 模式已开启 — 无需 API Key，所有进化操作使用预置数据
          <button className="demo-banner-exit" onClick={async () => { await window.api.demo.exit(); setDemoMode(false) }}>退出 Demo</button>
        </div>
      )}
      <div className="evo-page-header">
        <div>
          <h1>Skill Evo</h1>
          <p className="evo-subtitle">证据驱动进化 · 多代迭代优化 · 量化验证对比</p>
        </div>
      </div>
      <div className="evo-layout">

        {/* ── Left column ─────────────────────────────── */}
        <div className="evo-left">
          <div className="evo-section-title">Skill</div>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
            disabled={phase !== 'idle' && phase !== 'configured'} className="evo-select">
            <option value="">选择 Skill...</option>
            {skills.map((s) => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
          </select>
          {skills.length === 0 && onNavigate && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => onNavigate('studio')}>✦ 去 Studio 创建 Skill</button>
          )}

          {selectedId && origHistory.length > 0 && (
            <div className="orig-scores">
              <span className="orig-scores-label">当前评测均分</span>
              {Object.entries(origScores).sort(([,a],[,b]) => a - b).map(([dim, score]) => (
                <div key={dim} className="mini-bar-row">
                  <span className="mini-dim">{dim}</span>
                  <div className="mini-track"><div className="mini-fill" style={{ width: `${(score/10)*100}%`, background: DIM_COLORS[dim] ?? '#888' }} /></div>
                  <span className="mini-val">{score.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
          {selectedId && origHistory.length === 0 && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
              暂无评测记录
              {onNavigate && <> · <button className="link-btn" style={{ fontSize: 12 }} onClick={() => onNavigate('eval', selectedId)}>去评测 →</button></>}
            </p>
          )}

          <EvoTree chain={evoChain} currentId={selectedId}
            onSelect={(id) => { if (phase === 'idle') setSelectedId(id) }} />
        </div>

        {/* ── Right column ────────────────────────────── */}
        <div className="evo-right">

          {/* Back button — shown whenever not idle */}
          {(phase !== 'idle' || v2Running) && (
            <button className="evo-back-btn" onClick={handleReset} disabled={v2Running}>
              ← 返回配置
            </button>
          )}

          {/* ① Config panel */}
          {(phase === 'idle' || phase === 'configured') && (
            <div className="evo-card">
              <div className="card-title">① 进化引擎</div>
              {/* Default: SkVM engines */}
              <div className="engine-group">
                <div className="engine-group-label">SkVM 经典</div>
                <div className="engine-chip-row">
                  {ENGINE_GROUPS[0].ids.map(id => {
                    const e = ENGINES.find(x => x.id === id)!
                    return (
                      <label key={id} className={`engine-chip ${engine === id ? 'active' : ''}`} title={e.prereq ?? ''}>
                        <input type="radio" name="engine" value={id} checked={engine === id} onChange={() => setEngine(id)} />
                        {e.label}
                        {e.prereq && <span className="engine-chip-dot" title={e.prereq}>·</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
              {/* Advanced engines — collapsed by default */}
              <button
                className="engine-advanced-toggle"
                onClick={() => setShowAdvancedEngines(v => !v)}
              >
                {showAdvancedEngines ? '▾' : '▸'} 高级引擎
                {!showAdvancedEngines && <span className="engine-advanced-hint">v2 算法 · 本地插件</span>}
              </button>
              {showAdvancedEngines && (
                <>
                  <div className="engine-group">
                    <div className="engine-group-label">v2 算法</div>
                    <div className="engine-chip-row">
                      {ENGINE_GROUPS[1].ids.map(id => {
                        const e = ENGINES.find(x => x.id === id)!
                        return (
                          <label key={id} className={`engine-chip ${engine === id ? 'active' : ''}`} title={e.prereq ?? ''}>
                            <input type="radio" name="engine" value={id} checked={engine === id} onChange={() => setEngine(id)} />
                            {e.label}
                            {e.prereq && <span className="engine-chip-dot" title={e.prereq}>·</span>}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  {plugins.length > 0 && (
                    <div className="engine-group">
                      <div className="engine-group-label">本地插件</div>
                      <div className="engine-chip-row">
                        {plugins.map(p => {
                          const pluginEngineId = `plugin:${p.id}` as EvolutionEngine
                          return (
                            <label key={p.id} className={`engine-chip ${engine === pluginEngineId ? 'active' : ''}`} title={p.description}>
                              <input type="radio" name="engine" value={pluginEngineId} checked={engine === pluginEngineId} onChange={() => setEngine(pluginEngineId)} />
                              {p.name}
                              <span className="engine-chip-dot" title="本地插件">·</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
              {/* Selected engine description */}
              {(() => {
                const sel = ENGINES.find(e => e.id === engine)
                if (sel) return (
                  <div className="engine-desc">
                    <span className="engine-desc-name">{sel.label}</span>
                    <span className="engine-desc-hint">{sel.hint}</span>
                    {sel.prereq && <span className="engine-desc-prereq">前提：{sel.prereq}</span>}
                  </div>
                )
                if (engine.startsWith('plugin:')) {
                  const pluginId = engine.slice(7)
                  const plug = plugins.find(p => p.id === pluginId)
                  if (plug) return (
                    <div className="engine-desc">
                      <span className="engine-desc-name">{plug.name} <span style={{fontSize:10,opacity:.6}}>本地插件 v{plug.version}</span></span>
                      {plug.description && <span className="engine-desc-hint">{plug.description}</span>}
                    </div>
                  )
                }
                return null
              })()}

              {/* SkVM paradigm sub-options */}
              {(engine === 'skvm-evidence' || engine === 'skvm-strategy' || engine === 'skvm-capability') && (
                <>
                  <div className="card-title" style={{ marginTop: 16 }}>② 进化配置</div>
                  <div className="paradigm-row">
                    {PARADIGMS.map((p) => (
                      <label key={p.id} className={`paradigm-card ${paradigm === p.id ? 'active' : ''}`}>
                        <input type="radio" name="paradigm" value={p.id} checked={paradigm === p.id} onChange={() => setParadigm(p.id)} />
                        <span className="paradigm-label">{p.label}</span>
                        <span className="paradigm-hint">{p.hint}</span>
                      </label>
                    ))}
                  </div>
                  {paradigm === 'strategy' && (
                    <div className="targets-section">
                      <div className="targets-header">
                        <span className="targets-title">改进目标</span>
                        <button className="btn btn-ghost btn-xs" onClick={() => setTargets(STRATEGY_TARGETS)}>全选</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setTargets([])}>清空</button>
                      </div>
                      <div className="targets-grid">
                        {STRATEGY_TARGETS.map((t) => (
                          <label key={t} className={`target-chip ${targets.includes(t) ? 'active' : ''}`}>
                            <input type="checkbox" checked={targets.includes(t)} onChange={(e) => setTargets(e.target.checked ? [...targets, t] : targets.filter((x) => x !== t))} />
                            {t}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleEvolve} disabled={!selectedId || apiKeySet === false}>
                    启动进化 (SkVM)
                  </button>
                  {apiKeySet === false && <div className="gen-warn" style={{ marginTop: 8 }}>⚠️ 未配置 API Key，请先前往 <button className="link-btn" onClick={() => onNavigate?.('settings')}>设置</button> 添加。</div>}
                </>
              )}

              {/* v2 engines */}
              {(engine === 'evoskill' || engine === 'skillmoo' || engine === 'coevoskill' || engine === 'skillx' || engine === 'skillclaw') && (
                <>
                  {/* Per-engine parameter config */}
                  {engine === 'evoskill' && (
                    <div className="engine-params">
                      <label className="engine-param-row">
                        <span className="engine-param-label">最大迭代轮次</span>
                        <input type="range" min={1} max={10} value={evoMaxIter}
                          onChange={e => setEvoMaxIter(Number(e.target.value))} />
                        <span className="engine-param-val">{evoMaxIter}</span>
                      </label>
                    </div>
                  )}
                  {engine === 'coevoskill' && (
                    <div className="engine-params">
                      <label className="engine-param-row">
                        <span className="engine-param-label">最大轮次</span>
                        <input type="range" min={3} max={10} value={coEvoMaxRounds}
                          onChange={e => setCoEvoMaxRounds(Number(e.target.value))} />
                        <span className="engine-param-val">{coEvoMaxRounds}</span>
                      </label>
                    </div>
                  )}
                  {engine === 'skillx' && (
                    <div className="engine-params">
                      <label className="engine-param-row">
                        <span className="engine-param-label">最低分门槛</span>
                        <input type="range" min={5} max={9} step={0.5} value={skillXMinScore}
                          onChange={e => setSkillXMinScore(Number(e.target.value))} />
                        <span className="engine-param-val">{skillXMinScore.toFixed(1)}</span>
                      </label>
                    </div>
                  )}
                  {engine === 'skillclaw' && (
                    <div className="engine-params">
                      <label className="engine-param-row">
                        <span className="engine-param-label">分析窗口（条）</span>
                        <input type="range" min={10} max={50} step={5} value={skillClawWindowSize}
                          onChange={e => setSkillClawWindowSize(Number(e.target.value))} />
                        <span className="engine-param-val">{skillClawWindowSize}</span>
                      </label>
                    </div>
                  )}
                  <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleV2Evolve}
                    disabled={!selectedId || apiKeySet === false || v2Running}>
                    {v2Running ? '进化中...' : `启动 ${ENGINES.find(e => e.id === engine)?.label ?? (engine.startsWith('plugin:') ? plugins.find(p => p.id === engine.slice(7))?.name ?? engine : engine)}`}
                  </button>
                  {apiKeySet === false && !v2Running && <div className="gen-warn" style={{ marginTop: 8 }}>⚠️ 未配置 API Key，请先前往 <button className="link-btn" onClick={() => onNavigate?.('settings')}>设置</button> 添加。</div>}
                  {v2Running && !v2Cancelled && (
                    <button className="btn btn-ghost btn-sm" onClick={handleCancelV2} style={{ marginLeft: 6 }}>取消</button>
                  )}
                  {v2Cancelled && v2Running && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>正在停止...</span>
                  )}
                </>
              )}

              {!demoMode && (
                <div className="demo-entry">
                  没有 API Key？
                  <button className="demo-entry-btn" onClick={async () => { await window.api.demo.enter(); setDemoMode(true) }}>
                    体验 Demo 模式
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ② Analysis panel */}
          {(phase === 'analyzing' || phase === 'generating' || phase === 'reviewing' || phase === 'deciding') && analysisData && (
            <AnalysisPanel data={analysisData} />
          )}
          {phase === 'analyzing' && !analysisData && (
            <div className="analysis-panel loading">
              <div className="analysis-title">优化器诊断 <span className="streaming-dot">●</span></div>
              <div className="analysis-field"><span className="analysis-label">ROOT CAUSE</span><span className="analysis-value dim">分析中...</span></div>
              <div className="analysis-field"><span className="analysis-label">GENERALITY TEST</span><span className="analysis-value dim">—</span></div>
              <div className="analysis-field"><span className="analysis-label">REGRESSION RISK</span><span className="analysis-value dim">—</span></div>
            </div>
          )}

          {/* EvoSkill progress */}
          {v2Running && engine === 'evoskill' && (
            <EvoSkillProgress iteration={evoSkillProgress.iteration} total={evoSkillProgress.total} result={null} />
          )}
          {!v2Running && evoSkillResult && (
            <div className="evo-card">
              <div className="card-title">EvoSkill 完成</div>
              <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>完成 {evoSkillResult.iterations} 轮迭代</div>
                <div>最高均分: <strong style={{ color: 'var(--accent)' }}>{evoSkillResult.finalAvgScore.toFixed(2)}</strong></div>
              </div>
              {evoSkillResult.frontierIds.length > 0 && (
                <div className="frontier-list">
                  <div className="frontier-list-title">Frontier 候选版本（{evoSkillResult.frontierIds.length}）</div>
                  {evoSkillResult.frontierIds.map(fid => {
                    const sk = skills.find(s => s.id === fid)
                    const isBest = fid === evoSkillResult.bestId
                    return (
                      <div key={fid} className={`frontier-row ${isBest ? 'frontier-best' : ''}`}>
                        <span className="frontier-name">{sk?.name ?? fid.slice(-8)}</span>
                        {sk?.version != null && <span className="frontier-ver">v{sk.version}</span>}
                        {isBest && <span className="frontier-badge">最优</span>}
                        <div className="frontier-actions">
                          <button className="task-action-btn" title="查看内容" onClick={async () => {
                            try {
                              const c = await window.api.skills.getContent(fid)
                              setV2ContentModal({ title: sk?.name ?? fid.slice(-8), content: c, skillId: fid })
                            } catch { /* ignore */ }
                          }}>👁</button>
                          <button className="task-action-btn" title="去评测" onClick={() => onNavigate?.('eval', fid)}>📊</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="v2-result-actions">
                <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('eval', evoSkillResult.bestId)}>去评测最优版本</button>
              </div>
            </div>
          )}

          {/* CoEvo status */}
          {(v2Running && engine === 'coevoskill') && <CoEvoStatus result={null} />}
          {(!v2Running && coEvoResult) && <CoEvoStatus result={coEvoResult} />}
          {!v2Running && coEvoResult?.evolvedContent && (
            <div className="v2-result-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setV2ContentModal({ title: 'CoEvoSkill 进化版内容', content: coEvoResult.evolvedContent })}>查看内容</button>
            </div>
          )}

          {/* Pareto frontier */}
          {paretoPoints.length > 0 && <ParetoScatter points={paretoPoints} />}
          {v2Running && engine === 'skillmoo' && (
            <div className="evo-card"><div className="card-title">SkillMOO — 计算 Pareto 前沿...</div><div className="text-muted"><span className="streaming-dot">●</span></div></div>
          )}

          {/* Transfer test panel */}
          {/* SkillX result */}
          {v2Running && engine === 'skillx' && (
            <div className="evo-card"><div className="card-title">SkillX — 提取知识库...</div><div className="text-muted"><span className="streaming-dot">●</span> 分析高分样本中</div></div>
          )}
          {!v2Running && skillXResult && (
            <div className="evo-card">
              <div className="card-title">SkillX 知识库（{skillXResult.totalSourceSamples} 条样本）</div>
              <div className="skillx-entries">
                {skillXResult.entries.map((entry, i) => (
                  <div key={i} className="skillx-entry">
                    <span className={`skillx-badge skillx-l${entry.level}`}>L{entry.level} {entry.levelName}</span>
                    <span className="skillx-content">{entry.content}</span>
                    <span className="skillx-src">{entry.sourceCount} 样本支撑</span>
                  </div>
                ))}
                {skillXResult.entries.length === 0 && <p className="text-muted" style={{ fontSize: 12 }}>未提取到知识条目</p>}
              </div>
              {skillXResult.evolvedSkillId && (
                <>
                  <div className="skillx-result-note">进化版 Skill 已安装（ID: {skillXResult.evolvedSkillId.slice(-8)}）</div>
                  <div className="v2-result-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setV2ContentModal({ title: 'SkillX 进化版内容', content: skillXResult.evolvedContent, skillId: skillXResult.evolvedSkillId })}>查看内容</button>
                    <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('eval', skillXResult.evolvedSkillId)}>去评测</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* SkillClaw result */}
          {v2Running && engine === 'skillclaw' && (
            <div className="evo-card">
              <div className="card-title">SkillClaw — 聚合分析...</div>
              <div className="skillclaw-progress">
                {[1, 2, 3, 4].map(s => (
                  <div key={s} className={`skillclaw-step ${skillClawProgress.step >= s ? 'done' : skillClawProgress.step === s - 1 ? 'active' : ''}`}>
                    {s === 1 ? '加载历史' : s === 2 ? '识别模式' : s === 3 ? '生成改进' : '安装'}
                  </div>
                ))}
              </div>
              {skillClawProgress.message && <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>{skillClawProgress.message}</div>}
            </div>
          )}
          {!v2Running && skillClawResult && (
            <div className="evo-card">
              <div className="card-title">SkillClaw 完成（{skillClawResult.sessionsAnalyzed} 条记录）</div>
              {skillClawResult.commonFailures.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 12 }}>{skillClawResult.improvementSummary}</p>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>共同失败模式</div>
                  <ul className="skillclaw-failures">
                    {skillClawResult.commonFailures.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                  {skillClawResult.improvementSummary && (
                    <div className="skillclaw-summary">{skillClawResult.improvementSummary}</div>
                  )}
                  {skillClawResult.evolvedSkillId && (
                    <>
                      <div className="skillx-result-note">进化版 Skill 已安装（ID: {skillClawResult.evolvedSkillId.slice(-8)}）</div>
                      <div className="v2-result-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setV2ContentModal({ title: 'SkillClaw 进化版内容', content: skillClawResult.evolvedContent, skillId: skillClawResult.evolvedSkillId })}>查看内容</button>
                        <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('eval', skillClawResult.evolvedSkillId)}>去评测</button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {selectedId && (
            <div className="evo-card transfer-card">
              <div className="card-title">跨 LLM 迁移率测试</div>
              {availableProviders.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 12 }}>请先<button className="link-btn" style={{ fontSize: 12 }} onClick={() => onNavigate?.('settings')}>在设置中配置 LLM Provider</button></p>
              ) : (
                <>
                  <div className="transfer-model-grid">
                    {availableProviders.map(p => (
                      <label key={p.id} className={`transfer-model-chip ${transferModels.includes(p.id) ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={transferModels.includes(p.id)}
                          onChange={(e) => setTransferModels(e.target.checked
                            ? [...transferModels, p.id]
                            : transferModels.filter(m => m !== p.id)
                          )}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ marginTop: 10 }}
                    onClick={handleRunTransferTest}
                    disabled={transferRunning || transferModels.length === 0}
                  >
                    {transferRunning ? <><span className="streaming-dot">●</span> 测试中...</> : '运行迁移测试'}
                  </button>
                  {transferReport && (
                    <table className="transfer-table">
                      <thead>
                        <tr><th>模型</th><th>通过率</th><th></th></tr>
                      </thead>
                      <tbody>
                        {Object.entries(transferReport.results).map(([modelId, rate]) => {
                          const name = availableProviders.find(p => p.id === modelId)?.name ?? modelId
                          const pct = Math.round(rate * 100)
                          const cls = pct >= 80 ? 'badge-pass' : pct >= 50 ? 'badge-warn' : 'badge-fail'
                          return (
                            <tr key={modelId}>
                              <td className="transfer-model-name">{name}</td>
                              <td><span className={`transfer-badge ${cls}`}>{pct}%</span></td>
                              <td className="transfer-bar-cell">
                                <div className="transfer-bar-track">
                                  <div className="transfer-bar-fill" style={{ width: `${pct}%`, background: pct >= 80 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171' }} />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )}

          {/* ③ Content / Diff view */}
          {showContent && (
            <div className="compare-wrap">
              {/* View toggle (only in reviewing phase, not while streaming) */}
              {phase === 'reviewing' && (
                <div className="view-toggle">
                  <button className={`toggle-btn ${!diffMode ? 'active' : ''}`} onClick={() => setDiffMode(false)}>并排</button>
                  <button className={`toggle-btn ${diffMode ? 'active' : ''}`} onClick={() => setDiffMode(true)}>Diff</button>
                </div>
              )}

              {diffMode && phase === 'reviewing' ? (
                <div className="evo-card diff-card">
                  <div className="compare-header evolved" style={{ marginBottom: 8 }}>Diff 对比（绿色=新增 / 红色=删除）</div>
                  <DiffView original={selectedSkill?.markdownContent ?? ''} evolved={evolvedContent} />
                </div>
              ) : (
                <div className="compare-layout">
                  <div className="compare-pane">
                    <div className="compare-header">原版</div>
                    <pre className="code-pre dim">{selectedSkill?.markdownContent ?? ''}</pre>
                  </div>
                  <div className="compare-pane">
                    <div className="compare-header evolved">
                      进化版{isStreaming && <span className="streaming-dot"> ●</span>}
                    </div>
                    <pre className="code-pre">{evolvedContent}{isStreaming ? '▌' : ''}</pre>
                  </div>
                </div>
              )}

              {phase === 'reviewing' && (() => {
                const similarity = bigramSimilarity(selectedSkill?.markdownContent ?? '', evolvedContent)
                return (
                  <>
                    {similarity >= SIMILARITY_WARNING_THRESHOLD && (
                      <div className="similarity-warn">
                        ⚠️ 进化内容与原版高度相似（差异 &lt; {Math.round((1 - similarity) * 100)}%），建议重新进化或切换范式
                      </div>
                    )}
                    <div className="pane-footer">
                      <button className="btn btn-primary" onClick={handleRunEval}>安装并评测</button>
                      <button className="btn btn-ghost" onClick={handleEvolve}>重新生成</button>
                      <button className="btn btn-ghost" onClick={handleReset}>重新配置</button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          {/* ④ Evaluating */}
          {phase === 'evaluating' && (
            <div className="evo-card">
              <div className="card-title">评测中...</div>
              <div className="progress-wrap"><div className="progress-bar" style={{ width: `${evalProgress}%` }} /></div>
              <p className="text-muted">正在对原版和进化版并行评测，可切换到其他页面，回来后结果依然保留。</p>
            </div>
          )}

          {/* ⑤ Results */}
          {phase === 'deciding' && evoResult && (() => {
            const regressedDims = allDims.filter(dim => ((origScores[dim] ?? 0) - (evolvedScores[dim] ?? 0)) > PER_DIM_REGRESSION_TOLERANCE)
            const isMeaningfulGain = totalDelta >= MIN_MEANINGFUL_IMPROVEMENT
            const isMeaningfulLoss = totalDelta <= -MIN_MEANINGFUL_IMPROVEMENT
            const deltaClass = isMeaningfulGain ? 'pos' : isMeaningfulLoss ? 'neg' : 'neu'
            const deltaLabel = isMeaningfulGain
              ? `+${totalDelta.toFixed(2)}`
              : isMeaningfulLoss ? `${totalDelta.toFixed(2)}`
              : `${totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(2)} 持平`
            return (
              <div className="evo-card results-card">
                <div className="card-title">进化结果</div>
                {regressedDims.length > 0 && (
                  <div className="regression-banner">
                    ⚠️ 以下维度出现回归（下降超过 {PER_DIM_REGRESSION_TOLERANCE} 分）：
                    {regressedDims.map(dim => {
                      const drop = (origScores[dim] ?? 0) - (evolvedScores[dim] ?? 0)
                      return <span key={dim} className="regressed-dim">{dim} -{drop.toFixed(1)}</span>
                    })}
                  </div>
                )}
                <div className="overall-row">
                  <div className="overall-item"><span className="overall-label">原版均分</span><span className="overall-score">{origAvg.toFixed(2)}</span></div>
                  <div className={`overall-delta ${deltaClass}`}>{deltaLabel}</div>
                  <div className="overall-item"><span className="overall-label">进化版均分</span><span className="overall-score evolved">{evolvedAvg.toFixed(2)}</span></div>
                </div>
                {allDims.length > 1 && (
                  <RadarChart dims={allDims} before={origScores} after={evolvedScores} />
                )}
                {allDims.length > 0 && (
                  <div className="dim-compare">
                    <div className="dim-legend"><span className="legend-before">■ 原版</span><span className="legend-after">■ 进化版</span></div>
                    {allDims.map((dim) => <DimCompareRow key={dim} dim={dim} before={origScores[dim] ?? 0} after={evolvedScores[dim] ?? 0} />)}
                  </div>
                )}

                <TestCaseDetail origHistory={origHistory} evolvedHistory={evolvedHistory} />

                {evoResult.evolvedSkill && (
                  <div className="installed-info" style={{ marginTop: 12 }}>
                    已安装为 <strong>{evoResult.evolvedSkill.name}</strong>（v{evoResult.evolvedSkill.version}）
                  </div>
                )}
                {evoResult.evolvedJobId === '' && (
                  <div className="no-testcases-info">No test cases — 无测试用例，无法评测对比</div>
                )}
                <div className="result-actions">
                  {onNavigate && evoResult.evolvedSkill && (
                    <button className="btn btn-primary btn-sm" onClick={() => onNavigate('eval', evoResult.evolvedSkill.id)}>📊 去评测</button>
                  )}
                  <button className="btn btn-ghost" onClick={handleEvolve}>再次进化</button>
                  <button className="btn btn-ghost" onClick={handleReset}>重新配置</button>
                </div>
              </div>
            )
          })()}

          {error && <div className="error-banner">⚠️ {error}</div>}
        </div>
      </div>

      {/* Content viewer modal */}
      {v2ContentModal && (
        <div className="modal-overlay" onClick={() => setV2ContentModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{v2ContentModal.title}</span>
              <button className="modal-close" onClick={() => setV2ContentModal(null)}>✕</button>
            </div>
            <pre className="modal-code">{v2ContentModal.content}</pre>
            {v2ContentModal.skillId && onNavigate && (
              <div className="modal-footer">
                <button className="btn btn-primary btn-sm" onClick={() => { setV2ContentModal(null); onNavigate('eval', v2ContentModal.skillId) }}>去评测</button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .evo-root { display: flex; flex-direction: column; height: 100%; }
        .evo-page-header { margin-bottom: 20px; }
        .evo-page-header h1 { font-size: 24px; font-weight: 700; }
        .evo-subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
        .evo-layout { display: grid; grid-template-columns: 220px 1fr; gap: 20px; flex: 1; min-height: 0; }
        .evo-left { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
        .evo-right { display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
        .evo-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 4px; }
        .evo-select { width: 100%; }
        .text-muted { color: var(--text-muted); font-size: 13px; }
        .error-banner { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius); padding: 12px 16px; color: var(--danger); font-size: 13px; }

        .demo-banner { display: flex; align-items: center; gap: 12px; background: rgba(249,115,22,0.12); border-bottom: 1px solid rgba(249,115,22,0.35); padding: 8px 20px; font-size: 13px; color: #f97316; flex-shrink: 0; }
        .demo-banner-exit { margin-left: auto; font-size: 12px; padding: 3px 10px; border-radius: var(--radius); border: 1px solid rgba(249,115,22,0.5); background: transparent; color: #f97316; cursor: pointer; }
        .demo-banner-exit:hover { background: rgba(249,115,22,0.15); }
        .link-btn { background: none; border: none; color: var(--accent); font-size: inherit; cursor: pointer; padding: 0; text-decoration: underline; }
        .link-btn:hover { opacity: 0.8; }
        .gen-warn { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius); padding: 8px 12px; color: var(--danger); font-size: 13px; }

        .demo-entry { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
        .demo-entry-btn { font-size: 12px; padding: 3px 10px; border-radius: var(--radius); border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; }
        .demo-entry-btn:hover { border-color: #f97316; color: #f97316; }

        .evo-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; }
        .card-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 16px; }

        /* Orig scores */
        .orig-scores { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; }
        .orig-scores-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 8px; }
        .mini-bar-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
        .mini-dim { font-size: 10px; color: var(--text-muted); width: 80px; flex-shrink: 0; text-transform: capitalize; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mini-track { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
        .mini-fill { height: 100%; border-radius: 2px; }
        .mini-val { font-size: 10px; font-weight: 600; width: 24px; text-align: right; color: var(--text-muted); }

        /* EvoTree */
        .evo-tree { display: flex; flex-direction: column; gap: 2px; }
        .tree-node { cursor: pointer; }
        .tree-row { display: flex; align-items: center; gap: 4px; padding: 5px 6px; border-radius: 6px; transition: background var(--transition); }
        .tree-node:not(.tree-current) .tree-row:hover { background: var(--surface2); }
        .tree-current .tree-row { background: rgba(108,99,255,0.1); }
        .tree-dot { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
        .tree-current .tree-dot { color: var(--accent); }
        .tree-name { font-size: 11px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tree-ver { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
        .tree-badge { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 10px; flex-shrink: 0; }
        .tree-badge.pos { background: rgba(74,222,128,0.15); color: var(--success); }
        .tree-badge.neg { background: rgba(239,68,68,0.12); color: var(--danger); }
        .tree-badge.neu { background: var(--surface2); color: var(--text-muted); }
        .tree-tag { font-size: 9px; color: var(--accent); padding-left: 20px; margin-bottom: 2px; text-transform: capitalize; }
        .tree-root-label { font-size: 9px; color: var(--text-muted); padding-left: 20px; margin-bottom: 2px; }

        /* Paradigm selection */
        .paradigm-row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .paradigm-card { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all var(--transition); position: relative; }
        .paradigm-card input[type=radio] { position: absolute; opacity: 0; pointer-events: none; }
        .paradigm-card:hover { border-color: var(--accent); background: rgba(108,99,255,0.04); }
        .paradigm-card.active { border-color: var(--accent); background: rgba(108,99,255,0.08); }
        .paradigm-label { font-size: 13px; font-weight: 600; }
        .paradigm-hint { font-size: 11px; color: var(--text-muted); line-height: 1.4; }

        /* Strategy targets */
        .targets-section { margin-bottom: 4px; }
        .targets-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .targets-title { font-size: 12px; font-weight: 600; color: var(--text-muted); }
        .btn-xs { padding: 2px 8px; font-size: 11px; }
        .targets-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .target-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 20px; font-size: 12px; cursor: pointer; transition: all var(--transition); }
        .target-chip input[type=checkbox] { display: none; }
        .target-chip:hover { border-color: var(--accent); }
        .target-chip.active { border-color: var(--accent); background: rgba(108,99,255,0.12); color: var(--accent); }

        /* Analysis panel */
        .analysis-panel { background: rgba(108,99,255,0.06); border: 1px solid rgba(108,99,255,0.25); border-radius: var(--radius); padding: 16px 20px; }
        .analysis-panel.loading { opacity: 0.7; }
        .analysis-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
        .analysis-field { margin-bottom: 10px; }
        .analysis-label { font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.04em; display: block; margin-bottom: 3px; }
        .analysis-value { font-size: 13px; color: var(--text); line-height: 1.5; }
        .analysis-value.dim { color: var(--text-muted); }

        /* View toggle */
        .compare-wrap { display: flex; flex-direction: column; gap: 0; }
        .view-toggle { display: flex; gap: 4px; margin-bottom: 8px; }
        .toggle-btn { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .toggle-btn.active { border-color: var(--accent); background: rgba(108,99,255,0.1); color: var(--accent); font-weight: 600; }
        .toggle-btn:hover:not(.active) { border-color: var(--accent); }

        /* Diff view */
        .diff-card { padding: 12px 16px; }
        .diff-view { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.6; overflow-y: auto; max-height: 380px; }
        .diff-line { display: flex; gap: 8px; padding: 0 4px; }
        .diff-add { background: rgba(74,222,128,0.15); }
        .diff-remove { background: rgba(239,68,68,0.12); }
        .diff-gutter { width: 12px; flex-shrink: 0; color: var(--text-muted); user-select: none; }
        .diff-add .diff-gutter { color: var(--success); }
        .diff-remove .diff-gutter { color: var(--danger); }
        .diff-text { white-space: pre-wrap; word-break: break-all; flex: 1; }

        /* Compare layout */
        .compare-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .compare-pane { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); display: flex; flex-direction: column; overflow: hidden; }
        .compare-header { padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); background: var(--surface2); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
        .compare-header.evolved { color: var(--accent); }
        .streaming-dot { color: var(--accent); animation: blink 1s step-end infinite; }
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.2} }
        .code-pre { flex: 1; padding: 12px; margin: 0; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.65; white-space: pre-wrap; word-break: break-all; overflow-y: auto; max-height: 320px; color: var(--text); background: var(--bg); }
        .code-pre.dim { color: var(--text-muted); }
        .pane-footer { padding: 10px 12px; border-top: 1px solid var(--border); display: flex; gap: 8px; flex-wrap: wrap; background: var(--surface); border-radius: 0 0 var(--radius) var(--radius); }

        /* Progress */
        .progress-wrap { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; margin-bottom: 12px; }
        .progress-bar { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.4s; }

        /* Results */
        .overall-row { display: flex; align-items: center; justify-content: center; gap: 24px; margin-bottom: 20px; padding: 14px; background: var(--surface2); border-radius: var(--radius); }
        .overall-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .overall-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .overall-score { font-size: 26px; font-weight: 700; }
        .overall-score.evolved { color: var(--accent); }
        .overall-delta { font-size: 18px; font-weight: 700; }
        .overall-delta.pos { color: var(--success); }
        .overall-delta.neg { color: var(--danger); }
        .overall-delta.neu { color: var(--text-muted); }
        .dim-compare { margin-bottom: 16px; }
        .dim-legend { display: flex; gap: 16px; margin-bottom: 10px; font-size: 11px; color: var(--text-muted); }
        .legend-after { color: var(--accent); }
        .dim-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .dim-name { font-size: 11px; color: var(--text-muted); width: 100px; flex-shrink: 0; text-transform: capitalize; }
        .dim-bars { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .bar-wrap { height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
        .dim-scores { display: flex; align-items: center; gap: 5px; width: 90px; justify-content: flex-end; flex-shrink: 0; }
        .score-before { font-size: 10px; color: var(--text-muted); }
        .score-delta { font-size: 10px; font-weight: 700; }
        .score-delta.pos { color: var(--success); }
        .score-delta.neg { color: var(--danger); }
        .score-delta.neu { color: var(--text-muted); }
        .score-after { font-size: 11px; font-weight: 700; }

        /* TestCaseDetail */
        .tc-detail { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 12px; }
        .tc-toggle { width: 100%; text-align: left; padding: 10px 14px; background: var(--surface2); border: none; color: var(--text); font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .tc-toggle:hover { background: var(--border); }
        .tc-table { display: flex; flex-direction: column; }
        .tc-head { display: grid; grid-template-columns: 1fr 60px 60px 60px; gap: 8px; padding: 6px 14px; background: var(--surface2); font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; border-top: 1px solid var(--border); }
        .tc-row { display: grid; grid-template-columns: 1fr 60px 60px 60px; gap: 8px; padding: 7px 14px; border-top: 1px solid var(--border); font-size: 12px; align-items: center; }
        .tc-regress { background: rgba(239,68,68,0.06); }
        .tc-input { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
        .tc-score { text-align: center; font-weight: 600; }
        .tc-delta { text-align: center; font-weight: 700; }
        .tc-delta.pos { color: var(--success); }
        .tc-delta.neg { color: var(--danger); }
        .tc-delta.neu { color: var(--text-muted); }

        .installed-info { background: rgba(74,222,128,0.08); border: 1px solid var(--success); border-radius: var(--radius); padding: 10px 14px; color: var(--success); font-size: 13px; margin-bottom: 12px; }
        .no-testcases-info { background: rgba(250,204,21,0.06); border: 1px solid rgba(250,204,21,0.3); border-radius: var(--radius); padding: 10px 14px; color: var(--warning); font-size: 13px; margin-bottom: 12px; }
        .result-actions { display: flex; gap: 8px; }
        .regression-banner { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.4); border-radius: var(--radius); padding: 10px 14px; color: var(--danger); font-size: 13px; margin-bottom: 14px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
        .regressed-dim { background: rgba(239,68,68,0.15); border-radius: 4px; padding: 2px 8px; font-weight: 700; font-size: 11px; }
        .similarity-warn { background: rgba(250,204,21,0.08); border: 1px solid rgba(250,204,21,0.35); border-radius: var(--radius); padding: 10px 12px; color: var(--warning); font-size: 12px; margin-top: 8px; }

        /* Engine selector — grouped chips */
        .engine-group { margin-bottom: 10px; }
        .engine-group-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 6px; }
        .engine-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .engine-chip { display: inline-flex; align-items: center; gap: 3px; padding: 4px 12px; border: 1px solid var(--border); border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all var(--transition); color: var(--text-muted); }
        .engine-chip input[type=radio] { position: absolute; opacity: 0; pointer-events: none; }
        .engine-chip:hover { border-color: var(--accent); color: var(--text); }
        .engine-chip.active { border-color: var(--accent); background: rgba(108,99,255,0.12); color: var(--accent); font-weight: 600; }
        .engine-chip-dot { color: var(--warning); font-size: 14px; line-height: 1; }
        .engine-desc { margin: 8px 0 4px; padding: 10px 12px; background: var(--surface2); border-radius: 8px; border-left: 2px solid var(--accent); display: flex; flex-direction: column; gap: 3px; }
        .engine-desc-name { font-size: 12px; font-weight: 700; color: var(--accent); }
        .engine-desc-hint { font-size: 11px; color: var(--text); line-height: 1.5; }
        .engine-desc-prereq { font-size: 10px; color: var(--warning); margin-top: 2px; }
        .engine-advanced-toggle { display: flex; align-items: center; gap: 6px; background: none; border: 1px dashed var(--border); border-radius: 6px; color: var(--text-muted); font-size: 12px; padding: 5px 10px; cursor: pointer; margin-top: 4px; transition: all var(--transition); width: 100%; }
        .engine-advanced-toggle:hover { border-color: var(--accent); color: var(--text); }
        .engine-advanced-hint { font-size: 10px; color: var(--text-muted); margin-left: auto; opacity: 0.7; }

        /* Pareto scatter */
        .pareto-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
        .pareto-empty { color: var(--text-muted); font-size: 12px; padding: 12px; }

        /* Engine params */
        .engine-params { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .engine-param-row { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: default; }
        .engine-param-label { width: 90px; color: var(--text-muted); flex-shrink: 0; }
        .engine-param-row input[type=range] { flex: 1; accent-color: var(--accent); }
        .engine-param-val { width: 28px; text-align: right; font-weight: 600; color: var(--accent); font-size: 12px; }

        /* Radar chart */
        .radar-wrap { margin: 0 auto 16px; width: 220px; }
        .radar-legend { display: flex; justify-content: center; gap: 16px; margin-top: 6px; font-size: 11px; color: var(--text-muted); }
        .radar-leg-orig { color: rgba(136,136,136,0.8); }
        .radar-leg-evo { color: #6c63ff; }

        /* Transfer test */
        .transfer-card { margin-top: 12px; }
        .transfer-model-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
        .transfer-model-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 14px; cursor: pointer; transition: all var(--transition); }
        .transfer-model-chip input[type=checkbox] { width: 11px; height: 11px; }
        .transfer-model-chip:hover { border-color: var(--accent); }
        .transfer-model-chip.active { border-color: var(--accent); background: rgba(108,99,255,0.1); color: var(--accent); }
        .transfer-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        .transfer-table th { text-align: left; color: var(--text-muted); font-weight: 500; padding: 4px 6px; border-bottom: 1px solid var(--border); }
        .transfer-table td { padding: 5px 6px; vertical-align: middle; }
        .transfer-model-name { color: var(--text); font-size: 12px; }
        .transfer-badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; }
        .badge-pass { background: rgba(74,222,128,0.15); color: #4ade80; }
        .badge-warn { background: rgba(250,204,21,0.15); color: #d4a017; }
        .badge-fail { background: rgba(248,113,113,0.15); color: #f87171; }
        .transfer-bar-cell { width: 100px; }
        .transfer-bar-track { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
        .transfer-bar-fill { height: 100%; border-radius: 2px; transition: width 0.4s; }

        /* SkillX */
        .skillx-entries { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
        .skillx-entry { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.5; }
        .skillx-badge { flex-shrink: 0; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        .skillx-l1 { background: rgba(108,99,255,0.15); color: #6c63ff; }
        .skillx-l2 { background: rgba(0,212,170,0.15); color: #00d4aa; }
        .skillx-l3 { background: rgba(245,158,11,0.15); color: #f59e0b; }
        .skillx-content { flex: 1; color: var(--text); }
        .skillx-src { flex-shrink: 0; font-size: 10px; color: var(--text-muted); white-space: nowrap; }
        .skillx-result-note { margin-top: 10px; font-size: 11px; color: var(--text-muted); padding: 4px 8px; background: var(--surface); border-radius: 4px; }

        /* SkillClaw */
        .skillclaw-progress { display: flex; gap: 4px; margin-top: 8px; }
        .skillclaw-step { flex: 1; text-align: center; font-size: 10px; padding: 4px 2px; border-radius: 4px; background: var(--border); color: var(--text-muted); transition: all var(--transition); }
        .skillclaw-step.active { background: rgba(108,99,255,0.2); color: var(--accent); }
        .skillclaw-step.done { background: rgba(74,222,128,0.15); color: #4ade80; }
        .skillclaw-failures { margin: 6px 0 0; padding-left: 16px; font-size: 12px; color: var(--text); display: flex; flex-direction: column; gap: 4px; }
        .skillclaw-failures li { line-height: 1.5; }
        .skillclaw-summary { margin-top: 10px; font-size: 12px; color: var(--text-muted); line-height: 1.6; padding: 8px; background: var(--surface); border-radius: 6px; border-left: 2px solid var(--accent); }

        /* Frontier list */
        .frontier-list { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
        .frontier-list-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 4px; }
        .frontier-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface2); }
        .frontier-best { border-color: var(--accent); background: rgba(108,99,255,0.08); }
        .frontier-name { font-size: 12px; font-weight: 500; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .frontier-ver { font-size: 10px; color: var(--text-muted); }
        .frontier-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(108,99,255,0.2); color: var(--accent); font-weight: 600; }
        .frontier-actions { display: flex; gap: 3px; flex-shrink: 0; }

        /* Back button */
        .evo-back-btn { align-self: flex-start; padding: 5px 12px; font-size: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .evo-back-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .evo-back-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* v2 result actions */
        .v2-result-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .btn-sm { padding: 4px 12px; font-size: 12px; }

        /* Content viewer modal */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .modal-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: min(720px, 90vw); max-height: 80vh; display: flex; flex-direction: column; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border); }
        .modal-title { font-size: 14px; font-weight: 600; color: var(--text); }
        .modal-close { background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
        .modal-close:hover { background: var(--surface2); color: var(--text); }
        .modal-code { flex: 1; overflow-y: auto; padding: 16px 20px; margin: 0; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.65; white-space: pre-wrap; word-break: break-all; color: var(--text); background: var(--bg); }
        .modal-footer { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
      `}</style>
    </div>
  )
}
