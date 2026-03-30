import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import NodeActions from '../components/NodeActions'
import styles from './PodHeaderNode.module.css'

export function PodHeaderNode({ podName, memberCount, publicNote, onAdd, onClick, nodeRef, podNodeId, collapsed, onToggleCollapse }: {
  podName: string
  memberCount: number
  publicNote?: string
  onAdd?: () => void
  onClick?: () => void
  nodeRef?: (el: HTMLDivElement | null) => void
  podNodeId?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: podNodeId ?? podName,
    disabled: !podNodeId,
  })

  return (
    <div
      ref={(node) => {
        setDropRef(node)
        nodeRef?.(node)
      }}
      className={styles.teamHeaderWrapper}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Pod: a named subgroup within a team"
      style={{
        outline: isOver ? '2px solid var(--grove-green, #3d6b35)' : undefined,
        outlineOffset: isOver ? 2 : undefined,
        background: isOver ? 'var(--grove-green-soft, #e8f0e6)' : undefined,
        borderRadius: 6,
        transition: 'outline 0.15s, background 0.15s',
      }}
    >
      {hovered && onAdd && (
        <NodeActions
          showAdd={true}
          showInfo={true}
          showEdit={false}
          showDelete={false}
          onAdd={(e) => { e.stopPropagation(); onAdd() }}
          onDelete={(e) => { e.stopPropagation() }}
          onEdit={(e) => { e.stopPropagation() }}
          onInfo={(e) => { e.stopPropagation(); onClick?.() }}
        />
      )}
      <div className={styles.cardArea}>
        <div
          className={`${styles.teamHeader}${onClick ? ` ${styles.teamHeaderClickable}` : ''}`}
          onClick={onClick}
        >
          <div className={styles.teamHeaderName}>{podName}</div>
          <div className={styles.teamHeaderCount}>{memberCount} {memberCount === 1 ? 'person' : 'people'}</div>
        </div>
        {publicNote && (
          <button
            className={`${styles.podNoteIcon} ${noteOpen ? styles.podNoteIconActive : ''}`}
            onClick={(e) => { e.stopPropagation(); setNoteOpen(v => !v) }}
            aria-label="Toggle pod notes"
            aria-expanded={noteOpen}
          >
            {'\u{1F4CB}'}
          </button>
        )}
        {noteOpen && publicNote && (
          <div className={styles.podNotePanel}>
            <div className={styles.podNoteText}>{publicNote}</div>
          </div>
        )}
      </div>
      {onToggleCollapse && (
        <button
          className={styles.collapseToggle}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          aria-label={collapsed ? 'Expand pod' : 'Collapse pod'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '\u25B8' : '\u25BE'}
        </button>
      )}
    </div>
  )
}
