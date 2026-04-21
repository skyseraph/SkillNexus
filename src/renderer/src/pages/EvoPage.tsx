import { useEffect, useState } from 'react'
import type { Skill, EvalResult } from '../../../shared/types'

export default function EvoPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [history, setHistory] = useState<EvalResult[]>([])

  useEffect(() => {
    window.api.skills.getAll().then(setSkills)
  }, [])

  useEffect(() => {
    if (!selectedSkill) { setHistory([]); return }
    window.api.eval.history(selectedSkill).then(setHistory)
  }, [selectedSkill])

  const trend = history.length >= 2
    ? history[0].totalScore - history[history.length - 1].totalScore
    : null

  return (
    <div>
      <div className="page-header">
        <h1>Evo</h1>
        <select value={selectedSkill} onChange={(e) => setSelectedSkill(e.target.value)}>
          <option value="">Select a Skill...</option>
          {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {selectedSkill && (
        <>
          {trend !== null && (
            <div className={`trend-banner ${trend > 0 ? 'positive' : trend < 0 ? 'negative' : 'neutral'}`}>
              {trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️'} Score trend: {trend > 0 ? '+' : ''}{trend.toFixed(2)} over {history.length} evaluations
            </div>
          )}

          <div className="timeline">
            <h2>Evaluation Timeline</h2>
            {history.length === 0 ? (
              <p className="text-muted">No evaluations yet. Run an Eval to track evolution.</p>
            ) : (
              history.map((r, idx) => (
                <div key={r.id} className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span className="timeline-date">{new Date(r.createdAt).toLocaleString()}</span>
                      <span className="timeline-score">{r.totalScore.toFixed(1)}/10</span>
                      {idx === 0 && <span className="badge-latest">Latest</span>}
                    </div>
                    <div className="scores-row">
                      {Object.entries(r.scores).map(([dim, s]) => (
                        <span key={dim} className="mini-score">
                          {dim}: {s.score}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .page-header h1 { font-size: 24px; font-weight: 700; }
        .text-muted { color: var(--text-muted); font-size: 14px; }
        .trend-banner { padding: 12px 16px; border-radius: var(--radius); margin-bottom: 20px; font-size: 14px; font-weight: 500; }
        .trend-banner.positive { background: rgba(74,222,128,0.1); border: 1px solid var(--success); color: var(--success); }
        .trend-banner.negative { background: rgba(248,113,113,0.1); border: 1px solid var(--danger); color: var(--danger); }
        .trend-banner.neutral { background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); }
        .timeline { }
        .timeline h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
        .timeline-item { display: flex; gap: 16px; margin-bottom: 16px; }
        .timeline-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); flex-shrink: 0; margin-top: 6px; }
        .timeline-content { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; }
        .timeline-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .timeline-date { font-size: 12px; color: var(--text-muted); }
        .timeline-score { font-weight: 700; color: var(--accent); }
        .badge-latest { background: var(--accent); color: #fff; border-radius: 4px; padding: 1px 6px; font-size: 10px; }
        .scores-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .mini-score { font-size: 11px; color: var(--text-muted); background: var(--surface2); padding: 2px 8px; border-radius: 4px; }
      `}</style>
    </div>
  )
}
