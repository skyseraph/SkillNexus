import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElectronDataStore } from '../../src/main/services/adapters/electron-data-store'
import { ElectronSkillStorage } from '../../src/main/services/adapters/electron-storage'
import { ElectronProgressReporter } from '../../src/main/services/adapters/electron-progress'
import type { Database, Statement } from 'better-sqlite3'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStmt(returnValue: unknown = undefined) {
  return {
    all: vi.fn().mockReturnValue(returnValue ?? []),
    get: vi.fn().mockReturnValue(returnValue),
    run: vi.fn().mockReturnValue({ changes: 1 }),
  } as unknown as Statement
}

function makeDb(stmtOverride?: Statement): Database {
  const stmt = stmtOverride ?? makeStmt([])
  return { prepare: vi.fn().mockReturnValue(stmt) } as unknown as Database
}

// ── ElectronDataStore ─────────────────────────────────────────────────────────

describe('ElectronDataStore', () => {
  describe('queryEvalHistory', () => {
    it('queries without status filter by default', () => {
      const stmt = makeStmt([])
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      store.queryEvalHistory('s1')
      expect(stmt.all).toHaveBeenCalledWith('s1', 50)
    })

    it('queries with status filter when provided', () => {
      const stmt = makeStmt([])
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      store.queryEvalHistory('s1', { status: 'success' })
      expect(stmt.all).toHaveBeenCalledWith('s1', 'success', 50)
    })

    it('respects custom limit', () => {
      const stmt = makeStmt([])
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      store.queryEvalHistory('s1', { limit: 10 })
      expect(stmt.all).toHaveBeenCalledWith('s1', 10)
    })

    it('uses custom orderBy in SQL', () => {
      const db = makeDb()
      const store = new ElectronDataStore(db)
      store.queryEvalHistory('s1', { orderBy: 'total_score ASC' })
      const sql = (db.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(sql).toContain('total_score ASC')
    })

    it('returns rows from db', () => {
      const rows = [{ input_prompt: 'hi', output: 'hello', total_score: 8, status: 'success', scores: '{}' }]
      const stmt = makeStmt(rows)
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      const result = store.queryEvalHistory('s1')
      expect(result).toEqual(rows)
    })
  })

  describe('querySkill', () => {
    it('returns skill row when found', () => {
      const row = { id: 's1', name: 'Test', version: '1.0', markdown_content: '# T', skill_type: 'single' }
      const stmt = makeStmt(row)
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      expect(store.querySkill('s1')).toEqual(row)
    })

    it('returns undefined when not found', () => {
      const stmt = makeStmt(undefined)
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      expect(store.querySkill('missing')).toBeUndefined()
    })
  })

  describe('queryTestCases', () => {
    it('returns test case rows', () => {
      const rows = [{ id: 'tc1', name: 'case1', input: 'hello', judge_type: 'llm', judge_param: '' }]
      const stmt = makeStmt(rows)
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      expect(store.queryTestCases('s1')).toEqual(rows)
    })

    it('passes custom limit to query', () => {
      const stmt = makeStmt([])
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      store.queryTestCases('s1', 20)
      expect(stmt.all).toHaveBeenCalledWith('s1', 20)
    })
  })

  describe('querySkillChain', () => {
    it('returns chain rows', () => {
      const rows = [
        { id: 's1', name: 'Root', version: '1.0', markdown_content: '# R', skill_type: 'single' },
        { id: 's2', name: 'Child', version: '1.1', markdown_content: '# C', skill_type: 'single' },
      ]
      const stmt = makeStmt(rows)
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      expect(store.querySkillChain('s1')).toEqual(rows)
    })

    it('uses recursive CTE in SQL', () => {
      const db = makeDb()
      const store = new ElectronDataStore(db)
      store.querySkillChain('s1')
      const sql = (db.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(sql).toContain('RECURSIVE')
      expect(sql).toContain('parent_skill_id')
    })

    it('returns empty array for unknown root', () => {
      const stmt = makeStmt([])
      const db = makeDb(stmt)
      const store = new ElectronDataStore(db)
      expect(store.querySkillChain('unknown')).toEqual([])
    })
  })
})

// ── ElectronSkillStorage ──────────────────────────────────────────────────────

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>()
  return { ...actual }
})

