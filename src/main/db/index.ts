import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

/**
 * Resolve the path to the better_sqlite3.node native binding.
 *
 * rebuild-sqlite.js extracts the prebuilt binary to:
 *   resources/{platform}-{arch}/better_sqlite3.node
 *
 * This works even when better-sqlite3's npm install script failed
 * (e.g. corporate proxy), because we bypass node-gyp-build entirely
 * by passing the path via the `nativeBinding` option.
 */
function getNativeBindingPath(): string | undefined {
  const key = `${process.platform}-${process.arch}`
  // In dev: project root is 3 levels up from src/main/db
  // In prod (packaged): app.getAppPath() is the asar root
  const candidates = [
    join(__dirname, '..', '..', '..', 'resources', key, 'better_sqlite3.node'),
  ]
  try {
    candidates.push(join(app.getAppPath(), 'resources', key, 'better_sqlite3.node'))
  } catch {
    // app.getAppPath() not available in test environment
  }
  const { existsSync } = require('fs') as typeof import('fs')
  return candidates.find(p => existsSync(p))
}

let db: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  version TEXT NOT NULL DEFAULT '1.0.0',
  tags TEXT NOT NULL DEFAULT '[]',
  yaml_frontmatter TEXT NOT NULL DEFAULT '',
  markdown_content TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  root_dir TEXT NOT NULL DEFAULT '',
  skill_type TEXT NOT NULL DEFAULT 'single',
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  parent_skill_id TEXT
);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  judge_type TEXT NOT NULL DEFAULT 'llm',
  judge_param TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_history (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_prompt TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  scores TEXT NOT NULL DEFAULT '{}',
  total_score REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  created_at INTEGER NOT NULL,
  test_case_id TEXT,
  test_case_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_cases_skill_id ON test_cases(skill_id);
CREATE INDEX IF NOT EXISTS idx_eval_history_skill_id ON eval_history(skill_id);
CREATE INDEX IF NOT EXISTS idx_eval_history_created_at ON eval_history(created_at);
`

// Runtime migration for existing DBs that predate root_dir/skill_type columns
const MIGRATIONS = [
  `ALTER TABLE skills ADD COLUMN root_dir TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE skills ADD COLUMN skill_type TEXT NOT NULL DEFAULT 'single'`,
  `ALTER TABLE skills ADD COLUMN trust_level INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE skills ADD COLUMN parent_skill_id TEXT`,
  `ALTER TABLE skills ADD COLUMN evolution_notes TEXT`,
  `ALTER TABLE skills ADD COLUMN evolution_engine TEXT`,
  `ALTER TABLE skills ADD COLUMN evolution_generation INTEGER`,
  `ALTER TABLE skills ADD COLUMN pareto_scores TEXT`,
  `ALTER TABLE skills ADD COLUMN transfer_report TEXT`,
  `ALTER TABLE eval_history ADD COLUMN test_case_id TEXT`,
  `ALTER TABLE eval_history ADD COLUMN test_case_name TEXT`,
  `ALTER TABLE eval_history ADD COLUMN job_id TEXT`,
  `ALTER TABLE eval_history ADD COLUMN label TEXT`
]

export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'skill-nexus.db')
  const nativeBinding = getNativeBindingPath()
  db = new Database(dbPath, ...(nativeBinding ? [{ nativeBinding }] : []))

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  // Apply migrations idempotently — ignore "duplicate column" errors
  for (const sql of MIGRATIONS) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  // Clean up temporary three-condition records older than 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  db.prepare(`DELETE FROM skills WHERE (id LIKE 'skill-noskill-%' OR id LIKE 'skill-gen-%') AND installed_at < ?`).run(cutoff)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

