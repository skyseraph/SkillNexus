/**
 * tests/studio/studio-agent-skill.test.ts
 *
 * Pure logic tests for Agent Skill support in studio:scoreSkill:
 * - isAgent detection from frontmatter (skill_type: agent)
 * - Agent score shape: orchestration present, costAwareness absent
 * - Single skill score shape: costAwareness present, orchestration absent
 * - Score clamping (0-10) for both types
 * - Fallback on malformed JSON
 * No Electron / AI calls.
 */

import { describe, it, expect } from 'vitest'

// ── Mirrors studio.handler.ts scoreSkill logic ────────────────────────────────

interface SkillScore5D {
  safety: number
  completeness: number
  executability: number
  maintainability: number
  costAwareness: number
  orchestration?: number
}

function isAgentSkill(content: string): boolean {
  return /^---[\s\S]*?skill_type:\s*agent/m.test(content)
}

function clamp(v: unknown): number {
  return Math.min(10, Math.max(0, Number(v) || 0))
}

function parseScore5D(jsonStr: string, agentSkill: boolean): SkillScore5D {
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, number>
    if (agentSkill) {
      return {
        safety:          clamp(parsed.safety),
        completeness:    clamp(parsed.completeness),
        executability:   clamp(parsed.executability),
        maintainability: clamp(parsed.maintainability),
        costAwareness:   0,
        orchestration:   clamp(parsed.orchestration)
      }
    }
    return {
      safety:          clamp(parsed.safety),
      completeness:    clamp(parsed.completeness),
      executability:   clamp(parsed.executability),
      maintainability: clamp(parsed.maintainability),
      costAwareness:   clamp(parsed.costAwareness)
    }
  } catch {
    return { safety: 5, completeness: 5, executability: 5, maintainability: 5, costAwareness: 5 }
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AGENT_FRONTMATTER = `---
name: pr-review-agent
version: 1.0.0
skill_type: agent
tags: [agent, pr, review]
---

# PR Review Agent`

const SINGLE_FRONTMATTER = `---
name: commit-message
version: 1.0.0
format: markdown
tags: [git, commit]
---

# Commit Message Generator`

const NO_FRONTMATTER = `# Just a heading\n\nSome content.`

// ── isAgentSkill detection ────────────────────────────────────────────────────

describe('isAgentSkill — frontmatter detection', () => {
  it('detects agent skill from skill_type: agent', () => {
    expect(isAgentSkill(AGENT_FRONTMATTER)).toBe(true)
  })

  it('returns false for single skill (no skill_type field)', () => {
    expect(isAgentSkill(SINGLE_FRONTMATTER)).toBe(false)
  })

  it('returns false for content without frontmatter', () => {
    expect(isAgentSkill(NO_FRONTMATTER)).toBe(false)
  })

  it('returns false for skill_type: single', () => {
    const content = `---\nname: test\nskill_type: single\n---\n# Test`
    expect(isAgentSkill(content)).toBe(false)
  })

  it('detects agent skill regardless of field order in frontmatter', () => {
    const content = `---\ntags: [agent]\nname: test\nskill_type: agent\nversion: 1.0.0\n---\n# Test`
    expect(isAgentSkill(content)).toBe(true)
  })

  it('is case-sensitive — skill_type: Agent (capital A) is not detected', () => {
    const content = `---\nname: test\nskill_type: Agent\n---\n# Test`
    expect(isAgentSkill(content)).toBe(false)
  })

  it('returns false for empty content', () => {
    expect(isAgentSkill('')).toBe(false)
  })
})

// ── parseScore5D — agent skill shape ─────────────────────────────────────────

describe('parseScore5D — agent skill score shape', () => {
  const agentJson = JSON.stringify({
    safety: 8, completeness: 7, executability: 9, maintainability: 8, orchestration: 7
  })

  it('returns orchestration field for agent skill', () => {
    const score = parseScore5D(agentJson, true)
    expect(score.orchestration).toBe(7)
  })

  it('sets costAwareness to 0 for agent skill', () => {
    const score = parseScore5D(agentJson, true)
    expect(score.costAwareness).toBe(0)
  })

  it('returns all 5 base dimensions for agent skill', () => {
    const score = parseScore5D(agentJson, true)
    expect(score.safety).toBe(8)
    expect(score.completeness).toBe(7)
    expect(score.executability).toBe(9)
    expect(score.maintainability).toBe(8)
  })
})

// ── parseScore5D — single skill shape ────────────────────────────────────────

describe('parseScore5D — single skill score shape', () => {
  const singleJson = JSON.stringify({
    safety: 9, completeness: 8, executability: 7, maintainability: 6, costAwareness: 5
  })

  it('returns costAwareness for single skill', () => {
    const score = parseScore5D(singleJson, false)
    expect(score.costAwareness).toBe(5)
  })

  it('orchestration is undefined for single skill', () => {
    const score = parseScore5D(singleJson, false)
    expect(score.orchestration).toBeUndefined()
  })

  it('returns all 5 base dimensions for single skill', () => {
    const score = parseScore5D(singleJson, false)
    expect(score.safety).toBe(9)
    expect(score.completeness).toBe(8)
    expect(score.executability).toBe(7)
    expect(score.maintainability).toBe(6)
  })
})

// ── clamp ─────────────────────────────────────────────────────────────────────

describe('clamp — score boundary enforcement', () => {
  it('clamps values above 10 to 10', () => {
    const score = parseScore5D(JSON.stringify({ safety: 15, completeness: 10, executability: 10, maintainability: 10, orchestration: 12 }), true)
    expect(score.safety).toBe(10)
    expect(score.orchestration).toBe(10)
  })

  it('clamps negative values to 0', () => {
    const score = parseScore5D(JSON.stringify({ safety: -3, completeness: 5, executability: 5, maintainability: 5, orchestration: -1 }), true)
    expect(score.safety).toBe(0)
    expect(score.orchestration).toBe(0)
  })

  it('treats non-numeric values as 0', () => {
    const score = parseScore5D(JSON.stringify({ safety: 'high', completeness: null, executability: 5, maintainability: 5, costAwareness: undefined }), false)
    expect(score.safety).toBe(0)
    expect(score.completeness).toBe(0)
  })

  it('passes through valid 0-10 values unchanged', () => {
    const score = parseScore5D(JSON.stringify({ safety: 0, completeness: 5, executability: 10, maintainability: 7, costAwareness: 3 }), false)
    expect(score.safety).toBe(0)
    expect(score.executability).toBe(10)
  })
})

// ── fallback on malformed JSON ────────────────────────────────────────────────

describe('parseScore5D — malformed JSON fallback', () => {
  it('returns all-5 fallback for invalid JSON', () => {
    const score = parseScore5D('{broken json', false)
    expect(score).toEqual({ safety: 5, completeness: 5, executability: 5, maintainability: 5, costAwareness: 5 })
  })

  it('returns all-5 fallback for empty string', () => {
    const score = parseScore5D('', true)
    expect(score).toEqual({ safety: 5, completeness: 5, executability: 5, maintainability: 5, costAwareness: 5 })
  })

  it('fallback does not include orchestration', () => {
    const score = parseScore5D('{bad}', true)
    expect(score.orchestration).toBeUndefined()
  })
})
