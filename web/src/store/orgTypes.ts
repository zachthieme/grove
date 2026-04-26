import type { OrgNode, Pod, MappedColumn, SnapshotInfo, AutosaveData, Settings, OrgNodeUpdatePayload, PodUpdatePayload } from '../api/types'

export type ViewMode = 'detail' | 'manager' | 'table'
export type DataView = 'original' | 'working' | 'diff'
export type InteractionMode = 'idle' | 'selected' | 'editing'

export type PendingMapping = {
  headers: string[]
  mapping: Record<string, MappedColumn>
  preview: string[][]
} | null

export interface SelectionContextValue {
  selectedIds: Set<string>
  /** Backward compat: returns the single selected ID when exactly one is selected, null otherwise */
  selectedId: string | null
  interactionMode: InteractionMode
  editBuffer: import('../utils/nodeFormUtils').NodeFormValues | null
  editingPersonId: string | null
  setSelectedId: (id: string | null) => void
  toggleSelect: (id: string, multi: boolean) => void
  clearSelection: () => void
  batchSelect: (ids: Set<string>) => void
  enterEditing: (person: import('../api/types').OrgNode) => void
  commitEdits: () => Record<string, string | boolean | number> | null
  revertEdits: () => void
  updateBuffer: (field: keyof import('../utils/nodeFormUtils').NodeFormValues, value: string | boolean) => void
}

export interface UIContextValue {
  viewMode: ViewMode
  dataView: DataView
  binOpen: boolean
  hiddenEmploymentTypes: Set<string>
  headPersonId: string | null
  layoutKey: number
  error: string | null
  showPrivate: boolean
  showProducts: boolean
  showICs: boolean
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
  setShowPrivate: (show: boolean) => void
  setShowProducts: (show: boolean) => void
  setShowICs: (show: boolean) => void
}

export interface OrgDataStateValue {
  original: OrgNode[]
  working: OrgNode[]
  recycled: OrgNode[]
  pods: Pod[]
  originalPods: Pod[]
  settings: Settings
  loaded: boolean
  pendingMapping: PendingMapping
  snapshots: SnapshotInfo[]
  currentSnapshotName: string | null
  autosaveAvailable: AutosaveData | null
}

export interface OrgMutationsValue {
  upload: (file: File) => Promise<void>
  createOrg: (name: string) => Promise<string | undefined>
  move: (personId: string, newManagerId: string, newTeam: string, correlationId?: string, newPod?: string) => Promise<void>
  reparent: (personId: string, newManagerId: string, correlationId?: string) => Promise<void>
  reorder: (personIds: string[]) => Promise<void>
  update: (personId: string, fields: OrgNodeUpdatePayload, correlationId?: string) => Promise<void>
  add: (person: Omit<OrgNode, 'id'>) => Promise<string | undefined>
  addParent: (childId: string, name: string) => Promise<string | undefined>
  copy: (rootIds: string[], targetParentId: string) => Promise<Record<string, string> | undefined>
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
  updatePod: (podId: string, fields: PodUpdatePayload) => Promise<void>
  createPod: (managerId: string, name: string, team: string) => Promise<void>
  updateSettings: (settings: Settings) => Promise<void>
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}
