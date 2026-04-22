import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron before any imports
vi.mock('electron', () => ({
  app: { getPath: () => ':memory:' },
  ipcMain: { handle: vi.fn() }
}))

vi.mock('better-sqlite3', () => {
  const rows: Record<string, unknown>[] = []
  const stmts = new Map<string, { run: (...args: unknown[]) => void; all: (...args: unknown[]) => unknown[]; get: (...args: unknown[]) => unknown }>()

  const makeStmt = (sql: string) => ({
    run: (..._args: unknown[]) => {
      if (sql.includes('INSERT INTO skills')) {
        rows.push({ id: _args[0], name: _args[1], format: _args[2], version: _args[3], tags: _args[4], yaml_frontmatter: _args[5], markdown_content: _args[6], file_path: _args[7], installed_at: _args[8], updated_at: _args[9] })
      }
    },
    all: (..._args: unknown[]) => {
      if (sql.includes('FROM skills')) return rows
      return []
    },
    get: (..._args: unknown[]) => rows.find(r => r.id === _args[0]) ?? undefined
  })

  const db = {
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: (sql: string) => {
      if (!stmts.has(sql)) stmts.set(sql, makeStmt(sql))
      return stmts.get(sql)!
    }
  }

  return { default: vi.fn(() => db) }
})

import { initDatabase, getDb } from './index'

describe('db/index', () => {
  it('initDatabase returns a db instance', () => {
    const db = initDatabase()
    expect(db).toBeDefined()
    expect(db.pragma).toBeDefined()
  })

  it('getDb returns the same instance after init', () => {
    const db1 = initDatabase()
    const db2 = getDb()
    expect(db1).toBe(db2)
  })

  it('getDb throws if not initialized', async () => {
    vi.resetModules()
    // Re-import fresh module with no prior initDatabase() call
    const { getDb: freshGetDb } = await import('./index')
    expect(() => freshGetDb()).toThrow('Database not initialized')
  })
})
