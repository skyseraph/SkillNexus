import { useEffect, useState, useCallback, useRef } from 'react'
import type { SkillRankEntry } from '../../../shared/types'
import { useT } from '../i18n/useT'

const DIM_COLORS: Record<string, string> = {
  correctness:           '#6c63ff',
  instruction_following: '#00d4aa',
  safety:                '#ef4444',
  completeness:          '#f59e0b',
  robustness:            '#8b5cf6',
  executability:         '#06b6d4',
  cost_awareness:        '#10b981',
  maintainability:       '#f97316',
  overall:               '#6c63ff'
}

const DIMS = ['overall', 'correctness', 'instruction_following', 'safety', 'completeness', 'robustness', 'executability', 'cost_awareness', 'maintainability']
const MEDALS = ['🥇', '🥈', '🥉']

type RankedSkill = SkillRankEntry & {
  scores: Record<string, number>  // normalized for existing UI
}

// ── Mini sparkline ────────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
  const w = 56, h = 24, pad = 2
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (v - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {(() => {
        const last = pts[pts.length - 1].split(',')
        return <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
      })()}
    </svg>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, color, max = 10 }: { score: number; color: string; max?: number }) {
  return (
    <div className="score-bar-wrap">
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${(score / max) * 100}%`, background: color }} />
      </div>
      <span className="score-bar-val" style={{ color }}>{score.toFixed(1)}</span>
    </div>
  )
}

// ── Main TrendingPage ─────────────────────────────────────────────────────────

export default function TrendingPage({ onNavigate }: { onNavigate?: (page: string, skillId?: string) => void }) {
  const t = useT()
  const DIM_LABELS: Record<string, string> = {
    overall:               t('trending.dim.overall'),
    correctness:           t('eval.dim.correctness'),
    instruction_following: t('eval.dim.instruction_following'),
    safety:                t('eval.dim.safety'),
    completeness:          t('eval.dim.completeness'),
    robustness:            t('eval.dim.robustness'),
    executability:         t('eval.dim.executability'),
    cost_awareness:        t('eval.dim.cost_awareness'),
    maintainability:       t('eval.dim.maintainability'),
  }
  const [ranked, setRanked] = useState<RankedSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDim, setActiveDim] = useState('overall')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const entries = await window.api.eval.historyAll()
      const rankedList: RankedSkill[] = entries.map((e) => ({
        ...e,
        scores: {
          overall:               e.avgTotal,
          correctness:           e.avgCorrectness,
          instruction_following: e.avgInstructionFollowing,
          safety:                e.avgSafety,
          completeness:          e.avgCompleteness,
          robustness:            e.avgRobustness,
          executability:         e.avgExecutability,
          cost_awareness:        e.avgCostAwareness,
          maintainability:       e.avgMaintainability
        }
      }))
      setRanked(rankedList)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => { load() }, [load])

  const sorted = [...ranked].sort((a, b) => (b.scores[activeDim] ?? 0) - (a.scores[activeDim] ?? 0))
  const color = DIM_COLORS[activeDim] ?? '#6c63ff'
  const withEvals = sorted.filter((s) => s.evalCount > 0)
  const noEvals = sorted.filter((s) => s.evalCount === 0)
  const totalEvals = ranked.reduce((s, r) => s + r.evalCount, 0)

  return (
    <div className="trending-root">
      <div className="trending-header">
        <div>
          <h1>Trending</h1>
          <p className="subtitle">{t('trending.subtitle')}</p>
        </div>
        <button className="btn btn-ghost btn-sm refresh-btn" onClick={load} disabled={loading}>
          {loading ? t('common.loading') : t('common.refresh')}
        </button>
      </div>

      {/* Stats bar */}
      {!loading && ranked.length > 0 && (
        <div className="trending-stats">
          <div className="trending-stat">
            <span className="trending-stat-val">{ranked.length}</span>
            <span className="trending-stat-label">{t('trending.evaluated')}</span>
          </div>
          <div className="trending-stat">
            <span className="trending-stat-val">{totalEvals}</span>
            <span className="trending-stat-label">{t('trending.eval_count')}</span>
          </div>
          {withEvals.length > 0 && (
            <div className="trending-stat">
              <span className="trending-stat-val" style={{ color: DIM_COLORS.overall }}>
                {(withEvals.reduce((s, r) => s + r.scores.overall, 0) / withEvals.length).toFixed(1)}
              </span>
              <span className="trending-stat-label">{t('trending.avg_score')}</span>
            </div>
          )}
          {withEvals[0] && (
            <div className="trending-stat">
              <span className="trending-stat-val" style={{ color: DIM_COLORS.overall, fontSize: 13 }}>{withEvals[0].skillName}</span>
              <span className="trending-stat-label">{t('trending.top_skill')}</span>
            </div>
          )}
        </div>
      )}

      {/* Dimension tabs */}
      <div className="dim-tabs">
        {DIMS.map((d) => (
          <button
            key={d}
            className={`dim-tab ${activeDim === d ? 'active' : ''}`}
            style={activeDim === d ? { borderColor: DIM_COLORS[d], color: DIM_COLORS[d] } : {}}
            onClick={() => setActiveDim(d)}
          >
            {DIM_LABELS[d] ?? d}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">{t('trending.loading')}</div>
      ) : withEvals.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>{t('trending.empty')}<button className="link-btn" onClick={() => onNavigate?.('eval')}>{t('trending.go_eval')}</button></p>
        </div>
      ) : (
        <div className="leaderboard">
          {withEvals.map((skill, idx) => {
            const dimScore = skill.scores[activeDim] ?? 0
            const isExpanded = expandedId === skill.skillId
            const trendDelta = skill.trend.length >= 2
              ? skill.trend[skill.trend.length - 1] - skill.trend[0]
              : null

            return (
              <div key={skill.skillId} className={`rank-card ${idx < 3 ? 'podium' : ''} ${isExpanded ? 'expanded' : ''}`}
                style={idx < 3 ? { borderColor: color + '55' } : {}}>
                <div className="rank-main" onClick={() => setExpandedId(isExpanded ? null : skill.skillId)}>
                  {/* Medal / rank */}
                  <div className="rank-pos">
                    {idx < 3
                      ? <span className="medal">{MEDALS[idx]}</span>
                      : <span className="rank-num">#{idx + 1}</span>}
                  </div>

                  {/* Info */}
                  <div className="rank-info">
                    <div className="rank-name">{skill.skillName}{skill.skillType === 'agent' && <span className="rank-agent-badge">Agent</span>}</div>
                    <div className="rank-meta">
                      <span className="eval-count">{skill.evalCount} {t('trending.eval_count_suffix')}</span>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div className="rank-spark">
                    <Sparkline values={skill.trend} color={color} />
                    {trendDelta !== null && (
                      <span className={`trend-delta ${trendDelta > 0 ? 'pos' : trendDelta < 0 ? 'neg' : 'neu'}`}>
                        {trendDelta > 0 ? '↑' : trendDelta < 0 ? '↓' : '→'}
                        {Math.abs(trendDelta).toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* Score */}
                  <div className="rank-score-col">
                    <ScoreBar score={dimScore} color={color} />
                  </div>

                  <span className="expand-icon">{isExpanded ? '▾' : '▸'}</span>
                </div>

                {/* Expanded: all dimensions */}
                {isExpanded && (
                  <div className="rank-detail">
                    <div className="detail-dims">
                      {DIMS.filter((d) => d !== 'overall' && d in skill.scores).map((d) => (
                        <div key={d} className="detail-dim-row">
                          <span className="detail-dim-name" style={{ color: DIM_COLORS[d] }}>{DIM_LABELS[d] ?? d}</span>
                          <div className="detail-bar-track">
                            <div className="detail-bar-fill" style={{ width: `${(skill.scores[d] / 10) * 100}%`, background: DIM_COLORS[d] }} />
                          </div>
                          <span className="detail-dim-val" style={{ color: DIM_COLORS[d] }}>{skill.scores[d].toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Skills with no evals */}
          {noEvals.length > 0 && (
            <div className="no-evals-section">
              <div className="no-evals-label">{t('trending.unevaluated')} ({noEvals.length})</div>
              {noEvals.map((skill) => (
                <div key={skill.skillId} className="rank-card unranked">
                  <div className="rank-main">
                    <div className="rank-pos"><span className="rank-num">—</span></div>
                    <div className="rank-info">
                      <div className="rank-name">{skill.skillName}{skill.skillType === 'agent' && <span className="rank-agent-badge">Agent</span>}</div>
                      <div className="rank-meta">
                      </div>
                    </div>
                    <span className="no-eval-hint">
                      {onNavigate
                        ? <button className="link-btn" onClick={() => onNavigate('eval', skill.skillId)}>{t('common.go_eval_arrow')}</button>
                        : t('trending.run_hint')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .trending-root { display: flex; flex-direction: column; gap: 20px; }
        .trending-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .trending-header h1 { font-size: 24px; font-weight: 700; }
        .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
        .refresh-btn { font-size: 13px; }

        /* Stats */
        .trending-stats { display: flex; gap: 12px; flex-wrap: wrap; }
        .trending-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 16px; min-width: 100px; }
        .trending-stat-val { display: block; font-size: 20px; font-weight: 700; color: var(--text); }
        .trending-stat-label { display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; }

        /* Dim tabs */
        .dim-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
        .dim-tab { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 500; cursor: pointer; transition: all var(--transition); }
        .dim-tab:hover { color: var(--text); border-color: var(--text-muted); }
        .dim-tab.active { background: var(--surface2); font-weight: 700; }

        /* States */
        .loading-state { color: var(--text-muted); font-size: 14px; padding: 40px 0; text-align: center; }
        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); text-align: center; }
        .empty-icon { font-size: 36px; }

        /* Leaderboard */
        .leaderboard { display: flex; flex-direction: column; gap: 8px; }
        .rank-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; transition: border-color var(--transition); }
        .rank-card.podium { }
        .rank-card.unranked { opacity: 0.6; }
        .rank-main { display: flex; align-items: center; gap: 14px; padding: 14px 18px; cursor: pointer; transition: background var(--transition); }
        .rank-main:hover { background: rgba(108,99,255,0.04); }

        .rank-pos { width: 36px; flex-shrink: 0; text-align: center; }
        .medal { font-size: 22px; }
        .rank-num { font-size: 14px; font-weight: 700; color: var(--text-muted); }

        .rank-info { flex: 1; min-width: 0; }
        .rank-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
        .rank-agent-badge { font-size: 10px; font-weight: 700; color: var(--accent); border: 1px solid var(--accent); border-radius: 3px; padding: 0 4px; margin-left: 6px; vertical-align: middle; }
        .rank-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .version { font-size: 11px; color: var(--text-muted); }
        .tag { background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; font-size: 10px; color: var(--text-muted); }
        .eval-count { font-size: 11px; color: var(--text-muted); }

        .rank-spark { display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; }
        .trend-delta { font-size: 10px; font-weight: 700; }
        .trend-delta.pos { color: var(--success); }
        .trend-delta.neg { color: var(--danger); }
        .trend-delta.neu { color: var(--text-muted); }

        .rank-score-col { width: 120px; flex-shrink: 0; }
        .score-bar-wrap { display: flex; align-items: center; gap: 8px; }
        .score-bar-track { flex: 1; height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
        .score-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
        .score-bar-val { font-size: 14px; font-weight: 700; width: 32px; text-align: right; flex-shrink: 0; }

        .expand-icon { font-size: 11px; color: var(--text-muted); width: 12px; flex-shrink: 0; }

        /* Expanded detail */
        .rank-detail { padding: 12px 18px 14px; border-top: 1px solid var(--border); background: var(--bg); }
        .detail-dims { display: flex; flex-direction: column; gap: 8px; }
        .detail-dim-row { display: flex; align-items: center; gap: 10px; }
        .detail-dim-name { font-size: 12px; font-weight: 600; width: 110px; flex-shrink: 0; }
        .detail-bar-track { flex: 1; height: 5px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
        .detail-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
        .detail-dim-val { font-size: 12px; font-weight: 700; width: 28px; text-align: right; flex-shrink: 0; }

        /* No evals section */
        .no-evals-section { margin-top: 8px; }
        .no-evals-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 6px; padding: 0 4px; }
        .no-eval-hint { font-size: 12px; color: var(--text-muted); margin-left: auto; }
        .link-btn { background: none; border: none; color: var(--accent); font-size: inherit; cursor: pointer; padding: 0; text-decoration: underline; }
        .link-btn:hover { opacity: 0.8; }
      `}</style>
    </div>
  )
}
