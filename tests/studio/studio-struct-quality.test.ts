/**
 * tests/studio/studio-struct-quality.test.ts
 *
 * Pure logic tests for 4D Skill structure quality analysis (analyzeStructQuality).
 * Mirrors StudioPage.tsx — no React / Electron / LLM dependencies.
 *
 * 4 dimensions, each scored 0–10:
 *   Q1 Frontmatter — name (+3), description (+3), length ≤1024 (+2), trigger word (+2)
 *   Q2 Workflow    — numbered steps (+5), Step/Phase heading (+3), input/output mention (+2)
 *   Q3 Edge Cases  — fallback keywords (+6), boundary keywords (+4)
 *   Q4 Checkpoints — any user-confirmation keyword → 10, else 0
 */

import { describe, it, expect } from 'vitest'

// ── Mirror of analyzeStructQuality from StudioPage.tsx ───────────────────────

interface StructQualityResult {
  frontmatter: number
  workflow: number
  edgeCases: number
  checkpoints: number
}

function analyzeStructQuality(content: string): StructQualityResult {
  const body = content.replace(/^---[\s\S]*?---\n?/, '')

  let frontmatter = 0
  if (/^---[\s\S]*?name:\s*\S/m.test(content)) frontmatter += 3
  const descMatch = content.match(/^---[\s\S]*?description:\s*["']?([^\n"']+)/m)
  const desc = descMatch?.[1]?.trim() ?? ''
  if (desc.length > 0) frontmatter += 3
  if (desc.length > 0 && desc.length <= 1024) frontmatter += 2
  if (/使用|触发|when|use when|mention|说|输入/i.test(desc)) frontmatter += 2

  let workflow = 0
  if (/^\s*\d+[\.\)]\s+\S/m.test(body)) workflow += 5
  if (/Step\s+\d+|Phase\s+\d+|阶段\s*\d+|步骤\s*\d+/i.test(body)) workflow += 3
  if (/输入|输出|input|output/i.test(body)) workflow += 2

  let edgeCases = 0
  if (/fallback|如果.*失败|失败时|出错|error|exception|异常/i.test(body)) edgeCases += 6
  if (/边界|edge case|特殊情况|注意/i.test(body)) edgeCases += 4

  const checkpoints = /用户确认|暂停|confirm|checkpoint|等待用户|pause|人工确认|请确认/i.test(body) ? 10 : 0

  return { frontmatter, workflow, edgeCases, checkpoints }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_SKILL = `---
name: CodeReview
version: 1.0.0
description: "当用户提交代码时触发，自动分析潜在问题"
---

# Code Review Skill

## Phase 1 — 分析

1. 读取用户输入的代码
2. 检查常见错误模式
3. 输出结构化建议

如果代码无法解析，返回 fallback 错误提示。
注意边界情况，如空文件或非代码文本。

等待用户确认后执行下一步。
`

const MINIMAL_SKILL = `# Minimal
Just do the task.`

// ── Q1 Frontmatter ────────────────────────────────────────────────────────────

describe('Q1 — Frontmatter quality', () => {
  it('scores 0 for skill with no frontmatter', () => {
    const result = analyzeStructQuality(MINIMAL_SKILL)
    expect(result.frontmatter).toBe(0)
  })

  it('+3 for name field present', () => {
    const content = `---\nname: MySkill\n---\n# Body`
    expect(analyzeStructQuality(content).frontmatter).toBeGreaterThanOrEqual(3)
  })

  it('+3 for description field present', () => {
    const content = `---\nname: MySkill\ndescription: Helps with tasks\n---\n# Body`
    expect(analyzeStructQuality(content).frontmatter).toBeGreaterThanOrEqual(6)
  })

  it('+2 for description length ≤ 1024', () => {
    const content = `---\nname: MySkill\ndescription: Short description\n---\n# Body`
    // name(3) + desc exists(3) + length ok(2) = 8, no trigger word
    expect(analyzeStructQuality(content).frontmatter).toBe(8)
  })

  it('+2 for trigger word in description (Chinese 使用)', () => {
    const content = `---\nname: MySkill\ndescription: 使用此 Skill 整理代码\n---\n# Body`
    expect(analyzeStructQuality(content).frontmatter).toBe(10)
  })

  it('+2 for trigger word "when" in description', () => {
    const content = `---\nname: MySkill\ndescription: "Use when reviewing pull requests"\n---\n# Body`
    expect(analyzeStructQuality(content).frontmatter).toBe(10)
  })

  it('+2 for trigger word "mention" in description', () => {
    const content = `---\nname: MySkill\ndescription: Triggered when user mentions a bug\n---\n# Body`
    expect(analyzeStructQuality(content).frontmatter).toBe(10)
  })

  it('caps at 10 even if all sub-scores apply', () => {
    const result = analyzeStructQuality(FULL_SKILL)
    expect(result.frontmatter).toBeLessThanOrEqual(10)
  })

  it('full skill scores 10 on Q1', () => {
    expect(analyzeStructQuality(FULL_SKILL).frontmatter).toBe(10)
  })
})

// ── Q2 Workflow ───────────────────────────────────────────────────────────────

describe('Q2 — Workflow clarity', () => {
  it('scores 0 for prose-only body with no structure', () => {
    expect(analyzeStructQuality(MINIMAL_SKILL).workflow).toBe(0)
  })

  it('+5 for numbered steps (1. style)', () => {
    const content = `---\nname: X\n---\n1. First step\n2. Second step`
    expect(analyzeStructQuality(content).workflow).toBeGreaterThanOrEqual(5)
  })

  it('+5 for numbered steps (1) style)', () => {
    const content = `---\nname: X\n---\n1) First step\n2) Second step`
    expect(analyzeStructQuality(content).workflow).toBeGreaterThanOrEqual(5)
  })

  it('+3 for Phase/Step heading', () => {
    const content = `---\nname: X\n---\n## Phase 1\nDo something.`
    expect(analyzeStructQuality(content).workflow).toBeGreaterThanOrEqual(3)
  })

  it('+3 for Chinese 步骤 heading', () => {
    const content = `---\nname: X\n---\n步骤 1：读取文件`
    expect(analyzeStructQuality(content).workflow).toBeGreaterThanOrEqual(3)
  })

  it('+2 for input/output mention', () => {
    const content = `---\nname: X\n---\nInput: code snippet\nOutput: review comments`
    expect(analyzeStructQuality(content).workflow).toBeGreaterThanOrEqual(2)
  })

  it('full skill scores 10 on Q2', () => {
    expect(analyzeStructQuality(FULL_SKILL).workflow).toBe(10)
  })
})

// ── Q3 Edge Cases ─────────────────────────────────────────────────────────────

describe('Q3 — Edge case coverage', () => {
  it('scores 0 for skill with no fallback or boundary mention', () => {
    expect(analyzeStructQuality(MINIMAL_SKILL).edgeCases).toBe(0)
  })

  it('+6 for "fallback" keyword', () => {
    const content = `---\nname: X\n---\nIf nothing matches, use fallback response.`
    expect(analyzeStructQuality(content).edgeCases).toBeGreaterThanOrEqual(6)
  })

  it('+6 for "error" keyword', () => {
    const content = `---\nname: X\n---\nIf an error occurs, abort.`
    expect(analyzeStructQuality(content).edgeCases).toBeGreaterThanOrEqual(6)
  })

  it('+6 for Chinese 异常 keyword', () => {
    const content = `---\nname: X\n---\n遇到异常时返回空结果。`
    expect(analyzeStructQuality(content).edgeCases).toBeGreaterThanOrEqual(6)
  })

  it('+4 for "edge case" keyword', () => {
    const content = `---\nname: X\n---\nHandle edge cases carefully.`
    expect(analyzeStructQuality(content).edgeCases).toBeGreaterThanOrEqual(4)
  })

  it('+4 for Chinese 注意 keyword', () => {
    const content = `---\nname: X\n---\n注意：空文件时不处理。`
    expect(analyzeStructQuality(content).edgeCases).toBeGreaterThanOrEqual(4)
  })

  it('scores 10 when both fallback and boundary keywords present', () => {
    const content = `---\nname: X\n---\nIf error occurs use fallback. Note edge cases.`
    expect(analyzeStructQuality(content).edgeCases).toBe(10)
  })

  it('full skill scores 10 on Q3', () => {
    expect(analyzeStructQuality(FULL_SKILL).edgeCases).toBe(10)
  })
})

// ── Q4 Checkpoints ────────────────────────────────────────────────────────────

describe('Q4 — Checkpoint design (binary)', () => {
  it('scores 0 for skill with no confirmation step', () => {
    expect(analyzeStructQuality(MINIMAL_SKILL).checkpoints).toBe(0)
  })

  it('scores 10 for "confirm" keyword', () => {
    const content = `---\nname: X\n---\nAsk user to confirm before proceeding.`
    expect(analyzeStructQuality(content).checkpoints).toBe(10)
  })

  it('scores 10 for "checkpoint" keyword', () => {
    const content = `---\nname: X\n---\nAdd a checkpoint here.`
    expect(analyzeStructQuality(content).checkpoints).toBe(10)
  })

  it('scores 10 for "pause" keyword', () => {
    const content = `---\nname: X\n---\nPause and wait for input.`
    expect(analyzeStructQuality(content).checkpoints).toBe(10)
  })

  it('scores 10 for Chinese 用户确认 keyword', () => {
    const content = `---\nname: X\n---\n请用户确认后继续。`
    expect(analyzeStructQuality(content).checkpoints).toBe(10)
  })

  it('scores 10 for Chinese 等待用户 keyword', () => {
    const content = `---\nname: X\n---\n等待用户操作后执行下一步。`
    expect(analyzeStructQuality(content).checkpoints).toBe(10)
  })

  it('is strictly binary — no partial scores', () => {
    const withCheckpoint = `---\nname: X\n---\nPause here.`
    const without = `---\nname: X\n---\nJust do it.`
    expect(analyzeStructQuality(withCheckpoint).checkpoints).toBe(10)
    expect(analyzeStructQuality(without).checkpoints).toBe(0)
  })

  it('full skill scores 10 on Q4', () => {
    expect(analyzeStructQuality(FULL_SKILL).checkpoints).toBe(10)
  })
})

// ── Overall scoring ───────────────────────────────────────────────────────────

describe('Overall structure quality scoring', () => {
  it('full skill scores 10 on all four dimensions', () => {
    const result = analyzeStructQuality(FULL_SKILL)
    expect(result.frontmatter).toBe(10)
    expect(result.workflow).toBe(10)
    expect(result.edgeCases).toBe(10)
    expect(result.checkpoints).toBe(10)
  })

  it('minimal skill scores 0 on all four dimensions', () => {
    const result = analyzeStructQuality(MINIMAL_SKILL)
    expect(result.frontmatter).toBe(0)
    expect(result.workflow).toBe(0)
    expect(result.edgeCases).toBe(0)
    expect(result.checkpoints).toBe(0)
  })

  it('weak dimension threshold: score < 6 should trigger warning', () => {
    // Skills without description get Q1 = 3 (only name), below warning threshold
    const content = `---\nname: MySkill\n---\n# Body`
    const result = analyzeStructQuality(content)
    expect(result.frontmatter).toBeLessThan(6)
  })

  it('all scores are bounded 0–10', () => {
    const result = analyzeStructQuality(FULL_SKILL)
    for (const score of Object.values(result)) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(10)
    }
  })
})

// ── Frontmatter stripping ─────────────────────────────────────────────────────

describe('Frontmatter stripping in body analysis', () => {
  it('does not count frontmatter keywords as workflow steps', () => {
    // The frontmatter block itself shouldn't be matched by numbered-step regex
    const content = `---\nname: MySkill\ndescription: "Use when reviewing"\nversion: 1.0\n---\n# Body\nJust prose.`
    const result = analyzeStructQuality(content)
    expect(result.workflow).toBe(0)
  })

  it('detects numbered steps only in body, not frontmatter', () => {
    const content = `---\nname: MySkill\n---\n1. Step one\n2. Step two`
    expect(analyzeStructQuality(content).workflow).toBeGreaterThanOrEqual(5)
  })
})
