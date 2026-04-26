import { BaseEvolutionEngine } from './base-engine'
import { getLanguage } from '../../ipc/config.handler'
import type { SkillClawResult } from '../../../shared/types'

const DEFAULT_WINDOW_SIZE = 20
const DEFAULT_MIN_FAIL_COUNT = 2
const WEAK_SCORE_THRESHOLD = 6.0
const GOOD_SCORE_THRESHOLD = 8.0

interface SkillClawConfig {
  skillId: string
  windowSize?: number
  minFailCount?: number
}

export class SkillClawEngine extends BaseEvolutionEngine<SkillClawConfig, SkillClawResult> {
  private async analyzePatterns(
    skillContent: string,
    allRecords: { input_prompt: string; output: string; total_score: number; status: string }[],
    weakRecords: { input_prompt: string; output: string; total_score: number; status: string }[]
  ): Promise<{ commonFailures: string[]; improvementSummary: string }> {
    const fmt = (r: typeof allRecords[0]) =>
      `[${r.status === 'success' ? r.total_score.toFixed(1) : 'FAIL'}] Input: ${r.input_prompt}\nOutput: ${r.output}`
    const text = await this.callAI({
      systemPrompt: `You are a collective failure pattern analyzer. Identify recurring weakness patterns across multiple skill execution samples.
Focus on structural skill deficiencies (not one-off input quirks). Look for patterns that appear in multiple samples.
Output only valid JSON: {"commonFailures": ["pattern 1", "pattern 2", ...], "improvementSummary": "one paragraph summary"}
List 2–5 common failure patterns. Be specific about the structural skill weakness, not the input content.
IMPORTANT: The "commonFailures" and "improvementSummary" fields MUST be written in ${getLanguage() === 'en' ? 'English' : 'Chinese (简体中文)'}.`,
      userMessage: `Skill content:\n${skillContent}\n\nAll recent execution samples (${allRecords.length} total):\n${allRecords.map(fmt).join('\n\n')}\n\nFailed/weak samples (score < ${WEAK_SCORE_THRESHOLD}):\n${weakRecords.map(fmt).join('\n\n')}\n\nIdentify common failure patterns:`
    })
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { commonFailures: ['Pattern analysis failed'], improvementSummary: text.slice(0, 200) }
      const parsed = JSON.parse(jsonMatch[0]) as { commonFailures: string[]; improvementSummary: string }
      return {
        commonFailures: Array.isArray(parsed.commonFailures) ? parsed.commonFailures : [],
        improvementSummary: parsed.improvementSummary ?? ''
      }
    } catch { return { commonFailures: ['Unable to parse patterns'], improvementSummary: '' } }
  }

  private async generateImprovedSkill(skillContent: string, commonFailures: string[]): Promise<string> {
    return this.callAI({
      systemPrompt: 'You are a Skill improver. Fix the identified recurring failure patterns in the skill. Make targeted, surgical changes. Maintain the YAML frontmatter format. Output only the full improved skill content.',
      userMessage: `Skill:\n${skillContent}\n\nCommon failure patterns to fix:\n${commonFailures.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nOutput improved Skill:`
    })
  }

  async run(config: SkillClawConfig): Promise<SkillClawResult> {
    const windowSize = config.windowSize ?? DEFAULT_WINDOW_SIZE
    const minFailCount = config.minFailCount ?? DEFAULT_MIN_FAIL_COUNT

    const skillRow = this.store.querySkill(config.skillId)
    if (!skillRow) throw new Error(`Skill ${config.skillId} not found`)

    this.reporter.report('studio:progress', { stage: 'skillclaw', step: 1, total: 4, message: '加载历史记录...' })

    const allRecords = this.store.queryEvalHistory(config.skillId, { limit: windowSize })
    if (allRecords.length === 0) throw new Error('No eval history found. Run evaluations first.')

    const successRecords = allRecords.filter(r => r.status === 'success')
    const avgScore = successRecords.length > 0
      ? successRecords.reduce((s, r) => s + r.total_score, 0) / successRecords.length
      : 0
    const weakRecords = allRecords.filter(r => r.total_score < WEAK_SCORE_THRESHOLD || r.status !== 'success')

    if (weakRecords.length < minFailCount && avgScore >= GOOD_SCORE_THRESHOLD) {
      return {
        sessionsAnalyzed: allRecords.length,
        commonFailures: [],
        evolvedSkillId: '',
        evolvedContent: '',
        improvementSummary: `Skill 表现良好（均分 ${avgScore.toFixed(1)}），暂无需聚合进化。`
      }
    }

    this.reporter.report('studio:progress', { stage: 'skillclaw', step: 2, total: 4, message: '识别共同失败模式...' })
    const { commonFailures, improvementSummary } = await this.analyzePatterns(skillRow.markdown_content, allRecords, weakRecords)

    this.reporter.report('studio:progress', { stage: 'skillclaw', step: 3, total: 4, message: '生成改进版 Skill...' })
    const evolvedContent = await this.generateImprovedSkill(skillRow.markdown_content, commonFailures)

    const evolvedSkillId = this.storage.saveEvolvedSkill({
      parentSkillId: config.skillId,
      engine: 'skillclaw',
      content: evolvedContent,
      namePrefix: 'SkillClaw'
    })

    this.reporter.report('studio:progress', { stage: 'skillclaw', step: 4, total: 4, message: '完成', done: true })

    return { sessionsAnalyzed: allRecords.length, commonFailures, evolvedSkillId, evolvedContent, improvementSummary }
  }
}
