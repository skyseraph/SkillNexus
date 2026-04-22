import { ipcMain, net } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { app } from 'electron'
import yaml from 'js-yaml'
import { getDb } from '../db'
import type { MarketSkill, Skill, SkillType } from '../../shared/types'

const GH_API = 'https://api.github.com'
const GH_RAW = 'https://raw.githubusercontent.com'

// Default search: repos tagged with skill-related topics
const DEFAULT_QUERY = 'topic:claude-skill topic:ai-skill topic:llm-skill topic:claude-code-skill'

const FETCH_TIMEOUT_MS = 15_000

function withFetchTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Network request timed out')), FETCH_TIMEOUT_MS)
    )
  ])
}

function fetchJson(url: string): Promise<unknown> {
  return withFetchTimeout(new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' })
    req.setHeader('Accept', 'application/vnd.github+json')
    req.setHeader('User-Agent', 'SkillNexus/1.0')
    const chunks: Buffer[] = []
    req.on('response', (res) => {
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8')
          if (res.statusCode === 403) {
            reject(new Error('GitHub API rate limit reached. Please wait a minute and try again.'))
            return
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`GitHub API error: ${res.statusCode}`))
            return
          }
          resolve(JSON.parse(body))
        } catch (e) {
          reject(e)
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  }))
}

function fetchText(url: string): Promise<string> {
  return withFetchTimeout(new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' })
    req.setHeader('User-Agent', 'SkillNexus/1.0')
    const chunks: Buffer[] = []
    req.on('response', (res) => {
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Failed to fetch file: ${res.statusCode}`))
          return
        }
        resolve(Buffer.concat(chunks).toString('utf-8'))
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  }))
}

function repoToMarketSkill(repo: Record<string, unknown>): MarketSkill {
  const owner = (repo.owner as Record<string, unknown>)?.login as string
  const repoName = repo.name as string
  const branch = (repo.default_branch as string) || 'main'
  // Try SKILL.md, fallback to README.md
  const installUrl = `${GH_RAW}/${owner}/${repoName}/${branch}/SKILL.md`

  return {
    id: repo.full_name as string,
    name: repoName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: (repo.description as string) || '',
    stars: (repo.stargazers_count as number) || 0,
    topics: (repo.topics as string[]) || [],
    author: owner,
    htmlUrl: repo.html_url as string,
    installUrl,
    updatedAt: repo.updated_at as string
  }
}

export function registerMarketplaceHandlers(): void {
  ipcMain.handle('marketplace:search', async (_event, query: string): Promise<MarketSkill[]> => {
    const q = query?.trim() ? `${query} ${DEFAULT_QUERY}` : DEFAULT_QUERY
    const url = `${GH_API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`
    const data = await fetchJson(url) as { items?: Record<string, unknown>[] }
    return (data.items || []).map(repoToMarketSkill)
  })

  ipcMain.handle('marketplace:install', async (_event, skill: MarketSkill): Promise<Skill> => {
    // Try SKILL.md first, then README.md
    let content: string
    try {
      content = await fetchText(skill.installUrl)
    } catch {
      const [owner, repo] = skill.id.split('/')
      const branch = 'main'
      content = await fetchText(`${GH_RAW}/${owner}/${repo}/${branch}/README.md`)
    }

    const skillsDir = join(app.getPath('userData'), 'skills', 'marketplace')
    mkdirSync(skillsDir, { recursive: true })

    const safeName = skill.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '-').toLowerCase() || 'market-skill'
    const filePath = resolve(join(skillsDir, `${safeName}.md`))
    if (!filePath.startsWith(resolve(skillsDir))) throw new Error('Path traversal detected')

    writeFileSync(filePath, content, 'utf-8')

    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    let frontmatter: Record<string, unknown> = {}
    let markdownContent = content
    if (match) {
      frontmatter = (yaml.load(match[1]) as Record<string, unknown>) || {}
      markdownContent = match[2]
    }

    const db = getDb()
    const now = Date.now()
    const id = `skill-${now}-${Math.random().toString(36).slice(2, 8)}`
    const rootDir = dirname(filePath)
    const name = (frontmatter.name as string) || skill.name

    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name,
      (frontmatter.format as string) || 'markdown',
      (frontmatter.version as string) || '1.0.0',
      JSON.stringify((frontmatter.tags as string[]) || skill.topics.slice(0, 5)),
      match ? match[1] : '',
      markdownContent,
      filePath,
      rootDir,
      'single',
      1,
      now,
      now
    )

    return {
      id, name,
      format: (frontmatter.format as string) || 'markdown',
      version: (frontmatter.version as string) || '1.0.0',
      tags: (frontmatter.tags as string[]) || skill.topics.slice(0, 5),
      yamlFrontmatter: match ? match[1] : '',
      markdownContent,
      filePath,
      rootDir,
      skillType: 'single' as SkillType,
      trustLevel: 1 as const,
      installedAt: now,
      updatedAt: now
    }
  })
}
