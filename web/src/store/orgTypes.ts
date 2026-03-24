import type { Person, MappedColumn, SnapshotInfo, AutosaveData } from '../api/types'

export type ViewMode = 'detail' | 'manager'
export type DataView = 'original' | 'working' | 'diff'

export interface OrgState {
  original: Person[]
  working: Person[]
  recycled: Person[]
  loaded: boolean
  viewMode: ViewMode
  dataView: DataView
  selectedIds: Set<string>
  hiddenEmploymentTypes: Set<string>
  headPersonId: string | null
  binOpen: boolean
  layoutKey: number
  pendingMapping: {
    headers: string[]
    mapping: Record<string, MappedColumn>
    preview: string[][]
  } | null
  snapshots: SnapshotInfo[]
  currentSnapshotName: string | null
  autosaveAvailable: AutosaveData | null
  error: string | null
}

export interface OrgActions {
  setViewMode: (mode: ViewMode) => void
  setDataView: (view: DataView) => void
  /** @deprecated Use toggleSelect / clearSelection instead */
  setSelectedId: (id: string | null) => void
  toggleSelect: (id: string, multi: boolean) => void
  clearSelection: () => void
  upload: (file: File) => Promise<void>
  move: (personId: string, newManagerId: string, newTeam: string) => Promise<void>
  reparent: (personId: string, newManagerId: string) => Promise<void>
  reorder: (personIds: string[]) => Promise<void>
  update: (personId: string, fields: Record<string, string>) => Promise<void>
  add: (person: Omit<Person, 'id'>) => Promise<void>
  remove: (personId: string) => Promise<void>
  restore: (personId: string) => Promise<void>
  emptyBin: () => Promise<void>
  setBinOpen: (open: boolean) => void
  confirmMapping: (mapping: Record<string, string>) => Promise<void>
  cancelMapping: () => void
  reflow: () => void
  pendingMapping: OrgState['pendingMapping']
  saveSnapshot: (name: string) => Promise<void>
  loadSnapshot: (name: string) => Promise<void>
  deleteSnapshot: (name: string) => Promise<void>
  restoreAutosave: () => void
  dismissAutosave: () => Promise<void>
  toggleEmploymentTypeFilter: (type: string) => void
  showAllEmploymentTypes: () => void
  hideAllEmploymentTypes: (types: string[]) => void
  setHead: (id: string | null) => void
  clearError: () => void
}

export type OrgContextValue = OrgState & OrgActions & {
  /** Backward compat: returns the single selected ID when exactly one is selected, null otherwise */
  selectedId: string | null
}

// --- Split context types ---

export interface SelectionContextValue {
  selectedIds: Set<string>
  /** Backward compat: returns the single selected ID when exactly one is selected, null otherwise */
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  toggleSelect: (id: string, multi: boolean) => void
  clearSelection: () => void
}

export interface UIContextValue {
  viewMode: ViewMode
  dataView: DataView
  binOpen: boolean
  hiddenEmploymentTypes: Set<string>
  headPersonId: string | null
  layoutKey: number
  error: string | null
  setViewMode: (mode: ViewMode) => void
  setDataView: (view: DataView) => void
  setBinOpen: (open: boolean) => void
  toggleEmploymentTypeFilter: (type: string) => void
  showAllEmploymentTypes: () => void
  hideAllEmploymentTypes: (types: string[]) => void
  setHead: (id: string | null) => void
  reflow: () => void
  setError: (error: string | null) => void
  clearError: () => void
}

export interface OrgDataContextValue {
  original: Person[]
  working: Person[]
  recycled: Person[]
  loaded: boolean
  pendingMapping: OrgState['pendingMapping']
  snapshots: SnapshotInfo[]
  currentSnapshotName: string | null
  autosaveAvailable: AutosaveData | null
  upload: (file: File) => Promise<void>
  move: (personId: string, newManagerId: string, newTeam: string) => Promise<void>
  reparent: (personId: string, newManagerId: string) => Promise<void>
  reorder: (personIds: string[]) => Promise<void>
  update: (personId: string, fields: Record<string, string>) => Promise<void>
  add: (person: Omit<Person, 'id'>) => Promise<void>
  remove: (personId: string) => Promise<void>
  restore: (personId: string) => Promise<void>
  emptyBin: () => Promise<void>
  confirmMapping: (mapping: Record<string, string>) => Promise<void>
  cancelMapping: () => void
  saveSnapshot: (name: string) => Promise<void>
  loadSnapshot: (name: string) => Promise<void>
  deleteSnapshot: (name: string) => Promise<void>
  restoreAutosave: () => void
  dismissAutosave: () => Promise<void>
}
