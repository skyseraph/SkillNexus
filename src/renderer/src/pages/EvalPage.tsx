import { useEffect, useState } from 'react'
import type { Skill, EvalResult, TestCase } from '../../../shared/types'

export default function EvalPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<EvalResult[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')

  useEffect(() => {
    window.api.skills.getAll().then(setSkills)
  }, [])

  useEffect(() => {
    if (!selectedSkill) { setTestCases([]); setSelectedTcIds(new Set()); return }
    window.api.testcases.getBySkill(selectedSkill).then((tcs) => {
      setTestCases(tcs)
      setSelectedTcIds(new Set(tcs.map((tc) => tc.id)))
    })
    window.api.eval.history(selectedSkill).then(setHistory)
  }, [selectedSkill])

  useEffect(() => {
    const cleanup = window.api.eval.onProgress((data) => {
      setProgress(data.progress)
      setProgressMsg(data.message)
      if (data.progress >= 100) {
        setRunning(false)
        // Refresh history after eval completes
        if (selectedSkill) window.api.eval.history(selectedSkill).then(setHistory)
      }
    })
    return cleanup
  }, [selectedSkill])

  const toggleTc = (id: string) => {
    setSelectedTcIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleRunEval = async () => {
    if (!selectedSkill) return
    if (selectedTcIds.size === 0) {
      alert('Please select at least one test case.')
      return
    }
    setRunning(true)
    setProgress(0)
    setProgressMsg('')
    // PROD-02: pass actual selected test case IDs
    await window.api.eval.start(selectedSkill, [...selectedTcIds])
  }

  return (
    <div>
      <div className="page-header">
        <h1>Eval</h1>
        <div className="eval-controls">
          <select value={selectedSkill} onChange={(e) => setSelectedSkill(e.target.value)}>
            <option value="">Select a Skill...</option>
            {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            className="btn btn-primary"
            onClick={handleRunEval}
            disabled={!selectedSkill || running || selectedTcIds.size === 0}
          >
            {running ? `${progressMsg || 'Running...'} ${progress}%` : `Run Eval (${selectedTcIds.size})`}
          </button>
        </div>
      </div>

      {selectedSkill && testCases.length === 0 && (
        <div className="info-banner">
          No test cases for this Skill yet. Add test cases in the TestCase tab first.
        </div>
      )}

      {testCases.length > 0 && (
        <div className="tc-selector">
          <div className="tc-selector-header">
            <h2>Test Cases</h2>
            <div className="tc-bulk-actions">
              <button className="btn btn-ghost" onClick={() => setSelectedTcIds(new Set(testCases.map(t => t.id)))}>Select all</button>
              <button className="btn btn-ghost" onClick={() => setSelectedTcIds(new Set())}>Deselect all</button>
            </div>
          </div>
          <div className="tc-list">
            {testCases.map((tc) => (
              <label key={tc.id} className={`tc-row ${selectedTcIds.has(tc.id) ? 'selected' : ''}`}>
                <input type="checkbox" checked={selectedTcIds.has(tc.id)} onChange={() => toggleTc(tc.id)} />
                <span className="tc-name">{tc.name}</span>
                <span className="judge-badge">{tc.judgeType}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {running && (
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span className="progress-label">{progressMsg}</span>
        </div>
      )}

      {history.length > 0 && (
        <div className="eval-history">
          <h2>History</h2>
          {history.map((r) => (
            <div key={r.id} className="eval-result-card">
              <div className="result-header">
                <span className={`status-badge ${r.status}`}>{r.status}</span>
                <span className="score">Score: {r.totalScore.toFixed(1)}</span>
                <span className="text-muted text-sm">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              {Object.keys(r.scores).length > 0 && (
                <div className="scores-grid">
                  {Object.entries(r.scores).map(([dim, s]) => (
                    <div key={dim} className="score-item">
                      <span className="dim-name">{dim}</span>
                      <span className="dim-score">{s.score}/10</span>
                    </div>
                  ))}
                </div>
              )}
              {r.status === 'error' && (
                <div className="error-detail">{r.output}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .page-header h1 { font-size: 24px; font-weight: 700; }
        .eval-controls { display: flex; gap: 12px; align-items: center; }
        .info-banner { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; color: var(--text-muted); margin-bottom: 24px; font-size: 14px; }
        .tc-selector { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 24px; }
        .tc-selector-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .tc-selector-header h2 { font-size: 16px; font-weight: 600; }
        .tc-bulk-actions { display: flex; gap: 8px; }
        .tc-list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
        .tc-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .tc-row:hover { background: var(--surface2); }
        .tc-row.selected { background: rgba(108,99,255,0.1); }
        .tc-name { flex: 1; }
        .judge-badge { background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 7px; font-size: 11px; color: var(--text-muted); }
        .progress-bar-wrap { position: relative; background: var(--surface); border-radius: var(--radius); height: 8px; margin-bottom: 24px; overflow: hidden; }
        .progress-bar { height: 100%; background: var(--accent); transition: width 0.3s; border-radius: var(--radius); }
        .progress-label { position: absolute; top: 12px; left: 0; font-size: 11px; color: var(--text-muted); }
        .text-muted { color: var(--text-muted); }
        .text-sm { font-size: 12px; }
        .eval-history h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
        .eval-result-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; }
        .result-header { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
        .status-badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
        .status-badge.success { background: rgba(74, 222, 128, 0.15); color: var(--success); }
        .status-badge.error { background: rgba(248, 113, 113, 0.15); color: var(--danger); }
        .score { font-size: 14px; font-weight: 600; color: var(--accent); }
        .scores-grid { display: flex; flex-wrap: wrap; gap: 12px; }
        .score-item { display: flex; flex-direction: column; gap: 2px; background: var(--surface2); padding: 8px 12px; border-radius: 6px; }
        .dim-name { font-size: 11px; color: var(--text-muted); text-transform: capitalize; }
        .dim-score { font-size: 14px; font-weight: 600; }
        .error-detail { margin-top: 8px; font-size: 12px; color: var(--danger); background: rgba(248,113,113,0.08); border-radius: 6px; padding: 8px 12px; }
      `}</style>
    </div>
  )
}
