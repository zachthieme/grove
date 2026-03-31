import BaseNode, { type BaseNodeActions } from './BaseNode'
import styles from './GroupHeaderNode.module.css'

interface Props {
  nodeId: string
  name: string
  count: number
  noteText?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  selected?: boolean
  onClick?: (e?: React.MouseEvent) => void
  onAdd?: () => void
  onInfo?: () => void
  cardRef?: (el: HTMLDivElement | null) => void
  droppableId?: string
}

export default function GroupHeaderNode({ nodeId, name, count, noteText, collapsed, onToggleCollapse, selected, onClick, onAdd, onInfo, cardRef, droppableId }: Props) {
  const actions: BaseNodeActions | undefined = (onAdd || onInfo)
    ? {
        onAdd: onAdd ? (e) => { e.stopPropagation(); onAdd() } : undefined,
        onInfo: onInfo ? (e) => { e.stopPropagation(); onInfo() } : undefined,
      }
    : undefined

  return (
    <BaseNode
      nodeId={nodeId}
      variant="group"
      noteText={noteText}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      selected={selected}
      onClick={onClick}
      draggable
      droppable
      droppableId={droppableId ?? nodeId}
      cardRef={cardRef}
      actions={actions}
      testId={`group-${name}`}
      ariaLabel={`${name} group`}
    >
      <div className={styles.name}>{name}</div>
      <div className={styles.count}>{count} {count === 1 ? 'person' : 'people'}</div>
    </BaseNode>
  )
}
