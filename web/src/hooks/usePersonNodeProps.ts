import type { Person } from '../api/types'
import type { PersonChange } from './useOrgDiff'
import type { EditBuffer } from '../store/useInteractionState'
import { useChart } from '../views/ChartContext'

export interface PersonNodeCommonProps {
  selected: boolean
  changes?: PersonChange
  isManager?: boolean
  editing: boolean
  editBuffer: EditBuffer | null
  focusField: 'name' | null
  onAdd?: () => void
  onAddParent?: () => void
  onDelete?: () => void
  onInfo?: () => void
  onFocus?: () => void
  onEditMode?: () => void
  onClick: (e?: React.MouseEvent) => void
  onEnterEditing?: () => void
  onUpdateBuffer?: (field: string, value: string) => void
  onCommitEdits?: () => void
  cardRef: (el: HTMLDivElement | null) => void
}

export function usePersonNodeProps(person: Person): PersonNodeCommonProps {
  const {
    selectedIds, changes, managerSet, interactionMode,
    editingPersonId, editBuffer, onSelect, onAddReport,
    onAddParent, onDeletePerson, onInfo, onFocus,
    onEditMode, onEnterEditing, onUpdateBuffer, onCommitEdits,
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
    onAddParent: onAddParent ? () => onAddParent(id) : undefined,
    onDelete: onDeletePerson ? () => onDeletePerson(id) : undefined,
    onInfo: onInfo ? () => onInfo(id) : undefined,
    onFocus: onFocus && managerSet?.has(id) ? () => onFocus(id) : undefined,
    onEditMode: onEditMode ? () => onEditMode(id) : undefined,
    onClick: (e?: React.MouseEvent) => onSelect(id, e),
    onEnterEditing: onEnterEditing ? () => onEnterEditing(person) : undefined,
    onUpdateBuffer: onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined,
    onCommitEdits,
    cardRef: setNodeRef(id),
  }
}
