import { useEffect, useState } from 'react'
import type { Skill, TestCase } from '../../../shared/types'

const JUDGE_LABELS: Record<TestCase['judgeType'], string> = {
  llm: 'LLM Judge',
  grep: 'Grep',
  command: 'Command'
}

const JUDGE_COLORS: Record<TestCase['judgeType'], string> = {
  llm: '#6c63ff',
  grep: '#00d4aa',
  command: '#f59e0b'
}

// ── Single test case card ─────────────────────────────────────────────────────

function TestCaseCard({ tc, onDelete }: { tc: TestCase; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="tc-card">
      <div className="tc-card-header" onClick={() => setExpanded((v) => !v)}>
        <span className="tc-expand">{expanded ? '▾' : '▸'}</span>
        <span className="tc-name">{tc.name}</span>
        <span className="judge-badge" style={{ borderColor: JUDGE_COLORS[tc.judgeType], color: JUDGE_COLORS[tc.judgeType] }}>
          {JUDGE_LABELS[tc.judgeType]}
        </span>
        <button
          className={`btn btn-xs ${confirming ? 'btn-danger' : 'btn-ghost'}`}
          onClick={(e) => {
            e.stopPropagation()
            if (!confirming) { setConfirming(true); return }
            onDelete()
          }}
          onBlur={() => setConfirming(false)}
        >
          {confirming ? '确认删除' : '删除'}
        </button>
      </div>
      {expanded && (
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
  )
}

// ── AI Generate panel ─────────────────────────────────────────────────────────

function GeneratePanel({ skillId, apiKeySet, onGenerated }: {
  skillId: string
  apiKeySet: boolean | null
  onGenerated: (tcs: TestCase[]) => void
}) {
  const [count, setCount] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCount, setLastCount] = useState(0)

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const tcs = await window.api.testcases.generate(skillId, count)
      setLastCount(tcs.length)
      onGenerated(tcs)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="gen-panel">
      <div className="gen-header">
        <span className="gen-title">🤖 AI 自动生成</span>
        <span className="gen-hint">AI 分析 Skill 内容，生成覆盖正常路径和边界情况的测试用例</span>
      </div>
      <div className="gen-controls">
        <div className="count-control">
          <label className="count-label">生成数量</label>
          <div className="count-row">
            {[3, 5, 10, 15].map((n) => (
              <button
                key={n}
                className={`count-chip ${count === n ? 'active' : ''}`}
                onClick={() => setCount(n)}
                disabled={generating}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={generating || apiKeySet === false}
        >
          {generating ? '生成中...' : `生成 ${count} 个用例`}
        </button>
      </div>
      {error && <div className="gen-error">⚠️ {error}</div>}
      {!generating && lastCount > 0 && !error && (
        <div className="gen-success">✅ 已生成并保存 {lastCount} 个测试用例</div>
      )}
      {apiKeySet === false && (
        <div className="gen-warn">⚠️ 未配置 API Key，请前往 Settings 添加后再使用 AI 生成。</div>
      )}
    </div>
  )
}

// ── Manual add form ───────────────────────────────────────────────────────────

function AddForm({ skillId, onAdded }: {
  skillId: string
  onAdded: (tc: TestCase) => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '', input: '',
    judgeType: 'llm' as TestCase['judgeType'],
    judgeParam: ''
  })
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!form.name.trim() || !form.input.trim()) return
    setAdding(true)
    const tc = await window.api.testcases.create({ skillId, ...form })
    onAdded(tc)
    setForm({ name: '', input: '', judgeType: 'llm', judgeParam: '' })
    setAdding(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm add-toggle" onClick={() => setOpen(true)}>
        + 手动添加用例
      </button>
    )
  }

  return (
    <div className="add-form">
      <div className="add-form-header">
        <span>手动添加测试用例</span>
        <button className="btn-icon-sm" onClick={() => setOpen(false)}>✕</button>
      </div>
      <input
        placeholder="用例名称..."
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        style={{ width: '100%', marginBottom: 10 }}
      />
      <textarea
        rows={4}
        placeholder="输入（Input）..."
        value={form.input}
        onChange={(e) => setForm((f) => ({ ...f, input: e.target.value }))}
        style={{ width: '100%', resize: 'vertical', marginBottom: 10 }}
      />
      <div className="add-form-row">
        <select
          value={form.judgeType}
          onChange={(e) => setForm((f) => ({ ...f, judgeType: e.target.value as TestCase['judgeType'] }))}
        >
          <option value="llm">LLM Judge</option>
          <option value="grep">Grep</option>
          <option value="command">Command</option>
        </select>
        <input
          placeholder="Judge param（可选）..."
          value={form.judgeParam}
          onChange={(e) => setForm((f) => ({ ...f, judgeParam: e.target.value }))}
          style={{ flex: 1 }}
        />
      </div>
      <div className="add-form-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>取消</button>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleAdd}
          disabled={adding || !form.name.trim() || !form.input.trim()}
        >
          {adding ? '添加中...' : '添加'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TestCasePage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState('')
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(false)
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    window.api.skills.getAll().then(setSkills)
    window.api.config.get().then((c) => setApiKeySet(c.anthropicApiKeySet || c.openaiApiKeySet))
  }, [])

  useEffect(() => {
    if (!selectedSkill) { setTestCases([]); return }
    setLoading(true)
    window.api.testcases.getBySkill(selectedSkill).then((tcs) => {
      setTestCases(tcs)
      setLoading(false)
    })
  }, [selectedSkill])

  const filtered = testCases.filter((tc) =>
    !search || tc.name.toLowerCase().includes(search.toLowerCase()) ||
    tc.input.toLowerCase().includes(search.toLowerCase())
  )

  const byType = {
    llm: filtered.filter((t) => t.judgeType === 'llm').length,
    grep: filtered.filter((t) => t.judgeType === 'grep').length,
    command: filtered.filter((t) => t.judgeType === 'command').length
  }

  return (
    <div className="tc-root">
      <div className="tc-page-header">
        <div>
          <h1>TestCase</h1>
          <p className="subtitle">管理和生成 Skill 测试用例</p>
        </div>
        <select
          value={selectedSkill}
          onChange={(e) => { setSelectedSkill(e.target.value); setSearch('') }}
          className="skill-select"
        >
          <option value="">选择 Skill...</option>
          {skills.map((s) => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
        </select>
      </div>

      {selectedSkill && (
        <>
          <GeneratePanel
            skillId={selectedSkill}
            apiKeySet={apiKeySet}
            onGenerated={(tcs) => setTestCases((prev) => [...prev, ...tcs])}
          />

          <div className="tc-list-section">
            <div className="tc-list-header">
              <div className="tc-stats">
                <span className="stat-total">{testCases.length} 个用例</span>
                {Object.entries(byType).filter(([, n]) => n > 0).map(([type, n]) => (
                  <span key={type} className="stat-chip" style={{ color: JUDGE_COLORS[type as TestCase['judgeType']] }}>
                    {JUDGE_LABELS[type as TestCase['judgeType']]} ×{n}
                  </span>
                ))}
              </div>
              <div className="tc-search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  className="tc-search"
                  placeholder="搜索用例..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
              </div>
            </div>

            {loading ? (
              <div className="tc-empty">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="tc-empty">
                {testCases.length === 0 ? '还没有测试用例，用 AI 生成或手动添加。' : '没有匹配的用例。'}
              </div>
            ) : (
              <div className="tc-list">
                {filtered.map((tc) => (
                  <TestCaseCard
                    key={tc.id}
                    tc={tc}
                    onDelete={() => {
                      window.api.testcases.delete(tc.id)
                      setTestCases((prev) => prev.filter((t) => t.id !== tc.id))
                    }}
                  />
                ))}
              </div>
            )}

            <AddForm
              skillId={selectedSkill}
              onAdded={(tc) => setTestCases((prev) => [...prev, tc])}
            />
          </div>
        </>
      )}

      {!selectedSkill && (
        <div className="no-skill">
          <div className="no-skill-icon">🧪</div>
          <p>选择一个 Skill 开始管理测试用例</p>
        </div>
      )}

      <style>{`
        .tc-root { display: flex; flex-direction: column; gap: 20px; }
        .tc-page-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .tc-page-header h1 { font-size: 24px; font-weight: 700; }
        .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
        .skill-select { padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 14px; min-width: 220px; }

        /* AI Generate panel */
        .gen-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
        .gen-header { margin-bottom: 14px; }
        .gen-title { font-size: 14px; font-weight: 600; margin-right: 10px; }
        .gen-hint { font-size: 12px; color: var(--text-muted); }
        .gen-controls { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .count-control { display: flex; flex-direction: column; gap: 6px; }
        .count-label { font-size: 12px; color: var(--text-muted); }
        .count-row { display: flex; gap: 6px; }
        .count-chip { padding: 4px 12px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 13px; cursor: pointer; transition: all var(--transition); }
        .count-chip:hover { border-color: var(--accent); color: var(--accent); }
        .count-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }
        .gen-error { margin-top: 10px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius); padding: 8px 12px; color: var(--danger); font-size: 13px; }
        .gen-success { margin-top: 10px; background: rgba(74,222,128,0.08); border: 1px solid var(--success); border-radius: var(--radius); padding: 8px 12px; color: var(--success); font-size: 13px; }
        .gen-warn { margin-top: 10px; background: rgba(250,204,21,0.08); border: 1px solid rgba(250,204,21,0.3); border-radius: var(--radius); padding: 8px 12px; color: var(--warning); font-size: 12px; }

        /* List section */
        .tc-list-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
        .tc-list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
        .tc-stats { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .stat-total { font-size: 14px; font-weight: 600; }
        .stat-chip { font-size: 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; }
        .tc-search-wrap { position: relative; display: flex; align-items: center; }
        .search-icon { position: absolute; left: 9px; font-size: 12px; pointer-events: none; }
        .tc-search { padding: 6px 28px 6px 28px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; width: 200px; }
        .tc-search:focus { outline: none; border-color: var(--accent); }
        .search-clear { position: absolute; right: 8px; background: none; color: var(--text-muted); font-size: 11px; padding: 2px 4px; }
        .tc-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
        .tc-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }

        /* Test case card */
        .tc-card { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .tc-card-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; background: var(--surface2); transition: background var(--transition); }
        .tc-card-header:hover { background: rgba(108,99,255,0.06); }
        .tc-expand { font-size: 11px; color: var(--text-muted); width: 12px; flex-shrink: 0; }
        .tc-name { flex: 1; font-size: 13px; font-weight: 500; }
        .judge-badge { font-size: 10px; border: 1px solid; border-radius: 4px; padding: 1px 7px; flex-shrink: 0; }
        .tc-card-body { padding: 12px 14px; background: var(--bg); border-top: 1px solid var(--border); }
        .tc-field { margin-bottom: 10px; }
        .tc-field-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); display: block; margin-bottom: 4px; }
        .tc-field-value { font-family: 'Courier New', monospace; font-size: 12px; color: var(--text); white-space: pre-wrap; word-break: break-all; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 8px 10px; margin: 0; }
        .tc-meta { font-size: 11px; color: var(--text-muted); }

        /* Add form */
        .add-toggle { margin-top: 4px; }
        .add-form { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; margin-top: 8px; }
        .add-form-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
        .btn-icon-sm { background: transparent; color: var(--text-muted); font-size: 11px; padding: 2px 5px; border-radius: 3px; }
        .btn-icon-sm:hover { color: var(--danger); }
        .add-form-row { display: flex; gap: 8px; margin-bottom: 10px; }
        .add-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .btn-sm { padding: 6px 12px; font-size: 12px; }
        .btn-xs { padding: 3px 9px; font-size: 11px; }
        .btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }

        /* No skill */
        .no-skill { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 80px 20px; color: var(--text-muted); text-align: center; }
        .no-skill-icon { font-size: 40px; }
      `}</style>
    </div>
  )
}
