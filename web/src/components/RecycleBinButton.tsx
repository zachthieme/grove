import { useOrg } from '../store/OrgContext'
import styles from './RecycleBinButton.module.css'

export default function RecycleBinButton() {
  const { recycled, binOpen, setBinOpen } = useOrg()
  return (
    <button
      onClick={() => setBinOpen(!binOpen)}
      className={`${styles.btn} ${binOpen ? styles.open : styles.closed}`}
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
