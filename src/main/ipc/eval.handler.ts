import { ipcMain } from 'electron'
import { getDb } from '../db'
import { getAIProvider } from '../services/ai-provider'
import { getActiveModel } from './config.handler'
import { getMainWindow } from '../index'
import { runEvalJob, runAgentEvalJob, withTimeout, AI_TIMEOUT_MS, MAX_TEST_CASES } from '../services/eval-job'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { app } from 'electron'
import yaml from 'js-yaml'
import type { ThreeConditionResult, SkillRankEntry } from '../../shared/types'

export function registerEvalHandlers(): void {
  ipcMain.handle('eval:start', async (_event, skillId: string, testCaseIds: string[]) => {
    if (!Array.isArray(testCaseIds) || testCaseIds.length > MAX_TEST_CASES) {
      throw new Error(`testCaseIds must be an array of at most ${MAX_TEST_CASES} items`)
    }

    const db = getDb()
    const jobId = `eval-${Date.now()}`
    const win = getMainWindow()

    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    if (!skill) throw new Error(`Skill ${skillId} not found`)

    const testCases = testCaseIds.length > 0
      ? (db.prepare(`SELECT * FROM test_cases WHERE id IN (${testCaseIds.map(() => '?').join(',')}) AND skill_id = ?`).all(...testCaseIds, skillId) as Record<string, unknown>[])
      : (db.prepare('SELECT * FROM test_cases WHERE skill_id = ? LIMIT ?').all(skillId, MAX_TEST_CASES) as Record<string, unknown>[])

    if (testCases.length === 0) {
      win?.webContents.send('eval:progress', { jobId, progress: 100, message: 'No test cases found' })
      return jobId
    }

    setImmediate(() => {
      const job = skill.skill_type === 'agent'
        ? runAgentEvalJob(jobId, skillId, skill, testCases)
        : runEvalJob(jobId, skillId, skill.markdown_content as string, testCases)
      job.catch((err) => {
        win?.webContents.send('eval:progress', { jobId, progress: 100, message: `Fatal error: ${err instanceof Error ? err.message : String(err)}` })
      })
    })

    return jobId
  })

  ipcMain.handle('eval:history', (_event, skillId: string, limit = 20, offset = 0) => {
    const db = getDb()
    const total = (db.prepare('SELECT COUNT(*) as cnt FROM eval_history WHERE skill_id = ?').get(skillId) as { cnt: number }).cnt
    const rows = db
      .prepare('SELECT * FROM eval_history WHERE skill_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(skillId, limit, offset) as Record<string, unknown>[]
    const items = rows.map((r) => ({
      id: r.id,
      skillId: r.skill_id,
      model: r.model,
      provider: r.provider,
      inputPrompt: r.input_prompt,
      output: r.output,
      scores: (() => { try { return JSON.parse(r.scores as string) } catch { return {} } })(),
      totalScore: r.total_score,
      durationMs: r.duration_ms,
      status: r.status,
      createdAt: r.created_at,
      testCaseId: (r.test_case_id as string) ?? undefined,
      testCaseName: (r.test_case_name as string) ?? undefined
    }))
    return { items, total, limit, offset }
  })

  ipcMain.handle('eval:getById', (_event, evalId: string) => {
    const db = getDb()
    const r = db.prepare('SELECT * FROM eval_history WHERE id = ?').get(evalId) as Record<string, unknown> | undefined
    if (!r) return null
    return {
      id: r.id,
      skillId: r.skill_id,
      model: r.model,
      provider: r.provider,
      inputPrompt: r.input_prompt,
      output: r.output,
      scores: (() => { try { return JSON.parse(r.scores as string) } catch { return {} } })(),
      totalScore: r.total_score,
      durationMs: r.duration_ms,
      status: r.status,
      createdAt: r.created_at,
      testCaseId: (r.test_case_id as string) ?? undefined,
      testCaseName: (r.test_case_name as string) ?? undefined
    }
  })

  ipcMain.handle('eval:exportHistory', (_event, skillId: string) => {
    const db = getDb()
    const skill = db.prepare('SELECT name, version FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    const rows = db
      .prepare('SELECT * FROM eval_history WHERE skill_id = ? ORDER BY created_at DESC')
      .all(skillId) as Record<string, unknown>[]
    return {
      skill: { id: skillId, name: skill?.name, version: skill?.version },
      exportedAt: new Date().toISOString(),
      framework: 'SkillNexus 8-Dimension Eval Framework (G1-G5 task quality + S1-S3 skill quality)',
      dimensions: ['correctness', 'instruction_following', 'safety', 'completeness', 'robustness', 'executability', 'cost_awareness', 'maintainability'],
      records: rows.map((r) => ({
        id: r.id,
        createdAt: new Date(r.created_at as number).toISOString(),
        status: r.status,
        model: r.model,
        provider: r.provider,
        durationMs: r.duration_ms,
        totalScore: r.total_score,
        scores: JSON.parse(r.scores as string),
        input: r.input_prompt,
        output: r.output
      }))
    }
  })

  ipcMain.handle('eval:startThreeCondition', async (
    _event,
    skillId: string,
    testCaseIds: string[]
  ): Promise<ThreeConditionResult> => {
    if (!Array.isArray(testCaseIds) || testCaseIds.length > MAX_TEST_CASES) {
      throw new Error(`testCaseIds must be an array of at most ${MAX_TEST_CASES} items`)
    }

    const db = getDb()
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    if (!skill) throw new Error(`Skill ${skillId} not found`)

    const testCases = testCaseIds.length > 0
      ? (db.prepare(`SELECT * FROM test_cases WHERE id IN (${testCaseIds.map(() => '?').join(',')}) AND skill_id = ?`).all(...testCaseIds, skillId) as Record<string, unknown>[])
      : (db.prepare('SELECT * FROM test_cases WHERE skill_id = ? LIMIT ?').all(skillId, MAX_TEST_CASES) as Record<string, unknown>[])

    if (testCases.length === 0) throw new Error('No test cases found for this skill')

    // Generate Condition C skill via AI
    const provider = getAIProvider()
    const model = getActiveModel()
    const examplesText = testCases.slice(0, 5)
      .map((tc, i) => `Example ${i + 1}:\nInput: ${tc.input as string}`)
      .join('\n\n')

    const genResult = await withTimeout(
      provider.call({
        model,
        systemPrompt: `You are an expert Skill author. Given test case inputs, infer and write a comprehensive Skill in this format:
---
name: generated-skill
version: 1.0.0
format: markdown
tags: [generated]
---

# Skill Description
[Instructions...]

Output ONLY the Skill content.`,
        userMessage: `Based on these test inputs, write a Skill:\n\n${examplesText}\n\nGenerate the Skill:`
      }),
      AI_TIMEOUT_MS,
      'generate-skill-c'
    )
    const generatedContent = genResult.content

    // Install generated skill (Condition C)
    const skillsDir = join(app.getPath('userData'), 'skills', 'three-condition')
    mkdirSync(skillsDir, { recursive: true })
    const now = Date.now()
    const filePath = resolve(join(skillsDir, `generated-${now}.md`))
    writeFileSync(filePath, generatedContent, 'utf-8')

    const match = generatedContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    let frontmatter: Record<string, unknown> = {}
    let markdownContent = generatedContent
    if (match) {
      frontmatter = (yaml.load(match[1]) as Record<string, unknown>) || {}
      markdownContent = match[2]
    }

    const generatedId = `skill-gen-${now}-${Math.random().toString(36).slice(2, 8)}`
    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generatedId,
      (frontmatter.name as string) || 'Generated Skill',
      (frontmatter.format as string) || 'markdown',
      (frontmatter.version as string) || '1.0.0',
      JSON.stringify((frontmatter.tags as string[]) || ['generated']),
      match ? match[1] : '',
      markdownContent,
      filePath,
      dirname(filePath),
      'single',
      now, now
    )

    for (const tc of testCases) {
      const newId = `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      db.prepare(`INSERT INTO test_cases (id, skill_id, name, input, judge_type, judge_param, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(newId, generatedId, tc.name, tc.input, tc.judge_type, tc.judge_param, Date.now())
    }

    // Create no-skill placeholder for Condition A
    const noSkillId = `skill-noskill-${now}-${Math.random().toString(36).slice(2, 8)}`
    db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(noSkillId, 'No-Skill Baseline', 'markdown', '1.0.0', '[]', '', '', filePath, dirname(filePath), 'single', now, now)

    for (const tc of testCases) {
      const newId = `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      db.prepare(`INSERT INTO test_cases (id, skill_id, name, input, judge_type, judge_param, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(newId, noSkillId, tc.name, tc.input, tc.judge_type, tc.judge_param, Date.now())
    }

    const jobIdA = `3cond-a-${now}`
    const jobIdB = `3cond-b-${now}`
    const jobIdC = `3cond-c-${now}`

    setImmediate(() => {
      Promise.allSettled([
        runEvalJob(jobIdA, noSkillId, '', testCases),
        runEvalJob(jobIdB, skillId, skill.markdown_content as string, testCases),
        runEvalJob(jobIdC, generatedId, markdownContent, testCases)
      ]).catch(() => {})
    })

    return { jobIdA, jobIdB, jobIdC, noSkillId, generatedSkillId: generatedId, generatedSkillContent: generatedContent }
  })

  ipcMain.handle('eval:historyAll', (): SkillRankEntry[] => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        s.id AS skill_id,
        s.name AS skill_name,
        s.skill_type,
        COUNT(e.id) AS eval_count,
        AVG(e.total_score) AS avg_total,
        AVG(json_extract(e.scores, '$.correctness.score'))         AS avg_correctness,
        AVG(json_extract(e.scores, '$.instruction_following.score')) AS avg_instruction_following,
        AVG(json_extract(e.scores, '$.safety.score'))              AS avg_safety,
        AVG(json_extract(e.scores, '$.completeness.score'))        AS avg_completeness,
        AVG(json_extract(e.scores, '$.robustness.score'))          AS avg_robustness,
        AVG(json_extract(e.scores, '$.executability.score'))       AS avg_executability,
        AVG(json_extract(e.scores, '$.cost_awareness.score'))      AS avg_cost_awareness,
        AVG(json_extract(e.scores, '$.maintainability.score'))     AS avg_maintainability
      FROM skills s
      LEFT JOIN eval_history e ON e.skill_id = s.id AND e.status = 'success'
      WHERE s.root_dir NOT LIKE '%three-condition%'
        AND s.root_dir NOT LIKE '%evolved%'
        AND s.id NOT LIKE 'skill-noskill-%'
        AND s.id NOT LIKE 'skill-gen-%'
      GROUP BY s.id
      ORDER BY avg_total DESC NULLS LAST
    `).all() as Record<string, unknown>[]

    return rows.map((r) => {
      const trend = (db.prepare(`
        SELECT total_score FROM eval_history
        WHERE skill_id = ? AND status = 'success'
        ORDER BY created_at DESC LIMIT 8
      `).all(r.skill_id) as { total_score: number }[])
        .map(x => x.total_score)
        .reverse()

      return {
        skillId:                  r.skill_id as string,
        skillName:                (r.skill_name as string) ?? (r.skill_id as string),
        skillType:                ((r.skill_type as string) === 'agent' ? 'agent' : 'single') as import('../../shared/types').SkillType,
        evalCount:                (r.eval_count as number) ?? 0,
        avgTotal:                 (r.avg_total as number) ?? 0,
        avgCorrectness:           (r.avg_correctness as number) ?? 0,
        avgInstructionFollowing:  (r.avg_instruction_following as number) ?? 0,
        avgSafety:                (r.avg_safety as number) ?? 0,
        avgCompleteness:          (r.avg_completeness as number) ?? 0,
        avgRobustness:            (r.avg_robustness as number) ?? 0,
        avgExecutability:         (r.avg_executability as number) ?? 0,
        avgCostAwareness:         (r.avg_cost_awareness as number) ?? 0,
        avgMaintainability:       (r.avg_maintainability as number) ?? 0,
        trend
      }
    })
  })

  ipcMain.handle('eval:delete', (_event, evalId: string) => {
    const db = getDb()
    db.prepare('DELETE FROM eval_history WHERE id = ?').run(evalId)
  })

  ipcMain.handle('eval:getByJobId', (_event, jobId: string) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM eval_history
      WHERE COALESCE(job_id, id) = ?
      ORDER BY created_at ASC
    `).all(jobId) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id,
      skillId: r.skill_id,
      model: r.model,
      provider: r.provider,
      inputPrompt: r.input_prompt,
      output: r.output,
      scores: (() => { try { return JSON.parse(r.scores as string) } catch { return {} } })(),
      totalScore: r.total_score,
      durationMs: r.duration_ms,
      status: r.status,
      createdAt: r.created_at,
      testCaseId: (r.test_case_id as string) ?? undefined,
      testCaseName: (r.test_case_name as string) ?? undefined
    }))
  })

  ipcMain.handle('eval:deleteByJobId', (_event, jobId: string) => {
    const db = getDb()
    db.prepare(`DELETE FROM eval_history WHERE COALESCE(job_id, id) = ?`).run(jobId)
  })
}
