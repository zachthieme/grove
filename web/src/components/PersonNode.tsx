import { useState } from 'react'
import styles from './PersonNode.module.css'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import NodeActions from './NodeActions'

function getEmpAbbrev(empType: string | undefined): string {
  if (!empType || empType === 'FTE') return ''
  if (empType === 'Intern') return 'Intern'
  // All other types: show abbreviation
  switch (empType) {
    case 'PSP': return 'PSP'
    case 'CW': return 'CW'
    case 'Evergreen': return 'EVG'
    default: return empType.slice(0, 3).toUpperCase()
  }
}

function getEmpColor(empType: string | undefined): string | undefined {
  // FTE and Intern: no accent bar
  if (!empType || empType === 'FTE' || empType === 'Intern') return undefined
  // All non-FTE/non-Intern types: single purple accent
  return '#8b5cf6'
}

interface Props {
  person: Person & { isPlaceholder?: boolean }
  selected?: boolean
  ghost?: boolean
  changes?: PersonChange
  showTeam?: boolean
  isManager?: boolean
  onAdd?: () => void
  onDelete?: () => void
  onInfo?: () => void
  onFocus?: () => void
  onClick?: (e?: React.MouseEvent) => void
}

export default function PersonNode({ person, selected, ghost, changes, showTeam, isManager, onAdd, onDelete, onInfo, onFocus, onClick }: Props) {
  const [hovered, setHovered] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const hasNotes = !!person.publicNote
  const isPrivate = !!person.private
  const isPlaceholder = !!(person as any).isPlaceholder
  const isRecruiting = person.status === 'Open' || person.status === 'Backfill'
  const isFuture = person.status === 'Planned'
  const isTransfer = person.status === 'Transfer In' || person.status === 'Transfer Out'

  const empColor = getEmpColor(person.employmentType)
  const empAbbrev = getEmpAbbrev(person.employmentType)

  const classNames = [
    styles.node,
    isManager && styles.manager,
    selected && styles.selected,
    isRecruiting && styles.recruiting,
    isFuture && styles.future,
    isTransfer && styles.transfer,
    ghost && styles.ghost,
    isPlaceholder && styles.placeholder,
    changes?.types.has('added') && styles.added,
    changes?.types.has('reporting') && styles.reporting,
    changes?.types.has('title') && styles.titleChange,
    changes?.types.has('reorg') && styles.reorg,
    empColor && styles.empRight,
  ].filter(Boolean).join(' ')

  const prefix = isRecruiting ? '\u{1F535} ' : isFuture ? '\u{2B1C} ' : isTransfer ? '\u{1F7E1} ' : ''
  const statusLabel = isRecruiting ? 'Recruiting' : isFuture ? 'Planned' : isTransfer ? 'Transfer' : null
  const showActions = !ghost && !isPlaceholder && (onAdd || onDelete || onInfo || onFocus)

  const nodeStyle = empColor ? { '--emp-color': empColor } as React.CSSProperties : undefined

  return (
    <div
      className={styles.wrapper}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showActions && hovered && (
        <NodeActions
          showAdd={!!isManager}
          showInfo={!!onInfo}
          showFocus={!!onFocus}
          onAdd={(e) => { e.stopPropagation(); onAdd?.() }}
          onDelete={(e) => { e.stopPropagation(); onDelete?.() }}
          onEdit={(e) => { e.stopPropagation(); onClick?.(e) }}
          onInfo={(e) => { e.stopPropagation(); onInfo?.() }}
          onFocus={onFocus ? (e) => { e.stopPropagation(); onFocus() } : undefined}
        />
      )}
      {person.warning && person.warning.length > 0 && (
        <div className={styles.warningDot} title={person.warning} role="img" aria-label={`Warning: ${person.warning}`}>{'\u26A0'}</div>
      )}
      {isPrivate && !isPlaceholder && (
        <div className={styles.privateIcon} title="Private" role="img" aria-label="Private">{'\u{1F512}'}</div>
      )}
      <div className={classNames} style={nodeStyle} onClick={(e) => onClick?.(e)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }} role="button" tabIndex={0} data-selected={selected || false} data-testid={`person-${person.name}`}>
        <div className={styles.name}>
          {statusLabel && <span className="sr-only">{statusLabel}: </span>}
          {prefix}{person.name}
        </div>
        {showTeam && <div className={styles.team}>{person.team}</div>}
        <div className={styles.role}>
          {person.role || 'TBD'}
          {empAbbrev && <span className={styles.empAbbrev}> &middot; {empAbbrev}</span>}
        </div>
      </div>
      {hasNotes && (
        <button
          className={`${styles.noteIcon} ${noteOpen ? styles.noteIconActive : ''}`}
          onClick={(e) => { e.stopPropagation(); setNoteOpen(v => !v) }}
          aria-label="Toggle notes"
          aria-expanded={noteOpen}
        >
          {'\u{1F4CB}'}
        </button>
      )}
      {noteOpen && hasNotes && (
        <div className={styles.notePanel}>
          <div className={styles.notePanelText}>{person.publicNote}</div>
        </div>
      )}
    </div>
  )
}
