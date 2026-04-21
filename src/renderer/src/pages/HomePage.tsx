import { useEffect, useState } from 'react'
import type { Skill } from '../../../shared/types'

export default function HomePage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Skill | null>(null)

  useEffect(() => {
    window.api.skills.getAll().then((data) => {
      setSkills(data)
      setLoading(false)
    })
  }, [])

  const handleInstall = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const skill = await window.api.skills.install(file.path)
      setSkills((prev) => [skill, ...prev])
      setSelected(skill)
    }
    input.click()
  }

  const handleUninstall = async (id: string) => {
    await window.api.skills.uninstall(id)
    setSkills((prev) => prev.filter((s) => s.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className="home-layout">
      {/* ── 左侧列表 ── */}
      <div className="skill-list-pane">
        <div className="list-header">
          <h1>Skills</h1>
          <button className="btn btn-primary" onClick={handleInstall}>+ Install</button>
        </div>

        {loading ? (
          <p className="text-muted pad">Loading...</p>
        ) : skills.length === 0 ? (
          <div className="empty-state">
            <p>No skills installed yet.</p>
            <button className="btn btn-primary" onClick={handleInstall}>Install your first Skill</button>
          </div>
        ) : (
          <ul className="skill-list">
            {skills.map((skill) => (
              <li
                key={skill.id}
                className={`skill-list-item ${selected?.id === skill.id ? 'active' : ''}`}
                onClick={() => setSelected(skill)}
              >
                <div className="skill-list-item-name">{skill.name}</div>
                <div className="skill-list-item-meta">
                  <span className="version">v{skill.version}</span>
                  <span className="format-badge">{skill.format}</span>
                </div>
                {skill.tags.length > 0 && (
                  <div className="skill-tags">
                    {skill.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                    {skill.tags.length > 3 && <span className="tag">+{skill.tags.length - 3}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 右侧详情 ── */}
      <div className="skill-detail-pane">
        {selected ? (
          <SkillDetail
            skill={selected}
            onUninstall={() => handleUninstall(selected.id)}
          />
        ) : (
          <div className="detail-empty">
            <span>← Select a Skill to view details</span>
          </div>
        )}
      </div>

      <style>{`
        .home-layout { display: flex; height: 100%; gap: 0; }

        /* list pane */
        .skill-list-pane { width: 260px; flex-shrink: 0; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
        .list-header { display: flex; justify-content: space-between; align-items: center; padding: 0 0 16px 0; flex-shrink: 0; }
        .list-header h1 { font-size: 20px; font-weight: 700; }
        .pad { padding: 16px 0; }
        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 16px; color: var(--text-muted); text-align: center; }
        .skill-list { list-style: none; overflow-y: auto; flex: 1; margin: 0 -24px; padding: 0 8px; }
        .skill-list-item { padding: 12px 16px; border-radius: var(--radius); cursor: pointer; transition: background var(--transition); margin-bottom: 2px; }
        .skill-list-item:hover { background: var(--surface); }
        .skill-list-item.active { background: var(--surface2); border-left: 2px solid var(--accent); }
        .skill-list-item-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
        .skill-list-item-meta { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
        .version { color: var(--text-muted); font-size: 11px; }
        .format-badge { background: var(--surface2); border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px; font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
        .skill-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .tag { background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; font-size: 10px; color: var(--text-muted); }

        /* detail pane */
        .skill-detail-pane { flex: 1; overflow-y: auto; padding-left: 24px; }
        .detail-empty { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; }

        /* detail content */
        .detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .detail-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
        .detail-subtitle { color: var(--text-muted); font-size: 13px; }
        .detail-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .detail-section { margin-bottom: 24px; }
        .detail-section h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 10px; }
        .meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
        .meta-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; }
        .meta-label { font-size: 11px; color: var(--text-muted); margin-bottom: 3px; }
        .meta-value { font-size: 14px; font-weight: 500; }
        .tags-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag-lg { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 3px 10px; font-size: 12px; color: var(--text-muted); }
        .code-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; color: var(--text); line-height: 1.6; }
        .markdown-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; font-size: 13px; white-space: pre-wrap; line-height: 1.7; color: var(--text); max-height: 400px; overflow-y: auto; }
        .filepath { font-family: 'Courier New', monospace; font-size: 11px; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 6px 10px; word-break: break-all; }
      `}</style>
    </div>
  )
}

function SkillDetail({ skill, onUninstall }: { skill: Skill; onUninstall: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleUninstall = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    onUninstall()
  }

  return (
    <div>
      {/* Header */}
      <div className="detail-header">
        <div>
          <div className="detail-title">{skill.name}</div>
          <div className="detail-subtitle">
            Installed {new Date(skill.installedAt).toLocaleString()}
            {skill.updatedAt !== skill.installedAt && (
              <> · Updated {new Date(skill.updatedAt).toLocaleString()}</>
            )}
          </div>
        </div>
        <div className="detail-actions">
          <button
            className={`btn ${confirmDelete ? 'btn-danger' : 'btn-ghost'}`}
            onClick={handleUninstall}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? 'Confirm Uninstall' : 'Uninstall'}
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="detail-section">
        <h3>Metadata</h3>
        <div className="meta-grid">
          <div className="meta-item">
            <div className="meta-label">Version</div>
            <div className="meta-value">{skill.version}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Format</div>
            <div className="meta-value">{skill.format}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">ID</div>
            <div className="meta-value" style={{ fontSize: 11, wordBreak: 'break-all' }}>{skill.id}</div>
          </div>
        </div>
      </div>

      {/* Tags */}
      {skill.tags.length > 0 && (
        <div className="detail-section">
          <h3>Tags</h3>
          <div className="tags-row">
            {skill.tags.map((tag) => (
              <span key={tag} className="tag-lg">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* YAML Frontmatter */}
      {skill.yamlFrontmatter && (
        <div className="detail-section">
          <h3>Frontmatter</h3>
          <pre className="code-block">---{'\n'}{skill.yamlFrontmatter}{'\n'}---</pre>
        </div>
      )}

      {/* Markdown Content */}
      <div className="detail-section">
        <h3>Content</h3>
        <pre className="markdown-block">{skill.markdownContent || '(empty)'}</pre>
      </div>

      {/* File Path */}
      {skill.filePath && (
        <div className="detail-section">
          <h3>File Path</h3>
          <div className="filepath">{skill.filePath}</div>
        </div>
      )}
    </div>
  )
}
