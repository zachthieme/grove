import { useOrg, useUI } from '../store/OrgContext'
import styles from './RecycleBinDrawer.module.css'

export default function RecycleBinDrawer() {
  const { recycled, binOpen, setBinOpen, restore, emptyBin } = useOrg()
  const { showPrivate } = useUI()
  if (!binOpen) return null

  const visibleRecycled = showPrivate ? recycled : recycled.filter((p) => !p.private)

  return (
    <div className={styles.drawer} role="complementary" aria-label="Recycle bin" data-testid="recycle-bin-drawer">
      <div className={styles.header}>
        <h3>Recycle Bin ({visibleRecycled.length})</h3>
        <button className={styles.closeBtn} onClick={() => setBinOpen(false)} aria-label="Close recycle bin">×</button>
      </div>
      <div className={styles.list}>
        {visibleRecycled.length === 0 && <p className={styles.empty}>Bin is empty</p>}
        {visibleRecycled.map((p) => (
          <div key={p.id} className={styles.card}>
            <div>
              <div className={styles.name}>
                {p.name}
                {showPrivate && p.private && <span title="Private" style={{ marginLeft: 4, fontSize: 11 }}>{'\u{1F512}'}</span>}
              </div>
              <div className={styles.meta}>{p.role} — {p.team}</div>
            </div>
            <button className={styles.restoreBtn} onClick={() => restore(p.id)}>Restore</button>
          </div>
        ))}
      </div>
      {visibleRecycled.length > 0 && (
        <div className={styles.footer}>
          <button className={styles.emptyBtn} onClick={() => emptyBin()}>Empty Bin</button>
        </div>
      )}
    </div>
  )
}
