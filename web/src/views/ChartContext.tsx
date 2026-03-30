import { createContext, useContext } from 'react'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { EditBuffer } from '../store/useInteractionState'
import type { InteractionMode } from '../store/orgTypes'

export interface ChartContextValue {
  selectedIds: Set<string>
  changes?: Map<string, PersonChange>
  managerSet?: Set<string>
  pods?: Pod[]
  interactionMode?: InteractionMode
  editingPersonId?: string | null
  editBuffer?: EditBuffer | null
  onSelect: (id: string, event?: React.MouseEvent) => void
  onBatchSelect?: (ids: Set<string>) => void
  onAddReport?: (id: string) => void
  onAddParent?: (childId: string) => void
  onAddToTeam?: (parentId: string, team: string, podName?: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  onFocus?: (id: string) => void
  onEditMode?: (id: string) => void
  onPodSelect?: (podId: string) => void
  onEnterEditing?: (person: Person) => void
  onUpdateBuffer?: (field: keyof EditBuffer, value: string | boolean) => void
  setNodeRef: (id: string) => (el: HTMLDivElement | null) => void
  collapsedIds?: Set<string>
  onToggleCollapse?: (id: string) => void
  onInlineEdit?: (personId: string, field: string, value: string) => void
}

const ChartContext = createContext<ChartContextValue | null>(null)

export const ChartProvider = ChartContext.Provider

export function useChart(): ChartContextValue {
  const ctx = useContext(ChartContext)
  if (!ctx) throw new Error('useChart must be used within a ChartProvider')
  return ctx
}
