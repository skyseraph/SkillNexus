import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getDb } from '../db'
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, symlinkSync, existsSync, unlinkSync, cpSync, rmSync } from 'fs'
import { basename, resolve, extname, join, relative, dirname } from 'path'
import { app } from 'electron'
import { platform } from 'os'
import yaml from 'js-yaml'
import { getConfig } from './config.handler'
import type { Skill, SkillFileEntry, SkillType, ToolTarget, ScannedSkill, ScanResult, EvoChainEntry, EvoAnalysis } from '../../shared/types'

// ── Security: allowed root directories ───────────────────────────────────────
let _allowedPrefixes: string[] | null = null
const ALLOWED_PATH_PREFIXES = () => {
  if (!_allowedPrefixes) {
    _allowedPrefixes = [
      resolve(app.getPath('userData')),
      resolve(app.getPath('home')),
      resolve(app.getPath('downloads')),
      resolve(app.getPath('documents')),
      resolve(app.getPath('desktop'))
    ]
    // On Windows, also allow %APPDATA% and %LOCALAPPDATA% (tool config dirs)
    if (platform() === 'win32') {
      const home = resolve(app.getPath('home'))
      if (process.env.APPDATA) _allowedPrefixes.push(resolve(process.env.APPDATA))
      if (process.env.LOCALAPPDATA) _allowedPrefixes.push(resolve(process.env.LOCALAPPDATA))
      // Fallback if env vars not set
      _allowedPrefixes.push(resolve(join(home, 'AppData', 'Roaming')))
      _allowedPrefixes.push(resolve(join(home, 'AppData', 'Local')))
    }
  }
  return _allowedPrefixes
}

// Paths explicitly chosen by the user via the OS file dialog — bypass prefix check
const _dialogPaths = new Set<string>()

function assertPathAllowed(p: string, fromDialog = false): void {
  const r = resolve(p)
  if (fromDialog || _dialogPaths.has(r)) return
  if (!ALLOWED_PATH_PREFIXES().some((prefix) => r.startsWith(prefix))) {
    throw new Error(`Access to path is not allowed: ${r}`)
  }
}

// ── File extensions we can display as text ───────────────────────────────────
const TEXT_EXTS = new Set([
  '.md', '.txt', '.yaml', '.yml', '.json', '.toml', '.ini', '.env',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.sh', '.bash', '.zsh',
  '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h',
  '.css', '.scss', '.html', '.xml', '.csv', '.log', ''
])

function isTextFile(ext: string): boolean {
  return TEXT_EXTS.has(ext.toLowerCase())
}

// ── Ignore patterns for directory walk ───────────────────────────────────────
const IGNORE_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', 'out'])
const IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db'])

// ── AI tool export targets ─────────────────────────────────────────────────────
// exportDir: path relative to home on Mac/Linux
// scanDirs: additional directories to scan (besides exportDir); for tools that use different read vs write dirs
// winAppDataDir: path relative to %APPDATA% on Windows (takes priority when set)
const TOOL_DEFAULTS: Record<string, { name: string; exportDir: string; scanDirs?: string[]; winExportDir?: string; winAppDataDir?: string; ext: string }> = {
  'claude-code': { name: 'Claude Code',   exportDir: '.claude/commands',  scanDirs: ['.claude/skills'],              ext: '.md' },
  'cursor':      { name: 'Cursor',         exportDir: '.cursor/rules',     winAppDataDir: 'Cursor/User/globalStorage/cursor.rules', ext: '.mdc' },
  'windsurf':    { name: 'Windsurf',       exportDir: '.codeium/windsurf/memories', winAppDataDir: 'Codeium/windsurf/memories', ext: '.md' },
  'codex':       { name: 'Codex CLI',      exportDir: '.codex',                                                       ext: '.md' },
  'gemini':      { name: 'Gemini CLI',     exportDir: '.gemini/skills',                                               ext: '.md' },
  'opencode':    { name: 'OpenCode',       exportDir: '.opencode',                                                    ext: '.md' },
  'openclaw':    { name: 'OpenClaw',       exportDir: '.openclaw',                                                    ext: '.md' },
  'codebuddy':   { name: 'CodeBuddy',      exportDir: '.codebuddy/skills', winAppDataDir: 'CodeBuddy/skills',         ext: '.md' },
}

