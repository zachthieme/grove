import { useState } from 'react'
import { useOrg } from '../store/OrgContext'
import styles from './UnparentedBar.module.css'

export default function UnparentedBar() {
  const { working, toggleSelect } = useOrg()
  const [collapsed, setCollapsed] = useState(false)

  // People with direct reports are tree roots, not orphans
  const hasReports = new Set<string>()
  for (const p of working) {
    if (p.managerId) hasReports.add(p.managerId)
  }

  const orphans = working.filter((p) => !p.managerId && !hasReports.has(p.id))

  if (orphans.length === 0) return null

  return (
    <div className={styles.notice}>
      <button
        className={styles.toggle}
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? '▸' : '▾'} {orphans.length} unparented {orphans.length === 1 ? 'person' : 'people'}
      </button>
      {!collapsed && (
        <div className={styles.list}>
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
      )}
    </div>
  )
}
