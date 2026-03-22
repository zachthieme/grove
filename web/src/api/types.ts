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
}

export interface OrgData {
  original: Person[]
  working: Person[]
}

export interface MovePayload {
  personId: string
  newManagerId: string
  newTeam: string
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
}

export interface RestoreResponse {
  working: Person[]
  recycled: Person[]
}

export interface EmptyBinResponse {
  recycled: Person[]
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
}

export interface SnapshotInfo {
  name: string
  timestamp: string
}

export interface AutosaveData {
  original: Person[]
  working: Person[]
  recycled: Person[]
  snapshotName: string
  timestamp: string
}
