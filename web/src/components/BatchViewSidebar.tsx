import { useMemo } from 'react'
import { useOrgData, useSelection } from '../store/OrgContext'
import { batchToForm } from '../utils/personFormUtils'
import { MIXED_VALUE } from '../constants'
import SidebarShell from './SidebarShell'
import styles from './DetailSidebar.module.css'

interface BatchViewSidebarProps {
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function BatchViewSidebar({ onSetMode }: BatchViewSidebarProps) {
  const { working } = useOrgData()
  const { selectedIds, clearSelection } = useSelection()

  const selectedPeople = useMemo(
    () => working.filter(p => selectedIds.has(p.id)),
    [working, selectedIds],
  )

  if (selectedPeople.length === 0) return null

  const batchView = batchToForm(selectedPeople)
  const show = (val: string, fallback = '\u2014') => val === MIXED_VALUE ? 'Mixed' : (val || fallback)
  const managerIds = new Set(selectedPeople.map(p => p.managerId).filter(Boolean))
  const managerLabel = managerIds.size === 1
    ? (working.find(p => p.id === [...managerIds][0])?.name || '(none)')
    : 'Mixed'

  return (
    <SidebarShell heading={`${selectedIds.size} people selected`}>
      <div className={styles.viewBody}>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Role</span>
          <span className={styles.viewValue}>{show(batchView.role, 'TBD')}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Discipline</span>
          <span className={styles.viewValue}>{show(batchView.discipline)}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Team</span>
          <span className={styles.viewValue}>{show(batchView.team)}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Manager</span>
          <span className={styles.viewValue}>{managerLabel}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Status</span>
          <span className={styles.viewValue}>{show(batchView.status)}</span>
        </div>
        {batchView.pod && batchView.pod !== MIXED_VALUE && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Pod</span>
            <span className={styles.viewValue}>{batchView.pod}</span>
          </div>
        )}
        {batchView.pod === MIXED_VALUE && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Pod</span>
            <span className={styles.viewValue}>Mixed</span>
          </div>
        )}
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Employment</span>
          <span className={styles.viewValue}>{show(batchView.employmentType, 'FTE')}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.editBtn} onClick={() => onSetMode?.('edit')}>Edit</button>
        <button className={styles.deleteBtn} onClick={clearSelection} title="Clear selection">Clear selection</button>
      </div>
    </SidebarShell>
  )
}
