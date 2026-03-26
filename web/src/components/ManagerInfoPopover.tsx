import type { Person } from '../api/types'
import { computeOrgMetrics } from '../hooks/useOrgMetrics'
import { useEscapeKey } from '../hooks/useEscapeKey'
import styles from './ManagerInfoPopover.module.css'

interface Props {
  personId: string
  working: Person[]
  onClose: () => void
}

export default function ManagerInfoPopover({ personId, working, onClose }: Props) {
  const metrics = computeOrgMetrics(personId, working)
  const person = working.find((p) => p.id === personId)

  useEscapeKey(onClose, true)

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.popover} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.titleBar}>
          <div className={styles.header}>{person?.name ?? 'Unknown'}</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Direct Reports</span>
          <span className={styles.value}>{metrics.spanOfControl}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Total Headcount</span>
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

        {metrics.byTeamPod.length > 1 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>By team / pod</div>
            {metrics.byTeamPod.map((group) => (
              <div key={group.name}>
                <div className={styles.row}>
                  <span className={styles.label}>{group.name}</span>
                  <span className={styles.value}>{group.count}</span>
                </div>
                {[...group.byDiscipline.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([disc, count]) => (
                    <div key={disc} className={styles.subRow}>
                      <span className={styles.subLabel}>{disc}</span>
                      <span className={styles.subValue}>{count}</span>
                    </div>
                  ))}
              </div>
            ))}
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
      </div>
    </div>
  )
}
