import type { Status } from '../constants'

export interface OrgNode {
  id: string
  type?: string
  name: string
  role: string
  discipline: string
  managerId: string
  team: string
  additionalTeams: string[]
  status: Status
  employmentType?: string
  newRole?: string
  newTeam?: string
  warning?: string
  sortIndex?: number
  pod?: string
  publicNote?: string
  privateNote?: string
  level?: number
  private?: boolean
  extra?: Record<string, string>
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
  original: OrgNode[]
  working: OrgNode[]
  pods?: Pod[]
  settings?: Settings
  persistenceWarning?: string
}

export interface MutationResponse {
  working: OrgNode[]
  pods: Pod[]
}

export interface MovePayload {
  personId: string
  newManagerId: string
  newTeam: string
  newPod?: string
}

export interface OrgNodeUpdatePayload {
  name?: string
  role?: string
  discipline?: string
  team?: string
  managerId?: string
  status?: string
  employmentType?: string
  additionalTeams?: string
  newRole?: string
  newTeam?: string
  level?: number
  pod?: string
  publicNote?: string
  privateNote?: string
  private?: boolean
}

export interface PodUpdatePayload {
  name?: string
  publicNote?: string
  privateNote?: string
}

export interface UpdatePayload {
  personId: string
  fields: OrgNodeUpdatePayload
}

export interface DeletePayload {
  personId: string
}

export interface AddParentPayload {
  childId: string
  name: string
}

export interface DeleteResponse {
  working: OrgNode[]
  recycled: OrgNode[]
  pods: Pod[]
}

export interface RestoreResponse {
  working: OrgNode[]
  recycled: OrgNode[]
  pods: Pod[]
}

export interface EmptyBinResponse {
  recycled: OrgNode[]
}

export interface AddResponse {
  created: OrgNode
  working: OrgNode[]
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
  original: OrgNode[]
  working: OrgNode[]
  recycled: OrgNode[]
  pods?: Pod[]
  originalPods?: Pod[]
  settings?: Settings
  snapshotName: string
  timestamp: string
}

// Keep Person as a backward-compat alias during transition
export type Person = OrgNode
