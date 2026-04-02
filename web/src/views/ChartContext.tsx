import { createContext, useContext } from 'react'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { PersonFormValues } from '../utils/personFormUtils'
import type { InteractionMode } from '../store/orgTypes'

/** Data that changes on mutations, selections, and edits. */
export interface ChartDataContextValue {
  selectedIds: Set<string>
  changes?: Map<string, PersonChange>
  managerSet?: Set<string>
  pods?: Pod[]
  interactionMode?: InteractionMode
  editingPersonId?: string | null
  editBuffer?: PersonFormValues | null
  collapsedIds?: Set<string>
}

/** Stable callback refs that rarely change. */
export interface ChartActionsContextValue {
  onSelect: (id: string, event?: React.MouseEvent) => void
  onBatchSelect?: (ids: Set<string>) => void
  onAddReport?: (id: string) => void
  onAddParent?: (childId: string) => void
  onAddToTeam?: (parentId: string, team: string, podName?: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  onFocus?: (id: string) => void
  onEnterEditing?: (person: Person) => void
  onUpdateBuffer?: (field: keyof PersonFormValues, value: string | boolean) => void
  onCommitEdits?: () => void
  setNodeRef: (id: string) => (el: HTMLDivElement | null) => void
  onToggleCollapse?: (id: string) => void
  onInlineEdit?: (personId: string, field: string, value: string) => void
}

/** Combined type for convenience — used by consumers that need both. */
export type ChartContextValue = ChartDataContextValue & ChartActionsContextValue

const ChartDataCtx = createContext<ChartDataContextValue | null>(null)
const ChartActionsCtx = createContext<ChartActionsContextValue | null>(null)

export function ChartProvider({ data, actions, children }: {
  data: ChartDataContextValue
  actions: ChartActionsContextValue
  children: React.ReactNode
}) {
  return (
    <ChartDataCtx.Provider value={data}>
      <ChartActionsCtx.Provider value={actions}>
        {children}
      </ChartActionsCtx.Provider>
    </ChartDataCtx.Provider>
  )
}

export function useChartData(): ChartDataContextValue {
  const ctx = useContext(ChartDataCtx)
  if (!ctx) throw new Error('useChartData must be used within a ChartProvider')
  return ctx
}

export function useChartActions(): ChartActionsContextValue {
  const ctx = useContext(ChartActionsCtx)
  if (!ctx) throw new Error('useChartActions must be used within a ChartProvider')
  return ctx
}

/** Convenience hook that returns both data and actions merged. */
export function useChart(): ChartContextValue {
  return { ...useChartData(), ...useChartActions() }
}
