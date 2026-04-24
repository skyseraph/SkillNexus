import { useState, useEffect, useCallback } from 'react'
import type { JobEntry, EvolutionEngine } from '../../../shared/types'

interface TasksPageProps {
  onNavigate: (page: string, skillId?: string) => void
}

type Filter = 'all' | 'eval' | 'evo'

// ── reuse diffLines from EvoPage logic ────────────────────────────────────────
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
  onSelect: (id: string) => void
  onClick: () => void
  onDelete: (job: JobEntry) => void
  onViewContent: (job: JobEntry) => void
}

function EvalRow({ job, selected, onSelect, onClick, onDelete, onViewContent }: RowProps) {
  const failed = job.status === 'error'
  return (
    <tr className={`task-row ${selected ? 'task-row-selected' : ''}`}>
      <td className="task-check-cell" onClick={e => { e.stopPropagation(); onSelect(job.id) }}>
        <input type="checkbox" checked={selected} onChange={() => onSelect(job.id)} onClick={e => e.stopPropagation()} />
      </td>
      <td className="task-icon-cell" onClick={onClick}><span className="task-icon">📊</span></td>
      <td className="task-type-cell" onClick={onClick}>
        <span className="task-type-label">Eval</span>
        {failed && <span className="task-badge task-badge-fail">失败</span>}
      </td>
      <td className="task-skill-cell" onClick={onClick}>
        <span className="task-skill-name">{job.skillName}</span>
      </td>
      <td className="task-score-cell" onClick={onClick}>
        {failed
          ? <span className="task-score-error">错误</span>
          : job.totalScore != null
            ? <span className="task-score">{job.totalScore.toFixed(1)}</span>
            : <span className="task-score-na">—</span>
        }
      </td>
      <td className="task-meta-cell" onClick={onClick}>
        {job.durationMs != null && <span className="task-dur">{(job.durationMs / 1000).toFixed(1)}s</span>}
        <span className="task-time">{timeAgo(job.createdAt)}</span>
      </td>
      <td className="task-actions-cell">
        <div className="task-actions">
          <button className="task-action-btn" title="查看内容" onClick={e => { e.stopPropagation(); onViewContent(job) }}>👁</button>
          <button className="task-action-btn task-action-del" title="删除" onClick={e => { e.stopPropagation(); onDelete(job) }}>🗑</button>
        </div>
      </td>
    </tr>
  )
}

function EvoRow({ job, selected, onSelect, onClick, onDelete, onViewContent }: RowProps) {
  const engineLabel = job.engine ? (ENGINE_LABELS[job.engine] ?? job.engine) : '进化'
  const engineIcon = job.engine ? (ENGINE_ICONS[job.engine] ?? '🔬') : '🔬'
  return (
    <tr className={`task-row ${selected ? 'task-row-selected' : ''}`}>
      <td className="task-check-cell" onClick={e => { e.stopPropagation(); onSelect(job.id) }}>
        <input type="checkbox" checked={selected} onChange={() => onSelect(job.id)} onClick={e => e.stopPropagation()} />
      </td>
      <td className="task-icon-cell" onClick={onClick}><span className="task-icon">{engineIcon}</span></td>
      <td className="task-type-cell" onClick={onClick}>
        <span className="task-type-label">{engineLabel}</span>
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
          <button className="task-action-btn" title="查看内容" onClick={e => { e.stopPropagation(); onViewContent(job) }}>👁</button>
          <button className="task-action-btn task-action-del" title="删除" onClick={e => { e.stopPropagation(); onDelete(job) }}>🗑</button>
        </div>
      </td>
    </tr>
  )
}

