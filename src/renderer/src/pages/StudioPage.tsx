import { useState, useEffect, useRef, useCallback } from 'react'
import type { Skill, SkillScore5D, TestCase, GithubSkillResult, EvalResult, EvalHistoryPage } from '../../../shared/types'
import { SKILLNET_SKILLS, type DiscoverySkill } from '../data/studio-discovery'

// ── Types ──────────────────────────────────────────────────────────────────────

type StudioMode = 'describe' | 'examples' | 'extract' | 'edit' | 'agent'
type MethodType = 'builtin' | 'external'
type DiscoverySource = 'skillnet' | 'github' | 'mine'

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
  safety: '安全', completeness: '完整', executability: '可执行',
  maintainability: '可维护', costAwareness: '成本', orchestration: '编排'
}
const SCORE_5D_KEYS = ['safety', 'completeness', 'executability', 'maintainability', 'costAwareness'] as const

const PRESET_TOOLS = [
  'web_search', 'code_exec', 'file_read', 'file_write',
  'shell', 'browser', 'mcp_tool', 'sub_skill'
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
            {src === 'skillnet' ? '精选' : src === 'github' ? 'GitHub' : '我的库'}
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

type EvalRecord = {
  id: string
  skillName: string
  skillContent: string
  inputPrompt: string
  output: string
  label: string | null
  totalScore: number
  createdAt: number
}

const LABEL_OPTIONS: { value: string | null; display: string }[] = [
  { value: null,         display: '—' },
  { value: 'success',   display: '✓' },
  { value: 'failure',   display: '✗' },
  { value: 'edge_case', display: '⚡' },
]
const LABEL_COLORS: Record<string, string> = {
  success: '#22c55e', failure: '#ef4444', edge_case: '#f59e0b'
}
function nextLabel(current: string | null): string | null {
  const idx = LABEL_OPTIONS.findIndex(o => o.value === current)
  return LABEL_OPTIONS[(idx + 1) % LABEL_OPTIONS.length].value
}

function InputAreaExtract({ streaming, apiKeySet, skills, onExtract }: {
  streaming: boolean; apiKeySet: boolean | null
  skills: Skill[]
  onExtract: (conversation: string, sourceSkillId?: string, sourceSkillContent?: string) => void
}) {
  const [limit, setLimit] = useState(10)
  const [selectedSkillId, setSelectedSkillId] = useState('')
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set())
  const [records, setRecords] = useState<EvalRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadRecords = useCallback(async (n: number, skillId: string, labels: Set<string>) => {
    setLoading(true)
    try {
      const labelArr = labels.size > 0 ? [...labels] : undefined
      const rows = await window.api.studio.recentEvalHistory(n, skillId || undefined, labelArr)
      setRecords(rows)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRecords(10, '', new Set()) }, [])

  const handleSkillChange = (skillId: string) => {
    setSelectedSkillId(skillId)
    loadRecords(limit, skillId, activeLabels)
  }

  const handleLabelToggle = (label: string) => {
    setActiveLabels(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label); else next.add(label)
      loadRecords(limit, selectedSkillId, next)
      return next
    })
  }

  const handleLimitChange = (n: number) => {
    setLimit(n)
    loadRecords(n, selectedSkillId, activeLabels)
  }

  const handleRecordLabel = async (record: EvalRecord) => {
    const newLabel = nextLabel(record.label)
    await window.api.eval.setLabel(record.id, newLabel)
    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, label: newLabel } : r))
  }

  const handleExtract = () => {
    if (records.length === 0) return
    const conversation = records.map(r =>
      `[${r.skillName}]\nUser: ${r.inputPrompt}\nAssistant: ${r.output}`
    ).join('\n\n---\n\n')
    const sourceSkillContent = selectedSkillId ? (records.find(r => r.skillContent)?.skillContent) : undefined
    onExtract(conversation, selectedSkillId || undefined, sourceSkillContent)
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

      <div className="studio-v2-extract-filters">
        <select
          className="studio-v2-extract-skill-select"
          value={selectedSkillId}
          onChange={e => handleSkillChange(e.target.value)}
        >
          <option value="">全部 Skill</option>
          {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="studio-v2-extract-label-filters">
          {(['success', 'failure', 'edge_case'] as const).map(l => (
            <button
              key={l}
              className={`studio-v2-label-filter-chip ${activeLabels.has(l) ? 'active' : ''}`}
              style={activeLabels.has(l) ? { color: LABEL_COLORS[l], borderColor: LABEL_COLORS[l] } : {}}
              onClick={() => handleLabelToggle(l)}
            >
              {LABEL_OPTIONS.find(o => o.value === l)?.display}{' '}
              {l === 'success' ? '成功' : l === 'failure' ? '失败' : '边界'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="studio-v2-empty">加载中...</div>}
      {loaded && !loading && records.length === 0 && (
        <div className="studio-v2-empty">暂无匹配记录，请先运行评测</div>
      )}
      {loaded && !loading && records.length > 0 && (
        <div className="studio-v2-extract-preview">
          {records.slice(0, 5).map((r) => {
            const labelOpt = LABEL_OPTIONS.find(o => o.value === r.label) ?? LABEL_OPTIONS[0]
            const labelColor = r.label ? LABEL_COLORS[r.label] : 'var(--text-muted)'
            return (
              <div key={r.id} className="studio-v2-extract-record">
                <span className="studio-v2-extract-skill">{r.skillName}</span>
                <span className="studio-v2-extract-input">{r.inputPrompt.slice(0, 55)}{r.inputPrompt.length > 55 ? '…' : ''}</span>
                <button
                  className="studio-v2-record-label-chip"
                  style={{ color: labelColor, borderColor: `${labelColor}66` }}
                  onClick={() => handleRecordLabel(r)}
                  title="点击切换标签"
                >
                  {labelOpt.display}
                </button>
              </div>
            )
          })}
          {records.length > 5 && (
            <div className="studio-v2-extract-more">+ {records.length - 5} 条更多记录</div>
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

const SCORE_5D_TIPS: Record<string, string> = {
  safety:          '加强输入校验、明确拒绝边界、限制工具调用范围',
  completeness:    '补充 edge case 说明、扩展 examples、明确任务 scope',
  executability:   '拆分步骤、用 numbered list、减少歧义词让 LLM 更易遵循',
  maintainability: '加 frontmatter、分段组织、用清晰的 section 标题',
  costAwareness:   '限制输出长度、合并工具调用、加 "be concise" 约束',
  orchestration:   '明确子 Agent 职责边界、减少不必要的协调层级',
}

function Score5DMini({ scores, loading }: { scores: SkillScore5D | null; loading: boolean }) {
  const [hintOpen, setHintOpen] = useState(false)
  if (loading) return <span className="studio-v2-score-mini-loading">评分中...</span>
  if (!scores) return null
  const isAgent = (scores.orchestration ?? 0) > 0
  const displayKeys = isAgent
    ? (['safety', 'completeness', 'executability', 'maintainability', 'orchestration'] as const)
    : SCORE_5D_KEYS
  const avg = displayKeys.reduce((a, k) => a + (scores[k] ?? 0), 0) / displayKeys.length
  const weakDims = displayKeys.filter(k => (scores[k] ?? 0) < 6)
  return (
    <div className="studio-v2-score-mini-wrap">
      <div className="studio-v2-score-mini">
        {displayKeys.map(k => {
          const val = scores[k] ?? 0
          const isWeak = val < 6
          return (
            <span
              key={k}
              className={`studio-v2-score-pill${isWeak ? ' weak' : ''}`}
              style={{ color: SCORE_5D_COLORS[k], borderColor: `${SCORE_5D_COLORS[k]}${isWeak ? '99' : '44'}` }}
              title={isWeak ? `${SCORE_5D_SHORT[k]} 偏低 — ${SCORE_5D_TIPS[k]}` : undefined}
            >
              {SCORE_5D_SHORT[k]} {val.toFixed(1)}
              {isWeak && <span className="studio-v2-score-pill-warn">!</span>}
            </span>
          )
        })}
        <span className="studio-v2-score-avg" style={{ color: avg >= 7 ? 'var(--success)' : avg >= 5 ? 'var(--warning)' : 'var(--danger)' }}>
          均 {avg.toFixed(1)}
        </span>
        {weakDims.length > 0 && (
          <button className="studio-v2-score-hint-toggle" onClick={() => setHintOpen(v => !v)}>
            {hintOpen ? '▾' : '▸'} 改进建议
          </button>
        )}
      </div>
      {hintOpen && weakDims.length > 0 && (
        <div className="studio-v2-score-hints">
          {weakDims.map(k => (
            <div key={k} className="studio-v2-score-hint-row">
              <span className="studio-v2-score-hint-dim" style={{ color: SCORE_5D_COLORS[k] }}>{SCORE_5D_SHORT[k]}</span>
              <span className="studio-v2-score-hint-text">{SCORE_5D_TIPS[k]}</span>
            </div>
          ))}
        </div>
      )}
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

function InstallBar({ content, scores, scoring, similar, parentSkillId, onInstalled }: {
  content: string
  scores: SkillScore5D | null
  scoring: boolean
  similar: Skill[]
  parentSkillId?: string
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
      const skill = await window.api.studio.install(content, name.trim(), parentSkillId)
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

  const isAgentContent = /^---[\s\S]*?skill_type:\s*agent/m.test(editorContent)

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
      {isAgentContent ? (
        <div className="studio-v2-agent-run-hint">🤖 Agent Skill 需要工具调用支持，请先安装后在 Eval 页面运行评测。</div>
      ) : (
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
      )}
      {!isAgentContent && output && (
        <div className="studio-v2-quickrun-output">
          <div className="studio-v2-qt-output-label">输出{running && <span className="studio-v2-streaming-dot"> ●</span>}</div>
          <pre>{output}{running ? '▌' : ''}</pre>
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

  // Parse agent output or plain text, extract file paths
  const renderOutput = (raw: string) => {
    // Try agent output format
    let agentAnswer: string | null = null
    let agentTrace: Array<{ turn: number; toolName: string; toolInput: Record<string, unknown>; toolOutput: string; toolError?: string }> = []
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj.answer === 'string' && Array.isArray(obj.trace)) {
        agentAnswer = obj.answer
        agentTrace = obj.trace
      }
    } catch { /* plain text */ }

    const text = agentAnswer ?? raw
    // Detect absolute file paths
    const filePathRe = /(\/[^\s"'<>]+\.[a-zA-Z0-9]{2,6})/g
    const filePaths = [...new Set(text.match(filePathRe) ?? [])]

    return (
      <>
        <pre className="studio-v2-qt-pre">{text}</pre>
        {filePaths.length > 0 && (
          <div className="studio-v2-qt-files">
            {filePaths.map(p => (
              <button key={p} className="studio-v2-qt-file-btn" onClick={() => window.api.shell.openPath(p)} title={p}>
                📂 打开 {p.split('/').pop()}
              </button>
            ))}
          </div>
        )}
        {agentTrace.length > 0 && (
          <details className="studio-v2-qt-trace">
            <summary>执行轨迹（{agentTrace.length} 步）</summary>
            {agentTrace.map((step, i) => (
              <div key={i} className="studio-v2-qt-trace-step">
                <span className="studio-v2-qt-trace-tool">{step.toolName}</span>
                <pre className="studio-v2-qt-trace-pre">{step.toolError ? `[error] ${step.toolError}\n${step.toolOutput}` : step.toolOutput}</pre>
              </div>
            ))}
          </details>
        )}
      </>
    )
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
            {renderOutput(result.output)}
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


// ── OneClickEvalPane ──────────────────────────────────────────────────────────

function OneClickEvalPane({ installedSkill }: { installedSkill: Skill }) {
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<EvalResult | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    window.api.testcases.getBySkill(installedSkill.id)
      .then((tcs: TestCase[]) => setTestCases(tcs.slice(0, 5)))
      .catch(() => {})
  }, [installedSkill.id])

  useEffect(() => () => { cleanupRef.current?.() }, [])

  const handleRun = async () => {
    if (running || testCases.length === 0) return
    setRunning(true)
    setProgress(0)
    setResult(null)

    cleanupRef.current?.()
    cleanupRef.current = window.api.eval.onProgress(({ progress: p }) => {
      setProgress(Math.round(p * 100))
    })

    try {
      await window.api.eval.start(installedSkill.id, testCases.map(tc => tc.id))
      const page = await window.api.eval.history(installedSkill.id, 1, 0)
      if (page.items.length > 0) setResult(page.items[0])
    } catch {
      // ignore
    } finally {
      setRunning(false)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  if (testCases.length === 0) {
    return (
      <div className="studio-v2-oneclick-empty">
        <span>暂无测试用例</span>
        <span className="studio-v2-oneclick-hint">请先在 Eval 页面添加用例</span>
      </div>
    )
  }

  return (
    <div className="studio-v2-oneclick">
      <div className="studio-v2-oneclick-cases">
        {testCases.map(tc => (
          <span key={tc.id} className="studio-v2-oneclick-tc">{tc.name || '未命名'}</span>
        ))}
      </div>
      <button className="studio-v2-btn primary" onClick={handleRun} disabled={running}>
        {running ? '评测中...' : '▶ 开始测评'}
      </button>
      {running && (
        <div className="studio-v2-progress-bar-wrap">
          <div className="studio-v2-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}
      {result && (
        <div className="studio-v2-oneclick-result">
          {Object.entries(result.scores).map(([dim, s]) => (
            <span key={dim} className="studio-v2-5d-pill"
              style={{ background: (SCORE_5D_COLORS[dim] ?? '#888') + '22', color: SCORE_5D_COLORS[dim] ?? '#888', borderColor: (SCORE_5D_COLORS[dim] ?? '#888') + '55' }}>
              {SCORE_5D_SHORT[dim] ?? dim} {s.score.toFixed(1)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ValidationPanel ───────────────────────────────────────────────────────────

type ValTab = 'quicktest' | 'oneclick'

function ValidationPanel({ expanded, onToggle, installedSkill }: {
  expanded: boolean; onToggle: () => void
  installedSkill: Skill | null
}) {
  const [tab, setTab] = useState<ValTab>('quicktest')

  return (
    <div className="studio-v2-val-panel">
      <div className="studio-v2-val-header" onClick={onToggle}>
        <span className="studio-v2-val-title">⚡ 快速测试</span>
        <span className="studio-v2-val-toggle">{expanded ? '▼' : '▲'}</span>
      </div>
      {expanded && (
        <div className="studio-v2-val-body">
          <div className="studio-v2-val-tabs">
            <button className={`studio-v2-val-tab ${tab === 'quicktest' ? 'active' : ''}`} onClick={() => setTab('quicktest')}>快速测试</button>
            <button className={`studio-v2-val-tab ${tab === 'oneclick' ? 'active' : ''} ${!installedSkill ? 'disabled' : ''}`}
              onClick={() => installedSkill && setTab('oneclick')} disabled={!installedSkill}>一键测评</button>
          </div>
          {tab === 'quicktest' && <QuickTestPane installedSkill={installedSkill} />}
          {tab === 'oneclick' && installedSkill && <OneClickEvalPane installedSkill={installedSkill} />}
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
  const [showMethodModal, setShowMethodModal] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [noSkill, setNoSkill] = useState(false)
  const [mySkills, setMySkills] = useState<Skill[]>([])
  const [extractSourceSkillId, setExtractSourceSkillId] = useState<string | undefined>()

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
        // Auto-upgrade to T2 if 5D avg >= 6 and skill is still at T1
        if (installedSkill && installedSkill.trustLevel === 1) {
          const vals = Object.values(s).filter(v => typeof v === 'number') as number[]
          const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
          if (avg >= 6) {
            await window.api.skills.setTrustLevel(installedSkill.id, 2)
            setInstalledSkill(prev => prev ? { ...prev, trustLevel: 2 } : prev)
          }
        }
      } finally {
        setScoring(false)
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [editorContent, installedSkill])

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

  const handleExtract = useCallback((conversation: string, sourceSkillId?: string, sourceSkillContent?: string) => {
    if (!conversation.trim()) return
    setExtractSourceSkillId(sourceSkillId)
    startStream(() => window.api.studio.extract(conversation, sourceSkillId, sourceSkillContent))
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
            <span className="studio-v2-header-badge trust" style={{
              background: installedSkill.trustLevel >= 4 ? '#6c63ff33' : installedSkill.trustLevel >= 3 ? '#00d4aa33' : installedSkill.trustLevel >= 2 ? '#f59e0b33' : '#88888833',
              color: installedSkill.trustLevel >= 4 ? '#6c63ff' : installedSkill.trustLevel >= 3 ? '#00d4aa' : installedSkill.trustLevel >= 2 ? '#f59e0b' : '#888',
              borderColor: installedSkill.trustLevel >= 4 ? '#6c63ff66' : installedSkill.trustLevel >= 3 ? '#00d4aa66' : installedSkill.trustLevel >= 2 ? '#f59e0b66' : '#88888866'
            }}>
              {installedSkill.trustLevel >= 4 ? 'T4 已批准' : installedSkill.trustLevel >= 3 ? 'T3 已评测' : installedSkill.trustLevel >= 2 ? 'T2 质量达标' : 'T1 未验证'}
            </span>
          )}
        </div>
      </div>

      {apiKeySet === false && (
        <div className="studio-v2-guard">
          ⚠️ 未配置 AI Provider。请前往 <button className="link-btn" onClick={() => onNavigate?.('settings')}>Settings</button> 添加后再使用生成功能。
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
              skills={mySkills}
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
                  <span>✅ &quot;{installedSkill.name}&quot; 已安装</span>
                  <div className="studio-v2-flow-guide">
                    <button className="studio-v2-flow-step" onClick={() => onNavigate?.('eval', installedSkill.id)}>
                      <span className="studio-v2-flow-num">①</span>
                      <span>添加用例</span>
                    </button>
                    <span className="studio-v2-flow-arrow">→</span>
                    <button className="studio-v2-flow-step" onClick={() => onNavigate?.('eval', installedSkill.id)}>
                      <span className="studio-v2-flow-num">②</span>
                      <span>评测</span>
                    </button>
                    <span className="studio-v2-flow-arrow">→</span>
                    <button className="studio-v2-flow-step" onClick={() => onNavigate?.('evo', installedSkill.id)}>
                      <span className="studio-v2-flow-num">③</span>
                      <span>进化</span>
                    </button>
                  </div>
                </div>
              ) : (
                <InstallBar
                  content={editorContent}
                  scores={scores}
                  scoring={scoring}
                  similar={similarSkills}
                  parentSkillId={mode === 'extract' ? extractSourceSkillId : undefined}
                  onInstalled={handleInstalled}
                />
              )}
            </>
          )}

          {/* Validation Panel */}
          <ValidationPanel
            expanded={valExpanded}
            onToggle={() => setValExpanded(v => !v)}
            installedSkill={installedSkill}
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
        .studio-v2-header h1 { font-size: 24px; font-weight: 700; }
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
        .studio-v2-flow-guide { display: flex; align-items: center; gap: 6px; }
        .studio-v2-flow-step { display: flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(74,222,128,0.4); background: rgba(74,222,128,0.08); color: var(--success); font-size: 12px; cursor: pointer; transition: all var(--transition); }
        .studio-v2-flow-step:hover { background: rgba(74,222,128,0.18); border-color: var(--success); }
        .studio-v2-flow-num { font-weight: 700; font-size: 11px; }
        .studio-v2-flow-arrow { font-size: 12px; color: rgba(74,222,128,0.5); }

        /* 5D Mini */
        .studio-v2-score-mini-wrap { display: flex; flex-direction: column; gap: 6px; }
        .studio-v2-score-mini { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
        .studio-v2-score-pill { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 8px; border: 1px solid; cursor: default; }
        .studio-v2-score-pill.weak { background: rgba(239,68,68,0.06); }
        .studio-v2-score-pill-warn { margin-left: 2px; font-size: 9px; opacity: 0.8; }
        .studio-v2-score-avg { font-size: 11px; font-weight: 700; margin-left: 4px; }
        .studio-v2-score-mini-loading { font-size: 11px; color: var(--text-muted); }
        .studio-v2-score-hint-toggle { background: none; border: none; font-size: 11px; color: var(--warning); cursor: pointer; padding: 0 4px; margin-left: 2px; }
        .studio-v2-score-hint-toggle:hover { opacity: 0.75; }
        .studio-v2-score-hints { background: rgba(249,115,22,0.06); border: 1px solid rgba(249,115,22,0.2); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; }
        .studio-v2-score-hint-row { display: flex; gap: 8px; align-items: baseline; font-size: 11px; }
        .studio-v2-score-hint-dim { font-weight: 700; flex-shrink: 0; min-width: 28px; }
        .studio-v2-score-hint-text { color: var(--text-muted); line-height: 1.4; }

        /* Similar Warn */
        .studio-v2-similar-warn { display: flex; gap: 8px; background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.3); border-radius: var(--radius); padding: 8px 12px; font-size: 12px; color: var(--warning); }

        /* Validation Panel */
        .studio-v2-val-panel { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; flex-shrink: 0; }
        .studio-v2-val-header { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: var(--surface2); cursor: pointer; user-select: none; }
        .studio-v2-val-title { display: flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 600; }
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
        .studio-v2-qt-pre { font-size: 12px; font-family: monospace; white-space: pre-wrap; word-break: break-all; padding: 10px; margin: 0; color: var(--text); line-height: 1.55; max-height: 300px; overflow-y: auto; }
        .studio-v2-qt-files { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 10px; border-top: 1px solid var(--border); }
        .studio-v2-qt-file-btn { background: var(--surface); border: 1px solid var(--accent); border-radius: 5px; color: var(--accent); font-size: 11px; padding: 3px 8px; cursor: pointer; }
        .studio-v2-qt-file-btn:hover { background: var(--accent); color: #fff; }
        .studio-v2-qt-trace { padding: 6px 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-muted); }
        .studio-v2-qt-trace summary { cursor: pointer; user-select: none; padding: 2px 0; }
        .studio-v2-qt-trace-step { margin-top: 6px; border-left: 2px solid var(--border); padding-left: 8px; }
        .studio-v2-qt-trace-tool { font-weight: 600; color: var(--accent); font-size: 11px; }
        .studio-v2-qt-trace-pre { font-size: 11px; font-family: monospace; white-space: pre-wrap; word-break: break-all; margin: 2px 0 0; color: var(--text-muted); max-height: 120px; overflow-y: auto; }
        .studio-v2-success-note { font-size: 12px; color: var(--success); }


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
        .studio-v2-extract-filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .studio-v2-extract-skill-select { font-size: 12px; padding: 4px 8px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface2); color: var(--text); flex: 1; min-width: 120px; max-width: 200px; }
        .studio-v2-extract-label-filters { display: flex; gap: 5px; }
        .studio-v2-label-filter-chip { font-size: 11px; padding: 3px 8px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; }
        .studio-v2-label-filter-chip.active { background: rgba(108,99,255,0.06); }
        .studio-v2-extract-preview { display: flex; flex-direction: column; gap: 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 10px; }
        .studio-v2-extract-record { display: flex; gap: 8px; align-items: center; font-size: 12px; }
        .studio-v2-extract-skill { font-weight: 600; color: var(--accent); flex-shrink: 0; font-size: 11px; }
        .studio-v2-extract-input { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .studio-v2-record-label-chip { font-size: 11px; padding: 1px 6px; border-radius: 6px; border: 1px solid var(--border); background: transparent; cursor: pointer; flex-shrink: 0; color: var(--text-muted); }
        .studio-v2-extract-more { font-size: 11px; color: var(--text-muted); padding-top: 2px; }

        /* Agent Badge (Discovery Panel) */
        .studio-v2-agent-badge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: rgba(249,115,22,0.12); color: #f97316; border: 1px solid rgba(249,115,22,0.3); margin-left: 5px; vertical-align: middle; }

        /* Quick Run */
        .studio-v2-quickrun { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
        .studio-v2-quickrun-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
        .studio-v2-quickrun-hint { font-size: 10px; font-weight: 400; color: var(--text-muted); text-transform: none; letter-spacing: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
        .studio-v2-agent-run-hint { font-size: 12px; color: var(--text-muted); background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; }
        .studio-v2-quickrun-output { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; }
        .studio-v2-quickrun-output pre { font-size: 12px; font-family: monospace; white-space: pre-wrap; word-break: break-all; color: var(--text); line-height: 1.6; margin: 0; }


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
        .studio-v2-tool-chip.active { background: rgba(249,115,22,0.1); color: #f97316; border-color: rgba(249,115,22,0.4); }
        .studio-v2-val-tabs { display: flex; gap: 4px; margin-bottom: 10px; }
        .studio-v2-val-tab { font-size: 12px; padding: 4px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .studio-v2-val-tab:hover:not(.disabled) { color: var(--text); border-color: var(--text-muted); }
        .studio-v2-val-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
        .studio-v2-val-tab.disabled { opacity: 0.4; cursor: not-allowed; }
        .studio-v2-oneclick { display: flex; flex-direction: column; gap: 10px; }
        .studio-v2-oneclick-cases { display: flex; flex-wrap: wrap; gap: 5px; }
        .studio-v2-oneclick-tc { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); }
        .studio-v2-oneclick-empty { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; color: var(--text-muted); font-size: 13px; }
        .studio-v2-oneclick-hint { font-size: 11px; color: var(--text-muted); opacity: 0.7; }
        .studio-v2-progress-bar-wrap { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
        .studio-v2-progress-bar { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.3s ease; }
        .studio-v2-oneclick-result { display: flex; flex-wrap: wrap; gap: 5px; }`}</style>
    </div>
  )
}
