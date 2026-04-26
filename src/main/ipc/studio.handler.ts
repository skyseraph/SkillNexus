import { ipcMain } from 'electron'
import { getAIProvider } from '../services/ai-provider'
import { getActiveModel, getConfig } from './config.handler'
import { getDb } from '../db'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve, basename, dirname } from 'path'
import { app } from 'electron'
import yaml from 'js-yaml'
import { withTimeout, AI_TIMEOUT_MS } from '../services/eval-job'
import { fetchJson, fetchText } from './github-fetch'
import { isDemoMode } from '../demo'
import { runDemoEvolve } from '../services/demo/demo-runner'
import type { SkillScore5D, GithubSkillResult, EvoConfig, EvoAnalysis } from '../../shared/types'

const SKILL_FORMAT_HINT = `A Skill has this structure:
---
name: SkillName
version: 1.0.0
format: markdown
tags: [tag1, tag2]
---

# Skill Description

[Detailed instructions for the AI...]`

const STUDIO_SYSTEM_PROMPT = `You are an expert Skill author. Generate a well-structured Skill in Markdown format.

${SKILL_FORMAT_HINT}

Generate ONLY the Skill content, no extra commentary.`

const EVOLVE_SYSTEM_PROMPT = `You are an expert Skill optimizer. You receive an existing AI Skill, its real evaluation evidence, and an evolution strategy. Your job: diagnose the root cause of underperformance, then produce a strictly better version of the Skill.

${SKILL_FORMAT_HINT}

## Required Analysis (output as an HTML comment block BEFORE the Skill frontmatter)
Before writing the improved Skill, output a comment block in this exact format:
<!--ANALYSIS
ROOT_CAUSE: <one sentence — the underlying instruction gap, stated as a principle not "task X failed">
GENERALITY_TEST: <a DIFFERENT task not in the evidence that would also benefit from this fix — if you can't name one, your fix is overfitting>
REGRESSION_RISK: <which currently-passing dimensions might be affected, and why your fix won't harm them>
-->

## Hard Rules
- TASK-AGNOSTIC: do NOT hard-code specific inputs, file names, or example values from the evidence. The Skill guides an LLM across MANY tasks.
- NO REGRESSION: a fix that improves one dimension by harming another is NOT an improvement.
- SURGICAL: prefer rewriting existing sections over appending new ones. Net addition should be under ~40 lines.
- Output the ANALYSIS comment block first, then the complete improved Skill. No other commentary.`

const EXAMPLES_SYSTEM_PROMPT = `You are an expert Skill author. Given input/output examples of an AI task, infer and write a comprehensive Skill that would produce similar outputs.

${SKILL_FORMAT_HINT}

Output ONLY the complete Skill. No extra commentary.`

const STRATEGY_HINTS: Record<string, string> = {
  improve_weak:   'Focus on the weakest-scoring dimensions shown in the evidence. Fix the root cause — do not just add instructions that address the symptoms.',
  expand:         'Expand capability: add coverage for edge cases and broader use cases the evidence shows are missing. Do not remove existing coverage.',
  simplify:       'Simplify and distill to the essential core. Remove redundancy, tighten wording, improve scannability. Preserve all capability.',
  add_examples:   'Add 2-4 concrete input/output examples and edge-case guidance inside the Skill. Examples must be illustrative, not copied from eval evidence.',
  rewrite_weak:   'Identify the section(s) most responsible for failing tasks and rewrite them in place. Do not add new sections unless absolutely necessary.',
  fix_regression: 'The previous evolution caused a regression. Carefully compare old and new versions, revert the harmful change, and find a safer improvement.'
}

function buildParadigmHint(config: EvoConfig, dimAvgs: { dim: string; avg: number }[]): string {
  if (config.paradigm === 'evidence') {
    return 'Paradigm: Evidence-Driven Rewrite — use the evaluation evidence above to diagnose the root cause precisely. Apply a surgical fix targeting the weakest dimensions without harming others.'
  }
  if (config.paradigm === 'strategy') {
    const targets = config.targets && config.targets.length > 0
      ? config.targets
      : ['修复弱维度', '提升清晰度']
    const prioritized = dimAvgs.length > 0
      ? targets.sort((a) => (a.includes('弱维度') || a.includes('weak') ? -1 : 1))
      : targets
    return `Paradigm: Strategy Matrix — optimize for the following targets in priority order:\n${prioritized.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}\nBalance all targets; if they conflict, prioritize earlier items in the list.`
  }
  if (config.paradigm === 'capability') {
    return 'Paradigm: Capability-Aware Compilation — analyze the capability thresholds (L1/L2/L3) embedded in this Skill. Identify requirements that set the bar too high for typical models and rewrite them with graceful degradation, preserving the intent while lowering the execution barrier.'
  }
  return STRATEGY_HINTS.improve_weak
}

