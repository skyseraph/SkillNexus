import type { Toast } from '../hooks/useToast'

interface Props {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => onDismiss(t.id)}>
          <span className="toast-icon">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : 'ℹ'}
          </span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
      <style>{`
        .toast-container { position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 9999; pointer-events: none; }
        .toast { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: var(--radius); font-size: 13px; font-weight: 500; min-width: 220px; max-width: 380px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); pointer-events: all; cursor: pointer; animation: toast-in 0.2s ease; }
        @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .toast-success { background: #1a2e1a; border: 1px solid var(--success); color: var(--success); }
        .toast-error { background: #2e1a1a; border: 1px solid var(--danger); color: var(--danger); }
        .toast-info { background: var(--surface2); border: 1px solid var(--border); color: var(--text); }
        .toast-icon { font-size: 14px; flex-shrink: 0; }
        .toast-msg { flex: 1; line-height: 1.4; }
      `}</style>
    </div>
  )
}
