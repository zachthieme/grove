import { memo } from 'react'
import BaseNode, { type BaseNodeActions } from './BaseNode'
import styles from './GroupHeaderNode.module.css'

interface Props {
  nodeId: string
  name: string
  count?: number
  /** Visual variant. 'group' (default, green) or 'productGroup' (slate). */
  variant?: 'group' | 'productGroup'
  noteText?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  selected?: boolean
  onClick?: (e?: React.MouseEvent) => void
  onAdd?: () => void
  onAddProduct?: () => void
  onInfo?: () => void
  cardRef?: (el: HTMLDivElement | null) => void
  droppableId?: string
  dragData?: Record<string, unknown>
}

export default memo(function GroupHeaderNode({ nodeId, name, count, variant = 'group', noteText, collapsed, onToggleCollapse, selected, onClick, onAdd, onAddProduct, onInfo, cardRef, droppableId, dragData }: Props) {
  const actions: BaseNodeActions | undefined = (onAdd || onAddProduct || onInfo)
    ? {
        onAdd: onAdd ? (e) => { e.stopPropagation(); onAdd() } : undefined,
        onAddProduct: onAddProduct ? (e) => { e.stopPropagation(); onAddProduct() } : undefined,
        onInfo: onInfo ? (e) => { e.stopPropagation(); onInfo() } : undefined,
      }
    : undefined

  return (
    <BaseNode
      nodeId={nodeId}
      variant={variant}
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
      dragData={dragData}
      testId={`group-${name}`}
      ariaLabel={`${name} group`}
    >
      <div className={styles.name}>{name}</div>
      {count !== undefined && (
        <div className={styles.count}>{count} {count === 1 ? 'person' : 'people'}</div>
      )}
    </BaseNode>
  )
})
