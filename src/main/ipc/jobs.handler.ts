import { ipcMain } from 'electron'
import { getDb } from '../db'
import type { JobEntry } from '../../shared/types'

export function registerJobsHandlers(): void {
  ipcMain.handle('jobs:list', (
    _event,
    filter?: 'all' | 'eval' | 'evo'
  ): JobEntry[] => {
    const db = getDb()

    const evalJobs: JobEntry[] = filter === 'evo' ? [] : (db.prepare(`
      SELECT e.id, e.skill_id, s.name skill_name,
             e.total_score, e.status, e.duration_ms, e.created_at
      FROM eval_history e
      JOIN skills s ON e.skill_id = s.id
      ORDER BY e.created_at DESC LIMIT 50
    `).all() as {
      id: string; skill_id: string; skill_name: string
      total_score: number; status: string; duration_ms: number; created_at: number
    }[]).map(r => ({
      id: r.id,
      type: 'eval' as const,
      skillId: r.skill_id,
      skillName: r.skill_name,
      totalScore: r.total_score,
      status: r.status as 'success' | 'error',
      durationMs: r.duration_ms,
      createdAt: r.created_at
    }))

    const evoJobs: JobEntry[] = filter === 'eval' ? [] : (db.prepare(`
      SELECT sk.id, sk.name, sk.evolution_engine, sk.parent_skill_id,
             p.name parent_name,
             AVG(e.total_score) avg_score,
             COUNT(e.id) eval_count,
             sk.installed_at created_at
      FROM skills sk
      LEFT JOIN skills p ON sk.parent_skill_id = p.id
      LEFT JOIN eval_history e ON e.skill_id = sk.id
      WHERE sk.evolution_engine IS NOT NULL
      GROUP BY sk.id
      ORDER BY sk.installed_at DESC LIMIT 50
    `).all() as {
      id: string; name: string; evolution_engine: string; parent_skill_id: string | null
      parent_name: string | null; avg_score: number | null; eval_count: number; created_at: number
    }[]).map(r => ({
      id: r.id,
      type: 'evo' as const,
      skillId: r.id,
      skillName: r.name,
      engine: r.evolution_engine as JobEntry['engine'],
      parentSkillId: r.parent_skill_id ?? undefined,
      parentSkillName: r.parent_name ?? undefined,
      avgScore: r.avg_score ?? undefined,
      evalCount: r.eval_count,
      createdAt: r.created_at
    }))

    return [...evalJobs, ...evoJobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)
  })
}
