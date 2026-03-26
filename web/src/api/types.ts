export interface Person {
  id: string
  name: string
  role: string
  discipline: string
  managerId: string
  team: string
  additionalTeams: string[]
  status: 'Active' | 'Open' | 'Pending Open' | 'Transfer In' | 'Transfer Out' | 'Backfill' | 'Planned'
  employmentType?: string
  newRole?: string
  newTeam?: string
  warning?: string
  sortIndex?: number
  pod?: string
  publicNote?: string
  privateNote?: string
  level?: number
}

export interface Pod {
  id: string
  name: string
  team: string
  managerId: string
  publicNote?: string
  privateNote?: string
}

export interface PodInfo extends Pod {
  memberCount: number
}

export interface OrgData {
  original: Person[]
  working: Person[]
  pods?: Pod[]
  settings?: Settings
  persistenceWarning?: string
}

export interface MutationResponse {
  working: Person[]
  pods: Pod[]
}

export interface MovePayload {
  personId: string
  newManagerId: string
  newTeam: string
  newPod?: string
}

export interface UpdatePayload {
  personId: string
  fields: Record<string, string>
}

export interface DeletePayload {
  personId: string
}

export interface DeleteResponse {
  working: Person[]
  recycled: Person[]
  pods: Pod[]
}

export interface RestoreResponse {
  working: Person[]
  recycled: Person[]
  pods: Pod[]
}

export interface EmptyBinResponse {
  recycled: Person[]
}

export interface AddResponse {
  created: Person
  working: Person[]
  pods: Pod[]
}

export interface MappedColumn {
  column: string
  confidence: 'high' | 'medium' | 'none'
}

export interface UploadResponse {
  status: 'ready' | 'needs_mapping'
  orgData?: OrgData
  headers?: string[]
  mapping?: Record<string, MappedColumn>
  preview?: string[][]
  snapshots?: SnapshotInfo[]
  persistenceWarning?: string
}

export interface SnapshotInfo {
  name: string
  timestamp: string
}

export interface Settings {
  disciplineOrder: string[]
}

export interface AutosaveData {
  original: Person[]
  working: Person[]
  recycled: Person[]
  pods?: Pod[]
  originalPods?: Pod[]
  settings?: Settings
  snapshotName: string
  timestamp: string
}