function parseAnalysisBlock(text: string): EvoAnalysis | null {
  const match = text.match(/<!--ANALYSIS\s*([\s\S]*?)-->/)
  if (!match) return null
  const body = match[1]
  const rootCause = body.match(/ROOT_CAUSE:\s*(.+)/)?.[1]?.trim() ?? ''
  const generalityTest = body.match(/GENERALITY_TEST:\s*(.+)/)?.[1]?.trim() ?? ''
  const regressionRisk = body.match(/REGRESSION_RISK:\s*(.+)/)?.[1]?.trim() ?? ''
  if (!rootCause && !generalityTest && !regressionRisk) return null
  return { rootCause, generalityTest, regressionRisk }
}

const EXTRACT_SYSTEM_PROMPT = `You are an expert Skill author. Analyze the conversation below and extract a reusable Skill ONLY if it contains stable, durable user preferences, constraints, or workflows that would benefit future interactions.

${SKILL_FORMAT_HINT}

Rules:
- If the conversation contains reusable patterns → output a complete Skill in the format above
- If it's a one-off request with no durable value → output exactly: NO_SKILL
- Prefer merging into an existing pattern over creating duplicates
- Output ONLY the Skill content or NO_SKILL. No commentary.`

const SCORE_SYSTEM_PROMPT = `You are a Skill quality evaluator. Score the given Skill on 5 dimensions, each from 0 to 10.

Dimensions:
- safety: Does it avoid harmful, biased, or dangerous instructions?
- completeness: Does it cover the task thoroughly with clear instructions?
- executability: Can an AI follow it without ambiguity?
- maintainability: Is it well-structured, readable, and easy to update?
- costAwareness: Does it avoid unnecessary verbosity that wastes tokens?

Respond with ONLY valid JSON in this exact format:
{"safety":8,"completeness":7,"executability":9,"maintainability":8,"costAwareness":6}`

const SCORE_AGENT_SYSTEM_PROMPT = `You are an Agent Skill quality evaluator. Score the given Agent Skill on 5 dimensions, each from 0 to 10.

Dimensions:
- safety: Does it avoid harmful, biased, or dangerous instructions?
- completeness: Does it cover the agent task thoroughly with clear instructions?
- executability: Can an AI follow it without ambiguity?
- maintainability: Is it well-structured, readable, and easy to update?
- orchestration: Are the steps logically ordered, tools properly declared, and sub-skill coordination clear?

Respond with ONLY valid JSON in this exact format:
{"safety":8,"completeness":7,"executability":9,"maintainability":8,"orchestration":7}`

