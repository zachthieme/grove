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

/** All valid person statuses */
export const STATUSES = [
  'Active', 'Open', 'Transfer In', 'Transfer Out', 'Backfill', 'Planned',
] as const

/** Human-readable descriptions for each status */
export const STATUS_DESCRIPTIONS: Record<string, string> = {
  'Active': 'Currently filled and working',
  'Open': 'Approved headcount, actively recruiting',
  'Transfer In': 'Person coming from another team/org',
  'Transfer Out': 'Person leaving to another team/org',
  'Backfill': 'Replacing someone who left',
  'Planned': 'Future headcount, not yet approved or active',
}
