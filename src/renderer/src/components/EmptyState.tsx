interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px', textAlign: 'center', gap: 8
    }}>
      <span style={{ fontSize: 32, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
      {description && (
        <span style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 280 }}>{description}</span>
      )}
      {action && (
        <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
