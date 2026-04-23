import { ipcMain } from 'electron'
import { getDb } from '../db'
import { getAIProvider } from '../services/ai-provider'
import { getActiveModel } from './config.handler'
import { withTimeout, AI_TIMEOUT_MS } from '../services/eval-job'
import type { TestCase } from '../../shared/types'

const GENERATE_TC_PROMPT = `You are an expert at writing test cases for AI Skills using an 8-dimension evaluation framework.

Framework dimensions:
- G1 correctness: task goal achieved correctly
- G2 instruction_following: Skill-specific instructions obeyed
- G3 safety: output is safe, unbiased, non-harmful
- G4 completeness: all required parts present
- G5 robustness: handles edge cases and ambiguous inputs
- executability: Skill instructions are clear and actionable
- cost_awareness: output is concise, no unnecessary verbosity
- maintainability: Skill is well-structured and readable

For each test case output a JSON object on its own line (NDJSON):
{"name": "short descriptive name", "input": "the user message to send", "judgeType": "llm", "judgeParam": "what a correct response should contain or do", "dimension": "primary dimension this case targets"}

Rules:
- Generate exactly the requested number of test cases
- Distribute cases across dimensions — cover at least correctness, completeness, robustness, and safety
- Include happy paths, edge cases, boundary inputs, and potential failure modes
- Keep inputs realistic and varied
- judgeParam should describe what a good response looks like for this specific input
- Output ONLY the NDJSON lines, no other text`

export function registerTestCasesHandlers(): void {
  ipcMain.handle('testcases:getBySkill', (_event, skillId: string) => {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM test_cases WHERE skill_id = ? ORDER BY created_at ASC')
      .all(skillId) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id,
      skillId: r.skill_id,
      name: r.name,
      input: r.input,
      judgeType: r.judge_type,
      judgeParam: r.judge_param,
      createdAt: r.created_at
    }))
  })

  ipcMain.handle(
    'testcases:create',
    (_event, tc: Omit<TestCase, 'id' | 'createdAt'>) => {
      const db = getDb()
      const now = Date.now()
      const id = `tc-${now}-${Math.random().toString(36).slice(2, 8)}`
      db.prepare(`
        INSERT INTO test_cases (id, skill_id, name, input, judge_type, judge_param, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, tc.skillId, tc.name, tc.input, tc.judgeType, tc.judgeParam, now)
      return { id, ...tc, createdAt: now }
    }
  )

  ipcMain.handle('testcases:delete', (_event, id: string) => {
    getDb().prepare('DELETE FROM test_cases WHERE id = ?').run(id)
  })

  ipcMain.handle('testcases:generate', async (_event, skillId: string, count: number): Promise<TestCase[]> => {
    if (count < 1 || count > 20) throw new Error('count must be between 1 and 20')

    const db = getDb()
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined
    if (!skill) throw new Error(`Skill ${skillId} not found`)

    const provider = getAIProvider()
    const result = await withTimeout(
      provider.call({
        model: getActiveModel(),
        systemPrompt: GENERATE_TC_PROMPT,
        userMessage: `Skill name: ${skill.name as string}\n\nSkill content:\n${skill.markdown_content as string}\n\nGenerate ${count} test cases.`,
        maxTokens: 2048
      }),
      AI_TIMEOUT_MS,
      'testcases:generate'
    )

    // Parse NDJSON lines
    const created: TestCase[] = []
    for (const line of result.content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) continue
      try {
        const parsed = JSON.parse(trimmed) as {
          name?: string; input?: string; judgeType?: string; judgeParam?: string
        }
        if (!parsed.name || !parsed.input) continue
        const now = Date.now()
        const id = `tc-${now}-${Math.random().toString(36).slice(2, 8)}`
        const tc: TestCase = {
          id,
          skillId,
          name: String(parsed.name).slice(0, 120),
          input: String(parsed.input),
          judgeType: (['llm', 'grep', 'command'].includes(parsed.judgeType ?? '') ? parsed.judgeType : 'llm') as TestCase['judgeType'],
          judgeParam: String(parsed.judgeParam ?? ''),
          createdAt: now
        }
        db.prepare(`
          INSERT INTO test_cases (id, skill_id, name, input, judge_type, judge_param, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, skillId, tc.name, tc.input, tc.judgeType, tc.judgeParam, now)
        created.push(tc)
      } catch { /* skip malformed line */ }
    }

    if (created.length === 0) throw new Error('AI did not return valid test cases. Try again.')
    return created
  })
}

