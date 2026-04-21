import { useEffect, useState } from 'react'
import type { Skill, TestCase } from '../../../shared/types'

export default function TestCasePage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [form, setForm] = useState({ name: '', input: '', judgeType: 'llm' as TestCase['judgeType'], judgeParam: '' })
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    window.api.skills.getAll().then(setSkills)
  }, [])

  useEffect(() => {
    if (!selectedSkill) { setTestCases([]); return }
    window.api.testcases.getBySkill(selectedSkill).then(setTestCases)
  }, [selectedSkill])

  const handleAdd = async () => {
    if (!selectedSkill || !form.name.trim() || !form.input.trim()) return
    setAdding(true)
    const tc = await window.api.testcases.create({ skillId: selectedSkill, ...form })
    setTestCases((prev) => [...prev, tc])
    setForm({ name: '', input: '', judgeType: 'llm', judgeParam: '' })
    setAdding(false)
  }

  const handleDelete = async (id: string) => {
    await window.api.testcases.delete(id)
    setTestCases((prev) => prev.filter((tc) => tc.id !== id))
  }

  return (
    <div>
      <div className="page-header">
        <h1>TestCase</h1>
        <select value={selectedSkill} onChange={(e) => setSelectedSkill(e.target.value)}>
          <option value="">Select a Skill...</option>
          {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {selectedSkill && (
        <div className="tc-layout">
          <div className="tc-form card">
            <h2>New Test Case</h2>
            <input
              placeholder="Name..."
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ width: '100%', marginBottom: 10 }}
            />
            <textarea
              rows={4}
              placeholder="Input..."
              value={form.input}
              onChange={(e) => setForm((f) => ({ ...f, input: e.target.value }))}
              style={{ width: '100%', resize: 'vertical', marginBottom: 10 }}
            />
            <select
              value={form.judgeType}
              onChange={(e) => setForm((f) => ({ ...f, judgeType: e.target.value as TestCase['judgeType'] }))}
              style={{ marginBottom: 10 }}
            >
              <option value="llm">LLM Judge</option>
              <option value="grep">Grep</option>
              <option value="command">Command</option>
            </select>
            <input
              placeholder="Judge param (optional)..."
              value={form.judgeParam}
              onChange={(e) => setForm((f) => ({ ...f, judgeParam: e.target.value }))}
              style={{ width: '100%', marginBottom: 10 }}
            />
            <button className="btn btn-primary" onClick={handleAdd} disabled={adding}>
              {adding ? 'Adding...' : 'Add Test Case'}
            </button>
          </div>

          <div className="tc-list">
            <h2>Test Cases ({testCases.length})</h2>
            {testCases.length === 0 ? (
              <p className="text-muted">No test cases yet.</p>
            ) : (
              testCases.map((tc) => (
                <div key={tc.id} className="tc-item card">
                  <div className="tc-item-header">
                    <strong>{tc.name}</strong>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="judge-badge">{tc.judgeType}</span>
                      <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleDelete(tc.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="tc-input">{tc.input}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .page-header h1 { font-size: 24px; font-weight: 700; }
        .text-muted { color: var(--text-muted); font-size: 14px; }
        .tc-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
        .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
        .tc-list h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
        .tc-item { margin-bottom: 12px; }
        .tc-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .judge-badge { background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; font-size: 11px; color: var(--text-muted); }
        .tc-input { font-size: 13px; color: var(--text-muted); white-space: pre-wrap; }
      `}</style>
    </div>
  )
}
