import { useState, useEffect, useRef, useCallback } from 'react'
import type { Skill, SkillScore5D, TestCase, GithubSkillResult } from '../../../shared/types'
import { SKILLNET_SKILLS, type DiscoverySkill } from '../data/studio-discovery'

// ── Types ──────────────────────────────────────────────────────────────────────

type StudioMode = 'describe' | 'examples' | 'extract' | 'edit' | 'agent'
type MethodType = 'builtin' | 'external'
type DiscoverySource = 'skillnet' | 'github' | 'mine'
type ValTab = 'quicktest' | 'compare' | 'oneclick'

interface AgentFields {
  name: string
  goal: string
  tools: string[]
  steps: string
}

interface GenerationMethod {
  id: string
  label: string
  icon: string
  type: MethodType
  url?: string
  hint?: string
  sourceUrl?: string
  sourceName?: string
}

interface ExPair { id: number; input: string; output: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_METHODS: GenerationMethod[] = [
  { id: 'builtin', label: '内置 AI', icon: '⚡', type: 'builtin', sourceName: 'SkillNexus', sourceUrl: 'https://github.com/skyseraph/SkillNexus' },
  { id: 'skill-creator', label: 'Skill Creator', icon: '🧩', type: 'builtin', sourceName: 'Karpathy Guidelines', sourceUrl: 'https://github.com/forrestchang/andrej-karpathy-skills' },
  { id: 'promptperfect', label: 'PromptPerfect', icon: '✨', type: 'builtin', sourceName: 'PromptPerfect', sourceUrl: 'https://promptperfect.jina.ai' }
]

const SCORE_5D_COLORS: Record<string, string> = {
  safety: '#ef4444', completeness: '#6c63ff', executability: '#00d4aa',
  maintainability: '#f59e0b', costAwareness: '#8b5cf6', orchestration: '#f97316'
}
const SCORE_5D_SHORT: Record<string, string> = {
  safety: 'Safe', completeness: 'Comp', executability: 'Exec',
  maintainability: 'Maint', costAwareness: 'Cost', orchestration: 'Orch'
}
const SCORE_5D_KEYS = ['safety', 'completeness', 'executability', 'maintainability', 'costAwareness'] as const

const PRESET_TOOLS = [
  'web_search', 'code_exec', 'file_read', 'file_write',
  'shell', 'browser', 'mcp_tool', 'sub_skill'
]

const STRATEGIES = [
  { id: 'improve_weak', label: '修复薄弱维度', hint: '针对评分最低维度重点改进' },
  { id: 'expand',       label: '扩展能力边界', hint: '增加新能力和更广的适用场景' },
  { id: 'simplify',     label: '精简聚焦',     hint: '提炼核心，让 Skill 更简洁' },
  { id: 'add_examples', label: '补充示例',     hint: '添加具体示例和边界情况说明' }
]

// ── DiscoveryPanel ────────────────────────────────────────────────────────────

function DiscoveryPanel({
  onLoad, mySkills
}: {
  onLoad: (content: string) => void
  mySkills: Skill[]
}) {
  const [source, setSource] = useState<DiscoverySource>('skillnet')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  // GitHub search state
  const [ghResults, setGhResults] = useState<GithubSkillResult[]>([])
  const [ghLoading, setGhLoading] = useState(false)
  const [ghError, setGhError] = useState<string | null>(null)
  const [ghSearched, setGhSearched] = useState(false)
  const [ghLoadingId, setGhLoadingId] = useState<string | null>(null)

  const filterSkillnet = useCallback((s: DiscoverySkill) => {
    const q = search.toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.includes(q))
  }, [search])

  const filterMine = useCallback((s: Skill) => {
    const q = search.toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || s.tags.some(t => t.includes(q))
  }, [search])

  const avg5D = (s: DiscoverySkill) => {
    const vals = SCORE_5D_KEYS.map(k => s.score5D[k])
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }

  const handleGithubSearch = useCallback(async () => {
    if (!search.trim()) return
    setGhLoading(true)
    setGhError(null)
    setGhSearched(true)
    try {
      const results = await window.api.studio.searchGithub(search.trim())
      setGhResults(results)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setGhError(msg.includes('rate limit')
        ? '已达 GitHub 搜索频率限制（10次/分钟）。可在 Settings 中添加 GitHub Token 提升限额。'
        : msg)
      setGhResults([])
    } finally {
      setGhLoading(false)
    }
  }, [search])

