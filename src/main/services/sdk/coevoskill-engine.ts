import { BaseEvolutionEngine } from './base-engine'
import type { CoEvoResult } from '../../../shared/types'

const DEFAULT_MAX_ROUNDS = 5
const ESCALATION_THRESHOLDS = { level1: 0.6, level2: 0.8 }

type EscalationLevel = 1 | 2 | 3

interface CoEvoConfig {
  skillId: string
  maxRounds?: number
}

function escalationHint(level: EscalationLevel): string {
  if (level === 1) return 'Basic test cases: straightforward inputs with clear expected outputs.'
  if (level === 2) return 'Edge cases: boundary inputs, empty strings, large inputs, unusual but valid inputs.'
  return 'Adversarial cases: ambiguous instructions, conflicting constraints, inputs designed to expose skill weaknesses.'
}

export class CoEvoSkillEngine extends BaseEvolutionEngine<CoEvoConfig, CoEvoResult> {
  private async runVerifier(skillContent: string, testCases: string[], level: EscalationLevel): Promise<{ feedback: string; passRate: number }> {
    const hint = escalationHint(level)
    const casesText = testCases.map((tc, i) => `[TC${i + 1}] ${tc}`).join('\n')
    const text = await this.callAI({
      systemPrompt: 'You are a Skill Verifier. Evaluate the Skill against test cases. For each test case respond only PASS or FAIL. Then provide brief feedback on failures. Do not reveal correct answers.',
      userMessage: `Skill:\n${skillContent}\n\nTest Escalation: ${hint}\n\nTest Cases:\n${casesText}\n\nFormat: list each result as "TC1: PASS/FAIL" then a Feedback section.`
    })
    const passCount = (text.match(/:\s*PASS/gi) ?? []).length
    const totalCount = (text.match(/:\s*(PASS|FAIL)/gi) ?? []).length
    const passRate = totalCount > 0 ? passCount / totalCount : 0
    const feedbackMatch = text.match(/Feedback[:\s]+([\s\S]*)/i)
    return { feedback: feedbackMatch ? feedbackMatch[1].trim() : text, passRate }
  }

  private async runGenerator(skillContent: string, feedback: string, level: EscalationLevel): Promise<string> {
    return this.callAI({
      systemPrompt: 'You are a Skill Generator. Improve the given Skill based on Verifier feedback. Output only the full improved Skill content.',
      userMessage: `Current Skill:\n${skillContent}\n\nVerifier Feedback:\n${feedback}\n\nTest Escalation Level: ${escalationHint(level)}\n\nOutput the improved Skill:`
    })
  }

  async run(config: CoEvoConfig): Promise<CoEvoResult> {
    const maxRounds = config.maxRounds ?? DEFAULT_MAX_ROUNDS
    const skillRow = this.store.querySkill(config.skillId)
    if (!skillRow) throw new Error(`Skill ${config.skillId} not found`)

    const testCases = this.store.queryTestCases(config.skillId).map(r => r.input)
    if (testCases.length === 0) {
      return { evolvedContent: skillRow.markdown_content, escalationLevel: 1, rounds: 0, passedAll: false }
    }

    let content = skillRow.markdown_content
    let escalationLevel: EscalationLevel = 1
    let lastPassRate = 0
    let feedback = ''

    for (let round = 1; round <= maxRounds; round++) {
      const verResult = await this.runVerifier(content, testCases, escalationLevel)
      lastPassRate = verResult.passRate
      feedback = verResult.feedback

      if (verResult.passRate >= 1.0 && escalationLevel === 3) {
        return { evolvedContent: content, escalationLevel, rounds: round, passedAll: true }
      }
      if (verResult.passRate >= ESCALATION_THRESHOLDS.level2 && escalationLevel < 3) {
        escalationLevel = (escalationLevel + 1) as EscalationLevel
      }

      const currentLevel: EscalationLevel = lastPassRate < ESCALATION_THRESHOLDS.level1 ? 1 : lastPassRate < ESCALATION_THRESHOLDS.level2 ? 2 : 3
      content = await this.runGenerator(content, feedback, currentLevel)
    }

    return { evolvedContent: content, escalationLevel, rounds: maxRounds, passedAll: lastPassRate >= 1.0 }
  }
}
