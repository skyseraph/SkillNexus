CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  version TEXT NOT NULL DEFAULT '1.0.0',
  tags TEXT NOT NULL DEFAULT '[]',
  yaml_frontmatter TEXT NOT NULL DEFAULT '',
  markdown_content TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
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
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_cases_skill_id ON test_cases(skill_id);
CREATE INDEX IF NOT EXISTS idx_eval_history_skill_id ON eval_history(skill_id);
CREATE INDEX IF NOT EXISTS idx_eval_history_created_at ON eval_history(created_at);
