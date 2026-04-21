import { useEffect, useState } from 'react'
import type { Skill } from '../../../shared/types'

interface RankedSkill extends Skill {
  avgScore: number
  evalCount: number
}

export default function TrendingPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [ranked, setRanked] = useState<RankedSkill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const allSkills = await window.api.skills.getAll()
      setSkills(allSkills)

      const rankedList = await Promise.all(
        allSkills.map(async (skill) => {
          const history = await window.api.eval.history(skill.id)
          const avgScore = history.length
            ? history.reduce((sum, r) => sum + r.totalScore, 0) / history.length
            : 0
          return { ...skill, avgScore, evalCount: history.length }
        })
      )

      rankedList.sort((a, b) => b.avgScore - a.avgScore)
      setRanked(rankedList)
      setLoading(false)
    }
    load()
  }, [])

  const MEDALS = ['🥇', '🥈', '🥉']

  return (
    <div>
      <div className="page-header">
        <h1>Trending</h1>
        <p className="subtitle">Skills ranked by average eval score</p>
      </div>

      {loading ? (
        <p className="text-muted">Loading rankings...</p>
      ) : ranked.length === 0 ? (
        <p className="text-muted">No skills installed. Install some skills and run evals to see rankings.</p>
      ) : (
        <div className="leaderboard">
          {ranked.map((skill, idx) => (
            <div key={skill.id} className={`rank-item ${idx < 3 ? 'top' : ''}`}>
              <div className="rank-medal">
                {MEDALS[idx] || <span className="rank-num">#{idx + 1}</span>}
              </div>
              <div className="rank-info">
                <h3>{skill.name}</h3>
                <div className="rank-meta">
                  <span className="version">v{skill.version}</span>
                  {skill.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
              <div className="rank-score-area">
                <div className="rank-score">{skill.avgScore.toFixed(1)}</div>
                <div className="rank-evals">{skill.evalCount} eval{skill.evalCount !== 1 ? 's' : ''}</div>
                <div className="score-bar">
                  <div className="score-fill" style={{ width: `${(skill.avgScore / 10) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .page-header { margin-bottom: 24px; }
        .page-header h1 { font-size: 24px; font-weight: 700; }
        .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
        .text-muted { color: var(--text-muted); }
        .leaderboard { display: flex; flex-direction: column; gap: 12px; }
        .rank-item { display: flex; align-items: center; gap: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; transition: border-color 0.15s; }
        .rank-item.top { border-color: var(--accent); }
        .rank-medal { font-size: 24px; width: 36px; text-align: center; flex-shrink: 0; }
        .rank-num { font-size: 16px; font-weight: 700; color: var(--text-muted); }
        .rank-info { flex: 1; }
        .rank-info h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
        .rank-meta { display: flex; flex-wrap: wrap; gap: 6px; }
        .version { color: var(--text-muted); font-size: 12px; }
        .tag { background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 7px; font-size: 11px; color: var(--text-muted); }
        .rank-score-area { text-align: right; min-width: 100px; }
        .rank-score { font-size: 24px; font-weight: 700; color: var(--accent); }
        .rank-evals { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
        .score-bar { height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
        .score-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.3s; }
      `}</style>
    </div>
  )
}
