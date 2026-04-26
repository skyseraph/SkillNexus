import { useEffect, useState, useCallback, useRef } from 'react'
import type { Skill, SkillFileEntry, ToolTarget, ScannedSkill, ScanResult, EvoChainEntry } from '../../../shared/types'
import { useTrack } from '../hooks/useTrack'

type ViewMode = 'grid' | 'list'
type SortMode = 'newest' | 'oldest' | 'name'

// ── File tree helpers ─────────────────────────────────────────────────────────

interface TreeNode { entry: SkillFileEntry; children: TreeNode[] }

function buildTree(entries: SkillFileEntry[]): TreeNode[] {
  const roots: TreeNode[] = []
  const map = new Map<string, TreeNode>()
  for (const e of entries) map.set(e.relativePath, { entry: e, children: [] })
  for (const [, node] of map) {
    const parts = node.entry.relativePath.split('/')
    if (parts.length === 1) roots.push(node)
    else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = map.get(parentPath)
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.entry.isDir !== b.entry.isDir) return a.entry.isDir ? -1 : 1
      return a.entry.name.localeCompare(b.entry.name)
    })
    nodes.forEach(n => sort(n.children))
  }
  sort(roots)
  return roots
}

function fileIcon(entry: SkillFileEntry): string {
  if (entry.isDir) return '📁'
  const ext = entry.ext.toLowerCase()
  if (ext === '.md' || ext === '.mdc') return '📝'
  if (['.py', '.js', '.ts', '.tsx', '.jsx'].includes(ext)) return '⚙️'
  if (['.sh', '.bash', '.zsh'].includes(ext)) return '🖥️'
  if (['.json', '.yaml', '.yml', '.toml'].includes(ext)) return '📋'
  return '📎'
}

function langFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.md': 'markdown', '.mdc': 'markdown', '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.py': 'python', '.sh': 'bash', '.bash': 'bash',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.css': 'css'
  }
  return map[ext.toLowerCase()] || 'text'
}

// ── Trust Badge ───────────────────────────────────────────────────────────────

const TRUST_META: Record<number, { label: string; color: string }> = {
  1: { label: 'T1 未验证',   color: '#888' },
  2: { label: 'T2 格式验证', color: '#f59e0b' },
  3: { label: 'T3 已评测',   color: '#00d4aa' },
  4: { label: 'T4 已批准',   color: '#6c63ff' }
}

function TrustBadge({ level }: { level: 1 | 2 | 3 | 4 }) {
  const m = TRUST_META[level] ?? TRUST_META[1]
  return (
    <span className="trust-badge" style={{ color: m.color, borderColor: `${m.color}55`, background: `${m.color}11` }}>
      {m.label}
    </span>
  )
}

// ── Skill Detail Drawer ───────────────────────────────────────────────────────

function TreeNodeView({ node, depth, selectedPath, onSelect, expandedPaths, onToggle }: {
  node: TreeNode; depth: number; selectedPath: string | null
  onSelect: (e: SkillFileEntry) => void; expandedPaths: Set<string>; onToggle: (p: string) => void
}) {
  const expanded = expandedPaths.has(node.entry.relativePath)
  const isSelected = !node.entry.isDir && selectedPath === node.entry.path
  return (
    <div>
      <div className={`tree-row ${isSelected ? 'selected' : ''}`} style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => node.entry.isDir ? onToggle(node.entry.relativePath) : onSelect(node.entry)}>
        <span className="tree-toggle">{node.entry.isDir ? (expanded ? '▾' : '▸') : ''}</span>
        <span className="tree-icon">{fileIcon(node.entry)}</span>
        <span className="tree-name">{node.entry.name}</span>
        {!node.entry.isDir && node.entry.size > 0 && (
          <span className="tree-size">{node.entry.size < 1024 ? `${node.entry.size}B` : `${(node.entry.size / 1024).toFixed(1)}K`}</span>
        )}
      </div>
      {node.entry.isDir && expanded && node.children.map(c => (
        <TreeNodeView key={c.entry.relativePath} node={c} depth={depth + 1}
          selectedPath={selectedPath} onSelect={onSelect} expandedPaths={expandedPaths} onToggle={onToggle} />
      ))}
    </div>
  )
}

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^```[\w]*\n([\s\S]*?)^```/gm, '<pre><code>$1</code></pre>')
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#" data-href="$2">$1</a>')
    .replace(/^(?!<[hupla]|<pre|<li|<ul|<\/ul)(.+)$/gm, '<p>$1</p>')
}

function FileViewer({ skill, file }: { skill: Skill; file: SkillFileEntry | null }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renderMd, setRenderMd] = useState(true)

  useEffect(() => {
    if (!file || file.isDir) { setContent(null); return }
    setLoading(true); setError(null)
    window.api.skills.readFile(file.path, skill.id)
      .then(c => { setContent(c); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [file?.path, skill.id])

  const isMd = file && ['.md', '.mdc'].includes(file.ext.toLowerCase())

  if (!file) return <div className="viewer-empty">Select a file to view its content</div>
  if (file.isDir) return <div className="viewer-empty">📁 {file.name}/</div>
  if (loading) return <div className="viewer-empty">Loading...</div>
  if (error) return <div className="viewer-error">{error}</div>
  return (
    <div className="viewer-content">
      <div className="viewer-file-header">
        <span>{fileIcon(file)}</span>
        <span className="viewer-filename">{file.relativePath}</span>
        <span className="viewer-lang">{langFromExt(file.ext)}</span>
        {isMd && (
          <button className="viewer-toggle-btn" onClick={() => setRenderMd(v => !v)}>
            {renderMd ? 'Raw' : 'Preview'}
          </button>
        )}
      </div>
      {isMd && renderMd && content !== null
        ? <div className="viewer-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} onClick={e => {
            const a = (e.target as HTMLElement).closest('a[data-href]')
            if (a) { e.preventDefault(); window.api.shell.openExternal(a.getAttribute('data-href')!) }
          }} />
        : <pre className="viewer-pre">{content}</pre>
      }
    </div>
  )
}

