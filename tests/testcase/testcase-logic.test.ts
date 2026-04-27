/**
 * tests/testcase/testcase-logic.test.ts
 *
 * Pure logic tests for TestCase management:
 * - judgeType validation & defaults
 * - NDJSON parsing from AI generation stream
 * - importJson validation rules (limit 200, judgeType fallback)
 * - name truncation (120 chars)
 * No Electron / DB.
 */

import { describe, it, expect } from 'vitest'

// ── Mirrors testcases.handler.ts logic ───────────────────────────────────────

const VALID_JUDGE_TYPES = new Set(['llm', 'grep', 'command'])
const MAX_IMPORT = 200
const MAX_NAME_LEN = 120

function parseNdjsonLine(line: string): {
  name: string
  input: string
  judgeType: 'llm' | 'grep' | 'command'
  judgeParam: string
  dimension?: string
} | null {
  try {
    const obj = JSON.parse(line.trim())
    if (!obj.name || !obj.input) return null
    return {
      name: String(obj.name).slice(0, MAX_NAME_LEN),
      input: String(obj.input),
      judgeType: VALID_JUDGE_TYPES.has(obj.judgeType) ? obj.judgeType : 'llm',
      judgeParam: String(obj.judgeParam ?? ''),
      dimension: obj.dimension
    }
  } catch {
    return null
  }
}

function importJsonTestCases(raw: unknown[]): Array<{
  name: string
  input: string
  judgeType: 'llm' | 'grep' | 'command'
  judgeParam: string
}> {
  if (!Array.isArray(raw)) throw new Error('Input must be an array')
  if (raw.length > MAX_IMPORT) throw new Error(`Cannot import more than ${MAX_IMPORT} test cases at once`)
  return raw.map((item, i) => {
    const obj = item as Record<string, unknown>
    return {
      name: String(obj.name ?? `Test Case ${i + 1}`).slice(0, MAX_NAME_LEN),
      input: String(obj.input ?? ''),
      judgeType: VALID_JUDGE_TYPES.has(obj.judgeType as string) ? (obj.judgeType as 'llm' | 'grep' | 'command') : 'llm',
      judgeParam: String(obj.judgeParam ?? '')
    }
  })
}

// ── NDJSON line parsing ───────────────────────────────────────────────────────

describe('parseNdjsonLine — AI generation stream parsing', () => {
  it('parses a valid NDJSON test case line', () => {
    const line = JSON.stringify({
      name: 'Happy path test',
      input: 'Review this code for bugs',
      judgeType: 'llm',
      judgeParam: 'Response should identify the null pointer dereference',
      dimension: 'correctness'
    })
    const result = parseNdjsonLine(line)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Happy path test')
    expect(result!.judgeType).toBe('llm')
    expect(result!.dimension).toBe('correctness')
  })

  it('defaults judgeType to llm for unknown type', () => {
    const line = JSON.stringify({ name: 'Test', input: 'input', judgeType: 'invalid', judgeParam: 'p' })
    const result = parseNdjsonLine(line)
    expect(result!.judgeType).toBe('llm')
  })

  it('accepts grep judgeType', () => {
    const line = JSON.stringify({ name: 'Grep test', input: 'search', judgeType: 'grep', judgeParam: 'expected keyword' })
    const result = parseNdjsonLine(line)
    expect(result!.judgeType).toBe('grep')
  })

  it('accepts command judgeType', () => {
    const line = JSON.stringify({ name: 'Cmd test', input: 'run', judgeType: 'command', judgeParam: 'echo test | grep test' })
    const result = parseNdjsonLine(line)
    expect(result!.judgeType).toBe('command')
  })

  it('truncates name to 120 chars', () => {
    const longName = 'A'.repeat(200)
    const line = JSON.stringify({ name: longName, input: 'x', judgeType: 'llm', judgeParam: 'p' })
    const result = parseNdjsonLine(line)
    expect(result!.name).toHaveLength(120)
  })

  it('returns null for invalid JSON', () => {
    expect(parseNdjsonLine('not-json')).toBeNull()
    expect(parseNdjsonLine('')).toBeNull()
    expect(parseNdjsonLine('{broken')).toBeNull()
  })

  it('returns null for object missing required name', () => {
    const line = JSON.stringify({ input: 'some input', judgeType: 'llm', judgeParam: 'p' })
    expect(parseNdjsonLine(line)).toBeNull()
  })

  it('returns null for object missing required input', () => {
    const line = JSON.stringify({ name: 'Test', judgeType: 'llm', judgeParam: 'p' })
    expect(parseNdjsonLine(line)).toBeNull()
  })

  it('defaults judgeParam to empty string when missing', () => {
    const line = JSON.stringify({ name: 'Test', input: 'input', judgeType: 'llm' })
    const result = parseNdjsonLine(line)
    expect(result!.judgeParam).toBe('')
  })

  it('handles whitespace-only lines gracefully', () => {
    expect(parseNdjsonLine('   ')).toBeNull()
  })
})

