import { ipcMain } from 'electron'
import { getDb } from '../db'
import type { TestCase } from '../../shared/types'

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
    const db = getDb()
    db.prepare('DELETE FROM test_cases WHERE id = ?').run(id)
  })
}
