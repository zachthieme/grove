import { useMemo } from 'react'
import { useOrgData, useUI } from '../store/OrgContext'
import styles from './Breadcrumbs.module.css'

export default function Breadcrumbs() {
  const { working } = useOrgData()
  const { headPersonId, setHead } = useUI()

  const breadcrumbs = useMemo(() => {
    if (!headPersonId) return []
    const byId = new Map(working.map((p) => [p.id, p]))
    const path: { id: string; name: string }[] = []
    let current = byId.get(headPersonId)
    while (current) {
      path.unshift({ id: current.id, name: current.name })
      current = current.managerId ? byId.get(current.managerId) : undefined
    }
    return path
  }, [headPersonId, working])

  if (!headPersonId) return null

  return (
    <div className={styles.bar}>
      <button onClick={() => setHead(null)} className={styles.navBtn}>
        All
      </button>
      {breadcrumbs.map((crumb, i) => {
        const isLast = i === breadcrumbs.length - 1
        return (
          <span key={crumb.id} className={styles.crumb}>
            <span className={styles.separator}>{'\u203A'}</span>
            {isLast ? (
              <span className={styles.current}>{crumb.name}</span>
            ) : (
              <button onClick={() => setHead(crumb.id)} className={styles.navBtn}>
                {crumb.name}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