  return (
    <div className="studio-v2-disc-panel">
      <div className="studio-v2-disc-sources">
        {(['skillnet', 'github', 'mine'] as DiscoverySource[]).map(src => (
          <button key={src} className={`studio-v2-src-tab ${source === src ? 'active' : ''}`}
            onClick={() => { setSource(src); setSearch(''); setGhError(null) }}>
            {src === 'skillnet' ? 'SkillNet' : src === 'github' ? 'GitHub' : '我的库'}
          </button>
        ))}
      </div>

      <div className="studio-v2-disc-search">
        <input
          placeholder={source === 'github' ? '搜索 GitHub .md 文件...' : '搜索...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && source === 'github') handleGithubSearch() }}
        />
        {source === 'github' && (
          <button
            className="studio-v2-card-btn"
            onClick={handleGithubSearch}
            disabled={ghLoading || !search.trim()}
            style={{ marginTop: 4, width: '100%' }}
          >
            {ghLoading ? '搜索中...' : '搜索 GitHub'}
          </button>
        )}
      </div>

      <div className="studio-v2-skill-list">
        {source === 'skillnet' && SKILLNET_SKILLS.filter(filterSkillnet).map(s => (
          <div key={s.id} className="studio-v2-skill-card">
            <div className="studio-v2-card-header">
              <span className="studio-v2-card-name">
                {s.name}
                {s.skillType === 'agent' && <span className="studio-v2-agent-badge">Agent</span>}
              </span>
              <span className="studio-v2-card-stars">★ {s.stars}</span>
            </div>
            <div className="studio-v2-card-desc">{s.description}</div>
            <div className="studio-v2-card-footer">
              <div className="studio-v2-card-tags">
                {s.tags.slice(0, 2).map(t => <span key={t} className="studio-v2-tag">{t}</span>)}
              </div>
              <span className="studio-v2-card-score">5D {avg5D(s)}</span>
            </div>
            <div className="studio-v2-card-actions">
              <button className="studio-v2-card-btn" onClick={() => setPreview(s.content)}>预览</button>
              <button className="studio-v2-card-btn primary" onClick={() => onLoad(s.content)}>载入</button>
            </div>
          </div>
        ))}

        {source === 'github' && (
          <>
            {ghError && <div className="studio-v2-gh-error">{ghError}</div>}
            {!ghSearched && !ghLoading && (
              <div className="studio-v2-empty">输入关键词后按 Enter 或点击搜索</div>
            )}
            {ghSearched && !ghLoading && ghResults.length === 0 && !ghError && (
              <div className="studio-v2-empty">未找到相关 .md 文件</div>
            )}
            {ghResults.map(r => (
              <div key={r.id} className="studio-v2-skill-card">
                <div className="studio-v2-card-header">
                  <span className="studio-v2-card-name">{r.name}</span>
                  <span className="studio-v2-card-stars">★ {r.stars}</span>
                </div>
                <div className="studio-v2-card-desc">{r.repoName}</div>
                {r.description && <div className="studio-v2-card-desc">{r.description}</div>}
                <div className="studio-v2-card-footer">
                  <div className="studio-v2-card-tags">
                    {r.tags.slice(0, 2).map(t => <span key={t} className="studio-v2-tag">{t}</span>)}
                  </div>
                </div>
                <div className="studio-v2-card-actions">
                  <button className="studio-v2-card-btn" onClick={() => window.api.shell.openExternal(r.url)}>
                    打开 →
                  </button>
                  <button
                    className="studio-v2-card-btn primary"
                    disabled={ghLoadingId === r.id}
                    onClick={async () => {
                      setGhLoadingId(r.id)
                      setGhError(null)
                      try {
                        const content = await window.api.studio.fetchGithubContent(r.rawUrl)
                        onLoad(content)
                      } catch (e) {
                        setGhError(e instanceof Error ? e.message : '载入失败')
                      } finally {
                        setGhLoadingId(null)
                      }
                    }}
                  >
                    {ghLoadingId === r.id ? '载入中...' : '载入'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {source === 'mine' && mySkills.filter(filterMine).map(s => (
          <div key={s.id} className="studio-v2-skill-card">
            <div className="studio-v2-card-header">
              <span className="studio-v2-card-name">{s.name}</span>
              <span className="studio-v2-card-version">v{s.version}</span>
            </div>
            <div className="studio-v2-card-footer">
              <div className="studio-v2-card-tags">
                {s.tags.slice(0, 2).map(t => <span key={t} className="studio-v2-tag">{t}</span>)}
              </div>
            </div>
            <div className="studio-v2-card-actions">
              <button className="studio-v2-card-btn primary" onClick={() => onLoad(s.markdownContent)}>载入</button>
            </div>
          </div>
        ))}

        {source === 'mine' && mySkills.filter(filterMine).length === 0 && (
          <div className="studio-v2-empty">暂无已安装 Skill</div>
        )}
      </div>

      {preview && (
        <div className="studio-v2-preview-overlay" onClick={() => setPreview(null)}>
          <div className="studio-v2-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="studio-v2-preview-header">
              <span>预览</span>
              <button onClick={() => setPreview(null)}>✕</button>
            </div>
            <pre className="studio-v2-preview-content">{preview}</pre>
            <div className="studio-v2-preview-footer">
              <button className="studio-v2-btn primary" onClick={() => { onLoad(preview!); setPreview(null) }}>
                载入到编辑器
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MethodBar ─────────────────────────────────────────────────────────────────

function MethodBar({
  methods, activeId, onSelect, onAddCustom
}: {
  methods: GenerationMethod[]
  activeId: string
  onSelect: (id: string) => void
  onAddCustom: () => void
}) {
  const active = methods.find(m => m.id === activeId)
  return (
    <div className="studio-v2-method-bar">
      <span className="studio-v2-method-label">生成方式</span>
      <div className="studio-v2-method-list">
        {methods.map(m => (
          <button
            key={m.id}
            className={`studio-v2-method-chip ${m.type === 'external' ? 'external' : ''} ${activeId === m.id ? 'active' : ''}`}
            onClick={() => onSelect(m.id)}
          >
            {m.icon} {m.label}
          </button>
        ))}
        <button className="studio-v2-method-chip add" onClick={onAddCustom}>+ 自定义</button>
      </div>
      {active?.sourceUrl && (
        <button
          className="studio-v2-method-source"
          onClick={() => window.api.shell.openExternal(active.sourceUrl!)}
          title={`查看 ${active.sourceName || active.label} 出处`}
        >
          🔗 {active.sourceName || '出处'}
        </button>
      )}
    </div>
  )
}

// ── MethodHint ────────────────────────────────────────────────────────────────

function MethodHint({ method }: { method: GenerationMethod }) {
  if (method.type !== 'external') return null
  return (
    <div className="studio-v2-method-hint">
      <span className="studio-v2-hint-icon">🔗</span>
      <span>{method.hint}</span>
      <button className="studio-v2-hint-link" onClick={() => window.api.shell.openExternal(method.url!)}>
        打开 {method.label} →
      </button>
    </div>
  )
}

// ── SkillCreatorPanel ─────────────────────────────────────────────────────────

function SkillCreatorPanel({ streaming, apiKeySet, onGenerate }: {
  streaming: boolean
  apiKeySet: boolean | null
  onGenerate: (fields: { name: string; description: string; steps: string; tags: string }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  const [tags, setTags] = useState('')

  const canSubmit = name.trim() && description.trim() && !streaming && apiKeySet !== false

  return (
    <div className="studio-v2-input-area studio-v2-skill-creator">
      <div className="studio-v2-sc-grid">
        <div className="studio-v2-sc-field">
          <label>Skill 名称 <span className="studio-v2-sc-req">*</span></label>
          <input
            placeholder="例如：MeetingMinutesExtractor"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="studio-v2-sc-field">
          <label>标签（逗号分隔）</label>
          <input
            placeholder="例如：meeting, summary, action-items"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />
        </div>
      </div>
      <div className="studio-v2-sc-field">
        <label>功能描述 <span className="studio-v2-sc-req">*</span></label>
        <textarea
          rows={2}
          placeholder="这个 Skill 做什么？例如：从会议记录中提取行动项，包含负责人和截止日期"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <div className="studio-v2-sc-field">
        <label>执行步骤（可选）</label>
        <textarea
          rows={3}
          placeholder="分步描述 AI 应如何处理输入，例如：&#10;1. 识别所有行动项&#10;2. 提取负责人姓名&#10;3. 格式化为 Markdown 表格"
          value={steps}
          onChange={e => setSteps(e.target.value)}
        />
      </div>
      <button
        className="studio-v2-btn primary"
        onClick={() => onGenerate({ name, description, steps, tags })}
        disabled={!canSubmit}
      >
        {streaming ? '生成中...' : '🧩 生成 Skill'}
      </button>
    </div>
  )
}

// ── PromptPerfectPanel ────────────────────────────────────────────────────────

function PromptPerfectPanel({ editorContent, streaming, apiKeySet, onOptimize }: {
  editorContent: string
  streaming: boolean
  apiKeySet: boolean | null
  onOptimize: (target: string, goal: string) => void
}) {
  const [goal, setGoal] = useState('clarity')
  const GOALS = [
    { id: 'clarity', label: '清晰度', desc: '让指令更清晰、无歧义' },
    { id: 'specificity', label: '具体性', desc: '增加具体约束和输出格式要求' },
    { id: 'robustness', label: '鲁棒性', desc: '处理边缘情况和异常输入' },
    { id: 'conciseness', label: '简洁性', desc: '去除冗余，保留核心指令' },
  ]
  const hasContent = editorContent.trim().length > 0
  const canOptimize = hasContent && !streaming && apiKeySet !== false

  return (
    <div className="studio-v2-input-area studio-v2-promptperfect">
      <div className="studio-v2-pp-goals">
        {GOALS.map(g => (
          <button
            key={g.id}
            className={`studio-v2-pp-goal ${goal === g.id ? 'active' : ''}`}
            onClick={() => setGoal(g.id)}
            title={g.desc}
          >
            {g.label}
          </button>
        ))}
      </div>
      {!hasContent && (
        <div className="studio-v2-pp-hint">请先在编辑器中输入或载入 Skill 内容，再进行优化</div>
      )}
      {hasContent && (
        <div className="studio-v2-pp-preview">
          <span className="studio-v2-pp-preview-label">当前内容</span>
          <span className="studio-v2-pp-preview-len">{editorContent.length} 字符</span>
        </div>
      )}
      <button
        className="studio-v2-btn primary"
        onClick={() => onOptimize(editorContent, goal)}
        disabled={!canOptimize}
      >
        {streaming ? '优化中...' : `✨ 优化（${GOALS.find(g2 => g2.id === goal)?.label}）`}
      </button>
    </div>
  )
}

// ── CustomMethodModal ─────────────────────────────────────────────────────────

function CustomMethodModal({ onAdd, onClose }: {
  onAdd: (m: GenerationMethod) => void
  onClose: () => void
}) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')

  const handleAdd = () => {
    if (!label.trim()) { setErr('请输入名称'); return }
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      setErr('URL 必须以 https:// 或 http:// 开头'); return
    }
    onAdd({ id: `custom-${Date.now()}`, label: label.trim(), icon: '🔗', type: 'external', url, hint: `在 ${label} 完成后将内容粘贴至编辑器` })
    onClose()
  }

  return (
    <div className="studio-v2-modal-overlay" onClick={onClose}>
      <div className="studio-v2-modal" onClick={e => e.stopPropagation()}>
        <div className="studio-v2-modal-title">添加自定义生成方法</div>
        <div className="studio-v2-modal-field">
          <label>名称</label>
          <input placeholder="例如：My Prompt Tool" value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div className="studio-v2-modal-field">
          <label>URL</label>
          <input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
        </div>
        {err && <div className="studio-v2-modal-err">{err}</div>}
        <div className="studio-v2-modal-actions">
          <button className="studio-v2-btn ghost" onClick={onClose}>取消</button>
          <button className="studio-v2-btn primary" onClick={handleAdd}>添加</button>
        </div>
      </div>
    </div>
  )
}

// ── InputArea ─────────────────────────────────────────────────────────────────

function InputAreaDescribe({ prompt, setPrompt, streaming, apiKeySet, onGenerate, isExternal }: {
  prompt: string; setPrompt: (v: string) => void
  streaming: boolean; apiKeySet: boolean | null
  onGenerate: () => void; isExternal: boolean
}) {
  return (
    <div className="studio-v2-input-area">
      <textarea
        rows={4}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="描述你想要的 Skill，例如：把会议记录整理成行动项（含负责人和截止日期）..."
      />
      <button
        className="studio-v2-btn primary"
        onClick={onGenerate}
        disabled={streaming || !prompt.trim() || apiKeySet === false}
      >
        {streaming ? '生成中...' : isExternal ? '生成（跳转外部）' : '生成 Skill'}
      </button>
    </div>
  )
}

function InputAreaExamples({ pairs, setPairs, desc, setDesc, streaming, apiKeySet, onGenerate, isExternal }: {
  pairs: ExPair[]; setPairs: (p: ExPair[]) => void
  desc: string; setDesc: (v: string) => void
  streaming: boolean; apiKeySet: boolean | null
  onGenerate: () => void; isExternal: boolean
}) {
  const nextId = useRef(pairs.length + 1)
  const addPair = () => setPairs([...pairs, { id: nextId.current++, input: '', output: '' }])
  const removePair = (id: number) => setPairs(pairs.filter(p => p.id !== id))
  const updatePair = (id: number, field: 'input' | 'output', val: string) =>
    setPairs(pairs.map(p => p.id === id ? { ...p, [field]: val } : p))
  const valid = pairs.filter(p => p.input.trim() && p.output.trim())

  return (
    <div className="studio-v2-input-area">
      {pairs.map((pair, idx) => (
        <div key={pair.id} className="studio-v2-ex-pair">
          <div className="studio-v2-ex-header">
            <span>示例 {idx + 1}</span>
            {pairs.length > 1 && <button className="studio-v2-icon-btn" onClick={() => removePair(pair.id)}>✕</button>}
          </div>
          <div className="studio-v2-ex-fields">
            <textarea rows={2} placeholder="输入 Input..." value={pair.input}
              onChange={e => updatePair(pair.id, 'input', e.target.value)} />
            <textarea rows={2} placeholder="期望输出 Expected Output..." value={pair.output}
              onChange={e => updatePair(pair.id, 'output', e.target.value)} />
          </div>
        </div>
      ))}
      {pairs.length < 10 && (
        <button className="studio-v2-btn ghost sm" onClick={addPair}>+ 添加示例</button>
      )}
      <input
        placeholder="补充说明（可选）..."
        value={desc} onChange={e => setDesc(e.target.value)}
        style={{ marginTop: 8 }}
      />
      <button
        className="studio-v2-btn primary"
        onClick={onGenerate}
        disabled={streaming || valid.length === 0 || apiKeySet === false}
      >
        {streaming ? '生成中...' : isExternal ? '生成（跳转外部）' : `从 ${valid.length} 个示例生成`}
      </button>
    </div>
  )
}

function InputAreaExtract({ streaming, apiKeySet, onExtract }: {
  streaming: boolean; apiKeySet: boolean | null
  onExtract: (conversation: string) => void
}) {
  const [limit, setLimit] = useState(10)
  const [records, setRecords] = useState<{ skillName: string; inputPrompt: string; output: string; createdAt: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadRecords = useCallback(async (n: number) => {
    setLoading(true)
    try {
      const rows = await window.api.studio.recentEvalHistory(n)
      setRecords(rows)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRecords(10) }, [])

  const handleLimitChange = (n: number) => {
    setLimit(n)
    loadRecords(n)
  }

  const handleExtract = () => {
    if (records.length === 0) return
    const conversation = records.map(r =>
      `[${r.skillName}]\nUser: ${r.inputPrompt}\nAssistant: ${r.output}`
    ).join('\n\n---\n\n')
    onExtract(conversation)
  }

  return (
    <div className="studio-v2-input-area">
      <div className="studio-v2-extract-header">
        <p className="studio-v2-hint-text">从最近的 Eval 记录中自动提炼可复用 Skill</p>
        <div className="studio-v2-extract-limit">
          {[5, 10, 20].map(n => (
            <button key={n} className={`studio-v2-limit-chip ${limit === n ? 'active' : ''}`}
              onClick={() => handleLimitChange(n)}>
              最近 {n} 条
            </button>
          ))}
        </div>
      </div>
      {loading && <div className="studio-v2-empty">加载中...</div>}
      {loaded && !loading && records.length === 0 && (
        <div className="studio-v2-empty">暂无 Eval 记录，请先运行评测</div>
      )}
      {loaded && !loading && records.length > 0 && (
        <div className="studio-v2-extract-preview">
          {records.slice(0, 3).map((r, i) => (
            <div key={i} className="studio-v2-extract-record">
              <span className="studio-v2-extract-skill">{r.skillName}</span>
              <span className="studio-v2-extract-input">{r.inputPrompt.slice(0, 60)}{r.inputPrompt.length > 60 ? '…' : ''}</span>
            </div>
          ))}
          {records.length > 3 && (
            <div className="studio-v2-extract-more">+ {records.length - 3} 条更多记录</div>
          )}
        </div>
      )}
      <button
        className="studio-v2-btn primary"
        onClick={handleExtract}
        disabled={streaming || records.length === 0 || apiKeySet === false}
      >
        {streaming ? '提炼中...' : `💬 自动提炼（${records.length} 条记录）`}
      </button>
    </div>
  )
}

// ── Score5DMini ───────────────────────────────────────────────────────────────

function Score5DMini({ scores, loading }: { scores: SkillScore5D | null; loading: boolean }) {
  if (loading) return <span className="studio-v2-score-mini-loading">评分中...</span>
  if (!scores) return null
  const isAgent = (scores.orchestration ?? 0) > 0
  const displayKeys = isAgent
    ? (['safety', 'completeness', 'executability', 'maintainability', 'orchestration'] as const)
    : SCORE_5D_KEYS
  const avg = displayKeys.reduce((a, k) => a + (scores[k] ?? 0), 0) / displayKeys.length
  return (
    <div className="studio-v2-score-mini">
      {displayKeys.map(k => (
        <span key={k} className="studio-v2-score-pill" style={{ color: SCORE_5D_COLORS[k], borderColor: `${SCORE_5D_COLORS[k]}44` }}>
          {SCORE_5D_SHORT[k]} {(scores[k] ?? 0).toFixed(1)}
        </span>
      ))}
      <span className="studio-v2-score-avg" style={{ color: avg >= 7 ? 'var(--success)' : avg >= 5 ? 'var(--warning)' : 'var(--danger)' }}>
        avg {avg.toFixed(1)}
      </span>
    </div>
  )
}

// ── SimilarWarn ───────────────────────────────────────────────────────────────

function SimilarWarn({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) return null
  return (
    <div className="studio-v2-similar-warn">
      <span>⚠️</span>
      <span>发现相似 Skill，考虑更新而非新建：{skills.map(s => s.name).join('、')}</span>
    </div>
  )
}

// ── InstallBar ────────────────────────────────────────────────────────────────

function InstallBar({ content, scores, scoring, similar, onInstalled }: {
  content: string
  scores: SkillScore5D | null
  scoring: boolean
  similar: Skill[]
  onInstalled: (s: Skill) => void
}) {
  const [name, setName] = useState('')
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const m = content.match(/^---\s*\n[\s\S]*?name:\s*(.+?)\s*\n/m)
    if (m) setName(m[1].trim())
  }, [content])

  const handleInstall = async () => {
    if (!name.trim()) return
    setInstalling(true)
    try {
      const skill = await window.api.studio.install(content, name.trim())
      onInstalled(skill)
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="studio-v2-install-bar">
      <SimilarWarn skills={similar} />
      <Score5DMini scores={scores} loading={scoring} />
      <div className="studio-v2-install-row">
        <input
          placeholder="Skill 名称..."
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <button className="studio-v2-btn primary" onClick={handleInstall} disabled={installing || !name.trim()}>
          {installing ? '安装中...' : '安装 Skill'}
        </button>
      </div>
    </div>
  )
}

// ── QuickRunPane (pre-install) ────────────────────────────────────────────────

function QuickRunPane({ editorContent, apiKeySet }: { editorContent: string; apiKeySet: boolean | null }) {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  const handleRun = () => {
    if (!input.trim() || running) return
    setRunning(true)
    setOutput('')

    const prompt =
      `你是一个 AI 助手，以下是你的 Skill 指令：\n\n<skill>\n${editorContent}\n</skill>\n\n用户输入：\n${input.trim()}\n\n请按照 Skill 指令处理用户输入，直接输出结果。`

    cleanupRef.current?.()
    cleanupRef.current = window.api.studio.onChunk(({ chunk, done }) => {
      if (!done) setOutput(p => p + chunk)
      else {
        setRunning(false)
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    })

    window.api.studio.generateStream(prompt).catch(() => {
      setRunning(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    })
  }

  useEffect(() => () => { cleanupRef.current?.() }, [])

  return (
    <div className="studio-v2-quickrun">
      <div className="studio-v2-quickrun-label">⚡ 快速运行 <span className="studio-v2-quickrun-hint">安装前体验效果</span></div>
      <div className="studio-v2-qt-row">
        <textarea
          rows={2}
          placeholder="输入测试内容，直接体验 Skill 效果..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={running || apiKeySet === false}
        />
        <button className="studio-v2-btn primary" onClick={handleRun}
          disabled={running || !input.trim() || apiKeySet === false}>
          {running ? '运行中...' : '▶ 运行'}
        </button>
      </div>
      {output && (
        <div className="studio-v2-quickrun-output">
          <div className="studio-v2-qt-output-label">输出{running && <span className="studio-v2-streaming-dot"> ●</span>}</div>
          <pre>{output}{running ? '▌' : ''}</pre>
        </div>
      )}
    </div>
  )
}

// ── OneClickEvalPane ──────────────────────────────────────────────────────────

function OneClickEvalPane({ installedSkill }: { installedSkill: Skill }) {
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ totalScore: number; scores: Record<string, { score: number }> } | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    window.api.testcases.getBySkill(installedSkill.id).then(tcs => setTestCases(tcs.slice(0, 5)))
  }, [installedSkill.id])

  const handleEval = async () => {
    if (testCases.length === 0 || running) return
    setRunning(true)
    setProgress(0)
    setResult(null)

    cleanupRef.current?.()
    cleanupRef.current = window.api.eval.onProgress(({ progress: p }) => {
      setProgress(p)
      if (p >= 100) {
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    })

    try {
      await window.api.eval.start(installedSkill.id, testCases.map(t => t.id))
      const history = await window.api.eval.history(installedSkill.id)
      const latest = history.items?.[0]
      if (latest) setResult({ totalScore: latest.totalScore, scores: latest.scores })
    } finally {
      setRunning(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  useEffect(() => () => { cleanupRef.current?.() }, [])

  if (testCases.length === 0) {
    return (
      <div className="studio-v2-val-empty">
        暂无测试用例，请先
        <button className="studio-v2-link-btn" onClick={() => window.api.testcases.generate(installedSkill.id, 3)
          .then(tcs => setTestCases(tcs.slice(0, 5)))}>
          自动生成用例
        </button>
      </div>
    )
  }

  return (
    <div className="studio-v2-oneclick">
      <div className="studio-v2-oneclick-cases">
        {testCases.map(tc => (
          <div key={tc.id} className="studio-v2-oneclick-case">
            <span className="studio-v2-oneclick-case-name">{tc.name}</span>
            <span className="studio-v2-oneclick-case-type">{tc.judgeType}</span>
          </div>
        ))}
      </div>
      <button className="studio-v2-btn primary sm" onClick={handleEval} disabled={running}>
        {running ? `测评中 ${progress}%` : `▶ 一键测评 (${testCases.length} 条用例)`}
      </button>
      {running && (
        <div className="studio-v2-progress-bar-wrap">
          <div className="studio-v2-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}
      {result && (
        <div className="studio-v2-oneclick-result">
          <span className="studio-v2-oneclick-total"
            style={{ color: result.totalScore >= 7 ? 'var(--success)' : 'var(--warning)' }}>
            总分 {result.totalScore.toFixed(1)}
          </span>
          <div className="studio-v2-score-pills">
            {Object.entries(result.scores).map(([dim, s]) => (
              <span key={dim} className="studio-v2-score-pill"
                style={{ background: `${SCORE_5D_COLORS[dim] ?? '#888'}22`, color: SCORE_5D_COLORS[dim] ?? '#888', borderColor: `${SCORE_5D_COLORS[dim] ?? '#888'}55` }}>
                {SCORE_5D_SHORT[dim] ?? dim} {s.score.toFixed(1)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── AgentDesignPanel ──────────────────────────────────────────────────────────

function AgentDesignPanel({ streaming, apiKeySet, onGenerate }: {
  streaming: boolean
  apiKeySet: boolean | null
  onGenerate: (fields: AgentFields) => void
}) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [tools, setTools] = useState<string[]>([])
  const [steps, setSteps] = useState('')

  const toggleTool = (t: string) =>
    setTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const canGenerate = name.trim() && goal.trim() && steps.trim() && !streaming && apiKeySet !== false

  return (
    <div className="studio-v2-agent-panel">
      <div className="studio-v2-agent-field">
        <label>Agent 名称</label>
        <input placeholder="e.g. Research Agent" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="studio-v2-agent-field">
        <label>目标描述</label>
        <textarea rows={2} placeholder="这个 Agent 要完成什么任务？" value={goal} onChange={e => setGoal(e.target.value)} />
      </div>
      <div className="studio-v2-agent-field">
        <label>工具声明 <span className="studio-v2-agent-field-hint">（可多选）</span></label>
        <div className="studio-v2-tool-chips">
          {PRESET_TOOLS.map(t => (
            <button key={t}
              className={`studio-v2-tool-chip ${tools.includes(t) ? 'active' : ''}`}
              onClick={() => toggleTool(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="studio-v2-agent-field">
        <label>执行步骤</label>
        <textarea rows={4} placeholder="描述 Agent 的执行步骤，例如：先搜索资料，再提炼关键信息，最后生成报告..." value={steps} onChange={e => setSteps(e.target.value)} />
      </div>
      <button className="studio-v2-btn primary" disabled={!canGenerate}
        onClick={() => onGenerate({ name, goal, tools, steps })}>
        {streaming ? '生成中...' : '🤖 生成 Agent'}
      </button>
    </div>
  )
}

// ── QuickTestPane ─────────────────────────────────────────────────────────────

function QuickTestPane({ installedSkill }: { installedSkill: Skill | null }) {
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ output: string; totalScore: number } | null>(null)
  const [saved, setSaved] = useState(false)
  const [tempTcId, setTempTcId] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const handleRun = async () => {
    if (!installedSkill || !input.trim()) return
    setRunning(true)
    setResult(null)
    setSaved(false)

    try {
      const tc: Omit<TestCase, 'id' | 'createdAt'> = {
        skillId: installedSkill.id,
        name: `快速测试 ${new Date().toLocaleTimeString()}`,
        input: input.trim(),
        judgeType: 'llm',
        judgeParam: '判断输出是否符合任务要求，是否完整、准确'
      }
      const created = await window.api.testcases.create(tc)
      setTempTcId(created.id)

      cleanupRef.current?.()
      cleanupRef.current = window.api.eval.onProgress(({ jobId: _j, progress, message: _m }) => {
        if (progress >= 100) {
          setRunning(false)
          cleanupRef.current?.()
          cleanupRef.current = null
        }
      })

      await window.api.eval.start(installedSkill.id, [created.id])

      const history = await window.api.eval.history(installedSkill.id)
      const latest = history.items?.[0]
      if (latest) {
        setResult({ output: latest.output, totalScore: latest.totalScore })
      }
      setRunning(false)
    } catch {
      setRunning(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  const handleSave = () => setSaved(true)

  const handleDiscard = async () => {
    if (tempTcId) {
      await window.api.testcases.delete(tempTcId)
      setTempTcId(null)
    }
    setResult(null)
  }

  if (!installedSkill) {
    return <div className="studio-v2-val-empty">请先安装 Skill 后再快速测试</div>
  }

  return (
    <div className="studio-v2-quicktest">
      <div className="studio-v2-qt-row">
        <textarea
          rows={3}
          placeholder="输入测试内容..."
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button className="studio-v2-btn primary" onClick={handleRun} disabled={running || !input.trim()}>
          {running ? '运行中...' : '▶ 运行'}
        </button>
      </div>
      {result && (
        <div className="studio-v2-qt-result">
          <div className="studio-v2-qt-output">
            <div className="studio-v2-qt-output-label">
              输出
              <span className="studio-v2-qt-score" style={{ color: result.totalScore >= 7 ? 'var(--success)' : 'var(--warning)' }}>
                评分 {result.totalScore.toFixed(1)}
              </span>
            </div>
            <pre>{result.output}</pre>
          </div>
          {!saved && (
            <div className="studio-v2-qt-actions">
              <button className="studio-v2-btn ghost sm" onClick={handleDiscard}>丢弃</button>
              <button className="studio-v2-btn sm" onClick={handleSave}>保存用例</button>
            </div>
          )}
          {saved && <div className="studio-v2-success-note">✅ 用例已保存</div>}
        </div>
      )}
    </div>
  )
}

// ── ComparePane ───────────────────────────────────────────────────────────────

function ComparePane({ installedSkill, apiKeySet }: { installedSkill: Skill | null; apiKeySet: boolean | null }) {
  const [strategy, setStrategy] = useState('improve_weak')
  const [originalContent, setOriginalContent] = useState('')
  const [evolvedContent, setEvolvedContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [installedEvolved, setInstalledEvolved] = useState<Skill | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (installedSkill) setOriginalContent(installedSkill.markdownContent)
  }, [installedSkill])

  const handleEvolve = async () => {
    if (!installedSkill) return
    setStreaming(true)
    setEvolvedContent('')
    setInstalledEvolved(null)

    cleanupRef.current?.()
    cleanupRef.current = window.api.studio.onChunk(({ chunk, done }) => {
      if (!done) setEvolvedContent(p => p + chunk)
      else {
        setStreaming(false)
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    })

    try {
      await window.api.studio.evolve(installedSkill.id, strategy)
    } catch {
      setStreaming(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  const handleInstallEvolved = async () => {
    if (!evolvedContent || !installedSkill) return
    const skill = await window.api.studio.install(evolvedContent, `${installedSkill.name}-evolved`)
    setInstalledEvolved(skill)
  }

  if (!installedSkill) {
    return <div className="studio-v2-val-empty">请先安装 Skill 后再对比进化</div>
  }

  return (
    <div className="studio-v2-compare">
      <div className="studio-v2-compare-controls">
        <div className="studio-v2-strategy-row">
          {STRATEGIES.map(st => (
            <button
              key={st.id}
              className={`studio-v2-strategy-chip ${strategy === st.id ? 'active' : ''}`}
              onClick={() => setStrategy(st.id)}
              title={st.hint}
            >
              {st.label}
            </button>
          ))}
        </div>
        <button className="studio-v2-btn primary sm" onClick={handleEvolve}
          disabled={streaming || apiKeySet === false}>
          {streaming ? '进化中...' : '开始进化'}
        </button>
      </div>

      <div className="studio-v2-compare-layout">
        <div className="studio-v2-compare-pane">
          <div className="studio-v2-compare-header">原版</div>
          <pre className="studio-v2-compare-content dim">{originalContent}</pre>
        </div>
        <div className="studio-v2-compare-pane">
          <div className="studio-v2-compare-header evolved">
            进化版 {streaming && <span className="studio-v2-streaming-dot">●</span>}
          </div>
          <pre className="studio-v2-compare-content">{evolvedContent}{streaming ? '▌' : ''}</pre>
          {!streaming && evolvedContent && !installedEvolved && (
            <div className="studio-v2-compare-install">
              <button className="studio-v2-btn primary sm" onClick={handleInstallEvolved}>
                安装进化版
              </button>
            </div>
          )}
          {installedEvolved && <div className="studio-v2-success-note">✅ 进化版已安装：{installedEvolved.name}</div>}
        </div>
      </div>
    </div>
  )
}

// ── ValidationPanel ───────────────────────────────────────────────────────────

function ValidationPanel({ expanded, onToggle, valTab, onTabChange, installedSkill, apiKeySet }: {
  expanded: boolean; onToggle: () => void
  valTab: ValTab; onTabChange: (t: ValTab) => void
  installedSkill: Skill | null; apiKeySet: boolean | null
}) {
  return (
    <div className="studio-v2-val-panel">
      <div className="studio-v2-val-header" onClick={onToggle}>
        <div className="studio-v2-val-title">
          <span>⚡ 验证</span>
          <div className="studio-v2-val-tabs" onClick={e => e.stopPropagation()}>
            <button className={`studio-v2-val-tab ${valTab === 'quicktest' ? 'active' : ''}`}
              onClick={() => { onTabChange('quicktest'); if (!expanded) onToggle() }}>
              快速测试
            </button>
            <button className={`studio-v2-val-tab ${valTab === 'compare' ? 'active' : ''}`}
              onClick={() => { onTabChange('compare'); if (!expanded) onToggle() }}>
              对比进化
            </button>
            <button className={`studio-v2-val-tab ${valTab === 'oneclick' ? 'active' : ''} ${!installedSkill ? 'disabled' : ''}`}
              onClick={() => { if (installedSkill) { onTabChange('oneclick'); if (!expanded) onToggle() } }}
              title={!installedSkill ? '请先安装 Skill' : ''}>
              一键测评
            </button>
          </div>
        </div>
        <span className="studio-v2-val-toggle">{expanded ? '▼' : '▲'}</span>
      </div>

      {expanded && (
        <div className="studio-v2-val-body">
          {valTab === 'quicktest' && <QuickTestPane installedSkill={installedSkill} />}
          {valTab === 'compare' && <ComparePane installedSkill={installedSkill} apiKeySet={apiKeySet} />}
          {valTab === 'oneclick' && installedSkill && <OneClickEvalPane installedSkill={installedSkill} />}
        </div>
      )}
    </div>
  )
}

// ── StudioPage ────────────────────────────────────────────────────────────────

const CREATION_TABS = [
  { id: 'describe' as StudioMode, label: '描述生成', icon: '✍️' },
  { id: 'examples' as StudioMode, label: '示例生成', icon: '🔁' },
  { id: 'extract'  as StudioMode, label: '对话提炼', icon: '💬' },
  { id: 'edit'     as StudioMode, label: '直接编辑', icon: '✏️' },
  { id: 'agent'    as StudioMode, label: 'Agent 设计', icon: '🤖' }
]

export default function StudioPage({ initialSkillId, onNavigate }: { initialSkillId?: string; onNavigate?: (page: string, skillId?: string) => void } = {}) {
  // Global state
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [mode, setMode] = useState<StudioMode>('describe')
  const [methods, setMethods] = useState<GenerationMethod[]>(DEFAULT_METHODS)
  const [activeMethodId, setActiveMethodId] = useState('builtin')
  const [editorContent, setEditorContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [scores, setScores] = useState<SkillScore5D | null>(null)
  const [scoring, setScoring] = useState(false)
  const [similarSkills, setSimilarSkills] = useState<Skill[]>([])
  const [installedSkill, setInstalledSkill] = useState<Skill | null>(null)
  const [discExpanded, setDiscExpanded] = useState(true)
  const [valExpanded, setValExpanded] = useState(false)
  const [valTab, setValTab] = useState<ValTab>('quicktest')
  const [showMethodModal, setShowMethodModal] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [noSkill, setNoSkill] = useState(false)
  const [mySkills, setMySkills] = useState<Skill[]>([])

  // Mode-specific input state
  const [prompt, setPrompt] = useState('')
  const [pairs, setPairs] = useState<ExPair[]>([{ id: 1, input: '', output: '' }])
  const [exDesc, setExDesc] = useState('')

  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    window.api.config.get().then(c => setApiKeySet(c.providers.length > 0))
    window.api.skills.getAll().then(skills => {
      setMySkills(skills)
      if (initialSkillId) {
        const skill = skills.find(s => s.id === initialSkillId)
        if (skill) {
          setEditorContent(skill.markdownContent)
          setInstalledSkill(skill)
          setMode('edit')
        }
      }
    })
    return () => { cleanupRef.current?.() }
  }, [])

  // Auto-score when editor content changes (debounced)
  useEffect(() => {
    if (!editorContent.trim()) { setScores(null); setSimilarSkills([]); return }
    const timer = setTimeout(async () => {
      setScoring(true)
      try {
        const [s, sim] = await Promise.all([
          window.api.studio.scoreSkill(editorContent),
          window.api.studio.similarSkills(editorContent)
        ])
        setScores(s)
        setSimilarSkills(sim)
      } finally {
        setScoring(false)
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [editorContent])

  const activeMethod = methods.find(m => m.id === activeMethodId) ?? methods[0]
  const showMethodBar = mode === 'describe' || mode === 'examples'

  const startStream = useCallback((trigger: () => Promise<void>) => {
    setStreaming(true)
    setEditorContent('')
    setInstalledSkill(null)
    setNoSkill(false)

    cleanupRef.current?.()
    cleanupRef.current = window.api.studio.onChunk(({ chunk, done, noSkill: ns }) => {
      if (!done) {
        setEditorContent(p => p + chunk)
      } else {
        setStreaming(false)
        if (ns) setNoSkill(true)
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    })

    trigger().catch(() => {
      setStreaming(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    })
  }, [])

  const handleGenerate = useCallback((fields?: { name: string; description: string; steps: string; tags: string }) => {
    if (activeMethod.type === 'external') {
      window.api.shell.openExternal(activeMethod.url!)
      setSuccessMsg(`已打开 ${activeMethod.label}，完成后将内容粘贴到编辑器`)
      setTimeout(() => setSuccessMsg(''), 4000)
      return
    }
    if (activeMethodId === 'skill-creator' && fields) {
      const stepsLine = fields.steps.trim() ? `\n\n## Steps\n${fields.steps.trim()}` : ''
      const tagsLine = fields.tags.trim()
        ? fields.tags.split(',').map(t => t.trim()).filter(Boolean).join(', ')
        : ''
      const constructedPrompt =
        `Create a Skill named "${fields.name.trim()}".\n` +
        `Description: ${fields.description.trim()}` +
        stepsLine +
        (tagsLine ? `\n\nTags: ${tagsLine}` : '')
      startStream(() => window.api.studio.generateStream(constructedPrompt))
      return
    }
    if (activeMethodId === 'promptperfect') {
      if (!editorContent.trim()) return
      // optimization is handled via onOptimize passed to PromptPerfectPanel
      return
    }
    if (mode === 'describe') {
      if (!prompt.trim()) return
      startStream(() => window.api.studio.generateStream(prompt))
    } else if (mode === 'examples') {
      const valid = pairs.filter(p => p.input.trim() && p.output.trim())
      if (valid.length === 0) return
      startStream(() => window.api.studio.generateFromExamples(
        valid.map(({ input, output }) => ({ input, output })),
        exDesc.trim() || undefined
      ))
    }
  }, [activeMethod, activeMethodId, mode, prompt, pairs, exDesc, editorContent, startStream])

  const handleOptimize = useCallback((content: string, goal: string) => {
    const goalDescriptions: Record<string, string> = {
      clarity: 'Make the instructions clearer and unambiguous. Remove any vague or confusing language.',
      specificity: 'Add specific constraints, output format requirements, and concrete examples.',
      robustness: 'Add handling for edge cases, unexpected inputs, and failure modes.',
      conciseness: 'Remove redundancy and verbosity while preserving all essential instructions.'
    }
    const optimizePrompt =
      `Optimize the following Skill. Goal: ${goalDescriptions[goal] || goal}\n\n` +
      `Return the complete improved Skill in the same format.\n\n${content}`
    startStream(() => window.api.studio.generateStream(optimizePrompt))
  }, [startStream])

  const handleExtract = useCallback((conversation: string) => {
    if (!conversation.trim()) return
    startStream(() => window.api.studio.extract(conversation))
  }, [startStream])

  const handleGenerateAgent = useCallback((fields: AgentFields) => {
    const toolsList = fields.tools.length > 0 ? fields.tools.join(', ') : 'none'
    const agentPrompt =
      `Create an Agent Skill named "${fields.name.trim()}".\n` +
      `Goal: ${fields.goal.trim()}\n` +
      `Available tools: ${toolsList}\n` +
      `Execution steps: ${fields.steps.trim()}\n\n` +
      `Generate a complete agent.md file with YAML frontmatter that includes:\n` +
      `- skill_type: agent\n` +
      `- tools: [${toolsList}]\n` +
      `- tags: [agent, ...relevant tags]\n\n` +
      `Structure the body with: # Agent 目标, # 执行步骤 (numbered, referencing declared tools), # 工具使用规范, # 输出格式.\n` +
      `Output ONLY the complete agent.md content, no extra commentary.`
    startStream(() => window.api.studio.generateStream(agentPrompt))
  }, [startStream])

  const handleModeChange = (newMode: StudioMode) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setStreaming(false)
    setMode(newMode)
  }

  const handleInstalled = (skill: Skill) => {
    setInstalledSkill(skill)
    setMySkills(prev => [skill, ...prev.filter(s => s.id !== skill.id)])
  }

  // Avg 5D for header badge
  const avg5D = scores
    ? (() => {
        const isAgent = (scores.orchestration ?? 0) > 0
        const keys = isAgent
          ? (['safety', 'completeness', 'executability', 'maintainability', 'orchestration'] as const)
          : SCORE_5D_KEYS
        return (keys.reduce((a, k) => a + (scores[k] ?? 0), 0) / keys.length).toFixed(1)
      })()
    : null

  return (
    <div className="studio-v2-root">
      {/* Header */}
      <div className="studio-v2-header">
        <div className="studio-v2-header-left">
          <h1>Skill Studio</h1>
          <p className="studio-v2-subtitle">发现 · 创作 · 验证 · 部署</p>
        </div>
        <div className="studio-v2-header-right">
          {avg5D && (
            <span className="studio-v2-header-badge score">5D {avg5D}</span>
          )}
          {installedSkill && (
            <span className="studio-v2-header-badge trust">T1 AI生成</span>
          )}
        </div>
      </div>

      {apiKeySet === false && (
        <div className="studio-v2-guard">
          ⚠️ 未配置 AI Provider。请前往 <strong>Settings</strong> 添加后再使用生成功能。
        </div>
      )}

      {successMsg && (
        <div className="studio-v2-toast">{successMsg}</div>
      )}

      {/* Workspace */}
      <div className="studio-v2-workspace">
        {/* Editor Workspace */}
        <div className="studio-v2-editor-workspace">
          {/* Creation Tabs + disc toggle */}
          <div className="studio-v2-tabs-row">
            <div className="studio-v2-creation-tabs">
              {CREATION_TABS.map(t => (
                <button
                  key={t.id}
                  className={`studio-v2-creation-tab ${mode === t.id ? 'active' : ''}`}
                  onClick={() => handleModeChange(t.id)}
                >
                  <span>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
            <button
              className="studio-v2-disc-toggle"
              onClick={() => setDiscExpanded(v => !v)}
              title={discExpanded ? '收起发现面板' : '展开发现面板'}
            >
              {discExpanded ? '▶ 发现' : '◀ 发现'}
            </button>
          </div>

          {/* Method Bar */}
          {showMethodBar && (
            <>
              <MethodBar
                methods={methods}
                activeId={activeMethodId}
                onSelect={setActiveMethodId}
                onAddCustom={() => setShowMethodModal(true)}
              />
              <MethodHint method={activeMethod} />
            </>
          )}

          {/* Input Area */}
          {mode === 'describe' && activeMethodId === 'skill-creator' && (
            <SkillCreatorPanel
              streaming={streaming} apiKeySet={apiKeySet}
              onGenerate={handleGenerate}
            />
          )}
          {mode === 'describe' && activeMethodId === 'promptperfect' && (
            <PromptPerfectPanel
              editorContent={editorContent} streaming={streaming} apiKeySet={apiKeySet}
              onOptimize={handleOptimize}
            />
          )}
          {mode === 'describe' && activeMethodId !== 'skill-creator' && activeMethodId !== 'promptperfect' && (
            <InputAreaDescribe
              prompt={prompt} setPrompt={setPrompt}
              streaming={streaming} apiKeySet={apiKeySet}
              onGenerate={() => handleGenerate()} isExternal={activeMethod.type === 'external'}
            />
          )}
          {mode === 'examples' && (
            <InputAreaExamples
              pairs={pairs} setPairs={setPairs}
              desc={exDesc} setDesc={setExDesc}
              streaming={streaming} apiKeySet={apiKeySet}
              onGenerate={() => handleGenerate()} isExternal={activeMethod.type === 'external'}
            />
          )}
          {mode === 'extract' && (
            <InputAreaExtract
              streaming={streaming} apiKeySet={apiKeySet}
              onExtract={handleExtract}
            />
          )}
          {mode === 'agent' && (
            <AgentDesignPanel
              streaming={streaming} apiKeySet={apiKeySet}
              onGenerate={handleGenerateAgent}
            />
          )}

          {/* Skill Editor */}
          <div className="studio-v2-editor-wrap">
            <div className="studio-v2-editor-label">
              Skill 编辑器
              {streaming && <span className="studio-v2-streaming-dot"> ●</span>}
              {noSkill && <span className="studio-v2-no-skill-note">（未发现可提炼内容）</span>}
            </div>
            <textarea
              className="studio-v2-editor"
              value={editorContent + (streaming ? '▌' : '')}
              onChange={e => !streaming && setEditorContent(e.target.value)}
              placeholder="生成的 Skill 将出现在这里，也可以直接粘贴或编辑..."
              readOnly={streaming}
            />
          </div>

          {/* Quick Run (pre-install) */}
          {editorContent && !streaming && !noSkill && !installedSkill && (
            <QuickRunPane editorContent={editorContent} apiKeySet={apiKeySet} />
          )}

          {/* Install Bar */}
          {editorContent && !streaming && !noSkill && (
            <>
              {installedSkill ? (
                <div className="studio-v2-success-banner">
                  <span>✅ &quot;{installedSkill.name}&quot; 已安装！</span>
                  <div className="studio-v2-success-actions">
                    <button className="studio-v2-btn sm" onClick={() => onNavigate?.('testcase', installedSkill.id)}>
                      🧪 去添加用例
                    </button>
                    <button className="studio-v2-btn primary sm" onClick={() => onNavigate?.('eval', installedSkill.id)}>
                      📊 去测评
                    </button>
                  </div>
                </div>
              ) : (
                <InstallBar
                  content={editorContent}
                  scores={scores}
                  scoring={scoring}
                  similar={similarSkills}
                  onInstalled={handleInstalled}
                />
              )}
            </>
          )}

          {/* Validation Panel */}
          <ValidationPanel
            expanded={valExpanded}
            onToggle={() => setValExpanded(v => !v)}
            valTab={valTab}
            onTabChange={setValTab}
            installedSkill={installedSkill}
            apiKeySet={apiKeySet}
          />
        </div>

        {/* Discovery Panel — right side */}
        {discExpanded && (
          <div className="studio-v2-disc-wrap">
            <DiscoveryPanel
              onLoad={content => { setEditorContent(content); setInstalledSkill(null) }}
              mySkills={mySkills}
            />
          </div>
        )}
      </div>

      {/* Custom Method Modal */}
      {showMethodModal && (
        <CustomMethodModal
          onAdd={m => setMethods(prev => [...prev.slice(0, -1), m, prev[prev.length - 1]])}
          onClose={() => setShowMethodModal(false)}
        />
      )}

      <style>{`
        /* ── Root ── */
        .studio-v2-root { display: flex; flex-direction: column; height: 100%; gap: 0; }

        /* ── Header ── */
        .studio-v2-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0; }
        .studio-v2-header h1 { font-size: 22px; font-weight: 700; }
        .studio-v2-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .studio-v2-header-right { display: flex; gap: 8px; align-items: center; }
        .studio-v2-header-badge { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 10px; border: 1px solid; }
        .studio-v2-header-badge.score { background: rgba(108,99,255,0.1); color: var(--accent); border-color: rgba(108,99,255,0.3); }
        .studio-v2-header-badge.trust { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.3); }

        .studio-v2-guard { background: rgba(250,204,21,0.08); border: 1px solid rgba(250,204,21,0.3); border-radius: var(--radius); padding: 10px 14px; color: var(--warning); font-size: 13px; margin-bottom: 12px; flex-shrink: 0; }
        .studio-v2-toast { background: rgba(108,99,255,0.1); border: 1px solid rgba(108,99,255,0.3); border-radius: var(--radius); padding: 8px 14px; color: var(--accent); font-size: 13px; margin-bottom: 8px; flex-shrink: 0; }

        /* ── Workspace ── */
        .studio-v2-workspace { display: flex; gap: 0; flex: 1; min-height: 0; overflow: hidden; }

        /* ── Discovery Panel ── */
        .studio-v2-disc-wrap { width: 260px; flex-shrink: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
        .studio-v2-disc-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .studio-v2-disc-sources { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .studio-v2-src-tab { flex: 1; padding: 8px 4px; font-size: 11px; font-weight: 600; color: var(--text-muted); background: transparent; border: none; cursor: pointer; border-bottom: 2px solid transparent; transition: all var(--transition); }
        .studio-v2-src-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
        .studio-v2-disc-search { padding: 8px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .studio-v2-disc-search input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 12px; padding: 5px 8px; box-sizing: border-box; }
        .studio-v2-disc-search input:focus { outline: none; border-color: var(--accent); }
        .studio-v2-skill-list { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 6px; }
        .studio-v2-skill-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; font-size: 12px; }
        .studio-v2-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; gap: 4px; }
        .studio-v2-card-name { font-weight: 600; font-size: 12px; color: var(--text); line-height: 1.3; flex: 1; }
        .studio-v2-card-stars { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
        .studio-v2-card-version { font-size: 10px; color: var(--text-muted); }
        .studio-v2-card-desc { font-size: 11px; color: var(--text-muted); margin-bottom: 6px; line-height: 1.4; }
        .studio-v2-card-footer { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px; }
        .studio-v2-card-author { font-size: 10px; color: var(--text-muted); }
        .studio-v2-card-score { font-size: 10px; color: var(--accent); font-weight: 600; }
        .studio-v2-card-tags { display: flex; flex-wrap: wrap; gap: 3px; }
        .studio-v2-tag { font-size: 10px; color: var(--text-muted); background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; }
        .studio-v2-card-actions { display: flex; gap: 6px; }
        .studio-v2-card-btn { font-size: 11px; padding: 3px 8px; border-radius: 5px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; }
        .studio-v2-card-btn:hover { color: var(--text); border-color: var(--text-muted); }
        .studio-v2-card-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
        .studio-v2-card-btn.primary:hover { opacity: 0.85; }
        .studio-v2-empty { font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px 0; }
        .studio-v2-gh-error { font-size: 11px; color: var(--danger); background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius); padding: 7px 10px; }

        /* Preview Modal */
        .studio-v2-preview-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: center; justify-content: center; }
        .studio-v2-preview-modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: 560px; max-height: 80vh; display: flex; flex-direction: column; }
        .studio-v2-preview-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 13px; }
        .studio-v2-preview-header button { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; }
        .studio-v2-preview-content { flex: 1; overflow-y: auto; padding: 14px 16px; font-size: 12px; font-family: monospace; white-space: pre-wrap; word-break: break-all; color: var(--text); line-height: 1.65; margin: 0; }
        .studio-v2-preview-footer { padding: 10px 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; }

        /* ── Editor Workspace ── */
        .studio-v2-editor-workspace { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 0 12px 8px 0; overflow-y: auto; }

        /* Tabs row */
        .studio-v2-tabs-row { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .studio-v2-creation-tabs { display: flex; gap: 4px; }
        .studio-v2-creation-tab { display: flex; align-items: center; gap: 5px; padding: 6px 14px; border-radius: 7px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 500; cursor: pointer; transition: all var(--transition); }
        .studio-v2-creation-tab:hover { color: var(--text); border-color: var(--text-muted); }
        .studio-v2-creation-tab.active { background: var(--surface2); color: var(--text); border-color: var(--accent); }
        .studio-v2-disc-toggle { font-size: 11px; color: var(--text-muted); background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 4px 9px; cursor: pointer; white-space: nowrap; }
        .studio-v2-disc-toggle:hover { color: var(--text); border-color: var(--text-muted); }

        /* Method Bar */
        .studio-v2-method-bar { display: flex; align-items: center; gap: 6px; padding: 4px 0; flex-wrap: wrap; flex-shrink: 0; }
        .studio-v2-method-label { font-size: 11px; color: var(--text-muted); font-weight: 600; flex-shrink: 0; }
        .studio-v2-method-list { display: flex; gap: 4px; flex-wrap: wrap; }
        .studio-v2-method-chip { font-size: 11px; padding: 3px 10px; border-radius: 12px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; font-weight: 500; transition: all var(--transition); }
        .studio-v2-method-chip:hover { color: var(--text); border-color: var(--text-muted); }
        .studio-v2-method-chip.active { background: rgba(108,99,255,0.1); color: var(--accent); border-color: rgba(108,99,255,0.4); }
        .studio-v2-method-chip.external.active { background: rgba(52,211,153,0.1); color: #34d399; border-color: rgba(52,211,153,0.4); }
        .studio-v2-method-chip.add { color: var(--text-muted); border-style: dashed; }
        .studio-v2-method-source { margin-left: auto; font-size: 11px; color: var(--text-muted); background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; cursor: pointer; white-space: nowrap; }
        .studio-v2-method-source:hover { color: var(--accent); border-color: var(--accent); }

        /* Method Hint */
        .studio-v2-method-hint { display: flex; align-items: center; gap: 8px; background: rgba(52,211,153,0.06); border: 1px solid rgba(52,211,153,0.25); border-radius: var(--radius); padding: 7px 12px; font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
        .studio-v2-hint-icon { flex-shrink: 0; }
        .studio-v2-hint-link { margin-left: auto; font-size: 12px; color: #34d399; background: transparent; border: 1px solid rgba(52,211,153,0.4); border-radius: 5px; padding: 2px 9px; cursor: pointer; white-space: nowrap; }
        .studio-v2-hint-link:hover { background: rgba(52,211,153,0.1); }

        /* Input areas */
        .studio-v2-input-area { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
        .studio-v2-input-area textarea, .studio-v2-input-area input { width: 100%; box-sizing: border-box; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; padding: 9px 12px; resize: vertical; font-family: inherit; }
        .studio-v2-input-area textarea:focus, .studio-v2-input-area input:focus { outline: none; border-color: var(--accent); }
        .studio-v2-hint-text { font-size: 12px; color: var(--text-muted); margin: 0; }

        .studio-v2-ex-pair { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; }
        .studio-v2-ex-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .studio-v2-ex-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .studio-v2-ex-fields textarea { background: var(--bg); font-size: 12px; }
        .studio-v2-icon-btn { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 11px; padding: 1px 4px; }
        .studio-v2-icon-btn:hover { color: var(--danger); }

        /* Editor */
        .studio-v2-editor-wrap { display: flex; flex-direction: column; flex-shrink: 0; }
        .studio-v2-editor-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px; display: flex; align-items: center; gap: 6px; }
        .studio-v2-editor { width: 100%; box-sizing: border-box; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 12px; font-family: 'Courier New', monospace; padding: 12px 14px; resize: vertical; min-height: 180px; line-height: 1.65; }
        .studio-v2-editor:focus { outline: none; border-color: var(--accent); }
        .studio-v2-streaming-dot { color: var(--accent); animation: studio-v2-blink 1s step-end infinite; }
        @keyframes studio-v2-blink { 0%,100%{opacity:1}50%{opacity:0.2} }
        .studio-v2-no-skill-note { font-size: 11px; color: var(--text-muted); font-weight: 400; }

        /* Install Bar */
        .studio-v2-install-bar { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
        .studio-v2-install-row { display: flex; gap: 8px; align-items: center; }
        .studio-v2-install-row input { flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; padding: 7px 10px; }
        .studio-v2-install-row input:focus { outline: none; border-color: var(--accent); }
        .studio-v2-success-banner { background: rgba(74,222,128,0.1); border: 1px solid var(--success); border-radius: var(--radius); padding: 10px 14px; color: var(--success); font-size: 13px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .studio-v2-success-actions { display: flex; gap: 6px; }

        /* 5D Mini */
        .studio-v2-score-mini { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
        .studio-v2-score-pill { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 8px; border: 1px solid; }
        .studio-v2-score-avg { font-size: 11px; font-weight: 700; margin-left: 4px; }
        .studio-v2-score-mini-loading { font-size: 11px; color: var(--text-muted); }

        /* Similar Warn */
        .studio-v2-similar-warn { display: flex; gap: 8px; background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.3); border-radius: var(--radius); padding: 8px 12px; font-size: 12px; color: var(--warning); }

        /* Validation Panel */
        .studio-v2-val-panel { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; flex-shrink: 0; }
        .studio-v2-val-header { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: var(--surface2); cursor: pointer; user-select: none; }
        .studio-v2-val-title { display: flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 600; }
        .studio-v2-val-tabs { display: flex; gap: 4px; }
        .studio-v2-val-tab { font-size: 11px; padding: 3px 10px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; }
        .studio-v2-val-tab.active { background: rgba(108,99,255,0.1); color: var(--accent); border-color: rgba(108,99,255,0.3); }
        .studio-v2-val-toggle { font-size: 11px; color: var(--text-muted); }
        .studio-v2-val-body { padding: 14px; border-top: 1px solid var(--border); }
        .studio-v2-val-empty { font-size: 12px; color: var(--text-muted); text-align: center; padding: 16px 0; }

        /* QuickTest */
        .studio-v2-quicktest { display: flex; flex-direction: column; gap: 10px; }
        .studio-v2-qt-row { display: flex; gap: 8px; align-items: flex-start; }
        .studio-v2-qt-row textarea { flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 12px; padding: 8px 10px; resize: vertical; }
        .studio-v2-qt-row textarea:focus { outline: none; border-color: var(--accent); }
        .studio-v2-qt-result { display: flex; flex-direction: column; gap: 8px; }
        .studio-v2-qt-output { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .studio-v2-qt-output-label { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border); }
        .studio-v2-qt-score { font-weight: 700; }
        .studio-v2-qt-output pre { font-size: 12px; font-family: monospace; white-space: pre-wrap; word-break: break-all; padding: 10px; margin: 0; color: var(--text); line-height: 1.55; max-height: 200px; overflow-y: auto; }
        .studio-v2-qt-actions { display: flex; gap: 6px; justify-content: flex-end; }
        .studio-v2-success-note { font-size: 12px; color: var(--success); }

        /* Compare */
        .studio-v2-compare { display: flex; flex-direction: column; gap: 10px; }
        .studio-v2-compare-controls { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .studio-v2-strategy-row { display: flex; flex-wrap: wrap; gap: 5px; }
        .studio-v2-strategy-chip { font-size: 11px; padding: 3px 10px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; }
        .studio-v2-strategy-chip.active { background: rgba(108,99,255,0.1); color: var(--accent); border-color: rgba(108,99,255,0.3); }
        .studio-v2-compare-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .studio-v2-compare-pane { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; display: flex; flex-direction: column; }
        .studio-v2-compare-header { padding: 7px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--surface2); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
        .studio-v2-compare-header.evolved { color: var(--accent); }
        .studio-v2-compare-content { font-size: 11px; font-family: monospace; white-space: pre-wrap; word-break: break-all; padding: 10px 12px; margin: 0; color: var(--text); line-height: 1.6; max-height: 240px; overflow-y: auto; flex: 1; }
        .studio-v2-compare-content.dim { color: var(--text-muted); }
        .studio-v2-compare-install { padding: 8px 12px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; }

        /* Buttons */
        .studio-v2-btn { padding: 7px 16px; border-radius: 7px; border: 1px solid var(--border); background: transparent; color: var(--text); font-size: 13px; cursor: pointer; transition: all var(--transition); white-space: nowrap; font-weight: 500; }
        .studio-v2-btn:hover { border-color: var(--text-muted); }
        .studio-v2-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
        .studio-v2-btn.primary:hover { opacity: 0.85; }
        .studio-v2-btn.primary:disabled { opacity: 0.45; cursor: not-allowed; }
        .studio-v2-btn.ghost { background: transparent; color: var(--text-muted); }
        .studio-v2-btn.sm { padding: 4px 11px; font-size: 12px; }

        /* Custom Method Modal */
        .studio-v2-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 300; display: flex; align-items: center; justify-content: center; }
        .studio-v2-modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; width: 380px; display: flex; flex-direction: column; gap: 14px; }
        .studio-v2-modal-title { font-size: 15px; font-weight: 700; }
        .studio-v2-modal-field { display: flex; flex-direction: column; gap: 5px; }
        .studio-v2-modal-field label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
        .studio-v2-modal-field input { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; padding: 7px 10px; }
        .studio-v2-modal-field input:focus { outline: none; border-color: var(--accent); }
        .studio-v2-modal-err { font-size: 12px; color: var(--danger); }
        .studio-v2-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

        /* Skill Creator Panel */
        .studio-v2-skill-creator { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
        .studio-v2-sc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .studio-v2-sc-field { display: flex; flex-direction: column; gap: 5px; }
        .studio-v2-sc-field label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .studio-v2-sc-req { color: var(--danger); }

        /* PromptPerfect Panel */
        .studio-v2-promptperfect { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
        .studio-v2-pp-goals { display: flex; gap: 6px; flex-wrap: wrap; }
        .studio-v2-pp-goal { font-size: 12px; padding: 4px 12px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .studio-v2-pp-goal.active { background: rgba(108,99,255,0.1); color: var(--accent); border-color: rgba(108,99,255,0.4); }
        .studio-v2-pp-hint { font-size: 12px; color: var(--text-muted); background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.25); border-radius: var(--radius); padding: 8px 12px; }
        .studio-v2-pp-preview { display: flex; justify-content: space-between; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 12px; }
        .studio-v2-pp-preview-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .studio-v2-pp-preview-len { font-size: 11px; color: var(--text-muted); }

        /* Extract Panel */
        .studio-v2-extract-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
        .studio-v2-extract-limit { display: flex; gap: 5px; }
        .studio-v2-limit-chip { font-size: 11px; padding: 3px 9px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; }
        .studio-v2-limit-chip.active { background: rgba(108,99,255,0.1); color: var(--accent); border-color: rgba(108,99,255,0.4); }
        .studio-v2-extract-preview { display: flex; flex-direction: column; gap: 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 10px; }
        .studio-v2-extract-record { display: flex; gap: 8px; align-items: baseline; font-size: 12px; }
        .studio-v2-extract-skill { font-weight: 600; color: var(--accent); flex-shrink: 0; font-size: 11px; }
        .studio-v2-extract-input { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .studio-v2-extract-more { font-size: 11px; color: var(--text-muted); padding-top: 2px; }

        /* Agent Badge (Discovery Panel) */
        .studio-v2-agent-badge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: rgba(249,115,22,0.12); color: #f97316; border: 1px solid rgba(249,115,22,0.3); margin-left: 5px; vertical-align: middle; }

        /* Quick Run */
        .studio-v2-quickrun { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
        .studio-v2-quickrun-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
        .studio-v2-quickrun-hint { font-size: 10px; font-weight: 400; color: var(--text-muted); text-transform: none; letter-spacing: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
        .studio-v2-quickrun-output { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; }
        .studio-v2-quickrun-output pre { font-size: 12px; font-family: monospace; white-space: pre-wrap; word-break: break-all; color: var(--text); line-height: 1.6; margin: 0; }

        /* One-click Eval */
        .studio-v2-oneclick { display: flex; flex-direction: column; gap: 10px; }
        .studio-v2-oneclick-cases { display: flex; flex-direction: column; gap: 4px; }
        .studio-v2-oneclick-case { display: flex; justify-content: space-between; align-items: center; background: var(--surface2); border: 1px solid var(--border); border-radius: 5px; padding: 5px 10px; font-size: 12px; }
        .studio-v2-oneclick-case-name { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .studio-v2-oneclick-case-type { font-size: 10px; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; flex-shrink: 0; }
        .studio-v2-progress-bar-wrap { height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
        .studio-v2-progress-bar { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.3s ease; }
        .studio-v2-oneclick-result { display: flex; flex-direction: column; gap: 6px; }
        .studio-v2-oneclick-total { font-size: 13px; font-weight: 700; }
        .studio-v2-score-pills { display: flex; gap: 5px; flex-wrap: wrap; }
        .studio-v2-link-btn { background: transparent; border: none; color: var(--accent); cursor: pointer; font-size: 13px; padding: 0 4px; text-decoration: underline; }

        /* Val tab disabled */
        .studio-v2-val-tab.disabled { opacity: 0.4; cursor: not-allowed; }

        /* Agent Design Panel */
        .studio-v2-agent-panel { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; }
        .studio-v2-agent-field { display: flex; flex-direction: column; gap: 5px; }
        .studio-v2-agent-field label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .studio-v2-agent-field-hint { font-weight: 400; text-transform: none; letter-spacing: 0; }
        .studio-v2-agent-field input, .studio-v2-agent-field textarea { width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; padding: 7px 10px; resize: vertical; font-family: inherit; }
        .studio-v2-agent-field input:focus, .studio-v2-agent-field textarea:focus { outline: none; border-color: var(--accent); }
        .studio-v2-tool-chips { display: flex; gap: 5px; flex-wrap: wrap; }
        .studio-v2-tool-chip { font-size: 11px; padding: 3px 10px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; transition: all var(--transition); font-family: monospace; }
        .studio-v2-tool-chip:hover { color: var(--text); border-color: var(--text-muted); }
        .studio-v2-tool-chip.active { background: rgba(249,115,22,0.1); color: #f97316; border-color: rgba(249,115,22,0.4); }`}</style>
    </div>
  )
}
