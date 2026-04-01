import { useOrgData } from '../store/OrgContext'
import styles from './AutosaveBanner.module.css'

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function AutosaveBanner() {
  const { autosaveAvailable, restoreAutosave, dismissAutosave } = useOrgData()

  if (!autosaveAvailable) return null

  const time = formatTime(autosaveAvailable.timestamp)

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.message}>
        Restore previous session?{time ? ` (saved at ${time})` : ''}
      </span>
      <button className={styles.restoreBtn} onClick={restoreAutosave} title="Restore autosaved data" aria-label="Restore autosaved data">
        Restore
      </button>
      <button className={styles.dismissBtn} onClick={dismissAutosave} title="Dismiss and start fresh" aria-label="Dismiss autosave recovery">
        Dismiss
      </button>
    </div>
  )
}
