/**
 * TelemetryConsentDialog — shown once on first launch.
 * Disappears after user accepts or declines; never re-shown.
 */

import { useState, useEffect } from 'react'

export default function TelemetryConsentDialog() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.api.telemetry.getConsent().then(({ asked }) => {
      if (!asked) setVisible(true)
    }).catch(() => {})
  }, [])

  const handleAccept = () => {
    window.api.telemetry.setConsent(true).catch(() => {})
    setVisible(false)
  }

  const handleDecline = () => {
    window.api.telemetry.setConsent(false).catch(() => {})
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      width: 340, background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
        帮助改进 SkillNexus
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
        我们收集匿名使用数据（功能使用次数、引擎选择等），<strong style={{ color: 'var(--text)' }}>从不收集 Skill 内容、提示词或 API 密钥</strong>。可随时在 Settings 中关闭。
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={handleDecline}
          style={{
            padding: '5px 14px', fontSize: 12, borderRadius: 6,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', cursor: 'pointer'
          }}
        >
          不，谢谢
        </button>
        <button
          onClick={handleAccept}
          style={{
            padding: '5px 14px', fontSize: 12, borderRadius: 6,
            background: 'var(--accent)', border: 'none', color: '#fff',
            cursor: 'pointer', fontWeight: 600
          }}
        >
          同意并继续
        </button>
      </div>
    </div>
  )
}