// ── importJson validation ────────────────────────────────────────────────────

describe('importJsonTestCases — bulk import validation', () => {
  it('imports valid array of test cases', () => {
    const raw = [
      { name: 'TC1', input: 'input1', judgeType: 'llm', judgeParam: 'p1' },
      { name: 'TC2', input: 'input2', judgeType: 'grep', judgeParam: 'keyword' }
    ]
    const result = importJsonTestCases(raw)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('TC1')
    expect(result[1].judgeType).toBe('grep')
  })

  it('throws when input is not an array', () => {
    expect(() => importJsonTestCases({} as unknown[])).toThrow('must be an array')
  })

  it('throws when array exceeds 200 items', () => {
    const large = Array.from({ length: 201 }, (_, i) => ({
      name: `TC${i}`, input: `input${i}`, judgeType: 'llm', judgeParam: 'p'
    }))
    expect(() => importJsonTestCases(large)).toThrow('Cannot import more than 200')
  })

  it('accepts exactly 200 items (boundary)', () => {
    const exact = Array.from({ length: 200 }, (_, i) => ({
      name: `TC${i}`, input: `input${i}`, judgeType: 'llm', judgeParam: 'p'
    }))
    expect(() => importJsonTestCases(exact)).not.toThrow()
    expect(importJsonTestCases(exact)).toHaveLength(200)
  })

  it('defaults judgeType to llm for invalid type', () => {
    const raw = [{ name: 'TC1', input: 'i', judgeType: 'bad', judgeParam: 'p' }]
    const result = importJsonTestCases(raw)
    expect(result[0].judgeType).toBe('llm')
  })

  it('generates name fallback when name is missing', () => {
    const raw = [{ input: 'some input', judgeType: 'llm', judgeParam: 'p' }]
    const result = importJsonTestCases(raw)
    expect(result[0].name).toBe('Test Case 1')
  })

  it('truncates long names to 120 chars', () => {
    const raw = [{ name: 'X'.repeat(200), input: 'i', judgeType: 'llm', judgeParam: 'p' }]
    expect(importJsonTestCases(raw)[0].name).toHaveLength(120)
  })

  it('handles items with missing judgeParam (defaults to empty string)', () => {
    const raw = [{ name: 'TC1', input: 'i', judgeType: 'llm' }]
    const result = importJsonTestCases(raw)
    expect(result[0].judgeParam).toBe('')
  })

  it('handles empty array', () => {
    expect(importJsonTestCases([])).toEqual([])
  })
})

// ── judgeType semantics ──────────────────────────────────────────────────────

describe('judgeType semantics', () => {
  it('has exactly 3 valid judge types', () => {
    expect([...VALID_JUDGE_TYPES]).toEqual(['llm', 'grep', 'command'])
  })

  it('unknown judgeType falls back to llm', () => {
    const line = JSON.stringify({ name: 'T', input: 'i', judgeType: 'unknown', judgeParam: '' })
    expect(parseNdjsonLine(line)!.judgeType).toBe('llm')
  })
})