function resolveToolDir(toolId: string): { name: string; exportDir: string; scanDirs: string[]; ext: string } | null {
  const def = TOOL_DEFAULTS[toolId]
  if (!def) return null
  const home = app.getPath('home')
  const cfg = getConfig()
  const override = cfg.toolPaths?.[toolId]

  let exportDir: string
  let scanDirs: string[]

  if (override) {
    // User-configured path: expand ~ and resolve; supports multiple paths separated by ':'
    const parts = override.split(':').map(p => p.trim()).filter(Boolean)
    const expanded = parts.map(p => {
      const e = p.startsWith('~') ? p.replace(/^~/, home) : p
      return resolve(e)
    })
    exportDir = expanded[0]
    scanDirs = expanded  // scan all user-specified paths
  } else if (platform() === 'win32') {
    if (def.winAppDataDir) {
      const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming')
      exportDir = join(appData, def.winAppDataDir)
    } else {
      exportDir = join(home, def.winExportDir ?? def.exportDir)
    }
    scanDirs = [exportDir]
  } else {
    exportDir = join(home, def.exportDir)
    // Include additional scan-only dirs (e.g. ~/.claude/skills alongside ~/.claude/commands)
    scanDirs = [exportDir, ...(def.scanDirs ?? []).map(d => join(home, d))]
  }

  return { name: def.name, exportDir, scanDirs, ext: def.ext }
}

// ── Parse single .md skill file ───────────────────────────────────────────────
function parseSkillFile(filePath: string): Omit<Skill, 'id' | 'installedAt' | 'updatedAt' | 'rootDir'> {
  const content = readFileSync(filePath, 'utf-8')
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  let frontmatter: Record<string, unknown> = {}
  let markdownContent = content
  if (match) {
    frontmatter = (yaml.load(match[1]) as Record<string, unknown>) || {}
    markdownContent = match[2]
  }
  return {
    name: (frontmatter.name as string) || basename(filePath, '.md'),
    format: (frontmatter.format as string) || 'markdown',
    version: (frontmatter.version as string) || '1.0.0',
    tags: (frontmatter.tags as string[]) || [],
    yamlFrontmatter: match ? match[1] : '',
    markdownContent,
    filePath,
    skillType: ((frontmatter.skill_type as string) === 'agent' ? 'agent' : 'single') as SkillType,
    trustLevel: 1 as const
  }
}

// ── Find the entry .md inside a skill directory ───────────────────────────────
// Priority: SKILL.md > README.md > <dirname>.md > first .md found
function findEntryMd(dirPath: string): string | null {
  const dirName = basename(dirPath)
  const candidates = [`SKILL.md`, `README.md`, `${dirName}.md`]
  for (const c of candidates) {
    const p = join(dirPath, c)
    try { statSync(p); return p } catch { /* not found */ }
  }
  // Fallback: first .md at root
  try {
    const entries = readdirSync(dirPath)
    const md = entries.find((e) => e.endsWith('.md'))
    if (md) return join(dirPath, md)
  } catch { /* ignore */ }
  return null
}

// ── Parse agent skill from directory ─────────────────────────────────────────
function parseSkillDir(dirPath: string): Omit<Skill, 'id' | 'installedAt' | 'updatedAt'> {
  const entryMd = findEntryMd(dirPath)
  const dirName = basename(dirPath)

  let name = dirName
  let format = 'agent'
  let version = '1.0.0'
  let tags: string[] = []
  let yamlFrontmatter = ''
  let markdownContent = ''
  let filePath = entryMd ?? dirPath

  if (entryMd) {
    const content = readFileSync(entryMd, 'utf-8')
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (match) {
      const fm = (yaml.load(match[1]) as Record<string, unknown>) || {}
      name = (fm.name as string) || dirName
      format = (fm.format as string) || 'agent'
      version = (fm.version as string) || '1.0.0'
      tags = (fm.tags as string[]) || []
      yamlFrontmatter = match[1]
      markdownContent = match[2]
    } else {
      markdownContent = content
    }
  }

  return { name, format, version, tags, yamlFrontmatter, markdownContent, filePath, rootDir: resolve(dirPath), skillType: 'agent' }
}

