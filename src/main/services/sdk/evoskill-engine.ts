import { BaseEvolutionEngine } from './base-engine'
import { runEvalJob } from '../eval-job'
import type { EvoSkillResult } from '../../../shared/types'

const MAX_FRONTIER = 5
const DEFAULT_ITERATIONS = 3

interface FrontierNode {
  skillId: string
  content: string
  avgScore: number
}

interface EvoSkillConfig {
  skillId: string
  maxIterations?: number
}

export class EvoSkillEngine extends BaseEvolutionEngine<EvoSkillConfig, EvoSkillResult> {
  private avgScoreForSkill(skillId: string): number {
    const rows = this.store.queryEvalHistory(skillId, { status: 'success', limit: 10 })
    if (rows.length === 0) return 0
    let total = 0; let count = 0
    for (const r of rows) {
      try {
        const s = JSON.parse(r.scores ?? '{}') as Record<string, { score: number }>
        const vals = Object.values(s)
        if (vals.length > 0) { total += vals.reduce((a, v) => a + v.score, 0) / vals.length; count++ }
      } catch { /* skip */ }
    }
    return count > 0 ? total / count : 0
  }

  private getWorstSamples(skillId: string, k = 3): string[] {
    const rows = this.store.queryEvalHistory(skillId, { status: 'success', orderBy: 'total_score ASC', limit: k })
    return rows.map(r => `Input: ${r.input_prompt}\nOutput: ${r.output}\nScore: ${r.total_score.toFixed(1)}`)
  }

  private async proposeImprovement(skillContent: string, worstSamples: string[]): Promise<string> {
    const samplesText = worstSamples.map((s, i) => `[Sample ${i + 1}]\n${s}`).join('\n\n')
    return this.callAI({
      systemPrompt: 'You are a Skill optimizer. Given a Skill and its worst-performing test samples, propose a targeted improvement. Output only the improved Skill content in full, maintaining the YAML frontmatter format.',
      userMessage: `Current Skill:\n${skillContent}\n\nWorst Performing Samples:\n${samplesText}\n\nOutput the improved Skill:`
    })
  }

  async run(config: EvoSkillConfig): Promise<EvoSkillResult> {
    const maxIter = config.maxIterations ?? DEFAULT_ITERATIONS
    const skillRow = this.store.querySkill(config.skillId)
    if (!skillRow) throw new Error(`Skill ${config.skillId} not found`)

    const testCases = this.store.queryTestCases(config.skillId)

    const frontier: FrontierNode[] = [{
      skillId: config.skillId,
      content: skillRow.markdown_content,
      avgScore: this.avgScoreForSkill(config.skillId)
    }]

    for (let iter = 1; iter <= maxIter; iter++) {
      this.reporter.report('studio:progress', { stage: 'evoskill', iteration: iter, total: maxIter })

      const base = frontier.reduce((a, b) => a.avgScore < b.avgScore ? a : b)
      const worstSamples = this.getWorstSamples(base.skillId)
      const candidateContent = await this.proposeImprovement(base.content, worstSamples)

      const candidateId = this.storage.saveEvolvedSkill({
        parentSkillId: config.skillId,
        engine: 'evoskill',
        generation: iter,
        content: candidateContent,
        namePrefix: 'EvoSkill-gen'
      })
      this.storage.copyTestCases(config.skillId, candidateId)

      if (testCases.length > 0) {
        await runEvalJob(`evo-skill-${candidateId}`, candidateId, candidateContent, testCases)
      }

      const candidateScore = this.avgScoreForSkill(candidateId)
      frontier.push({ skillId: candidateId, content: candidateContent, avgScore: candidateScore })
      if (frontier.length > MAX_FRONTIER) {
        const minIdx = frontier.reduce((mi, n, i) => n.avgScore < frontier[mi].avgScore ? i : mi, 0)
        frontier.splice(minIdx, 1)
      }
    }

    const best = frontier.reduce((a, b) => a.avgScore > b.avgScore ? a : b)
    this.reporter.report('studio:progress', { stage: 'evoskill', iteration: maxIter, total: maxIter, done: true })

    return {
      frontierIds: frontier.map(n => n.skillId),
      bestId: best.skillId,
      iterations: maxIter,
      finalAvgScore: best.avgScore
    }
  }
}
