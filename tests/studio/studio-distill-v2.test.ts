/**
 * tests/studio/studio-distill-v2.test.ts
 *
 * Pure logic tests for STD-01/02/03 (Studio distillation v2):
 * - recentEvalHistory SQL param construction (skillId filter, label filter)
 * - eval:setLabel label validation
 * - buildExtractPrompt: generic vs targeted prompt selection
 * - parentSkillId wiring in install
 * No Electron / DB / AI calls.
 */

import { describe, it, expect } from 'vitest'

// ── Mirrors studio.handler.ts recentEvalHistory SQL builder ──────────────────

type EvalRecord = {
  id: string
  skillId: string
  inputPrompt: string
  output: string
  label: string | null
  totalScore: number
  skillName: string
  skillContent: string
}

function buildHistoryQuery(
  limit: number,
  skillId?: string,
  labels?: string[]
): { sql: string; params: unknown[] } {
  const safeLimit = Math.min(limit || 20, 50)
  const validLabels = ['success', 'failure', 'edge_case']
  const filteredLabels = Array.isArray(labels) ? labels.filter(l => validLabels.includes(l)) : []

  let sql = `SELECT eh.id, eh.input_prompt, eh.output, eh.created_at, eh.label, eh.total_score,
             s.name as skill_name, s.markdown_content as skill_content
      FROM eval_history eh
      LEFT JOIN skills s ON s.id = eh.skill_id`
  const params: unknown[] = []
  const conditions: string[] = []

  if (skillId) {
    conditions.push('eh.skill_id = ?')
    params.push(skillId)
  }
  if (filteredLabels.length > 0) {
    conditions.push(`eh.label IN (${filteredLabels.map(() => '?').join(',')})`)
    params.push(...filteredLabels)
  }
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`
  sql += ` ORDER BY eh.created_at DESC LIMIT ?`
  params.push(safeLimit)

  return { sql, params }
}

// ── Mirrors eval.handler.ts setLabel validation ───────────────────────────────

function validateLabel(label: unknown): void {
  const allowed = ['success', 'failure', 'edge_case', null]
  if (!allowed.includes(label as string | null)) {
    throw new Error(`Invalid label: ${label}`)
  }
}

// ── Mirrors studio.handler.ts buildExtractPrompt ─────────────────────────────

const SKILL_FORMAT_HINT = `A Skill has this structure:\n---\nname: SkillName\n---\n# Description`

const EXTRACT_SYSTEM_PROMPT = `You are an expert Skill author. Analyze the conversation below and extract a reusable Skill ONLY if it contains stable, durable user preferences, constraints, or workflows that would benefit future interactions.\n\n${SKILL_FORMAT_HINT}\n\nRules:\n- If the conversation contains reusable patterns → output a complete Skill in the format above\n- If it's a one-off request with no durable value → output exactly: NO_SKILL\n- Prefer merging into an existing pattern over creating duplicates\n- Output ONLY the Skill content or NO_SKILL. No commentary.`

function buildExtractPrompt(sourceSkillContent?: string): string {
  if (!sourceSkillContent) return EXTRACT_SYSTEM_PROMPT
  return `You are an expert Skill author improving an existing Skill based on real usage evidence.\n\nThe source Skill is provided below. Analyze the conversation evidence and produce an IMPROVED version that addresses observed failure patterns and generalizes successful patterns.\n\n${SKILL_FORMAT_HINT}\n\nSource Skill:\n${sourceSkillContent}\n\nRules:\n- Output an improved version of the source Skill incorporating lessons from the evidence\n- Preserve what works; fix what fails; generalize edge cases into explicit instructions\n- If the evidence shows no actionable improvement → output exactly: NO_SKILL\n- Output ONLY the improved Skill content or NO_SKILL. No commentary.`
}

// ── In-memory filter (mirrors SQL WHERE logic for unit testing) ───────────────

function filterRecords(
  records: EvalRecord[],
  skillId?: string,
  labels?: string[]
): EvalRecord[] {
  const validLabels = ['success', 'failure', 'edge_case']
  const filteredLabels = Array.isArray(labels) ? labels.filter(l => validLabels.includes(l)) : []
  return records.filter(r => {
    if (skillId && r.skillId !== skillId) return false
    if (filteredLabels.length > 0 && !filteredLabels.includes(r.label ?? '')) return false
    return true
  })
}

// ── Test data ─────────────────────────────────────────────────────────────────

const RECORDS: EvalRecord[] = [
  { id: 'e1', skillId: 'skill-a', inputPrompt: 'q1', output: 'a1', label: 'success',   totalScore: 8, skillName: 'SkillA', skillContent: '# A' },
  { id: 'e2', skillId: 'skill-a', inputPrompt: 'q2', output: 'a2', label: 'failure',   totalScore: 3, skillName: 'SkillA', skillContent: '# A' },
  { id: 'e3', skillId: 'skill-a', inputPrompt: 'q3', output: 'a3', label: 'edge_case', totalScore: 6, skillName: 'SkillA', skillContent: '# A' },
  { id: 'e4', skillId: 'skill-b', inputPrompt: 'q4', output: 'a4', label: 'success',   totalScore: 9, skillName: 'SkillB', skillContent: '# B' },
  { id: 'e5', skillId: 'skill-b', inputPrompt: 'q5', output: 'a5', label: null,        totalScore: 5, skillName: 'SkillB', skillContent: '# B' },
]

// ── STD-01: skillId filter ────────────────────────────────────────────────────

describe('recentEvalHistory — skillId filter (STD-01)', () => {
  it('returns all records when no skillId given', () => {
    expect(filterRecords(RECORDS)).toHaveLength(5)
  })

  it('filters to only the specified skill', () => {
    const result = filterRecords(RECORDS, 'skill-a')
    expect(result).toHaveLength(3)
    expect(result.every(r => r.skillId === 'skill-a')).toBe(true)
  })

  it('returns empty when skillId has no records', () => {
    expect(filterRecords(RECORDS, 'skill-z')).toHaveLength(0)
  })

  it('SQL includes WHERE skill_id = ? when skillId provided', () => {
    const { sql, params } = buildHistoryQuery(10, 'skill-a')
    expect(sql).toContain('eh.skill_id = ?')
    expect(params).toContain('skill-a')
  })

  it('SQL has no WHERE clause when no skillId or labels', () => {
    const { sql } = buildHistoryQuery(10)
    expect(sql).not.toContain('WHERE')
  })

  it('limit is capped at 50', () => {
    const { params } = buildHistoryQuery(999)
    expect(params[params.length - 1]).toBe(50)
  })

  it('limit defaults to 20 when 0 passed', () => {
    const { params } = buildHistoryQuery(0)
    expect(params[params.length - 1]).toBe(20)
  })
})

// ── STD-02: label filter ──────────────────────────────────────────────────────

describe('recentEvalHistory — label filter (STD-02)', () => {
  it('returns only success records when filtered', () => {
    const result = filterRecords(RECORDS, undefined, ['success'])
    expect(result).toHaveLength(2)
    expect(result.every(r => r.label === 'success')).toBe(true)
  })

  it('returns success + failure when both selected', () => {
    const result = filterRecords(RECORDS, undefined, ['success', 'failure'])
    expect(result).toHaveLength(3)
  })

  it('excludes null-label records when any label filter active', () => {
    const result = filterRecords(RECORDS, undefined, ['success'])
    expect(result.some(r => r.label === null)).toBe(false)
  })

  it('returns all records when labels array is empty', () => {
    expect(filterRecords(RECORDS, undefined, [])).toHaveLength(5)
  })

  it('strips invalid labels silently', () => {
    const { sql, params } = buildHistoryQuery(10, undefined, ['success', 'invalid_label'])
    expect(sql).toContain('eh.label IN (?)')
    expect(params).toContain('success')
    expect(params).not.toContain('invalid_label')
  })

  it('combines skillId + label filter correctly', () => {
    const result = filterRecords(RECORDS, 'skill-a', ['success'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e1')
  })

  it('SQL includes both conditions when skillId and labels provided', () => {
    const { sql, params } = buildHistoryQuery(10, 'skill-a', ['success', 'failure'])
    expect(sql).toContain('eh.skill_id = ?')
    expect(sql).toContain('eh.label IN (?,?)')
    expect(params).toContain('skill-a')
    expect(params).toContain('success')
    expect(params).toContain('failure')
  })
})

// ── STD-02: eval:setLabel validation ─────────────────────────────────────────

describe('eval:setLabel — label validation', () => {
  it('accepts "success"', () => {
    expect(() => validateLabel('success')).not.toThrow()
  })

  it('accepts "failure"', () => {
    expect(() => validateLabel('failure')).not.toThrow()
  })

  it('accepts "edge_case"', () => {
    expect(() => validateLabel('edge_case')).not.toThrow()
  })

  it('accepts null (clear label)', () => {
    expect(() => validateLabel(null)).not.toThrow()
  })

  it('rejects arbitrary strings', () => {
    expect(() => validateLabel('good')).toThrow('Invalid label')
    expect(() => validateLabel('bad')).toThrow('Invalid label')
  })

  it('rejects empty string', () => {
    expect(() => validateLabel('')).toThrow('Invalid label')
  })

  it('rejects undefined', () => {
    expect(() => validateLabel(undefined)).toThrow('Invalid label')
  })
})

// ── STD-03: buildExtractPrompt — targeted vs generic ─────────────────────────

describe('buildExtractPrompt — prompt selection (STD-03)', () => {
  it('returns generic prompt when no source skill provided', () => {
    const prompt = buildExtractPrompt()
    expect(prompt).toContain('extract a reusable Skill')
    expect(prompt).not.toContain('Source Skill:')
  })

  it('returns generic prompt when undefined passed', () => {
    const prompt = buildExtractPrompt(undefined)
    expect(prompt).toContain('extract a reusable Skill')
  })

  it('returns targeted prompt when source skill content provided', () => {
    const prompt = buildExtractPrompt('# My Source Skill\n\nDo things.')
    expect(prompt).toContain('Source Skill:')
    expect(prompt).toContain('# My Source Skill')
    expect(prompt).toContain('IMPROVED version')
  })

  it('targeted prompt still includes NO_SKILL sentinel rule', () => {
    const prompt = buildExtractPrompt('# Source')
    expect(prompt).toContain('NO_SKILL')
  })

  it('generic prompt includes NO_SKILL sentinel rule', () => {
    const prompt = buildExtractPrompt()
    expect(prompt).toContain('NO_SKILL')
  })

  it('targeted prompt embeds the full source skill content', () => {
    const content = '---\nname: TestSkill\n---\n# Do the thing'
    const prompt = buildExtractPrompt(content)
    expect(prompt).toContain('name: TestSkill')
    expect(prompt).toContain('# Do the thing')
  })

  it('targeted prompt instructs to preserve working parts', () => {
    const prompt = buildExtractPrompt('# Source')
    expect(prompt).toContain('Preserve what works')
  })
})

// ── STD-03: parentSkillId in install ─────────────────────────────────────────

describe('studio:install — parentSkillId wiring (STD-03)', () => {
  function buildInsertParams(
    id: string, name: string, parentSkillId?: string
  ): unknown[] {
    // Mirrors the VALUES order in studio.handler.ts
    return [id, name, 'markdown', '1.0.0', '[]', '', '# content', '/path/skill.md', '/path', 'single', 1, 1000, 1000, parentSkillId ?? null]
  }

  it('sets parent_skill_id to null when not provided', () => {
    const params = buildInsertParams('skill-1', 'test')
    expect(params[params.length - 1]).toBeNull()
  })

  it('sets parent_skill_id to provided value', () => {
    const params = buildInsertParams('skill-2', 'test', 'skill-original')
    expect(params[params.length - 1]).toBe('skill-original')
  })

  it('null-coalesces undefined to null', () => {
    const parentSkillId: string | undefined = undefined
    const params = buildInsertParams('skill-3', 'test', parentSkillId)
    expect(params[params.length - 1]).toBeNull()
  })

  it('preserves arbitrary skill id strings', () => {
    const params = buildInsertParams('skill-4', 'test', 'skill-1234567890-abc')
    expect(params[params.length - 1]).toBe('skill-1234567890-abc')
  })
})
