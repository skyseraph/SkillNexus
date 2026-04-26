/**
 * tests/eval/three-condition-cleanup.test.ts
 *
 * Tests for the temp record cleanup logic introduced in HIGH-3 fix.
 * Pure logic — mirrors the DELETE predicate from initDatabase(), no DB dependency.
 */

import { describe, it, expect } from 'vitest'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

interface SkillRecord {
  id: string
  installedAt: number
}

// Mirror the DELETE predicate from initDatabase()
function shouldCleanup(record: SkillRecord, now: number): boolean {
  const cutoff = now - SEVEN_DAYS_MS
  const isTempId = record.id.startsWith('skill-noskill-') || record.id.startsWith('skill-gen-')
  return isTempId && record.installedAt < cutoff
}

function runCleanup(records: SkillRecord[], now: number): SkillRecord[] {
  return records.filter(r => !shouldCleanup(r, now))
}

describe('three-condition cleanup — skill-noskill-* records', () => {
  it('deletes skill-noskill-* records older than 7 days', () => {
    const now = Date.now()
    const old = now - SEVEN_DAYS_MS - 1000
    const records = [{ id: 'skill-noskill-abc123', installedAt: old }]
    expect(runCleanup(records, now)).toHaveLength(0)
  })

  it('preserves skill-noskill-* records newer than 7 days', () => {
    const now = Date.now()
    const recent = now - 1000
    const records = [{ id: 'skill-noskill-xyz789', installedAt: recent }]
    expect(runCleanup(records, now)).toHaveLength(1)
  })

  it('preserves skill-noskill-* records exactly at the 7-day boundary', () => {
    const now = Date.now()
    const boundary = now - SEVEN_DAYS_MS
    const records = [{ id: 'skill-noskill-boundary', installedAt: boundary }]
    // installedAt === cutoff is NOT < cutoff, so it should be preserved
    expect(runCleanup(records, now)).toHaveLength(1)
  })
})

describe('three-condition cleanup — skill-gen-* records', () => {
  it('deletes skill-gen-* records older than 7 days', () => {
    const now = Date.now()
    const old = now - SEVEN_DAYS_MS - 1000
    const records = [{ id: 'skill-gen-def456', installedAt: old }]
    expect(runCleanup(records, now)).toHaveLength(0)
  })

  it('preserves skill-gen-* records newer than 7 days', () => {
    const now = Date.now()
    const recent = now - 1000
    const records = [{ id: 'skill-gen-new001', installedAt: recent }]
    expect(runCleanup(records, now)).toHaveLength(1)
  })
})

describe('three-condition cleanup — other records unaffected', () => {
  it('does not delete regular skill records older than 7 days', () => {
    const now = Date.now()
    const old = now - SEVEN_DAYS_MS - 1000
    const records = [{ id: 'skill-1234567890-abcdef', installedAt: old }]
    expect(runCleanup(records, now)).toHaveLength(1)
  })

  it('deletes both temp prefixes and preserves regular skills in one pass', () => {
    const now = Date.now()
    const old = now - SEVEN_DAYS_MS - 1000
    const records: SkillRecord[] = [
      { id: 'skill-noskill-a', installedAt: old },
      { id: 'skill-gen-b', installedAt: old },
      { id: 'skill-real-c', installedAt: old },
    ]
    const result = runCleanup(records, now)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('skill-real-c')
  })

  it('does not delete records with id starting with skill-noskill but no dash after', () => {
    const now = Date.now()
    const old = now - SEVEN_DAYS_MS - 1000
    // 'skill-noskill' without trailing dash is not matched by startsWith('skill-noskill-')
    const records = [{ id: 'skill-noskill', installedAt: old }]
    expect(runCleanup(records, now)).toHaveLength(1)
  })
})
