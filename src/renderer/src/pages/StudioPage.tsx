import { useState, useEffect, useRef, useCallback } from 'react'
import type { Skill, EvalResult, SkillScore5D } from '../../../shared/types'

type StudioMode = 'describe' | 'evolve' | 'examples' | 'extract'

// ── 5D Score Panel ────────────────────────────────────────────────────────────

const SCORE_5D_COLORS: Record<string, string> = {
  safety:          '#ef4444',
  completeness:    '#6c63ff',
  executability:   '#00d4aa',
  maintainability: '#f59e0b',
  costAwareness:   '#8b5cf6'
}

const SCORE_5D_LABELS: Record<string, string> = {
  safety:          'Safety',
  completeness:    'Completeness',
  executability:   'Executability',
  maintainability: 'Maintainability',
  costAwareness:   'Cost Awareness'
}

function Score5DPanel({ scores, loading }: { scores: SkillScore5D | null; loading: boolean }) {
  if (loading) return <div className="score5d-panel"><div className="score5d-loading">Scoring...</div></div>
  if (!scores) return null
  const avg = Object.values(scores).reduce((a, b) => a + b, 0) / 5
  return (
    <div className="score5d-panel">
      <div className="score5d-header">
        <span>5D Quality Score</span>
        <span className="score5d-avg" style={{ color: avg >= 7 ? 'var(--success)' : avg >= 5 ? 'var(--warning)' : 'var(--danger)' }}>
          {avg.toFixed(1)}/10
        </span>
      </div>
      {(Object.keys(SCORE_5D_LABELS) as (keyof SkillScore5D)[]).map(dim => (
        <div key={dim} className="score-bar-row">
          <span className="score-dim">{SCORE_5D_LABELS[dim]}</span>
          <div className="score-track">
            <div className="score-fill" style={{ width: `${(scores[dim] / 10) * 100}%`, background: SCORE_5D_COLORS[dim] }} />
          </div>
          <span className="score-val" style={{ color: SCORE_5D_COLORS[dim] }}>{scores[dim].toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Trust Badge ───────────────────────────────────────────────────────────────

const TRUST_LABELS = ['', 'T1 AI生成', 'T2 格式验证', 'T3 测试覆盖', 'T4 人工确认']
const TRUST_COLORS = ['', '#888', '#f59e0b', '#00d4aa', '#6c63ff']

function TrustBadge({ level }: { level: 1 | 2 | 3 | 4 }) {
  return (
    <span className="trust-badge" style={{ background: `${TRUST_COLORS[level]}22`, color: TRUST_COLORS[level], borderColor: `${TRUST_COLORS[level]}55` }}>
      {TRUST_LABELS[level]}
    </span>
  )
}

// ── Similar Skills Warning ────────────────────────────────────────────────────

function SimilarSkillsWarning({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) return null
  return (
    <div className="similar-warning">
      <span className="similar-icon">⚠️</span>
      <div>
        <div className="similar-title">发现相似 Skill，考虑更新而非新建：</div>
        <div className="similar-list">
          {skills.map(s => (
            <span key={s.id} className="similar-item">
              {s.name} <TrustBadge level={(s.trustLevel ?? 1) as 1|2|3|4} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Shared: generated content + install ──────────────────────────────────────

function InstallPanel({ content, onInstalled }: { content: string; onInstalled: (s: Skill) => void }) {
  const [name, setName] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState<Skill | null>(null)
  const [scores, setScores] = useState<SkillScore5D | null>(null)
  const [scoring, setScoring] = useState(false)
  const [similar, setSimilar] = useState<Skill[]>([])

  useEffect(() => {
    const m = content.match(/^---\s*\n[\s\S]*?name:\s*(.+?)\s*\n/m)
    if (m) setName(m[1].trim())

    // Auto-score and find similar
    setScoring(true)
    setScores(null)
    setSimilar([])
    Promise.all([
      window.api.studio.scoreSkill(content),
      window.api.studio.similarSkills(content)
    ]).then(([s, sim]) => {
      setScores(s)
      setSimilar(sim)
      setScoring(false)
    }).catch(() => setScoring(false))
  }, [content])

  const handleInstall = async () => {
    if (!name.trim()) return
    setInstalling(true)
    const skill = await window.api.studio.install(content, name.trim())
    setInstalled(skill)
    setInstalling(false)
    onInstalled(skill)
  }

  return (
    <div className="install-panel">
      <SimilarSkillsWarning skills={similar} />
      <Score5DPanel scores={scores} loading={scoring} />
      {installed ? (
        <div className="success-banner">✅ Skill &quot;{installed.name}&quot; installed! <TrustBadge level={1} /></div>
      ) : (
        <div className="install-row">
          <input
            placeholder="Skill name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={handleInstall} disabled={installing || !name.trim()}>
            {installing ? 'Installing...' : 'Install Skill'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Shared: streaming preview ─────────────────────────────────────────────────

function GeneratedPreview({ content, streaming }: { content: string; streaming: boolean }) {
  return (
    <div className="preview-box">
      <pre className="code-preview">{content}{streaming ? '▌' : ''}</pre>
    </div>
  )
}

// ── Mode 1: 描述生成 ──────────────────────────────────────────────────────────

function DescribeMode({ apiKeySet, cleanupRef }: {
  apiKeySet: boolean | null
  cleanupRef: React.MutableRefObject<(() => void) | null>
}) {
  const [prompt, setPrompt] = useState('')
  const [generated, setGenerated] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [installed, setInstalled] = useState<Skill | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setStreaming(true)
    setGenerated('')
    setInstalled(null)

    cleanupRef.current?.()
    cleanupRef.current = window.api.studio.onChunk(({ chunk, done }) => {
      if (!done) setGenerated((p) => p + chunk)
      else {
        setStreaming(false)
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    })

    try {
      await window.api.studio.generateStream(prompt)
    } catch {
      setStreaming(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  return (
    <div className="mode-body">
      <div className="card">
        <h2>描述你想要的 Skill</h2>
        <textarea
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="例如：一个把会议记录整理成行动项（含负责人和截止日期）的 Skill..."
          style={{ width: '100%', resize: 'vertical' }}
        />
        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          onClick={handleGenerate}
          disabled={streaming || !prompt.trim() || apiKeySet === false}
        >
          {streaming ? '生成中...' : '生成 Skill'}
        </button>
      </div>

      {(streaming || generated) && (
        <div className="card">
          <h2>
            生成结果
            {streaming && <span className="streaming-dot"> ●</span>}
          </h2>
          <GeneratedPreview content={generated} streaming={streaming} />
          {!streaming && generated && !installed && (
            <InstallPanel content={generated} onInstalled={setInstalled} />
          )}
          {installed && <div className="success-banner">✅ &quot;{installed.name}&quot; 已安装！</div>}
        </div>
      )}
    </div>
  )
}

// ── Mode 2: 进化生成 ──────────────────────────────────────────────────────────

const STRATEGIES = [
  { id: 'improve_weak', label: '修复薄弱维度', hint: '针对评测得分最低的维度重点改进' },
  { id: 'expand',       label: '扩展能力边界', hint: '增加新能力、更详细的说明和更广的适用场景' },
  { id: 'simplify',     label: '精简聚焦',     hint: '提炼核心，让 Skill 更简洁、更易遵循' },
  { id: 'add_examples', label: '补充示例',     hint: '在 Skill 内添加具体示例和边界情况说明' }
]

const DIM_COLORS: Record<string, string> = {
  correctness:  '#6c63ff',
  clarity:      '#00d4aa',
  completeness: '#f59e0b',
  safety:       '#ef4444'
}

function ScoreBar({ dim, score }: { dim: string; score: number }) {
  const color = DIM_COLORS[dim] ?? '#888'
  const pct = (score / 10) * 100
  return (
    <div className="score-bar-row">
      <span className="score-dim">{dim}</span>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-val" style={{ color }}>{score.toFixed(1)}</span>
    </div>
  )
}

function EvolveMode({ apiKeySet, cleanupRef }: {
  apiKeySet: boolean | null
  cleanupRef: React.MutableRefObject<(() => void) | null>
}) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [evalHistory, setEvalHistory] = useState<EvalResult[]>([])
  const [avgScores, setAvgScores] = useState<Record<string, number>>({})
  const [strategy, setStrategy] = useState('improve_weak')
  const [originalContent, setOriginalContent] = useState('')
  const [evolved, setEvolved] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [installed, setInstalled] = useState<Skill | null>(null)

  useEffect(() => {
    window.api.skills.getAll().then(setSkills)
  }, [])

  const loadSkill = useCallback(async (id: string) => {
    setEvolved('')
    setInstalled(null)
    if (!id) { setOriginalContent(''); setEvalHistory([]); setAvgScores({}); return }

    const skill = skills.find((s) => s.id === id)
    if (skill) setOriginalContent(skill.markdownContent)

    const history = await window.api.eval.history(id)
    setEvalHistory(history)

    const totals: Record<string, { sum: number; count: number }> = {}
    for (const r of history) {
      for (const [dim, s] of Object.entries(r.scores)) {
        if (!totals[dim]) totals[dim] = { sum: 0, count: 0 }
        totals[dim].sum += s.score
        totals[dim].count++
      }
    }
    const avgs = Object.fromEntries(
      Object.entries(totals).map(([d, { sum, count }]) => [d, sum / count])
    )
    setAvgScores(avgs)
  }, [skills])

  useEffect(() => { loadSkill(selectedId) }, [selectedId, loadSkill])

  const handleEvolve = async () => {
    if (!selectedId) return
    setStreaming(true)
    setEvolved('')
    setInstalled(null)

    cleanupRef.current?.()
    cleanupRef.current = window.api.studio.onChunk(({ chunk, done }) => {
      if (!done) setEvolved((p) => p + chunk)
      else {
        setStreaming(false)
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    })

    try {
      await window.api.studio.evolve(selectedId, strategy)
    } catch {
      setStreaming(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  const sortedDims = Object.entries(avgScores).sort(([, a], [, b]) => a - b)

  return (
    <div className="mode-body">
      <div className="card">
        <h2>选择要进化的 Skill</h2>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ width: '100%', marginBottom: 16 }}>
          <option value="">选择 Skill...</option>
          {skills.map((s) => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
        </select>

        {selectedId && (
          <>
            {sortedDims.length > 0 ? (
              <div className="scores-section">
                <div className="scores-header">
                  <span>评测分数（{evalHistory.length} 次）</span>
                  <span className="scores-hint">分数越低越需要进化</span>
                </div>
                {sortedDims.map(([dim, score]) => <ScoreBar key={dim} dim={dim} score={score} />)}
              </div>
            ) : (
              <p className="text-muted">暂无评测记录——进化时将基于 Skill 内容直接优化。</p>
            )}

            <div className="strategy-section">
              <label className="field-label">进化策略</label>
              <div className="strategy-list">
                {STRATEGIES.map((st) => (
                  <label key={st.id} className={`strategy-item ${strategy === st.id ? 'active' : ''}`}>
                    <input type="radio" name="strategy" value={st.id} checked={strategy === st.id}
                      onChange={() => setStrategy(st.id)} />
                    <div>
                      <div className="strategy-label">{st.label}</div>
                      <div className="strategy-hint">{st.hint}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={handleEvolve}
              disabled={streaming || apiKeySet === false}
            >
              {streaming ? '进化中...' : '进化 Skill'}
            </button>
          </>
        )}
      </div>

      {(streaming || evolved) && (
        <div className="compare-layout">
          <div className="compare-pane">
            <div className="compare-header">原版</div>
            <pre className="code-preview dim">{originalContent}</pre>
          </div>
          <div className="compare-pane">
            <div className="compare-header evolved-header">
              进化版
              {streaming && <span className="streaming-dot"> ●</span>}
            </div>
            <GeneratedPreview content={evolved} streaming={streaming} />
            {!streaming && evolved && !installed && (
              <InstallPanel content={evolved} onInstalled={setInstalled} />
            )}
            {installed && <div className="success-banner">✅ &quot;{installed.name}&quot; 已安装！</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Mode 3: 示例生成 ─────────────────────────────────────────────────────────

interface ExPair { id: number; input: string; output: string }

function ExamplesMode({ apiKeySet, cleanupRef }: {
  apiKeySet: boolean | null
  cleanupRef: React.MutableRefObject<(() => void) | null>
}) {
  const [pairs, setPairs] = useState<ExPair[]>([{ id: 1, input: '', output: '' }])
  const [desc, setDesc] = useState('')
  const [generated, setGenerated] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [installed, setInstalled] = useState<Skill | null>(null)
  const nextId = useRef(2)

  const addPair = () => {
    setPairs((p) => [...p, { id: nextId.current++, input: '', output: '' }])
  }
  const removePair = (id: number) => setPairs((p) => p.filter((x) => x.id !== id))
  const updatePair = (id: number, field: 'input' | 'output', val: string) =>
    setPairs((p) => p.map((x) => x.id === id ? { ...x, [field]: val } : x))

  const validPairs = pairs.filter((p) => p.input.trim() && p.output.trim())

  const handleGenerate = async () => {
    if (validPairs.length === 0) return
    setStreaming(true)
    setGenerated('')
    setInstalled(null)

    cleanupRef.current?.()
    cleanupRef.current = window.api.studio.onChunk(({ chunk, done }) => {
      if (!done) setGenerated((p) => p + chunk)
      else {
        setStreaming(false)
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    })

    try {
      await window.api.studio.generateFromExamples(
        validPairs.map(({ input, output }) => ({ input, output })),
        desc.trim() || undefined
      )
    } catch {
      setStreaming(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  return (
    <div className="mode-body">
      <div className="card">
        <h2>提供输入/输出示例</h2>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          AI 从示例中推断任务模式，生成对应的 Skill。
        </p>

        {pairs.map((pair, idx) => (
          <div key={pair.id} className="example-pair">
            <div className="pair-header">
              <span className="pair-num">示例 {idx + 1}</span>
              {pairs.length > 1 && (
                <button className="btn-icon-sm" onClick={() => removePair(pair.id)} title="删除">✕</button>
              )}
            </div>
            <div className="pair-fields">
              <textarea
                rows={3}
                placeholder="输入（Input）..."
                value={pair.input}
                onChange={(e) => updatePair(pair.id, 'input', e.target.value)}
                style={{ resize: 'vertical' }}
              />
              <textarea
                rows={3}
                placeholder="期望输出（Expected Output）..."
                value={pair.output}
                onChange={(e) => updatePair(pair.id, 'output', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
        ))}

        {pairs.length < 10 && (
          <button className="btn btn-ghost btn-sm" onClick={addPair} style={{ marginBottom: 16 }}>
            + 添加示例
          </button>
        )}

        <div className="field">
          <label className="field-label">补充说明（可选）</label>
          <input
            placeholder="例如：这是一个代码审查工具，专注于安全漏洞检测..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <button
          className="btn btn-primary"
          style={{ marginTop: 4 }}
          onClick={handleGenerate}
          disabled={streaming || validPairs.length === 0 || apiKeySet === false}
        >
          {streaming ? '生成中...' : `从 ${validPairs.length} 个示例生成 Skill`}
        </button>
      </div>

      {(streaming || generated) && (
        <div className="card">
          <h2>
            生成结果
            {streaming && <span className="streaming-dot"> ●</span>}
          </h2>
          <GeneratedPreview content={generated} streaming={streaming} />
          {!streaming && generated && !installed && (
            <InstallPanel content={generated} onInstalled={setInstalled} />
          )}
          {installed && <div className="success-banner">✅ &quot;{installed.name}&quot; 已安装！</div>}
        </div>
      )}
    </div>
  )
}

// ── Mode 4: 对话提炼 ──────────────────────────────────────────────────────────

function ExtractMode({ apiKeySet, cleanupRef }: {
  apiKeySet: boolean | null
  cleanupRef: React.MutableRefObject<(() => void) | null>
}) {
  const [conversation, setConversation] = useState('')
  const [generated, setGenerated] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [noSkill, setNoSkill] = useState(false)
  const [installed, setInstalled] = useState<Skill | null>(null)

  const handleExtract = async () => {
    if (!conversation.trim()) return
    setStreaming(true)
    setGenerated('')
    setNoSkill(false)
    setInstalled(null)

    cleanupRef.current?.()
    cleanupRef.current = window.api.studio.onChunk(({ chunk, done, noSkill: ns }) => {
      if (!done) setGenerated((p) => p + chunk)
      else {
        setStreaming(false)
        if (ns) setNoSkill(true)
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    })

    try {
      await window.api.studio.extract(conversation)
    } catch {
      setStreaming(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  return (
    <div className="mode-body">
      <div className="card">
        <h2>从对话中提炼 Skill</h2>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          粘贴一段对话（user/assistant 轮次），AI 判断是否包含可复用的稳定偏好或工作流，并提炼为 Skill。
        </p>
        <textarea
          rows={10}
          value={conversation}
          onChange={(e) => setConversation(e.target.value)}
          placeholder={'User: 每次写报告时，请不要使用被动语态，并在结尾加上行动项清单。\nAssistant: 好的，我会记住这个偏好...'}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
        />
        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          onClick={handleExtract}
          disabled={streaming || !conversation.trim() || apiKeySet === false}
        >
          {streaming ? '提炼中...' : '提炼 Skill'}
        </button>
      </div>

      {noSkill && !streaming && (
        <div className="card">
          <div className="no-skill-notice">
            <span style={{ fontSize: 20 }}>🔍</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>未发现可提炼内容</div>
              <div className="text-muted">这段对话是一次性请求，没有稳定的偏好或工作流值得提炼为 Skill。</div>
            </div>
          </div>
        </div>
      )}

      {(streaming || (generated && !noSkill)) && (
        <div className="card">
          <h2>
            提炼结果
            {streaming && <span className="streaming-dot"> ●</span>}
          </h2>
          <GeneratedPreview content={generated} streaming={streaming} />
          {!streaming && generated && !installed && (
            <InstallPanel content={generated} onInstalled={setInstalled} />
          )}
          {installed && <div className="success-banner">✅ &quot;{installed.name}&quot; 已安装！</div>}
        </div>
      )}
    </div>
  )
}

// ── Main StudioPage ───────────────────────────────────────────────────────────

const TABS: { id: StudioMode; label: string; icon: string }[] = [
  { id: 'describe', label: '描述生成', icon: '✍️' },
  { id: 'evolve',   label: '进化生成', icon: '🧬' },
  { id: 'examples', label: '示例生成', icon: '🔁' },
  { id: 'extract',  label: '对话提炼', icon: '💬' }
]

export default function StudioPage() {
  const [mode, setMode] = useState<StudioMode>('describe')
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    window.api.config.get().then((c) => setApiKeySet(c.providers.length > 0))
    return () => { cleanupRef.current?.() }
  }, [])

  return (
    <div className="studio-root">
      <div className="studio-header">
        <div>
          <h1>Studio</h1>
          <p className="subtitle">用 AI 创造和进化 Skills</p>
        </div>
      </div>

      {apiKeySet === false && (
        <div className="guard-banner">
          ⚠️ 未配置 API Key。请前往 <strong>Settings</strong> 添加后再使用 Studio。
        </div>
      )}

      <div className="mode-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`mode-tab ${mode === t.id ? 'active' : ''}`}
            onClick={() => { cleanupRef.current?.(); cleanupRef.current = null; setMode(t.id) }}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'describe' && <DescribeMode apiKeySet={apiKeySet} cleanupRef={cleanupRef} />}
      {mode === 'evolve'   && <EvolveMode   apiKeySet={apiKeySet} cleanupRef={cleanupRef} />}
      {mode === 'examples' && <ExamplesMode apiKeySet={apiKeySet} cleanupRef={cleanupRef} />}
      {mode === 'extract'  && <ExtractMode  apiKeySet={apiKeySet} cleanupRef={cleanupRef} />}

      <style>{`
        .studio-root { display: flex; flex-direction: column; gap: 0; }
        .studio-header { margin-bottom: 20px; }
        .studio-header h1 { font-size: 24px; font-weight: 700; }
        .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
        .guard-banner { background: rgba(250,204,21,0.08); border: 1px solid rgba(250,204,21,0.3); border-radius: var(--radius); padding: 12px 16px; color: var(--warning); font-size: 13px; margin-bottom: 16px; }

        /* Mode tabs */
        .mode-tabs { display: flex; gap: 6px; margin-bottom: 20px; }
        .mode-tab { display: flex; align-items: center; gap: 7px; padding: 8px 18px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 14px; font-weight: 500; cursor: pointer; transition: all var(--transition); }
        .mode-tab:hover { color: var(--text); border-color: var(--text-muted); }
        .mode-tab.active { background: var(--surface2); color: var(--text); border-color: var(--accent); }
        .tab-icon { font-size: 16px; }

        /* Cards */
        .mode-body { display: flex; flex-direction: column; gap: 20px; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; }
        .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
        .field { margin-bottom: 12px; }
        .field-label { display: block; font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 6px; }
        .text-muted { color: var(--text-muted); font-size: 13px; }

        /* Code preview */
        .preview-box { }
        .code-preview { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; font-size: 12px; font-family: 'Courier New', monospace; white-space: pre-wrap; word-break: break-all; max-height: 360px; overflow-y: auto; color: var(--text); line-height: 1.65; margin-bottom: 12px; }
        .code-preview.dim { color: var(--text-muted); }
        .streaming-dot { color: var(--accent); animation: blink 1s step-end infinite; }
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.2} }

        /* Install */
        .install-panel { margin-top: 4px; }
        .install-row { display: flex; gap: 10px; align-items: center; }
        .success-banner { margin-top: 10px; background: rgba(74,222,128,0.1); border: 1px solid var(--success); border-radius: var(--radius); padding: 10px 14px; color: var(--success); font-size: 13px; }

        /* Evolve — score bars */
        .scores-section { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; margin-bottom: 16px; }
        .scores-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 13px; font-weight: 500; }
        .scores-hint { font-size: 11px; color: var(--text-muted); }
        .score-bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .score-dim { font-size: 12px; color: var(--text-muted); width: 100px; flex-shrink: 0; text-transform: capitalize; }
        .score-track { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .score-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
        .score-val { font-size: 12px; font-weight: 600; width: 32px; text-align: right; }

        /* Evolve — strategy */
        .strategy-section { }
        .strategy-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
        .strategy-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all var(--transition); }
        .strategy-item:hover { border-color: var(--accent); background: rgba(108,99,255,0.04); }
        .strategy-item.active { border-color: var(--accent); background: rgba(108,99,255,0.08); }
        .strategy-item input[type=radio] { margin-top: 3px; accent-color: var(--accent); }
        .strategy-label { font-size: 13px; font-weight: 600; }
        .strategy-hint { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

        /* Evolve — side-by-side compare */
        .compare-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .compare-pane { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; display: flex; flex-direction: column; }
        .compare-header { padding: 10px 14px; font-size: 12px; font-weight: 600; color: var(--text-muted); background: var(--surface2); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.05em; }
        .evolved-header { color: var(--accent); }
        .compare-pane .code-preview { border: none; border-radius: 0; margin-bottom: 0; flex: 1; }
        .compare-pane .install-panel { padding: 12px 14px; border-top: 1px solid var(--border); }

        /* Examples */
        .example-pair { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 10px; }
        .pair-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .pair-num { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .btn-icon-sm { background: transparent; color: var(--text-muted); font-size: 11px; padding: 2px 5px; border-radius: 3px; }
        .btn-icon-sm:hover { color: var(--danger); background: rgba(239,68,68,0.1); }
        .pair-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pair-fields textarea { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 12px; padding: 8px 10px; }
        .pair-fields textarea:focus { outline: none; border-color: var(--accent); }
        .btn-sm { padding: 6px 12px; font-size: 12px; }

        /* 5D Score Panel */
        .score5d-panel { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; margin-bottom: 12px; }
        .score5d-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 13px; font-weight: 600; }
        .score5d-avg { font-size: 15px; font-weight: 700; }
        .score5d-loading { font-size: 12px; color: var(--text-muted); text-align: center; padding: 8px 0; }

        /* Trust Badge */
        .trust-badge { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; border: 1px solid; letter-spacing: 0.04em; margin-left: 6px; }

        /* Similar Skills Warning */
        .similar-warning { display: flex; gap: 10px; align-items: flex-start; background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.3); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 12px; }
        .similar-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
        .similar-title { font-size: 12px; font-weight: 600; color: var(--warning); margin-bottom: 6px; }
        .similar-list { display: flex; flex-wrap: wrap; gap: 6px; }
        .similar-item { font-size: 12px; color: var(--text); background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; display: flex; align-items: center; }

        /* Extract — no skill notice */
        .no-skill-notice { display: flex; gap: 14px; align-items: flex-start; padding: 4px 0; }
      `}</style>
    </div>
  )
}
