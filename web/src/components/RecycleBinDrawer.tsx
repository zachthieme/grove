import { useOrg } from '../store/OrgContext'
import styles from './RecycleBinDrawer.module.css'

export default function RecycleBinDrawer() {
  const { recycled, binOpen, setBinOpen, restore, emptyBin } = useOrg()
  if (!binOpen) return null

  return (
    <div className={styles.drawer} role="complementary" aria-label="Recycle bin">
      <div className={styles.header}>
        <h3>Recycle Bin ({recycled.length})</h3>
        <button className={styles.closeBtn} onClick={() => setBinOpen(false)} aria-label="Close recycle bin">×</button>
      </div>
      <div className={styles.list}>
        {recycled.length === 0 && <p className={styles.empty}>Bin is empty</p>}
        {recycled.map((p) => (
          <div key={p.id} className={styles.card}>
            <div>
              <div className={styles.name}>{p.name}</div>
              <div className={styles.meta}>{p.role} — {p.team}</div>
            </div>
            <button className={styles.restoreBtn} onClick={() => restore(p.id)}>Restore</button>
          </div>
        ))}
      </div>
      {recycled.length > 0 && (
        <div className={styles.footer}>
          <button className={styles.emptyBtn} onClick={() => emptyBin()}>Empty Bin</button>
        </div>
      )}
    </div>
  )
}
