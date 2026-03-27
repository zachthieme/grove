import { createContext, useContext } from 'react'
import type { Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'

export interface ChartContextValue {
  selectedIds: Set<string>
  changes?: Map<string, PersonChange>
  managerSet?: Set<string>
  pods?: Pod[]
  onSelect: (id: string, event?: React.MouseEvent) => void
  onBatchSelect?: (ids: Set<string>) => void
  onAddReport?: (id: string) => void
  onAddToTeam?: (parentId: string, team: string, podName?: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  onFocus?: (id: string) => void
  onPodSelect?: (podId: string) => void
  setNodeRef: (id: string) => (el: HTMLDivElement | null) => void
}

const ChartContext = createContext<ChartContextValue | null>(null)

export const ChartProvider = ChartContext.Provider

export function useChart(): ChartContextValue {
  const ctx = useContext(ChartContext)
  if (!ctx) throw new Error('useChart must be used within a ChartProvider')
  return ctx
}
