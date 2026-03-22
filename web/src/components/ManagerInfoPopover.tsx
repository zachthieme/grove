import { useEffect } from 'react'
import type { Person } from '../api/types'
import { computeOrgMetrics } from '../hooks/useOrgMetrics'
import styles from './ManagerInfoPopover.module.css'

interface Props {
  personId: string
  working: Person[]
  onClose: () => void
}

export default function ManagerInfoPopover({ personId, working, onClose }: Props) {
  const metrics = computeOrgMetrics(personId, working)
  const person = working.find((p) => p.id === personId)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.popover} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.titleBar}>
          <div className={styles.header}>{person?.name ?? 'Unknown'}</div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Span of control</span>
          <span className={styles.value}>{metrics.spanOfControl}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Total headcount</span>
          <span className={styles.value}>{metrics.totalHeadcount}</span>
        </div>

        {metrics.recruiting > 0 && (
          <div className={styles.row}>
            <span className={styles.label}>Recruiting</span>
            <span className={styles.value}>{metrics.recruiting}</span>
          </div>
        )}
        {metrics.planned > 0 && (
          <div className={styles.row}>
            <span className={styles.label}>Planned</span>
            <span className={styles.value}>{metrics.planned}</span>
          </div>
        )}
        {metrics.transfers > 0 && (
          <div className={styles.row}>
            <span className={styles.label}>Transfers</span>
            <span className={styles.value}>{metrics.transfers}</span>
          </div>
        )}

        {metrics.byDiscipline.size > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>By discipline</div>
            {[...metrics.byDiscipline.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([disc, count]) => (
                <div key={disc} className={styles.row}>
                  <span className={styles.label}>{disc}</span>
                  <span className={styles.value}>{count}</span>
                </div>
              ))}
          </div>
        )}

        {metrics.byTeam.size > 1 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>By team</div>
            {[...metrics.byTeam.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([team, count]) => (
                <div key={team} className={styles.row}>
                  <span className={styles.label}>{team}</span>
                  <span className={styles.value}>{count}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
