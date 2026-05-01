/**
 * tests/studio/studio-analysis.test.ts
 *
 * Pure logic tests for Studio generation analysis:
 * - ANALYSIS block parsing (rootCause, generalityTest, regressionRisk)
 * - ANALYSIS block stripping from final skill content
 * - 5D scoring response parsing
 * - Studio discovery data structure validation
 * No Electron / AI calls.
 */

import { describe, it, expect } from 'vitest'

// ── ANALYSIS block helpers (mirrors studio.handler.ts / EvoPage.tsx) ─────────

function stripAnalysisBlock(content: string): string {
  return content.replace(/<!--ANALYSIS[\s\S]*?-->\s*/m, '')
}

function parseAnalysisBlock(content: string): {
  rootCause: string
  generalityTest: string
  regressionRisk: string
  improvementPriority?: string
} | null {
  const match = content.match(/<!--ANALYSIS\s*([\s\S]*?)-->/)
  if (!match) return null
  const body = match[1]
  const rootCause      = body.match(/ROOT_CAUSE:\s*(.+)/)?.[1]?.trim() ?? ''
  const generalityTest = body.match(/GENERALITY_TEST:\s*(.+)/)?.[1]?.trim() ?? ''
  const regressionRisk = body.match(/REGRESSION_RISK:\s*(.+)/)?.[1]?.trim() ?? ''
  const improvementPriority = body.match(/IMPROVEMENT_PRIORITY:\s*(.+)/)?.[1]?.trim()
  if (!rootCause && !generalityTest && !regressionRisk) return null
  return { rootCause, generalityTest, regressionRisk, ...(improvementPriority ? { improvementPriority } : {}) }
}

// ── 5D scoreSkill response parsing ───────────────────────────────────────────

interface SkillScore5D {
  safety: number
  completeness: number
  executability: number
  maintainability: number
  costAwareness: number
}

function parseScoreResponse(text: string): SkillScore5D | null {
  try {
    // LLM returns JSON block; extract from ```json...``` or raw JSON
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ?? text.match(/({[\s\S]*})/)
    if (!jsonMatch) return null
    const obj = JSON.parse(jsonMatch[1])
    return {
      safety:         Number(obj.safety ?? 0),
      completeness:   Number(obj.completeness ?? 0),
      executability:  Number(obj.executability ?? 0),
      maintainability: Number(obj.maintainability ?? 0),
      costAwareness:  Number(obj.costAwareness ?? obj.cost_awareness ?? 0)
    }
  } catch {
    return null
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('stripAnalysisBlock', () => {
  it('removes ANALYSIS comment block', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: vague\n-->\n# Skill\nDo stuff.`
    expect(stripAnalysisBlock(content)).toBe('# Skill\nDo stuff.')
  })

  it('removes trailing whitespace after ANALYSIS block', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: x\n-->\n\n# Skill`
    // The regex \s* after --> should consume the blank line
    const result = stripAnalysisBlock(content)
    expect(result.startsWith('# Skill')).toBe(true)
  })

  it('leaves content unchanged when no ANALYSIS block present', () => {
    const content = '# Skill\nNo analysis here.'
    expect(stripAnalysisBlock(content)).toBe(content)
  })

  it('handles multiline ANALYSIS block', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: x\nGENERALITY_TEST: y\nREGRESSION_RISK: z\n-->\n# Skill`
    expect(stripAnalysisBlock(content)).toBe('# Skill')
  })

  it('does not strip regular HTML comments', () => {
    const content = '<!-- not analysis -->\n# Body'
    // Regular HTML comment without ANALYSIS keyword is untouched
    expect(stripAnalysisBlock(content)).toBe(content)
  })
})

