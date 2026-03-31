import { useState, useEffect, useRef, memo } from 'react'
import styles from './PersonNode.module.css'
import BaseNode from './BaseNode'
import type { BaseNodeActions } from './BaseNode'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { EditBuffer } from '../store/useInteractionState'
import { isRecruitingStatus, isPlannedStatus, isTransferStatus } from '../constants'

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
  onCommitEdits?: () => void
  cardRef?: (el: HTMLDivElement | null) => void
}

function PersonNodeInner({ person, selected, ghost, changes, showTeam, isManager, collapsed, editing, editBuffer, focusField: _focusField, onAdd, onAddParent, onDelete, onInfo, onFocus, onEditMode, onToggleCollapse, onClick, onEnterEditing, onUpdateBuffer, onCommitEdits, cardRef }: Props) {
  const nameRef = useRef<HTMLInputElement>(null)
  const roleRef = useRef<HTMLInputElement>(null)
  const teamRef = useRef<HTMLInputElement>(null)

  const [activeField, setActiveField] = useState<'name' | 'role' | 'team'>('name')
  const cyclingRef = useRef(false)

  const isPlaceholder = !!person.isPlaceholder
  const isRecruiting = isRecruitingStatus(person.status)
  const isFuture = isPlannedStatus(person.status)
  const isTransfer = isTransferStatus(person.status)

  const empAbbrev = getEmpAbbrev(person.employmentType)

  const prefix = isRecruiting ? '\u{1F535} ' : isFuture ? '\u{2B1C} ' : isTransfer ? '\u{1F7E1} ' : ''
  const statusLabel = isRecruiting ? 'Recruiting' : isFuture ? 'Planned' : isTransfer ? 'Transfer' : null

  const handleDoubleClick = (field: 'name' | 'role' | 'team') => (e: React.MouseEvent) => {
    if (!onEnterEditing || ghost || isPlaceholder) return
    e.stopPropagation()
    setActiveField(field)
    onEnterEditing()
  }

  // Focus the correct field when entering edit mode or switching fields
  useEffect(() => {
    if (!editing) return
    const ref = activeField === 'role' ? roleRef : activeField === 'team' ? teamRef : nameRef
    ref.current?.focus()
    ref.current?.select()
  }, [editing, activeField])

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      onCommitEdits?.()
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      cyclingRef.current = true
      // Cycle: name → role → team → name (skip team if not shown)
      if (activeField === 'name') {
        setActiveField(showTeam ? 'team' : 'role')
      } else if (activeField === 'team') {
        setActiveField('role')
      } else {
        setActiveField('name')
      }
    }
    // Escape is handled by useUnifiedEscape at app level
  }

  const handleEditBlur = () => {
    // Don't commit when Tab-cycling between fields
    if (cyclingRef.current) {
      cyclingRef.current = false
      return
    }
    onCommitEdits?.()
  }

  // Build statusStyle for BaseNode
  const statusStyle = isRecruiting ? 'recruiting' as const
    : isFuture ? 'planned' as const
    : isTransfer ? 'transfer' as const
    : undefined

  // Build actions for BaseNode
  const actions: BaseNodeActions = {}
  if (onAdd) actions.onAdd = (e) => { e.stopPropagation(); onAdd() }
  if (onAddParent) actions.onAddParent = (e) => { e.stopPropagation(); onAddParent() }
  if (onDelete) actions.onDelete = (e) => { e.stopPropagation(); onDelete() }
  if (onEditMode) actions.onEdit = (e) => { e.stopPropagation(); onEditMode() }
  if (onInfo) actions.onInfo = (e) => { e.stopPropagation(); onInfo() }
  if (onFocus) actions.onFocus = (e) => { e.stopPropagation(); onFocus() }

  // Build diff classes from changes
  const diffClasses: string[] = []
  if (changes?.types.has('added')) diffClasses.push(styles.added)
  if (changes?.types.has('reporting')) diffClasses.push(styles.reporting)
  if (changes?.types.has('title')) diffClasses.push(styles.titleChange)
  if (changes?.types.has('reorg')) diffClasses.push(styles.reorg)

  return (
    <BaseNode
      nodeId={person.id}
      variant={isManager ? 'manager' : 'default'}
      statusStyle={statusStyle}
      empAccent={getEmpColor(person.employmentType)}
      ghost={ghost}
      isPlaceholder={isPlaceholder}
      noteText={person.publicNote}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      selected={selected}
      onClick={onClick}
      warning={person.warning}
      isPrivate={!!person.private}
      draggable={!ghost && !isPlaceholder}
      droppable={!ghost && !isPlaceholder}
      dragData={{ person }}
      cardRef={cardRef}
      actions={actions}
      testId={`person-${person.name}`}
      ariaLabel={person.name}
      diffClasses={diffClasses}
    >
      <div className={`${styles.name}${isManager ? ` ${styles.managerName}` : ''}`} onDoubleClick={handleDoubleClick('name')}>
        {editing && editBuffer ? (
          <input ref={nameRef} className={styles.inlineEdit} value={editBuffer.name} onChange={(e) => onUpdateBuffer?.('name', e.target.value)} onKeyDown={handleEditKeyDown} onBlur={handleEditBlur} />
        ) : (
          <>{statusLabel && <span className="sr-only">{statusLabel}: </span>}{prefix}{person.name}</>
        )}
      </div>
      {showTeam && (
        <div className={styles.team} onDoubleClick={handleDoubleClick('team')}>
          {editing && editBuffer ? (
            <input ref={teamRef} className={`${styles.inlineEdit} ${styles.inlineEditSmall}`} value={editBuffer.team} onChange={(e) => onUpdateBuffer?.('team', e.target.value)} onKeyDown={handleEditKeyDown} onBlur={handleEditBlur} />
          ) : (
            person.team || '\u00A0'
          )}
        </div>
      )}
      <div className={styles.role} onDoubleClick={handleDoubleClick('role')}>
        {editing && editBuffer ? (
          <input ref={roleRef} className={`${styles.inlineEdit} ${styles.inlineEditSmall}`} value={editBuffer.role} onChange={(e) => onUpdateBuffer?.('role', e.target.value)} onKeyDown={handleEditKeyDown} onBlur={handleEditBlur} />
        ) : (
          <>{person.role || 'TBD'}{empAbbrev && <span className={styles.empAbbrev}> &middot; {empAbbrev}</span>}</>
        )}
      </div>
    </BaseNode>
  )
}

const PersonNode = memo(PersonNodeInner)
export default PersonNode
