import { useState, memo, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import styles from './BaseNode.module.css'
import NodeActions from './NodeActions'

export interface BaseNodeActions {
  onAdd?: (e: React.MouseEvent) => void
  onAddParent?: (e: React.MouseEvent) => void
  onDelete?: (e: React.MouseEvent) => void
  onEdit?: (e: React.MouseEvent) => void
  onInfo?: (e: React.MouseEvent) => void
  onFocus?: (e: React.MouseEvent) => void
}

export interface BaseNodeProps {
  nodeId: string
  children: ReactNode
  variant?: 'default' | 'manager' | 'group'
  statusStyle?: 'recruiting' | 'planned' | 'transfer'
  empAccent?: string
  ghost?: boolean
  isPlaceholder?: boolean
  noteText?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  selected?: boolean
  onClick?: (e?: React.MouseEvent) => void
  warning?: string
  isPrivate?: boolean
  draggable?: boolean
  dragData?: Record<string, unknown>
  droppable?: boolean
  droppableId?: string
  cardRef?: (el: HTMLDivElement | null) => void
  actions?: BaseNodeActions
  testId?: string
  ariaLabel?: string
  nodeClassName?: string
  nodeStyle?: React.CSSProperties
  diffClasses?: string[]
}

function BaseNodeInner({
  nodeId,
  children,
  variant = 'default',
  statusStyle,
  empAccent,
  ghost,
  isPlaceholder,
  noteText,
  collapsed,
  onToggleCollapse,
  selected,
  onClick,
  warning,
  isPrivate,
  draggable: isDraggableEnabled,
  dragData,
  droppable: isDroppableEnabled,
  droppableId,
  cardRef,
  actions,
  testId,
  ariaLabel,
  nodeClassName,
  nodeStyle,
  diffClasses,
}: BaseNodeProps) {
  const [hovered, setHovered] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: nodeId,
    data: dragData,
    disabled: !isDraggableEnabled,
  })

  const {
    setNodeRef: setDropRef,
    isOver,
  } = useDroppable({
    id: droppableId ?? nodeId,
    disabled: !isDroppableEnabled,
  })

  const hasNote = !!noteText
  const showActions = !ghost && !isPlaceholder && actions && (
    actions.onAdd || actions.onAddParent || actions.onDelete ||
    actions.onEdit || actions.onInfo || actions.onFocus
  )

  const nodeClassNames = [
    styles.node,
    variant === 'manager' && styles.manager,
    variant === 'group' && styles.group,
    selected && styles.selected,
    statusStyle === 'recruiting' && styles.recruiting,
    statusStyle === 'planned' && styles.future,
    statusStyle === 'transfer' && styles.transfer,
    ghost && styles.ghost,
    isPlaceholder && styles.placeholder,
    empAccent && styles.empRight,
    ...(diffClasses || []),
    nodeClassName,
  ].filter(Boolean).join(' ')

  const computedNodeStyle: React.CSSProperties = {
    ...nodeStyle,
    ...(empAccent ? { '--emp-color': empAccent } as React.CSSProperties : {}),
  }

  const handleClick = (e: React.MouseEvent) => {
    onClick?.(e)
    ;(e.currentTarget as HTMLElement).blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  const cardContent = (
    <div
      className={styles.wrapper}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showActions && hovered && (
        <NodeActions
          showAdd={!!actions.onAdd}
          showAddParent={!!actions.onAddParent}
          showInfo={!!actions.onInfo}
          showFocus={!!actions.onFocus}
          showEdit={!!actions.onEdit}
          showDelete={!!actions.onDelete}
          onAdd={(e) => { e.stopPropagation(); actions.onAdd?.(e) }}
          onAddParent={actions.onAddParent ? (e) => { e.stopPropagation(); actions.onAddParent!(e) } : undefined}
          onDelete={(e) => { e.stopPropagation(); actions.onDelete?.(e) }}
          onEdit={actions.onEdit ? (e) => { e.stopPropagation(); actions.onEdit!(e) } : undefined}
          onInfo={(e) => { e.stopPropagation(); actions.onInfo?.(e) }}
          onFocus={actions.onFocus ? (e) => { e.stopPropagation(); actions.onFocus!(e) } : undefined}
        />
      )}
      {warning && warning.length > 0 && (
        <div
          className={styles.warningDot}
          title={warning}
          role="img"
          aria-label={`Warning: ${warning}`}
        >
          {'\u26A0'}
        </div>
      )}
      {isPrivate && !isPlaceholder && (
        <div
          className={styles.privateIcon}
          title="Private"
          role="img"
          aria-label="Private"
        >
          {'\u{1F512}'}
        </div>
      )}
      <div className={styles.cardArea}>
        <div
          ref={cardRef}
          className={nodeClassNames}
          style={computedNodeStyle}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          data-selected={selected || false}
          data-testid={testId}
          aria-label={ariaLabel}
        >
          {children}
        </div>
        {hasNote && (
          <button
            className={`${styles.noteIcon} ${noteOpen ? styles.noteIconActive : ''}`}
            onClick={(e) => { e.stopPropagation(); setNoteOpen(v => !v) }}
            aria-label="Toggle notes"
            aria-expanded={noteOpen}
          >
            {'\u{1F4CB}'}
          </button>
        )}
        {noteOpen && hasNote && (
          <div className={styles.notePanel}>
            <div className={styles.notePanelText}>{noteText}</div>
          </div>
        )}
      </div>
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

  if (isDraggableEnabled || isDroppableEnabled) {
    return (
      <div
        ref={setDropRef}
        data-person-id={nodeId}
        className={`${styles.dropTarget} ${isOver && !isDragging ? styles.dropOver : ''}`}
      >
        <div
          ref={setDragRef}
          className={`${styles.dragHandle} ${isDragging ? styles.dragging : ''}`}
          {...listeners}
          {...attributes}
          role={undefined}
          tabIndex={undefined}
          data-dnd-draggable
        >
          {cardContent}
        </div>
      </div>
    )
  }

  return cardContent
}

const BaseNode = memo(BaseNodeInner)
export default BaseNode
export type { BaseNodeProps as Props }
