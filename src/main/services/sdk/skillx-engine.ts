import { BaseEvolutionEngine } from './base-engine'
import { getLanguage } from '../../ipc/config.handler'
import type { SkillXResult, SkillXEntry } from '../../../shared/types'

const DEFAULT_MIN_SCORE = 7.0
const DEFAULT_SAMPLE_LIMIT = 10
const MIN_SAMPLES_REQUIRED = 3

interface SkillXConfig {
  skillId: string
  minScore?: number
  sampleLimit?: number
}

export class SkillXEngine extends BaseEvolutionEngine<SkillXConfig, SkillXResult> {
  private async extractEntries(skillContent: string, samplesText: string): Promise<SkillXEntry[]> {
    const langInstruction = getLanguage() === 'en'
      ? 'IMPORTANT: The "content" field of each entry MUST be written in English.'
      : 'IMPORTANT: The "content" field of each entry MUST be written in Chinese (简体中文).'
    const text = await this.callAI({
      systemPrompt: `You are a Skill knowledge extractor. Analyze successful skill execution examples and extract reusable skill patterns.
Classify each pattern into exactly one level:
- Level 1 (planning): Task decomposition strategies, step ordering, execution frameworks
- Level 2 (functional): Multi-step reusable subroutines, tool combinations
- Level 3 (atomic): Single-step best practices, constraints, guardrails

Output only valid JSON: {"entries": [{"level": 1|2|3, "levelName": "planning"|"functional"|"atomic", "content": "...", "sourceCount": number}]}
Extract 3–8 entries total. Focus on structural patterns, not task-specific details.
${langInstruction}`,
      userMessage: `Skill content:\n${skillContent}\n\nHigh-score execution examples:\n${samplesText}\n\nExtract skill patterns:`
    })
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return []
      const parsed = JSON.parse(jsonMatch[0]) as { entries: SkillXEntry[] }
      return Array.isArray(parsed.entries) ? parsed.entries : []
    } catch { return [] }
  }

  private async synthesizeSkill(skillContent: string, entries: SkillXEntry[]): Promise<string> {
    const patternsText = entries.map(e => `[L${e.level} ${e.levelName.toUpperCase()}] ${e.content}`).join('\n')
    const langSuffix = getLanguage() === 'en'
      ? ' Write all generated Skill content in English.'
      : ' 请用简体中文撰写所有生成的 Skill 内容。'
    return this.callAI({
      systemPrompt: `You are a Skill synthesizer. Given the original skill and extracted knowledge patterns, generate an improved skill that incorporates these patterns. Maintain the YAML frontmatter format. Output only the full improved skill content.${langSuffix}`,
      userMessage: `Original Skill:\n${skillContent}\n\nExtracted Knowledge Patterns:\n${patternsText}\n\nOutput the improved Skill:`
    })
  }

  async run(config: SkillXConfig): Promise<SkillXResult> {
    let minScore = config.minScore ?? DEFAULT_MIN_SCORE
    const sampleLimit = config.sampleLimit ?? DEFAULT_SAMPLE_LIMIT

    const skillRow = this.store.querySkill(config.skillId)
    if (!skillRow) throw new Error(`Skill ${config.skillId} not found`)

    let samples = this.store.queryEvalHistory(config.skillId, { status: 'success', limit: sampleLimit })
      .filter(r => r.total_score >= minScore)
    let attempts = 0
    while (samples.length < MIN_SAMPLES_REQUIRED && attempts < 3) {
      minScore -= 1.0
      samples = this.store.queryEvalHistory(config.skillId, { status: 'success', limit: sampleLimit })
        .filter(r => r.total_score >= minScore)
      attempts++
    }

    if (samples.length < MIN_SAMPLES_REQUIRED) {
      throw new Error(`Insufficient high-score samples: found ${samples.length}, need ≥ ${MIN_SAMPLES_REQUIRED}. Run more evaluations first.`)
    }

    const samplesText = samples.map((r, i) =>
      `[Sample ${i + 1}] Score: ${r.total_score.toFixed(1)}\nInput: ${r.input_prompt}\nOutput: ${r.output}`
    ).join('\n\n')

    const entries = await this.extractEntries(skillRow.markdown_content, samplesText)
    const evolvedContent = await this.synthesizeSkill(skillRow.markdown_content, entries)

    const evolvedSkillId = this.storage.saveEvolvedSkill({
      parentSkillId: config.skillId,
      engine: 'skillx',
      content: evolvedContent,
      namePrefix: 'SkillX'
    })

    return { entries, evolvedSkillId, evolvedContent, totalSourceSamples: samples.length }
  }
}
