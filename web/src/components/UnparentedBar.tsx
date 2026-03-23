import { useOrg } from '../store/OrgContext'
import styles from './UnparentedBar.module.css'

export default function UnparentedBar() {
  const { working, toggleSelect } = useOrg()

  const orphans = working.filter((p) => !p.managerId)

  if (orphans.length <= 1) return null

  return (
    <div className={styles.bar}>
      <strong>{orphans.length} root/unparented:</strong>
      {orphans.map((p) => (
        <button
          key={p.id}
          onClick={() => toggleSelect(p.id, false)}
          className={styles.orphanBtn}
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}
