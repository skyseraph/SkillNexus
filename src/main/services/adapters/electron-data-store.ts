import type { Database } from 'better-sqlite3'
import type { IDataStore, EvalRecord, SkillRecord, TestCaseRecord } from '../sdk/interfaces'

export class ElectronDataStore implements IDataStore {
  constructor(private readonly db: Database) {}

  queryEvalHistory(skillId: string, opts: { status?: string; limit?: number; orderBy?: string } = {}): EvalRecord[] {
    const { status, limit = 50, orderBy = 'created_at DESC' } = opts
    if (status) {
      return this.db.prepare(
        `SELECT input_prompt, output, total_score, status, scores FROM eval_history WHERE skill_id = ? AND status = ? ORDER BY ${orderBy} LIMIT ?`
      ).all(skillId, status, limit) as EvalRecord[]
    }
    return this.db.prepare(
      `SELECT input_prompt, output, total_score, status, scores FROM eval_history WHERE skill_id = ? ORDER BY ${orderBy} LIMIT ?`
    ).all(skillId, limit) as EvalRecord[]
  }

  querySkill(skillId: string): SkillRecord | undefined {
    return this.db.prepare(
      'SELECT id, name, version, markdown_content, skill_type FROM skills WHERE id = ?'
    ).get(skillId) as SkillRecord | undefined
  }

  queryTestCases(skillId: string, limit = 50): TestCaseRecord[] {
    return this.db.prepare(
      'SELECT id, name, input, judge_type, judge_param FROM test_cases WHERE skill_id = ? LIMIT ?'
    ).all(skillId, limit) as TestCaseRecord[]
  }

  querySkillChain(rootId: string, limit = 50): SkillRecord[] {
    return this.db.prepare(`
      WITH RECURSIVE chain(id, name, version, markdown_content, skill_type) AS (
        SELECT id, name, version, markdown_content, skill_type FROM skills WHERE id = ?
        UNION ALL
        SELECT s.id, s.name, s.version, s.markdown_content, s.skill_type
        FROM skills s INNER JOIN chain c ON s.parent_skill_id = c.id
      )
      SELECT id, name, version, markdown_content, skill_type FROM chain LIMIT ?
    `).all(rootId, limit) as SkillRecord[]
  }
}
