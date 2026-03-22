import { useOrg } from '../store/OrgContext'

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 20px',
  background: 'var(--grove-gold-light)',
  borderBottom: '1px solid var(--grove-gold)',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-primary)',
}

const btnBase: React.CSSProperties = {
  padding: '4px 14px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 4,
  cursor: 'pointer',
  letterSpacing: '0.01em',
  transition: 'all 0.12s ease',
}

export default function AutosaveBanner() {
  const { autosaveAvailable, restoreAutosave, dismissAutosave } = useOrg()

  if (!autosaveAvailable) return null

  const time = formatTime(autosaveAvailable.timestamp)

  return (
    <div style={bannerStyle}>
      <span style={{ flex: 1 }}>
        Restore previous session?{time ? ` (saved at ${time})` : ''}
      </span>
      <button
        style={{ ...btnBase, background: 'var(--grove-green)', color: '#fff', border: 'none' }}
        onClick={restoreAutosave}
      >
        Restore
      </button>
      <button
        style={{ ...btnBase, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-medium)' }}
        onClick={dismissAutosave}
      >
        Dismiss
      </button>
    </div>
  )
}
