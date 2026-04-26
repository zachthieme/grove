import type { NodeType, Status } from '../constants'

// OrgNodeFields mirrors model.OrgNodeFields. Hand-defined here because
// the model package is server-side-only; the apitypes embed brings
// these fields into the wire format. Generated apitypes interfaces
// (OrgNode) extend this. NodeType and Status are the strict TS-only
// enums — broader than Go's string types but locked at compile time.
export interface OrgNodeFields {
  type?: NodeType
  name: string
  role: string
  discipline: string
  team: string
  additionalTeams: string[]
  status: Status
  employmentType?: string
  warning?: string
  newRole?: string
  newTeam?: string
  pod?: string
  publicNote?: string
  privateNote?: string
  level?: number
  private?: boolean
  extra?: Record<string, string>
}

// Generated from internal/apitypes via tygo (see tygo.yaml).
export type {
  OrgNode,
  Pod,
  PodInfo,
  Settings,
  MappedColumn,
  PodUpdate as PodUpdatePayload,
} from './types.generated'

// --- Hand-managed payload/response types ---
//
// These mirror Go types that live OUTSIDE internal/apitypes:
//   - inline `type req struct{...}` in HTTP handlers
//   - response types in internal/httpapi/responses.go
//   - autosave.AutosaveData, snapshot.Info
// Centralized here for the frontend to consume.

import type { OrgNode } from './types.generated'

export interface OrgData {
  original: OrgNode[]
  working: OrgNode[]
  pods?: import('./types.generated').Pod[]
  settings?: import('./types.generated').Settings
  persistenceWarning?: string
}

export interface MutationResponse {
  working: OrgNode[]
  pods: import('./types.generated').Pod[]
}

export interface MovePayload {
  personId: string
  newManagerId: string
  newTeam: string
  newPod?: string
}

// OrgNodeUpdatePayload uses the strict NodeType enum (Go side is
// `*string` — wider). Hand-managed for type safety on the frontend.
export interface OrgNodeUpdatePayload {
  type?: NodeType
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
  pods: import('./types.generated').Pod[]
}

export interface RestoreResponse {
  working: OrgNode[]
  recycled: OrgNode[]
  pods: import('./types.generated').Pod[]
}

export interface EmptyBinResponse {
  recycled: OrgNode[]
}

export interface AddResponse {
  created: OrgNode
  working: OrgNode[]
  pods: import('./types.generated').Pod[]
}

export interface UploadResponse {
  status: 'ready' | 'needs_mapping'
  orgData?: OrgData
  headers?: string[]
  mapping?: Record<string, import('./types.generated').MappedColumn>
  preview?: string[][]
  snapshots?: SnapshotInfo[]
  persistenceWarning?: string
}

export interface SnapshotInfo {
  name: string
  timestamp: string
}

export interface AutosaveData {
  original: OrgNode[]
  working: OrgNode[]
  recycled: OrgNode[]
  pods?: import('./types.generated').Pod[]
  originalPods?: import('./types.generated').Pod[]
  settings?: import('./types.generated').Settings
  snapshotName: string
  timestamp: string
}

// Keep Person as a backward-compat alias during transition.
export type Person = OrgNode