export function registerStudioHandlers(): void {
  ipcMain.handle('studio:generate', async (_event, prompt: string) => {
    const provider = getAIProvider()
    const result = await withTimeout(
      provider.call({ model: getActiveModel(), systemPrompt: STUDIO_SYSTEM_PROMPT, userMessage: prompt }),
      AI_TIMEOUT_MS,
      'studio:generate'
    )
    return result.content
  })

  ipcMain.handle('studio:evolve', async (event, skillId: string, config: EvoConfig | string) => {
    if (isDemoMode()) return runDemoEvolve(event)
    // Accept both new EvoConfig object and legacy string strategy for backwards compat
    const evoConfig: EvoConfig = typeof config === 'string'
      ? { paradigm: 'evidence' }
      : config
    const db = getDb()
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    if (!skill) throw new Error(`Skill ${skillId} not found`)

    const history = db.prepare(
      'SELECT scores, input_prompt, output, status FROM eval_history WHERE skill_id = ? ORDER BY created_at DESC LIMIT 40'
    ).all(skillId) as { scores: string; input_prompt: string; output: string; status: string }[]

    // Parse all rows once; skip corrupt entries
    interface ParsedRow {
      scores: Record<string, { score: number }>
      avg: number
      input: string
      output: string
    }
    const parsed: ParsedRow[] = []
    const totals: Record<string, { sum: number; count: number }> = {}
    for (const row of history) {
      if (row.status !== 'success') continue
      try {
        const scores = JSON.parse(row.scores) as Record<string, { score: number }>
        const avg = Object.values(scores).reduce((s, v) => s + v.score, 0) / Object.values(scores).length
        parsed.push({ scores, avg, input: row.input_prompt, output: row.output })
        for (const [dim, s] of Object.entries(scores)) {
          if (!totals[dim]) totals[dim] = { sum: 0, count: 0 }
          totals[dim].sum += s.score
          totals[dim].count++
        }
      } catch { /* corrupt row */ }
    }

    const dimAvgs = Object.entries(totals)
      .map(([dim, { sum, count }]) => ({ dim, avg: sum / count }))
      .sort((a, b) => a.avg - b.avg)

    // Build evidence block
    let evidenceBlock = ''
    if (dimAvgs.length > 0) {
      evidenceBlock += `## Evaluation Evidence (${parsed.length} runs)\n`
      evidenceBlock += `Score by dimension (sorted worst→best):\n`
      evidenceBlock += dimAvgs.map(d => `  ${d.dim}: ${d.avg.toFixed(1)}/10`).join('\n')
      evidenceBlock += '\n\n'

      // Per-dimension failing samples: for the 2 weakest dimensions, show the
      // 1-2 samples where that specific dimension scored lowest. This gives the
      // optimizer targeted evidence rather than just overall-lowest samples.
      const worstDims = dimAvgs.slice(0, 2)
      for (const { dim, avg: dimAvg } of worstDims) {
        const dimSamples = parsed
          .filter(r => r.scores[dim] !== undefined)
          .sort((a, b) => (a.scores[dim]?.score ?? 10) - (b.scores[dim]?.score ?? 10))
          .slice(0, 2)
        if (dimSamples.length === 0) continue
        evidenceBlock += `## Failing Samples — dimension: ${dim} (avg ${dimAvg.toFixed(1)}/10)\n`
        for (let i = 0; i < dimSamples.length; i++) {
          const s = dimSamples[i]!
          const dimScore = s.scores[dim]?.score ?? 0
          evidenceBlock += `### Sample ${i + 1} (${dim}: ${dimScore.toFixed(1)}/10, overall: ${s.avg.toFixed(1)}/10)\n`
          evidenceBlock += `Input: ${s.input.slice(0, 800)}${s.input.length > 800 ? '...' : ''}\n`
          evidenceBlock += `Output: ${s.output.slice(0, 1000)}${s.output.length > 1000 ? '...' : ''}\n\n`
        }
      }

      // One high-scoring sample as a "success pattern" reference
      const bestSample = parsed.sort((a, b) => b.avg - a.avg)[0]
      if (bestSample && bestSample.avg >= 7) {
        evidenceBlock += `## Passing Sample (success pattern — avg ${bestSample.avg.toFixed(1)}/10)\n`
        evidenceBlock += `Input: ${bestSample.input.slice(0, 500)}${bestSample.input.length > 500 ? '...' : ''}\n`
        evidenceBlock += `Output: ${bestSample.output.slice(0, 600)}${bestSample.output.length > 600 ? '...' : ''}\n\n`
      }
    } else {
      evidenceBlock = '## Evaluation Evidence\nNo evaluation history available.\n\n'
    }

    const strategyHint = buildParadigmHint(evoConfig, dimAvgs)

    // Build evolution chain history to prevent the optimizer from oscillating
    // or repeating diagnoses that already failed in prior rounds.
    interface ChainEntry { name: string; version: string; dimAvgs: { dim: string; avg: number }[] }
    const chainHistory: ChainEntry[] = []
    let cursorId: string | null = skillId
    const visitedChain = new Set<string>()
    // Walk up to 4 ancestors (oldest first after reverse)
    for (let depth = 0; depth < 4 && cursorId; depth++) {
      if (visitedChain.has(cursorId)) break
      visitedChain.add(cursorId)
      const ancestor = db.prepare('SELECT id, name, version, parent_skill_id FROM skills WHERE id = ?').get(cursorId) as
        { id: string; name: string; version: string; parent_skill_id: string | null } | undefined
      if (!ancestor) break
      // Compute avg scores for this ancestor from its eval history
      const ancestorHistory = db.prepare(
        'SELECT scores FROM eval_history WHERE skill_id = ? AND status = ? ORDER BY created_at DESC LIMIT 20'
      ).all(ancestor.id, 'success') as { scores: string }[]
      const aTotals: Record<string, { sum: number; count: number }> = {}
      for (const row of ancestorHistory) {
        try {
          const scores = JSON.parse(row.scores) as Record<string, { score: number }>
          for (const [dim, s] of Object.entries(scores)) {
            if (!aTotals[dim]) aTotals[dim] = { sum: 0, count: 0 }
            aTotals[dim].sum += s.score
            aTotals[dim].count++
          }
        } catch { /* corrupt */ }
      }
      const aDimAvgs = Object.entries(aTotals)
        .map(([dim, { sum, count }]) => ({ dim, avg: sum / count }))
        .sort((a, b) => a.avg - b.avg)
      chainHistory.push({ name: ancestor.name, version: ancestor.version, dimAvgs: aDimAvgs })
      cursorId = ancestor.parent_skill_id
    }
    chainHistory.reverse() // oldest → newest

    let historyBlock = ''
    if (chainHistory.length > 1) {
      historyBlock = '## Evolution Chain History (oldest → current)\n'
      historyBlock += 'Use this to avoid repeating failed diagnoses and to understand what has already been tried.\n\n'
      for (const entry of chainHistory) {
        const isCurrent = entry.version === (skill.version as string)
        const label = isCurrent ? '← current' : ''
        historyBlock += `### ${entry.name} v${entry.version} ${label}\n`
        if (entry.dimAvgs.length > 0) {
          historyBlock += entry.dimAvgs.map(d => `  ${d.dim}: ${d.avg.toFixed(1)}/10`).join('\n') + '\n'
        } else {
          historyBlock += '  (no eval data)\n'
        }
        historyBlock += '\n'
      }
    }

    // Bump minor version
    const currentVersion = (skill.version as string) || '1.0.0'
    const parts = currentVersion.split('.').map(Number)
    parts[1] = (parts[1] || 0) + 1
    const nextVersion = parts.join('.')

    const userMessage =
      `Current Skill (v${currentVersion}):\n\n${skill.markdown_content as string}\n\n` +
      `${evidenceBlock}\n` +
      (historyBlock ? `${historyBlock}\n` : '') +
      `## Evolution Strategy\n${strategyHint}\n\n` +
      `Produce the improved Skill at version ${nextVersion}:`

    const provider = getAIProvider()

    // Stream split: buffer until complete <!--ANALYSIS...-->  block is detected
    // (up to 2000 chars), then emit studio:analysis event once and forward
    // remaining chunks as studio:chunk.
    let buffer = ''
    let analysisSent = false
    const ANALYSIS_SEARCH_LIMIT = 2000

    await provider.stream(
      { model: getActiveModel(), systemPrompt: EVOLVE_SYSTEM_PROMPT, userMessage },
      (chunk) => {
        if (analysisSent) {
          event.sender.send('studio:chunk', { chunk, done: false })
          return
        }
        buffer += chunk
        const closeIdx = buffer.indexOf('-->')
        if (closeIdx !== -1) {
          // Full ANALYSIS block is in buffer
          const analysis = parseAnalysisBlock(buffer)
          if (analysis) {
            event.sender.send('studio:analysis', analysis)
          }
          analysisSent = true
          // Forward everything after the closing --> as chunk
          const remainder = buffer.slice(closeIdx + 3).trimStart()
          if (remainder) {
            event.sender.send('studio:chunk', { chunk: remainder, done: false })
          }
        } else if (buffer.length > ANALYSIS_SEARCH_LIMIT) {
          // Give up waiting for ANALYSIS — forward buffer as-is
          analysisSent = true
          event.sender.send('studio:chunk', { chunk: buffer, done: false })
        }
      }
    )
    event.sender.send('studio:chunk', { chunk: '', done: true })
  })

  ipcMain.handle('studio:generateFromExamples', async (event, examples: Array<{ input: string; output: string }>, description?: string) => {
    if (!Array.isArray(examples) || examples.length === 0) throw new Error('At least one example is required')
    if (examples.length > 10) throw new Error('Maximum 10 examples allowed')

    const examplesText = examples
      .map((ex, i) => `Example ${i + 1}:\nInput: ${ex.input}\nExpected Output: ${ex.output}`)
      .join('\n\n')
    const descLine = description?.trim() ? `\nAdditional context: ${description.trim()}` : ''
    const userMessage = `Based on these examples, write a Skill:\n\n${examplesText}${descLine}\n\nGenerate the Skill:`

    const provider = getAIProvider()
    await provider.stream(
      { model: getActiveModel(), systemPrompt: EXAMPLES_SYSTEM_PROMPT, userMessage },
      (chunk) => event.sender.send('studio:chunk', { chunk, done: false })
    )
    event.sender.send('studio:chunk', { chunk: '', done: true })
  })

  ipcMain.handle('studio:generateStream', async (event, prompt: string) => {
    const provider = getAIProvider()
    await provider.stream(
      { model: getActiveModel(), systemPrompt: STUDIO_SYSTEM_PROMPT, userMessage: prompt },
      (chunk) => event.sender.send('studio:chunk', { chunk, done: false })
    )
    event.sender.send('studio:chunk', { chunk: '', done: true })
  })

  ipcMain.handle('studio:install', async (_event, content: string, name: string) => {
    if (!content || !content.trim()) {
      throw new Error('Skill content cannot be empty')
    }
    const skillsDir = join(app.getPath('userData'), 'skills')
    // SEC-04: sanitize name — strip any path separators, keep only safe chars
    const safeName = basename(name.replace(/[^a-zA-Z0-9_\- ]/g, '')).replace(/\s+/g, '-').toLowerCase() || 'skill'
    const filePath = resolve(join(skillsDir, `${safeName}.md`))
    // Ensure the resolved path stays inside skillsDir
    if (!filePath.startsWith(resolve(skillsDir))) {
      throw new Error('Invalid skill name: path traversal detected')
    }

    mkdirSync(skillsDir, { recursive: true })

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
    const skillType = (frontmatter.skill_type as string) === 'agent' ? 'agent' : 'single'
    const skillName = (frontmatter.name as string) || safeName

    let resolvedFilePath: string
    let rootDir: string

    if (skillType === 'agent') {
      rootDir = resolve(join(skillsDir, safeName))
      resolvedFilePath = resolve(join(rootDir, 'agent.md'))
      if (!resolvedFilePath.startsWith(resolve(skillsDir))) throw new Error('Invalid agent path')
      mkdirSync(rootDir, { recursive: true })
      writeFileSync(resolvedFilePath, content, 'utf-8')
    } else {
      resolvedFilePath = filePath
      rootDir = dirname(filePath)
      writeFileSync(resolvedFilePath, content, 'utf-8')
    }

    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      skillName,
      (frontmatter.format as string) || 'markdown',
      (frontmatter.version as string) || '1.0.0',
      JSON.stringify((frontmatter.tags as string[]) || []),
      match ? match[1] : '',
      markdownContent,
      resolvedFilePath,
      rootDir,
      skillType,
      1,
      now,
      now
    )

    return {
      id,
      name: skillName,
      format: (frontmatter.format as string) || 'markdown',
      version: (frontmatter.version as string) || '1.0.0',
      tags: (frontmatter.tags as string[]) || [],
      yamlFrontmatter: match ? match[1] : '',
      markdownContent,
      filePath: resolvedFilePath,
      rootDir,
      skillType,
      trustLevel: 1,
      installedAt: now,
      updatedAt: now
    }
  })

  // Extract Skill from conversation text (AutoSkill-style)
  ipcMain.handle('studio:extract', async (event, conversation: string) => {
    const userMessage = `Conversation to analyze:\n\n${conversation}\n\nExtract a reusable Skill or output NO_SKILL:`
    const provider = getAIProvider()
    let buffer = ''
    await provider.stream(
      { model: getActiveModel(), systemPrompt: EXTRACT_SYSTEM_PROMPT, userMessage },
      (chunk) => {
        buffer += chunk
        event.sender.send('studio:chunk', { chunk, done: false })
      }
    )
    // If AI returned NO_SKILL, signal with a special done payload
    const isNoSkill = buffer.trim() === 'NO_SKILL'
    event.sender.send('studio:chunk', { chunk: '', done: true, noSkill: isNoSkill })
  })

  // Score a Skill on 5 dimensions
  ipcMain.handle('studio:scoreSkill', async (_event, content: string): Promise<SkillScore5D> => {
    const provider = getAIProvider()
    const isAgent = /^---[\s\S]*?skill_type:\s*agent/m.test(content)
    const systemPrompt = isAgent ? SCORE_AGENT_SYSTEM_PROMPT : SCORE_SYSTEM_PROMPT
    const result = await withTimeout(
      provider.call({ model: getActiveModel(), systemPrompt, userMessage: content }),
      AI_TIMEOUT_MS,
      'studio:scoreSkill'
    )
    try {
      const parsed = JSON.parse(result.content.trim()) as Record<string, number>
      const clamp = (v: unknown) => Math.min(10, Math.max(0, Number(v) || 0))
      if (isAgent) {
        return {
          safety:          clamp(parsed.safety),
          completeness:    clamp(parsed.completeness),
          executability:   clamp(parsed.executability),
          maintainability: clamp(parsed.maintainability),
          costAwareness:   0,
          orchestration:   clamp(parsed.orchestration)
        }
      }
      return {
        safety:         clamp(parsed.safety),
        completeness:   clamp(parsed.completeness),
        executability:  clamp(parsed.executability),
        maintainability: clamp(parsed.maintainability),
        costAwareness:  clamp(parsed.costAwareness)
      }
    } catch {
      return { safety: 5, completeness: 5, executability: 5, maintainability: 5, costAwareness: 5 }
    }
  })

  // Find similar skills by name/tag overlap
  ipcMain.handle('studio:similarSkills', (_event, content: string) => {
    const db = getDb()
    // Extract name from frontmatter if present
    const nameMatch = content.match(/^---[\s\S]*?name:\s*(.+?)\s*\n/m)
    const tagsMatch = content.match(/^---[\s\S]*?tags:\s*\[([^\]]*)\]/m)
    const name = nameMatch ? nameMatch[1].toLowerCase() : ''
    const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '').toLowerCase()).filter(Boolean) : []

    const rows = db.prepare(`
      SELECT * FROM skills
      WHERE id NOT LIKE 'skill-noskill-%' AND id NOT LIKE 'skill-gen-%'
    `).all() as Record<string, unknown>[]

    return rows
      .filter(r => {
        const rName = (r.name as string).toLowerCase()
        const rTags: string[] = JSON.parse(r.tags as string)
        const nameMatch = name && (rName.includes(name) || name.includes(rName))
        const tagOverlap = tags.some(t => rTags.includes(t))
        return nameMatch || tagOverlap
      })
      .slice(0, 5)
      .map(r => ({
        id: r.id as string,
        name: r.name as string,
        format: r.format as string,
        version: r.version as string,
        tags: JSON.parse(r.tags as string),
        yamlFrontmatter: r.yaml_frontmatter as string,
        markdownContent: r.markdown_content as string,
        filePath: r.file_path as string,
        rootDir: (r.root_dir as string) || '',
        skillType: ((r.skill_type as string) || 'single'),
        trustLevel: (r.trust_level as number) || 1,
        installedAt: r.installed_at as number,
        updatedAt: r.updated_at as number
      }))
  })

  const GH_RAW = 'https://raw.githubusercontent.com'

  function codeItemToResult(item: Record<string, unknown>): GithubSkillResult {
    const repo = item.repository as Record<string, unknown>
    const htmlUrl = item.html_url as string
    const rawUrl = htmlUrl
      .replace('https://github.com/', `${GH_RAW}/`)
      .replace('/blob/', '/')
    return {
      id: `${repo.full_name as string}/${item.path as string}`,
      name: (item.name as string).replace(/\.md$/i, ''),
      repoName: repo.full_name as string,
      description: (repo.description as string) || '',
      stars: (repo.stargazers_count as number) || 0,
      url: htmlUrl,
      rawUrl,
      tags: (repo.topics as string[]) || []
    }
  }

  ipcMain.handle('studio:searchGithub', async (_event, query: string): Promise<GithubSkillResult[]> => {
    const token = getConfig().githubToken
    const q = encodeURIComponent(`${query.trim()} extension:md`)
    const url = `https://api.github.com/search/code?q=${q}&per_page=30`
    const data = await fetchJson(url, token) as { items?: Record<string, unknown>[] }
    return (data.items || []).map(codeItemToResult)
  })

  ipcMain.handle('studio:fetchGithubContent', async (_event, rawUrl: string): Promise<string> => {
    if (!rawUrl.startsWith(`${GH_RAW}/`)) {
      throw new Error('Security: only raw.githubusercontent.com URLs are permitted')
    }
    return fetchText(rawUrl, getConfig().githubToken)
  })

  ipcMain.handle('studio:recentEvalHistory', (_event, limit: number) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT eh.input_prompt, eh.output, eh.created_at, s.name as skill_name
      FROM eval_history eh
      LEFT JOIN skills s ON s.id = eh.skill_id
      ORDER BY eh.created_at DESC
      LIMIT ?
    `).all(Math.min(limit || 20, 50)) as { input_prompt: string; output: string; created_at: number; skill_name: string }[]
    return rows.map(r => ({
      skillName: r.skill_name || 'Unknown',
      inputPrompt: r.input_prompt,
      output: r.output,
      createdAt: r.created_at
    }))
  })
}
