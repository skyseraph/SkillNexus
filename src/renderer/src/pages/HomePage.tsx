import { useEffect, useState, useCallback, useRef } from 'react'
import type { Skill, SkillFileEntry, ToolTarget, ScannedSkill, MarketSkill } from '../../../shared/types'

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

function FileViewer({ skill, file }: { skill: Skill; file: SkillFileEntry | null }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file || file.isDir) { setContent(null); return }
    setLoading(true); setError(null)
    window.api.skills.readFile(file.path, skill.id)
      .then(c => { setContent(c); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [file?.path, skill.id])

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
      </div>
      <pre className="viewer-pre">{content}</pre>
    </div>
  )
}

function ExportTab({ skill }: { skill: Skill }) {
  const [targets, setTargets] = useState<ToolTarget[]>([])
  const [status, setStatus] = useState<Record<string, { ok: boolean; msg: string }>>({})

  useEffect(() => {
    window.api.skills.getToolTargets().then(setTargets)
  }, [])

  const doExport = async (toolId: string, mode: 'copy' | 'symlink') => {
    try {
      await window.api.skills.export(skill.id, toolId, mode)
      setStatus(s => ({ ...s, [toolId]: { ok: true, msg: `${mode === 'copy' ? 'Copied' : 'Symlinked'} ✓` } }))
    } catch (e) {
      setStatus(s => ({ ...s, [toolId]: { ok: false, msg: String(e) } }))
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
              {status[t.id] && (
                <span className={`export-status ${status[t.id].ok ? 'ok' : 'err'}`}>{status[t.id].msg}</span>
              )}
              <button className="btn btn-xs" onClick={() => doExport(t.id, 'copy')} title="Copy file">Copy</button>
              <button className="btn btn-xs btn-ghost" onClick={() => doExport(t.id, 'symlink')} title="Create symlink">Symlink</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkillDrawer({ skill, onClose, onUninstall }: {
  skill: Skill; onClose: () => void; onUninstall: (id: string) => void
}) {
  const [files, setFiles] = useState<SkillFileEntry[]>([])
  const [filesLoading, setFilesLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<SkillFileEntry | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeTab, setActiveTab] = useState<'files' | 'meta' | 'export'>('files')

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
            <button className={`btn btn-sm ${confirmDelete ? 'btn-danger' : 'btn-ghost'}`}
              onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return } onUninstall(skill.id) }}
              onBlur={() => setConfirmDelete(false)}>
              {confirmDelete ? 'Confirm' : 'Uninstall'}
            </button>
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="drawer-tabs">
          {(['files', 'meta', 'export'] as const).map(tab => (
            <button key={tab} className={`drawer-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab === 'files' ? `Files${files.filter(f=>!f.isDir).length > 0 ? ` (${files.filter(f=>!f.isDir).length})` : ''}` : tab.charAt(0).toUpperCase() + tab.slice(1)}
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

          {activeTab === 'meta' && (
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
            </div>
          )}

          {activeTab === 'export' && <ExportTab skill={skill} />}
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<Record<string, boolean>>({})

  useEffect(() => {
    window.api.skills.scan().then(r => {
      setResults(r)
      setSelected(new Set(r.filter(s => !s.alreadyInstalled).map(s => s.filePath)))
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
            <div className="scan-empty">No Skills found in local AI tool directories.<br/>Install AI tools like Claude Code or Cursor to find existing skills.</div>
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

function SkillCard({ skill, onClick }: { skill: Skill; onClick: () => void }) {
  return (
    <div className="skill-card" onClick={onClick}>
      <div className="card-icon">{skill.skillType === 'agent' ? '🤖' : '📝'}</div>
      <div className="card-body">
        <div className="card-name">{skill.name}</div>
        {skill.markdownContent && (
          <div className="card-desc">{skill.markdownContent.trim().split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim().slice(0, 80) || ''}</div>
        )}
        <div className="card-footer">
          <span className="version-badge">v{skill.version}</span>
          <span className={`type-badge ${skill.skillType}`}>{skill.skillType === 'agent' ? 'Agent' : 'Single'}</span>
          {skill.tags.slice(0, 2).map(t => <span key={t} className="tag">#{t}</span>)}
        </div>
      </div>
    </div>
  )
}

function MySkillsTab({ skills, loading, onInstallFile, onInstallDir, onCardClick, onScanDone, installing }: {
  skills: Skill[]; loading: boolean; installing: boolean
  onInstallFile: () => void; onInstallDir: () => void
  onCardClick: (s: Skill) => void
  onScanDone: (added: Skill[]) => void
}) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'single' | 'agent'>('all')
  const [showScan, setShowScan] = useState(false)

  const filtered = skills.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.tags.some(t => t.toLowerCase().includes(q))
    const matchType = typeFilter === 'all' || s.skillType === typeFilter
    return matchSearch && matchType
  })

  const handleScanImport = async (scanned: ScannedSkill[]) => {
    // Reload all skills after import
    const all = await window.api.skills.getAll()
    onScanDone(all)
    setShowScan(false)
  }

  return (
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
        <div className="toolbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowScan(true)} title="Scan local AI tool directories">
            🔎 Scan Local
          </button>
          <button className="btn btn-primary btn-sm" onClick={onInstallFile} disabled={installing}>+ Skill</button>
          <button className="btn btn-ghost btn-sm" onClick={onInstallDir} disabled={installing}>+ Agent</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading skills...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {skills.length === 0 ? (
            <>
              <div className="empty-icon">📦</div>
              <p>No Skills installed yet</p>
              <div className="empty-actions">
                <button className="btn btn-primary" onClick={onInstallFile}>+ Install Skill</button>
                <button className="btn btn-ghost" onClick={onInstallDir}>+ Install Agent</button>
                <button className="btn btn-ghost" onClick={() => setShowScan(true)}>🔎 Scan Local Tools</button>
              </div>
            </>
          ) : (
            <p>No skills match your search</p>
          )}
        </div>
      ) : (
        <div className="skill-grid">
          {filtered.map(s => <SkillCard key={s.id} skill={s} onClick={() => onCardClick(s)} />)}
        </div>
      )}

      {showScan && <ScanModal onClose={() => setShowScan(false)} onImport={handleScanImport} />}
    </div>
  )
}

// ── Marketplace Tab ───────────────────────────────────────────────────────────

function MarketCard({ skill, installed, onInstall }: {
  skill: MarketSkill; installed: boolean; onInstall: () => void
}) {
  return (
    <div className="skill-card market-card">
      <div className="card-icon">🌐</div>
      <div className="card-body">
        <div className="card-name-row">
          <span className="card-name">{skill.name}</span>
          <a href="#" className="card-author" onClick={e => { e.preventDefault(); e.stopPropagation() }}>@{skill.author}</a>
        </div>
        {skill.description && <div className="card-desc">{skill.description.slice(0, 90)}</div>}
        <div className="card-footer">
          <span className="stars">⭐ {skill.stars}</span>
          {skill.topics.slice(0, 2).map(t => <span key={t} className="tag">#{t}</span>)}
          <span style={{flex:1}} />
          {installed ? (
            <span className="installed-badge">✓ Installed</span>
          ) : (
            <button className="btn btn-xs btn-primary" onClick={e => { e.stopPropagation(); onInstall() }}>Install</button>
          )}
        </div>
      </div>
    </div>
  )
}

function MarketplaceTab({ installedSkills, onInstalled }: {
  installedSkills: Skill[]
  onInstalled: (skill: Skill) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MarketSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const installedIds = new Set(installedSkills.map(s => s.name.toLowerCase()))

  const doSearch = useCallback(async (q: string) => {
    setLoading(true); setError(null)
    try {
      const r = await window.api.marketplace.search(q)
      setResults(r)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    doSearch('')
  }, [doSearch])

  const handleSearch = (q: string) => {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q), 500)
  }

  const handleInstall = async (skill: MarketSkill) => {
    setInstalling(skill.id)
    try {
      const s = await window.api.marketplace.install(skill)
      onInstalled(s)
    } catch (e) {
      setError(`Install failed: ${e}`)
    } finally {
      setInstalling(null)
    }
  }

  return (
    <div className="tab-content">
      <div className="toolbar">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Search marketplace..." value={query} onChange={e => handleSearch(e.target.value)} />
          {query && <button className="search-clear" onClick={() => handleSearch('')}>✕</button>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => doSearch(query)}>Refresh</button>
      </div>

      {error && <div className="market-error">⚠️ {error}</div>}

      {loading ? (
        <div className="skill-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skill-card skeleton" />)}
        </div>
      ) : results.length === 0 ? (
        <div className="empty-state"><p>No results found. Try a different search.</p></div>
      ) : (
        <div className="skill-grid">
          {results.map(s => (
            <MarketCard key={s.id} skill={s}
              installed={installedIds.has(s.name.toLowerCase()) || installing === s.id}
              onInstall={() => handleInstall(s)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [activeTab, setActiveTab] = useState<'mine' | 'market'>('mine')
  const [drawerSkill, setDrawerSkill] = useState<Skill | null>(null)

  useEffect(() => {
    window.api.skills.getAll().then(data => { setSkills(data); setLoading(false) })
  }, [])

  const handleInstallFile = async () => {
    setInstalling(true)
    try {
      const path = await window.api.skills.openDialog('file')
      if (path) {
        const skill = await window.api.skills.install(path)
        setSkills(prev => [skill, ...prev])
        setDrawerSkill(skill)
      }
    } catch (e) {
      console.error('Install file failed:', e)
    } finally {
      setInstalling(false)
    }
  }

  const handleInstallDir = async () => {
    setInstalling(true)
    try {
      const path = await window.api.skills.openDialog('dir')
      if (path) {
        const skill = await window.api.skills.installDir(path)
        setSkills(prev => [skill, ...prev])
        setDrawerSkill(skill)
      }
    } catch (e) {
      console.error('Install dir failed:', e)
    } finally {
      setInstalling(false)
    }
  }

  const handleUninstall = async (id: string) => {
    try {
      await window.api.skills.uninstall(id)
      setSkills(prev => prev.filter(s => s.id !== id))
      setDrawerSkill(null)
    } catch (e) {
      console.error('Uninstall failed:', e)
    }
  }

  return (
    <div className="home-root">
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
        />
      )}

      {activeTab === 'market' && (
        <MarketplaceTab
          installedSkills={skills}
          onInstalled={skill => setSkills(prev => [skill, ...prev])}
        />
      )}

      {drawerSkill && (
        <SkillDrawer
          skill={drawerSkill}
          onClose={() => setDrawerSkill(null)}
          onUninstall={handleUninstall}
        />
      )}

      <style>{`
        .home-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; margin: -24px; }

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
        .skill-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; cursor: pointer; transition: all var(--transition); display: flex; gap: 12px; }
        .skill-card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
        .card-icon { font-size: 24px; flex-shrink: 0; line-height: 1; padding-top: 2px; }
        .card-body { flex: 1; min-width: 0; }
        .card-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-name-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
        .card-author { font-size: 11px; color: var(--text-muted); text-decoration: none; }
        .card-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.45; }
        .card-footer { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
        .version-badge { font-size: 10px; color: var(--text-muted); background: var(--surface2); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; }
        .type-badge { font-size: 10px; border-radius: 3px; padding: 1px 6px; }
        .type-badge.agent { background: rgba(108,99,255,0.15); color: var(--accent); border: 1px solid rgba(108,99,255,0.3); }
        .type-badge.single { background: rgba(0,212,170,0.1); color: var(--success); border: 1px solid rgba(0,212,170,0.2); }
        .tag { font-size: 10px; color: var(--text-muted); background: var(--surface2); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; }
        .stars { font-size: 11px; color: var(--text-muted); }
        .installed-badge { font-size: 11px; color: var(--success); background: rgba(74,222,128,0.1); border: 1px solid var(--success); border-radius: 3px; padding: 1px 7px; }

        /* Skeleton */
        .skeleton { background: var(--surface); animation: pulse 1.5s ease-in-out infinite; min-height: 90px; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }

        /* States */
        .loading-state { padding: 40px; text-align: center; color: var(--text-muted); }
        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); text-align: center; }
        .empty-icon { font-size: 36px; }
        .empty-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
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
        .scan-loading, .scan-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
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
      `}</style>
    </div>
  )
}
