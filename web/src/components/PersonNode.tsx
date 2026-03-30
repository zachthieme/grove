import { useState, useEffect, useRef, memo } from 'react'
import styles from './PersonNode.module.css'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { EditBuffer } from '../store/useInteractionState'
import { isRecruitingStatus, isPlannedStatus, isTransferStatus } from '../constants'
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
  collapsed?: boolean
  /** When true, the card is in editing mode (driven by interaction state) */
  editing?: boolean
  /** Shared edit buffer from interaction state */
  editBuffer?: EditBuffer | null
  /** Which field to auto-focus when entering edit mode */
  focusField?: 'name' | 'role' | 'team' | null
  onAdd?: () => void
  onAddParent?: () => void
  onDelete?: () => void
  onInfo?: () => void
  onFocus?: () => void
  onEditMode?: () => void
  onToggleCollapse?: () => void
  onClick?: (e?: React.MouseEvent) => void
  onEnterEditing?: () => void
  onUpdateBuffer?: (field: string, value: string) => void
}

function PersonNodeInner({ person, selected, ghost, changes, showTeam, isManager, collapsed, editing, editBuffer, focusField, onAdd, onAddParent, onDelete, onInfo, onFocus, onEditMode, onToggleCollapse, onClick, onEnterEditing, onUpdateBuffer }: Props) {
  const [hovered, setHovered] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const roleRef = useRef<HTMLInputElement>(null)
  const teamRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    const ref = focusField === 'role' ? roleRef : focusField === 'team' ? teamRef : nameRef
    ref.current?.focus()
    ref.current?.select()
  }, [editing, focusField])

  const handleDoubleClick = (_field: 'name' | 'role' | 'team') => (e: React.MouseEvent) => {
    if (!onEnterEditing || ghost || isPlaceholder) return
    e.stopPropagation()
    onEnterEditing()
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      ;(e.target as HTMLElement).blur()
    }
    // Escape is handled by useUnifiedEscape at app level
  }
  const hasNotes = !!person.publicNote
  const isPrivate = !!person.private
  const isPlaceholder = !!person.isPlaceholder
  const isRecruiting = isRecruitingStatus(person.status)
  const isFuture = isPlannedStatus(person.status)
  const isTransfer = isTransferStatus(person.status)

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
  const showActions = !ghost && !isPlaceholder && (onAdd || onAddParent || onDelete || onInfo || onFocus || onEditMode)

  const nodeStyle = empColor ? { '--emp-color': empColor } as React.CSSProperties : undefined

  return (
    <div
      className={styles.wrapper}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showActions && hovered && (
        <NodeActions
          showAdd={!!onAdd}
          showAddParent={!!onAddParent}
          showInfo={!!onInfo}
          showFocus={!!onFocus}
          onAdd={(e) => { e.stopPropagation(); onAdd?.() }}
          onAddParent={onAddParent ? (e) => { e.stopPropagation(); onAddParent() } : undefined}
          onDelete={(e) => { e.stopPropagation(); onDelete?.() }}
          onEdit={onEditMode ? (e) => { e.stopPropagation(); onEditMode() } : undefined}
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
      <div className={classNames} style={nodeStyle} onClick={(e) => { onClick?.(e); (e.currentTarget as HTMLElement).blur() }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }} role="button" tabIndex={0} data-selected={selected || false} data-testid={`person-${person.name}`} aria-label={person.name}>
        <div className={styles.name} onDoubleClick={handleDoubleClick('name')}>
          {editing && editBuffer ? (
            <input ref={nameRef} className={styles.inlineEdit} value={editBuffer.name} onChange={(e) => onUpdateBuffer?.('name', e.target.value)} onKeyDown={handleEditKeyDown} />
          ) : (
            <>{statusLabel && <span className="sr-only">{statusLabel}: </span>}{prefix}{person.name}</>
          )}
        </div>
        {showTeam && (
          <div className={styles.team} onDoubleClick={handleDoubleClick('team')}>
            {editing && editBuffer ? (
              <input ref={teamRef} className={`${styles.inlineEdit} ${styles.inlineEditSmall}`} value={editBuffer.team} onChange={(e) => onUpdateBuffer?.('team', e.target.value)} onKeyDown={handleEditKeyDown} />
            ) : (
              person.team || '\u00A0'
            )}
          </div>
        )}
        <div className={styles.role} onDoubleClick={handleDoubleClick('role')}>
          {editing && editBuffer ? (
            <input ref={roleRef} className={`${styles.inlineEdit} ${styles.inlineEditSmall}`} value={editBuffer.role} onChange={(e) => onUpdateBuffer?.('role', e.target.value)} onKeyDown={handleEditKeyDown} />
          ) : (
            <>{person.role || 'TBD'}{empAbbrev && <span className={styles.empAbbrev}> &middot; {empAbbrev}</span>}</>
          )}
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
      {onToggleCollapse && (
        <button
          className={styles.collapseToggle}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          aria-label={collapsed ? 'Expand subtree' : 'Collapse subtree'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '\u25B8' : '\u25BE'}
        </button>
      )}
    </div>
  )
}

const PersonNode = memo(PersonNodeInner)
export default PersonNode
