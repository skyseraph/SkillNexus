import { ipcMain } from 'electron'
import { getDb } from '../db'
import type { JobEntry } from '../../shared/types'

export function registerJobsHandlers(): void {
  ipcMain.handle('jobs:list', (
    _event,
    filter?: 'all' | 'eval' | 'evo'
  ): JobEntry[] => {
    const db = getDb()

    // Eval jobs: aggregate by job_id when present, fall back to individual records for legacy rows
    const evalJobs: JobEntry[] = filter === 'evo' ? [] : (db.prepare(`
      SELECT
        COALESCE(e.job_id, e.id) AS job_key,
        e.skill_id,
        s.name AS skill_name,
        COUNT(e.id) AS total_cases,
        SUM(CASE WHEN e.status = 'success' THEN 1 ELSE 0 END) AS success_cases,
        SUM(CASE WHEN e.status = 'error' THEN 1 ELSE 0 END) AS failed_cases,
        AVG(CASE WHEN e.status = 'success' THEN e.total_score ELSE NULL END) AS avg_score,
        MAX(e.created_at) AS created_at
      FROM eval_history e
      JOIN skills s ON e.skill_id = s.id
      GROUP BY COALESCE(e.job_id, e.id), e.skill_id
      ORDER BY created_at DESC LIMIT 100
    `).all() as {
      job_key: string; skill_id: string; skill_name: string
      total_cases: number; success_cases: number; failed_cases: number
      avg_score: number | null; created_at: number
    }[]).map(r => ({
      id: r.job_key,
      type: 'eval' as const,
      skillId: r.skill_id,
      skillName: r.skill_name,
      jobId: r.job_key,
      totalCases: r.total_cases,
      successCases: r.success_cases,
      failedCases: r.failed_cases,
      avgJobScore: r.avg_score ?? undefined,
      status: r.failed_cases > 0 ? (r.success_cases === 0 ? 'error' : 'success') : 'success' as 'success' | 'error',
      createdAt: r.created_at
    }))

    const evoJobs: JobEntry[] = filter === 'eval' ? [] : (db.prepare(`
      SELECT sk.id, sk.name, sk.evolution_engine, sk.parent_skill_id,
             p.name parent_name,
             AVG(e.total_score) avg_score,
             COUNT(e.id) eval_count,
             AVG(pe.total_score) parent_avg_score,
             sk.installed_at created_at
      FROM skills sk
      LEFT JOIN skills p ON sk.parent_skill_id = p.id
      LEFT JOIN eval_history e ON e.skill_id = sk.id
      LEFT JOIN eval_history pe ON pe.skill_id = sk.parent_skill_id
      WHERE sk.evolution_engine IS NOT NULL OR sk.parent_skill_id IS NOT NULL
      GROUP BY sk.id
      ORDER BY sk.installed_at DESC LIMIT 50
    `).all() as {
      id: string; name: string; evolution_engine: string; parent_skill_id: string | null
      parent_name: string | null; avg_score: number | null; eval_count: number
      parent_avg_score: number | null; created_at: number
    }[]).map(r => ({
      id: r.id,
      type: 'evo' as const,
      skillId: r.id,
      skillName: r.name,
      engine: r.evolution_engine as JobEntry['engine'],
      parentSkillId: r.parent_skill_id ?? undefined,
      parentSkillName: r.parent_name ?? undefined,
      avgScore: r.avg_score ?? undefined,
      parentAvgScore: r.parent_avg_score ?? undefined,
      evalCount: r.eval_count,
      createdAt: r.created_at
    }))

    return [...evalJobs, ...evoJobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 150)
  })
}
