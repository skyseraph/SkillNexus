import { useState } from 'react'
import type { Skill } from '../../../shared/types'

export default function StudioPage() {
  const [prompt, setPrompt] = useState('')
  const [generated, setGenerated] = useState('')
  const [skillName, setSkillName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState<Skill | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setGenerated('')
    setInstalled(null)
    const content = await window.api.studio.generate(prompt)
    setGenerated(content)
    setGenerating(false)
  }

  const handleInstall = async () => {
    if (!generated || !skillName.trim()) return
    setInstalling(true)
    const skill = await window.api.studio.install(generated, skillName)
    setInstalled(skill)
    setInstalling(false)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Studio</h1>
        <p className="subtitle">Generate Skills with AI</p>
      </div>

      <div className="studio-layout">
        <div className="studio-input">
          <h2>Describe your Skill</h2>
          <textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g. A skill that summarizes meeting notes into action items with owners and deadlines..."
            style={{ width: '100%', resize: 'vertical' }}
          />
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
          >
            {generating ? 'Generating...' : 'Generate Skill'}
          </button>
        </div>

        {generated && (
          <div className="studio-output">
            <h2>Generated Skill</h2>
            <pre className="code-preview">{generated}</pre>
            <div className="install-row">
              <input
                placeholder="Skill name..."
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={handleInstall}
                disabled={installing || !skillName.trim()}
              >
                {installing ? 'Installing...' : 'Install Skill'}
              </button>
            </div>
            {installed && (
              <div className="success-banner">
                ✅ Skill "{installed.name}" installed successfully!
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .page-header { margin-bottom: 24px; }
        .page-header h1 { font-size: 24px; font-weight: 700; }
        .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
        .studio-layout { display: flex; flex-direction: column; gap: 24px; }
        .studio-input, .studio-output { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
        .studio-input h2, .studio-output h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
        .studio-input .btn { margin-top: 12px; }
        .code-preview { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; margin-bottom: 12px; color: var(--text); font-family: 'Courier New', monospace; }
        .install-row { display: flex; gap: 12px; align-items: center; }
        .success-banner { margin-top: 12px; background: rgba(74,222,128,0.1); border: 1px solid var(--success); border-radius: var(--radius); padding: 12px 16px; color: var(--success); font-size: 14px; }
      `}</style>
    </div>
  )
}
