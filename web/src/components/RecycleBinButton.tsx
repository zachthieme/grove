import { useCallback } from 'react'
import { useOrgData, useUI, useSelection } from '../store/OrgContext'
import styles from './RecycleBinButton.module.css'

export default function RecycleBinButton() {
  const { recycled } = useOrgData()
  const { binOpen, setBinOpen: rawSetBinOpen, showPrivate } = useUI()
  const { clearSelection } = useSelection()

  const visibleCount = showPrivate ? recycled.length : recycled.filter((p) => !p.private).length

  // Preserve cross-context behavior: opening bin clears selection
  const setBinOpen = useCallback((open: boolean) => {
    rawSetBinOpen(open)
    if (open) {
      clearSelection()
    }
  }, [rawSetBinOpen, clearSelection])
  return (
    <button
      onClick={() => setBinOpen(!binOpen)}
      className={`${styles.btn} ${binOpen ? styles.open : styles.closed}`}
      aria-label={`Recycle bin${visibleCount > 0 ? ` (${visibleCount} items)` : ''}`}
      aria-pressed={binOpen}
    >
      🗑
      {visibleCount > 0 && (
        <span className={styles.badge}>
          {visibleCount}
        </span>
      )}
    </button>
  )
}
