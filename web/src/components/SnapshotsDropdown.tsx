import { useState, useRef, useCallback } from 'react'
import { useOrgData, useOrgMutations } from '../store/OrgContext'
import { ORIGINAL_SNAPSHOT } from '../constants'
import { useOutsideClick } from '../hooks/useOutsideClick'
import styles from './SnapshotsDropdown.module.css'

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return iso
  }
}

export default function SnapshotsDropdown() {
  const { snapshots, currentSnapshotName } = useOrgData()
  const { saveSnapshot, loadSnapshot, deleteSnapshot } = useOrgMutations()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useOutsideClick(ref, useCallback(() => setOpen(false), []), open)

  const label = currentSnapshotName
    ? (currentSnapshotName === ORIGINAL_SNAPSHOT ? 'Original' : currentSnapshotName)
    : 'Working'

  const handleSaveAs = async () => {
    const name = prompt('Snapshot name:')
    if (!name) return
    await saveSnapshot(name.trim())
    setOpen(false)
  }

  const handleLoad = async (name: string) => {
    await loadSnapshot(name)
    setOpen(false)
  }

  const handleDelete = async (e: { stopPropagation(): void }, name: string) => {
    e.stopPropagation()
    await deleteSnapshot(name)
  }

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        title={`Snapshot: ${label}`}
        aria-expanded={open}
        aria-label={`Snapshot: ${label}`}
        data-tour="snapshots"
      >
        {label} ▾
      </button>
      {open && (
        <div className={styles.menu}>
          <button className={styles.menuItem} onClick={handleSaveAs} title="Save current state as a snapshot">
            Save As...
          </button>
          <div className={styles.separator} />
          <button
            className={`${styles.menuItem} ${currentSnapshotName === ORIGINAL_SNAPSHOT ? styles.active : ''}`}
            onClick={() => handleLoad(ORIGINAL_SNAPSHOT)}
          >
            <span className={styles.menuItemLabel}>Original</span>
          </button>
          {snapshots.map((snap) => (
            <button
              key={snap.name}
              className={`${styles.menuItem} ${currentSnapshotName === snap.name ? styles.active : ''}`}
              onClick={() => handleLoad(snap.name)}
            >
              <span className={styles.menuItemLabel}>{snap.name}</span>
              <span className={styles.menuItemTime}>{formatTimestamp(snap.timestamp)}</span>
              <span
                className={styles.deleteBtn}
                role="button"
                tabIndex={0}
                onClick={(e) => handleDelete(e, snap.name)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDelete(e, snap.name) } }}
                aria-label={`Delete snapshot ${snap.name}`}
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
