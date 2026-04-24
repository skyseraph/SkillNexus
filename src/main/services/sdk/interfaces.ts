import type { EvolutionEngine } from '../../../shared/types'

export interface EvalRecord {
  input_prompt: string
  output: string
  total_score: number
  status: string
  scores?: string
}

export interface SkillRecord {
  id: string
  name: string
  version: string
  markdown_content: string
  skill_type: string
}

export interface TestCaseRecord {
  id: string
  name: unknown
  input: string
  judge_type: unknown
  judge_param: unknown
}

export interface IDataStore {
  queryEvalHistory(skillId: string, opts?: { status?: string; limit?: number; orderBy?: string }): EvalRecord[]
  querySkill(skillId: string): SkillRecord | undefined
  queryTestCases(skillId: string, limit?: number): TestCaseRecord[]
  querySkillChain(rootId: string, limit?: number): SkillRecord[]
}

export interface IProgressReporter {
  report(event: string, data: Record<string, unknown>): void
}

export interface ISkillStorage {
  saveEvolvedSkill(params: {
    parentSkillId: string
    engine: EvolutionEngine
    generation?: number
    content: string
    namePrefix: string
  }): string
  copyTestCases(fromSkillId: string, toSkillId: string): void
}