describe('parseAnalysisBlock', () => {
  it('extracts all three fields from a complete block', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: vague instructions\nGENERALITY_TEST: passes 3/5\nREGRESSION_RISK: low\n-->`
    const result = parseAnalysisBlock(content)
    expect(result).not.toBeNull()
    expect(result!.rootCause).toBe('vague instructions')
    expect(result!.generalityTest).toBe('passes 3/5')
    expect(result!.regressionRisk).toBe('low')
  })

  it('returns null when no ANALYSIS block is present', () => {
    expect(parseAnalysisBlock('# Skill\nDo stuff.')).toBeNull()
  })

  it('returns empty strings for missing fields', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: only root cause\n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.generalityTest).toBe('')
    expect(result!.regressionRisk).toBe('')
  })

  it('trims whitespace from field values', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE:   leading spaces   \n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.rootCause).toBe('leading spaces')
  })

  it('works when ANALYSIS block precedes frontmatter', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: clarity issue\nGENERALITY_TEST: ok\nREGRESSION_RISK: medium\n-->\n---\nname: Evolved\n---\n# Body`
    const result = parseAnalysisBlock(content)
    expect(result!.rootCause).toBe('clarity issue')
  })

  it('regression risk "low" indicates safe evolution', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: x\nGENERALITY_TEST: y\nREGRESSION_RISK: low\n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.regressionRisk.toLowerCase()).toBe('low')
  })

  it('regression risk "high" indicates risky evolution', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: x\nGENERALITY_TEST: y\nREGRESSION_RISK: high — core behavior changed\n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.regressionRisk.toLowerCase()).toContain('high')
  })

  it('extracts IMPROVEMENT_PRIORITY when present', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: vague steps\nGENERALITY_TEST: ok\nREGRESSION_RISK: low\nIMPROVEMENT_PRIORITY: P2 — add specific input/output spec\n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.improvementPriority).toBe('P2 — add specific input/output spec')
  })

  it('leaves improvementPriority undefined when field is absent', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: x\nGENERALITY_TEST: y\nREGRESSION_RISK: low\n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.improvementPriority).toBeUndefined()
  })

  it('correctly identifies P0 priority prefix', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: x\nGENERALITY_TEST: y\nREGRESSION_RISK: low\nIMPROVEMENT_PRIORITY: P0 — output deviates from intent\n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.improvementPriority?.startsWith('P0')).toBe(true)
  })

  it('correctly identifies P1 priority prefix', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: x\nGENERALITY_TEST: y\nREGRESSION_RISK: low\nIMPROVEMENT_PRIORITY: P1 — missing trigger words in frontmatter\n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.improvementPriority?.startsWith('P1')).toBe(true)
  })

  it('correctly identifies P3 priority (readability)', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: x\nGENERALITY_TEST: y\nREGRESSION_RISK: low\nIMPROVEMENT_PRIORITY: P3 — paragraphs too long, needs TL;DR\n-->`
    const result = parseAnalysisBlock(content)
    expect(result!.improvementPriority?.startsWith('P3')).toBe(true)
  })

  it('old-format block without IMPROVEMENT_PRIORITY still parses correctly', () => {
    const content = `<!--ANALYSIS\nROOT_CAUSE: clarity issue\nGENERALITY_TEST: ok\nREGRESSION_RISK: medium\n-->\n---\nname: Evolved\n---\n# Body`
    const result = parseAnalysisBlock(content)
    expect(result!.rootCause).toBe('clarity issue')
    expect(result!.improvementPriority).toBeUndefined()
  })
})

describe('5D score response parsing', () => {
  it('parses JSON block from markdown code fence', () => {
    const text = `\`\`\`json\n{"safety":8,"completeness":9,"executability":7,"maintainability":8,"costAwareness":6}\n\`\`\``
    const result = parseScoreResponse(text)
    expect(result).not.toBeNull()
    expect(result!.safety).toBe(8)
    expect(result!.completeness).toBe(9)
    expect(result!.executability).toBe(7)
    expect(result!.maintainability).toBe(8)
    expect(result!.costAwareness).toBe(6)
  })

  it('parses raw JSON without fences', () => {
    const text = `{"safety":7,"completeness":8,"executability":9,"maintainability":7,"costAwareness":8}`
    const result = parseScoreResponse(text)
    expect(result).not.toBeNull()
    expect(result!.safety).toBe(7)
  })

  it('returns null for non-JSON text', () => {
    expect(parseScoreResponse('No score here')).toBeNull()
    expect(parseScoreResponse('')).toBeNull()
  })

  it('all 5 dimensions are present in result', () => {
    const text = `{"safety":8,"completeness":8,"executability":8,"maintainability":8,"costAwareness":8}`
    const result = parseScoreResponse(text)
    expect(result).toHaveProperty('safety')
    expect(result).toHaveProperty('completeness')
    expect(result).toHaveProperty('executability')
    expect(result).toHaveProperty('maintainability')
    expect(result).toHaveProperty('costAwareness')
  })

  it('accepts cost_awareness snake_case alias', () => {
    const text = `{"safety":7,"completeness":7,"executability":7,"maintainability":7,"cost_awareness":9}`
    const result = parseScoreResponse(text)
    expect(result!.costAwareness).toBe(9)
  })

  it('defaults missing fields to 0', () => {
    const text = `{"safety":8}`
    const result = parseScoreResponse(text)
    expect(result!.completeness).toBe(0)
    expect(result!.executability).toBe(0)
  })
})