// ── content modal ─────────────────────────────────────────────────────────────
function ContentModal({ title, content, skillId, onClose, onNavigate }: {
  title: string; content: string; skillId?: string
  onClose: () => void; onNavigate: (page: string, id?: string) => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <pre className="modal-code">{content}</pre>
        {skillId && (
          <div className="modal-footer">
            <button className="btn btn-primary btn-sm" onClick={() => { onClose(); onNavigate('eval', skillId) }}>去评测</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); onNavigate('evo', skillId) }}>去进化</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── diff modal ────────────────────────────────────────────────────────────────
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
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [contentModal, setContentModal] = useState<{ title: string; content: string; skillId?: string } | null>(null)
  const [diffModal, setDiffModal] = useState<{ jobA: JobEntry; jobB: JobEntry; contentA: string; contentB: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JobEntry | null>(null)

  const load = useCallback(async (f: Filter) => {
    setLoading(true); setSelected(new Set())
    try { setJobs(await window.api.jobs.list(f)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  const filtered = search.trim()
    ? jobs.filter(j => j.skillName.toLowerCase().includes(search.toLowerCase()) ||
        j.parentSkillName?.toLowerCase().includes(search.toLowerCase()))
    : jobs

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
    if (job.type === 'eval') onNavigate('eval', job.skillId)
    else onNavigate('evo', job.parentSkillId ?? job.skillId)
  }

  const handleViewContent = async (job: JobEntry) => {
    try {
      const content = await window.api.skills.getContent(job.skillId)
      setContentModal({ title: job.skillName, content, skillId: job.skillId })
    } catch { /* skill may have been deleted */ }
  }

  const handleDelete = async (job: JobEntry) => {
    try {
      await window.api.skills.uninstall(job.skillId)
      setJobs(prev => prev.filter(j => j.id !== job.id))
      setSelected(prev => { const n = new Set(prev); n.delete(job.id); return n })
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

  return (
    <div className="tasks-root">
      <style>{`
        .tasks-root { padding: 24px; height: 100%; overflow-y: auto; box-sizing: border-box; }
        .tasks-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .tasks-title { font-size: 20px; font-weight: 700; color: var(--text); }
        .tasks-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .tasks-tabs { display: flex; gap: 4px; }
        .tasks-tab { padding: 5px 14px; font-size: 12px; font-weight: 500; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .tasks-tab.active { border-color: var(--accent); background: rgba(108,99,255,0.1); color: var(--accent); }
        .tasks-tab:hover:not(.active) { border-color: var(--text-muted); color: var(--text); }
        .tasks-search { flex: 1; max-width: 260px; padding: 5px 10px; font-size: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); outline: none; }
        .tasks-search:focus { border-color: var(--accent); }
        .tasks-refresh { padding: 5px 12px; font-size: 12px; border-radius: 6px; }
        .tasks-compare-btn { padding: 5px 14px; font-size: 12px; border-radius: 6px; background: rgba(108,99,255,0.12); border: 1px solid var(--accent); color: var(--accent); cursor: pointer; font-weight: 600; transition: all var(--transition); }
        .tasks-compare-btn:hover { background: rgba(108,99,255,0.22); }
        .tasks-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .tasks-table th { text-align: left; font-size: 11px; font-weight: 500; color: var(--text-muted); padding: 6px 8px; border-bottom: 1px solid var(--border); }
        .task-row { cursor: pointer; transition: background var(--transition); }
        .task-row:hover { background: rgba(108,99,255,0.05); }
        .task-row:hover .task-actions { opacity: 1; }
        .task-row-selected { background: rgba(108,99,255,0.08); }
        .task-row td { padding: 9px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
        .task-check-cell { width: 28px; cursor: default; }
        .task-check-cell input { cursor: pointer; accent-color: var(--accent); }
        .task-icon-cell { width: 32px; }
        .task-icon { font-size: 16px; }
        .task-type-cell { width: 110px; }
        .task-type-label { font-size: 12px; font-weight: 600; color: var(--text); }
        .task-badge { margin-left: 5px; font-size: 10px; padding: 1px 5px; border-radius: 4px; }
        .task-badge-fail { background: rgba(248,113,113,0.15); color: #f87171; }
        .task-skill-cell { min-width: 160px; }
        .task-skill-name { color: var(--text); font-weight: 500; }
        .task-skill-parent { color: var(--text-muted); font-size: 12px; }
        .task-arrow { color: var(--text-muted); font-size: 11px; }
        .task-score-cell { width: 100px; }
        .task-score { color: var(--accent); font-weight: 600; }
        .task-score-error { color: #f87171; font-size: 11px; }
        .task-score-na { color: var(--text-muted); font-size: 11px; }
        .task-meta-cell { width: 110px; display: flex; gap: 8px; align-items: center; padding-top: 10px; }
        .task-dur { font-size: 11px; color: var(--text-muted); }
        .task-time { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
        .task-actions-cell { width: 64px; }
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

        /* Modal */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .modal-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: min(720px, 90vw); max-height: 80vh; display: flex; flex-direction: column; }
        .modal-box-wide { width: min(900px, 95vw); }
        .modal-box-sm { width: min(400px, 90vw); }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .modal-title { font-size: 14px; font-weight: 600; color: var(--text); }
        .modal-close { background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
        .modal-close:hover { background: var(--surface2); color: var(--text); }
        .modal-code { flex: 1; overflow-y: auto; padding: 16px 20px; margin: 0; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.65; white-space: pre-wrap; word-break: break-all; color: var(--text); background: var(--bg); }
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
      `}</style>

      <div className="tasks-header">
        <span className="tasks-title">Tasks</span>
      </div>

      <div className="tasks-toolbar">
        <div className="tasks-tabs">
          {(['all', 'eval', 'evo'] as Filter[]).map(f => (
            <button key={f} className={`tasks-tab ${filter === f ? 'active' : ''}`}
              onClick={() => { setFilter(f); setSearch('') }}>
              {f === 'all' ? '全部' : f === 'eval' ? '评测' : '进化'}
              {f === filter && !loading && <span className="tasks-count">({filtered.length})</span>}
            </button>
          ))}
        </div>
        <input className="tasks-search" placeholder="搜索 Skill..." value={search}
          onChange={e => setSearch(e.target.value)} />
        {selected.size === 2 && (
          <button className="tasks-compare-btn" onClick={handleCompare}>对比选中 (2)</button>
        )}
        <button className="btn btn-ghost tasks-refresh" onClick={() => load(filter)} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </button>
      </div>

      {loading ? (
        <div className="tasks-loading">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="tasks-empty">
          {search ? `未找到匹配"${search}"的任务` : '暂无任务记录'}
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
                  const props = {
                    job, selected: isSelected,
                    onSelect: toggleSelect,
                    onClick: () => handleClick(job),
                    onDelete: (j: JobEntry) => setDeleteTarget(j),
                    onViewContent: handleViewContent
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

      {contentModal && (
        <ContentModal
          title={contentModal.title}
          content={contentModal.content}
          skillId={contentModal.skillId}
          onClose={() => setContentModal(null)}
          onNavigate={onNavigate}
        />
      )}

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
