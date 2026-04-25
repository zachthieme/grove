import type { OrgNode } from '../api/types'
import type { NodeChange } from './useOrgDiff'
import type { EditBuffer } from '../store/useInteractionState'
import { useChart } from '../views/ChartContext'

export interface NodeCommonProps {
  selected: boolean
  changes?: NodeChange
  isManager?: boolean
  editing: boolean
  editBuffer: EditBuffer | null
  focusField: 'name' | null
  onAdd?: () => void
  onAddProduct?: () => void
  onAddParent?: () => void
  onDelete?: () => void
  onInfo?: () => void
  onFocus?: () => void
  onClick: (e?: React.MouseEvent) => void
  onEnterEditing?: () => void
  onUpdateBuffer?: (field: string, value: string) => void
  onCommitEdits?: () => void
  cardRef: (el: HTMLDivElement | null) => void
}

export function useNodeProps(person: OrgNode): NodeCommonProps {
  const {
    selectedIds, changes, managerSet, interactionMode,
    editingPersonId, editBuffer, onSelect, onAddReport, onAddProduct,
    onAddParent, onDeletePerson, onInfo, onFocus,
    onEnterEditing, onUpdateBuffer, onCommitEdits,
    setNodeRef,
  } = useChart()

  const id = person.id
  const isEditing = interactionMode === 'editing' && editingPersonId === id

  return {
    selected: selectedIds.has(id),
    changes: changes?.get(id),
    isManager: managerSet?.has(id),
    editing: isEditing,
    editBuffer: isEditing ? editBuffer ?? null : null,
    focusField: isEditing ? 'name' : null,
    onAdd: onAddReport ? () => onAddReport(id) : undefined,
    onAddProduct: onAddProduct ? () => onAddProduct(id) : undefined,
    onAddParent: onAddParent ? () => onAddParent(id) : undefined,
    onDelete: onDeletePerson ? () => onDeletePerson(id) : undefined,
    onInfo: onInfo ? () => onInfo(id) : undefined,
    onFocus: onFocus && managerSet?.has(id) ? () => onFocus(id) : undefined,
    onClick: (e?: React.MouseEvent) => onSelect(id, e),
    onEnterEditing: onEnterEditing ? () => onEnterEditing(person) : undefined,
    onUpdateBuffer: onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined,
    onCommitEdits,
    cardRef: setNodeRef(id),
  }
}