// ── Recursive file list (returns flat array with relative paths) ──────────────
function walkDir(dirPath: string, rootDir: string): SkillFileEntry[] {
  const results: SkillFileEntry[] = []
  const entries = readdirSync(dirPath)

  for (const entry of entries) {
    if (IGNORE_FILES.has(entry)) continue
    const fullPath = join(dirPath, entry)
    const rel = relative(rootDir, fullPath)
    let st
    try { st = statSync(fullPath) } catch { continue }

    if (st.isDirectory()) {
      if (IGNORE_DIRS.has(entry)) continue
      results.push({ name: entry, path: fullPath, relativePath: rel.replace(/\\/g, '/'), isDir: true, ext: '', size: 0 })
      results.push(...walkDir(fullPath, rootDir))
    } else {
      results.push({ name: entry, path: fullPath, relativePath: rel.replace(/\\/g, '/'), isDir: false, ext: extname(entry), size: st.size })
    }
  }
  return results
}

// ── DB row → Skill ─────────────────────────────────────────────────────────────
function rowToSkill(r: Record<string, unknown>): Skill {
  return {
    id: r.id as string,
    name: r.name as string,
    format: r.format as string,
    version: r.version as string,
    tags: JSON.parse(r.tags as string),
    yamlFrontmatter: r.yaml_frontmatter as string,
    markdownContent: r.markdown_content as string,
    filePath: r.file_path as string,
    rootDir: (r.root_dir as string) || dirname(r.file_path as string),
    skillType: ((r.skill_type as string) || 'single') as SkillType,
    trustLevel: (r.trust_level != null ? r.trust_level as number : 1) as 1 | 2 | 3 | 4,
    installedAt: r.installed_at as number,
    updatedAt: r.updated_at as number
  }
}