function ExportTab({ skill, toast }: { skill: Skill; toast?: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [targets, setTargets] = useState<ToolTarget[]>([])

  useEffect(() => {
    window.api.skills.getToolTargets().then(setTargets)
  }, [])

  const doExport = async (toolId: string, mode: 'copy' | 'symlink') => {
    const toolName = targets.find(t => t.id === toolId)?.name ?? toolId
    try {
      await window.api.skills.export(skill.id, toolId, mode)
      toast?.(`Exported to ${toolName} (${mode})`, 'success')
    } catch (e) {
      toast?.(String(e), 'error')
    }
  }

  return (
    <div className="export-tab">
      <p className="export-desc">Sync this Skill to local AI tools. Copy creates a standalone file; Symlink keeps it in sync with edits.</p>
      <div className="export-list">
        {targets.map(t => (
          <div key={t.id} className="export-row">
            <div className="export-tool-info">
              <span className={`tool-dot ${t.exists ? 'exists' : ''}`} />
              <span className="tool-name">{t.name}</span>
              <span className="tool-dir">{t.exportDirDisplay}</span>
            </div>
            <div className="export-actions">
              <button className="btn btn-xs" onClick={() => doExport(t.id, 'copy')} title="Copy file">Copy</button>
              <button className="btn btn-xs btn-ghost" onClick={() => doExport(t.id, 'symlink')} title="Create symlink">Symlink</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkillDrawer({ skill, onClose, onUninstall, onTrustChange, toast, onNavigate }: {
  skill: Skill; onClose: () => void; onUninstall: (id: string) => void
  onTrustChange?: (id: string, level: 1 | 2 | 3 | 4) => void
  toast?: (msg: string, type?: 'success' | 'error' | 'info') => void
  onNavigate?: (page: string, skillId?: string) => void
}) {
  const [files, setFiles] = useState<SkillFileEntry[]>([])
  const [filesLoading, setFilesLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<SkillFileEntry | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'files' | 'history' | 'export'>('files')
  const [evoChain, setEvoChain] = useState<EvoChainEntry[]>([])
  const [evoChainOpen, setEvoChainOpen] = useState(true)

  useEffect(() => {
    if (activeTab === 'history') {
      window.api.skills.getEvoChain(skill.id).then(setEvoChain).catch(() => setEvoChain([]))
    }
  }, [activeTab, skill.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setFilesLoading(true); setSelectedFile(null)
    window.api.skills.listFiles(skill.id).then(list => {
      setFiles(list)
      setFilesLoading(false)
      const firstDirs = list.filter(e => e.isDir && !e.relativePath.includes('/'))
      setExpandedPaths(new Set(firstDirs.map(e => e.relativePath)))
      const entry = list.find(e => !e.isDir && ['.md', '.mdc'].includes(e.ext.toLowerCase()))
      if (entry) setSelectedFile(entry)
    })
  }, [skill.id])

  const tree = buildTree(files)
  const toggleDir = useCallback((path: string) => {
    setExpandedPaths(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n })
  }, [])

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <div className="drawer-title">
            <span className="skill-type-icon-lg">{skill.skillType === 'agent' ? '🤖' : '📝'}</span>
            <div>
              <div className="drawer-name">{skill.name}</div>
              <div className="drawer-sub">v{skill.version} · {skill.format}{skill.tags.length > 0 ? ` · ${skill.tags.slice(0,3).map(t=>`#${t}`).join(' ')}` : ''}</div>
            </div>
          </div>
          <div className="drawer-header-actions">
            <TrustBadge level={(skill.trustLevel ?? 1) as 1|2|3|4} />
            {(skill.trustLevel ?? 1) < 4 && (
              <button
                className="btn btn-sm btn-ghost"
                title={(skill.trustLevel ?? 1) < 2 ? '需要先通过 5D 评分（T2）和 8D 评测（T3）才能批准' : ''}
                disabled={(skill.trustLevel ?? 1) < 2}
                style={(skill.trustLevel ?? 1) < 2 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                onClick={async () => {
                  await window.api.skills.setTrustLevel(skill.id, 4)
                  onTrustChange?.(skill.id, 4)
                  toast?.('已批准为 T4', 'success')
                }}>✓ 批准</button>
            )}
            <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }}
              onClick={() => onUninstall(skill.id)}>
              Uninstall
            </button>
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="drawer-tabs">
          {(['files', 'history', 'export'] as const).map(tab => (
            <button key={tab} className={`drawer-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab === 'files' ? `Files${files.filter(f=>!f.isDir).length > 0 ? ` (${files.filter(f=>!f.isDir).length})` : ''}` : tab === 'history' ? 'History' : 'Export'}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {activeTab === 'files' && (
            <div className="detail-files-layout">
              <div className="file-tree-pane">
                {filesLoading ? <div className="tree-loading">Loading...</div> : tree.length === 0 ? <div className="tree-loading">No files</div> : (
                  tree.map(n => (
                    <TreeNodeView key={n.entry.relativePath} node={n} depth={0}
                      selectedPath={selectedFile?.path ?? null} onSelect={setSelectedFile}
                      expandedPaths={expandedPaths} onToggle={toggleDir} />
                  ))
                )}
              </div>
              <div className="file-viewer-pane"><FileViewer skill={skill} file={selectedFile} /></div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="detail-meta">
              <div className="meta-grid">
                {[['ID', skill.id], ['Type', skill.skillType], ['Format', skill.format],
                  ['Version', skill.version], ['Installed', new Date(skill.installedAt).toLocaleString()],
                  ['Updated', new Date(skill.updatedAt).toLocaleString()]
                ].map(([label, val]) => (
                  <div key={label} className="meta-item">
                    <div className="meta-label">{label}</div>
                    <div className="meta-value">{val}</div>
                  </div>
                ))}
              </div>
              {skill.rootDir && <div className="detail-section"><div className="meta-label">Root Directory</div><div className="filepath">{skill.rootDir}</div></div>}
              {skill.yamlFrontmatter && (
                <div className="detail-section">
                  <div className="meta-label" style={{marginBottom:8}}>Frontmatter</div>
                  <pre className="code-block">---{'\n'}{skill.yamlFrontmatter}{'\n'}---</pre>
                </div>
              )}
              {evoChain.length >= 1 && (
                <div className="detail-section">
                  <div className="evo-chain-header" onClick={() => setEvoChainOpen(o => !o)}>
                    <span className="meta-label">进化血缘</span>
                    {evoChain.length > 1 && <span className="evo-chain-count">{evoChain.length} 代</span>}
                    <span className="evo-chain-toggle">{evoChainOpen ? '▾' : '▸'}</span>
                  </div>
                  {evoChainOpen && (
                    evoChain.length === 1 ? (
                      <div className="evo-chain-empty">
                        <span>根版本，尚未进化</span>
                        <span className="evo-chain-empty-hint">
                          {onNavigate
                            ? <button className="link-btn" style={{ fontSize: 11 }} onClick={() => { onClose(); onNavigate('evo', skill.id) }}>在 Evo 页面运行进化引擎 →</button>
                            : '在 Evo 页面运行进化引擎后，此处将展示完整血缘链'}
                        </span>
                      </div>
                    ) : (
                      <div className="evo-chain-tree">
                        {evoChain.map((entry, idx) => {
                          const isCurrent = entry.id === skill.id
                          const prev = evoChain[idx - 1]
                          const delta = prev?.avgScore !== undefined && entry.avgScore !== undefined
                            ? entry.avgScore - prev.avgScore : null
                          return (
                            <div key={entry.id} className={`evo-chain-node ${isCurrent ? 'evo-chain-current' : ''}`}
                              style={{ paddingLeft: idx * 14 }}>
                              <span className="evo-chain-dot">{isCurrent ? '◉' : '○'}</span>
                              <span className="evo-chain-name">{entry.name}</span>
                              <span className="evo-chain-ver">v{entry.version}</span>
                              {entry.avgScore !== undefined && (
                                <span className="evo-chain-score">{entry.avgScore.toFixed(1)}</span>
                              )}
                              {delta !== null && (
                                <span className={`evo-chain-delta ${delta >= 0.3 ? 'pos' : delta <= -0.3 ? 'neg' : 'neu'}`}>
                                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                                </span>
                              )}
                              {entry.paradigm && <span className="evo-chain-tag">{entry.paradigm}</span>}
                              {entry.isRoot && <span className="evo-chain-root-badge">根</span>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'export' && <ExportTab skill={skill} toast={toast} />}
        </div>
      </div>
    </>
  )
}

// ── Uninstall Confirm Modal ───────────────────────────────────────────────────

function UninstallModal({ skillName, info, onConfirm, onCancel }: {
  skillName: string
  info: { evalCount: number; tcCount: number; evolvedCount: number }
  onConfirm: () => void
  onCancel: () => void
}) {
  const hasData = info.evalCount > 0 || info.tcCount > 0 || info.evolvedCount > 0
  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2>卸载 "{skillName}"</h2>
          <button className="btn-icon" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          {hasData ? (
            <>
              <p style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 13 }}>以下关联数据将被同步删除：</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {info.evalCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, fontSize: 13 }}>
                    <span style={{ color: '#ef4444' }}>📊</span>
                    <span>评测历史 <strong>{info.evalCount}</strong> 条</span>
                  </div>
                )}
                {info.tcCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, fontSize: 13 }}>
                    <span style={{ color: '#ef4444' }}>🧪</span>
                    <span>测试用例 <strong>{info.tcCount}</strong> 个</span>
                  </div>
                )}
                {info.evolvedCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, fontSize: 13 }}>
                    <span style={{ color: '#ef4444' }}>⚡</span>
                    <span>进化版本 <strong>{info.evolvedCount}</strong> 个（进化链断开）</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>该 Skill 没有关联的评测历史或测试用例。</p>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn btn-danger" onClick={onConfirm}>确认卸载</button>
        </div>
      </div>
    </>
  )
}

// ── Scan Modal ────────────────────────────────────────────────────────────────

function ScanModal({ onClose, onImport }: {
  onClose: () => void
  onImport: (skills: ScannedSkill[]) => void
}) {
  const [scanning, setScanning] = useState(true)
  const [results, setResults] = useState<ScannedSkill[]>([])
  const [scannedDirs, setScannedDirs] = useState<ScanResult['scannedDirs']>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<Record<string, boolean>>({})

  useEffect(() => {
    window.api.skills.scan().then(r => {
      setResults(r.skills)
      setScannedDirs(r.scannedDirs)
      setSelected(new Set(r.skills.filter(s => !s.alreadyInstalled).map(s => s.filePath)))
      setScanning(false)
    })
  }, [])

  const toggle = (fp: string) => setSelected(prev => {
    const n = new Set(prev); n.has(fp) ? n.delete(fp) : n.add(fp); return n
  })

  const doImport = async () => {
    const toImport = results.filter(s => selected.has(s.filePath) && !s.alreadyInstalled)
    if (!toImport.length) return
    setImporting(true)
    const imported: ScannedSkill[] = []
    for (const s of toImport) {
      try {
        await window.api.skills.importScanned(s.filePath)
        setImportStatus(prev => ({ ...prev, [s.filePath]: true }))
        imported.push(s)
      } catch {
        setImportStatus(prev => ({ ...prev, [s.filePath]: false }))
      }
    }
    setImporting(false)
    onImport(imported)
  }

  const byTool = results.reduce<Record<string, ScannedSkill[]>>((acc, s) => {
    ;(acc[s.toolName] = acc[s.toolName] || []).push(s); return acc
  }, {})

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-header">
          <h2>Scan Local AI Tools</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {scanning ? (
            <div className="scan-loading">Scanning installed AI tools...</div>
          ) : results.length === 0 ? (
            <div className="scan-empty">
              <p>No Skills found in local AI tool directories.</p>
              <div className="scan-dirs">
                {scannedDirs.map(d => (
                  <div key={d.dir} className={`scan-dir-row ${d.exists ? 'exists' : 'missing'}`}>
                    <span className="scan-dir-dot" />
                    <span className="scan-dir-name">{d.toolName}</span>
                    <span className="scan-dir-path">{d.dir}</span>
                    <span className="scan-dir-status">{d.exists ? 'found' : 'not found'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            Object.entries(byTool).map(([toolName, skills]) => (
              <div key={toolName} className="scan-group">
                <div className="scan-group-header">{toolName}</div>
                {skills.map(s => (
                  <label key={s.filePath} className={`scan-item ${s.alreadyInstalled ? 'installed' : ''}`}>
                    <input type="checkbox" disabled={s.alreadyInstalled || importing}
                      checked={selected.has(s.filePath)} onChange={() => toggle(s.filePath)} />
                    <span className="scan-name">📝 {s.name}</span>
                    <span className="scan-path">{s.filePath}</span>
                    {s.alreadyInstalled && <span className="scan-badge">Already imported</span>}
                    {importStatus[s.filePath] === true && <span className="scan-badge ok">✓ Imported</span>}
                    {importStatus[s.filePath] === false && <span className="scan-badge err">✗ Failed</span>}
                  </label>
                ))}
              </div>
            ))
          )}
        </div>
        {!scanning && results.length > 0 && (
          <div className="modal-footer">
            <span className="scan-count">{selected.size} selected</span>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={doImport} disabled={importing || selected.size === 0}>
              {importing ? 'Importing...' : `Import ${selected.size} Skill${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── My Skills Tab ─────────────────────────────────────────────────────────────

function skillDesc(skill: Skill): string {
  return skill.markdownContent.trim().split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim().slice(0, 80) || ''
}

function QuickExportBtn({ skill, toast }: { skill: Skill; toast?: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [open, setOpen] = useState(false)
  const [targets, setTargets] = useState<ToolTarget[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    window.api.skills.getToolTargets().then(setTargets)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const doExport = async (e: React.MouseEvent, toolId: string) => {
    e.stopPropagation()
    const toolName = targets.find(t => t.id === toolId)?.name ?? toolId
    try {
      await window.api.skills.export(skill.id, toolId, 'copy')
      toast?.(`Exported to ${toolName}`, 'success')
      setOpen(false)
    } catch (err) {
      toast?.(String(err), 'error')
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button className="card-del-btn" title="Quick export" onClick={e => { e.stopPropagation(); setOpen(v => !v) }}>↗</button>
      {open && (
        <div className="quick-export-popover">
          <div className="qe-title">Export to</div>
          {targets.length === 0 && <div className="qe-empty">No tools configured</div>}
          {targets.map(t => (
            <button key={t.id} className="qe-row" onClick={e => doExport(e, t.id)}>
              <span className={`tool-dot ${t.exists ? 'exists' : ''}`} />
              <span className="qe-name">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Context Menu ─────────────────────────────────────────────────────────────

interface CtxMenuState { x: number; y: number; skill: Skill }

function SkillCtxMenu({ state, onClose, onCardClick, onUninstall, onNavigate }: {
  state: CtxMenuState
  onClose: () => void
  onCardClick: (s: Skill) => void
  onUninstall: (id: string) => void
  onNavigate?: (page: string, skillId?: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [onClose])

  const go = (page: string) => { onClose(); onNavigate?.(page, state.skill.id) }

  return (
    <div ref={ref} className="ctx-menu" style={{ left: state.x, top: state.y }}>
      <button className="ctx-item" onMouseDown={e => { e.preventDefault(); onClose(); onCardClick(state.skill) }}>🔍 View Details</button>
      <button className="ctx-item" onMouseDown={e => { e.preventDefault(); go('eval') }}>📊 Eval</button>
      <button className="ctx-item" onMouseDown={e => { e.preventDefault(); go('testcase') }}>🧪 TestCase</button>
      <button className="ctx-item" onMouseDown={e => { e.preventDefault(); go('studio') }}>🎨 Edit in Studio</button>
      <button className="ctx-item" onMouseDown={e => { e.preventDefault(); go('evo') }}>⚡ Evolve</button>
      <div className="ctx-sep" />
      <button className="ctx-item ctx-danger" onMouseDown={e => { e.preventDefault(); onClose(); onUninstall(state.skill.id) }}>🗑 Uninstall</button>
    </div>
  )
}

function SkillCard({ skill, onClick, onUninstall, onCtxMenu, toast }: { skill: Skill; onClick: () => void; onUninstall: (id: string) => void; onCtxMenu: (e: React.MouseEvent, s: Skill) => void; toast?: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  return (
    <div className="skill-card" onClick={onClick} onContextMenu={e => { e.preventDefault(); onCtxMenu(e, skill) }}>
      <div className="card-icon">{skill.skillType === 'agent' ? '🤖' : '📝'}</div>
      <div className="card-body">
        <div className="card-name">{skill.name}</div>
        {skill.markdownContent && <div className="card-desc">{skillDesc(skill)}</div>}
        <div className="card-footer">
          <span className="version-badge">v{skill.version}</span>
          <span className={`type-badge ${skill.skillType}`}>{skill.skillType === 'agent' ? 'Agent' : 'Single'}</span>
          {skill.tags.slice(0, 2).map(t => <span key={t} className="tag">#{t}</span>)}
          <TrustBadge level={(skill.trustLevel ?? 1) as 1|2|3|4} />
        </div>
      </div>
      <div className="card-actions" onClick={e => e.stopPropagation()}>
        <QuickExportBtn skill={skill} toast={toast} />
        <button
          className="card-del-btn"
          title="Uninstall"
          onClick={() => onUninstall(skill.id)}
        >✕</button>
      </div>
    </div>
  )
}

function SkillRow({ skill, onClick, onUninstall, onCtxMenu, toast }: { skill: Skill; onClick: () => void; onUninstall: (id: string) => void; onCtxMenu: (e: React.MouseEvent, s: Skill) => void; toast?: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  return (
    <div className="skill-row" onClick={onClick} onContextMenu={e => { e.preventDefault(); onCtxMenu(e, skill) }}>
      <span className="row-icon">{skill.skillType === 'agent' ? '🤖' : '📝'}</span>
      <span className="row-name">{skill.name}</span>
      <span className="row-desc">{skillDesc(skill)}</span>
      <div className="row-meta">
        <span className="version-badge">v{skill.version}</span>
        <span className={`type-badge ${skill.skillType}`}>{skill.skillType === 'agent' ? 'Agent' : 'Single'}</span>
        {skill.tags.slice(0, 3).map(t => <span key={t} className="tag">#{t}</span>)}
        <TrustBadge level={(skill.trustLevel ?? 1) as 1|2|3|4} />
      </div>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
        <QuickExportBtn skill={skill} toast={toast} />
        <button
          className="card-del-btn"
          title="Uninstall"
          onClick={e => { e.stopPropagation(); onUninstall(skill.id) }}
        >✕</button>
      </div>
    </div>
  )
}

function MySkillsTab({ skills, loading, onInstallFile, onInstallDir, onCardClick, onScanDone, installing, onUninstall, onNavigate, toast }: {
  skills: Skill[]; loading: boolean; installing: boolean
  onInstallFile: () => void; onInstallDir: () => void
  onCardClick: (s: Skill) => void
  onScanDone: (added: Skill[]) => void
  onUninstall: (id: string) => void
  onNavigate?: (page: string, skillId?: string) => void
  toast?: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'single' | 'agent'>('all')
  const [formatFilter, setFormatFilter] = useState<'all' | 'claude-code' | 'openclaw'>('all')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAddMenu) return
    const h = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', h, true)
    return () => document.removeEventListener('mousedown', h, true)
  }, [showAddMenu])

  const allTags = Array.from(new Set(skills.flatMap(s => s.tags))).sort()

  const toggleTag = (tag: string) => setActiveTags(prev => {
    const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n
  })

  const sorted = [...skills].sort((a, b) => {
    if (sortMode === 'newest') return b.installedAt - a.installedAt
    if (sortMode === 'oldest') return a.installedAt - b.installedAt
    return a.name.localeCompare(b.name)
  })

  const filtered = sorted.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.tags.some(t => t.toLowerCase().includes(q))
    const matchType = typeFilter === 'all' || s.skillType === typeFilter
    const matchFormat = formatFilter === 'all' || s.format === formatFilter
    const matchTags = activeTags.size === 0 || [...activeTags].every(t => s.tags.includes(t))
    return matchSearch && matchType && matchFormat && matchTags
  })

  const handleScanImport = async (_scanned: ScannedSkill[]) => {
    setShowScan(false)
    const all = await window.api.skills.getAll()
    onScanDone(all)
  }

  const ccCount = skills.filter(s => s.format === 'claude-code').length
  const ocCount = skills.filter(s => s.format === 'openclaw').length
  const handleCtxMenu = (e: React.MouseEvent, s: Skill) => {
    const x = Math.min(e.clientX, window.innerWidth - 180)
    const y = Math.min(e.clientY, window.innerHeight - 180)
    setCtxMenu({ x, y, skill: s })
  }

  return (
    <div className="my-skills-root">
      {/* Sidebar */}
      <div className="skills-sidebar">
        <div className="sidebar-section-label">Format</div>
        {([['all', 'All', skills.length], ['claude-code', 'Claude Code', ccCount], ['openclaw', 'OpenClaw', ocCount]] as const).map(([val, label, count]) => (
          <button key={val} className={`sidebar-filter-item ${formatFilter === val ? 'active' : ''}`} onClick={() => setFormatFilter(val)}>
            <span className="sfi-dot" style={{ background: val === 'claude-code' ? 'var(--accent)' : val === 'openclaw' ? 'var(--accent2)' : 'var(--text)' }} />
            <span className="sfi-label">{label}</span>
            <span className="sfi-count">{count}</span>
          </button>
        ))}
        <div className="sidebar-section-label" style={{ marginTop: 16 }}>Quick</div>
        <button className="sidebar-filter-item" onClick={() => window.api.skills.getAll().then(() => {})}>↺ Refresh</button>
      </div>

      {/* Main */}
      <div className="tab-content">
        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Search skills..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <div className="filter-chips">
            {(['all', 'single', 'agent'] as const).map(t => (
              <button key={t} className={`chip ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
                {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <select className="sort-select" value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A→Z</option>
          </select>
          <div className="view-toggle">
            <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view">⊞</button>
            <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List view">☰</button>
          </div>
          <div className="toolbar-actions" ref={addMenuRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={installing}
              onMouseDown={e => { e.preventDefault(); setShowAddMenu(v => !v) }}
            >+ Add ▾</button>
            {showAddMenu && (
              <div className="add-dropdown">
                <button className="add-menu-item" onMouseDown={e => { e.preventDefault(); setShowAddMenu(false); onInstallFile() }}>📝 Install Skill (.md)</button>
                <button className="add-menu-item" onMouseDown={e => { e.preventDefault(); setShowAddMenu(false); onInstallDir() }}>🤖 Install Agent (folder)</button>
                <div className="add-menu-divider" />
                <button className="add-menu-item" onMouseDown={e => { e.preventDefault(); setShowAddMenu(false); setShowScan(true) }}>🔎 Scan Local Tools</button>
              </div>
            )}
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="tag-filter-row">
            {allTags.map(tag => (
              <button key={tag} className={`chip chip-sm ${activeTags.has(tag) ? 'active' : ''}`} onClick={() => toggleTag(tag)}>#{tag}</button>
            ))}
            {activeTags.size > 0 && <button className="chip chip-sm clear-tags" onClick={() => setActiveTags(new Set())}>✕ clear</button>}
          </div>
        )}

        {loading ? (
          <div className="loading-state">Loading skills...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {skills.length === 0 ? (
              <>
                <div className="empty-icon">✨</div>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>还没有 Skill</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -4 }}>从 Studio 创建第一个，或导入已有文件</p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 4, padding: '10px 28px', fontSize: 14 }}
                  onClick={() => onNavigate?.('studio')}
                >
                  🎨 去 Skill Studio 创建
                </button>
                <div className="empty-divider">或</div>
                <div className="empty-actions">
                  <button className="btn btn-ghost" onClick={onInstallFile}>📝 导入 .md 文件</button>
                  <button className="btn btn-ghost" onClick={onInstallDir}>🤖 导入 Agent 目录</button>
                  <button className="btn btn-ghost" onClick={() => setShowScan(true)}>🔎 扫描本地工具</button>
                </div>
              </>
            ) : (
              <p>No skills match your filters</p>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="skill-grid">
            {filtered.map(s => <SkillCard key={s.id} skill={s} onClick={() => onCardClick(s)} onUninstall={onUninstall} onCtxMenu={handleCtxMenu} toast={toast} />)}
          </div>
        ) : (
          <div className="skill-list">
            {filtered.map(s => <SkillRow key={s.id} skill={s} onClick={() => onCardClick(s)} onUninstall={onUninstall} onCtxMenu={handleCtxMenu} toast={toast} />)}
          </div>
        )}

        {showScan && <ScanModal onClose={() => setShowScan(false)} onImport={handleScanImport} />}
        {ctxMenu && <SkillCtxMenu state={ctxMenu} onClose={() => setCtxMenu(null)} onCardClick={onCardClick} onUninstall={onUninstall} onNavigate={onNavigate} />}
      </div>
    </div>
  )
}

// ── Marketplace Tab ───────────────────────────────────────────────────────────

function MarketplaceTab() {
  return (
    <div className="tab-content marketplace-coming-soon">
      <div className="coming-soon-card">
        <div className="coming-soon-icon">🛒</div>
        <h2 className="coming-soon-title">Marketplace</h2>
        <p className="coming-soon-subtitle">敬请期待</p>
        <p className="coming-soon-desc">
          我们正在构建更完善的 Skill 市场，支持质量评分、版本管理和社区分享。
        </p>
        <div className="coming-soon-features">
          <div className="csf-item">审核机制，保障 Skill 质量</div>
          <div className="csf-item">社区评测数据聚合</div>
          <div className="csf-item">版本管理与自动更新</div>
          <div className="csf-item">Agent Skill 完整支持</div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage({ toast, onNavigate }: { toast?: (msg: string, type?: 'success' | 'error' | 'info') => void; onNavigate?: (page: string, skillId?: string) => void }) {
  const track = useTrack()
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [activeTab, setActiveTab] = useState<'mine' | 'market'>('mine')
  const [drawerSkill, setDrawerSkill] = useState<Skill | null>(null)
  const [uninstallTarget, setUninstallTarget] = useState<{ id: string; name: string; info: { evalCount: number; tcCount: number; evolvedCount: number } } | null>(null)

  useEffect(() => {
    window.api.skills.getAll().then(data => { setSkills(data); setLoading(false) })
  }, [])

  const handleInstallFile = async () => {
    try {
      const path = await window.api.skills.openDialog('file')
      if (!path) return
      setInstalling(true)
      const skill = await window.api.skills.install(path)
      setSkills(prev => [skill, ...prev])
      setDrawerSkill(skill)
      toast?.(`"${skill.name}" installed`, 'success')
      track('skill_installed', { skill_type: skill.skillType, install_source: 'file' })
    } catch (e) {
      console.error('[Add] error:', e)
      toast?.(String(e), 'error')
    } finally {
      setInstalling(false)
    }
  }

  const handleInstallDir = async () => {
    try {
      const path = await window.api.skills.openDialog('dir')
      if (!path) return
      setInstalling(true)
      const skill = await window.api.skills.installDir(path)
      setSkills(prev => [skill, ...prev])
      setDrawerSkill(skill)
      toast?.(`"${skill.name}" installed`, 'success')
      track('skill_installed', { skill_type: skill.skillType, install_source: 'dir' })
    } catch (e) {
      console.error('[Add] error:', e)
      toast?.(String(e), 'error')
    } finally {
      setInstalling(false)
    }
  }

  const handleUninstall = async (id: string) => {
    const name = skills.find(s => s.id === id)?.name ?? 'Skill'
    try {
      const info = await window.api.skills.getUninstallInfo(id)
      setUninstallTarget({ id, name, info })
    } catch (e) {
      toast?.(String(e), 'error')
    }
  }

  const doUninstall = async () => {
    if (!uninstallTarget) return
    const { id, name } = uninstallTarget
    setUninstallTarget(null)
    try {
      await window.api.skills.uninstall(id)
      setSkills(prev => prev.filter(s => s.id !== id))
      if (drawerSkill?.id === id) setDrawerSkill(null)
      toast?.(`"${name}" removed`, 'info')
    } catch (e) {
      toast?.(String(e), 'error')
    }
  }

  return (
    <div className="home-root">
      <div className="home-page-header">
        <h1>SkillNexus</h1>
        <p className="home-subtitle">让能力可量化、可管理、可成长</p>
      </div>
      <div className="page-tabs">
        <button className={`page-tab ${activeTab === 'mine' ? 'active' : ''}`} onClick={() => setActiveTab('mine')}>
          My Skills {skills.length > 0 && <span className="tab-badge">{skills.length}</span>}
        </button>
        <button className={`page-tab ${activeTab === 'market' ? 'active' : ''}`} onClick={() => setActiveTab('market')}>
          Marketplace
        </button>
      </div>

      {activeTab === 'mine' && (
        <MySkillsTab
          skills={skills} loading={loading} installing={installing}
          onInstallFile={handleInstallFile} onInstallDir={handleInstallDir}
          onCardClick={setDrawerSkill}
          onScanDone={setSkills}
          onUninstall={handleUninstall}
          onNavigate={onNavigate}
          toast={toast}
        />
      )}

      {activeTab === 'market' && <MarketplaceTab />}

      {drawerSkill && (
        <SkillDrawer
          skill={drawerSkill}
          onClose={() => setDrawerSkill(null)}
          onUninstall={handleUninstall}
          onTrustChange={(id, level) => {
            setSkills(prev => prev.map(s => s.id === id ? { ...s, trustLevel: level } : s))
            setDrawerSkill(prev => prev?.id === id ? { ...prev, trustLevel: level } : prev)
          }}
          toast={toast}
          onNavigate={onNavigate}
        />
      )}

      {uninstallTarget && (
        <UninstallModal
          skillName={uninstallTarget.name}
          info={uninstallTarget.info}
          onConfirm={doUninstall}
          onCancel={() => setUninstallTarget(null)}
        />
      )}

      <style>{`
        .home-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; margin: -24px; }
        .home-page-header { padding: 20px 24px 16px; flex-shrink: 0; }
        .home-page-header h1 { font-size: 24px; font-weight: 700; }
        .home-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }

        /* Page tabs */
        .page-tabs { display: flex; border-bottom: 1px solid var(--border); padding: 0 24px; flex-shrink: 0; background: var(--bg); }
        .page-tab { padding: 12px 20px; background: transparent; color: var(--text-muted); font-size: 14px; font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all var(--transition); display: flex; align-items: center; gap: 6px; }
        .page-tab:hover { color: var(--text); }
        .page-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
        .tab-badge { background: var(--surface2); border-radius: 10px; padding: 1px 7px; font-size: 11px; color: var(--text-muted); }

        /* Tab content */
        .tab-content { flex: 1; overflow-y: auto; padding: 20px 24px; }

        /* Toolbar */
        .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
        .search-wrap { position: relative; display: flex; align-items: center; flex: 1; min-width: 180px; max-width: 320px; }
        .search-icon { position: absolute; left: 10px; font-size: 13px; pointer-events: none; }
        .search-input { width: 100%; padding: 7px 30px 7px 32px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; }
        .search-input:focus { outline: none; border-color: var(--accent); }
        .search-clear { position: absolute; right: 8px; background: none; color: var(--text-muted); font-size: 11px; padding: 2px 4px; }
        .filter-chips { display: flex; gap: 6px; }
        .chip { padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; transition: all var(--transition); }
        .chip:hover { border-color: var(--accent); color: var(--accent); }
        .chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }
        .toolbar-actions { display: flex; gap: 6px; margin-left: auto; }
        .btn-sm { padding: 6px 12px; font-size: 12px; }
        .btn-xs { padding: 3px 9px; font-size: 11px; }

        /* Skill grid */
        .skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .skill-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; cursor: pointer; transition: all var(--transition); display: flex; gap: 12px; position: relative; }
        .skill-card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
        .skill-card:hover .card-actions { opacity: 1; }
        .card-actions { position: absolute; top: 8px; right: 8px; opacity: 0; transition: opacity var(--transition); }
        .card-del-btn { background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); font-size: 11px; padding: 2px 6px; cursor: pointer; transition: all var(--transition); }
        .card-del-btn:hover { background: rgba(239,68,68,0.15); border-color: var(--danger); color: var(--danger); }
        .card-del-btn.confirm { background: var(--danger); border-color: var(--danger); color: #fff; }
        .card-icon { font-size: 24px; flex-shrink: 0; line-height: 1; padding-top: 2px; }
        .card-body { flex: 1; min-width: 0; }
        .card-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 20px; }
        .card-name-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
        .card-author-link { font-size: 11px; color: var(--text-muted); background: none; border: none; cursor: pointer; padding: 0; text-decoration: underline; }
        .card-author-link:hover { color: var(--accent); }
        .card-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.45; }
        .card-footer { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }

        /* Skill list view */
        .skill-list { display: flex; flex-direction: column; gap: 4px; }
        .skill-row { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; cursor: pointer; transition: all var(--transition); }
        .skill-row:hover { border-color: var(--accent); background: var(--surface2); }
        .row-icon { font-size: 16px; flex-shrink: 0; }
        .row-name { font-size: 13px; font-weight: 600; flex-shrink: 0; min-width: 140px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .row-desc { font-size: 12px; color: var(--text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .row-meta { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }

        /* Tag filter row */
        .tag-filter-row { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 14px; margin-top: -6px; }
        .chip-sm { padding: 3px 9px; font-size: 11px; }
        .clear-tags { border-color: var(--danger); color: var(--danger); }
        .clear-tags:hover { background: rgba(239,68,68,0.1); }

        /* Sort + view toggle */
        .sort-select { padding: 5px 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 12px; cursor: pointer; }
        .sort-select:focus { outline: none; border-color: var(--accent); }
        .view-toggle { display: flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .view-btn { padding: 5px 9px; background: transparent; color: var(--text-muted); font-size: 14px; border: none; cursor: pointer; transition: all var(--transition); }
        .view-btn:hover { color: var(--text); background: var(--surface); }
        .view-btn.active { background: var(--accent); color: #fff; }
        .version-badge { font-size: 10px; color: var(--text-muted); background: var(--surface2); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; }
        .trust-badge { font-size: 10px; font-weight: 700; border: 1px solid; border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
        .type-badge { font-size: 10px; border-radius: 3px; padding: 1px 6px; }
        .type-badge.agent { background: rgba(108,99,255,0.15); color: var(--accent); border: 1px solid rgba(108,99,255,0.3); }
        .type-badge.single { background: rgba(0,212,170,0.1); color: var(--success); border: 1px solid rgba(0,212,170,0.2); }
        .tag { font-size: 10px; color: var(--text-muted); background: var(--surface2); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; }
        .stars { font-size: 11px; color: var(--text-muted); }
        .installed-badge { font-size: 11px; color: var(--success); background: rgba(74,222,128,0.1); border: 1px solid var(--success); border-radius: 3px; padding: 1px 7px; }
        .installed-badge.installing { color: var(--text-muted); background: var(--surface2); border-color: var(--border); }
        .installed-badge.error { color: var(--danger); background: rgba(239,68,68,0.1); border-color: var(--danger); }
        .market-updated { font-size: 11px; color: var(--text-muted); }
        .tag-btn { background: none; border: 1px solid var(--border); cursor: pointer; color: var(--text-muted); border-radius: 3px; padding: 1px 6px; font-size: 11px; transition: all var(--transition); }
        .tag-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(99,102,241,0.08); }

        /* Quick export popover */
        .quick-export-popover { position: absolute; top: calc(100% + 4px); right: 0; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px; min-width: 180px; z-index: 200; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        .qe-title { font-size: 11px; color: var(--text-muted); padding: 2px 6px 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .qe-empty { font-size: 12px; color: var(--text-muted); padding: 4px 6px; }
        .qe-row { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; color: var(--text); font-size: 12px; padding: 6px 8px; border-radius: 4px; cursor: pointer; text-align: left; transition: background var(--transition); }
        .qe-row:hover { background: var(--surface); }
        .qe-name { flex: 1; }
        .qe-ok { color: var(--success); font-size: 12px; }
        .qe-err { color: var(--danger); font-size: 12px; }

        /* Add dropdown */
        .add-dropdown { position: absolute; top: calc(100% + 4px); right: 0; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; min-width: 200px; z-index: 200; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        .add-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; color: var(--text); font-size: 13px; padding: 8px 10px; border-radius: 4px; cursor: pointer; text-align: left; transition: background var(--transition); }
        .add-menu-item:hover { background: var(--surface); }
        .add-menu-divider { height: 1px; background: var(--border); margin: 4px 0; }

        /* Markdown viewer */
        .viewer-toggle-btn { margin-left: auto; padding: 2px 8px; font-size: 11px; background: var(--surface2); border: 1px solid var(--border); border-radius: 3px; color: var(--text-muted); cursor: pointer; transition: all var(--transition); }
        .viewer-toggle-btn:hover { border-color: var(--accent); color: var(--accent); }
        .viewer-md { padding: 16px 20px; overflow-y: auto; flex: 1; line-height: 1.7; font-size: 13px; color: var(--text); }
        .viewer-md h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px; }
        .viewer-md h2 { font-size: 16px; font-weight: 600; margin: 20px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
        .viewer-md h3 { font-size: 14px; font-weight: 600; margin: 16px 0 6px; }
        .viewer-md p { margin: 0 0 10px; }
        .viewer-md ul { margin: 0 0 10px; padding-left: 20px; }
        .viewer-md li { margin-bottom: 4px; }
        .viewer-md code { background: var(--surface2); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-family: monospace; font-size: 12px; }
        .viewer-md pre { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; overflow-x: auto; margin: 0 0 12px; }
        .viewer-md pre code { background: none; border: none; padding: 0; }
        .viewer-md a { color: var(--accent); text-decoration: underline; cursor: pointer; }

        /* Skeleton */
        .skeleton { background: var(--surface); animation: pulse 1.5s ease-in-out infinite; min-height: 90px; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }

        /* States */
        .loading-state { padding: 40px; text-align: center; color: var(--text-muted); }
        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); text-align: center; }
        .empty-icon { font-size: 36px; }
        .empty-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
        .empty-divider { font-size: 12px; color: var(--text-muted); margin: 2px 0; }
        .market-error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius); padding: 10px 14px; color: var(--danger); font-size: 13px; margin-bottom: 16px; }

        /* Drawer */
        .drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; backdrop-filter: blur(2px); }
        .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(680px, 72vw); background: var(--bg); border-left: 1px solid var(--border); z-index: 101; display: flex; flex-direction: column; animation: slideIn 0.2s ease; box-shadow: -8px 0 32px rgba(0,0,0,0.3); }
        @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
        .drawer-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .drawer-title { display: flex; align-items: center; gap: 12px; }
        .skill-type-icon-lg { font-size: 28px; line-height: 1; }
        .drawer-name { font-size: 17px; font-weight: 700; }
        .drawer-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .drawer-header-actions { display: flex; align-items: center; gap: 8px; }
        .btn-icon { background: transparent; color: var(--text-muted); font-size: 16px; padding: 4px 8px; border-radius: 4px; }
        .btn-icon:hover { color: var(--text); background: var(--surface); }
        .drawer-tabs { display: flex; border-bottom: 1px solid var(--border); padding: 0 20px; flex-shrink: 0; }
        .drawer-tab { padding: 8px 16px; background: transparent; color: var(--text-muted); font-size: 13px; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all var(--transition); }
        .drawer-tab:hover { color: var(--text); }
        .drawer-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
        .drawer-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

        /* Files layout (inside drawer) */
        .detail-files-layout { display: flex; flex: 1; overflow: hidden; }
        .file-tree-pane { width: 200px; flex-shrink: 0; border-right: 1px solid var(--border); overflow-y: auto; padding: 6px 0; }
        .tree-loading { padding: 16px; color: var(--text-muted); font-size: 13px; }
        .tree-row { display: flex; align-items: center; gap: 4px; padding: 4px 8px 4px 0; cursor: pointer; font-size: 12px; color: var(--text-muted); border-radius: 4px; transition: background var(--transition); }
        .tree-row:hover { background: var(--surface); color: var(--text); }
        .tree-row.selected { background: rgba(108,99,255,0.12); color: var(--accent); }
        .tree-toggle { width: 12px; text-align: center; font-size: 10px; flex-shrink: 0; }
        .tree-icon { font-size: 12px; flex-shrink: 0; }
        .tree-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tree-size { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
        .file-viewer-pane { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .viewer-empty { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; }
        .viewer-error { padding: 16px; color: var(--danger); font-size: 13px; }
        .viewer-content { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .viewer-file-header { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--surface); flex-shrink: 0; }
        .viewer-filename { font-size: 12px; font-family: 'Courier New', monospace; flex: 1; }
        .viewer-lang { font-size: 10px; color: var(--text-muted); background: var(--surface2); border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px; }
        .viewer-pre { flex: 1; overflow: auto; padding: 14px; margin: 0; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.65; color: var(--text); white-space: pre; background: var(--bg); }

        /* Meta tab */
        .detail-meta { padding: 16px 20px; overflow-y: auto; flex: 1; }
        .meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .meta-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; }
        .meta-label { font-size: 11px; color: var(--text-muted); margin-bottom: 3px; }
        .meta-value { font-size: 13px; font-weight: 500; word-break: break-all; }
        .detail-section { margin-bottom: 16px; }
        .filepath { font-family: 'Courier New', monospace; font-size: 11px; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 6px 10px; word-break: break-all; margin-top: 6px; }
        .code-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; font-family: 'Courier New', monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; color: var(--text); line-height: 1.6; }
        .evo-chain-header { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 0; margin-bottom: 6px; }
        .evo-chain-header:hover .meta-label { color: var(--text); }
        .evo-chain-count { font-size: 11px; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1px 7px; }
        .evo-chain-toggle { font-size: 12px; color: var(--text-muted); margin-left: auto; }
        .evo-chain-tree { display: flex; flex-direction: column; gap: 2px; }
        .evo-chain-node { display: flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 5px; font-size: 12px; cursor: default; }
        .evo-chain-node.evo-chain-current { background: var(--accent-faint, rgba(99,102,241,.08)); }
        .evo-chain-dot { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
        .evo-chain-current .evo-chain-dot { color: var(--accent, #6366f1); }
        .evo-chain-name { font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
        .evo-chain-ver { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
        .evo-chain-score { font-size: 11px; color: var(--text-muted); margin-left: auto; flex-shrink: 0; }
        .evo-chain-delta { font-size: 11px; font-weight: 600; padding: 1px 5px; border-radius: 4px; flex-shrink: 0; }
        .evo-chain-delta.pos { color: #22c55e; background: rgba(34,197,94,.1); }
        .evo-chain-delta.neg { color: #ef4444; background: rgba(239,68,68,.1); }
        .evo-chain-delta.neu { color: var(--text-muted); }
        .evo-chain-tag { font-size: 10px; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; flex-shrink: 0; }
        .evo-chain-root-badge { font-size: 10px; color: var(--accent); background: rgba(99,102,241,.1); border-radius: 3px; padding: 1px 5px; flex-shrink: 0; }
        .evo-chain-empty { display: flex; flex-direction: column; gap: 4px; padding: 10px 8px; }
        .evo-chain-empty span:first-child { font-size: 12px; color: var(--text-muted); }
        .evo-chain-empty-hint { font-size: 11px; color: var(--text-muted); opacity: .7; line-height: 1.5; }
        .link-btn { background: none; border: none; color: var(--accent); font-size: inherit; cursor: pointer; padding: 0; text-decoration: underline; }
        .link-btn:hover { opacity: 0.8; }

        /* Export tab */
        .export-tab { padding: 20px; overflow-y: auto; flex: 1; }
        .export-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; }
        .export-list { display: flex; flex-direction: column; gap: 8px; }
        .export-row { display: flex; align-items: center; justify-content: space-between; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; gap: 12px; }
        .export-tool-info { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
        .tool-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
        .tool-dot.exists { background: var(--success); }
        .tool-name { font-size: 13px; font-weight: 500; flex-shrink: 0; }
        .tool-dir { font-size: 11px; color: var(--text-muted); font-family: 'Courier New', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .export-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .export-status { font-size: 11px; padding: 1px 6px; border-radius: 3px; }
        .export-status.ok { color: var(--success); background: rgba(74,222,128,0.1); }
        .export-status.err { color: var(--danger); background: rgba(239,68,68,0.1); }

        /* Scan modal */
        .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; backdrop-filter: blur(2px); }
        .modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(600px, 90vw); max-height: 80vh; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; z-index: 201; display: flex; flex-direction: column; box-shadow: 0 16px 48px rgba(0,0,0,0.4); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-size: 16px; font-weight: 700; }
        .modal-body { overflow-y: auto; padding: 16px 20px; flex: 1; }
        .modal-footer { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--border); }
        .scan-loading { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
        .scan-empty { padding: 16px 24px; color: var(--text-muted); font-size: 13px; }
        .scan-empty p { margin: 0 0 12px; text-align: center; }
        .scan-dirs { display: flex; flex-direction: column; gap: 4px; }
        .scan-dir-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: var(--radius); background: var(--surface); font-size: 12px; }
        .scan-dir-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
        .scan-dir-row.exists .scan-dir-dot { background: var(--success); }
        .scan-dir-name { font-weight: 500; flex-shrink: 0; min-width: 90px; }
        .scan-dir-path { font-family: 'Courier New', monospace; color: var(--text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .scan-dir-status { font-size: 11px; flex-shrink: 0; color: var(--text-muted); }
        .scan-dir-row.exists .scan-dir-status { color: var(--success); }
        .scan-group { margin-bottom: 16px; }
        .scan-group-header { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .scan-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius); cursor: pointer; font-size: 13px; }
        .scan-item:hover { background: var(--surface); }
        .scan-item.installed { opacity: 0.6; }
        .scan-name { flex-shrink: 0; }
        .scan-path { font-size: 11px; color: var(--text-muted); font-family: 'Courier New', monospace; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .scan-badge { font-size: 10px; border-radius: 3px; padding: 1px 6px; background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); flex-shrink: 0; }
        .scan-badge.ok { background: rgba(74,222,128,0.1); color: var(--success); border-color: var(--success); }
        .scan-badge.err { background: rgba(239,68,68,0.1); color: var(--danger); border-color: var(--danger); }
        .scan-count { font-size: 13px; color: var(--text-muted); flex: 1; }
        .btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
        .btn-danger:hover { opacity: 0.85; }

        /* Marketplace coming soon */
        .marketplace-coming-soon { display: flex; align-items: center; justify-content: center; }
        .coming-soon-card { text-align: center; max-width: 420px; padding: 48px 32px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
        .coming-soon-icon { font-size: 48px; margin-bottom: 16px; }
        .coming-soon-title { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
        .coming-soon-subtitle { font-size: 15px; color: var(--accent); font-weight: 600; margin-bottom: 12px; }
        .coming-soon-desc { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 20px; }
        .coming-soon-features { display: flex; flex-direction: column; gap: 8px; text-align: left; }
        .csf-item { font-size: 12px; color: var(--text-muted); padding: 7px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; }
        .csf-item::before { content: '✦ '; color: var(--accent); }

        /* My Skills layout with sidebar */
        .my-skills-root { display: flex; flex: 1; overflow: hidden; }
        .skills-sidebar { width: 160px; flex-shrink: 0; border-right: 1px solid var(--border); padding: 16px 8px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; background: var(--bg); }
        .sidebar-section-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600; padding: 0 6px; margin-bottom: 4px; }
        .sidebar-filter-item { display: flex; align-items: center; gap: 7px; width: 100%; background: none; border: none; color: var(--text-muted); font-size: 12px; padding: 6px 8px; border-radius: 5px; cursor: pointer; text-align: left; transition: all var(--transition); }
        .sidebar-filter-item:hover { background: var(--surface); color: var(--text); }
        .sidebar-filter-item.active { background: rgba(108,99,255,0.12); color: var(--accent); }
        .sfi-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--text-muted); }
        .sfi-label { flex: 1; }
        .sfi-count { font-size: 10px; background: var(--surface2); border-radius: 8px; padding: 1px 5px; color: var(--text-muted); }

        /* Context menu */
        .ctx-menu { position: fixed; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; min-width: 170px; z-index: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.35); animation: fadeIn 0.1s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
        .ctx-item { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; color: var(--text); font-size: 13px; padding: 7px 10px; border-radius: 4px; cursor: pointer; text-align: left; transition: background var(--transition); }
        .ctx-item:hover { background: var(--surface); }
        .ctx-sep { height: 1px; background: var(--border); margin: 3px 0; }
        .ctx-danger { color: var(--danger); }
        .ctx-danger:hover { background: rgba(239,68,68,0.12); }
      `}</style>
    </div>
  )
}
