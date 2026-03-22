import { useState, useEffect, useRef } from 'react'
import { useOrg } from '../store/OrgContext'
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
  const { snapshots, currentSnapshotName, saveSnapshot, loadSnapshot, deleteSnapshot } = useOrg()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = currentSnapshotName
    ? (currentSnapshotName === '__original__' ? 'Original' : currentSnapshotName)
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

  const handleDelete = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    await deleteSnapshot(name)
  }

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        title={`Snapshot: ${label}`}
      >
        {label} ▾
      </button>
      {open && (
        <div className={styles.menu}>
          <button className={styles.menuItem} onClick={handleSaveAs}>
            Save As...
          </button>
          <div className={styles.separator} />
          <button
            className={`${styles.menuItem} ${currentSnapshotName === '__original__' ? styles.active : ''}`}
            onClick={() => handleLoad('__original__')}
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
                onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(e as unknown as React.MouseEvent, snap.name) }}
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
