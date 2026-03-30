import { useMemo } from 'react'
import { useOrgData } from '../store/OrgContext'
import SidebarShell from './SidebarShell'
import styles from './DetailSidebar.module.css'

interface PersonViewSidebarProps {
  personId: string
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function PersonViewSidebar({ personId, onSetMode }: PersonViewSidebarProps) {
  const { working } = useOrgData()
  const person = useMemo(() => working.find(p => p.id === personId), [working, personId])

  if (!person) return null

  const manager = working.find(p => p.id === person.managerId)

  return (
    <SidebarShell heading={person.name || '(unnamed)'}>
      <div className={styles.viewBody}>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Role</span>
          <span className={styles.viewValue}>{person.role || 'TBD'}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Discipline</span>
          <span className={styles.viewValue}>{person.discipline || '\u2014'}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Team</span>
          <span className={styles.viewValue}>{person.team || '\u2014'}</span>
        </div>
        {person.additionalTeams && person.additionalTeams.length > 0 && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Other Teams</span>
            <span className={styles.viewValue}>{person.additionalTeams.join(', ')}</span>
          </div>
        )}
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Manager</span>
          <span className={styles.viewValue}>{manager?.name || '(none)'}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Status</span>
          <span className={styles.viewValue}>{person.status}</span>
        </div>
        {person.pod && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Pod</span>
            <span className={styles.viewValue}>{person.pod}</span>
          </div>
        )}
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Employment</span>
          <span className={styles.viewValue}>{person.employmentType || 'FTE'}</span>
        </div>
        {(person.level ?? 0) > 0 && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Level</span>
            <span className={styles.viewValue}>{person.level}</span>
          </div>
        )}
        {person.publicNote && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Note</span>
            <span className={styles.viewValue}>{person.publicNote}</span>
          </div>
        )}
        {person.private && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Visibility</span>
            <span className={styles.viewValue}>Private</span>
          </div>
        )}
      </div>
      <div className={styles.actions}>
        <button className={styles.editBtn} onClick={() => onSetMode?.('edit')}>Edit</button>
      </div>
    </SidebarShell>
  )
}
