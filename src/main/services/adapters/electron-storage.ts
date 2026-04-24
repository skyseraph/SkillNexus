import type { Database } from 'better-sqlite3'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import type { ISkillStorage } from '../sdk/interfaces'
import type { EvolutionEngine } from '../../../shared/types'

export class ElectronSkillStorage implements ISkillStorage {
  constructor(
    private readonly db: Database,
    private readonly skillsDir: string,
  ) {}

  saveEvolvedSkill(params: {
    parentSkillId: string
    engine: EvolutionEngine
    generation?: number
    content: string
    namePrefix: string
  }): string {
    mkdirSync(this.skillsDir, { recursive: true })
    const now = Date.now()
    const filePath = resolve(join(this.skillsDir, `${params.engine}-${now}.md`))
    writeFileSync(filePath, params.content, 'utf-8')

    const skillId = `skill-${now}-${Math.random().toString(36).slice(2, 8)}`
    this.db.prepare(`
      INSERT INTO skills (id, name, format, version, tags, yaml_frontmatter, markdown_content, file_path, root_dir, skill_type, trust_level, parent_skill_id, evolution_engine, evolution_generation, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      skillId, `${params.namePrefix}-${now}`, 'markdown', '1.0.0', '[]', '',
      params.content, filePath, dirname(filePath), 'single', 1,
      params.parentSkillId, params.engine, params.generation ?? null, now, now
    )
    return skillId
  }

  copyTestCases(fromSkillId: string, toSkillId: string): void {
    const tcs = this.db.prepare(
      'SELECT name, input, judge_type, judge_param FROM test_cases WHERE skill_id = ? LIMIT 50'
    ).all(fromSkillId) as { name: unknown; input: string; judge_type: unknown; judge_param: unknown }[]

    for (const tc of tcs) {
      const tcId = `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      this.db.prepare(
        'INSERT INTO test_cases (id, skill_id, name, input, judge_type, judge_param, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(tcId, toSkillId, tc.name, tc.input, tc.judge_type, tc.judge_param, Date.now())
    }
  }
}