// ── IPC registration ──────────────────────────────────────────────────────────
export function registerSkillsHandlers(): void {

  // Open native file/dir picker — returns selected path or null
  ipcMain.handle('skills:openDialog', async (_event, mode: 'file' | 'dir') => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: mode === 'dir' ? ['openDirectory'] : ['openFile'],
      filters: mode === 'file' ? [{ name: 'Skill', extensions: ['md'] }] : []
    })
    if (result.canceled || !result.filePaths[0]) return null
    const chosen = resolve(result.filePaths[0])
    _dialogPaths.add(chosen)
    return chosen
  })

  // List all installed skills
  ipcMain.handle('skills:getAll', () => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM skills
      WHERE root_dir NOT LIKE '%three-condition%'
        AND root_dir NOT LIKE '%evolved%'
        AND id NOT LIKE 'skill-noskill-%'
        AND id NOT LIKE 'skill-gen-%'
      ORDER BY installed_at DESC
    `).all() as Record<string, unknown>[]
    return rows.map(rowToSkill)
  })

  // List evolved skills only
  ipcMain.handle('skills:getEvolved', () => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM skills
      WHERE root_dir LIKE '%evolved%'
      ORDER BY installed_at DESC
    `).all() as Record<string, unknown>[]
    return rows.map(rowToSkill)
  })

  // Install single .md file
  ipcMain.handle('skills:install', (_event, filePath: string) => {
    assertPathAllowed(filePath)
    if (extname(resolve(filePath)).toLowerCase() !== '.md') throw new Error('Only .md files are allowed')

    const db = getDb()
    const parsed = parseSkillFile(filePath)
    const now = Date.now()
    const id = `skill-${now}-${Math.random().toString(36).slice(2, 8)}`
    const rootDir = dirname(resolve(filePath))

    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, parsed.name, parsed.format, parsed.version, JSON.stringify(parsed.tags),
      parsed.yamlFrontmatter, parsed.markdownContent, parsed.filePath, rootDir, parsed.skillType, 1, now, now)

    return { id, ...parsed, rootDir, installedAt: now, updatedAt: now }
  })

  // Install agent skill from directory
  ipcMain.handle('skills:installDir', (_event, dirPath: string) => {
    assertPathAllowed(dirPath)

    const db = getDb()
    const parsed = parseSkillDir(dirPath)
    const now = Date.now()
    const id = `skill-${now}-${Math.random().toString(36).slice(2, 8)}`

    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, parsed.name, parsed.format, parsed.version, JSON.stringify(parsed.tags),
      parsed.yamlFrontmatter, parsed.markdownContent, parsed.filePath, parsed.rootDir, 'agent', 1, now, now)

    return { id, ...parsed, trustLevel: 1 as const, installedAt: now, updatedAt: now }
  })

  // Uninstall info — returns counts of associated data before deletion
  ipcMain.handle('skills:getUninstallInfo', (_event, id: string) => {
    const db = getDb()
    const evalCount = (db.prepare('SELECT COUNT(*) as n FROM eval_history WHERE skill_id = ?').get(id) as { n: number }).n
    const tcCount = (db.prepare('SELECT COUNT(*) as n FROM test_cases WHERE skill_id = ?').get(id) as { n: number }).n
    const evolvedCount = (db.prepare('SELECT COUNT(*) as n FROM skills WHERE parent_skill_id = ?').get(id) as { n: number }).n
    return { evalCount, tcCount, evolvedCount }
  })

  // Uninstall — also cleans up eval_history (test_cases cascade via FK)
  ipcMain.handle('skills:uninstall', (_event, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM eval_history WHERE skill_id = ?').run(id)
    db.prepare('DELETE FROM skills WHERE id = ?').run(id)
  })

  // List files for a skill (directory walk)
  ipcMain.handle('skills:listFiles', (_event, skillId: string) => {
    const db = getDb()
    const row = db.prepare('SELECT root_dir, skill_type, file_path FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    if (!row) throw new Error(`Skill ${skillId} not found`)

    const rootDir = (row.root_dir as string) || dirname(row.file_path as string)
    assertPathAllowed(rootDir)

    if (row.skill_type === 'single') {
      // Single skill: just the one file
      const fp = row.file_path as string
      let size = 0
      try { size = statSync(fp).size } catch { /* file may have moved */ }
      return [{
        name: basename(fp),
        path: fp,
        relativePath: basename(fp),
        isDir: false,
        ext: extname(fp),
        size
      }] as SkillFileEntry[]
    }

    return walkDir(rootDir, rootDir)
  })

  // Read a single file's content (text only)
  ipcMain.handle('skills:readFile', (_event, filePath: string, skillId: string) => {
    // Verify the file belongs to this skill's rootDir
    const db = getDb()
    const row = db.prepare('SELECT root_dir, file_path FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    if (!row) throw new Error(`Skill ${skillId} not found`)

    const rootDir = resolve((row.root_dir as string) || dirname(row.file_path as string))
    const resolvedFile = resolve(filePath)
    if (!resolvedFile.startsWith(rootDir)) throw new Error('File is outside skill root directory')
    assertPathAllowed(resolvedFile)

    if (!isTextFile(extname(resolvedFile))) {
      return `[Binary file — cannot display (${extname(resolvedFile)})]`
    }

    try {
      return readFileSync(resolvedFile, 'utf-8')
    } catch (err) {
      throw new Error(`Cannot read file: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Get resolved ToolTarget list
  ipcMain.handle('skills:getToolTargets', (): ToolTarget[] => {
    const cfg = getConfig()
    const home = app.getPath('home')
    return Object.keys(TOOL_DEFAULTS).map((toolId) => {
      const r = resolveToolDir(toolId)!
      const enabled = cfg.enabledTools?.[toolId] ?? true  // default all enabled
      return {
        id: toolId,
        name: r.name,
        exportDir: r.exportDir,
        exportDirDisplay: r.exportDir.startsWith(home) ? '~' + r.exportDir.slice(home.length) : r.exportDir,
        ext: r.ext,
        exists: existsSync(r.exportDir),
        enabled
      }
    })
  })

  // Scan local AI tools for skills not yet imported
  ipcMain.handle('skills:scan', (): ScanResult => {
    const db = getDb()
    const cfg = getConfig()
    const home = app.getPath('home')
    const installedPaths = new Set(
      (db.prepare('SELECT file_path FROM skills').all() as { file_path: string }[]).map(r => r.file_path)
    )
    const skills: ScannedSkill[] = []
    const scannedDirs: ScanResult['scannedDirs'] = []
    const seenFilePaths = new Set<string>()

    const scanDir = (dir: string, toolId: string, toolName: string) => {
      const dirDisplay = dir.startsWith(home) ? '~' + dir.slice(home.length) : dir
      const exists = existsSync(dir)
      scannedDirs.push({ toolName, dir: dirDisplay, exists })
      if (!exists) return

      let entries: string[]
      try { entries = readdirSync(dir) } catch { return }

      for (const entry of entries) {
        const fullPath = join(dir, entry)
        let st: ReturnType<typeof statSync>
        try { st = statSync(fullPath) } catch { continue }

        if (st.isDirectory()) {
          // Agent skill: directory containing SKILL.md / README.md / <dirname>.md
          const entryMd = findEntryMd(fullPath)
          if (!entryMd) continue
          if (seenFilePaths.has(entryMd)) continue
          seenFilePaths.add(entryMd)

          let name = entry
          let skillType: SkillType = 'agent'
          try {
            const content = readFileSync(entryMd, 'utf-8')
            const match = content.match(/^---\n([\s\S]*?)\n---/)
            if (match) {
              const fm = yaml.load(match[1]) as Record<string, unknown>
              if (fm?.name) name = fm.name as string
              if ((fm?.skill_type as string) === 'single') skillType = 'single'
            }
          } catch { /* use dirname */ }

          skills.push({ name, filePath: entryMd, toolId, toolName, alreadyInstalled: installedPaths.has(entryMd), skillType })
        } else if (entry.endsWith('.md') || entry.endsWith('.mdc')) {
          // Single skill: flat .md / .mdc file
          if (seenFilePaths.has(fullPath)) continue
          seenFilePaths.add(fullPath)

          let name = basename(entry, extname(entry))
          let skillType: SkillType = 'single'
          try {
            const content = readFileSync(fullPath, 'utf-8')
            const match = content.match(/^---\n([\s\S]*?)\n---/)
            if (match) {
              const fm = yaml.load(match[1]) as Record<string, unknown>
              if (fm?.name) name = fm.name as string
              if ((fm?.skill_type as string) === 'agent') skillType = 'agent'
            }
          } catch { /* use filename */ }

          skills.push({ name, filePath: fullPath, toolId, toolName, alreadyInstalled: installedPaths.has(fullPath), skillType })
        }
      }
    }

    for (const toolId of Object.keys(TOOL_DEFAULTS)) {
      if (cfg.enabledTools?.[toolId] === false) continue
      const r = resolveToolDir(toolId)
      if (!r) continue
      for (const dir of r.scanDirs) {
        scanDir(dir, toolId, r.name)
      }
    }
    return { skills, scannedDirs }
  })

  // Import a scanned skill (already on disk, just DB register)
  // filePath may be an entry .md inside an agent skill dir, or a standalone .md file
  ipcMain.handle('skills:importScanned', (_event, filePath: string, skillType?: SkillType): Skill => {
    assertPathAllowed(filePath)
    const db = getDb()
    const now = Date.now()
    const id = `skill-${now}-${Math.random().toString(36).slice(2, 8)}`

    // If this is an agent skill (entry .md inside a directory), use parseSkillDir on the parent
    const parentDir = dirname(resolve(filePath))
    const isAgentSkill = skillType === 'agent'

    if (isAgentSkill) {
      const parsed = parseSkillDir(parentDir)
      db.prepare(`
        INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, installed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, parsed.name, parsed.format, parsed.version, JSON.stringify(parsed.tags),
        parsed.yamlFrontmatter, parsed.markdownContent, resolve(filePath), parsed.rootDir, 'agent', 1, now, now)
      return { id, ...parsed, trustLevel: 1 as const, installedAt: now, updatedAt: now }
    }

    const parsed = parseSkillFile(filePath)
    const rootDir = parentDir
    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, parsed.name, parsed.format, parsed.version, JSON.stringify(parsed.tags),
      parsed.yamlFrontmatter, parsed.markdownContent, resolve(filePath), rootDir, parsed.skillType, 1, now, now)

    return { id, ...parsed, rootDir, installedAt: now, updatedAt: now }
  })

  // Set trust level (T1-T4)
  ipcMain.handle('skills:setTrustLevel', (_event, id: string, level: 1 | 2 | 3 | 4) => {
    if (![1, 2, 3, 4].includes(level)) throw new Error('Invalid trust level')
    // T4 requires the skill to have already reached T2 (5D quality) and T3 (eval-tested)
    if (level === 4) {
      const row = getDb().prepare('SELECT trust_level FROM skills WHERE id = ?').get(id) as { trust_level: number } | undefined
      if (!row) throw new Error(`Skill ${id} not found`)
      if (row.trust_level < 2) throw new Error('Cannot approve to T4: skill has not passed 5D quality check (T2) or 8D eval (T3)')
    }
    getDb().prepare('UPDATE skills SET trust_level = ?, updated_at = ? WHERE id = ?').run(level, Date.now(), id)
  })

  ipcMain.handle('skills:getContent', (_event, skillId: string): string => {
    const row = getDb().prepare('SELECT markdown_content FROM skills WHERE id = ?').get(skillId) as { markdown_content: string } | undefined
    if (!row) throw new Error(`Skill ${skillId} not found`)
    return row.markdown_content
  })

  // Export a skill to an AI tool's directory
  ipcMain.handle('skills:export', (_event, skillId: string, toolId: string, mode: 'copy' | 'symlink') => {
    const db = getDb()
    const row = db.prepare('SELECT file_path, root_dir, name, skill_type FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    if (!row) throw new Error(`Skill ${skillId} not found`)

    const r = resolveToolDir(toolId)
    if (!r) throw new Error(`Unknown tool: ${toolId}`)

    // Security: target must be under home or %APPDATA% (Windows)
    const home = resolve(app.getPath('home'))
    const appData = platform() === 'win32'
      ? resolve(process.env.APPDATA || join(home, 'AppData', 'Roaming'))
      : null
    const exportDirResolved = resolve(r.exportDir)
    if (!exportDirResolved.startsWith(home) && !(appData && exportDirResolved.startsWith(appData))) {
      throw new Error(`Export path must be within home or AppData directory (got: ${exportDirResolved})`)
    }

    mkdirSync(r.exportDir, { recursive: true })

    const skillType = (row.skill_type as string) || 'single'
    const safeName = (row.name as string).replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '-').toLowerCase() || 'skill'

    if (skillType === 'agent') {
      // Agent skill: export the entire rootDir as a subdirectory
      const rootDir = resolve(row.root_dir as string)
      if (!existsSync(rootDir)) throw new Error(`Agent skill directory not found: ${rootDir}`)
      const destDir = join(r.exportDir, safeName)

      if (mode === 'copy') {
        // Remove existing dir at dest if present, then copy recursively
        if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true })
        cpSync(rootDir, destDir, { recursive: true })
      } else {
        // Symlink the whole directory
        try { unlinkSync(destDir) } catch { /* not found */ }
        if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true })
        symlinkSync(rootDir, destDir)
      }
    } else {
      // Single skill: export the .md file
      const srcPath = resolve(row.file_path as string)
      if (!existsSync(srcPath)) throw new Error(`Source file not found: ${srcPath}`)
      const destPath = join(r.exportDir, `${safeName}${r.ext}`)

      if (mode === 'copy') {
        const content = readFileSync(srcPath, 'utf-8')
        writeFileSync(destPath, content, 'utf-8')
      } else {
        try { unlinkSync(destPath) } catch { /* not found */ }
        symlinkSync(srcPath, destPath)
      }
    }
  })

  ipcMain.handle('skills:getEvoChain', (_event, skillId: string): EvoChainEntry[] => {
    const db = getDb()

    type SkillRow = { id: string; name: string; version: string; installed_at: number; parent_skill_id: string | null; evolution_notes: string | null }

    const getRow = (id: string) => db.prepare(
      'SELECT id, name, version, installed_at, parent_skill_id, evolution_notes FROM skills WHERE id = ?'
    ).get(id) as SkillRow | undefined

    const parseNotes = (notes: string | null): { paradigm?: string; evolutionNotes?: EvoAnalysis } => {
      if (!notes) return {}
      try {
        const p = JSON.parse(notes) as Record<string, string>
        return {
          paradigm: p.paradigm,
          evolutionNotes: { rootCause: p.rootCause ?? '', generalityTest: p.generalityTest ?? '', regressionRisk: p.regressionRisk ?? '' }
        }
      } catch { return {} }
    }

    // Step 1: walk UP to find the root
    let rootId = skillId
    const visited = new Set<string>()
    let cursor: SkillRow | undefined = getRow(skillId)
    while (cursor?.parent_skill_id && !visited.has(cursor.parent_skill_id)) {
      visited.add(cursor.id)
      rootId = cursor.parent_skill_id
      cursor = getRow(cursor.parent_skill_id)
    }

    // Step 2: BFS DOWN from root to collect all IDs in order
    const chain: SkillRow[] = []
    const queue: string[] = [rootId]
    const seen = new Set<string>()
    while (queue.length > 0 && chain.length < 50) {
      const id = queue.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      const row = getRow(id)
      if (!row) continue
      chain.push(row)
      const children = db.prepare(
        'SELECT id FROM skills WHERE parent_skill_id = ? ORDER BY installed_at ASC'
      ).all(id) as { id: string }[]
      for (const c of children) queue.push(c.id)
    }

    // Step 3: bulk-fetch eval scores for all chain IDs in one query (avoids N+1)
    const chainIds = chain.map(r => r.id)
    const avgScoreMap = new Map<string, number>()
    if (chainIds.length > 0) {
      const placeholders = chainIds.map(() => '?').join(',')
      const evalRows = db.prepare(
        `SELECT skill_id, scores FROM eval_history WHERE skill_id IN (${placeholders}) AND status = 'success' ORDER BY created_at DESC`
      ).all(...chainIds) as { skill_id: string; scores: string }[]

      const perSkill = new Map<string, { sum: number; count: number }>()
      for (const er of evalRows) {
        try {
          const vals = Object.values(JSON.parse(er.scores) as Record<string, { score: number }>)
          if (vals.length === 0) continue
          const avg = vals.reduce((s, v) => s + v.score, 0) / vals.length
          const acc = perSkill.get(er.skill_id) ?? { sum: 0, count: 0 }
          acc.sum += avg
          acc.count++
          perSkill.set(er.skill_id, acc)
        } catch { /* corrupt */ }
      }
      for (const [id, { sum, count }] of perSkill) {
        if (count > 0) avgScoreMap.set(id, sum / count)
      }
    }

    return chain.map(row => {
      const { paradigm, evolutionNotes } = parseNotes(row.evolution_notes)
      return {
        id: row.id,
        name: row.name,
        version: row.version,
        installedAt: row.installed_at,
        paradigm,
        avgScore: avgScoreMap.get(row.id),
        evolutionNotes,
        isRoot: !row.parent_skill_id
      }
    })
  })
}
