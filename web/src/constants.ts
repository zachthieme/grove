/** Sentinel snapshot name for the original import state */
export const ORIGINAL_SNAPSHOT = '__original__'

/** Drop target prefix for team-based drops */
export const TEAM_DROP_PREFIX = 'team::'

/** Drop target prefix for pod-based drops */
export const POD_DROP_PREFIX = 'pod:'

/** Internal snapshot name used during export */
export const EXPORT_TEMP_SNAPSHOT = '__export_temp__'

/** Sentinel value for mixed batch fields */
export const MIXED_VALUE = '__mixed__'

/** localStorage key for autosave data */
export const AUTOSAVE_STORAGE_KEY = 'grove-autosave'

/** All valid person statuses */
export const STATUSES = [
  'Active', 'Open', 'Transfer In', 'Transfer Out', 'Backfill', 'Planned',
] as const

/** Status type derived from the STATUSES array — single source of truth */
export type Status = (typeof STATUSES)[number]

/** Default status for new people */
export const DEFAULT_STATUS: Status = 'Active'

/** Statuses that represent recruiting/backfill positions */
export const RECRUITING_STATUSES: ReadonlySet<Status> = new Set(['Open', 'Backfill'])

/** Statuses that represent transfer activity */
export const TRANSFER_STATUSES: ReadonlySet<Status> = new Set(['Transfer In', 'Transfer Out'])

/** Statuses that represent planned/future positions */
export const PLANNED_STATUSES: ReadonlySet<Status> = new Set(['Planned'])

/** Check if a status represents a recruiting/backfill position */
export function isRecruitingStatus(status: string): boolean {
  return RECRUITING_STATUSES.has(status as Status)
}

/** Check if a status represents a transfer */
export function isTransferStatus(status: string): boolean {
  return TRANSFER_STATUSES.has(status as Status)
}

/** Check if a status represents a planned/future position */
export function isPlannedStatus(status: string): boolean {
  return PLANNED_STATUSES.has(status as Status)
}

/** Human-readable descriptions for each status */
export const STATUS_DESCRIPTIONS: Record<Status, string> = {
  'Active': 'Currently filled and working',
  'Open': 'Approved headcount, actively recruiting',
  'Transfer In': 'Person coming from another team/org',
  'Transfer Out': 'Person leaving to another team/org',
  'Backfill': 'Replacing someone who left',
  'Planned': 'Future headcount, not yet approved or active',
}