describe('ElectronSkillStorage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('saveEvolvedSkill', () => {
    it('inserts a row into skills table', async () => {
      const runMock = vi.fn()
      const stmt = { run: runMock } as unknown as Statement
      const db = { prepare: vi.fn().mockReturnValue(stmt) } as unknown as Database
      const storage = new ElectronSkillStorage(db, '/tmp/skills')
      const id = storage.saveEvolvedSkill({
        parentSkillId: 's1',
        engine: 'evoskill',
        generation: 2,
        content: '# Evolved',
        namePrefix: 'test',
      })
      expect(runMock).toHaveBeenCalled()
      expect(typeof id).toBe('string')
      expect(id).toMatch(/^skill-/)
    })

    it('returns a skill ID with correct prefix', () => {
      const db = { prepare: vi.fn().mockReturnValue({ run: vi.fn() }) } as unknown as Database
      const storage = new ElectronSkillStorage(db, '/tmp/skills')
      const id = storage.saveEvolvedSkill({
        parentSkillId: 's1', engine: 'coevoskill', content: '# C', namePrefix: 'co',
      })
      expect(id).toMatch(/^skill-\d+-.+/)
    })

    it('passes engine name to DB insert', () => {
      const runMock = vi.fn()
      const db = { prepare: vi.fn().mockReturnValue({ run: runMock }) } as unknown as Database
      const storage = new ElectronSkillStorage(db, '/tmp/skills')
      storage.saveEvolvedSkill({ parentSkillId: 's1', engine: 'skillx', content: '# X', namePrefix: 'x' })
      const args = runMock.mock.calls[0] as unknown[]
      expect(args).toContain('skillx')
    })

    it('passes parentSkillId to DB insert', () => {
      const runMock = vi.fn()
      const db = { prepare: vi.fn().mockReturnValue({ run: runMock }) } as unknown as Database
      const storage = new ElectronSkillStorage(db, '/tmp/skills')
      storage.saveEvolvedSkill({ parentSkillId: 'parent-123', engine: 'skillclaw', content: '# C', namePrefix: 'c' })
      const args = runMock.mock.calls[0] as unknown[]
      expect(args).toContain('parent-123')
    })
  })

  describe('copyTestCases', () => {
    it('inserts one row per test case', () => {
      const tcs = [
        { name: 'tc1', input: 'hello', judge_type: 'llm', judge_param: '' },
        { name: 'tc2', input: 'world', judge_type: 'exact', judge_param: 'world' },
      ]
      const runMock = vi.fn()
      const db = {
        prepare: vi.fn()
          .mockReturnValueOnce({ all: vi.fn().mockReturnValue(tcs) })
          .mockReturnValue({ run: runMock }),
      } as unknown as Database
      const storage = new ElectronSkillStorage(db, '/tmp/skills')
      storage.copyTestCases('from-skill', 'to-skill')
      expect(runMock).toHaveBeenCalledTimes(2)
    })

    it('does nothing when source has no test cases', () => {
      const runMock = vi.fn()
      const db = {
        prepare: vi.fn()
          .mockReturnValueOnce({ all: vi.fn().mockReturnValue([]) })
          .mockReturnValue({ run: runMock }),
      } as unknown as Database
      const storage = new ElectronSkillStorage(db, '/tmp/skills')
      storage.copyTestCases('from-skill', 'to-skill')
      expect(runMock).not.toHaveBeenCalled()
    })

    it('assigns new IDs to copied test cases', () => {
      const tcs = [{ name: 'tc1', input: 'hi', judge_type: 'llm', judge_param: '' }]
      const runMock = vi.fn()
      const db = {
        prepare: vi.fn()
          .mockReturnValueOnce({ all: vi.fn().mockReturnValue(tcs) })
          .mockReturnValue({ run: runMock }),
      } as unknown as Database
      const storage = new ElectronSkillStorage(db, '/tmp/skills')
      storage.copyTestCases('from', 'to')
      const newId = runMock.mock.calls[0][0] as string
      expect(newId).toMatch(/^tc-/)
    })
  })
})

// ── ElectronProgressReporter ──────────────────────────────────────────────────

describe('ElectronProgressReporter', () => {
  it('calls webContents.send with event and data', () => {
    const sendMock = vi.fn()
    const win = { webContents: { send: sendMock } } as unknown as Electron.BrowserWindow
    const reporter = new ElectronProgressReporter(win)
    reporter.report('evo:progress', { step: 1, done: false })
    expect(sendMock).toHaveBeenCalledWith('evo:progress', { step: 1, done: false })
  })

  it('does nothing when win is null', () => {
    const reporter = new ElectronProgressReporter(null)
    expect(() => reporter.report('evo:progress', { step: 1 })).not.toThrow()
  })

  it('forwards arbitrary event names', () => {
    const sendMock = vi.fn()
    const win = { webContents: { send: sendMock } } as unknown as Electron.BrowserWindow
    const reporter = new ElectronProgressReporter(win)
    reporter.report('custom:event', { foo: 'bar' })
    expect(sendMock).toHaveBeenCalledWith('custom:event', { foo: 'bar' })
  })
})
