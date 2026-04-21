import { useEffect, useState, useRef, useCallback } from 'react'
import type { Skill, EvalResult, EvoRunResult } from '../../../shared/types'

const STRATEGIES = [
  { id: 'improve_weak', label: '修复薄弱维度', icon: '🎯', hint: '针对评测得分最低的维度重点改进' },
  { id: 'expand',       label: '扩展能力边界', icon: '🚀', hint: '增加新能力、更详细的说明和更广的适用场景' },
  { id: 'simplify',     label: '精简聚焦',     icon: '✂️', hint: '提炼核心，让 Skill 更简洁、更易遵循' },
  { id: 'add_examples', label: '补充示例',     icon: '📚', hint: '在 Skill 内添加具体示例和边界情况说明' }
]

const DIM_COLORS: Record<string, string> = {
  correctness:  '#6c63ff',
  clarity:      '#00d4aa',
  completeness: '#f59e0b',
  safety:       '#ef4444'
}

// ── Score comparison bar ──────────────────────────────────────────────────────

function DimCompareRow({ dim, before, after }: { dim: string; before: number; after: number }) {
  const color = DIM_COLORS[dim] ?? '#888'
  const delta = after - before
  return (
    <div className="dim-row">
      <span className="dim-name">{dim}</span>
      <div className="dim-bars">
        <div className="bar-wrap">
          <div className="bar-fill before" style={{ width: `${(before / 10) * 100}%`, background: `${color}55` }} />
        </div>
        <div className="bar-wrap">
          <div className="bar-fill after" style={{ width: `${(after / 10) * 100}%`, background: color }} />
        </div>
      </div>
      <span className="dim-scores">
        <span className="score-before">{before.toFixed(1)}</span>
        <span className={`score-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neu'}`}>
          {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
        </span>
        <span className="score-after" style={{ color }}>{after.toFixed(1)}</span>
      </span>
    </div>
  )
}

// ── Aggregate scores from eval history ───────────────────────────────────────

function avgScores(history: EvalResult[]): Record<string, number> {
  const totals: Record<string, { sum: number; count: number }> = {}
  for (const r of history) {
    for (const [dim, s] of Object.entries(r.scores)) {
      if (!totals[dim]) totals[dim] = { sum: 0, count: 0 }
      totals[dim].sum += s.score
      totals[dim].count++
    }
  }
  return Object.fromEntries(
    Object.entries(totals).map(([d, { sum, count }]) => [d, sum / count])
  )
}

function overallAvg(scores: Record<string, number>): number {
  const vals = Object.values(scores)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

// ── Phase types ───────────────────────────────────────────────────────────────

type Phase =
  | 'idle'
  | 'evolving'
  | 'evolved'      // content ready, waiting for user to confirm eval
  | 'evaluating'
  | 'done'

// ── Main EvoPage ──────────────────────────────────────────────────────────────

export default function EvoPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [origHistory, setOrigHistory] = useState<EvalResult[]>([])
  const [strategy, setStrategy] = useState('improve_weak')
  const [phase, setPhase] = useState<Phase>('idle')
  const [evolvedContent, setEvolvedContent] = useState('')
  const [evoResult, setEvoResult] = useState<EvoRunResult | null>(null)
  const [origScores, setOrigScores] = useState<Record<string, number>>({})
  const [evolvedScores, setEvolvedScores] = useState<Record<string, number>>({})
  const [evalProgress, setEvalProgress] = useState(0)
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    window.api.skills.getAll().then(setSkills)
    window.api.config.get().then((c) => setApiKeySet(c.anthropicApiKeySet || c.openaiApiKeySet))
  }, [])

  const loadSkill = useCallback(async (id: string) => {
    setPhase('idle')
    setEvolvedContent('')
    setEvoResult(null)
    setOrigScores({})
    setEvolvedScores({})
    setError(null)
    if (!id) { setSelectedSkill(null); setOrigHistory([]); return }
    const skill = skills.find((s) => s.id === id) ?? null
    setSelectedSkill(skill)
    const history = await window.api.eval.history(id)
    setOrigHistory(history)
    setOrigScores(avgScores(history))
  }, [skills])

  useEffect(() => { loadSkill(selectedId) }, [selectedId, loadSkill])

  // Poll evolved skill scores until both jobs complete
  const pollScores = useCallback(async (result: EvoRunResult) => {
    if (!result.evolvedJobId) {
      setPhase('done')
      return
    }
    const maxAttempts = 60
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      const [origH, evolvedH] = await Promise.all([
        window.api.eval.history(selectedId),
        window.api.eval.history(result.evolvedSkill.id)
      ])
      const oScores = avgScores(origH)
      const eScores = avgScores(evolvedH)
      if (Object.keys(eScores).length > 0 || attempts >= maxAttempts) {
        clearInterval(interval)
        setOrigScores(oScores)
        setEvolvedScores(eScores)
        setPhase('done')
      } else {
        setEvalProgress(Math.min(90, attempts * 3))
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [selectedId])

  const handleEvolve = async () => {
    if (!selectedId) return
    setPhase('evolving')
    setEvolvedContent('')
    setError(null)

    cleanupRef.current?.()
    cleanupRef.current = window.api.studio.onChunk(({ chunk, done }) => {
      if (!done) {
        setEvolvedContent((p) => p + chunk)
      } else {
        setPhase('evolved')
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    })

    try {
      await window.api.studio.evolve(selectedId, strategy)
    } catch (e) {
      setError(String(e))
      setPhase('idle')
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  const handleRunEval = async () => {
    if (!evolvedContent) return
    setPhase('evaluating')
    setEvalProgress(0)
    setError(null)

    try {
      const result = await window.api.evo.installAndEval(selectedId, evolvedContent)
      setEvoResult(result)
      if (result.evolvedJobId) {
        // Listen for progress on both jobs
        cleanupRef.current?.()
        let origDone = !result.originalJobId
        let evolDone = false
        cleanupRef.current = window.api.eval.onProgress((data) => {
          if (data.jobId === result.originalJobId && data.progress >= 100) origDone = true
          if (data.jobId === result.evolvedJobId && data.progress >= 100) evolDone = true
          const combined = origDone && evolDone ? 100 : data.progress
          setEvalProgress(combined)
          if (origDone && evolDone) {
            cleanupRef.current?.()
            cleanupRef.current = null
            pollScores(result)
          }
        })
      } else {
        setPhase('done')
      }
    } catch (e) {
      setError(String(e))
      setPhase('evolved')
    }
  }

  const handleReset = () => {
    cleanupRef.current?.()
    cleanupRef.current = null
    loadSkill(selectedId)
  }

  useEffect(() => () => { cleanupRef.current?.() }, [])

  const origAvg = overallAvg(origScores)
  const evolvedAvg = overallAvg(evolvedScores)
  const totalDelta = evolvedAvg - origAvg
  const allDims = Array.from(new Set([...Object.keys(origScores), ...Object.keys(evolvedScores)]))

  return (
    <div className="evo-root">
      <div className="evo-header">
        <h1>Evo</h1>
        <p className="subtitle">自动进化 Skill，对比前后评测分数</p>
      </div>

      {apiKeySet === false && (
        <div className="guard-banner">⚠️ 未配置 API Key，请前往 Settings 添加后再使用 Evo。</div>
      )}

      {/* Step 1: Select skill + strategy */}
      <div className="evo-card">
        <div className="card-title">① 选择 Skill 和进化策略</div>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={phase !== 'idle'}
          style={{ width: '100%', marginBottom: 16 }}
        >
          <option value="">选择 Skill...</option>
          {skills.map((s) => (
            <option key={s.id} value={s.id}>{s.name} v{s.version}</option>
          ))}
        </select>

        {selectedId && origHistory.length > 0 && (
          <div className="orig-scores">
            <span className="orig-scores-label">当前评测均分</span>
            {Object.entries(origScores).sort(([,a],[,b]) => a - b).map(([dim, score]) => (
              <div key={dim} className="mini-bar-row">
                <span className="mini-dim">{dim}</span>
                <div className="mini-track">
                  <div className="mini-fill" style={{ width: `${(score/10)*100}%`, background: DIM_COLORS[dim] ?? '#888' }} />
                </div>
                <span className="mini-val">{score.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}

        {selectedId && origHistory.length === 0 && (
          <p className="text-muted" style={{ marginBottom: 16 }}>暂无评测记录，进化将基于 Skill 内容直接优化。</p>
        )}

        <div className="strategy-grid">
          {STRATEGIES.map((st) => (
            <label key={st.id} className={`strategy-card ${strategy === st.id ? 'active' : ''} ${phase !== 'idle' ? 'disabled' : ''}`}>
              <input type="radio" name="strategy" value={st.id} checked={strategy === st.id}
                onChange={() => phase === 'idle' && setStrategy(st.id)} />
              <span className="st-icon">{st.icon}</span>
              <span className="st-label">{st.label}</span>
              <span className="st-hint">{st.hint}</span>
            </label>
          ))}
        </div>

        {phase === 'idle' && (
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={handleEvolve}
            disabled={!selectedId || apiKeySet === false}
          >
            🧬 开始进化
          </button>
        )}
      </div>

      {/* Step 2: Evolving / evolved content */}
      {(phase === 'evolving' || phase === 'evolved' || phase === 'evaluating' || phase === 'done') && (
        <div className="compare-layout">
          <div className="compare-pane">
            <div className="compare-header">原版</div>
            <pre className="code-pre dim">{selectedSkill?.markdownContent ?? ''}</pre>
          </div>
          <div className="compare-pane">
            <div className="compare-header evolved">
              进化版
              {phase === 'evolving' && <span className="streaming-dot"> ●</span>}
            </div>
            <pre className="code-pre">{evolvedContent}{phase === 'evolving' ? '▌' : ''}</pre>
            {phase === 'evolved' && (
              <div className="pane-footer">
                <button className="btn btn-primary" onClick={handleRunEval}>
                  ▶ 安装并评测对比
                </button>
                <button className="btn btn-ghost" onClick={handleReset}>重新进化</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Evaluating progress */}
      {phase === 'evaluating' && (
        <div className="evo-card">
          <div className="card-title">③ 评测中...</div>
          <div className="progress-wrap">
            <div className="progress-bar" style={{ width: `${evalProgress}%` }} />
          </div>
          <p className="text-muted">正在对原版和进化版并行评测，请稍候...</p>
        </div>
      )}

      {/* Step 4: Results */}
      {phase === 'done' && evoResult && (
        <div className="evo-card results-card">
          <div className="card-title">④ 进化结果对比</div>

          <div className="overall-row">
            <div className="overall-item">
              <span className="overall-label">原版均分</span>
              <span className="overall-score">{origAvg.toFixed(2)}</span>
            </div>
            <div className={`overall-delta ${totalDelta > 0 ? 'pos' : totalDelta < 0 ? 'neg' : 'neu'}`}>
              {totalDelta > 0 ? '📈' : totalDelta < 0 ? '📉' : '➡️'}
              {totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(2)}
            </div>
            <div className="overall-item">
              <span className="overall-label">进化版均分</span>
              <span className="overall-score evolved">{evolvedAvg.toFixed(2)}</span>
            </div>
          </div>

          {allDims.length > 0 && (
            <div className="dim-compare">
              <div className="dim-legend">
                <span className="legend-before">■ 原版</span>
                <span className="legend-after">■ 进化版</span>
              </div>
              {allDims.map((dim) => (
                <DimCompareRow
                  key={dim}
                  dim={dim}
                  before={origScores[dim] ?? 0}
                  after={evolvedScores[dim] ?? 0}
                />
              ))}
            </div>
          )}

          {evoResult.evolvedSkill && (
            <div className="installed-info">
              ✅ 进化版已安装为 <strong>{evoResult.evolvedSkill.name}</strong>（v{evoResult.evolvedSkill.version}）
            </div>
          )}

          <div className="result-actions">
            <button className="btn btn-ghost" onClick={handleReset}>再次进化</button>
          </div>
        </div>
      )}

      {error && <div className="error-banner">⚠️ {error}</div>}

      <style>{`
        .evo-root { display: flex; flex-direction: column; gap: 20px; }
        .evo-header h1 { font-size: 24px; font-weight: 700; }
        .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
        .guard-banner { background: rgba(250,204,21,0.08); border: 1px solid rgba(250,204,21,0.3); border-radius: var(--radius); padding: 12px 16px; color: var(--warning); font-size: 13px; }
        .error-banner { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius); padding: 12px 16px; color: var(--danger); font-size: 13px; }

        /* Cards */
        .evo-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; }
        .card-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 16px; }
        .text-muted { color: var(--text-muted); font-size: 13px; }

        /* Orig scores mini bars */
        .orig-scores { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 16px; }
        .orig-scores-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 8px; }
        .mini-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .mini-dim { font-size: 11px; color: var(--text-muted); width: 90px; flex-shrink: 0; text-transform: capitalize; }
        .mini-track { flex: 1; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .mini-fill { height: 100%; border-radius: 3px; }
        .mini-val { font-size: 11px; font-weight: 600; width: 28px; text-align: right; color: var(--text-muted); }

        /* Strategy grid */
        .strategy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .strategy-card { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all var(--transition); position: relative; }
        .strategy-card input[type=radio] { position: absolute; opacity: 0; pointer-events: none; }
        .strategy-card:hover { border-color: var(--accent); background: rgba(108,99,255,0.04); }
        .strategy-card.active { border-color: var(--accent); background: rgba(108,99,255,0.08); }
        .strategy-card.disabled { opacity: 0.5; cursor: default; pointer-events: none; }
        .st-icon { font-size: 18px; }
        .st-label { font-size: 13px; font-weight: 600; }
        .st-hint { font-size: 11px; color: var(--text-muted); line-height: 1.4; }

        /* Compare layout */
        .compare-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .compare-pane { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); display: flex; flex-direction: column; overflow: hidden; }
        .compare-header { padding: 10px 14px; font-size: 12px; font-weight: 700; color: var(--text-muted); background: var(--surface2); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
        .compare-header.evolved { color: var(--accent); }
        .streaming-dot { color: var(--accent); animation: blink 1s step-end infinite; }
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.2} }
        .code-pre { flex: 1; padding: 14px; margin: 0; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.65; white-space: pre-wrap; word-break: break-all; overflow-y: auto; max-height: 360px; color: var(--text); background: var(--bg); }
        .code-pre.dim { color: var(--text-muted); }
        .pane-footer { padding: 12px 14px; border-top: 1px solid var(--border); display: flex; gap: 8px; }

        /* Progress */
        .progress-wrap { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; margin-bottom: 12px; }
        .progress-bar { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.4s; }

        /* Results */
        .results-card { }
        .overall-row { display: flex; align-items: center; justify-content: center; gap: 32px; margin-bottom: 24px; padding: 16px; background: var(--surface2); border-radius: var(--radius); }
        .overall-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .overall-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .overall-score { font-size: 28px; font-weight: 700; }
        .overall-score.evolved { color: var(--accent); }
        .overall-delta { font-size: 20px; font-weight: 700; display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .overall-delta.pos { color: var(--success); }
        .overall-delta.neg { color: var(--danger); }
        .overall-delta.neu { color: var(--text-muted); }

        /* Dim compare */
        .dim-compare { margin-bottom: 20px; }
        .dim-legend { display: flex; gap: 16px; margin-bottom: 10px; font-size: 11px; color: var(--text-muted); }
        .legend-before { color: var(--text-muted); }
        .legend-after { color: var(--accent); }
        .dim-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .dim-name { font-size: 12px; color: var(--text-muted); width: 100px; flex-shrink: 0; text-transform: capitalize; }
        .dim-bars { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .bar-wrap { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
        .dim-scores { display: flex; align-items: center; gap: 6px; width: 100px; justify-content: flex-end; flex-shrink: 0; }
        .score-before { font-size: 11px; color: var(--text-muted); }
        .score-delta { font-size: 11px; font-weight: 700; }
        .score-delta.pos { color: var(--success); }
        .score-delta.neg { color: var(--danger); }
        .score-delta.neu { color: var(--text-muted); }
        .score-after { font-size: 12px; font-weight: 700; }

        .installed-info { background: rgba(74,222,128,0.08); border: 1px solid var(--success); border-radius: var(--radius); padding: 10px 14px; color: var(--success); font-size: 13px; margin-bottom: 16px; }
        .result-actions { display: flex; gap: 8px; }
      `}</style>
    </div>
  )
}
