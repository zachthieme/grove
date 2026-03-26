import { useCallback } from 'react'
import { useOrgData, useUI, useSelection } from '../store/OrgContext'
import styles from './RecycleBinButton.module.css'

export default function RecycleBinButton() {
  const { recycled } = useOrgData()
  const { binOpen, setBinOpen: rawSetBinOpen } = useUI()
  const { clearSelection } = useSelection()

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
      aria-label={`Recycle bin${recycled.length > 0 ? ` (${recycled.length} items)` : ''}`}
      aria-pressed={binOpen}
    >
      🗑
      {recycled.length > 0 && (
        <span className={styles.badge}>
          {recycled.length}
        </span>
      )}
    </button>
  )
}
